import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const sourceDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V16_NO_DEVIATION_MORPH_CUDA_V36_TOPFIX_frames';
const firstFrame = path.join(sourceDir, 'morph_0001.png');
const lastFrame = path.join(sourceDir, 'morph_0180.png');
const matte = path.join(previewRoot, '_voc_v6_v76_v36_portrait_matte_512.png');
const cleanMovie = path.join(previewRoot, 'androids_dream_VOC_V16_V36_FACES_PLAINBACKGROUND_V76_30SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V16_V36_FACES_PLAINBACKGROUND_V76_STROBE_30SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V16_V36_FACES_PLAINBACKGROUND_V76_STROBE_30SEC_contact.jpg');

if (!existsSync(firstFrame) || !existsSync(lastFrame)) throw new Error('The complete V36 morph frame sequence is required');
mkdirSync(previewRoot, { recursive: true });

if (!existsSync(matte)) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=512x512,format=gray',
    '-vf', "geq=lum='if(lte((X-256)*(X-256)/(205*205)+(Y-270)*(Y-270)/(310*310)\\,1)\\,255\\,0)',gblur=sigma=12",
    '-frames:v', '1', matte
  ], { stdio: 'inherit' });
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '6', '-i', path.join(sourceDir, 'morph_%04d.png'), '-loop', '1', '-i', matte,
  '-filter_complex', '[0:v]format=yuv420p[portrait];color=c=0x01050e:s=512x512:r=6[background];[1:v]format=gray[mask];[background][portrait][mask]maskedmerge,scale=1080:1080:flags=lanczos,format=yuv420p',
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', cleanMovie
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', cleanMovie,
  '-vf', "eq=brightness='0.025*sin(2*PI*t*4)+0.012*sin(2*PI*t*9)':contrast='1.03+0.025*sin(2*PI*t*4)':eval=frame,format=yuv420p",
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,6))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ source: sourceDir, sourceFrames: 180, sourceFps: 6, output, contact, durationSec: 30 }, null, 2));