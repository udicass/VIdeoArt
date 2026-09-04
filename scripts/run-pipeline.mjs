#!/usr/bin/env node
/**
 * run-pipeline.mjs
 *
 * Unified wrapper for the Synthetic Desires video processing pipeline:
 *   1️⃣ Loop‑trim to exact duration (default 120 s)
 *   2️⃣ Normalize to 512×512, 6 fps, silent H.264
 *   3️⃣ Stylize via Deforum (img2img) using the same prompt/seeds as SD3
 *
 * Usage:
 *   node scripts/run-pipeline.mjs <movie-name> [--frames <N>] [--fps <N>] [--duration <S>]
 *
 * Example:
 *   node scripts/run-pipeline.mjs Synthetic_Desires_4 --frames 720 --fps 6
 *
 * Output (JSON) is printed to stdout:
 * {
 *   "inputPath": "Video/<movie-name>.mp4",
 *   "outputPath": "outputs/deforum-merged-previews/sd4_DEFORUM_FROM_ORIGINAL.mp4",
 *   "frameCount": 720,
 *   "duration": 120.0,
 *   "status": "success"
 * }
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- Helper: simple argument parsing ----------
const args = process.argv.slice(2);
const rawMovieName = args[0];
if (!rawMovieName) {
  console.error('Usage: node scripts/run-pipeline.mjs <movie-name> [--frames <N>] [--fps <N>] [--duration <S>]');
  process.exit(1);
}

const options = {};
for (let i = 1; i < args.length; i++) {
  const key = args[i];
  const val = args[i + 1];
  if (key.startsWith('--')) {
    options[key.slice(2)] = val;
  }
}
const targetFps = Number(options.fps) || 6;
const targetFrames = Number(options.frames) || 720; // 6 fps × 120 s
const targetDuration = Number(options.duration) || 120;
const outputName = rawMovieName.replace(/\s+/g, '_').trim();
const outputPrefix = options['output-prefix'] || `${outputName.toUpperCase()}_DEFORUM_FROM_ORIGINAL`;
const isDryRun = args.includes('--dry-run');

// Resolve paths
const root = process.cwd();
let videoPath = path.join(root, 'Video', `${rawMovieName}.mp4`);
const inputLoopPath = path.join(root, 'outputs', 'deforum-merged-previews', `${outputName}_120sec_loop.mp4`);
const normalizedPath = path.join(root, 'outputs', 'deforum-inputs', `${outputName}_512x512_6fps_120sec.mp4`);
const outputPath = path.join(root, 'outputs', 'deforum-merged-previews', `${outputPrefix}.mp4`);

if (!existsSync(videoPath)) {
  const normalizedInput = rawMovieName.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const matchingName = readdirSync(path.join(root, 'Video')).find((name) =>
    name.toLowerCase().endsWith('.mp4') &&
    name.replace(/[^a-z0-9]/gi, '').toLowerCase().includes(normalizedInput)
  );
  videoPath = matchingName ? path.join(root, 'Video', matchingName) : undefined;
  if (!videoPath) throw new Error(`Input video not found for movie name: ${rawMovieName}`);
}

mkdirSync(path.dirname(inputLoopPath), { recursive: true });
mkdirSync(path.dirname(normalizedPath), { recursive: true });

if (isDryRun) {
  const dryRunArgs = [
    '--input', normalizedPath,
    '--output-prefix', outputPrefix,
    '--prompt', 'fashion model replicant luxury, constructed gaze, synthetic desire, neon reflections, soft editorial lighting',
    '--fps', String(targetFps),
    '--max-frames', String(targetFrames),
    '--work-root', 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-18',
  ];
  console.log(JSON.stringify({ inputPath: path.relative(root, videoPath), normalizedPath: path.relative(root, normalizedPath), outputPath: path.relative(root, outputPath), stylizeArgs: dryRunArgs, status: 'dry-run' }, null, 2));
  process.exit(0);
}

// ---------- Step 1: Loop‑trim (or reuse existing loop file) ----------
if (!existsSync(inputLoopPath)) {
  console.log(`[Step 1] Creating 120‑second loop source...`);
  execFileSync('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-t', targetDuration,
    '-c', 'copy',
    inputLoopPath,
  ]);
} else {
  console.log(`[Step 1] Loop source already exists: ${inputLoopPath}`);
}

// ---------- Step 2: Normalize to 512×512, 6 fps ----------
if (!existsSync(normalizedPath)) {
  console.log(`[Step 2] Normalizing video...`);
  execFileSync('ffmpeg', [
    '-y',
    '-i', inputLoopPath,
    '-vf', `scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=${targetFps}`,
    '-r', String(targetFps),
    '-an',
    '-c:v', 'libx264',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    normalizedPath,
  ]);
} else {
  console.log(`[Step 2] Normalized video already exists: ${normalizedPath}`);
}

// ---------- Step 3: Stylize with Deforum (reuse existing script) ----------
console.log(`[Step 3] Running Deforum stylization...`);
const stylizeArgs = [
  '--input', normalizedPath,
  '--output-prefix', outputPrefix,
  '--prompt', 'fashion model replicant luxury, constructed gaze, synthetic desire, neon reflections, soft editorial lighting',
  '--fps', String(targetFps),
  '--max-frames', String(targetFrames),
  '--work-root', 'D:\\SD_Deforum_Fresh\\outputs\\img2img-images\\2026-07-18',
];
if (options.blendRight) stylizeArgs.push('--blend-right', options.blendRight);
if (options.blendMode) stylizeArgs.push('--blend-mode', options.blendMode);
if (options.blendRatio) stylizeArgs.push('--blend-ratio', options.blendRatio);

if (isDryRun) {
  console.log(JSON.stringify({ inputPath: path.relative(root, videoPath), normalizedPath: path.relative(root, normalizedPath), outputPath: path.relative(root, outputPath), stylizeArgs, status: 'dry-run' }, null, 2));
  process.exit(0);
}

execFileSync('node', [path.join(root, 'scripts', 'stylizeVideoToDeforum.mjs'), ...stylizeArgs], { stdio: 'inherit' });

// ---------- Emit JSON summary ----------
const summary = {
  inputPath: path.relative(root, videoPath),
  outputPath: path.relative(root, outputPath),
  frameCount: targetFrames,
  duration: targetDuration,
  status: 'success',
};

console.log(JSON.stringify(summary, null, 2));
