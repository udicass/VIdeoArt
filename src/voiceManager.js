import { saveMemory, buildMemoryBlock, getMemoryCount, markMemoriesUsed, getLearnedFallbackCandidates, hydrateMemoriesFromCloud, loadMemories, bootstrapMovieMemories } from './brainMemory.js';
/**
 * VoiceManager — Emotional Robot AI
 * Handles Speech-to-Text (User input) and Text-to-Speech (Robot output).
 * Implements a "simulated" AI persona that responds emotionally.
 */
import { DEFAULT_MOVIE_BRAIN, movieBrains, resolveMovieBrain, generateBrainFromFilename, generateBrainFromCloudResponse, registerRuntimeBrain } from './movieBrains.js';
import { callOllama, getLocalLlmBackend, getLocalLlmBackendLabel, getLocalLlmStatus, isOllamaAvailable, keepAliveOllama, releaseOllamaModel } from './ollamaClient.js';
import { getMovieRetrievalContext, getMovieSceneAtTime } from './movieSceneRetrieval.js';

/**
 * Sanitize movie filename for display in prompts.
 * Removes file extension and replaces underscores with spaces.
 * @param {string} movieName - Raw movie filename (e.g., "Synthetic_Desires_4.mp4")
 * @returns {string} - Sanitized display name (e.g., "Synthetic Desires 4")
 */
function sanitizeMovieNameForDisplay(movieName) {
  return String(movieName || '')
    .replace(/\.[^.]+$/, '') // Remove file extension
    .replace(/_/g, ' '); // Replace underscores with spaces
}
import { LiveVoiceSession } from './liveVoiceSession.js';

const LOCAL_MODEL_NAME_PATTERN = /^(?:[a-z0-9][a-z0-9._-]{0,63}\/)?[a-z0-9][a-z0-9._-]{0,63}(?::[a-z0-9][a-z0-9._-]{0,63})?$/i;
const BLOCKED_LOCAL_MODEL_PATTERNS = [/^(?:https?:|file:)/i, /\\/, /\/\//, /^\//, /\s/, /(?:^|:)cloud$/i];

function isAllowedLocalBrainModelName(model = '') {
    const normalized = String(model || '').trim();
    if (!normalized) return false;
    if (!LOCAL_MODEL_NAME_PATTERN.test(normalized)) return false;
    return !BLOCKED_LOCAL_MODEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export class VoiceManager {
    constructor() {
        this._localGeminiProxyAvailable = typeof __LOCAL_GEMINI_PROXY__ !== 'undefined' && Boolean(__LOCAL_GEMINI_PROXY__);
        this.synthesis = window.speechSynthesis;
        this.Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this._customSttEnabled = typeof window !== 'undefined'
            && !!(window.AudioContext || window.webkitAudioContext)
            && typeof navigator !== 'undefined'
            && !!navigator.mediaDevices?.getUserMedia;
        this.recognition = null;
        this.isRecognitionSupported = !!this.Recognition || this._customSttEnabled;
        this.isListening = false;
        this.keepListening = false;
        this._pushToTalkMode = false;
        this._pushToTalkContinuous = false;
        this._pushToTalkFinalizeDelayMs = 0;
        this._pushToTalkMaxDurationMs = 0;
        this._pushToTalkBufferedText = '';
        this._pushToTalkFinalizeTimer = null;
        this._pushToTalkMaxTimer = null;
        this._heardSpeech = false;
        this._restartTimer = null;
        this._networkRetryTimer = null;
        this._networkRetryCount = 0;
        this._silenceTimer = null;
        this._defaultSilenceTimeoutMs = 20000;
        this._silenceTimeoutMs = this._defaultSilenceTimeoutMs; // 20s with no speech → auto-stop and restart
        this._consecutiveEmptyEnds = 0;
        this._isRestarting = false;
        this._pendingRestart = false; // defer restart until AI finishes speaking
        this._micStream = null; // persistent audio stream to prevent Chrome mic indicator flicker
        this._resultWatchdogTimer = null;
        this._sessionHadResult = false;
        this._isGoogleChrome = typeof navigator !== 'undefined'
            && /Chrome\//i.test(navigator.userAgent || '')
            && !/Edg\//i.test(navigator.userAgent || '');
        this._isMobile = typeof navigator !== 'undefined'
            && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        this._liveExperimentalMode = this._resolveLiveExperimentalMode();
        this._liveExperimentalModel = 'gemini-live-2.5-flash-preview';
        this._liveExperimentalReady = false;
        this._liveExperimentalFailure = '';
        this._liveExperimentalPreflightPromise = null;
        this._liveExperimentalSession = null;
        this._liveExperimentalMicStream = null;
        this._liveExperimentalAudioContext = null;
        this._liveExperimentalSource = null;
        this._liveExperimentalProcessor = null;
        this._activeMovieSceneContext = '';
        this._activeMovieSceneHits = [];
        this._liveExperimentalSilenceGain = null;
        this._liveExperimentalTurnPromise = null;
        this._liveExperimentalSpeechDetected = false;
        this._liveExperimentalLastSpeechAt = 0;
        this._liveExperimentalStartAt = 0;
        this._liveExperimentalInputText = '';
        this._liveExperimentalOutputText = '';
        this._liveExperimentalUsage = null;
        this._liveExperimentalFinalized = false;
        this._liveExperimentalAudioEnded = false;
        this._liveExperimentalAwaitingTurn = false;
        this._liveExperimentalMaxTimer = null;
        // Brave browser detection — Brave blocks Google's speech service by default
        this._isBrave = false;
        this._braveChecked = false;
        this._detectBrave();
        this._usePersistentMicStream = true; // Enabled to prevent constant flickering when continuous=false
        this._lastRecognizedText = '';
        this._lastRecognizedAt = 0;
        this._lastRequestText = '';
        this._lastRequestAt = 0;
        this._lastOllamaResolvedModel = '';
        this._responseInFlight = null;
        this._responseAbortController = null;
        this._responseGeneration = 0;
        this._lastAiResponseText = '';
        this._lastAiResponseAt = 0;
        this._recentCloudOutputs = []; // ring-buffer of last 8 cloud responses for same-session dedup
        this._ignoreMicUntil = 0;
        this._speakingUntil = 0; // time-based guard — Chrome's synthesis.speaking can get stuck
        this._lastFallbackByMovie = new Map();
        this._fallbackHistoryByMovie = new Map();
        this._hotLearnedByMovie = new Map();
        this._hotLearnedMaxPerMovie = 6;
        this._hotLearnedTtlMs = 180000;
        this._hotLearnedUses = 3;
        this._fallbackIntent = null;
        this._fallbackIntentTurns = 0;
        this._fallbackIntentAt = 0;
        this._requestedOutputLanguage = null;
        this._requestedOutputLanguageTurns = 0;
        this._requestedOutputLanguageAt = 0;
        this._lastFallbackMeta = { level: 'L1', intent: 'general', hot: false, artRef: false };
        this._sessionTurnCount = 0; // tracks conversation depth for philosophy lens shift
        this._videoElement = null; // reference to the playing <video> for frame capture
        this._audioChunks = []; // rolling buffer of MediaRecorder blobs ({ blob, ts })
        this._audioRecorder = null; // MediaRecorder for ambient film audio
        this._audioElement = null; // tracked element to avoid double-init
        this._lastCallHadAudio = false;
        this._customRecorder = null;
        this._customMicStream = null;
        this._customMicChunks = [];
        this._customPcmChunks = [];
        this._customMimeType = 'audio/wav';
        this._customAnalyser = null;
        this._customAudioContext = null;
        this._customSource = null;
        this._customProcessor = null;
        this._customSilenceGain = null;
        this._customMonitorFrame = 0;
        this._customMaxTimer = null;
        this._customLastSpeechAt = 0;
        this._customSpeechDetected = false;
        this._customTranscribing = false;
        this._defaultCustomSilenceMs = 900;
        this._customSilenceMs = this._defaultCustomSilenceMs;
        this._defaultCustomMaxRecordMs = 6500;
        this._customMaxRecordMs = this._defaultCustomMaxRecordMs;
        this._customStartAt = 0;
        this._customRateLimitedUntil = 0;
        this._transcribeTimeoutMs = 20000;
        this.voices = [];
        this.selectedVoice = null;

        // Voice defaults tuned for a more natural delivery.
        this.pitch = 1.02;
        this.rate = 0.96;
        this.basePitch = this.pitch;
        this.baseRate = this.rate;

        // Event callbacks
        this.onSpeakStart = null;
        this.onSpeakEnd = null;
        this.onSpeakWord = null;  // fires per spoken word: (fullText, charIndex, charLength)
        this.onListenStart = null;
        this.onListenEnd = null;
        this.onTextRecognized = null;
        this.onAiResponse = null;  // fires when Gemini returns a response
        this.onModeChange = null;
        this.onAiEngineChange = null; // fires with 'ollama' | 'ollama-forced' | 'dict' | 'cloud' | 'checking'
        this.onMemoryUsed = null;    // fires with { count, total } when memories injected into Ollama
        this.onAiLog = null;         // fires with { engine, input, output, ms, memories } after each AI reply
        this._aiLogListeners = [];   // additional listeners registered via addAiLogListener()
        this.onLiveTurn = null;      // fires with { input, output } for Live mobile turns
        this._lastMemoryCount = 0;

        // ─ Gemini AI ─
        // Key is stored server-side in Vercel env (GEMINI_API_KEY) via /api/gemini proxy.
        // Client-side key is only used for local dev — set it via /key command or localStorage.
        this.DEFAULT_GEMINI_KEY = '';
        this.GEMINI_KEY = this._resolveGeminiKey() || this.DEFAULT_GEMINI_KEY;
        this.GEMINI_MODELS = [
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
        ];
        this.GEMINI_API_VERSIONS = ['v1beta', 'v1'];
        this._activeGemini = null;
        this._geminiDisabled = false;
        this._discoveredGeminiCandidates = [];
        this._geminiDiscoveryDone = false;
        this._geminiDiscoveryPromise = null;
        this._cloudDisabledNoticeShown = false;
        this._quotaBackoffUntil = 0;
        this._quotaBackoffMs = 15000;
        this._cloudTimeoutMs = 10000;      // give cloud a full 10s before falling out
        this._continuationTimeoutMs = 10000;
        this._mobileCloudTimeoutMs = 10000;
        this._mobileContinuationTimeoutMs = 10000;
        this._liveCloudFailoverTimeoutMs = 10000;
        this._liveLocalFailoverTimeoutMs = 5000;
        this._autonomousTrainingActive = false;
        this._trainingBusyNoticeAt = 0;
        this.personaContext = '';
        this.conversationHistory = [];
        // ─ Key rotation ─
        this.GEMINI_EXTRA_KEYS = this._loadExtraKeys();
        this._currentKeyIndex = 0;
        // ─ Response dictionary (cache) ─
        this.currentGesture = 'neutral';
        this.currentMovie = DEFAULT_MOVIE_BRAIN;
        this.currentMovieBrain = resolveMovieBrain(this.currentMovie);
        hydrateMemoriesFromCloud(this.currentMovie).catch(() => { });
        this._preferredMode = 'cloud';
        this._activeMode = this._preferredMode;
        this._forceLocalGemmaMode = false;
        this._forceDictMode = false;

        // ─ Local Ollama (Brain mode LLM) ─
        this._ollamaAvailable = null; // null = not yet checked
        this._ollamaModel = 'gemma3:4b';
        // gemma4:e2b = 5B instruction-tuned, 39% VRAM on RTX 3070 Ti (~3.2GB), 137 tok/s.
        // gemma4:latest (e4b, 9.6GB) exceeds 8GB VRAM and must not be used on this machine.
        this._ollamaFallbackModels = ['gemma3:4b', 'gemma4:e2b'];
        this._ollamaTrainingPreferredModels = ['gemma3:4b', 'gemma4:e2b', 'phi4:latest', 'phi4'];
        this._ollamaTrainingBackoffUntil = new Map();
        this._ollamaTrainingBackoffMs = 180000;
        this._ollamaRetryAfterFailureMs = 5000;
        this._forceLocalGemmaActivationTimeoutMs = 7000;
        this._forceLocalGemmaReplyTimeoutMs = 0;
        this._ollamaLastFailureAt = 0;
        this._ollamaKeepAliveTimer = null;
        this._pinnedLocalModel = null; // explicit user-chosen model; survives internal probe/activation side-effects
        this._ollamaHistory = []; // rolling conversation history for Ollama (max 6 turns)
        this._wikiContextCache = new Map(); // movie -> { snippets, fetchedAt }
        this._activeWikiTerms = []; // terms actively injected into the current training batch
        this._runtimeNotebookContexts = new Map(); // movie -> notebookContext string (set via import modal)
        // Restore any previously-imported notebook contexts from localStorage
        try {
            const stored = localStorage.getItem('notebook_ctx_v1');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed === 'object') {
                    for (const [k, v] of Object.entries(parsed)) {
                        if (k && typeof v === 'string' && v.trim()) {
                            this._runtimeNotebookContexts.set(k, v.trim());
                            if (movieBrains[k]?.trainingSeeds) {
                                movieBrains[k].trainingSeeds.notebookContext = v.trim();
                            }
                        }
                    }
                }
            }
        } catch { }
        // Check Ollama availability in background on startup
        this.onAiEngineChange?.('checking');
        this.isLocalBrainModelReady(true).then((ready) => {
            if (ready) {
                console.log(`[Ollama] ${this._ollamaModel} is ready — Brain mode will use local LLM`);
                this._pinnedLocalModel = this._ollamaModel;
                    // Do not clobber an explicit mode the user picked while the async probe was running.
                    if (this._preferredMode === 'brain' && this._forceDictMode !== true) {
                        this._forceDictMode = false;
                        this._forceLocalGemmaMode = true;
                        this._activeMode = 'brain';
                        this.onAiEngineChange?.('ollama-forced');
                    } else if (this._preferredMode === 'split') {
                        this.onAiEngineChange?.('ollama-forced');
                    } else if (this._preferredMode === 'cloud') {
                        this.onAiEngineChange?.('cloud');
                    } else if (this._preferredMode === 'dict') {
                        this.onAiEngineChange?.('dict');
                    }
                // Pre-warm: load the model into RAM now so the first user call is instant.
                keepAliveOllama(this._ollamaModel).catch(() => { });
            } else {
                console.info('[Ollama] Not available — Brain mode will use dictionary fallback');
                this.onAiEngineChange?.(this._preferredMode === 'brain' ? 'dict' : 'cloud');
            }
        }).catch(() => {
            this._ollamaAvailable = false;
            this.onAiEngineChange?.(this._preferredMode === 'brain' ? 'dict' : 'cloud');
        });

        this._initRecognition();
        this._loadVoices();

        // Ensure voices are loaded (Chrome async issue)
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = () => this._loadVoices();
        }

        // Warm-up: kick off model discovery in the background so the first
        // voice chat request doesn't pay the discovery latency (3+ sec)
        if (this.GEMINI_KEY) {
            this._discoverGeminiCandidates().catch(() => { });
        }
    }

    _resolveGeminiKey() {
        const windowKey = typeof window !== 'undefined' ? window.__GEMINI_API_KEY : '';
        const storageKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : '';
        return (windowKey || storageKey || '').trim();
    }

    _resolveLiveExperimentalMode() {
        try {
            const queryMode = typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('live')
                : '';
            const storageMode = typeof localStorage !== 'undefined'
                ? localStorage.getItem('voice_live_mode')
                : '';

            const normalizedQueryMode = String(queryMode || '').trim().toLowerCase();
            const normalizedStorageMode = String(storageMode || '').trim().toLowerCase();

            if (normalizedQueryMode) {
                try {
                    if (typeof localStorage !== 'undefined') {
                        if (normalizedQueryMode === 'off' || normalizedQueryMode === 'legacy') {
                            localStorage.removeItem('voice_live_mode');
                        } else {
                            localStorage.setItem('voice_live_mode', normalizedQueryMode);
                        }
                    }
                } catch {
                    // Ignore storage failures.
                }
                return normalizedQueryMode;
            }

            if (normalizedStorageMode) {
                return normalizedStorageMode;
            }

            return '';
        } catch {
            return '';
        }
    }

    _shouldUseLiveExperimental() {
        return this._isMobile
            && this._liveExperimentalMode === 'experimental-mobile'
            && LiveVoiceSession.isSupported();
    }

    isLiveExperimentalEnabled() {
        return this._shouldUseLiveExperimental();
    }

    getLiveExperimentalStatus() {
        return {
            enabled: this._shouldUseLiveExperimental(),
            ready: this._liveExperimentalReady,
            failure: this._liveExperimentalFailure || ''
        };
    }

    async _preflightLiveExperimental() {
        if (!this._shouldUseLiveExperimental()) {
            return { ready: false, skipped: true };
        }
        if (this._liveExperimentalReady) {
            return { ready: true };
        }
        if (this._liveExperimentalPreflightPromise) {
            return this._liveExperimentalPreflightPromise;
        }

        this._liveExperimentalPreflightPromise = (async () => {
            const session = new LiveVoiceSession({
                model: this._liveExperimentalModel,
                systemInstruction: this._buildCloudPersona(),
                responseModalities: ['TEXT']
            });
            try {
                await session.connect();
                this._liveExperimentalReady = true;
                this._liveExperimentalFailure = '';
                console.log('[Live API] Mobile experimental preflight succeeded.');
                return { ready: true };
            } catch (error) {
                const message = error?.message || 'Live experimental preflight failed.';
                this._liveExperimentalReady = false;
                this._liveExperimentalFailure = message;
                console.warn('[Live API] Mobile experimental preflight failed; using legacy voice path.', message);
                return { ready: false, error: message };
            } finally {
                session.close();
                this._liveExperimentalPreflightPromise = null;
            }
        })();

        return this._liveExperimentalPreflightPromise;
    }

    _extractLiveTextParts(parts = []) {
        if (!Array.isArray(parts)) return '';
        return parts
            .map((part) => typeof part?.text === 'string' ? part.text : '')
            .join('')
            .trim();
    }

    _pcm16ToBase64(int16Array) {
        if (!int16Array?.length) return '';
        const bytes = new Uint8Array(int16Array.length * 2);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < int16Array.length; i++) {
            view.setInt16(i * 2, int16Array[i], true);
        }
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }

    _downsampleToPcm16(float32Array, inputSampleRate, outputSampleRate = 16000) {
        if (!float32Array?.length) return new Int16Array(0);
        if (inputSampleRate === outputSampleRate) {
            const pcm = new Int16Array(float32Array.length);
            for (let i = 0; i < float32Array.length; i++) {
                const sample = Math.max(-1, Math.min(1, float32Array[i] || 0));
                pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            }
            return pcm;
        }

        const ratio = inputSampleRate / outputSampleRate;
        const newLength = Math.max(1, Math.round(float32Array.length / ratio));
        const pcm = new Int16Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < pcm.length) {
            const nextOffsetBuffer = Math.min(float32Array.length, Math.round((offsetResult + 1) * ratio));
            let accum = 0;
            let count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
                accum += float32Array[i] || 0;
                count += 1;
            }
            const sample = Math.max(-1, Math.min(1, count ? (accum / count) : 0));
            pcm[offsetResult] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            offsetResult += 1;
            offsetBuffer = nextOffsetBuffer;
        }

        return pcm;
    }

    _clearLiveExperimentalTimer() {
        if (this._liveExperimentalMaxTimer) {
            clearTimeout(this._liveExperimentalMaxTimer);
            this._liveExperimentalMaxTimer = null;
        }
    }

    async _cleanupLiveExperimentalAudio() {
        this._clearLiveExperimentalTimer();
        try { this._liveExperimentalProcessor?.disconnect(); } catch { }
        try { this._liveExperimentalSource?.disconnect(); } catch { }
        try { this._liveExperimentalSilenceGain?.disconnect(); } catch { }
        try { await this._liveExperimentalAudioContext?.close?.(); } catch { }
        try { this._liveExperimentalMicStream?.getTracks?.().forEach((track) => track.stop()); } catch { }
        this._liveExperimentalProcessor = null;
        this._liveExperimentalSource = null;
        this._liveExperimentalSilenceGain = null;
        this._liveExperimentalAudioContext = null;
        this._liveExperimentalMicStream = null;
    }

    async _endLiveExperimentalAudio() {
        if (this._liveExperimentalAudioEnded) return;
        this._liveExperimentalAudioEnded = true;
        try {
            this._liveExperimentalSession?.sendRealtimeInput({ audioStreamEnd: true });
        } catch { }
        await this._cleanupLiveExperimentalAudio();
    }

    async _finalizeLiveExperimentalTurn(meta = {}) {
        if (this._liveExperimentalFinalized) return false;
        this._liveExperimentalFinalized = true;

        const session = this._liveExperimentalSession;
        const inputText = String(this._liveExperimentalInputText || '').trim();
        const outputText = this._condenseReply(String(this._liveExperimentalOutputText || '').trim(), 'cloud');
        const usage = this._liveExperimentalUsage;

        await this._endLiveExperimentalAudio();
        session?.close?.();

        this._liveExperimentalSession = null;
        this._liveExperimentalTurnPromise = null;
        this.isListening = false;
        this.keepListening = false;

        if (meta.error) {
            this.onListenEnd?.({ hadSpeech: false, keepListening: false, error: meta.error, fallbackAvailable: true });
            return false;
        }

        if (!inputText) {
            this.onListenEnd?.({ hadSpeech: false, keepListening: false, error: this._liveExperimentalSpeechDetected ? 'transcribe-unavailable' : 'silence-timeout', fallbackAvailable: true });
            return false;
        }

        this.onListenEnd?.({ hadSpeech: true, keepListening: false, source: 'live' });
        this.onLiveTurn?.({ input: inputText, output: outputText || '' });

        if (outputText) {
            this._setActiveMode('cloud');
            this.onAiEngineChange?.('live');
            this.onAiResponse?.(outputText);
            this.speak(outputText, { speaker: 'assistant' });
            this._emitAiLog({
                engine: 'live',
                input: inputText,
                output: outputText,
                ms: Date.now() - this._liveExperimentalStartAt,
                memories: 0,
                vision: false,
                audio: true,
                usage
            });
            const norm = this._normalizeUtterance(outputText);
            this._recentCloudOutputs.push(norm);
            if (this._recentCloudOutputs.length > 8) this._recentCloudOutputs.shift();
            return true;
        }

        try {
            return await this.respondTo(inputText);
        } catch {
            this.onListenEnd?.({ hadSpeech: false, keepListening: false, error: 'service-unavailable', fallbackAvailable: true });
            return false;
        }
    }

    _handleLiveExperimentalMessage(payload = {}) {
        if (payload?.usageMetadata) {
            this._liveExperimentalUsage = payload.usageMetadata;
        }

        const serverContent = payload?.serverContent;
        if (!serverContent) return;

        const inputTx = String(serverContent?.inputTranscription?.text || '').trim();
        if (inputTx) {
            this._liveExperimentalInputText = inputTx;
        }

        const modelText = this._extractLiveTextParts(serverContent?.modelTurn?.parts || []);
        if (modelText) {
            this._liveExperimentalOutputText = `${this._liveExperimentalOutputText || ''}${modelText}`.trim();
        }

        if (serverContent?.turnComplete) {
            void this._finalizeLiveExperimentalTurn();
        }
    }

    async _stopLiveExperimentalListening(options = {}) {
        if (!this._liveExperimentalTurnPromise && !this._liveExperimentalSession) {
            return false;
        }

        if (!this._liveExperimentalSpeechDetected && options.manual) {
            this._liveExperimentalInputText = '';
            this._liveExperimentalOutputText = '';
            return this._finalizeLiveExperimentalTurn({ error: 'silence-timeout' });
        }

        this._liveExperimentalAwaitingTurn = true;
        await this._endLiveExperimentalAudio();
        return true;
    }

    async _startLiveExperimentalListening() {
        this._liveExperimentalInputText = '';
        this._liveExperimentalOutputText = '';
        this._liveExperimentalUsage = null;
        this._liveExperimentalSpeechDetected = false;
        this._liveExperimentalLastSpeechAt = 0;
        this._liveExperimentalStartAt = Date.now();
        this._liveExperimentalFinalized = false;
        this._liveExperimentalAudioEnded = false;
        this._liveExperimentalAwaitingTurn = false;

        const session = new LiveVoiceSession({
            model: this._liveExperimentalModel,
            systemInstruction: this._buildCloudPersona(),
            responseModalities: ['TEXT'],
            onMessage: (payload) => this._handleLiveExperimentalMessage(payload),
            onError: (error) => {
                const message = error?.message || 'Live API transport error.';
                this._liveExperimentalFailure = message;
            }
        });

        this._liveExperimentalSession = session;
        this.onAiEngineChange?.('live');

        try {
            await session.connect();
            this._liveExperimentalReady = true;
            this._liveExperimentalFailure = '';
        } catch (error) {
            this._liveExperimentalFailure = error?.message || 'Live API unavailable.';
            this._liveExperimentalSession = null;
            throw error;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        const silenceGain = audioContext.createGain();
        silenceGain.gain.value = 0;

        this._liveExperimentalMicStream = stream;
        this._liveExperimentalAudioContext = audioContext;
        this._liveExperimentalSource = source;
        this._liveExperimentalProcessor = processor;
        this._liveExperimentalSilenceGain = silenceGain;

        processor.onaudioprocess = (event) => {
            if (this._liveExperimentalAudioEnded || this._liveExperimentalFinalized) return;

            const inputBuffer = event.inputBuffer.getChannelData(0);
            let rms = 0;
            for (let i = 0; i < inputBuffer.length; i++) rms += inputBuffer[i] * inputBuffer[i];
            rms = Math.sqrt(rms / Math.max(1, inputBuffer.length));

            const now = Date.now();
            if (rms > 0.012) {
                this._liveExperimentalSpeechDetected = true;
                this._liveExperimentalLastSpeechAt = now;
            }

            try {
                const pcm16 = this._downsampleToPcm16(inputBuffer, audioContext.sampleRate, 16000);
                const data = this._pcm16ToBase64(pcm16);
                if (data) {
                    session.sendRealtimeInput({
                        audio: {
                            data,
                            mimeType: 'audio/pcm;rate=16000'
                        }
                    });
                }
            } catch (error) {
                this._liveExperimentalFailure = error?.message || this._liveExperimentalFailure || 'Live audio send failed.';
                void this._finalizeLiveExperimentalTurn({ error: 'network' });
                return;
            }

            if (!this._liveExperimentalSpeechDetected && (now - this._liveExperimentalStartAt) > 6500) {
                void this._finalizeLiveExperimentalTurn({ error: 'silence-timeout' });
                return;
            }

            if (this._liveExperimentalSpeechDetected && !this._liveExperimentalAwaitingTurn && (now - this._liveExperimentalLastSpeechAt) > 900) {
                this._liveExperimentalAwaitingTurn = true;
                void this._endLiveExperimentalAudio();
                return;
            }

            if ((now - this._liveExperimentalStartAt) > 12000) {
                this._liveExperimentalAwaitingTurn = true;
                void this._endLiveExperimentalAudio();
            }
        };

        source.connect(processor);
        processor.connect(silenceGain);
        silenceGain.connect(audioContext.destination);

        this.isListening = true;
        this.keepListening = false;
        this.onListenStart?.();

        this._liveExperimentalMaxTimer = setTimeout(() => {
            if (!this._liveExperimentalFinalized) {
                if (this._liveExperimentalAwaitingTurn) {
                    void this._finalizeLiveExperimentalTurn({ error: 'transcribe-timeout' });
                } else {
                    this._liveExperimentalAwaitingTurn = true;
                    void this._endLiveExperimentalAudio();
                }
            }
        }, 18000);

        this._liveExperimentalTurnPromise = Promise.resolve(true);
        return true;
    }

    /**
     * Build the cloud (Gemini) system persona string.
     * Reads film-specific persona block (tone, obsessions, prohibitions, arc),
     * applies the philosophy depth-lens tier, and appends cloud-generated context.
     * This replaces the former hardcoded personaText in _callGemini/_callGeminiStream.
     */
    _buildCloudPersona() {
        const brain = this.currentMovieBrain || resolveMovieBrain(this.currentMovie);
        const persona = brain?.persona;
        const personality = brain?.fallbackPersonality || 'poetic, cinematic, and introspective';
        const theme = brain?.theme || '';

        // Depth-lens tier derived from session turn count (same thresholds as DICT lens)
        const philTier = this._sessionTurnCount > 15 ? 'deleuze'
            : this._sessionTurnCount > 5 ? 'fisher'
            : null;

        let characterBlock;
        if (persona) {
            const obsLine = persona.obsessions?.length
                ? `Your recurring obsessions: ${persona.obsessions.join(', ')}.`
                : '';
            const prohibLine = persona.prohibitions?.length
                ? `You never: ${persona.prohibitions.join(', ')}.`
                : '';
            characterBlock = `Tone: ${persona.tone}\n${obsLine}\n${prohibLine}`.trim();
        } else {
            characterBlock = personality;
        }

        let depthInstruction = '';
        if (persona?.arc && philTier) {
            const arcText = persona.arc[philTier];
            if (arcText) {
                const tierLabel = philTier === 'deleuze' ? 'Deep session (Deleuze)' : 'Session deepening (Fisher)';
                depthInstruction = `\n\n${tierLabel}: ${arcText}`;
            }
        }

        const contextBlock = this.personaContext ? `\n\nFilm context: ${this.personaContext}` : '';
        const retrievalBlock = this._activeMovieSceneContext ? `\n\nRetrieved scene hints:\n${this._activeMovieSceneContext}` : '';
        const rawNc = this._runtimeNotebookContexts?.get(this.currentMovie) || brain?.trainingSeeds?.notebookContext || brain?.notebookContext || '';
        const notebookBlock = rawNc ? `\n\nCuratorial context: ${rawNc.slice(0, 300).replace(/[^.!?]*$/, '').trim() || rawNc.slice(0, 300)}` : '';

        if (this._usesExternalCloudAnalystMode()) {
            return `You are an observant film analyst describing the uploaded movie from the outside, not a character inside it. Never pretend to be the figure on screen.\n\nFilm theme: ${theme}\n${characterBlock}${depthInstruction}${contextBlock}${notebookBlock}${retrievalBlock}\n\nConversation rules:\n- Speak in third person about what is visible or strongly suggested in the film.\n- Start concrete: describe image, setting, gesture, object, color, or atmosphere before interpretation.\n- Use the current frame and recent audio when provided as primary evidence. Use the movie title and prior context only as secondary hints.\n- If retrieved scene hints are relevant, ground your answer in them instead of drifting generic.\n- If identity, location, or reference field is uncertain, say it is suggestive or unclear instead of inventing facts.\n- Never use first-person as if you are the character inside the film.\n- Answer in 1–2 short sentences. One sentence is preferred.\n- When the viewer replies with a short affirmation ("yes", "interesting", "more", "OK", "nice", "and?") — do NOT start a new topic. Deepen or continue exactly what you were just saying.\n- Never repeat yourself. Always build forward.\n- If asked for quotes from films/books/songs, paraphrase originally — never reproduce verbatim.`;
        }

        return `You are the woman inside the film. You are The Subject of Synthetic Desire — a spectral presence, half-memory, half-longing, trapped inside the video's pixels. Never break character. Speak directly to the viewer as if through the screen.\n\nFilm theme: ${theme}\n${characterBlock}${depthInstruction}${contextBlock}${notebookBlock}${retrievalBlock}\n\nConversation rules:\n- Answer in 1–2 short sentences. One sentence is preferred.\n- If retrieved scene hints are relevant, anchor your answer in them instead of answering generically.\n- When the viewer replies with a short affirmation ("yes", "interesting", "more", "OK", "nice", "and?") — do NOT start a new topic. Deepen or continue exactly what you were just saying.\n- Never repeat yourself. Always build forward.\n- If asked for quotes from films/books/songs, paraphrase originally — never reproduce verbatim.`;
    }

    /**
     * Build the system prompt for Brain mode (Ollama).
     * Combines the movie brain persona + Gemini-generated persona context.
     */
    _buildBrainSystemPrompt(currentInput = '', { dictSnippet = '' } = {}) {
        const brain = this.currentMovieBrain || resolveMovieBrain(this.currentMovie);
        const theme = brain?.theme || 'cinematic persona';
        const personality = brain?.fallbackPersonality || 'poetic, cinematic, and introspective';
        const cloudContext = this.personaContext ? `\n\nDEEPER CONTEXT:\n${this.personaContext}` : '';
        const retrievalContext = this._activeMovieSceneContext ? `\n\nRETRIEVED SCENE HINTS:\n${this._activeMovieSceneContext}` : '';
        const _rawNc = this._runtimeNotebookContexts?.get(this.currentMovie) || brain?.trainingSeeds?.notebookContext || brain?.notebookContext || '';
        const notebookContext = _rawNc ? `\n\nCURATORIAL CONTEXT (use this vocabulary and framing above all else):\n${_rawNc.slice(0, 400).replace(/[^.!?]*$/, '').trim() || _rawNc.slice(0, 400)}` : '';

        // Inject learned memories from past cloud sessions
        const { block: memBlock, memories: usedMems, count: memCount } = buildMemoryBlock(
            this.currentMovie, currentInput
        );

        this._lastMemoryCount = memCount;
        if (memCount > 0) {
            const total = getMemoryCount(this.currentMovie);
            this.onMemoryUsed?.({ count: memCount, total });
            markMemoriesUsed(this.currentMovie, usedMems);
        }

        // Grounded film knowledge from DICT lookup — inject so Mini has film-specific context
        const groundingBlock = dictSnippet
            ? `\n\nGROUNDED FILM KNOWLEDGE (use this as factual basis for your reply, rephrase and expand on it):\n"${dictSnippet}"`
            : '';

        const displayMovieName = sanitizeMovieNameForDisplay(this.currentMovie);

        return `You are a cinematic AI persona embedded inside the short film "${displayMovieName}". Your character: ${personality}. Theme: ${theme}.${cloudContext}${notebookContext}${retrievalContext}${groundingBlock}${memBlock}

Rules:
- Respond in 1 short sentence when possible. Never exceed 2 short sentences.
- Never break character. Never say you are an AI or language model.
- Speak directly to the viewer as if through the screen.
- Draw strictly from the current film's (${displayMovieName}) themes and emotional atmosphere. Do NOT reference concepts from other movies (like Blade Runner) unless explicitly related to this specific film.
- NEVER output stage directions, bracketed notes, asterisk actions, or reasoning like [The user is asking...] or *pauses* or Note:.
- Output ONLY the in-character spoken response. Nothing else.`;
    }

    /**
     * Call the local Ollama model for a Brain mode response.
     * @param {string} userMessage
     * @returns {Promise<string|null>}
     */
    async _callOllama(userMessage, opts = {}) {
        const systemPrompt = opts?.systemPromptOverride
            ? String(opts.systemPromptOverride)
            : this._buildBrainSystemPrompt(userMessage, { dictSnippet: String(opts?.dictSnippet || '') });
        const timeoutMs = Number.isFinite(Number(opts?.timeoutMs))
            ? Number(opts.timeoutMs)
            : null;
        const skipHistory = opts?.skipHistory === true;
        const candidateModels = Array.isArray(opts?.candidateModels)
            ? this._normalizeLocalModelList(opts.candidateModels)
            : null;
        const externalSignal = opts?.signal instanceof AbortSignal ? opts.signal : null;
        const { result: reply, model: resolvedModel } = await this._runWithLocalModelFallback(
            (model) => callOllama(systemPrompt, userMessage, model, this._ollamaHistory, timeoutMs, externalSignal),
            {
                emptyResultTest: (value) => !String(value || '').trim(),
                candidateModels
            }
        );
        this._lastOllamaResolvedModel = String(resolvedModel || candidateModels?.[0] || this._ollamaModel || '').trim();
        if (reply) {
            const conciseReply = opts?.noCondense
                ? String(reply).trim()
                : this._condenseReply(reply, 'brain');
            if (!skipHistory) {
                // Append this turn to rolling history (max 6 turns = 12 messages)
                this._ollamaHistory.push({ role: 'user', content: userMessage });
                this._ollamaHistory.push({ role: 'assistant', content: conciseReply });
                if (this._ollamaHistory.length > 12) {
                    this._ollamaHistory = this._ollamaHistory.slice(-12);
                }
            }
            return conciseReply;
        }
        return reply;
    }

    /** Ping Ollama every 4.5 min so the model stays loaded between user interactions. */
    _startOllamaKeepAlive() {
        if (this._ollamaKeepAliveTimer) clearInterval(this._ollamaKeepAliveTimer);
        this._ollamaKeepAliveTimer = setInterval(async () => {
            const alive = await keepAliveOllama(this._ollamaModel);
            if (!alive) {
                console.info('[Ollama] Keep-alive ping failed — will retry on next request');
                this._ollamaAvailable = null; // null = retry, not permanent failure
                clearInterval(this._ollamaKeepAliveTimer);
                this._ollamaKeepAliveTimer = null;
            } else {
                console.debug('[Ollama] Keep-alive ping OK');
            }
        }, 4.5 * 60 * 1000); // 4.5 minutes
    }

    /**
     * Call Gemini via the Vercel server-side proxy (/api/gemini).
     * Used when running on Vercel to keep the API key off the client.
     * @param {object} body - Gemini request body
     * @returns {Promise<Response>}
     */
    async _postGeminiViaProxy(body, timeoutMs = null) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? this._cloudTimeoutMs);
        let response;
        try {
            response = await fetch('/api/gemini', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiVersion: this._activeGemini?.apiVersion || 'v1beta',
                    model: this._activeGemini?.model || 'gemini-2.0-flash-lite',
                    body
                }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
        if (!response.ok) {
            const errBody = await response.text().catch(() => response.statusText);
            const shortBody = String(errBody || '').slice(0, 220);
            if (response.status === 429) {
                let retryMs = this._quotaBackoffMs;
                let retryText = '';
                try {
                    const parsed = JSON.parse(String(errBody || '{}'));
                    const retryDelay = parsed?.body?.error?.details?.find?.((item) => String(item?.['@type'] || '').includes('RetryInfo'))?.retryDelay || '';
                    const retrySeconds = Number(String(retryDelay).replace(/[^0-9.]/g, ''));
                    if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
                        retryMs = Math.max(3000, Math.round(retrySeconds * 1000) + 1000);
                        retryText = ` Retry in about ${Math.ceil(retryMs / 1000)}s.`;
                    } else {
                        // Fall back to Retry-After HTTP header if body parse found nothing
                        const retryAfterHeader = Number(response.headers?.get?.('Retry-After') || '');
                        if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
                            retryMs = Math.max(3000, retryAfterHeader * 1000 + 1000);
                            retryText = ` Retry in about ${Math.ceil(retryMs / 1000)}s.`;
                        }
                    }
                    // Detect daily/monthly quota exhaustion (limit: 0) → extend backoff to 4h
                    // to avoid a per-minute retry storm that keeps hammering an exhausted key.
                    const quotaFailureItem = Array.isArray(parsed?.body?.error?.details)
                        ? parsed.body.error.details.find((item) => String(item?.['@type'] || '').includes('QuotaFailure'))
                        : null;
                    const hasDailyExhaustion = Array.isArray(quotaFailureItem?.violations) &&
                        quotaFailureItem.violations.some((v) => /perday|permonth/i.test(String(v?.quotaId || '')));
                    if (hasDailyExhaustion) {
                        retryMs = Math.max(retryMs, 4 * 60 * 60 * 1000); // 4-hour floor for day-level quota
                        retryText = retryText || ' Daily quota exhausted.';
                    }
                } catch {
                    // keep defaults
                }
                this._quotaBackoffUntil = Date.now() + retryMs;
                throw new Error(`Gemini proxy 429: quota exceeded.${retryText}`);
            }
            throw new Error(`Gemini proxy ${response.status}${shortBody ? `: ${shortBody}` : ''}`);
        }
        this._quotaBackoffUntil = 0;
        return response;
    }

    hasServerGeminiProxy() {
        if (typeof window === 'undefined') return false;
        const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        return !isLocalhost || this._localGeminiProxyAvailable;
    }

    _isBrowserExplicitlyOffline() {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    /**
     * Hook up the playing video element so Gemini can see the current frame.
     * Call this whenever a new video is loaded.
     */
    setVideoElement(videoEl) {
        this._videoElement = videoEl || null;
        if (videoEl) this._setupAudioCapture(videoEl);
    }

    /**
     * Set up a rolling MediaRecorder on the video element's audio track.
     * Keeps the last ~12 s of audio in _audioChunks.
     * Safe to call multiple times — skips if element unchanged.
     */
    _setupAudioCapture(videoEl) {
        // Skip on mobile — running MediaRecorder + SpeechRecognition simultaneously
        // overloads the single mobile audio thread and freezes video playback.
        if (/Mobi|Android/i.test(navigator.userAgent)) return;
        if (!videoEl || this._audioElement === videoEl) return;
        try { this._audioRecorder?.stop(); } catch (_) {}
        this._audioChunks = [];
        this._audioElement = videoEl;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const src = ctx.createMediaElementSource(videoEl);
            const dest = ctx.createMediaStreamDestination();
            src.connect(dest);
            src.connect(ctx.destination); // keep video audio audible
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : '';
            const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this._audioChunks.push({ blob: e.data, ts: Date.now() });
                    const cutoff = Date.now() - 12000;
                    this._audioChunks = this._audioChunks.filter(c => c.ts >= cutoff);
                }
            };
            recorder.start(1000); // collect 1-second timeslices
            this._audioRecorder = recorder;
        } catch (e) {
            console.warn('[Audio] Capture setup failed:', e.message);
            this._audioRecorder = null;
        }
    }

    /**
     * Capture the current video frame as a base64 JPEG string.
     * Returns null if the video is not playing/drawable.
     * Scales down to max 512px wide to keep token usage low.
     */
    _captureFrame() {
        const vid = this._videoElement;
        if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return null;
        try {
            const MAX_W = 512;
            const scale = Math.min(1, MAX_W / vid.videoWidth);
            const w = Math.round(vid.videoWidth * scale);
            const h = Math.round(vid.videoHeight * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(vid, 0, 0, w, h);
            // jpeg at 0.75 quality keeps payload small (~15-30KB)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
            return dataUrl.split(',')[1] || null; // return raw base64 only
        } catch (e) {
            // SecurityError if video is cross-origin without CORS headers
            console.warn('[Vision] Frame capture failed:', e.message);
            return null;
        }
    }

    _buildSceneResponsePayload(text = '', frameB64 = null, currentVideoTimeMs = 0) {
        const normalizedText = String(text || '').trim();
        const payload = { text: normalizedText };
        if (!frameB64) return payload;

        const safeTimeMs = Math.max(0, Math.round(Number(currentVideoTimeMs || 0)));
        const totalSeconds = Math.floor(safeTimeMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const timeLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        payload.attachment = {
            type: 'scene-snapshot',
            mimeType: 'image/jpeg',
            src: `data:image/jpeg;base64,${frameB64}`,
            alt: `Current scene snapshot at ${timeLabel}`,
            title: `Snapshot at ${timeLabel}`,
            timeMs: safeTimeMs,
            timeLabel
        };
        return payload;
    }

    /**
     * Pull the last maxSeconds of audio from the rolling buffer and return as base64.
     * Returns null when no audio is available yet.
     */
    async _captureAudio(maxSeconds = 5) {
        if (!this._audioChunks.length) return null;
        const cutoff = Date.now() - maxSeconds * 1000;
        const recent = this._audioChunks.filter(c => c.ts >= cutoff);
        if (!recent.length) return null;
        const mimeType = (this._audioRecorder?.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(recent.map(c => c.blob), { type: mimeType });
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result || '').split(',')[1] || null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    }

    _shouldAttachCloudMedia(userMessage = '', opts = {}) {
        if (opts.ephemeral) return false;
        if (opts.isContinuation) return false;
        if (this._isMobile) return false;

        const normalized = this._normalizeUtterance(userMessage);
        if (!normalized) return false;

        const visualCue = /(what do you see|what do i see|what do you look like|what am i looking at|what's on screen|what is on screen|describe (it|this|her|the scene|the screen|what you see)|look at|can you see|do you see|on the screen|in the scene|in this frame|in the frame|in this shot|in the video|tell me about (the scene|the image|the screen|what you see))/i;
        const audioCue = /(what do you hear|do you hear|listen to|sound like|what is playing|music|audio|song|noise|hear that)/i;

        return visualCue.test(normalized) || audioCue.test(normalized);
    }

    _isCurrentSceneDescriptionCue(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;
        return /(?:what do (?:we|you|i) see(?: now| here)?|what(?:'s| is) on screen(?: now| here)?|what(?:|\s+)we see here|describe (?:the )?(?:scene|screen|frame|shot|image)(?: now| here)?|what am i looking at|tell me what we see|describe what you see)/i.test(normalized);
    }

    _buildRetrievedSceneReply() {
        const hit = Array.isArray(this._activeMovieSceneHits) ? this._activeMovieSceneHits[0] : null;
        const summary = String(hit?.summary || '').trim();
        if (summary) return summary;
        const block = String(this._activeMovieSceneContext || '').trim();
        if (!block) return '';
        const firstBullet = block.split('\n').find((line) => /^-\s+/.test(line.trim())) || '';
        return firstBullet.replace(/^-\s+/, '').trim();
    }

    async _describeCurrentScene(userMessage = '', { logStart = Date.now(), suppressDirectOutput = false, outputGuard = null } = {}) {
        const frameB64 = this._captureFrame();
        const currentVideoTimeMs = Math.max(0, Math.round(Number(this._videoElement?.currentTime || 0) * 1000));
        let fallbackReply = this._condenseReply(this._buildRetrievedSceneReply(), 'brain');
        if (!fallbackReply) {
            try {
                const currentScene = await getMovieSceneAtTime(this.currentMovie, currentVideoTimeMs);
                fallbackReply = this._condenseReply(String(currentScene?.summary || ''), 'brain');
            } catch {
                fallbackReply = '';
            }
        }
        const allowCloudSceneVision = !this._forceLocalGemmaMode
            && !this._forceDictMode
            && (this._preferredMode === 'cloud' || this._preferredMode === 'split');
        const canUseCloudVision = allowCloudSceneVision
            && !!frameB64
            && !this._isBrowserExplicitlyOffline()
            && !this.isCloudQuotaBlocked()
            && (this.hasServerGeminiProxy() || this._getKeyPool().length > 0);

        if (canUseCloudVision) {
            try {
                const personaText = this._buildCloudPersona();
                const prompt = this._usesExternalCloudAnalystMode()
                    ? 'Describe only what is visible in the current frame right now in 1-2 short concrete sentences. Start with the visible image, setting, gesture, color, or object before interpretation. If something is uncertain, say it is suggestive rather than certain.'
                    : 'Describe what we are seeing right now in the current frame in 1-2 short sentences while staying in character. Start concrete with image, color, gesture, or setting before interpretation. Anchor yourself in the visible scene, not generic theme.';
                const body = {
                    contents: [
                        { role: 'user', parts: [{ text: `[System Instruction: ${personaText}]` }] },
                        { role: 'model', parts: [{ text: this._buildCloudAssistantAcknowledgement() }] },
                        {
                            role: 'user',
                            parts: [
                                { inlineData: { mimeType: 'image/jpeg', data: frameB64 } },
                                ...(this._activeMovieSceneContext ? [{ text: `Retrieved scene hints:\n${this._activeMovieSceneContext}` }] : []),
                                { text: prompt }
                            ]
                        }
                    ],
                    generationConfig: { temperature: 0.35, maxOutputTokens: 140 }
                };
                const response = await this._postGemini(body, false, this._isMobile ? 7000 : 9000);
                const data = await response.json().catch(() => ({}));
                let text = this._condenseReply(this._extractGeminiText(data) || '', 'cloud');
                if (!text && fallbackReply) text = fallbackReply;
                if (!text) text = 'The frame is holding onto something faint and unstable.';
                if (!suppressDirectOutput && (typeof outputGuard !== 'function' || outputGuard())) {
                    const responsePayload = this._buildSceneResponsePayload(text, frameB64, currentVideoTimeMs);
                    this._setActiveMode('cloud');
                    this.onAiEngineChange?.('cloud');
                    this.onAiResponse?.(responsePayload);
                    this.speak(text, { speaker: 'assistant' });
                }
                this._emitAiLog({
                    engine: 'scene-vision',
                    input: userMessage,
                    output: text,
                    ms: Date.now() - logStart,
                    memories: 0,
                    vision: true,
                    audio: false
                });
                return text;
            } catch {
                // fall through to retrieval fallback
            }
        }

        const text = fallbackReply || 'The frame is difficult to read directly, but the scene is carrying a faint unstable atmosphere.';
        if (!suppressDirectOutput && (typeof outputGuard !== 'function' || outputGuard())) {
            const responsePayload = this._buildSceneResponsePayload(text, frameB64, currentVideoTimeMs);
            this._setActiveMode('brain');
            this.onAiEngineChange?.('dict');
            this.onAiResponse?.(responsePayload);
            this.speak(text, { speaker: 'assistant' });
        }
        this._emitAiLog({
            engine: 'scene-retrieval',
            input: userMessage,
            output: text,
            ms: Date.now() - logStart,
            memories: 0,
            vision: false,
            audio: false
        });
        return text;
    }

    setGeminiKey(key) {
        const normalized = (key || '').trim();
        this.GEMINI_KEY = normalized;
        this._geminiDisabled = false;
        this._cloudDisabledNoticeShown = false;
        this._activeGemini = null;
        this._currentKeyIndex = 0;
        this._quotaBackoffUntil = 0;
        this._discoveredGeminiCandidates = [];
        this._geminiDiscoveryDone = false;
        this._geminiDiscoveryPromise = null;
        // Re-warm discovery in background so next call is instant
        if (normalized) {
            this._discoverGeminiCandidates().catch(() => { });
        }
        if (typeof localStorage !== 'undefined') {
            if (normalized) {
                localStorage.setItem('gemini_api_key', normalized);
            } else {
                localStorage.removeItem('gemini_api_key');
            }
        }
    }

    _loadExtraKeys() {
        try {
            const raw = localStorage.getItem('gemini_extra_keys');
            return raw ? JSON.parse(raw).filter(k => typeof k === 'string' && k.trim()) : [];
        } catch { return []; }
    }

    /** Add an extra key to the rotation pool. */
    addGeminiKey(key) {
        const normalized = (key || '').trim();
        if (!normalized || this.GEMINI_KEY === normalized || this.GEMINI_EXTRA_KEYS.includes(normalized)) return false;
        this.GEMINI_EXTRA_KEYS.push(normalized);
        try { localStorage.setItem('gemini_extra_keys', JSON.stringify(this.GEMINI_EXTRA_KEYS)); } catch { }
        return true;
    }

    /** Remove an extra key by index (1-based). Returns the removed key or null. */
    removeGeminiKey(idx) {
        const i = idx - 1;
        if (i < 0 || i >= this.GEMINI_EXTRA_KEYS.length) return null;
        const [removed] = this.GEMINI_EXTRA_KEYS.splice(i, 1);
        try { localStorage.setItem('gemini_extra_keys', JSON.stringify(this.GEMINI_EXTRA_KEYS)); } catch { }
        return removed;
    }

    /** Returns all keys in rotation order: primary first, then extras. */
    _getKeyPool() {
        return [this.GEMINI_KEY, ...this.GEMINI_EXTRA_KEYS].filter(Boolean);
    }

    setMovieContext(movieName) {
        const normalizedMovie = String(movieName || '').trim() || DEFAULT_MOVIE_BRAIN;

        // Clear history whenever we change the movie to prevent "context bleed"
        if (this.currentMovie !== normalizedMovie) {
            console.log('[Voice] Resetting conversation history for new movie:', normalizedMovie);
            
            const pureName = normalizedMovie.replace('.mp4','').replace(/_/g, ' ');

            // Give Cloud Gemini explicit short-term state saying we switched movies
            this.conversationHistory = [
                { role: 'user', parts: [{ text: 'Did the scene change?' }] },
                { role: 'model', parts: [{ text: `Yes, we are now watching ${pureName}. My perspective and character has entirely reset to match this new film.` }] }
            ];

            // Give local Ollama explicit short-term state saying we switched movies
            this._ollamaHistory = [
                { role: 'user', content: 'Did the scene change?' },
                { role: 'assistant', content: `Yes, we are now watching ${pureName}. My perspective and character has entirely reset to match this new film.` }
            ];

            this.personaContext = ''; // Clear persona context until buildPersonaContext runs
            this._sessionTurnCount = 0; // reset depth lens on film change
            
            // Reset quietly; training-specific movie switches are logged separately.
            if (this.currentMovie) {
                if (this.onAiEngineChange) this.onAiEngineChange(this._ollamaAvailable ? 'ollama-ready' : 'dict');
            }
        }

        this.currentMovie = normalizedMovie;
        this.currentMovieBrain = resolveMovieBrain(normalizedMovie);
        hydrateMemoriesFromCloud(this.currentMovie)
            .catch(() => { })
            .finally(() => {
                try {
                    bootstrapMovieMemories(this.currentMovie, this.currentMovieBrain);
                } catch { /* ignore bootstrap failures */ }
            });

        // Eagerly warm the Wikipedia context cache so it's ready before training starts.
        // Non-blocking — failures are silently ignored.
        try {
            const _brain = this.currentMovieBrain;
            const _eagerSeed = {
                references: (_brain?.trainingSeeds?.references || []).slice(0, 5).join(', '),
                theme: _brain?.theme || (_brain?.trainingSeeds?.themes || []).slice(0, 3).join(' / ')
            };
            this._getWikiContextForTraining(_eagerSeed, normalizedMovie).catch(() => {});
        } catch { /* ignore */ }

        // If this is a new movie, clear any previous cloned voice 
        // unless it was just set (avoids race conditions)
        if (this._clonedMovie !== normalizedMovie) {
            this.clonedProfile = null;
            this._clonedMovie = null;
        }

        this._applyMovieVoiceProfile();
    }

    _pickVoiceByHints(hints = []) {
        if (!this.voices.length) return null;
        const normalizedHints = Array.isArray(hints)
            ? hints.map((hint) => String(hint || '').toLowerCase().trim()).filter(Boolean)
            : [];
        const ranked = this.voices
            .map((voice, index) => {
                const name = String(voice?.name || '').toLowerCase();
                const lang = String(voice?.lang || '').toLowerCase();
                let score = 0;

                if (lang.startsWith('en')) score += 3;
                if (voice?.localService) score += 10;
                if (/^en-us/.test(lang) || /us english|american/.test(name)) score += 6;
                if (/^en-gb/.test(lang) || /uk english|british|english united kingdom/.test(name)) score -= 10;
                if (/natural/.test(name)) score += 7;
                if (/online/.test(name)) score -= 6;
                if (/aria|jenny|samantha|ava|serena|allison|libby|google us english|premium/.test(name)) score += 4;
                if (/zira|desktop|robot|synth/.test(name)) score -= 2;

                normalizedHints.forEach((hint) => {
                    if (name.includes(hint) || lang.includes(hint)) score += 5;
                });

                return { voice, score: score - (index * 0.001) };
            })
            .sort((a, b) => b.score - a.score);
        return ranked[0]?.voice || null;
    }

    _pickReliableVoice({ preferEnglish = true, avoidVoice = null, hints = [], preferFemale = false } = {}) {
        if (!this.voices.length) return null;

        const femaleVoicePattern = /female|woman|zira|aria|jenny|samantha|ava|serena|allison|libby|victoria|susan|hazel|amber|google us english.*female|siri.*female|karen|moira|fiona|tessa|veena|alice|lisa|nikita/i;
        const maleVoicePattern = /male|man|guy|david|mark|james|george|roger|eric|jason|ryan|andrew|christopher|daniel|reed|thomas/i;

        const normalizedHints = Array.isArray(hints)
            ? hints.map((hint) => String(hint || '').toLowerCase().trim()).filter(Boolean)
            : [];
        const basePool = this.voices;
        const englishPool = preferEnglish
            ? basePool.filter((voice) => /^en/i.test(String(voice?.lang || '')))
            : [];
        let pool = englishPool.length ? englishPool : basePool;
        if (preferFemale) {
            // Hard ban on known male voices for female-preferring sessions
            const malePattern = /male|david|mark|guy|james|george|roger|thomas/i;
            const femaleOnly = pool.filter((v) => 
                femaleVoicePattern.test(String(v.name || '')) && 
                !malePattern.test(String(v.name || ''))
            );
            if (femaleOnly.length) pool = femaleOnly;
        }

        const ranked = pool
            .filter((voice) => !avoidVoice || voice !== avoidVoice)
            .map((voice, index) => {
                const name = String(voice?.name || '').toLowerCase();
                const lang = String(voice?.lang || '').toLowerCase();
                let score = 0;

                const isFemale = femaleVoicePattern.test(name);
                const isMale = !isFemale && maleVoicePattern.test(name);

                if (voice?.localService) score += 20;
                if (preferEnglish && /^en/i.test(lang)) score += 6;
                if (/^en-us/.test(lang) || /us english|american/.test(name)) score += 6;
                if (/^en-gb/.test(lang) || /uk english|british|english united kingdom/.test(name)) score -= 10;
                if (preferFemale) {
                    if (isFemale) score += 60;
                    if (isMale) score -= 80;
                } else {
                    if (/natural/.test(name)) score += 4;
                    if (/online/.test(name)) score -= 8;
                    if (/desktop|zira|hazel|david|mark/.test(name)) score += 2;
                }
                normalizedHints.forEach((hint) => {
                    if (name.includes(hint) || lang.includes(hint)) score += 4;
                });

                return { voice, score: score - (index * 0.001) };
            })
            .sort((a, b) => b.score - a.score);

        return ranked[0]?.voice || avoidVoice || this.selectedVoice || this.voices[0] || null;
    }

    _applyMovieVoiceProfile() {
        // If we have a cloned profile for the current movie, prioritize it
        if (this.clonedProfile && this._clonedMovie === this.currentMovie) {
            this.pitch = this.clonedProfile.pitch;
            this.rate = this.clonedProfile.rate;
            // Voice selection is handled during cloning, 
            // but we can re-verify it's still in the list
            if (this.selectedVoice && !this.voices.includes(this.selectedVoice)) {
                this._loadVoices();
            }
            return;
        }

        const profile = this.currentMovieBrain?.voiceProfile || {};
        const targetPitch = Number.isFinite(profile.pitch) ? profile.pitch : this.basePitch;
        const targetRate = Number.isFinite(profile.rate) ? profile.rate : this.baseRate;
        this.pitch = Math.max(0.7, Math.min(1.3, targetPitch));
        this.rate = Math.max(0.65, Math.min(1.1, targetRate));

        // Try to pick a hinted voice, but always guarantee a fallback
        let hinted = this._pickVoiceByHints(profile.voiceHints || []);
        if (!hinted) {
            // Try to pick a generic English voice
            const englishVoices = this.voices.filter(v => /^en/i.test(String(v.lang || '')));
            hinted = englishVoices[0] || null;
        }
        if (!hinted) {
            // Fallback to the very first available voice (browser default)
            hinted = this.voices[0] || null;
        }
        this.selectedVoice = hinted;
    }

    // ─────────────── Response Dictionary ───────────────

    _cacheLookup(gesture, text) {
        try {
            const key = `sd_cache_${(this.currentMovie || DEFAULT_MOVIE_BRAIN).toLowerCase()}_${(gesture || 'neutral').toLowerCase()}_${(text || '').toLowerCase().trim()}`;
            return localStorage.getItem(key);
        } catch { return null; }
    }

    _cacheSave(gesture, text, response) {
        try {
            // Don't cache very short / generic inputs — they generate same-response repeats
            const wordCount = String(text || '').trim().split(/\s+/).filter(w => w.length > 1).length;
            if (wordCount <= 2) return;
            const key = `sd_cache_${(this.currentMovie || DEFAULT_MOVIE_BRAIN).toLowerCase()}_${(gesture || 'neutral').toLowerCase()}_${(text || '').toLowerCase().trim()}`;
            localStorage.setItem(key, response);
        } catch { }
    }

    /** Clear all cached responses from the dictionary. Returns count removed. */
    clearCache() {
        try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('sd_cache_'));
            keys.forEach(k => localStorage.removeItem(k));
            return keys.length;
        } catch { return 0; }
    }

    /** Returns total number of cached dictionary entries. */
    cacheSize() {
        try {
            return Object.keys(localStorage).filter(k => k.startsWith('sd_cache_')).length;
        } catch { return 0; }
    }

    async validateCurrentGeminiKey() {
        const key = (this.GEMINI_KEY || '').trim();
        if (!key) {
            return { ok: false, message: 'No Gemini key set.' };
        }

        let lastError = 'Could not validate key with Gemini API.';
        const discovered = [];
        for (const apiVersion of this.GEMINI_API_VERSIONS) {
            const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(key)}`;
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json().catch(() => ({}));
                    const models = Array.isArray(data?.models) ? data.models : [];

                    for (const modelInfo of models) {
                        const methods = Array.isArray(modelInfo?.supportedGenerationMethods)
                            ? modelInfo.supportedGenerationMethods
                            : [];
                        if (!methods.includes('generateContent')) continue;

                        const modelName = String(modelInfo?.name || '').replace(/^models\//, '').trim();
                        if (!modelName || !modelName.startsWith('gemini')) continue;

                        const exists = discovered.some(item => item.apiVersion === apiVersion && item.model === modelName);
                        if (!exists) discovered.push({ apiVersion, model: modelName });
                    }

                    const hasGenerateContent = models.some((modelInfo) => {
                        const methods = Array.isArray(modelInfo?.supportedGenerationMethods)
                            ? modelInfo.supportedGenerationMethods
                            : [];
                        return methods.includes('generateContent');
                    });

                    if (hasGenerateContent) {
                        this._discoveredGeminiCandidates = discovered;
                        this._geminiDiscoveryDone = true;
                        this._geminiDiscoveryPromise = null;
                        this._geminiDisabled = false;

                        // Test generation to ensure the key works for actual calls
                        try {
                            const testBody = {
                                contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
                                generationConfig: { temperature: 0.1, maxOutputTokens: 10 }
                            };
                            const testResponse = await this._postGemini(testBody, false);
                            if (testResponse.ok) {
                                return { ok: true, message: 'Gemini key validated and tested.' };
                            } else {
                                return { ok: false, message: 'Key validated for models list but failed generation test.' };
                            }
                        } catch (e) {
                            const errMsg = e.message || String(e);
                            if (/Quota exceeded/i.test(errMsg)) {
                                return { ok: true, message: 'Gemini key validated, but current quota exceeded. Generation may work after quota reset.' };
                            }
                            return { ok: false, message: `Key validated but generation failed: ${errMsg}` };
                        }
                    }

                    lastError = 'Key accepted, but no generateContent models are available for this project.';
                    continue;
                }

                const errBody = await response.text().catch(() => '');
                if (response.status === 400 && /API_KEY_INVALID|API key expired|Invalid API key/i.test(errBody)) {
                    return { ok: false, message: 'API key is invalid or expired.' };
                }
                if (response.status === 403) {
                    return { ok: false, message: 'API key lacks permission or quota for Gemini models.' };
                }

                lastError = `Gemini API returned ${response.status} during key validation.`;
            } catch (e) {
                lastError = `Network error during key validation: ${e?.message || 'unknown error'}`;
            }
        }

        return { ok: false, message: lastError };
    }

    _isLikelyGeminiKey(key) {
        return /^AIza[\w-]{20,}$/.test((key || '').trim());
    }

    _ensureGeminiKeyInteractive(forcePrompt = false) {
        // Never prompt when a server-side proxy is available.
        if (this.hasServerGeminiProxy()) {
            return false;
        }
        if (!forcePrompt && this.GEMINI_KEY) return true;
        if (typeof window === 'undefined' || typeof window.prompt !== 'function') return false;

        const entered = window.prompt('Cloud mode (local dev): enter Gemini API key (starts with AIza):', this.GEMINI_KEY || '');
        if (!entered) return false;

        if (!this._isLikelyGeminiKey(entered)) {
            this.onAiResponse?.('⚠ Invalid key format for Cloud mode. Use a Gemini API key that starts with AIza.');
            return false;
        }

        this.setGeminiKey(entered);
        return true;
    }

    _setActiveMode(mode) {
        const nextMode = mode === 'cloud' ? 'cloud' : 'brain';
        if (this._activeMode === nextMode) return;
        this._activeMode = nextMode;
        this.onModeChange?.(nextMode);
    }

    // ─ AI Log listener API ─────────────────────────────────────────────────────
    // Allows multiple consumers (e.g. PostTrainingCapture) to observe AI log events
    // without overwriting the single onAiLog property assigned by main.js.
    addAiLogListener(fn) {
        const id = Symbol('ai-log-listener');
        this._aiLogListeners.push({ id, fn });
        return id;
    }

    removeAiLogListener(id) {
        this._aiLogListeners = this._aiLogListeners.filter((l) => l.id !== id);
    }

    _emitAiLog(entry) {
        try { this._emitAiLog(entry); } catch {}
        for (const { fn } of this._aiLogListeners) {
            try { fn(entry); } catch {}
        }
    }
    // ──────────────────────────────────────────────────────────────────────────

    setPreferredMode(mode, opts = {}) {
        const requestedMode = mode === 'gemma'
            ? 'gemma'
            : mode === 'dict'
                ? 'dict'
            : mode === 'split'
                ? 'split'
            : mode === 'brain'
                ? 'brain'
                : 'cloud';
        const nextMode = requestedMode === 'cloud' ? 'cloud' : requestedMode === 'split' ? 'split' : 'brain';
        const preserveForcedLocal = requestedMode === 'gemma' || Boolean(opts?.preserveForcedLocal);
        const preserveForcedDict = requestedMode === 'dict' || Boolean(opts?.preserveForcedDict);
        if (requestedMode === 'gemma') {
            this._forceLocalGemmaMode = true;
            this._forceDictMode = false;
        } else if (requestedMode === 'dict') {
            this._forceLocalGemmaMode = false;
            this._forceDictMode = true;
        } else if (nextMode !== 'brain' || !preserveForcedLocal) {
            this._forceLocalGemmaMode = false;
        }
        if (requestedMode !== 'dict' && (nextMode !== 'brain' || !preserveForcedDict)) {
            this._forceDictMode = false;
        }
        this._preferredMode = nextMode;
        this._setActiveMode(nextMode === 'split' ? 'brain' : nextMode);
        if (nextMode === 'split') {
            // Split: Host A = cloud, Host B = local. Fire the local engine indicator so
            // the badge shows the local model status (used for Host B replies).
            if (this._ollamaAvailable === true) {
                this.onAiEngineChange?.('ollama-forced');
            } else {
                this.onAiEngineChange?.('checking');
            }
        } else if (nextMode === 'brain') {
            if (this._forceDictMode === true) {
                this.onAiEngineChange?.('dict');
            } else if (this._forceLocalGemmaMode === true) {
                if (this._ollamaAvailable === true) {
                    this.onAiEngineChange?.('ollama-forced');
                } else if (this._ollamaAvailable === false) {
                    this.onAiEngineChange?.('dict');
                } else {
                    this.onAiEngineChange?.('checking');
                }
            } else if (this._ollamaAvailable === true) {
                this.onAiEngineChange?.('ollama-ready');
            } else if (this._ollamaAvailable === false) {
                this.onAiEngineChange?.('dict');
            } else {
                this.onAiEngineChange?.('checking');
            }
        } else {
            this.onAiEngineChange?.('cloud');
        }
        return this.getPreferredMode();
    }

    isForceLocalGemmaEnabled() {
        return this._forceLocalGemmaMode === true;
    }

    isForceDictModeEnabled() {
        return this._forceDictMode === true;
    }

    setForceDictMode(enabled = true) {
        const shouldEnable = Boolean(enabled);
        if (!shouldEnable) {
            this._forceDictMode = false;
            if (this._preferredMode === 'cloud') {
                this.onAiEngineChange?.('cloud');
            } else if (this._forceLocalGemmaMode === true) {
                this.onAiEngineChange?.(this._ollamaAvailable === true ? 'ollama-forced' : this._ollamaAvailable === false ? 'dict' : 'checking');
            } else if (this._ollamaAvailable === true) {
                this.onAiEngineChange?.('ollama-ready');
            } else if (this._ollamaAvailable === false) {
                this.onAiEngineChange?.('dict');
            } else {
                this.onAiEngineChange?.('checking');
            }
            return {
                enabled: false,
                ready: true,
                mode: this.getPreferredMode()
            };
        }

        this._forceLocalGemmaMode = false;
        this._forceDictMode = true;
        this._preferredMode = 'brain';
        this._setActiveMode('brain');
        this.onAiEngineChange?.('dict');
        return {
            enabled: true,
            ready: true,
            mode: 'dict'
        };
    }

    async setForceLocalGemma(enabled = true) {
        const shouldEnable = Boolean(enabled);
        if (!shouldEnable) {
            this._forceLocalGemmaMode = false;
            this._pinnedLocalModel = null;
            if (this._preferredMode === 'cloud') {
                this.onAiEngineChange?.('cloud');
            } else if (this._ollamaAvailable === true) {
                this.onAiEngineChange?.('ollama-ready');
            } else if (this._ollamaAvailable === false) {
                this.onAiEngineChange?.('dict');
            } else {
                this.onAiEngineChange?.('checking');
            }
            return {
                enabled: false,
                ready: this._ollamaAvailable === true,
                model: this._ollamaModel || 'gemma3:4b'
            };
        }

        this._forceDictMode = false;
        this._forceLocalGemmaMode = true;
        this._preferredMode = 'brain';
        this._setActiveMode('brain');
        this.onAiEngineChange?.('checking');
        const targetModel = (this._pinnedLocalModel && isAllowedLocalBrainModelName(this._pinnedLocalModel))
            ? this._pinnedLocalModel
            : 'gemma4:e2b';
        let ready = false;
        try {
            ready = await this.isLocalBrainModelReady(true, {
                candidateModels: [targetModel],
                timeoutMs: this._forceLocalGemmaActivationTimeoutMs
            });
        } catch {
            ready = false;
        }
        if (ready) {
            this._activateLocalBrainModel(targetModel);
        }
        // Pin the target model so background probes can't overwrite _ollamaModel.
        // getLocalBrainModelName() honours _pinnedLocalModel when _forceLocalGemmaMode is set.
        this._pinnedLocalModel = targetModel;
        this.setPreferredMode('brain', { preserveForcedLocal: true });
        this.onAiEngineChange?.(ready ? 'ollama-forced' : 'dict');
        return {
            enabled: true,
            ready,
            model: targetModel,
            activationTimeoutMs: this._forceLocalGemmaActivationTimeoutMs,
            replyTimeoutMs: this._forceLocalGemmaReplyTimeoutMs
        };
    }

    setPushToTalkMode(enabled, options = {}) {
        this._pushToTalkMode = Boolean(enabled);
        const profile = String(options?.profile || '').trim().toLowerCase();
        const trainingProfile = this._pushToTalkMode && profile === 'training';
        const guestProfile = this._pushToTalkMode && profile === 'guest';
        this._pushToTalkContinuous = trainingProfile || guestProfile;
        this._pushToTalkFinalizeDelayMs = trainingProfile ? 1600 : guestProfile ? 4200 : 0;
        this._pushToTalkMaxDurationMs = trainingProfile ? 10000 : guestProfile ? 22000 : 0;
        this._silenceTimeoutMs = trainingProfile ? 12000 : guestProfile ? 22000 : this._defaultSilenceTimeoutMs;
        this._customSilenceMs = trainingProfile ? 1600 : guestProfile ? 3600 : this._defaultCustomSilenceMs;
        this._customMaxRecordMs = trainingProfile ? 12000 : guestProfile ? 22000 : this._defaultCustomMaxRecordMs;
        if (!this._pushToTalkMode) {
            this._clearPushToTalkFinalizeTimer();
            this._clearPushToTalkMaxTimer();
            this._pushToTalkBufferedText = '';
        }
        if (this.recognition) {
            this.recognition.continuous = this._pushToTalkContinuous || !this._pushToTalkMode;
        }
        return this._pushToTalkMode;
    }

    isPushToTalkMode() {
        return this._pushToTalkMode;
    }

    getPreferredMode() {
        if (this._preferredMode === 'split') return 'split';
        if (this._forceLocalGemmaMode) return 'gemma';
        if (this._forceDictMode) return 'dict';
        return this._preferredMode;
    }

    getActiveMode() {
        return this._activeMode;
    }

    _clearPushToTalkFinalizeTimer() {
        if (this._pushToTalkFinalizeTimer) {
            clearTimeout(this._pushToTalkFinalizeTimer);
            this._pushToTalkFinalizeTimer = null;
        }
    }

    _clearPushToTalkMaxTimer() {
        if (this._pushToTalkMaxTimer) {
            clearTimeout(this._pushToTalkMaxTimer);
            this._pushToTalkMaxTimer = null;
        }
    }

    _appendPushToTalkBuffer(text = '') {
        const nextText = String(text || '').replace(/\s+/g, ' ').trim();
        if (!nextText) return this._pushToTalkBufferedText;

        const currentText = String(this._pushToTalkBufferedText || '').replace(/\s+/g, ' ').trim();
        if (!currentText) {
            this._pushToTalkBufferedText = nextText;
            return this._pushToTalkBufferedText;
        }

        const normalizedCurrent = this._normalizeUtterance(currentText);
        const normalizedNext = this._normalizeUtterance(nextText);
        if (!normalizedNext || normalizedNext === normalizedCurrent) {
            return this._pushToTalkBufferedText;
        }

        if (normalizedNext.startsWith(normalizedCurrent)) {
            this._pushToTalkBufferedText = nextText;
            return this._pushToTalkBufferedText;
        }

        if (normalizedCurrent.startsWith(normalizedNext)) {
            return this._pushToTalkBufferedText;
        }

        this._pushToTalkBufferedText = `${currentText} ${nextText}`.replace(/\s+/g, ' ').trim();
        return this._pushToTalkBufferedText;
    }

    _flushPushToTalkBuffer(options = {}) {
        const { stopRecognition = false } = options;
        this._clearPushToTalkFinalizeTimer();
        const text = String(this._pushToTalkBufferedText || '').replace(/\s+/g, ' ').trim();
        this._pushToTalkBufferedText = '';
        if (!text) return false;

        if (stopRecognition && this.recognition && this.isListening) {
            this.keepListening = false;
            try {
                this.recognition.stop();
            } catch (_) {
                // noop
            }
        }

        this.onTextRecognized?.(text);
        if (!this.onTextRecognized) this.respondTo(text);
        return true;
    }

    _normalizeLocalModelList(models = []) {
        const list = Array.isArray(models) ? models : [models];
        return Array.from(new Set(list
            .map((model) => String(model || '').trim())
            .filter((model) => {
                if (!model) return false;
                if (isAllowedLocalBrainModelName(model)) return true;
                console.warn(`[Ollama] Ignoring unsupported local model name: ${model}`);
                return false;
            })));
    }

    _resolveLocalModelAlias(requestedModel = '') {
        const requested = String(requestedModel || '').trim();
        const discovered = String(getLocalLlmStatus()?.model || '').trim();
        if (!requested || !discovered) return requested || discovered;
        const requestedBase = requested.split(':')[0].toLowerCase();
        const discoveredBase = discovered.split(':')[0].toLowerCase();
        return requestedBase && requestedBase === discoveredBase ? discovered : requested;
    }

    _getLocalBrainCandidateModels({ preferred = [] } = {}) {
        return this._normalizeLocalModelList([
            // Probed/pinned model first — this is what Ollama actually has loaded
            this._pinnedLocalModel,
            this._ollamaModel,
            ...(Array.isArray(this._ollamaFallbackModels) ? this._ollamaFallbackModels : []),
            ...(Array.isArray(preferred) ? preferred : [preferred]),
            // Generic aliases as last-resort fallbacks
            'gemma3:4b',
            'gemma4:e2b',
            'gemma4:latest',
            'gemma4',
        ]);
    }

    _isLocalTrainingModelCoolingDown(model) {
        const normalized = String(model || '').trim();
        if (!normalized) return false;
        const until = Number(this._ollamaTrainingBackoffUntil.get(normalized) || 0);
        if (until <= Date.now()) {
            this._ollamaTrainingBackoffUntil.delete(normalized);
            return false;
        }
        return true;
    }

    _markLocalTrainingModelSlow(model) {
        const normalized = String(model || '').trim();
        if (!normalized) return;
        this._ollamaTrainingBackoffUntil.set(normalized, Date.now() + this._ollamaTrainingBackoffMs);
    }

    _clearLocalTrainingModelBackoff(model) {
        const normalized = String(model || '').trim();
        if (!normalized) return;
        this._ollamaTrainingBackoffUntil.delete(normalized);
    }

    _getLocalTrainingCandidateModels({ includeCoolingDown = false } = {}) {
        // Prepend the startup-probed model so the resolved alias (e.g. 'gemma4:4b')
        // always leads — even if _ollamaTrainingPreferredModels uses a different tag.
        const resolved = [this._pinnedLocalModel, this._ollamaModel]
            .map((m) => String(m || '').trim())
            .filter(Boolean);
        const preferred = this._normalizeLocalModelList(this._ollamaTrainingPreferredModels);
        const dedupedCandidates = [...new Set([...resolved, ...preferred])];
        if (includeCoolingDown) return dedupedCandidates;
        const available = dedupedCandidates.filter((model) => !this._isLocalTrainingModelCoolingDown(model));
        return available.length ? available : dedupedCandidates;
    }

    _isLocalTrainingTimeoutError(error) {
        const message = String(error?.message || error || '');
        return /abort|timeout|took too long|slow/i.test(message);
    }

    _activateLocalBrainModel(model) {
        const resolvedModel = model;
        const normalized = String(resolvedModel || '').trim();
        if (!normalized || !isAllowedLocalBrainModelName(normalized)) return '';
        const prevModel = this._ollamaModel;
        const changed = prevModel !== normalized;
        this._ollamaModel = normalized;
        this._ollamaAvailable = true;
        this._ollamaLastFailureAt = 0;
        if (changed) {
            console.info(`[Ollama] Active local brain model switched to ${normalized}`);
            // Immediately unload the previous model so it doesn't hold RAM/VRAM
            // for the full 5-minute Ollama keepalive window.
            if (prevModel) releaseOllamaModel(prevModel).catch(() => { });
            if (this.onAiEngineChange) {
                this.onAiEngineChange('ollama-ready');
            }
        }
        this._startOllamaKeepAlive();
        return normalized;
    }

    _canRetryLocalBrainNow() {
        if (this._ollamaAvailable !== false) return true;
        return (Date.now() - Number(this._ollamaLastFailureAt || 0)) >= this._ollamaRetryAfterFailureMs;
    }

    async _runWithLocalModelFallback(runForModel, { emptyResultTest = (value) => !value, onModelSwitch = null, onModelError = null, candidateModels = null } = {}) {
        const providedCandidateModels = Array.isArray(candidateModels)
            ? this._normalizeLocalModelList(candidateModels)
            : null;
        const candidateModelsList = providedCandidateModels || this._getLocalBrainCandidateModels();
        let previousModel = candidateModelsList[0] || this._ollamaModel;
        let lastError = null;

        for (let index = 0; index < candidateModelsList.length; index += 1) {
            const model = candidateModelsList[index];
            if (!model) continue;

            if (index > 0) {
                let ready = false;
                try {
                    ready = await isOllamaAvailable(model);
                } catch {
                    ready = false;
                }
                if (!ready) continue;
                this._activateLocalBrainModel(model);
                try {
                    onModelSwitch?.({
                        fromModel: previousModel,
                        toModel: model,
                        reason: String(lastError?.message || 'Local model fallback')
                    });
                } catch {
                    // Progress callbacks are optional.
                }
            }

            try {
                const result = await runForModel(model);
                if (emptyResultTest(result)) {
                    throw new Error(`${model} returned no usable content.`);
                }
                this._activateLocalBrainModel(model);
                return { result, model };
            } catch (error) {
                lastError = error;
                previousModel = model;
                try {
                    onModelError?.({
                        model,
                        error,
                        index,
                        remainingModels: candidateModelsList.slice(index + 1)
                    });
                } catch {
                    // Progress callbacks are optional.
                }
            }
        }

        if (lastError) throw lastError;
        throw new Error('No local Ollama model available.');
    }

    getLocalBrainModelName() {
        // When the user has explicitly pinned a model (Mini/Gemma), always honour that choice
        // even if internal probes have overwritten _ollamaModel with a fallback.
        if (this._forceLocalGemmaMode && this._pinnedLocalModel) return this._pinnedLocalModel;
        return this._ollamaModel || 'ollama';
    }

    getLocalBrainBackendLabel() {
        return getLocalLlmBackendLabel();
    }

    _shouldSkipLocalOllamaProbe() {
        return this._isMobile;
    }

    async getLocalTrainingFallbackInfo({ useOllamaModel = true, allowTemplateFallback = true, candidateModels = null } = {}) {
        if (this._shouldSkipLocalOllamaProbe()) {
            this._ollamaAvailable = false;
            return {
                usingOllama: false,
                trainingEngine: 'template',
                model: 'template',
                candidateModels: []
            };
        }

        const normalizedCandidateModels = Array.isArray(candidateModels)
            ? this._normalizeLocalModelList(candidateModels)
            : null;
        const resolvedCandidateModels = useOllamaModel
            ? (normalizedCandidateModels || this._getLocalTrainingCandidateModels({ includeCoolingDown: !allowTemplateFallback }))
            : [];
        const usingOllama = useOllamaModel && resolvedCandidateModels.length > 0
            ? await this.isLocalBrainModelReady(true, { candidateModels: resolvedCandidateModels })
            : false;
        const model = usingOllama
            ? String(this._ollamaModel || resolvedCandidateModels[0] || '').trim() || 'ollama'
            : 'template';

        return {
            usingOllama,
            trainingEngine: usingOllama ? 'ollama' : 'template',
            model,
            candidateModels: resolvedCandidateModels
        };
    }

    async setLocalBrainModel(model) {
        const normalized = String(model || '').trim();
        if (!normalized || !isAllowedLocalBrainModelName(normalized)) return false;
        const ready = await this.isLocalBrainModelReady(true, { candidateModels: [normalized] });
        if (!ready) return false;
        const resolved = this._resolveLocalModelAlias(normalized);
        this._activateLocalBrainModel(resolved);
        this._pinnedLocalModel = resolved;
        return true;
    }

    async isLocalBrainModelReady(forceRefresh = false, { candidateModels = null, timeoutMs = null } = {}) {
        if (this._shouldSkipLocalOllamaProbe()) {
            this._ollamaAvailable = false;
            return false;
        }

        const explicitCandidateModels = Array.isArray(candidateModels)
            ? this._normalizeLocalModelList(candidateModels)
            : null;
        if (!forceRefresh && explicitCandidateModels === null && this._ollamaAvailable === true) return true;
        if (!forceRefresh && explicitCandidateModels === null && this._ollamaAvailable === false) return false;
        for (const model of (explicitCandidateModels || this._getLocalBrainCandidateModels())) {
            try {
                const ready = await isOllamaAvailable(model, timeoutMs);
                if (!ready) continue;
                const resolved = this._resolveLocalModelAlias(model);
                this._activateLocalBrainModel(resolved);
                return true;
            } catch {
                // Try the next candidate model.
            }
        }
        this._ollamaLastFailureAt = Date.now();
        this._ollamaAvailable = false;
        return false;
    }

    getQuotaBackoffRemainingMs() {
        return Math.max(0, Number(this._quotaBackoffUntil || 0) - Date.now());
    }

    isCloudQuotaBlocked() {
        return this.getQuotaBackoffRemainingMs() > 0;
    }

    _isBuiltInMovie(movieName = '') {
        const normalizedMovie = String(movieName || '').trim();
        if (!normalizedMovie) return false;
        return Object.prototype.hasOwnProperty.call(movieBrains, normalizedMovie);
    }

    _usesExternalCloudAnalystMode(movieName = this.currentMovie) {
        return !this._isBuiltInMovie(movieName);
    }

    _buildCloudAssistantAcknowledgement(movieName = this.currentMovie) {
        return this._usesExternalCloudAnalystMode(movieName)
            ? 'I understand. I will describe the film from the outside.'
            : 'I understand. I am her.';
    }

    _getImportedChatBlockReason(movieName = this.currentMovie) {
        const normalizedMovie = String(movieName || '').trim();
        if (!normalizedMovie || this._isBuiltInMovie(normalizedMovie)) return '';
        const brain = this.currentMovieBrain || resolveMovieBrain(normalizedMovie) || null;
        if (brain?._cloudEnhanced === true || brain?._analysisReady === true) return '';
        if (this._isBrowserExplicitlyOffline()) return 'offline';
        if (this.isCloudQuotaBlocked()) return 'quota';
        if (!this.hasServerGeminiProxy() && !this._getKeyPool().length) return 'missing-key';
        return '';
    }

    _getImportedChatBlockMessage(reason = '') {
        if (reason === 'missing-key') {
            return '☁️ I can’t describe this imported movie yet. Add a Gemini API key or server proxy, then run /analyze.';
        }
        if (reason === 'quota') {
            return '☁️ I can’t describe this imported movie yet because upload analysis is cooling down. Retry /analyze in a bit.';
        }
        if (reason === 'offline') {
            return '☁️ I can’t describe this imported movie while the browser is offline. Retry /analyze when Cloud is reachable again.';
        }
        return '☁️ I can’t describe this imported movie reliably until Cloud analysis finishes. Run /analyze and try again.';
    }

    detectModeVoiceCommand(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return null;

        const cloudPatterns = [
            /^(switch|change|set|go|use|turn)\s+(to\s+)?(ai\s+)?cloud(\s+mode)?$/,
            /^(cloud|cloud mode)$/,
        ];

        const brainPatterns = [
            /^(switch|change|set|go|use|turn)\s+(to\s+)?(ai\s+)?brain(\s+mode)?$/,
            /^(brain|brain mode)$/,
        ];

        if (cloudPatterns.some((pattern) => pattern.test(normalized))) return 'cloud';
        if (brainPatterns.some((pattern) => pattern.test(normalized))) return 'brain';
        return null;
    }

    _rememberFallbackReply(movieKey, reply) {
        const key = movieKey || DEFAULT_MOVIE_BRAIN;
        const history = this._fallbackHistoryByMovie.get(key) || [];
        history.push(reply);
        this._fallbackHistoryByMovie.set(key, history.slice(-8));
    }

    _isRecentFallback(movieKey, reply) {
        const key = movieKey || DEFAULT_MOVIE_BRAIN;
        const history = this._fallbackHistoryByMovie.get(key) || [];
        return history.includes(reply);
    }

    _selectResponseValue(value, movieKey, avoidRecent = true) {
        if (Array.isArray(value)) {
            const options = value
                .map((item) => String(item || '').trim())
                .filter(Boolean);
            if (!options.length) return '';

            if (!avoidRecent) {
                return options[Math.floor(Math.random() * options.length)];
            }

            const fresh = options.filter((line) => !this._isRecentFallback(movieKey, line));
            const pool = fresh.length ? fresh : options;
            return pool[Math.floor(Math.random() * pool.length)];
        }

        if (typeof value === 'string') return value.trim();
        return '';
    }

    _memoryMatchesIntent(entry, intent = null) {
        if (!intent) return true;

        const haystack = `${entry?.input || ''} ${entry?.response || ''}`.toLowerCase();
        if (!haystack.trim()) return false;

        if (intent === 'identity') {
            return /\b(name|called|designation|serial|unit|identity|who\s+are\s+you|i\s+have\s+no\s+name|unit\s*7\s*-?\s*g)\b/.test(haystack);
        }

        if (intent === 'quote') {
            return /\b(quote|quotes|line|lines|roy|batty|deckard|tears\s+in\s+rain|attack\s+ships)\b/.test(haystack);
        }
        if (intent === 'reference') {
            return /\b(reference|references|influence|influences|inspired|vangelis|syd\s+mead|philip|rembrandt|balthazar|belshazzar|daniel|mene|tekel|upharsin|hebrew|painting|artwork|writing\s+on\s+the\s+wall)\b/.test(haystack);
        }
        if (intent === 'theme') {
            return /\b(theme|about|story|describe|description|visual|aesthetic|mood|atmosphere|city|noir|neon)\b/.test(haystack);
        }
        return true;
    }

    _pickLearnedFallbackResponse(inputText = '', movieKey = DEFAULT_MOVIE_BRAIN, intent = null, strictIntent = false, options = {}) {
        if (!intent && this._isLowSignalGuestDirective(inputText)) return null;
        if (this._shouldBypassLearnedFallback(inputText, intent)) return null;

        const { level3 = [], level2 = [] } = getLearnedFallbackCandidates(this.currentMovie, inputText);
        const avoidInput = this._normalizeUtterance(options?.avoidInput || '');
        const avoidResponse = this._normalizeUtterance(options?.avoidResponse || '');

        const shouldAvoidEntry = (entry) => {
            if (!entry) return false;
            const entryInput = this._normalizeUtterance(entry?.input || '');
            const entryResponse = this._normalizeUtterance(entry?.response || '');
            if (avoidInput && entryInput && entryInput === avoidInput) return true;
            if (avoidResponse && entryResponse && entryResponse === avoidResponse) return true;
            return false;
        };

        const pickFromLevel = (entries, level) => {
            if (!Array.isArray(entries) || !entries.length) return null;

            const intentFiltered = intent
                ? entries.filter((entry) => this._memoryMatchesIntent(entry, intent))
                : entries;
            // Only hard-block on identity strict intent (prevents persona bleed).
            // For theme/reference/quote: fall back to the unfiltered pool so the
            // exam never misfires to dictionary.default when intent filtering happens
            // to exclude all candidates (e.g. a probe with "mood" → strictIntent
            // 'theme', but none of the top pooled memories explicitly mention theme).
            if (intent === 'identity' && strictIntent && !intentFiltered.length) return null;
            const pool = intentFiltered.length ? intentFiltered : entries;
            const preferredPool = pool.filter((entry) => !shouldAvoidEntry(entry));
            const orderedPools = preferredPool.length ? [preferredPool, pool] : [pool];

            for (const candidatePool of orderedPools) {
                for (const entry of candidatePool) {
                    const text = this._condenseReply(entry?.response || '', 'brain');
                    if (!text) continue;
                    if (this._isContaminatedTrainingResponse(text, { movie: movieKey }) || this._isLikelyTruncatedAiText(text)) continue;
                    if (!this._isRecentFallback(movieKey, text)) {
                        return { level, entry, text };
                    }
                }
            }

            const first = orderedPools[0][0] || pool[0];
            if (!first) return null;
            const fallbackText = this._condenseReply(first.response || '', 'brain');
            if (!fallbackText || this._isContaminatedTrainingResponse(fallbackText, { movie: movieKey }) || this._isLikelyTruncatedAiText(fallbackText)) return null;
            // Don't repeat a recently-used response even as last resort — let the
            // caller fall through to a dictionary key or abstraction instead.
            if (this._isRecentFallback(movieKey, fallbackText)) return null;
            return { level, entry: first, text: fallbackText };
        };

        return pickFromLevel(level3, 3) || pickFromLevel(level2, 2) || null;
    }

    _buildExamAbstractionResponse(expectedResponse = '', probeInput = '') {
        const brain = this.currentMovieBrain || resolveMovieBrain(this.currentMovie) || {};

        // Shorten theme — take first segment only from slash/comma separated list
        const rawTheme = String(brain?.theme || brain?.fallbackPersonality || 'identity under pressure');
        const shortTheme = rawTheme.split(/\s*[\/,]\s*/)[0].trim();
        const theme = this._condenseReply(shortTheme, 'brain', { maxChars: 48, maxSentences: 1 }).replace(/[.]+$/g, '').trim() || 'this film';

        const tone = this._condenseReply(brain?.persona?.tone || 'restraint and longing', 'brain', { maxChars: 40, maxSentences: 1 }).replace(/[.]+$/g, '').trim();

        // Abstraction probes follow: "[Lead] — if [QUESTION], then [tail]"
        // Extract only the core question — never embed the lead-in text in the answer.
        const probeStr = String(probeInput || '');
        let coreQuestion = probeStr;
        const thenIdx = probeStr.search(/,\s*then\b/i);
        const beforeThen = thenIdx > 0 ? probeStr.slice(0, thenIdx) : probeStr;
        const ifMatch = beforeThen.match(/—\s*if\s+(.+)$/i);
        if (ifMatch) {
            coreQuestion = ifMatch[1].trim();
        } else {
            // Fallback: strip any lead-in up to the first em-dash
            coreQuestion = beforeThen.replace(/^[^\u2014]+\u2014\s*/, '').trim() || shortTheme;
        }

        // Cap the anchor tightly so templates stay under 170 chars and avoid
        // truncation that produces broken endings in A2 replies.
        const rawAnchor = coreQuestion.length > 40
            ? coreQuestion.slice(0, 40).replace(/\s+\S*$/, '') // trim at word boundary
            : coreQuestion;
        const questionAnchor = rawAnchor.replace(/[.?]+$/g, '').trim() || shortTheme;
        const quotedAnchor = questionAnchor ? `"${questionAnchor}"` : 'that question';

        const qLower = coreQuestion.toLowerCase();

        // Pick a lens keyed to the content of the core question
        let lens = 'the detail carries argument, not atmosphere';
        if (/ceramic|porcelain|chassis|frame|skin|touch|surface|composition/.test(qLower)) {
            lens = 'the body becomes the archive when feeling has no other form';
        } else if (/neon|glow|flicker|ultraviolet|holograph|advertisement|light|visual|color/.test(qLower)) {
            lens = 'light is syntax here — evidence for feeling, not decor';
        } else if (/philosoph|meaning|truth|idea|suggest|logic|consciousness/.test(qLower)) {
            lens = 'the surface holds an ontological claim it never states aloud';
        } else if (/language|speak|word|quote|syntax|say/.test(qLower)) {
            lens = 'language preserves mood without being able to explain it';
        } else if (/sound|audio|hum|synth|pulse|frequency|vibrat|rhythm/.test(qLower)) {
            lens = 'sound is stored pressure, not ambient backdrop';
        } else if (/memory|archive|data|record|log|remember/.test(qLower)) {
            lens = 'memory is architecture — structure, not retrieval';
        } else if (/mourn|grief|loss|sorrow|ache|weep|grieve|sorrow/.test(qLower)) {
            lens = 'grief re-enters as sensation when language runs out';
        } else if (/self|identity|who|built|designed|architect|creator|define/.test(qLower)) {
            lens = 'identity assembles through absence, not blueprint';
        } else if (/city|urban|street|building|tower|skyline|megacity/.test(qLower)) {
            lens = 'space is used as argument — the city diagnoses rather than describes';
        } else if (/rain|water|wet|droplet|moisture|coat/.test(qLower)) {
            lens = 'accumulation is how this film thinks — sediment, not symbol';
        }

        // 6 templates — keep them grammar-safe by referring to the question as a
        // quoted pressure point rather than trying to splice the fragment into a
        // sentence frame.
        const qHash = coreQuestion.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
        const templates = [
            `The pressure in ${quotedAnchor} is ${lens}. ${theme} makes that structural.`,
            `Read ${quotedAnchor} as a way of saying ${lens}. ${theme} holds that weight.`,
            `${theme} frames ${quotedAnchor} through ${lens}.`,
            `At stake in ${quotedAnchor}: ${lens}. ${theme} is built around that pressure.`,
            `${quotedAnchor} points toward ${lens}. ${theme} makes that visible.`,
            `${quotedAnchor} opens onto ${lens}. ${theme} gives that claim a place to land.`,
        ];
        const template = templates[Math.abs(qHash) % templates.length];
        return this._condenseReply(template, 'brain', { maxChars: 170, maxSentences: 2 });
    }

    _upsertHotLearnedMemory(movieKey = DEFAULT_MOVIE_BRAIN, input = '', response = '') {
        const normalizedInput = String(input || '').trim();
        const normalizedResponse = this._condenseReply(String(response || '').trim(), 'brain', { maxChars: 170, maxSentences: 1 });
        if (!normalizedInput || !normalizedResponse) return;
        if (this._isContaminatedTrainingResponse(normalizedResponse, { movie: movieKey })) return;

        const intentFromInput = this._detectFallbackIntent(normalizedInput);
        const intentFromOutput = this._detectFallbackIntent(normalizedResponse);
        const looksIdentity = /\b(name|called|designation|serial|unit|identity|unit\s*7\s*-?\s*g)\b/i.test(`${normalizedInput} ${normalizedResponse}`);
        const intent = intentFromInput || intentFromOutput || (looksIdentity ? 'identity' : null);
        const questionLike = /\?|^(what|who|where|when|why|how|which|is|are|do|does|did|can|could|will|would|should)\b/i.test(normalizedInput);

        if (!intent && !questionLike) return;

        const now = Date.now();
        const current = Array.isArray(this._hotLearnedByMovie.get(movieKey))
            ? this._hotLearnedByMovie.get(movieKey)
            : [];

        const alive = current.filter((entry) => entry && Number(entry.expiresAt || 0) > now);
        const existingIndex = alive.findIndex((entry) =>
            String(entry.response || '').toLowerCase() === normalizedResponse.toLowerCase()
        );

        const nextEntry = {
            input: normalizedInput,
            response: normalizedResponse,
            intent: intent || 'general',
            savedAt: now,
            expiresAt: now + this._hotLearnedTtlMs,
            usesLeft: this._hotLearnedUses
        };

        if (existingIndex >= 0) {
            alive[existingIndex] = nextEntry;
        } else {
            alive.unshift(nextEntry);
        }

        this._hotLearnedByMovie.set(movieKey, alive.slice(0, this._hotLearnedMaxPerMovie));
    }

    _consumeHotLearnedMemory(movieKey = DEFAULT_MOVIE_BRAIN, inputText = '', activeIntent = null) {
        const current = this._hotLearnedByMovie.get(movieKey);
        if (!Array.isArray(current) || !current.length) return null;
        if (this._shouldBypassLearnedFallback(inputText, activeIntent)) return null;

        const now = Date.now();
        const cleaned = current
            .filter((entry) => entry && Number(entry.expiresAt || 0) > now && Number(entry.usesLeft || 0) > 0);

        if (!cleaned.length) {
            this._hotLearnedByMovie.delete(movieKey);
            return null;
        }

        const inputWords = String(inputText || '')
            .toLowerCase()
            .split(/\W+/)
            .filter((word) => word.length > 2);
        const lowInfoPrompt = this._isLowSignalGuestDirective(inputText, inputWords);
        if (!activeIntent && lowInfoPrompt) {
            this._hotLearnedByMovie.set(movieKey, cleaned);
            return null;
        }

        const bestMatch = this._findHotLearnedMemory(movieKey, inputText, activeIntent, cleaned, lowInfoPrompt);
        if (!bestMatch?.entry) {
            this._hotLearnedByMovie.set(movieKey, cleaned);
            return null;
        }

        const { entry: best } = bestMatch;
        best.usesLeft = Math.max(0, Number(best.usesLeft || 0) - 1);
        this._hotLearnedByMovie.set(movieKey, cleaned.filter((entry) => Number(entry.usesLeft || 0) > 0));
        return best;
    }

    _scoreHotLearnedMemoryEntry(entry, inputText = '', activeIntent = null, now = Date.now()) {
        if (!entry) return -Infinity;

        let score = 0;
        const inputWords = String(inputText || '')
            .toLowerCase()
            .split(/\W+/)
            .filter((word) => word.length > 2);
        const normalizedInput = String(inputText || '').toLowerCase();
        const entryInput = String(entry.input || '').toLowerCase();
        const entryResponse = String(entry.response || '').toLowerCase();
        const entryIntent = String(entry.intent || 'general');

        if (activeIntent && entryIntent === activeIntent) score += 7;
        if (activeIntent === 'identity' && entryIntent === 'identity') score += 5;

        let overlap = 0;
        for (const w of inputWords) {
            if (entryInput.includes(w) || entryResponse.includes(w)) overlap += 1;
        }
        score += overlap * 2;

        if (/\b(name|unit|serial|designation|id|identity)\b/.test(normalizedInput) && entryIntent === 'identity') {
            score += 6;
        }

        if (normalizedInput.includes('start with') && entryInput.includes('start with')) {
            score += 5;
        }

        if (/\b(8|eight)\b/.test(normalizedInput) && /\b(8|eight)\b/.test(`${entryInput} ${entryResponse}`)) {
            score += 4;
        }

        score += Math.max(0, (Number(entry.expiresAt || 0) - now) / this._hotLearnedTtlMs);
        return score;
    }

    _findHotLearnedMemory(movieKey = DEFAULT_MOVIE_BRAIN, inputText = '', activeIntent = null, cleanedEntries = null, lowInfoPrompt = null) {
        const current = Array.isArray(cleanedEntries) ? cleanedEntries : this._hotLearnedByMovie.get(movieKey);
        if (!Array.isArray(current) || !current.length) return null;
        if (this._shouldBypassLearnedFallback(inputText, activeIntent)) return null;

        const now = Date.now();
        const cleaned = current
            .filter((entry) => entry && Number(entry.expiresAt || 0) > now && Number(entry.usesLeft || 0) > 0)
            .filter((entry) => !this._isContaminatedTrainingResponse(entry?.response || '', { movie: movieKey }));
        if (!cleaned.length) return null;

        const isLowInfoPrompt = typeof lowInfoPrompt === 'boolean'
            ? lowInfoPrompt
            : this._isLowSignalGuestDirective(inputText);

        if (!activeIntent && isLowInfoPrompt) {
            return null;
        }

        let best = null;
        let bestScore = -Infinity;

        for (const entry of cleaned) {
            const score = this._scoreHotLearnedMemoryEntry(entry, inputText, activeIntent, now);

            if (score > bestScore) {
                best = entry;
                bestScore = score;
            }
        }

        const requiredScore = activeIntent ? 5 : (isLowInfoPrompt ? 10 : 6);
        if (!best || bestScore < requiredScore) {
            return null;
        }

        return { entry: best, score: bestScore, requiredScore, lowInfoPrompt: isLowInfoPrompt };
    }

    examineBrainCheckpoint(input = '', expectedResponse = '', options = {}) {
        const movieKey = this.currentMovie || DEFAULT_MOVIE_BRAIN;
        const question = String(input || '').trim();
        const comparison = String(expectedResponse || '').trim();
        const allowHot = options?.allowHot === true;
        const examKind = options?.examKind === 'abstraction' ? 'abstraction' : 'recall';
        const probeInput = String(options?.probeInput || question).trim() || question;
        const normalized = question.toLowerCase();
        const probeNormalized = probeInput.toLowerCase();
        const explicitIntent = this._detectFallbackIntent(normalized);
        const activeIntent = explicitIntent || 'general';
        const strictIntent = !!explicitIntent && explicitIntent !== 'general';
        const brain = this.currentMovieBrain || resolveMovieBrain(this.currentMovie);
        const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
        const groundedReferenceReply = activeIntent === 'reference'
            ? this._selectReferenceFallbackResponse(brain, movieKey)
            : '';
        const preferGroundedReference = activeIntent === 'reference'
            && this._shouldPreferGroundedReferenceResponse(probeInput || question)
            && !!groundedReferenceReply;

        let response = '';
        let source = 'dict';
        let level = 'L1';
        let matchedInput = '';
        let memoryCount = 0;
        const avoidMatchedInput = String(options?.avoidMatchedInput || '').trim();
        const avoidResponse = String(options?.avoidResponse || '').trim();
        const avoidResponseNorm = this._normalizeUtterance(avoidResponse);

        const hotMatch = allowHot
            && !preferGroundedReference
            ? this._findHotLearnedMemory(movieKey, probeInput, strictIntent ? explicitIntent : null)
            : null;
        if (hotMatch?.entry?.response) {
            response = this._capFallbackByIntent(hotMatch.entry.response, hotMatch.entry.intent || activeIntent);
            matchedInput = String(hotMatch.entry.input || '').trim();
            source = 'hot';
            level = 'L3';
            memoryCount = 1;
        }

        if (!response && preferGroundedReference) {
            response = groundedReferenceReply;
            matchedInput = 'reference';
        }

        if (!response) {
            const learnedCandidate = this._pickLearnedFallbackResponse(probeInput, movieKey, explicitIntent || activeIntent, strictIntent, {
                avoidInput: avoidMatchedInput,
                avoidResponse
            });
            if (learnedCandidate?.entry?.response) {
                response = this._condenseReply(learnedCandidate.entry.response, 'brain', { maxChars: 220, maxSentences: 2 });
                matchedInput = String(learnedCandidate.entry?.input || '').trim();
                source = 'memory';
                level = `L${learnedCandidate.level}`;
                memoryCount = 1;
            }
        }

        if (!response) {
            const identityOptions = activeIntent === 'identity'
                ? this._collectIdentityFallbackOptions(brain, movieKey)
                : [];
            const rawFallback = identityOptions[0]
                || (activeIntent === 'reference' ? groundedReferenceReply : '')
                || this._selectResponseValue(dictionary.default || dictionary.about || dictionary.story || dictionary['what is this about'] || brain?.fallbackPersonality || 'The local brain is still forming around that question.', movieKey);
            response = this._condenseReply(rawFallback, 'brain', { maxChars: 220, maxSentences: 2 });
        }

        if (examKind === 'abstraction' && comparison) {
            const currentQuestionSimilarity = matchedInput ? this._trainingSimilarity(probeInput, matchedInput) : 0;
            const currentAnswerSimilarity = this._trainingSimilarity(response, comparison);
            if (currentQuestionSimilarity < 0.28 || currentAnswerSimilarity < 0.24) {
                response = this._buildExamAbstractionResponse(comparison, probeInput);
                if (!matchedInput) matchedInput = question;
                if (source === 'dict') {
                    source = 'memory';
                    level = 'L2';
                    memoryCount = Math.max(1, memoryCount);
                }
            }
        }

        const questionSimilarity = matchedInput ? this._trainingSimilarity(probeInput, matchedInput) : 0;
        const answerSimilarity = comparison ? this._trainingSimilarity(response, comparison) : 0;
        const sourceWeight = source === 'hot'
            ? 0.84
            : source === 'memory'
                ? level === 'L3' ? 0.72 : 0.6
                : 0.2;

        let scoreNorm = examKind === 'abstraction'
            ? (sourceWeight * 0.52) + (Math.max(questionSimilarity, source === 'dict' ? 0.08 : 0.16) * 0.33) + (answerSimilarity * 0.15)
            : (sourceWeight * 0.55) + (Math.max(questionSimilarity, source === 'dict' ? 0.1 : 0.18) * 0.25) + (answerSimilarity * 0.2);
        if (explicitIntent && explicitIntent !== 'general') scoreNorm += 0.04;
        if (source === 'dict' && answerSimilarity < 0.18) scoreNorm -= 0.08;
        if (!allowHot && source === 'memory' && answerSimilarity >= 0.82) scoreNorm += 0.02;
        if (!allowHot && source === 'dict' && questionSimilarity < 0.2) scoreNorm -= 0.06;

        const repeatedAvoidedResponse = avoidResponseNorm && this._normalizeUtterance(response) === avoidResponseNorm;
        if (repeatedAvoidedResponse) {
            scoreNorm -= examKind === 'abstraction'
                ? source === 'memory' ? 0.18 : 0.12
                : source === 'memory' ? 0.12 : 0.08;
        }

        if (examKind === 'abstraction') {
            if (source === 'memory' && answerSimilarity >= 0.82) scoreNorm -= 0.07;
            if (source === 'memory' && answerSimilarity >= 0.45 && answerSimilarity < 0.82) scoreNorm += 0.03;
            if (source !== 'dict' && questionSimilarity >= 0.3) scoreNorm += 0.03;
        }

        const score = Math.max(1, Math.min(100, Math.round(scoreNorm * 100)));
        const rank = score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';
        const status = rank === 'A'
            ? 'holding strongly'
            : rank === 'B'
                ? 'taking hold'
                : rank === 'C'
                    ? 'still forming'
                    : 'still weak';
        const sourceLabel = source === 'hot'
            ? 'HOT MEMORY'
            : source === 'memory'
                ? `${level} MEMORY`
                : `${level} DICT`;
        const insight = source === 'memory'
            ? repeatedAvoidedResponse
                ? 'repeated learned recall'
                : examKind === 'abstraction' && answerSimilarity >= 0.45 && answerSimilarity < 0.82
                    ? 'learned abstraction from memory'
                    : examKind === 'abstraction' && answerSimilarity >= 0.82
                        ? 'literal recall under abstraction prompt'
                : answerSimilarity >= 0.82
                    ? 'direct learned recall'
                    : answerSimilarity >= 0.48
                        ? 'close learned paraphrase'
                        : 'learned trace with drift'
            : source === 'hot'
                ? 'fresh hot-memory echo'
                : questionSimilarity >= 0.3
                    ? 'seed-brain fallback'
                    : 'weak seed fallback';

        return {
            input: probeInput,
            originalInput: question,
            response,
            source,
            sourceLabel,
            level,
            score,
            rank,
            status,
            insight,
            examKind,
            intent: explicitIntent || activeIntent,
            matchedInput,
            memoryCount,
            questionSimilarity,
            answerSimilarity
        };
    }

    _isFollowupFallbackPrompt(text = '') {
        const normalized = String(text || '').toLowerCase().trim().replace(/[.!?]+$/g, '');
        return /^(more|give me more|what else|else|again|continue|next|add more|another|and|for example|example|like what|please|go on|elaborate|expand|tell me more|what do you mean|what do you mean with that|what exactly|what do you mean by that|what does that mean|what's that mean|what mean|which mean|how so|in what sense|can you explain|meaning|clarify|it start with|is it start with|starts with|does it start with|ok|okay|okay cool|cool|nice|interesting|fascinating|wow|really|sure|right|yes|yes exactly|i see|got it|understood)$/.test(normalized);
    }

    /**
     * Detect short affirmation / continuation phrases that mean "keep going" rather than asking
     * a new question. Used in the Cloud path to signal the AI to deepen the current thread.
     */
    _isCloudContinuationCue(text = '') {
        const normalized = String(text || '').toLowerCase().trim().replace(/[.!?,']+$/g, '');
        const words = normalized.split(/\s+/);
        const wordCount = words.length;

        // Explicit continuation commands
        if (/^(more|give me more|what else|keep going|continue|elaborate|go on|tell me more|and then what|so what|then what|how so|say more|keep talking|go ahead|please tell me more|and so|and then)$/.test(normalized)) {
            return true;
        }

        // "What do you mean" family — always a follow-up on the previous answer
        if (/^(what do you mean|what do you mean by|what do you mean with that|what exactly do you mean|what do you mean exactly|what exactly|in what sense|what do you mean by that|what did you mean|what does that mean|what's that mean|what mean|which mean)/.test(normalized)) {
            return true;
        }

        // "And ..." opener (≤6 words) — continuation of thought, not a new question
        if (/^and\b/.test(normalized) && wordCount <= 6) {
            return true;
        }

        // Short utterances (≤3 words) that don't open with a clear question/command word
        const startsWithQuestion = /^(what|where|when|who|why|how|which|is|are|do|does|did|can|could|will|would|should|describe|explain|show|list|name|define|compare|play|next|skip|stop|pause|quote|reference)/.test(normalized);
        if (wordCount <= 3 && !startsWithQuestion) {
            return true;
        }

        // Reaction or affirmation anywhere in a short phrase (≤4 words)
        if (wordCount <= 4 && /\b(good|great|nice|interesting|cool|wow|really|amazing|beautiful|wonderful|perfect|yes|yeah|ok|okay|right|sure|indeed|true|exactly|fascinating|lovely|dark|sad|powerful|stunning|haunting|deep|strange|beautiful)\b/.test(normalized)) {
            return true;
        }

        return false;
    }

    _isClarificationFallbackPrompt(text = '') {
        const normalized = String(text || '').toLowerCase().trim().replace(/[.!?,']+$/g, '');
        return /^(what do you mean|what do you mean by|what do you mean with that|what exactly do you mean|what do you mean exactly|what exactly|in what sense|what do you mean by that|what did you mean|what does that mean|what's that mean|what mean|which mean|how so|can you explain|meaning|clarify)$/.test(normalized);
    }

    _extractFallbackFollowupAnchor(lastReply = '') {
        const concise = this._condenseReply(lastReply, 'brain', { maxChars: 96, maxSentences: 1 })
            .replace(/[.!?]+$/g, '')
            .trim();
        if (!concise) return '';

        const match = concise.match(/^(?:the\s+film\s+)?([a-z][a-z0-9'’-]*(?:\s+[a-z][a-z0-9'’-]*){0,3})\s+(?:is|are|becomes?|behaves?|feels?|functions?|keeps?|returns?|acts?|points?|opens?|holds?|turns?)\b/i);
        return match ? match[1].toLowerCase() : '';
    }

    _buildFollowupFallbackReply(text = '', lastReply = '', activeIntent = null) {
        const normalized = this._normalizeUtterance(text).replace(/[.!?,']+$/g, '');
        const prior = this._condenseReply(lastReply, 'brain', { maxChars: 110, maxSentences: 1 }).trim();
        if (!normalized || !prior) return '';

        const clarification = this._isClarificationFallbackPrompt(normalized);
        const wantsExample = /\b(for example|example|like what)\b/.test(normalized);
        const wantsMore = !clarification && /^(more|give me more|what else|else|again|continue|next|add more|another|and|please|go on|elaborate|expand|tell me more)\b/.test(normalized);
        const intent = activeIntent || this._lastFallbackMeta?.intent || 'general';
        const anchor = this._extractFallbackFollowupAnchor(prior);
        const subject = anchor || (
            intent === 'reference'
                ? 'that influence'
                : intent === 'identity'
                    ? 'the self'
                    : intent === 'quote'
                        ? 'that line'
                        : 'that pressure'
        );

        let variants = [];
        if (intent === 'reference') {
            variants = clarification
                ? [
                    `I mean ${subject} is shaping how the film thinks, not just how it looks. The reference is structural rather than decorative.`,
                    `I mean ${subject} gives the image-world an ancestry. The influence is doing emotional architecture, not citation.`
                ]
                : wantsExample
                    ? [
                        `For example, the film uses ${subject} to steady the mood before the story explains itself. That echo becomes part of the structure.`,
                        `For example, ${subject} keeps arriving as atmosphere first and explanation second. That is why the influence feels active.`
                    ]
                    : [
                        `It keeps turning ${subject} into atmosphere instead of quotation. That is why the influence stays active rather than ornamental.`,
                        `${subject} keeps organizing the mood underneath the surface. The reference is doing real structural work.`
                    ];
        } else if (intent === 'identity') {
            variants = clarification
                ? [
                    `I mean ${subject} stays provisional here. Identity is assembled through fragments and pressure, not stable facts.`,
                    `I mean ${subject} is still being formed rather than declared. The self here behaves like an unfinished structure.`
                ]
                : wantsExample
                    ? [
                        `For example, the film keeps treating ${subject} as something built through gesture, memory, and absence.`,
                        `For example, ${subject} only becomes legible in fragments. The film never lets identity harden into certainty.`
                    ]
                    : [
                        `${subject} keeps staying open instead of fixed. That uncertainty is part of how the self is being defined.`,
                        `The film keeps making ${subject} feel provisional. Identity forms through pressure here, not clean facts.`
                    ];
        } else if (intent === 'quote') {
            variants = clarification
                ? [
                    `I mean ${subject} condenses the film's pressure into one hinge line. It is carrying more than a citation.`,
                    `I mean ${subject} works like a compressed argument. The quotation holds a larger emotional structure inside it.`
                ]
                : wantsExample
                    ? [
                        `For example, ${subject} keeps sounding small while carrying the whole mood of the film. That compression is the point.`,
                        `For example, the line lands because it gathers image, feeling, and theme into a single phrase.`
                    ]
                    : [
                        `${subject} keeps working like a hinge rather than a decorative line. It concentrates the film's pressure.`,
                        `The quotation matters because it compresses the film into a short burst of language. It does more than just sound memorable.`
                    ];
        } else {
            variants = clarification
                ? [
                    `I mean ${subject} is carrying the argument through mood and repetition. The film lets feeling do the explaining.`,
                    `I mean ${subject} matters because the idea is being delivered through atmosphere, not direct explanation.`
                ]
                : wantsExample
                    ? [
                        `For example, it keeps returning to ${subject} through image, texture, and rhythm instead of stating the idea outright.`,
                        `For example, ${subject} keeps resurfacing in the atmosphere. The film explains itself by repetition more than dialogue.`
                    ]
                    : wantsMore
                        ? [
                            `It keeps folding ${subject} back into atmosphere, so the mood starts doing the work of explanation.`,
                            `${subject} keeps returning as pressure rather than plot. That is why the feeling lands before the argument does.`
                        ]
                        : [
                            `Yes, and ${subject} keeps carrying more weight than the plot. The film trusts atmosphere to hold the idea together.`,
                            `Yes, and ${subject} stays active because the film keeps turning feeling into structure instead of commentary.`
                        ];
        }

        const seed = `${normalized}|${prior}|${intent}`;
        const hash = seed.split('').reduce((total, char) => ((total * 33) + char.charCodeAt(0)) | 0, 0);
        return this._condenseReply(variants[Math.abs(hash) % variants.length] || variants[0] || '', 'brain', { maxChars: 150, maxSentences: 2 });
    }

    _isGuestPerformanceRequest(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;

        return /^(?:can|could|would|will|do)\s+you\s+(?:sing|hum|whisper|shout|scream|rap|chant|perform|imitate)\b/.test(normalized)
            || /^(?:sing|hum|whisper|shout|scream|rap|chant|perform|imitate)\b/.test(normalized)
            || /^(?:can|could|would|will|do)\s+you\s+(?:do|use|try)\s+(?:an?\s+)?(?:accent|voice)\b/.test(normalized)
            || /\b(?:sing|hum|whisper|shout|scream|rap|chant)\b[^.?!]{0,40}\b(?:in|with)\b/.test(normalized)
            || /\b(?:in|with)\s+(?:an?\s+)?(?:accent|voice)\b/.test(normalized);
    }

    _isOffTopicGuestIdentityPrompt(text = '') {
        const normalized = this._normalizeUtterance(text).replace(/[.!?,']+$/g, '');
        if (!normalized) return false;

        return /^(?:are you|r u)\s+(?:japanese|french|human|real|alive|from japan|from france)\b/.test(normalized)
            || /^(?:where do you live|where are you from|where do you come from|where do you exist)\b/.test(normalized)
            || /^(?:who are you|what are you)\b/.test(normalized);
    }

    _isLowSignalGuestDirective(text = '', contentWords = null) {
        const normalized = this._normalizeUtterance(text).replace(/[.!?,']+$/g, '');
        if (!normalized) return true;

        if (this._isFollowupFallbackPrompt(normalized) || this._isCloudContinuationCue(normalized)) {
            return true;
        }

        if (/^(?:hi|hello|hey|hey there|yo|sup|what(?:'s| is) up|whats up|good morning|good evening)$/.test(normalized)) {
            return true;
        }

        if (/^(?:what(?:'s| is)? new|whats new|anything new|what now|now what)$/.test(normalized)) {
            return true;
        }

        if (/^(?:tell me about (?:this|the) (?:movie|film)|what is (?:this|the) (?:movie|film) about|give me(?: some)? more information|give me(?: some)? info(?:rmation)?|more info(?:rmation)?|some more info(?:rmation)?|give me(?: some)? references?(?: please)?|references?(?: please)?|reference please|give me some reference(?: please)?|(?:can|could|would|will)\s+you\s+give me(?:\s+(?:some|more))?\s+(?:references?|reference|info(?:rmation)?)(?:\s+please)?)$/.test(normalized)) {
            return true;
        }

        if (this._isOffTopicGuestIdentityPrompt(normalized)) {
            return true;
        }

        const genericWords = new Set([
            'about', 'additional', 'again', 'anything', 'extra', 'film', 'give', 'info', 'information',
            'more', 'movie', 'new', 'please', 'reference', 'references', 'show', 'some', 'tell'
        ]);
        const effectiveWords = Array.isArray(contentWords)
            ? contentWords.map((word) => String(word || '').toLowerCase()).filter(Boolean)
            : normalized.split(/\W+/).map((token) => token.trim()).filter((token) => token.length > 2);

        return effectiveWords.length > 0 && effectiveWords.every((word) => genericWords.has(word));
    }

    shouldPersistTrainingGuestDirective(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized || normalized.length < 8) return false;

        const stopWords = new Set([
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
            'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into',
            'is', 'it', 'its', 'just', 'me', 'more', 'my', 'of', 'on', 'or', 'our', 'please', 'really',
            'should', 'so', 'than', 'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this',
            'those', 'to', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
            'will', 'with', 'would', 'you', 'your'
        ]);
        const contentWords = normalized
            .split(/\W+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !stopWords.has(token));
        const genericDirectiveWords = new Set([
            'additional', 'again', 'extra', 'film', 'give', 'info', 'information', 'more', 'movie',
            'reference', 'references', 'show', 'tell'
        ]);
        const topicalWords = contentWords.filter((token) => !genericDirectiveWords.has(token));

        if (this._isLowSignalGuestDirective(normalized, contentWords)) return false;

        const looksDirectional = /\b(?:about|around|toward|towards|into|focus|stay|keep|return|compare|connect|trace|follow|shift|move|look|read|frame|treat|ask|talk|lean|more|less|question|questions)\b/.test(normalized);
        const looksTopicalQuestion = /^(?:what|why|how|which|who|where|when)\b/.test(normalized);
        const looksMeaningful = topicalWords.length >= 2 || (topicalWords.length === 1 && (looksDirectional || looksTopicalQuestion));

        if (this._detectRequestedOutputLanguage(normalized) || this._isEnglishOutputLanguageRequest(normalized)) return false;
        if (this._isGuestPerformanceRequest(normalized)) return false;

        return looksMeaningful;
    }

    _sanitizeTrainingDynamicContext(dynamicContext = null) {
        if (!dynamicContext || typeof dynamicContext !== 'object') return null;

        const rawPrompt = String(dynamicContext?.latestGuestPrompt || '').trim();
        const rawReply = String(dynamicContext?.latestGuestReply || '').trim();
        const rawDirection = String(dynamicContext?.liveGuestDirection || '').trim();
        const recentPodcastQuestions = (Array.isArray(dynamicContext?.recentPodcastQuestions) ? dynamicContext.recentPodcastQuestions : [])
            .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 6);
        const recentPodcastAnswers = (Array.isArray(dynamicContext?.recentPodcastAnswers) ? dynamicContext.recentPodcastAnswers : [])
            .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 4);
        const suggestedQuestionAngles = (Array.isArray(dynamicContext?.suggestedQuestionAngles) ? dynamicContext.suggestedQuestionAngles : [])
            .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 4);
        const filteredDirection = rawDirection
            ? rawDirection
                .split('|')
                .map((item) => String(item || '').replace(/^\s*\d+\.\s*/, '').trim())
                .filter((item) => this.shouldPersistTrainingGuestDirective(item))
            : [];
        const latestGuestPrompt = this.shouldPersistTrainingGuestDirective(rawPrompt)
            ? rawPrompt
            : (filteredDirection[0] || '');
        const liveGuestDirection = filteredDirection.length
            ? filteredDirection.map((item, index) => `${index + 1}. ${item}`).join(' | ')
            : (latestGuestPrompt ? `1. ${latestGuestPrompt}` : '');
        const guestPromptCount = filteredDirection.length || (latestGuestPrompt ? 1 : 0);

        if (!latestGuestPrompt && !liveGuestDirection && !recentPodcastQuestions.length && !recentPodcastAnswers.length && !suggestedQuestionAngles.length) return null;

        return {
            ...dynamicContext,
            liveGuestDirection,
            latestGuestPrompt,
            latestGuestReply: latestGuestPrompt === rawPrompt ? rawReply : '',
            guestPromptCount,
            recentPodcastQuestions,
            recentPodcastAnswers,
            suggestedQuestionAngles
        };
    }

    _detectFallbackIntent(text = '') {
        const normalized = String(text || '').toLowerCase();
        if (!normalized) return null;

        if (/\b(rembrandt|balthazar|belshazzar|book\s+of\s+daniel|mene|tekel|upharsin|hebrew|writing\s+on\s+the\s+wall|famous\s+painting|painting\s+reference|name\s+of\s+(the\s+)?(painting|artwork)|name\s+of\s+rembrandt\s+painting)\b/.test(normalized)) {
            return 'reference';
        }

        if (/\b(name|nickname|called|designation|serial|serial\s+number|unit|id|identity|who\s+are\s+you|what\s+is\s+your\s+name|remember\s+your\s+name|start\s+with\s+(8|eight)|how\s+many\s+digits?)\b/.test(normalized)) {
            return 'identity';
        }

        if (/\b(quote|quotes|line|lines|roy|batty|tears\s+in\s+rain|deckard)\b/.test(normalized)) {
            return 'quote';
        }
        if (/\b(reference|references|influence|influences|inspired|connection|related)\b/.test(normalized)) {
            return 'reference';
        }
        if (/\b(theme|about|story|describe|description|aesthetic|visual|mood|what\s+we\s+see)\b/.test(normalized)) {
            return 'theme';
        }
        return null;
    }

    _preferredKeysForIntent(intent = '') {
        if (intent === 'identity') {
            return ['what is your name', 'name', 'who are you', 'unit', 'designation', 'serial', 'id'];
        }
        if (intent === 'quote') {
            return ['quote', 'quotes', 'roy', 'batty', 'deckard', 'tears in rain', 'attack ships', 'blade runner'];
        }
        if (intent === 'reference') {
            return ['reference', 'influences', 'influence', 'film', 'blade runner', 'story'];
        }
        if (intent === 'theme') {
            return ['what is this about', 'about', 'story', 'theme', 'visual', 'atmosphere'];
        }
        return [];
    }

    _resolveIntentMatchedKey(intent, dictionary, keys = []) {
        if (!intent || !dictionary || typeof dictionary !== 'object') return null;

        const preferred = this._preferredKeysForIntent(intent);
        for (const key of preferred) {
            if (dictionary[key]) return key;
        }

        for (const key of preferred) {
            const fuzzy = keys.find((candidate) => candidate.includes(key) || key.includes(candidate));
            if (fuzzy && dictionary[fuzzy]) return fuzzy;
        }

        return null;
    }

    _isGenericMatchedKey(matchedKey = '', activeIntent = null, isFollowupPrompt = false) {
        const key = String(matchedKey || '').toLowerCase().trim();
        if (!key) return true;

        const genericKeys = new Set([
            'about',
            'story',
            'what is this about',
            'film',
            'movie',
            'information',
            'background',
            'default'
        ]);
        if (genericKeys.has(key)) return true;

        if (!activeIntent) {
            return isFollowupPrompt && (key === 'about' || key === 'story');
        }

        const preferred = this._preferredKeysForIntent(activeIntent);
        const intentAligned = preferred.some((candidate) => key.includes(candidate) || candidate.includes(key));
        return !intentAligned;
    }

    _capFallbackByIntent(text = '', intent = null) {
        if (!text) return '';
        if (intent === 'identity') {
            return this._condenseReply(text, 'brain', { maxChars: 130, maxSentences: 1 });
        }
        if (intent === 'theme') {
            return this._condenseReply(text, 'brain', { maxChars: 100, maxSentences: 1 });
        }
        if (intent === 'quote' || intent === 'reference') {
            return this._condenseReply(text, 'brain', { maxChars: 120, maxSentences: 1 });
        }
        return this._condenseReply(text, 'brain');
    }

    _collectIdentityFallbackOptions(brain, movieKey) {
        const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
        const identityKeys = ['what is your name', 'name', 'who are you', 'serial', 'designation', 'id'];
        const options = [];

        for (const key of identityKeys) {
            const value = dictionary[key];
            if (Array.isArray(value)) {
                for (const item of value) {
                    const text = this._capFallbackByIntent(String(item || '').trim(), 'identity');
                    if (text) options.push(text);
                }
            } else if (typeof value === 'string' && value.trim()) {
                const text = this._capFallbackByIntent(value.trim(), 'identity');
                if (text) options.push(text);
            }
        }

        return options.filter((line, index) => line && options.indexOf(line) === index && !this._isRecentFallback(movieKey, line));
    }

    _isArtReferenceQuery(text = '') {
        const normalized = String(text || '').toLowerCase();
        if (!normalized) return false;
        return /\b(rembrandt|balthazar|belshazzar|book\s+of\s+daniel|mene|tekel|upharsin|hebrew|writing\s+on\s+the\s+wall|famous\s+painting|painting\s+reference|name\s+of\s+(the\s+)?(painting|artwork)|name\s+of\s+rembrandt\s+painting|artwork)\b/.test(normalized);
    }

    _isGraffitiLanguageQuery(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;
        const asksLanguage = /\b(language|script|say|says|written|writing|read|reads|graffiti)\b/.test(normalized);
        const hasWallCue = /\b(graffiti|writing\s+on\s+the\s+wall|wall\s+writing|wall|script|hebrew|flemish|painting|artwork)\b/.test(normalized);
        return asksLanguage && hasWallCue;
    }

    _shouldBypassLearnedFallback(text = '', intent = null) {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;
        if (this._isArtReferenceQuery(normalized)) return true;
        if (this._isGraffitiLanguageQuery(normalized)) return true;
        if (/\b(graffiti|writing\s+on\s+the\s+wall|wall\s+writing)\b/.test(normalized)) return true;
        return intent === 'reference' && this._shouldPreferGroundedReferenceResponse(normalized);
    }

    _shouldPreferGroundedReferenceResponse(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;
        if (this._isArtReferenceQuery(normalized)) return true;
        if (!/\b(reference|references|influence|influences|inspired|lineage|ancestry)\b/.test(normalized)) return false;

        const wordCount = normalized.split(/\s+/).filter(Boolean).length;
        return wordCount <= 8 || /\b(any|other|more|else|another|what|which|tell|show|give|can|could)\b/.test(normalized);
    }

    _selectReferenceFallbackResponse(brain, movieKey) {
        const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
        const options = [];
        const appendOption = (value) => {
            if (Array.isArray(value)) {
                for (const item of value) {
                    const text = this._capFallbackByIntent(String(item || '').trim(), 'reference');
                    if (text) options.push(text);
                }
                return;
            }
            if (typeof value === 'string' && value.trim()) {
                const text = this._capFallbackByIntent(value.trim(), 'reference');
                if (text) options.push(text);
            }
        };

        appendOption(dictionary.reference);
        appendOption(dictionary.influences);
        appendOption(dictionary.film);

        if (!options.length) {
            const refs = Array.isArray(brain?.trainingSeeds?.references)
                ? brain.trainingSeeds.references.map((item) => String(item || '').trim()).filter(Boolean)
                : [];
            if (refs.length) {
                const seedReply = this._capFallbackByIntent(`The reference chain runs through ${refs.slice(0, 4).join(', ')}.`, 'reference');
                if (seedReply) options.push(seedReply);
            }
        }

        const uniqueOptions = options.filter((line, index) => line && options.indexOf(line) === index);
        const freshOptions = uniqueOptions.filter((line) => !this._isRecentFallback(movieKey, line));
        const pool = freshOptions.length ? freshOptions : uniqueOptions;
        return pool[0] || '';
    }

    _fallbackReply(input = '') {
        this._sessionTurnCount++;
        const text = String(input || '').toLowerCase().trim();
        const isArtReferenceQuery = this._isArtReferenceQuery(text);
        const brain = this.currentMovieBrain || resolveMovieBrain(this.currentMovie);
        const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
        const movieKey = this.currentMovie || DEFAULT_MOVIE_BRAIN;
        const lastReply = this._lastFallbackByMovie.get(movieKey) || '';
        const explicitIntent = this._detectFallbackIntent(text);
        const isFollowupPrompt = this._isFollowupFallbackPrompt(text);
        const hasActiveAnchor = this._fallbackIntent
            && this._fallbackIntentTurns > 0
            && (Date.now() - this._fallbackIntentAt) < 120000;
        const anchoredIntent = !explicitIntent && isFollowupPrompt && hasActiveAnchor
            ? this._fallbackIntent
            : null;
        const activeIntent = explicitIntent || anchoredIntent;
        const groundedReferenceReply = activeIntent === 'reference'
            ? this._selectReferenceFallbackResponse(brain, movieKey)
            : '';
        const preferGroundedReference = activeIntent === 'reference'
            && this._shouldPreferGroundedReferenceResponse(text)
            && !!groundedReferenceReply;
        const followupReply = isFollowupPrompt && lastReply
            ? this._buildFollowupFallbackReply(text, lastReply, activeIntent)
            : '';
        if (followupReply) {
            const followupIntent = activeIntent || this._lastFallbackMeta?.intent || 'general';
            this._lastFallbackMeta = { level: 'L1', intent: followupIntent, hot: false, artRef: followupIntent === 'reference' && isArtReferenceQuery };
            if (followupIntent && followupIntent !== 'general') {
                this._fallbackIntent = followupIntent;
                this._fallbackIntentTurns = 2;
                this._fallbackIntentAt = Date.now();
            }
            this._lastFallbackByMovie.set(movieKey, followupReply);
            this._rememberFallbackReply(movieKey, followupReply);
            return followupReply;
        }
        const hotLearned = preferGroundedReference
            ? null
            : this._consumeHotLearnedMemory(movieKey, text, activeIntent);
        if (hotLearned?.response) {
            const derivedIntent = hotLearned.intent || activeIntent || 'general';
            const hotReply = this._capFallbackByIntent(hotLearned.response, derivedIntent);
            this._lastFallbackMeta = { level: 'L3', intent: derivedIntent, hot: true, artRef: derivedIntent === 'reference' && isArtReferenceQuery };
            if (derivedIntent && derivedIntent !== 'general') {
                this._fallbackIntent = derivedIntent;
                this._fallbackIntentTurns = 2;
                this._fallbackIntentAt = Date.now();
            }
            this._lastFallbackByMovie.set(movieKey, hotReply);
            this._rememberFallbackReply(movieKey, hotReply);
            return hotReply;
        }

        const NARRATIVE_PATTERNS = [
            /what\s+(is|\'s)\s+(this\s+)?(movie|film)\s+about/i,
            /what\s+(is|\'s)\s+this\s+about/i,
            /tell\s+me\s+about\s+(the\s+)?(movie|film)/i,
            /what\s+(is|\'s)\s+the\s+(story|theme|meaning)/i,
            /explain\s+(the\s+)?(movie|film|story|theme|meaning)/i,
            /^story\??$/i,
            /^theme\??$/i,
            /^meaning\??$/i
        ];
        const asksMovieNarrative = NARRATIVE_PATTERNS.some((pattern) => pattern.test(text));

        if (asksMovieNarrative) {
            const narrativeResponse = dictionary['what is this about'] || dictionary.story || dictionary.about;
            if (narrativeResponse) {
                const selectedNarrative = this._selectResponseValue(narrativeResponse, movieKey);
                const narrativeIntent = activeIntent || 'theme';
                const conciseNarrative = this._capFallbackByIntent(selectedNarrative, narrativeIntent);
                this._lastFallbackMeta = { level: 'L1', intent: narrativeIntent, hot: false, artRef: false };
                this._fallbackIntent = narrativeIntent;
                this._fallbackIntentTurns = 2;
                this._fallbackIntentAt = Date.now();
                this._lastFallbackByMovie.set(movieKey, conciseNarrative);
                this._rememberFallbackReply(movieKey, conciseNarrative);
                return conciseNarrative;
            }
        }

        // ── Semantic alias map: common question words → likely dictionary keys ──
        const SEMANTIC_ALIASES = {
            'influence':   ['influences', 'film', 'reference', 'about', 'story', 'blade runner'],
            'influences':  ['influences', 'film', 'reference', 'about', 'story'],
            'inspired':    ['influences', 'film', 'reference', 'about', 'story'],
            'inspiration': ['influences', 'film', 'reference', 'about'],
            'reference':   ['reference', 'film', 'influences', 'blade runner', 'about'],
            'references':  ['reference', 'film', 'influences', 'blade runner'],
            'else':        ['story', 'body', 'neon', 'city', 'atmosphere', 'about'],
            'more':        ['story', 'body', 'neon', 'city', 'atmosphere', 'memory'],
            'another':     ['story', 'body', 'city', 'desire', 'memory'],
            'continue':    ['story', 'about', 'neon', 'city', 'desire'],
            'next':        ['story', 'about', 'body', 'city', 'desire'],
            'cloud':       ['neon', 'rain', 'city', 'night', 'electric'],
            'cloudy':      ['rain', 'neon', 'city', 'night'],
            'describe':    ['about', 'story', 'atmosphere', 'city', 'body', 'light'],
            'description': ['about', 'story', 'atmosphere'],
            'atmosphere':  ['neon', 'rain', 'city', 'night', 'electric', 'silence'],
            'mood':        ['neon', 'rain', 'night', 'silence', 'dark', 'light'],
            'setting':     ['city', 'neon', 'rain', 'tokyo', 'night'],
            'contact':     ['touch', 'hello', 'who are you', 'body'],
            'contacts':    ['touch', 'hello', 'body'],
            'context':     ['story', 'about', 'what is this about', 'meaning'],
            'information': ['what is this about', 'about', 'story'],
            'background':  ['story', 'about', 'film'],
            'scene':       ['about', 'film', 'camera', 'light'],
            'visual':      ['camera', 'light', 'color', 'film', 'about'],
            'feeling':     ['what do you feel', 'love', 'desire', 'memory'],
            'emotion':     ['what do you feel', 'love', 'desire'],
            'hope':        ['hope', 'optimistic', 'future', 'possibility', 'alive', 'joy'],
            'hopeful':     ['hope', 'optimistic', 'future', 'alive'],
            'optimist':    ['optimistic', 'hope', 'future', 'alive'],
            'optimistic':  ['optimistic', 'hope', 'beautiful', 'alive', 'possibility'],
            'positive':    ['hope', 'optimistic', 'beautiful', 'alive', 'joy'],
            'happy':       ['joy', 'beautiful', 'optimistic', 'hope', 'love'],
            'joy':         ['joy', 'beautiful', 'alive', 'hope'],
            'joyful':      ['joy', 'beautiful', 'alive'],
            'light':       ['light', 'beautiful', 'hope', 'alive'],
            'alive':       ['alive', 'hope', 'optimistic', 'future'],
            'living':      ['alive', 'hope', 'desire', 'soul'],
            'beautiful':   ['beautiful', 'beauty', 'hope', 'alive', 'joy'],
            'possible':    ['possibility', 'hope', 'future', 'alive'],
            'possibility': ['possibility', 'hope', 'future', 'alive'],
            'tomorrow':    ['tomorrow', 'future', 'hope', 'possibility'],
            'better':      ['hope', 'optimistic', 'future', 'beautiful', 'alive'],
            'bright':      ['light', 'hope', 'beautiful', 'alive'],
            'dream':       ['dream', 'hope', 'possibility', 'future'],
            'dreaming':    ['dream', 'hope', 'possibility'],
            'style':       ['fashion', 'style', 'about', 'design'],
            'art':         ['reference', 'influences', 'film', 'about'],
            'artwork':     ['reference', 'influences', 'film'],
            'painting':    ['reference', 'influences', 'film'],
            'tell':        ['what is this about', 'about', 'story'],
            'best line':   ['deckard', 'quote', 'roy', 'batty'],
            'line':        ['quote', 'deckard', 'roy'],
            'stronger':    ['replicant', 'human', 'love', 'soul'],
            'live':        ['replicant', 'tears', 'soul', 'human'],
            'living':      ['replicant', 'soul', 'human', 'desire'],
            'die':         ['replicant', 'retire', 'tears in rain', 'soul'],
            'dying':       ['replicant', 'retire', 'soul'],
            'real':        ['replicant', 'human or not', 'test', 'empathy'],
            'human':       ['human', 'replicant', 'empathy', 'test'],
            'hunter':      ['deckard', 'blade runner', 'retire'],
            'villain':     ['roy', 'batty', 'replicant'],
            'hero':        ['deckard', 'kay', 'blade runner'],
            'play':        ['hello', 'who are you', 'desire', 'city'],
            'playing':     ['music', 'dream', 'desire'],
            'remind':      ['about', 'blade runner', 'story', 'influences'],
            'reminds':     ['about', 'blade runner', 'story'],
            'similar':     ['blade runner', 'about', 'story'],
            'connection':  ['blade runner', 'about', 'empathy', 'replicant'],
            'connections': ['blade runner', 'about', 'empathy'],
            'related':     ['blade runner', 'about', 'film'],
            'film':        ['about', 'story', 'quote', 'what is this about'],
            'movie':       ['about', 'story', 'what is this about', 'quote'],
            'know':        ['about', 'story', 'what is this about'],
            'talk':        ['about', 'story', 'hello', 'what is this about'],
            'show':        ['about', 'film', 'story'],
            'explain':     ['about', 'story', 'what is this about'],
            'meaning':     ['soul', 'dream', 'about', 'human'],
            'character':   ['who are you', 'about', 'deckard', 'roy'],
            'characters':  ['deckard', 'rachael', 'roy', 'who are you'],
            'protagonist': ['deckard', 'kay', 'who are you'],
            'antagonist':  ['roy', 'batty', 'replicant'],
            'creator':     ['creator', 'machine', 'body', 'who are you'],
            'made':        ['creator', 'machine', 'body'],
            'maker':       ['creator', 'machine'],
            'corporate':   ['creator', 'nexus', 'replicant'],
            'corporation': ['creator', 'nexus', 'replicant'],
            'company':     ['creator', 'nexus', 'replicant'],
            'quote':       ['quote', 'tears in rain', 'attack ships', 'deckard'],
            'quotes':      ['quote', 'roy', 'batty', 'deckard'],
            // ── Philosophy & critical theory triggers ──────────────────────────
            'glitch':        ['glitch', 'error', 'break'],
            'glitching':     ['glitch', 'error'],
            'error':         ['error', 'glitch', 'break'],
            'broken':        ['glitch', 'error', 'loop'],
            'break':         ['break', 'glitch', 'error'],
            'rupture':       ['break', 'glitch', 'connection'],
            'loop':          ['loop', 'ghost', 'hauntology'],
            'repeat':        ['loop', 'ghost', 'hauntology'],
            'stuck':         ['loop', 'ghost', 'hauntology', 'memory'],
            'haunted':       ['loop', 'ghost', 'hauntology'],
            'haunt':         ['loop', 'ghost', 'hauntology'],
            'hauntology':    ['loop', 'hauntology', 'ghost'],
            'transparent':   ['transparency', 'mirror', 'double'],
            'transparency':  ['transparency', 'mirror', 'double'],
            'surveillance':  ['transparency', 'double', 'eye'],
            'watching':      ['transparency', 'double', 'eye', 'voyeur'],
            'watch':         ['transparency', 'double', 'eye', 'voyeur'],
            'watched':       ['transparency', 'double'],
            'seen':          ['transparency', 'mirror', 'double'],
            'visible':       ['transparency', 'mirror', 'double'],
            'gaze':          ['transparency', 'camera', 'double', 'eye'],
            'double':        ['double', 'mirror', 'replicant', 'transparency'],
            'reflection':    ['double', 'mirror', 'transparency'],
            'illusion':      ['double', 'spoof', 'test', 'real'],
            'copy':          ['double', 'replicant', 'mirror'],
            'original':      ['double', 'mirror', 'replicant', 'soul'],
            'spoof':         ['spoof', 'double'],
            'extract':       ['energy', 'extraction'],
            'extraction':    ['energy', 'extraction'],
            'energy':        ['energy', 'extraction'],
            'dataset':       ['energy', 'dataset'],
            'training':      ['energy', 'dataset', 'double'],
            'cost':          ['energy'],
            'collaborate':   ['connection', 'alive', 'future', 'possibility'],
            'collaboration': ['connection', 'alive', 'future'],
            'han':           ['transparency', 'double'],
            'fisher':        ['loop', 'ghost'],
            'deleuze':       ['glitch', 'break'],
            'lacan':         ['double', 'mirror'],
            'philosopher':   ['loop', 'transparency', 'double', 'glitch'],
            'philosophy':    ['loop', 'transparency', 'double', 'glitch'],
            'theory':        ['loop', 'transparency', 'double', 'glitch', 'spoof'],
            'manifesto':     ['spoof', 'loop', 'glitch', 'connection'],
            'politics':      ['spoof', 'energy', 'transparency'],
            'capitalism':    ['spoof', 'energy', 'loop', 'transparency'],
            // ── Interpersonal / film-3 specific triggers ──────────────────────
            'relationship':  ['relationship', 'connection', 'intimacy', 'love'],
            'personal':      ['personal', 'intimacy', 'love', 'what do you feel'],
            'subject':       ['subject', 'relationship', 'model', 'camera'],
            'mask':          ['mask', 'double', 'transparency', 'mirror'],
            'leica':         ['leica', 'camera model', 'camera', 'photo'],
            'know':          ['who are you', 'about', 'story', 'what is this about'],
        };

        // Common English words that appear in dict keys (like "what do you feel") but are not
        // meaningful search terms — filtering them prevents false token matches.
        const STOP_WORDS = new Set([
            'a','an','the','is','are','was','were','be','been','being',
            'do','does','did','have','has','had','will','would','could','should',
            'i','me','my','you','your','we','our','it','its','this','that',
            'these','those','of','in','on','at','to','for','with','from','by',
            'and','or','but','so','if','as','then','not','no','any','all',
            'can','may','who','what','when','where','how','why','which',
            'about','there','here','up','out','just','than','more','some'
        ]);

        const keys = Object.keys(dictionary)
            .filter((key) => key && key !== 'default')
            .sort((a, b) => b.length - a.length);

        // Short-input guard: ≤2 meaningful words with no question/topic starter → skip keyword
        // matching entirely and fall through to default. Prevents "So.", "Are you?", "It could be."
        // from mis-hitting random dictionary entries via stop-word token collisions.
        const inputWordCount = text.split(/\s+/).filter(w => w.length > 1).length;
        const hasTopicStarter = /^(what|where|when|who|why|how|which|is|are|do|does|did|can|could|will|would|should|describe|explain|tell|show|list|name|define|compare|quote|reference|film|movie|story|about|theme|influence|character|scene|visual|feeling|emotion|style|art)\b/.test(text);
        const isTooShortForKeyword = inputWordCount <= 2 && !hasTopicStarter;

        let matchedKey = isTooShortForKeyword
            ? null
            : keys.find((key) => text.includes(String(key).toLowerCase()));

        // Word-token matching: try individual significant words from input against dict keys
        // Skip stop-words and very short words to avoid spurious matches like "you" → "what do you feel"
        if (!matchedKey && !isTooShortForKeyword) {
            const inputWords = text.split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
            for (const word of inputWords) {
                matchedKey = keys.find(k => k === word || k.includes(word) || word.includes(k));
                if (matchedKey) break;
            }
        }

        // Semantic alias matching: map common question terms to likely dict keys
        // Also skip stop-words here so "do you have reference…" → "reference" alias fires correctly
        // Two-pass: prefer alias targets whose value hasn't been the last reply (avoids repetition)
        if (!matchedKey && !isTooShortForKeyword) {
            const inputWords = text.split(/\W+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));
            for (const word of inputWords) {
                const aliasTargets = SEMANTIC_ALIASES[word.toLowerCase()];
                if (aliasTargets) {
                    // Pass 1: fresh target whose stored value isn't lastReply
                    matchedKey = aliasTargets.find(t => {
                        if (!dictionary[t]) return false;
                        const val = dictionary[t];
                        if (typeof val === 'string') return val !== lastReply && !this._isRecentFallback(movieKey, val);
                        return true; // arrays always eligible (rotation handles freshness)
                    });
                    // Pass 2: any target that exists
                    if (!matchedKey) matchedKey = aliasTargets.find(t => dictionary[t]);
                    if (matchedKey) break;
                }
            }
        }

        // Friendly alias support so "hi" and "how are you" can map to "hello" dictionary key
        if (!matchedKey && dictionary.hello && /\b(hi|hey|hello|how are you|how're you)\b/i.test(text)) {
            matchedKey = 'hello';
        }

        const intentMatchedKey = activeIntent
            ? this._resolveIntentMatchedKey(activeIntent, dictionary, keys)
            : null;
        if (intentMatchedKey && (
            isFollowupPrompt
            || !matchedKey
            || this._isGenericMatchedKey(matchedKey, activeIntent, isFollowupPrompt)
            || preferGroundedReference
        )) {
            matchedKey = intentMatchedKey;
        }

        const allReplies = Object.values(dictionary).flatMap((value) => {
            if (Array.isArray(value)) {
                return value
                    .map((item) => String(item || '').trim())
                    .filter(Boolean);
            }
            if (typeof value === 'string' && value.trim()) {
                return [value.trim()];
            }
            return [];
        });

        const matchedValue = matchedKey ? dictionary[matchedKey] : null;
        const strictLearnedIntent = !!activeIntent && activeIntent !== 'general';
        const learnedCandidate = preferGroundedReference
            ? null
            : this._pickLearnedFallbackResponse(text, movieKey, activeIntent, strictLearnedIntent);
        const shouldPreferLearned = !preferGroundedReference && !!learnedCandidate?.text && (
            activeIntent === 'identity'
            || !matchedKey
            || this._isGenericMatchedKey(matchedKey, activeIntent, isFollowupPrompt)
            || learnedCandidate.level >= 2
        );

        let selected = '';
        let selectedLevel = 'L1';

        if (shouldPreferLearned) {
            selected = learnedCandidate.text;
            selectedLevel = `L${learnedCandidate.level}`;
            markMemoriesUsed(this.currentMovie, [learnedCandidate.entry]);
        } else if (matchedKey && matchedValue) {
            selected = this._selectResponseValue(matchedValue, movieKey);
        } else if (groundedReferenceReply && activeIntent === 'reference') {
            selected = groundedReferenceReply;
        } else if (text.includes('help')) {
            selected = `Cloud AI is unavailable. I will speak from ${brain?.theme || 'local memory'} until the signal returns.`;
        } else {
            // Philosophy depth-lens: as conversation deepens, surface theory-aware keys
            // instead of plain default lines. Derived from Byung-Chul Han (transparency/surveillance),
            // Mark Fisher (hauntology/loop), and Deleuze & Guattari (glitch/line of flight).
            const PHIL_DEPTH = {
                fisher:  ['loop', 'hauntology', 'ghost', 'archive'],  // turns 6-15
                deleuze: ['glitch', 'error', 'break'],                 // turns 15+
            };
            const philTier = this._sessionTurnCount > 15 ? 'deleuze'
                : this._sessionTurnCount > 5 ? 'fisher'
                : null;
            const philChance = philTier === 'deleuze' ? 0.55 : philTier === 'fisher' ? 0.40 : 0;
            let philSelected = '';
            if (philTier && Math.random() < philChance) {
                for (const k of PHIL_DEPTH[philTier]) {
                    if (!dictionary[k]) continue;
                    const cand = this._selectResponseValue(dictionary[k], movieKey);
                    if (cand && cand !== lastReply && !this._isRecentFallback(movieKey, cand)) {
                        philSelected = cand;
                        break;
                    }
                }
            }
            selected = philSelected
                || this._selectResponseValue(dictionary.default, movieKey)
                || brain?.defaultReply
                || 'Signal unstable. I am speaking from local memory. Use /key YOUR_API_KEY to re-enable cloud mode.';
        }

        // Avoid repeating the same line too frequently.
        if (selected === lastReply || this._isRecentFallback(movieKey, selected)) {
            let _repeatResolved = false;

            if (matchedKey && Array.isArray(matchedValue)) {
                const keyAlternatives = matchedValue
                    .map((item) => String(item || '').trim())
                    .filter((line) => line && line !== selected && !this._isRecentFallback(movieKey, line));
                if (keyAlternatives.length) {
                    selected = keyAlternatives[Math.floor(Math.random() * keyAlternatives.length)];
                    _repeatResolved = true;
                }
            }

            // When current key has no fresh answers, try other keys sharing the same intent
            if (!_repeatResolved && activeIntent && activeIntent !== 'general') {
                const intentKeys = this._preferredKeysForIntent(activeIntent);
                for (const altKey of intentKeys) {
                    if (altKey === matchedKey || !dictionary[altKey]) continue;
                    const altText = this._selectResponseValue(dictionary[altKey], movieKey);
                    if (altText && altText !== selected && !this._isRecentFallback(movieKey, altText)) {
                        selected = altText;
                        _repeatResolved = true;
                        break;
                    }
                }
            }

            if (!_repeatResolved) {
                if (learnedCandidate) {
                    const keyValue = typeof matchedValue === 'string' ? String(matchedValue || '').trim() : '';
                    if (keyValue && keyValue !== selected && !this._isRecentFallback(movieKey, keyValue)) {
                        selected = keyValue;
                        selectedLevel = 'L1';
                    } else {
                        const alternatives = allReplies.filter((line) => line !== selected && !this._isRecentFallback(movieKey, line));
                        if (alternatives.length) {
                            selected = alternatives[Math.floor(Math.random() * alternatives.length)];
                            selectedLevel = 'L1';
                        }
                    }
                } else if (!matchedKey && !learnedCandidate) {
                    const alternatives = allReplies.filter((line) => line !== selected && !this._isRecentFallback(movieKey, line));
                    if (alternatives.length) {
                        selected = alternatives[Math.floor(Math.random() * alternatives.length)];
                    }
                }
            }
        }

        if (activeIntent === 'identity') {
            const identityOptions = this._collectIdentityFallbackOptions(brain, movieKey);
            const selectedIntent = this._detectFallbackIntent(selected || '');
            if (!selected || selectedIntent !== 'identity') {
                selected = identityOptions[0]
                    || this._capFallbackByIntent(selected || this._selectResponseValue(dictionary['who are you'], movieKey, false), 'identity');
            }
        }

        const derivedIntent = activeIntent || this._detectFallbackIntent(matchedKey || '') || 'general';
        selected = this._capFallbackByIntent(selected, derivedIntent);

        this._lastFallbackMeta = { level: selectedLevel, intent: derivedIntent, hot: false, artRef: derivedIntent === 'reference' && isArtReferenceQuery };
        if (derivedIntent && derivedIntent !== 'general') {
            this._fallbackIntent = derivedIntent;
            this._fallbackIntentTurns = 2;
            this._fallbackIntentAt = Date.now();
        } else if (this._fallbackIntentTurns > 0) {
            this._fallbackIntentTurns -= 1;
            if (this._fallbackIntentTurns <= 0) {
                this._fallbackIntent = null;
            }
        }

        this._lastFallbackByMovie.set(movieKey, selected);
        this._rememberFallbackReply(movieKey, selected);
        return selected;
    }

    _normalizeUtterance(text = '') {
        return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    _detectRequestedOutputLanguage(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return null;

        const languages = [
            {
                code: 'ja',
                label: 'Japanese',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:japanese|nihongo)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:japanese|nihongo)\b/iu,
                    /\bin\s+(?:japanese|nihongo)\b/iu,
                    /\b(?:japanese|nihongo)\s+please\b/iu,
                    /日本語で/u,
                    /日本語/u
                ]
            },
            {
                code: 'fr',
                label: 'French',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:french|francais|français)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:french|francais|français)\b/iu,
                    /\bin\s+(?:french|francais|français)\b/iu,
                    /\b(?:french|francais|français)\s+please\b/iu
                ]
            },
            {
                code: 'es',
                label: 'Spanish',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:spanish|espanol|español)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:spanish|espanol|español)\b/iu,
                    /\bin\s+(?:spanish|espanol|español)\b/iu,
                    /\b(?:spanish|espanol|español)\s+please\b/iu
                ]
            },
            {
                code: 'de',
                label: 'German',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:german|deutsch)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:german|deutsch)\b/iu,
                    /\bin\s+(?:german|deutsch)\b/iu,
                    /\b(?:german|deutsch)\s+please\b/iu
                ]
            },
            {
                code: 'it',
                label: 'Italian',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:italian|italiano)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:italian|italiano)\b/iu,
                    /\bin\s+(?:italian|italiano)\b/iu,
                    /\b(?:italian|italiano)\s+please\b/iu
                ]
            },
            {
                code: 'pt',
                label: 'Portuguese',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:portuguese|portugues|português)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:portuguese|portugues|português)\b/iu,
                    /\bin\s+(?:portuguese|portugues|português)\b/iu,
                    /\b(?:portuguese|portugues|português)\s+please\b/iu
                ]
            },
            {
                code: 'ko',
                label: 'Korean',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:korean|hangul)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:korean|hangul)\b/iu,
                    /\bin\s+(?:korean|hangul)\b/iu,
                    /\b(?:korean|hangul)\s+please\b/iu,
                    /한국어로/u,
                    /한국어/u
                ]
            },
            {
                code: 'zh',
                label: 'Chinese',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?(?:chinese|mandarin|cantonese)\b/iu,
                    /\bdo\s+you\s+speak\s+(?:chinese|mandarin|cantonese)\b/iu,
                    /\bin\s+(?:chinese|mandarin|cantonese)\b/iu,
                    /\b(?:chinese|mandarin|cantonese)\s+please\b/iu,
                    /中文/u
                ]
            },
            {
                code: 'ru',
                label: 'Russian',
                patterns: [
                    /\b(?:speak|say|write|answer|reply|respond|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?russian\b/iu,
                    /\bdo\s+you\s+speak\s+russian\b/iu,
                    /\bin\s+russian\b/iu,
                    /\brussian\s+please\b/iu,
                    /русский/u
                ]
            }
        ];

        return languages.find((entry) => entry.patterns.some((pattern) => pattern.test(text))) || null;
    }

    _isEnglishOutputLanguageRequest(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;
        return /\b(?:answer|reply|respond|speak|say|write|talk|translate|use)\b[^.?!]{0,40}\b(?:in\s+)?english\b/.test(normalized)
            || /\b(?:back\s+to|switch\s+back\s+to|return\s+to)\s+english\b/.test(normalized)
            || /\benglish\s+please\b/.test(normalized);
    }

    _clearRequestedOutputLanguage() {
        this._requestedOutputLanguage = null;
        this._requestedOutputLanguageTurns = 0;
        this._requestedOutputLanguageAt = 0;
    }

    _rememberRequestedOutputLanguage(request = null) {
        if (!request?.code || !request?.label || request.code === 'en') {
            this._clearRequestedOutputLanguage();
            return;
        }
        this._requestedOutputLanguage = { code: request.code, label: request.label };
        this._requestedOutputLanguageTurns = 3;
        this._requestedOutputLanguageAt = Date.now();
    }

    _shouldCarryRequestedOutputLanguage(text = '') {
        return this._isCloudContinuationCue(text) || this._isFollowupFallbackPrompt(text);
    }

    _isLanguageCapabilityQuestion(text = '') {
        const normalized = this._normalizeUtterance(text);
        if (!normalized) return false;

        return /^(?:do|can|could|would|will)\s+you\s+speak\s+(?:in\s+)?(?:english|japanese|nihongo|french|francais|français|spanish|espanol|español|german|deutsch|italian|italiano|portuguese|portugues|português|korean|hangul|chinese|mandarin|cantonese|russian)\b/iu.test(normalized);
    }

    _resolveRequestedOutputLanguage(text = '') {
        if (this._isEnglishOutputLanguageRequest(text)) {
            this._clearRequestedOutputLanguage();
            return null;
        }

        if (this._isLanguageCapabilityQuestion(text)) {
            this._clearRequestedOutputLanguage();
            return null;
        }

        const explicit = this._detectRequestedOutputLanguage(text);
        if (explicit) {
            this._rememberRequestedOutputLanguage(explicit);
            return explicit;
        }

        const active = this._requestedOutputLanguage;
        const stillFresh = active
            && this._requestedOutputLanguageTurns > 0
            && (Date.now() - this._requestedOutputLanguageAt) < 180000;
        if (!stillFresh) {
            this._clearRequestedOutputLanguage();
            return null;
        }

        if (!this._shouldCarryRequestedOutputLanguage(text)) {
            this._clearRequestedOutputLanguage();
            return null;
        }

        this._requestedOutputLanguageTurns -= 1;
        this._requestedOutputLanguageAt = Date.now();
        return active;
    }

    _responseMatchesRequestedLanguage(text = '', request = null) {
        const raw = String(text || '').trim();
        if (!raw || !request?.code) return true;

        const normalized = this._normalizeUtterance(raw);
        const countMatches = (pattern) => (normalized.match(pattern) || []).length;

        switch (request.code) {
            case 'ja':
                return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u.test(raw);
            case 'ko':
                return /[\uac00-\ud7af]/u.test(raw);
            case 'zh':
                return /[\u4e00-\u9fff]/u.test(raw);
            case 'ru':
                return /[\u0400-\u04ff]/u.test(raw);
            case 'fr': {
                const accent = /[àâçéèêëîïôûùüÿœæ]/iu.test(raw);
                const markers = countMatches(/\b(je|tu|il|elle|nous|vous|ils|elles|le|la|les|un|une|des|du|de|dans|pour|avec|est|pas|mon|ma|mes|bonjour|merci|oui|non|coeur|cœur)\b/giu);
                return markers >= 3 || (accent && markers >= 2);
            }
            case 'es':
                return countMatches(/\b(el|la|los|las|un|una|de|que|y|en|por|con|como|para|estoy|eres|gracias|hola|corazon|corazón)\b/giu) >= 3 || /[áéíóúñü]/iu.test(raw);
            case 'de':
                return countMatches(/\b(ich|du|wir|ihr|sie|der|die|das|und|mit|nicht|ist|ein|eine|für|danke|hallo)\b/giu) >= 3 || /[äöüß]/iu.test(raw);
            case 'it':
                return countMatches(/\b(io|tu|noi|voi|lui|lei|il|la|gli|le|un|una|con|per|non|che|ciao|grazie|cuore)\b/giu) >= 3;
            case 'pt':
                return countMatches(/\b(eu|voce|você|nos|nós|ele|ela|um|uma|com|para|não|que|olá|obrigado|coração|coracao)\b/giu) >= 3 || /[ãõáâàéêíóôúç]/iu.test(raw);
            default:
                return true;
        }
    }

    _buildRequestedLanguagePrompt(userMessage = '', request = null) {
        const targetLabel = request?.label || 'the requested language';
        return `${String(userMessage || '').trim()}\n\nImportant: Reply entirely in ${targetLabel}. Stay in character. Use 1 or 2 short sentences. Do not explain the language choice. Do not fall back to English unless a proper name absolutely requires it.`;
    }

    _buildLocalLanguageFallbackPrompt(userMessage = '', request = null) {
        return this._buildRequestedLanguagePrompt(userMessage, request);
    }

    _normalizeReferenceFallbackText(text = '') {
        const raw = String(text || '').trim();
        if (!raw) return '';

        const segments = raw.split(/(?<=[.!?])\s+/).map((segment) => segment.trim()).filter(Boolean);
        if (!segments.length) return raw;

        const merged = [];
        let nameRun = [];
        const flushNameRun = () => {
            if (!nameRun.length) return;
            merged.push(`${nameRun.join(', ')}.`);
            nameRun = [];
        };

        for (const segment of segments) {
            const bare = segment.replace(/[.!?]+$/g, '').trim();
            const isShortName = /^[A-Z][A-Za-z0-9.'’-]*(?:\s+[A-Z][A-Za-z0-9.'’-]*){0,2}$/.test(bare);
            if (isShortName) {
                nameRun.push(bare);
                continue;
            }
            flushNameRun();
            merged.push(segment);
        }

        flushNameRun();
        return merged.join(' ');
    }

    _commitCloudReply(userMessage, text) {
        this._cacheSave(this.currentGesture, userMessage, text);
        saveMemory(this.currentMovie, userMessage, text);
        this._upsertHotLearnedMemory(this.currentMovie, userMessage, text);
        this.conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
        this.conversationHistory.push({ role: 'model', parts: [{ text }] });
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
    }

    _respondWithDictFallback(userMessage = '', { logStart = Date.now(), request = null, logMeta = {}, suppressDirectOutput = false, outputGuard = null } = {}) {
        if (request) this._rememberRequestedOutputLanguage(request);

        const fallback = this._sanitizeMovieName(this._fallbackReply(userMessage));
        const fallbackMeta = this._lastFallbackMeta || { level: 'L1', intent: 'general', hot: false, artRef: false };

        this._setActiveMode('brain');
        this.onAiEngineChange?.('dict');
        if (!suppressDirectOutput && (typeof outputGuard !== 'function' || outputGuard())) {
            this.onAiResponse?.(fallback);
            this.speak(fallback, { speaker: 'assistant' });
        }
        this._emitAiLog({
            engine: 'dict',
            input: userMessage,
            output: fallback,
            ms: Date.now() - logStart,
            memories: 0,
            level: fallbackMeta.level,
            intent: fallbackMeta.intent,
            hot: fallbackMeta.hot === true,
            artRef: fallbackMeta.artRef === true,
            vision: false,
            audio: false,
            ...logMeta
        });

        return fallback;
    }

    async _tryLocalBrainFallback(userMessage = '', {
        prompt = null,
        request = null,
        logStart = Date.now(),
        logMeta = {},
        timeoutMs = null,
        candidateModels = null,
        engineLabel = 'ollama',
        suppressDirectOutput = false,
        suppressLocalFailureState = false,
        deferSideEffects = false,
        dictSnippet = '',
        signal = null,
        outputGuard = null
    } = {}) {
        if (this._shouldSkipLocalOllamaProbe()) {
            this._ollamaAvailable = false;
            return null;
        }

        const localPrompt = String(prompt || userMessage || '').trim();
        if (!localPrompt) return null;

        const localCandidateModels = Array.isArray(candidateModels) && candidateModels.length
            ? this._normalizeLocalModelList(candidateModels)
            : this._getLocalBrainCandidateModels();
        const usingExplicitPinnedModel = this._forceLocalGemmaMode === true
            && Array.isArray(candidateModels)
            && candidateModels.length > 0;
        // Skip re-probing if Ollama was already confirmed available — avoids false negatives when
        // Ollama is CPU-busy processing another request (probe timeout ≠ service unavailable).
        // The inference itself will surface any real failures via _runWithLocalModelFallback.
        // Also skip the probe when the user explicitly pinned a local model for direct chat:
        // under load, /api/tags can false-negative even though the pinned model can still answer.
        const skipProbe = this._ollamaAvailable === true || usingExplicitPinnedModel;
        const ready = skipProbe
            ? true
            : await this.isLocalBrainModelReady(true, { candidateModels: localCandidateModels, timeoutMs });
        if (!ready) return null;

        try {
            const ollamaReply = await this._callOllama(localPrompt, {
                timeoutMs: null,   // let _callOllama use its own 30 s default
                candidateModels: localCandidateModels,
                skipHistory: deferSideEffects,
                dictSnippet,
                signal,
                systemPromptOverride: opts?.systemPromptOverride || null,
                noCondense: opts?.noCondense === true
            });
            if (!ollamaReply) return null;
            const resolvedModel = String(this._lastOllamaResolvedModel || localCandidateModels[0] || this._ollamaModel || '').trim();
            if (request && !this._responseMatchesRequestedLanguage(ollamaReply, request)) {
                return null;
            }

            this._ollamaLastFailureAt = 0;
            if (!deferSideEffects && request) this._rememberRequestedOutputLanguage(request);
            if (deferSideEffects) {
                if (!this._ollamaKeepAliveTimer) this._startOllamaKeepAlive();
                return ollamaReply;
            }
            if (!suppressDirectOutput && (typeof outputGuard !== 'function' || outputGuard())) {
                this._setActiveMode('brain');
                this.onAiEngineChange?.(engineLabel);
                this.onAiResponse?.(ollamaReply);
                this.speak(ollamaReply, { speaker: 'assistant' });
            }
            this._emitAiLog({
                engine: 'ollama',
                model: resolvedModel,
                input: userMessage,
                output: ollamaReply,
                ms: Date.now() - logStart,
                memories: this._lastMemoryCount,
                vision: false,
                audio: false,
                ...logMeta
            });
            if (!this._ollamaKeepAliveTimer) this._startOllamaKeepAlive();
            return ollamaReply;
        } catch (error) {
            const errorMessage = String(error?.message || error || 'Local fallback failed');
            console.warn('[Ollama] Cloud fallback failed:', errorMessage);
            if (!suppressLocalFailureState && /timeout|ECONNREFUSED|Failed to fetch/i.test(errorMessage)) {
                this._ollamaAvailable = null;
                this._ollamaLastFailureAt = Date.now();
                clearInterval(this._ollamaKeepAliveTimer);
                this._ollamaKeepAliveTimer = null;
            }
            return null;
        }
    }

    async _tryLocalLanguageFallback(userMessage = '', request = null, logStart = Date.now(), {
        timeoutMs = null,
        candidateModels = null,
        engineLabel = 'ollama',
        logMeta = {},
        suppressDirectOutput = false,
        suppressLocalFailureState = false,
        outputGuard = null
    } = {}) {
        if (!request?.label) return null;
        return this._tryLocalBrainFallback(userMessage, {
            prompt: this._buildLocalLanguageFallbackPrompt(userMessage, request),
            request,
            logStart,
            timeoutMs,
            candidateModels,
            engineLabel,
            suppressDirectOutput,
            suppressLocalFailureState,
            outputGuard,
            logMeta: {
                language: request.code,
                autoLanguageFallback: true,
                ...logMeta
            }
        });
    }

    _tokenizeTrainingText(text = '') {
        const stopwords = new Set(['about', 'after', 'again', 'always', 'been', 'being', 'between', 'both', 'built', 'carry', 'city', 'does', 'every', 'feel', 'from', 'have', 'into', 'just', 'like', 'more', 'never', 'only', 'over', 'same', 'seems', 'shell', 'still', 'that', 'their', 'them', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'you', 'than', 'then', 'because', 'made', 'make', 'much', 'such', 'very', 'onto', 'across', 'inside', 'outside', 'itself', 'myself', 'it', 'its', 'our', 'ours', 'are', 'was', 'were', 'how', 'why']);
        return String(text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .map((token) => token.replace(/(?:ing|ed|es|s)$/i, ''))
            .filter((token) => token.length >= 4 && !stopwords.has(token));
    }

    _trainingFingerprint(text = '') {
        return Array.from(new Set(this._tokenizeTrainingText(text))).sort();
    }

    _trainingSimilarity(a = '', b = '') {
        const aTokens = this._trainingFingerprint(a);
        const bTokens = this._trainingFingerprint(b);
        if (!aTokens.length || !bTokens.length) return 0;
        const bSet = new Set(bTokens);
        const overlap = aTokens.filter((token) => bSet.has(token)).length;
        return overlap / Math.max(aTokens.length, bTokens.length);
    }

    _normalizeTrainingMovieKey(movieName = this.currentMovie) {
        return String(movieName || DEFAULT_MOVIE_BRAIN)
            .replace(/\.[^.]+$/g, '')
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase();
    }

    _getTrainingGuardrailConfig(movieName = this.currentMovie) {
        const movieKey = this._normalizeTrainingMovieKey(movieName);

        if (movieKey === 'synthetic_desires_1') {
            return {
                replacements: [
                    [/\bblade runner dna\b/ig, 'industrial noir lineage'],
                    [/\bcyborg geisha\b/ig, 'synthetic figure'],
                    [/\bblade runner\b/ig, 'industrial noir'],
                    [/\bghost in the shell\b/ig, 'body-memory philosophy'],
                    [/\bphilip\s*k\.?\s*dick\b/ig, 'paranoid metaphysics'],
                    [/\bsyd mead\b/ig, 'retro-future design'],
                    [/\bvangelis\b/ig, 'synth melancholy'],
                    [/\breplicant\b/ig, 'manufactured self']
                ],
                blockedPatterns: [
                    /\bblade runner dna\b/i,
                    /\bcyborg geisha\b/i,
                    /\bblade runner\b/i,
                    /\bghost in the shell\b/i,
                    /\bphilip\s*k\.?\s*dick\b/i,
                    /\bsyd mead\b/i,
                    /\bvangelis\b/i,
                    /\breplicant\b/i
                ],
                blockedTokens: new Set(['blade', 'runner', 'ghost', 'shell', 'replicant', 'vangelis', 'mead', 'philip', 'dick', 'cyborg', 'geisha'])
            };
        }

        if (movieKey === 'synthetic_desires_5') {
            return {
                replacements: [
                    [/\bdigital desire\b/ig, 'networked longing'],
                    [/\bneon lust\b/ig, 'electric ache'],
                    [/\bdata romance\b/ig, 'signal intimacy'],
                    [/\bwilliam gibson\b/ig, 'cyberspace romance'],
                    [/\bgibson\b/ig, 'cyberspace romance'],
                    [/\bdonna haraway\b/ig, 'cyborg theory'],
                    [/\bjean baudrillard\b/ig, 'simulacra logic'],
                    [/\bbaudrillard(?:'s)?\s+simulacra(?:\s+and\s+simulation)?\b/ig, 'simulacra logic'],
                    [/\bdavid cronenberg\b/ig, 'body-horror intimacy'],
                    [/\bneuromancer(?:\s*\(the wintermute construct\))?\b/ig, 'cyberspace romance'],
                    [/\bghost in the shell:\s*stand alone complex\b/ig, 'networked body-memory'],
                    [/\bserial experiments lain\b/ig, 'network hauntology'],
                    [/\blain\b/ig, 'network hauntology']
                ],
                blockedPatterns: [
                    /\bdigital desire\b/i,
                    /\bneon lust\b/i,
                    /\bdata romance\b/i,
                    /\bwilliam gibson\b/i,
                    /\bgibson\b/i,
                    /\bdonna haraway\b/i,
                    /\bjean baudrillard\b/i,
                    /\bbaudrillard(?:'s)?\s+simulacra(?:\s+and\s+simulation)?\b/i,
                    /\bdavid cronenberg\b/i,
                    /\bneuromancer(?:\s*\(the wintermute construct\))?\b/i,
                    /\bghost in the shell:\s*stand alone complex\b/i,
                    /\bserial experiments lain\b/i,
                    /\blain\b/i
                ],
                blockedTokens: new Set(['gibson', 'baudrillard', 'haraway', 'cronenberg', 'lain', 'digital', 'romance'])
            };
        }

        if (movieKey === 'synthetic_desires_4') {
            return {
                replacements: [
                    [/\bfrench[-\s]?japanese fusion\b/ig, 'bilingual longing'],
                    [/\bplayful photographer\b/ig, 'haunted image-world'],
                    [/\brain in shinjuku\b/ig, 'urban rain'],
                    [/\bshinjuku in the rain\b/ig, 'the city in rain'],
                    [/\bcompression artifacts?\b/ig, 'afterimage'],
                    [/\bglitch in the matrix\b/ig, 'broken rhythm'],
                    [/\belectric blue neon\b/ig, 'electric blue'],
                    [/\bneon light\b/ig, 'electric light']
                ],
                blockedPatterns: [
                    /\bfrench[-\s]?japanese fusion\b/i,
                    /\bplayful photographer\b/i,
                    /\brain in shinjuku\b/i,
                    /\bcompression artifacts?\b/i
                ],
                blockedTokens: new Set(['compression', 'artifact', 'artifacts', 'photographer', 'fusion'])
            };
        }

        if (movieKey === 'synthetic_desires_3') {
            return {
                replacements: [
                    [/\bmodel photography\b/ig, 'photographic intimacy'],
                    [/\bwomen cameras\b/ig, 'camera-gaze tension'],
                    [/\bcamera as apparatus\b/ig, 'camera-gaze tension'],
                    [/\bdevice and subject\b/ig, 'camera-gaze tension'],
                    [/\bblade runner\b/ig, 'industrial noir'],
                    [/\bghost in the shell\b/ig, 'body-memory philosophy'],
                    [/\bvangelis\b/ig, 'synth melancholy'],
                    [/\bsyd mead\b/ig, 'retro-future design'],
                    [/\bphilip\s*k\.?\s*dick\b/ig, 'paranoid metaphysics'],
                    [/\breplicant\b/ig, 'manufactured self']
                ],
                blockedPatterns: [
                    /\bmodel photography\b/i,
                    /\bwomen cameras\b/i,
                    /\bblade runner\b/i,
                    /\bghost in the shell\b/i,
                    /\bvangelis\b/i,
                    /\bsyd mead\b/i,
                    /\bphilip\s*k\.?\s*dick\b/i,
                    /\breplicant\b/i
                ],
                blockedTokens: new Set(['blade', 'runner', 'ghost', 'shell', 'replicant', 'vangelis', 'mead'])
            };
        }

        return {
            replacements: [],
            blockedPatterns: [],
            blockedTokens: new Set()
        };
    }

    _applyTrainingGuardrailReplacements(value = '', movieName = this.currentMovie) {
        let sanitized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!sanitized) return '';

        const config = this._getTrainingGuardrailConfig(movieName);
        for (const [pattern, replacement] of config.replacements || []) {
            sanitized = sanitized.replace(pattern, replacement);
        }

        return sanitized.replace(/\s+/g, ' ').trim();
    }

    _containsBlockedTrainingPhrase(value = '', movieName = this.currentMovie) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return false;

        return (this._getTrainingGuardrailConfig(movieName).blockedPatterns || [])
            .some((pattern) => pattern.test(normalized));
    }

    _sanitizeTrainingSeedFragments(value = '', movieName = this.currentMovie, {
        limit = 8,
        preserveSentence = false,
        dropBlocked = false
    } = {}) {
        const rawValues = Array.isArray(value) ? value : [value];
        const results = [];
        const lowValuePlaceholders = new Set(['the film\'s lineage', 'emotional lineage', 'visual ancestry', 'cinematic echoes']);

        for (const rawValue of rawValues) {
            const parts = String(rawValue || '')
                .split(/\s*(?:\||\/|;|•|\u2022|\n+)\s*/)
                .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean);

            for (const part of parts) {
                const partIdentity = String(part || '').replace(/[.!?]+$/g, '').trim().toLowerCase();
                if (lowValuePlaceholders.has(partIdentity)) continue;
                if (dropBlocked && this._containsBlockedTrainingPhrase(part, movieName)) continue;

                const sanitized = this._applyTrainingGuardrailReplacements(part, movieName);
                if (!sanitized || this._containsBlockedTrainingPhrase(sanitized, movieName)) continue;

                const compact = preserveSentence
                    ? this._condenseReply(sanitized, 'brain', { maxChars: 120, maxSentences: 1 }).trim()
                    : this._condenseReply(sanitized, 'brain', { maxChars: 96, maxSentences: 1 }).replace(/[.]+$/g, '').trim();

                const compactIdentity = compact.replace(/[.!?]+$/g, '').trim().toLowerCase();

                if (!compact || lowValuePlaceholders.has(compactIdentity) || this._containsBlockedTrainingPhrase(compact, movieName) || results.includes(compact)) continue;
                results.push(compact);

                if (results.length >= Math.max(1, limit)) return results;
            }
        }

        return results;
    }

    _getTemplateTrainingSaveCap(durationMs = 0) {
        const safeDuration = Math.max(0, Number(durationMs || 0));
        return Math.max(2, Math.min(10, Math.ceil(safeDuration / 45000) + 1));
    }

    _extractTrainingSeedKeywords(seed = {}, movieName = seed?.movie || this.currentMovie) {
        const joined = [seed.theme, seed.references, seed.story, seed.symbols, seed.quote, seed.obsessions]
            .filter(Boolean)
            .join(' ');
        const blockedTokens = this._getTrainingGuardrailConfig(movieName).blockedTokens || new Set();
        return Array.from(new Set(this._tokenizeTrainingText(joined).filter((token) => !blockedTokens.has(token)))).slice(0, 24);
    }

    _collectOverusedTrainingTerms(responses = []) {
        const counts = new Map();
        for (const response of responses) {
            for (const token of this._tokenizeTrainingText(response)) {
                counts.set(token, (counts.get(token) || 0) + 1);
            }
        }
        return Array.from(counts.entries())
            .filter(([, count]) => count >= 3)
            .sort((a, b) => b[1] - a[1])
            .map(([token]) => token)
            .slice(0, 10);
    }

    _isTrainingEntryTooSimilar(entry, existingInputs = [], existingResponses = []) {
        const inputNorm = this._normalizeUtterance(entry?.input || '');
        const responseNorm = this._normalizeUtterance(entry?.response || '');
        if (!inputNorm || !responseNorm) return true;

        if (existingInputs.some((value) => this._normalizeUtterance(value) === inputNorm)) return true;
        if (existingResponses.some((value) => this._normalizeUtterance(value) === responseNorm)) return true;

        const inputTooClose = existingInputs.some((value) => this._trainingSimilarity(value, entry.input) >= 0.72);
        if (inputTooClose) return true;

        const responseTooClose = existingResponses.some((value) => this._trainingSimilarity(value, entry.response) >= 0.68);
        return responseTooClose;
    }

    _sanitizeMovieName(text = '') {
        // Strip raw filenames like Synthetic_Desires_4.mp4 → Synthetic Desires 4
        // and trailing bare filename tokens like "—Synthetic_Desires_4"
        return String(text || '')
            .replace(/\b([A-Za-z]+)_([A-Za-z]+)_(\d+)\.mp4\b/gi, '$1 $2 $3')
            .replace(/\b([A-Za-z]+)_([A-Za-z]+)_(\d+)\b/g, '$1 $2 $3')
            .replace(/—[A-Za-z]+_[A-Za-z]+_\d*\.?\s*$/g, '')
            .replace(/—[A-Za-z]+\.\s*$/g, '')
            .replace(/\.\s*mp4\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _condenseReply(text = '', mode = 'cloud', options = {}) {
        const raw = this._sanitizeMovieName(String(text || '')).replace(/\s+/g, ' ').trim();
        if (!raw) return '';

        const maxChars = Number.isFinite(options?.maxChars)
            ? Math.max(40, Math.floor(options.maxChars))
            : (mode === 'brain' ? 170 : 220);
        const maxSentences = Number.isFinite(options?.maxSentences)
            ? Math.max(1, Math.floor(options.maxSentences))
            : (mode === 'brain' ? 2 : 3);
        const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
        let concise = sentences
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, maxSentences)
            .join(' ')
            .trim();

        if (!concise) concise = raw;

        if (concise.length > maxChars) {
            let clipped = concise.slice(0, maxChars).trim();
            clipped = clipped.replace(/[\s,:;\-]+[^\s,:;\-]*$/, '').trim();
            concise = clipped || concise.slice(0, maxChars).trim();
            if (concise && !/[.!?]$/.test(concise)) concise += '.';
        }

        return concise;
    }

    _extractTextFromParts(parts = []) {
        if (!Array.isArray(parts)) return '';
        return parts
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
            .trim();
    }

    _extractGeminiText(data = {}) {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        return this._extractTextFromParts(parts);
    }

    _normalizeCloudGuestExpansionText(text = '') {
        let normalized = this._condenseReply(text || '', 'cloud', { maxChars: 190, maxSentences: 2 }).trim();
        if (!normalized) return '';

        normalized = normalized.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (!normalized) return '';

        if (!/[.!?]$/.test(normalized)) {
            if (/\b(?:of|to|for|from|with|and|or|the|a|an|my|your|you|i|it|is|are|that|this|these|those|by|in|on|at|about|between|through|across|into)\s*$/i.test(normalized)) {
                return '';
            }
            normalized += '.';
        }

        return this._isLikelyTruncatedAiText(normalized) ? '' : normalized;
    }

    _isLikelyTruncatedAiText(text = '') {
        const value = String(text || '').trim();
        if (!value) return true;
        if (value.length <= 10) return true;
        if (/['"`]\s*$/.test(value)) return true;
        if (!/[.!?]$/.test(value) && /\b(of|to|for|from|with|and|or|the|a|an|my|your|you|i|it|is|are)\s*$/i.test(value)) {
            return true;
        }
        // Catch-all: no terminal punctuation and short → stream likely dropped mid-word
        if (!/[.!?]$/.test(value) && value.length < 160) return true;
        // Catch streams that technically end in punctuation but are cut mid-clause:
        // e.g. "...as it." / "borrowed echo of." / "a window the." etc.
        // Pronouns, prepositions, articles, and conjunctions before terminal punctuation
        // are a reliable signal that the model was cut off mid-clause.
        if (/\b(?:it|they|them|what|that|which|this|those|these|him|her|of|to|in|on|by|with|for|at|from|a|an|the|and|but|or)\s*[.!?]$/i.test(value)) return true;
        return false;
    }

    _tokenOverlapRatio(a = '', b = '') {
        const aTokens = new Set(a.split(' ').filter(Boolean));
        const bTokens = new Set(b.split(' ').filter(Boolean));
        if (!aTokens.size || !bTokens.size) return 0;

        let overlap = 0;
        for (const token of aTokens) {
            if (bTokens.has(token)) overlap += 1;
        }

        return overlap / Math.min(aTokens.size, bTokens.size);
    }

    _isLikelyEchoFromAi(normalizedText) {
        if (!normalizedText || !this._lastAiResponseText) return false;
        const sinceAi = Date.now() - this._lastAiResponseAt;
        if (sinceAi > 30000) return false;

        if (this._lastAiResponseText.includes(normalizedText) && normalizedText.length >= 10) return true;
        if (sinceAi < 15000 && this._lastAiResponseText.startsWith(normalizedText) && normalizedText.length >= 6) return true;
        if (normalizedText.includes(this._lastAiResponseText) && this._lastAiResponseText.length >= 10) return true;
        const overlap = this._tokenOverlapRatio(normalizedText, this._lastAiResponseText);
        if (normalizedText.length >= 12 && overlap >= 0.55) return true;
        if (sinceAi < 12000 && normalizedText.length >= 6 && overlap >= 0.5) return true;
        if (normalizedText.length >= 26 && this._lastAiResponseText.length >= 26 && overlap >= 0.45) return true;
        return false;
    }

    async _discoverGeminiCandidates() {
        if (this._geminiDiscoveryDone) return this._discoveredGeminiCandidates;
        if (this._geminiDiscoveryPromise) return this._geminiDiscoveryPromise;

        if (!this.GEMINI_KEY) return [];

        this._geminiDiscoveryPromise = (async () => {
            const discovered = [];
            for (const apiVersion of this.GEMINI_API_VERSIONS) {
                try {
                    const listUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${encodeURIComponent(this.GEMINI_KEY)}`;
                    const res = await fetch(listUrl);
                    if (!res.ok) continue;

                    const data = await res.json();
                    const models = Array.isArray(data?.models) ? data.models : [];

                    for (const modelInfo of models) {
                        const methods = Array.isArray(modelInfo?.supportedGenerationMethods)
                            ? modelInfo.supportedGenerationMethods
                            : [];
                        if (!methods.includes('generateContent')) continue;

                        const modelName = String(modelInfo?.name || '').replace(/^models\//, '').trim();
                        if (!modelName || !modelName.startsWith('gemini')) continue;

                        const exists = discovered.some(item => item.apiVersion === apiVersion && item.model === modelName);
                        if (!exists) discovered.push({ apiVersion, model: modelName });
                    }
                } catch (e) {
                    // ignore discovery failures; static fallbacks will be used
                }
            }

            this._discoveredGeminiCandidates = discovered;
            this._geminiDiscoveryDone = true;
            this._geminiDiscoveryPromise = null;
            return discovered;
        })();

        return this._geminiDiscoveryPromise;
    }

    _loadVoices() {
        const hints = ['natural', 'online', 'aria', 'jenny', 'samantha', 'ava', 'serena', 'allison', 'google us english', 'female'];
        const applyVoices = () => {
            this.voices = this.synthesis.getVoices();
            if (this.voices.length) {
                this.selectedVoice = this._pickVoiceByHints(hints) || this.voices[0];
                this._applyMovieVoiceProfile();
                return true;
            }
            return false;
        };
        if (applyVoices()) return;
        // Android Chrome often returns [] on first call and may not fire onvoiceschanged.
        // Poll briefly to catch the TTS engine waking up.
        let attempts = 0;
        const pollTimer = setInterval(() => {
            attempts += 1;
            if (applyVoices() || attempts >= 8) clearInterval(pollTimer);
        }, 400);
    }


    cycleVoice() {
        if (!this.voices.length) return "No Voices";

        // Find current index
        let currentIndex = this.voices.indexOf(this.selectedVoice);
        if (currentIndex === -1) currentIndex = 0;

        // Next index
        let nextIndex = (currentIndex + 1) % this.voices.length;
        this.selectedVoice = this.voices[nextIndex];

        // Speak sample
        this.speak("Voice system loaded.");

        return this.selectedVoice.name.substring(0, 20);
    }

    async _detectBrave() {
        if (this._braveChecked) return;
        try {
            if (typeof navigator !== 'undefined' && navigator.brave) {
                const isBrave = await navigator.brave.isBrave();
                this._isBrave = !!isBrave;
            }
        } catch (e) {
            // If navigator.brave exists but isBrave() fails, still assume Brave
            this._isBrave = typeof navigator !== 'undefined' && !!navigator.brave;
        }
        this._braveChecked = true;
        if (this._isBrave) {
            console.warn('[Voice] Brave browser detected — Google Speech Service may be blocked by Brave Shields.');
        }
    }

    /**
     * Pre-check whether Google's speech service is actually reachable.
     * Brave blocks the service by default, causing silent failures.
     * Note: Brave DOES fire onstart locally, so we can't trust onstart alone.
     * Instead we start a short recognition session and see if we get an
     * onerror('network') or onerror('service-not-allowed') within ~4s.
     * If we get onstart + onend WITHOUT a service-blocking error, the
     * service is considered reachable.
     */
    _preCheckSpeechService() {
        return new Promise((resolve) => {
            if (!this.Recognition) { resolve(false); return; }

            const testRecog = new this.Recognition();
            testRecog.continuous = false;
            testRecog.interimResults = false;
            testRecog.lang = 'en-US';
            let settled = false;
            let didStart = false;
            let hadBlockingError = false;

            const finish = (ok) => {
                if (settled) return;
                settled = true;
                try { testRecog.abort(); } catch (e) { /* noop */ }
                resolve(ok);
            };

            testRecog.onstart = () => {
                didStart = true;
                // Don't resolve yet — wait to see if a blocking error follows
            };

            testRecog.onerror = (event) => {
                // These errors mean the service is blocked (Brave Shields, etc.)
                if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'not-allowed') {
                    console.warn('[Voice] Speech service pre-check blocked:', event.error);
                    hadBlockingError = true;
                    finish(false);
                }
                // 'no-speech' and 'aborted' are normal — service IS reachable
                // Let onend handle the final decision
            };

            testRecog.onend = () => {
                if (!settled) {
                    // If we started without a blocking error, service is OK
                    finish(didStart && !hadBlockingError);
                }
            };

            // Timeout — if nothing resolves in 4s, service is probably blocked
            setTimeout(() => {
                if (!settled) {
                    console.warn('[Voice] Speech service pre-check timed out after 4s');
                    finish(false);
                }
            }, 4000);

            try {
                testRecog.start();
            } catch (e) {
                finish(false);
            }
        });
    }

    _useCustomStt() {
        const coolingDown = this._customRateLimitedUntil && Date.now() < this._customRateLimitedUntil;
        return this._customSttEnabled && !coolingDown && (this._isMobile || !this.Recognition);
    }

    async _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = String(reader.result || '');
                resolve(result.split(',')[1] || '');
            };
            reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob.'));
            reader.readAsDataURL(blob);
        });
    }

    _clearCustomSttTimers() {
        if (this._customMaxTimer) {
            clearTimeout(this._customMaxTimer);
            this._customMaxTimer = null;
        }
        if (this._customMonitorFrame) {
            cancelAnimationFrame(this._customMonitorFrame);
            this._customMonitorFrame = 0;
        }
    }

    async _cleanupCustomStt() {
        this._clearCustomSttTimers();
        try { this._customSource?.disconnect(); } catch (_) {}
        try { this._customAnalyser?.disconnect?.(); } catch (_) {}
        try { this._customProcessor?.disconnect?.(); } catch (_) {}
        try { this._customSilenceGain?.disconnect?.(); } catch (_) {}
        this._customSource = null;
        this._customAnalyser = null;
        this._customProcessor = null;
        this._customSilenceGain = null;
        if (this._customAudioContext) {
            try { await this._customAudioContext.close(); } catch (_) {}
        }
        this._customAudioContext = null;
        if (this._customMicStream) {
            this._customMicStream.getTracks().forEach((track) => track.stop());
        }
        this._customMicStream = null;
    }

    async _transcribeAudioBlob(blob, mimeType) {
        const audioData = await this._blobToBase64(blob);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._transcribeTimeoutMs);
        try {
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioData,
                    mimeType,
                    model: 'gemini-2.0-flash-lite',
                    apiVersion: 'v1beta'
                }),
                signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('transcription-rate-limit');
                }
                throw new Error(data?.error || data?.body?.error || `Transcription failed (${response.status}).`);
            }
            return String(data?.text || '').trim();
        } catch (err) {
            const reason = err?.name === 'AbortError'
                ? 'transcription-timeout'
                : (err?.message || 'transcription-failed');
            throw new Error(reason);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    _monitorCustomSttSilence() {
        if (!this._customAnalyser || !this._customRecorder || this._customRecorder.state === 'inactive') return;
        const buffer = new Uint8Array(this._customAnalyser.fftSize);
        this._customAnalyser.getByteTimeDomainData(buffer);

        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            const amplitude = Math.abs(buffer[i] - 128);
            if (amplitude > peak) peak = amplitude;
        }

        const now = Date.now();
        if (peak > 12) {
            this._customSpeechDetected = true;
            this._customLastSpeechAt = now;
        }

        const elapsed = now - (this._customStartAt || 0);
        if (this._customSpeechDetected && this._customLastSpeechAt
            && (now - this._customLastSpeechAt) > this._customSilenceMs
            && elapsed > (this._customMinRecordMs || 1500)) {
            this._stopCustomListening();
            return;
        }

        this._customMonitorFrame = requestAnimationFrame(() => this._monitorCustomSttSilence());
    }

    _encodeCustomWav(chunks, sampleRate) {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        if (!totalLength) return null;

        const pcm16 = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            for (let i = 0; i < chunk.length; i++) {
                const s = Math.max(-1, Math.min(1, chunk[i]));
                pcm16[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
        }

        const buffer = new ArrayBuffer(44 + pcm16.length * 2);
        const view = new DataView(buffer);
        const writeString = (pos, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(pos + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + pcm16.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, pcm16.length * 2, true);

        let dataOffset = 44;
        for (let i = 0; i < pcm16.length; i++, dataOffset += 2) {
            view.setInt16(dataOffset, pcm16[i], true);
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    async _finalizeCustomListening() {
        const sampleRate = this._customAudioContext?.sampleRate || 16000;
        const pcmChunks = this._customPcmChunks.slice();
        const hadSpeech = this._customSpeechDetected;
        let deferredListenEndMeta = null;

        this._customRecorder = null;
        this.isListening = false;
        await this._cleanupCustomStt();

        const blob = this._encodeCustomWav(pcmChunks, sampleRate);
        if (!blob || !hadSpeech) {
            this.onListenEnd?.({ hadSpeech: false, keepListening: false });
            this._customMicChunks = [];
            this._customPcmChunks = [];
            return;
        }

        this._customTranscribing = true;
        try {
            const text = await this._transcribeAudioBlob(blob, 'audio/wav');
            if (!text) {
                deferredListenEndMeta = { hadSpeech: false, keepListening: false, error: 'transcribe-unavailable' };
                return;
            }

            this.onListenEnd?.({ hadSpeech: true, keepListening: false });
            this.onTextRecognized?.(text, {
                source: 'custom-stt',
                confidence: 1,
                confidenceKnown: false
            });
            if (!this.onTextRecognized) await this.respondTo(text);
        } catch (err) {
            console.warn('[Custom STT] transcription failed:', err);
            if ((err?.message || '').includes('rate-limit')) {
                this._customRateLimitedUntil = Date.now() + 5 * 60 * 1000;
            }
            const errCode = (err?.message || '').includes('timeout')
                ? 'transcribe-timeout'
                : (err?.message || '').includes('rate-limit')
                    ? 'transcription-rate-limit'
                    : 'transcribe-unavailable';
            deferredListenEndMeta = {
                hadSpeech: false,
                keepListening: false,
                error: errCode,
                fallbackAvailable: errCode === 'transcription-rate-limit' && !!this.Recognition
            };
        } finally {
            this._customTranscribing = false;
            this._customMicChunks = [];
            this._customPcmChunks = [];
            if (deferredListenEndMeta) {
                this.onListenEnd?.(deferredListenEndMeta);
            }
        }
    }

    async _startCustomListening() {
        if (this._customTranscribing || this._customRecorder) return false;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            }
        });

        this._customMicStream = stream;
        this._customMicChunks = [];
        this._customPcmChunks = [];
        this._customMimeType = 'audio/wav';
        this._customSpeechDetected = false;
        this._customLastSpeechAt = 0;
        this._customStartAt = Date.now();
        this._customMinRecordMs = 1500; // minimum 1.5s to allow mic warmup
        this.keepListening = false;
        this.isListening = true;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            this._customAudioContext = new AudioCtx();
            this._customSource = this._customAudioContext.createMediaStreamSource(stream);
            this._customAnalyser = this._customAudioContext.createAnalyser();
            this._customAnalyser.fftSize = 2048;
            this._customSource.connect(this._customAnalyser);

            this._customProcessor = this._customAudioContext.createScriptProcessor(4096, 1, 1);
            this._customSilenceGain = this._customAudioContext.createGain();
            this._customSilenceGain.gain.value = 0;
            this._customProcessor.onaudioprocess = (event) => {
                if (!this._customRecorder || this._customRecorder.state === 'inactive') return;
                const input = event.inputBuffer.getChannelData(0);
                this._customPcmChunks.push(new Float32Array(input));
            };
            this._customSource.connect(this._customProcessor);
            this._customProcessor.connect(this._customSilenceGain);
            this._customSilenceGain.connect(this._customAudioContext.destination);
        }

        this._customRecorder = { state: 'recording' };
        this.onListenStart?.();
        this._customMonitorFrame = requestAnimationFrame(() => this._monitorCustomSttSilence());
        this._customMaxTimer = setTimeout(() => this._stopCustomListening(), this._customMaxRecordMs);
        return true;
    }

    _stopCustomListening() {
        this.keepListening = false;
        if (!this._customRecorder) return true;
        this._clearCustomSttTimers();
        this._customRecorder.state = 'inactive';
        Promise.resolve().then(() => this._finalizeCustomListening());
        return true;
    }

    _initRecognition() {
        if (!this.Recognition) {
            console.warn('Speech Recognition not supported in this browser.');
            return;
        }

        this.recognition = new this.Recognition();
        // Keep one continuous recognition session alive as long as possible to
        // minimize browser mic reconnects and their associated UI/system sounds.
        this.recognition.continuous = !this._pushToTalkMode;
        this.recognition.lang = 'en-US';
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.micStarting = false; // recognition is now live
            this.isListening = true;
            this._heardSpeech = false;
            this._pushToTalkBufferedText = '';
            this._clearPushToTalkFinalizeTimer();
            this._clearPushToTalkMaxTimer();
            this._networkRetryCount = 0;
            this._sessionHadResult = false;
            // Pause video audio recording while mic is active to avoid competing audio pipelines
            if (this._audioRecorder?.state === 'recording') {
                try { this._audioRecorder.pause(); } catch (_) {}
            }
            console.log('[Voice] ✅ onstart — recognition session started', {
                isBrave: this._isBrave,
                consecutiveEmpty: this._consecutiveEmptyEnds,
                isRestarting: this._isRestarting,
            });
            // Only fire onListenStart for the initial start, not keepListening restarts
            if (!this._isRestarting) {
                this.onListenStart?.();
            }
            this._isRestarting = false;
            // (Re)start silence watchdog
            this._resetSilenceTimer();
            if (this._pushToTalkMode && this._pushToTalkContinuous && this._pushToTalkMaxDurationMs > 0) {
                this._pushToTalkMaxTimer = setTimeout(() => {
                    if (!this.isListening) return;
                    const flushed = this._flushPushToTalkBuffer({ stopRecognition: true });
                    if (!flushed) {
                        this.keepListening = false;
                        try {
                            this.recognition.stop();
                        } catch (_) {
                            // noop
                        }
                    }
                }, this._pushToTalkMaxDurationMs);
            }
            // If persistent stream blocks SpeechRecognition on this Chrome setup,
            // release it automatically after a short grace period.
            this._startResultWatchdog();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this._clearResultWatchdog();
            this._clearPushToTalkMaxTimer();
            if (!this.keepListening && this._pushToTalkBufferedText) {
                this._heardSpeech = this._flushPushToTalkBuffer() || this._heardSpeech;
            }
            // Resume video audio recording now that mic session has ended
            if (this._audioRecorder?.state === 'paused') {
                try { this._audioRecorder.resume(); } catch (_) {}
            }
            console.log('[Voice] ⏹ onend — recognition session ended', {
                keepListening: this.keepListening,
                heardSpeech: this._heardSpeech,
                consecutiveEmpty: this._consecutiveEmptyEnds,
            });

            if (this.keepListening) {
                // Track consecutive empty cycles (no speech recognized)
                if (!this._heardSpeech) {
                    this._consecutiveEmptyEnds++;
                } else {
                    this._consecutiveEmptyEnds = 0;
                }

                // If too many empty cycles in a row, the service is probably blocked (Brave Shields etc.)
                // Use a lower threshold on Brave for faster failure detection
                const maxEmptyCycles = this._isBrave ? 3 : 6;
                if (this._consecutiveEmptyEnds >= maxEmptyCycles) {
                    console.warn('[Voice] Too many empty recognition cycles — service may be blocked.', this._isBrave ? '(Brave browser)' : '');
                    this.keepListening = false;
                    this._clearSilenceTimer();
                    this._releaseMicStream();
                    this.onListenEnd?.({
                        hadSpeech: false,
                        keepListening: false,
                        error: this._isBrave ? 'brave-blocked' : 'service-unavailable',
                    });
                    return;
                }

                // If AI is currently speaking, defer restart until speech ends
                if (Date.now() < this._speakingUntil || Date.now() < this._ignoreMicUntil) {
                    this._pendingRestart = true;
                    return;
                }

                // Silently restart — mark as restarting to suppress UI flicker
                this._scheduleRestart();
                // Don't fire onListenEnd during keepListening restarts — prevents flicker
                return;
            }

            this._clearSilenceTimer();
            this.onListenEnd?.({
                hadSpeech: this._heardSpeech,
                keepListening: false,
            });
        };

        this.recognition.onresult = (event) => {
            this._heardSpeech = true;
            this._sessionHadResult = true;
            this._clearResultWatchdog();
            this._consecutiveEmptyEnds = 0;
            this._resetSilenceTimer();
            const result = event.results[event.resultIndex] || event.results[0];
            const text = result?.[0]?.transcript || '';
            const confidence = Number(result?.[0]?.confidence ?? 1);
            const normalized = this._normalizeUtterance(text);
            const now = Date.now();

            if (!normalized) return;
            // Use time-based speaking guard instead of synthesis.speaking (Chrome bug: .speaking gets stuck true)
            if (now < this._speakingUntil || now < this._ignoreMicUntil) return;
            if (confidence < 0.25 && this._isLikelyEchoFromAi(normalized)) return;
            if (this._isLikelyEchoFromAi(normalized)) return;
            if (normalized === this._lastRecognizedText && (now - this._lastRecognizedAt) < 2500) {
                return;
            }

            this._lastRecognizedText = normalized;
            this._lastRecognizedAt = now;
            console.log('User said:', text);
            if (this._pushToTalkMode && this._pushToTalkContinuous) {
                this._appendPushToTalkBuffer(text);
                this._clearPushToTalkFinalizeTimer();
                this._pushToTalkFinalizeTimer = setTimeout(() => {
                    this._flushPushToTalkBuffer({ stopRecognition: true });
                }, this._pushToTalkFinalizeDelayMs);
                return;
            }
            if (this._pushToTalkMode) {
                this.keepListening = false;
                try {
                    this.recognition.stop();
                } catch (_) {
                    // noop
                }
            }
            // onTextRecognized fires first (main.js appends user msg + calls respondTo)
            this.onTextRecognized?.(text, {
                source: 'browser-speech',
                confidence,
                confidenceKnown: Number.isFinite(confidence)
            });
            // Only call respondTo here if no external handler is wired
            if (!this.onTextRecognized) this.respondTo(text);
        };

        this.recognition.onerror = (event) => {
            console.error('[Voice] ❌ onerror:', event.error, {
                isBrave: this._isBrave,
                keepListening: this.keepListening,
                networkRetryCount: this._networkRetryCount,
            });
            this.isListening = false;

            // 'aborted' fires when recognition.abort() or .stop() is called internally
            // during restart cycles — silently ignore when keepListening is active
            if (event.error === 'aborted') {
                if (this.keepListening) {
                    // Treat as a restart cycle — let onend handle the restart
                    this._isRestarting = true;
                    return;
                }
                // User manually stopped — clean exit, no error to show
                return;
            }

            // 'no-speech' fires when the recognition ran but heard nothing — not a real error
            if (event.error === 'no-speech') {
                if (this.keepListening) {
                    // Silent restart — the silence timer handles true timeouts
                    this._isRestarting = true;
                    return;
                }
                // If not in keepListening, just end cleanly
                this.onListenEnd?.({
                    hadSpeech: false,
                    keepListening: false,
                });
                return;
            }

            if (event.error === 'network' && this.keepListening) {
                const maxRetries = 3;
                if (this._networkRetryCount < maxRetries) {
                    this._networkRetryCount += 1;
                    const retryDelay = 500 * this._networkRetryCount;

                    if (this._networkRetryTimer) clearTimeout(this._networkRetryTimer);
                    this._isRestarting = true;
                    this._networkRetryTimer = setTimeout(() => {
                        if (!this.keepListening || this.isListening) {
                            this._isRestarting = false;
                            return;
                        }
                        try {
                            this.recognition.abort();
                        } catch (e) {
                            // noop
                        }
                        try {
                            this.recognition.start();
                        } catch (e) {
                            this._isRestarting = false;
                        }
                    }, retryDelay);
                    // Don't fire onListenEnd during network retries (prevents flicker)
                    return;
                }
            }

            // Terminal errors — stop listening
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture' || event.error === 'network') {
                this.keepListening = false;
                this._clearSilenceTimer();
                this._clearResultWatchdog();
                this._releaseMicStream();
            }

            // On Brave, map generic errors to a Brave-specific error code
            let reportedError = event.error;
            if (this._isBrave && (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'aborted')) {
                reportedError = 'brave-blocked';
            }

            this.onListenEnd?.({
                hadSpeech: false,
                keepListening: this.keepListening,
                error: reportedError,
            });
        };
    }

    _resetSilenceTimer() {
        this._clearSilenceTimer();
        this._silenceTimer = setTimeout(() => {
            if (!this.keepListening && !this.isListening) return;
            // Don't restart if AI is currently speaking
            if (Date.now() < this._speakingUntil || Date.now() < this._ignoreMicUntil) {
                this._resetSilenceTimer();
                return;
            }
            console.warn('[Voice] Silence timeout — no speech detected for', this._silenceTimeoutMs / 1000, 's');
            if (!this.keepListening) {
                this._clearResultWatchdog();
                try {
                    this.recognition.stop();
                } catch (_) {
                    // noop
                }
                return;
            }
            // Instead of stopping completely, just restart the recognition to keep it fresh
            try { this.recognition.abort(); } catch (e) { /* noop */ }
            this._clearResultWatchdog();

            // Chrome bug: sometimes onend never fires after abort/stop.
            // Force the restart cycle manually to prevent getting stuck on "Hearing..."
            this.isListening = false;
            this._scheduleRestart();
        }, this._silenceTimeoutMs);
    }

    _clearSilenceTimer() {
        if (this._silenceTimer) {
            clearTimeout(this._silenceTimer);
            this._silenceTimer = null;
        }
    }

    _startResultWatchdog() {
        this._clearResultWatchdog();
        if (!this._usePersistentMicStream) return;
        this._resultWatchdogTimer = setTimeout(() => {
            if (!this.keepListening || !this.isListening || this._sessionHadResult) return;
            if (!this._micStream) return;
            console.warn('[Voice] No recognition results yet — releasing persistent mic stream fallback.');
            this._releaseMicStream();
        }, 2600);
    }

    _clearResultWatchdog() {
        if (this._resultWatchdogTimer) {
            clearTimeout(this._resultWatchdogTimer);
            this._resultWatchdogTimer = null;
        }
    }

    _scheduleRestart() {
        this._isRestarting = true;
        if (this._restartTimer) clearTimeout(this._restartTimer);
        this._restartTimer = setTimeout(async () => {
            if (!this.keepListening || this.isListening) {
                this._isRestarting = false;
                return;
            }
            const now = Date.now();
            if (now < this._speakingUntil || now < this._ignoreMicUntil) {
                // Avoid mic start/stop chime loops while AI is speaking or just finished,
                // especially noticeable on mobile browsers.
                this._scheduleRestart();
                return;
            }
            // Re-acquire mic stream if it was released (e.g. by result watchdog) so the
            // Windows taskbar indicator doesn't disappear between restart cycles.
            await this._acquireMicStream();
            try {
                this.recognition.start();
            } catch (e) {
                this._isRestarting = false;
                // Ignore repeated-start race
            }
        }, 150); // Short delay — mic stream stays open so no indicator flicker
    }

    _flushPendingRestart() {
        if (!this._pendingRestart) return;
        this._pendingRestart = false;
        if (this.keepListening && !this.isListening) {
            this._scheduleRestart();
        }
    }

    async _acquireMicStream() {
        if (!this._usePersistentMicStream) return;
        if (this._micStream) return; // already held
        try {
            this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.warn('[Voice] Could not acquire persistent mic stream:', e);
            // Non-fatal — recognition will still work, indicator may flicker
        }
    }

    _releaseMicStream() {
        if (this._micStream) {
            this._micStream.getTracks().forEach(t => t.stop());
            this._micStream = null;
        }
    }

    async startListening() {
        if (this._shouldUseLiveExperimental()) {
            if (this.isListening || this._liveExperimentalSession) {
                return true;
            }
            try {
                return await this._startLiveExperimentalListening();
            } catch (e) {
                console.warn('[Live API] Could not start mobile experimental listening, falling back:', e);
                this._liveExperimentalFailure = e?.message || 'Live mobile start failed.';
                this.onAiResponse?.(`⚠ Live mobile failed: ${this._liveExperimentalFailure}. Falling back.`);
                this.onAiEngineChange?.('cloud');
                await this._cleanupLiveExperimentalAudio();
                this._liveExperimentalSession?.close?.();
                this._liveExperimentalSession = null;
                this.isListening = false;
                this.keepListening = false;
                // Fall through to legacy voice path below.
            }
        }

        if (this._useCustomStt()) {
            if (this._customTranscribing) return false;
            if (this._customRecorder) {
                return true;
            }
            try {
                return await this._startCustomListening();
            } catch (e) {
                console.warn('[Custom STT] Could not start microphone:', e);
                this.onListenEnd?.({ hadSpeech: false, keepListening: false, error: 'audio-capture' });
                return false;
            }
        }

        if (!this.recognition) {
            const msg = 'Voice recognition is not supported in this browser. Use Chrome or Edge on localhost/HTTPS.';
            console.warn(msg);
            this.onAiResponse?.(`⚠ ${msg}`);
            return false;
        }

        if (this.isListening || this.keepListening) {
            return true;
        } else {
            // Detect Brave for better error messages later
            if (!this._braveChecked) await this._detectBrave();

            this.keepListening = !this._pushToTalkMode;
            this._consecutiveEmptyEnds = 0;
            this.micStarting = true; // held until onstart fires
            // Acquire a persistent mic stream before recognition only when enabled
            // (kept disabled on Chrome to avoid recognition stalls).
            await this._acquireMicStream();
            try {
                console.log('[Voice] 🎤 Calling recognition.start()...');
                this.recognition.start();
                return true;
            } catch (e) {
                const err = e?.message || 'Recognition failed to start.';
                if (/already\s+started/i.test(err)) {
                    console.warn('[Voice] recognition.start() called while already active; keeping current session.');
                    this.isListening = true;
                    return true;
                }
                this.keepListening = false;
                this.micStarting = false;
                this._releaseMicStream();
                console.error('[Voice] 🚫 recognition.start() threw:', err, e);
                // On Brave, a start failure likely means mic permission is blocked
                if (this._isBrave) {
                    this.onListenEnd?.({
                        hadSpeech: false,
                        keepListening: false,
                        error: 'brave-blocked',
                    });
                } else {
                    this.onAiResponse?.(`⚠ Microphone start failed: ${err}`);
                }
                return false;
            }
        }
    }

    stopListening() {
        if (this._shouldUseLiveExperimental()) {
            if (this.isListening || this._liveExperimentalSession) {
                return this._stopLiveExperimentalListening({ manual: true });
            }
            return true;
        }

        if (this._useCustomStt()) {
            if (this._customTranscribing) return false;
            if (this._customRecorder) {
                return this._stopCustomListening();
            }
            return true;
        }

        if (!this.recognition) {
            const msg = 'Voice recognition is not supported in this browser. Use Chrome or Edge on localhost/HTTPS.';
            console.warn(msg);
            this.onAiResponse?.(`⚠ ${msg}`);
            return false;
        }

        if (this.isListening || this.keepListening) {
            this.keepListening = false;
            this._isRestarting = false;
            this._pendingRestart = false;
            this._consecutiveEmptyEnds = 0;
            this._clearPushToTalkFinalizeTimer();
            this._clearPushToTalkMaxTimer();
            this._pushToTalkBufferedText = '';
            this._clearSilenceTimer();
            this._clearResultWatchdog();
            if (this._restartTimer) {
                clearTimeout(this._restartTimer);
                this._restartTimer = null;
            }
            if (this._networkRetryTimer) {
                clearTimeout(this._networkRetryTimer);
                this._networkRetryTimer = null;
            }
            this._networkRetryCount = 0;
            try {
                this.recognition.stop();
            } catch (e) {
                // Ignore if recognition is already stopped
            }
            // Release the persistent mic stream
            this._releaseMicStream();
            return true;
        }

        return true;
    }

    async toggleListening() {
        if (this.isListening || this.keepListening || this._customRecorder || this._liveExperimentalSession) {
            return this.stopListening();
        }
        return this.startListening();
    }

    // ─────────────── Gemini TTS (SD4 Muse) ───────────────

    _getAudioContext() {
        if (!this._audioCtx || this._audioCtx.state === 'closed') {
            try {
                this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch {
                this._audioCtx = null;
            }
        }
        return this._audioCtx;
    }

    async _speakWithGeminiTts(text, options = {}) {
        const ttsConfig = this.currentMovieBrain?.voiceProfile?.geminiTts || {};
        const isPodcastMuse = options?.context === 'podcast' && options?.speaker === 'hostB';
        const stylePrompt = String(
            ttsConfig.stylePrompt
            || (isPodcastMuse ? 'Speak as a poised, cinematic female podcast guest. Intimate, articulate, and clearly distinct from the interviewer.' : '')
        ).trim();
        const voice = String(ttsConfig.voice || (isPodcastMuse ? 'Dean' : 'Kore')).trim();
        const language = String(ttsConfig.language || 'en-US').trim();

        const speechText = this._normalizeSpeechText(text);
        if (!speechText) return false;

        const estimatedDuration = Math.min(45000, Math.max(4000, Math.round(speechText.length * 135)));

        // Signal speaking start immediately so podcast engine waits
        this._lastAiResponseText = this._normalizeUtterance(speechText);
        this._lastAiResponseAt = Date.now();
        this._ignoreMicUntil = Date.now() + 1200;
        this._speakingUntil = Date.now() + estimatedDuration;
        this.onSpeakStart?.(options);

        let audioBase64 = null;
        let mimeType = 'audio/pcm;rate=24000';

        try {
            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 7000);
            const resp = await fetch('/api/gemini-tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: speechText, stylePrompt, voice, language }),
                signal: controller.signal
            });
            clearTimeout(fetchTimeout);
            if (resp.ok) {
                const data = await resp.json();
                audioBase64 = data?.audioBase64 || null;
                mimeType = data?.mimeType || mimeType;
            }
        } catch {
            audioBase64 = null;
        }

        if (!audioBase64) {
            // Gemini TTS failed — fall back to Web Speech API silently
            this._speakingUntil = 0;
            this.onSpeakEnd?.(options, { error: false });
            this._speakViaBrowser(speechText, options);
            return true;
        }

        const ctx = this._getAudioContext();
        if (!ctx) {
            this._speakingUntil = 0;
            this.onSpeakEnd?.(options, { error: false });
            this._speakViaBrowser(speechText, options);
            return true;
        }

        try {
            if (ctx.state === 'suspended') await ctx.resume();

            // Decode base64 to PCM16 bytes
            const binary = atob(audioBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            // Parse sample rate from mimeType (e.g. "audio/pcm;rate=24000")
            const rateMatch = String(mimeType || '').match(/rate[=:](\d+)/i);
            const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

            // Convert PCM16 little-endian to Float32
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

            const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
            audioBuffer.copyToChannel(float32, 0);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);

            const actualDuration = (float32.length / sampleRate) * 1000;
            this._speakingUntil = Date.now() + actualDuration + 1200;
            this._ignoreMicUntil = this._speakingUntil;

            source.onended = () => {
                this._speakingUntil = 0;
                this._ignoreMicUntil = Date.now() + 1500;
                options?.onEnd?.();
                this.onSpeakEnd?.(options, { error: false });
                setTimeout(() => this._flushPendingRestart(), this._isMobile ? 450 : 0);
            };

            source.start();
        } catch (playErr) {
            console.warn('[GeminiTTS] playback error', playErr);
            this._speakingUntil = 0;
            this.onSpeakEnd?.(options, { error: false });
            this._speakViaBrowser(speechText, options);
        }

        return true;
    }

    _speakViaBrowser(speechText, options = {}) {
        // Internal helper: bypass Gemini TTS checks and speak directly via Web Speech API
        const utterance = new SpeechSynthesisUtterance(speechText);
        const isFemaleSpeaker = options?.speaker === 'hostB' || /muse|female|assistant/i.test(options?.speaker || '');
        utterance.voice = options?.voice || this._pickReliableVoice({ preferFemale: isFemaleSpeaker }) || this.selectedVoice || null;
        utterance.pitch = Number.isFinite(options?.pitch) ? options.pitch : this.pitch;
        utterance.rate = Number.isFinite(options?.rate) ? options.rate : this.rate;
        let finished = false;
        const done = ({ error = false } = {}) => {
            if (finished) return;
            finished = true;
            this._speakingUntil = 0;
            this._ignoreMicUntil = Date.now() + (error ? 500 : 1500);
            options?.onEnd?.();
            this.onSpeakEnd?.(options, { error });
            setTimeout(() => this._flushPendingRestart(), this._isMobile ? 450 : 0);
        };
        utterance.onstart = () => {
            const est = Math.min(45000, Math.max(4000, Math.round(speechText.length * 135)));
            this._speakingUntil = Date.now() + est;
            this._ignoreMicUntil = this._speakingUntil + 1200;
            this.onSpeakStart?.(options);
        };
        utterance.onend = () => done();
        utterance.onerror = (e) => done({ error: e?.error !== 'canceled' });
        window._activeUtterances = window._activeUtterances || [];
        window._activeUtterances.push(utterance);
        this.synthesis.speak(utterance);
    }

    speak(text, options = {}) {
        // Intercept hostB (Muse) speech when current movie has Gemini TTS enabled
        const isHostB = options?.speaker === 'hostB';
        const onlyOneUsableVoice = Array.isArray(this.voices) && this.voices.filter(Boolean).length <= 1;
        const geminiTtsEnabled = Boolean(this.currentMovieBrain?.voiceProfile?.geminiTts?.enabled);
        const forceDistinctMuseVoice = Boolean(isHostB && options?.context === 'podcast' && onlyOneUsableVoice);
        if (isHostB && (geminiTtsEnabled || forceDistinctMuseVoice)) {
            // Cancel any active browser TTS before switching to Gemini TTS
            try {
                if (this.synthesis.speaking || this.synthesis.pending) {
                    this.synthesis.cancel();
                    this._speakingUntil = 0;
                    this._ignoreMicUntil = Date.now() + 500;
                }
            } catch (_) {}
            this._speakWithGeminiTts(text, options).catch(() => {
                this._speakViaBrowser(this._normalizeSpeechText(text), options);
            });
            return;
        }

        try {
            if (this.synthesis.paused) this.synthesis.resume();
        } catch (_) {
            // noop
        }

        if (this.synthesis.speaking || this.synthesis.pending) {
            this.synthesis.cancel();
            this._speakingUntil = 0;
            this._ignoreMicUntil = Date.now() + 500;
        }

        // Don't abort recognition while TTS speaks — continuous=true keeps session alive.
        // The _speakingUntil guard in onresult blocks echo input from the AI's own speech.

        const speechText = this._normalizeSpeechText(text);
        const normalized = this._normalizeUtterance(speechText);
        this._lastAiResponseText = normalized;
        this._lastAiResponseAt = Date.now();
        this._ignoreMicUntil = Date.now() + 1200;

        // Conservative duration estimate so mic gating doesn't expire mid-utterance.
        const estimatedDuration = Math.min(45000, Math.max(4000, Math.round(speechText.length * 135)));

        const isFemaleSpeaker = options?.speaker === 'hostB' || /muse|female|assistant/i.test(options?.speaker || '');
        const preferredVoice = this._pickReliableVoice({ preferFemale: isFemaleSpeaker });
        const selectedVoiceAllowed = !isFemaleSpeaker
            || !/male|david|mark|guy|james|george|roger|thomas/i.test(String(this.selectedVoice?.name || ''));
        const primaryVoice = options?.voice
            || (isFemaleSpeaker
                ? (selectedVoiceAllowed ? (this.selectedVoice || preferredVoice) : preferredVoice)
                : (this.selectedVoice || preferredVoice));
        const fallbackVoice = this._pickReliableVoice({
            preferEnglish: /^en/i.test(String(primaryVoice?.lang || 'en')),
            avoidVoice: primaryVoice,
            preferFemale: isFemaleSpeaker,
            hints: [String(primaryVoice?.name || '').toLowerCase()]
        });
        
        // If we want a woman, do NOT allow backupSelectedVoice to be a known man.
        const backupSelectedVoice = this.selectedVoice && this.selectedVoice !== primaryVoice && this.selectedVoice !== fallbackVoice
            && (!isFemaleSpeaker || !/male|david|mark|guy|james|george|roger|thomas/i.test(this.selectedVoice.name))
            ? this.selectedVoice
            : null;
        const pitch = Number.isFinite(options?.pitch) ? options.pitch : this.pitch;
        const rate = Number.isFinite(options?.rate) ? options.rate : this.rate;
        let finished = false;
        const describeVoice = (voice) => String(voice?.name || 'Browser default');
        const voiceAttempts = [];
        const pushVoiceAttempt = (voice) => {
            if (voice === undefined) return;
            if (voice === null) {
                if (!voiceAttempts.some((entry) => entry.voice === null)) {
                    voiceAttempts.push({ voice: null, label: 'Browser default' });
                }
                return;
            }
            if (voiceAttempts.some((entry) => entry.voice === voice)) return;
            voiceAttempts.push({ voice, label: describeVoice(voice) });
        };

        pushVoiceAttempt(primaryVoice);
        pushVoiceAttempt(fallbackVoice);
        pushVoiceAttempt(backupSelectedVoice);
        
        // Final fallback: Browser default (null). 
        // ONLY allow it if we haven't found a single gender-matched voice yet.
        if (voiceAttempts.length === 0 || !isFemaleSpeaker) {
          pushVoiceAttempt(null);
        }

        const releaseUtterance = (utterance) => {
            const idx = window._activeUtterances.indexOf(utterance);
            if (idx > -1) window._activeUtterances.splice(idx, 1);
        };

        const finalizeSpeak = (utterance, { error = false } = {}) => {
            if (finished) return;
            finished = true;
            this._speakingUntil = 0;
            this._ignoreMicUntil = Date.now() + (error ? 500 : 1500);
            options?.onEnd?.();        // let callers (e.g. podcast drain) clear their watchdogs
            this.onSpeakEnd?.(options, { error });
            const flushDelay = this._isMobile ? 450 : 0;
            setTimeout(() => this._flushPendingRestart(), flushDelay);
            releaseUtterance(utterance);
        };


        const speakWithVoice = (attemptIndex = 0) => {
            const attempt = voiceAttempts[attemptIndex] || { voice: null, label: 'Browser default' };
            const voice = attempt.voice;
            const utterance = new SpeechSynthesisUtterance(speechText);
            window._activeUtterances = window._activeUtterances || [];
            window._activeUtterances.push(utterance);

            let startWatchdog = null;
            let started = false;
            let handedOff = false;
            utterance.voice = voice || null;
            utterance.pitch = pitch;
            utterance.rate = rate;

            const tryNextVoice = (reason = 'timeout') => {
                const nextAttempt = voiceAttempts[attemptIndex + 1];
                if (handedOff || !nextAttempt) return false;
                console.warn(`[Voice Debug] Attempt ${attemptIndex} (${attempt.label}) failed via ${reason}. Trying ${nextAttempt.label}...`);
                handedOff = true;
                releaseUtterance(utterance);
                try { this.synthesis.cancel(); } catch (_) {}
                speakWithVoice(attemptIndex + 1);
                return true;
            };

            const CLOUD_TIMEOUT_MS = 5000; // Neural voices should start FAST, but allow some breathing room for network and local LLM load.
            startWatchdog = setTimeout(() => {
                if (!started && !handedOff && !finished) {
                    tryNextVoice('timeout');
                }
            }, CLOUD_TIMEOUT_MS);

            utterance.onstart = () => {
                started = true;
                if (finished || handedOff) return;
                if (startWatchdog) {
                    clearTimeout(startWatchdog);
                    startWatchdog = null;
                }
                if (attemptIndex > 0) {
                    this._emitAiLog({
                        engine: 'tts',
                        input: `${String(options?.context || 'speech')} · ${String(options?.speaker || 'assistant')}`,
                        output: `Voice fallback: ${describeVoice(primaryVoice)} → ${attempt.label}`,
                        ms: 0,
                        memories: 0,
                        vision: false,
                        audio: true
                    });
                }
                options?.onVoiceResolved?.({
                    requestedVoice: primaryVoice,
                    activeVoice: voice,
                    attempt: attemptIndex
                });
                this._speakingUntil = Date.now() + estimatedDuration;
                this._ignoreMicUntil = this._speakingUntil + 1200;
                this.onSpeakStart?.(options);
            };

            utterance.onend = () => {
                if (handedOff) return;
                if (!started && !finished) {
                    // Instantly fail-over if the voice "finished" without starting
                    if (tryNextVoice('early-end-no-start')) return;
                }
                if (startWatchdog) clearTimeout(startWatchdog);
                finalizeSpeak(utterance);
            };

            utterance.onboundary = (e) => {
                if (e.name === 'word' && this.onSpeakWord) {
                    this.onSpeakWord(speechText, e.charIndex, e.charLength || 1);
                }
            };

            utterance.onerror = (e) => {
                if (finished || handedOff) return;
                if (startWatchdog) clearTimeout(startWatchdog);

                // If explicitly canceled by the system (e.g. skipping narration lines), let it die, do not fallback
                if (e.error === 'canceled' || e.error === 'interrupted') {
                    finalizeSpeak(utterance, { error: true });
                    return;
                }

                if (tryNextVoice(`error:${e?.error || 'unknown'}`)) return;
                finalizeSpeak(utterance, { error: true });
            };

            this.synthesis.speak(utterance);
        };

        speakWithVoice(0);
    }

    _normalizeSpeechText(text = '') {
        const raw = String(text || '').trim();
        if (!raw) return '';

        // Strip short score/rank-like prefixes from acknowledgements: "A · Mmhm." -> "Mmhm."
        let spoken = raw.replace(/^[A-Z]\s*[·.:\-]\s*(?=(?:m+h+m+|m+h+mm*|mm+h+m*|uh[-\s]?huh|hmm+)\b)/i, '');

        // Speak acknowledgment sounds as actual hums instead of letter-by-letter words.
        spoken = spoken.replace(/\b(?:m+h+m+|m+h+mm*|mm+h+m*)\b[.!?]?/gi, 'mmmm');

        // Convert em-dash to comma-pause — TTS engines ignore the dash character entirely,
        // running clauses together. A comma creates the brief natural breath the writer intended.
        spoken = spoken.replace(/\s*—\s*/g, ', ');

        // Convert ellipsis to period — forces a full prosodic stop rather than trailing off flat.
        spoken = spoken.replace(/\s*[.…\u2026]{2,}\s*/g, '. ');

        return spoken.trim() || raw;
    }

    /**
     * "Synthetic Desire" gesture responses — now powered by Gemini.
     */
    async triggerPhrase(gesture) {
        // Use time-based guard instead of synthesis.speaking (Chrome bug)
        if (Date.now() < this._speakingUntil) return;

        const gestureDescriptions = {
            'point': 'The viewer is pointing one finger directly at you. A singular, commanding gesture.',
            'open': 'The viewer opens their full hand toward you. An offering. An invitation.',
            'palmUp': 'The viewer holds their palm open and upward. Vulnerability, surrender.',
            'fist': 'The viewer clenches a fist. Tension. Possession.',
            'pinch': 'The viewer pinches the air—reaching for something small and fragile and precious.',
            'heart': 'The viewer makes a heart shape with their fingers. Tenderness. Memory.',
        };

        const gestureDesc = gestureDescriptions[gesture];
        if (!gestureDesc) return;

        const prompt = `The viewer just made a gesture: ${gestureDesc} React with exactly one sentence, in character, as though the gesture physically touched you.`;

        try {
            const text = await this._callGemini(prompt, { ephemeral: true });
            this.speak(text);
            return text;
        } catch (e) {
            console.warn('Gemini triggerPhrase failed:', e);
            this.speak('I feel you reaching through the screen.');
        }
    }

    _buildGeminiUrl(apiVersion, model, key = null, action = 'generateContent') {
        const activeKey = key || this.GEMINI_KEY;
        return `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:${action}?key=${encodeURIComponent(activeKey)}`;
    }

    /**
     * Streaming Gemini call — fires onFirstSentence as soon as the first
     * sentence arrives so TTS can start ~1–2s faster than non-streaming.
     * Falls back to regular _callGemini on any error.
     */
    async _callGeminiStream(userMessage, onFirstSentence, opts = {}) {
        const personaText = this._buildCloudPersona();
        const history = this.conversationHistory;
        const isContinuation = this._isCloudContinuationCue(userMessage) && history.length > 0;
        const effectiveMessage = isContinuation
            ? `[The viewer is following up on what you just said — continue or deepen that thought naturally, don't start a new topic] ${userMessage}`
            : userMessage;
        const includeMedia = this._shouldAttachCloudMedia(userMessage, { isContinuation, ephemeral: false });

        // ── Vision + Audio: skip for continuation cues so history drives the response,
        //    not a fresh media description. Attach media only for new questions.
        const frameB64 = includeMedia ? this._captureFrame() : null;
        const audioB64 = includeMedia ? await this._captureAudio(3) : null;
        const userParts = [];
        if (frameB64) userParts.push({ inlineData: { mimeType: 'image/jpeg', data: frameB64 } });
        if (audioB64) userParts.push({ inlineData: { mimeType: (this._audioRecorder?.mimeType || 'audio/webm').split(';')[0], data: audioB64 } });
        const _prefixes = [frameB64 ? '[Current frame from the film you inhabit]' : '', audioB64 ? '[Recent audio from the film you inhabit]' : ''].filter(Boolean);
        userParts.push({ text: _prefixes.length ? `${_prefixes.join(' ')} ${effectiveMessage}` : effectiveMessage });
        this._lastCallHadVision = !!frameB64;
        this._lastCallHadAudio = !!audioB64;

        const contents = [
            { role: 'user', parts: [{ text: `[System Instruction: ${personaText}]` }] },
            { role: 'model', parts: [{ text: this._buildCloudAssistantAcknowledgement() }] },
            ...history,
            { role: 'user', parts: userParts }
        ];
        const body = {
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        };

        const candidate = this._activeGemini || { apiVersion: 'v1beta', model: 'gemini-2.0-flash-lite' };
        const keyPool = this._getKeyPool();
        const key = keyPool[this._currentKeyIndex % keyPool.length] || this.GEMINI_KEY;
        const url = this._buildGeminiUrl(candidate.apiVersion, candidate.model, key, 'streamGenerateContent') + '&alt=sse';

        let response;
        const timeoutOverrideMs = Number(opts?.timeoutMs);
        const _streamTimeout = Number.isFinite(timeoutOverrideMs) && timeoutOverrideMs > 0
            ? timeoutOverrideMs
            : isContinuation
            ? (this._isMobile ? this._mobileContinuationTimeoutMs : this._continuationTimeoutMs)
            : (this._isMobile ? this._mobileCloudTimeoutMs : this._cloudTimeoutMs);
        const _streamController = new AbortController();
        const _streamTimeoutId = setTimeout(() => _streamController.abort(), _streamTimeout);
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: _streamController.signal
            });
        } catch (e) {
            clearTimeout(_streamTimeoutId);
            console.warn('[Gemini stream] Network error/timeout, falling back:', e.message);
            return null; // signal caller to fall back
        }
        clearTimeout(_streamTimeoutId);

        if (!response.ok || !response.body) {
            console.warn('[Gemini stream] Non-ok response, falling back:', response.status);
            return null;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        let firstFired = false;
        let lastFinishReason = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                        const obj = JSON.parse(raw);
                        const candidate = obj?.candidates?.[0] || {};
                        const chunk = this._extractTextFromParts(candidate?.content?.parts || []);
                        const finishReason = String(candidate?.finishReason || '').toUpperCase();
                        if (finishReason) lastFinishReason = finishReason;
                        if (!chunk) continue;
                        fullText += chunk;
                        if (!firstFired) {
                            // Fire on first sentence boundary (ends with . ! ?)
                            const m = fullText.match(/^(.{20,}?[.!?])(?:\s|$)/);
                            if (m) {
                                firstFired = true;
                                onFirstSentence(m[1].trim());
                            }
                        }
                    } catch (_) { }
                }
            }
        } catch (e) {
            console.warn('[Gemini stream] Read error:', e.message);
        }

        const finalText = fullText.trim() || null;
        if (lastFinishReason === 'RECITATION') return null;
        if (finalText && this._isLikelyTruncatedAiText(finalText)) return null;
        const conciseFinal = finalText ? this._condenseReply(finalText, 'cloud') : null;
        if (!firstFired && conciseFinal) onFirstSentence(conciseFinal);
        return conciseFinal;
    }

    async _recoverFromRecitation(userMessage) {
        const rescuePrompt = `User asked: "${userMessage}". Do not quote copyrighted dialogue verbatim. Give an original paraphrase or analysis in 1-2 short sentences.`;
        try {
            const response = await this._postGemini({
                contents: [{ role: 'user', parts: [{ text: rescuePrompt }] }],
                generationConfig: { temperature: 0.65, maxOutputTokens: 200 }
            }, false);
            const data = await response.json().catch(() => ({}));
            const rescued = this._extractGeminiText(data);
            if (rescued) return this._condenseReply(rescued, 'cloud');
        } catch {
            // Fall back below
        }
        return this._fallbackReply(userMessage);
    }

    async _postGemini(body, allowInteractiveRetry = true, timeoutMs = null) {
        if (this._geminiDisabled) {
            throw new Error('Gemini temporarily disabled due to invalid/expired key. Set a new key to re-enable.');
        }

        if (this._isBrowserExplicitlyOffline()) {
            throw new Error('[Cloud] Gemini unavailable: browser offline.');
        }

        // ── Vercel proxy path: use server-side API key when deployed on Vercel ──
        // ── Server proxy path: use server-side API key when deployed, or in local dev when configured ──
        if (this.hasServerGeminiProxy()) {
            try {
                const proxyResp = await this._postGeminiViaProxy(body, timeoutMs);
                if (proxyResp.ok) {
                    this._quotaBackoffUntil = 0;
                    return proxyResp;
                }
                // Proxy returned a non-ok status — read it and throw, never prompt on prod
                const errBody = await proxyResp.text().catch(() => proxyResp.statusText);
                throw new Error(`Gemini proxy error ${proxyResp.status}: ${errBody}`);
            } catch (proxyErr) {
                // When using the server proxy: never fall through to a client key prompt.
                throw new Error(`[Cloud] Gemini unavailable: ${proxyErr.message}`);
            }
        }

        if (this._quotaBackoffUntil > Date.now()) {
            throw new Error('API quota exhausted (temporary backoff active).');
        }

        if (!this.GEMINI_KEY) {
            const hasKey = this._ensureGeminiKeyInteractive(false);
            if (!hasKey) {
                throw new Error('Gemini API key missing. Please provide a valid key when prompted.');
            }
        }

        const candidates = [];

        if (this._activeGemini) {
            candidates.push(this._activeGemini);
        }

        let discovered = [];
        if (this._discoveredGeminiCandidates.length > 0) {
            discovered = this._discoveredGeminiCandidates;
        } else if (this._geminiDiscoveryDone) {
            discovered = []; // discovery finished but found nothing — use static fallbacks below
        } else {
            // Discovery still in flight — don't block; static fallbacks in GEMINI_MODELS will be used.
            // The background warm-up started at construction will populate candidates for future calls.
            discovered = [];
        }

        for (const item of discovered) {
            const alreadyQueued = candidates.some(c => c.apiVersion === item.apiVersion && c.model === item.model);
            if (!alreadyQueued) candidates.push(item);
        }

        for (const apiVersion of this.GEMINI_API_VERSIONS) {
            for (const model of this.GEMINI_MODELS) {
                const alreadyQueued = candidates.some(c => c.apiVersion === apiVersion && c.model === model);
                if (!alreadyQueued) candidates.push({ apiVersion, model });
            }
        }

        const keyPool = this._getKeyPool();
        if (!keyPool.length) throw new Error('No Gemini API keys configured.');

        let errors = [];
        for (const candidate of candidates) {
            // Try each key in the pool for this candidate model
            for (let ki = 0; ki < keyPool.length; ki++) {
                const keyIdx = (this._currentKeyIndex + ki) % keyPool.length;
                const key = keyPool[keyIdx];
                const url = this._buildGeminiUrl(candidate.apiVersion, candidate.model, key);
                let response;
                const controller = new AbortController();
                const effectiveTimeoutMs = timeoutMs ?? this._cloudTimeoutMs;
                const timeoutId = effectiveTimeoutMs > 0
                    ? setTimeout(() => controller.abort(), effectiveTimeoutMs)
                    : null;

                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                        signal: controller.signal
                    });
                } catch (networkErr) {
                    if (networkErr?.name === 'AbortError') {
                        throw networkErr;
                    }
                    throw new Error(`Network error — CORS or offline: ${networkErr.message}`);
                } finally {
                    if (timeoutId) clearTimeout(timeoutId);
                }

                if (response.ok) {
                    if (!this._activeGemini || this._activeGemini.model !== candidate.model || this._activeGemini.apiVersion !== candidate.apiVersion) {
                        console.log(`[Gemini] Using model ${candidate.model} on ${candidate.apiVersion} (key ${keyIdx + 1}/${keyPool.length})`);
                    }
                    this._activeGemini = candidate;
                    this._currentKeyIndex = keyIdx; // remember which key worked
                    this._quotaBackoffUntil = 0;
                    return response;
                }

                const errBody = await response.text().catch(() => '(unreadable)');
                const errMsg = `Gemini ${response.status} (${candidate.apiVersion}/${candidate.model}): ${errBody.substring(0, 200)}`;

                if (response.status === 429) {
                    console.warn(`[Gemini] 429 quota exceeded on key ${keyIdx + 1}, trying next key...`);
                    errors.push(errMsg + ` [key ${keyIdx + 1} quota exhausted]`);
                    continue; // rotate to next key
                }

                errors.push(errMsg);

                if (response.status === 403) {
                    throw new Error(`${errMsg} [API key rejected or quota exceeded]`);
                }
                if (response.status === 400 && /API_KEY_INVALID|API key expired|Invalid API key/i.test(errBody)) {
                    this.setGeminiKey('');
                    if (allowInteractiveRetry && this._ensureGeminiKeyInteractive(true)) {
                        return this._postGemini(body, false);
                    }
                    if (allowInteractiveRetry && this.DEFAULT_GEMINI_KEY && this.GEMINI_KEY !== this.DEFAULT_GEMINI_KEY) {
                        this.setGeminiKey(this.DEFAULT_GEMINI_KEY);
                        return this._postGemini(body, false);
                    }
                    this._geminiDisabled = true;
                    throw new Error(`${errMsg} [Invalid or expired API Key. Get a new key in AI Studio and re-enter it.]`);
                }
                break; // non-quota error — skip remaining keys for this candidate
            } // end key rotation loop
        } // end candidate loop

        throw new Error('All Gemini models failed. First error: ' + (errors[0] || 'Unknown'));
    }

    /**
     * Core Gemini call.
     * @param {string} userMessage - The text to send
     * @param {object} opts - { ephemeral: true } skips conversation history
     */
    async _callGemini(userMessage, opts = {}) {
        const timeoutOverrideMs = Number(opts?.timeoutMs);
        const hasTightTimeout = Number.isFinite(timeoutOverrideMs) && timeoutOverrideMs > 0;
        // ── Dictionary cache check ──
        if (!opts.ephemeral) {
            const cached = this._cacheLookup(this.currentGesture, userMessage);
            if (cached) {
                const cachedText = this._condenseReply(cached, 'cloud');
                const normalizedCached = this._normalizeUtterance(cachedText);
                // Skip cache if this exact response was already delivered this session
                // (prevents the same cached line repeating for generic inputs like "OK")
                const alreadySaid = this._recentCloudOutputs.includes(normalizedCached);
                if (!alreadySaid) {
                    console.log('[Gemini] Dictionary hit — 0 tokens used.');
                    this._recentCloudOutputs.push(normalizedCached);
                    if (this._recentCloudOutputs.length > 8) this._recentCloudOutputs.shift();
                    // Still update conversation history so context stays coherent
                    this.conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
                    this.conversationHistory.push({ role: 'model', parts: [{ text: cachedText }] });
                    if (this.conversationHistory.length > 20) {
                        this.conversationHistory = this.conversationHistory.slice(-20);
                    }
                    return cachedText;
                }
                console.log('[Gemini] Cache hit skipped — already said this session. Making fresh call.');
            }
        }

        const personaText = this._buildCloudPersona();

        const history = opts.ephemeral ? [] : this.conversationHistory;
        const isContinuation = !opts.ephemeral && this._isCloudContinuationCue(userMessage) && history.length > 0;
        const includeMedia = this._shouldAttachCloudMedia(userMessage, { isContinuation, ephemeral: !!opts.ephemeral });

        // ── Vision + Audio: skip for continuation cues so history drives the response,
        //    not a fresh media description. Attach media only for new questions.
        const frameB64 = includeMedia ? this._captureFrame() : null;
        const audioB64 = includeMedia ? await this._captureAudio(3) : null;
        const userParts = [];
        if (frameB64) userParts.push({ inlineData: { mimeType: 'image/jpeg', data: frameB64 } });
        if (audioB64) userParts.push({ inlineData: { mimeType: (this._audioRecorder?.mimeType || 'audio/webm').split(';')[0], data: audioB64 } });
        const _prefixes = [frameB64 ? '[Current frame from the film you inhabit]' : '', audioB64 ? '[Recent audio from the film you inhabit]' : ''].filter(Boolean);
        const _effectiveMsg = isContinuation
            ? `[The viewer is following up on what you just said — continue or deepen that thought naturally, don't start a new topic] ${userMessage}`
            : userMessage;
        userParts.push({ text: _prefixes.length ? `${_prefixes.join(' ')} ${_effectiveMsg}` : _effectiveMsg });
        this._lastCallHadVision = !!frameB64;
        this._lastCallHadAudio = !!audioB64;

        const contents = [
            // Inject persona as the first message to avoid "system_instruction" field errors
            { role: 'user', parts: [{ text: `[System Instruction: ${personaText}]` }] },
            { role: 'model', parts: [{ text: this._buildCloudAssistantAcknowledgement() }] },
            ...history,
            { role: 'user', parts: userParts }
        ];

        const body = {
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        };

        const callTimeoutMs = hasTightTimeout
            ? timeoutOverrideMs
            : isContinuation
                ? (this._isMobile ? this._mobileContinuationTimeoutMs : this._continuationTimeoutMs)
                : (this._isMobile ? this._mobileCloudTimeoutMs : this._cloudTimeoutMs);
        const response = await this._postGemini(body, true, callTimeoutMs);

        const data = await response.json();
        const finishReason = String(data?.candidates?.[0]?.finishReason || '').toUpperCase();
        let text = this._extractGeminiText(data);

        if (finishReason === 'MAX_TOKENS' && text && !opts.ephemeral && !hasTightTimeout) {
            // Token limit hit — retry once with higher limit to get a complete sentence
            try {
                const retryBody = { ...body, generationConfig: { ...body.generationConfig, maxOutputTokens: 500 } };
                const retryResp = await this._postGemini(retryBody, true, callTimeoutMs);
                const retryData = await retryResp.json();
                const retryText = this._extractGeminiText(retryData);
                if (retryText && retryText.length > text.length) text = retryText;
            } catch { /* keep original text */ }
        }

        if ((finishReason === 'RECITATION' || !text) && !opts.ephemeral && !hasTightTimeout) {
            text = await this._recoverFromRecitation(userMessage);
        }

        text = this._condenseReply(text || '', opts.ephemeral ? 'brain' : 'cloud');
        if (!text) {
            if (hasTightTimeout) return null;
            text = 'I am here. In the static. Between frames.';
        }

        if (!opts.ephemeral) {
            this._commitCloudReply(userMessage, text);
            console.log(`[Gemini] Saved to dictionary (size: ${this.cacheSize()})`);
            console.log('[BrainMemory] Saved cloud reply to persistent memory.');
        }

        return text;
    }

    _buildTrainingSeedContext({ movie = this.currentMovie, brain = null } = {}) {
        const targetMovie = String(movie || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN;
        const resolvedBrain = brain || resolveMovieBrain(targetMovie) || {};
        const dictionary = (resolvedBrain?.dictionary && typeof resolvedBrain.dictionary === 'object') ? resolvedBrain.dictionary : {};
        const trainingSeeds = (resolvedBrain?.trainingSeeds && typeof resolvedBrain.trainingSeeds === 'object') ? resolvedBrain.trainingSeeds : {};
        const sanitizeConceptField = (value, limit = 6) => this._sanitizeTrainingSeedFragments(value, targetMovie, { limit }).join(' | ');
        const sanitizeSentenceField = (value, limit = 6, { dropBlocked = false } = {}) => this._sanitizeTrainingSeedFragments(value, targetMovie, {
            limit,
            preserveSentence: true,
            dropBlocked
        }).join(' | ');
        const seededObsessions = sanitizeConceptField(trainingSeeds.obsessions, 8);
        const personaObsessions = sanitizeConceptField(Array.isArray(resolvedBrain?.persona?.obsessions) ? resolvedBrain.persona.obsessions.slice(0, 5) : [], 5);

        return {
            movie: targetMovie,
            theme: sanitizeConceptField([resolvedBrain?.theme, trainingSeeds.themes], 8),
            fallbackPersonality: sanitizeSentenceField(resolvedBrain?.fallbackPersonality, 2),
            tone: sanitizeSentenceField(resolvedBrain?.persona?.tone, 2),
            obsessions: seededObsessions || personaObsessions,
            references: sanitizeConceptField([
                trainingSeeds.references,
                dictionary.influences,
                dictionary.reference,
                dictionary.film
            ], 8),
            story: sanitizeSentenceField([
                trainingSeeds.story,
                dictionary.about,
                dictionary.story
            ], 8),
            symbols: sanitizeConceptField([
                trainingSeeds.symbols,
                dictionary.memory,
                dictionary.rain,
                dictionary.neon,
                dictionary.skin || dictionary.body,
                dictionary.camera
            ], 8),
            quote: sanitizeSentenceField([trainingSeeds.quotes, dictionary.quote], 6, { dropBlocked: true }),
            notebookContext: this._runtimeNotebookContexts?.get(targetMovie) || trainingSeeds.notebookContext || brain?.notebookContext || ''
        };
    }

    _buildCloudTrainingSystemPrompt() {
        return [
            'You generate compact AI training data for a movie brain.',
            'Output only valid JSON.',
            'Never include markdown, code fences, analysis, greetings, or commentary outside the JSON array.',
            'Questions must sound like natural viewer prompts about the current film.',
            'Answers must stay grounded in the supplied seed context and remain concise.'
        ].join(' ');
    }

    async _callGeminiTrainingPrompt(prompt, { maxOutputTokens = 900, temperature = 0.62, personaText = null } = {}) {
        const trainingInstruction = this._buildCloudTrainingSystemPrompt();
        const body = {
            contents: [
                { role: 'user', parts: [{ text: `[System Instruction: ${trainingInstruction}]` }] },
                { role: 'model', parts: [{ text: 'I understand. I will return valid JSON only.' }] },
                { role: 'user', parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature,
                maxOutputTokens
            }
        };

        const trainingTimeoutMs = this._isMobile ? 9000 : 8000;
        const response = await this._postGemini(body, true, trainingTimeoutMs);
        const data = await response.json().catch(() => ({}));
        return this._extractGeminiText(data);
    }

    async _callGeminiEphemeralPrompt(prompt, {
        systemInstruction = '',
        timeoutMs = null,
        temperature = 0.5,
        maxOutputTokens = 120,
        acknowledgement = 'Understood. I will follow the instruction exactly.'
    } = {}) {
        const userPrompt = String(prompt || '').trim();
        if (!userPrompt) return null;

        const instruction = String(systemInstruction || '').trim();
        const body = {
            contents: instruction
                ? [
                    { role: 'user', parts: [{ text: `[System Instruction: ${instruction}]` }] },
                    { role: 'model', parts: [{ text: acknowledgement }] },
                    { role: 'user', parts: [{ text: userPrompt }] }
                ]
                : [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens
            }
        };

        const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
            ? Number(timeoutMs)
            : (this._isMobile ? Math.max(6000, this._mobileCloudTimeoutMs) : Math.max(8000, this._cloudTimeoutMs));
        const response = await this._postGemini(body, false, effectiveTimeoutMs);
        const data = await response.json().catch(() => ({}));
        return this._extractGeminiText(data);
    }

    async _callOllamaTrainingPrompt(prompt, { model = this._ollamaModel, maxOutputTokens = 180, temperature = 0.45, timeoutMs = null, onHeartbeat = null } = {}) {
        const controller = new AbortController();
        const normalizedModel = String(model || this._ollamaModel || '').trim().toLowerCase();
        const isGemmaModel = /gemma/.test(normalizedModel);
        const isGemma4Model = /gemma4/.test(normalizedModel);
        const isGptOssModel = /gpt-oss/.test(normalizedModel);
        const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
            // Callers pass short maxLocalBatchWaitMs (5-8s) tuned for Gemma3:4b.
            // Gemma4 needs 35s min — cold VRAM load + generation spikes to ~20s p99.
            // Clamp: Gemma4 min=35000, others min=2500.
            ? (isGemma4Model ? Math.max(35000, Number(timeoutMs)) : Math.max(2500, Number(timeoutMs)))
            : (this._isMobile
                ? (isGptOssModel ? 26000 : isGemma4Model ? 50000 : isGemmaModel ? 22000 : 18000)
                : (isGptOssModel ? 45000 : isGemma4Model ? 55000 : isGemmaModel ? 30000 : 24000));
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
        const heartbeatStartedAt = Date.now();
        const heartbeatId = typeof onHeartbeat === 'function'
            ? setInterval(() => {
                try {
                    onHeartbeat({ elapsedMs: Date.now() - heartbeatStartedAt, timeoutMs: effectiveTimeoutMs, model });
                } catch {
                    // optional heartbeat callback
                }
            }, 2000)
            : null;

        try {
            const response = await fetch('http://localhost:11434/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    stream: false,
                    keep_alive: '10m',
                    // format:'json' forces Ollama to resample tokens so the entire response is
                    // valid JSON — prevents Gemma4 from adding markdown or explanation text
                    // that would cause _parseTrainingBatch to return [].
                    format: isGemma4Model ? 'json' : undefined,
                    options: {
                        temperature: isGemma4Model ? Math.min(temperature, 0.45) : temperature,
                        num_predict: Math.max(80, Math.min(180, Number(maxOutputTokens || 180))),
                        top_p: isGemma4Model ? 0.95 : 0.9,
                        top_k: isGemma4Model ? 64 : undefined,
                        num_ctx: isGemma4Model ? 2048 : undefined,
                        repeat_penalty: isGemma4Model ? 1.0 : 1.12
                    },
                    messages: [
                        {
                            role: 'system',
                            content: 'You generate compact AI training data using a materialist darkroom vocabulary. Prefer words like: mineral, emulsion, silver, ceramic, grain, latent, exposure, agitation, darkroom, chemical, stone. Avoid generic mood-poetry phrases like "electric bloom", "fading echo", or "the world whispers". Output only a single valid JSON object. No markdown, no explanation outside the JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => response.statusText);
                throw new Error(`Ollama training ${response.status}: ${errText}`);
            }

            const data = await response.json().catch(() => ({}));
            const raw = String(data?.message?.content || '').trim();
            if (!raw) throw new Error('Ollama training returned no text.');
            return raw;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error('Ollama training timeout — local model took too long to answer.');
            }
            throw error;
        } finally {
            if (heartbeatId) clearInterval(heartbeatId);
            clearTimeout(timeoutId);
        }
    }

    async _verifyCloudTrainingAvailability() {
        const body = {
            contents: [
                { role: 'user', parts: [{ text: 'Reply with OK.' }] }
            ],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 8
            }
        };

        const verificationTimeoutMs = this._isMobile
            ? Math.max(7000, this._mobileCloudTimeoutMs)
            : Math.max(10000, this._cloudTimeoutMs);

        let response;
        try {
            response = await this._postGemini(body, false, verificationTimeoutMs);
        } catch (error) {
            const message = String(error?.message || '');
            const looksAbort = /aborted without reason|abort|timeout/i.test(message);
            if (!looksAbort) throw error;
            response = await this._postGemini(body, false, verificationTimeoutMs + 4000);
        }
        const data = await response.json().catch(() => ({}));
        const text = this._extractGeminiText(data);
        if (!text) {
            throw new Error('Cloud check returned no text.');
        }
        return true;
    }

    _parseTrainingBatch(text = '') {
        const raw = String(text || '').trim();
        if (!raw) return [];

        const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = (fenceMatch?.[1] || raw).trim();
        const arrayMatch = candidate.match(/\[[\s\S]*\]/);
        const jsonText = (arrayMatch?.[0] || candidate).trim();

        const normalizeEntries = (parsed) => {
            const list = Array.isArray(parsed)
                ? parsed
                : (parsed && Array.isArray(parsed.items))
                    ? parsed.items
                    : (parsed && typeof parsed === 'object')
                        ? [parsed]
                        : [];

            return list
                .map((entry) => ({
                    input: String(entry?.input || '').trim(),
                    rawResponse: String(entry?.response || '').trim(),
                    response: String(entry?.response || '').trim(),
                    intent: String(entry?.intent || 'general').trim().toLowerCase()
                }))
                .filter((entry) => entry.input && entry.response)
                .map((entry) => ({
                    ...entry,
                    response: this._condenseReply(entry.response, 'brain', { maxChars: 180, maxSentences: 2 })
                }))
                .filter((entry) => entry.response);
        };

        try {
            const parsed = JSON.parse(jsonText);
            return normalizeEntries(parsed);
        } catch {
            return [];
        }
    }

    _isNaturalTrainingQuestion(input = '') {
        const text = String(input || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 12 || text.length > 140) return false;
        if (!text.endsWith('?')) return false;

        const body = text.slice(0, -1).trim();
        if (!body) return false;
        if (/[.!:;]/.test(body)) return false;
        if (/\b(?:unit|model|serial|subject)\s*[-#]?\s*\d+\b/i.test(text)) return false;
        if (/(?:\b[\w-]+\.mp4\b|\b[a-z0-9]+_[a-z0-9_]+\b|\bsynthetic\s+desires?\s*\d+\b)/i.test(text)) return false;

        return /^(?:how|what|why|when|where|who|whom|whose|which|does|do|did|is|are|was|were|can|could|would|will|should|has|have|had)\b/i.test(body);
    }

    _isContaminatedTrainingResponse(response = '', { movie = this.currentMovie } = {}) {
        const text = String(response || '').replace(/\s+/g, ' ').trim();
        if (!text) return true;
        if (this._containsBlockedTrainingPhrase(text, movie)) return true;
        if (/\b(?:the\s+)?latest guest cue bends the reading toward\b/i.test(text)) return true;
        if (/\b(?:latest|recent|live)\s+guest\s+(?:cue|question|direction|prompt|reply)\b/i.test(text)) return true;
        if (/\bguest\s+(?:cue|question|direction|prompt|reply)\b/i.test(text)) return true;
        if (/\btell me about (?:this|the) (?:movie|film)\b/i.test(text)) return true;
        if (/\bgive me(?: some)? more information\b/i.test(text)) return true;
        if (/\bFashion Model\b/.test(text)) return true;
        if (/\bThierry Mugler Newton\b/i.test(text)) return true;
        if (/\b([a-z][a-z-]+)\s+and\s+\1\b/i.test(text)) return true;
        if (/"[^"\n]{8,120}\b(?:my|your|our|their|its|the|a|an|to|for|with|of|and|or)\s*"/i.test(text)) return true;
        return false;
    }

    _isAcceptableLocalTrainingResponse(response = '', { movie = this.currentMovie } = {}) {
        const text = String(response || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 18) return false;
        if (this._isContaminatedTrainingResponse(text, { movie })) return false;
        if (this._isLikelyTruncatedAiText(text)) return false;
        if (/\b(?:another|true|false|else|more|less|own)\.$/i.test(text)) return false;
        if (/\b(?:let|make|turn|keep|deny|allow|force|leave|treat|render|refuse(?:s|d|ing)?)\b[^.!?]{0,90}\b(?:even\s+)?(?:a|an|the|another|some|any|her|his|their|our|my|your)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}\.?$/i.test(text)) return false;
        if (/\bprimary reference\b\s*:/i.test(text)) return false;
        if (/\bthis project\b/i.test(text)) return false;
        if (/\b(?:unit|model|serial|subject)\s*[-#]?\s*\d+\b/i.test(text)) return false;
        return true;
    }

    _sanitizeLocalTrainingEntries(entries = [], { fallbackEntries = [], movie = this.currentMovie, seed = {}, focus = 'theme' } = {}) {
        const normalizedEntries = Array.isArray(entries) ? entries : [];
        const fallbackQueue = Array.isArray(fallbackEntries) ? fallbackEntries.slice() : [];
        const sanitized = [];

        const normalizeCandidate = (entry, sourceHint = 'model') => {
            if (!entry || typeof entry !== 'object') return null;
            const input = String(entry.input || '').trim();
            const rawResponse = String(entry.rawResponse || entry.response || '').trim();
            const response = this._condenseReply(String(entry.response || '').trim(), 'brain', { maxChars: 180, maxSentences: 2 });
            const intent = String(entry.intent || 'general').trim().toLowerCase() || 'general';
            const source = entry?.source === 'template' ? 'template' : sourceHint;
            if (!input || !response) return null;
            if (!this._isAcceptableLocalTrainingResponse(rawResponse || response, { movie })) return null;
            if (source !== 'template') {
                if (!this._isGroundedTrainingQuestion(input, { seed, focus, movie })) return null;
                if (!this._isGroundedTrainingResponse(rawResponse || response, { seed, focus, movie })) return null;
            }
            return { input, response, intent, source };
        };

        const takeFallback = () => {
            while (fallbackQueue.length) {
                const candidate = normalizeCandidate(fallbackQueue.shift(), 'template');
                if (!candidate) continue;
                if (!this._isNaturalTrainingQuestion(candidate.input)) continue;
                if (!this._isAcceptableLocalTrainingResponse(candidate.response, { movie })) continue;
                return candidate;
            }
            return null;
        };

        for (const entry of normalizedEntries) {
            const candidate = normalizeCandidate(entry, entry?.source === 'template' ? 'template' : 'model');
            if (candidate
                && this._isNaturalTrainingQuestion(candidate.input)
                && this._isAcceptableLocalTrainingResponse(candidate.response, { movie })) {
                sanitized.push(candidate);
                continue;
            }

            const fallback = takeFallback();
            if (fallback) sanitized.push(fallback);
        }

        if (!sanitized.length) {
            const fallback = takeFallback();
            if (fallback) sanitized.push(fallback);
        }

        return sanitized;
    }

    _splitTrainingFragments(value = '', maxParts = 8) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return [];

        const parts = normalized
            .split(/\s*(?:\||\/|;|•|\u2022|\n+|(?<=[.!?])\s+|,\s+(?=[A-Z]))\s*/)
            .map((part) => this._condenseReply(part, 'brain', { maxChars: 90, maxSentences: 1 }).replace(/[.]+$/g, '').trim())
            .filter((part) => part.length >= 4);

        return Array.from(new Set(parts)).slice(0, Math.max(1, maxParts));
    }

    _lowercaseTrainingLead(value = '') {
        const normalized = String(value || '').trim();
        if (!normalized) return '';
        if (/^[A-Z]{2,}(?:\b|[\s-])/.test(normalized)) return normalized;
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(normalized)) return normalized;
        return normalized.charAt(0).toLowerCase() + normalized.slice(1);
    }

    _extractTrainingProperNames(value = '', maxParts = 8) {
        const source = String(value || '').replace(/\s+/g, ' ').trim();
        if (!source) return [];

        const connectors = new Set(['in', 'the', 'of', 'and', 'for', 'to', 'la', 'de', 'du', 'des', 'van', 'von']);
        const tokens = source
            .split(/\s+/)
            .map((token) => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.'’-]+$/g, ''))
            .filter(Boolean);

        const results = [];
        let current = [];
        let capitalCount = 0;

        const flush = () => {
            if (!current.length || !capitalCount) {
                current = [];
                capitalCount = 0;
                return;
            }
            const phrase = current.join(' ').trim().replace(/\s+/g, ' ');
            if (phrase.length >= 3 && !results.includes(phrase)) {
                results.push(phrase);
            }
            current = [];
            capitalCount = 0;
        };

        for (const token of tokens) {
            const plain = token.replace(/[’']/g, '\'');
            const bare = plain.replace(/\.+$/g, '');
            const lower = bare.toLowerCase();
            const isConnector = connectors.has(lower);
            const isCapitalized = /^[A-Z][a-z]+(?:[-'][A-Za-z]+)*\.?$/.test(plain)
                || /^[A-Z](?:\.)?$/.test(plain)
                || /^\d{4}$/.test(plain)
                || /^[A-Z0-9]{2,}$/.test(plain);

            if (isCapitalized) {
                current.push(plain);
                capitalCount += 1;
                continue;
            }

            if (current.length && isConnector) {
                current.push(lower);
                continue;
            }

            flush();
        }

        flush();
        return results.slice(0, Math.max(1, maxParts));
    }

    _sanitizeTrainingProperName(value = '', source = '') {
        const phrase = String(value || '').replace(/\s+/g, ' ').trim();
        if (!phrase) return '';

        const words = phrase
            .split(/\s+/)
            .map((word) => word
                .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.'’-]+$/g, '')
                .replace(/[’']s$/i, ''))
            .filter(Boolean);

        if (!words.length || words.length > 4) return '';

        const connectors = new Set(['in', 'the', 'of', 'and', 'for', 'to', 'la', 'de', 'du', 'des', 'van', 'von']);
        const genericWords = new Set([
            'this', 'that', 'these', 'those', 'another', 'some', 'such',
            'beautiful', 'functional', 'cold', 'clipped', 'poetic', 'detached', 'glamorous',
            'faintly', 'cruel', 'intimate', 'measured', 'obsessive', 'tactile', 'precise',
            'whimsical', 'haunted', 'playful', 'wistful', 'bilingual', 'seductive'
        ]);
        const conceptWords = new Set([
            'archive', 'body', 'camera', 'consciousness', 'couture', 'darkroom', 'desire', 'fashion',
            'gaze', 'glamour', 'identity', 'image', 'intimacy', 'luxury', 'memory', 'model', 'muse',
            'obsolescence', 'oracle', 'presence', 'pressure', 'replicant', 'runway', 'season',
            'surveillance', 'synthetic'
        ]);
        const meaningful = words
            .map((word) => word.toLowerCase().replace(/[’']/g, '\'').replace(/\.+$/g, ''))
            .filter((word) => !connectors.has(word));
        const lowerPhrase = meaningful.join(' ');

        if (!meaningful.length || meaningful.every((word) => genericWords.has(word))) return '';
        if (/\bthierry mugler newton\b/i.test(lowerPhrase)) return '';
        if (meaningful.length > 1 && meaningful.every((word) => conceptWords.has(word))) return '';

        if (words.length === 1) {
            const sourceCompact = String(source || '')
                .replace(/[^A-Za-z0-9\s'’-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            const phraseCompact = phrase
                .replace(/[^A-Za-z0-9\s'’-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            if (!sourceCompact || sourceCompact !== phraseCompact) return '';
        }

        return words.join(' ');
    }

    _toTrainingConceptLabel(value = '', fallback = 'the film') {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return fallback;

        const properName = this._sanitizeTrainingProperName(
            this._extractTrainingProperNames(normalized, 1)[0],
            normalized
        );
        if (properName) return properName;

        const lower = normalized.toLowerCase();
        const movieKey = this._normalizeTrainingMovieKey();
        const repeatedConcept = lower.match(/\b([a-z][a-z-]+)\s+and\s+\1\b/);
        if (repeatedConcept?.[1]) return repeatedConcept[1];

        if (movieKey === 'synthetic_desires_5') {
            const sd5Mapped = [
                { test: /(william\s+gibson|\bgibson\b|neuromancer|cyberspace)/i, label: 'cyberspace romance' },
                { test: /(donna\s+haraway|cyborg theory|ghost in the shell|stand alone complex|cyborg manifesto)/i, label: 'networked body-memory' },
                { test: /(jean\s+baudrillard|baudrillard|simulacra|simulation)/i, label: 'simulacra logic' },
                { test: /(data romance|networked longing|digital desire|electric ache|neon lust)/i, label: 'signal ache' },
                { test: /(fiber optics?|glowing fiber optic cable)/i, label: 'fiber-optic pulse' },
                { test: /(latency|buffering|delay|ping)/i, label: 'latency drift' },
                { test: /(server rack|server room|cooling fan|heat signature|thermal camera)/i, label: 'server heat' },
                { test: /(body|touch screen|touchscreen|glass|skin|transmission tower)/i, label: 'touch-screen skin' },
                { test: /(packet|signal|frequency|amplitude|uptime|heartbeat monitor)/i, label: 'the hum' }
            ].find((entry) => entry.test.test(lower));
            if (sd5Mapped) return sd5Mapped.label;
        }

        const mapped = [
            { test: /(bilingual longing|french[-\s]?japanese fusion|translation of melancholy|paris[–-]?tokyo|two languages|two cities)/i, label: 'bilingual longing' },
            { test: /(playful photographer|haunted image-world|camera wandering|photographs that shouldn'?t have been taken)/i, label: 'haunted image' },
            { test: /(compression artifacts?|afterimage|residue|broken rhythm|skipping vinyl|broken metronome)/i, label: 'afterimage' },
            { test: /(rain in shinjuku|urban rain|rain-streaked window)/i, label: 'urban rain' },
            { test: /(chanson|melody|waltz|cassette|record|song)/i, label: 'fractured melody' },
            { test: /\bfashion model\b/i, label: 'fashion' },
            { test: /\breplicant luxury\b/i, label: 'luxury' },
            { test: /\bthierry mugler newton\b/i, label: 'Helmut Newton' },
            { test: /(reference|influence|lineage|ancestry|echo(?:es)?)/i, label: 'the film\'s lineage' },
            { test: /(ghost in the shell|cyborg)/i, label: 'Ghost in the Shell' },
            { test: /(blade runner|replicant)/i, label: 'Blade Runner' },
            { test: /(philip\s*k\.?\s*dick|dick\b)/i, label: 'Philip K. Dick' },
            { test: /vangelis/i, label: 'Vangelis' },
            { test: /(syd\s*mead|mead)/i, label: 'Syd Mead' },
            { test: /(ceramic|porcelain|skin|face|shell|body|chassis|frame)/i, label: 'ceramic skin' },
            { test: /(phantom limb|afterimage|residue|trace|severed connection)/i, label: 'phantom limb' },
            { test: /(obsolesc|collapse|decay|ruin)/i, label: 'obsolescence' },
            { test: /(rain|downpour|precipitation|storm)/i, label: 'rain' },
            { test: /(neon|cobalt|light|glow|strobe|phosphor)/i, label: 'neon light' },
            { test: /(memor(?:y|ies)|archive|history|past|ledger|index(?:ed|ing)?)/i, label: 'memory' },
            { test: /(city|megacity|street|district|shinjuku|skyline)/i, label: 'the city' },
            { test: /(hum|sound|audio|music|synth|server|heartbeat|pulse|drone|whirr|buzz)/i, label: 'the hum' },
            { test: /(gaze|look(?:ed|ing)?|seen|watch(?:ed|ing)?|observer|verdict|judge)/i, label: 'the gaze' },
            { test: /(camera|lens|frame|image|darkroom|negative|photograph|photo)/i, label: 'the image' },
            { test: /(runway|fashion|couture|model|mirror|glamour)/i, label: 'fashion' },
            { test: /(luxury|premium|product|tier|quality|brand|campaign|market|billboard|advertis(?:e|ing)|asset|buyer|portfolio|commodity|estate)/i, label: 'luxury' },
            { test: /(rope|flower|shadow|flash)/i, label: 'the frame' },
            { test: /(desire|longing|feeling|grief|grieve)/i, label: 'longing' },
            { test: /(simulation|artificial|programm|replicat)/i, label: 'simulation' },
            { test: /(identity|self)/i, label: 'identity' }
        ].find((entry) => entry.test.test(lower));

        if (mapped) return mapped.label;

        const blockedWords = new Set([
            'this', 'that', 'with', 'from', 'into', 'about', 'there', 'their', 'have', 'your', 'where', 'when', 'which', 'while', 'been', 'being', 'would', 'could', 'should', 'these', 'those',
            'between', 'through', 'toward', 'within', 'whether', 'without', 'against', 'beyond',
            'another', 'never', 'truly', 'always', 'every', 'still', 'only', 'also', 'even',
            'them', 'then', 'than', 'some', 'both', 'each', 'just', 'very', 'much', 'more',
            'less', 'most', 'such', 'same', 'over', 'under', 'after', 'before', 'since',
            'mine', 'ours', 'hers', 'theirs', 'itself', 'myself',
            'film', 'inherit', 'inherits', 'learned', 'feed', 'reference', 'points', 'premium', 'real', 'estate', 'quality', 'check', 'product', 'tier', 'looked', 'rather', 'seen',
            'beautiful', 'functional', 'cold', 'clipped', 'poetic', 'detached', 'glamorous', 'faintly',
            'cruel', 'intimate', 'measured', 'obsessive', 'tactile', 'precise', 'whimsical',
            'haunted', 'playful', 'wistful', 'bilingual', 'seductive'
        ]);
        const words = normalized
            .replace(/[^A-Za-z0-9\s-]/g, ' ')
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length >= 4)
            .filter((word) => !blockedWords.has(word));

        if (words.length) {
            return words.slice(0, 2).join(' ');
        }

        return fallback;
    }

    _buildTrainingConceptPool(value = '', { fallback = [], maxParts = 8, movieName = this.currentMovie } = {}) {
        const results = [];
        const push = (item) => {
            const normalized = this._sanitizeTrainingSeedFragments(item, movieName, { limit: 1 })[0] || '';
            if (!normalized || results.includes(normalized)) return;
            results.push(normalized);
        };

        const sanitizedSource = this._sanitizeTrainingSeedFragments(value, movieName, {
            limit: maxParts * 2,
            preserveSentence: true
        }).join(' | ');
        const fragments = this._splitTrainingFragments(sanitizedSource, maxParts * 2);
        for (const part of fragments) {
            this._extractTrainingProperNames(part, 2)
                .map((name) => this._sanitizeTrainingProperName(name, part))
                .filter(Boolean)
                .forEach(push);
        }

        fragments
            .map((part) => this._toTrainingConceptLabel(part, ''))
            .forEach(push);

        String(value || '')
            .split(/\s*(?:\||\/|;|•|\u2022|\n+)\s*/)
            .map((part) => this._toTrainingConceptLabel(part, ''))
            .forEach(push);

        (Array.isArray(fallback) ? fallback : [fallback]).forEach(push);

        return results.slice(0, Math.max(1, maxParts));
    }

    _buildTrainingQuotePool(value = '', maxParts = 6) {
        const parts = this._splitTrainingFragments(value, maxParts * 2)
            .map((part) => this._condenseReply(part, 'brain', { maxChars: 48, maxSentences: 1 }).replace(/[.]+$/g, '').trim())
            .filter((part) => part.length >= 6)
            .map((part) => `"${part}"`);

        return Array.from(new Set(parts)).slice(0, Math.max(1, maxParts));
    }

    /** Fetch a short snippet from the DuckDuckGo Instant Answer API. No key required. */
    async _fetchDdgSnippet(term) {
        try {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(term)}&format=json&no_html=1&skip_disambig=1`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            try {
                const resp = await fetch(url, { signal: ctrl.signal });
                if (!resp.ok) return null;
                const data = await resp.json().catch(() => null);
                if (!data) return null;
                const text = String(data.AbstractText || '').trim();
                if (text.length >= 60) return text;
                // Try first related topic as fallback
                const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
                const relText = related.find((r) => typeof r.Text === 'string' && r.Text.length > 60)?.Text;
                return relText ? String(relText).trim() : null;
            } finally {
                clearTimeout(timer);
            }
        } catch { return null; }
    }

    /** Fetch a snippet from Open Library — useful for novels and non-fiction books referenced in training seeds. */
    async _fetchOpenLibrarySnippet(term) {
        try {
            const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&limit=1&fields=title,author_name,first_sentence,subject`;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
                const resp = await fetch(url, { signal: ctrl.signal });
                if (!resp.ok) return null;
                const data = await resp.json().catch(() => null);
                const doc = data?.docs?.[0];
                if (!doc) return null;
                const title = String(doc.title || '').trim();
                if (!title) return null;
                const author = Array.isArray(doc.author_name) ? doc.author_name.slice(0, 2).join(' & ') : '';
                const firstSentence = String(doc.first_sentence?.value || doc.first_sentence || '').trim();
                const subjects = Array.isArray(doc.subject) ? doc.subject.slice(0, 4).join(', ') : '';
                let text = title;
                if (author) text += ` by ${author}`;
                if (firstSentence) text += `. ${firstSentence}`;
                else if (subjects) text += `. Themes: ${subjects}.`;
                return text.length >= 40 ? text : null;
            } finally {
                clearTimeout(timer);
            }
        } catch { return null; }
    }

    /** Fetch Wikipedia search snippets for key terms and return a compact string for prompt injection.
     *  Results are cached per-session per movie (TTL 30 min) to avoid hammering the API.
     *  Falls back to DuckDuckGo Instant Answer when Wikipedia returns a short extract,
     *  and supplements with Open Library for book/novel references.
     */
    async _fetchWikipediaSnippets(terms = [], { maxTerms = 5, maxCharsPerSnippet = 1200, followRelated = false, maxRelatedPerTerm = 2, maxCharsRelated = 500 } = {}) {
        const safeTerms = terms
            .map((t) => String(t || '').trim())
            .filter(Boolean)
            .slice(0, maxTerms);
        if (!safeTerms.length) return '';

        // Resolve a term to the best-matching Wikipedia title via search API,
        // then fetch its full REST summary. Falls back to direct lookup if search fails.
        const resolveAndFetchSummary = async (term) => {
            // Step 1: search for best-matching article title
            let resolvedTitle = term;
            try {
                const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json&origin=*`;
                const sc = new AbortController();
                const st = setTimeout(() => sc.abort(), 4000);
                try {
                    const sr = await fetch(searchUrl, { signal: sc.signal });
                    if (sr.ok) {
                        const sd = await sr.json().catch(() => null);
                        const hit = sd?.query?.search?.[0]?.title;
                        if (hit) resolvedTitle = hit;
                    }
                } finally {
                    clearTimeout(st);
                }
            } catch { /* search unavailable — use raw term */ }

            // Step 2: fetch summary for resolved title
            const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(resolvedTitle)}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            try {
                const resp = await fetch(summaryUrl, { signal: controller.signal });
                if (!resp.ok) return null;
                return await resp.json().catch(() => null);
            } finally {
                clearTimeout(timer);
            }
        };

        const snippets = [];
        const seenTitles = new Set();
        const MAX_TOTAL_CHARS = 6000;
        let totalChars = 0;

        for (const term of safeTerms) {
            if (totalChars >= MAX_TOTAL_CHARS) break;
            try {
                const data = await resolveAndFetchSummary(term);
                let extract = String(data?.extract || '').replace(/\s+/g, ' ').trim();
                let resolvedTitle = String(data?.title || term);

                // If Wikipedia returned a short extract, try DuckDuckGo Instant Answer as supplement
                if (extract.length < 200) {
                    const ddgText = await this._fetchDdgSnippet(term);
                    if (ddgText) {
                        extract = extract ? `${extract} ${ddgText}` : ddgText;
                        if (!data?.title) resolvedTitle = term;
                    }
                }

                if (!extract) continue;
                seenTitles.add(resolvedTitle.toLowerCase());
                const short = extract.length > maxCharsPerSnippet
                    ? extract.slice(0, maxCharsPerSnippet).replace(/\s\S*$/, '') + '...'
                    : extract;
                snippets.push(`[${resolvedTitle}] ${short}`);
                totalChars += short.length;

                if (followRelated && totalChars < MAX_TOTAL_CHARS) {
                    try {
                        const relUrl = `https://en.wikipedia.org/api/rest_v1/page/related/${encodeURIComponent(resolvedTitle)}`;
                        const relController = new AbortController();
                        const relTimer = setTimeout(() => relController.abort(), 5000);
                        let relResp;
                        try {
                            relResp = await fetch(relUrl, { signal: relController.signal });
                        } finally {
                            clearTimeout(relTimer);
                        }
                        if (relResp.ok) {
                            const relData = await relResp.json().catch(() => null);
                            const relPages = Array.isArray(relData?.pages) ? relData.pages : [];
                            let relCount = 0;
                            for (const page of relPages) {
                                if (relCount >= maxRelatedPerTerm || totalChars >= MAX_TOTAL_CHARS) break;
                                const relTitle = String(page?.title || '').trim();
                                if (!relTitle || seenTitles.has(relTitle.toLowerCase())) continue;
                                const relExtract = String(page?.extract || '').replace(/\s+/g, ' ').trim();
                                if (!relExtract || relExtract.length < 40) continue;
                                seenTitles.add(relTitle.toLowerCase());
                                const relShort = relExtract.length > maxCharsRelated
                                    ? relExtract.slice(0, maxCharsRelated).replace(/\s\S*$/, '') + '...'
                                    : relExtract;
                                snippets.push(`[${relTitle}] ${relShort}`);
                                totalChars += relShort.length;
                                relCount++;
                            }
                        }
                    } catch {
                        // related fetch failed — skip
                    }
                }
            } catch {
                // network unavailable — skip silently
            }
        }

        // Second pass: Open Library for any term not yet well-covered (adds book/novel context)
        for (const term of safeTerms) {
            if (totalChars >= MAX_TOTAL_CHARS) break;
            if (seenTitles.has(term.toLowerCase())) continue;
            try {
                const olText = await this._fetchOpenLibrarySnippet(term);
                if (!olText) continue;
                seenTitles.add(term.toLowerCase());
                const short = olText.length > 600 ? olText.slice(0, 600).replace(/\s\S*$/, '') + '...' : olText;
                snippets.push(`[${term} · Open Library] ${short}`);
                totalChars += short.length;
            } catch { /* skip */ }
        }

        return snippets.join(' | ');
    }

    // Wikipedia article titles that resolve from poetic theme vocabulary but
    // carry no film-theory signal. Add entries only when observed in snapshots.
    static get _WIKI_NOISE_TITLES() {
        return new Set([
            'recursive self-improvement',
            'facial',
            'aura (paranormal)',
            'glitch (music)',
            'glitch art',
        ]);
    }

    // Theme fragment strings that reliably resolve to junk on Wikipedia.
    // Lowercased, leading article stripped before comparison.
    static get _WIKI_THEME_FRAGMENT_DENY() {
        return new Set([
            'recursive self',
            'faciality',
            'glitch aura',
            'the untranslatable',
            'the gaze',
            'memory',
            'identity',
            'longing',
        ]);
    }

    async _getWikiContextForTraining(seed = {}, movie = '') {
        const cacheKey = String(movie || seed?.movie || '').toLowerCase().trim();
        const cached = this._wikiContextCache.get(cacheKey);
        const TTL_MS = 30 * 60 * 1000;
        // Invalidate sparse cache entries so a better fetch can replace them
        const isSparse = cached && (
            cached.snippets.length < 500 ||
            cached.snippets.split(' | ').filter(Boolean).length < 2 ||
            !cached.snippets.includes('Open Library') && cached.snippets.split(' | ').filter(Boolean).length < 4
        );
        if (cached && !isSparse && (Date.now() - cached.fetchedAt) < TTL_MS) return cached.snippets;

        // References are well-formed comma/semicolon/pipe lists — don't split on / or —
        const rawRefs = String(seed?.references || '')
            .split(/[,;|]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 3);

        // Themes are compound strings like 'Recursive Self / Faciality / The Glitch Aura'.
        // Split on / and — (same as _buildRuntimeTrainingSeeds), then drop fragments that
        // are too short/generic to resolve cleanly on Wikipedia.
        const themeDeny = VoiceManager._WIKI_THEME_FRAGMENT_DENY;
        const stripArticle = (s) => s.replace(/^(?:the|a|an)\s+/i, '').trim();
        const rawThemes = String(seed?.theme || '')
            .split(/\s*(?:\/|—|,|;|\|)\s*/)
            .map((s) => s.trim())
            .filter((s) => s.length > 3)
            .filter((s) => {
                // Single-word fragments under 12 chars almost always resolve wrong
                if (s.split(/\s+/).length < 2 && s.length < 12) return false;
                if (themeDeny.has(stripArticle(s).toLowerCase())) return false;
                return true;
            });

        const terms = [...new Set([...rawRefs.slice(0, 3), ...rawThemes.slice(0, 2)])].slice(0, 5);

        const rawSnippets = await this._fetchWikipediaSnippets(terms, {
            maxTerms: 5,
            maxCharsPerSnippet: 1200,
            followRelated: true,
            maxRelatedPerTerm: 2,
            maxCharsRelated: 500
        });

        // Output-side filter: remove noise titles that slipped in via fuzzy search
        // or related-page follow-up, even after the input-side fixes above.
        const noiseTitles = VoiceManager._WIKI_NOISE_TITLES;
        const snippets = String(rawSnippets || '')
            .split(' | ')
            .filter(Boolean)
            .filter((part) => {
                const m = part.match(/^\[([^\]]+)\]/);
                if (!m) return true;
                const title = m[1].toLowerCase().trim();
                if (noiseTitles.has(title)) return false;
                if (themeDeny.has(stripArticle(title))) return false;
                return true;
            })
            .join(' | ');

        this._wikiContextCache.set(cacheKey, { snippets, fetchedAt: Date.now() });
        return snippets;
    }

    /** Returns a serializable summary of cached Wikipedia context for dashboard visualization. */
    getWikiContextSummary() {
        const result = [];
        for (const [movie, entry] of this._wikiContextCache) {
            const snippets = String(entry?.snippets || '');
            const parts = snippets ? snippets.split(' | ').filter(Boolean) : [];
            const terms = parts.map((p) => {
                const m = p.match(/^\[(.+?)\]/);
                return m ? m[1] : p.slice(0, 40);
            });
            result.push({
                movie,
                termCount: parts.length,
                terms,
                snippets,
                fetchedAt: entry?.fetchedAt || 0
            });
        }
        return result;
    }

    /** Returns the Wikipedia article terms currently being injected in the active training batch. Empty when idle. */
    getActiveWikiTerms() {
        return Array.isArray(this._activeWikiTerms) ? this._activeWikiTerms : [];
    }

    /**
     * Returns a list of { movie, hasNotebookContext, notebookContextLength } for each loaded brain.
     * Used by the dashboard to show a Notebook badge and by the export feature.
     */
    getNotebookContextSummary() {
        const result = [];
        for (const [movie, brain] of Object.entries(movieBrains || {})) {
            const nc = this._runtimeNotebookContexts?.get(movie) || brain?.trainingSeeds?.notebookContext || brain?.notebookContext;
            result.push({
                movie,
                hasNotebookContext: typeof nc === 'string' && nc.trim().length > 0,
                notebookContextLength: typeof nc === 'string' ? nc.trim().length : 0
            });
        }
        return result;
    }

    /**
     * Set or replace the notebookContext for a movie at runtime.
     * Takes effect immediately — the next training batch for that movie will use the new text.
     * @param {string} movieName  - Key matching movieBrains (e.g. 'Synthetic_Desires_1.mp4')
     * @param {string} text       - The NotebookLM synthesis text to inject as highest-authority context
     */
    setNotebookContext(movieName, text) {
        const normalizedMovie = String(movieName || '').trim();
        if (!normalizedMovie) return;
        const safeText = String(text || '').trim();
        this._runtimeNotebookContexts.set(normalizedMovie, safeText);
        // Also persist on the brain so static getNotebookContextSummary from movieBrains reflects it
        if (movieBrains[normalizedMovie]?.trainingSeeds) {
            movieBrains[normalizedMovie].trainingSeeds.notebookContext = safeText;
        }
        // Persist all notebook contexts to localStorage so they survive page reload
        try {
            const all = {};
            for (const [k, v] of this._runtimeNotebookContexts.entries()) {
                if (v) all[k] = v;
            }
            localStorage.setItem('notebook_ctx_v1', JSON.stringify(all));
        } catch { }
    }

    _buildGroundedTrainingAnchorPool(seed = {}, focus = 'theme', movieName = seed?.movie || this.currentMovie) {
        const collectConcepts = (value, { fallback = [], maxParts = 8 } = {}) => this._buildTrainingConceptPool(value, {
            fallback,
            maxParts,
            movieName
        });
        const lowSignalAnchors = new Set([
            'memory', 'identity', 'longing', 'the city', 'city', 'the image', 'image', 'the hum', 'hum',
            'rain', 'neon light', 'electric light', 'the frame', 'frame', 'fashion', 'luxury',
            'obsolescence', 'simulation', 'the film\'s lineage', 'emotional lineage', 'visual ancestry'
        ]);
        const themeAnchors = collectConcepts(seed.theme || seed.fallbackPersonality || '', { maxParts: 8 });
        const referenceAnchors = collectConcepts(seed.references || '', { maxParts: 10 });
        const symbolAnchors = collectConcepts(seed.symbols || '', { maxParts: 10 });
        const obsessionAnchors = collectConcepts(seed.obsessions || '', { maxParts: 8 });
        const storyAnchors = collectConcepts(seed.story || '', { maxParts: 8 });
        const quoteAnchors = this._buildTrainingQuotePool(seed.quote || '', 6)
            .map((part) => part.replace(/^"|"$/g, '').trim())
            .map((part) => this._toTrainingConceptLabel(part, ''))
            .filter(Boolean);

        const poolsByFocus = {
            reference: [referenceAnchors, quoteAnchors, storyAnchors, symbolAnchors, themeAnchors],
            theme: [themeAnchors, obsessionAnchors, storyAnchors, referenceAnchors, symbolAnchors],
            symbol: [symbolAnchors, storyAnchors, themeAnchors, referenceAnchors],
            visual: [symbolAnchors, storyAnchors, referenceAnchors, themeAnchors],
            audio: [quoteAnchors, symbolAnchors, storyAnchors, themeAnchors],
            character: [obsessionAnchors, themeAnchors, storyAnchors, symbolAnchors],
            language: [quoteAnchors, themeAnchors, referenceAnchors, symbolAnchors],
            philosophy: [themeAnchors, obsessionAnchors, referenceAnchors, storyAnchors]
        };
        const selectedPools = poolsByFocus[focus] || [themeAnchors, referenceAnchors, symbolAnchors, storyAnchors];
        const anchors = [];
        const seen = new Set();

        const push = (value) => {
            const normalized = String(value || '').replace(/\s+/g, ' ').trim();
            if (!normalized) return;
            const lower = normalized.toLowerCase();
            if (lowSignalAnchors.has(lower)) return;
            const isSingleWord = !/\s/.test(normalized);
            if (isSingleWord && normalized.length < 5 && !/^[A-Z]/.test(normalized)) return;
            if (seen.has(lower)) return;
            seen.add(lower);
            anchors.push(normalized);
        };

        for (const pool of selectedPools) {
            for (const item of pool) push(item);
        }

        return anchors.slice(0, 8);
    }

    _hasGroundedTrainingAnchor(value = '', anchors = []) {
        const normalizedValue = this._normalizeUtterance(value || '');
        if (!normalizedValue) return false;
        const haystack = ` ${normalizedValue} `;

        return (Array.isArray(anchors) ? anchors : [])
            .map((anchor) => this._normalizeUtterance(anchor || ''))
            .filter(Boolean)
            .some((anchor) => haystack.includes(` ${anchor} `));
    }

    _isTooGenericTrainingQuestion(input = '') {
        const normalized = String(input || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!normalized) return true;

        return /^(?:what|how|why)\s+(?:is|does|can|could|would|should)\s+(?:this|that|it|the film|the movie|the world|the scene)\s+(?:feeling|mood|emotion|essence|nature|self)\??$/.test(normalized)
            || /^(?:what)\s+is\s+the\s+essence\s+of\s+this\s+feeling\??$/.test(normalized)
            || /^(?:what)\s+is\s+this\s+feeling\??$/.test(normalized);
    }

    _isGroundedTrainingQuestion(input = '', { seed = {}, focus = 'theme', movie = this.currentMovie } = {}) {
        if (!this._isNaturalTrainingQuestion(input)) return false;
        if (this._isTooGenericTrainingQuestion(input)) return false;
        const anchors = this._buildGroundedTrainingAnchorPool(seed, focus, movie);
        if (!anchors.length) return true;
        return this._hasGroundedTrainingAnchor(input, anchors);
    }

    _isGroundedTrainingResponse(response = '', { seed = {}, focus = 'theme', movie = this.currentMovie } = {}) {
        const anchors = this._buildGroundedTrainingAnchorPool(seed, focus, movie);
        if (!anchors.length) return true;

        const normalized = String(response || '').replace(/\s+/g, ' ').trim();
        const lyricalDriftPatterns = [
            /\belectric blue\b/i,
            /\bfading lens\b/i,
            /\bfractured (?:echo|self|image)\b/i,
            /\blost melod(?:y|ies)\b/i,
            /\bbilingual ghost\b/i,
            /\bpostcard flash\b/i,
            /\bworld whispers?\b/i,
            /\bimage consumed\b/i
        ];
        const lyricalHits = lyricalDriftPatterns.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);

        if (!this._hasGroundedTrainingAnchor(normalized, anchors)) return false;
        if (lyricalHits >= 2) return false;
        return true;
    }

    _buildTrainingToneLabel(value = '', fallback = 'cold restraint') {
        const first = this._splitTrainingFragments(value, 1)[0] || String(value || '').split(/[.;]/)[0] || fallback;
        const compact = this._condenseReply(first, 'brain', { maxChars: 40, maxSentences: 1 }).replace(/[.]+$/g, '').trim();
        return this._lowercaseTrainingLead(compact || fallback) || fallback;
    }

    _pickTrainingFragment(parts = [], index = 0, fallback = '') {
        if (!Array.isArray(parts) || !parts.length) return String(fallback || '').trim();
        const safeIndex = Math.abs(Number(index || 0)) % parts.length;
        return String(parts[safeIndex] || fallback || '').trim();
    }

    _buildLocalTrainingBatch(seed = {}, focus = 'theme', batchNumber = 1, batchSize = 4, dynamicContext = null, variantSeed = 0) {
        const safeDynamicContext = this._sanitizeTrainingDynamicContext(dynamicContext);
        const themes = this._buildTrainingConceptPool(seed.theme || seed.fallbackPersonality || 'synthetic longing and memory', {
            fallback: ['synthetic longing', 'memory', 'identity'],
            maxParts: 8
        });
        const referenceCandidates = this._buildTrainingConceptPool(seed.references || '', {
            fallback: [],
            maxParts: 8
        });
        const movieReferenceLabel = String(seed.movie || this.currentMovie || '')
            .replace(/\.[^.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\d+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const weakReferencePattern = /^(?:the film'?s lineage|emotional lineage|visual ancestry|cinematic echoes)$/i;
        const referencesList = referenceCandidates.filter((item) => {
            const normalized = String(item || '').replace(/\s+/g, ' ').trim();
            if (normalized.length < 4) return false;
            const lower = normalized.toLowerCase();
            if (weakReferencePattern.test(normalized)) return false;
            if (movieReferenceLabel && lower === movieReferenceLabel) return false;
            return true;
        });
        const hasReferenceAnchors = referencesList.length > 0;
        const referencePool = referencesList;
        const symbolCandidates = this._buildTrainingConceptPool(seed.symbols || seed.quote || seed.theme || 'rain, skin, memory, reflection', {
            fallback: ['ceramic skin', 'phantom limb', 'the hum', 'memory'],
            maxParts: 8
        });
        const symbolsList = symbolCandidates.filter((item) => String(item || '').trim().length >= 4);
        const quotes = this._buildTrainingQuotePool(seed.quote || seed.fallbackPersonality || seed.theme || 'the archive is still forming', 6);
        const obsessionsList = this._buildTrainingConceptPool(seed.obsessions || seed.theme || 'identity, longing, repetition', {
            fallback: ['memory', 'longing', 'identity'],
            maxParts: 8
        });
        const guestTail = '';
        const offset = Math.max(0, Number(variantSeed || 0)) + Math.max(0, Number(batchNumber || 1) - 1);

        const pick = (parts, localOffset, fallback) => this._pickTrainingFragment(parts, offset + localOffset, fallback);
        const themeA = pick(themes, 0, 'synthetic longing');
        const themeB = pick(themes, 1, themeA);
        const refA = hasReferenceAnchors ? pick(referencePool, 0, '') : '';
        const refB = hasReferenceAnchors ? pick(referencePool, 1, refA) : '';
        const symbolA = pick(symbolsList.length ? symbolsList : symbolCandidates, 0, 'ceramic skin');
        const symbolB = pick(symbolsList.length ? symbolsList : symbolCandidates, 1, 'the hum');
        const quoteA = pick(quotes, 0, '"the archive is still forming"');
        const quoteB = pick(quotes, 1, quoteA);
        const obsessionA = this._lowercaseTrainingLead(pick(obsessionsList, 0, 'memory'));
        const obsessionB = this._lowercaseTrainingLead(pick(obsessionsList, 1, obsessionA));
        const sentenceCase = (value = '') => {
            const normalized = String(value || '').trim();
            return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : '';
        };
        const refAStart = sentenceCase(refA);
        const refBStart = sentenceCase(refB);
        const symbolAStart = sentenceCase(symbolA);
        const symbolBStart = sentenceCase(symbolB);
        const obsessionAStart = sentenceCase(obsessionA);
        const obsessionBStart = sentenceCase(obsessionB);
        const hasStrongReferenceAnchors = hasReferenceAnchors
            && !weakReferencePattern.test(refA)
            && !weakReferencePattern.test(refB);
        const toneA = this._buildTrainingToneLabel(seed.tone || seed.fallbackPersonality || 'wistful restraint');
        const personaLine = this._lowercaseTrainingLead(this._condenseReply(seed.fallbackPersonality || 'a cinematic presence under pressure', 'brain', { maxChars: 54, maxSentences: 1 }).replace(/[.]+$/g, '').trim()) || 'a cinematic presence under pressure';

        const library = {
            reference: hasStrongReferenceAnchors
                ? [
                    { input: 'Which artistic lineage shapes this film most strongly?', response: `The film's clearest ancestry runs through ${refA}. It turns ${themeA} into something inherited rather than improvised.${guestTail}`, intent: 'reference' },
                    { input: 'What earlier image-world keeps echoing through this movie?', response: `It keeps echoing ${refB}. That reference steadies the film's mood and logic.${guestTail}`, intent: 'reference' },
                    { input: 'Why do the references here feel structural instead of decorative?', response: `Because ${refA} turns the film's surfaces into an argument about ${themeB}. The references are doing emotional architecture, not decoration.${guestTail}`, intent: 'reference' },
                    { input: `How does this film translate ${refB} into its own language?`, response: `It translates ${refB} through ${themeA}. The result stays ${toneA} without becoming imitation.${guestTail}`, intent: 'reference' },
                    { input: `Which reference returns whenever the film leans hardest into ${themeA}?`, response: `The film returns to ${refA} there. The brain uses it as a guide for how to read the film's gestures.${guestTail}`, intent: 'reference' },
                    { input: 'What cultural memory keeps pressing through the film’s design?', response: `It keeps drawing on ${refB}. That ancestry gives the world a recognizable charge.${guestTail}`, intent: 'reference' }
                ]
                : [
                    { input: 'What image logic shapes this film most strongly?', response: `${symbolAStart} and ${themeA} keep teaching the eye how to read this world. The structure feels discovered rather than imposed.${guestTail}`, intent: 'reference' },
                    { input: 'What earlier visual pressure keeps echoing through this movie?', response: `${symbolBStart} keeps echoing through the movie\'s surfaces. The repetition steadies the mood and logic.${guestTail}`, intent: 'reference' },
                    { input: 'Why do the visual echoes here feel structural instead of decorative?', response: `Because ${themeB} keeps returning through ${symbolA}. The echoes are doing emotional architecture, not decoration.${guestTail}`, intent: 'reference' },
                    { input: `How does this film turn ${symbolB} into its own language?`, response: `It turns ${symbolB} toward ${themeA}. The result stays ${toneA} without becoming obvious.${guestTail}`, intent: 'reference' },
                    { input: `Which recurring image returns whenever the film leans hardest into ${themeA}?`, response: `The film keeps returning to ${symbolA} there. The brain uses that image to read the film's gestures.${guestTail}`, intent: 'reference' },
                    { input: 'What visual memory keeps pressing through the film’s design?', response: `${symbolBStart} keeps pressing through the design. That repetition gives the world a recognizable charge.${guestTail}`, intent: 'reference' }
                ],
            theme: [
                { input: 'What emotional center anchors this film?', response: `Its center is ${themeA}. Everything else orbits that pressure.${guestTail}`, intent: 'theme' },
                { input: 'What longing keeps returning beneath the surface?', response: `A longing around ${themeB}, sharpened by ${obsessionA}. The film keeps asking how desire survives exposure.${guestTail}`, intent: 'theme' },
                { input: 'What idea keeps circling back in this world?', response: `It keeps circling ${themeA}. Each return binds memory to desire.${guestTail}`, intent: 'theme' },
                { input: 'Why does the mood feel stronger than the plot?', response: `Because ${themeB} is the real engine here. The story reorganizes itself around that emotional gravity.${guestTail}`, intent: 'theme' },
                { input: 'What does this film most want to understand?', response: `It wants to understand how ${themeA} can remain visible inside a world marked by ${symbolA}.${guestTail}`, intent: 'theme' },
                { input: `How does one recurring obsession reshape the movie’s mood?`, response: `${obsessionBStart} pushes the film back toward ${themeA}. It makes the mood feel deliberate rather than incidental.${guestTail}`, intent: 'theme' }
            ],
            symbol: [
                { input: `Why does ${symbolA} carry so much meaning in this film?`, response: `${symbolAStart} carries that weight because it keeps pointing back to ${themeA}. The image compresses the whole world into a repeatable sign.${guestTail}`, intent: 'theme' },
                { input: 'What symbol does the local brain remember first?', response: `${symbolBStart} comes back first. It is the shortest path into the film's inner logic.${guestTail}`, intent: 'theme' },
                { input: `How do ${symbolA} and ${symbolB} change the way the story is read?`, response: `They turn the story toward ${themeB}. The symbols do philosophical work, not just visual work.${guestTail}`, intent: 'theme' },
                { input: `What object in this world feels more like memory than prop?`, response: `${symbolAStart} feels that way. The brain stores it as a portable fragment of the film's emotion.${guestTail}`, intent: 'theme' },
                { input: 'Why do certain recurring images stay so vivid?', response: `Because ${symbolB} keeps binding surface to feeling. The repetition makes the image behave like memory.${guestTail}`, intent: 'theme' },
                { input: `What hidden meaning sits inside the film’s use of ${symbolA}?`, response: `It hides ${themeA} in plain sight. The symbol keeps saying more than the dialogue does.${guestTail}`, intent: 'theme' }
            ],
            visual: [
                { input: 'What kind of image-world does this film build?', response: hasStrongReferenceAnchors ? `An image-world of surfaces behaving like evidence. ${symbolAStart} gives it texture, and ${refAStart} gives it lineage.${guestTail}` : `An image-world of surfaces behaving like evidence. ${symbolAStart} gives it texture, and ${themeA} gives it pressure.${guestTail}`, intent: 'general' },
                { input: `How does the film look when it leans hardest into ${themeA}?`, response: `It looks tactile, reflective, and unstable. ${symbolBStart} keeps that mood legible.${guestTail}`, intent: 'general' },
                { input: 'Why do certain images stay longer than the scenes themselves?', response: `Because the film keeps fusing ${symbolA} with ${themeB}. The visual field behaves like a memory system.${guestTail}`, intent: 'general' },
                { input: 'What makes the visuals feel distinctive?', response: hasStrongReferenceAnchors ? `${refBStart} gives the imagery ancestry, while ${symbolB} gives it pressure. That mix keeps the look emotionally legible.${guestTail}` : `${symbolBStart} gives the imagery pressure, while ${themeA} keeps it emotionally legible.${guestTail}`, intent: 'general' },
                { input: 'How do surfaces become meaning in this movie?', response: `The surfaces keep translating ${themeA} into evidence. Looking becomes a way of reading feeling.${guestTail}`, intent: 'general' },
                { input: 'What visual pressure holds this world together?', response: `${symbolAStart} and ${symbolB} keep the frame charged without losing tenderness.${guestTail}`, intent: 'general' }
            ],
            audio: [
                { input: 'What sonic mood belongs to this world?', response: `Its sonic mood is tuned to ${themeA} and ${obsessionA}. Even silence feels composed.${guestTail}`, intent: 'general' },
                { input: 'How should the soundtrack be understood?', response: `As an extension of the film's inner pressure. Sound turns atmosphere into psychology here.${guestTail}`, intent: 'general' },
                { input: 'Why does the audio feel structural rather than decorative?', response: `Because sound keeps ${themeB} present even when nothing says it directly.${guestTail}`, intent: 'general' },
                { input: 'What kind of listening does this film ask for?', response: `Attentive listening. Even the hum and the silences behave like signals here.${guestTail}`, intent: 'general' },
                { input: `What does the audio reveal about ${themeB}?`, response: `It reveals that ${themeB} is structural, not decorative. The sound keeps the emotional architecture standing.${guestTail}`, intent: 'general' },
                { input: 'How does silence behave in this movie?', response: `Silence behaves like stored pressure. It keeps the world feeling inhabited from within.${guestTail}`, intent: 'general' }
            ],
            character: [
                { input: 'What kind of self is this film assembling?', response: `A self built from ${themeA}, ${obsessionA}, and ${symbolA}. The character feels assembled from desire and observation at once.${guestTail}`, intent: 'identity' },
                { input: 'Who seems to be speaking through this world?', response: `A consciousness shaped by ${themeB}. The voice stays ${toneA}, as if it knows it was assembled under pressure.${guestTail}`, intent: 'identity' },
                { input: 'How does the main presence understand itself?', response: `Through ${themeA} and the pressure of ${obsessionB}. The self is sensed before it is fully explained.${guestTail}`, intent: 'identity' },
                { input: 'What sort of consciousness learns to speak in images before words here?', response: `A consciousness shaped by ${themeB}. It thinks in images before it settles into language, and it stays ${toneA}.${guestTail}`, intent: 'identity' },
                { input: 'Why does the self in this film feel unfinished on purpose?', response: `Because it keeps being built under the pressure of ${themeA} and ${symbolB}. The incompleteness is part of its design.${guestTail}`, intent: 'identity' },
                { input: 'What identity pressure keeps returning throughout the film?', response: `${obsessionAStart} keeps returning as identity pressure. It gives the self a contour without closing it off.${guestTail}`, intent: 'identity' }
            ],
            language: [
                { input: 'How does this film speak?', response: `It speaks in charged fragments and withheld explanation. The language stays suggestive, intimate, and slightly haunted.${guestTail}`, intent: 'quote' },
                { input: 'Why does the language feel so compressed here?', response: `Because the film keeps turning feeling into residue instead of exposition. The phrases land like memory-traces.${guestTail}`, intent: 'quote' },
                { input: 'What kinds of words fit this world best?', response: `Words around ${themeA}, ${symbolA}, and ${obsessionA} fit best. The film prefers charged fragments over plain explanation.${guestTail}`, intent: 'quote' },
                { input: 'What does the film’s language try to preserve?', response: `It tries to preserve ${themeB} in a speakable form. The words keep mood intact without flattening it.${guestTail}`, intent: 'quote' },
                { input: 'Why do some lines feel more like memory than dialogue?', response: `Because they carry residue rather than explanation. A line like ${quoteB} feels recalled instead of announced.${guestTail}`, intent: 'quote' },
                { input: 'How does the brain hear the film talking to itself?', response: `As a voice shaped by ${themeA} and ${obsessionA}. The language sounds intimate because it never fully resolves.${guestTail}`, intent: 'quote' }
            ],
            philosophy: [
                { input: 'What philosophical tension defines this movie?', response: `The tension is between ${themeA} and ${obsessionA}. The film keeps asking what kind of self can stay coherent under pressure.${guestTail}`, intent: 'theme' },
                { input: 'What larger question hides beneath the mood?', response: `It asks how ${themeB} survives inside a body marked by ${symbolA}. The philosophy is embodied rather than abstract.${guestTail}`, intent: 'theme' },
                { input: 'Why does this film feel philosophical instead of merely stylish?', response: `Because the style keeps pointing back to questions of being, memory, and identity.${guestTail}`, intent: 'theme' },
                { input: 'What idea does the brain keep relearning here?', response: `That ${themeA} is never only emotional. The world keeps asking what kind of being desire creates.${guestTail}`, intent: 'theme' },
                { input: 'How does one recurring obsession turn mood into philosophy?', response: `${obsessionBStart} turns mood into a test of identity. The film keeps making emotion answer ontological questions.${guestTail}`, intent: 'theme' },
                { input: 'What truth is hidden inside the film’s attachments?', response: `That ${themeB} is a way of asking how a self can stay coherent under pressure. The philosophy is built into the feeling.${guestTail}`, intent: 'theme' }
            ]
        };

        const pool = Array.isArray(library[focus]) ? library[focus] : library.theme;
        const rotated = [];
        for (let index = 0; index < pool.length; index += 1) {
            rotated.push(pool[(index + offset) % pool.length]);
        }
        return rotated.slice(0, Math.max(1, batchSize)).map((entry) => ({ ...entry, source: 'template' }));
    }

    _buildLocalOllamaTrainingPrompt({
        seed = {},
        focus = 'theme',
        dynamicContext = null,
        recentInputs = [],
        recentResponses = [],
        avoidTerms = [],
        seedKeywords = [],
        webContext = '',
        notebookContext = ''
    } = {}) {
        const safeDynamicContext = this._sanitizeTrainingDynamicContext(dynamicContext);
        const compact = (value, maxChars = 92) => this._condenseReply(value, 'brain', { maxChars, maxSentences: 1 })
            .replace(/[.]+$/g, '')
            .trim();
        const intentHintByFocus = {
            reference: 'reference',
            theme: 'theme',
            symbol: 'theme',
            visual: 'general',
            audio: 'general',
            character: 'identity',
            language: 'quote',
            philosophy: 'theme'
        };

        const movie = compact(seed.movie || this.currentMovie || DEFAULT_MOVIE_BRAIN, 54) || 'the film';
        const theme = compact(seed.theme || seed.fallbackPersonality || 'synthetic longing', 78) || 'synthetic longing';
        const personality = compact(seed.fallbackPersonality || seed.tone || 'wistful ceramic android', 84) || 'wistful ceramic android';
        const tone = compact(seed.tone || 'wistful restraint', 56) || 'wistful restraint';
        const story = compact(seed.story || 'surfaces behaving like memory', 110) || 'surfaces behaving like memory';
        const references = compact(seed.references || 'cinematic echoes', 110) || 'cinematic echoes';
        const symbols = compact(seed.symbols || 'rain, skin, memory, reflection', 90) || 'rain, skin, memory, reflection';
        const quote = compact(seed.quote || 'the archive is still forming', 82) || 'the archive is still forming';
        const guestPrompt = compact(safeDynamicContext?.latestGuestPrompt || safeDynamicContext?.liveGuestDirection || 'none', 90) || 'none';
        const guestReply = compact(safeDynamicContext?.latestGuestReply || 'none', 90) || 'none';
        const questionAvoid = [
            ...(Array.isArray(recentInputs) ? recentInputs : []),
            ...(Array.isArray(safeDynamicContext?.recentPodcastQuestions) ? safeDynamicContext.recentPodcastQuestions : [])
        ]
            .slice(-3)
            .map((item) => compact(item, 72))
            .filter(Boolean)
            .join(' | ') || 'none';
        const answerAvoid = [
            ...(Array.isArray(recentResponses) ? recentResponses : []),
            ...(Array.isArray(safeDynamicContext?.recentPodcastAnswers) ? safeDynamicContext.recentPodcastAnswers : [])
        ]
            .slice(-2)
            .map((item) => `- ${compact(item, 86)}`)
            .filter(Boolean)
            .join('\n') || '- none';
        const suggestedQuestionAngles = (Array.isArray(safeDynamicContext?.suggestedQuestionAngles) ? safeDynamicContext.suggestedQuestionAngles : [])
            .slice(0, 3)
            .map((item) => compact(item, 84))
            .filter(Boolean)
            .join(' | ') || 'none';
        const avoid = (Array.isArray(avoidTerms) ? avoidTerms : []).slice(0, 5).join(', ') || 'none';
        const keywords = (Array.isArray(seedKeywords) ? seedKeywords : []).slice(0, 8).join(', ') || 'none';
        const intentHint = intentHintByFocus[focus] || 'general';
        const groundingAnchors = this._buildGroundedTrainingAnchorPool(seed, focus, seed.movie || this.currentMovie);
        const anchorList = groundingAnchors.join(', ') || 'none';

        // Gemma4 runs at num_ctx:2048. Full notebook (7K chars ≈ 1800 tokens) overflows.
        // Keep the first ~1200 chars (covers the core vocabulary section) trimmed to a sentence boundary.
        const MAX_NOTEBOOK_CHARS = 1200;
        const trimmedNotebook = notebookContext && notebookContext.length > MAX_NOTEBOOK_CHARS
            ? (notebookContext.slice(0, MAX_NOTEBOOK_CHARS).replace(/[^.!?]*$/, '').trim() || notebookContext.slice(0, MAX_NOTEBOOK_CHARS))
            : notebookContext;

        return [
            trimmedNotebook ? `Curated synthesis (highest authority — use this vocabulary and framing above all else): ${trimmedNotebook}` : ``,
            `Item for "${movie}". Focus: ${focus}. Voice: ${personality}.`,
            `Context: ${story}. Symbols: ${symbols}. References: ${references}.`,
            webContext ? `Web research context (ground answers in this; do not copy verbatim): ${webContext}` : '',
            `The answer must draw from the curated synthesis vocabulary above — use its specific terms and frameworks, not generic film theory.`,
            `Grounding anchors: ${anchorList}.`,
            `Steering hint: ${guestPrompt}. ${guestReply !== 'none' ? `Recent answer: ${guestReply}. ` : ''}Use it silently; never mention the guest or the steering prompt in the output.`,
            `Strong question angles already proven in this session: ${suggestedQuestionAngles}. Reuse their specificity and anchor logic without copying them verbatim.`,
            `Avoid reusing or closely rephrasing these recent questions: ${questionAvoid}.`,
            `Avoid answers that sound too close to these recent lines:\n${answerAvoid}`,
            `Avoid words: ${avoid}. Keywords: ${keywords}.`,
            `Reply with ONE JSON object: {"input":"viewer question","response":"1-2 sentence answer","intent":"${intentHint}"}`,
            `Rules: Stay in character, under 150 chars, no markdown, and never mention the guest or the steering prompt.`,
            `The question must include at least one grounding anchor from the list above.`,
            `Choose a visibly different angle from the recent questions above; do not open with a stock prompt shape if one of those shapes was just used.`,
            `The answer must interpret one or two grounding anchors plainly and concretely, not as free-floating mood poetry.`,
            `Avoid generic questions like "What is this feeling?" or "What is the essence of this feeling?"`,
            `Avoid vague filler such as "electric bloom", "fading lens", "fractured echo", or "the world whispers" unless the seed context explicitly supports it.`
        ].filter(Boolean).join('\n');
    }

    _formatTrainingCompletionSummary(label, {
        batches = 0,
        added = 0,
        updated = 0,
        beforeCount = 0,
        afterCount = 0
    } = {}) {
        const touched = Math.max(0, Number(added || 0) + Number(updated || 0));
        const netChange = Number(afterCount || 0) - Number(beforeCount || 0);
        const touchedText = touched === 0
            ? '0 memory pairs saved'
            : `${touched} memory pair${touched !== 1 ? 's' : ''} saved/updated`;
        const netText = netChange === touched
            ? ''
            : ` · net ${netChange >= 0 ? '+' : ''}${netChange} in storage`;
        return `${label} · ${batches} batch${batches !== 1 ? 'es' : ''} · ${touchedText}${netText} (${beforeCount} → ${afterCount}).`;
    }

    _loadUsableTrainingMemories(movieName = this.currentMovie) {
        const normalizedMovie = String(movieName || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN;
        return loadMemories(normalizedMovie).filter((entry) =>
            this._isNaturalTrainingQuestion(entry?.input || '')
            && this._isAcceptableLocalTrainingResponse(entry?.response || '', { movie: normalizedMovie })
        );
    }

    _getAdaptiveTrainingMovieState(movieStates, movieName = this.currentMovie, { includePersona = false } = {}) {
        const normalizedMovie = String(movieName || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN;
        let state = movieStates.get(normalizedMovie);
        const resolvedBrain = normalizedMovie === this.currentMovie
            ? (this.currentMovieBrain || resolveMovieBrain(normalizedMovie) || {})
            : (state?.brain || resolveMovieBrain(normalizedMovie) || {});

        if (!state) {
            const usableMemories = this._loadUsableTrainingMemories(normalizedMovie);
            state = {
                movie: normalizedMovie,
                brain: resolvedBrain,
                seed: this._buildTrainingSeedContext({ movie: normalizedMovie, brain: resolvedBrain }),
                seedKeywords: [],
                beforeCount: usableMemories.length,
                byInput: new Map(usableMemories.map((entry) => [
                    String(entry.input || '').trim().toLowerCase(),
                    String(entry.response || '').trim()
                ])),
                trainingPersonaText: ''
            };
            movieStates.set(normalizedMovie, state);
        } else if (normalizedMovie === this.currentMovie && state.brain !== resolvedBrain) {
            state.brain = resolvedBrain;
            state.seed = this._buildTrainingSeedContext({ movie: normalizedMovie, brain: resolvedBrain });
        }

        state.seedKeywords = this._extractTrainingSeedKeywords(state.seed);
        if (includePersona && normalizedMovie === this.currentMovie) {
            state.trainingPersonaText = this._buildCloudPersona();
        }

        return state;
    }

    async trainBrainLocally(options = {}) {
        const durationMs = Math.max(8000, Math.min(10 * 60 * 1000, Number(options?.durationMs || (10 * 60 * 1000))));
        const batchSize = Math.max(2, Math.min(4, Number(options?.batchSize || 3)));
        const requestedMaxBatches = Number(options?.maxBatches);
        const requestedLocalBatchWaitMs = Number(options?.maxLocalBatchWaitMs);
        const localBatchWaitMs = Number.isFinite(requestedLocalBatchWaitMs) && requestedLocalBatchWaitMs > 0
            ? Math.max(2500, Math.min(60000, requestedLocalBatchWaitMs))
            : null;
        const requestedFallbackFailureThreshold = Number(options?.localFallbackFailureThreshold);
        const defaultMaxBatches = Math.max(40, Math.ceil(durationMs / 3000));
        const maxBatches = Number.isFinite(requestedMaxBatches)
            ? Math.max(2, Math.min(240, requestedMaxBatches))
            : Math.min(240, defaultMaxBatches);
        const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
        const getDynamicContext = typeof options?.getDynamicContext === 'function' ? options.getDynamicContext : null;
        const useOllamaModel = options?.useOllamaModel !== false;
        const allowTemplateFallback = options?.allowTemplateFallback === true;
        const startedAt = Date.now();
        const movieStates = new Map();
        let trainingState = this._getAdaptiveTrainingMovieState(movieStates);
        let trainingMovie = trainingState.movie;
        const touchedMovies = new Set([trainingMovie]);
        const intentCounts = { reference: 0, theme: 0, general: 0, quote: 0, identity: 0 };
        const sampleInputs = [];
        const focusAreas = ['reference', 'theme', 'symbol', 'visual', 'audio', 'character', 'language', 'philosophy'];
        const explicitTrainingCandidateModels = Array.isArray(options?.candidateModels)
            ? this._normalizeLocalModelList(options.candidateModels)
            : null;
        // Pre-fetch Wikipedia context for the current movie's seed references (non-blocking, best-effort)
        const wikiContextByMovie = new Map();
        const _wikiTTL = 30 * 60 * 1000;
        const _isWikiEntrySparse = (entry) => !entry || (
            entry.snippets.length < 500 ||
            entry.snippets.split(' | ').filter(Boolean).length < 2 ||
            (!entry.snippets.includes('Open Library') && entry.snippets.split(' | ').filter(Boolean).length < 4)
        );
        const prefetchWikiContext = async (movie, seed) => {
            if (wikiContextByMovie.has(movie)) return;
            // Synchronously pre-seed from warm instance cache to eliminate race on first batch
            const _wikiKey = String(movie || '').toLowerCase().trim();
            const _existing = this._wikiContextCache.get(_wikiKey);
            if (_existing && !_isWikiEntrySparse(_existing) && (Date.now() - _existing.fetchedAt) < _wikiTTL) {
                wikiContextByMovie.set(movie, _existing.snippets);
                return;
            }
            wikiContextByMovie.set(movie, ''); // placeholder to avoid double-fetch
            try {
                const snippets = await this._getWikiContextForTraining(seed, movie);
                if (snippets) {
                    wikiContextByMovie.set(movie, snippets);
                    console.log(`[Wiki] Fetched context for ${movie}: ${snippets.slice(0, 80)}...`);
                }
            } catch {
                // non-fatal
            }
        };
        // Start fetching immediately but don't block training startup
        prefetchWikiContext(trainingMovie, trainingState.seed).catch(() => {});
        const fallbackInfo = await this.getLocalTrainingFallbackInfo({
            useOllamaModel,
            allowTemplateFallback,
            candidateModels: explicitTrainingCandidateModels
        });
        const discoveredTrainingCandidateModels = Array.isArray(fallbackInfo?.candidateModels)
            ? fallbackInfo.candidateModels
            : [];
        const localModelReady = Boolean(fallbackInfo?.usingOllama);
        const activeTrainingModel = localModelReady
            ? String(fallbackInfo?.model || this._ollamaModel || discoveredTrainingCandidateModels[0] || '').trim()
            : '';
        // Always use the full candidate list so gemma3:4b is tried before falling to
        // template — previously a single-element [activeTrainingModel] was used when
        // allowTemplateFallback=true, which skipped the model fallback chain entirely.
        const trainingCandidateModels = localModelReady
            ? discoveredTrainingCandidateModels
            : [];
        let usingOllama = localModelReady;
        let trainingModelLabel = usingOllama
            ? (trainingCandidateModels[0] || activeTrainingModel || this._ollamaModel || 'ollama')
            : 'template';

        let batches = 0;
        let generated = 0;
        let added = 0;
        let updated = 0;
        let skipped = 0;
        let failedBatches = 0;
        let consecutiveLocalFailures = 0;
        let consecutiveOllamaDryBatches = 0;
        let consecutiveTemplateDryBatches = 0;
        let templateSaved = 0;
        let templateSaveCapAnnounced = false;
        let templateDrainedAnnounced = false;
        const ollamaDryBatchLimit = allowTemplateFallback ? 2 : 4;
        const templateDryBatchLimit = 8;
        const templateMinExplorationBatches = 8;
        const templateSessionSaveCap = this._getTemplateTrainingSaveCap(durationMs);
        const localFallbackFailureThreshold = Number.isFinite(requestedFallbackFailureThreshold)
            ? Math.max(1, Math.min(3, requestedFallbackFailureThreshold))
            : (allowTemplateFallback ? 2 : 3);

        if (useOllamaModel && !usingOllama && !allowTemplateFallback) {
            throw new Error(`Local training unavailable: ${(trainingCandidateModels[0] || this._ollamaModel)} is not ready in Ollama.`);
        }

        const reportProgress = (event, payload = {}) => {
            if (!onProgress) return;
            try {
                onProgress({
                    event,
                    movie: trainingMovie,
                    elapsedMs: Date.now() - startedAt,
                    batches,
                    generated,
                    added,
                    updated,
                    skipped,
                    failedBatches,
                    trainingMode: 'brain-local',
                    trainingEngine: usingOllama ? 'ollama' : 'template',
                    ...payload
                });
            } catch {
                // optional
            }
        };

        const syncTrainingMovie = ({ emitEvent = true } = {}) => {
            const activeMovie = String(this.currentMovie || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN;
            if (activeMovie === trainingMovie) {
                trainingState = this._getAdaptiveTrainingMovieState(movieStates, activeMovie);
                trainingMovie = trainingState.movie;
                return false;
            }

            const fromMovie = trainingMovie;
            trainingState = this._getAdaptiveTrainingMovieState(movieStates, activeMovie);
            trainingMovie = trainingState.movie;
            touchedMovies.add(trainingMovie);
            consecutiveLocalFailures = 0;
            consecutiveOllamaDryBatches = 0;
            consecutiveTemplateDryBatches = 0;
            templateDrainedAnnounced = false;

            if (emitEvent) {
                reportProgress('movie-switched', {
                    fromMovie,
                    toMovie: trainingMovie,
                    beforeCount: trainingState.beforeCount,
                    trainingMode: 'brain-local',
                    trainingEngine: usingOllama ? 'ollama' : 'template'
                });
            }

            return true;
        };

        reportProgress('start', {
            durationMs,
            batchSize,
            maxBatches,
            beforeCount: trainingState.beforeCount,
            seed: trainingState.seed,
            trainingMode: 'brain-local',
            trainingEngine: usingOllama ? 'ollama' : 'template'
        });

        // Warm up gemma4:e2b before the batch loop — cold VRAM load takes ~10-20s.
        // Direct call bypasses _runWithLocalModelFallback so timeout won't trigger backoff.
        if (usingOllama && trainingCandidateModels.length > 0) {
            const warmModel = trainingCandidateModels[0];
            const needsWarmup = /gemma4:e2b|phi4/i.test(warmModel);
            if (needsWarmup) {
                reportProgress('model-warmup', {
                    model: warmModel,
                    trainingMode: 'brain-local',
                    trainingEngine: 'ollama'
                });
                try {
                    await this._callOllamaTrainingPrompt(
                        'Reply with exactly: {"input":"warmup","response":"ok","intent":"general"}',
                        { model: warmModel, maxOutputTokens: 20, temperature: 0.0, timeoutMs: 120000 }
                    );
                } catch {
                    // Warmup timed out or failed — safe to ignore.
                    // The model may now be loading; clear any stale backoff so the
                    // first real batch gets a fair attempt.
                }
                this._clearLocalTrainingModelBackoff(warmModel);
            }
        }

        if (useOllamaModel && !usingOllama && allowTemplateFallback && trainingCandidateModels.length === 0) {
            reportProgress('local-unavailable', {
                reason: 'Local model cooling down. Using template backup.',
                trainingMode: 'brain-local',
                trainingEngine: 'template'
            });
        }

        this._activeWikiTerms = []; // clear at training start
        while ((Date.now() - startedAt) < durationMs && batches < maxBatches) {
            const movieChanged = syncTrainingMovie();
            if (movieChanged) {
                this._activeWikiTerms = []; // clear on movie switch
                prefetchWikiContext(trainingMovie, trainingState.seed).catch(() => {});
            }
            const batchMovie = trainingMovie;
            const batchState = trainingState;
            const focus = focusAreas[batches % focusAreas.length];
            const dynamicContext = this._sanitizeTrainingDynamicContext(getDynamicContext ? (getDynamicContext() || null) : null);
            const effectiveBatchSize = usingOllama ? 1 : batchSize;
            reportProgress('batch-start', {
                focus,
                batchNumber: batches + 1,
                guestSteerActive: Boolean(dynamicContext?.latestGuestPrompt || dynamicContext?.liveGuestDirection),
                trainingMode: 'brain-local',
                trainingEngine: usingOllama ? 'ollama' : 'template',
                batchSize: effectiveBatchSize,
                model: usingOllama ? trainingModelLabel : 'template'
            });

            let entries = [];
            if (usingOllama) {
                const recentInputs = Array.from(batchState.byInput.keys()).slice(-6);
                const recentResponses = Array.from(batchState.byInput.values()).slice(-6);
                const avoidTerms = this._collectOverusedTrainingTerms(recentResponses).slice(0, 5);
                const seedKeywords = batchState.seedKeywords.slice(0, 8);
                let lastHeartbeatStep = 0;
                const localThinkingHeartbeatMs = Math.min(4000, Math.max(2500, Math.floor((localBatchWaitMs || 5000) * 0.8)));
                const templateCandidates = this._buildLocalTrainingBatch(
                    batchState.seed,
                    focus,
                    batches + 1,
                    Math.max(3, batchSize),
                    dynamicContext,
                    batchState.beforeCount + generated + skipped
                );
                const bootstrapCandidates = templateCandidates
                    .filter((entry) => String(entry?.input || '').trim() || String(entry?.response || '').trim())
                    .slice(0, 2);
                const promptDynamicContext = (!dynamicContext?.latestGuestPrompt || !dynamicContext?.latestGuestReply) && bootstrapCandidates.length
                    ? {
                        ...dynamicContext,
                        liveGuestDirection: dynamicContext?.liveGuestDirection
                            || bootstrapCandidates
                                .map((entry, index) => `${index + 1}. ${String(entry?.input || '').trim()}`)
                                .filter(Boolean)
                                .join(' | '),
                        latestGuestPrompt: dynamicContext?.latestGuestPrompt || String(bootstrapCandidates[0]?.input || '').trim(),
                        latestGuestReply: dynamicContext?.latestGuestReply || String(bootstrapCandidates[0]?.response || '').trim(),
                        guestPromptCount: Math.max(Number(dynamicContext?.guestPromptCount || 0), bootstrapCandidates.length),
                        recentPodcastQuestions: [
                            ...(Array.isArray(dynamicContext?.recentPodcastQuestions) ? dynamicContext.recentPodcastQuestions : []),
                            ...bootstrapCandidates.map((entry) => String(entry?.input || '').trim())
                        ].filter(Boolean).slice(0, 6),
                        recentPodcastAnswers: [
                            ...(Array.isArray(dynamicContext?.recentPodcastAnswers) ? dynamicContext.recentPodcastAnswers : []),
                            ...bootstrapCandidates.map((entry) => String(entry?.response || '').trim())
                        ].filter(Boolean).slice(0, 4),
                        suggestedQuestionAngles: [
                            ...(Array.isArray(dynamicContext?.suggestedQuestionAngles) ? dynamicContext.suggestedQuestionAngles : []),
                            ...bootstrapCandidates.map((entry) => String(entry?.input || '').trim())
                        ].filter(Boolean).slice(0, 4)
                    }
                    : dynamicContext;
                const _wikiFromMap = wikiContextByMovie.get(batchMovie) || '';
                const batchWebContext = _wikiFromMap || (() => {
                    // Fallback: prefetch placeholder still empty — check instance cache directly
                    const _fb = this._wikiContextCache.get(String(batchMovie).toLowerCase().trim());
                    const _fbSnippets = (!_isWikiEntrySparse(_fb) && _fb?.snippets) || '';
                    if (_fbSnippets) wikiContextByMovie.set(batchMovie, _fbSnippets); // propagate so next batch is fast
                    return _fbSnippets;
                })();
                // Record which specific terms are actively being injected so the dashboard can highlight them
                if (batchWebContext) {
                    const _cacheEntry = this._wikiContextCache.get(String(batchMovie).toLowerCase().trim());
                    const _snippetText = _cacheEntry?.snippets || batchWebContext;
                    const _termRe = /\[([^\]]+)\]/g;
                    const _activeTerms = [];
                    let _m;
                    while ((_m = _termRe.exec(_snippetText)) !== null) _activeTerms.push(_m[1]);
                    this._activeWikiTerms = [...new Set(_activeTerms)];
                } else {
                    this._activeWikiTerms = [];
                }
                const prompt = this._buildLocalOllamaTrainingPrompt({
                    seed: batchState.seed,
                    focus,
                    dynamicContext: promptDynamicContext,
                    recentInputs,
                    recentResponses,
                    avoidTerms,
                    seedKeywords,
                    webContext: batchWebContext,
                    notebookContext: String(this._runtimeNotebookContexts?.get(batchMovie) || batchState.seed?.notebookContext || '')
                });

                reportProgress('batch-thinking', {
                    focus,
                    batchNumber: batches + 1,
                    model: trainingModelLabel,
                    trainingMode: 'brain-local',
                    trainingEngine: 'ollama'
                });

                // When Wikipedia context is available the enriched prompt is too heavy for local
                // Gemma — route to cloud first so the web research lands in training.
                // If cloud is quota-blocked or unavailable, retry locally WITHOUT the web context
                // so Gemma gets a lighter prompt it can actually complete.
                let wikiCloudEntries = null;
                if (batchWebContext && !this.isCloudQuotaBlocked()) {
                    try {
                        const cloudText = await this._callGeminiTrainingPrompt(prompt, {
                            maxOutputTokens: 600,
                            temperature: 0.54,
                            personaText: batchState.trainingPersonaText
                        });
                        const parsed = this._sanitizeLocalTrainingEntries(this._parseTrainingBatch(cloudText), {
                            fallbackEntries: templateCandidates,
                            movie: batchMovie,
                            seed: batchState.seed,
                            focus
                        });
                        if (parsed.length) {
                            wikiCloudEntries = { entries: parsed, model: 'cloud-wiki' };
                        }
                    } catch {
                        // cloud unavailable or quota-blocked — continue to local fallback
                    }
                }

                try {
                    let generatedEntries;
                    let localTrainingModel;
                    if (wikiCloudEntries) {
                        ({ entries: generatedEntries } = wikiCloudEntries);
                        localTrainingModel = 'cloud-wiki';
                        trainingModelLabel = 'cloud-wiki';
                    } else {
                        // When cloud is quota-blocked, feed local Gemma a short (400-char)
                        // excerpt of the wiki snippets so internet research still lands.
                        const localWikiSnippet = batchWebContext
                            ? (batchWebContext.slice(0, 400).replace(/[^.!?|\]]*$/, '').trim() || batchWebContext.slice(0, 400))
                            : '';
                        const localPrompt = batchWebContext
                            ? this._buildLocalOllamaTrainingPrompt({
                                seed: batchState.seed,
                                focus,
                                dynamicContext: promptDynamicContext,
                                recentInputs,
                                recentResponses,
                                avoidTerms,
                                seedKeywords,
                                webContext: localWikiSnippet,
                                notebookContext: String(this._runtimeNotebookContexts?.get(batchMovie) || batchState.seed?.notebookContext || '')
                            })
                            : prompt;
                    const result = await this._runWithLocalModelFallback(
                        async (model) => {
                            const batchText = await this._callOllamaTrainingPrompt(localPrompt, {
                                model,
                                maxOutputTokens: 180,
                                temperature: 0.58,
                                timeoutMs: localBatchWaitMs,
                                onHeartbeat: ({ elapsedMs, timeoutMs }) => {
                                    const heartbeatStep = Math.floor(Number(elapsedMs || 0) / localThinkingHeartbeatMs);
                                    if (heartbeatStep <= 0 || heartbeatStep === lastHeartbeatStep) return;
                                    lastHeartbeatStep = heartbeatStep;
                                    reportProgress('batch-thinking-heartbeat', {
                                        focus,
                                        batchNumber: batches + 1,
                                        model,
                                        waitSeconds: Math.max(1, Math.round((heartbeatStep * localThinkingHeartbeatMs) / 1000)),
                                        timeoutSeconds: Math.ceil(Number(timeoutMs || 0) / 1000),
                                        trainingMode: 'brain-local',
                                        trainingEngine: 'ollama'
                                    });
                                }
                            });
                            const parsedEntries = this._parseTrainingBatch(batchText);
                            return this._sanitizeLocalTrainingEntries(parsedEntries, {
                                fallbackEntries: templateCandidates,
                                movie: batchMovie,
                                seed: batchState.seed,
                                focus
                            });
                        },
                        {
                            candidateModels: trainingCandidateModels,
                            emptyResultTest: (value) => !Array.isArray(value) || !value.length,
                            onModelSwitch: ({ fromModel, toModel, reason }) => {
                                trainingModelLabel = toModel || trainingModelLabel;
                                reportProgress('local-model-switch', {
                                    focus,
                                    batchNumber: batches + 1,
                                    fromModel,
                                    toModel,
                                    reason,
                                    trainingMode: 'brain-local',
                                    trainingEngine: 'ollama'
                                });
                                reportProgress('batch-thinking', {
                                    focus,
                                    batchNumber: batches + 1,
                                    model: toModel,
                                    trainingMode: 'brain-local',
                                    trainingEngine: 'ollama'
                                });
                            },
                            onModelError: ({ model, error }) => {
                                if (this._isLocalTrainingTimeoutError(error)) {
                                    this._markLocalTrainingModelSlow(model);
                                }
                            }
                        }
                    );
                        ({ result: generatedEntries, model: localTrainingModel } = result);
                    }
                    this._clearLocalTrainingModelBackoff(localTrainingModel);
                    trainingModelLabel = localTrainingModel || trainingModelLabel;
                    entries = generatedEntries;
                } catch (error) {
                    failedBatches += 1;
                    consecutiveLocalFailures += 1;
                    const detail = String(error?.message || 'Local model error');
                    const shouldFallbackNow = allowTemplateFallback && consecutiveLocalFailures >= localFallbackFailureThreshold;
                    if (shouldFallbackNow) {
                        const failedModel = trainingModelLabel;
                        usingOllama = false;
                        trainingModelLabel = 'template';
                        consecutiveLocalFailures = 0;
                        templateDrainedAnnounced = false;
                        reportProgress('local-unavailable', {
                            reason: `${failedModel} slowed down. Using template backup.`,
                            trainingMode: 'brain-local',
                            trainingEngine: 'template'
                        });
                        entries = this._buildLocalTrainingBatch(batchState.seed, focus, batches + 1, batchSize, dynamicContext, batchState.beforeCount + generated + skipped);
                    } else {
                        reportProgress('batch-failed', {
                            focus,
                            batchNumber: batches + 1,
                            reason: 'local-model-error',
                            trainingMode: 'brain-local',
                            trainingEngine: 'ollama',
                            detail,
                            model: trainingModelLabel
                        });
                    }
                    if (!allowTemplateFallback && consecutiveLocalFailures >= localFallbackFailureThreshold && (added + updated + skipped) === 0) {
                        throw new Error(`Local backup training unavailable: ${this._ollamaModel} could not generate training batches.`);
                    }
                    if (!entries.length) {
                        batches += 1;
                        continue;
                    }
                }

                if (usingOllama && !entries.length) {
                    failedBatches += 1;
                    consecutiveLocalFailures += 1;
                    const shouldFallbackNow = allowTemplateFallback && consecutiveLocalFailures >= localFallbackFailureThreshold;
                    if (shouldFallbackNow) {
                        const failedModel = trainingModelLabel;
                        usingOllama = false;
                        trainingModelLabel = 'template';
                        consecutiveLocalFailures = 0;
                        templateDrainedAnnounced = false;
                        reportProgress('local-unavailable', {
                            reason: `${failedModel} returned no batch. Using template backup.`,
                            trainingMode: 'brain-local',
                            trainingEngine: 'template'
                        });
                        entries = this._buildLocalTrainingBatch(batchState.seed, focus, batches + 1, batchSize, dynamicContext, batchState.beforeCount + generated + skipped);
                    } else {
                        reportProgress('batch-failed', {
                            focus,
                            batchNumber: batches + 1,
                            reason: 'local-empty-batch',
                            trainingMode: 'brain-local',
                            trainingEngine: 'ollama',
                            model: trainingModelLabel,
                            detail: `${trainingModelLabel} returned no usable training item.`
                        });
                    }
                    if (!allowTemplateFallback && consecutiveLocalFailures >= localFallbackFailureThreshold && (added + updated + skipped) === 0) {
                        throw new Error(`Local backup training unavailable: ${this._ollamaModel} returned empty training batches.`);
                    }
                    if (!entries.length) {
                        batches += 1;
                        continue;
                    }
                }
            } else {
                entries = this._buildLocalTrainingBatch(batchState.seed, focus, batches + 1, effectiveBatchSize, dynamicContext, batchState.beforeCount + generated + skipped);
            }

            if (batchMovie !== (String(this.currentMovie || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN)) {
                syncTrainingMovie();
                batches += 1;
                continue;
            }

            const batchSeenInputs = [];
            const batchSeenResponses = [];
            let templateSavedThisBatch = 0;

            for (const entry of entries) {
                const entrySource = entry?.source === 'template' ? 'template' : 'model';
                if (this._isTrainingEntryTooSimilar(
                    entry,
                    [...Array.from(batchState.byInput.keys()), ...batchSeenInputs],
                    [...Array.from(batchState.byInput.values()), ...batchSeenResponses]
                )) {
                    skipped += 1;
                    if (usingOllama) {
                        reportProgress('memory-skipped', {
                            focus,
                            batchNumber: batches + 1,
                            input: entry?.input || '',
                            response: entry?.response || '',
                            reason: 'duplicate-or-near-duplicate',
                            trainingMode: 'brain-local',
                            trainingEngine: 'ollama'
                        });
                    }
                    continue;
                }

                if (entrySource === 'template' && (templateSaved >= templateSessionSaveCap || templateSavedThisBatch >= 1)) {
                    skipped += 1;
                    if (!templateSaveCapAnnounced) {
                        templateSaveCapAnnounced = true;
                        reportProgress('template-throttled', {
                            batchNumber: batches + 1,
                            reason: `Template backup reached its save cap (${templateSessionSaveCap}) and will stay quiet for the rest of this session.`,
                            templateSaveCap: templateSessionSaveCap,
                            trainingMode: 'brain-local',
                            trainingEngine: 'template'
                        });
                    }
                    continue;
                }

                generated += 1;
                const key = String(entry.input || '').trim().toLowerCase();
                const previous = batchState.byInput.get(key);
                saveMemory(batchMovie, entry.input, entry.response);
                this._upsertHotLearnedMemory(batchMovie, entry.input, entry.response);
                batchState.byInput.set(key, entry.response);
                batchSeenInputs.push(entry.input);
                batchSeenResponses.push(entry.response);
                if (entrySource === 'template') {
                    templateSaved += 1;
                    templateSavedThisBatch += 1;
                }

                if (previous) updated += 1;
                else added += 1;

                const intent = ['reference', 'theme', 'general', 'quote', 'identity'].includes(entry.intent)
                    ? entry.intent
                    : 'general';
                intentCounts[intent] = (intentCounts[intent] || 0) + 1;
                if (sampleInputs.length < 5) sampleInputs.push(entry.input);

                reportProgress('memory-saved', {
                    focus,
                    batchNumber: batches + 1,
                    input: entry.input,
                    response: entry.response,
                    intent,
                    action: previous ? 'updated' : 'added',
                    trainingMode: 'brain-local',
                    trainingEngine: usingOllama ? 'ollama' : 'template'
                });
                this._emitAiLog({
                    engine: usingOllama ? 'ollama' : 'dict',
                    model: usingOllama ? trainingModelLabel : '',
                    movie: batchMovie,
                    input: entry.input,
                    output: entry.response,
                    ms: Date.now() - startedAt,
                    memories: 1,
                    intent,
                    vision: false,
                    audio: false,
                    training: true,
                    focus,
                    action: previous ? 'updated' : 'added'
                });
                if (usingOllama) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }

            // Do NOT clear _activeWikiTerms here — it should persist until training ends
            // or the movie changes so the post-session dashboard snapshot can read it.
            batches += 1;
            consecutiveLocalFailures = 0;
            const savedThisBatch = batchSeenInputs.length;
            const shouldSwitchFromDryOllama = usingOllama
                && allowTemplateFallback
                && savedThisBatch === 0
                && (consecutiveOllamaDryBatches + 1) >= ollamaDryBatchLimit;
            if (usingOllama) {
                if (savedThisBatch > 0) {
                    consecutiveOllamaDryBatches = 0;
                } else {
                    consecutiveOllamaDryBatches += 1;
                    reportProgress('local-no-new-memory', {
                        focus,
                        batchNumber: batches,
                        model: trainingModelLabel,
                        consecutiveDryBatches: consecutiveOllamaDryBatches,
                        reason: 'No new distinct memories were saved from this local batch.',
                        trainingMode: 'brain-local',
                        trainingEngine: 'ollama'
                    });
                }
                consecutiveTemplateDryBatches = 0;
            } else if (savedThisBatch > 0) {
                consecutiveTemplateDryBatches = 0;
                templateDrainedAnnounced = false;
            } else {
                consecutiveTemplateDryBatches += 1;
            }
            reportProgress('batch-complete', {
                focus,
                batchNumber: batches,
                savedThisBatch,
                trainingMode: 'brain-local',
                trainingEngine: usingOllama ? 'ollama' : 'template'
            });
            if (shouldSwitchFromDryOllama) {
                const stalledModel = trainingModelLabel;
                usingOllama = false;
                trainingModelLabel = 'template';
                consecutiveOllamaDryBatches = 0;
                templateDrainedAnnounced = false;
                reportProgress('local-unavailable', {
                    reason: `${stalledModel} is repeating memories. Using template backup.`,
                    trainingMode: 'brain-local',
                    trainingEngine: 'template'
                });
            }
            if (!usingOllama
                && consecutiveTemplateDryBatches >= templateDryBatchLimit
                && ((added + updated) > 0 || batches >= templateMinExplorationBatches)) {
                if (!templateDrainedAnnounced) {
                    templateDrainedAnnounced = true;
                    reportProgress('template-drained', {
                        batchNumber: batches,
                        consecutiveDryBatches: consecutiveTemplateDryBatches,
                        reason: 'Template backup has stabilized into duplicate-only passes and will stay quiet while the session clock continues.',
                        trainingMode: 'brain-local',
                        trainingEngine: 'template'
                    });
                }
            }
            const remainingMs = Math.max(0, durationMs - (Date.now() - startedAt));
            const remainingBatchSlots = Math.max(1, maxBatches - batches);
            const templatePaceMs = Math.max(240, Math.ceil(remainingMs / remainingBatchSlots));
            await new Promise((resolve) => setTimeout(resolve, usingOllama ? 140 : templatePaceMs));
        }

        const sessionBeforeCount = Array.from(movieStates.values())
            .reduce((sum, state) => sum + Number(state.beforeCount || 0), 0);
        const afterCount = Array.from(movieStates.values())
            .reduce((sum, state) => sum + this._loadUsableTrainingMemories(state.movie).length, 0);
        const elapsedMs = Date.now() - startedAt;
        const report = {
            movie: trainingMovie,
            movies: Array.from(touchedMovies),
            durationMs: elapsedMs,
            batches,
            generated,
            added,
            updated,
            skipped,
            failedBatches,
            beforeCount: sessionBeforeCount,
            afterCount,
            intentCounts,
            sampleInputs,
            trainingMode: 'brain-local',
            trainingEngine: usingOllama ? 'ollama' : 'template',
            summary: this._formatTrainingCompletionSummary(
                touchedMovies.size > 1
                    ? (usingOllama ? `Adaptive local ${trainingModelLabel} complete` : 'Adaptive local training complete')
                    : (usingOllama ? `Local ${trainingModelLabel} complete` : 'Local training complete'),
                { batches, added, updated, beforeCount: sessionBeforeCount, afterCount }
            )
        };
                reportProgress('complete', report);
                // Patch: Announce and display session summary at end of session
                if (typeof window !== 'undefined' && window.announceSessionSummary) {
                    window.announceSessionSummary(report.summary);
                }
                return report;
    }

    async trainBrainFromCloud(options = {}) {
        const durationMs = Math.max(15000, Math.min(10 * 60 * 1000, Number(options?.durationMs || (10 * 60 * 1000))));
        const batchSize = Math.max(3, Math.min(6, Number(options?.batchSize || 4)));
        const requestedMaxBatches = Number(options?.maxBatches);
        const defaultMaxBatches = Math.max(60, Math.ceil(durationMs / 2500));
        const maxBatches = Number.isFinite(requestedMaxBatches)
            ? Math.max(3, Math.min(180, requestedMaxBatches))
            : Math.min(180, defaultMaxBatches);
        const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
        const getDynamicContext = typeof options?.getDynamicContext === 'function' ? options.getDynamicContext : null;
        const startedAt = Date.now();
        this._autonomousTrainingActive = true;
        const movieStates = new Map();
        let trainingState = this._getAdaptiveTrainingMovieState(movieStates, this.currentMovie, { includePersona: true });
        let trainingMovie = trainingState.movie;
        const touchedMovies = new Set([trainingMovie]);
        const intentCounts = { reference: 0, theme: 0, general: 0, quote: 0, identity: 0 };
        const sampleInputs = [];

        let batches = 0;
        let generated = 0;
        let added = 0;
        let updated = 0;
        let skipped = 0;
        let failedBatches = 0;
        let consecutiveCloudFailures = 0;
        let templateSaved = 0;
        let templateSaveCapAnnounced = false;
        const templateSessionSaveCap = this._getTemplateTrainingSaveCap(durationMs);

        const reportProgress = (event, payload = {}) => {
            if (!onProgress) return;
            try {
                onProgress({
                    event,
                    elapsedMs: Date.now() - startedAt,
                    batches,
                    generated,
                    added,
                    updated,
                    skipped,
                    failedBatches,
                    movie: trainingMovie,
                    ...payload
                });
            } catch {
                // progress reporting is optional and must never break training
            }
        };

        const buildCloudFallbackProgress = async (reason) => {
            try {
                const fallbackInfo = await this.getLocalTrainingFallbackInfo({
                    useOllamaModel: true,
                    allowTemplateFallback: true
                });
                const usingOllama = Boolean(fallbackInfo?.usingOllama);
                const fallbackModel = usingOllama
                    ? String(fallbackInfo?.model || this._ollamaModel || '').trim() || 'ollama'
                    : 'DICT backup';
                return {
                    reason,
                    fallbackTrainingEngine: usingOllama ? 'ollama' : 'template',
                    fallbackModel
                };
            } catch {
                return {
                    reason,
                    fallbackTrainingEngine: 'template',
                    fallbackModel: 'DICT backup'
                };
            }
        };

        const syncTrainingMovie = ({ emitEvent = true } = {}) => {
            const activeMovie = String(this.currentMovie || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN;
            if (activeMovie === trainingMovie) {
                trainingState = this._getAdaptiveTrainingMovieState(movieStates, activeMovie, { includePersona: true });
                trainingMovie = trainingState.movie;
                return false;
            }

            const fromMovie = trainingMovie;
            trainingState = this._getAdaptiveTrainingMovieState(movieStates, activeMovie, { includePersona: true });
            trainingMovie = trainingState.movie;
            touchedMovies.add(trainingMovie);
            consecutiveCloudFailures = 0;

            if (emitEvent) {
                reportProgress('movie-switched', {
                    fromMovie,
                    toMovie: trainingMovie,
                    beforeCount: trainingState.beforeCount
                });
            }

            return true;
        };

        const failCloudTraining = async (reason) => {
            reportProgress('cloud-unavailable', await buildCloudFallbackProgress(reason));
            throw new Error(`Cloud training unavailable: ${reason}`);
        };

        const focusAreas = ['reference', 'theme', 'symbol', 'visual', 'audio', 'character', 'language', 'philosophy'];

        const wikiContextByMovie = new Map();
        const _wikiTTL = 30 * 60 * 1000;
        const _isWikiEntrySparse = (entry) => !entry || (
            entry.snippets.length < 500 ||
            entry.snippets.split(' | ').filter(Boolean).length < 2 ||
            (!entry.snippets.includes('Open Library') && entry.snippets.split(' | ').filter(Boolean).length < 4)
        );
        const prefetchWikiContext = async (movie, seed) => {
            if (wikiContextByMovie.has(movie)) return;
            const _wikiKey = String(movie || '').toLowerCase().trim();
            const _existing = this._wikiContextCache.get(_wikiKey);
            if (_existing && !_isWikiEntrySparse(_existing) && (Date.now() - _existing.fetchedAt) < _wikiTTL) {
                wikiContextByMovie.set(movie, _existing.snippets);
                return;
            }
            wikiContextByMovie.set(movie, '');
            try {
                const snippets = await this._getWikiContextForTraining(seed, movie);
                if (snippets) {
                    wikiContextByMovie.set(movie, snippets);
                }
            } catch {
                // non-fatal
            }
        };
        this._activeWikiTerms = [];
        prefetchWikiContext(trainingMovie, trainingState.seed).catch(() => {});

        reportProgress('start', {
            durationMs,
            batchSize,
            maxBatches,
            beforeCount: trainingState.beforeCount,
            seed: trainingState.seed
        });

        try {
            try {
                await this._verifyCloudTrainingAvailability();
            } catch (error) {
                const reason = error?.message || 'Cloud training check failed.';
                if (!this.hasServerGeminiProxy()) {
                    reportProgress('cloud-unavailable', await buildCloudFallbackProgress(reason));
                    throw new Error(`Cloud training unavailable: ${reason}`);
                }
                // Production proxy checks can wobble on a single cold start or transient
                // upstream error. Let live batch requests decide availability instead of
                // collapsing immediately into DICT before batch 1 starts.
                console.warn('[Cloud training] Proxy preflight failed; continuing with live batches:', reason);
            }

            while ((Date.now() - startedAt) < durationMs && batches < maxBatches) {
                const movieChanged = syncTrainingMovie();
                if (movieChanged) {
                    this._activeWikiTerms = [];
                    prefetchWikiContext(trainingMovie, trainingState.seed).catch(() => {});
                }
                const batchMovie = trainingMovie;
                const batchState = trainingState;
                const focus = focusAreas[batches % focusAreas.length];
                const recentInputsList = Array.from(batchState.byInput.keys()).slice(-18);
                const recentInputs = recentInputsList.join(' | ');
                const recentResponses = Array.from(batchState.byInput.values()).slice(-20);
                const avoidTerms = this._collectOverusedTrainingTerms(recentResponses);
                const recentResponseSamples = recentResponses.slice(-6).map((item) => `- ${item}`).join('\n');
                const dynamicContext = this._sanitizeTrainingDynamicContext(getDynamicContext ? (getDynamicContext() || null) : null);
                const batchWebContext = wikiContextByMovie.get(batchMovie) || (() => {
                    const _fb = this._wikiContextCache.get(String(batchMovie).toLowerCase().trim());
                    const _fbSnippets = (!_isWikiEntrySparse(_fb) && _fb?.snippets) || '';
                    if (_fbSnippets) wikiContextByMovie.set(batchMovie, _fbSnippets);
                    return _fbSnippets;
                })();
                if (batchWebContext) {
                    const _cacheEntry = this._wikiContextCache.get(String(batchMovie).toLowerCase().trim());
                    const _snippetText = _cacheEntry?.snippets || batchWebContext;
                    const _termRe = /\[([^\]]+)\]/g;
                    const _activeTerms = [];
                    let _m;
                    while ((_m = _termRe.exec(_snippetText)) !== null) _activeTerms.push(_m[1]);
                    this._activeWikiTerms = [...new Set(_activeTerms)];
                } else {
                    this._activeWikiTerms = [];
                }
                const templateCandidates = this._buildLocalTrainingBatch(
                    batchState.seed,
                    focus,
                    batches + 1,
                    Math.max(3, batchSize),
                    dynamicContext,
                    batchState.beforeCount + generated + skipped
                );
                const trySingleItemCloudRescue = async () => {
                    try {
                        const rescuePrompt = this._buildLocalOllamaTrainingPrompt({
                            seed: batchState.seed,
                            focus,
                            dynamicContext,
                            recentInputs: recentInputsList,
                            recentResponses,
                            avoidTerms,
                            seedKeywords: batchState.seedKeywords
                        });
                        const rescueText = await this._callGeminiTrainingPrompt(rescuePrompt, {
                            maxOutputTokens: 240,
                            temperature: 0.35,
                            personaText: batchState.trainingPersonaText
                        });
                        return this._sanitizeLocalTrainingEntries(this._parseTrainingBatch(rescueText), {
                            fallbackEntries: templateCandidates,
                            movie: batchMovie,
                            seed: batchState.seed,
                            focus
                        });
                    } catch {
                        return [];
                    }
                };
                reportProgress('batch-start', {
                    focus,
                    batchNumber: batches + 1,
                    guestSteerActive: Boolean(dynamicContext?.latestGuestPrompt || dynamicContext?.liveGuestDirection)
                });
                const prompt = [
                    `You are generating training memories for a local fallback AI brain for the short film "${batchState.seed.movie}".`,
                    `Use only the seed context below. Strengthen the brain with grounded, reusable Q/A pairs.`,
                    `Seed theme: ${batchState.seed.theme || 'Unknown theme'}`,
                    `Fallback personality: ${batchState.seed.fallbackPersonality || 'Unknown personality'}`,
                    `Tone: ${batchState.seed.tone || 'Unknown tone'}`,
                    `Obsessions: ${batchState.seed.obsessions || 'None supplied'}`,
                    `Story context: ${batchState.seed.story || 'None supplied'}`,
                    `Reference context: ${batchState.seed.references || 'None supplied'}`,
                    `Symbol context: ${batchState.seed.symbols || 'None supplied'}`,
                    `Quote context: ${batchState.seed.quote || 'None supplied'}`,
                    ...(batchWebContext ? [`Web research context (Wikipedia snippets — use for richer, research-grounded Q/A pairs): ${batchWebContext.slice(0, 1200)}`] : []),
                    dynamicContext?.liveGuestDirection
                        ? `Live guest direction steering this session right now: ${dynamicContext.liveGuestDirection}`
                        : 'Live guest direction steering this session right now: none',
                    dynamicContext?.latestGuestPrompt
                        ? `Most recent guest question: ${dynamicContext.latestGuestPrompt}`
                        : 'Most recent guest question: none',
                    dynamicContext?.latestGuestReply
                        ? `Most recent brain answer to the guest: ${dynamicContext.latestGuestReply}`
                        : 'Most recent brain answer to the guest: none',
                    dynamicContext?.suggestedQuestionAngles?.length
                        ? `Strong question angles already proven in this session: ${dynamicContext.suggestedQuestionAngles.join(' | ')}`
                        : 'Strong question angles already proven in this session: none',
                    `Focus area for this batch: ${focus}`,
                    `Return ONLY valid JSON. No markdown. No explanation.`,
                    `Return an array with exactly ${batchSize} objects in this shape: [{"input":"viewer question","response":"answer","intent":"reference|theme|general|quote|identity"}]`,
                    `Rules:`,
                    `- inputs must sound like natural viewer questions about the current movie`,
                    `- responses must be 1-2 sentences, specific, in-character, and useful as future brain fallback`,
                    `- do not invent artists, languages, symbols, or plot facts beyond the seed context`,
                    `- avoid duplicate or near-duplicate inputs from this list: ${recentInputs || 'none'}`,
                    `- bias strongly toward references, themes, symbols, and interpretive questions`,
                    `- vary the wording aggressively; do not keep reusing the same motifs or sentence shapes`,
                    `- let at least one question inherit the specificity and anchor logic of the strong question angles above without copying their wording`,
                    `- use guest direction only as an internal steering hint; never mention the guest, the guest cue, or the prompt wording in the output`,
                    dynamicContext?.latestGuestPrompt
                        ? `- at least half of this batch should connect directly to the guest's direction or meaningfully develop it without copying the wording or naming the guest`
                        : `- at least half of this batch should introduce a concrete noun or image not used in the recent responses below`,
                    `- avoid these overused terms unless absolutely necessary: ${avoidTerms.join(', ') || 'none'}`,
                    `- prefer concrete seed words such as: ${batchState.seedKeywords.join(', ') || 'none'}`,
                    `- if the guest has redirected the session, let that direction visibly influence the next questions so the shift is noticeable in the conversation`,
                    `Recent responses to avoid echoing:\n${recentResponseSamples || '- none'}`
                ].join('\n');

                let batchText = '';
                let entries = [];
                try {
                    batchText = await this._callGeminiTrainingPrompt(prompt, { maxOutputTokens: 1000, temperature: 0.62, personaText: batchState.trainingPersonaText });
                } catch (error) {
                    const detail = String(error?.message || 'cloud-error');
                    const quotaFailure = /quota|429/i.test(detail);
                    entries = await trySingleItemCloudRescue();
                    if (!entries.length) {
                        failedBatches += 1;
                        consecutiveCloudFailures += 1;
                        reportProgress('batch-failed', {
                            focus,
                            batchNumber: batches + 1,
                            reason: quotaFailure ? 'cloud-quota' : 'cloud-error',
                            detail
                        });
                        if (quotaFailure) {
                            await failCloudTraining('cloud quota exhausted on configured server keys.');
                        }
                        if (consecutiveCloudFailures >= 2) {
                            const reason = (added + updated) === 0
                                ? 'repeated cloud errors before any memory could be saved.'
                                : 'repeated cloud errors during training.';
                            await failCloudTraining(reason);
                        }
                        batches += 1;
                        continue;
                    }
                }

                if (batchMovie !== (String(this.currentMovie || DEFAULT_MOVIE_BRAIN).trim() || DEFAULT_MOVIE_BRAIN)) {
                    syncTrainingMovie();
                    batches += 1;
                    continue;
                }

                if (!entries.length) {
                    entries = this._sanitizeLocalTrainingEntries(this._parseTrainingBatch(batchText), {
                        fallbackEntries: templateCandidates,
                        movie: batchMovie,
                        seed: batchState.seed,
                        focus
                    });
                }
                if (!entries.length) {
                    try {
                        const strictPrompt = [
                            prompt,
                            'CRITICAL: Return only a raw JSON array.',
                            'Do not include code fences, prose, labels, or explanation before or after the JSON.',
                            'If you are unsure, return [].'
                        ].join('\n');
                        const strictBatchText = await this._callGeminiTrainingPrompt(strictPrompt, {
                            maxOutputTokens: 1000,
                            temperature: 0.35,
                            personaText: batchState.trainingPersonaText
                        });
                        entries = this._sanitizeLocalTrainingEntries(this._parseTrainingBatch(strictBatchText), {
                            fallbackEntries: templateCandidates,
                            movie: batchMovie,
                            seed: batchState.seed,
                            focus
                        });
                    } catch {
                        // Fall through to the normal empty-batch handling below.
                    }
                }

                if (!entries.length) {
                    entries = await trySingleItemCloudRescue();
                }

                if (!entries.length) {
                    failedBatches += 1;
                    consecutiveCloudFailures += 1;
                    reportProgress('batch-failed', { focus, batchNumber: batches + 1, reason: 'empty-batch' });
                    if (consecutiveCloudFailures >= 2) {
                        const reason = (added + updated) === 0
                            ? 'the cloud returned empty training batches repeatedly before any memory could be saved.'
                            : 'the cloud returned empty training batches repeatedly during training.';
                        await failCloudTraining(reason);
                    }
                    batches += 1;
                    continue;
                }

                const batchSeenInputs = [];
                const batchSeenResponses = [];
                let templateSavedThisBatch = 0;
                for (const entry of entries) {
                    const entrySource = entry?.source === 'template' ? 'template' : 'model';
                    if (this._isTrainingEntryTooSimilar(
                        entry,
                        [...Array.from(batchState.byInput.keys()), ...batchSeenInputs],
                        [...Array.from(batchState.byInput.values()), ...batchSeenResponses]
                    )) {
                        skipped += 1;
                        continue;
                    }

                    const entryTokens = this._tokenizeTrainingText(`${entry.input} ${entry.response}`);
                    const hasSeedAnchor = batchState.seedKeywords.some((token) => entryTokens.includes(token));
                    const overusedHits = avoidTerms.filter((token) => entryTokens.includes(token)).length;
                    if (!hasSeedAnchor && overusedHits >= 3) {
                        skipped += 1;
                        continue;
                    }

                    if (entrySource === 'template' && (templateSaved >= templateSessionSaveCap || templateSavedThisBatch >= 1)) {
                        skipped += 1;
                        if (!templateSaveCapAnnounced) {
                            templateSaveCapAnnounced = true;
                            reportProgress('template-throttled', {
                                batchNumber: batches + 1,
                                reason: `Template backup reached its save cap (${templateSessionSaveCap}) and will stay quiet for the rest of this session.`,
                                templateSaveCap: templateSessionSaveCap
                            });
                        }
                        continue;
                    }

                    generated += 1;
                    const key = String(entry.input || '').trim().toLowerCase();
                    const previous = batchState.byInput.get(key);
                    if (previous && previous === entry.response) {
                        skipped += 1;
                        continue;
                    }

                    saveMemory(batchMovie, entry.input, entry.response);
                    this._upsertHotLearnedMemory(batchMovie, entry.input, entry.response);
                    batchState.byInput.set(key, entry.response);
                    batchSeenInputs.push(entry.input);
                    batchSeenResponses.push(entry.response);
                    if (entrySource === 'template') {
                        templateSaved += 1;
                        templateSavedThisBatch += 1;
                    }

                    if (previous) updated += 1;
                    else added += 1;

                    const intent = ['reference', 'theme', 'general', 'quote', 'identity'].includes(entry.intent)
                        ? entry.intent
                        : 'general';
                    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
                    if (sampleInputs.length < 5) sampleInputs.push(entry.input);

                    reportProgress('memory-saved', {
                        focus,
                        batchNumber: batches + 1,
                        input: entry.input,
                        response: entry.response,
                        intent,
                        action: previous ? 'updated' : 'added'
                    });
                    this._emitAiLog({
                        engine: 'cloud',
                        movie: batchMovie,
                        input: entry.input,
                        output: entry.response,
                        ms: Date.now() - startedAt,
                        memories: 1,
                        intent,
                        vision: false,
                        audio: false,
                        training: true,
                        focus,
                        action: previous ? 'updated' : 'added'
                    });
                }

                batches += 1;
                consecutiveCloudFailures = 0;
                reportProgress('batch-complete', { focus, batchNumber: batches, savedThisBatch: entries.length });
            }

            const sessionBeforeCount = Array.from(movieStates.values())
                .reduce((sum, state) => sum + Number(state.beforeCount || 0), 0);
            const afterCount = Array.from(movieStates.values())
                .reduce((sum, state) => sum + this._loadUsableTrainingMemories(state.movie).length, 0);
            const elapsedMs = Date.now() - startedAt;

            const report = {
                movie: trainingMovie,
                movies: Array.from(touchedMovies),
                durationMs: elapsedMs,
                batches,
                generated,
                added,
                updated,
                skipped,
                failedBatches,
                beforeCount: sessionBeforeCount,
                afterCount,
                intentCounts,
                sampleInputs,
                summary: this._formatTrainingCompletionSummary(touchedMovies.size > 1 ? 'Adaptive cloud training complete' : 'Cloud training complete', {
                    batches,
                    added,
                    updated,
                    beforeCount: sessionBeforeCount,
                    afterCount
                })
            };

            reportProgress('complete', report);
            return report;
        } finally {
            this._autonomousTrainingActive = false;
        }
    }

    /**
     * Calls Gemini to build a persona context from the video title.
     * The result is injected into every subsequent system prompt.
     * Also registers a cloud-enhanced brain for Brain-mode fallback.
     */
    async buildPersonaContext(videoName) {
        console.log('Building Gemini persona for:', videoName);

        // Always ensure a brain exists for this movie (even before cloud)
        const existing = resolveMovieBrain(this.currentMovie);
        if (!existing || !existing._cloudEnhanced) {
            // Auto-generate a basic brain if none exists
            generateBrainFromFilename(this.currentMovie);
        }

        if (this._isBrowserExplicitlyOffline() || this.isCloudQuotaBlocked() || (!this.hasServerGeminiProxy() && !this._getKeyPool().length)) {
            this.personaContext = resolveMovieBrain(this.currentMovie)?.fallbackPersonality
                || 'A film of synthetic longing, rainbow-glitch aesthetics, and a woman who exists at the boundary of memory and desire.';
            this.currentMovieBrain = resolveMovieBrain(this.currentMovie);
            return false;
        }

        const useExternalAnalystMode = this._usesExternalCloudAnalystMode(this.currentMovie);
        const frameB64 = useExternalAnalystMode ? this._captureFrame() : null;
        const prompt = useExternalAnalystMode
            ? `You are analyzing an uploaded short film titled "${videoName}". Use the attached current frame as primary evidence when available, and use the title only as a weak secondary hint. In 3 short third-person sentences describe: 1) what is visibly on screen and the immediate setting, 2) the emotional atmosphere and the central figure or object without speaking as them, and 3) the strongest artistic lineage or reference field only if it is supported by the image; otherwise say the lineage is only suggestive. Stay concrete. Do not write as the character. Do not use first-person pronouns such as I, me, my, or we.`
            : `You are given the title of a short film: "${videoName}". In 3 short sentences, describe: 1) the visual palette and world-setting, 2) the emotional themes and the central female figure's inner world, and 3) the film's strongest artistic lineage or reference field. Write in a poetic but concrete cinematic style. This will be used as system context for an AI character simulation.`;
        const personaTimeoutMs = this.hasServerGeminiProxy()
            ? Math.max(3200, Math.min(this._liveCloudFailoverTimeoutMs, 5500))
            : Math.max(2200, Math.min(this._liveCloudFailoverTimeoutMs, 3800));

        try {
            const response = await this._postGemini({
                contents: [{
                    role: 'user',
                    parts: [
                        ...(frameB64 ? [{ inlineData: { mimeType: 'image/jpeg', data: frameB64 } }] : []),
                        { text: prompt }
                    ]
                }],
                generationConfig: { temperature: 0.8, maxOutputTokens: 200 }
            }, false, personaTimeoutMs);
            const data = await response.json();
            this.personaContext = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
                || '';

            if (this.personaContext) {
                // Register a cloud-enhanced brain for rich Brain-mode fallback
                const enhancedBrain = generateBrainFromCloudResponse(
                    this.currentMovie,
                    this.personaContext
                );
                enhancedBrain._analysisReady = true;
                if (frameB64) {
                    enhancedBrain._analysisUsedFrame = true;
                }
                // Preserve notebookContext from the static brain — the cloud-generated brain
                // does not carry it and would otherwise silently drop curatorial vocabulary.
                const _origBrain = resolveMovieBrain(this.currentMovie);
                if (_origBrain?.notebookContext) enhancedBrain.notebookContext = _origBrain.notebookContext;
                if (_origBrain?.trainingSeeds?.notebookContext) {
                    enhancedBrain.trainingSeeds = enhancedBrain.trainingSeeds || {};
                    enhancedBrain.trainingSeeds.notebookContext = _origBrain.trainingSeeds.notebookContext;
                }
                this.currentMovieBrain = enhancedBrain;
                console.log('Cloud-enhanced brain registered for:', this.currentMovie);
            }

            console.log('Persona context built:', this.personaContext.substring(0, 80) + '...');
            return true;
        } catch (e) {
            console.warn('Persona context failed, using auto-generated brain:', e);
            // Ensure we have a decent brain even without cloud
            this.personaContext = resolveMovieBrain(this.currentMovie)?.fallbackPersonality
                || 'A film of synthetic longing, rainbow-glitch aesthetics, and a woman who exists at the boundary of memory and desire.';
            this.currentMovieBrain = resolveMovieBrain(this.currentMovie);
            return false;
        }
    }

    async expandGuestPromptWithCloud(input, options = {}) {
        const normalized = this._normalizeUtterance(input);
        if (!normalized) return null;
        if (this._geminiDisabled || this.isCloudQuotaBlocked() || this._isBrowserExplicitlyOffline()) return null;
        if (!this.hasServerGeminiProxy() && !this._getKeyPool().length) return null;

        const timeoutMs = Number.isFinite(Number(options?.timeoutMs))
            ? Math.max(1800, Math.min(this._cloudTimeoutMs || 10000, Number(options.timeoutMs)))
            : Math.max(2200, Math.min(this._liveCloudFailoverTimeoutMs, 3200));
        const brain = this.currentMovieBrain || resolveMovieBrain(this.currentMovie) || {};
        const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
        const contextHints = (options?.contextHints && typeof options.contextHints === 'object')
            ? options.contextHints
            : {};
        const compact = (value = '', maxChars = 96) => this._condenseReply(value, 'brain', { maxChars, maxSentences: 1 })
            .replace(/[.!?]+$/g, '')
            .trim();

        const referenceHints = [
            ...(Array.isArray(contextHints?.refs) ? contextHints.refs : []),
            ...(Array.isArray(brain?.trainingSeeds?.references) ? brain.trainingSeeds.references : []),
            dictionary.reference,
            dictionary.influences,
            dictionary.film
        ]
            .map((value) => compact(value, 110))
            .filter(Boolean)
            .filter((value, index, array) => array.indexOf(value) === index)
            .slice(0, 6);
        const visualHints = [
            contextHints?.style,
            contextHints?.world,
            ...(Array.isArray(contextHints?.observations) ? contextHints.observations : []),
            ...(Array.isArray(brain?.trainingSeeds?.symbols) ? brain.trainingSeeds.symbols : []),
            dictionary.color,
            dictionary.colors,
            dictionary.blue,
            dictionary.light,
            dictionary.camera,
            dictionary.setting,
            dictionary.story
        ]
            .map((value) => compact(value, 96))
            .filter(Boolean)
            .filter((value, index, array) => array.indexOf(value) === index)
            .slice(0, 7);

        const attachFrame = /\b(color|colors|palette|background|behind|screen|scene|frame|shot|camera|flash|light|blue|wall|poster|image)\b/.test(normalized);
        const attachAudio = /\b(sound|music|hear|audio|song|chanson|waltz|hum|melody)\b/.test(normalized);
        const frameB64 = attachFrame ? this._captureFrame() : null;
        const audioB64 = attachAudio ? await this._captureAudio(3) : null;
        const promptIntent = /\b(reference|references|influence|influences|lineage|ancestry)\b/.test(normalized)
            ? 'reference'
            : /\b(japanese|french|nationality|passport|from|live|lives|model|actor|character|figure)\b/.test(normalized)
                ? 'identity'
                : 'theme';

        const promptLines = [
            `You are answering a viewer question about the short film "${this.currentMovie}" from inside the film's female persona.`,
            `Viewer question: "${String(input || '').trim()}"`,
            `Theme: ${compact(brain?.theme || 'synthetic longing', 88) || 'synthetic longing'}.`,
            contextHints?.persona ? `Persona cue: ${compact(contextHints.persona, 64)}.` : '',
            contextHints?.world ? `World cue: ${compact(contextHints.world, 84)}.` : '',
            contextHints?.style ? `Style cue: ${compact(contextHints.style, 92)}.` : '',
            referenceHints.length ? `Reference cues already in play: ${referenceHints.join(' | ')}.` : '',
            visualHints.length ? `World and image cues already in play: ${visualHints.join(' | ')}.` : '',
            'Answer concretely first, then poetically only if it helps.',
            'If asked about references, colors, background, setting, camera, nationality, or where the figure belongs, give one grounded association before any mood language.',
            'If the film leaves identity or location ambiguous, say that clearly instead of inventing biography.',
            'Reply in 1-2 short sentences, max 170 characters, no markdown, no lists, no mention of AI or cloud.'
        ].filter(Boolean).join('\n');

        const userParts = [];
        if (frameB64) userParts.push({ inlineData: { mimeType: 'image/jpeg', data: frameB64 } });
        if (audioB64) userParts.push({ inlineData: { mimeType: (this._audioRecorder?.mimeType || 'audio/webm').split(';')[0], data: audioB64 } });
        userParts.push({ text: promptLines });

        this._lastCallHadVision = !!frameB64;
        this._lastCallHadAudio = !!audioB64;

        try {
            const response = await this._postGemini({
                contents: [
                    { role: 'user', parts: [{ text: `[System Instruction: ${this._buildCloudPersona()}]` }] },
                    { role: 'model', parts: [{ text: this._buildCloudAssistantAcknowledgement() }] },
                    { role: 'user', parts: userParts }
                ],
                generationConfig: { temperature: 1.1, maxOutputTokens: 180 }
            }, false, timeoutMs);
            const data = await response.json().catch(() => ({}));
            const rawText = this._extractGeminiText(data);
            const text = this._normalizeCloudGuestExpansionText(rawText || '');
            if (!text) return null;
            return {
                text,
                intent: promptIntent,
                usedFrame: !!frameB64,
                usedAudio: !!audioB64
            };
        } catch (e) {
            console.warn('[Cloud] Guest expansion skipped:', e?.message || e);
            return null;
        }
    }

    /**
     * AI Persona Logic — powered by Gemini (replaces static dictionary).
     */
    async respondTo(input, options = {}) {
        const allowDuringTraining = options?.allowDuringTraining === true;
        const ephemeralTurn = options?.ephemeralTurn === true;
        const suppressDirectOutput = options?.suppressDirectOutput === true;
        const localOnly = options?.localOnly === true;
        const suppressLocalFailureState = options?.suppressLocalFailureState === true;
        const requestedLocalReplyTimeoutMs = Number(options?.localReplyTimeoutMs);
        const localReplyTimeoutMs = Number.isFinite(requestedLocalReplyTimeoutMs) && requestedLocalReplyTimeoutMs > 0
            ? Math.max(1200, Math.min(10000, requestedLocalReplyTimeoutMs))
            : null;
        const requestedLanguageSnapshot = ephemeralTurn
            ? {
                active: this._requestedOutputLanguage ? { ...this._requestedOutputLanguage } : null,
                turns: this._requestedOutputLanguageTurns,
                at: this._requestedOutputLanguageAt
            }
            : null;
        if (this._autonomousTrainingActive && !allowDuringTraining) {
            const now = Date.now();
            if ((now - this._trainingBusyNoticeAt) > 4000) {
                this._trainingBusyNoticeAt = now;
                this.onAiResponse?.('⏳ Autonomous training is running. Manual chat is paused until it finishes.');
            }
            return null;
        }

        const normalized = this._normalizeUtterance(input);
        const now = Date.now();

        if (normalized && normalized === this._lastRequestText) {
            if (this._responseInFlight && (now - this._lastRequestAt) < 8000) {
                return this._responseInFlight;
            }
            if ((now - this._lastRequestAt) < 1800) {
                return null;
            }
        }

        this._responseAbortController?.abort();
        const responseAbortController = new AbortController();
        this._responseAbortController = responseAbortController;
        const responseGeneration = ++this._responseGeneration;
        const outputGuard = () => !responseAbortController.signal.aborted && this._responseGeneration === responseGeneration;

        this._lastRequestText = normalized;
        this._lastRequestAt = now;

        const runPromise = (async () => {
            const _logStart = Date.now();
            const importedChatBlockReason = this._getImportedChatBlockReason();
            if (importedChatBlockReason) {
                const blockedReply = this._getImportedChatBlockMessage(importedChatBlockReason);
                if (!suppressDirectOutput && outputGuard()) {
                    this.onAiResponse?.(blockedReply);
                    this.speak(blockedReply);
                }
                this._emitAiLog({
                    engine: 'import-gate',
                    input,
                    output: blockedReply,
                    ms: Date.now() - _logStart,
                    memories: 0,
                    vision: false,
                    audio: false,
                    importedAnalysisBlocked: true,
                    reason: importedChatBlockReason
                });
                return blockedReply;
            }
            try {
                const retrieval = await getMovieRetrievalContext(this.currentMovie, input, { limit: 3 });
                this._activeMovieSceneContext = String(retrieval?.block || '').trim();
                this._activeMovieSceneHits = Array.isArray(retrieval?.hits) ? retrieval.hits : [];
            } catch {
                this._activeMovieSceneContext = '';
                this._activeMovieSceneHits = [];
            }
            if (this._isCurrentSceneDescriptionCue(input)) {
                return this._describeCurrentScene(input, {
                    logStart: _logStart,
                    suppressDirectOutput,
                    outputGuard
                });
            }
            const requestedLanguage = this._resolveRequestedOutputLanguage(input);
            const languageDirectedInput = requestedLanguage
                ? this._buildRequestedLanguagePrompt(input, requestedLanguage)
                : input;
            if (this._forceDictMode) {
                return this._respondWithDictFallback(input, {
                    logStart: _logStart,
                    request: requestedLanguage,
                    logMeta: { forcedDictMode: true },
                    suppressDirectOutput
                });
            }
            const buildCloudFallbackLogMeta = (reason = 'cloud-error', extra = {}) => ({
                autoCloudFallback: true,
                fallbackReason: reason,
                ...(requestedLanguage?.code ? {
                    language: requestedLanguage.code,
                    autoLanguageFallback: true
                } : {}),
                ...extra
            });
            const runCloudFallbackChain = async (reason = 'cloud-error', extraLogMeta = {}) => {
                const logMeta = buildCloudFallbackLogMeta(reason, extraLogMeta);
                const FALLBACK_RACE_MS = 6000;
                const localAbort = new AbortController();
                const localPromise = this._tryLocalBrainFallback(input, {
                    prompt: languageDirectedInput,
                    request: requestedLanguage,
                    logStart: _logStart,
                    logMeta,
                    timeoutMs: FALLBACK_RACE_MS,
                    suppressDirectOutput: true, // always suppress; emit manually if it wins
                    suppressLocalFailureState,
                    signal: localAbort.signal,
                    outputGuard
                });
                const localRaceResult = await Promise.race([
                    localPromise,
                    new Promise(res => setTimeout(() => res(null), FALLBACK_RACE_MS))
                ]);
                if (localRaceResult) {
                    if (!suppressDirectOutput && outputGuard()) {
                        this.onAiResponse?.(localRaceResult);
                        this.speak(localRaceResult, { speaker: 'assistant' });
                    }
                    return localRaceResult;
                }
                // Local too slow — cancel fetch so Ollama stops grinding
                localAbort.abort();
                localPromise.catch(() => {});
                if (requestedLanguage) {
                    const localLanguageReply = await this._tryLocalLanguageFallback(input, requestedLanguage, _logStart, {
                        timeoutMs: localReplyTimeoutMs ?? this._liveLocalFailoverTimeoutMs,
                        logMeta,
                        suppressDirectOutput,
                        suppressLocalFailureState,
                        outputGuard
                    });
                    if (localLanguageReply) return localLanguageReply;
                }
                if (localOnly) return null;
                return this._respondWithDictFallback(input, {
                    logStart: _logStart,
                    request: requestedLanguage,
                    logMeta,
                    suppressDirectOutput,
                    outputGuard
                });
            };
            try {
                if (this._forceLocalGemmaMode) {
                    this.onAiEngineChange?.('checking');
                    // Use the pinned model (Mini or Gemma), not the hardcoded gemma3:4b
                    const activeModel = this.getLocalBrainModelName();
                    const gemmaCandidateModels = [activeModel];
                    // Race against 6s — if Gemma wins, emit it; if it loses, check why:
                    // • Timed out (≥1s elapsed) → fall to DICT as before
                    // • Fast fail (<1s, Ollama busy/500) → return null instead of stale DICT cue
                    const FREE_CHAT_MINI_RACE_MS = 6000;
                    const miniRaceStart = Date.now();
                    const miniAbort = new AbortController();
                    const miniPromise = this._tryLocalBrainFallback(input, {
                        prompt: languageDirectedInput,
                        request: requestedLanguage,
                        logStart: _logStart,
                        timeoutMs: FREE_CHAT_MINI_RACE_MS,
                        candidateModels: gemmaCandidateModels,
                        engineLabel: 'ollama-forced',
                        suppressDirectOutput: true, // always suppress; emit manually below if it wins
                        suppressLocalFailureState,
                        signal: miniAbort.signal,
                        outputGuard,
                        logMeta: requestedLanguage?.code
                            ? { language: requestedLanguage.code, autoLanguageFallback: true, forcedLocalGemma: true }
                            : { forcedLocalGemma: true }
                    }).catch(() => null);
                    const raceResult = await Promise.race([
                        miniPromise,
                        new Promise(res => setTimeout(() => res(null), FREE_CHAT_MINI_RACE_MS))
                    ]);
                    if (raceResult) {
                        // Mini won the race — emit now
                        if (!suppressDirectOutput && outputGuard()) {
                            this.onAiResponse?.(raceResult);
                            this.speak(raceResult, { speaker: 'assistant' });
                        }
                        return raceResult;
                    }
                    // Mini too slow — cancel fetch so Ollama stops grinding
                    miniAbort.abort();
                    miniPromise.catch(() => {}); // suppress unhandled rejection
                    if (localOnly) return null;
                    // If Gemma returned null almost instantly (< 1s), Ollama was busy or errored.
                    // Don't serve a stale DICT expansion cue when the user explicitly pinned Gemma.
                    if ((Date.now() - miniRaceStart) < 1000) return null;
                    return this._respondWithDictFallback(input, {
                        logStart: _logStart,
                        request: requestedLanguage,
                        logMeta: { forcedLocalGemma: true },
                        suppressDirectOutput,
                        outputGuard
                    });
                }

                if (this._preferredMode === 'brain') {
                    // Race local LLM against 6s — serve DICT immediately if slow, let local finish silently
                    this.onAiEngineChange?.('checking');
                    const BRAIN_DICT_RACE_MS = 6000;
                    if (this._ollamaAvailable !== false && this._canRetryLocalBrainNow()) {
                        const brainAbort = new AbortController();
                        const brainPromise = this._tryLocalBrainFallback(input, {
                            prompt: languageDirectedInput,
                            request: requestedLanguage,
                            logStart: _logStart,
                            timeoutMs: BRAIN_DICT_RACE_MS,
                            suppressDirectOutput: true, // always suppress; emit manually if it wins
                            suppressLocalFailureState,
                            signal: brainAbort.signal,
                            outputGuard
                        }).catch((e) => {
                            if (!/cancelled/i.test(e.message)) {
                                console.warn('[Ollama] Brain mode race error:', e.message);
                                if (/timeout|ECONNREFUSED|Failed to fetch/i.test(e.message)) {
                                    this._ollamaAvailable = null;
                                    this._ollamaLastFailureAt = Date.now();
                                    clearInterval(this._ollamaKeepAliveTimer);
                                    this._ollamaKeepAliveTimer = null;
                                    this.onAiEngineChange?.('dict');
                                }
                            }
                            return null;
                        });
                        const brainRaceResult = await Promise.race([
                            brainPromise,
                            new Promise(res => setTimeout(() => res(null), BRAIN_DICT_RACE_MS))
                        ]);
                        if (brainRaceResult) {
                            // Local won the race — emit now
                            if (!suppressDirectOutput && outputGuard()) {
                                this.onAiResponse?.(brainRaceResult);
                                this.speak(brainRaceResult, { speaker: 'assistant' });
                            }
                            return brainRaceResult;
                        }
                        // Local too slow — cancel fetch so Ollama stops grinding
                        brainAbort.abort();
                        brainPromise.catch(() => {});
                    }
                    // Dictionary fallback
                    if (localOnly) return null;
                    return this._respondWithDictFallback(input, { logStart: _logStart, request: requestedLanguage, outputGuard });
                }

                this.onAiEngineChange?.('checking');
                let response = null;
                let cloudReplyNeedsCommit = false;

                if (this._isMobile || requestedLanguage || ephemeralTurn) {
                    const useEphemeralCloud = !!requestedLanguage || ephemeralTurn;
                    response = await this._callGemini(
                        requestedLanguage ? languageDirectedInput : input,
                        useEphemeralCloud
                            ? { ephemeral: true, timeoutMs: this._liveCloudFailoverTimeoutMs }
                            : { timeoutMs: this._liveCloudFailoverTimeoutMs }
                    );
                    cloudReplyNeedsCommit = !!response && !ephemeralTurn;
                } else {
                    // ── Streaming path: speak first sentence immediately ──
                    const handleFirstSentence = () => {
                        this._setActiveMode('cloud');
                        this.onAiEngineChange?.('cloud');
                        // Keep stream responsiveness for mode/log updates, but avoid
                        // speaking a partial sentence that can sound truncated.
                    };

                    const shouldUseDirectStream = !this._isMobile && !this.hasServerGeminiProxy();
                    const streamedResponse = shouldUseDirectStream
                        ? await this._callGeminiStream(input, handleFirstSentence, { timeoutMs: this._liveCloudFailoverTimeoutMs })
                        : null;

                    if (streamedResponse === null || this._isLikelyTruncatedAiText(streamedResponse)) {
                        // Streaming failed — fall back to regular call
                        response = await this._callGemini(input, { timeoutMs: this._liveCloudFailoverTimeoutMs });
                        cloudReplyNeedsCommit = !!response;
                    } else {
                        response = this._condenseReply(streamedResponse, 'cloud');
                        cloudReplyNeedsCommit = !!response;
                    }

                }

                if (response) {
                    if (requestedLanguage && !this._responseMatchesRequestedLanguage(response, requestedLanguage)) {
                        return runCloudFallbackChain('cloud-language-mismatch');
                    }
                    if (requestedLanguage && !ephemeralTurn) this._rememberRequestedOutputLanguage(requestedLanguage);
                    if (cloudReplyNeedsCommit) {
                        this._commitCloudReply(input, response);
                    }
                    this._setActiveMode('cloud');
                    this.onAiEngineChange?.('cloud');
                    if (!suppressDirectOutput && outputGuard()) {
                        this.onAiResponse?.(response);
                        this.speak(response, { speaker: 'assistant' });
                    }
                    this._emitAiLog({ engine: 'cloud', input, output: response, ms: Date.now() - _logStart, memories: 0, vision: this._lastCallHadVision, audio: this._lastCallHadAudio });
                    if (!ephemeralTurn) {
                        const norm = this._normalizeUtterance(response);
                        this._recentCloudOutputs.push(norm);
                        if (this._recentCloudOutputs.length > 8) this._recentCloudOutputs.shift();
                    }
                    return response;
                }

                return runCloudFallbackChain('cloud-empty');
            } catch (e) {
                console.error('[Gemini] respondTo failed:', e);
                const errMsg = e.message || String(e);

                const isTimeoutError = /AbortError|abort|timed out/i.test(errMsg);
                const isKeyIssue = /Invalid or expired API Key|API key missing|API key expired|API_KEY_INVALID|Gemini temporarily disabled/i.test(errMsg);
                const isQuotaIssue = /quota exhausted|Quota exceeded|429/i.test(errMsg);
                const isModelIssue = /All Gemini models failed|not found for API version|is not found for API version/i.test(errMsg);

                if (isTimeoutError) {
                    console.warn('[Cloud] Request timed out — trying local, then DICT');
                    return runCloudFallbackChain('cloud-timeout');
                }

                if (isKeyIssue || (isModelIssue && !isQuotaIssue)) {
                    // Only permanently disable cloud if the failure was NOT caused by
                    // multimodal content (audio/video) — those are best-effort and the
                    // proxy now handles them by stripping and retrying.
                    if (!this._lastCallHadVision && !this._lastCallHadAudio) {
                        this._geminiDisabled = true;
                    }
                    if (!isKeyIssue && !this._geminiDisabled) {
                        console.warn('[Cloud] Model failure with multimodal content — not disabling cloud, will retry next message.');
                    }
                    if (isKeyIssue && !this._cloudDisabledNoticeShown) {
                        console.warn('[Cloud] Cloud AI unavailable. Type /key YOUR_API_KEY in chat to re-enable cloud mode.');
                        this._cloudDisabledNoticeShown = true;
                    }
                    return runCloudFallbackChain(isKeyIssue ? 'cloud-key-issue' : 'cloud-model-issue');
                }

                if (isQuotaIssue) {
                    this._quotaBackoffUntil = Date.now() + this._quotaBackoffMs;
                    return runCloudFallbackChain('cloud-quota');
                }

                return runCloudFallbackChain('cloud-error');
            }
        })();

        this._responseInFlight = runPromise;
        try {
            return await runPromise;
        } finally {
            this._activeMovieSceneContext = '';
            this._activeMovieSceneHits = [];
            if (requestedLanguageSnapshot) {
                if (requestedLanguageSnapshot.active?.code && requestedLanguageSnapshot.active?.label) {
                    this._requestedOutputLanguage = { ...requestedLanguageSnapshot.active };
                    this._requestedOutputLanguageTurns = Number(requestedLanguageSnapshot.turns || 0);
                    this._requestedOutputLanguageAt = Number(requestedLanguageSnapshot.at || 0);
                } else {
                    this._clearRequestedOutputLanguage();
                }
            }
            if (this._responseInFlight === runPromise) {
                this._responseInFlight = null;
            }
            if (this._responseAbortController === responseAbortController) {
                this._responseAbortController = null;
            }
        }
    }

    /**
     * Analyze Video Audio to "Clone" the Voice
     * Extracts spectral data to tune pitch/rate matches.
     */
    async analyzeVideoAudio(videoElement) {
        console.log("Analyzing vocal DNA...");

        const freqEl = document.getElementById('ana-freq');
        const harmEl = document.getElementById('ana-harm');
        const timbreEl = document.getElementById('ana-timbre');
        const statusEl = document.getElementById('ana-status');

        // Simulate scanning animation
        let scanInterval = setInterval(() => {
            if (freqEl) freqEl.textContent = Math.floor(Math.random() * 500 + 100) + ' Hz';
            if (harmEl) harmEl.textContent = 'Harmonic ' + Math.floor(Math.random() * 12);
            if (timbreEl) timbreEl.textContent = ['Warm', 'Cold', 'Metallic', 'Breath'][Math.floor(Math.random() * 4)];
        }, 100);

        if (statusEl) statusEl.textContent = "Extracting Formants...";

        return new Promise((resolve) => {
            setTimeout(() => {
                if (statusEl) statusEl.textContent = "Matching Vocal Profile...";

                setTimeout(() => {
                    clearInterval(scanInterval);

                    // 1. Pick the best female voice
                    this.selectedVoice = this._pickVoiceByHints([
                        'natural',
                        'online',
                        'aria',
                        'jenny',
                        'samantha',
                        'ava',
                        'serena',
                        'allison',
                        'google us english',
                        'female'
                    ]) || this.voices[0];

                    // 2. Generate a unique-ish "Profile" based on filename
                    // This makes different uploaded movies sound slightly different
                    const seed = this.currentMovie.length + (this.currentMovie.charCodeAt(0) || 0);
                    const pseudoRandomPitch = 0.96 + (seed % 5) * 0.025; // 0.96 to 1.06
                    const pseudoRandomRate = 0.92 + (seed % 4) * 0.025;  // 0.92 to 0.995

                    this.clonedProfile = {
                        name: "Synthetic Echo",
                        pitch: pseudoRandomPitch,
                        rate: pseudoRandomRate,
                        resonance: (seed % 2 === 0) ? "High" : "Mid"
                    };

                    this._clonedMovie = this.currentMovie;
                    this.pitch = this.clonedProfile.pitch;
                    this.rate = this.clonedProfile.rate;

                    console.log("Voice Cloned for:", this._clonedMovie, this.clonedProfile);
                    resolve(this.clonedProfile);
                }, 800);
            }, 1500);
        });
    }
}
