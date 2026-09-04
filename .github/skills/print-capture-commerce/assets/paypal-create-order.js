const { enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');
const {
  BRAND_NAME,
  CURRENCY,
  createRequestId,
  getAccessToken,
  getApiBaseUrl,
  getCatalogSelection,
  getEnvironment
} = require('../lib/paypal');

const BODY_MAX_BYTES = 4 * 1024;

module.exports = async function handler(req, res) {
  const security = guardApiRequest(req, res, { methods: ['POST', 'OPTIONS'] });
  if (security.handled) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const bodySize = ensureJsonBodySize(res, req.body, BODY_MAX_BYTES, 'PayPal order request');
  if (bodySize.handled) return;
  const rateLimit = await enforceRateLimit(req, res, {
    key: 'paypal-create-order',
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if (rateLimit.handled) return;

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Payments are not configured.' });

  const selection = getCatalogSelection(req.body?.artworkId, req.body?.editionId, req.body?.frame);
  if (!selection) return res.status(400).json({ error: 'Unknown artwork, edition, or frame.' });

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, getEnvironment());
    const orderResponse = await fetch(`${getApiBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': createRequestId('print-order')
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: `${selection.artworkId}|${selection.editionId}|frame:${selection.frame}`,
          description: `${BRAND_NAME}: ${selection.artwork.title} - frame ${selection.frame} - ${selection.edition.label}, signed edition of ${selection.edition.editionSize}`,
          amount: { currency_code: CURRENCY, value: selection.edition.price }
        }],
        application_context: {
          brand_name: BRAND_NAME,
          shipping_preference: 'GET_FROM_FILE',
          user_action: 'PAY_NOW'
        }
      }),
      signal: AbortSignal.timeout(20_000)
    });
    const order = await orderResponse.json();
    if (!orderResponse.ok || !order.id) throw new Error(`PayPal order creation returned ${orderResponse.status}.`);
    return res.status(200).json({ id: order.id });
  } catch (error) {
    console.error('PayPal order creation failed:', error);
    return res.status(502).json({ error: 'Could not create payment order.' });
  }
};
