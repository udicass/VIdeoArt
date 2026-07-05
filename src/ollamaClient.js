/**
 * ollamaClient.js — Local Ollama LLM Client
 *
 * Calls a locally running Ollama server at http://localhost:11434
 * Used by Brain mode to generate dynamic AI responses.
 *
 * Requires: ollama serve (runs automatically after install)
 * Model: gemma4:e2b (pull with: ollama pull gemma4:e2b)
 */

const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_RELAY_BASE = 'https://localhost:11435'; // HTTPS relay — see services/ollama-relay/
const OLLAMA_TIMEOUT_MS = 30_000;
const OLLAMA_AVAILABILITY_TIMEOUT_MS = 2_500;

/**
 * HTTP (localhost:5173) → direct Ollama at :11434 — no mixed content issue.
 * HTTPS (Vercel) → local HTTPS relay at :11435 — avoids mixed content block.
 * Run  services/ollama-relay/setup.ps1  once, then  start.ps1  before using the live site.
 */
function getEffectiveOllamaBase() {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
        return OLLAMA_RELAY_BASE;
    }
    return OLLAMA_BASE;
}

const localLlmStatus = {
    backend: 'ollama',
    backendLabel: 'Ollama',
    availableBackends: ['ollama'],
    transport: 'local',
    routeLabel: 'Local app',
    localOnly: false,
    ready: null,
    configured: true,
    model: '',
    modelPath: '',
    lastError: '',
    checkedAt: 0,
    httpsBlocked: false
};

function updateLocalLlmStatus(patch = {}) {
    const backend = 'ollama';
    const backendLabel = 'Ollama';
    const transport = patch.transport ?? 'local';
    const routeLabel = patch.routeLabel ?? 'Local app';
    Object.assign(localLlmStatus, patch, {
        backend,
        backendLabel,
        availableBackends: ['ollama'],
        transport,
        routeLabel,
        localOnly: false
    });
}

export function isOllamaHttpsBlocked() {
    return Boolean(localLlmStatus.httpsBlocked);
}

export function getLocalLlmBackend() {
    return 'ollama';
}

export function getAvailableLocalLlmBackends() {
    return ['ollama'];
}

export function setLocalLlmBackend(_nextBackend = 'ollama') {
    updateLocalLlmStatus({ checkedAt: Date.now() });
    return 'ollama';
}

export function getLocalLlmBackendLabel() {
    return 'Ollama';
}

export function getLocalLlmStatus() {
    updateLocalLlmStatus();
    return {
        ...localLlmStatus,
        availableBackends: [...localLlmStatus.availableBackends]
    };
}

async function queryOllamaStatus(model = 'gemma3:4b', timeoutMs = OLLAMA_AVAILABILITY_TIMEOUT_MS) {
    const controller = new AbortController();
    const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
        ? Number(timeoutMs)
        : OLLAMA_AVAILABILITY_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
        const r = await fetch(`${getEffectiveOllamaBase()}/api/tags`, { signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) {
            return {
                ready: false,
                configured: true,
                // Preserve the last known-good model name rather than echoing the failed probe target
                model: String(localLlmStatus.model || model || '').trim(),
                modelPath: '',
                lastError: `Ollama ${r.status}`,
                checkedAt: Date.now()
            };
        }
        const { models = [] } = await r.json();
        const modelNormalized = String(model || '').trim().toLowerCase();
        const modelBase = modelNormalized.split(':')[0];
        // Exact match first (e.g. "gemma4:e2b" must not resolve to "gemma4:latest").
        // Fall back to prefix+colon match (e.g. "gemma4" matches "gemma4:latest").
        const matched = models.find((entry) => String(entry?.name || '').toLowerCase() === modelNormalized)
            || models.find((entry) => String(entry?.name || '').toLowerCase().startsWith(modelBase + ':'))
            || models.find((entry) => String(entry?.name || '').toLowerCase().startsWith(modelBase));
        return {
            ready: Boolean(matched),
            configured: true,
            model: String(matched?.name || model || '').trim(),
            modelPath: '',
            lastError: matched ? '' : `Model ${model} not found in Ollama.`,
            checkedAt: Date.now()
        };
    } catch (error) {
        clearTimeout(timer);
        const onHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
        const isRelayError = onHttps && error?.name !== 'AbortError';
        if (isRelayError) {
            // Log setup hint to console — don't surface it to regular users in the UI
            console.info('[Ollama] Local AI unavailable. Run services/ollama-relay/setup.ps1 once, then start.ps1 to enable.');
        }
        return {
            ready: false,
            configured: true,
            // Preserve the last known-good model name rather than echoing the failed probe target
            model: String(localLlmStatus.model || model || '').trim(),
            modelPath: '',
            lastError: error?.name === 'AbortError'
                ? 'Ollama probe timed out.'
                : isRelayError
                    ? 'Local AI offline.'
                    : String(error?.message || 'Ollama unavailable.'),
            checkedAt: Date.now(),
            httpsBlocked: isRelayError
        };
    }
}

