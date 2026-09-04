import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const framesDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-18\\CARA_GETUP_KEYFRAMES_V144_SMOOTH';
const smoothDir = path.join(previewRoot, 'CARA_getup_60sec_smooth_v144_frames');

for (let index = 1; index <= 14; index += 1) {
  const frame = path.join(framesDir, `keyframe_${String(index).padStart(4, '0')}.png`);
  if (!existsSync(frame)) throw new Error(`Missing keyframe: ${frame}`);
}
mkdirSync(smoothDir, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '7/30',
  '-i', path.join(framesDir, 'keyframe_%04d.png'),
  '-vf', 'minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,tpad=stop_mode=clone:stop_duration=10,fps=24,scale=720:1280:flags=lanczos,format=yuv420p',
  '-frames:v', '1440',
  path.join(smoothDir, 'frame_%04d.png')
], { stdio: 'inherit' });

console.log(JSON.stringify({ smoothFrames: 1440, durationSeconds: 60, fps: 24, smoothDir }, null, 2));
