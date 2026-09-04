import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const input = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V83_GRAYV6BACKGROUND_STROBE_30SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V85_GRAYV6BACKGROUND_CROWN_FIXED_STROBE_30SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V16_V36_V74_FACES_V85_GRAYV6BACKGROUND_CROWN_FIXED_STROBE_30SEC_contact.jpg');

if (!existsSync(input)) throw new Error(`Missing V83 source movie: ${input}`);
mkdirSync(previewRoot, { recursive: true });

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', input,
  '-f', 'lavfi', '-i', 'nullsrc=s=1080x1080,format=gray',
  '-filter_complex', [
    '[0:v]split=3[whole][crownsrc][tailsrc]',
    '[whole]trim=start=0:end=20,setpts=PTS-STARTPTS[v6]',
    '[crownsrc]trim=start=0:end=10,setpts=PTS-STARTPTS[crown]',
    '[tailsrc]trim=start=20:end=30,setpts=PTS-STARTPTS[tail]',
    "[1:v]geq=lum='if(lt(Y,205),255,0)',gblur=sigma=18[crownmask]",
    '[tail][crown][crownmask]maskedmerge,trim=duration=10,setpts=PTS-STARTPTS[crownedTail]',
    '[v6][crownedTail]concat=n=2:v=1:a=0,format=yuv420p'
  ].join(';'),
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ input, unchangedV6Seconds: 20, crownEffectSeconds: 10, crownBandPixels: 205, output, contact, durationSec: 30 }, null, 2));