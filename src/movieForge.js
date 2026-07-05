function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(/\s*[|;]\s*/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function firstDictionaryValue(dictionary = {}, keys = []) {
  for (const key of keys) {
    const value = dictionary?.[key];
    if (typeof value === 'string' && normalizeText(value)) {
      return normalizeText(value);
    }
    if (Array.isArray(value)) {
      const first = value.map((item) => normalizeText(item)).find(Boolean);
      if (first) return first;
    }
  }
  return '';
}

function collectDictionaryValues(dictionary = {}, keys = []) {
  const items = [];
  for (const key of keys) {
    const value = dictionary?.[key];
    if (typeof value === 'string') {
      items.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      items.push(...value);
    }
  }
  return uniqueList(items);
}

function movieLabel(movieName = '') {
  return normalizeText(
    String(movieName || 'Untitled Movie')
      .replace(/\.[^.]+$/i, '')
      .replace(/[_-]+/g, ' ')
  ) || 'Untitled Movie';
}

function inferStartIndex(movieName = '') {
  const match = String(movieName || '').match(/(\d+)(?!.*\d)/);
  if (!match) return 1;
  return Number(match[1]) + 1;
}

function buildConceptTitle(baseTitle = '', startIndex = 1, offset = 0) {
  const normalizedBase = normalizeText(baseTitle) || 'Synthetic Desires';
  const explicitStart = Number.isFinite(Number(startIndex)) ? Math.max(1, Number(startIndex)) : null;
  const targetNumber = explicitStart == null ? null : explicitStart + offset;
  const numericMatch = normalizedBase.match(/^(.*?)(\d+)([^\d]*)$/);

  if (targetNumber != null && numericMatch) {
    return normalizeText(`${numericMatch[1]}${targetNumber}${numericMatch[3]}`);
  }

  if (targetNumber != null) {
    return normalizeText(`${normalizedBase} ${targetNumber}`);
  }

  const suffixes = ['Afterimage', 'Mirror Skin', 'Solar Ghost', 'Velvet Static'];
  return normalizeText(`${normalizedBase} ${suffixes[offset % suffixes.length]}`);
}

function buildSlug(title = '') {
  return normalizeText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'movie-forge-pack';
}

function normalizeReferenceSnapshots(snapshots = []) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot, index) => {
      if (!snapshot || typeof snapshot !== 'object') return null;
      const src = normalizeText(snapshot.src || '');
      if (!src) return null;
      return {
        label: normalizeText(snapshot.label || `Reference ${index + 1}`) || `Reference ${index + 1}`,
        timeLabel: normalizeText(snapshot.timeLabel || ''),
        title: normalizeText(snapshot.title || snapshot.alt || ''),
        alt: normalizeText(snapshot.alt || snapshot.title || ''),
        src
      };
    })
    .filter(Boolean)
    .slice(0, 2);
}

const CONCEPT_FRAMES = [
  {
    label: 'Afterimage sequel',
    framing: 'continue the emotional arc but widen the world into a larger ritual system',
    motion: 'slow dolly-ins, orbital closeups, rain or dust moving across the lens',
    texture: 'chrome reflections, vapor, fractured glass, tactile skin detail'
  },
  {
    label: 'Mirror inversion',
    framing: 'invert the original power dynamic so the muse becomes the observer and the viewer becomes the artifact',
    motion: 'locked-off tableaux broken by sudden handheld drift and one impossible crane move',
    texture: 'velvet blacks, surgical highlights, electric bloom, editorial stillness'
  },
  {
    label: 'Future rupture',
    framing: 'push the story forward into a new climate, a new architecture, and a more dangerous form of intimacy',
    motion: 'wide establishing sweeps, gliding steadicam passes, abrupt macro inserts',
    texture: 'sunburnt metal, biometric interfaces, ceremonial costume details'
  },
  {
    label: 'Ghost variation',
    framing: 'treat the source film as a myth that keeps returning in altered bodies and altered cities',
    motion: 'stuttered slow motion, procession shots, intimate profile closeups',
    texture: 'haze, static, silk, dust, reflective lacquer'
  }
];

