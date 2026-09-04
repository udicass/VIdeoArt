import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V67_STROBE_25SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V70_STRONG_SMOOTH_25SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_CLEAN_SKIN_CUDA_V70_STRONG_SMOOTH_25SEC_contact.jpg');

if (!existsSync(input)) throw new Error(`Missing V67 source animation: ${input}`);

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input,
  '-vf', 'gblur=sigma=1.35:steps=2,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, output, contact, treatment: 'strong smooth-skin descreening; strobe retained' }, null, 2));