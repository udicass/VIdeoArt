import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_SELECTED_FACES_CUDA_V55_V47_25SEC';
const bridgeDir = path.join(outputDir, '_bridges');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_SELECTED_FACES_CUDA_V55_V47_25SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_SELECTED_FACES_CUDA_V55_V47_25SEC_TEST_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_selected_faces_v55_v47_25sec_test_temp.mp4');
const fps = 10;
const selectedFaces = [1, 2, 3, 6];
const schedule = [
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 1 })),
  { type: 'bridge', from: 1, to: 2 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 2 })),
  { type: 'bridge', from: 2, to: 3 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 3 })),
  { type: 'bridge', from: 3, to: 6 },
  ...Array.from({ length: 4 }, () => ({ type: 'face', face: 6 }))
];
const basePrompt = timeline.base_prompt.replace(
  'same exact recurring woman from the V6 input frame, exact face identity and proportions',
  'faithfully preserve the exact selected V6 face identity, hair, crop, lighting, lip color, and proportions from this input image'
);
const negativePrompt = timeline.negative_prompt
  .replace('red lipstick, bright lipstick, colored lips, red mouth, painted lips, ', '');

function sourcePath(face) {
  return path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
}

for (const face of selectedFaces) {
  if (!existsSync(sourcePath(face))) throw new Error(`Missing selected V6 face: ${sourcePath(face)}`);
}
if (timeline.beats.length < 25 || schedule.length !== 25) throw new Error('V55 requires 25 V47 beats and scheduled frames');
mkdirSync(outputDir, { recursive: true });
mkdirSync(bridgeDir, { recursive: true });

function initFor(item) {
  if (item.type === 'face') return sourcePath(item.face);
  const outPath = path.join(bridgeDir, `bridge_${item.from}_${item.to}.png`);
  if (!existsSync(outPath)) {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', sourcePath(item.from), '-i', sourcePath(item.to),
      '-filter_complex', "[0:v][1:v]blend=all_expr='A*0.5+B*0.5'", '-frames:v', '1', outPath
    ], { stdio: 'inherit' });
  }
  return outPath;
}

async function generate(index, item) {
  const transitionPrompt = item.type === 'bridge'
    ? 'controlled gentle transition between these two selected V6 faces, coherent facial anatomy, no new identity'
    : 'subtle new micro-variation of this selected V6 face, same person and same photographic language';
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(initFor(item)).toString('base64')],
      prompt: [basePrompt, timeline.beats[index], transitionPrompt].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: item.type === 'bridge' ? 0.10 : 0.16,
      steps: timeline.generation.steps,
      cfg_scale: timeline.generation.cfg_scale,
      width: timeline.generation.width,
      height: timeline.generation.height,
      sampler_name: timeline.generation.sampler,
      scheduler: timeline.generation.scheduler,
      restore_faces: false,
      seed: 713378000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < schedule.length; index += 1) {
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generate(index, schedule[index]));
  process.stdout.write(`generated V55 V47 selected-face variation ${index + 1}/25\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=2,fps=${fps},format=yuv420p`,
  '-t', '25', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ selectedFaces, beatsUsed: 25, keyframes: 25, output, contact, durationSec: 25 }, null, 2));