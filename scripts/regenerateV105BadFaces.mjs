import { existsSync, mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_MALE_SOURCE_FACES_V97';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_FACES_V105';
const targets = [10]; // 1-based face indices to regenerate

const prompt = [
  'one adult human woman, natural human skin, clearly and unmistakably female',
  'gender-swapped female version of the input, same pose composition and crop',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level',
  'fixed tight crop showing only face neck and bare shoulders, no visible clothing, no collar',
  'deep pure black background, empty black negative space',
  'bright clearly lit face, high contrast, face clearly separated from the black background',
  'no headwear, no veil, no hat, no hood, bare head and hair only',
  'muted cool blue V6 tint on the face, restrained photographic realism',
  'neutral expression, lips gently closed, no jewelry, sharp coherent facial anatomy'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, blurred face, melted face, warped face, deformed face, duplicated features',
  'man, male, beard, mustache, stubble, facial hair, broad jaw, adam apple',
  'headwear, veil, hat, hood, headscarf, tiara, headband, ornate collar, collar, lace, fabric over head',
  'gray background, light background, washed out, low contrast, flat lighting',
  'collared shirt, formal attire, suit, jacket, necktie, tie, buttons, zipper, visible clothing',
  'earrings, jewelry, necklace, pendant, choker, piercing',
  'smile, smiling, teeth, open mouth',
  'two people, second face, duplicate face, child',
  'mask, plastic skin, android, painted face, cracked skin, damaged skin',
  'red lipstick, profile, tilted head, looking away, cropped head',
  'grid texture, scanlines, moire, mesh, grain, noise, scenery, text, watermark, distorted anatomy'
].join(', ');

mkdirSync(outputDir, { recursive: true });
for (const face of targets) {
  const src = path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
  const out = path.join(outputDir, `single_figure_${String(face).padStart(4, '0')}.png`);
  if (!existsSync(src)) throw new Error(`Missing male source: ${src}`);
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(src).toString('base64')],
      prompt: [prompt, 'clean bare head, clearly female'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.68,
      steps: 38,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 720401000 + face,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Face ${face}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Face ${face} returned no image`);
  writeFileSync(out, Buffer.from(encoded, 'base64'));
  process.stdout.write(`regenerated V105 face ${face}/12\n`);
}
console.log(JSON.stringify({ regenerated: targets, outputDir }, null, 2));
