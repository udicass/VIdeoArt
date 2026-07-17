import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const resultPath = process.argv[2];
if (!resultPath) {
  throw new Error('Usage: node scripts/generateLegacyVoiceoverStylePreview.mjs <copilot-result-content.txt>');
}

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const styleRoot = 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-17';
const work = path.join(previewRoot, '_sd3_legacy_voiceover_style_left_work');
const leftDir = path.join(work, 'legacy_left');
const left40 = path.join(work, 'legacy_left_40');
mkdirSync(leftDir, { recursive: true });
mkdirSync(left40, { recursive: true });

const raw = readFileSync(resultPath, 'utf8').replace(/^Result:\s*/, '');
const data = JSON.parse(raw);
const beats = (data.beats || []).slice(0, 10).filter(Boolean);
if (!beats.length) throw new Error('No voice-over beats found');

const styleFrames = [
  '00000-3892608527.png', '00001-3892608528.png', '00002-3892608529.png',
  '00003-3892608530.png', '00004-3892608531.png', '00005-3892608532.png',
  '00006-3892608533.png', '00007-3892608534.png', '00008-3892608527.png',
  '00009-3892608535.png', '00010-3892608528.png', '00011-3892608537.png',
  '00012-3892608529.png', '00013-3892608538.png', '00014-3892608530.png',
  '00015-3892608539.png', '00016-3892608531.png', '00017-3892608532.png'
].map((name) => path.join(styleRoot, name));

for (const frame of styleFrames) {
  if (!existsSync(frame)) throw new Error(`Missing style frame: ${frame}`);
}

const negativePrompt = [
  'text', 'letters', 'subtitles', 'caption', 'logo', 'watermark', 'cartoon',
  'doodle', 'line art', 'comic', 'color bars', 'test pattern', 'grid',
  'barcode', 'hard rectangles', 'abstract blocks', 'neon checkerboard',
  'oversaturated', 'rainbow', 'low quality', 'broken anatomy', 'duplicate face',
  'extra limbs', 'distorted hands', 'melted face'
].join(', ');

async function img2img({ initPath, beat, index }) {
  const payload = {
    init_images: [readFileSync(initPath).toString('base64')],
    prompt: [
      `Image inspired only by this movie 3 voice-over content: ${beat}`,
      'soft monochrome darkroom portrait atmosphere',
      'blurred silver gelatin contact print',
      'black negative space',
      'gentle scanline texture',
      'shallow focus',
      'muted blue-gray shadows',
      'subtle red safelight undertone',
      'cinematic still, coherent figure or object, no readable text'
    ].join(', '),
    negative_prompt: negativePrompt,
    steps: 30,
    width: 512,
    height: 512,
    cfg_scale: 7,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    denoising_strength: index % 4 === 0 ? 0.55 : 0.4,
    initial_noise_multiplier: index % 4 === 0 ? 0.88 : 0.8,
    restore_faces: false,
    seed: 3892608527 + index,
    save_images: true,
    override_settings: { CLIP_stop_at_last_layers: 2 },
    override_settings_restore_afterwards: false
  };

  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`img2img failed ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  const base64 = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) throw new Error(`No image returned for frame ${index}`);
  return Buffer.from(base64, 'base64');
}

rmSync(leftDir, { recursive: true, force: true });
mkdirSync(leftDir, { recursive: true });

let feedbackPath = null;
for (let index = 0; index < 18; index += 1) {
  const stylePath = styleFrames[index % styleFrames.length];
  const initPath = feedbackPath && index % 3 !== 0 ? feedbackPath : stylePath;
  const beat = beats[index % beats.length];
  const outPath = path.join(leftDir, `left_${String(index).padStart(3, '0')}.png`);
  writeFileSync(outPath, await img2img({ initPath, beat, index }));
  feedbackPath = outPath;
  process.stdout.write(`generated ${path.basename(outPath)}\n`);
}

rmSync(left40, { recursive: true, force: true });
mkdirSync(left40, { recursive: true });
for (let index = 0; index < 40; index += 1) {
  copyFileSync(
    path.join(leftDir, `left_${String(index % 18).padStart(3, '0')}.png`),
    path.join(left40, `left_${String(index).padStart(3, '0')}.png`)
  );
}

const leftMp4 = path.join(previewRoot, 'sd3_VOICEOVER_LEGACY_STYLE_LEFT.mp4');
const rightSrc = path.join(previewRoot, 'sd3_voice_content_real_20x20_test.mp4');
const rightCopy = path.join(previewRoot, 'sd3_Defourm_side_RIGHT.mp4');
const outMp4 = path.join(previewRoot, 'sd3_VOICEOVER_LEGACY_STYLE_LEFT_vs_Defourm_side_RIGHT.mp4');
copyFileSync(rightSrc, rightCopy);

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', path.join(left40, 'left_%03d.png'), '-vf', 'scale=256:512,setsar=1', '-frames:v', '40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', leftMp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', leftMp4, '-i', rightCopy, '-filter_complex', '[0:v]scale=256:512,setsar=1[left];[1:v]scale=256:512,setsar=1[right];[left][right]hstack=inputs=2', '-frames:v', '40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outMp4, '-frames:v', '1', path.join(previewRoot, 'sd3_VOICEOVER_LEGACY_STYLE_LEFT_vs_Defourm_side_RIGHT_first.png')], { stdio: 'inherit' });

const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', outMp4], { encoding: 'utf8' });
const meta = JSON.parse(probe);
console.log(JSON.stringify({
  file: path.basename(outMp4),
  width: meta.streams?.[0]?.width,
  height: meta.streams?.[0]?.height,
  frames: meta.streams?.[0]?.nb_frames,
  fps: meta.streams?.[0]?.r_frame_rate,
  duration: meta.format?.duration,
  voiceBeatsUsed: beats.length,
  styleFramesUsed: styleFrames.length
}, null, 2));