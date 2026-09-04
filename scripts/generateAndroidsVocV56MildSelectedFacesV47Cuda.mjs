import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_SELECTED_FACES_CUDA_V56_MILD_V47_25SEC';
const output = path.join(previewRoot, 'androids_dream_VOC_V6_SELECTED_FACES_CUDA_V56_MILD_V47_25SEC_TEST_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_SELECTED_FACES_CUDA_V56_MILD_V47_25SEC_TEST_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_selected_faces_v56_mild_v47_25sec_test_temp.mp4');
const fps = 10;
const selectedFaces = [
  ...Array(7).fill(1),
  ...Array(6).fill(2),
  ...Array(6).fill(3),
  ...Array(6).fill(6)
];
const basePrompt = timeline.base_prompt.replace(
  'same exact recurring woman from the V6 input frame, exact face identity and proportions',
  'faithfully preserve the exact selected V6 face identity, hair, crop, lighting, lip color, and proportions from this input image'
);
const negativePrompt = timeline.negative_prompt
  .replace('red lipstick, bright lipstick, colored lips, red mouth, painted lips, ', '');

function sourcePath(face) {
  return path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
}

for (const face of [1, 2, 3, 6]) {
  if (!existsSync(sourcePath(face))) throw new Error(`Missing selected V6 face: ${sourcePath(face)}`);
}
if (timeline.beats.length < 25 || selectedFaces.length !== 25) throw new Error('V56 requires 25 V47 beats and source assignments');
mkdirSync(outputDir, { recursive: true });

async function generate(index, face) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(face)).toString('base64')],
      prompt: [
        basePrompt,
        timeline.beats[index],
        'only a mild natural micro-expression or light variation, no face morph, no identity change, no new person'
      ].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.08,
      steps: timeline.generation.steps,
      cfg_scale: timeline.generation.cfg_scale,
      width: timeline.generation.width,
      height: timeline.generation.height,
      sampler_name: timeline.generation.sampler,
      scheduler: timeline.generation.scheduler,
      restore_faces: false,
      seed: 713379000 + index,
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

for (let index = 0; index < selectedFaces.length; index += 1) {
  const outPath = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generate(index, selectedFaces[index]));
  process.stdout.write(`generated V56 mild variation ${index + 1}/25 from face ${selectedFaces[index]}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'continuation_%04d.png'),
  '-vf', `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', `tpad=stop_mode=clone:stop_duration=2,fps=${fps},format=yuv420p`,
  '-t', '25', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ selectedFaces: [1, 2, 3, 6], beatsUsed: 25, keyframes: 25, denoisingStrength: 0.08, output, contact, durationSec: 25 }, null, 2));