import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_FILE = resolve(ROOT, 'brain-dictionary.csv');
const OUT_DIR = resolve(ROOT, 'generated', 'movie-forge');

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function getRecord(rows, headers, index) {
  const values = rows[index] || [];
  return headers.reduce((record, header, headerIndex) => {
    record[header] = String(values[headerIndex] || '').trim();
    return record;
  }, {});
}

function uniqueList(values = []) {
  const items = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
  }
  return items;
}

function parseResponseValue(type, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return type === 'array' ? [] : '';
  if (type !== 'array') return value;

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeText(item)).filter(Boolean);
      }
    } catch {
    }
  }

  return [value];
}

function buildBrains(records) {
  const brains = {};
  for (const record of records) {
    const film = record.Film;
    const key = record.Key;
    const type = String(record.Type || '').toLowerCase();
    const response = record.Response || record['Response (preview)'];
    const engine = String(record.Engine || '').toUpperCase();

    if (!film || !key || !response) continue;
    if (key === '(unmatched input)' || engine === 'CLOUD') continue;

    const parsed = parseResponseValue(type, response);
    const current = brains[film] || { theme: record.Theme || '', dictionary: {} };
    if (!current.theme && record.Theme) current.theme = record.Theme;

    if (type === 'array') {
      current.dictionary[key] = uniqueList([...(Array.isArray(current.dictionary[key]) ? current.dictionary[key] : []), ...parsed]);
    } else if (current.dictionary[key] == null) {
      current.dictionary[key] = parsed;
    }

    brains[film] = current;
  }
  return brains;
}

function movieLabel(movieName = '') {
  return normalizeText(String(movieName || '').replace(/\.[^.]+$/i, '').replace(/[_-]+/g, ' '));
}

function inferStartIndex(movieName = '') {
  const match = String(movieName || '').match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) + 1 : 1;
}

function buildConceptTitle(baseTitle = '', startIndex = 1, offset = 0) {
  const normalizedBase = normalizeText(baseTitle) || 'Synthetic Desires';
  const numericMatch = normalizedBase.match(/^(.*?)(\d+)([^\d]*)$/);
  const target = Math.max(1, Number(startIndex || 1)) + offset;
  if (numericMatch) {
    return normalizeText(`${numericMatch[1]}${target}${numericMatch[3]}`);
  }
  return normalizeText(`${normalizedBase} ${target}`);
}

function firstValue(dictionary = {}, keys = []) {
  for (const key of keys) {
    const value = dictionary?.[key];
    if (typeof value === 'string' && normalizeText(value)) return normalizeText(value);
    if (Array.isArray(value)) {
      const first = value.map((item) => normalizeText(item)).find(Boolean);
      if (first) return first;
    }
  }
  return '';
}

function buildPack(movieName, brain, options = {}) {
  const theme = normalizeText(brain?.theme || firstValue(brain?.dictionary, ['about', 'what is this about']) || movieLabel(movieName));
  const baseTitle = normalizeText(options.baseTitle || movieLabel(movieName)) || movieLabel(movieName);
  const startIndex = Math.max(1, Number(options.startIndex || inferStartIndex(movieName)));
  const count = Math.max(1, Math.min(4, Number(options.count || 2)));
  const references = uniqueList([
    firstValue(brain?.dictionary, ['reference', 'influences', 'film']),
    ...(Array.isArray(brain?.dictionary?.default) ? brain.dictionary.default : [])
  ]).filter(Boolean);
  const concepts = [];

  for (let index = 0; index < count; index += 1) {
    const title = buildConceptTitle(baseTitle, startIndex, index);
    const seed = firstValue(brain?.dictionary, ['story', 'about', 'what is this about']);
    concepts.push({
      title,
      logline: normalizeText(`${title} evolves ${theme} into a new chapter. ${seed || 'Preserve the original emotional logic while moving the world forward.'}`),
      veoPrompt: normalizeText(`Create a concept trailer for ${title}. Theme: ${theme}. References: ${references.join(', ') || movieLabel(movieName)}. Keep it tactile, cinematic, and specific.`),
      soundtrackPrompt: normalizeText(`Compose a score for ${title}. Theme: ${theme}. Use tension, sensual rhythm, and a memorable melodic fragment.`),
      posterPrompt: normalizeText(`Design a premium poster for ${title}. ${theme}. One iconic central image, disciplined typography, no collage clutter.`)
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceMovie: movieName,
    sourceTitle: movieLabel(movieName),
    theme,
    baseTitle,
    startIndex,
    count,
    references,
    concepts
  };
}

function parseArgs(argv = []) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { positional, flags };
}

function main() {
  const raw = readFileSync(CSV_FILE, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw).filter((row) => row.some((cell) => normalizeText(cell)));
  const headers = rows[0].map((header) => normalizeText(header));
  const records = [];
  for (let index = 1; index < rows.length; index += 1) {
    records.push(getRecord(rows, headers, index));
  }
  const brains = buildBrains(records);
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const availableFilms = Object.keys(brains).sort();
  const movieName = positional[0] || flags.film || availableFilms[availableFilms.length - 1];

  if (!movieName || !brains[movieName]) {
    throw new Error(`Film not found in CSV. Available: ${availableFilms.join(', ')}`);
  }

  const pack = buildPack(movieName, brains[movieName], {
    baseTitle: flags.base || flags.title || movieLabel(movieName),
    startIndex: flags.start,
    count: flags.count
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = resolve(OUT_DIR, `${normalizeText(movieName).replace(/\.[^.]+$/i, '')}-forge-pack.json`);
  writeFileSync(outFile, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  console.log(`Wrote movie forge pack -> ${outFile}`);
}

main();