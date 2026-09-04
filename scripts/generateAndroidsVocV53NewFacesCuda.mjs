import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_NEW_FACES_CUDA_V53_25SEC';
const portraitDir = path.join(outputDir, '_new_portraits');
const bridgeDir = path.join(outputDir, '_bridges');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_NEW_FACES_CUDA_V53_25SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_NEW_FACES_CUDA_V53_25SEC_TEST_contact.jpg');
const portraitContact = path.join(previewRoot, 'androids_dream_VOC_V6_NEW_FACES_CUDA_V53_portraits_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_new_faces_v53_25sec_test_temp.mp4');
const fps = 10;
const characters = [
  'adult woman with a narrow oval face, a short dark bob, soft natural brows, and a quiet direct gaze',
  'adult woman with high cheekbones, swept-back dark hair, a longer face, and reflective level eyes',
  'adult woman with a broader face, shoulder-length dark hair, a relaxed jaw, and restrained empathy',
  'adult woman with a square face, straight dark hair tucked behind the ears, and a calm observant gaze'
];
const beats = [
  'calm direct gaze', 'a soft breath', 'quiet attention', 'subtle eyes soften', 'steady stillness', 'faint inward focus',
  'a subtle change of identity begins', 'returning to direct eye contact', 'quiet reflective attention', 'natural human stillness',
  'a trace of concern', 'calm composure', 'soft blue light over the cheek', 'a gentle transition begins', 'steady direct gaze',
  'slight fatigue without drama', 'quiet empathy', 'soft contemplative attention', 'a restrained moment of recognition', 'returning to calm',
  'cool light shifts gently', 'direct gaze remains steady', 'quiet poised presence', 'a final soft breath', 'stillness before the next sequence'
];
const schedule = [
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 1 })),
  { type: 'bridge', from: 1, to: 2, mix: 0.50 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 2 })),
  { type: 'bridge', from: 2, to: 3, mix: 0.50 },
  ...Array.from({ length: 6 }, () => ({ type: 'face', face: 3 })),
  { type: 'bridge', from: 3, to: 4, mix: 0.50 },
  ...Array.from({ length: 4 }, () => ({ type: 'face', face: 4 }))
];
const portraitPrompt = [
  'one distinct adult human woman, natural human skin, clearly human',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level, looking into camera',
  'forehead, hairline, chin, neck, and both shoulders fully visible, fixed camera distance, clean dark background',
  'muted cool blue CRT tint, restrained photographic realism, silver gelatin portrait, subtle clean scanline texture',
  'Do Androids Dream of Electric Sheep, empathy and uncertain identity, coherent facial anatomy'
].join(', ');
const negativePrompt = [
  'duplicate face, second face, two people, extra eyes, male, child, red lipstick, painted lips, mask, porcelain, android, plastic skin',
  'face paint, cracked skin, heavy texture, sketch, line art, cartoon, profile, three-quarter view, tilted head, looking away',
  'high angle, low angle, zoomed in, cropped forehead, cropped chin, cropped shoulders, bright background, scenery, text, watermark, logo, distorted face, melted face, image noise'
].join(', ');

if (schedule.length !== 25 || beats.length !== 25) throw new Error('V53 requires 25 scheduled frames and beats');
mkdirSync(outputDir, { recursive: true });
mkdirSync(portraitDir, { recursive: true });
mkdirSync(bridgeDir, { recursive: true });

function portraitPath(face) {
  return path.join(portraitDir, `new_face_${String(face).padStart(4, '0')}.png`);
}

async function createPortrait(index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: [portraitPrompt, characters[index]].join(', '),
      negative_prompt: negativePrompt,
      steps: 30,
      cfg_scale: 6.5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713374000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`New portrait ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`New portrait ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < characters.length; index += 1) {
  const outPath = portraitPath(index + 1);
  if (existsSync(outPath)) continue;
  writeFileSync(outPath, await createPortrait(index));
  process.stdout.write(`generated new V53 portrait ${index + 1}/${characters.length}\n`);
}

function bridgePath(item) {
  return path.join(bridgeDir, `bridge_${item.from}_${item.to}.png`);
}

function initFor(item) {
  if (item.type === 'face') return portraitPath(item.face);
  const outPath = bridgePath(item);
  if (!existsSync(outPath)) {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', portraitPath(item.from), '-i', portraitPath(item.to),
      '-filter_complex', "[0:v][1:v]blend=all_expr='A*0.5+B*0.5'", '-frames:v', '1', outPath
    ], { stdio: 'inherit' });
  }
  return outPath;
}

async function animate(index, item) {
  const transition = item.type === 'bridge';
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(initFor(item)).toString('base64')],
      prompt: [portraitPrompt, transition ? 'gentle coherent transition between two V6-compatible identities' : 'faithfully preserve this new portrait identity', beats[index]].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: transition ? 0.08 : 0.10,
      steps: 24,
      cfg_scale: 5.5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713375000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Animation frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Animation frame ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < schedule.length; index += 1) {
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await animate(index, schedule[index]));
  process.stdout.write(`generated V53 frame ${index + 1}/25\n`);
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

console.log(JSON.stringify({ newPortraits: characters.length, keyframes: schedule.length, output, contact, portraitContact, durationSec: 25 }, null, 2));