export function buildMovieForgePack(movieName = '', brain = {}, options = {}) {
  const safeBrain = (brain && typeof brain === 'object') ? brain : {};
  const dictionary = (safeBrain.dictionary && typeof safeBrain.dictionary === 'object') ? safeBrain.dictionary : {};
  const trainingSeeds = (safeBrain.trainingSeeds && typeof safeBrain.trainingSeeds === 'object') ? safeBrain.trainingSeeds : {};
  const sourceTitle = normalizeText(options.sourceTitle || movieLabel(movieName)) || movieLabel(movieName);
  const vidsProjectUrl = normalizeText(options.vidsProjectUrl || '');
  const referenceSnapshots = normalizeReferenceSnapshots(options.referenceSnapshots);
  const baseTitle = normalizeText(options.baseTitle || sourceTitle) || sourceTitle;
  const startIndex = Math.max(1, Number(options.startIndex || inferStartIndex(movieName)));
  const theme = normalizeText(safeBrain.theme || firstDictionaryValue(dictionary, ['about', 'what is this about']) || `cinematic world of ${sourceTitle}`);
  const loglineSeed = firstDictionaryValue(dictionary, ['story', 'about', 'what is this about']);
  const quoteSeed = firstDictionaryValue(dictionary, ['quote', 'default', 'hello']);
  const referenceSeed = firstDictionaryValue(dictionary, ['reference', 'influences', 'film']);
  const influences = uniqueList([
    ...collectDictionaryValues(dictionary, ['reference', 'influences', 'film']),
    ...asArray(trainingSeeds.references)
  ]).slice(0, 8);
  const themes = uniqueList([
    theme,
    ...asArray(trainingSeeds.themes),
    ...asArray(trainingSeeds.obsessions)
  ]).slice(0, 10);
  const symbols = uniqueList([
    ...asArray(trainingSeeds.symbols),
    ...collectDictionaryValues(dictionary, ['default', 'hello'])
  ]).slice(0, 8);
  const frame = CONCEPT_FRAMES[Math.max(0, (startIndex - 1) % CONCEPT_FRAMES.length)];
  const title = buildConceptTitle(baseTitle, startIndex, 0);
  const angle = `${frame.label} for ${sourceTitle}`;
  const motifList = uniqueList([...themes.slice(0, 4), ...symbols.slice(0, 4)]).slice(0, 6);
  const initialVideoPrompt = [
    `Create an 8-second Google Vids AI video clip for ${title}.`,
    `Core tone: ${theme}.`,
    referenceSnapshots.length
      ? `Use the attached Ingredients images ${referenceSnapshots.map((snapshot) => snapshot.timeLabel ? `${snapshot.label} at ${snapshot.timeLabel}` : snapshot.label).join(' and ')} as the starting visual anchors.`
      : '',
    loglineSeed ? `Story seed: ${loglineSeed}.` : '',
    `Visual frame: ${frame.framing}.`,
    `Camera language: ${frame.motion}.`,
    `Texture language: ${frame.texture}.`,
    influences.length ? `Reference field: ${influences.slice(0, 5).join(', ')}.` : '',
    motifList.length ? `Keep these motifs visible: ${motifList.join(', ')}.` : '',
    quoteSeed ? `Optional spoken line or text cue: "${quoteSeed}".` : '',
    'Avoid generic sci-fi filler. Keep it tactile, sensual, and authored.'
  ].filter(Boolean).join(' ');
  const soundtrackPrompt = [
    `Music direction for ${title}.`,
    `Build around ${theme}.`,
    influences.length ? `Let it nod to ${influences.slice(0, 3).join(', ')} without imitation.` : '',
    `Texture notes: ${symbols.slice(0, 4).join(', ') || 'breathing synths, tactile percussion, ghost harmonics'}.`,
    'Keep it precise, intimate, and slightly dangerous.'
  ].filter(Boolean).join(' ');
  const posterPrompt = [
    `Poster direction for ${title}.`,
    `${theme}.`,
    `One central figure or emblem, ${frame.texture}, editorial composition, premium festival-poster typography space.`,
    motifList.length ? `Embed motifs: ${motifList.slice(0, 4).join(', ')}.` : '',
    'No collage clutter. One authored image.'
  ].filter(Boolean).join(' ');
  const movie = {
    title,
    angle,
    logline: normalizeText(
      `${title} turns ${theme} into a new chapter: ${frame.framing}. ${loglineSeed || `The new film should stay emotionally faithful to ${sourceTitle} while escalating the stakes.`}`
    ),
    synopsis: normalizeText(`${frame.framing}. ${referenceSeed || `Use ${sourceTitle} as the tonal ancestor.`}`),
    initialVideoPrompt,
    soundtrackPrompt,
    posterPrompt,
    quoteSeed,
    influences: influences.slice(0, 5),
    motifs: motifList,
    ingredients: {
      googleVidsProjectUrl: vidsProjectUrl,
      images: referenceSnapshots,
      notes: referenceSnapshots.length
        ? 'Upload these two snapshots in Google Vids Ingredients before generating the AI clip.'
        : 'Add up to two visual ingredient images before generating the AI clip.'
    }
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceMovie: movieName || '',
    sourceTitle,
    vidsProjectUrl,
    referenceSnapshots,
    baseTitle,
    theme,
    startIndex,
    influences,
    themes,
    symbols,
    movie,
    slug: buildSlug(`${baseTitle}-${startIndex}`)
  };
}

