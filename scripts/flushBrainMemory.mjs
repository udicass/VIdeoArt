/**
 * flushBrainMemory.mjs
 * Clears one or all movies from the KV brain memory store.
 *
 * Usage:
 *   node scripts/flushBrainMemory.mjs                    # flush all 5 movies
 *   node scripts/flushBrainMemory.mjs Synthetic_Desires_1
 *
 * Requires BRAIN_FLUSH_SECRET in .env (local only — never set in Vercel production).
 * Requires the Vite dev server to be running on http://localhost:5173
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ENV_PATH = resolve(process.cwd(), '.env');
function loadEnv() {
    try {
        return Object.fromEntries(
            readFileSync(ENV_PATH, 'utf8')
                .split('\n')
                .filter(l => l.includes('=') && !l.startsWith('#'))
                .map(l => {
                    const [k, ...v] = l.split('=');
                    return [k.trim(), v.join('=').trim().replace(/^"|"$/g, '')];
                })
        );
    } catch { return {}; }
}

const env = loadEnv();
const secret = env.BRAIN_FLUSH_SECRET;
if (!secret) {
    console.error('BRAIN_FLUSH_SECRET not found in .env — aborting.');
    process.exit(1);
}

const BASE = 'http://localhost:5173/api/brain-memory';
const ALL_MOVIES = [
    'Synthetic_Desires_1',
    'Synthetic_Desires_2',
    'Synthetic_Desires_3',
    'Synthetic_Desires_4',
    'Synthetic_Desires_5',
];

const targets = process.argv[2] ? [process.argv[2]] : ALL_MOVIES;

for (const movie of targets) {
    const url = `${BASE}?movie=${encodeURIComponent(movie)}`;
    try {
        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'x-flush-secret': secret,
                'Origin': 'http://localhost:5173',
            },
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
            console.log(`✓ Flushed: ${movie}`);
        } else {
            console.error(`✗ ${movie}: ${body.error || res.status}`);
        }
    } catch (err) {
        console.error(`✗ ${movie}: ${err.message}`);
    }
}
