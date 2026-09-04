import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V80_BRIGHTV6BACKGROUND_STROBE_30SEC_1080.mp4');
const mask = path.join(previewRoot, '_voc_v6_v81_background_plate_mask.png');
const output = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V81_V6BACKGROUND_STROBE_30SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V81_V6BACKGROUND_STROBE_30SEC_contact.jpg');

if (!existsSync(input)) throw new Error(`Missing V80 source movie: ${input}`);
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=1080x1080,format=gray',
  '-vf', "geq=lum='if(lte((X-540)*(X-540)/(430*430)+(Y-555)*(Y-555)/(635*635)\\,1)\\,255\\,0)',gblur=sigma=24",
  '-frames:v', '1', mask
], { stdio: 'inherit' });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input, '-loop', '1', '-i', mask,
  '-filter_complex', [
    '[0:v]trim=start=0:end=20,setpts=PTS-STARTPTS[v6]',
    '[0:v]trim=start=20:end=30,setpts=PTS-STARTPTS[v74]',
    '[1:v]format=gray[matte]',
    '[v6][v74][matte]maskedmerge,trim=duration=10,setpts=PTS-STARTPTS[tail]',
    '[v6][tail]concat=n=2:v=1:a=0,format=yuv420p'
  ].join(';'),
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, unchangedV6Seconds: 20, v6BackgroundPlateSeconds: 10, output, contact, durationSec: 30 }, null, 2));