export function formatMovieForgePromptText(pack = {}) {
  const lines = [];
  lines.push(`GOOGLE VIDS MOVIE PACK :: ${pack.movie?.title || pack.baseTitle || pack.sourceTitle || 'Untitled'}`);
  lines.push(`SOURCE :: ${pack.sourceTitle || 'Unknown source'}`);
  if (pack.vidsProjectUrl) {
    lines.push(`GOOGLE VIDS :: ${pack.vidsProjectUrl}`);
  }
  if (Array.isArray(pack.referenceSnapshots) && pack.referenceSnapshots.length) {
    lines.push(`REFERENCE SNAPSHOTS :: ${pack.referenceSnapshots.map((snapshot) => snapshot.timeLabel ? `${snapshot.label} @ ${snapshot.timeLabel}` : snapshot.label).join(' | ')}`);
    lines.push('Attach the two reference snapshots from the JSON pack as Ingredients images before generating the clip.');
  }
  lines.push(`THEME :: ${pack.theme || 'No theme'}`);
  if (Array.isArray(pack.influences) && pack.influences.length) {
    lines.push(`INFLUENCES :: ${pack.influences.join(' | ')}`);
  }
  lines.push('');
  const movie = (pack.movie && typeof pack.movie === 'object') ? pack.movie : null;
  if (!movie) return lines.join('\n').trim();

  lines.push(`MOVIE :: ${movie.title || 'Untitled movie'}`);
  lines.push(`ANGLE :: ${movie.angle || ''}`);
  lines.push(`LOGLINE :: ${movie.logline || ''}`);
  lines.push(`SYNOPSIS :: ${movie.synopsis || ''}`);
  if (Array.isArray(movie.influences) && movie.influences.length) {
    lines.push(`REFERENCES :: ${movie.influences.join(' | ')}`);
  }
  if (Array.isArray(movie.motifs) && movie.motifs.length) {
    lines.push(`MOTIFS :: ${movie.motifs.join(' | ')}`);
  }
  lines.push('');
  lines.push('INITIAL VIDEO PROMPT');
  lines.push(movie.initialVideoPrompt || '');
  lines.push('');
  lines.push('OPTIONAL CHECKLIST');
  lines.push(`[ ] Add Google Vids Ingredients images${Array.isArray(pack.referenceSnapshots) && pack.referenceSnapshots.length ? ` (${pack.referenceSnapshots.map((snapshot) => snapshot.label).join(' + ')})` : ''}`);
  lines.push(`[ ] Use soundtrack direction: ${movie.soundtrackPrompt || ''}`);
  lines.push(`[ ] Use poster direction: ${movie.posterPrompt || ''}`);
  if (movie.quoteSeed) {
    lines.push(`[ ] Use optional spoken line: "${movie.quoteSeed}"`);
  }

  return lines.join('\n').trim();
}