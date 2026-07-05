/**
 * brainMemory.js — Persistent Cloud→Brain Learning Store
 *
 * Every time Gemini (Cloud) generates a response, it is scored and saved
 * to localStorage per movie. On the next session, the best memories are
 * injected into the Ollama (Brain) system prompt so it "remembers" what
 * was learned from the cloud.
 *
 * Storage key: brain_mem_v1_<movieSlug>
 * Structure:   Array of MemoryEntry (max MAX_PER_MOVIE, sorted by score desc)
 */

const MAX_PER_MOVIE = 120;   // max stored memories per movie
const INJECT_TOP_N  = 10;   // how many memories to inject into Ollama prompt
const STORAGE_PREFIX = 'brain_mem_v1_';
const LEARNED_FALLBACK_POOL = 12;
const LEVEL3_MIN_SCORE = 6;
const LEVEL3_MIN_USED = 1;
const LEVEL2_MIN_SCORE = 4;
const LEVEL2_MIN_RELEVANCE = 6;
const LEVEL3_TOP_N = 2;
const LEVEL2_TOP_N = 3;
const CLOUD_MEMORY_API = '/api/brain-memory';

/**
 * @typedef {Object} MemoryEntry
 * @property {string} input      - What the user asked/said
 * @property {string} response   - What Gemini replied
 * @property {number} score      - Quality score (higher = more valuable)
 * @property {number} savedAt    - Unix timestamp ms
 * @property {number} usedCount  - Times injected into Ollama
 */

function _slug(movie) {
    return String(movie || 'default')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .substring(0, 40);
}

function _storageKey(movie) {
    return STORAGE_PREFIX + _slug(movie);
}

function _isBrowser() {
    return typeof window !== 'undefined';
}

function _canUseCloudSync() {
    if (!_isBrowser()) return false;
    return true; // Vite proxy handles /api/brain-memory on localhost too
}

function _mergeMemoriesByInput(current = [], incoming = []) {
    const mergedByInput = new Map();

    for (const entry of [...current, ...incoming]) {
        if (!entry?.input || !entry?.response) continue;
        const key = String(entry.input).toLowerCase().trim();
        const existing = mergedByInput.get(key);
        if (!existing || Number(entry.savedAt || 0) >= Number(existing.savedAt || 0)) {
            mergedByInput.set(key, {
                input: String(entry.input || '').trim(),
                response: String(entry.response || '').trim(),
                score: Number(entry.score || 0),
                savedAt: Number(entry.savedAt || Date.now()),
                usedCount: Number(entry.usedCount || 0)
            });
        }
    }

    const merged = Array.from(mergedByInput.values());
    merged.sort((a, b) => b.score - a.score || b.savedAt - a.savedAt);
    return merged.slice(0, MAX_PER_MOVIE);
}

function _persistMemories(movie, memories) {
    try {
        localStorage.setItem(_storageKey(movie), JSON.stringify(memories));
    } catch { }
}

function _uploadMemoryToCloud(movie, input, response) {
    if (!_canUseCloudSync()) return;

    fetch(CLOUD_MEMORY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movie, input, response })
    }).catch(() => {
        // Non-fatal: localStorage remains the fallback source.
    });
}

