export class PodcastEngine {
  constructor(options = {}) {
    this.queue = [];
    this.isSpeaking = false;
    this.sessionId = 0;
    this.enabled = true;
    this.guestFloorActive = false;
    this.idleNotified = true;
    this.pendingViewerInterrupt = null; // { viewerEntry, elaraEntry }
    this.viewerInterruptActive = false; // true while bridge/viewer/elara sequence is in flight
    
    // Dependencies (passed in)
    this.voiceManager = options.voiceManager;
    this._voiceManager = options.voiceManager; // alias used by notifyIdle guard
    this.isMobile = options.isMobile || false;
    this.pickVoiceProfiles = options.pickVoiceProfiles;
    this.onChatLine = options.onChatLine;
    this.onDrainStart = options.onDrainStart;
    this.onIdle = options.onIdle;
  }

  notifyIdle() {
    if (this.idleNotified || this.isSpeaking || this.queue.length > 0 || this.viewerInterruptActive || this.pendingViewerInterrupt) return;
    if (this._voiceManager?.micStarting) return; // mic acquisition in progress — hold Host A
    this.idleNotified = true;
    this.onIdle?.();
  }

  reset(options = {}) {
    this.queue = [];
    this.isSpeaking = false;
    this.idleNotified = true;
    this.pendingViewerInterrupt = null;
    this.viewerInterruptActive = false;
    if (options.newSession) {
      this.sessionId++;
    }
  }

  clearQueue() {
    this.queue = [];
    this.isSpeaking = false;
    this.idleNotified = true;
    this.pendingViewerInterrupt = null;
    this.viewerInterruptActive = false;
  }

  queueLines(lines = [], options = {}) {
    if (!this.enabled) return;

    const normalizedLines = (Array.isArray(lines) ? lines : [lines])
      .map((line) => ({
        text: String(line?.text || '').trim(),
        speaker: line?.speaker || 'hostA',
        logMeta: line?.logMeta || null
      }))
      .filter((line) => line.text);

    if (!normalizedLines.length) return;

    const force = options.force === true;
    const availableSlots = Math.max(0, 4 - this.queue.length);
    const entries = (force ? normalizedLines : normalizedLines.slice(0, availableSlots)).map((line) => ({
      text: line.text,
      speaker: line.speaker,
      logMeta: line.logMeta,
      sessionId: this.sessionId,
      kind: options.kind || 'general',
      batchNumber: options.batchNumber || 0
    }));

    if (!entries.length) return;

    this.idleNotified = false;
    if (options.prioritize) {
      this.queue = [...entries, ...this.queue];
    } else {
      this.queue.push(...entries);
    }

    this.drain();
  }

  queueLine(text, speaker = 'hostA', options = {}) {
    if (!this.enabled || !text) return;
    if (this.queue.length >= 4 && !options.force) return;
    
    const entry = {
      text,
      speaker,
      logMeta: options.logMeta || null,
      sessionId: this.sessionId,
      kind: options.kind || 'general',
      batchNumber: options.batchNumber || 0,
      context: options.context || 'podcast',
      voiceOpts: options.voiceOpts || null,
      pauseAfterMs: Number.isFinite(options.pauseAfterMs) && options.pauseAfterMs > 0 ? options.pauseAfterMs : 0
    };

    this.idleNotified = false;
    if (options.prioritize) {
      this.queue.unshift(entry);
    } else {
      this.queue.push(entry);
    }
    
    this.drain();
  }

  queueBatch(lines = [], batchNumber = 0) {
    if (!this.enabled) return;
    const safeBatchNumber = Math.max(0, Number(batchNumber || 0));
    
    const normalizedLines = lines
      .map((line) => ({
        text: String(line?.text || '').trim(),
        speaker: line?.speaker || 'hostA',
        sessionId: this.sessionId,
        kind: 'batch',
        batchNumber: safeBatchNumber
      }))
      .filter((line) => line.text);

    if (!normalizedLines.length) return;

    // Logic to preserve non-batch lines but replace old batch lines
    const carryForward = this.queue.find((line) => line.kind === 'batch-carry' && line.sessionId === this.sessionId)
      || this.queue.find((line) => line.kind === 'batch' && line.speaker === 'hostB' && line.sessionId === this.sessionId)
      || null;

    const nonBatchLines = this.queue.filter((line) => line.kind !== 'batch' && line.kind !== 'batch-carry');
    
    this.queue = carryForward
      ? [{ ...carryForward, kind: 'batch-carry' }, ...nonBatchLines]
      : nonBatchLines;

    this.queue.push(...normalizedLines);
    this.idleNotified = false;
    this.drain();
  }

