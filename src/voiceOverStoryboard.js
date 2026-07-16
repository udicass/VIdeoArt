function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function slugifyMovieName(movieName = '') {
  return String(movieName || '')
    .trim()
    .replace(/\.[^.]+$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'voice-over';
}

function hashSeed(value = '') {
  return String(value || '')
    .split('')
    .reduce((hash, char) => ((hash * 33) + char.charCodeAt(0)) >>> 0, 5381);
}

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(value = '') {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function uniqueValues(values = [], limit = 8) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : [values]) {
    const value = normalizeWhitespace(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function chooseMotion(text = '', index = 0) {
  const normalized = String(text || '').toLowerCase();
  const motionRules = [
    { test: /(corridor|hall|street|road|toward|forward|distance|approach|enter)/, motion: 'slow_push_in' },
    { test: /(memory|flashback|reflection|glass|mirror|echo)/, motion: 'drift_right' },
    { test: /(city|window|skyline|neon|rain|outside)/, motion: 'left_pan' },
    { test: /(body|face|close-up|hand|mouth|skin|eye)/, motion: 'micro_push_in' },
    { test: /(fall|drop|collapse|sink|down|under)/, motion: 'tilt_down' },
    { test: /(rise|lift|tower|angel|sky|upward)/, motion: 'tilt_up' }
  ];
  const matched = motionRules.find((rule) => rule.test.test(normalized));
  if (matched) return matched.motion;
  const fallback = ['slow_push_in', 'left_pan', 'drift_left', 'drift_right', 'hold_breath'];
  return fallback[index % fallback.length];
}

function choosePalette(theme = '', world = '', text = '') {
  const normalized = `${theme} ${world} ${text}`.toLowerCase();
  if (/(noir|rain|night|blade runner|neon|chrome)/.test(normalized)) return 'cyan, amber, wet black';
  if (/(desert|sand|heat|sun)/.test(normalized)) return 'sand, copper, pale gold';
  if (/(forest|earth|organic|moss)/.test(normalized)) return 'moss, bark, soft gray';
  if (/(dream|memory|ghost|fog)/.test(normalized)) return 'silver, pearl, smoke blue';
  return 'charcoal, muted teal, tungsten amber';
}

function chooseReferences(ctx = {}, limit = 4) {
  return uniqueValues([
    ctx?.ref,
    ctx?.reference,
    ...(Array.isArray(ctx?.refs) ? ctx.refs : []),
    ...(Array.isArray(ctx?.observations) ? ctx.observations : [])
  ], limit);
}

function choosePromptTags(ctx = {}, beat = '', limit = 6) {
  const normalizedBeat = normalizeWhitespace(beat);
  const beatTokens = normalizedBeat
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 5);
  return uniqueValues([
    ctx?.theme,
    ctx?.world,
    ctx?.lead,
    ctx?.persona,
    ...beatTokens.slice(0, 3)
  ], limit);
}

function buildPositivePrompt({ filmTitle, beat, ctx = {}, motion = '', seed = 0 }) {
  const references = chooseReferences(ctx, 3);
  const tags = choosePromptTags(ctx, beat, 6);
  const palette = choosePalette(ctx?.theme, ctx?.world, beat);
  const parts = [
    `${filmTitle}, cinematic still`,
    normalizeWhitespace(beat),
    tags.join(', '),
    references.length ? `influences: ${references.join(', ')}` : '',
    `palette: ${palette}`,
    `camera: ${motion.replace(/_/g, ' ')}`,
    'moody, atmospheric, high texture, coherent composition, character-led frame',
    `seed anchor ${seed % 100000}`
  ];
  return parts.filter(Boolean).join(', ');
}

function buildNegativePrompt() {
  return [
    'flicker',
    'watermark',
    'subtitle',
    'text overlay',
    'logo',
    'tiling, pattern, grid, repetitive, symmetrical, texture', // Anti-tiling
    'extra limbs',
    'duplicate face',
    'blurry anatomy',
    'oversaturated',
    'low detail background',
    'hard cut collage'
  ].join(', ');
}

function allocateDurations(beats = [], totalDurationSec = 90) {
  const safeBeats = Array.isArray(beats) ? beats.filter((beat) => normalizeWhitespace(beat)) : [];
  if (!safeBeats.length) return [];
  const weighted = safeBeats.map((beat) => Math.max(1, splitSentences(beat).length * 1.15 + (normalizeWhitespace(beat).length / 90)));
  const totalWeight = weighted.reduce((sum, value) => sum + value, 0) || safeBeats.length;
  return weighted.map((weight) => {
    const proportional = (weight / totalWeight) * totalDurationSec;
    return clampNumber(proportional, 2.8, 8.5, 4.5);
  });
}

export function buildVoiceOverStoryboard(options = {}) {
  const movieName = String(options?.movie || '').trim();
  const filmTitle = movieName.replace(/\.mp4$/i, '').replace(/_/g, ' ') || 'Voice Over';
  const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : {};
  const beats = Array.isArray(options?.beats) ? options.beats.map((beat) => normalizeWhitespace(beat)).filter(Boolean) : [];
  const fps = clampNumber(options?.fps, 8, 16, 12);
  const width = clampNumber(options?.width, 512, 1536, 768);
  const height = clampNumber(options?.height, 512, 1536, 768);
  const targetDurationSec = clampNumber(options?.targetDurationSec, 18, 240, 90);
  const durations = allocateDurations(beats, targetDurationSec);
  const negativePrompt = buildNegativePrompt();

  let elapsedSec = 0;
  let currentFrame = 0;
  const segments = beats.map((beat, index) => {
    const durationSec = durations[index] || 4.5;
    const startSec = elapsedSec;
    const endSec = startSec + durationSec;
    const startFrame = currentFrame;
    const frameCount = Math.max(1, Math.round(durationSec * fps));
    const endFrame = startFrame + frameCount;
    const motion = chooseMotion(beat, index);
    const seed = hashSeed(`${movieName}:${index}:${beat}`);
    const denoiseStrength = clampNumber(0.22 + ((index % 4) * 0.03), 0.2, 0.34, 0.24);
    const cadence = clampNumber(durationSec / Math.max(1, splitSentences(beat).length || 1), 0.9, 3.4, 1.8);
    const prompt = buildPositivePrompt({ filmTitle, beat, ctx, motion, seed });
    const sceneTags = choosePromptTags(ctx, beat, 7);

    elapsedSec = endSec;
    currentFrame = endFrame;

    return {
      id: `vo-segment-${String(index + 1).padStart(2, '0')}`,
      index,
      beat,
      startSec: Number(startSec.toFixed(2)),
      endSec: Number(endSec.toFixed(2)),
      durationSec: Number(durationSec.toFixed(2)),
      startFrame,
      endFrame,
      keyframe: startFrame,
      prompt,
      negativePrompt,
      motion,
      seed,
      denoiseStrength: Number(denoiseStrength.toFixed(2)),
      guidanceScale: 6,
      cadenceSecPerSentence: Number(cadence.toFixed(2)),
      motionAmount: motion === 'hold_breath' ? 0.08 : motion === 'micro_push_in' ? 0.12 : 0.18,
      sceneTags
    };
  });

  const deforumPromptSchedule = segments
    .map((segment) => `${segment.keyframe}: ${segment.prompt}`)
    .join('\n');

  return {
    version: 1,
    mode: 'voice-over-sd-lite',
    movie: movieName,
    filmTitle,
    slug: slugifyMovieName(movieName),
    generatedAt: new Date().toISOString(),
    render: {
      fps,
      width,
      height,
      totalFrames: segments.length ? segments[segments.length - 1].endFrame : 0,
      totalDurationSec: Number((segments.reduce((sum, segment) => sum + segment.durationSec, 0)).toFixed(2)),
      strategy: 'keyframes-plus-motion',
      interpolation: 'optical-flow-or-rife',
      imageModel: 'sd15-or-sdxl-turbo',
      animationModel: 'deforum-lite',
      notes: [
        'Render keyframes only on scene or semantic change.',
        'Use img2img with low denoise between keyframes if continuity needs help.',
        'Fill intermediate frames with camera motion and interpolation rather than fresh diffusion.'
      ]
    },
    source: {
      theme: ctx?.theme || '',
      lead: ctx?.lead || ctx?.persona || '',
      world: ctx?.world || '',
      references: chooseReferences(ctx, 6)
    },
    segments,
    deforumPromptSchedule
  };
}

export function formatVoiceOverStoryboardSchedule(plan = null) {
  if (!plan || !Array.isArray(plan?.segments) || !plan.segments.length) return '';
  const lines = [
    `# ${plan.filmTitle} · Voice Over SD Lite`,
    `# fps=${plan?.render?.fps || 12} size=${plan?.render?.width || 768}x${plan?.render?.height || 768}`,
    '# Render only keyframes listed below, then interpolate or animate between them.',
    ''
  ];
  plan.segments.forEach((segment) => {
    lines.push(`[${segment.id}] ${segment.startFrame}-${segment.endFrame} ${segment.motion}`);
    lines.push(segment.prompt);
    lines.push(`negative: ${segment.negativePrompt}`);
    lines.push(`denoise=${segment.denoiseStrength} guidance=${segment.guidanceScale} motionAmount=${segment.motionAmount}`);
    lines.push('');
  });
  lines.push('# Deforum prompt schedule');
  lines.push(plan.deforumPromptSchedule || '');
  return lines.join('\n').trim();
}