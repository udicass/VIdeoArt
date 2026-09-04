import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-08';
const frameCount = 180;
const fps = 6;

const tracks = [
  {
    name: 'VOC',
    seed: 713068000,
    frameDir: path.join(workRoot, 'androids_dream_VOC_DIRECT_CUDA_V9_frames'),
    output: path.join(previewRoot, 'androids_dream_VOC_DIRECT_CUDA_BLUE_CRT_V9_1080_30SEC.mp4'),
    subject: 'exactly one solitary organic human woman, natural skin and dark hair, visibly human',
    treatment: 'silver gelatin portrait, vulnerable human emotion, muted ash gray, restrained photographic realism'
  },
  {
    name: 'DEFORUM',
    seed: 713069000,
    frameDir: path.join(workRoot, 'androids_dream_DEFORUM_DIRECT_CUDA_V9_frames'),
    output: path.join(previewRoot, 'androids_dream_DEFORUM_DIRECT_CUDA_BLUE_CRT_V9_1080_30SEC.mp4'),
    subject: 'exactly one solitary female android replicant, porcelain polymer face, visibly artificial',
    treatment: 'subtle synthetic skin seams, faint circuitry, cold manufactured emotion, precise photographic realism'
  }
];

const phases = [
  'neutral direct gaze',
  'subtle concern growing in the eyes',
  'quiet fatigue and uncertainty',
  'restrained fear beneath a still expression',
  'faint empathy and sadness',
  'quiet resolve returning to a neutral gaze'
];

const negativePrompt = [
  'text', 'letters', 'subtitles', 'logo', 'watermark', 'red lips', 'bright lipstick',
  'two people', 'multiple people', 'duplicate person', 'duplicate face', 'second face',
  'profile', 'side view', 'tilted head', 'open mouth', 'hands', 'objects', 'scenery',
  'collage', 'split screen', 'cartoon', 'oversaturated', 'broken anatomy', 'melted face',
  'motion blur', 'blurred face', 'smear', 'double exposure', 'ghost face'
].join(', ');

function promptFor(track, frameIndex) {
  const phasePosition = frameIndex / (frameCount - 1) * (phases.length - 1);
  const phaseIndex = Math.min(Math.floor(phasePosition), phases.length - 1);
  const nextIndex = Math.min(phaseIndex + 1, phases.length - 1);
  const blend = phasePosition - phaseIndex;
  return [
    track.subject,
    'same recurring woman, one head, one face, one torso',
    'perfectly centered frontal head-and-shoulders passport portrait',
    'eyes level at identical position, identical face scale, shoulders level, fixed camera and fixed crop',
    `(${phases[phaseIndex]}:${(1.15 - blend * 0.15).toFixed(3)})`,
    `(${phases[nextIndex]}:${(1.0 + blend * 0.15).toFixed(3)})`,
    track.treatment,
    'Do Androids Dream of Electric Sheep, empathy and uncertain identity',
    'plain dark full-frame background, coherent sharp facial anatomy, no environment'
  ].join(', ');
}

async function generateFrame(track, frameIndex) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: promptFor(track, frameIndex),
      negative_prompt: negativePrompt,
      steps: 20,
      width: 512,
      height: 512,
      cfg_scale: 6.0,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: track.seed,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`${track.name} frame ${frameIndex + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const base64 = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) throw new Error(`${track.name} frame ${frameIndex + 1} returned no image`);
  return Buffer.from(base64, 'base64');
}

function isValidFrame(framePath) {
  return existsSync(framePath) && statSync(framePath).size > 10_000;
}

async function generateTrack(track) {
  mkdirSync(track.frameDir, { recursive: true });
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const framePath = path.join(track.frameDir, `frame_${String(frameIndex + 1).padStart(4, '0')}.png`);
    if (!isValidFrame(framePath)) {
      writeFileSync(framePath, await generateFrame(track, frameIndex));
    }
    process.stdout.write(`${track.name} CUDA frame ${frameIndex + 1}/${frameCount} ready\n`);
  }

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(fps),
    '-i', path.join(track.frameDir, 'frame_%04d.png'),
    '-vf', 'scale=1080:1080:flags=lanczos,format=yuv420p',
    '-frames:v', String(frameCount), '-an', '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', track.output
  ], { stdio: 'inherit' });
}

for (const track of tracks) await generateTrack(track);

console.log(JSON.stringify({
  method: 'direct-cuda-txt2img-no-optical-flow',
  frameCount,
  fps,
  outputs: tracks.map((track) => track.output)
}, null, 2));