import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V62_V47_25SEC_TEST_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V63_STROBE_TILT_25SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_DIVERSE_FACES_CUDA_V63_STROBE_TILT_25SEC_contact.jpg');

if (!existsSync(input)) throw new Error(`Missing V62 source animation: ${input}`);

const filter = [
  'scale=1120:1120:flags=lanczos',
  "rotate='0.012*sin(2*PI*t*0.75)+0.004*sin(2*PI*t*3.2)':fillcolor=black@1",
  'crop=1080:1080',
  "eq=brightness='0.025*sin(2*PI*t*4)+0.012*sin(2*PI*t*9)':contrast='1.03+0.025*sin(2*PI*t*4)':eval=frame",
  "noise=alls=2:allf=t+u:all_seed=713387",
  'format=yuv420p'
].join(',');

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input,
  '-vf', filter,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, output, contact, treatment: 'subtle alternating tilt, CRT flicker, light grain' }, null, 2));