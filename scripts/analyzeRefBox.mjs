import sharp from 'sharp';

const img = 'C:/Users/User/AppData/Roaming/Code/User/workspaceStorage/vscode-chat-images/image-1788425468816.png';
const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

// Search region for box: teal border color is bright green-dominant
// Box roughly x 2000-4000, y 2750-3250 from eyeballing. Scan wider to be safe.
const x0 = 1800, x1 = 4200, y0 = 2700, y1 = 3300;

function isBorder(r, g, b) {
  // teal #00e5a0 → (0,229,160); borders often rendered brighter ~ (80-180,255,..)
  return g > 120 && g > r * 1.6 && b > 60 && b < 220 && g > b;
}

// Find border pixels
let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
const borderPts = [];
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * C;
    if (isBorder(data[i], data[i + 1], data[i + 2])) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      borderPts.push([x, y]);
    }
  }
}
console.log('border extents x', minX, '-', maxX, ' y', minY, '-', maxY);
console.log('box w', maxX - minX + 1, 'h', maxY - minY + 1);
console.log('center x', Math.round((minX + maxX) / 2), 'of image W', W);

// Check border thickness & radius: sample at left middle border
if (borderPts.length) {
  const midY = Math.round((minY + maxY) / 2);
  // find leftmost border pixel at midY
  let lx = Infinity, rx = -1;
  for (const [x, y] of borderPts) {
    if (Math.abs(y - midY) < 3) {
      if (x < lx) lx = x;
      if (x > rx) rx = x;
    }
  }
  console.log('at midY', midY, 'left border x', lx, 'right border x', rx);
}
