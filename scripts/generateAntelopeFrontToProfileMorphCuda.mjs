import { existsSync, mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_BLUEGRAY_TURN_CUDA_V113_20SEC';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_FRONT_TO_PROFILE_CUDA_V115_20SEC';
const contact = path.join(previewRoot, 'antelope_V6_FRONT_TO_PROFILE_CUDA_V115_20SEC_contact.jpg');
const front = path.join(sourceDir, 'single_figure_0001.png');
const profile = path.join(sourceDir, 'single_figure_0002.png');
const angles = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 82, 90];
const prompt = [
  'one solitary adult antelope, same animal identity throughout, clean wildlife studio portrait',
  'head and upper neck, fixed scale, centered composition, deep black background',
  'muted cool blue-gray monochrome V6 tint, silver gelatin realism, clean minimal image',
  'clear coherent antelope anatomy, sharp eye and muzzle, no other animals or objects'
].join(', ');
const negativePrompt = [
  'multiple animals, duplicate animal, horse, deer, goat, cow, dog, fantasy creature',
  'landscape, grass, trees, rocks, ground, scenery, objects, gray background, textured background',
  'extra horns, broken horns, extra head, malformed muzzle, distorted anatomy, cropped head',
  'brown, orange, red, green, warm color, saturated color, grain, noise, grid, text, watermark'
].join(', ');
function out(index) { return path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`); }
if (!existsSync(front) || !existsSync(profile)) throw new Error('Missing front/profile anchors');
mkdirSync(outputDir, { recursive: true });
for (let index = 0; index < angles.length; index += 1) {
  const output = out(index);
  if (existsSync(output)) { process.stdout.write(`skip ${path.basename(output)}\n`); continue; }
  const t = index / (angles.length - 1);
  const blendPath = path.join(outputDir, `_blend_${String(index + 1).padStart(4, '0')}.png`);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', front, '-i', profile,
    '-filter_complex', `[0:v][1:v]blend=all_expr='A*(1-${t})+B*${t}'`,
    '-frames:v', '1', blendPath
  ], { stdio: 'inherit' });
  const blended = readFileSync(blendPath);
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [blended.toString('base64')],
      prompt: [prompt, `controlled turn from frontal view to exact right profile, ${angles[index]} degrees`, 'preserve one antelope'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.28,
      steps: 32,
      cfg_scale: 5.5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M', scheduler: 'Karras', restore_faces: false,
      seed: 722001000 + index, batch_size: 1, n_iter: 1, save_images: false
    })
  });
  if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V115 frame ${index + 1}/12 angle=${angles[index]}\n`);
}
execFileSync('ffmpeg', ['-y','-loglevel','error','-framerate','1','-i',path.join(outputDir,'single_figure_%04d.png'),'-vf','scale=256:256:flags=lanczos,tile=4x3','-frames:v','1','-update','1',contact],{stdio:'inherit'});
console.log(JSON.stringify({ generatedFrames: 12, front, profile, outputDir, contact }, null, 2));
