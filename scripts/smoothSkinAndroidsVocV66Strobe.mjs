import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V64_STROBE_ONLY_25SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V66_SMOOTH_SKIN_STROBE_25SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V66_SMOOTH_SKIN_STROBE_25SEC_contact.jpg');

if (!existsSync(input)) throw new Error(`Missing V64 strobe source: ${input}`);

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input,
  '-vf', 'nlmeans=s=6:p=7:r=15,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, output, contact, treatment: 'strobe retained, structured scanline texture reduced, smooth skin' }, null, 2));