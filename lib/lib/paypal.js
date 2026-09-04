const { randomUUID } = require('node:crypto');

const CURRENCY = 'USD';
const BRAND_NAME = 'Synthetic Desires';

const EDITIONS = Object.freeze({
  small: Object.freeze({ label: '16 x 12 in', editionSize: 10, price: '350.00' }),
  medium: Object.freeze({ label: '24 x 18 in', editionSize: 5, price: '850.00' })
});

const ARTWORKS = Object.freeze(Object.fromEntries(
  [1, 2, 3, 4, 5].map((number) => [
    `SD${number}`,
    Object.freeze({ title: `Synthetic Desires ${number}`, frameCount: 5 })
  ])
));

function getEnvironment() {
  return process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
}

function getApiBaseUrl(environment = getEnvironment()) {
  return environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function getCatalogSelection(artworkId, editionId, rawFrame) {
  const normalizedArtworkId = String(artworkId || '');
  const normalizedEditionId = String(editionId || '');
  const artwork = ARTWORKS[normalizedArtworkId];
  const edition = EDITIONS[normalizedEditionId];
  const frame = Number(rawFrame);
  if (!artwork || !edition || !Number.isInteger(frame) || frame < 1 || frame > artwork.frameCount) return null;
  return { artworkId: normalizedArtworkId, editionId: normalizedEditionId, artwork, edition, frame };
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
  const result = await response.json();
  if (!result.access_token) throw new Error('PayPal authentication returned no access token.');
  return result.access_token;
}

module.exports = {
  ARTWORKS,
  BRAND_NAME,
  CURRENCY,
  EDITIONS,
  createOrderRequestId: () => `print-order-${randomUUID()}`,
  getAccessToken,
  getApiBaseUrl,
  getCatalogSelection,
  getEnvironment
};
