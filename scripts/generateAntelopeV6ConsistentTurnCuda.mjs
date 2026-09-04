import { existsSync, mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_BLUEGRAY_TURN_CUDA_V113_20SEC';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_CONSISTENT_TURN_CUDA_V114_20SEC';
const contact = path.join(previewRoot, 'antelope_V6_CONSISTENT_TURN_CUDA_V114_20SEC_contact.jpg');
const angles = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 82, 90];
const anchor = path.join(sourceDir, 'single_figure_0001.png');

const prompt = [
  'one single identical adult antelope, same exact animal identity and anatomy as the input image',
  'elegant slender gazelle-like antelope, same ears, same muzzle, same neck, same horn structure',
  'head and upper neck wildlife studio portrait, fixed scale and centered composition',
  'deep pure black background, clean empty negative space, no landscape, no ground, no objects',
  'muted cool blue-gray monochrome V6 photographic tint, silver gelatin realism',
  'calm alert expression, sharp eye, coherent anatomy, smooth minimal image',
  'rotate the same animal gradually toward the right, preserve identical identity and proportions'
].join(', ');
const negativePrompt = [
  'different animal, new animal, multiple animals, two animals, duplicate animal',
  'horse, deer, goat, cow, dog, gazelle species change, fantasy creature',
  'extra head, extra legs, extra horns, broken horns, malformed horns, warped muzzle',
  'landscape, savanna, grass, trees, rocks, ground, water, scenery, objects, props',
  'gray background, textured background, photo collage, split screen, border',
  'brown, orange, red, green, saturated color, warm color',
  'fur texture, grain, noise, grid, CRT, scanlines, moire, mesh',
  'human, person, text, watermark, logo, distorted anatomy, cropped head'
].join(', ');

if (!existsSync(anchor)) throw new Error(`Missing anchor: ${anchor}`);
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < angles.length; index += 1) {
  const outPath = path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const angle = angles[index];
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(anchor).toString('base64')],
      prompt: [prompt, `right rotation angle ${angle} degrees`, angle === 90 ? 'exact right side profile, visible one eye and one horn plane' : 'frontal to three-quarter turn'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.48,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 721501000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Consistent antelope frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Consistent antelope frame ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V114 frame ${index + 1}/${angles.length} angle=${angle}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'single_figure_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=4x3', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFrames: angles.length, angles, anchor, outputDir, contact, mode: 'single-anchor-img2img' }, null, 2));
