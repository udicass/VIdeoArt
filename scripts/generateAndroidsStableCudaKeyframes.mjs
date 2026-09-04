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
    frameDir: path.join(workRoot, 'androids_dream_VOC_CLEAN_CUDA_V12_frames'),
    subject: 'one adult human woman, unmistakably feminine face, natural human skin, dark shoulder-length hair, clearly human',
    detail: 'soft tired eyes, smooth clean skin, dark practical coat, restrained human emotion'
  },
  {
    name: 'DEFORUM',
    seed: 713069000,
    frameDir: path.join(workRoot, 'androids_dream_DEFORUM_CLEAN_CUDA_V13_frames'),
    subject: 'one adult female android replicant, unmistakably feminine face, smooth porcelain polymer skin, clean bald head, clearly artificial',
    detail: 'smooth clean synthetic skin, symmetrical feminine features, natural unpainted eyes, extremely subtle circuitry, restrained manufactured emotion'
  }
];

const expressions = [
  'neutral calm direct gaze',
  'slightly concerned direct gaze',
  'quiet fatigue in the eyes',
  'restrained uncertainty',
  'faint empathy and sadness',
  'neutral calm direct gaze'
];

const negativePrompt = [
  'low quality, worst quality, blurry, soft focus, motion blur, image noise, film grain, jpeg artifacts, gritty texture',
  'bad anatomy, asymmetrical eyes, crossed eyes, deformed face, distorted face, melted face, extra eyes, eye artifacts, noisy eyes',
  'eyeliner, mascara, heavy eyelashes, false eyelashes, black eye makeup, raccoon eyes, painted eyes, dark eye rings',
  'man, male, masculine face, masculine jaw, beard, stubble, male clothing',
  'duplicate face, second face, two people, multiple people, extra body, duplicate body, ghost face',
  'profile, three-quarter view, tilted head, looking away, cropped forehead, cropped chin, cut off shoulders',
  'hands, arms, objects, scenery, landscape, architecture, clutter, collage, split screen',
  'text, letters, logo, watermark, subtitles, red lipstick, bright lipstick, open mouth'
].join(', ');

function buildPrompt(track, index) {
  return [
    track.subject,
    'single subject only, same exact recurring person in every frame',
    'symmetrical centered frontal medium close-up portrait, entire head fully visible with clear space above hair or scalp',
    'eyes exactly level, face centered horizontally, fixed camera, fixed lens, fixed distance, fixed crop',
    'forehead, hairline, chin, neck, and both shoulders fully inside frame, generous clean dark background border',
    `(${expressions[index % expressions.length]}:0.65)`,
    track.detail,
    'high quality studio portrait, clean smooth image, sharp natural eyes, coherent facial anatomy, low texture, low noise',
    'Do Androids Dream of Electric Sheep, empathy and uncertain identity, plain dark background'
  ].join(', ');
}

async function requestFrame(track, index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: buildPrompt(track, index),
      negative_prompt: negativePrompt,
      steps: 32,
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
    process.stdout.write(`${track.name} stable CUDA image ${index + 1}/${frameCount}\n`);
  }
}

console.log(JSON.stringify({ method: 'stable-cuda-txt2img', frameCount, tracks: tracks.map((track) => track.frameDir) }, null, 2));