/**
 * Vercel Serverless Function — Gemini API Proxy
 *
 * Hides the Gemini API key server-side.
 * Set GEMINI_API_KEY in your Vercel project environment variables.
 *
 * POST /api/gemini
 * Body: { apiVersion, model, body }
 * Returns: Gemini response JSON
 */

const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const FALLBACK_VERSIONS = ['v1beta', 'v1'];
const MODEL_PRIORITY = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const { recordUsage } = require('./_usageStore');
const { enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');

const GEMINI_REQUEST_MAX_BYTES = 8 * 1024 * 1024;
const GEMINI_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const GEMINI_RATE_LIMIT = 1200; // Pro tier: ~120 RPM sustained (Gemini 2.x Pro allows 360 RPM+)

function isRetryableModelMiss(status, payload) {
    if (status === 404) return true;
    if (status !== 400) return false;

    const text = JSON.stringify(payload || {});
    return /not\s+found\s+for\s+api\s+version|is\s+not\s+found\s+for\s+api\s+version|models\/.+\s+not\s+found/i.test(text);
}

function isRetryableModelCapabilityError(status, payload) {
    if (status !== 400) return false;
    const text = JSON.stringify(payload || {});
    return /multiturn\s+chat\s+is\s+not\s+enabled|not\s+enabled\s+for\s+models\/|does\s+not\s+support\s+generatecontent|unsupported\s+for\s+generatecontent|content\s+type\s+image\s+or\s+video\s+is\s+not\s+supported|only\s+text\s+(content\s+)?is\s+supported|does\s+not\s+support\s+image|does\s+not\s+support\s+audio/i.test(text);
}

function isThinkingConfigUnsupported(status, payload) {
    if (status !== 400) return false;
    const text = JSON.stringify(payload || {});
    return /unknown\s+name\s+"?thinkingconfig"?|cannot\s+find\s+field\s+.*thinking|invalid\s+json\s+payload\s+received|budget\s+0\s+is\s+invalid|only\s+works\s+in\s+thinking\s+mode|thinking\s+budget/i.test(text);
}

function isLikelyChatModel(modelName) {
    const value = String(modelName || '').toLowerCase();
    if (!value.startsWith('gemini')) return false;
    // Skip specialized variants that frequently reject multi-turn chat payloads.
    if (/(?:^|[-_])(tts|embedding|embeddings|aqa|vision|image)(?:$|[-_])/i.test(value)) {
        return false;
    }
    return true;
}

async function listGenerateContentModels(apiKey, apiVersion) {
    const listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(listUrl);
    if (!resp.ok) return [];

    const data = await resp.json().catch(() => ({}));
    const models = Array.isArray(data?.models) ? data.models : [];

    return models
        .filter((modelInfo) => {
            const methods = Array.isArray(modelInfo?.supportedGenerationMethods)
                ? modelInfo.supportedGenerationMethods
                : [];
            return methods.includes('generateContent');
        })
        .map((modelInfo) => String(modelInfo?.name || '').replace(/^models\//, '').trim())
        .filter((modelName) => isLikelyChatModel(modelName))
        .filter(Boolean);
}

function buildModelsToTry(requestedModel, discoveredModels) {
    const ordered = [requestedModel, ...MODEL_PRIORITY, ...(discoveredModels || []), ...FALLBACK_MODELS]
        .filter(Boolean);
    const seen = new Set();
    const unique = [];
    for (const modelName of ordered) {
        if (seen.has(modelName)) continue;
        seen.add(modelName);
        unique.push(modelName);
    }
    return unique.slice(0, 8);
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

/**
 * Remove inlineData parts (audio/video blobs) from a request body.
 * Leaves text parts intact. Used as a last-resort fallback when all
 * multimodal-capable models have failed.
 */
function stripInlineData(body) {
    const cleaned = cloneJson(body);
    if (!Array.isArray(cleaned?.contents)) return cleaned;
    cleaned.contents = cleaned.contents.map(c => {
        if (!Array.isArray(c?.parts)) return c;
        const filtered = c.parts.filter(p => !p?.inlineData);
        return { ...c, parts: filtered.length ? filtered : [{ text: '' }] };
    });
    return cleaned;
}

function hasInlineDataParts(body) {
    return String(JSON.stringify(body || {})).includes('"inlineData"');
}

function prepareRequestBody(baseBody, disableThinking = true) {
    const payload = cloneJson(baseBody);
    const generationConfig = (payload && typeof payload.generationConfig === 'object' && payload.generationConfig !== null)
        ? payload.generationConfig
        : {};

    // Keep outputs concise while leaving enough headroom for complete short answers.
    if (!Number.isFinite(generationConfig.maxOutputTokens) || generationConfig.maxOutputTokens < 300) {
        generationConfig.maxOutputTokens = 300;
    }

    if (disableThinking) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
    } else if (generationConfig.thinkingConfig) {
        delete generationConfig.thinkingConfig;
    }

    payload.generationConfig = generationConfig;
    return payload;
}

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, {
        methods: ['POST', 'OPTIONS']
    });
    if (security.handled) return;

    const rateLimit = await enforceRateLimit(req, res, {
        key: 'gemini',
        limit: GEMINI_RATE_LIMIT,
        windowMs: GEMINI_RATE_LIMIT_WINDOW_MS,
        message: 'Gemini proxy rate limit reached. Please retry in a moment.'
    });
    if (rateLimit.handled) return;

    const bodySize = ensureJsonBodySize(res, req.body, GEMINI_REQUEST_MAX_BYTES, 'Gemini request');
    if (bodySize.handled) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server. Add it in Vercel → Project Settings → Environment Variables.' });
    }

    const { apiVersion, model, body: geminiBody } = req.body || {};
    const requestedApiVersion = String(apiVersion || '').trim();
    const requestedModel = String(model || '').trim();

    if (requestedApiVersion && !FALLBACK_VERSIONS.includes(requestedApiVersion)) {
        return res.status(400).json({ error: 'Unsupported Gemini API version.' });
    }

    if (requestedModel && !isLikelyChatModel(requestedModel)) {
        return res.status(400).json({ error: 'Unsupported Gemini model.' });
    }

    if (!geminiBody || typeof geminiBody !== 'object' || Array.isArray(geminiBody)) {
        return res.status(400).json({ error: 'Missing body field in request' });
    }

    // Try requested model first, then fallback cascade
    const versionsToTry = requestedApiVersion ? [requestedApiVersion, ...FALLBACK_VERSIONS.filter(v => v !== requestedApiVersion)] : FALLBACK_VERSIONS;
    let lastError = null;

    for (const ver of versionsToTry) {
        // Discover currently available generateContent models for this key/version.
        // If discovery fails, static fallbacks are still used.
        let discoveredModels = [];
        try {
            discoveredModels = await listGenerateContentModels(apiKey, ver);
        } catch {
            discoveredModels = [];
        }

        const modelsToTry = buildModelsToTry(requestedModel, discoveredModels);

        for (const mdl of modelsToTry) {
            const url = `https://generativelanguage.googleapis.com/${ver}/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`;

            const requestVariants = [
                { body: prepareRequestBody(geminiBody, true), fallbackToNextVariantOn400: true },
                { body: prepareRequestBody(geminiBody, false), fallbackToNextVariantOn400: false }
            ];

            for (let variantIndex = 0; variantIndex < requestVariants.length; variantIndex++) {
                const variant = requestVariants[variantIndex];

                try {
                    const upstream = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(variant.body)
                    });

                    const raw = await upstream.text();
                    let data = {};
                    try {
                        data = raw ? JSON.parse(raw) : {};
                    } catch {
                        data = { error: raw || upstream.statusText };
                    }

                    if (upstream.ok) {
                        try {
                            await recordUsage({
                                usageMetadata: data?.usageMetadata || {},
                                model: mdl,
                                apiVersion: ver
                            });
                        } catch {
                            // Usage logging must never block the response path.
                        }
                        return res.status(200).json(data);
                    }

                    // Retry the same model once without thinkingConfig when unsupported.
                    if (variant.fallbackToNextVariantOn400 && isThinkingConfigUnsupported(upstream.status, data)) {
                        lastError = { status: upstream.status, body: data };
                        continue;
                    }

                    // 429 quota — try next model/version
                    if (upstream.status === 429) {
                        lastError = { status: 429, body: data };
                        // Extract and preserve Retry-After from Gemini's response so
                        // the client can read it as an HTTP header without parsing nested JSON.
                        const upstreamRetryAfter = upstream.headers.get('Retry-After');
                        if (upstreamRetryAfter) lastError.retryAfter = upstreamRetryAfter;
                        break;
                    }

                    // If a model/version combo doesn't exist for this key/project, try fallbacks.
                    if (isRetryableModelMiss(upstream.status, data)) {
                        lastError = { status: upstream.status, body: data };
                        break;
                    }

                    // Some models are valid but not compatible with this chat payload.
                    // Continue to the next model instead of failing the whole request.
                    if (isRetryableModelCapabilityError(upstream.status, data)) {
                        lastError = { status: upstream.status, body: data };
                        break;
                    }

                    // Transient upstream issues — try next candidate before failing the request.
                    if (upstream.status >= 500) {
                        lastError = { status: upstream.status, body: data };
                        break;
                    }

                    // Other non-OK → return directly
                    return res.status(upstream.status).json(data);
                } catch (err) {
                    lastError = { status: 500, message: err.message };
                    break;
                }
            }
        }
    }

    // ── Multimodal fallback ──────────────────────────────────────────────────
    // If all models failed AND the request contained inlineData (audio/video),
    // strip the multimodal parts and retry once with the primary model.
    // This ensures the user still gets a cloud AI response even when the model
    // cannot process the attached media.
    if (hasInlineDataParts(geminiBody)) {
        const textOnlyBody = stripInlineData(geminiBody);
        const fbVer = versionsToTry[0] || 'v1beta';
        const fbMdl = buildModelsToTry(requestedModel, [])[0] || 'gemini-2.0-flash';
        const fbUrl = `https://generativelanguage.googleapis.com/${fbVer}/models/${fbMdl}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            const upstream = await fetch(fbUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prepareRequestBody(textOnlyBody, true))
            });
            const raw = await upstream.text();
            let data = {};
            try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || upstream.statusText }; }
            if (upstream.ok) {
                try {
                    await recordUsage({
                        usageMetadata: data?.usageMetadata || {},
                        model: fbMdl,
                        apiVersion: fbVer
                    });
                } catch {
                    // Usage logging must never block the response path.
                }
                return res.status(200).json(data);
            }
            lastError = { status: upstream.status, body: data };
        } catch (err) {
            lastError = { status: 500, message: err.message };
        }
    }

    const finalStatus = lastError?.status || 500;
    const finalBody = lastError || { error: 'All Gemini models failed' };
    if (finalStatus === 429 && lastError?.retryAfter) {
        res.setHeader('Retry-After', String(lastError.retryAfter));
    }
    return res.status(finalStatus).json(finalBody);
}
