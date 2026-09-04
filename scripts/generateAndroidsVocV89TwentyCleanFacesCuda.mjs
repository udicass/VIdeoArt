import { existsSync, mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-12\\androids_dream_VOC_V6_TWENTY_CLEAN_NEW_FACES_CUDA_V89';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_TWENTY_CLEAN_NEW_FACES_CUDA_V89_contact.jpg');
const sourceFaces = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const sourceFor = Array.from({ length: 20 }, (_, index) => sourceFaces[index % sourceFaces.length]);
const variations = [
  'slightly narrower oval face, balanced eyes', 'broader cheekbones, level eyes',
  'subtle square jaw, calm neutral mouth', 'longer face, natural symmetric brows',
  'rounded jaw, clear direct gaze', 'pronounced cheekbones, centered eyes',
  'heart-shaped face, relaxed eyelids', 'strong angular jaw, neutral lips',
  'soft fuller face, balanced facial proportions', 'long narrow face, even brows',
  'mature face with subtle natural lines, steady eyes', 'compact oval face, calm expression',
  'broad forehead, relaxed jaw, centered gaze', 'high cheekbones, symmetrical eyes',
  'soft square face, straight dark hair', 'delicate oval face, clear eyes',
  'rounded cheekbones, restrained empathy', 'angular face, centered direct gaze',
  'longer chin, relaxed neutral mouth', 'balanced oval face, thoughtful eyes'
];
const prompt = [
  'one distinct new adult human woman, clearly different identity from the input but V6-compatible',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level and same size, pupils aligned, both eyes fully visible',
  'fixed camera and crop, forehead hairline chin neck and shoulders visible, natural smooth human skin',
  'muted cool blue V6 lighting, clean gray-blue background, subtle vertical crown light above forehead',
  'sharp coherent facial anatomy, clean photographic realism, direct camera gaze'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, mismatched eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, melted face, warped face, deformed face, stretched face, duplicated features',
  'same face as input, duplicate face, face swap, identity drift, two people, second face, male, child',
  'mask, porcelain skin, plastic skin, android, painted face, cracked skin, damaged skin, scars, lesions',
  'red lipstick, bright lipstick, profile, three-quarter view, tilted head, looking away, cropped head',
  'grid texture, CRT grid, scanlines, screen door, moire, mesh, patterned skin, heavy grain, image noise',
  'scenery, objects, text, watermark, logo, border, distorted anatomy'
].join(', ');

function sourcePath(face) {
  return path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
}
function outputPath(index) {
  return path.join(outputDir, `new_face_${String(index + 1).padStart(4, '0')}.png`);
}

for (const face of sourceFaces) {
  if (!existsSync(sourcePath(face))) throw new Error(`Missing V6 source face: ${sourcePath(face)}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < 20; index += 1) {
  const outPath = outputPath(index);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(sourceFor[index])).toString('base64')],
      prompt: [prompt, variations[index], 'new identity with clean eyes and stable facial anatomy'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.40,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 713401000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Clean face ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Clean face ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V89 clean face ${index + 1}/20 from V6 face ${sourceFor[index]}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'new_face_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=5x4', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFaces: 20, sourceFaces: 12, outputDir, contact, denoisingStrength: 0.40, restoreFaces: true }, null, 2));