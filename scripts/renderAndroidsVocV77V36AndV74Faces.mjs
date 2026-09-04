import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const v36Dir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V16_NO_DEVIATION_MORPH_CUDA_V36_TOPFIX_frames';
const v74 = path.join(previewRoot, 'androids_dream_VOC_V6_PLAINBACKGROUND_V74_STROBE_25SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V77_STROBE_30SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V77_STROBE_30SEC_contact.jpg');

if (!existsSync(path.join(v36Dir, 'morph_0001.png')) || !existsSync(path.join(v36Dir, 'morph_0180.png'))) {
  throw new Error('The complete V36 morph frame sequence is required');
}
if (!existsSync(v74)) throw new Error(`Missing V74 face movie: ${v74}`);
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '6', '-i', path.join(v36Dir, 'morph_%04d.png'), '-i', v74,
  '-filter_complex', [
    "[0:v]trim=duration=20,setpts=PTS-STARTPTS,fps=10,scale=1080:1080:flags=lanczos,eq=brightness='0.025*sin(2*PI*t*4)+0.012*sin(2*PI*t*9)':contrast='1.03+0.025*sin(2*PI*t*4)':eval=frame,format=yuv420p[v36]",
    '[1:v]trim=duration=10,setpts=PTS-STARTPTS,format=yuv420p[v74]',
    '[v36][v74]concat=n=2:v=1:a=0,format=yuv420p'
  ].join(';'),
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ v36Seconds: 20, v74Seconds: 10, matte: 'not used', output, contact, durationSec: 30 }, null, 2));