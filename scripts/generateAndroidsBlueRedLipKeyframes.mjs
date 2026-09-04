import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10';
const frameCount = 12;
const width = 512;
const height = 512;

const track = {
  name: 'VOC',
  seed: 713268000,
  frameDir: path.join(workRoot, 'androids_dream_VOC_BLUE_REDLIP_V43_frames'),
  subject: 'one adult human woman, unmistakably feminine face, natural human skin, clearly human',
  identity: 'same exact recurring woman, one face, one person, stable identity across every frame'
};

// 12 beats matching the reference: blue/monochrome cinematic grade, dark background,
// selective red lips (neat, smeared, fading), varied gazes and expressions.
const beats = [
  { gaze: 'direct steady gaze at camera', expression: 'calm neutral', lips: 'neat vivid red lips', light: 'strong cool blue color grade, deep black background, high contrast cinematic' },
  { gaze: 'direct gaze at camera', expression: 'subtle concern in the eyes', lips: 'vivid red lips', light: 'cold blue monochrome grade, dark background, single hard key light' },
  { gaze: 'slight upward gaze', expression: 'quiet longing', lips: 'red lips softly muted', light: 'blue-tinted shadow, black backdrop, rim light on jaw' },
  { gaze: 'downturned eyes', expression: 'restrained sorrow', lips: 'muted red lips', light: 'icy blue grade, dark void background, low key' },
  { gaze: 'direct gaze, head tilted slightly', expression: 'guarded defiance', lips: 'vivid red lipstick, sharp defined', light: 'steel blue monochrome, black background, dramatic side light' },
  { gaze: 'direct gaze', expression: 'faint distress', lips: 'red lipstick smeared and dripping below the lower lip', light: 'cold blue grade, near-black background, harsh contrast' },
  { gaze: 'upward gaze toward light', expression: 'vulnerable, open', lips: 'neat red lips, soft sheen', light: 'blue cinematic glow, black background, gentle falloff' },
  { gaze: 'downturned eyes', expression: 'private grief', lips: 'red lips fading to muted', light: 'dark blue monochrome, black backdrop, low soft key' },
  { gaze: 'direct gaze, hair pulled back', expression: 'severe, still', lips: 'dark muted lips, no red', light: 'cool desaturated blue grade, black background, flat dramatic light' },
  { gaze: 'slight downward glance', expression: 'weary acceptance', lips: 'muted orange-red lips', light: 'blue-gray grade, dark background, chiaroscuro' },
  { gaze: 'direct gaze, chin slightly lifted', expression: 'quiet resolve', lips: 'vivid red lips', light: 'deep blue monochrome, black backdrop, strong key and fill' },
  { gaze: 'level direct gaze', expression: 'neutral returning calm', lips: 'red lips softly muted', light: 'even cool blue grade, dark background, balanced light' }
];

const negativePrompt = [
  'low quality, worst quality, blurry, soft focus, motion blur, image noise, film grain, jpeg artifacts, gritty texture',
  'bad anatomy, asymmetrical eyes, crossed eyes, deformed face, distorted face, melted face, extra eyes, eye artifacts, noisy eyes',
  'heavy eyelashes, false eyelashes, black eye makeup, raccoon eyes, painted eyes, dark eye rings',
  'man, male, masculine face, masculine jaw, beard, stubble, male clothing',
  'duplicate face, second face, two people, multiple people, extra body, duplicate body, ghost face',
  'profile, three-quarter view, looking away to the side, cropped forehead, cropped chin, cut off head, cut off shoulders',
  'hands, arms, objects, scenery, landscape, architecture, furniture, clutter, collage, split screen',
  'black bar, black border, top border, letterbox, frame edge, clipped head',
  'warm tones, orange skin, brown background, green hood, knitted hood, sketch, line drawing, illustration, cartoon, drawing',
  'text, letters, logo, watermark, subtitles, open mouth, teeth'
].join(', ');

function buildPrompt(index) {
  const beat = beats[index % beats.length];
  return [
    track.subject,
    track.identity,
    'symmetrical centered frontal close-up portrait, entire head fully visible with clear space above the hair',
    'eyes level, face centered horizontally, fixed camera, fixed lens, fixed distance, fixed crop',
    `(${beat.gaze}:0.8), (${beat.expression}:0.8)`,
    `(${beat.lips}:1.15)`,
    beat.light,
    'selective color, only the lips carry warm red, everything else cold blue monochrome',
    'film still, sharp focus, clean smooth skin, coherent facial anatomy, high quality cinematic portrait',
    'Do Androids Dream of Electric Sheep, empathy and uncertain identity'
  ].join(', ');
}

async function requestFrame(index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: buildPrompt(index),
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

mkdirSync(track.frameDir, { recursive: true });
for (let index = 0; index < frameCount; index += 1) {
  const output = path.join(track.frameDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
  if (!existsSync(output)) writeFileSync(output, await requestFrame(index));
  process.stdout.write(`${track.name} blue-redlip CUDA image ${index + 1}/${frameCount}\n`);
}

console.log(JSON.stringify({ method: 'blue-redlip-txt2img-v43', frameCount, frameDir: track.frameDir }, null, 2));
