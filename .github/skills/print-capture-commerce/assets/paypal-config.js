const { guardApiRequest } = require('./_security');
const { CURRENCY, getEnvironment } = require('../lib/paypal');

module.exports = async function handler(req, res) {
  const security = guardApiRequest(req, res, { methods: ['GET', 'OPTIONS'] });
  if (security.handled) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  if (!clientId) return res.status(503).json({ error: 'Payments are not configured.' });

  return res.status(200).json({
    clientId,
    environment: getEnvironment(),
    currency: CURRENCY
  });
};
