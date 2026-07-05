/**
 * exportBrainCSV.mjs
 * Generates a CSV table of all Brain dictionary entries
 * with their cloud/DICT engine status.
 *
 * Usage:  node scripts/exportBrainCSV.mjs
 * Output: brain-dictionary.csv  (in project root)
 */

import { movieBrains } from '../src/movieBrains.js';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, '..', 'brain-dictionary.csv');

// ── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value).replace(/\r?\n/g, ' ↵ ').trim();
  // Quote if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function row(...cells) {
  return cells.map(escapeCsv).join(',');
}

// ── Build rows ───────────────────────────────────────────────────────────────

const HEADERS = [
  'Film',
  'Theme',
  'Key',
  'Type',
  'Response',
  'Variants',
  'Engine',
  'Cloud Status',
  'Notes',
];

const rows = [HEADERS.map(escapeCsv).join(',')];

const ENGINE_DICT   = 'DICT';
const ENGINE_CLOUD  = 'CLOUD';
const STATUS_LOCAL  = 'Local - no API call';
const STATUS_CLOUD  = 'Cloud - Gemini API';

for (const [film, brain] of Object.entries(movieBrains)) {
  const theme = brain.theme || '';
  const dict  = brain.dictionary || {};

  for (const [key, value] of Object.entries(dict)) {
    const isArray   = Array.isArray(value);
    const type      = isArray ? 'array' : 'string';
    const variants  = isArray ? value.length : 1;
    const response  = isArray
      ? JSON.stringify(value)
      : String(value);

    // All dictionary entries are resolved locally (DICT engine).
    // 'default' is the catch-all fallback; anything not listed escalates to Cloud.
    const isDefault = key === 'default';
    const engine     = ENGINE_DICT;
    const cloudStat  = STATUS_LOCAL;
    const notes      = isDefault
      ? 'Catch-all fallback — used when no key matches'
      : '';

    rows.push(row(film, theme, key, type, response, variants, engine, cloudStat, notes));
  }

  // Add a synthetic "* (no match)" row to show what happens when nothing matches
  rows.push(row(
    film,
    theme,
    '(unmatched input)',
    '—',
    '(escalated to Gemini)',
    0,
    ENGINE_CLOUD,
    STATUS_CLOUD,
    'Any input that fails L1/L2/L3 DICT matching reaches Gemini cloud'
  ));

  // Blank separator row between films
  rows.push('');
}

// ── Write file ───────────────────────────────────────────────────────────────

const csv = rows.join('\r\n');
// Write UTF-8 BOM so Excel opens the file with correct encoding
const BOM = '\uFEFF';
writeFileSync(OUT_FILE, BOM + csv, 'utf8');
console.log(`Exported ${rows.length} rows -> ${OUT_FILE}`);
