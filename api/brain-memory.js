/**
 * Vercel Serverless Function — Shared Brain Memory Store
 *
 * Persists Cloud-learned memory entries per movie in Vercel KV so the
 * dictionary/brain fallback can evolve across devices/sessions.
 *
 * GET  /api/brain-memory?movie=<movie>
 * POST /api/brain-memory  { movie, input, response }
 */

const { Redis } = require('@upstash/redis');
const { cleanTextInput, enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');

const MAX_PER_MOVIE = 100;
const STORAGE_PREFIX = 'brain_mem_v2_';
const MAX_MOVIE_LENGTH = 80;
const MAX_INPUT_LENGTH = 500;
const MAX_RESPONSE_LENGTH = 1600;
const BRAIN_MEMORY_BODY_MAX_BYTES = 20 * 1024;
const BRAIN_MEMORY_WINDOW_MS = 10 * 60 * 1000;

function score(input, response) {
    let s = 0;
    const r = response || '';
    const q = input || '';

    if (r.length >= 40 && r.length <= 180) s += 3;
    else if (r.length > 180) s += 1;

    if (/[.…—]/.test(r)) s += 1;
    if (/\b(I|me|my|you|your|we)\b/i.test(r)) s += 1;
    if (!/error|unavailable|fallback|sorry/i.test(r)) s += 2;
    if (q.length > 4 && q.length < 80) s += 1;

    return s;
}

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

function _trimEnv(name) {
    return String(process.env[name] || '').trim();
}

function isKvReady() {
    return !!_trimEnv('KV_REST_API_URL') && !!_trimEnv('KV_REST_API_TOKEN');
}

function getKvClient() {
    if (!isKvReady()) return null;
    return new Redis({
        url: _trimEnv('KV_REST_API_URL'),
        token: _trimEnv('KV_REST_API_TOKEN')
    });
}

function normalizeMemories(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry) => entry && typeof entry.input === 'string' && typeof entry.response === 'string')
        .map((entry) => ({
            input: cleanTextInput(entry.input, MAX_INPUT_LENGTH),
            response: cleanTextInput(entry.response, MAX_RESPONSE_LENGTH),
            score: Number(entry.score || 0),
            savedAt: Number(entry.savedAt || Date.now()),
            usedCount: Number(entry.usedCount || 0)
        }))
        .filter((entry) => entry.input && entry.response);
}

function isTooLong(value, maxLength) {
    return String(value ?? '').trim().length > maxLength;
}

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, {
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
    });
    if (security.handled) return;

    const rateLimit = await enforceRateLimit(req, res, {
        key: `brain-memory:${req.method}`,
        limit: req.method === 'GET' ? 120 : 180,
        windowMs: BRAIN_MEMORY_WINDOW_MS,
        message: 'Brain memory rate limit reached. Please retry in a moment.'
    });
    if (rateLimit.handled) return;

    const kv = getKvClient();
    if (!kv) {
        return res.status(503).json({ error: 'KV is not configured on server.' });
    }

    if (req.method === 'GET') {
        if (isTooLong(req.query?.movie || '', MAX_MOVIE_LENGTH)) {
            return res.status(413).json({ error: 'movie is too long.' });
        }

        const movie = cleanTextInput(req.query?.movie || 'default', MAX_MOVIE_LENGTH, { fallback: 'default' });
        try {
            const memories = normalizeMemories(await kv.get(storageKey(movie)));
            memories.sort((a, b) => b.score - a.score || b.savedAt - a.savedAt);
            return res.status(200).json({ movie, memories: memories.slice(0, MAX_PER_MOVIE) });
        } catch (err) {
            return res.status(500).json({ error: err?.message || 'Failed to load memories.' });
        }
    }

    if (req.method === 'DELETE') {
        // Flush one movie's KV memories. Requires x-flush-secret header matching
        // BRAIN_FLUSH_SECRET env var (set only in your local .env — never in production).
        const flushSecret = _trimEnv('BRAIN_FLUSH_SECRET');
        if (!flushSecret || req.headers['x-flush-secret'] !== flushSecret) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        if (isTooLong(req.query?.movie || '', MAX_MOVIE_LENGTH)) {
            return res.status(413).json({ error: 'movie is too long.' });
        }

        const movie = cleanTextInput(req.query?.movie || 'default', MAX_MOVIE_LENGTH, { fallback: 'default' });
        try {
            await kv.del(storageKey(movie));
            return res.status(200).json({ ok: true, movie, flushed: true });
        } catch (err) {
            return res.status(500).json({ error: err?.message || 'Failed to flush memories.' });
        }
    }

    if (req.method === 'POST') {
        const sizeCheck = ensureJsonBodySize(res, req.body, BRAIN_MEMORY_BODY_MAX_BYTES, 'Brain memory request');
        if (sizeCheck.handled) return;

        if (isTooLong(req.body?.movie || '', MAX_MOVIE_LENGTH)
            || isTooLong(req.body?.input || '', MAX_INPUT_LENGTH)
            || isTooLong(req.body?.response || '', MAX_RESPONSE_LENGTH)) {
            return res.status(413).json({ error: 'movie/input/response exceeded the allowed size.' });
        }

        const movie = cleanTextInput(req.body?.movie || 'default', MAX_MOVIE_LENGTH, { fallback: 'default' });
        const input = cleanTextInput(req.body?.input, MAX_INPUT_LENGTH);
        const response = cleanTextInput(req.body?.response, MAX_RESPONSE_LENGTH);

        if (!input || !response) {
            return res.status(400).json({ error: 'movie/input/response are required.' });
        }

        try {
            const key = storageKey(movie);
            const existing = normalizeMemories(await kv.get(key));
            const idx = existing.findIndex(
                (entry) => entry.input.toLowerCase() === input.toLowerCase()
            );

            const next = {
                input,
                response,
                score: score(input, response),
                savedAt: Date.now(),
                usedCount: idx >= 0 ? Number(existing[idx].usedCount || 0) : 0
            };

            if (idx >= 0) existing[idx] = next;
            else existing.push(next);

            existing.sort((a, b) => b.score - a.score || b.savedAt - a.savedAt);
            const trimmed = existing.slice(0, MAX_PER_MOVIE);

            await kv.set(key, trimmed);
            return res.status(200).json({ ok: true, movie, count: trimmed.length });
        } catch (err) {
            return res.status(500).json({ error: err?.message || 'Failed to save memory.' });
        }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
};
