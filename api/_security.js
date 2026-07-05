const { Redis } = require('@upstash/redis');

const LOCAL_DEV_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

const state = globalThis.__gesture3dSecurityState || (globalThis.__gesture3dSecurityState = {
    rateLimitBuckets: new Map()
});

let cachedKvClient = null;
let cachedKvResolved = false;

function trimEnv(name) {
    return String(process.env[name] || '').trim();
}

function parseOrigin(value = '') {
    try {
        return new URL(String(value || '').trim()).origin;
    } catch {
        return '';
    }
}

function splitConfiguredOrigins(value = '') {
    return String(value || '')
        .split(',')
        .map((origin) => parseOrigin(origin))
        .filter(Boolean);
}

function getRequestHost(req) {
    return String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
        .split(',')[0]
        .trim();
}

function isLocalHostHost(host = '') {
    return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(String(host || '').trim());
}

function getRequestProtocol(req) {
    const explicit = String(req?.headers?.['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    if (explicit === 'http' || explicit === 'https') return explicit;
    return isLocalHostHost(getRequestHost(req)) ? 'http' : 'https';
}

function getSameOrigin(req) {
    const host = getRequestHost(req);
    if (!host) return '';
    return parseOrigin(`${getRequestProtocol(req)}://${host}`);
}

function getCallerOrigin(req) {
    const origin = parseOrigin(req?.headers?.origin);
    if (origin) return origin;

    const refererOrigin = parseOrigin(req?.headers?.referer);
    if (refererOrigin) return refererOrigin;

    const fetchSite = String(req?.headers?.['sec-fetch-site'] || '').trim().toLowerCase();
    if (fetchSite === 'same-origin') {
        return getSameOrigin(req);
    }

    return '';
}

function getAllowedOrigins(req, { extraOrigins = [], includeLocalDev = true } = {}) {
    const allowed = new Set([
        ...splitConfiguredOrigins(trimEnv('CORS_ALLOWED_ORIGINS')),
        ...splitConfiguredOrigins(trimEnv('APP_ORIGIN')),
        ...splitConfiguredOrigins(trimEnv('PUBLIC_APP_ORIGIN'))
    ]);

    const sameOrigin = getSameOrigin(req);
    if (sameOrigin) allowed.add(sameOrigin);

    if (includeLocalDev) {
        LOCAL_DEV_ORIGINS.forEach((origin) => allowed.add(origin));
    }

    for (const origin of (Array.isArray(extraOrigins) ? extraOrigins : [extraOrigins])) {
        const parsed = parseOrigin(origin);
        if (parsed) allowed.add(parsed);
    }

    return Array.from(allowed);
}

function appendVary(res, header) {
    const current = String(res.getHeader('Vary') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (!current.includes(header)) {
        current.push(header);
        res.setHeader('Vary', current.join(', '));
    }
}

function applyBaseSecurityHeaders(res, { cacheControl = 'no-store' } = {}) {
    if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
}

function applyCorsHeaders(res, { origin, methods = ['GET'], headers = ['Content-Type'] } = {}) {
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    res.setHeader('Access-Control-Max-Age', '3600');
    appendVary(res, 'Origin');
    appendVary(res, 'Referer');
}

function rejectJson(res, status, error) {
    res.status(status).json({ error });
    return { ok: false, handled: true };
}

function guardApiRequest(req, res, {
    methods = ['GET'],
    headers = ['Content-Type'],
    extraOrigins = [],
    includeLocalDev = true,
    allowNoOriginOnLocalhost = true,
    cacheControl = 'no-store'
} = {}) {
    applyBaseSecurityHeaders(res, { cacheControl });

    const callerOrigin = getCallerOrigin(req);
    const allowedOrigins = getAllowedOrigins(req, { extraOrigins, includeLocalDev });
    const allowNoOrigin = allowNoOriginOnLocalhost && isLocalHostHost(getRequestHost(req));
    const originAllowed = callerOrigin
        ? allowedOrigins.includes(callerOrigin)
        : allowNoOrigin;

    if (originAllowed && callerOrigin) {
        applyCorsHeaders(res, { origin: callerOrigin, methods, headers });
    }

    if (req.method === 'OPTIONS') {
        if (!originAllowed) {
            return rejectJson(res, 403, 'Origin not allowed.');
        }
        res.status(204).end();
        return { ok: false, handled: true };
    }

    if (!originAllowed) {
        return rejectJson(res, 403, 'Origin not allowed.');
    }

    return {
        ok: true,
        handled: false,
        callerOrigin,
        allowedOrigins
    };
}

function getClientIp(req) {
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
        .split(',')
        .map((value) => value.trim())
        .find(Boolean);
    const raw = forwarded
        || String(req?.headers?.['cf-connecting-ip'] || '').trim()
        || String(req?.headers?.['x-real-ip'] || '').trim()
        || String(req?.socket?.remoteAddress || '').trim()
        || 'unknown';
    return raw.replace(/^::ffff:/i, '');
}

function getKvClient() {
    if (cachedKvResolved) return cachedKvClient;
    const url = trimEnv('KV_REST_API_URL');
    const token = trimEnv('KV_REST_API_TOKEN');
    cachedKvClient = url && token ? new Redis({ url, token }) : null;
    cachedKvResolved = true;
    return cachedKvClient;
}

function incrementMemoryBucket(key, windowMs) {
    const now = Date.now();
    const existing = state.rateLimitBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
        const next = { count: 1, resetAt: now + windowMs };
        state.rateLimitBuckets.set(key, next);
        return next;
    }
    existing.count += 1;
    return existing;
}

async function enforceRateLimit(req, res, {
    key,
    limit,
    windowMs,
    message = 'Too many requests. Please retry later.'
}) {
    const ip = getClientIp(req);
    const bucket = Math.floor(Date.now() / windowMs);
    const resetAt = (bucket + 1) * windowMs;
    const rateKey = `gesture3d_rl_v1:${key}:${ip}:${bucket}`;

    let count = 0;
    const kv = getKvClient();
    if (kv) {
        try {
            count = await kv.incr(rateKey);
            if (count === 1) {
                await kv.expire(rateKey, Math.max(1, Math.ceil(windowMs / 1000)) + 1);
            }
        } catch {
            count = 0;
        }
    }

    if (!count) {
        count = incrementMemoryBucket(rateKey, windowMs).count;
    }

    const retryAfterMs = Math.max(0, resetAt - Date.now());
    if (count > limit) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
        return rejectJson(res, 429, message);
    }

    return {
        ok: true,
        handled: false,
        count,
        remaining: Math.max(0, limit - count),
        retryAfterMs
    };
}

function ensureJsonBodySize(res, body, maxBytes, label = 'Request body') {
    const bytes = Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
    if (bytes > maxBytes) {
        return rejectJson(res, 413, `${label} too large.`);
    }
    return {
        ok: true,
        handled: false,
        bytes
    };
}

function cleanTextInput(value, maxLength = 0, { preserveNewlines = true, fallback = '' } = {}) {
    let text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (!preserveNewlines) {
        text = text.replace(/\s+/g, ' ');
    }
    text = text.trim();
    if (maxLength > 0 && text.length > maxLength) {
        text = text.slice(0, maxLength).trim();
    }
    return text || fallback;
}

module.exports = {
    cleanTextInput,
    enforceRateLimit,
    ensureJsonBodySize,
    getAllowedOrigins,
    getCallerOrigin,
    getClientIp,
    getSameOrigin,
    guardApiRequest,
    isLocalHostHost
};