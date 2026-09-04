import { writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');

const settings = {
  prompts: {
    '0': 'the same figure from the init image lying down in place, gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background, high quality',
    '24': 'the same figure lifting its head and raising its torso, beginning to rise, gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background',
    '48': 'the same figure sitting upright, mid rise, gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background',
    '72': 'the same figure standing upright, full body, gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background'
  },
  negative_prompts: 'camera, lens, machine, machinery, device, equipment, robot, vehicle, object, text, watermark, illustration style change, different figure, extra limbs, extra head, missing limbs, malformed anatomy, zoom, crop, pan, camera movement, background movement, warm colors, red, orange, green',
  animation_mode: '2D',
  max_frames: 73,
  border: 'replicate',
  angle: '0:(0)',
  zoom: '0:(1.0)',
  translation_x: '0:(0)',
  translation_y: '0:(0)',
  translation_z: '0:(0)',
  rotation_3d_x: '0:(0)',
  rotation_3d_y: '0:(0)',
  rotation_3d_z: '0:(0)',
  noise_schedule: '0:(0)',
  strength_schedule: '0:(0.6)',
  contrast_schedule: '0:(1.0)',
  color_coherence: 'Image',
  color_coherence_image_path: 'D:/Users/User/Sonar/VIdeoArt/outputs/deforum-merged-previews/_cara_scene_init_576x1024.png',
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
    init_image: 'D:/Users/User/Sonar/VIdeoArt/outputs/deforum-merged-previews/_cara_scene_init_576x1024.png',
    strength: 0.6
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
  path.join(previewRoot, 'CARA_DEFORUM_GETUP_V139_submit.json'),
  JSON.stringify({ submittedAt: new Date().toISOString(), result, settings }, null, 2)
);
console.log(JSON.stringify(result, null, 2));
