import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V6_GRIDFREE_CUDA_V72_STROBE_25SEC_1080.mp4');
const mask = path.join(previewRoot, '_voc_v6_v74_portrait_matte.png');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_PLAINBACKGROUND_V74_STROBE_25SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_PLAINBACKGROUND_V74_STROBE_25SEC_contact.jpg');

mkdirSync(previewRoot, { recursive: true });

// A soft portrait-shaped matte retains the face and hair while replacing textured side panels.
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=1080x1080,format=gray',
  '-vf', "geq=lum='if(lte((X-540)*(X-540)/(390*390)+(Y-555)*(Y-555)/(620*620)\\,1)\\,255\\,0)',gblur=sigma=20",
  '-frames:v', '1', mask
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input, '-loop', '1', '-i', mask,
  '-filter_complex', '[0:v]format=yuv420p[portrait];color=c=0x01050e:s=1080x1080:r=10[background];[1:v]format=gray[matte];[background][portrait][matte]maskedmerge,format=yuv420p',
  '-t', '25', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, output, contact, durationSec: 25 }, null, 2));