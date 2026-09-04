import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const plan = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_SOURCE_FACES_V49_120SEC.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const fps = 10;
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_PACED_FACES_CUDA_V50_30SEC_TEST_keyframes';
const bridgeDir = path.join(outputDir, '_bridges');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_PACED_FACES_CUDA_V50_30SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_PACED_FACES_CUDA_V50_30SEC_TEST_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_paced_faces_v50_30sec_test_temp.mp4');
const source = (number) => path.join(plan.source_face_directory, `single_figure_${String(number).padStart(4, '0')}.png`);
const schedule = [
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 1 })),
  { type: 'bridge', from: 1, to: 2, mix: 0.34 },
  { type: 'bridge', from: 1, to: 2, mix: 0.66 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 2 })),
  { type: 'bridge', from: 2, to: 3, mix: 0.34 },
  { type: 'bridge', from: 2, to: 3, mix: 0.66 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 3 })),
  { type: 'bridge', from: 3, to: 4, mix: 0.34 },
  { type: 'bridge', from: 3, to: 4, mix: 0.66 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 4 }))
];
const negativePrompt = [
  timeline.negative_prompt
    .replace('red lipstick, bright lipstick, colored lips, red mouth, painted lips, ', ''),
  plan.negative_prompt_additions
].join(', ');

for (const faceNumber of [1, 2, 3, 4]) {
  if (!existsSync(source(faceNumber))) throw new Error(`Missing approved V6 source face: ${source(faceNumber)}`);
}
if (schedule.length !== 30) throw new Error(`Paced V50 schedule must have 30 anchors, got ${schedule.length}`);
mkdirSync(outputDir, { recursive: true });
mkdirSync(bridgeDir, { recursive: true });

function bridgePath(item) {
  return path.join(bridgeDir, `bridge_${item.from}_${item.to}_${String(Math.round(item.mix * 100)).padStart(2, '0')}.png`);
}

function initFor(item) {
  if (item.type === 'face') return source(item.face);
  const outPath = bridgePath(item);
  if (!existsSync(outPath)) {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', source(item.from), '-i', source(item.to),
      '-filter_complex', `[0:v][1:v]blend=all_expr='A*${1 - item.mix}+B*${item.mix}'`,
      '-frames:v', '1', outPath
    ], { stdio: 'inherit' });
  }
  return outPath;
}

function promptFor(index, item) {
  const sourceInstruction = item.type === 'face'
    ? 'faithfully preserve the exact face identity, lip color, hair, crop, lighting, and expression from this approved V6 input image'
    : 'controlled, gentle transition between the two approved V6 portrait identities in this input image, coherent face anatomy, no abrupt identity swap';
  return [
    plan.base_prompt_override.replace('faithfully preserve the exact face identity, proportions, hair, frontal crop, and V6 blue CRT lighting from this input image', sourceInstruction),
    timeline.beats[index]
  ].join(', ');
}

async function generateFrame(index, item) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(initFor(item)).toString('base64')],
      prompt: promptFor(index, item),
      negative_prompt: negativePrompt,
      denoising_strength: item.type === 'bridge' ? 0.08 : 0.10,
      steps: plan.generation.steps,
      cfg_scale: plan.generation.cfg_scale,
      width: plan.generation.width,
      height: plan.generation.height,
      sampler_name: plan.generation.sampler,
      scheduler: plan.generation.scheduler,
      restore_faces: false,
      seed: 713371000 + index,
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
  const item = schedule[index];
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generateFrame(index, item));
  const label = item.type === 'face' ? `face ${item.face}` : `transition ${item.from}->${item.to}`;
  process.stdout.write(`generated V50 ${index + 1}/30: ${label}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=2,fps=${fps},format=yuv420p`,
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ sourceFaces: [1, 2, 3, 4], keyframes: schedule.length, transitions: 3, output, contact, durationSec: 30 }, null, 2));