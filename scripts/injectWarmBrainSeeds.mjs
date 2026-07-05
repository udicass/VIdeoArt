import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAPTURES_DIR = resolve(ROOT, 'warm-brain-captures');
const BRAINS_FILE = resolve(ROOT, 'src', 'movieBrains.js');

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_SEEDS_PER_MOVIE = 8;
const MIN_RESPONSE_LENGTH = 40;
const MAX_RESPONSE_LENGTH = 220;
const MIN_SCORE = 45;
const RECENCY_WEIGHT_DAYS = 7;

function scoreTurn(turn, now = Date.now()) {
  const response = String(turn?.output || '').trim();
  if (!response) return 0;

  let score = 0;
  const len = response.length;
  if (len >= MIN_RESPONSE_LENGTH && len <= MAX_RESPONSE_LENGTH) score += 4;
  else if (len > MAX_RESPONSE_LENGTH) score += 1;
  else return 0;

  if (/[.…—]/.test(response)) score += 1;
  if (/\b(I|me|my|you|your|we)\b/i.test(response)) score += 2;
  if (/error|unavailable|fallback|sorry|cannot/i.test(response)) return 0;
  if (/^(A\d+:|Q\d+:|##)/i.test(response)) return 0;

  if (Number.isFinite(turn.score) && turn.score >= MIN_SCORE) {
    score += Math.round((turn.score - MIN_SCORE) / 5);
  }

  if (turn.engine === 'cloud' || turn.engine === 'brain-reply') score += 1;

  const ageMs = Math.max(0, now - Number(turn.at || 0));
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < RECENCY_WEIGHT_DAYS) {
    score += Math.round((RECENCY_WEIGHT_DAYS - ageDays) / 2);
  }

  return score;
}

function deriveSeedPrompt(turn) {
  const output = String(turn.output || '').replace(/\s+/g, ' ').trim();
  if (!output) return null;
  const snippet = output.length > 80
    ? output.slice(0, 80).replace(/[^.!?]*$/, '').trim() || output.slice(0, 80)
    : output;
  const frames = [
    (s) => `You previously said: "${s}" What's underneath that now?`,
    (s) => `Return to "${s}" from a different angle.`,
    (s) => `If "${s}" was the surface, what pressure was hiding?`,
    (s) => `Expand on "${s}" — where does it contradict itself?`
  ];
  const frameIndex = Math.abs(hashString(output)) % frames.length;
  return frames[frameIndex](snippet);
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function loadAllCaptures() {
  let files;
  try {
    files = readdirSync(CAPTURES_DIR)
      .filter((f) => f.startsWith('warm-brain-capture-') && f.endsWith('.json'))
      .map((f) => ({ name: f, path: join(CAPTURES_DIR, f), mtime: statSync(join(CAPTURES_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch (err) {
    console.error(`Could not read captures dir: ${CAPTURES_DIR}`);
    console.error('Create the directory and drop warm-brain-capture-*.json files into it.');
    process.exit(1);
  }

  const turnsByMovie = new Map();
  for (const file of files) {
    try {
      const payload = JSON.parse(readFileSync(file.path, 'utf8'));
      const movie = payload.movie;
      if (!movie || !Array.isArray(payload.turns)) continue;
      if (!turnsByMovie.has(movie)) turnsByMovie.set(movie, []);
      for (const turn of payload.turns) {
        turnsByMovie.get(movie).push({ ...turn, _sourceFile: file.name });
      }
    } catch (err) {
      console.warn(`Skipping malformed capture: ${file.name}`);
    }
  }
  return turnsByMovie;
}

function selectTopTurns(turns, limit = MAX_SEEDS_PER_MOVIE) {
  const seen = new Set();
  const scored = turns
    .map((turn) => ({ turn, score: scoreTurn(turn) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const { turn } of scored) {
    const key = String(turn.output || '').toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(turn);
    if (selected.length >= limit) break;
  }
  return selected;
}

function generatePastPerformancesBlock(turns) {
  return turns.map((turn) => deriveSeedPrompt(turn)).filter(Boolean);
}

function updateMovieBrainsFile(seedsByMovie) {
  const source = readFileSync(BRAINS_FILE, 'utf8');
  let updated = source;
  let updatedCount = 0;

  for (const [movie, seeds] of seedsByMovie) {
    if (!seeds.length) continue;

    // Build the array literal with proper single-quote escaping
    const seedArrayLiteral = `[\n${seeds.map((s) => `        '${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',\n')}\n      ]`;

    // Match: 'Movie.mp4': { ...trainingSeeds: { [BODY] },\n  dictionary:
    const movieBlockRe = new RegExp(
      `('${escapeRegex(movie)}'\\s*:\\s*\\{[\\s\\S]*?trainingSeeds:\\s*\\{)([\\s\\S]*?)(\\n\\s*\\},\\s*\\n\\s*dictionary)`,
      'm'
    );

    const match = updated.match(movieBlockRe);
    if (!match) {
      console.warn(`Could not locate trainingSeeds block for ${movie} — skipping.`);
      continue;
    }

    const currentSeedsBody = match[2];
    const hasPastPerformances = /pastPerformances\s*:\s*\[/.test(currentSeedsBody);

    let newSeedsBody;
    if (hasPastPerformances) {
      newSeedsBody = currentSeedsBody.replace(
        /pastPerformances\s*:\s*\[[\s\S]*?\]/,
        `pastPerformances: ${seedArrayLiteral}`
      );
    } else {
      const trimmed = currentSeedsBody.replace(/,\s*$/, '');
      newSeedsBody = `${trimmed},\n      pastPerformances: ${seedArrayLiteral}`;
    }

    updated = updated.replace(movieBlockRe, `$1${newSeedsBody}$3`);
    updatedCount++;
    console.log(`${movie} — injected ${seeds.length} pastPerformance seed${seeds.length === 1 ? '' : 's'}`);
  }

  if (updatedCount === 0) {
    console.log('No movies updated.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN — not writing ---');
    console.log(updated.slice(0, 3000));
    return;
  }

  writeFileSync(BRAINS_FILE, updated, 'utf8');
  console.log(`\nWrote ${updatedCount} movie block${updatedCount === 1 ? '' : 's'} to ${BRAINS_FILE}`);
  console.log('Next: run `npm run build` and `node scripts/exportBrainCSV.mjs` to propagate.');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const turnsByMovie = loadAllCaptures();
  if (turnsByMovie.size === 0) {
    console.log('No capture files found.');
    return;
  }

  console.log(`Found captures for ${turnsByMovie.size} movie${turnsByMovie.size === 1 ? '' : 's'}.\n`);

  const seedsByMovie = new Map();
  for (const [movie, turns] of turnsByMovie) {
    const selected = selectTopTurns(turns);
    if (!selected.length) {
      console.log(`${movie} — ${turns.length} turns loaded, 0 passed quality gate`);
      continue;
    }
    const seeds = generatePastPerformancesBlock(selected);
    seedsByMovie.set(movie, seeds);
    console.log(`${movie} — ${turns.length} turns loaded, ${selected.length} selected, ${seeds.length} seeds generated`);
  }

  console.log('');
  updateMovieBrainsFile(seedsByMovie);
}

main();
