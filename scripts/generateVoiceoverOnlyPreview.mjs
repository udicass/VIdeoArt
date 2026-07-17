import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const resultPath = process.argv[2];
if (!resultPath) {
  throw new Error('Usage: node scripts/generateVoiceoverOnlyPreview.mjs <copilot-result-content.txt>');
}

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const work = path.join(previewRoot, '_sd3_voiceover_only_images_left_work');
const leftDir = path.join(work, 'voiceover_images');
const left40 = path.join(work, 'voiceover_images_40');
mkdirSync(leftDir, { recursive: true });
mkdirSync(left40, { recursive: true });

const raw = readFileSync(resultPath, 'utf8').replace(/^Result:\s*/, '');
const data = JSON.parse(raw);
const beats = (data.beats || []).slice(0, 10).filter(Boolean);
if (!beats.length) throw new Error('No voice-over beats found');

const negativePrompt = [
  'text',
  'letters',
  'subtitles',
  'caption',
  'logo',
  'watermark',
  'frame label',
  'cartoon',
  'doodle',
  'line art',
  'comic',
  'low quality',
  'broken anatomy',
  'duplicate face',
  'extra limbs',
  'distorted hands',
  'melted face',
  'typography',
  'color bars',
  'test pattern',
  'grid',
  'barcode',
  'hard rectangles',
  'abstract blocks',
  'neon checkerboard'
].join(', ');

async function generateFrame(index, beat) {
  const outFile = path.join(leftDir, `left_${String(index).padStart(3, '0')}.png`);
  if (existsSync(outFile)) return false;

  const payload = {
    prompt: `Cinematic photographic still of the scene described by this movie 3 voice-over line. Use only details present in the line. Make a coherent natural movie frame, not a graphic design. Voice-over line: ${beat}`,
    negative_prompt: negativePrompt,
    steps: 16,
    width: 256,
    height: 512,
    cfg_scale: 6,
    sampler_name: 'DPM++ 2M',
    seed: 6718000 + index,
    batch_size: 1,
    n_iter: 1,
    save_images: true,
    override_settings: { CLIP_stop_at_last_layers: 2 },
    override_settings_restore_afterwards: false
  };

  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`txt2img failed ${response.status}: ${body}`);
  }

  const json = await response.json();
  const base64 = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) throw new Error(`No image returned for beat ${index}`);
  writeFileSync(outFile, Buffer.from(base64, 'base64'));
  return true;
}

for (let index = 0; index < beats.length; index += 1) {
  const created = await generateFrame(index, beats[index]);
  process.stdout.write(`${created ? 'generated' : 'kept'} left_${String(index).padStart(3, '0')}.png\n`);
}

rmSync(left40, { recursive: true, force: true });
mkdirSync(left40, { recursive: true });
for (let index = 0; index < 40; index += 1) {
  copyFileSync(
    path.join(leftDir, `left_${String(index % beats.length).padStart(3, '0')}.png`),
    path.join(left40, `left_${String(index).padStart(3, '0')}.png`)
  );
}

const leftMp4 = path.join(previewRoot, 'sd3_VOICEOVER_ONLY_images_LEFT.mp4');
const rightSrc = path.join(previewRoot, 'sd3_voice_content_real_20x20_test.mp4');
const rightCopy = path.join(previewRoot, 'sd3_Defourm_side_RIGHT.mp4');
const outMp4 = path.join(previewRoot, 'sd3_VOICEOVER_ONLY_images_LEFT_vs_Defourm_side_RIGHT.mp4');
copyFileSync(rightSrc, rightCopy);

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', path.join(left40, 'left_%03d.png'), '-vf', 'scale=256:512,setsar=1', '-frames:v', '40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', leftMp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', leftMp4, '-i', rightCopy, '-filter_complex', '[0:v]scale=256:512,setsar=1[left];[1:v]scale=256:512,setsar=1[right];[left][right]hstack=inputs=2', '-frames:v', '40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outMp4, '-frames:v', '1', path.join(previewRoot, 'sd3_VOICEOVER_ONLY_images_LEFT_vs_Defourm_side_RIGHT_first.png')], { stdio: 'inherit' });

const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', outMp4], { encoding: 'utf8' });
const meta = JSON.parse(probe);
console.log(JSON.stringify({
  file: path.basename(outMp4),
  width: meta.streams?.[0]?.width,
  height: meta.streams?.[0]?.height,
  frames: meta.streams?.[0]?.nb_frames,
  fps: meta.streams?.[0]?.r_frame_rate,
  duration: meta.format?.duration,
  voiceBeatsUsed: beats.length
}, null, 2));