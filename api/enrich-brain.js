/**
 * Vercel Serverless Function — Brain Enrichment from Sources
 *
 * NotebookLM doesn't expose a public API. This endpoint replicates its core
 * capability: feed raw source text → Gemini synthesizes film-insight Q&A pairs
 * → pairs are stored as high-scored brain memory entries.
 *
 * POST /api/enrich-brain
 * Body: {
 *   movie: string,          // e.g. "Synthetic_Desires_4.mp4"
 *   sources: string[],      // array of raw text blobs (articles, notes, reviews)
 *   count?: number,         // how many Q&A pairs to generate (default 8, max 20)
 *   apiKey?: string         // optional caller-supplied Gemini key (else uses server key)
 * }
 * Response: { ok: true, movie, imported: number, entries: [{input, response, score}] }
 */

const { Redis } = require('@upstash/redis');
const { cleanTextInput, enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');

const MAX_SOURCES = 10;
const MAX_SOURCE_CHARS = 12_000;   // per source
const MAX_TOTAL_CHARS  = 40_000;   // total across all sources
const MAX_COUNT        = 20;
const DEFAULT_COUNT    = 8;
const MAX_INPUT_LENGTH = 500;
const MAX_RESPONSE_LENGTH = 1600;
const MAX_MOVIE_LENGTH = 80;
const MAX_PER_MOVIE    = 100;
const STORAGE_PREFIX   = 'brain_mem_v2_';
const BODY_MAX_BYTES   = 100 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const GEMINI_CANDIDATES = [
    ['v1beta', 'gemini-2.5-flash'],
    ['v1beta', 'gemini-2.5-flash-preview-04-17'],
    ['v1beta', 'gemini-2.0-flash'],
    ['v1beta', 'gemini-2.0-flash-lite'],
    ['v1beta', 'gemini-1.5-flash'],
    ['v1beta', 'gemini-1.5-flash-latest'],
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function slug(movie) {
    return String(movie || 'default')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .substring(0, 40);
}

function storageKey(movie) {
    return STORAGE_PREFIX + slug(movie);
}

function trimEnv(name) {
    return String(process.env[name] || '').trim();
}

function isKvReady() {
    return !!trimEnv('KV_REST_API_URL') && !!trimEnv('KV_REST_API_TOKEN');
}

function getKvClient() {
    if (!isKvReady()) return null;
    return new Redis({ url: trimEnv('KV_REST_API_URL'), token: trimEnv('KV_REST_API_TOKEN') });
}

function scoreEntry(input, response) {
    let s = 0;
    const r = String(response || '');
    const q = String(input || '');
    if (r.length >= 40 && r.length <= 180) s += 3;
    else if (r.length > 180) s += 1;
    if (/[.…—]/.test(r)) s += 1;
    if (/\b(I|me|my|you|your|we)\b/i.test(r)) s += 1;
    if (!/error|unavailable|fallback|sorry/i.test(r)) s += 2;
    if (q.length > 4 && q.length < 80) s += 1;
    // Bonus: sourced insights score higher so they rank above organic podcast lines
    s += 2;
    return s;
}

function normalizeMemories(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter((e) => e && typeof e.input === 'string' && typeof e.response === 'string')
        .map((e) => ({
            input: String(e.input || '').trim().substring(0, MAX_INPUT_LENGTH),
            response: String(e.response || '').trim().substring(0, MAX_RESPONSE_LENGTH),
            score: Number(e.score || 0),
            savedAt: Number(e.savedAt || Date.now()),
            usedCount: Number(e.usedCount || 0)
        }))
        .filter((e) => e.input && e.response);
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function callGemini(apiKey, movieTitle, sources, count) {
    const sourcesText = sources
        .map((s, i) => `--- Source ${i + 1} ---\n${String(s).trim()}`)
        .join('\n\n');

    const prompt = `You are a film analyst creating a knowledge base for an AI podcast host.

Given the source texts below about the film "${movieTitle}", generate exactly ${count} Q&A pairs suitable for a poetic, intellectual film podcast.

Rules:
- Questions should be short, thematic, open-ended (what a curious host would ask)
- Answers should be 1-3 sentences, evocative, grounded in the sources
- No generic filler — every answer must be specific to this film
- Output ONLY valid JSON, no markdown, no extra text

Format:
{"pairs":[{"input":"...","response":"..."},...]}

Sources:
${sourcesText}`;

    let lastError = null;
    const errors = [];

    for (const [version, model] of GEMINI_CANDIDATES) {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.85,
                        maxOutputTokens: 2048
                    }
                })
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => `HTTP ${res.status}`);
                errors.push(`${model}@${version}: ${res.status} ${errText.substring(0, 120)}`);
                lastError = errText;
                continue;
            }

            const payload = await res.json();
            const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Strip markdown code fences if present
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            const parsed = JSON.parse(cleaned);

            if (Array.isArray(parsed?.pairs) && parsed.pairs.length > 0) {
                return parsed.pairs;
            }
            errors.push(`${model}@${version}: empty pairs`);
        } catch (err) {
            const msg = err?.message || String(err);
            errors.push(`${model}@${version}: ${msg.substring(0, 120)}`);
            lastError = msg;
        }
    }

    throw new Error(`Gemini synthesis failed after ${errors.length} attempts. Last: ${lastError}\nAll: ${errors.join(' | ')}`);
}

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, { methods: ['POST', 'OPTIONS'] });
    if (security.handled) return;

    const rateLimit = await enforceRateLimit(req, res, {
        key: 'enrich-brain:post',
        limit: 20,
        windowMs: RATE_LIMIT_WINDOW_MS,
        message: 'Enrich-brain rate limit reached. Please wait and retry.'
    });
    if (rateLimit.handled) return;

    const sizeCheck = ensureJsonBodySize(res, req.body, BODY_MAX_BYTES, 'Enrich-brain request');
    if (sizeCheck.handled) return;

    const kv = getKvClient();
    if (!kv) return res.status(503).json({ error: 'KV store is not configured on this server.' });

    // Validate inputs
    const rawMovie   = String(req.body?.movie || '').trim();
    const rawSources = req.body?.sources;
    const rawPairs   = req.body?.pairs;   // direct mode: pre-formed Q&A pairs
    const rawCount   = req.body?.count;
    const callerKey  = String(req.body?.apiKey || '').trim();

    if (!rawMovie) return res.status(400).json({ error: 'movie is required.' });

    const movie = cleanTextInput(rawMovie, MAX_MOVIE_LENGTH, { fallback: 'default' });

    let pairs;

    // ── Direct import path (pairs provided, no Gemini synthesis needed) ─────
    if (Array.isArray(rawPairs) && rawPairs.length > 0) {
        pairs = rawPairs
            .slice(0, MAX_COUNT)
            .map((p) => ({
                input:    cleanTextInput(String(p?.input    || p?.question || '').trim(), MAX_INPUT_LENGTH),
                response: cleanTextInput(String(p?.response || p?.answer   || '').trim(), MAX_RESPONSE_LENGTH)
            }))
            .filter((p) => p.input && p.response);

        if (pairs.length === 0) return res.status(400).json({ error: 'pairs contained no valid entries.' });

    } else {
        // ── Synthesis path — Gemini generates pairs from source text ─────────
        if (!Array.isArray(rawSources) || rawSources.length === 0) {
            return res.status(400).json({ error: 'Provide either sources (array of text) or pairs (array of {input,response}).' });
        }

        const count  = Math.min(MAX_COUNT, Math.max(1, Number.isFinite(Number(rawCount)) ? Number(rawCount) : DEFAULT_COUNT));
        const apiKey = callerKey || trimEnv('GEMINI_API_KEY');
        if (!apiKey) return res.status(500).json({ error: 'No Gemini API key configured.' });

        const sources = rawSources
            .slice(0, MAX_SOURCES)
            .map((s) => String(s || '').trim().substring(0, MAX_SOURCE_CHARS))
            .filter(Boolean);

        if (sources.length === 0) return res.status(400).json({ error: 'All sources were empty.' });

        const totalChars = sources.reduce((n, s) => n + s.length, 0);
        if (totalChars > MAX_TOTAL_CHARS) {
            return res.status(413).json({ error: `Total source text exceeds ${MAX_TOTAL_CHARS} characters.` });
        }

        const movieTitle = rawMovie.replace(/\.mp4$/i, '').replace(/[_-]/g, ' ').trim();

        try {
            pairs = await callGemini(apiKey, movieTitle, sources, count);
        } catch (err) {
            return res.status(502).json({ error: err?.message || 'Gemini synthesis failed.' });
        }
    }

    // Merge into brain memory KV
    const key = storageKey(movie);
    const existing = normalizeMemories(await kv.get(key).catch(() => []));
    const importedEntries = [];

    for (const pair of pairs) {
        const input    = cleanTextInput(String(pair?.input    || '').trim(), MAX_INPUT_LENGTH);
        const response = cleanTextInput(String(pair?.response || '').trim(), MAX_RESPONSE_LENGTH);
        if (!input || !response) continue;

        const sc = scoreEntry(input, response);
        const idx = existing.findIndex((e) => e.input.toLowerCase() === input.toLowerCase());
        const next = { input, response, score: sc, savedAt: Date.now(), usedCount: 0 };

        if (idx >= 0) existing[idx] = next;
        else existing.push(next);

        importedEntries.push({ input, response, score: sc });
    }

    existing.sort((a, b) => b.score - a.score || b.savedAt - a.savedAt);
    const trimmed = existing.slice(0, MAX_PER_MOVIE);

    await kv.set(key, trimmed);

    return res.status(200).json({
        ok: true,
        movie,
        imported: importedEntries.length,
        entries: importedEntries
    });
};
