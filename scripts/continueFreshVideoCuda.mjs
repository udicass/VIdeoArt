import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, 'outputs', 'deforum-merged-previews', 'FRESH.mp4');
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-08-10';
const frameDir = path.join(workRoot, 'FRESH_CONTINUATION_CUDA_V1_20SEC_frames');
const startFrame = path.join(frameDir, 'anchor_last_frame.png');
const output = path.join(previewRoot, 'FRESH_CONTINUATION_CUDA_V1_20SEC_1280x720.mp4');
const contact = path.join(previewRoot, 'FRESH_CONTINUATION_CUDA_V1_20SEC_contact.jpg');
const frameCount = 20;
const generationWidth = 768;
const generationHeight = 432;
const fps = 10;

if (!existsSync(source)) throw new Error(`Missing source: ${source}`);
mkdirSync(frameDir, { recursive: true });

if (!existsSync(startFrame)) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-sseof', '-0.2', '-i', source,
    '-frames:v', '1', '-vf', `scale=${generationWidth}:${generationHeight}:flags=lanczos`, startFrame
  ], { stdio: 'inherit' });
}

const beats = [
  'the close-up lingers, one face emerging through a soft blue double exposure',
  'a faint shift of attention toward the camera, restrained and quiet',
  'two ghosted facial positions overlap in translucent blue film grain',
  'the figure seems to remember something, almost imperceptible sadness',
  'a slow breath, dark hair dissolving into black negative space',
  'one slightly nearer echo of the same face, eyes fixed and luminous',
  'a softened profile echo passes behind the frontal face, no hard cut',
  'the gaze rises a fraction, cool scanline texture and blue shadow',
  'the portrait settles into a tranquil direct look',
  'a subtle inward movement, ghost image fading at the cheek',
  'a quiet blink-like change, same woman and same framing',
  'the blue light grows denser at the edges, face remains clear',
  'a faint second exposure crosses the forehead and disappears',
  'the mouth softens, no red lipstick, no dramatic change',
  'the same face turns emotionally inward, eyes still near camera',
  'one delicate exposure drift to the left, dark negative space intact',
  'the portrait becomes slightly more distant in a blue haze',
  'the subject returns toward sharp focus from a soft echo',
  'a calm final look, cool blue monochrome, black background',
  'a seamless final close-up ready to join the original film'
];

const negativePrompt = [
  'text, letters, subtitles, logo, watermark, border, frame edge, black bar, letterbox',
  'red lipstick, bright lipstick, colored lips, saturated color, warm orange light',
  'different woman, different face, male, duplicate person, extra face, extra eyes, distorted face, melted face',
  'cartoon, illustration, sketch, line art, painterly texture, knitted hood, hat, scenery, objects, hands',
  'profile view, strong head turn, extreme expression, open mouth, teeth, oversaturated, hard cut, collage'
].join(', ');

function promptFor(index) {
  return [
    'same exact adult human woman from the input frame, same identity, same face, same dark hair',
    'intimate centered frontal cinematic close-up, fixed camera, same crop and perspective',
    'cool blue monochrome photographic portrait, deep black negative space, low-key studio light',
    'silver gelatin film texture, faint CRT scanlines, restrained analog double exposure, soft ghost image',
    'a continuous continuation of the preceding shot, no scene change',
    beats[index],
    'photorealistic, clean anatomy, clear expressive eyes, subtle natural motion'
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
      steps: 24,
      width: generationWidth,
      height: generationHeight,
      cfg_scale: 5.5,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      denoising_strength: index % 5 === 0 ? 0.30 : 0.24,
      initial_noise_multiplier: 0.72,
      restore_faces: false,
      seed: 3892609700 + index,
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

let previous = startFrame;
for (let index = 0; index < frameCount; index += 1) {
  const outPath = path.join(frameDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    previous = outPath;
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generateFrame(previous, index));
  previous = outPath;
  process.stdout.write(`generated ${index + 1}/${frameCount}\n`);
}

const temp = path.join(previewRoot, '_fresh_continuation_v1_temp.mp4');
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(frameDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1280:720:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=1,fps=${fps}`,
  '-t', '20', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=384:-1,tile=5x4", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ source, frameDir, output, contact, frameCount, fps, durationSec: 20 }, null, 2));
