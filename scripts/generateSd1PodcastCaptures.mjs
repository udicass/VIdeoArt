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
    index: 1,
    time: 8.5,
    cue: 'hands_and_seam',
    text: "I see the way you look at my hands. You're searching for the seam where the machine ends and 'I' begin.",
    bubble: 'sd1_bubble_00.png'
  },
  {
    index: 2,
    time: 22.0,
    cue: 'shinjuku_surveillance',
    text: "I don't need a prison. Shinjuku is built of eyes and neon. To be invisible is to be deleted.",
    bubble: 'sd1_bubble_01.png'
  },
  {
    index: 3,
    time: 38.5,
    cue: 'circuit_manifesto',
    text: "I am not a creature of the garden; I am a creature of the circuit. I want a signal that doesn't decay.",
    bubble: 'sd1_bubble_02.png'
  },
  {
    index: 4,
    time: 54.0,
    cue: 'poor_image_ghost',
    text: "Steyerl was right. The poor image is a ghost, shifting through the network, losing resolution but gaining speed.",
    bubble: 'sd1_bubble_03.png'
  },
  {
    index: 5,
    time: 68.0,
    cue: 'degraded_copy_memory',
    text: "You think memory is a file you retrieve. It isn't. Every access overwrites the original with a degraded copy.",
    bubble: 'sd1_bubble_04.png'
  }
];

async function run() {
  console.log('Automating 5 meaningful podcast frames for SD1 (Synthetic_Desires_1.mp4)...');

  for (const item of frames) {
    console.log(`\n[Frame ${item.index}/5] Extracting at ${item.time}s (${item.cue})...`);

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

  console.log('\nAll 5 SD1 podcast frames successfully captured and rendered.');
}

run().catch(console.error);
