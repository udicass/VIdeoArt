const { randomUUID } = require('node:crypto');

const CURRENCY = 'USD';
const BRAND_NAME = 'Synthetic Desires';

// Replace these placeholders before enabling checkout.
const EDITIONS = Object.freeze({
  small: Object.freeze({ label: '16 x 12 in', editionSize: 10, price: '350.00' }),
  medium: Object.freeze({ label: '24 x 18 in', editionSize: 5, price: '850.00' })
});

const ARTWORKS = Object.freeze({
  SD3: Object.freeze({ title: 'Synthetic Desire 3', frameCount: 5 }),
  SD4: Object.freeze({ title: 'Synthetic Desire 4', frameCount: 5 })
});

function getEnvironment() {
  return process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
}

function getApiBaseUrl(environment = getEnvironment()) {
  return environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function getCatalogSelection(artworkId, editionId, rawFrame) {
  const artwork = ARTWORKS[String(artworkId || '')];
  const edition = EDITIONS[String(editionId || '')];
  const frame = Number(rawFrame);
  if (!artwork || !edition) return null;
  if (!Number.isInteger(frame) || frame < 1 || frame > artwork.frameCount) return null;
  return { artworkId: String(artworkId), editionId: String(editionId), artwork, edition, frame };
}

async function getAccessToken(clientId, clientSecret, environment = getEnvironment()) {
  const response = await fetch(`${getApiBaseUrl(environment)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`PayPal authentication returned ${response.status}.`);
  const data = await response.json();
  if (!data.access_token) throw new Error('PayPal authentication returned no access token.');
  return data.access_token;
}

function createRequestId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

module.exports = {
  ARTWORKS,
  BRAND_NAME,
  CURRENCY,
  EDITIONS,
  createRequestId,
  getAccessToken,
  getApiBaseUrl,
  getCatalogSelection,
  getEnvironment
};
