import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_FACES_V105';
const outPath = path.join(outputDir, 'single_figure_0010.png');
mkdirSync(outputDir, { recursive: true });

const prompt = [
  'one adult human woman, natural human skin, clearly female',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level',
  'fixed tight crop showing only face neck and bare shoulders, no visible clothing',
  'deep pure black background, empty black negative space',
  'bright clearly lit face, high contrast, face separated from black background',
  'muted cool blue V6 tint on the face, restrained photographic realism, silver gelatin portrait',
  'neutral expression, lips gently closed, no jewelry, no headwear, sharp coherent facial anatomy'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, blurred face, melted face, warped face, deformed face, duplicated features',
  'man, male, beard, mustache, stubble, facial hair',
  'headwear, veil, hat, hood, headscarf, tiara, ornate collar, collar, lace',
  'gray background, light background, washed out, low contrast',
  'collared shirt, formal attire, suit, jacket, necktie, visible clothing',
  'earrings, jewelry, necklace, pendant, choker',
  'smile, smiling, teeth, open mouth',
  'two people, second face, duplicate face, child',
  'mask, plastic skin, android, painted face, cracked skin',
  'red lipstick, profile, tilted head, looking away, cropped head',
  'grid texture, scanlines, moire, mesh, grain, noise, scenery, text, watermark, distorted anatomy'
].join(', ');

const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    prompt,
    negative_prompt: negativePrompt,
    steps: 36,
    cfg_scale: 6,
    width: 512,
    height: 512,
    sampler_name: 'DPM++ 2M',
    scheduler: 'Karras',
    restore_faces: true,
    seed: 720601000,
    batch_size: 1,
    n_iter: 1,
    save_images: false
  })
});
if (!response.ok) throw new Error(`Face 10 txt2img: ${response.status} ${await response.text()}`);
const json = await response.json();
const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
if (!encoded) throw new Error('Face 10 returned no image');
writeFileSync(outPath, Buffer.from(encoded, 'base64'));
console.log(`generated fresh V6 female face 10 -> ${outPath}`);
