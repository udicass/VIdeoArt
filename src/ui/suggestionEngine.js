/**
 * Suggestion Engine — Dynamic Question Phrases
 * Generates contextual question suggestions for the chat interface.
 */

const DEFAULT_SUGGESTIONS = [
  'Which references most directly shape this movie?',
  'What specific motif matters most here?',
  'What does the setting tell us in this film?',
  'Which stored detail should I notice first?',
  'What object carries the tension in this movie?',
  'What does the camera reveal in this film?',
  'What part of this image feels most intentional?',
  'What concrete detail anchors this world?'
];

export class SuggestionEngine {
  constructor(options = {}) {
    this.suggestions = [];
    this.onSuggestionClick = options.onSuggestionClick || null;
    this.movieBrain = null;
    this.suggestionsRow = null;
    this.suggestionsContainer = null;
    this.initDOM();
  }

  initDOM() {
    this.suggestionsRow = document.getElementById('ai-suggestions-row');
    this.suggestionsContainer = document.getElementById('ai-suggestions-container');
  }

  /**
   * Generate contextual suggestions based on movie brain
   */
  generateSuggestions(brain) {
    this.movieBrain = brain;

    const recallQuestions = this._buildConcreteRecallQuestions(brain);
    const customQuestions = Array.isArray(brain?.customQuestions) ? brain.customQuestions : [];
    const questionsToUse = [...recallQuestions, ...customQuestions, ...DEFAULT_SUGGESTIONS];

    this.suggestions = this._dedupeQuestions(questionsToUse).slice(0, 4);
  }

  /**
   * Render suggestion pills in the UI
   */
  render() {
    if (!this.suggestionsContainer) {
      this.initDOM();
    }

    if (!this.suggestionsContainer) return;

    // Clear existing pills
    this.suggestionsContainer.innerHTML = '';

    // Render new pills
    const chatInput = document.getElementById('aiChatInput');
    const disabledState = !!(chatInput && chatInput.disabled);

    this.suggestions.forEach((suggestion) => {
      const pill = document.createElement('button');
      pill.className = 'ai-suggestion-pill';
      pill.type = 'button';
      pill.textContent = suggestion;
      pill.setAttribute('title', `Ask: ${suggestion}`);

      // disable pills when chat input is disabled (chat not started)
      if (disabledState) {
        pill.disabled = true;
        pill.classList.add('disabled');
      }

      pill.addEventListener('click', (e) => {
        e.preventDefault();
        this._handleSuggestionClick(suggestion);
      });

      this.suggestionsContainer.appendChild(pill);
    });

    // Show the row if there are suggestions
    if (this.suggestions.length > 0) {
      this.suggestionsRow?.classList.remove('hidden');
    }
  }

  /** Hide the suggestions row */
  hide() {
    if (this.suggestionsRow) this.suggestionsRow.classList.add('hidden');
  }

  /** Show the suggestions row */
  show() {
    if (this.suggestionsRow && this.suggestions.length > 0) this.suggestionsRow.classList.remove('hidden');
  }

  _handleSuggestionClick(suggestion) {
    if (this.onSuggestionClick) this.onSuggestionClick(suggestion);
  }

  /**
   * Refresh pills based on the latest Muse/hostB line from the podcast.
   * Derives 1-2 contextual follow-ups from the line, fills the rest from the brain pool.
   */
  refreshFromContext(museLine, brain) {
    if (brain) this.movieBrain = brain;
    const contextPills = this._deriveFollowUps(museLine);
    const brainQuestions = this._dedupeQuestions([
      ...this._buildConcreteRecallQuestions(this.movieBrain),
      ...(Array.isArray(this.movieBrain?.customQuestions) ? this.movieBrain.customQuestions : []),
      ...DEFAULT_SUGGESTIONS
    ]);
    const needed = Math.max(0, 4 - contextPills.length);
    const brainPick = brainQuestions.slice(0, needed);
    this.suggestions = this._dedupeQuestions([...contextPills, ...brainPick]).slice(0, 4);
    this.render();
  }

