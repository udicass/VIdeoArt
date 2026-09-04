import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const outputDir = resolve('outputs/podcast-captures-sd4');
const bubbleDir = resolve('scripts/bubbles');
const videoPath = 'Video/Synthetic Desires_4.mp4';
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const frames = [
  {
    index: 1,
    time: 15.0,
    cue: 'mirror_self_portrait',
    text: "I found her first in a mirror, aiming the camera at the part of herself she couldn't see.",
    bubble: 'sd4_bubble_00.png'
  },
  {
    index: 2,
    time: 55.0,
    cue: 'double_exposure_glass',
    text: 'The camera sees her twice — once in the room, once inside the glass.',
    bubble: 'sd4_bubble_01.png'
  },
  {
    index: 3,
    time: 95.0,
    cue: 'one_eye_behind_lens',
    text: 'Behind the lens she disappears, leaving only the machine and one eye looking back.',
    bubble: 'sd4_bubble_02.png'
  }
];

async function run() {
  console.log('Generating 3 meaningful podcast frames for SD4 (Synthetic Desires_4.mp4)...');

  for (const item of frames) {
    console.log(`\n[Frame ${item.index}/3] Extracting at ${item.time}s (${item.cue})...`);

    const ffmpeg = spawnSync('ffmpeg', [
      '-y',
      '-ss', String(item.time),
      '-i', videoPath,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-'
    ], { maxBuffer: 50 * 1024 * 1024 });

    if (ffmpeg.status !== 0 || !ffmpeg.stdout.length) {
      console.error(`Failed to extract frame at ${item.time}s:`, ffmpeg.stderr?.toString());
      continue;
    }

    const bubblePath = join(bubbleDir, item.bubble);
    if (!existsSync(bubblePath)) {
      console.error(`Missing bubble overlay: ${bubblePath}`);
      continue;
    }
    const bubblePng = readFileSync(bubblePath);

    const meta = await sharp(ffmpeg.stdout).metadata();
    const finalPng = await sharp(ffmpeg.stdout)
      .resize({ width: meta.width * 2, height: meta.height * 2, kernel: 'lanczos3' })
      .composite([{ input: bubblePng, top: 0, left: 0 }])
      .png({ quality: 100 })
      .toBuffer();

    const outPath = join(outputDir, `SD4_podcast_meaningful_frame_${item.index}_${item.cue}.png`);
    writeFileSync(outPath, finalPng);
    console.log(`✓ Saved: ${outPath}`);
    console.log(`  Spoken: "${item.text}"`);
  }

  console.log('\nAll 3 SD4 podcast frames captured and rendered.');
}

run().catch(console.error);
