import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const previewRoot = path.join(root, 'outputs', 'deforum-merged-previews');
const timeline = JSON.parse(readFileSync(path.join(root, 'prompts', 'androids_dream_VOC_V6_CONTINUATION_V47_120SEC.json'), 'utf8'));
const restoredDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_FACE_RESTORED_CUDA_V71';
const oldV6 = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-09\\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames\\single_figure_0012.png';
const outputDir = 'D:\\SD_Deforum_Fresh\\outputs\\androids-text-frames\\2026-08-11\\androids_dream_VOC_V6_ALLFACES_CUDA_V75_30SEC';
const matte = path.join(outputDir, '_portrait_matte_512.png');
const cleanMovie = path.join(previewRoot, 'androids_dream_VOC_V6_ALLFACES_CUDA_V75_30SEC_1080.mp4');
const output = path.join(previewRoot, 'androids_dream_VOC_V6_ALLFACES_CUDA_V75_STROBE_30SEC_1080.mp4');
const contact = path.join(previewRoot, 'androids_dream_VOC_V6_ALLFACES_CUDA_V75_STROBE_30SEC_contact.jpg');
const temp = path.join(previewRoot, '_voc_v6_allfaces_v75_temp.mp4');
const identities = ['old-v6', 'v74-2', 'v74-3', 'v74-5', 'v74-7'];
const schedule = identities.flatMap((identity) => Array(6).fill(identity));
const basePrompt = timeline.base_prompt
  .replace('same exact recurring woman from the V6 input frame, exact face identity and proportions', 'faithfully preserve the exact identity and facial proportions from this input image')
  .replace('clean dark background', 'uniform smooth matte navy-black studio background, perfectly plain and free of texture, pattern, panels, fabric, scenery, and objects')
  .replace('subtle scanline texture', 'smooth natural skin and a clean photographic surface');
const negativePrompt = [
  timeline.negative_prompt,
  'scanlines, CRT grid, screen door texture, moire, mesh texture, face grid, heavy grain, image noise',
  'textured background, background pattern, patterned backdrop, fabric backdrop, curtain, wall texture, tiled background, textured side panels, side panels, background grid, background noise'
].join(', ');

function sourcePath(identity) {
  if (identity === 'old-v6') return oldV6;
  const sourceId = identity.replace('v74-', '');
  return path.join(restoredDir, `restored_face_${sourceId.padStart(4, '0')}.png`);
}

for (const identity of identities) {
  if (!existsSync(sourcePath(identity))) throw new Error(`Missing V75 face source: ${sourcePath(identity)}`);
}
if (schedule.length !== 30 || timeline.beats.length < 30) throw new Error('V75 requires 30 V47 beats and source assignments');
mkdirSync(outputDir, { recursive: true });

if (!existsSync(matte)) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=512x512,format=gray',
    '-vf', "geq=lum='if(lte((X-256)*(X-256)/(190*190)+(Y-270)*(Y-270)/(292*292)\\,1)\\,255\\,0)',gblur=sigma=10",
    '-frames:v', '1', matte
  ], { stdio: 'inherit' });
}

for (let index = 0; index < schedule.length; index += 1) {
  const identity = schedule[index];
  const generated = path.join(outputDir, `_generated_${String(index + 1).padStart(4, '0')}.png`);
  const flattened = path.join(outputDir, `continuation_${String(index + 1).padStart(4, '0')}.png`);
  if (existsSync(flattened)) {
    process.stdout.write(`skip ${path.basename(flattened)}\n`);
    continue;
  }
  if (!existsSync(generated)) {
    const response = await fetch('http://127.0.0.1:7860/sdapi/v1/img2img', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        init_images: [readFileSync(sourcePath(identity)).toString('base64')],
        prompt: [basePrompt, timeline.beats[index], 'only a minimal natural expression or light variation, preserve smooth skin, identity, fixed framing, and the completely plain matte background'].join(', '),
        negative_prompt: negativePrompt,
        denoising_strength: 0.12,
        steps: 28,
        cfg_scale: 5,
        width: 512,
        height: 512,
        sampler_name: 'DPM++ 2M',
        scheduler: 'Karras',
        restore_faces: true,
        seed: 713395000 + index,
        batch_size: 1,
        n_iter: 1,
        save_images: false
      })
    });
    if (!response.ok) throw new Error(`Frame ${index + 1}: ${response.status} ${await response.text()}`);
    const json = await response.json();
    const encoded = String(json.images?.[0] || '').replace(/^data:image\/\w+;base64,/, '');
    if (!encoded) throw new Error(`Frame ${index + 1} returned no image`);
    writeFileSync(generated, Buffer.from(encoded, 'base64'));
  }
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-loop', '1', '-i', generated, '-loop', '1', '-i', matte,
    '-filter_complex', '[0:v]format=yuv420p[portrait];color=c=0x01050e:s=512x512[background];[1:v]format=gray[mask];[background][portrait][mask]maskedmerge,format=rgb24',
    '-frames:v', '1', flattened
  ], { stdio: 'inherit' });
  process.stdout.write(`generated V75 frame ${index + 1}/30 from ${identity}\n`);
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(outputDir, 'continuation_%04d.png'),
  '-vf', 'minterpolate=fps=10:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=1080:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', temp
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', temp,
  '-vf', 'tpad=stop_mode=clone:stop_duration=2,fps=10,format=yuv420p',
  '-t', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', cleanMovie
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', cleanMovie,
  '-vf', "eq=brightness='0.025*sin(2*PI*t*4)+0.012*sin(2*PI*t*9)':contrast='1.03+0.025*sin(2*PI*t*4)':eval=frame,format=yuv420p",
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-an', output
], { stdio: 'inherit' });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', output,
  '-vf', "select='not(mod(n,10))',scale=256:-1,tile=6x5", '-frames:v', '1', '-update', '1', contact
], { stdio: 'inherit' });

console.log(JSON.stringify({ identities, secondsPerIdentity: 6, keyframes: 30, output, contact, durationSec: 30 }, null, 2));