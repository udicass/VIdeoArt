const { getClientIp, guardApiRequest } = require('./_security');

function readHeader(req, names = []) {
    for (const name of names) {
        const value = String(req?.headers?.[name] || '').trim();
        if (value) return value;
    }
    return '';
}

module.exports = async function handler(req, res) {
    const security = guardApiRequest(req, res, {
        methods: ['GET', 'OPTIONS']
    });
    if (security.handled) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    return res.status(200).json({
        ipAddress: getClientIp(req),
        city: readHeader(req, ['x-vercel-ip-city']),
        region: readHeader(req, ['x-vercel-ip-country-region']),
        country: readHeader(req, ['x-vercel-ip-country-name', 'x-vercel-ip-country']),
        countryCode: readHeader(req, ['x-vercel-ip-country']),
        timezone: readHeader(req, ['x-vercel-ip-timezone']),
        latitude: readHeader(req, ['x-vercel-ip-latitude']),
        longitude: readHeader(req, ['x-vercel-ip-longitude']),
        userAgent: String(req?.headers?.['user-agent'] || '').trim(),
        provider: readHeader(req, ['x-vercel-id']) ? 'vercel' : 'local'
    });
};