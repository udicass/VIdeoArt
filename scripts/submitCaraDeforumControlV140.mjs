import { writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');

const settings = {
  prompts: {
    '0': 'View of the image: an antelope lying stretched as an image in high quality INIT',
    '30': 'three-quarter view antelope head turning toward the viewer, View of the image: an antelope lying stretched as an image in high quality INIT',
    '60': 'frontal view of a pixel art antelope head looking directly at the viewer, View of the image: an antelope lying stretched as an image in high quality INIT',
    '90': 'frontal view of a pixel art antelope head looking directly at the viewer, View of the image: an antelope lying stretched as an image in high quality INIT'
  },
  animation_mode: '2D',
  max_frames: 90,
  border: 'replicate',
  angle: '0:(0)',
  zoom: '0:(1.0)',
  translation_x: '0:(0)',
  translation_y: '0:(0)',
  translation_z: '0:(0)',
  rotation_3d_x: '0:(0)',
  rotation_3d_y: '0:(0)',
  rotation_3d_z: '0:(0)',
  noise_schedule: '0:(0.015)',
  strength_schedule: '0:(0.55)',
  contrast_schedule: '0:(1.0)',
  color_coherence: 'LAB',
  diffusion_cadence: 1,
  padding_mode: 'reflection',
  sampling_settings: {
    sampler: 'Euler a',
    steps: 25,
    scale: 7.5,
    seed: -1
  },
  init_settings: {
    use_init: true,
    init_image: 'D:/Users/User/Sonar/VIdeoArt/outputs/deforum-merged-previews/antelop.png',
    strength: 0.55
  }
};

const response = await fetch('http://127.0.0.1:7860/deforum_api/batches', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ deforum_settings: [settings], options_overrides: {} })
});
if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
const result = await response.json();
writeFileSync(
  path.join(previewRoot, 'CARA_DEFORUM_CONTROL_V140_submit.json'),
  JSON.stringify({ submittedAt: new Date().toISOString(), result, settings }, null, 2)
);
console.log(JSON.stringify(result, null, 2));
