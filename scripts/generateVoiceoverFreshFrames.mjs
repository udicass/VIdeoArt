import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const beatsPath = args.get('--beats') || path.join('outputs', 'deforum-merged-previews', 'sd1_voiceover_beats_current.json');
const movieLabel = args.get('--movie-label') || 'Movie 1';
const outputPrefix = args.get('--output-prefix') || 'sd1_voiceover_FRESH_CONTENT';
const blendRight = args.get('--blend-right') === 'true';
const frameCount = Number(args.get('--frames') || 39);
const fps = Number(args.get('--fps') || 6);
const durationSec = Number(args.get('--duration') || 90);
const forgeDateRoot = args.get('--forge-root') || 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-18';
const previewRoot = path.join(process.cwd(), 'outputs', 'deforum-merged-previews');
const freshDir = path.join(forgeDateRoot, `${outputPrefix}_frames`);
const visibleDir = path.join(forgeDateRoot, `${outputPrefix}_90sec_visible_frames`);
const finalDir = path.join(forgeDateRoot, `${outputPrefix}_FINAL_90sec_frames`);
const right90 = args.get('--right-source') || '';

const data = JSON.parse(readFileSync(beatsPath, 'utf8'));
const beats = (data.beats || []).filter(Boolean);
if (!beats.length) throw new Error(`No beats found in ${beatsPath}`);

function findStyleFrames() {
  const roots = [
    forgeDateRoot,
    'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-17'
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const frames = readdirSync(root)
      .filter((name) => /^\d{5}-.*\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => path.join(root, name));
    if (frames.length) return frames;
  }
  throw new Error('No legacy style frames found');
}

const styleFrames = findStyleFrames();
mkdirSync(freshDir, { recursive: true });
mkdirSync(visibleDir, { recursive: true });
mkdirSync(finalDir, { recursive: true });
rmSync(freshDir, { recursive: true, force: true });
rmSync(visibleDir, { recursive: true, force: true });
rmSync(finalDir, { recursive: true, force: true });
mkdirSync(freshDir, { recursive: true });
mkdirSync(visibleDir, { recursive: true });
mkdirSync(finalDir, { recursive: true });

const negativePrompt = [
  'text', 'letters', 'subtitles', 'caption', 'logo', 'watermark', 'cartoon',
  'doodle', 'line art', 'comic', 'color bars', 'test pattern', 'grid',
  'barcode', 'hard rectangles', 'abstract blocks', 'oversaturated',
  'rainbow', 'low quality', 'broken anatomy', 'extra limbs', 'melted face'
].join(', ');

async function img2img({ initPath, beat, index }) {
  const payload = {
    init_images: [readFileSync(initPath).toString('base64')],
    prompt: [
      `${movieLabel} voice-over fresh content frame: ${beat}`,
      'synthetic woman in darkroom memory',
      'neon rain reflected in black photographic emulsion',
      'silver gelatin portrait, chemical tray, ghostly digital longing',
      'soft monochrome cinematic still, muted cyan shadows, amber safelight',
      'coherent figure or object, shallow focus, no readable text'
    ].join(', '),
    negative_prompt: negativePrompt,
    steps: 18,
    width: 512,
    height: 512,
    cfg_scale: 5.5,
    sampler_name: 'Euler',
    denoising_strength: index % 3 === 0 ? 0.62 : 0.48,
    initial_noise_multiplier: index % 3 === 0 ? 0.9 : 0.8,
    restore_faces: false,
    seed: 3892609000 + index,
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

let feedbackPath = null;
for (let index = 0; index < frameCount; index += 1) {
  const beat = beats[index % beats.length];
  const initPath = feedbackPath && index % 3 !== 0 ? feedbackPath : styleFrames[index % styleFrames.length];
  const outPath = path.join(freshDir, `voiceover_fresh_${String(index + 1).padStart(4, '0')}.png`);
  writeFileSync(outPath, await img2img({ initPath, beat, index }));
  feedbackPath = outPath;
  process.stdout.write(`fresh voice-over frame ${index + 1}/${frameCount}\n`);
}

const keyMp4 = path.join(previewRoot, `${outputPrefix}_KEYFRAMES.mp4`);
const left90 = path.join(previewRoot, `${outputPrefix}_LEFT_90SEC.mp4`);
const final90 = path.join(previewRoot, `${outputPrefix}_90SEC_RIGHT_STRONG.mp4`);
const sourceRate = `${frameCount}/${durationSec}`;
const totalFrames = Math.round(durationSec * fps);

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(freshDir, 'voiceover_fresh_%04d.png'), '-frames:v', String(frameCount), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', keyMp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', sourceRate, '-i', path.join(freshDir, 'voiceover_fresh_%04d.png'), '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,format=yuv420p`, '-frames:v', String(totalFrames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', left90], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', left90, path.join(visibleDir, 'voiceover_visible_%04d.png')], { stdio: 'inherit' });

if (blendRight) {
  if (!right90 || !existsSync(right90)) throw new Error(`Missing right 90s source: ${right90}`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', left90, '-i', right90, '-filter_complex', '[0:v]scale=512:512,setsar=1[left];[1:v]scale=512:512,setsar=1[right];[left][right]blend=all_expr=A*0.25+B*0.75,format=yuv420p[v]', '-map', '[v]', '-frames:v', String(totalFrames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final90], { stdio: 'inherit' });
} else {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', left90, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final90], { stdio: 'inherit' });
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', final90, path.join(finalDir, 'final_fresh_%04d.png')], { stdio: 'inherit' });

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', final90], { encoding: 'utf8' }));
console.log(JSON.stringify({
  keyframes: frameCount,
  beatsUsed: beats.length,
  freshFrameFolder: freshDir,
  visibleFrameFolder: visibleDir,
  finalFrameFolder: finalDir,
  finalMovie: path.basename(final90),
  width: probe.streams?.[0]?.width,
  height: probe.streams?.[0]?.height,
  frames: probe.streams?.[0]?.nb_frames,
  fps: probe.streams?.[0]?.r_frame_rate,
  duration: probe.format?.duration
}, null, 2));