export async function hydrateMemoriesFromCloud(movie) {
    if (!_canUseCloudSync()) return loadMemories(movie);

    try {
        const url = `${CLOUD_MEMORY_API}?movie=${encodeURIComponent(movie || 'default')}`;
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) return loadMemories(movie);

        const payload = await response.json().catch(() => ({}));
        const remote = Array.isArray(payload?.memories) ? payload.memories : [];
        const local = loadMemories(movie);
        const merged = _mergeMemoriesByInput(local, remote);
        _persistMemories(movie, merged);
        return merged;
    } catch {
        return loadMemories(movie);
    }
}
function _normalizeMemoryInput(value = '') {
    return String(value || '').toLowerCase().trim();
}
function _movieTitleFromKey(movie = '') {
    return String(movie || 'this movie')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'this movie';
}
function _stringList(values = [], limit = 4) {
    return (Array.isArray(values) ? values : [values])
        .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, Math.max(1, Number(limit || 1)));
}
function _pickBootstrapResponse(candidates = [], fallback = '') {
    for (const candidate of candidates) {
        const text = String(candidate || '').replace(/\s+/g, ' ').trim();
        if (text) return text;
    }
    return String(fallback || '').replace(/\s+/g, ' ').trim();
}
export function bootstrapMovieMemories(movie, brain = null) {
    const movieKey = String(movie || '').trim();
    if (!movieKey || typeof localStorage === 'undefined') return 0;
    const activeBrain = (brain && typeof brain === 'object') ? brain : {};
    const trainingSeeds = (activeBrain?.trainingSeeds && typeof activeBrain.trainingSeeds === 'object')
        ? activeBrain.trainingSeeds
        : {};
    const dictionary = (activeBrain?.dictionary && typeof activeBrain.dictionary === 'object')
        ? activeBrain.dictionary
        : {};
    const title = _movieTitleFromKey(movieKey);
    const existing = loadMemories(movieKey);
    const existingInputs = new Set(existing.map((entry) => _normalizeMemoryInput(entry?.input || '')));
    const refs = _stringList(trainingSeeds.references, 3);
    const symbols = _stringList(trainingSeeds.symbols, 3);
    const story = _stringList(trainingSeeds.story, 2);
    const bootstrapEntries = [];
    const appendBootstrapEntry = (input, response) => {
        const cleanInput = String(input || '').trim();
        const cleanResponse = String(response || '').trim();
        const normalizedInput = _normalizeMemoryInput(cleanInput);
        if (!cleanInput || !cleanResponse || existingInputs.has(normalizedInput)) return;
        existingInputs.add(normalizedInput);
        bootstrapEntries.push({
            input: cleanInput,
            response: cleanResponse,
            score: _score(cleanInput, cleanResponse),
            savedAt: Date.now(),
            usedCount: 1  // seed at 1 so entries qualify for L3 immediately
        });
    };
    if (refs.length) {
        appendBootstrapEntry(
            `Which references most directly shape ${title}?`,
            _pickBootstrapResponse([
                dictionary['which references directly'],
                dictionary['references shape'],
                dictionary['which references'],
                dictionary.reference,
                dictionary.influences
            ], `The reference chain runs through ${refs.join(', ')}.`)
        );
    }
    if (symbols.length) {
        appendBootstrapEntry(
            `Which image or object does ${title} keep returning to?`,
            _pickBootstrapResponse([
                dictionary['what keeps returning'],
                dictionary['which image returning'],
                dictionary['what motif']
            ], `The film keeps returning to ${symbols.join(', ')}.`)
        );
    }
    if (story.length) {
        appendBootstrapEntry(
            `What pressure or conflict matters most in ${title}?`,
            _pickBootstrapResponse([
                dictionary['pressure conflict'],
                dictionary['role exchange'],
                dictionary.story,
                dictionary.about
            ], story.join(' '))
        );
    }
    if (!bootstrapEntries.length) return existing.length;
    const merged = _mergeMemoriesByInput(existing, bootstrapEntries);
    _persistMemories(movieKey, merged);
    return merged.length;
}

/**
 * Score a response for memory value.
 * Higher = more worth remembering.
 */
function _score(input, response) {
    let s = 0;
    const r = response || '';
    const q = input || '';

    // Length sweet spot: 40–180 chars
    if (r.length >= 40 && r.length <= 180) s += 3;
    else if (r.length > 180) s += 1;

    // Poetic markers
    if (/[.…—]/.test(r)) s += 1;
    if (/\b(I|me|my|you|your|we)\b/i.test(r)) s += 1;         // personal voice
    if (!/error|unavailable|fallback|sorry/i.test(r)) s += 2;  // not an error msg
    if (q.length > 4 && q.length < 80) s += 1;                 // meaningful question

    return s;
}

/**
 * Load all memories for a movie from localStorage.
 * @param {string} movie
 * @returns {MemoryEntry[]}
 */
