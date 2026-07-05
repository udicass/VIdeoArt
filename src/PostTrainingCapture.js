import { loadMemories } from './brainMemory.js';
import { downloadBrainDictionaryCSV } from './exportBrainCSVBrowser.js';

/**
 * PostTrainingCapture — runs a 5-minute podcast window immediately after cloud training,
 * intercepts AI log entries, and exports a JSON transcript + CSV snapshot on completion.
 *
 * Usage (main.js):
 *   const capture = new PostTrainingCapture({
 *     voiceManager,
 *     onInjectPodcastPrompt: (prompt, movie) => handlePodcastGuestPrompt(prompt, { source: 'chat', skipUserEcho: true })
 *   });
 *   await capture.startCapture(movie, sessionMeta);
 */
export class PostTrainingCapture {
  constructor({ voiceManager, onInjectPodcastPrompt, captureDurationMs = 5 * 60 * 1000 } = {}) {
    this.voiceManager = voiceManager;
    this.onInjectPodcastPrompt = onInjectPodcastPrompt;
    this.captureDurationMs = captureDurationMs;
    this.isCapturing = false;
    this.capturedTurns = [];
    this.captureTimer = null;
    this.promptTimers = [];
    this.movie = null;
    this.sessionMeta = null;
    this._listenerId = null;
  }

  async startCapture(movie, sessionMeta = {}) {
    if (this.isCapturing) return;
    this.isCapturing = true;
    this.movie = movie;
    this.sessionMeta = sessionMeta;
    this.capturedTurns = [];

    if (typeof this.voiceManager?.addAiLogListener === 'function') {
      this._listenerId = this.voiceManager.addAiLogListener((entry) => this._onLog(entry));
    }

    this._triggerAutoPodcastSequence();
    this.captureTimer = setTimeout(() => this.stopCaptureAndExport(), this.captureDurationMs);
  }

  _onLog(entry) {
    if (!this.isCapturing) return;
    const engine = String(entry?.engine || '').toLowerCase();
    // Only capture non-training podcast/brain-reply entries
    if (entry.training) return;
    if (!['cloud', 'brain-reply', 'brain-check'].includes(engine)) return;
    this.capturedTurns.push({
      at: Date.now(),
      engine,
      level: entry.level || null,
      input: entry.input || '',
      output: entry.output || '',
      score: Number.isFinite(entry.score) ? entry.score : null,
      examSource: entry.examSource || null,
      intent: entry.intent || null,
      ms: Number.isFinite(entry.ms) ? entry.ms : null
    });
  }

  _triggerAutoPodcastSequence() {
    const mems = (loadMemories(this.movie) || []).slice(0, 8);
    const frames = [
      (s) => `You said "${s}". What's underneath that now?`,
      (s) => `Return to "${s}" from a different angle — what does it refuse to say?`,
      (s) => `If "${s}" is the surface, what pressure is it hiding?`,
      (s) => `Stay with "${s}". What does it feel like from inside the frame?`,
      (s) => `Contradict "${s}". Where does it fail?`,
      (s) => `Translate "${s}" into the architecture of the room.`
    ];

    let delay = 3000;
    const gap = 30000;
    mems.slice(0, 8).forEach((mem, i) => {
      const frame = frames[i % frames.length];
      const seed = this._shortenSeed(mem.response || mem.input || '');
      if (!seed) return;
      const prompt = frame(seed);
      const t = setTimeout(() => {
        if (!this.isCapturing) return;
        try { this.onInjectPodcastPrompt?.(prompt, this.movie); } catch {}
      }, delay);
      this.promptTimers.push(t);
      delay += gap;
    });
  }

  _shortenSeed(text, maxChars = 80) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxChars) return t;
    return t.slice(0, maxChars).replace(/[^.!?]*$/, '').trim() || t.slice(0, maxChars);
  }

  stopCaptureAndExport() {
    if (!this.isCapturing) return;
    this.isCapturing = false;
    clearTimeout(this.captureTimer);
    this.promptTimers.forEach((t) => clearTimeout(t));
    this.promptTimers = [];

    if (this._listenerId != null && typeof this.voiceManager?.removeAiLogListener === 'function') {
      this.voiceManager.removeAiLogListener(this._listenerId);
      this._listenerId = null;
    }

    const movieSlug = String(this.movie || 'unknown').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const payload = {
      movie: this.movie,
      capturedAt: new Date().toISOString(),
      sessionMeta: this.sessionMeta,
      turnCount: this.capturedTurns.length,
      turns: this.capturedTurns
    };

    this._downloadJSON(payload, `warm-brain-capture-${movieSlug}-${Date.now()}.json`);
    try { downloadBrainDictionaryCSV(`after-${movieSlug}`); } catch {}
  }

  _downloadJSON(data, filename) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[PostTrainingCapture] JSON export failed:', err?.message);
    }
  }
}
