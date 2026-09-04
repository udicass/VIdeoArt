import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const anchor14 = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_GETUP_KEYFRAMES_V143_20SEC\\keyframe_0014.png';
const maskFile = path.join(previewRoot, 'CARA_getup_mask.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_SCENES_V145';

const scenes = [
  'the same standing figure beginning to walk forward',
  'the same figure walking forward, mid stride',
  'the same figure turning its head to look back',
  'the same figure walking, seen from the side',
  'the same figure stopping and looking directly at the viewer',
  'the same figure beginning to sit down',
  'the same figure seated on the ground',
  'the same figure lying down on the ground',
  'the same figure resting, lying stretched out',
  'the same figure asleep, eyes closed, lying down'
];
const style = 'gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background, high quality';
const negative = 'camera, lens, machine, machinery, device, equipment, robot, vehicle, object, text, watermark, illustration style change, different figure, extra limbs, extra head, missing limbs, malformed anatomy, zoom, crop, pan, camera movement, background movement, warm colors, red, orange, green';

if (!existsSync(anchor14) || !existsSync(maskFile)) throw new Error('missing anchor14 or mask');
mkdirSync(outputDir, { recursive: true });
const initB64 = readFileSync(anchor14).toString('base64');
const maskB64 = readFileSync(maskFile).toString('base64');

for (let index = 0; index < scenes.length; index += 1) {
  const output = path.join(outputDir, `keyframe_${String(index + 15).padStart(4, '0')}.png`);
  if (existsSync(output)) {
    process.stdout.write(`skip keyframe ${index + 15}\n`);
    continue;
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [initB64],
      mask: maskB64,
      inpainting_fill: 1,
      inpaint_full_res: true,
      inpaint_full_res_padding: 32,
      inpainting_mask_invert: 0,
      mask_blur: 10,
      prompt: `${scenes[index]}, ${style}`,
      negative_prompt: negative,
      denoising_strength: 0.5,
      steps: 30,
      cfg_scale: 6,
      width: 576,
      height: 1024,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 14582000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`keyframe ${index + 15}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`keyframe ${index + 15} no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated keyframe ${index + 15}/${scenes.length + 14}\n`);
}

console.log(JSON.stringify({ newScenes: scenes.length, outputDir }, null, 2));
