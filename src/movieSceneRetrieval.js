import { resolveMovieBrain } from './movieBrains.js';

const DEFAULT_MOVIE_CDN_BASE = 'https://pub-3a3ec970180e4d9db03559eb82c9b828.r2.dev';
const STOP_WORDS = new Set([
    'a', 'about', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'but', 'by', 'can', 'did', 'do', 'does',
    'for', 'from', 'had', 'has', 'have', 'here', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'like', 'me',
    'more', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'out', 'over', 'really', 'say', 'secrets', 'she', 'so', 'some',
    'tell', 'than', 'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'those', 'to', 'together', 'too',
    'us', 'very', 'waht', 'was', 'we', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your'
]);

const runtimeIndexCache = new Map();

function normalizeMovieSlug(movieName = '') {
    return String(movieName || '')
        .trim()
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/\.[^.]+$/, '')
        .replace(/\s+/g, '_');
}

function getMovieAnalysisBase() {
    if (import.meta.env.DEV) return '/movie-analysis';
    const explicitBase = String(import.meta.env.VITE_MOVIE_ANALYSIS_CDN_BASE || '').trim();
    if (explicitBase) return explicitBase.replace(/\/+$/, '');
    const movieBase = String(import.meta.env.VITE_MOVIE_CDN_BASE || DEFAULT_MOVIE_CDN_BASE).trim().replace(/\/+$/, '');
    return `${movieBase}/movie-analysis`;
}

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(value = '') {
    return normalizeText(value)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token) => !STOP_WORDS.has(token));
}

function uniqueStrings(values = [], limit = 6) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : [values]) {
        const value = String(raw || '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= limit) break;
    }
    return out;
}

