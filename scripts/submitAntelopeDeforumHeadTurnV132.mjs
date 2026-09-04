import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const probe = JSON.parse(readFileSync(path.join(previewRoot, 'antelop_DEFORUM_STABILITY_PROBE_8FRAMES_submit.json'), 'utf8'));

const settings = probe.settings;
settings.batch_name = 'antelope_DEFORUM_HEAD_TURN_V132_90FRAMES';
settings.max_frames = 91;
settings.init_image = 'D:/Users/User/Sonar/VIdeoArt/outputs/deforum-merged-previews/antelope.png';
settings.strength_schedule = '0: (1.0)';
settings.noise_schedule = '0: (0)';
settings.cfg_scale_schedule = '0: (1.0)';
settings.color_coherence = 'Image';
settings.color_coherence_image_path = 'D:/Users/User/Sonar/VIdeoArt/outputs/deforum-merged-previews/antelope.png';
settings.prompts = {
  '0': 'View of the image: an antelope lying stretched as an image in high quality INIT',
  '30': 'three-quarter view antelope head turning toward the viewer, View of the image: an antelope lying stretched as an image in high quality INIT',
  '60': 'frontal view of a pixel art antelope head looking directly at the viewer, View of the image: an antelope lying stretched as an image in high quality INIT',
  '90': 'frontal view of a pixel art antelope head looking directly at the viewer, View of the image: an antelope lying stretched as an image in high quality INIT'
};

const response = await fetch('http://127.0.0.1:7860/deforum_api/batches', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ deforum_settings: [settings], options_overrides: {} })
});
if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
const result = await response.json();
writeFileSync(
  path.join(previewRoot, 'antelope_DEFORUM_HEAD_TURN_V132_90FRAMES_submit.json'),
  JSON.stringify({ submittedAt: new Date().toISOString(), result, settings }, null, 2)
);
console.log(JSON.stringify(result, null, 2));

