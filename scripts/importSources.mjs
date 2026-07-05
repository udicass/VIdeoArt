#!/usr/bin/env node
/**
 * importSources.mjs
 *
 * Two modes:
 *
 * 1. SYNTHESIS mode (default) — Feed raw text, Gemini synthesises Q&A pairs.
 *    Use for: articles, essays, Wikipedia, your notes.
 *
 * 2. DIRECT mode (--direct) — Import Q&A pairs from a CSV/TSV file directly,
 *    skipping Gemini entirely. Use for: NotebookLM FAQ exports, Google Sheets
 *    with question/answer columns.
 *
 * Usage:
 *   node scripts/importSources.mjs --movie "Synthetic_Desires_1.mp4" --files review.txt
 *   node scripts/importSources.mjs --movie "Synthetic_Desires_1.mp4" --text "Raw text..."
 *   node scripts/importSources.mjs --movie "Synthetic_Desires_1.mp4" --direct --files notebooklm.csv
 *   node scripts/importSources.mjs --movie "Synthetic_Desires_1.mp4" --direct --files sheet.csv --qcol "Question" --acol "Answer"
 *
 * Options:
 *   --movie   <name>       Film filename (required)
 *   --files   <paths...>   One or more files (text or CSV)
 *   --text    <string>     Inline text source
 *   --direct               Direct CSV import mode (no Gemini synthesis)
 *   --qcol    <header>     Column header for questions in CSV (default: auto-detect)
 *   --acol    <header>     Column header for answers in CSV (default: auto-detect)
 *   --count   <n>          Max Q&A pairs from synthesis (default: 8, max: 20)
 *   --host    <url>        Deployment URL (default: https://gesture-3d.vercel.app)
 *   --key     <apikey>     Gemini API key (synthesis mode only)
 *   --dry-run              Preview without calling the API
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Local env reader ──────────────────────────────────────────────────────────
// Reads GEMINI_API_KEY from .env.local or .env so synthesis can run locally
// without hitting the server-side quota limit.

function loadLocalEnv() {
    const envFiles = ['.env.local', '.env'];
    for (const file of envFiles) {
        const fp = resolve(process.cwd(), file);
        if (!existsSync(fp)) continue;
        for (const line of readFileSync(fp, 'utf8').split('\n')) {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (m && !process.env[m[1]]) {
                process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
            }
        }
    }
}
loadLocalEnv();

// ── Local Gemini synthesis ────────────────────────────────────────────────────

const LOCAL_GEMINI_CANDIDATES = [
    ['v1beta', 'gemini-2.5-flash'],
    ['v1beta', 'gemini-2.0-flash'],
    ['v1beta', 'gemini-2.0-flash-lite'],
];

async function synthesiseLocally(apiKey, movieTitle, sources, count) {
    const sourcesText = sources.map((s, i) => `--- Source ${i + 1} ---\n${s.trim()}`).join('\n\n');
    const prompt = `You are a film analyst creating a knowledge base for an AI podcast host.

Given the source texts below about the film "${movieTitle}", generate exactly ${count} Q&A pairs suitable for a poetic, intellectual film podcast.

Rules:
- Questions should be short, thematic, open-ended (what a curious host would ask)
- Answers should be 1-3 sentences, evocative, grounded in the sources
- No generic filler — every answer must be specific to this film
- Output ONLY valid JSON, no markdown, no extra text

Format:
{"pairs":[{"input":"...","response":"..."},...]}

Sources:
${sourcesText}`;

    const errors = [];
    for (const [version, model] of LOCAL_GEMINI_CANDIDATES) {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.85, maxOutputTokens: 2048 }
                })
            });
            if (!res.ok) {
                const t = await res.text().catch(() => `HTTP ${res.status}`);
                errors.push(`${model}: ${res.status}`);
                console.warn(`  [gemini] ${model} → ${res.status}`);
                continue;
            }
            const payload = await res.json();
            const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed?.pairs) && parsed.pairs.length > 0) {
                console.log(`  [gemini] ${model} → ${parsed.pairs.length} pairs`);
                return parsed.pairs;
            }
            errors.push(`${model}: empty pairs`);
        } catch (err) {
            errors.push(`${model}: ${err.message}`);
        }
    }
    throw new Error(`Local Gemini synthesis failed: ${errors.join(', ')}`);
}

// ── CSV parser (no dependencies) ─────────────────────────────────────────────

function parseCsv(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rows = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        // Detect TSV vs CSV
        const sep = line.includes('\t') ? '\t' : ',';
        const cols = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                else { inQuote = !inQuote; }
            } else if (ch === sep && !inQuote) {
                cols.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        cols.push(cur.trim());
        rows.push(cols);
    }
    return rows;
}

// Try to auto-detect question and answer column indices from common headers.
const Q_ALIASES = ['question', 'q', 'prompt', 'input', 'ask'];
const A_ALIASES = ['answer', 'a', 'response', 'reply', 'output'];

function detectColumns(headers, qcol, acol) {
    const h = headers.map((s) => String(s || '').toLowerCase().trim());
    const qIdx = qcol
        ? h.indexOf(String(qcol).toLowerCase().trim())
        : Q_ALIASES.reduce((found, alias) => found >= 0 ? found : h.findIndex((hh) => hh.includes(alias)), -1);
    const aIdx = acol
        ? h.indexOf(String(acol).toLowerCase().trim())
        : A_ALIASES.reduce((found, alias) => found >= 0 ? found : h.findIndex((hh) => hh.includes(alias)), -1);
    return { qIdx, aIdx };
}

function parsePairsFromCsv(text, qcol, acol) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const headers = rows[0];
    const { qIdx, aIdx } = detectColumns(headers, qcol, acol);

    if (qIdx < 0 || aIdx < 0) {
        // Fallback: treat as two-column (col 0 = question, col 1 = answer), no header
        const hasHeader = /question|answer|q|a/i.test(rows[0].join(' '));
        const dataRows = hasHeader ? rows.slice(1) : rows;
        return dataRows
            .filter((r) => r.length >= 2 && r[0] && r[1])
            .map((r) => ({ input: r[0], response: r[1] }));
    }

    return rows.slice(1)
        .filter((r) => r[qIdx] && r[aIdx])
        .map((r) => ({ input: r[qIdx], response: r[aIdx] }));
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { files: [], text: [], count: null, movie: null, host: null, key: null, dryRun: false, direct: false, qcol: null, acol: null };
    let i = 2;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === '--movie'  && argv[i + 1]) { args.movie  = argv[++i]; }
        else if (arg === '--key'   && argv[i + 1]) { args.key   = argv[++i]; }
        else if (arg === '--host'  && argv[i + 1]) { args.host  = argv[++i]; }
        else if (arg === '--count' && argv[i + 1]) { args.count = Number(argv[++i]); }
        else if (arg === '--qcol'  && argv[i + 1]) { args.qcol  = argv[++i]; }
        else if (arg === '--acol'  && argv[i + 1]) { args.acol  = argv[++i]; }
        else if (arg === '--dry-run') { args.dryRun = true; }
        else if (arg === '--direct') { args.direct = true; }
        else if (arg === '--text') {
            while (argv[i + 1] && !String(argv[i + 1]).startsWith('--')) {
                args.text.push(argv[++i]);
            }
        }
        else if (arg === '--files') {
            while (argv[i + 1] && !String(argv[i + 1]).startsWith('--')) {
                args.files.push(argv[++i]);
            }
        }
        i++;
    }
    return args;
}

function usage() {
    console.log(`
Usage:
  # Synthesis mode (Gemini synthesises from raw text):
  node scripts/importSources.mjs --movie <film> --files article.txt [--count 12]

  # Direct mode (CSV/TSV with Q&A columns — no Gemini):
  node scripts/importSources.mjs --movie <film> --direct --files notebooklm.csv
  node scripts/importSources.mjs --movie <film> --direct --files sheet.csv --qcol "Question" --acol "Answer"

  # Dry run to preview:
  node scripts/importSources.mjs --movie <film> --direct --files sheet.csv --dry-run
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

if (!args.movie) {
    console.error('Error: --movie is required.');
    usage();
    process.exit(1);
}

const host = String(args.host || 'https://gesture-3d.vercel.app').replace(/\/+$/, '');

// ── DIRECT mode: import CSV/TSV pairs without Gemini ─────────────────────────

if (args.direct) {
    const pairs = [];

    for (const filePath of args.files) {
        try {
            const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');
            const parsed  = parsePairsFromCsv(content, args.qcol, args.acol);
            pairs.push(...parsed);
            console.log(`  Loaded: ${filePath} → ${parsed.length} pair(s)`);
            if (parsed.length === 0) {
                console.warn(`  Warning: no pairs found in ${filePath}. Check that the file has Q/A columns.`);
            }
        } catch (err) {
            console.error(`  Warning: could not read ${filePath}: ${err.message}`);
        }
    }

    if (pairs.length === 0) {
        console.error('Error: no Q&A pairs found. Provide a CSV with recognisable column headers (question/answer, input/response, q/a, etc.).');
        process.exit(1);
    }

    console.log(`\nMovie:  ${args.movie}`);
    console.log(`Pairs:  ${pairs.length}`);
    console.log(`Mode:   direct (no Gemini synthesis)`);

    if (args.dryRun) {
        console.log('\n[dry-run] Preview:');
        for (const p of pairs.slice(0, 5)) {
            console.log(`  Q: ${p.input}`);
            console.log(`  A: ${p.response}`);
            console.log('');
        }
        if (pairs.length > 5) console.log(`  … and ${pairs.length - 5} more`);
        process.exit(0);
    }

    // Inject directly via enrich-brain using the pairs shortcut path
    const endpoint = `${host}/api/enrich-brain`;
    const payload  = { movie: args.movie, pairs };

    console.log(`\nInjecting directly into brain (${endpoint})…\n`);

    try {
        const res  = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': host },
            body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
            console.error(`Error ${res.status}: ${json.error || JSON.stringify(json)}`);
            process.exit(1);
        }

        console.log(`✔ Imported ${json.imported} entries into brain for "${json.movie}"`);
        for (const entry of json.entries || []) {
            console.log(`  Q: ${entry.input}`);
            console.log(`  A: ${entry.response}`);
            console.log('');
        }
        console.log(`The podcast host will draw on these entries for "${args.movie.replace(/\.mp4$/i, '')}".`);
    } catch (err) {
        console.error('Fetch failed:', err.message || err);
        process.exit(1);
    }
    process.exit(0);
}

// ── SYNTHESIS mode: Gemini synthesises Q&A from raw text ─────────────────────

const sources = [];

for (const filePath of args.files) {
    try {
        const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');
        sources.push(content.trim());
        console.log(`  Loaded: ${filePath} (${content.length} chars)`);
    } catch (err) {
        console.error(`  Warning: could not read ${filePath}: ${err.message}`);
    }
}

if (args.text.length > 0) {
    sources.push(args.text.join(' ').trim());
}

if (sources.length === 0) {
    console.error('Error: provide at least one source via --files or --text.');
    usage();
    process.exit(1);
}

const count    = Number.isFinite(args.count) && args.count > 0 ? Math.min(20, args.count) : 8;
const endpoint = `${host}/api/enrich-brain`;

console.log(`\nMovie:    ${args.movie}`);
console.log(`Sources:  ${sources.length} (${sources.reduce((n, s) => n + s.length, 0)} total chars)`);
console.log(`Count:    ${count} Q&A pairs requested`);

if (args.dryRun) {
    console.log('\n[dry-run] Sources preview:');
    for (const s of sources) console.log(`  ${s.substring(0, 100)}…`);
    process.exit(0);
}

// Prefer local Gemini synthesis to avoid server-side quota exhaustion.
// Falls back to server-side synthesis (passes sources[]) only if no local key.
const localKey = args.key || process.env.GEMINI_API_KEY;

let pairs;
if (localKey) {
    const movieTitle = args.movie.replace(/\.mp4$/i, '').replace(/[_-]/g, ' ').trim();
    console.log(`\nSynthesising locally via Gemini (${movieTitle})…`);
    try {
        pairs = await synthesiseLocally(localKey, movieTitle, sources, count);
    } catch (err) {
        console.error(`Local synthesis failed: ${err.message}`);
        console.error('No fallback available — check your GEMINI_API_KEY quota.');
        process.exit(1);
    }
    console.log(`\nPosting ${pairs.length} pairs to brain via ${endpoint}…\n`);
    try {
        const res  = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': host },
            body: JSON.stringify({ movie: args.movie, pairs })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
            console.error(`Error ${res.status}: ${json.error || JSON.stringify(json)}`);
            process.exit(1);
        }
        console.log(`✔ Imported ${json.imported} entries into brain for "${json.movie}"`);
        for (const entry of json.entries || []) {
            console.log(`  Q: ${entry.input}`);
            console.log(`  A: ${entry.response}`);
            console.log('');
        }
        console.log(`The podcast host will use them on the next turn for "${args.movie.replace(/\.mp4$/i, '')}".`);
    } catch (err) {
        console.error('Fetch failed:', err.message || err);
        process.exit(1);
    }
} else {
    // No local key — send sources to server and let it call Gemini
    const payload = { movie: args.movie, sources, count };
    console.log(`\nCalling server-side Gemini synthesis (${endpoint})…\n`);
    try {
        const res  = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': host },
            body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
            console.error(`Error ${res.status}: ${json.error || JSON.stringify(json)}`);
            process.exit(1);
        }
        console.log(`✔ Imported ${json.imported} entries into brain for "${json.movie}"`);
        for (const entry of json.entries || []) {
            console.log(`  Q: ${entry.input}`);
            console.log(`  A: ${entry.response}`);
            console.log('');
        }
        console.log(`The podcast host will use them on the next turn for "${args.movie.replace(/\.mp4$/i, '')}".`);
    } catch (err) {
        console.error('Fetch failed:', err.message || err);
        process.exit(1);
    }
}
