const { Redis } = require('@upstash/redis');

const TOTAL_KEY = 'gemini_usage_total_v1';
const DAY_PREFIX = 'gemini_usage_day_v1_';

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

function dayKey(date = new Date()) {
    const iso = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
    return `${DAY_PREFIX}${iso}`;
}

function toSafeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeUsageMetadata(meta = {}) {
    const promptTokens = toSafeNumber(meta?.promptTokenCount ?? meta?.inputTokenCount ?? meta?.promptTokens, 0);
    const outputTokens = toSafeNumber(meta?.candidatesTokenCount ?? meta?.outputTokenCount ?? meta?.outputTokens, 0);
    const totalTokens = toSafeNumber(meta?.totalTokenCount, promptTokens + outputTokens);
    return {
        promptTokens,
        outputTokens,
        totalTokens,
        cachedTokens: toSafeNumber(meta?.cachedContentTokenCount, 0)
    };
}

function mergeSummary(current = {}, usage = {}, meta = {}) {
    return {
        requests: toSafeNumber(current.requests, 0) + 1,
        promptTokens: toSafeNumber(current.promptTokens, 0) + toSafeNumber(usage.promptTokens, 0),
        outputTokens: toSafeNumber(current.outputTokens, 0) + toSafeNumber(usage.outputTokens, 0),
        totalTokens: toSafeNumber(current.totalTokens, 0) + toSafeNumber(usage.totalTokens, 0),
        cachedTokens: toSafeNumber(current.cachedTokens, 0) + toSafeNumber(usage.cachedTokens, 0),
        lastModel: String(meta.model || current.lastModel || '').trim(),
        lastApiVersion: String(meta.apiVersion || current.lastApiVersion || '').trim(),
        updatedAt: Date.now()
    };
}

async function recordUsage({ usageMetadata, model, apiVersion }) {
    const kv = getKvClient();
    if (!kv) return { ok: false, reason: 'kv-not-configured' };

    const usage = normalizeUsageMetadata(usageMetadata);
    const totalCurrent = await kv.get(TOTAL_KEY).catch(() => null);
    const dayCurrent = await kv.get(dayKey()).catch(() => null);

    await kv.set(TOTAL_KEY, mergeSummary(totalCurrent || {}, usage, { model, apiVersion }));
    await kv.set(dayKey(), mergeSummary(dayCurrent || {}, usage, { model, apiVersion }));

    return { ok: true };
}

async function getUsageSummary() {
    const kv = getKvClient();
    if (!kv) {
        return { ready: false, total: null, today: null };
    }

    const [total, today] = await Promise.all([
        kv.get(TOTAL_KEY).catch(() => null),
        kv.get(dayKey()).catch(() => null)
    ]);

    return {
        ready: true,
        total: total || mergeSummary(),
        today: today || mergeSummary()
    };
}

module.exports = {
    isKvReady,
    recordUsage,
    getUsageSummary,
    normalizeUsageMetadata
};
