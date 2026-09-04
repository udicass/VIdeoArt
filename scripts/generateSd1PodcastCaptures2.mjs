import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const outputDir = resolve('outputs/podcast-captures-sd1');
const bubbleDir = resolve('scripts/bubbles');
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const frames = [
  {
    index: 6,
    time: 12.5,
    cue: 'fighter_jet_flames',
    text: 'The jet crosses the city in silence. Only the smoke remembers it was here.',
    bubble: 'sd1_bubble_13.png'
  },
  {
    index: 7,
    time: 28.0,
    cue: 'glitching_billboard',
    text: "Even the city's screens are forgetting how to hold an image together.",
    bubble: 'sd1_bubble_14.png'
  },
  {
    index: 8,
    time: 44.5,
    cue: 'ramen_neon_sign',
    text: 'Hot noodles. Cold rain. A city that never stops serving the late shift.',
    bubble: 'sd1_bubble_15.png'
  },
  {
    index: 9,
    time: 58.5,
    cue: 'green_kimono_rain',
    text: 'She sells a dream to a street that never learned to sleep.',
    bubble: 'sd1_bubble_16.png'
  },
  {
    index: 10,
    time: 74.5,
    cue: 'geisha_3d_protrusion',
    text: 'Her face leans out of the screen, one pixel closer to being real.',
    bubble: 'sd1_bubble_17.png'
  }
];

async function run() {
  console.log('Generating 5 NEW meaningful podcast frames for SD1 (Synthetic_Desires_1.mp4)...');

  for (const item of frames) {
    console.log(`\n[Frame ${item.index}/10] Extracting at ${item.time}s (${item.cue})...`);

    const ffmpeg = spawnSync('ffmpeg', [
      '-y',
      '-ss', String(item.time),
      '-i', 'Video/Synthetic_Desires_1.mp4',
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

    const outPath = join(outputDir, `SD1_podcast_meaningful_frame_${item.index}_${item.cue}.png`);
    writeFileSync(outPath, finalPng);
    console.log(`✓ Saved: ${outPath}`);
    console.log(`  Spoken: "${item.text}"`);
  }

  console.log('\nAll 5 NEW SD1 podcast frames captured and rendered.');
}

run().catch(console.error);
