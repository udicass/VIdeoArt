import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-08';
const frameCount = 12;
const fps = 6;
const durationSec = 30;
const width = 512;
const height = 512;

const tracks = [
  {
    name: 'VOC',
    subject: 'exactly one solitary organic human woman, a weary bounty hunter and dust survivor',
    frameDir: path.join(workRoot, 'androids_dream_VOC_PURE_TEXT_FIXED_SEED_MORPH_V5_frames'),
    output: path.join(previewRoot, 'androids_dream_VOC_PURE_TEXT_FIXED_SEED_MORPH_V5_1080_30SEC.mp4'),
    seedOffset: 0,
    prompt: 'clearly organic natural skin, tired expressive human eyes, ash on a dark practical coat, soft silver gelatin portrait, muted ash-gray and faint amber light, vulnerable emotional photographic realism'
  },
  {
    name: 'DEFORUM',
    subject: 'exactly one solitary female android replicant, a manufactured imitation of the human figure',
    frameDir: path.join(workRoot, 'androids_dream_DEFORUM_PURE_TEXT_FIXED_SEED_MORPH_V5_frames'),
    output: path.join(previewRoot, 'androids_dream_DEFORUM_PURE_TEXT_FIXED_SEED_MORPH_V5_1080_30SEC.mp4'),
    seedOffset: 1000,
    prompt: 'visible synthetic skin seams, porcelain polymer face, faint circuitry under translucent skin, cold cyan electronic glow, mechanical precision, unstable borrowed emotion, analog Deforum afterimage, unmistakably artificial photographic realism'
  }
];

const androidsDreamBeats = [
  'radioactive dust survivor carrying the moral weight of a bounty hunter',
  'cold Voigt-Kampff empathy test tension visible in the eyes',
  'longing for a real animal in a world of electric substitutes',
  'uncertainty about whether memory and identity are authentic',
  'Mercer-like shared pain expressed as quiet bodily exhaustion',
  'tenderness struggling against the duty to retire artificial beings',
  'fear that empathy can be performed, copied, and manufactured',
  'postwar isolation and ash settling onto the body',
  'a private crisis over the boundary between human and android',
  'the desire to protect fragile life despite uncertainty',
  'borrowed memories surfacing as an ambiguous facial expression',
  'authentic life and electric simulation becoming impossible to separate'
];

const poses = [
  'neutral expression looking directly into camera',
  'subtle concern visible in the eyes',
  'quiet fatigue with eyes slightly lowered',
  'restrained uncertainty in an otherwise still face',
  'calm direct gaze with lips gently closed',
  'faint empathy and sadness in the eyes',
  'controlled fear beneath a neutral expression',
  'quiet resolve with unchanged frontal posture',
  'subtle grief with the same centered gaze',
  'gentle tenderness without moving the head',
  'ambiguous expression with identical posture',
  'still direct gaze returning to neutral'
];

const negativePrompt = [
  'text', 'letters', 'subtitles', 'caption', 'logo', 'watermark',
  'two people', 'multiple people', 'group', 'crowd', 'duplicate person',
  'duplicate body', 'duplicate face', 'second face', 'twins', 'split screen',
  'background person', 'background figure', 'secondary figure', 'mannequin',
  'statue', 'silhouette behind subject', 'person in distance',
  'animal', 'pet', 'sheep', 'carrier', 'scenery', 'landscape', 'city',
  'room', 'architecture', 'furniture', 'vehicle', 'busy background',
  'collage', 'contact sheet', 'abstract blocks', 'cartoon', 'oversaturated',
  'broken anatomy', 'extra arms', 'extra legs', 'extra hands', 'melted face'
].join(', ');

function buildPrompt(track, index) {
  return [
    track.subject,
    'the same recurring woman in every image, one head, one face, one torso, symmetrical composition',
    'centered head-and-shoulders passport portrait, face at identical scale and position, shoulders level, fixed crop',
    'dark simple clothing, plain black negative space, no hands visible',
    poses[index % poses.length],
    `Do Androids Dream of Electric Sheep by Philip K. Dick: ${androidsDreamBeats[index % androidsDreamBeats.length]}`,
    track.prompt,
    'fixed frontal camera, coherent anatomy, no other figure, no objects, no environment'
  ].join(', ');
}

async function requestImage(endpoint, payload, label) {
  const response = await fetch(`http://127.0.0.1:7860/sdapi/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${label} failed ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const base64 = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) throw new Error(`${label} returned no image.`);
  return Buffer.from(base64, 'base64');
}

async function generateFrame({ index, track }) {
  const payload = {
    prompt: buildPrompt(track, index),
    negative_prompt: negativePrompt,
    steps: 24,
    width,
    height,
    cfg_scale: 6.5,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    restore_faces: false,
    seed: 713068000 + track.seedOffset,
    batch_size: 1,
    n_iter: 1,
    save_images: true
  };

  return requestImage('txt2img', payload, `${track.name} text frame ${index + 1}`);
}

async function generateTrack(track) {
  mkdirSync(track.frameDir, { recursive: true });
  for (let index = 0; index < frameCount; index += 1) {
    const outputPath = path.join(track.frameDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
    if (!existsSync(outputPath)) {
      writeFileSync(outputPath, await generateFrame({ index, track }));
    }
    process.stdout.write(`${track.name} pure-text figure ${index + 1}/${frameCount} ready\n`);
  }

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-stream_loop', '-1',
    '-framerate', String(frameCount / durationSec),
    '-i', path.join(track.frameDir, 'single_figure_%04d.png'),
    '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,scale=1080:1080:flags=lanczos,format=yuv420p`,
    '-t', String(durationSec), '-frames:v', String(durationSec * fps),
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', track.output
  ], { stdio: 'inherit' });
}

for (const track of tracks) await generateTrack(track);

console.log(JSON.stringify({
  method: 'androids-dream-pure-txt2img-keyframes',
  cudaBackend: 'Forge Automatic1111',
  keyframesPerTrack: frameCount,
  outputs: tracks.map((track) => track.output)
}, null, 2));