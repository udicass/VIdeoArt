import sharp from 'sharp';

const img = 'C:/Users/User/AppData/Roaming/Code/User/workspaceStorage/vscode-chat-images/image-1788425468816.png';
const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

// Box: x 2030-3969, y 2779-3299
const bx0 = 2030, bx1 = 3969, by0 = 2779, by1 = 3299;
// Find text glyph rows: near-white/light pixels within box interior
const rows = [];
for (let y = by0 + 5; y < by1 - 5; y++) {
  let cnt = 0;
  for (let x = bx0 + 30; x < bx1 - 30; x++) {
    const i = (y * W + x) * C;
    if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) cnt++;
  }
  rows.push({ y, cnt });
}
// merge contiguous rows with cnt>2
let segs = [], cur = null;
for (const { y, cnt } of rows) {
  if (cnt > 3) {
    if (!cur) cur = { s: y, e: y, max: cnt };
    else { cur.e = y; if (cnt > cur.max) cur.max = cnt; }
  } else if (cur) { segs.push(cur); cur = null; }
}
if (cur) segs.push(cur);
console.log('text row bands (y ranges) inside box:');
for (const s of segs) console.log('  y', s.s, '-', s.e, 'height', s.e - s.s + 1);

// Analyze top text band baseline area: print glyph heights
// Also find x-extent of text for each band
for (const s of segs) {
  let minX = Infinity, maxX = -1;
  for (let y = s.s; y <= s.e; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = (y * W + x) * C;
      if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  console.log('  band y', s.s, '-', s.e, 'x', minX, '-', maxX, 'w', maxX - minX + 1);
}
