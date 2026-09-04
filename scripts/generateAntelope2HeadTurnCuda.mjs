import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const anchor = path.join(previewRoot, '_antelop2_anchor_512.png');
const mask = path.join(previewRoot, '_antelop2_headmask.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\seated_ANTELOP2_HEAD_TURN_CUDA_V119_20SEC';
const contact = path.join(previewRoot, 'seated_ANTELOP2_HEAD_TURN_CUDA_V119_20SEC_source_contact.jpg');
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : 12;

if (!existsSync(anchor)) throw new Error(`Missing anchor: ${anchor}`);
if (!existsSync(mask)) throw new Error(`Missing mask: ${mask}`);
mkdirSync(outputDir, { recursive: true });

const prompt = [
  'the same single seated antelope from the input image',
  'turn the head and upper neck naturally toward the camera to look directly at the viewer',
  'frontal face, both eyes visible, both horns symmetric',
  'body, legs and lower body remain completely static and unchanged',
  'cool cyan silver-gray monochrome, bright cyan rim glow, dark teal CRT background',
  'fine phosphor dot grid, experimental video art still'
].join(', ');
const negativePrompt = [
  'changed body, moved body, new pose, standing, walking',
  'zoom, crop, pan, tilt, changed framing, changed composition',
  'extra head, missing horns, extra horns, distorted face, multiple animals',
  'warm colors, red, orange, brown, green, text, watermark'
].join(', ');
const initImage = readFileSync(anchor).toString('base64');
const maskImage = readFileSync(mask).toString('base64');

for (let index = 0; index < Math.min(limit, 12); index += 1) {
  const output = path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(output)) {
    process.stdout.write(`skip ${path.basename(output)}\n`);
    continue;
  }

  let generated = anchor;
  if (index > 0) {
    const angle = Math.round(index * 5);
    const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        init_images: [initImage],
        mask: maskImage,
        inpainting_fill: 1,
        inpaint_full_res: true,
        inpaint_full_res_padding: 32,
        inpainting_mask_invert: 0,
        mask_blur: 8,
        prompt: `${prompt}, head turned ${angle} degrees toward camera`,
        negative_prompt: negativePrompt,
        denoising_strength: 0.65,
        steps: 34,
        cfg_scale: 6,
        width: 512,
        height: 512,
        sampler_name: 'DPM++ 2M',
        scheduler: 'Karras',
        restore_faces: false,
        seed: 9207300 + index,
        batch_size: 1,
        n_iter: 1,
        save_images: false
      })
    });
    if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
    const json = await response.json();
    const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
    if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
    const tempGen = path.join(outputDir, `_gen_${String(index + 1).padStart(4, '0')}.png`);
    writeFileSync(tempGen, Buffer.from(encoded, 'base64'));
    generated = tempGen;
  }

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', anchor, '-i', generated, '-i', mask,
    '-filter_complex', '[0:v][1:v][2:v]maskedmerge,format=yuv420p',
    '-frames:v', '1', output
  ], { stdio: 'inherit' });
  process.stdout.write(`composited V119 frame ${index + 1}/12 angle=${index === 0 ? 0 : Math.round(index * 5)}\n`);
}

const generatedCount = Math.min(limit, 12);
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1',
  '-i', path.join(outputDir, 'single_figure_%04d.png'),
  '-vf', `scale=256:256:flags=lanczos,tile=${Math.min(generatedCount, 4)}x${Math.ceil(generatedCount / 4)}`,
  '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ source: 'antelop2.png', mode: 'head-turn inpaint, body static', generatedCount, outputDir, contact }, null, 2));
