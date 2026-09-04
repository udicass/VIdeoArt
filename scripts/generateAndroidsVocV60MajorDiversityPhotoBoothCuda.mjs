import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_MAJOR_DIVERSITY_PHOTOBOOTH_CUDA_V60';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_MAJOR_DIVERSITY_PHOTOBOOTH_CUDA_V60_contact.jpg');
const candidates = [
  [1, 'new adult woman, round face, short textured dark hair, soft broad brows'],
  [2, 'new adult woman, long narrow face, shoulder-length wavy dark hair, high cheekbones'],
  [3, 'new adult woman, square jaw, straight blunt dark bob, heavier natural brows'],
  [6, 'new adult woman, oval face, very short dark hair, pronounced cheekbones, dark neutral lips'],
  [1, 'new mature adult woman, short silver-gray hair, fine natural facial lines, calm direct gaze'],
  [2, 'new adult woman, broad face, dense dark curls around the shoulders, gentle level eyes'],
  [3, 'new adult woman, heart-shaped face, long sleek dark hair, narrow straight brows'],
  [6, 'new adult woman, strong angular jaw, close-cropped dark hair, quiet observant eyes']
];
const basePrompt = timeline.base_prompt.replace(
  'same exact recurring woman from the V6 input frame, exact face identity and proportions',
  'a clearly different adult human identity from the input image with coherent natural facial proportions'
);
const negativePrompt = timeline.negative_prompt
  .replace('red lipstick, bright lipstick, colored lips, red mouth, painted lips, ', '')
  .replace('black bar, border, ', '');

function sourcePath(face) {
  return path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
}

for (const [face] of candidates) {
  if (!existsSync(sourcePath(face))) throw new Error(`Missing selected V6 style reference: ${sourcePath(face)}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < candidates.length; index += 1) {
  const [sourceFace, identity] = candidates[index];
  const outPath = path.join(outputDir, `diverse_face_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) continue;
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(sourceFace)).toString('base64')],
      prompt: [
        basePrompt,
        identity,
        'vintage photo booth headshot, centered symmetrical frontal face, direct camera gaze, uniform head-and-shoulders crop',
        'flat dark navy-blue photo booth backdrop, muted cool blue CRT tint, silver gelatin realism, subtle clean scanlines'
      ].join(', '),
      negative_prompt: [negativePrompt, 'same person as input, duplicate face, high angle, low angle, profile, three-quarter view, zoomed in, cropped head, bright background, scenery, text, watermark'].join(', '),
      denoising_strength: 0.58,
      steps: 34,
      cfg_scale: 7,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713384000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Diversity candidate ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Diversity candidate ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V60 diversity candidate ${index + 1}/8\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'diverse_face_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=4x2', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ candidates: candidates.length, outputDir, contact }, null, 2));