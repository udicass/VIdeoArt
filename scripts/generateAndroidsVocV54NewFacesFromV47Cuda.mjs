import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timelinePath = path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json');
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_NEW_FACES_CUDA_V54_V47_25SEC';
const portraitDir = path.join(outputDir, '_new_portraits');
const bridgeDir = path.join(outputDir, '_bridges');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_NEW_FACES_CUDA_V54_V47_25SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_NEW_FACES_CUDA_V54_V47_25SEC_TEST_contact.jpg');
const portraitContact = path.join(previewRoot, 'androids_dream_VOC_V6_NEW_FACES_CUDA_V54_V47_portraits_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_new_faces_v54_v47_25sec_test_temp.mp4');
const fps = 10;
const characters = [
  'new distinct adult woman, narrow oval face, short dark bob, soft natural brows',
  'new distinct adult woman, high cheekbones, swept-back dark hair, long calm face',
  'new distinct adult woman, broad cheekbones, shoulder-length dark hair, relaxed jaw',
  'new distinct adult woman, square face, straight dark hair tucked behind both ears'
];
const schedule = [
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 1 })),
  { type: 'bridge', from: 1, to: 2 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 2 })),
  { type: 'bridge', from: 2, to: 3 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 3 })),
  { type: 'bridge', from: 3, to: 4 },
  ...Array.from({ length: 4 }, () => ({ type: 'face', face: 4 }))
];
const basePrompt = timeline.base_prompt
  .replace('one adult human woman', 'one new distinct adult human woman')
  .replace('same exact recurring woman from the V6 input frame, exact face identity and proportions', 'a coherent new identity with natural face proportions');

if (timeline.beats.length < 25 || schedule.length !== 25) throw new Error('V54 requires the first 25 V47 beats and 25 schedule entries');
mkdirSync(outputDir, { recursive: true });
mkdirSync(portraitDir, { recursive: true });
mkdirSync(bridgeDir, { recursive: true });

function portraitPath(face) {
  return path.join(portraitDir, `new_face_${String(face).padStart(4, '0')}.png`);
}

async function invoke(endpoint, payload, label) {
  const response = await fetch(`http://127.0.0.1:7860/sdapi/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${label}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`${label} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < characters.length; index += 1) {
  const outPath = portraitPath(index + 1);
  if (existsSync(outPath)) continue;
  const image = await invoke('txt2img', {
    prompt: [basePrompt, characters[index], 'clean centered V6 portrait reference image'].join(', '),
    negative_prompt: timeline.negative_prompt,
    steps: 30,
    cfg_scale: 6.5,
    width: 512,
    height: 512,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    restore_faces: false,
    seed: 713376000 + index,
    batch_size: 1,
    n_iter: 1,
    save_images: false
  }, `Portrait ${index + 1}`);
  writeFileSync(outPath, image);
  process.stdout.write(`generated V54 V47 portrait ${index + 1}/4\n`);
}

function initFor(item) {
  if (item.type === 'face') return portraitPath(item.face);
  const outPath = path.join(bridgeDir, `bridge_${item.from}_${item.to}.png`);
  if (!existsSync(outPath)) {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', portraitPath(item.from), '-i', portraitPath(item.to),
      '-filter_complex', "[0:v][1:v]blend=all_expr='A*0.5+B*0.5'", '-frames:v', '1', outPath
    ], { stdio: 'inherit' });
  }
  return outPath;
}

for (let index = 0; index < schedule.length; index += 1) {
  const item = schedule[index];
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const transitionPrompt = item.type === 'bridge'
    ? 'controlled gentle transition between two new V6-compatible portrait identities, coherent facial anatomy'
    : 'faithfully preserve the new portrait identity in this input image';
  const image = await invoke('img2img', {
    init_images: [readFileSync(initFor(item)).toString('base64')],
    prompt: [basePrompt, timeline.beats[index], transitionPrompt].join(', '),
    negative_prompt: timeline.negative_prompt,
    denoising_strength: item.type === 'bridge' ? 0.08 : 0.10,
    steps: timeline.generation.steps,
    cfg_scale: timeline.generation.cfg_scale,
    width: timeline.generation.width,
    height: timeline.generation.height,
    sampler_name: timeline.generation.sampler,
    scheduler: timeline.generation.scheduler,
    restore_faces: false,
    seed: 713377000 + index,
    batch_size: 1,
    n_iter: 1,
    save_images: false
  }, `Frame ${index + 1}`);
  writeFileSync(outPath, image);
  process.stdout.write(`generated V54 V47 frame ${index + 1}/25\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(portraitDir, 'new_face_%04d.png'),
  '-vf', 'scale=512:512:flags=lanczos,tile=4x1', '-frames:v', '1', '-update', '1', portraitContact
], { stdio: 'inherit' });
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

console.log(JSON.stringify({ timelinePath, beatsUsed: 25, newPortraits: 4, keyframes: 25, output, contact, portraitContact, durationSec: 25 }, null, 2));