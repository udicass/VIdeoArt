const { enforceRateLimit, ensureJsonBodySize, guardApiRequest } = require('./_security');
const { createRequestId, getAccessToken, getApiBaseUrl, getEnvironment } = require('../lib/paypal');

const BODY_MAX_BYTES = 4 * 1024;

module.exports = async function handler(req, res) {
  const security = guardApiRequest(req, res, { methods: ['POST', 'OPTIONS'] });
  if (security.handled) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const bodySize = ensureJsonBodySize(res, req.body, BODY_MAX_BYTES, 'PayPal capture request');
  if (bodySize.handled) return;
  const rateLimit = await enforceRateLimit(req, res, {
    key: 'paypal-capture',
    limit: 30,
    windowMs: 10 * 60 * 1000
  });
  if (rateLimit.handled) return;

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return res.status(503).json({ error: 'Payments are not configured.' });

  const orderId = String(req.body?.orderId || '').trim();
  if (!/^[A-Z0-9]{8,32}$/i.test(orderId)) return res.status(400).json({ error: 'Invalid order ID.' });

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, getEnvironment());
    const captureResponse = await fetch(`${getApiBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'PayPal-Request-Id': createRequestId(`capture-${orderId}`)
      },
      body: '{}',
      signal: AbortSignal.timeout(25_000)
    });
    const order = await captureResponse.json();
    if (!captureResponse.ok || order.status !== 'COMPLETED') {
      throw new Error(`PayPal capture returned ${captureResponse.status}.`);
    }

    const purchaseUnit = order.purchase_units?.[0] || {};
    const shipping = purchaseUnit.shipping || {};
    const address = shipping.address || {};
    const payer = order.payer || {};
    return res.status(200).json({
      status: 'COMPLETED',
      orderId: order.id,
      email: payer.email_address || '',
      payerName: shipping.name?.full_name || '',
      shipping: {
        fullName: shipping.name?.full_name || '',
        line1: address.address_line_1 || '',
        line2: address.address_line_2 || '',
        city: address.admin_area_2 || '',
        state: address.admin_area_1 || '',
        postalCode: address.postal_code || '',
        countryCode: address.country_code || ''
      }
    });
  } catch (error) {
    console.error('PayPal capture failed:', error);
    return res.status(502).json({ error: 'Could not complete payment.' });
  }
};
