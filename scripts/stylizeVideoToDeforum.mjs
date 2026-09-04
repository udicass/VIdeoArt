import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const inputVideo = args.get('--input');
const outputPrefix = args.get('--output-prefix') || 'deforum_stylized';
const workRoot = args.get('--work-root') || 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-18';
const prompt = args.get('--prompt') || 'cinematic stylized frame, replicant luxury, constructed gaze, synthetic desire, neon reflections, soft editorial lighting, coherent figure, no readable text';
const fps = Number(args.get('--fps') || 6);
const maxFrames = Number(args.get('--max-frames') || 0);
const width = Number(args.get('--width') || 512);
const height = Number(args.get('--height') || 512);
const denoisingStrength = Number(args.get('--denoising-strength') || 0.45);
const seedBase = Number(args.get('--seed-base') || 3892609000);

if (!inputVideo || !existsSync(inputVideo)) {
  throw new Error(`Missing input video: ${inputVideo}`);
}

const workDir = path.join(workRoot, `${outputPrefix}_stylize_work`);
const framesDir = path.join(workDir, 'source_frames');
const styledDir = path.join(workDir, 'styled_frames');
const outputMp4 = path.join(process.cwd(), 'outputs', 'deforum-merged-previews', `${outputPrefix}.mp4`);

for (const dir of [workDir, framesDir, styledDir]) {
  mkdirSync(dir, { recursive: true });
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const previewRoot = path.join(process.cwd(), 'outputs', 'deforum-merged-previews');
mkdirSync(previewRoot, { recursive: true });

// Extract frames at target fps.
const framePattern = path.join(framesDir, 'frame_%06d.png');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', inputVideo, '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=pix_fmts=rgb24`, framePattern], { stdio: 'inherit' });

const sourceFrames = readdirSync(framesDir)
  .filter((n) => /\.png$/i.test(n))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const framesToProcess = maxFrames > 0 ? sourceFrames.slice(0, maxFrames) : sourceFrames;

const negativePrompt = [
  'text', 'letters', 'subtitles', 'caption', 'logo', 'watermark', 'cartoon',
  'doodle', 'line art', 'comic', 'color bars', 'test pattern', 'grid',
  'barcode', 'hard rectangles', 'abstract blocks', 'oversaturated',
  'rainbow', 'low quality', 'broken anatomy', 'extra limbs', 'melted face'
].join(', ');

async function img2img({ initPath, index }) {
  const payload = {
    init_images: [readFileSync(initPath).toString('base64')],
    prompt: `${prompt}, coherent cinematic frame, no readable text`,
    negative_prompt: negativePrompt,
    steps: 10,
    width,
    height,
    cfg_scale: 5.0,
    sampler_name: 'Euler',
    denoising_strength: denoisingStrength,
    initial_noise_multiplier: 0.8,
    restore_faces: false,
    seed: seedBase + index,
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

for (let index = 0; index < framesToProcess.length; index += 1) {
  const src = path.join(framesDir, framesToProcess[index]);
  const out = path.join(styledDir, `styled_${String(index + 1).padStart(6, '0')}.png`);
  writeFileSync(out, await img2img({ initPath: src, index }));
  process.stdout.write(`styled frame ${index + 1}/${framesToProcess.length}\n`);
}

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(styledDir, 'styled_%06d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputMp4], { stdio: 'inherit' });

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', outputMp4], { encoding: 'utf8' }));
console.log(JSON.stringify({
  outputMp4,
  framesProcessed: framesToProcess.length,
  width: probe.streams?.[0]?.width,
  height: probe.streams?.[0]?.height,
  frames: probe.streams?.[0]?.nb_frames,
  fps: probe.streams?.[0]?.r_frame_rate,
  duration: probe.format?.duration
}, null, 2));
