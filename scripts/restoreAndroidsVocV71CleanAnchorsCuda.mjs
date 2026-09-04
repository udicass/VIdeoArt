import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const inputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_25SEC\\_clean_identities';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_FACE_RESTORED_CUDA_V71';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_FACE_RESTORED_CUDA_V71_contact.jpg');
const identities = [1, 2, 3, 5, 6, 7];
const prompt = [
  'faithfully preserve the exact person and identity from this input image',
  'smooth natural human skin, crisp clear eyes, realistic facial detail, centered blue portrait, dark background',
  'restrained photographic realism, no screen texture, no scanlines, no CRT grid, no moire pattern'
].join(', ');
const negativePrompt = 'scanlines, CRT grid, screen door texture, moire, mesh texture, face grid, heavy grain, image noise, blur, distorted face, different person';

for (const identity of identities) {
  const input = path.join(inputDir, `clean_face_${String(identity).padStart(4, '0')}.png`);
  if (!existsSync(input)) throw new Error(`Missing V67 identity anchor: ${input}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < identities.length; index += 1) {
  const identity = identities[index];
  const input = path.join(inputDir, `clean_face_${String(identity).padStart(4, '0')}.png`);
  const output = path.join(outputDir, `restored_face_${String(identity).padStart(4, '0')}.png`);
  if (existsSync(output)) continue;
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(input).toString('base64')],
      prompt,
      negative_prompt: negativePrompt,
      denoising_strength: 0.12,
      steps: 28,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: true,
      seed: 713391000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Restored identity ${identity}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Restored identity ${identity} returned no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`restored smooth V71 identity ${identity}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', path.join(outputDir, 'restored_face_0001.png'), '-i', path.join(outputDir, 'restored_face_0002.png'),
  '-i', path.join(outputDir, 'restored_face_0003.png'), '-i', path.join(outputDir, 'restored_face_0005.png'),
  '-i', path.join(outputDir, 'restored_face_0006.png'), '-i', path.join(outputDir, 'restored_face_0007.png'),
  '-filter_complex', '[0:v][1:v][2:v][3:v][4:v][5:v]hstack=inputs=6', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ identities, outputDir, contact, treatment: 'face-restored smooth-skin anchors' }, null, 2));