  drain(force = false) {
    if (!this.enabled || this.isSpeaking) return;
    if (!this.queue.length && !this.pendingViewerInterrupt) {
      this.notifyIdle();
      return;
    }
    // Prevent draining if guest has the floor, unless forced
    if (this.guestFloorActive && !force) return;

    // Enforce strict alternation: Host A always leads after Host B or guest
    if (this.queue.length >= 2) {
      const first = this.queue[0];
      const second = this.queue[1];
      // If Host B is about to speak twice, previously inserted Host A prompt here. (Removed as requested)
      // If guest just spoke, ensure Host A follows
      if (first.speaker === 'guest' && second.speaker !== 'hostA') {
        this.queue.splice(1, 0, {
          text: 'Thank you for that. Let me continue.',
          speaker: 'hostA',
          sessionId: this.sessionId,
          kind: 'general',
          batchNumber: 0
        });
      }
    }
    
    // Safety check for browser synthesis being busy
    if (!force && this.voiceManager?.synthesis?.speaking) return;

    // Consume any pending viewer pill interrupt before the next item
    if (this.pendingViewerInterrupt) {
      const { viewerEntry, elaraEntry } = this.pendingViewerInterrupt;
      this.pendingViewerInterrupt = null;
      this.viewerInterruptActive = true; // block notifyIdle until the sequence finishes
      const sid = this.sessionId;
      const BRIDGES = ['Mm.', 'Mmhm.', 'Oh.', 'Right.', 'Yeah.'];
      const bridgeText = BRIDGES[Math.floor(Math.random() * BRIDGES.length)];
      const bridge = { text: bridgeText, speaker: 'hostA', logMeta: { source: 'pill-bridge', suppressAiLog: true }, sessionId: sid, kind: 'general', batchNumber: 0 };
      const vEntry = { ...viewerEntry, sessionId: sid, kind: 'general', batchNumber: 0 };
      const items = [bridge, vEntry];
      if (elaraEntry?.text) {
        // tag elara (last item) to clear the active flag when it finishes
        items.push({ ...elaraEntry, sessionId: sid, kind: 'general', batchNumber: 0, _clearViewerInterruptOnEnd: true });
      } else {
        vEntry._clearViewerInterruptOnEnd = true; // viewer is last if no elara
      }
      this.queue = [...items, ...this.queue];
    }

    let next = this.queue.shift();
    while (next && next.sessionId !== this.sessionId) {
      next = this.queue.shift();
    }
    if (!next) {
      this.notifyIdle();
      return;
    }

    if (this.onChatLine) this.onChatLine(next);
    if (!this.voiceManager?.speak) return;

    this.isSpeaking = true;
    this.idleNotified = false;
    const profiles = this.pickVoiceProfiles ? this.pickVoiceProfiles() : { hostA: { pitch: 1, rate: 1 } };
    const profile = profiles[next.speaker] || profiles.hostA;

    // Watchdog: Snappier detection of stuck synthesis
    const watchdogMs = this.isMobile ? 10000 : 7000;
    const wordCount = next.text.split(/\s+/).length;
    const estimatedMs = Math.max(3000, wordCount * 320);
    const effectiveWatchdog = Math.max(watchdogMs, estimatedMs + 2000);

    // Guard: only the first of watchdog OR onEnd may trigger the next drain/idle
    let drainHandled = false;
    const pauseAfterMs = next.pauseAfterMs || 0;
    const safeDrainEnd = () => {
      if (drainHandled) return;
      drainHandled = true;
      // Last item in a viewer-interrupt sequence clears the active flag
      if (next._clearViewerInterruptOnEnd) this.viewerInterruptActive = false;
      this.isSpeaking = false;
      const delay = (this.isMobile ? 450 : 200) + pauseAfterMs;
      setTimeout(() => {
        if (this.queue.length || this.pendingViewerInterrupt) {
          this.drain(true);
        } else {
          this.notifyIdle();
        }
      }, delay);
    };

    const watchdog = setTimeout(() => {
      if (this.isSpeaking) safeDrainEnd();
    }, effectiveWatchdog);

    this.voiceManager.speak(next.text, {
      ...profile,
      ...(next.voiceOpts || {}),
      speaker: next.speaker,
      context: next.context || 'podcast',
      onEnd: () => {
        clearTimeout(watchdog);
        safeDrainEnd();
      }
    });
  }

  /**
   * Schedule a viewer pill interrupt to be consumed before the next queue item.
   * Stored in pendingViewerInterrupt — drain() injects bridge + viewer + elara
   * after the currently-speaking line finishes.
   */
  spliceViewerInterrupt(viewerEntry, elaraEntry) {
    if (!this.enabled) return;
    // Overwrite any prior pending interrupt (latest pill wins)
    // Flush stale queued DICT lines so they cannot follow the elara response
    this.queue = [];
    this.pendingViewerInterrupt = { viewerEntry, elaraEntry };
    this.idleNotified = false;
    // If nothing is speaking, drain immediately so the interrupt fires now.
    // Use force=true to bypass synthesis.speaking guard (browser can report
    // speaking=true momentarily after onEnd fires, which would deadlock the interrupt).
    if (!this.isSpeaking) {
      this.drain(true);
    }
  }
}


