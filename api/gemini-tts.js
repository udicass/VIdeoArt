/**
 * Vercel Serverless Function — Gemini TTS Proxy
 *
 * Synthesizes speech via gemini-2.5-flash-preview-tts using the server-side GEMINI_API_KEY.
 * Returns base64-encoded raw PCM audio (24 kHz, 16-bit mono) for Web Audio playback.
 *
 * POST /api/gemini-tts
 * Body: { text, stylePrompt, voice, language }
 * Response: { audioBase64, mimeType } | { error }
 */

const { enforceRateLimit, guardApiRequest } = require('./_security');

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const TTS_RATE_LIMIT = 60; // 60 requests/min per IP

function trimEnv(name) {
    return String(process.env[name] || '').trim();
}

module.exports = async function handler(req, res) {
    // CORS pre-flight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        guardApiRequest(req);
    } catch (e) {
        return res.status(403).json({ error: String(e?.message || 'Forbidden') });
    }

    const rateLimitResult = enforceRateLimit(req, {
        windowMs: TTS_RATE_LIMIT_WINDOW_MS,
        maxRequests: TTS_RATE_LIMIT,
        bucketKey: 'gemini-tts'
    });
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const apiKey = trimEnv('GEMINI_API_KEY');
    if (!apiKey) return res.status(500).json({ error: 'TTS not configured' });

    const body = req.body || {};
    const text = String(body.text || '').trim().slice(0, 2000);
    const stylePrompt = String(body.stylePrompt || '').trim().slice(0, 500);
    const voice = String(body.voice || 'Kore').trim();
    const language = String(body.language || 'fr-FR').trim();

    if (!text) return res.status(400).json({ error: 'text is required' });

    const contents = stylePrompt
        ? `${stylePrompt}: ${text}`
        : text;

    const geminiBody = {
        contents: [{ role: 'user', parts: [{ text: contents }] }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice }
                },
                languageCode: language
            }
        }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let geminiResp;
    try {
        geminiResp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody),
            signal: controller.signal
        });
    } catch (fetchErr) {
        clearTimeout(timeout);
        const msg = String(fetchErr?.message || 'fetch failed');
        if (/abort/i.test(msg)) return res.status(504).json({ error: 'TTS request timed out' });
        return res.status(502).json({ error: msg });
    }
    clearTimeout(timeout);

    if (!geminiResp.ok) {
        const errBody = await geminiResp.json().catch(() => ({}));
        return res.status(geminiResp.status).json({ error: JSON.stringify(errBody).slice(0, 300) });
    }

    const data = await geminiResp.json().catch(() => null);
    const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inlineData?.data) {
        return res.status(502).json({ error: 'No audio in TTS response' });
    }

    return res.status(200).json({
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'audio/pcm;rate=24000'
    });
};
