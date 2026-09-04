import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_STRONGER_IDENTITIES_CUDA_V58';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_STRONGER_IDENTITIES_CUDA_V58_contact.jpg');
const faces = [
  [1, 'new adult woman with a longer narrower face, softer brows, and short dark hair'],
  [2, 'new adult woman with broad cheekbones, a rounded jaw, and swept-back dark hair'],
  [3, 'new adult woman with a square face, heavier natural brows, and shoulder-length dark hair'],
  [6, 'new adult woman with an oval face, lighter brows, close-cropped dark hair, and neutral dark lips']
];
const basePrompt = timeline.base_prompt.replace(
  'same exact recurring woman from the V6 input frame, exact face identity and proportions',
  'clearly a new distinct adult woman with different facial identity and proportions from the input image'
);
const negativePrompt = timeline.negative_prompt
  .replace('red lipstick, bright lipstick, colored lips, red mouth, painted lips, ', '');

function sourcePath(face) {
  return path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
}

for (const [face] of faces) {
  if (!existsSync(sourcePath(face))) throw new Error(`Missing selected V6 face: ${sourcePath(face)}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < faces.length; index += 1) {
  const [face, identity] = faces[index];
  const outPath = path.join(outputDir, `identity_from_${String(face).padStart(4, '0')}.png`);
  if (existsSync(outPath)) continue;
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(face)).toString('base64')],
      prompt: [basePrompt, identity, 'retain fixed V6 camera crop, dark background, muted cool blue CRT tint, silver gelatin portrait, clean scanline texture'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.42,
      steps: 32,
      cfg_scale: 6.5,
      width: timeline.generation.width,
      height: timeline.generation.height,
      sampler_name: timeline.generation.sampler,
      scheduler: timeline.generation.scheduler,
      restore_faces: false,
      seed: 713382000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Identity ${face}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Identity ${face} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V58 stronger identity from face ${face}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', path.join(outputDir, 'identity_from_0001.png'), '-i', path.join(outputDir, 'identity_from_0002.png'),
  '-i', path.join(outputDir, 'identity_from_0003.png'), '-i', path.join(outputDir, 'identity_from_0006.png'),
  '-filter_complex', '[0:v][1:v][2:v][3:v]hstack=inputs=4', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ faces: faces.map(([face]) => face), outputDir, contact }, null, 2));