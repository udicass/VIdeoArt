import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const framesDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-14\\androids_dream_VOC_ANDROGYNOUS_LAST3_V92_CUDA_V95_20SEC';
const temp = path.join(previewRoot, '_voc_v95_androgynous_last3_temp.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_ANDROGYNOUS_LAST3_V92_V95_TEST_20SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_ANDROGYNOUS_LAST3_V92_V95_TEST_20SEC_contact.jpg');

for (let index = 1; index <= 20; index += 1) {
  const framePath = path.join(framesDir, `andro_face_${String(index).padStart(4, '0')}.png`);
  if (!existsSync(framePath)) throw new Error(`Missing V95 frame: ${framePath}`);
}
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(framesDir, 'andro_face_%04d.png'),
  '-vf', 'minterpolate=fps=10:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=3,fps=10,format=yuv420p',
  '-t', '20', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x4", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ frames: 20, seconds: 20, output, contact }, null, 2));
