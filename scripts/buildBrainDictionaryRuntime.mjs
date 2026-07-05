import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IN_FILE = resolve(ROOT, 'brain-dictionary.csv');
const OUT_FILE = resolve(ROOT, 'src', 'generated', 'brainDictionaryRuntime.js');

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

function pushUnique(list, value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return;
  const exists = list.some((item) => item.toLowerCase() === normalized.toLowerCase());
  if (!exists) list.push(normalized);
}

function ensureArrayDictionaryValue(target, key, value) {
  if (!Array.isArray(target[key])) {
    const existing = target[key];
    target[key] = [];
    if (typeof existing === 'string' && existing.trim()) {
      pushUnique(target[key], existing);
    }
  }
  pushUnique(target[key], value);
}

function buildFallbackPersonality(theme, film) {
  const filmLabel = String(film || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const themeLabel = String(theme || '').replace(/\s+/g, ' ').trim();
  if (themeLabel) {
    return `Poetic, concise, and cinematic; anchored to ${themeLabel}.`;
  }
  if (filmLabel) {
    return `Poetic, concise, and cinematic; anchored to the world of ${filmLabel}.`;
  }
  return 'Poetic, concise, and cinematic.';
}

function parseResponseValue(type, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return type === 'array' ? [] : '';
  if (type !== 'array') return value;

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
      }
    } catch {
      // Fall back to legacy single-preview behavior.
    }
  }

  return [value];
}

function buildRuntimeBrains(records) {
  const brains = {};

  for (const record of records) {
    const film = record.Film;
    const key = record.Key;
    const type = String(record.Type || '').toLowerCase();
    const preview = record.Response || record['Response (preview)'];
    const engine = String(record.Engine || '').toUpperCase();

    if (!film || !key || !preview) continue;
    if (key === '(unmatched input)' || engine === 'CLOUD') continue;

    const parsedValue = parseResponseValue(type, preview);
    if ((Array.isArray(parsedValue) && !parsedValue.length) || (!Array.isArray(parsedValue) && !parsedValue)) continue;

    const current = brains[film] || {
      theme: record.Theme || '',
      fallbackPersonality: buildFallbackPersonality(record.Theme, film),
      dictionary: {}
    };

    if (!current.theme && record.Theme) {
      current.theme = record.Theme;
      current.fallbackPersonality = buildFallbackPersonality(record.Theme, film);
    }

    if (type === 'array') {
      for (const item of parsedValue) {
        ensureArrayDictionaryValue(current.dictionary, key, item);
      }
    } else if (current.dictionary[key] == null) {
      current.dictionary[key] = parsedValue;
    } else if (Array.isArray(current.dictionary[key])) {
      pushUnique(current.dictionary[key], parsedValue);
    } else if (String(current.dictionary[key]).trim() !== parsedValue) {
      current.dictionary[key] = [String(current.dictionary[key]).trim(), parsedValue].filter(Boolean);
    }

    brains[film] = current;
  }

  return brains;
}

function main() {
  const raw = readFileSync(IN_FILE, 'utf8').replace(/^\uFEFF/, '');
  const rows = parseCsv(raw).filter((row) => row.some((cell) => String(cell || '').trim()));
  if (!rows.length) {
    throw new Error(`CSV is empty: ${IN_FILE}`);
  }

  const headers = rows[0].map((header) => String(header || '').trim());
  const records = [];
  for (let index = 1; index < rows.length; index += 1) {
    records.push(getRecord(rows, headers, index));
  }

  const brains = buildRuntimeBrains(records);
  const source = [
    '// Auto-generated by scripts/buildBrainDictionaryRuntime.mjs',
    '// Source: brain-dictionary.csv',
    `export const brainDictionaryRuntime = ${JSON.stringify(brains, null, 2)};`,
    '',
    'export default brainDictionaryRuntime;',
    ''
  ].join('\n');

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, source, 'utf8');
  console.log(`Built ${Object.keys(brains).length} runtime brains -> ${OUT_FILE}`);
}

main();