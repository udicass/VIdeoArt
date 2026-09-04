import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const anchor = path.join(previewRoot, '_antelop2_anchor_512.png');
const guide = path.join(previewRoot, '_antelop2_v113_frontal_guide.png');
const mask = path.join(previewRoot, '_antelop2_headmask_v120.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\seated_ANTELOP2_HEAD_TURN_CUDA_V121_TEST';
const generated = path.join(outputDir, 'generated_refined_target.png');
const output = path.join(outputDir, 'front_target_composited.png');
const contact = path.join(previewRoot, 'seated_ANTELOP2_HEAD_TURN_CUDA_V121_target_test.jpg');
mkdirSync(outputDir, { recursive: true });

const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    init_images: [readFileSync(guide).toString('base64')],
    mask: readFileSync(mask).toString('base64'),
    inpainting_fill: 0,
    inpaint_full_res: true,
    inpaint_full_res_padding: 24,
    inpainting_mask_invert: 0,
    mask_blur: 10,
    prompt: [
      'single coherent frontal antelope head connected naturally to the existing neck',
      'direct eye contact with viewer, symmetric face, two eyes',
      'two long symmetric curved horns rising upward, natural ears',
      'empty dark teal background, cyan rim glow',
      'cool cyan silver-gray monochrome CRT phosphor dot texture',
      'same experimental video art style as unchanged body'
    ].join(', '),
    negative_prompt: [
      'camera, lens, machine, machinery, device, equipment, vehicle, robot, object',
      'rectangle, frame, border, collage, pasted image, landscape, room, building',
      'extra head, extra eyes, extra horns, missing horns, malformed face, rear view',
      'human, person, text, watermark, changed body, moved body, zoom, crop'
    ].join(', '),
    denoising_strength: 0.38,
    steps: 42,
    cfg_scale: 7,
    width: 512,
    height: 512,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    restore_faces: false,
    seed: 12181977,
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

console.log(JSON.stringify({ anchor, guide, generated, output, contact }, null, 2));
