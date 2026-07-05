import { movieBrains } from './movieBrains.js';
import { loadMemories } from './brainMemory.js';

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value).replace(/\r?\n/g, ' ↵ ').trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function row(...cells) {
  return cells.map(escapeCsv).join(',');
}

export function buildBrainDictionaryCSV({ includeRuntimeMemories = true } = {}) {
  const HEADERS = ['Film', 'Theme', 'Key', 'Type', 'Response', 'Variants', 'Engine', 'Cloud Status', 'Notes'];
  const rows = [HEADERS.map(escapeCsv).join(',')];

  for (const [film, brain] of Object.entries(movieBrains)) {
    const theme = brain.theme || '';
    const dict = brain.dictionary || {};

    for (const [key, value] of Object.entries(dict)) {
      const isArray = Array.isArray(value);
      const type = isArray ? 'array' : 'string';
      const variants = isArray ? value.length : 1;
      const response = isArray ? JSON.stringify(value) : String(value);
      const notes = key === 'default' ? 'Catch-all fallback' : '';
      rows.push(row(film, theme, key, type, response, variants, 'DICT', 'Local - no API call', notes));
    }

    if (includeRuntimeMemories) {
      const mems = loadMemories(film) || [];
      for (const mem of mems) {
        if (!mem?.input || !mem?.response) continue;
        rows.push(row(
          film, theme, mem.input, 'runtime', mem.response, 1,
          'RUNTIME', 'KV/localStorage hydrated',
          `score:${mem.score || 0} saved:${new Date(mem.savedAt || 0).toISOString()}`
        ));
      }
    }

    rows.push(row(film, theme, '(unmatched input)', '—', '(escalated to Gemini)', 0, 'CLOUD', 'Cloud - Gemini API', 'L1/L2/L3 miss'));
    rows.push('');
  }

  return '\uFEFF' + rows.join('\r\n');
}

export function downloadBrainDictionaryCSV(filenameSuffix = '') {
  const csv = buildBrainDictionaryCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brain-dictionary${filenameSuffix ? '-' + filenameSuffix : ''}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