  /**
   * Derive 1-2 contextual follow-up questions from a Muse line.
   */
  _deriveFollowUps(line) {
    const text = String(line || '')
      .replace(/^(host\s*a|muse|host\s*b)\s*[·:\-]\s*/i, '')
      .replace(/\bgemma\d*(?::[\w-]+)?\b/gi, ' ')
      .replace(/\bdict\b/gi, ' ')
      .replace(/\bcloud\b/gi, ' ')
      .replace(/\bollama\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return [];
    const brain = this.movieBrain || {};
    const seedMatches = [
      ...this._collectSeedItems(brain?.trainingSeeds?.references, 4),
      ...this._collectSeedItems(brain?.trainingSeeds?.symbols, 6),
      ...this._collectSeedItems(brain?.trainingSeeds?.story, 3)
    ].filter((item) => text.toLowerCase().includes(item.toLowerCase())).slice(0, 2);
    if (seedMatches.length) {
      return this._dedupeQuestions(seedMatches.flatMap((item) => ([
        `Why does ${item} matter in this movie?`,
        `How does ${item} connect to the rest of the film?`
      ]))).slice(0, 2);
    }
    const STOP = new Set([
      'about', 'after', 'again', 'along', 'around', 'before', 'being', 'between',
      'every', 'other', 'still', 'their', 'there', 'these', 'which', 'while',
      'where', 'keeps', 'never', 'always', 'inside', 'longer', 'under', 'until',
      'since', 'through', 'those', 'something', 'nothing', 'everything', 'another',
      // contraction fragments
      'doesn', 'didn', 'isn', 'aren', 'wasn', 'weren', 'hadn', 'hasn',
      'wouldn', 'couldn', 'shouldn', 'won', 'can', 'don',
      // filler / weak words
      'just', 'even', 'more', 'like', 'only', 'also', 'very', 'here',
      'them', 'that', 'this', 'what', 'with', 'from', 'have', 'when',
      'your', 'will', 'make', 'much', 'some', 'they', 'then', 'than',
      'into', 'each', 'both', 'made', 'been', 'were', 'does', 'said',
      // runtime / model / admin words
      'gemma', 'archive', 'brain', 'dict', 'cloud', 'local', 'training', 'batch',
      'heartbeat', 'provider', 'model', 'runtime', 'session', 'host', 'muse',
      'keeps', 'moving', 'carrying', 'specifically', 'reveal', 'reveals'
    ]);
    // remove contractions whole before splitting (e.g. "doesn't" → removed)
    const nouns = text.replace(/\b\w+'\w+\b/g, ' ').replace(/[^a-zA-Z\s]/g, ' ')
      .split(/\s+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 5 && !STOP.has(w));
    const key = nouns[0] || '';
    const second = nouns[1] || '';
    if (!key) return [];
    const follow = [
      second
        ? `How do ${key} and ${second} work together in this movie?`
        : `Why does ${key} matter in this movie?`,
      `What does ${key} connect to elsewhere in the film?`
    ];
    return follow.slice(0, 2);
  }

  _buildConcreteRecallQuestions(brain) {
    const refs = this._collectSeedItems(brain?.trainingSeeds?.references, 3);
    const symbols = this._collectSeedItems(brain?.trainingSeeds?.symbols, 4);
    const story = this._collectSeedItems(brain?.trainingSeeds?.story, 2);
    const questions = [];

    refs.slice(0, 2).forEach((ref) => {
      questions.push(`How does ${ref} shape this movie?`);
    });

    symbols.slice(0, 3).forEach((symbol) => {
      questions.push(`Why does ${symbol} matter in this movie?`);
    });

    if (story[0]) {
      questions.push('What concrete detail from the story should I notice first?');
    }

    const lowerSymbols = symbols.map((item) => item.toLowerCase());
    if (lowerSymbols.some((item) => /camera|lens|shutter|glass/.test(item))) {
      questions.push('What is the relationship between camera, gaze, and power here?');
    }
    if (lowerSymbols.some((item) => /rope|shibari|restriction/.test(item))) {
      questions.push('What does the rope change in this film beyond appearance?');
    }
    if (lowerSymbols.some((item) => /darkroom|red light|negative|grain/.test(item))) {
      questions.push('What does the darkroom change about the meaning of the image?');
    }

    return this._dedupeQuestions(questions);
  }

  _collectSeedItems(values, limit = 4) {
    const seen = new Set();
    const results = [];
    (Array.isArray(values) ? values : [values]).forEach((value) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      const key = normalized.replace(/[.!?]+$/g, '').toLowerCase();
      if (!normalized || !key || seen.has(key)) return;
      seen.add(key);
      results.push(normalized);
    });
    return results.slice(0, Math.max(1, Number(limit || 1)));
  }

  _dedupeQuestions(questions = []) {
    const seen = new Set();
    return (Array.isArray(questions) ? questions : [])
      .map((question) => String(question || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((question) => {
        const key = question.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  _shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export default SuggestionEngine;
