import { existsSync, mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_MALE_SOURCE_FACES_V97';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_MALE_TO_FEMALE_CLEAN_FACES_V101';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_MALE_TO_FEMALE_CLEAN_FACES_V101_contact.jpg');

const prompt = [
  'one adult human woman, natural human skin, clearly female',
  'gender-swapped female version of the input, same pose composition crop and lighting',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level',
  'fixed camera and crop, forehead hairline chin neck and both shoulders fully visible',
  'dark simple smooth clothing, plain dark background, no jewelry, no earrings, bare neck',
  'neutral expression, lips gently closed, no smile',
  'muted cool blue V6 CRT tint, clean dark blue-gray background',
  'restrained photographic realism, silver gelatin portrait, sharp coherent facial anatomy, direct camera gaze'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, mismatched eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, melted face, warped face, deformed face, stretched face, duplicated features',
  'man, male, masculine face, beard, mustache, stubble, facial hair, broad jaw, adam apple',
  'earrings, dangling earrings, jewelry, necklace, pendant, choker, piercing, rings, bracelet',
  'textured fabric, patterned clothing, lace, knit, print, buttons, collar detail, sequins, embroidery',
  'smile, smiling, teeth, open mouth, laughing',
  'two people, second face, duplicate face, identity drift, child',
  'mask, porcelain skin, plastic skin, android, painted face, cracked skin, damaged skin, scars, lesions',
  'red lipstick, bright lipstick, profile, three-quarter view, tilted head, looking away, cropped head',
  'grid texture, CRT grid, scanlines, screen door, moire, mesh, patterned skin, heavy grain, image noise',
  'scenery, objects, text, watermark, logo, border, distorted anatomy'
].join(', ');

function sourcePath(index) {
  return path.join(sourceDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
}
function outputPath(index) {
  return path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
}

for (let index = 0; index < 12; index += 1) {
  if (!existsSync(sourcePath(index))) throw new Error(`Missing male source face: ${sourcePath(index)}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < 12; index += 1) {
  const outPath = outputPath(index);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(index)).toString('base64')],
      prompt: [prompt, 'female version with clean eyes, stable facial anatomy, no jewelry'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.65,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 719401000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Clean female face ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Clean female face ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V101 clean female face ${index + 1}/12 from male face ${index + 1}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'single_figure_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=4x3', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFaces: 12, sourceSet: 'V97-male', outputDir, contact, denoisingStrength: 0.65, restoreFaces: true }, null, 2));
