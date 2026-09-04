import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-10\\androids_dream_VOC_V6_SUPPLEMENTAL_FACES_CUDA_V51';
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_SUPPLEMENTAL_FACES_CUDA_V51_contact.jpg');
const candidates = [
  {
    source: 'single_figure_0001.png',
    character: 'a new adult woman with a short dark bob, a narrow oval face, soft natural brows, and a reserved direct gaze'
  },
  {
    source: 'single_figure_0002.png',
    character: 'a new adult woman with swept-back dark hair, high cheekbones, a long calm face, and clear reflective eyes'
  },
  {
    source: 'single_figure_0003.png',
    character: 'a new adult woman with a blunt shoulder-length dark haircut, a broader face, and quiet unguarded attention'
  },
  {
    source: 'single_figure_0007.png',
    character: 'a new adult woman with dark hair tucked behind one ear, a slightly angular jaw, and a composed, observant gaze'
  }
];

const basePrompt = [
  'one new distinct adult human woman, natural human skin, clearly human, do not copy the person in the input image',
  'centered symmetrical frontal head-and-shoulders portrait, eyes level, shoulders level, fixed camera and crop',
  'forehead, hairline, chin, neck, and both shoulders fully visible, clean dark background',
  'muted cool blue CRT tint, restrained photographic realism, silver gelatin portrait, subtle scanline texture',
  'Do Androids Dream of Electric Sheep, empathy and uncertain identity',
  'sharp coherent facial anatomy, smooth skin, coherent identity, no scene change'
].join(', ');

const negativePrompt = [
  'same person as input, duplicate face, second face, two people, extra eyes, male, child',
  'red lipstick, bright lipstick, colored lips, painted lips, mask, porcelain, android, plastic skin, face paint',
  'cracked skin, heavy texture, sketch, line art, cartoon, hood, hat, scarf, glasses, hands, objects',
  'profile, three-quarter view, tilted head, looking away, cropped forehead, cropped chin, black bar, border',
  'text, watermark, logo, subtitles, open mouth, teeth, smile, distorted face, melted face, image noise'
].join(', ');

for (const candidate of candidates) {
  const source = path.join(sourceDir, candidate.source);
  if (!existsSync(source)) throw new Error(`Missing V6 source reference: ${source}`);
}
mkdirSync(outputDir, { recursive: true });

async function generateCandidate(candidate, index) {
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(path.join(sourceDir, candidate.source)).toString('base64')],
      prompt: [basePrompt, candidate.character].join(', '),
      negative_prompt: negativePrompt,
      denoising_strength: 0.32,
      steps: 28,
      cfg_scale: 6,
      width: 512,
      height: 512,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      restore_faces: false,
      seed: 713372000 + index,
      batch_size: 1,
      n_iter: 1,
      save_images: false
    })
  });
  if (!response.ok) throw new Error(`Candidate ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!encoded) throw new Error(`Candidate ${index + 1} returned no image`);
  return Buffer.from(encoded, 'base64');
}

for (let index = 0; index < candidates.length; index += 1) {
  const outPath = path.join(outputDir, `supplemental_face_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(outPath)) {
    process.stdout.write(`skip ${path.basename(outPath)}\n`);
    continue;
  }
  writeFileSync(outPath, await generateCandidate(candidates[index], index));
  process.stdout.write(`generated supplemental V6 face ${index + 1}/${candidates.length}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'supplemental_face_%04d.png'),
  '-vf', 'scale=512:512:flags=lanczos,tile=4x1', '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ outputDir, contact, candidates: candidates.length }, null, 2));