export function loadMemories(movie) {
    try {
        const raw = localStorage.getItem(_storageKey(movie));
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Save a cloud response as a memory for a movie.
 * Deduplicates by input, keeps the MAX_PER_MOVIE highest-scored entries.
 * @param {string} movie
 * @param {string} input
 * @param {string} response
 * @returns {number} new total memory count for this movie
 */
export function saveMemory(movie, input, response) {
    if (!input?.trim() || !response?.trim()) return 0;

    const memories = loadMemories(movie);

    // Deduplicate: update if same input already exists
    const existingIdx = memories.findIndex(
        m => m.input.toLowerCase().trim() === input.toLowerCase().trim()
    );

    const entry = {
        input: input.trim(),
        response: response.trim(),
        score: _score(input, response),
        savedAt: Date.now(),
        usedCount: existingIdx >= 0 ? memories[existingIdx].usedCount : 0
    };

    if (existingIdx >= 0) {
        memories[existingIdx] = entry;
    } else {
        memories.push(entry);
    }

    // Sort by score desc, keep top MAX_PER_MOVIE
    memories.sort((a, b) => b.score - a.score || b.savedAt - a.savedAt);
    const trimmed = memories.slice(0, MAX_PER_MOVIE);

    _persistMemories(movie, trimmed);
    _uploadMemoryToCloud(movie, input.trim(), response.trim());

    return trimmed.length;
}

/**
 * Retrieve the most relevant memories for a given user input.
 * Ranks by keyword overlap with the input, then by score.
 *
 * @param {string} movie
 * @param {string} currentInput - Current user message for relevance ranking
 * @param {number} [topN]
 * @returns {MemoryEntry[]}
 */
export function getMemories(movie, currentInput = '', topN = INJECT_TOP_N) {
    const memories = loadMemories(movie);
    if (!memories.length) return [];

    const words = currentInput.toLowerCase().split(/\W+/).filter(w => w.length > 3);

    const ranked = memories.map(m => {
        let relevance = m.score;
        // Boost if memory input overlaps with current query words
        for (const w of words) {
            if (m.input.toLowerCase().includes(w)) relevance += 2;
            if (m.response.toLowerCase().includes(w)) relevance += 1;
        }
        return { ...m, relevance };
    });

    ranked.sort((a, b) => b.relevance - a.relevance);
    return ranked.slice(0, topN);
}

/**
 * Return explicit learned fallback levels for DICT mode.
 *
 * Level 3 (promoted): high score + reused enough times.
 * Level 2 (learned): relevant cloud memories not yet promoted.
 *
 * @param {string} movie
 * @param {string} currentInput
 * @returns {{level3: MemoryEntry[], level2: MemoryEntry[], poolSize: number}}
 */
export function getLearnedFallbackCandidates(movie, currentInput = '') {
    const ranked = getMemories(movie, currentInput, LEARNED_FALLBACK_POOL);

    const level3 = [];
    const level2 = [];

    for (const entry of ranked) {
        const score = Number(entry?.score || 0);
        const usedCount = Number(entry?.usedCount || 0);
        const relevance = Number(entry?.relevance || score);

        if (score >= LEVEL3_MIN_SCORE && usedCount >= LEVEL3_MIN_USED) {
            level3.push(entry);
            continue;
        }

        if (score >= LEVEL2_MIN_SCORE && relevance >= LEVEL2_MIN_RELEVANCE) {
            level2.push(entry);
        }
    }

    // Cold-start helper: if there are no qualified matches yet, allow best scored memory as L2.
    if (!level3.length && !level2.length && ranked.length) {
        const best = ranked[0];
        if (Number(best?.score || 0) >= LEVEL2_MIN_SCORE) {
            level2.push(best);
        }
    }

    return {
        level3: level3.slice(0, LEVEL3_TOP_N),
        level2: level2.slice(0, LEVEL2_TOP_N),
        poolSize: ranked.length
    };
}

/**
 * How many memories are stored for a movie.
 * @param {string} movie
 * @returns {number}
 */
export function getMemoryCount(movie) {
    return loadMemories(movie).length;
}

/**
 * Mark memories as used (increment usedCount).
 * @param {string} movie
 * @param {MemoryEntry[]} usedMemories
 */
export function markMemoriesUsed(movie, usedMemories) {
    if (!usedMemories?.length) return;
    const memories = loadMemories(movie);
    for (const used of usedMemories) {
        const idx = memories.findIndex(m => m.input === used.input);
        if (idx >= 0) memories[idx].usedCount = (memories[idx].usedCount || 0) + 1;
    }
    _persistMemories(movie, memories);
}

/**
 * Clear all memories for a movie.
 * @param {string} movie
 */
export function clearMemories(movie) {
    try { localStorage.removeItem(_storageKey(movie)); } catch { }
}

/**
 * Build the memory injection block for an Ollama system prompt.
 * Returns a formatted string ready to append to a system prompt,
 * plus the memories that were used (for tracking).
 *
 * @param {string} movie
 * @param {string} currentInput
 * @returns {{ block: string, memories: MemoryEntry[], count: number }}
 */
export function buildMemoryBlock(movie, currentInput) {
    const memories = getMemories(movie, currentInput);
    if (!memories.length) return { block: '', memories: [], count: 0 };

    const lines = memories.map(m =>
        `  Q: "${m.input}"\n  A: "${m.response}"`
    ).join('\n\n');

    const block = `\n\nPAST INTERACTIONS YOU REMEMBER (speak consistently with these):\n${lines}`;

    return { block, memories, count: memories.length };
}
