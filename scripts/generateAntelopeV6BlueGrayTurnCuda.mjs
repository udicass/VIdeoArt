import { existsSync, mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_BLUEGRAY_TURN_CUDA_V113_20SEC';
const contact = path.join(previewRoot, 'antelope_V6_BLUEGRAY_TURN_CUDA_V113_20SEC_contact.jpg');
const angles = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 82, 90];

const basePrompt = [
  'one solitary adult antelope, elegant slender gazelle-like antelope, full head and upper neck visible',
  'single animal, fixed camera and fixed scale, centered in frame, clean minimal studio portrait',
  'deep black background, empty negative space, no landscape, no plants, no objects',
  'muted cool blue-gray V6 photographic tint, silver gelatin realism, restrained cinematic lighting',
  'clean smooth coat, sharp coherent anatomy, symmetrical horns, clear eye, calm alert expression',
  'minimal composition, no texture, no grain, no decorative elements'
].join(', ');
const negativePrompt = [
  'two animals, multiple animals, duplicate animal, extra head, extra legs, extra horns, broken horns',
  'deformed anatomy, warped muzzle, malformed face, distorted eye, missing eye, blurred animal',
  'horse, deer antlers, cow, goat, dog, fantasy creature, monster, human, person',
  'landscape, savanna, trees, grass, rocks, mountains, furniture, props, scenery',
  'text, watermark, logo, border, collage, split screen, contact sheet',
  'brown warm color, orange, red, green, saturated colors, colorful background',
  'fur texture, heavy texture, grain, noise, grid, CRT grid, scanlines, moire, mesh',
  'cropped horns, cropped muzzle, cropped head, cropped neck, profile beyond 90 degrees, rear view'
].join(', ');

function outputPath(index) {
  return path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < angles.length; index += 1) {
  const outPath = outputPath(index);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const angle = angles[index];
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: [basePrompt, `three-quarter rotation toward right, approximately ${angle} degrees from frontal view`, angle === 90 ? 'exact clean right side profile, 90 degree turn' : 'same antelope identity and same fixed composition'].join(', '),
      negative_prompt: negativePrompt,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 721001000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Antelope frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Antelope frame ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V113 antelope frame ${index + 1}/${angles.length} angle=${angle}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'single_figure_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=4x3', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFrames: angles.length, angles, outputDir, contact, style: 'V6-blue-gray-black-minimal' }, null, 2));
