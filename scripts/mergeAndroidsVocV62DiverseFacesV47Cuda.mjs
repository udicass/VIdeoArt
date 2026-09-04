import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_MAJOR_DIVERSITY_CLEAR_PHOTOBOOTH_CUDA_V61';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V62_V47_25SEC';
const output = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V62_V47_25SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V62_V47_25SEC_TEST_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_diverse_faces_v62_v47_25sec_test_temp.mp4');
const schedule = [...Array(5).fill(1), ...Array(4).fill(2), ...Array(4).fill(3), ...Array(4).fill(5), ...Array(4).fill(6), ...Array(4).fill(7)];
const basePrompt = timeline.base_prompt.replace(
  'same exact recurring woman from the V6 input frame, exact face identity and proportions',
  'faithfully preserve the exact identity from this diverse V6-style photo-booth input image'
);

function sourcePath(identity) {
  return path.join(sourceDir, `clear_face_${String(identity).padStart(4, '0')}.png`);
}

for (const identity of [1, 2, 3, 5, 6, 7]) {
  if (!existsSync(sourcePath(identity))) throw new Error(`Missing approved V61 identity: ${sourcePath(identity)}`);
}
if (schedule.length !== 25 || timeline.beats.length < 25) throw new Error('V62 requires 25 V47 beats and source assignments');
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
      prompt: [basePrompt, timeline.beats[index], 'only a mild natural expression and light variation, sharp clear photo-booth face'].join(', '),
      negative_prompt: timeline.negative_prompt,
      denoising_strength: 0.08,
      steps: timeline.generation.steps,
      cfg_scale: timeline.generation.cfg_scale,
      width: timeline.generation.width,
      height: timeline.generation.height,
      sampler_name: timeline.generation.sampler,
      scheduler: timeline.generation.scheduler,
      restore_faces: false,
      seed: 713386000 + index,
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
  process.stdout.write(`generated V62 ${index + 1}/25 from identity ${identity}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'continuation_%04d.png'),
  '-vf', 'minterpolate=fps=10:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=2,fps=10,format=yuv420p',
  '-t', '25', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ identities: [1, 2, 3, 5, 6, 7], beatsUsed: 25, keyframes: 25, output, contact, durationSec: 25 }, null, 2));