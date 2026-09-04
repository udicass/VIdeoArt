import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_MAJOR_DIVERSITY_CLEAR_PHOTOBOOTH_CUDA_V61';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_25SEC';
const anchorDir = path.join(outputDir, '_clean_identities');
const cleanMovie = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_25SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_STROBE_25SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_STROBE_25SEC_contact.jpg');
const anchorContact = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_anchors_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_clean_skin_v67_temp.mp4');
const identities = [1, 2, 3, 5, 6, 7];
const schedule = [...Array(5).fill(1), ...Array(4).fill(2), ...Array(4).fill(3), ...Array(4).fill(5), ...Array(4).fill(6), ...Array(4).fill(7)];
const basePrompt = timeline.base_prompt
  .replace('same exact recurring woman from the V6 input frame, exact face identity and proportions', 'faithfully preserve the exact identity from this input image')
  .replace('subtle scanline texture', 'smooth natural skin, clean photographic surface');
const negativePrompt = [
  timeline.negative_prompt,
  'scanlines, CRT grid, moire, mesh texture, screen door texture, face grid, heavy grain, noise, skin texture pattern'
].join(', ');

function sourcePath(identity) {
  return path.join(sourceDir, `clear_face_${String(identity).padStart(4, '0')}.png`);
}
function anchorPath(identity) {
  return path.join(anchorDir, `clean_face_${String(identity).padStart(4, '0')}.png`);
}

for (const identity of identities) {
  if (!existsSync(sourcePath(identity))) throw new Error(`Missing V61 source face: ${sourcePath(identity)}`);
}
if (schedule.length !== 25 || timeline.beats.length < 25) throw new Error('V67 requires 25 V47 beats and source assignments');
mkdirSync(outputDir, { recursive: true });
mkdirSync(anchorDir, { recursive: true });

async function generate(payload, label) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`${label}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`${label} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < identities.length; index += 1) {
  const identity = identities[index];
  const outPath = anchorPath(identity);
  if (existsSync(outPath)) continue;
  const image = await generate({
    init_images: [readFileSync(sourcePath(identity)).toString('base64')],
    prompt: [basePrompt, 'centered blue photo-booth portrait, sharp clear eyes, smooth natural skin, no digital screen texture'].join(', '),
    negative_prompt: negativePrompt,
    denoising_strength: 0.24,
    steps: 28,
    cfg_scale: 6,
    width: timeline.generation.width,
    height: timeline.generation.height,
    sampler_name: timeline.generation.sampler,
    scheduler: timeline.generation.scheduler,
    restore_faces: false,
    seed: 713389000 + index,
    batch_size: 1,
    n_iter: 1,
    save_images: false
  }, `Clean anchor ${identity}`);
  writeFileSync(outPath, image);
  process.stdout.write(`generated V67 smooth-skin identity ${identity}\n`);
}

for (let index = 0; index < schedule.length; index += 1) {
  const identity = schedule[index];
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const image = await generate({
    init_images: [readFileSync(anchorPath(identity)).toString('base64')],
    prompt: [basePrompt, timeline.beats[index], 'preserve smooth skin and this exact identity, only mild natural expression and light variation'].join(', '),
    negative_prompt: negativePrompt,
    denoising_strength: 0.06,
    steps: timeline.generation.steps,
    cfg_scale: timeline.generation.cfg_scale,
    width: timeline.generation.width,
    height: timeline.generation.height,
    sampler_name: timeline.generation.sampler,
    scheduler: timeline.generation.scheduler,
    restore_faces: false,
    seed: 713390000 + index,
    batch_size: 1,
    n_iter: 1,
    save_images: false
  }, `Frame ${index + 1}`);
  writeFileSync(outPath, image);
  process.stdout.write(`generated V67 frame ${index + 1}/25 from clean identity ${identity}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'continuation_%04d.png'),
  '-vf', 'minterpolate=fps=10:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=2,fps=10,format=yuv420p',
  '-t', '25', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', cleanMovie
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', cleanMovie,
  '-vf', "eq=brightness='0.025*sin(2*PI*t*4)+0.012*sin(2*PI*t*9)':contrast='1.03+0.025*sin(2*PI*t*4)':eval=frame,format=yuv420p",
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', anchorPath(1), '-i', anchorPath(2), '-i', anchorPath(3), '-i', anchorPath(5), '-i', anchorPath(6), '-i', anchorPath(7),
  '-filter_complex', '[0:v][1:v][2:v][3:v][4:v][5:v]hstack=inputs=6', '-frames:v', '1', '-update', '1', anchorContact
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ identities, beatsUsed: 25, keyframes: 25, cleanMovie, output, contact, anchorContact, durationSec: 25 }, null, 2));