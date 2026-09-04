import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const inputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_MAJOR_DIVERSITY_PHOTOBOOTH_CUDA_V60';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_MAJOR_DIVERSITY_CLEAR_PHOTOBOOTH_CUDA_V61';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_MAJOR_DIVERSITY_CLEAR_PHOTOBOOTH_CUDA_V61_contact.jpg');
const prompt = [
  'faithfully preserve the exact person and facial identity in this input image',
  'crisp high-resolution vintage photo booth headshot, sharp focus on both eyes and facial features, clear natural skin detail',
  'centered symmetrical frontal portrait, eyes level, direct gaze, uniform head-and-shoulders crop',
  'flat dark navy-blue backdrop, muted cool blue CRT lighting, silver gelatin photographic realism, only a very subtle clean scanline texture',
  'Do Androids Dream of Electric Sheep, quiet empathy, clean coherent facial anatomy'
].join(', ');
const negativePrompt = [
  'blur, soft focus, haze, low resolution, image noise, heavy grain, washed out face, distorted face, melted face, duplicate face',
  'profile, three-quarter view, tilted head, high angle, low angle, zoomed in, cropped head, bright background, scenery, text, watermark, logo'
].join(', ');

for (let index = 1; index <= 8; index += 1) {
  const input = path.join(inputDir, `diverse_face_${String(index).padStart(4, '0')}.png`);
  if (!existsSync(input)) throw new Error(`Missing V60 candidate: ${input}`);
}
mkdirSync(outputDir, { recursive: true });

for (let index = 1; index <= 8; index += 1) {
  const input = path.join(inputDir, `diverse_face_${String(index).padStart(4, '0')}.png`);
  const output = path.join(outputDir, `clear_face_${String(index).padStart(4, '0')}.png`);
  if (existsSync(output)) continue;
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(input).toString('base64')],
      prompt,
      negative_prompt: negativePrompt,
      denoising_strength: 0.10,
      steps: 30,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713385000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Clear face ${index}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Clear face ${index} returned no image`);
  writeFileSync(output, Buffer.from(encoded, 'base64'));
  process.stdout.write(`refined clear V61 face ${index}/8\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'clear_face_%04d.png'),
  '-vf', 'scale=384:384:flags=lanczos,tile=4x2', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ inputDir, outputDir, contact, candidates: 8 }, null, 2));