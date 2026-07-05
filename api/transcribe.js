function extractTextFromParts(parts = []) {
    if (!Array.isArray(parts)) return '';
    return parts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
}

function extractGeminiText(data = {}) {
    return extractTextFromParts(data?.candidates?.[0]?.content?.parts || []);
}

function extractFinishReason(data = {}) {
    return String(data?.candidates?.[0]?.finishReason || '').trim();
}

const FALLBACK_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest'];
const FALLBACK_VERSIONS = ['v1beta'];
const { enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');

const TRANSCRIBE_REQUEST_MAX_BYTES = 10 * 1024 * 1024;
const TRANSCRIBE_AUDIO_MAX_LENGTH = 8 * 1024 * 1024;
const TRANSCRIBE_WINDOW_MS = 10 * 60 * 1000;
const TRANSCRIBE_RATE_LIMIT = 60;
const ALLOWED_AUDIO_MIME = /^audio\/[a-z0-9.+-]+$/i;

function isRetryable(status, payload) {
    if (status === 404 || status === 429 || status >= 500) return true;
    if (status !== 400) return false;
    const text = JSON.stringify(payload || {});
    return /not\s+found\s+for\s+api\s+version|audio|generatecontent|not\s+enabled|unsupported|thinkingconfig/i.test(text);
}

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, {
        methods: ['POST', 'OPTIONS']
    });
    if (security.handled) return;

    const rateLimit = await enforceRateLimit(req, res, {
        key: 'transcribe',
        limit: TRANSCRIBE_RATE_LIMIT,
        windowMs: TRANSCRIBE_WINDOW_MS,
        message: 'Transcription rate limit reached. Please retry in a moment.'
    });
    if (rateLimit.handled) return;

    const bodySize = ensureJsonBodySize(res, req.body, TRANSCRIBE_REQUEST_MAX_BYTES, 'Transcription request');
    if (bodySize.handled) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
    }

    const { audioData, mimeType: rawMimeType, model, apiVersion } = req.body || {};
    if (!audioData || !rawMimeType) {
        return res.status(400).json({ error: 'Missing audioData or mimeType.' });
    }

    if (String(audioData).length > TRANSCRIBE_AUDIO_MAX_LENGTH) {
        return res.status(413).json({ error: 'Audio payload too large.' });
    }

    // Gemini only accepts the base mime type without codec parameters
    const mimeType = String(rawMimeType || '').split(';')[0].trim();
    if (!ALLOWED_AUDIO_MIME.test(mimeType) || mimeType.length > 120) {
        return res.status(400).json({ error: 'Unsupported audio mime type.' });
    }

    const requestedApiVersion = String(apiVersion || FALLBACK_VERSIONS[0]).trim() || FALLBACK_VERSIONS[0];
    if (!FALLBACK_VERSIONS.includes(requestedApiVersion)) {
        return res.status(400).json({ error: 'Unsupported transcription API version.' });
    }

    const requestedModel = String(model || FALLBACK_MODELS[0]).trim() || FALLBACK_MODELS[0];
    if (!FALLBACK_MODELS.includes(requestedModel)) {
        return res.status(400).json({ error: 'Unsupported transcription model.' });
    }

    const baseBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: 'Transcribe the spoken audio exactly as spoken. Return only the plain transcript text with no punctuation corrections or additions. Even if audio quality is low, do your best to transcribe. Only return an empty string if there is truly no human voice present.' },
                { inlineData: { mimeType, data: audioData } }
            ]
        }],
        generationConfig: {
            temperature: 0,
            maxOutputTokens: 120
        }
    };

    const versionsToTry = [requestedApiVersion, ...FALLBACK_VERSIONS.filter((value) => value !== requestedApiVersion)];
    const modelsToTry = Array.from(new Set([requestedModel, ...FALLBACK_MODELS].filter(Boolean)));
    let lastError = null;

    for (const ver of versionsToTry) {
        for (const mdl of modelsToTry) {
            const url = `https://generativelanguage.googleapis.com/${ver}/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`;
            for (const body of [baseBody]) {
                try {
                    const upstream = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    const raw = await upstream.text();
                    let data = {};
                    try {
                        data = raw ? JSON.parse(raw) : {};
                    } catch {
                        data = { error: raw || upstream.statusText };
                    }

                    if (upstream.ok) {
                        const text = extractGeminiText(data)
                            .replace(/^['"`]+|['"`]+$/g, '')
                            .trim();
                        const empty = /^(?:no\s+(?:speech|audio)|inaudible|unintelligible|empty)$/i.test(text);
                        return res.status(200).json({
                            text: empty ? '' : text,
                            meta: {
                                model: mdl,
                                apiVersion: ver,
                                finishReason: extractFinishReason(data)
                            }
                        });
                    }

                    lastError = { status: upstream.status, body: data };
                    if (upstream.status === 429) {
                        return res.status(429).json({ error: 'Transcription rate limit reached. Please retry in a moment.' });
                    }
                    if (isRetryable(upstream.status, data)) continue;
                    return res.status(upstream.status).json(data);
                } catch (err) {
                    lastError = { status: 500, error: err.message };
                }
            }
        }
    }

    return res.status(lastError?.status || 500).json(lastError || { error: 'Transcription failed.' });
};