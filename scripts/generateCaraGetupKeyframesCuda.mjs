import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const initImage = path.join(previewRoot, '_cara_scene_init_576x1024.png');
const maskFile = path.join(previewRoot, 'CARA_getup_mask.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_GETUP_KEYFRAMES_V143_20SEC';

const prompts = [
  'the same figure from the init image lying down in place',
  'the same figure lying down, beginning to lift its head slightly',
  'the same figure lying down, lifting its head and neck',
  'the same figure raising its head and shoulders',
  'the same figure beginning to push its torso up',
  'the same figure rising onto its forelegs, torso coming off the ground',
  'the same figure halfway up, torso raised off the ground',
  'the same figure sitting upright, back straight',
  'the same figure sitting up, straightening its back',
  'the same figure rising, back straightening, rear lifting',
  'the same figure standing on all legs, stretching upward',
  'the same figure standing upright, fully risen',
  'the same figure standing upright, head held high',
  'the same figure standing upright, full body'
];
const style = 'gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background, high quality';
const negative = 'camera, lens, machine, machinery, device, equipment, robot, vehicle, object, text, watermark, illustration style change, different figure, extra limbs, extra head, missing limbs, malformed anatomy, zoom, crop, pan, camera movement, background movement, warm colors, red, orange, green';

if (!existsSync(initImage) || !existsSync(maskFile)) throw new Error('missing init or mask');
mkdirSync(outputDir, { recursive: true });
const initB64 = readFileSync(initImage).toString('base64');
const maskB64 = readFileSync(maskFile).toString('base64');

for (let index = 0; index < prompts.length; index += 1) {
  const output = path.join(outputDir, `keyframe_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(output)) {
    process.stdout.write(`skip keyframe ${index + 1}\n`);
    continue;
  }
  if (index === 0) {
    writeFileSync(output, readFileSync(initImage));
    process.stdout.write(`keyframe 1 = init\n`);
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
      prompt: `${prompts[index]}, ${style}`,
      negative_prompt: negative,
      denoising_strength: 0.55,
      steps: 30,
      cfg_scale: 6,
      width: 576,
      height: 1024,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 14381900 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`keyframe ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`keyframe ${index + 1} no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated keyframe ${index + 1}/${prompts.length}\n`);
}

console.log(JSON.stringify({ keyframes: prompts.length, outputDir }, null, 2));
