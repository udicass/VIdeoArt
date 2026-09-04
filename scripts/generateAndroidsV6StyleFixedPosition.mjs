import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-08';
const frameCount = 12;
const width = 512;
const height = 512;

const tracks = [
  {
    name: 'VOC',
    seed: 713068000,
    frameDir: path.join(workRoot, 'androids_dream_VOC_V6_STYLE_FIXED_POSITION_V20_frames'),
    subject: 'one adult human woman, natural human skin, dark hair, clearly human, weary bounty hunter',
    detail: 'silver gelatin portrait, vulnerable human emotion, muted ash-gray tones, restrained photographic realism'
  },
  {
    name: 'DEFORUM',
    seed: 713069000,
    frameDir: path.join(workRoot, 'androids_dream_DEFORUM_V6_STYLE_FIXED_POSITION_V20_frames'),
    subject: 'one female android replicant, smooth synthetic skin, clean bald head, clearly artificial',
    detail: 'faint circuitry under translucent skin, cold cyan electronic glow, analog Deforum afterimage, precise photographic realism'
  }
];

const expressions = [
  'neutral direct gaze',
  'subtle concern in the eyes',
  'quiet fatigue',
  'restrained uncertainty',
  'faint empathy and sadness',
  'neutral direct gaze returning'
];

const negativePrompt = [
  'text', 'letters', 'subtitles', 'logo', 'watermark',
  'two people', 'multiple people', 'duplicate person', 'duplicate face', 'second face',
  'cropped forehead', 'cropped chin', 'cut off head', 'cut off face',
  'off-center face', 'asymmetrical face', 'tilted head', 'profile', 'three-quarter view',
  'busy background', 'objects', 'scenery', 'hands', 'arms raised',
  'blurry', 'soft focus', 'image noise', 'film grain', 'jpeg artifacts',
  'bad anatomy', 'deformed face', 'melted face', 'extra eyes', 'asymmetrical eyes'
].join(', ');

function buildPrompt(track, index) {
  return [
    track.subject,
    'single subject only, same exact woman in every frame',
    'perfectly centered symmetrical frontal head-and-shoulders portrait',
    'face centered horizontally and vertically in the frame',
    'equal dark space above the head and below the chin',
    'eyes level, shoulders level, forehead and chin fully visible',
    'generous plain dark background border all around',
    `(${expressions[index % expressions.length]}:0.75)`,
    track.detail,
    'Do Androids Dream of Electric Sheep, empathy and uncertain identity',
    'sharp coherent facial anatomy, clean smooth image, high quality studio portrait'
  ].join(', ');
}

async function requestFrame(track, index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: buildPrompt(track, index),
      negative_prompt: negativePrompt,
      steps: 28,
      width,
      height,
      cfg_scale: 6.5,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: track.seed,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`${track.name} frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`${track.name} frame ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (const track of tracks) {
  mkdirSync(track.frameDir, { recursive: true });
  for (let index = 0; index < frameCount; index += 1) {
    const output = path.join(track.frameDir, `keyframe_${String(index + 1).padStart(3, '0')}.png`);
    if (!existsSync(output)) writeFileSync(output, await requestFrame(track, index));
    process.stdout.write(`${track.name} V20 CUDA image ${index + 1}/${frameCount}\n`);
  }
}

console.log(JSON.stringify({ method: 'v6-style-fixed-position', frameCount, tracks: tracks.map((track) => track.frameDir) }, null, 2));
