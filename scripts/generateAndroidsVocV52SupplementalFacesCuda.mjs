import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_SUPPLEMENTAL_FACES_CUDA_V52';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_SUPPLEMENTAL_FACES_CUDA_V52_contact.jpg');
const candidates = [
  ['single_figure_0001.png', 'new adult woman, softly rounded face, short dark bob, wide-set thoughtful eyes, quiet direct gaze'],
  ['single_figure_0002.png', 'new adult woman, narrow long face, swept-back dark hair, strong natural brows, solemn reflective gaze'],
  ['single_figure_0003.png', 'new adult woman, broad cheekbones, shoulder-length dark hair, gentle neutral expression, steady eyes'],
  ['single_figure_0005.png', 'new adult woman, short cropped dark hair, angular jawline, slightly hooded eyes, reserved calm presence'],
  ['single_figure_0007.png', 'new adult woman, loose wavy dark hair, oval face, soft brows, distant contemplative attention'],
  ['single_figure_0010.png', 'new adult woman, straight dark hair tucked behind both ears, square face, clear level gaze, restrained empathy']
];
const promptBase = [
  'one distinct new adult human woman, natural human skin, clearly a different person than the input image',
  'exact centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level, looking directly into camera',
  'fixed V6 camera distance and portrait crop, forehead hairline chin neck and both shoulders fully visible, no zoom',
  'same dark minimal background, muted cool blue CRT tint, restrained photographic realism, silver gelatin portrait, subtle clean scanline texture',
  'Do Androids Dream of Electric Sheep, empathy and uncertain identity, coherent face anatomy, no scene change'
].join(', ');
const negativePrompt = [
  'same person as input, duplicate face, second face, two people, extra eyes, male, child, red lipstick, painted lips',
  'mask, porcelain, android, plastic skin, face paint, cracked skin, heavy texture, sketch, line art, cartoon',
  'profile, three-quarter view, tilted head, looking away, high angle, low angle, zoomed in, cropped forehead, cropped chin, cropped shoulders',
  'bright background, scenery, architecture, hands, objects, text, watermark, logo, distorted face, melted face, image noise'
].join(', ');

for (const [sourceFile] of candidates) {
  const sourcePath = path.join(sourceDir, sourceFile);
  if (!existsSync(sourcePath)) throw new Error(`Missing V6 style reference: ${sourcePath}`);
}
mkdirSync(outputDir, { recursive: true });

async function generate(index) {
  const [sourceFile, character] = candidates[index];
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(path.join(sourceDir, sourceFile)).toString('base64')],
      prompt: [promptBase, character].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.42,
      steps: 30,
      cfg_scale: 6.5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713373000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Candidate ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Candidate ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < candidates.length; index += 1) {
  const outputPath = path.join(outputDir, `supplemental_face_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outputPath)) {
    process.stdout.write(`skip ${path.basename(outputPath)}\n`);
    continue;
  }
  writeFileSync(outputPath, await generate(index));
  process.stdout.write(`generated V52 supplemental face ${index + 1}/${candidates.length}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'supplemental_face_%04d.png'),
  '-vf', 'scale=384:384:flags=lanczos,tile=3x2', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ outputDir, contact, candidates: candidates.length }, null, 2));