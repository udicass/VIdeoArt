import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const framesDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-15\\antelope_V6_CONSISTENT_TURN_CUDA_V114_20SEC';
const temp = path.join(previewRoot, '_antelope_v114_centered_face_theme_temp.mp4');
const output = path.join(previewRoot, 'antelope_V6_V114_CENTERED_FACE_THEME_SLOW_MORPH_20SEC_12FPS_1080.mp4');
const contact = path.join(previewRoot, 'antelope_V6_V114_CENTERED_FACE_THEME_SLOW_MORPH_20SEC_contact.jpg');

for (let index = 1; index <= 12; index += 1) {
  const frame = path.join(framesDir, `single_figure_${String(index).padStart(4, '0')}.png`);
  if (!existsSync(frame)) throw new Error(`Missing V114 frame: ${frame}`);
}
mkdirSync(previewRoot, { recursive: true });

const faceTheme = [
  'colorchannelmixer=rr=0.82:rg=0.08:rb=0.05:gr=0.08:gg=0.88:gb=0.06:br=0.13:bg=0.17:bb=0.78',
  'eq=contrast=1.04:saturation=0.72'
].join(',');

const centeredFilter = [
  '[0:v]scale=1080:1080:flags=lanczos',
  'split[background][subject]',
  `[background]${faceTheme},gblur=sigma=42[themed_background]`,
  `[subject]${faceTheme}[themed_subject]`,
  '[themed_background][themed_subject]overlay=x=-325:y=0:shortest=1[composed]',
  '[composed]minterpolate=fps=12:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p[outv]'
].join(';');

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '3/5',
  '-i', path.join(framesDir, 'single_figure_%04d.png'),
  '-filter_complex', centeredFilter, '-map', '[outv]',
  '-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-an', temp
], { stdio: 'inherit' });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=5,trim=duration=20,setpts=PTS-STARTPTS,fps=12,format=yuv420p',
  '-frames:v', '240',
  '-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '19', '-b:v', '0', '-an', output
], { stdio: 'inherit' });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,12))',scale=256:-1,tile=5x4",
  '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ source: 'V114 only', composition: 'face centered', palette: 'cool face blue-gray', sourceFrames: 12, durationSeconds: 20, fps: 12, output, contact }, null, 2));