import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_CLEAN_ANCHORS_SDXL_CUDA_V117';
const contact = path.join(previewRoot, 'antelope_V6_CLEAN_ANCHORS_SDXL_CUDA_V117_contact.jpg');
mkdirSync(outputDir, { recursive: true });

const common = [
  'one solitary adult male blackbuck antelope, identical animal identity and proportions',
  'two long symmetrical spiral horns, both complete horns fully visible and uncropped',
  'head and upper neck only, no torso, no legs, fixed close portrait scale',
  'head centered at the same coordinates, neck centered, fixed camera and crop',
  'deep pure black seamless studio background, clean empty negative space',
  'bright pale blue-gray face and neck, muted cool blue monochrome V6 color grade',
  'high contrast silver gelatin wildlife portrait, clean minimal photographic realism',
  'sharp coherent eye, muzzle, ears and horns, smooth clean image'
].join(', ');
const negative = [
  'full body, torso, legs, hooves, landscape, savanna, grass, trees, rocks, ground, horizon',
  'multiple animals, duplicate animal, second head, extra horns, broken horns, missing horn',
  'deer, goat, cow, horse, dog, fantasy creature, different species',
  'cropped horns, cropped ears, cropped muzzle, malformed muzzle, warped anatomy',
  'gray background, white background, textured background, scenery, objects, props',
  'brown, orange, red, green, warm color, saturated color',
  'grain, noise, fur noise, grid, scanlines, moire, text, watermark, logo, border'
].join(', ');
const views = [
  ['front.png', 'exact symmetrical frontal view, looking directly into camera, both eyes equally visible, muzzle centered, both ears level'],
  ['profile.png', 'exact right side profile view, head rotated precisely 90 degrees to the right, one eye visible, muzzle pointing horizontally right, horns seen in right profile plane']
];

for (const [name, view] of views) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: `${common}, ${view}`,
      negative_prompt: negative,
      steps: 36,
      cfg_scale: 7,
      width: 768,
      height: 768,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 723116000,
      batch_size: 1,
      n_iter: 1,
      save_images: false,
      override_settings: { sd_model_checkpoint: 'sd_xl_base_1.0.safetensors' },
      override_settings_restore_afterwards: true
    })
  });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`${name}: no image returned`);
  writeFileSync(path.join(outputDir, name), Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated ${name}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', path.join(outputDir, 'front.png'), '-i', path.join(outputDir, 'profile.png'),
  '-filter_complex', '[0:v]scale=512:512[a];[1:v]scale=512:512[b];[a][b]hstack=inputs=2',
  '-frames:v', '1', contact
], { stdio: 'inherit' });
console.log(JSON.stringify({ outputDir, contact, seed: 723116000, model: 'sd_xl_base_1.0' }, null, 2));
