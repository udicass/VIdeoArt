import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const beatsPath = path.join(previewRoot, 'sd4_new_voiceover_beats_30sec.json');
const styleSource = 'Video/Synthetic Desires_4.mp4';
const forgeDateRoot = 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-08-06';
const outputPrefix = 'sd4_COLOR_VOICEOVER_CONTENT';
const frameCount = Number(process.argv.find((a, i) => process.argv[i - 1] === '--frames') || 12);
const fps = 6;
const durationSec = 30;

const data = JSON.parse(readFileSync(beatsPath, 'utf8'));
const beats = (data.beats || []).filter(Boolean);
if (!beats.length) throw new Error('No beats found in manifest');

// Extract style init frames from the SD4 source.
const sourceDir = path.join(forgeDateRoot, `${outputPrefix}_style_source_frames`);
mkdirSync(sourceDir, { recursive: true });
rmSync(sourceDir, { recursive: true, force: true });
mkdirSync(sourceDir, { recursive: true });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', styleSource,
  '-vf', `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,format=rgb24`,
  path.join(sourceDir, '%05d-style.png')
], { stdio: 'inherit' });
const styleFrames = readdirSync(sourceDir)
  .filter((name) => /\.png$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((name) => path.join(sourceDir, name));
if (!styleFrames.length) throw new Error('No style frames extracted');

const negativePrompt = [
  'text', 'letters', 'subtitles', 'caption', 'logo', 'watermark', 'cartoon',
  'doodle', 'line art', 'comic', 'color bars', 'test pattern', 'grid',
  'barcode', 'hard rectangles', 'abstract blocks', 'oversaturated', 'rainbow',
  'low quality', 'broken anatomy', 'extra limbs', 'melted face', 'duplicate face'
].join(', ');

// Tonal + compositional variety so the raw content carries SD3-like color and range.
const toneVariants = [
  'cool silver with deep blue rain reflections',
  'pale platinum highlights and muted cyan shadows',
  'shadowy silhouette with soft blue monitor glow',
  'strong cyan and teal chemical tones against dark',
  'neutral silver-grey afterimage, softly lifted blacks',
  'bright pale white bloom, near-translucent veil',
  'warm-neutral silver portrait, restrained contrast',
  'fading blue-grey fog, faint residual color',
  'silver with faint amber safelight undertone',
  'pale ivory highlights with a cyan rim light',
  'deep indigo night with silver rim light',
  'misty pale silver with a single blue pulse'
];

async function img2img({ initPath, beat, index }) {
  const tone = toneVariants[index % toneVariants.length];
  const payload = {
    init_images: [readFileSync(initPath).toString('base64')],
    prompt: `Synthetic Desires 4 recursive mirror sequence, ${tone}: ${beat}. Cinematic photographic still, varied composition (close face, profile, silhouette, full figure, veiled shape, hands on glass), shallow focus, silver gelatin print quality, coherent figure or object, no readable text`,
    negative_prompt: negativePrompt,
    steps: 20,
    width: 512,
    height: 512,
    cfg_scale: 6,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    denoising_strength: index % 3 === 0 ? 0.6 : 0.46,
    initial_noise_multiplier: index % 3 === 0 ? 0.88 : 0.8,
    restore_faces: false,
    seed: 512040000 + index,
    save_images: true
  };
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`img2img failed ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const base64 = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) throw new Error(`No image returned for frame ${index}`);
  return Buffer.from(base64, 'base64');
}

const freshDir = path.join(forgeDateRoot, `${outputPrefix}_frames`);
mkdirSync(freshDir, { recursive: true });
rmSync(freshDir, { recursive: true, force: true });
mkdirSync(freshDir, { recursive: true });

let feedbackPath = null;
for (let index = 0; index < frameCount; index += 1) {
  const beat = beats[index % beats.length];
  const initPath = feedbackPath && index % 3 !== 0 ? feedbackPath : styleFrames[index % styleFrames.length];
  const outPath = path.join(freshDir, `color_fresh_${String(index + 1).padStart(4, '0')}.png`);
  writeFileSync(outPath, await img2img({ initPath, beat, index }));
  feedbackPath = outPath;
  process.stdout.write(`color voice-over frame ${index + 1}/${frameCount}\n`);
}

// Interpolate keyframes into a 30-second 6fps sequence.
const sourceRate = `${frameCount}/${durationSec}`;
const leftMovie = path.join(previewRoot, `${outputPrefix}_LEFT_${durationSec}SEC.mp4`);
const totalFrames = Math.round(durationSec * fps);
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', sourceRate, '-i', path.join(freshDir, 'color_fresh_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,format=yuv420p`,
  '-t', String(durationSec), '-frames:v', String(totalFrames),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', leftMovie
], { stdio: 'inherit' });

console.log(JSON.stringify({ leftMovie, frameCount, beatsUsed: beats.length, totalFrames, durationSec }, null, 2));
