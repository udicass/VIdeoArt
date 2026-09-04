import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const facesDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-12\\androids_dream_VOC_V6_TWENTY_NEW_FACES_CUDA_V86';
const existingMovie = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V85_GRAYV6BACKGROUND_CROWN_FIXED_STROBE_30SEC_1080.mp4');
const facesTemp = path.join(previewRoot, '_voc_v6_v87_twenty_faces_temp.mp4');
const facesMovie = path.join(previewRoot, 'androids_dream_VOC_V6_TWENTY_NEW_FACES_CUDA_V87_30SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_V86_20NEWFACES_V88_COMPLETE_60SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_V86_20NEWFACES_V88_COMPLETE_contact.jpg');
const facesContact = path.join(previewRoot, 'androids_dream_VOC_V6_TWENTY_NEW_FACES_CUDA_V87_30SEC_contact.jpg');

if (!existsSync(existingMovie)) throw new Error(`Missing existing V85 movie: ${existingMovie}`);
for (let index = 1; index <= 20; index += 1) {
  const facePath = path.join(facesDir, `new_face_${String(index).padStart(4, '0')}.png`);
  if (!existsSync(facePath)) throw new Error(`Missing V86 face: ${facePath}`);
}
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '2/3', '-i', path.join(facesDir, 'new_face_%04d.png'),
  '-vf', 'minterpolate=fps=10:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', facesTemp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', facesTemp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=3,fps=10,format=yuv420p',
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', facesMovie
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', facesMovie,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=5x4", '-frames:v', '1', '-update', '1', facesContact
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', existingMovie, '-i', facesMovie,
  '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=192:-1,tile=6x10", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ existingSeconds: 30, newFaces: 20, newFacesSeconds: 30, totalSeconds: 60, output, contact, facesContact }, null, 2));