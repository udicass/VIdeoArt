import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, 'outputs', 'deforum-merged-previews', 'antelop.png');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\seated_ANTELOP_CRT_CUDA_V118_20SEC';
const normalized = path.join(outputDir, 'anchor_centered_0512.png');
const contact = path.join(root, 'outputs', 'deforum-merged-previews', 'seated_ANTELOP_CRT_CUDA_V118_20SEC_source_contact.jpg');
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : 12;

if (!existsSync(source)) throw new Error(`Missing source: ${source}`);
mkdirSync(outputDir, { recursive: true });

if (!existsSync(normalized)) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', source,
    '-vf', 'scale=404:512:flags=lanczos,pad=512:512:54:0:color=0x173f42',
    '-frames:v', '1', normalized
  ], { stdio: 'inherit' });
}

const prompt = [
  'the exact same single seated female antelope from the input image',
  'identical curled seated body silhouette, identical long legs extending left',
  'identical upright neck, head and two horns, fixed centered composition',
  'cool cyan silver-gray monochrome, bright cyan rim glow',
  'dark teal CRT screen background, fine regular phosphor dot grid',
  'experimental video art still, subtle analog texture evolution',
  'preserve exact anatomy, pose, scale, framing and identity'
].join(', ');
const negativePrompt = [
  'standing, walking, running, different pose, changed silhouette, changed anatomy',
  'extra legs, missing legs, extra horns, missing horns, extra head, duplicate animal',
  'cropped body, off center, zoomed in, landscape, ground, objects, text, watermark',
  'warm colors, red, orange, brown, green, photorealistic background',
  'smooth digital art, clean vector, cartoon, white background'
].join(', ');
const initImage = readFileSync(normalized).toString('base64');

for (let index = 0; index < Math.min(limit, 12); index += 1) {
  const output = path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(output)) {
    process.stdout.write(`skip ${path.basename(output)}\n`);
    continue;
  }

  if (index === 0) {
    writeFileSync(output, readFileSync(normalized));
    process.stdout.write(`preserved exact source as ${path.basename(output)}\n`);
    continue;
  }

  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [initImage],
      prompt: `${prompt}, texture phase ${index} of 11`,
      negative_prompt: negativePrompt,
      denoising_strength: 0.2,
      steps: 30,
      cfg_scale: 5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 8182400 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V118 frame ${index + 1}/12\n`);
}

const generatedCount = Math.min(limit, 12);
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1',
  '-i', path.join(outputDir, 'single_figure_%04d.png'),
  '-vf', `scale=256:256:flags=lanczos,tile=${Math.min(generatedCount, 4)}x${Math.ceil(generatedCount / 4)}`,
  '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ source, outputDir, generatedCount, contact, mode: 'low-denoise CUDA img2img' }, null, 2));