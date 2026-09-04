import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const anchor512 = path.join(previewRoot, '_antelop2_anchor_512.png');
const anchor = path.join(previewRoot, '_antelop2_anchor_1024.png');
const mask = path.join(previewRoot, '_antelop2_headmask_sdxl_1024.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\seated_ANTELOP2_HEAD_TURN_SDXL_V122_TEST';
const generated = path.join(outputDir, 'generated_front_target_1024.png');
const composited = path.join(outputDir, 'front_target_composited_1024.png');
const output = path.join(outputDir, 'front_target_composited_512.png');
const contact = path.join(previewRoot, 'seated_ANTELOP2_HEAD_TURN_SDXL_V122_target_test.jpg');
mkdirSync(outputDir, { recursive: true });

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', anchor512, '-vf', 'scale=1024:1024:flags=lanczos', '-frames:v', '1', anchor], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=1024x1024',
  '-vf', 'drawbox=x=405:y=30:w=510:h=420:color=white:t=fill,gblur=sigma=14,format=gray',
  '-frames:v', '1', mask
], { stdio: 'inherit' });

const getOptions = () => fetch('http://127.0.0.1:7860/sdapi/v1/options').then((response) => response.json());
const setCheckpoint = async (checkpoint) => {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/options', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sd_model_checkpoint: checkpoint })
  });
  if (!response.ok) throw new Error(`Checkpoint switch failed: ${response.status} ${await response.text()}`);
};

const originalCheckpoint = (await getOptions()).sd_model_checkpoint;
try {
  await setCheckpoint('sd_xl_base_1.0.safetensors [31e35c80fc]');
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(anchor).toString('base64')],
      mask: readFileSync(mask).toString('base64'),
      inpainting_fill: 0,
      inpaint_full_res: true,
      inpaint_full_res_padding: 48,
      inpainting_mask_invert: 0,
      mask_blur: 14,
      prompt: [
        'single antelope head turning naturally from side profile toward frontal view',
        'head faces viewer directly, direct eye contact, two clear natural eyes',
        'long narrow antelope muzzle, two long symmetric backward-curving horns',
        'neck attaches naturally to unchanged seated body',
        'cool cyan silver-gray monochrome CRT phosphor dot texture',
        'cyan rim glow, empty dark teal background, experimental video art'
      ].join(', '),
      negative_prompt: [
        'camera, lens, machine, machinery, device, equipment, vehicle, robot, object',
        'rear view, back of head, faceless, missing face, missing eyes',
        'extra head, extra eyes, extra horns, missing horns, malformed anatomy',
        'rectangle, frame, border, collage, room, building, human, text, watermark',
        'changed body, moved body, zoom, crop, pan'
      ].join(', '),
      denoising_strength: 0.58,
      steps: 40,
      cfg_scale: 6,
      width: 1024,
      height: 1024,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 12281977,
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
} finally {
  await setCheckpoint(originalCheckpoint);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', anchor, '-i', generated, '-i', mask,
  '-filter_complex', '[0:v][1:v][2:v]maskedmerge', '-frames:v', '1', composited
], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', composited, '-vf', 'scale=512:512:flags=lanczos', '-frames:v', '1', output], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', anchor512, '-i', output,
  '-filter_complex', '[0:v][1:v]hstack=inputs=2,scale=1024:512:flags=neighbor',
  '-frames:v', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ originalCheckpoint, generated, output, contact }, null, 2));
