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
const width = Number(args.get('--width') || 512);
const height = Number(args.get('--height') || 512);
const forgeDateRoot = args.get('--forge-root') || 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-18';
const styleSource = args.get('--style-source') || '';
const previewRoot = path.join(process.cwd(), 'outputs', 'deforum-merged-previews');
const freshDir = path.join(forgeDateRoot, `${outputPrefix}_frames`);
const visibleDir = path.join(forgeDateRoot, `${outputPrefix}_${durationSec}sec_visible_frames`);
const finalDir = path.join(forgeDateRoot, `${outputPrefix}_FINAL_${durationSec}sec_frames`);
const rightSource = args.get('--right-source') || '';
const blendRatio = Math.max(0, Math.min(1, Number(args.get('--blend-ratio') || 0.30)));
const blendMode = args.get('--blend-mode') || 'linear'; // 'linear' or 'overlay'

const data = JSON.parse(readFileSync(beatsPath, 'utf8'));
const beats = (data.beats || []).filter(Boolean);
if (!beats.length) throw new Error(`No beats found in ${beatsPath}`);

function findStyleFrames() {
  if (styleSource) {
    if (!existsSync(styleSource)) throw new Error(`Style source does not exist: ${styleSource}`);
    const sourceDir = path.join(forgeDateRoot, `${outputPrefix}_style_source_frames`);
    mkdirSync(sourceDir, { recursive: true });
    rmSync(sourceDir, { recursive: true, force: true });
    mkdirSync(sourceDir, { recursive: true });
    if (/\.mp4$/i.test(styleSource)) {
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-i', styleSource,
        '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=rgb24`,
        path.join(sourceDir, '%05d-sd4.png')
      ], { stdio: 'inherit' });
    }
    const sourceFrames = readdirSync(sourceDir)
      .filter((name) => /\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => path.join(sourceDir, name));
    if (sourceFrames.length) return sourceFrames;
    throw new Error(`No style frames extracted from ${styleSource}`);
  }
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
    width,
    height,
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
const leftMovie = path.join(previewRoot, `${outputPrefix}_LEFT_${durationSec}SEC.mp4`);
const finalMovie = path.join(previewRoot, `${outputPrefix}_${durationSec}SEC_RIGHT_STRONG.mp4`);
const sourceRate = `${frameCount}/${durationSec}`;
const totalFrames = Math.round(durationSec * fps);

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(freshDir, 'voiceover_fresh_%04d.png'), '-frames:v', String(frameCount), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', `hqdn3d=2:2:2:3,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`, '-movflags', '+faststart', keyMp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', sourceRate, '-i', path.join(freshDir, 'voiceover_fresh_%04d.png'), '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,tpad=stop_mode=clone:stop_duration=${durationSec},format=yuv420p`, '-t', String(durationSec), '-frames:v', String(totalFrames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', leftMovie], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', leftMovie, path.join(visibleDir, 'voiceover_visible_%04d.png')], { stdio: 'inherit' });

if (blendRight) {
  if (!rightSource || !existsSync(rightSource)) throw new Error(`Missing right ${durationSec}s source: ${rightSource}`);
  const leftOpacity = Number((1 - blendRatio).toFixed(3));
  const rightOpacity = Number(blendRatio.toFixed(3));
  let filterComplex;
  if (blendMode === 'overlay') {
    // Voice-over content (left) is overlaid on top of the right source (Deforum/original).
    // blendRatio controls right-source visibility: higher value = more Deforum visible underneath.
    const vocOpacity = Number((1 - blendRatio).toFixed(3));
    filterComplex = `[0:v]scale=${width}:${height},setsar=1,format=yuva420p,colorchannelmixer=aa=${vocOpacity}[voc];[1:v]scale=${width}:${height},setsar=1[base];[base][voc]overlay=format=auto,format=yuv420p[v]`;
  } else if (blendMode === 'split') {
    filterComplex = `[0:v]scale=256:512:force_original_aspect_ratio=decrease,pad=256:512:(ow-iw)/2:(oh-ih)/2,setsar=1[left];[1:v]scale=256:512:force_original_aspect_ratio=decrease,pad=256:512:(ow-iw)/2:(oh-ih)/2,setsar=1[right];[left][right]hstack=inputs=2,format=yuv420p[v]`;
  } else {
    filterComplex = `[0:v]scale=${width}:${height},setsar=1[left];[1:v]scale=${width}:${height},setsar=1[right];[left][right]blend=all_expr=A*${leftOpacity}+B*${rightOpacity},format=yuv420p[v]`;
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', leftMovie, '-i', rightSource, '-filter_complex', filterComplex, '-map', '[v]', '-frames:v', String(totalFrames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalMovie], { stdio: 'inherit' });
} else {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', leftMovie, '-vf', `tpad=stop_mode=clone:stop_duration=${durationSec},format=yuv420p`, '-t', String(durationSec), '-frames:v', String(totalFrames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalMovie], { stdio: 'inherit' });
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', finalMovie, path.join(finalDir, 'final_fresh_%04d.png')], { stdio: 'inherit' });

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', finalMovie], { encoding: 'utf8' }));
console.log(JSON.stringify({
  keyframes: frameCount,
  beatsUsed: beats.length,
  freshFrameFolder: freshDir,
  visibleFrameFolder: visibleDir,
  finalFrameFolder: finalDir,
  finalMovie: path.basename(finalMovie),
  width: probe.streams?.[0]?.width,
  height: probe.streams?.[0]?.height,
  frames: probe.streams?.[0]?.nb_frames,
  fps: probe.streams?.[0]?.r_frame_rate,
  duration: probe.format?.duration
}, null, 2));