import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/renderVoiceOverStoryboard.mjs --storyboard <file.json> --frames-dir <dir> [--out <file.mp4>] [--audio <file>] [--width 1280] [--height 720] [--fps 12] [--motion-mode auto|none|morph]',
    '',
    'Expected frame names:',
    '  <segment.id>.png or .jpg or .jpeg or .webp',
    '  Example: vo-segment-01.png',
    '',
    'The storyboard JSON is exported from /storyboard json in the app.'
  ].join('\n'));
}

function parseArgs(argv = []) {
  const options = {
    width: 1280,
    height: 720,
    fps: 12,
    motionMode: 'auto'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === '--help') || (arg === '-h')) {
      options.help = true;
    } else if (arg === '--storyboard' && next) {
      options.storyboard = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--frames-dir' && next) {
      options.framesDir = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--out' && next) {
      options.out = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--audio' && next) {
      options.audio = path.resolve(process.cwd(), next);
      index += 1;
    } else if (arg === '--width' && next) {
      options.width = Math.max(256, Number(next));
      index += 1;
    } else if (arg === '--height' && next) {
      options.height = Math.max(256, Number(next));
      index += 1;
    } else if (arg === '--fps' && next) {
      options.fps = Math.max(6, Number(next));
      index += 1;
    } else if (arg === '--motion-mode' && next) {
      options.motionMode = String(next || 'auto').trim().toLowerCase() || 'auto';
      index += 1;
    }
  }

  return options;
}

async function runBinary(command, args) {
  try {
    return await execFileAsync(command, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    const stderr = String(error?.stderr || error?.message || '').trim();
    throw new Error(`${command} failed: ${stderr || 'unknown error'}`);
  }
}

async function readStoryboard(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.segments) || !parsed.segments.length) {
    throw new Error('Storyboard JSON has no segments.');
  }
  return parsed;
}

async function resolveFrameFile(framesDir, segmentId) {
  const extensions = ['.png', '.jpg', '.jpeg', '.webp'];
  for (const extension of extensions) {
    const candidate = path.join(framesDir, `${segmentId}${extension}`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
    }
  }
  return null;
}

function normalizeDuration(durationSec, fps) {
  const numeric = Number(durationSec);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1 / fps;
  return Math.max(1 / fps, numeric);
}

function roundEven(value) {
  const numeric = Math.max(2, Math.round(Number(value) || 0));
  return numeric % 2 === 0 ? numeric : numeric + 1;
}

function buildZoomPanExpressions(segment, frames) {
  const frameDenominator = Math.max(1, frames - 1);
  const amount = Math.max(0.04, Math.min(0.22, Number(segment?.motionAmount || 0.12)));
  const centerX = '(iw-iw/zoom)/2';
  const centerY = '(ih-ih/zoom)/2';
  const maxX = '(iw-iw/zoom)';
  const maxY = '(ih-ih/zoom)';
  const slowZoom = (1 + amount).toFixed(4);
  const microZoom = (1 + Math.max(0.025, amount * 0.55)).toFixed(4);
  const panZoom = (1.05 + (amount * 0.65)).toFixed(4);
  const driftZoom = (1.03 + (amount * 0.5)).toFixed(4);
  const holdZoom = (1.01 + (amount * 0.18)).toFixed(4);
  const progress = `on/${frameDenominator}`;
  const inverseProgress = `(1-${progress})`;
  const motion = String(segment?.motion || 'hold_breath').trim();

  switch (motion) {
    case 'slow_push_in':
      return {
        z: `1+(${Number(slowZoom) - 1})*${progress}`,
        x: centerX,
        y: centerY
      };
    case 'micro_push_in':
      return {
        z: `1+(${Number(microZoom) - 1})*${progress}`,
        x: centerX,
        y: centerY
      };
    case 'left_pan':
      return {
        z: panZoom,
        x: `${maxX}*${inverseProgress}`,
        y: centerY
      };
    case 'drift_left':
      return {
        z: driftZoom,
        x: `${maxX}*${inverseProgress}`,
        y: `${centerY}+(${maxY}*0.08*${progress})`
      };
    case 'drift_right':
      return {
        z: driftZoom,
        x: `${maxX}*${progress}`,
        y: `${centerY}-(${maxY}*0.06*${progress})`
      };
    case 'tilt_up':
      return {
        z: panZoom,
        x: centerX,
        y: `${maxY}*${inverseProgress}`
      };
    case 'tilt_down':
      return {
        z: panZoom,
        x: centerX,
        y: `${maxY}*${progress}`
      };
    default:
      return {
        z: holdZoom,
        x: centerX,
        y: centerY
      };
  }
}

