import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const SOURCE_DIR = path.resolve(process.cwd(), 'raw_captures');
const OUTPUT_DIR = path.resolve(process.cwd(), 'print_ready');
const BORDER_PIXELS = 200;
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

async function prepareCapture(fileName) {
  const sourcePath = path.join(SOURCE_DIR, fileName);
  const parsed = path.parse(fileName);
  const outputPath = path.join(OUTPUT_DIR, `PRINT_READY_${parsed.name}.png`);

  const result = await sharp(sourcePath)
    .rotate()
    .flatten({ background: '#000000' })
    .extend({
      top: BORDER_PIXELS,
      right: BORDER_PIXELS,
      bottom: BORDER_PIXELS,
      left: BORDER_PIXELS,
      background: '#000000'
    })
    .withMetadata({ density: 300 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  console.log(`${fileName} -> ${path.basename(outputPath)} (${result.width}x${result.height}, 300 DPI)`);
}

async function main() {
  await mkdir(SOURCE_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  const captures = entries
    .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (!captures.length) {
    console.log(`No captures found in ${SOURCE_DIR}`);
    return;
  }

  for (const capture of captures) {
    await prepareCapture(capture);
  }
}

main().catch((error) => {
  console.error('Print preparation failed:', error);
  process.exitCode = 1;
});
