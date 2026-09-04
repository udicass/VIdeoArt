import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const planPath = path.join(root, 'prompts', 'androids_dream_VOC_V6_SOURCE_FACES_V49_120SEC.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const timelinePath = path.join(root, plan.prompt_timeline);
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const frameCount = plan.duration_seconds;
const fps = 10;
const continuationDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_SOURCE_FACES_CUDA_V49_120SEC_keyframes';
const output = path.join(previewRoot, 'androids_dream_VOC_V6_SOURCE_FACES_CUDA_V49_120SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_SOURCE_FACES_CUDA_V49_120SEC_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_source_faces_v49_120sec_temp.mp4');
const negativePrompt = [timeline.negative_prompt, plan.negative_prompt_additions].join(', ');

if (timeline.beats.length < frameCount) throw new Error(`Timeline only has ${timeline.beats.length} beats for ${frameCount} seconds`);
if (plan.source_face_cycle.length === 0) throw new Error('V49 source face cycle is empty');
for (const sourceFile of plan.source_face_cycle) {
  const sourcePath = path.join(plan.source_face_directory, sourceFile);
  if (!existsSync(sourcePath)) throw new Error(`Missing approved V6 source face: ${sourcePath}`);
}
mkdirSync(continuationDir, { recursive: true });

function sourceFor(index) {
  return path.join(plan.source_face_directory, plan.source_face_cycle[index % plan.source_face_cycle.length]);
}

function promptFor(index) {
  return [plan.base_prompt_override, timeline.beats[index]].join(', ');
}

async function generateFrame(index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourceFor(index)).toString('base64')],
      prompt: promptFor(index),
      negative_prompt: negativePrompt,
      denoising_strength: plan.generation.denoising_strength,
      steps: plan.generation.steps,
      cfg_scale: plan.generation.cfg_scale,
      width: plan.generation.width,
      height: plan.generation.height,
      sampler_name: plan.generation.sampler,
      scheduler: plan.generation.scheduler,
      restore_faces: false,
      seed: plan.generation.seed_start + index,
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

for (let index = 0; index < frameCount; index += 1) {
  const outPath = path.join(continuationDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generateFrame(index));
  process.stdout.write(`generated V49 ${index + 1}/${frameCount} from ${path.basename(sourceFor(index))}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(continuationDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=2,fps=${fps},format=yuv420p`,
  '-t', String(frameCount), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,40))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ planPath, timelinePath, sourceFaces: plan.source_face_cycle.length, keyframes: frameCount, output, contact, durationSec: frameCount }, null, 2));