export async function refreshLocalLlmStatus(model = 'gemma3:4b', timeoutMs = OLLAMA_AVAILABILITY_TIMEOUT_MS) {
    const nextStatus = await queryOllamaStatus(model, timeoutMs);
    updateLocalLlmStatus(nextStatus);
    return getLocalLlmStatus();
}

function isGptOssModel(model = '') {
    return /^gpt-oss(?::|$)/i.test(String(model || '').trim());
}

function isGemma4Model(model = '') {
    return /^gemma4(?::|$)/i.test(String(model || '').trim());
}

function isBonsaiModel(model = '') {
    return /bonsai/i.test(String(model || '').trim());
}

function isPhiMiniModel(model = '') {
    return /phi4?[-\s]?mini/i.test(String(model || '').trim());
}

function isPhi4Model(model = '') {
    return /^phi4(?::|$)/i.test(String(model || '').trim());
}

function isGemma3LargeModel(model = '') {
    const v = String(model || '').trim().toLowerCase();
    return v.startsWith('gemma3:') && /:(12|27|70)b/.test(v);
}

/**
 * Per-model options tuned for low-latency 1-2 sentence chat replies.
 * Key levers:
 *   num_ctx  — KV cache size; smaller = faster prompt eval & less VRAM
 *   num_predict — max output tokens; capped because responses are always short
 *   repeat_penalty — disabled (1.0) unless needed; saves a scoring pass
 */
function buildModelOptions(model = '') {
    if (isGptOssModel(model)) {
        return { temperature: 0.7, num_predict: 140, num_ctx: 2048, top_p: 0.9, repeat_penalty: 1.1 };
    }
    if (isGemma4Model(model)) {
        // gemma4:latest (8B) has 131K native context. 4096 comfortably fits system prompt +
        // history + DICT snippets while keeping prompt-eval fast. Google recommends
        // temperature:1.0, top_p:0.95, top_k:64 for Gemma 4.
        return { temperature: 1.0, num_predict: 130, num_ctx: 4096, top_p: 0.95, top_k: 64, repeat_penalty: 1.0 };
    }
    if (isBonsaiModel(model)) {
        // bonsai-8b — larger model, keep ctx modest
        return { temperature: 0.8, num_predict: 130, num_ctx: 1024, top_p: 0.9, repeat_penalty: 1.0 };
    }
    if (isPhiMiniModel(model)) {
        // phi4-mini — fast, can afford slightly richer ctx
        return { temperature: 0.8, num_predict: 130, num_ctx: 1024, top_p: 0.9, repeat_penalty: 1.0 };
    }
    if (isPhi4Model(model)) {
        // phi4 full-size — keep context moderate for stable latency.
        return { temperature: 0.8, num_predict: 130, num_ctx: 1024, top_p: 0.9, repeat_penalty: 1.0 };
    }
    if (isGemma3LargeModel(model)) {
        // 12b/27b: cap GPU layers to ~20 of 40 to halve peak GPU utilisation.
        // Slower than full-GPU but acceptable — model is aborted at race timeout anyway.
        return { temperature: 0.85, num_predict: 120, num_ctx: 512, num_gpu: 20, top_p: 0.9, repeat_penalty: 1.05 };
    }
    // gemma3:4b and any unknown model
    return { temperature: 0.85, num_predict: 130, num_ctx: 1024, top_p: 0.9, repeat_penalty: 1.0 };
}

function buildOllamaChatRequest(systemPrompt, userMessage, model = 'gemma3:4b', history = []) {
    const useGptOssProfile = isGptOssModel(model);
    const effectiveSystemPrompt = useGptOssProfile
        ? `${systemPrompt}\n- Return only the final spoken reply in assistant content. Keep any reasoning internal and minimal.`
        : systemPrompt;
    const effectiveUserMessage = useGptOssProfile
        ? `${userMessage}\n\nFinal spoken reply only.`
        : userMessage;

    return {
        model,
        stream: false,
        // Explicitly disable thinking for all models — Gemma 4 has a thinking mode that adds
        // significant latency if left on; gpt-oss has its own think:false for the same reason.
        think: false,
        // Keep model resident for 1 minute after last use (Ollama default is 5m).
        // Shorter window means faster RAM/VRAM release when the user switches models.
        keep_alive: '1m',
        options: buildModelOptions(model),
        messages: [
            { role: 'system', content: effectiveSystemPrompt },
            ...history,
            { role: 'user', content: effectiveUserMessage }
        ]
    };
}

