import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_MOVIE_CDN_BASE = (process.env.VITE_MOVIE_CDN_BASE || 'https://pub-3a3ec970180e4d9db03559eb82c9b828.r2.dev').replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.0-flash-lite';

function parseArgs(argv = []) {
    const options = {
        chunkSeconds: 18,
        overlapSeconds: 4,
        frameCount: 2,
        model: DEFAULT_MODEL,
        outputDir: path.resolve(process.cwd(), 'public', 'movie-analysis')
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];
        if (arg === '--movie' && next) {
            options.movieName = next;
            index += 1;
        } else if (arg === '--source' && next) {
            options.source = next;
            index += 1;
        } else if (arg === '--out' && next) {
            options.outputPath = path.resolve(process.cwd(), next);
            index += 1;
        } else if (arg === '--chunk-seconds' && next) {
            options.chunkSeconds = Math.max(8, Number(next));
            index += 1;
        } else if (arg === '--overlap-seconds' && next) {
            options.overlapSeconds = Math.max(0, Number(next));
            index += 1;
        } else if (arg === '--frame-count' && next) {
            options.frameCount = Math.min(3, Math.max(1, Number(next)));
            index += 1;
        } else if (arg === '--max-chunks' && next) {
            options.maxChunks = Math.max(1, Number(next));
            index += 1;
        } else if (arg === '--model' && next) {
            options.model = String(next || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
            index += 1;
        }
    }

    return options;
}

function normalizeMovieSlug(movieName = '') {
    return String(movieName || '')
        .trim()
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/\.[^.]+$/, '')
        .replace(/\s+/g, '_');
}

function resolveSource(options) {
    if (options.source) return options.source;
    if (options.movieName) return `${DEFAULT_MOVIE_CDN_BASE}/${options.movieName}`;
    throw new Error('Pass --movie <name.mp4> or --source <file-or-url>.');
}

function resolveMovieName(options, source) {
    if (options.movieName) return options.movieName;
    const clean = String(source || '').split('?')[0];
    return path.basename(clean) || 'movie.mp4';
}

async function runBinary(command, args) {
    try {
        return await execFileAsync(command, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    } catch (error) {
        const stderr = String(error?.stderr || error?.message || '').trim();
        throw new Error(`${command} failed: ${stderr || 'unknown error'}`);
    }
}

async function probeDuration(source) {
    const { stdout } = await runBinary('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        source
    ]);
    const seconds = Number(String(stdout || '').trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('Unable to determine video duration with ffprobe.');
    }
    return seconds;
}

async function extractFrame(source, timeSeconds, outputFile) {
    await runBinary('ffmpeg', [
        '-y',
        '-ss', String(Math.max(0, timeSeconds)),
        '-i', source,
        '-frames:v', '1',
        '-vf', 'scale=min(960,iw):-1',
        outputFile
    ]);
}

function buildFrameTimes(start, end, frameCount) {
    const duration = Math.max(1, end - start);
    if (frameCount <= 1) return [start + duration * 0.5];
    if (frameCount === 2) return [start + duration * 0.25, start + duration * 0.75];
    return [start + duration * 0.2, start + duration * 0.5, start + duration * 0.8];
}

