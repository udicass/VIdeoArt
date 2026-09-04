import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_FACE_RESTORED_CUDA_V71';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_GRIDFREE_CUDA_V72_25SEC';
const cleanMovie = path.join(previewRoot, 'androids_dream_VOC_V6_GRIDFREE_CUDA_V72_25SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_GRIDFREE_CUDA_V72_STROBE_25SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_GRIDFREE_CUDA_V72_STROBE_25SEC_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_gridfree_v72_temp.mp4');
const identities = [2, 3, 5, 7];
const schedule = [...Array(7).fill(2), ...Array(6).fill(3), ...Array(6).fill(5), ...Array(6).fill(7)];
const basePrompt = timeline.base_prompt
  .replace('same exact recurring woman from the V6 input frame, exact face identity and proportions', 'faithfully preserve the exact identity from this smooth input image')
  .replace('subtle scanline texture', 'smooth natural skin and a clean photographic surface');
const negativePrompt = [timeline.negative_prompt, 'scanlines, CRT grid, screen door texture, moire, mesh texture, face grid, heavy grain, image noise'].join(', ');

function sourcePath(identity) {
  return path.join(sourceDir, `restored_face_${String(identity).padStart(4, '0')}.png`);
}

for (const identity of identities) {
  if (!existsSync(sourcePath(identity))) throw new Error(`Missing grid-free V71 anchor: ${sourcePath(identity)}`);
}
if (schedule.length !== 25 || timeline.beats.length < 25) throw new Error('V72 requires 25 V47 beats and source assignments');
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < schedule.length; index += 1) {
  const identity = schedule[index];
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(identity)).toString('base64')],
      prompt: [basePrompt, timeline.beats[index], 'only a minimal natural expression or light variation, preserve smooth skin and identity'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.035,
      steps: 24,
      cfg_scale: 5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 713392000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V72 grid-free frame ${index + 1}/25 from identity ${identity}\n`);
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
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ identities, beatsUsed: 25, keyframes: 25, output, contact, durationSec: 25 }, null, 2));