/**
 * Check if Ollama is running and has the requested model available.
 * @param {string} model - Model name e.g. 'gemma4:latest'
 * @returns {Promise<boolean>}
 */
export async function isOllamaAvailable(model = 'gemma3:4b', timeoutMs = OLLAMA_AVAILABILITY_TIMEOUT_MS) {
    const status = await refreshLocalLlmStatus(model, timeoutMs);
    return Boolean(status?.ready);
}

/**
 * Immediately unload a model from Ollama memory.
 * Call this when switching away from a heavy model so its RAM/VRAM is released
 * without waiting for the default 5-minute keepalive to expire.
 * @param {string} model - Model name to unload (e.g. 'gemma3:12b')
 */
export async function releaseOllamaModel(model = '') {
    const m = String(model || '').trim();
    if (!m || getLocalLlmBackend() !== 'ollama') return;
    try {
        // keep_alive:0 tells Ollama to evict the model from memory immediately.
        // prompt:"" is required — Ollama returns 400 without it.
        await fetch(`${getEffectiveOllamaBase()}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: m, prompt: '', keep_alive: 0 })
        });
    } catch {
        // Fire-and-forget — ignore errors if Ollama isn't running
    }
}

/**
 * Call the local Ollama model for a chat completion.
 *
 * @param {string} systemPrompt  - The persona/system context
 * @param {string} userMessage   - What the user said
 * @param {string} model         - Ollama model name (default: gemma3:4b)
 * @param {Array<{role:string,content:string}>} history - Prior turns [{role:'user',content:'...'},{role:'assistant',content:'...'},...]
 * @param {number} timeoutMs     - Request timeout override in milliseconds
 * @returns {Promise<string|null>} - The model's reply, or null on error
 */
export async function callOllama(systemPrompt, userMessage, model = 'gemma3:4b', history = [], timeoutMs = OLLAMA_TIMEOUT_MS, externalSignal = null) {
    const controller = new AbortController();
    const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs))
        ? Number(timeoutMs)
        : OLLAMA_TIMEOUT_MS;
    const timer = effectiveTimeoutMs > 0
        ? setTimeout(() => controller.abort(), effectiveTimeoutMs)
        : null;

    // Forward external abort (e.g. when a race is lost) to our internal controller
    let externalAborted = false;
    const onExternalAbort = () => {
        externalAborted = true;
        controller.abort();
    };
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
        const response = await fetch(`${getEffectiveOllamaBase()}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(buildOllamaChatRequest(systemPrompt, userMessage, model, history))
        });

        if (timer) clearTimeout(timer);

        if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);
            throw new Error(`Ollama ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const raw = String(data?.message?.content || '').trim();
        updateLocalLlmStatus({ ready: true, configured: true, model: String(model || '').trim(), modelPath: '', lastError: '', checkedAt: Date.now() });
        return raw ? sanitizeOllamaReply(raw) : null;
    } catch (err) {
        if (timer) clearTimeout(timer);
        if (err.name === 'AbortError') {
            // Distinguish an intentional external cancellation from a real timeout so callers
            // don't mark Ollama as unavailable just because a race was lost.
            const message = externalAborted
                ? 'Ollama inference cancelled'
                : 'Ollama timeout — model took too long to respond';
            updateLocalLlmStatus({ ready: false, lastError: message, checkedAt: Date.now() });
            throw new Error(message);
        }
        updateLocalLlmStatus({ ready: false, lastError: String(err?.message || err || ''), checkedAt: Date.now() });
        throw err;
    } finally {
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}

/**
 * Strip model chain-of-thought leakage and meta-commentary from Ollama replies.
 * phi4 sometimes outputs bracketed stage directions, "Note:", "As [persona]:",
 * asterisk actions, or OOC reasoning before the actual in-character response.
 *
 * @param {string} text - Raw model output
 * @returns {string} - Cleaned in-character reply
 */
export function sanitizeOllamaReply(text) {
    let s = text;

    // Remove leading bracketed meta-commentary: [The user is asking...] or [Note: ...]
    s = s.replace(/^\[[^\]]{0,300}\]\s*/s, '');

    // Remove any remaining bracketed stage directions anywhere in the text
    s = s.replace(/\[[^\]]{0,300}\]/gs, '');

    // Remove asterisk-wrapped actions: *sighs*, *pauses*, *looks at you*
    s = s.replace(/\*[^*]{1,80}\*/g, '');

    // Remove "Note:", "As [name]:", "(OOC:" style prefixes
    s = s.replace(/^(Note:|As \w[^:]{0,40}:|\(OOC.*?\))\s*/i, '');

    // Remove lines that are purely meta (start with lowercase "the user" or "i need to")
    s = s.split('\n')
        .filter(line => !/^(the user |i need to |i should |i will |note:|as [a-z])/i.test(line.trim()))
        .join('\n');

    // Remove leading quoted creative titles: "Title: Subtitle" followed by more content
    s = s.replace(/^"[^"\n]{8,100}"\s*/s, '');
    // Strip orphaned opening quote left after title removal
    if (/^"+[A-Z]/.test(s)) s = s.replace(/^"+/, '');

    // Collapse multiple blank lines, trim
    s = s.replace(/\n{3,}/g, '\n\n').trim();

    // Trim dangling fragments or incomplete last sentences from num_predict cutoffs.
    // Runs on all responses — even ones that end in a period — to catch fragment endings.
    {
        const FRAG_RE = /\b(?:each|what|which|that|who|through|onto|into|upon|a|an|the|of|where|when|with|from|and|or|but|in|on|at|by|for|its|this|their|these|those|such|more|still)$/i;
        // Include semicolons as sentence separators so "clause; fragment." gets split correctly
        const sentenceParts = s.match(/[^.!?;]+[.!?;]+/g);
        if (sentenceParts && sentenceParts.length >= 2) {
            const last = sentenceParts[sentenceParts.length - 1].trim();
            const bare = last.replace(/[.!?;]+$/, '').trim();
            const wordCount = bare.split(/\s+/).filter(Boolean).length;
            // Fragment: too short, or ends with a dangling function word / relative pronoun
            const isFragment = wordCount <= 3 || FRAG_RE.test(bare);
            if (isFragment) {
                s = sentenceParts.slice(0, -1).join('').trim();
                // Normalize trailing semicolon to period
                s = s.replace(/;$/, '.');
            }
        } else if (!/[.!?]\s*$/.test(s)) {
            // Single sentence with no trailing punctuation — find last sentence boundary
            const re = /[.!?](?=\s)/g;
            let lastIdx = -1, m;
            while ((m = re.exec(s)) !== null) lastIdx = m.index;
            if (lastIdx > 10) s = s.slice(0, lastIdx + 1).trim();
        } else if (sentenceParts?.length === 1) {
            // Single sentence ending with period — check if last word is a dangling function word
            const bare = s.replace(/[.!?]+$/, '').trim();
            const lastWord = bare.split(/\s+/).pop() || '';
            // Also catch possessive truncation: "...Gibson's cyberspace, Cronenberg's"
            const endsWithPossessive = /\b\w+['']\w*$/.test(bare) && /,/.test(bare);
            if (FRAG_RE.test(lastWord) || endsWithPossessive) {
                // Find the last comma that has at least 6 words before it (clean clause boundary)
                const commas = [...bare.matchAll(/,/g)];
                let cleanCut = -1;
                for (let i = commas.length - 1; i >= 0; i--) {
                    const idx = commas[i].index;
                    if (bare.slice(0, idx).trim().split(/\s+/).length >= 6) {
                        cleanCut = idx;
                        break;
                    }
                }
                // Secondary: try colon as cut point (e.g. "X: list1, list2, truncated")
                if (cleanCut < 0) {
                    const colonIdx = bare.indexOf(':');
                    if (colonIdx > 0 && bare.slice(0, colonIdx).split(/\s+/).length >= 4) {
                        cleanCut = colonIdx;
                    }
                }
                // Tertiary: try em-dash as clause boundary (e.g. "intro—clause—fragment")
                if (cleanCut < 0) {
                    const emdashes = [...bare.matchAll(/\u2014/g)];
                    for (let i = emdashes.length - 1; i >= 0; i--) {
                        const idx = emdashes[i].index;
                        if (bare.slice(0, idx).trim().split(/\s+/).length >= 4) {
                            cleanCut = idx;
                            break;
                        }
                    }
                }
                if (cleanCut > 0) s = bare.slice(0, cleanCut).trim() + '.';
            }
        }
    }

    return s || text; // fall back to original if everything was stripped
}

/**
 * Send a lightweight ping to keep the model loaded in Ollama's GPU/RAM.
 * Call every 4-5 minutes so the model isn't evicted between user interactions.
 * @param {string} model - Model name e.g. 'gemma4:latest'
 * @returns {Promise<boolean>} true if model is still alive
 */
export async function keepAliveOllama(model = 'gemma3:4b') {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(`${getEffectiveOllamaBase()}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                model,
                stream: false,
                keep_alive: '10m',
                messages: [{ role: 'user', content: '.' }],
                options: { num_predict: 1 }
            })
        });
        clearTimeout(timer);
        return r.ok;
    } catch {
        return false;
    }
}
