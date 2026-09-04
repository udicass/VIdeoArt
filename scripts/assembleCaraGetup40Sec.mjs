import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const framesDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_GETUP_KEYFRAMES_V143_20SEC';
const temp = path.join(previewRoot, '_cara_getup_v143_40sec_temp.mp4');
const output = path.join(previewRoot, 'CARA_GETUP_40SEC_720x1280_cuda.mp4');
const contact = path.join(previewRoot, 'CARA_GETUP_40SEC_contact.jpg');

for (let index = 1; index <= 14; index += 1) {
  const frame = path.join(framesDir, `keyframe_${String(index).padStart(4, '0')}.png`);
  if (!existsSync(frame)) throw new Error(`Missing keyframe: ${frame}`);
}
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '0.35',
  '-i', path.join(framesDir, 'keyframe_%04d.png'),
  '-vf', 'minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=720:1280:flags=lanczos,format=yuv420p',
  '-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-an', temp
], { stdio: 'inherit' });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=10,trim=duration=40,setpts=PTS-STARTPTS,fps=24,format=yuv420p',
  '-frames:v', '960',
  '-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-an', output
], { stdio: 'inherit' });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,24))',scale=180:-1,tile=5x4",
  '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ source: 'CARA get-up keyframes', durationSeconds: 40, fps: 24, output, contact }, null, 2));
