import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10';
const continuationDir = path.join(workRoot, 'androids_dream_VOC_V6_CONTINUATION_CUDA_V46_ANCHORED_keyframes');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_CONTINUATION_CUDA_V46_ANCHORED_1080_20SEC.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_CONTINUATION_CUDA_V46_ANCHORED_20SEC_contact.jpg');
const frameCount = 20;
const width = 512;
const height = 512;
const fps = 10;

const anchor = path.join(sourceDir, 'single_figure_0012.png');
if (!existsSync(anchor)) throw new Error(`Missing V6 anchor: ${anchor}`);
mkdirSync(continuationDir, { recursive: true });

const beats = [
  'same calm direct gaze, blue CRT portrait continuing naturally',
  'a subtle exhale, eyes soften slightly',
  'quiet attention shifts almost imperceptibly',
  'a faint trace of concern appears in the eyes',
  'returning to steady direct eye contact',
  'slight fatigue, face stays relaxed and human',
  'gentle blue light falls more strongly across the cheek',
  'quiet uncertainty, no pose change',
  'a near-invisible head adjustment while facing forward',
  'soft sadness beneath a still expression',
  'the gaze steadies, one recurring woman',
  'a calm blink-like change, face remains aligned',
  'cool blue CRT light, subtle analog afterimage only',
  'restrained empathy in the eyes',
  'a soft breath, shoulders stay level',
  'returning to a neutral direct gaze',
  'quiet resolve, exact same person',
  'slight light variation across the face, no scene change',
  'stillness and continuity, clean blue portrait',
  'final poised direct gaze, ready to join the next V6 segment'
];

const negativePrompt = [
  'different person, different face, male, duplicate face, second face, two people, extra eyes',
  'red lipstick, bright lipstick, colored lips, red mouth, painted lips',
  'mask, porcelain, android, plastic skin, face paint, cracked skin, heavy texture, sketch, line art, cartoon',
  'hood, hat, scarf, glasses, hands, objects, scenery, architecture, busy background',
  'profile, three-quarter view, tilted head, looking away, cropped forehead, cropped chin, black bar, border',
  'text, watermark, logo, subtitles, open mouth, teeth, smile, distorted face, melted face, image noise'
].join(', ');

function promptFor(index) {
  return [
    'one adult human woman, natural human skin, dark shoulder-length hair, clearly human',
    'same exact recurring woman from the V6 input frame, exact face identity and proportions',
    'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level, fixed camera and crop',
    'forehead, hairline, chin, neck, and both shoulders fully visible, clean dark background',
    'muted cool blue CRT tint, restrained photographic realism, silver gelatin portrait, subtle scanline texture',
    'Do Androids Dream of Electric Sheep, empathy and uncertain identity',
    beats[index],
    'sharp coherent facial anatomy, smooth skin, no style change, no scene change'
  ].join(', ');
}

async function generateFrame(initPath, index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(initPath).toString('base64')],
      prompt: promptFor(index),
      negative_prompt: negativePrompt,
      denoising_strength: index % 6 === 0 ? 0.16 : 0.12,
      steps: 24,
      cfg_scale: 5.5,
      width,
      height,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713368000 + index,
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

for (let index = 0; index < frameCount; index += 1) {
  const outPath = path.join(continuationDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  // Always begin from the clean V6 ending, never a previously diffused frame.
  // This prevents feedback artifacts from accumulating across the continuation.
  writeFileSync(outPath, await generateFrame(anchor, index));
  process.stdout.write(`generated V6 continuation ${index + 1}/${frameCount}\n`);
}

const temp = path.join(previewRoot, '_voc_v6_continuation_v46_temp.mp4');
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(continuationDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=2,fps=${fps},format=yuv420p`,
  '-t', '20', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=384:-1,tile=5x4", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ anchor, continuationDir, output, contact, frameCount, fps, durationSec: 20 }, null, 2));
