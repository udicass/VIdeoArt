import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const anchor4 = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_GETUP_KEYFRAMES_V143_20SEC\\keyframe_0004.png';
const maskFile = path.join(previewRoot, 'CARA_getup_mask.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_GETUP_KEYFRAMES_V146_FIXED';

const poses = {
  5: 'the same figure now on its knees, chest raised high, front legs straight and braced, head lifted',
  6: 'the same figure sitting upright on its haunches, front legs straight down, head held high',
  7: 'the same figure sitting tall, back fully vertical, front legs straight, looking forward',
  8: 'the same figure beginning to stand, hind legs extending, body leaning forward and rising'
};
const style = 'gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background, high quality';
const negative = 'camera, lens, machine, machinery, device, equipment, robot, vehicle, object, text, watermark, illustration style change, different figure, extra limbs, extra head, missing limbs, malformed anatomy, zoom, crop, pan, camera movement, background movement, warm colors, red, orange, green';

if (!existsSync(anchor4) || !existsSync(maskFile)) throw new Error('missing anchor4 or mask');
mkdirSync(outputDir, { recursive: true });
const initB64 = readFileSync(anchor4).toString('base64');
const maskB64 = readFileSync(maskFile).toString('base64');

for (const index of [5, 6, 7, 8]) {
  const output = path.join(outputDir, `keyframe_${String(index).padStart(4, '0')}.png`);
  if (existsSync(output)) {
    process.stdout.write(`skip keyframe ${index}\n`);
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
      prompt: `${poses[index]}, ${style}`,
      negative_prompt: negative,
      denoising_strength: 0.62,
      steps: 32,
      cfg_scale: 6,
      width: 576,
      height: 1024,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 14600000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`keyframe ${index}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`keyframe ${index} no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated fixed keyframe ${index}\n`);
}

console.log(JSON.stringify({ fixed: [5, 6, 7, 8], outputDir }, null, 2));
