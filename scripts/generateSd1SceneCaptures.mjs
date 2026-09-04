import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const outputDir = resolve('outputs/podcast-captures-sd1');
const bubbleDir = resolve('scripts/bubbles');
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Iconic scenes / characters / signage found by reviewing the full SD1 timeline.
const scenes = [
  {
    index: 6,
    time: 77.0,
    cue: 'panam_globe',
    caption: 'PAN-AM — the globe that promised everywhere and arrived nowhere.',
    bubble: 'sd1_bubble_05.png'
  },
  {
    index: 7,
    time: 46.0,
    cue: 'fire_noodle_bar',
    caption: 'Neon menus for a city that never stops consuming.',
    bubble: 'sd1_bubble_06.png'
  },
  {
    index: 8,
    time: 54.0,
    cue: 'woman_with_camera',
    caption: 'She photographs the evidence the archive refused to keep.',
    bubble: 'sd1_bubble_07.png'
  },
  {
    index: 9,
    time: 69.0,
    cue: 'red_kimono_geisha',
    caption: 'The face that sells what the city cannot remember.',
    bubble: 'sd1_bubble_08.png'
  },
  {
    index: 10,
    time: 67.0,
    cue: 'glitch_geisha',
    caption: 'The compression artifacts are the honest witnesses.',
    bubble: 'sd1_bubble_09.png'
  },
  {
    index: 11,
    time: 63.0,
    cue: 'photographer_silhouette',
    caption: 'Someone is always recording.',
    bubble: 'sd1_bubble_10.png'
  },
  {
    index: 12,
    time: 73.0,
    cue: 'off_neon_skyline',
    caption: 'The city glows brightest right before the lease expires.',
    bubble: 'sd1_bubble_11.png'
  },
  {
    index: 13,
    time: 22.0,
    cue: 'green_kimono_closeup',
    caption: 'I am built from ghosts.',
    bubble: 'sd1_bubble_12.png'
  }
];

async function run() {
  console.log('Reviewing full SD1 timeline for iconic scenes, characters and signage...');

  for (const item of scenes) {
    console.log(`\n[Scene ${item.index}/13] Extracting at ${item.time}s (${item.cue})...`);

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

    const outPath = join(outputDir, `SD1_scene_${String(item.index).padStart(2, '0')}_${item.cue}.png`);
    writeFileSync(outPath, finalPng);
    console.log(`✓ Saved: ${outPath}`);
    console.log(`  Caption: "${item.caption}"`);
  }

  console.log('\nAll SD1 scene captures rendered.');
}

run().catch(console.error);

