const { getUsageSummary } = require('./_usageStore');
const { enforceRateLimit, guardApiRequest } = require('./_security');

const USAGE_WINDOW_MS = 10 * 60 * 1000;
const USAGE_RATE_LIMIT = 60;

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, {
        methods: ['GET', 'OPTIONS']
    });
    if (security.handled) return;

    const rateLimit = await enforceRateLimit(req, res, {
        key: 'usage',
        limit: USAGE_RATE_LIMIT,
        windowMs: USAGE_WINDOW_MS,
        message: 'Usage endpoint rate limit reached. Please retry in a moment.'
    });
    if (rateLimit.handled) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const summary = await getUsageSummary();
        return res.status(200).json(summary);
    } catch (error) {
        return res.status(500).json({
            error: error?.message || 'Failed to load usage summary.'
        });
    }
};
