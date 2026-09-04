import { existsSync, mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_V6_TWENTY_NEW_FACES_CUDA_V91_20SEC';
const sourceFiles = ['voc_face_0018.png', 'voc_face_0019.png', 'voc_face_0020.png'];
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_ANDROGYNOUS_LAST3_V92_CUDA_V95_20SEC';
const contact = path.join(previewRoot, 'androids_dream_VOC_ANDROGYNOUS_LAST3_V92_CUDA_V95_20SEC_contact.jpg');

const basePrompt = [
  'one androgynous person, ambiguous gender, balanced blend of masculine and feminine features',
  'close-up frontal face portrait, face fills the frame, direct steady gaze into camera',
  'pale luminous skin, cold blue monochrome color grade, dark near-black background',
  'dramatic frontal lighting emphasizing the eyes and facial contours, stylized music-video still',
  'sharp coherent facial anatomy, eyes level and same size, pupils aligned, both eyes fully visible',
  'clean photographic realism, no texture, no grain'
].join(', ');
const negativePrompt = [
  'asymmetrical eyes, uneven eyes, mismatched eyes, crossed eyes, lazy eye, extra eye, missing eye, distorted pupils',
  'blurred eyes, closed eyes, melted face, warped face, deformed face, stretched face, duplicated features',
  'beard, mustache, facial hair, long flowing hair, hyperfeminine makeup, clearly female, clearly male',
  'two people, second face, duplicate face, identity drift',
  'mask, porcelain skin, plastic skin, android, painted face, cracked skin, damaged skin, scars, lesions',
  'profile, three-quarter view, tilted head, looking away, cropped head',
  'grid texture, CRT grid, scanlines, screen door, moire, mesh, patterned skin, heavy grain, image noise',
  'scenery, objects, text, watermark, logo, border, distorted anatomy'
].join(', ');

const descriptors = [
  'dark lips, heavy dark eye makeup, hair pulled back, intense gaze',
  'short dark hair, subtle calm expression, soft direct gaze',
  'smoky dark eye shadow, slicked-back hair, steady stare',
  'cropped dark hair, faint neutral mouth, wide clear eyes',
  'dark matte lips, sculpted cheeks, slicked hair, piercing gaze',
  'tousled short dark hair, understated look, even level eyes',
  'high cheekbones, dark lip color, tight pulled-back hair, unblinking centered stare',
  'short side-swept hair, gentle eyes, minimal expression',
  'strong jawline, dark smoky eyes, hair scraped back, cool confident gaze',
  'close-cropped hair, calm gaze, pale smooth skin',
  'kohl-lined eyes, deep dark lips, hair gelled back, frontal stare',
  'short layered dark hair, subtle mouth, direct gentle gaze',
  'sculpted profile, dark eyeliner, short slicked hair, intense focus',
  'short wavy dark hair, relaxed brows, steady eyes',
  'sharp cheekbones, matte dark lips, pulled-back hair, bold centered stare',
  'cropped fringe, soft direct gaze, neutral lips',
  'heavy dark eye makeup, tight hairstyle, striking frontal look',
  'short neat dark hair, calm even features, level eyes',
  'dark lips and smoky eyes, hair swept back, fixed gaze',
  'short dark hair, faint expression, clear direct eyes'
];

function sourcePath(file) {
  return path.join(sourceDir, file);
}
function outputPath(index) {
  return path.join(outputDir, `andro_face_${String(index + 1).padStart(4, '0')}.png`);
}

for (const file of sourceFiles) {
  if (!existsSync(sourcePath(file))) throw new Error(`Missing V91 source face: ${sourcePath(file)}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < 20; index += 1) {
  const outPath = outputPath(index);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  const sourceFile = sourceFiles[index % sourceFiles.length];
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(sourceFile)).toString('base64')],
      prompt: [basePrompt, descriptors[index], 'based on the input face, androgynous, clean eyes and stable facial anatomy'].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.40,
      steps: 36,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 717901000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Androgynous face ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Androgynous face ${index + 1} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V95 androgynous face ${index + 1}/20 from ${sourceFile}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'andro_face_%04d.png'),
  '-vf', 'scale=256:256:flags=lanczos,tile=5x4', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ generatedFrames: 20, sourceFaces: sourceFiles, mode: 'img2img-androgynous-last3-v92', outputDir, contact, denoisingStrength: 0.40, restoreFaces: true }, null, 2));