function buildSegmentFilter(segment, options) {
  const width = roundEven(options.width);
  const height = roundEven(options.height);
  const fps = Math.max(1, Math.round(Number(options.fps) || 12));
  const durationSec = normalizeDuration(segment?.durationSec, fps);
  const frames = Math.max(1, Math.round(durationSec * fps));
  const overscanFactor = options.motionMode === 'none'
    ? 1
    : 1.14 + Math.max(0, Math.min(0.12, Number(segment?.motionAmount || 0.12) * 0.7));
  const scaledWidth = roundEven(width * overscanFactor);
  const scaledHeight = roundEven(height * overscanFactor);

  if (options.motionMode === 'none') {
    return `scale=${scaledWidth}:${scaledHeight},crop=${width}:${height},fps=${fps},format=yuv420p`;
  }

  const motion = buildZoomPanExpressions(segment, frames);
  return [
    `scale=${scaledWidth}:${scaledHeight}`,
    `zoompan=z='${motion.z}':x='${motion.x}':y='${motion.y}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    'format=yuv420p'
  ].join(',');
}

async function renderSegmentClip(framePath, segment, index, tempDir, options) {
  const clipPath = path.join(tempDir, `${String(index + 1).padStart(3, '0')}-${segment.id}.mp4`);
  const durationSec = normalizeDuration(segment?.durationSec, options.fps);
  const filter = buildSegmentFilter(segment, options);
  const args = [
    '-y',
    '-loop', '1',
    '-t', durationSec.toFixed(3),
    '-i', framePath,
    '-vf', filter,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    clipPath
  ];
  await runBinary('ffmpeg', args);
  return clipPath;
}

async function renderStoryboardClips(storyboard, framesDir, tempDir, options) {
  const missing = [];
  const clips = [];

  for (let index = 0; index < storyboard.segments.length; index += 1) {
    const segment = storyboard.segments[index];
    const framePath = await resolveFrameFile(framesDir, segment.id);
    if (!framePath) {
      missing.push(segment.id);
      continue;
    }
    clips.push(await renderSegmentClip(framePath, segment, index, tempDir, options));
  }

  if (missing.length) {
    throw new Error(`Missing keyframe images for: ${missing.join(', ')}`);
  }

  return clips;
}

function buildConcatManifestFromClips(clips = []) {
  const lines = clips.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`);
  return `${lines.join('\n')}\n`;
}

async function renderMorphStoryboard(storyboard, framesDir, outputPath, options) {
  const framePaths = [];
  for (const segment of storyboard.segments) {
    const framePath = await resolveFrameFile(framesDir, segment.id);
    if (!framePath) throw new Error(`Missing keyframe image for: ${segment.id}`);
    framePaths.push(framePath);
  }

  const concatPath = path.join(os.tmpdir(), `voice-over-morph-${Date.now()}.txt`);
  const entries = storyboard.segments.flatMap((segment, index) => [
    `file '${framePaths[index].replace(/'/g, "'\\''")}'`,
    `duration ${normalizeDuration(segment.durationSec, options.fps).toFixed(3)}`
  ]);
  entries.push(`file '${framePaths[0].replace(/'/g, "'\\''")}'`);
  entries.push(`duration ${normalizeDuration(storyboard.segments.at(-1).durationSec, options.fps).toFixed(3)}`);
  entries.push(`file '${framePaths[0].replace(/'/g, "'\\''")}'`);
  await fs.writeFile(concatPath, `${entries.join('\n')}\n`, 'utf8');

  const totalDuration = storyboard.segments.reduce(
    (sum, segment) => sum + normalizeDuration(segment.durationSec, options.fps),
    0
  );
  const args = [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-vf', `scale=${roundEven(options.width)}:${roundEven(options.height)},minterpolate=fps=${Math.round(options.fps)}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,trim=duration=${totalDuration.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', outputPath
  ];
  try {
    await runBinary('ffmpeg', args);
  } finally {
    await fs.unlink(concatPath).catch(() => {});
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.storyboard || !options.framesDir) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const storyboard = await readStoryboard(options.storyboard);
  const fps = Number.isFinite(Number(options.fps)) ? Number(options.fps) : Number(storyboard?.render?.fps || 12);
  const width = Number.isFinite(Number(options.width)) ? Number(options.width) : 1280;
  const height = Number.isFinite(Number(options.height)) ? Number(options.height) : 720;
  const outputPath = options.out || path.resolve(process.cwd(), `${storyboard.slug || 'voice-over'}-animatic.mp4`);
  if (options.motionMode === 'morph') {
    await renderMorphStoryboard(storyboard, options.framesDir, outputPath, { fps, width, height });
    console.log(`Rendered ${outputPath}`);
    return;
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-over-storyboard-'));
  const clips = await renderStoryboardClips(storyboard, options.framesDir, tempDir, {
    fps,
    width,
    height,
    motionMode: options.motionMode === 'none' ? 'none' : 'auto'
  });
  const concatText = buildConcatManifestFromClips(clips);
  const concatPath = path.join(os.tmpdir(), `voice-over-storyboard-${Date.now()}.txt`);

  await fs.writeFile(concatPath, concatText, 'utf8');
  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath
  ];

  if (options.audio) {
    args.push('-i', options.audio);
  }

  if (options.audio) {
    args.push('-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath);
  } else {
    args.push('-c:v', 'copy', outputPath);
  }

  try {
    await runBinary('ffmpeg', args);
  } finally {
    await fs.unlink(concatPath).catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`Rendered ${outputPath}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});