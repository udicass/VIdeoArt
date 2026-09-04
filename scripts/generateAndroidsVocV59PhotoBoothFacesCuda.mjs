import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_PHOTOBOOTH_FACES_CUDA_V59';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_PHOTOBOOTH_FACES_CUDA_V59_contact.jpg');
const faces = [1, 2, 3, 6];
const prompt = [
  'one adult human woman, faithfully preserve the selected input face identity and natural lip color',
  'vintage photo booth headshot, centered symmetrical frontal face, eyes level, direct camera gaze, neutral expression',
  'uniform camera distance, forehead hairline chin neck and shoulders fully visible, no angle, no tilt, no cropped head',
  'flat dark navy-blue photo booth backdrop, muted cool blue CRT tint, silver gelatin photographic realism, subtle scanline texture',
  'Do Androids Dream of Electric Sheep, quiet empathy, clean coherent facial anatomy'
].join(', ');
const negativePrompt = [
  'different person, duplicate face, second face, two people, extra eyes, profile, three-quarter view, tilted head, looking away',
  'high angle, low angle, zoomed in, black wedge, black bar, border, busy background, scenery, props, hands, text, watermark, logo',
  'red lipstick, painted lips, mask, porcelain, android, plastic skin, face paint, cracked skin, cartoon, sketch, distorted face, melted face'
].join(', ');

function sourcePath(face) {
  return path.join(sourceDir, `single_figure_${String(face).padStart(4, '0')}.png`);
}

for (const face of faces) {
  if (!existsSync(sourcePath(face))) throw new Error(`Missing selected V6 face: ${sourcePath(face)}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < faces.length; index += 1) {
  const face = faces[index];
  const outPath = path.join(outputDir, `photobooth_face_${String(face).padStart(4, '0')}.png`);
  if (existsSync(outPath)) continue;
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(sourcePath(face)).toString('base64')],
      prompt,
      negative_prompt: negativePrompt,
      denoising_strength: 0.24,
      steps: 28,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713383000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Photo booth face ${face}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Photo booth face ${face} returned no image`);
  writeFileSync(outPath, Buffer.from(encoded, 'base64'));
  process.stdout.write(`generated V59 photo-booth face ${face}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', path.join(outputDir, 'photobooth_face_0001.png'), '-i', path.join(outputDir, 'photobooth_face_0002.png'),
  '-i', path.join(outputDir, 'photobooth_face_0003.png'), '-i', path.join(outputDir, 'photobooth_face_0006.png'),
  '-filter_complex', '[0:v][1:v][2:v][3:v]hstack=inputs=4', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ faces, outputDir, contact }, null, 2));