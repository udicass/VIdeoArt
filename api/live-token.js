/**
 * Vercel Serverless Function — Gemini Live API ephemeral token proxy
 *
 * Creates a short-lived auth token for direct browser → Gemini Live API
 * connections. This is intentionally narrow and currently used only by the
 * mobile experimental Live voice scaffold.
 */

const { GoogleGenAI } = require('@google/genai');
const { enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');

const LIVE_MODEL = 'gemini-live-2.5-flash-preview';
const LIVE_API_VERSION = 'v1alpha';
const LIVE_TOKEN_BODY_MAX_BYTES = 32 * 1024;
const LIVE_TOKEN_WINDOW_MS = 10 * 60 * 1000;
const LIVE_TOKEN_LIMIT = 20;
const ALLOWED_RESPONSE_MODALITIES = new Set(['TEXT', 'AUDIO']);

function isoAfterSeconds(seconds) {
    return new Date(Date.now() + (seconds * 1000)).toISOString();
}

function normalizeRequestedModel(model) {
    return String(model || LIVE_MODEL).trim().replace(/^models\//i, '') || LIVE_MODEL;
}

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, {
        methods: ['POST', 'OPTIONS']
    });
    if (security.handled) return;

    const rateLimit = await enforceRateLimit(req, res, {
        key: 'live-token',
        limit: LIVE_TOKEN_LIMIT,
        windowMs: LIVE_TOKEN_WINDOW_MS,
        message: 'Live token rate limit reached. Please retry in a moment.'
    });
    if (rateLimit.handled) return;

    const bodySize = ensureJsonBodySize(res, req.body, LIVE_TOKEN_BODY_MAX_BYTES, 'Live token request');
    if (bodySize.handled) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const liveEnabled = String(process.env.ENABLE_LIVE_EXPERIMENTAL || '').trim().toLowerCase() === 'true';
    if (!liveEnabled) {
        return res.status(403).json({ error: 'Live client tokens are disabled.' });
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
    }

    const requestedModel = normalizeRequestedModel(req.body?.model);
    if (requestedModel !== LIVE_MODEL) {
        return res.status(400).json({ error: 'Unsupported live model.' });
    }

    const requestedModalities = Array.isArray(req.body?.responseModalities)
        ? req.body.responseModalities
        : ['TEXT'];
    const responseModalities = Array.from(new Set(requestedModalities
        .map((value) => String(value || '').trim().toUpperCase())
        .filter((value) => ALLOWED_RESPONSE_MODALITIES.has(value))));

    if (!responseModalities.length) {
        responseModalities.push('TEXT');
    }

    try {
        const ai = new GoogleGenAI({
            apiKey,
            apiVersion: LIVE_API_VERSION
        });

        const token = await ai.authTokens.create({
            config: {
                uses: 1,
                expireTime: isoAfterSeconds(5 * 60),
                newSessionExpireTime: isoAfterSeconds(30)
            }
        });

        return res.status(200).json({
            token: token?.name || '',
            expireTime: token?.expireTime || null,
            newSessionExpireTime: token?.newSessionExpireTime || null,
            model: LIVE_MODEL,
            apiVersion: LIVE_API_VERSION,
            responseModalities
        });
    } catch (error) {
        return res.status(500).json({
            error: error?.message || 'Failed to create Live auth token.'
        });
    }
};