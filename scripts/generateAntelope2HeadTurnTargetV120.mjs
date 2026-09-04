import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const anchor = path.join(previewRoot, '_antelop2_anchor_512.png');
const mask = path.join(previewRoot, '_antelop2_headmask_v120.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\seated_ANTELOP2_HEAD_TURN_CUDA_V120_TEST';
const generated = path.join(outputDir, 'generated_front_target.png');
const output = path.join(outputDir, 'front_target_composited.png');
const contact = path.join(previewRoot, 'seated_ANTELOP2_HEAD_TURN_CUDA_V120_target_test.jpg');

if (!existsSync(anchor)) throw new Error(`Missing anchor: ${anchor}`);
mkdirSync(outputDir, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=512x512',
  '-vf', 'drawbox=x=205:y=18:w=250:h=205:color=white:t=fill,gblur=sigma=7,format=gray',
  '-frames:v', '1', mask
], { stdio: 'inherit' });

const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    init_images: [readFileSync(anchor).toString('base64')],
    mask: readFileSync(mask).toString('base64'),
    inpainting_fill: 0,
    inpaint_full_res: true,
    inpaint_full_res_padding: 24,
    inpainting_mask_invert: 0,
    mask_blur: 7,
    prompt: [
      'same exact antelope head and horns as input',
      'head gently rotated to frontal view',
      'animal makes direct eye contact with viewer',
      'both natural eyes visible, symmetric muzzle, two unchanged horns',
      'neck connects naturally to the unchanged seated body',
      'cool cyan silver-gray monochrome CRT phosphor texture',
      'empty dark teal background behind head'
    ].join(', '),
    negative_prompt: [
      'camera, photographic camera, video camera, lens, machine, machinery, device, equipment',
      'vehicle, robot, mechanical parts, box, building, room, furniture, object behind head',
      'human, person, text, watermark, collage',
      'extra head, extra eyes, extra horns, missing horns, malformed face, distorted anatomy',
      'changed body, moved body, zoom, crop, pan, changed composition'
    ].join(', '),
    denoising_strength: 0.46,
    steps: 40,
    cfg_scale: 7,
    width: 512,
    height: 512,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    restore_faces: false,
    seed: 12081977,
    batch_size: 1,
    n_iter: 1,
    save_images: false
  })
});
if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
const json = await response.json();
const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
if (!encoded) throw new Error('Forge returned no image');
writeFileSync(generated, Buffer.from(encoded, 'base64'));

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', anchor, '-i', generated, '-i', mask,
  '-filter_complex', '[0:v][1:v][2:v]maskedmerge', '-frames:v', '1', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', anchor, '-i', output,
  '-filter_complex', '[0:v][1:v]hstack=inputs=2,scale=1024:512:flags=neighbor',
  '-frames:v', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ anchor, mask, generated, output, contact }, null, 2));
