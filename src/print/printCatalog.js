export const PRINT_EDITIONS = Object.freeze({
  small: Object.freeze({ label: '16 x 12 in / 40.6 x 30.5 cm', price: '$350', edition: 'Edition of 10' }),
  medium: Object.freeze({ label: '24 x 18 in / 61 x 45.7 cm', price: '$850', edition: 'Edition of 5' })
});

const ARTWORKS = [1, 2, 3, 4, 5].map((number) => {
  const id = `SD${number}`;
  return Object.freeze({
    id,
    movie: `Synthetic_Desires_${number}.mp4`,
    title: `Synthetic Desires ${number}`,
    frameCount: 5,
    poster: number === 3 || number === 4 ? `/login-media/sd${number}-poster.webp` : ''
  });
});

export const PRINT_ARTWORKS = Object.freeze(Object.fromEntries(ARTWORKS.map((artwork) => [artwork.id, artwork])));

export function resolvePrintArtwork(movieName = '') {
  const match = String(movieName).match(/synthetic[_\s-]*desires[_\s-]*(\d)/i);
  return match ? PRINT_ARTWORKS[`SD${match[1]}`] || null : null;
}
