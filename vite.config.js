import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync, createReadStream, readdirSync, mkdirSync } from 'node:fs';
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

          server.middlewares.use(createApiMiddleware('/api/dev/style-frame-preview', async (req, res) => {
            const url = new URL(req.url, 'http://localhost');
            const forgeRoot = env.SD_FORGE_ROOT || 'D:\\SD_Deforum_Fresh';
            const requestedDate = String(url.searchParams.get('date') || new Date().toISOString().slice(0, 10));
            const requestedFolder = String(url.searchParams.get('folder') || '').split(/[\\/]/).pop();
            if (requestedFolder && !/^[\w.-]+$/i.test(requestedFolder)) {
              res.status(400).json({ error: 'Invalid style frame folder name.' });
              return;
            }
            const framesDir = requestedFolder
              ? join(forgeRoot, 'outputs', 'img2img-images', requestedDate, requestedFolder)
              : join(forgeRoot, 'outputs', 'img2img-images', requestedDate);
            if (!existsSync(framesDir)) {
              res.status(404).json({ error: `Style frame folder not found: ${framesDir}` });
              return;
            }

            const safeFile = String(url.searchParams.get('file') || '').split(/[\\/]/).pop();
            if (safeFile) {
              if (!/^(?:\d{5}-[\w.-]+|voiceover_fresh_\d{4})\.png$/i.test(safeFile)) {
                res.status(400).json({ error: 'Invalid style frame file name.' });
                return;
              }
              const framePath = join(framesDir, safeFile);
              if (!existsSync(framePath)) {
                res.status(404).json({ error: `Style frame not found: ${safeFile}` });
                return;
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'image/png');
              res.setHeader('Cache-Control', 'no-store');
              createReadStream(framePath).pipe(res);
              return;
            }

            const frames = readdirSync(framesDir)
              .filter((file) => /^(?:\d{5}-[\w.-]+|voiceover_fresh_\d{4})\.png$/i.test(file))
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            res.status(200).json({ ok: true, date: requestedDate, folder: requestedFolder, frames });
          }));

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

          // Dev-only: stitch today's saved SD Forge frames into an mp4 using ffmpeg
          server.middlewares.use(createApiMiddleware('/api/dev/stitch-movie', async (req, res) => {
            if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
            const body = await readJsonBody(req);
            const fps = Number(body.fps) > 0 ? Number(body.fps) : 15;
            const startedAt = Number(body.startedAt) || 0;

            const forgeRoot = env.SD_FORGE_ROOT || 'D:\\SD_Deforum_Fresh';
            const today = new Date().toISOString().slice(0, 10);
            const framesDir = join(forgeRoot, 'outputs', 'img2img-images', today);

            if (!existsSync(framesDir)) {
              res.status(404).json({ error: `No frames folder found for today at ${framesDir}` });
              return;
            }

            const frames = readdirSync(framesDir)
              .filter((f) => {
                if (!/\.png$/i.test(f)) return false;
                return !startedAt || statSync(join(framesDir, f)).mtimeMs >= startedAt - 2000;
              })
              .sort();

            if (frames.length === 0) {
              res.status(404).json({ error: `No frames found in ${framesDir}` });
              return;
            }

            const outDir = resolve(process.cwd(), 'outputs');
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const listPath = join(outDir, `_stitch_list_${stamp}.txt`);
            const outFile = join(outDir, `deforum_live_${stamp}.mp4`);
            const frameDuration = 1 / fps;

            const lines = [];
            for (const f of frames) {
              const p = join(framesDir, f).replace(/\\/g, '/').replace(/'/g, "'\\''");
              lines.push(`file '${p}'`);
              lines.push(`duration ${frameDuration}`);
            }
            const lastP = join(framesDir, frames[frames.length - 1]).replace(/\\/g, '/').replace(/'/g, "'\\''");
            lines.push(`file '${lastP}'`);
            writeFileSync(listPath, lines.join('\n'), 'utf8');

            const args = [
              '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
              '-vsync', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
              '-vf', 'scale=512:512', outFile
            ];

            await new Promise((res2, rej2) => {
              execFile('ffmpeg', args, (err, stdout, stderr) => {
                try { unlinkSync(listPath); } catch { /* ignore cleanup errors */ }
                if (err) rej2(new Error(stderr || stdout || err.message));
                else res2();
              });
            }).then(
              () => {
                res.status(200).json({
                  ok: true,
                  frameCount: frames.length,
                  file: `outputs/${outFile.split(/[\\/]/).pop()}`,
                  framesDir
                });
              },
              (e) => {
                res.status(500).json({ error: e.message });
              }
            );
          }, { parseBody: true }));

          // Dev-only: send a storyboard to Deforum's native animation API.
          server.middlewares.use(createApiMiddleware('/api/dev/render-deforum', async (req, res) => {
            if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
            const body = await readJsonBody(req);
            const storyboard = body.storyboard;
            const segments = Array.isArray(storyboard?.segments) ? storyboard.segments : [];
            const sourceName = String(body.source || '').split('?')[0].split('/').pop() || '';
            if (segments.length === 0) {
              res.status(400).json({ error: 'A storyboard with at least one segment is required.' });
              return;
            }

            const forgeRoot = env.SD_FORGE_ROOT || 'D:\\SD_Deforum_Fresh';
            const templatePath = join(forgeRoot, 'deforum_settings.txt');
            const videoDir = resolve(process.cwd(), 'Video');
            const normalizeMovieName = (name) => String(name).toLowerCase().replace(/[\s_]+/g, '_');
            const sourceFile = readdirSync(videoDir).find((file) => normalizeMovieName(file) === normalizeMovieName(sourceName));
            const sourcePath = sourceFile ? join(videoDir, sourceFile) : '';
            if (!existsSync(templatePath)) {
              res.status(404).json({ error: `Deforum template not found: ${templatePath}` });
              return;
            }
            if (!sourceName || !/\.mp4$/i.test(sourceName) || !sourcePath || !existsSync(sourcePath)) {
              res.status(404).json({ error: `The current app video is not available locally: ${sourceName || 'no source selected'}` });
              return;
            }

            const render = storyboard.render || {};
            const renderDeforum = render.deforum || {};
            const fps = 15;
            const maxFrames = Math.max(1, Number(render.totalFrames) || segments[segments.length - 1].endFrame || 120);
            const isShortPreview = maxFrames <= 60;
            const requestedHeight = Math.max(0, Number(renderDeforum.height) || 0);
            const renderSteps = Math.max(6, Math.min(40, Number(renderDeforum.steps) || (isShortPreview ? 10 : 24)));
            const renderStrength = Math.max(0.1, Math.min(0.9, Number(renderDeforum.strength) || (isShortPreview ? 0.78 : 0.45)));
            const renderCadence = Math.max(1, Math.min(8, Number(renderDeforum.diffusionCadence) || (isShortPreview ? 1 : 4)));
            const renderClipSkip = Math.max(1, Math.min(4, Number(renderDeforum.clipSkip) || 2));

            // Probe the real source dimensions, then auto-detect whether the
            // actual visible content is a portrait clip pillarboxed inside a
            // landscape frame (phone-recorded footage with black side bars
            // and/or caption text). Filename-based guessing previously missed
            // this for movies other than 3/5, which stretched/warped them.
            const sourceDims = await new Promise((resolve, reject) => {
              execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', sourcePath], (error, stdout, stderr) => {
                if (error) { reject(new Error(stderr || error.message)); return; }
                const [w, h] = String(stdout).trim().split('x').map(Number);
                resolve({ width: w || 1920, height: h || 1080 });
              });
            });

            const detectedCrop = await new Promise((resolveCrop) => {
              execFile('ffmpeg', ['-ss', '15', '-t', '5', '-i', sourcePath, '-vf', 'cropdetect=24:16:0', '-f', 'null', '-'], (error, stdout, stderr) => {
                const matches = [...String(stderr).matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
                if (!matches.length) { resolveCrop(null); return; }
                const [, cropW, cropH, cropX, cropY] = matches[matches.length - 1].map(Number);
                resolveCrop(cropH > cropW ? { width: cropW, height: cropH, x: cropX, y: cropY } : null);
              });
            });
            const isPillarboxedPortrait = Boolean(detectedCrop);

            let width;
            let height;
            if (isPillarboxedPortrait) {
              // SDXL + a video-backed ControlNet reference cannot fit reliably
              // at 800px on the 8 GB render GPU. 640px keeps the native merge
              // while avoiding the multi-GB CPU swap that freezes Forge.
              height = requestedHeight || (isShortPreview ? 512 : 640);
              width = Math.max(64, Math.round((height * (detectedCrop.width / detectedCrop.height)) / 64) * 64);
            } else {
              const aspect = sourceDims.width / sourceDims.height;
              width = requestedHeight || (isShortPreview ? 384 : 512);
              height = Math.max(64, Math.round((width / aspect) / 64) * 64);
            }

            const prepDir = resolve(process.cwd(), 'outputs', 'deforum-inputs');
            if (!existsSync(prepDir)) mkdirSync(prepDir, { recursive: true });
            const preparedName = `${sourceFile.replace(/\.mp4$/i, '')}_${width}x${height}.mp4`;
            const preparedPath = join(prepDir, preparedName);
            if (!existsSync(preparedPath) || statSync(preparedPath).mtimeMs < statSync(sourcePath).mtimeMs) {
              const scaleFilter = isPillarboxedPortrait
                ? `crop=${detectedCrop.width}:${detectedCrop.height}:${detectedCrop.x}:${detectedCrop.y},scale=${width}:${height}:flags=lanczos`
                : `scale=${width}:${height}:flags=lanczos`;
              await new Promise((resolve, reject) => {
                execFile('ffmpeg', [
                  '-y', '-i', sourcePath,
                  '-vf', scaleFilter,
                  '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', preparedPath
                ], (error, stdout, stderr) => error ? reject(new Error(stderr || stdout || error.message)) : resolve());
              });
            }
            let videoInitPath = preparedPath;

            // Keep this path simple and reliable: Deforum receives the actual
            // movie as Video Input, and the voice-over/story content becomes
            // prompt keyframes. Avoid a separate txt2img/ControlNet prepass;
            // that extra server work has been the source of repeated 500s and
            // GPU stalls before the movie render even starts.

            const extractNthFrame = 2;
            // Video Input replaces max_frames with its extracted-frame count.
            // Cap source-frame extraction so the storyboard's intended render
            // length controls Deforum's native generation and movie creation.
            const extractToFrame = Math.max(0, (maxFrames * extractNthFrame) - 1);
            const prompts = {};
            const promptPrefix = 'preserve the exact source frame, same woman, same face, same hands, same clothing, same mural background, same camera framing, coherent anatomy, natural skin, clean continuous surfaces, subtle noir color grade';
            const cleanPrompt = (prompt) => String(prompt || 'cinematic abstract figure')
              .replace(/\bgrain\b/gi, 'soft film texture')
              .replace(/\bgritty\b/gi, 'soft textured')
              .replace(/highly abstracted forms/gi, 'subtle abstract lighting')
              .replace(/heavy atmospheric blur/gi, 'soft atmospheric depth')
              .replace(/intense cool blue light/gi, 'cool blue rim light');
            const promptFor = (prompt) => `${promptPrefix}, ${cleanPrompt(prompt)}`;
            const blendPrompt = (fromPrompt, toPrompt, fromWeight, toWeight) => `${promptPrefix}, (${cleanPrompt(fromPrompt)}:${fromWeight}), (${cleanPrompt(toPrompt)}:${toWeight})`;
            // Deforum maps strength to A1111 as denoise = 1 - strength. Keep
            // this FLAT across the whole render (no per-keyframe up/down
            // blips) so consecutive segments blend into one continuous piece
            // instead of feeling like separated, jump-cut clips. Narrative
            // change comes from the prompt text per keyframe only.
            const strength = [`0: (${renderStrength})`];
            const subseedStrength = ['0: (0.05)'];

            const sortedSegments = [...segments].sort((a, b) => (Number(a.keyframe) || 0) - (Number(b.keyframe) || 0));
            const transitionFrames = Math.max(3, Math.min(8, Math.round(maxFrames / 10)));
            const clampPromptFrame = (frame) => Math.max(0, Math.min(maxFrames - 1, Math.round(frame)));
            for (let index = 0; index < sortedSegments.length; index++) {
              const segment = sortedSegments[index];
              const frame = clampPromptFrame(Number(segment.keyframe) || 0);
              if (index === 0 || frame === 0) {
                prompts[String(frame)] = promptFor(segment.prompt);
                continue;
              }
              const previous = sortedSegments[index - 1];
              prompts[String(clampPromptFrame(frame - transitionFrames))] = blendPrompt(previous.prompt, segment.prompt, 0.7, 0.3);
              prompts[String(frame)] = blendPrompt(previous.prompt, segment.prompt, 0.5, 0.5);
              prompts[String(clampPromptFrame(frame + transitionFrames))] = blendPrompt(previous.prompt, segment.prompt, 0.25, 0.75);
            }


            const settings = {
              ...JSON.parse(readFileSync(templatePath, 'utf8')),
              W: width,
              H: height,
              batch_name: `VideoArt_Deforum_${Date.now()}`,
              seed: Number(segments[0].seed) || -1,
              seed_behavior: 'iter',
              seed_iter_N: 1,
              sampler: 'DPM++ 2M',
              steps: renderSteps,
              cfg_scale_schedule: isShortPreview ? '0: (4)' : '0: (5)',
              // Real Deforum Video Input: extract the actual VideoArt movie
              // and use each source frame as init, so faces, bodies, camera
              // framing and narrative action remain tied to the app content.
              animation_mode: 'Video Input',
              max_frames: maxFrames,
              border: 'replicate',
              prompts,
              animation_prompts_positive: '',
              animation_prompts_negative: [
                String(segments[0].negativePrompt || ''),
                'grid, checkerboard, moire pattern, scanlines, pixel sorting, glitch blocks, compression blocks, bubbling, boiling noise, speckle, heavy grain, corrupted geometry, melted face, broken face, duplicated limbs, extra hands, warped teeth, text, watermark, tiling, collage, abstract shards, fragmented body, patchwork skin'
              ].filter(Boolean).join(', '),
              zoom: '0: (1.0)',
              translation_x: '0: (0)',
              translation_y: '0: (0)',
              strength_schedule: strength.join(', '),
              noise_schedule: isShortPreview ? '0: (0.004)' : '0: (0.02)',
              enable_subseed_scheduling: true,
              subseed_strength_schedule: subseedStrength.join(', '),
              color_coherence: 'LAB',
              color_coherence_video_every_N_frames: 1,
              // Diffuse every 4th frame in full and let Deforum's optical-flow
              // cadence (RAFT) warp/interpolate the frames between them using
              // the real source motion. This is what actually fuses segments
              // into one continuous movie instead of independently-diffused,
              // jump-cut-feeling frames.
              diffusion_cadence: renderCadence,
              optical_flow_cadence: 'RAFT',
              use_depth_warping: false,
              padding_mode: 'border',
              sampling_mode: 'bicubic',
              noise_type: 'uniform',
              use_init: false,
              init_image: null,
              video_init_path: videoInitPath,
              extract_nth_frame: extractNthFrame,
              extract_from_frame: 0,
              extract_to_frame: extractToFrame,
              overwrite_extracted_frames: true,
              use_mask: false,
              use_mask_video: false,
              fps,
              skip_video_creation: false,
              add_soundtrack: 'None',
              frame_interpolation_engine: 'None',
              r_upscale_video: false
            };

            try {
              const forgeResponse = await fetch('http://127.0.0.1:7860/deforum_api/batches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deforum_settings: settings, options_overrides: { CLIP_stop_at_last_layers: renderClipSkip } })
              });
              const data = await forgeResponse.json();
              if (!forgeResponse.ok) {
                res.status(forgeResponse.status).json({
                  error: data?.message || 'Deforum rejected the render request.',
                  detail: data
                });
                return;
              }
              res.status(202).json({ ok: true, ...data, settings });
            } catch (error) {
              res.status(503).json({ error: 'Deforum native API is unavailable. Restart Forge after adding --deforum-api to webui-user.bat.', detail: error.message });
            }
          }, { parseBody: true }));

          // Dev-only: fetch the latest native Deforum output image for the live preview panel.
          server.middlewares.use(createApiMiddleware('/api/dev/deforum-preview', async (req, res) => {
            const jobId = String(new URL(req.url, 'http://localhost').searchParams.get('jobId') || '');
            if (!jobId) { res.status(400).json({ error: 'jobId is required' }); return; }
            try {
              const forgeResponse = await fetch(`http://127.0.0.1:7860/deforum_api/jobs/${encodeURIComponent(jobId)}`);
              if (!forgeResponse.ok) { res.status(forgeResponse.status).json({ error: 'Deforum job not available.' }); return; }
              const job = await forgeResponse.json();
              const outdir = String(job?.outdir || '');
              if (!outdir || !existsSync(outdir)) {
                res.status(200).json({ status: job?.status || 'ACCEPTED', phase: job?.phase || 'QUEUED', frame: null });
                return;
              }
              const frames = readdirSync(outdir)
                .filter((file) => /^\d{14}_\d+\.png$/i.test(file))
                .map((file) => ({ file, modified: statSync(join(outdir, file)).mtimeMs }))
                .sort((a, b) => b.modified - a.modified);
              const latest = frames[0];
              const movies = readdirSync(outdir)
                .filter((file) => /\.mp4$/i.test(file))
                .map((file) => ({ file, modified: statSync(join(outdir, file)).mtimeMs }))
                .sort((a, b) => b.modified - a.modified);
              const movie = movies[0];
              res.status(200).json({
                status: job?.status || 'ACCEPTED',
                phase: job?.phase || 'QUEUED',
                frame: latest ? `data:image/png;base64,${readFileSync(join(outdir, latest.file)).toString('base64')}` : null,
                frameName: latest?.file || null,
                movie: movie ? `/api/dev/deforum-result?jobId=${encodeURIComponent(jobId)}` : null
              });
            } catch (error) {
              res.status(503).json({ error: error.message });
            }
          }));

          // Dev-only: stream the MP4 made by Deforum's own post-processing
          // step. This is intentionally not a browser-recorded frame stitch.
          server.middlewares.use(createApiMiddleware('/api/dev/deforum-result', async (req, res) => {
            const jobId = String(new URL(req.url, 'http://localhost').searchParams.get('jobId') || '');
            if (!jobId) { res.status(400).json({ error: 'jobId is required' }); return; }
            try {
              const forgeResponse = await fetch(`http://127.0.0.1:7860/deforum_api/jobs/${encodeURIComponent(jobId)}`);
              if (!forgeResponse.ok) { res.status(forgeResponse.status).json({ error: 'Deforum job not available.' }); return; }
              const job = await forgeResponse.json();
              const outdir = String(job?.outdir || '');
              if (!outdir || !existsSync(outdir)) { res.status(404).json({ error: 'Deforum output directory is not available yet.' }); return; }
              const movie = readdirSync(outdir)
                .filter((file) => /\.mp4$/i.test(file))
                .map((file) => ({ path: join(outdir, file), modified: statSync(join(outdir, file)).mtimeMs }))
                .sort((a, b) => b.modified - a.modified)[0];
              if (!movie) { res.status(404).json({ error: 'Deforum has not finished its MP4 yet.' }); return; }
              const size = statSync(movie.path).size;
              res.statusCode = 200;
              res.setHeader('Content-Type', 'video/mp4');
              res.setHeader('Content-Length', size);
              res.setHeader('Accept-Ranges', 'bytes');
              createReadStream(movie.path).pipe(res);
            } catch (error) {
              res.status(503).json({ error: error.message });
            }
          }));

          // Dev-only: stream locally stitched voice/real-frame merge tests.
          server.middlewares.use(createApiMiddleware('/api/dev/merged-preview-result', async (req, res) => {
            const file = String(new URL(req.url, 'http://localhost').searchParams.get('file') || '');
            const safeName = file.split(/[\\/]/).pop();
            if (!safeName || !/^[\w.-]+\.mp4$/i.test(safeName)) {
              res.status(400).json({ error: 'A merged preview mp4 file name is required.' });
              return;
            }
            const moviePath = join(resolve(process.cwd(), 'outputs', 'deforum-merged-previews'), safeName);
            if (!existsSync(moviePath)) {
              res.status(404).json({ error: `Merged preview not found: ${safeName}` });
              return;
            }
            const size = statSync(moviePath).size;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Length', size);
            res.setHeader('Accept-Ranges', 'bytes');
            createReadStream(moviePath).pipe(res);
          }));

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
