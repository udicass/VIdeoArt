import sharp from 'sharp';

const img = 'C:/Users/User/AppData/Roaming/Code/User/workspaceStorage/vscode-chat-images/image-1788425468816.png';
const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
console.log('size', W, 'x', H, 'ch', C);

// Bubble likely lower-center. Text white-ish. Find rows containing lots of near-white.
const whiteRows = [];
for (let y = Math.round(H * 0.72); y < H; y++) {
  let cnt = 0;
  for (let x = Math.round(W * 0.2); x < Math.round(W * 0.8); x++) {
    const i = (y * W + x) * C;
    if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) cnt++;
  }
  whiteRows.push({ y, cnt });
}
// The text block: contiguous high-cnt rows
let segments = [];
let cur = null;
for (const { y, cnt } of whiteRows) {
  if (cnt > 80) {
    if (!cur) cur = { start: y, end: y };
    else cur.end = y;
  } else if (cur) {
    segments.push(cur);
    cur = null;
  }
}
if (cur) segments.push(cur);
// Keep segments with reasonable height (<400) → text lines not billboard
const textSegs = segments.filter(s => s.end - s.start > 8 && s.end - s.start < 400);
console.log('segments below 72%:', JSON.stringify(textSegs.slice(-6)));

// For each text segment find x extent
function xExtent(y0, y1) {
  let minX = Infinity, maxX = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = Math.round(W * 0.1); x < Math.round(W * 0.9); x++) {
      const i = (y * W + x) * C;
      if (data[i] > 205 && data[i + 1] > 205 && data[i + 2] > 205) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return { minX, maxX };
}
for (const s of textSegs.slice(-4)) {
  const e = xExtent(s.start, s.end);
  console.log('seg y', s.start, '-', s.end, 'x', e.minX, '-', e.maxX, 'w', e.maxX - e.minX);
}
