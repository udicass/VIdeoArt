import { existsSync, mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_MALE_SOURCE_FACES_V97';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_MALE_SOURCE_FACES_V97_contact.jpg');

const descriptors = [
  'short dark hair, strong jaw, calm level eyes, neutral mouth',
  'cropped dark hair, high forehead, wide-set gray eyes, faint stubble',
  'slicked-back dark hair, angular cheekbones, steady direct gaze',
  'short wavy dark hair, fuller face, relaxed brows, subtle mouth',
  'clean-shaven with short hair, defined chin, intense centered gaze',
  'longer side-swept dark hair, narrow face, deep-set calm eyes',
  'buzzed hair, broad brow, firm neutral mouth, even features',
  'short textured hair, rounded jaw, gentle direct gaze',
  'neat side part dark hair, sculpted features, level steady eyes',
  'loose short hair, mature face with fine lines, composed gaze',
  'tousled dark hair, youthful face, bright attentive eyes',
  'short dark hair with slight fringe, balanced face, clear gaze'
];

const prompt = [
  'one adult human man, natural human skin, clearly human',
  'same exact recurring man in every image, exact face identity and proportions',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level',
  'fixed camera and crop, forehead hairline chin neck and both shoulders fully visible',
  'clean dark background, muted cool blue V6 CRT tint, restrained photographic realism',
  'silver gelatin portrait, sharp coherent facial anatomy, direct camera gaze'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, mismatched eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, melted face, warped face, deformed face, stretched face, duplicated features',
  'two people, second face, duplicate face, identity drift, woman, female, child',
  'beard, heavy beard, long hair, mask, porcelain skin, plastic skin, android, painted face',
  'cracked skin, damaged skin, scars, lesions, red lipstick, bright lipstick',
  'profile, three-quarter view, tilted head, looking away, cropped head',
  'grid texture, CRT grid, scanlines, screen door, moire, mesh, patterned skin, heavy grain, image noise',
  'scenery, objects, text, watermark, logo, border, distorted anatomy'
].join(', ');

function outputPath(index) {
  return path.join(outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < 12; index += 1) {
  const outPath = outputPath(index);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: [prompt, descriptors[index], 'clean eyes and stable facial anatomy'].join(', '),
      negative_prompt: negativePrompt,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 718101000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Male face ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Male face ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V97 male face ${index + 1}/12\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'single_figure_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=4x3', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFaces: 12, outputDir, contact, steps: 36, restoreFaces: true }, null, 2));
