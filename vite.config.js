import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream, readdirSync } from 'node:fs';
import { resolve, join, normalize } from 'node:path';
import { execFile } from 'node:child_process';
import { defineConfig, loadEnv } from 'vite';

const require = createRequire(import.meta.url);

function decorateNodeResponse(res) {
  if (!res.status) {
    res.status = function status(code) {
      res.statusCode = code;
      return res;
    };
  }

  if (!res.json) {
    res.json = function json(payload) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(payload));
      return res;
    };
  }

  return res;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function createApiMiddleware(route, handler, { parseBody = false } = {}) {
  return async (req, res, next) => {
    const reqPath = String(req.url || '').split('?')[0];
    const routeSuffix = route.replace(/^\/api/, '') || '/';
    const matchesRoute = reqPath === route || reqPath === routeSuffix || reqPath.startsWith(`${route}/`) || reqPath.startsWith(`${routeSuffix}/`);
    if (!matchesRoute) return next();

    try {
      decorateNodeResponse(res);
      if (parseBody && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        req.body = await readJsonBody(req);
      }
      await handler(req, res);
    } catch (error) {
      decorateNodeResponse(res);
      res.status(500).json({ error: error?.message || `Local API route failed: ${route}` });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const hasLocalGeminiProxy = Boolean(String(env.GEMINI_API_KEY || '').trim());
  const hasLocalKv = Boolean(String(env.KV_REST_API_URL || '').trim() && String(env.KV_REST_API_TOKEN || '').trim());

  return {
    define: {
      __LOCAL_GEMINI_PROXY__: JSON.stringify(hasLocalGeminiProxy)
    },
    server: {
      middlewareMode: false,
      proxy: {
        '/movies': {
          target: 'https://pub-3a3ec970180e4d9db03559eb82c9b828.r2.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/movies/, '')
        }
      }
    },
    plugins: [
      {
        name: 'local-video-folder',
        configureServer(server) {
          const videoDir = resolve(process.cwd(), 'Video');
          server.middlewares.use((req, res, next) => {
            const reqPath = decodeURIComponent(String(req.url || '').split('?')[0]);
            if (!reqPath.startsWith('/movies/')) return next();
            const requested = reqPath.slice('/movies/'.length);
            if (!requested || requested.includes('..')) return next();
            if (!existsSync(videoDir)) return next();

            // Match local file, tolerating space/underscore differences
            const normalizeName = (n) => n.toLowerCase().replace(/[\s_]+/g, '_');
            let filePath = join(videoDir, requested);
            if (!existsSync(filePath)) {
              const target = normalizeName(requested);
              const match = readdirSync(videoDir).find((f) => normalizeName(f) === target);
              if (!match) return next(); // fall through to R2 proxy
              filePath = join(videoDir, match);
            }
            filePath = normalize(filePath);
            if (!filePath.startsWith(normalize(videoDir))) return next();

            const stat = statSync(filePath);
            const range = req.headers.range;
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', 'video/mp4');
            if (range) {
              const m = /bytes=(\d*)-(\d*)/.exec(range);
              let start = m && m[1] ? parseInt(m[1], 10) : 0;
              let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
              if (Number.isNaN(start) || start >= stat.size) start = 0;
              if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
              res.statusCode = 206;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
              res.setHeader('Content-Length', end - start + 1);
              createReadStream(filePath, { start, end }).pipe(res);
            } else {
              res.setHeader('Content-Length', stat.size);
              createReadStream(filePath).pipe(res);
            }
          });
        }
      },
      {
        name: 'local-api-routes',
        configureServer(server) {
          Object.assign(process.env, env);

          if (hasLocalGeminiProxy) {
            const geminiHandler = require('./api/gemini.js');
            server.middlewares.use(createApiMiddleware('/api/gemini', geminiHandler, { parseBody: true }));
            const geminiTtsHandler = require('./api/gemini-tts.js');
            server.middlewares.use(createApiMiddleware('/api/gemini-tts', geminiTtsHandler, { parseBody: true }));
          }

          if (hasLocalKv) {
            const usageHandler = require('./api/usage.js');
            server.middlewares.use(createApiMiddleware('/api/usage', usageHandler));
          }

          const sessionSourceHandler = require('./api/session-source.js');
          server.middlewares.use(createApiMiddleware('/api/session-source', sessionSourceHandler));

          // Dev-only: persist notebookContext directly into movieBrains.js
          server.middlewares.use(createApiMiddleware('/api/dev/persist-notebook-context', async (req, res) => {
            if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
            const { movie, notebookContext } = await readJsonBody(req);
            if (!movie || typeof notebookContext !== 'string') {
              res.status(400).json({ error: 'movie and notebookContext are required' });
              return;
            }
            const brainPath = resolve(process.cwd(), 'src/movieBrains.js');
            let src = readFileSync(brainPath, 'utf8');

            // Escape the notebookContext for safe insertion into a JS template literal
            const escaped = notebookContext
              .replace(/\\/g, '\\\\')
              .replace(/`/g, '\\`')
              .replace(/\$\{/g, '\\${');

            const movieKey = movie.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Find the actual key as it appears in the file (case-insensitive lookup)
            const ciKeyRe = new RegExp(`'(${movieKey})'`, 'i');
            const ciKeyMatch = src.match(ciKeyRe);
            if (!ciKeyMatch) { res.status(404).json({ error: `Movie '${movie}' not found in movieBrains.js` }); return; }
            const actualKey = ciKeyMatch[1]; // e.g. 'Synthetic_Desires_1.mp4'
            const actualKeyEscaped = actualKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Replace existing notebookContext field for this movie's trainingSeeds
            const existingRe = new RegExp(
              `('${actualKeyEscaped}'[\\s\\S]*?trainingSeeds:\\s*\\{[\\s\\S]*?)notebookContext:\\s*\`[^]*?\``,
              ''
            );
            if (existingRe.test(src)) {
              src = src.replace(existingRe, `$1notebookContext: \`${escaped}\``);
            } else {
              // Inject before closing } of trainingSeeds for this movie
              // Find the movie entry's trainingSeeds closing brace
              const movieIdx = src.indexOf(`'${actualKey}'`);
              if (movieIdx === -1) { res.status(404).json({ error: `Movie '${movie}' not found in movieBrains.js` }); return; }
              // Find "trainingSeeds: {" after the movie key
              const tsIdx = src.indexOf('trainingSeeds: {', movieIdx);
              if (tsIdx === -1) { res.status(404).json({ error: 'trainingSeeds block not found' }); return; }
              // Walk forward to find the matching closing brace of trainingSeeds
              let depth = 0, i = tsIdx + 'trainingSeeds: {'.length - 1;
              for (; i < src.length; i++) {
                if (src[i] === '{') depth++;
                else if (src[i] === '}') { depth--; if (depth === 0) break; }
              }
              // Insert notebookContext: `...` before the closing }
              src = src.slice(0, i) + `,\n      notebookContext: \`${escaped}\`\n    ` + src.slice(i);
            }

            writeFileSync(brainPath, src, 'utf8');
            res.status(200).json({ ok: true });
          }, { parseBody: true }));

          // Dev-only: git add movieBrains.js + commit + push
          server.middlewares.use(createApiMiddleware('/api/dev/git-push-brains', async (req, res) => {
            if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
            const { movie } = await readJsonBody(req);
            const cwd = process.cwd();
            const steps = [
              ['git', ['add', 'src/movieBrains.js']],
              ['git', ['commit', '-m', `brain: update notebookContext for ${movie || 'brain'} [dashboard]`]],
              ['git', ['push']]
            ];
            const run = (cmd, args) => new Promise((resolve, reject) => {
              execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
                if (err) reject(new Error(stderr || stdout || err.message));
                else resolve(stdout.trim());
              });
            });
            const log = [];
            try {
              for (const [cmd, args] of steps) {
                const out = await run(cmd, args);
                log.push(out);
              }
              res.status(200).json({ ok: true, log });
            } catch (e) {
              // "nothing to commit" is not fatal
              if (/nothing to commit/i.test(e.message)) {
                res.status(200).json({ ok: true, log: ['Nothing new to commit — already up to date.'] });
              } else {
                res.status(500).json({ error: e.message, log });
              }
            }
          }, { parseBody: true }));

        }
      }
    ],
    build: {
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@mediapipe')) return 'vendor-mediapipe';
            if (id.includes('three')) return 'vendor-three';
            return 'vendor';
          }
        }
      }
    }
  };
});
