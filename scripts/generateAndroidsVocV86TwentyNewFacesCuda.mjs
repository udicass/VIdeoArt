import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-12\\androids_dream_VOC_V6_TWENTY_NEW_FACES_CUDA_V86';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_TWENTY_NEW_FACES_CUDA_V86_contact.jpg');
const sourceFaces = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const sourceFor = Array.from({ length: 20 }, (_, index) => sourceFaces[index % sourceFaces.length]);
const variations = [
  'slightly narrower oval face, soft straight brows',
  'broader cheekbones, calm level eyes',
  'subtle square jaw, short dark bob',
  'longer face, swept-back dark hair',
  'rounded jaw, gentle observant gaze',
  'pronounced cheekbones, close-cropped dark hair',
  'heart-shaped face, shoulder-length dark hair',
  'strong angular jaw, neutral lips',
  'soft fuller face, natural brows',
  'long narrow face, dark hair tucked behind ears',
  'mature face with fine natural lines, steady gaze',
  'compact oval face, quiet direct expression',
  'broad forehead, relaxed jaw, short hair',
  'high cheekbones, slightly hooded eyes',
  'soft square face, straight dark hair',
  'delicate oval face, reflective eyes',
  'rounded cheekbones, restrained empathy',
  'angular face, close dark bob',
  'longer chin, calm neutral mouth',
  'balanced oval face, thoughtful direct gaze'
];
const prompt = [
  'one distinct new adult human woman, clearly different facial identity from the input but fully V6-compatible',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, fixed camera and crop, forehead hairline chin neck and shoulders visible',
  'natural human skin, smooth clean photographic surface, restrained silver-gelatin realism',
  'muted cool blue V6 lighting, dark gray-blue background, subtle vertical crown light effect above the forehead',
  'coherent facial anatomy, direct camera gaze, no pose change, no scene change'
].join(', ');
const negativePrompt = [
  'same exact face as input, duplicate face, face swap, identity drift, two people, second face, extra eyes',
  'male, child, mask, porcelain skin, plastic skin, android, painted face, red lipstick, bright lipstick',
  'profile, three-quarter view, tilted head, looking away, cropped forehead, cropped chin, cropped shoulders',
  'grid texture, CRT grid, scanlines, screen door, moire, mesh, patterned skin, heavy grain, image noise',
  'scenery, architecture, objects, text, watermark, logo, border, distorted face, melted face'
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
      prompt: [prompt, variations[index], 'create a new identity while retaining the V6 visual language'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.52,
      steps: 32,
      cfg_scale: 6.5,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 713400000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`New face ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`New face ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V86 new face ${index + 1}/20 from V6 face ${sourceFor[index]}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'new_face_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=5x4', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFaces: 20, sourceFaces: 12, outputDir, contact, denoisingStrength: 0.52 }, null, 2));