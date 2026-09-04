import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const promptPath = path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json');
const promptPlan = JSON.parse(readFileSync(promptPath, 'utf8'));
const testSeconds = 25;
const fps = 10;
const continuationDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_CONTINUATION_CUDA_V47_25SEC_TEST_keyframes';
const output = path.join(previewRoot, 'androids_dream_VOC_V6_CONTINUATION_CUDA_V47_25SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_CONTINUATION_CUDA_V47_25SEC_TEST_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_continuation_v47_25sec_test_temp.mp4');

if (!existsSync(promptPlan.anchor)) throw new Error(`Missing V6 anchor: ${promptPlan.anchor}`);
if (promptPlan.beats.length < testSeconds) throw new Error(`V47 needs at least ${testSeconds} beats`);
mkdirSync(continuationDir, { recursive: true });

function promptFor(index) {
  return [promptPlan.base_prompt, promptPlan.beats[index]].join(', ');
}

async function generateFrame(index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(promptPlan.anchor).toString('base64')],
      prompt: promptFor(index),
      negative_prompt: promptPlan.negative_prompt,
      denoising_strength: promptPlan.generation.denoising_strength,
      steps: promptPlan.generation.steps,
      cfg_scale: promptPlan.generation.cfg_scale,
      width: promptPlan.generation.width,
      height: promptPlan.generation.height,
      sampler_name: promptPlan.generation.sampler,
      scheduler: promptPlan.generation.scheduler,
      restore_faces: false,
      seed: promptPlan.generation.seed_start + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < testSeconds; index += 1) {
  const outPath = path.join(continuationDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generateFrame(index));
  process.stdout.write(`generated V47 test continuation ${index + 1}/${testSeconds}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(continuationDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=2,fps=${fps},format=yuv420p`,
  '-t', String(testSeconds), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=320:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ promptPath, anchor: promptPlan.anchor, keyframes: testSeconds, output, contact, durationSec: testSeconds }, null, 2));