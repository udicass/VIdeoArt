import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const outputDir = resolve('outputs/podcast-captures-sd3');
const bubbleDir = resolve('scripts/bubbles');
const videoPath = 'Video/Synthetic_Desires_3.mp4';
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const frames = [
  {
    index: 1,
    time: 12.0,
    cue: 'framed_portrait',
    text: 'She let the archive keep her face, framed and smiling, long after the room went dark.',
    bubble: 'sd3_bubble_00.png'
  },
  {
    index: 2,
    time: 40.0,
    cue: 'two_women_studio',
    text: 'Two women, one room, and a hundred sculpted faces watching them be still.',
    bubble: 'sd3_bubble_01.png'
  },
  {
    index: 3,
    time: 68.0,
    cue: 'the_photograph_agreement',
    text: 'Every photograph is an agreement: I will look, and you will let me keep the moment.',
    bubble: 'sd3_bubble_02.png'
  }
];

async function run() {
  console.log('Generating 3 meaningful podcast frames for SD3 (Synthetic_Desires_3.mp4)...');

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

    const outPath = join(outputDir, `SD3_podcast_meaningful_frame_${item.index}_${item.cue}.png`);
    writeFileSync(outPath, finalPng);
    console.log(`✓ Saved: ${outPath}`);
    console.log(`  Spoken: "${item.text}"`);
  }

  console.log('\nAll 3 SD3 podcast frames captured and rendered.');
}

run().catch(console.error);