function stripJsonFences(value = '') {
    const text = String(value || '').trim();
    if (!text.startsWith('```')) return text;
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function analyzeChunk({ apiKey, model, movieName, start, end, frameFiles, chunkIndex, totalChunks }) {
    const frameParts = await Promise.all(
        frameFiles.map(async (filePath) => ({
            inlineData: {
                mimeType: 'image/jpeg',
                data: await fs.readFile(filePath, 'base64')
            }
        }))
    );

    const prompt = [
        `You are creating compact retrieval cards for the short film "${movieName}".`,
        `This chunk runs from ${Math.floor(start)}s to ${Math.floor(end)}s.`,
        'Return one strict JSON object only with these keys:',
        '{"summary":"...","motifs":["..."],"mood":["..."],"references":["..."],"personaHints":["..."],"questionSeeds":["..."]}',
        'Rules:',
        '- summary: 1 sentence, concrete and cinematic, max 160 chars',
        '- motifs: 2-5 short visual or thematic anchors',
        '- mood: 2-4 concise emotional descriptors',
        '- references: 0-3 suggestive artistic lineages only if visually justified',
        '- personaHints: 1-3 cues about the inner world or voice',
        '- questionSeeds: 2 short follow-up questions for film discussion',
        '- no markdown, no prose outside JSON, no code fences'
    ].join('\n');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [
                    ...frameParts,
                    { text: prompt }
                ]
            }],
            generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 300,
                responseMimeType: 'application/json'
            }
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Gemini chunk ${chunkIndex + 1}/${totalChunks} failed: ${response.status} ${JSON.stringify(payload).slice(0, 240)}`);
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => String(part?.text || '')).join(' ').trim() || '';
    const parsed = JSON.parse(stripJsonFences(text));
    return {
        id: `chunk-${chunkIndex + 1}`,
        startMs: Math.round(start * 1000),
        endMs: Math.round(end * 1000),
        summary: String(parsed?.summary || '').trim(),
        motifs: Array.isArray(parsed?.motifs) ? parsed.motifs.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 5) : [],
        mood: Array.isArray(parsed?.mood) ? parsed.mood.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 4) : [],
        references: Array.isArray(parsed?.references) ? parsed.references.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 3) : [],
        personaHints: Array.isArray(parsed?.personaHints) ? parsed.personaHints.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 3) : [],
        questionSeeds: Array.isArray(parsed?.questionSeeds) ? parsed.questionSeeds.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 3) : []
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is required to build movie scene cards.');
    }

    const source = resolveSource(options);
    const movieName = resolveMovieName(options, source);
    const slug = normalizeMovieSlug(movieName);
    const outputPath = options.outputPath || path.join(options.outputDir, `${slug}.json`);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const durationSeconds = await probeDuration(source);
    const stepSeconds = Math.max(4, options.chunkSeconds - options.overlapSeconds);
    const chunks = [];
    for (let start = 0; start < durationSeconds; start += stepSeconds) {
        const end = Math.min(durationSeconds, start + options.chunkSeconds);
        if ((end - start) < 4) break;
        chunks.push({ start, end });
        if (options.maxChunks && chunks.length >= options.maxChunks) break;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gesture-movie-analysis-'));
    try {
        const analyzedChunks = [];
        for (let index = 0; index < chunks.length; index += 1) {
            const chunk = chunks[index];
            const frameTimes = buildFrameTimes(chunk.start, chunk.end, options.frameCount);
            const frameFiles = [];
            for (let frameIndex = 0; frameIndex < frameTimes.length; frameIndex += 1) {
                const frameFile = path.join(tempDir, `${slug}-${index + 1}-${frameIndex + 1}.jpg`);
                await extractFrame(source, frameTimes[frameIndex], frameFile);
                frameFiles.push(frameFile);
            }
            const analyzed = await analyzeChunk({
                apiKey,
                model: options.model,
                movieName,
                start: chunk.start,
                end: chunk.end,
                frameFiles,
                chunkIndex: index,
                totalChunks: chunks.length
            });
            analyzedChunks.push(analyzed);
            console.log(`Analyzed chunk ${index + 1}/${chunks.length}: ${Math.round(chunk.start)}s-${Math.round(chunk.end)}s`);
        }

        const payload = {
            movie: movieName,
            slug,
            source: 'gemini-scene-cards-v1',
            updatedAt: new Date().toISOString(),
            config: {
                model: options.model,
                source,
                chunkSeconds: options.chunkSeconds,
                overlapSeconds: options.overlapSeconds,
                frameCount: options.frameCount
            },
            chunks: analyzedChunks
        };

        await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        console.log(`Saved scene cards to ${outputPath}`);
        console.log(`Upload this file to your R2 bucket under movie-analysis/${slug}.json to use it in production.`);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
});