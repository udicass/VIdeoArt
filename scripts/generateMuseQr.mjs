import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, 'public', 'qr');

function normalizeBaseUrl(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return 'https://gesture-3d.vercel.app';
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
}

const baseUrl = normalizeBaseUrl(process.env.MUSE_BASE_URL);

const targets = [
  { name: 'muse-card', label: 'Muse Card', url: `${baseUrl}/?muse=1` },
  { name: 'muse-card-cloud', label: 'Muse Card (Cloud)', url: `${baseUrl}/?muse=1&mode=cloud` },
  { name: 'muse-card-brain', label: 'Muse Card (Brain)', url: `${baseUrl}/?muse=1&mode=brain` }
];

await fs.mkdir(outDir, { recursive: true });

for (const item of targets) {
  const svg = await QRCode.toString(item.url, {
    type: 'svg',
    width: 720,
    margin: 2,
    color: {
      dark: '#111827',
      light: '#FFFFFF'
    }
  });

  const png = await QRCode.toBuffer(item.url, {
    type: 'png',
    width: 720,
    margin: 2,
    color: {
      dark: '#111827',
      light: '#FFFFFF'
    }
  });

  await fs.writeFile(path.join(outDir, `${item.name}.svg`), svg, 'utf8');
  await fs.writeFile(path.join(outDir, `${item.name}.png`), png);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  items: targets.map((item) => ({
    ...item,
    svg: `/qr/${item.name}.svg`,
    png: `/qr/${item.name}.png`
  }))
};

await fs.writeFile(path.join(outDir, 'muse-qr-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log('Muse QR assets generated in public/qr');
for (const item of manifest.items) {
  console.log(`- ${item.label}: ${item.url}`);
}
