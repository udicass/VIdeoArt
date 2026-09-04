import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const workRoot = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-08';

const frameCount = 12;
const width = 512;
const height = 512;
const vocInitImage = args.get('--voc-init-image');
const deforumInitImage = args.get('--deforum-init-image');
const outputSuffix = args.get('--suffix') || 'V24';

const tracks = [
  {
    name: 'VOC',
    seedBase: 913068000,
    inputDir: path.join(workRoot, 'androids_dream_VOC_ALIGNED_BLUE_CRT_V6_frames'),
    outputDir: path.join(workRoot, `androids_dream_VOC_THEME_COMPLETE_${outputSuffix}_frames`),
    outputMovie: path.join(previewRoot, `androids_dream_VOC_THEME_COMPLETE_BLUE_CRT_${outputSuffix}_1080_30SEC.mp4`),
    prompt: 'single adult human woman, exact same face, exact same eye placement, same pose, slightly higher crop, complete the background theme only, dark moody blue-gray cinematic atmosphere, coherent shoulders and neck, no change to identity'
  },
  {
    name: 'DEFORUM',
    seedBase: 913069000,
    inputDir: path.join(workRoot, 'androids_dream_DEFORUM_ALIGNED_BLUE_CRT_V6_frames'),
    outputDir: path.join(workRoot, `androids_dream_DEFORUM_THEME_COMPLETE_${outputSuffix}_frames`),
    outputMovie: path.join(previewRoot, `androids_dream_DEFORUM_THEME_COMPLETE_BLUE_CRT_${outputSuffix}_1080_30SEC.mp4`),
    prompt: 'single adult female android replicant, exact same face, exact same eye placement, same pose, slightly higher crop, complete the background theme only, dark moody blue-gray cinematic atmosphere, coherent shoulders and neck, no change to identity'
  }
];

const negativePrompt = [
  'different face', 'new face', 'face change', 'identity change', 'extra face', 'two faces', 'duplicate face',
  'bad anatomy', 'deformed face', 'melted face', 'crossed eyes', 'asymmetrical eyes', 'off-center face',
  'cropped forehead', 'cropped chin', 'cut off head', 'cut off face', 'tilted head', 'profile', 'three-quarter view',
  'motion blur', 'blur', 'noise', 'grain', 'jpeg artifacts', 'oversaturated', 'cartoon', 'logo', 'watermark', 'text'
].join(', ');

async function requestImage(track, index) {
  const initPath =
    track.name === 'VOC' && vocInitImage
      ? vocInitImage
      : track.name === 'DEFORUM' && deforumInitImage
        ? deforumInitImage
        : path.join(track.inputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
  if (!existsSync(initPath)) {
    throw new Error(`Missing init image: ${initPath}`);
  }
  const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      init_images: [readFileSync(initPath).toString('base64')],
      prompt: track.prompt,
      negative_prompt: negativePrompt,
      steps: 18,
      width,
      height,
      cfg_scale: 5.5,
      sampler_name: 'DPM++ 2M',
      scheduler: 'Karras',
      denoising_strength: 0.18,
      initial_noise_multiplier: 0.35,
      restore_faces: false,
      seed: track.seedBase + index,
      save_images: false,
      override_settings: { CLIP_stop_at_last_layers: 2 },
      override_settings_restore_afterwards: false
    })
  });
  if (!response.ok) throw new Error(`${track.name} frame ${index + 1}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  const base64 = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) throw new Error(`${track.name} frame ${index + 1} returned no image`);
  return Buffer.from(base64, 'base64');
}

for (const track of tracks) {
  mkdirSync(track.outputDir, { recursive: true });
  for (let index = 0; index < frameCount; index += 1) {
    const output = path.join(track.outputDir, `single_figure_${String(index + 1).padStart(4, '0')}.png`);
    if (!existsSync(output)) writeFileSync(output, await requestImage(track, index));
    process.stdout.write(`${track.name} theme-complete frame ${index + 1}/${frameCount}\n`);
  }
}

console.log(JSON.stringify({
  method: 'theme-complete-img2img',
  vocInitImage: vocInitImage || null,
  deforumInitImage: deforumInitImage || null,
  outputSuffix,
  frameCount,
  tracks: tracks.map((track) => ({
    name: track.name,
    inputDir: track.inputDir,
    outputDir: track.outputDir,
    outputMovie: track.outputMovie
  }))
}, null, 2));