function clampText(value = '', maxChars = 170) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1).replace(/\s+\S*$/, '')}…`;
}

function safeArray(value, limit = 6) {
    return uniqueStrings(Array.isArray(value) ? value : [value], limit);
}

function formatTime(ms = 0) {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function validateChunk(chunk, index) {
    if (!chunk || typeof chunk !== 'object') return null;
    const summary = clampText(chunk.summary || chunk.scene || chunk.description || '', 180);
    const motifs = safeArray(chunk.motifs || chunk.tags || chunk.symbols, 6);
    const mood = safeArray(chunk.mood || chunk.tones || chunk.feelings, 4);
    const references = safeArray(chunk.references || chunk.lineage || chunk.influences, 4);
    const personaHints = safeArray(chunk.personaHints || chunk.persona || chunk.innerWorld, 4);
    const questionSeeds = safeArray(chunk.questionSeeds || chunk.followups || chunk.questions, 4);
    if (!summary && !motifs.length && !mood.length && !references.length && !personaHints.length && !questionSeeds.length) {
        return null;
    }
    return {
        id: String(chunk.id || `chunk-${index + 1}`),
        startMs: Math.max(0, Number(chunk.startMs || chunk.start || 0)),
        endMs: Math.max(0, Number(chunk.endMs || chunk.end || 0)),
        summary,
        motifs,
        mood,
        references,
        personaHints,
        questionSeeds
    };
}

function validateIndex(movieName, payload) {
    const chunks = Array.isArray(payload?.chunks)
        ? payload.chunks.map(validateChunk).filter(Boolean)
        : [];
    return {
        movie: String(payload?.movie || movieName || '').trim(),
        slug: String(payload?.slug || normalizeMovieSlug(movieName)).trim(),
        source: String(payload?.source || 'artifact').trim() || 'artifact',
        updatedAt: String(payload?.updatedAt || '').trim(),
        chunks
    };
}

function buildFallbackIndex(movieName = '') {
    const brain = resolveMovieBrain(movieName) || {};
    const seeds = (brain.trainingSeeds && typeof brain.trainingSeeds === 'object') ? brain.trainingSeeds : {};
    const persona = (brain.persona && typeof brain.persona === 'object') ? brain.persona : {};
    const dictionary = (brain.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
    const theme = clampText(brain.theme || brain.fallbackPersonality || 'synthetic longing and cinematic mood', 140);
    const refs = safeArray([...(seeds.references || []), dictionary.reference, dictionary.influences, dictionary.film], 6);
    const motifs = safeArray([...(seeds.symbols || []), ...(seeds.obsessions || [])], 8);
    const story = safeArray(seeds.story || [], 6);
    const themes = safeArray(seeds.themes || [], 6);
    const quotes = safeArray(seeds.quotes || [], 4);
    const personaTone = clampText(persona.tone || brain.fallbackPersonality || '', 140);

    const chunks = [
        {
            id: 'fallback-theme',
            startMs: 0,
            endMs: 15000,
            summary: theme,
            motifs: motifs.slice(0, 4),
            mood: themes.slice(0, 3),
            references: refs.slice(0, 3),
            personaHints: personaTone ? [personaTone] : [],
            questionSeeds: [
                motifs[0] ? `What does ${motifs[0]} reveal here?` : '',
                themes[0] ? `How does ${themes[0]} change the mood?` : ''
            ].filter(Boolean)
        },
        {
            id: 'fallback-story',
            startMs: 15000,
            endMs: 30000,
            summary: clampText(story[0] || dictionary.story || dictionary.about || '', 180),
            motifs: motifs.slice(2, 6),
            mood: themes.slice(2, 5),
            references: refs.slice(0, 2),
            personaHints: safeArray(persona.obsessions || [], 4),
            questionSeeds: [
                story[1] ? `Where does ${story[1].split(/\s+/)[0]} press hardest?` : '',
                motifs[1] ? `How does ${motifs[1]} sit inside the frame?` : ''
            ].filter(Boolean)
        },
        {
            id: 'fallback-references',
            startMs: 30000,
            endMs: 45000,
            summary: clampText(dictionary.reference || dictionary.influences || refs.join(', '), 180),
            motifs: refs.slice(0, 4),
            mood: ['reference', 'lineage', 'echo'],
            references: refs.slice(0, 4),
            personaHints: safeArray(persona.prohibitions || [], 3),
            questionSeeds: [
                refs[0] ? `Where does ${refs[0]} touch the image?` : '',
                refs[1] ? `What tension opens when this leans toward ${refs[1]}?` : ''
            ].filter(Boolean)
        },
        {
            id: 'fallback-voice',
            startMs: 45000,
            endMs: 60000,
            summary: clampText(quotes[0] || dictionary.default || personaTone || theme, 180),
            motifs: motifs.slice(0, 3),
            mood: themes.slice(0, 2),
            references: refs.slice(0, 2),
            personaHints: safeArray([personaTone, ...(persona.obsessions || [])], 4),
            questionSeeds: [
                'What do those ideas reveal together?',
                'What is the image trying to work out there?'
            ]
        }
    ].map(validateChunk).filter(Boolean);

    return {
        movie: String(movieName || '').trim(),
        slug: normalizeMovieSlug(movieName),
        source: 'brain-fallback',
        updatedAt: '',
        chunks
    };
}

async function fetchIndexFromArtifact(movieName = '') {
    const slug = normalizeMovieSlug(movieName);
    if (!slug) return null;
    const base = getMovieAnalysisBase();
    const response = await fetch(`${base}/${slug}.json`, { cache: 'force-cache' });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return null;
    const validated = validateIndex(movieName, payload);
    return validated.chunks.length ? validated : null;
}

export async function loadMovieSceneIndex(movieName = '') {
    const slug = normalizeMovieSlug(movieName);
    if (!slug) return buildFallbackIndex(movieName);
    if (runtimeIndexCache.has(slug)) return runtimeIndexCache.get(slug);

    let index = null;
    try {
        index = await fetchIndexFromArtifact(movieName);
    } catch {
        index = null;
    }

    if (!index) {
        index = buildFallbackIndex(movieName);
    }
    runtimeIndexCache.set(slug, index);
    return index;
}

function scoreChunk(chunk, queryText, queryTokens) {
    const blob = [
        chunk.summary,
        ...(chunk.motifs || []),
        ...(chunk.mood || []),
        ...(chunk.references || []),
        ...(chunk.personaHints || []),
        ...(chunk.questionSeeds || [])
    ].join(' ');
    const normalizedBlob = normalizeText(blob);
    const chunkTokens = new Set(tokenize(blob));
    let score = 0;

    if (queryText && normalizedBlob.includes(queryText)) score += 4;
    for (const token of queryTokens) {
        if (!chunkTokens.has(token)) continue;
        score += 1;
        if ((chunk.motifs || []).some((value) => normalizeText(value).includes(token))) score += 0.75;
        if ((chunk.references || []).some((value) => normalizeText(value).includes(token))) score += 0.5;
        if ((chunk.questionSeeds || []).some((value) => normalizeText(value).includes(token))) score += 0.35;
    }

    if (queryTokens.length >= 2) {
        const matches = queryTokens.filter((token) => chunkTokens.has(token)).length;
        if (matches >= 2) score += matches * 0.5;
    }

    return score;
}

function buildContextBlock(hits = []) {
    const lines = hits
        .map((hit) => {
            const range = (Number.isFinite(hit.startMs) || Number.isFinite(hit.endMs))
                ? `[${formatTime(hit.startMs)}-${formatTime(hit.endMs || hit.startMs)}] `
                : '';
            const motifText = hit.motifs?.length ? ` Motifs: ${hit.motifs.slice(0, 3).join(', ')}.` : '';
            const moodText = hit.mood?.length ? ` Mood: ${hit.mood.slice(0, 2).join(', ')}.` : '';
            const refText = hit.references?.length ? ` References: ${hit.references.slice(0, 2).join(', ')}.` : '';
            return `- ${range}${hit.summary}${motifText}${moodText}${refText}`.trim();
        })
        .filter(Boolean)
        .slice(0, 3);

    if (!lines.length) return '';
    return `Relevant scene hints from the current film:\n${lines.join('\n')}`;
}

export async function getMovieRetrievalContext(movieName = '', query = '', { limit = 3, minScore = 1.5 } = {}) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenize(query);
    if (!normalizedQuery || !queryTokens.length) {
        return { hits: [], block: '', source: 'none' };
    }

    const index = await loadMovieSceneIndex(movieName);
    const scored = (index?.chunks || [])
        .map((chunk) => ({
            ...chunk,
            score: scoreChunk(chunk, normalizedQuery, queryTokens)
        }))
        .filter((chunk) => chunk.score >= minScore)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(1, Number(limit || 3)));

    return {
        hits: scored,
        block: buildContextBlock(scored),
        source: String(index?.source || 'none')
    };
}

export async function getMovieSceneAtTime(movieName = '', timeMs = 0) {
    const index = await loadMovieSceneIndex(movieName);
    const chunks = Array.isArray(index?.chunks) ? index.chunks : [];
    if (!chunks.length) return null;

    const targetMs = Math.max(0, Number(timeMs || 0));
    const directHit = chunks.find((chunk) => targetMs >= Number(chunk.startMs || 0) && targetMs <= Number(chunk.endMs || chunk.startMs || 0));
    if (directHit) return directHit;

    let bestChunk = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const chunk of chunks) {
        const startMs = Number(chunk.startMs || 0);
        const endMs = Number(chunk.endMs || startMs);
        const centerMs = startMs + Math.max(0, endMs - startMs) / 2;
        const distance = Math.abs(centerMs - targetMs);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestChunk = chunk;
        }
    }
    return bestChunk;
}