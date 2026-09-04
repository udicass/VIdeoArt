import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V77_STROBE_30SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V80_BRIGHTV6BACKGROUND_STROBE_30SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V80_BRIGHTV6BACKGROUND_STROBE_30SEC_contact.jpg');

if (!existsSync(input)) throw new Error(`Missing V77 source movie: ${input}`);
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input,
  '-filter_complex', [
    '[0:v]trim=start=0:end=20,setpts=PTS-STARTPTS[v36]',
    "[0:v]trim=start=20:end=30,setpts=PTS-STARTPTS,eq=brightness=0.055:contrast=0.98:saturation=0.96:eval=frame,colorchannelmixer=rr=0.96:gg=0.98:bb=1.10[v74]",
    '[v36][v74]concat=n=2:v=1:a=0,format=yuv420p'
  ].join(';'),
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, unchangedV6Seconds: 20, brighterV6BackgroundV74Seconds: 10, output, contact, durationSec: 30 }, null, 2));