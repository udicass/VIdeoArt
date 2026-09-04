import { existsSync, mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_FRESH_FIGURES_CUDA_V93_20SEC';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_FRESH_FIGURES_CUDA_V93_20SEC_contact.jpg');

const figures = [
  'tall young woman with a short platinum bob, high sculpted cheekbones, silver eyes, calm direct gaze',
  'woman with waist-length straight dark hair, heart-shaped face, arched brows, soft blue-lit skin',
  'woman with a sleek low bun, angular jaw, wide-set gray eyes, minimal makeup',
  'woman with chin-length wavy hair, round soft face, freckles, gentle neutral mouth',
  'woman with a cropped pixie cut, sharp features, luminous pale skin, steady level eyes',
  'woman with long loose waves, oval face, full brows, restrained warm-neutral expression',
  'woman with a side-parted shoulder bob, square jaw, clear blue-gray gaze, confident neutral mouth',
  'woman with an intricate braided updo, high forehead, pronounced brow ridge, calm expression',
  'woman with straight shoulder-length hair and curtain bangs, narrow face, deep-set eyes',
  'woman with a voluminous curly afro, rounded cheeks, bright clear eyes, soft smile-less mouth',
  'woman with slicked-back short hair, prominent cheekbones, strong defined jawline',
  'woman with a center-parted long straight style, delicate features, small mouth, level eyes',
  'woman with a tousled short crop, wide forehead, hooded calm eyes, neutral lips',
  'woman with a classic blunt fringe, symmetrical oval face, bright silver-blue eyes',
  'woman with long hair pulled back, elegant neck, refined bone structure, soft crown light',
  'woman with a loose low ponytail, balanced face, subtle natural lips, centered gaze',
  'woman with a choppy layered cut, youthful rounded features, bright attentive eyes',
  'woman with an asymmetric bob, mature composed face, gentle fine lines, steady gaze',
  'woman with a formal French twist, statuesque profile-facing frontal pose, clear eyes',
  'woman with a glossy deep side part, strong brow, full lips in neutral, calm gaze'
];

const prompt = [
  'one entirely new adult human woman, completely new figure and face, no resemblance to any existing V6 or V89 identity',
  'fresh new look and feel, new hairstyle and bone structure, distinct unique identity',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level and same size, pupils aligned, both eyes fully visible',
  'fixed camera and crop, forehead hairline chin neck and shoulders visible, natural smooth human skin',
  'muted cool blue V6-inspired lighting, clean gray-blue background, subtle vertical crown light above forehead',
  'sharp coherent facial anatomy, clean photographic realism, direct camera gaze, silver gelatin portrait feel'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, mismatched eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, melted face, warped face, deformed face, stretched face, duplicated features',
  'same face as any previous frame, duplicate face, identity drift, two people, second face, male, child',
  'mask, porcelain skin, plastic skin, android, painted face, cracked skin, damaged skin, scars, lesions',
  'red lipstick, bright lipstick, profile, three-quarter view, tilted head, looking away, cropped head',
  'grid texture, CRT grid, scanlines, screen door, moire, mesh, patterned skin, heavy grain, image noise',
  'scenery, objects, text, watermark, logo, border, distorted anatomy'
].join(', ');

function outputPath(index) {
  return path.join(outputDir, `fresh_face_${String(index + 1).padStart(4, '0')}.png`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < 20; index += 1) {
  const outPath = outputPath(index);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      prompt: [prompt, figures[index], 'new figure with clean eyes and stable facial anatomy'].join(', '),
      negative_prompt: negativePrompt,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 715701000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Fresh figure ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Fresh figure ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V93 fresh figure ${index + 1}/20\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'fresh_face_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=5x4', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFrames: 20, mode: 'txt2img-fresh', outputDir, contact, steps: 36, restoreFaces: true }, null, 2));
