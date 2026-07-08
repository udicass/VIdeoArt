/**
 * Main Entry · Gesture3D
 * Orchestrates hand tracking, 3D scene, video import, and two-hand gestures.
 */
import './style.css';
import { HandTracker } from './handTracker.js';
import { Scene3D } from './scene3d.js';
import { WebcamOverlay } from './webcamOverlay.js';
import { VoiceManager } from './voiceManager.js';
import { visualizer } from './ui/visualizer.js';
import { trainingDashboard } from './ui/trainingDashboard.js';
import { ui } from './ui/uiSystem.js';
import { SuggestionEngine } from './ui/suggestionEngine.js';
import { PodcastEngine } from './core/podcastEngine.js';
import { AiEngine } from './core/aiEngine.js';
import { MemorySynthesizer } from './core/memorySynthesizer.js';
import { getMemoryCount, saveMemory, loadMemories } from './brainMemory.js';
import { getAvailableLocalLlmBackends, getLocalLlmBackend, getLocalLlmStatus, isOllamaHttpsBlocked, refreshLocalLlmStatus, setLocalLlmBackend } from './ollamaClient.js';
import { movieBrains, resolveMovieBrain } from './movieBrains.js';
import { buildMovieForgePack, formatMovieForgePromptText } from './movieForge.js';
import { getMovieRetrievalContext } from './movieSceneRetrieval.js';

console.log('main.js loaded.');

// Ensure all code runs after DOM is loaded
const startGestureApp = () => {
  console.log('startGestureApp called.');
  // ─── DOM REFS ───
  const loadingScreen = document.getElementById('loading-screen');
  const loaderStatus = document.getElementById('loader-status');
  const loaderBarFill = document.getElementById('loader-bar-fill');
  const appContainer = document.getElementById('app');
  const appLogo = document.getElementById('app-logo');
  const btnSecretPodcast = document.getElementById('btn-secret-podcast');
  const btnSecretTrain = document.getElementById('btn-secret-train');
  const btnSecretForge = document.getElementById('btn-secret-forge');
  const publicPodcastAiTimerEl = document.getElementById('public-podcast-ai-timer');

  // Utility for safe DOM text updates
  function safeSetText(el, text) {
    if (el) el.textContent = text;
  }

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|EdgA|EdgiOS/i.test(navigator.userAgent);
  const launchParams = new URLSearchParams(window.location.search);
  const isMuseCardLaunch = launchParams.get('muse') === '1'
    || launchParams.get('musecard') === '1'
    || launchParams.get('card') === 'muse';
  const publicPodcastAiHosts = new Set(['gesture-3d.vercel.app', 'gesture-3d-beta.vercel.app', 'localhost', '127.0.0.1']);
  const publicPodcastAiEnabled = publicPodcastAiHosts.has(window.location.hostname);
  const museLaunchMode = String(launchParams.get('mode') || '').toLowerCase();
  const museFullParam = String(launchParams.get('full') || '').toLowerCase();
  const isMuseCardFullscreen = isMuseCardLaunch && (museFullParam === '1' || museFullParam === 'true' || museFullParam === 'on');
  if (publicPodcastAiEnabled) {
    document.body.classList.add('public-podcast-ai');
    document.body.classList.add('player-always-visible');
  }
  if (isMuseCardLaunch) {
    document.body.classList.add('muse-card-active');
    if (isMuseCardFullscreen) {
      document.body.classList.add('muse-card-full');
    }
  }
  const threeCanvas = document.getElementById('three-canvas');
  const webcamVideo = document.getElementById('webcam');
  const webcamOverlayCanvas = document.getElementById('webcam-overlay');
  const btnToggleWebcam = document.getElementById('btn-toggle-webcam');
  const webcamPip = document.getElementById('webcam-pip');
  const webcamPipLabel = document.querySelector('#webcam-pip .pip-label');
  
  // Hide camera viewport by default - only show when Anti-Gravity is ON
  if (webcamPip) {
    webcamPip.classList.add('hidden');
  }

  const pillTracking = document.getElementById('pill-tracking');
  const pillGravity = document.getElementById('pill-gravity');
  const pillFps = document.getElementById('pill-fps');

  const gestureIcon = document.getElementById('gesture-icon');
  const gestureName = document.getElementById('gesture-name');
  const gestureSub = document.getElementById('gesture-sub');

  const btnEnableAgGesture = document.getElementById('btn-enable-ag-gesture');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  // Add fullscreen detection and toggle .fullscreen class on body
  function handleFullscreenChange() {
    if (document.fullscreenElement) {
      document.body.classList.add('fullscreen');
    } else {
      document.body.classList.remove('fullscreen');
    }
  }

  document.addEventListener('fullscreenchange', handleFullscreenChange);

  // Video UI refs
  const btnImportVideo = document.getElementById('btn-import-video');
  const videoDropzone = document.getElementById('video-dropzone');
  const videoFileInput = document.getElementById('video-file-input');
  const btnCloseDropzone = document.getElementById('btn-close-dropzone');
  const videoControls = document.getElementById('top-video-controls');
  const btnPlayPause = document.getElementById('btn-play-pause');

  // Mobile: tap anywhere on the HUD to reveal player controls for 3s then auto-hide
  if (isMobile && videoControls) {
    let _playerHideTimer = null;
    const _showPlayerBriefly = () => {
      videoControls.classList.add('visible');
      clearTimeout(_playerHideTimer);
      _playerHideTimer = setTimeout(() => videoControls.classList.remove('visible'), 1500);
    };
    // Tap on the player itself resets the timer
    videoControls.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      _showPlayerBriefly();
    }, { passive: true });
    // Tap anywhere on the HUD shows the player
    const hud = document.getElementById('hud');
    if (hud) {
      hud.addEventListener('touchstart', () => _showPlayerBriefly(), { passive: true });
    }
  }

  const btnMute = document.getElementById('btn-mute');
  const videoSeek = document.getElementById('video-seek');
  const videoTime = document.getElementById('video-time');
  const btnCloseVideo = document.getElementById('btn-close-video');

  // AI Voice UI refs
  const btnVoiceMic = document.getElementById('btn-voice-mic');
  const aiVoicePanel = document.getElementById('ai-voice-panel');
  const aiSpeechBubble = document.getElementById('ai-speech-bubble');
  const aiText = aiSpeechBubble.querySelector('.ai-text');
  const aiWave = aiSpeechBubble.querySelector('.ai-wave');
  const aiSpeechModeChip = document.getElementById('ai-speech-mode-chip');
  const aiSpeechStateChip = document.getElementById('ai-speech-state-chip');
  const aiChatMessages = document.getElementById('ai-chat-messages');
  const aiChatInput = document.getElementById('ai-chat-input');
  const aiChatStatus = document.getElementById('ai-chat-status');
  const aiChatPanel = document.getElementById('ai-chat-panel');
  const btnAiChatSend = document.getElementById('btn-ai-chat-send');
  const conversationModeToggle = document.getElementById('conversation-mode-toggle');
  const conversationModeChat = document.getElementById('conversation-mode-chat');
  const conversationModePodcast = document.getElementById('conversation-mode-podcast');
  const aiModeBrain = document.getElementById('ai-mode-brain');
  const aiModeCloud = document.getElementById('ai-mode-cloud');
  const aiModeGemma = document.getElementById('ai-mode-gemma');
  const aiModeSplit = document.getElementById('ai-mode-split');
  const btnTrainCloud = document.getElementById('btn-train-cloud');
  const btnTrainGemmaStrict = document.getElementById('btn-train-gemma-strict');
  const btnFullRun = document.getElementById('btn-full-run');
  const btnStoryMode = document.getElementById('btn-story-mode');
  const aiModeBadge = document.getElementById('ai-mode-badge');
  const aiModeChevron = document.getElementById('ai-mode-chevron');
  const aiModeDetails = document.getElementById('ai-mode-details');
  const aiModeLive = document.getElementById('ai-mode-live');
  const aiModePath = document.getElementById('ai-mode-path');
  const aiModeLevel = document.getElementById('ai-mode-level');
  const aiModeUsage = document.getElementById('ai-mode-usage');
  const localBackendOllama = document.getElementById('local-backend-ollama');
  const localBackendName = document.getElementById('local-backend-name');
  const localBackendRoute = document.getElementById('local-backend-route');
  const localBackendModel = document.getElementById('local-backend-model');
  const localBackendFile = document.getElementById('local-backend-file');
  const localBackendError = document.getElementById('local-backend-error');
  const voiceModeChip = document.getElementById('voice-mode-chip');

  function revealAiChatPanel({ focusInput = false } = {}) {
    if (aiChatPanel) aiChatPanel.classList.remove('hidden');
    if (!focusInput || !aiChatInput || aiChatInput.disabled || typeof aiChatInput.focus !== 'function') return;
    requestAnimationFrame(() => {
      aiChatInput.focus();
    });
  }

  function clearPublicPodcastAiContinueTimer() {
    if (publicPodcastAiContinueTimer) {
      clearTimeout(publicPodcastAiContinueTimer);
      publicPodcastAiContinueTimer = null;
    }
  }

  function clearPublicPodcastAiExpiryTimer() {
    if (publicPodcastAiExpiryTimer) {
      clearInterval(publicPodcastAiExpiryTimer);
      publicPodcastAiExpiryTimer = null;
    }
  }
      let pendingPodcastStartReplyLines = [];

  function formatPublicPodcastCountdown(ms = 0) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updatePublicPodcastAiTimerUi() {
    if (!publicPodcastAiTimerEl) return;
    const active = Boolean(publicPodcastAiEnabled && publicPodcastAiAutoMode && publicPodcastAiExpiresAt > 0);
    if (!active) {
      publicPodcastAiTimerEl.classList.add('hidden');
      publicPodcastAiTimerEl.textContent = '05:00';
      publicPodcastAiTimerEl.title = 'Podcast AI timer';
      return;
    }
    const remainingMs = Math.max(0, publicPodcastAiExpiresAt - Date.now());
    publicPodcastAiTimerEl.classList.remove('hidden');
    publicPodcastAiTimerEl.textContent = formatPublicPodcastCountdown(remainingMs);
    publicPodcastAiTimerEl.title = `Podcast AI time remaining: ${formatPublicPodcastCountdown(remainingMs)}`;
  }

  function startPublicPodcastAiExpiryTimer() {
    clearPublicPodcastAiExpiryTimer();
    updatePublicPodcastAiTimerUi();
    publicPodcastAiExpiryTimer = setInterval(() => {
      const remainingMs = Math.max(0, publicPodcastAiExpiresAt - Date.now());
      if (!publicPodcastAiAutoMode || publicPodcastAiExpiresAt <= 0) {
        clearPublicPodcastAiExpiryTimer();
        updatePublicPodcastAiTimerUi();
        return;
      }
      if (remainingMs <= 0) {
        clearPublicPodcastAiExpiryTimer();
        // Snapshot stats before stop clears them
        const _endTurns = publicPodcastAiTurnNumber;
        const _endGuest = podcastGuestInterjectionCount;
        const _endProfiles = podcastVoiceProfiles;
        stopPublicPodcastAiConversation();
        updatePublicPodcastAiTimerUi();
        // Chat summary
        const _endSummaryLines = [`🎙 Podcast ended · ${_endTurns} turn${_endTurns !== 1 ? 's' : ''}.`];
        if (_endGuest > 0) _endSummaryLines.push(`🎤 You joined the stage ${_endGuest} time${_endGuest !== 1 ? 's' : ''}.`);
        appendChatMessage('assistant', _endSummaryLines.join(' '));
        // Voiced farewell by Host A after state is cleared
        setTimeout(() => {
          const hA = _endProfiles?.hostA;
          voiceManager?.speak?.('Podcast end.', {
            speaker: 'hostA',
            voice: hA?.voice || undefined,
            pitch: hA?.pitch || undefined,
            rate: hA?.rate || undefined,
            override: true
          });
        }, 200);
        return;
      }
      updatePublicPodcastAiTimerUi();
    }, 1000);
  }

  function hasPublicPodcastAiConversationWork() {
    return Boolean(
      podcastEngine?.isSpeaking
      || Number(podcastEngine?.queue?.length || 0) > 0
      || podcastGuestFloorActive
      || Boolean(podcastGuestResumeTimer)
    );
  }

  function isPublicPodcastStageParticipationReady() {
    return Boolean(
      publicPodcastAiEnabled
      && publicPodcastAiAutoMode
      && !publicPodcastAiMovieSwitchPending
      && podcastTrainingEnabled
      && String(voiceManager?.currentMovie || '').trim()
    );
  }

  function hasPodcastGuestStageLiveState() {
    return Boolean(podcastGuestReplyInFlight || podcastGuestFloorActive || podcastGuestResumeTimer);
  }

  function isPodcastConversationSurfaceActive() {
    return Boolean(
      publicPodcastAiEnabled
      && (publicPodcastAiAutoMode || hasPublicPodcastAiConversationWork() || publicPodcastAiContinueTimer)
    );
  }

  function getConversationSurfaceMode() {
    if (!publicPodcastAiEnabled) return isPodcastConversationSurfaceActive() ? 'podcast' : 'chat';
    return selectedConversationSurfaceMode === 'podcast' ? 'podcast' : 'chat';
  }

  function setAiSpeechStateChip(text = '', active = false) {
    if (!aiSpeechStateChip) return;
    const normalized = String(text || '').trim();
    if (!normalized) {
      aiSpeechStateChip.textContent = '';
      aiSpeechStateChip.classList.add('hidden');
      aiSpeechStateChip.classList.remove('active');
      return;
    }
    aiSpeechStateChip.textContent = normalized;
    aiSpeechStateChip.classList.remove('hidden');
    aiSpeechStateChip.classList.toggle('active', Boolean(active));
  }

  function updateConversationModeUi() {
    const conversationMode = getConversationSurfaceMode();
      const podcastMode = conversationMode === 'podcast';
    document.body.classList.toggle('conversation-mode-podcast', podcastMode);
    document.body.classList.toggle('conversation-mode-chat', !podcastMode);
    if (conversationModeToggle) {
      conversationModeToggle.classList.toggle('hidden', !publicPodcastAiEnabled);
    }
    if (conversationModeChat) conversationModeChat.classList.toggle('active', !podcastMode);
    if (conversationModePodcast) conversationModePodcast.classList.toggle('active', podcastMode);
    if (voiceModeChip) {
      voiceModeChip.textContent = podcastMode ? 'POD' : 'CHAT';
      voiceModeChip.classList.toggle('podcast', podcastMode);
    }
    if (btnVoiceMic) {
      btnVoiceMic.classList.toggle('podcast-mode', podcastMode);
    }
    if (aiSpeechModeChip) {
      aiSpeechModeChip.textContent = podcastMode ? 'Podcast' : 'Free Chat';
    }
  }

  function isPodcastGuestParticipationEnabled() {
    return Boolean((brainTrainingInFlight && podcastTrainingEnabled) || isPublicPodcastStageParticipationReady());
  }

  function resetAiMemoryBadge() {
    const memDot = document.getElementById('brain-mem-dot');
    if (!memDot) return;
    memDot.className = 'ai-mode-badge-mem';
    memDot.textContent = '';
    memDot.title = '';
  }

  function updatePublicPodcastAiButtonState() {
    if (publicPodcastAiEnabled && btnSecretTrain) {
      btnSecretTrain.classList.toggle(
        'active',
        Boolean(publicPodcastAiAutoMode || hasPublicPodcastAiConversationWork() || publicPodcastAiContinueTimer)
      );
    }
    updatePublicPodcastAiTimerUi();
    refreshAiModeBadge();
    updateConversationModeUi();
  }

  function stopPublicPodcastAiConversation(options = {}) {
    const preserveAutoMode = options?.preserveAutoMode === true;
    const preserveSelection = options?.preserveSelection === true;
    publicPodcastAiMovieSwitchPending = options?.movieSwitch === true;
    pendingFreeChatMicActivation = false;
    if (!preserveAutoMode) {
      publicPodcastAiAutoMode = false;
      publicPodcastAiStartedAt = 0;
      publicPodcastAiExpiresAt = 0;
      clearPublicPodcastAiExpiryTimer();
    }
    if (!preserveSelection) {
      selectedConversationSurfaceMode = 'chat';
    }
    publicPodcastAiTurnNumber = 0;
    publicPodcastAiStartInFlight = false;
    publicPodcastAiMovie = '';
    publicPodcastAiReplyMode = '';
    pendingPodcastStartReplyLines = [];
    _pendingSplitMuseReplyResult = null;
    _pendingSplitMuseReplyAt = 0;
    _podcastPrefetch = null;
    _splitMuseAbortController?.abort();
    _splitMuseAbortController = null;
    _lastSplitHostACloudAttemptAt = 0;
    publicPodcastGuestDirective = null;
    lastPodcastGuestMicHandledAt = 0;
    podcastGuestPendingResumeDelayMs = 0;
    podcastGuestInterjectionCount = 0;
    clearPublicPodcastAiContinueTimer();
    clearPodcastGuestMicAutoStopTimer();
    if (podcastGuestPttTailTimer) { clearTimeout(podcastGuestPttTailTimer); podcastGuestPttTailTimer = null; }
    podcastGuestPttHeld = false;
    podcastGuestFloorActive = false;
    podcastGuestReplyInFlight = false;
    if (podcastEngine) {
      podcastEngine.guestFloorActive = false;
      podcastEngine.isSpeaking = false;
      podcastEngine.clearQueue?.();
    }
    try {
      if (voiceManager?.isListening || voiceManager?.keepListening) {
        voiceManager.stopListening?.();
      }
      if (voiceManager?.synthesis?.speaking || voiceManager?.synthesis?.pending) {
        voiceManager.synthesis.cancel();
      }
    } catch {
      // noop
    }
    isVoiceSessionActive = false;
    if (btnVoiceMic) {
      btnVoiceMic.classList.remove('listening');
      safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      btnVoiceMic.title = MIC_IDLE_TITLE;
    }
    setInlineActivity('');
    restoreVideoVolume();
    clearPendingPodcastNarration({ cancelActive: true });
    syncTrainingPushToTalkMode();
    updatePublicPodcastAiButtonState();
    updateConversationModeUi();
  }

  function renderPlayPauseButton(shouldPlay) {
    if (neoPlayIcon && neoPauseIcon) {
      neoPlayIcon.style.display = shouldPlay ? 'none' : 'block';
      neoPauseIcon.style.display = shouldPlay ? 'block' : 'none';
    } else if (btnPlayPause) {
      safeSetText(btnPlayPause, shouldPlay ? '⏸' : '▶');
    }
    if (btnPlayPause) {
      btnPlayPause.title = shouldPlay ? 'Pause' : 'Play';
      btnPlayPause.setAttribute('aria-label', shouldPlay ? 'Pause' : 'Play');
      btnPlayPause.setAttribute('aria-pressed', String(shouldPlay));
    }
  }

  function logPodcastControlEvent(action = '', details = {}, options = {}) {
    if (typeof appendAiLog !== 'function') return;
    const normalizedAction = String(action || '').trim().toUpperCase() || 'STATE';
    const movie = String(details?.movie || voiceManager?.currentMovie || '').trim();
    const queueLength = Math.max(0, Number(details?.queue ?? (podcastEngine?.queue?.length || 0)));
    const turnNumber = Math.max(0, Number(details?.turn ?? (publicPodcastAiTurnNumber || 0)));
    const speaking = Boolean(details?.speaking ?? (podcastEngine?.isSpeaking || voiceManager?.synthesis?.speaking));
    const guestFloor = Boolean(details?.guest ?? podcastGuestFloorActive);
    const parts = [
      `turn:${turnNumber}`,
      `queue:${queueLength}`,
      `speaking:${speaking ? 'yes' : 'no'}`,
      `guest:${guestFloor ? 'yes' : 'no'}`
    ];
    if (details?.delayMs != null) {
      parts.push(`delay:${Math.max(0, Number(details.delayMs || 0))}`);
    }
    if (details?.source) {
      parts.push(`source:${String(details.source).trim()}`);
    }
    if (details?.reason) {
      parts.push(`reason:${String(details.reason).trim()}`);
    }
    appendAiLog({
      engine: 'podcast-control',
      movie,
      input: `${normalizedAction}${movie ? ` · ${movie}` : ''}`,
      output: String(options?.output || parts.join(' · ')).trim(),
      ms: Number.isFinite(Number(options?.ms)) ? Math.max(0, Math.round(Number(options.ms))) : 0,
      vision: false,
      audio: true
    });
  }

  function schedulePublicPodcastAiContinue(delayMs = isMobile ? 900 : 500) {
    if (!publicPodcastAiEnabled || !publicPodcastAiAutoMode || publicPodcastAiMovieSwitchPending || publicPodcastAiStartInFlight || brainTrainingInFlight || !voiceManager || !podcastEngine) return;
    clearPublicPodcastAiContinueTimer();
    publicPodcastAiContinueTimer = setTimeout(async () => {
      publicPodcastAiContinueTimer = null;
      if (!publicPodcastAiEnabled || !publicPodcastAiAutoMode || publicPodcastAiMovieSwitchPending || publicPodcastAiStartInFlight || brainTrainingInFlight || !voiceManager || !podcastEngine) {
        logPodcastControlEvent('continue-skip', { delayMs, reason: 'inactive-gate' });
        updatePublicPodcastAiButtonState();
        return;
      }
      if (voiceManager?.synthesis?.speaking || hasPublicPodcastAiConversationWork() || podcastEngine?.viewerInterruptActive || podcastEngine?.pendingViewerInterrupt || voiceManager?.micStarting) {
        logPodcastControlEvent('continue-defer', {
          delayMs,
          reason: voiceManager?.synthesis?.speaking ? 'speech-busy' : podcastEngine?.viewerInterruptActive ? 'viewer-interrupt' : podcastEngine?.pendingViewerInterrupt ? 'viewer-interrupt-pending' : voiceManager?.micStarting ? 'mic-starting' : 'conversation-busy'
        });
        schedulePublicPodcastAiContinue(isMobile ? 1200 : 700);
        updatePublicPodcastAiButtonState();
        return;
      }
      const currentMovie = String(voiceManager?.currentMovie || '').trim();
      if (!currentMovie) {
        logPodcastControlEvent('continue-stop', { delayMs, reason: 'no-movie' });
        stopPublicPodcastAiConversation();
        return;
      }
      if (publicPodcastAiMovie !== currentMovie) {
        publicPodcastAiMovie = currentMovie;
        publicPodcastAiTurnNumber = 0;
      }
      const nextTurn = Math.max(1, publicPodcastAiTurnNumber + 1);
      // Increment early to prevent re-entry if async cloud call is in flight
      publicPodcastAiTurnNumber = nextTurn;
      recordPodcastTurn(currentMovie, nextTurn);

      // Every 3 turns use Cloud AI for richer, more varied content.
      // Falls back to template if cloud returns nothing or throws.
      const CLOUD_REFRESH_EVERY = 1;
      const useCloud = nextTurn > 1 && (nextTurn % CLOUD_REFRESH_EVERY === 0);
      let nextLines = [];
      if (useCloud) {
        setInlineActivity('podcast-thinking');
        showBubbleThinking();
        try {
          if (_podcastPrefetch && _podcastPrefetch.turn === nextTurn && _podcastPrefetch.movie === currentMovie) {
            nextLines = await _podcastPrefetch.promise;
            _podcastPrefetch = null;
          } else {
            _podcastPrefetch = null;
            nextLines = await buildPublicPodcastAiExchangeLines(nextTurn);
          }
        } catch (_err) {
          // cloud failed · fall through to template
        }
        setInlineActivity('');
      }
      // Re-check after any async await · podcast may have been stopped while cloud call was in-flight
      if (!publicPodcastAiEnabled || !publicPodcastAiAutoMode) {
        logPodcastControlEvent('continue-skip', { turn: nextTurn, delayMs, reason: 'stopped-during-await' });
        updatePublicPodcastAiButtonState();
        return;
      }
      if (voiceManager?.synthesis?.speaking || hasPublicPodcastAiConversationWork() || podcastEngine?.viewerInterruptActive || podcastEngine?.pendingViewerInterrupt || voiceManager?.micStarting) {
        logPodcastControlEvent('continue-defer', {
          turn: nextTurn,
          delayMs,
          reason: voiceManager?.synthesis?.speaking ? 'speech-busy-after-await' : podcastEngine?.viewerInterruptActive ? 'viewer-interrupt-after-await' : podcastEngine?.pendingViewerInterrupt ? 'viewer-interrupt-pending-after-await' : voiceManager?.micStarting ? 'mic-starting-after-await' : 'conversation-busy-after-await'
        });
        // Rewind the turn counter because this turn never actually entered the queue.
        publicPodcastAiTurnNumber = Math.max(0, nextTurn - 1);
        schedulePublicPodcastAiContinue(isMobile ? 1200 : 700);
        updatePublicPodcastAiButtonState();
        return;
      }
      if (!nextLines.length) {
        nextLines = buildTemplatePublicPodcastAiExchangeLines(nextTurn);
      }
      if (!nextLines.length) {
        logPodcastControlEvent('continue-stop', { turn: nextTurn, delayMs, reason: 'no-lines' });
        stopPublicPodcastAiConversation();
        return;
      }
      logPodcastControlEvent('continue-start', {
        turn: nextTurn,
        queue: nextLines.length,
        delayMs,
        reason: 'idle-resume'
      });
      injectPodcastNarration(nextLines, { cancelActive: false, prioritize: true, force: true });
      // Prefetch the next exchange now, while this turn is being spoken — removes the
      // cloud-generation gap (~4s) from the silence between turns.
      _podcastPrefetch = {
        movie: currentMovie,
        turn: nextTurn + 1,
        promise: buildPublicPodcastAiExchangeLines(nextTurn + 1).catch(() => [])
      };
      updatePublicPodcastAiButtonState();
      if (!voiceManager?.synthesis?.speaking) {
        setTimeout(() => drainPodcastNarrationQueue(true), 30);
      }
    }, Math.max(450, Number(delayMs || 0)));
    updatePublicPodcastAiButtonState();
  }

  const playlistPanel = document.getElementById('playlist-panel');
  const playlistItems = document.getElementById('playlist-items');
  const btnLoadPlaylist = document.getElementById('btn-load-playlist');
  const btnClosePlaylist = document.getElementById('btn-close-playlist');
  const playlistInput = document.getElementById('playlist-input');
  const mpTitle = document.getElementById('mp-video-title');
  const mpArtist = document.getElementById('mp-video-artist');
  const btnPrevMovie = document.getElementById('btn-prev-movie');
  const btnNextMovie = document.getElementById('btn-next-movie');
  const videoVolume = document.getElementById('video-volume');
  const btnShowPlaylistNeo = document.getElementById('btn-show-playlist-neo');
  const neoSeekTrack = document.querySelector('.neo-seek-track');
  const neoPlayIcon = document.getElementById('neo-play-icon');
  const neoPauseIcon = document.getElementById('neo-pause-icon');
  const aiLogPanel = document.getElementById('ai-log-panel');

  // Start playlist collapsed on all sizes
  if (playlistPanel) {
    playlistPanel.classList.add('playlist-collapsed');
    if (btnClosePlaylist) {
      safeSetText(btnClosePlaylist, '▸');
      if (btnClosePlaylist) btnClosePlaylist.title = 'Expand playlist';
    }
  }

  const DEFAULT_MOVIE_AUDIO_VOLUME = 0.7;

  // ─── BACKGROUND AUDIO (Synthetic_Desires_1 audio plays under videos 2/3/4) ───
  const MOVIE_CDN_BASE = String(
    import.meta.env.VITE_MOVIE_CDN_BASE || 'https://pub-3a3ec970180e4d9db03559eb82c9b828.r2.dev'
  ).replace(/\/+$/, '');
  const R2_BASE = import.meta.env.DEV
    ? '/movies'
    : MOVIE_CDN_BASE;

  const bgAudio = document.createElement('audio');
  bgAudio.loop = true;
  bgAudio.preload = 'none';
  bgAudio.volume = DEFAULT_MOVIE_AUDIO_VOLUME;
  document.body.appendChild(bgAudio);
  let bgAudioActive = false;
  let _bgAudioResumeHandler = null;

  function clearBgAudioResumeHandler() {
    if (!_bgAudioResumeHandler) return;
    window.removeEventListener('click', _bgAudioResumeHandler, true);
    window.removeEventListener('keydown', _bgAudioResumeHandler, true);
    _bgAudioResumeHandler = null;
  }

  function queueBgAudioResume() {
    if (_bgAudioResumeHandler) return;
    _bgAudioResumeHandler = async () => {
      clearBgAudioResumeHandler();
      try {
        await bgAudio.play();
      } catch (err) {
        console.warn('bgAudio resume after user gesture failed:', err);
      }
    };
    window.addEventListener('click', _bgAudioResumeHandler, true);
    window.addEventListener('keydown', _bgAudioResumeHandler, true);
  }

  // ─── BETA MODE CHECK ───
  const isBeta = new URLSearchParams(window.location.search).get('beta') === '1';
  document.querySelectorAll('[data-beta-only]').forEach(el => {
    if (!isBeta) {
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });
  if (isBeta) {
    console.log('🧪 BETA MODE ACTIVE: Experimental features enabled.');
  }

  // ─── STATE ───
  let handTracker;
  let scene3d;
  let webcamOverlay;
  let voiceManager;
  let podcastEngine;
  let aiEngine;
  let memorySynth;
  let suggestionEngine;
  let showShapes = true; // Default to showing shapes per user request "activate gesture shapes" option
  let aiSpeakTimer = null;
  let lastBubbleQuestionText = '';
  let lastBubbleQuestionAt = 0;
  let _activeSpeechFullText = '';
  let _activeSpeechPrefix = '';
  let _activeSpeechLiveReveal = true;
  let fpsFrames = 0;
  let fpsTime = 0;
  let currentFps = 60;
  let isAntiGravity = false;
  let autoAntiGravityActive = false;
  let isVoiceCloneReady = false;
  let personaBuildGeneration = 0;
  let isVoiceSessionActive = false; // true while the mic session should keep the button in an active state
  let webcamStream = null;
  let isWebcamPaused = false;
  let baseChatStatusText = 'Load a movie to enable chat';
  let chatInlineActivity = '';
  let chatInlineActivityStartedAt = 0;
  let chatInlineActivityClearTimer = null;
  let chatStatusTooltipTimer = null;
  let trainingStatusMeta = null;
  let brainTrainingInFlight = false;
  let _fullRunActive = false;
  let _fullRunPaused = false;
  let _fullRunResumeResolve = null;
  let _activeTrainingEngine = 'cloud'; // 'cloud' | 'ollama' | 'dict' · tracks engine during training
  let _trainingButtonMinutes = 5;
  let podcastTrainingEnabled = true;
  // --- Podcast Stop and Repeat Free Chat ---
  function stopPodcastAndRepeatLastFreeChat() {
    // 1. Check if we have anything to repeat first
    let textToRepeat = '';
    if (typeof freeChatPodcastSeeds !== 'undefined' && freeChatPodcastSeeds.length > 0) {
      textToRepeat = freeChatPodcastSeeds[0].response;
    } else if (voiceManager?._lastAiResponseText) {
      textToRepeat = voiceManager._lastAiResponseText;
    }

    if (!textToRepeat) {
      appendChatMessage('assistant', '(No previous free chat item)');
      showAiSpeech('(No previous free chat item)', true, { forceDisplay: true });
      return;
    }

    // 2. ONLY stop podcast if we actually have something to repeat
    if (publicPodcastAiAutoMode || hasPublicPodcastAiConversationWork() || publicPodcastAiContinueTimer) {
      stopPublicPodcastAiConversation();
      // Switch UI to chat mode
      selectedConversationSurfaceMode = 'chat';
      updateConversationModeUi();
    }

    // 3. Announce in chat and via voice
    appendChatMessage('assistant', textToRepeat);
    showAiSpeech(textToRepeat, true, { forceDisplay: true });
  }
    // Expose for manual triggering (e.g., dev console or UI button)
    window.stopPodcastAndRepeatLastFreeChat = stopPodcastAndRepeatLastFreeChat;
  let podcastBatchHighlights = new Map();
  let podcastBrainCheckpointBusy = false;
  let podcastNarratedBatchCount = 0;
  let podcastNarratedBatchNumbers = new Set();
  let podcastNarrationSessionId = 0;
  let lastPodcastChatLine = '';
  let lastPodcastHostQuestionLine = '';
  let lastPodcastHostAnswerLine = '';
  let recentPodcastHostQuestionLines = [];
  let recentPodcastHostAnswerLines = [];
  let podcastModeRestoreTimer = null;
  let podcastModeRestoreMode = null;
  let podcastGuestReplyInFlight = false;
  let podcastGuestFloorActive = false;
  let podcastGuestResumeTimer = null;
  let podcastGuestPendingResumeDelayMs = 0;
  let podcastGuestMicAutoStopTimer = null;
  let podcastGuestMicWindowActive = false;
  let podcastGuestPttHeld = false;
  let podcastGuestPttTailTimer = null;
  let _podcastGuestPttStartedAt = 0;
  let lastPodcastGuestMicAckAt = 0;
  let lastPodcastGuestMicManualRequestAt = 0;
  let lastPodcastGuestReplyAt = 0;
  let podcastGuestInterjectionCount = 0;
  let podcastGuestIntroAnnounced = false;
  let podcastGuestWaitCueAnnounced = false;
  let activeTrainingSessionMetrics = null;
  let aiModeFlashTimer = null;
  let aiModePillFlashTimer = null;
  let podcastVoiceProfiles = { hostA: null, hostB: null };
  let selectedConversationSurfaceMode = 'chat';
  let publicPodcastAiAutoMode = false;
  let publicPodcastAiTurnNumber = 0;
  let publicPodcastAiStartInFlight = false;
  let publicPodcastAiMovie = '';
  let publicPodcastAiReplyMode = '';
  let publicPodcastAiContinueTimer = null;
  let publicPodcastAiStartedAt = 0;
  let publicPodcastAiExpiresAt = 0;
  let publicPodcastAiExpiryTimer = null;
  let publicPodcastAiMovieSwitchPending = false;
  let publicPodcastGuestDirective = null;
  let secretTrainTapCount = 0;
  let secretTrainTapTimer = null;
  let secretTrainRevealTimer = null;
  let aiReplyGlitchTimer = null;
  let aiEnginePendingTimer = null;
  let cloudVoiceBusyCount = 0;
  let cloudVoiceBusyAt = 0;
  let pendingFreeChatMicActivation = false;
  let pendingFreeChatSeedCapture = null;
  let freeChatPodcastSeeds = [];
  let recentPodcastSeedBuffer = [];
  const DASHBOARD_ANALYTICS_STORAGE_KEY = 'gesture3d.dashboard-analytics.v2';
  const DASHBOARD_ANALYTICS_VERSION = 3;
  const DASHBOARD_TIMELINE_LIMIT = 240;
  const DASHBOARD_EVENTS_LIMIT = 2400;
  let dashboardPersistTimer = 0;
  const dashboardSessionStats = loadDashboardSessionStats();
  let dashboardTrainingRuntime = null;
  let dashboardTrainingBatchStarts = Object.create(null);
  let dashboardSessionSourceServer = {
    status: 'pending',
    fetchedAt: 0,
    ipAddress: '',
    city: '',
    region: '',
    country: '',
    countryCode: '',
    timezone: '',
    latitude: '',
    longitude: '',
    userAgent: '',
    provider: '',
    error: ''
  };
  let lastPodcastGuestMicHandledAt = 0;
  let lastModeSwitchAnnouncement = { mode: '', at: 0 };
  let lastConversationSurfaceAnnouncement = { mode: '', at: 0 };
  let lastPodcastTrainingStatusAnnouncement = { text: '', at: 0 };
  const CLOUD_VOICE_BUSY_WINDOW_MS = 90000;
  const CLOUD_VOICE_BUSY_SWITCH_THRESHOLD = 2;
  const PUBLIC_PODCAST_AI_DURATION_MS = 10 * 60 * 1000;
  const PODCAST_GUEST_RESUME_DELAY_MS = 2200;
  const PODCAST_GUEST_MIC_ACK_COOLDOWN_MS = 1200;
  const PODCAST_GUEST_MIC_WINDOW_MS = 9000;
  const PODCAST_GUEST_PTT_TAIL_MS = 1800;
  const MIC_START_DELAY_MS = 500;
  const PODCAST_GUEST_FAILURE_SILENCE_MS = 2600;
  const PODCAST_GUEST_LOCAL_REPLY_TIMEOUT_MS = 25000;
  const PODCAST_GUEST_CLOUD_EXPANSION_TIMEOUT_MS = 8000;
  // Race threshold: if Mini hasn·t replied within this window, serve DICT/cloud immediately
  const MINI_RACE_THRESHOLD_PODCAST_MS = 28000;
  const MINI_RACE_THRESHOLD_GUEST_MS = 28000;
  const SPLIT_HOST_A_LOCAL_RACE_THRESHOLD_MS = 8000;
  // Buffer: Mini·s answer from the previous podcast AI turn, stored while DICT was served
  let _pendingMiniPodcastReplyResult = null;
  let _pendingMiniPodcastReplyAt = 0;
  // Race threshold for split mode Muse (12b can be slow) -- cap at 15s, fall to DICT
  const SPLIT_MUSE_RACE_THRESHOLD_MS = 15000;
  // AbortController for the active split-mode Muse local inference · aborted on race timeout or stop
  let _splitMuseAbortController = null;
  // Buffer: Split mode Muse local answer that arrived after DICT fast-lane was already served
  let _pendingSplitMuseReplyResult = null;
  let _pendingSplitMuseReplyAt = 0;
  // Prefetched next podcast exchange · built while the current turn is still speaking
  let _podcastPrefetch = null;
  // Cloud throttle for split-mode Host A questions · don't hammer Gemini quota on every turn.
  // At most one cloud attempt per SPLIT_HOST_A_CLOUD_MIN_INTERVAL_MS.
  const SPLIT_HOST_A_CLOUD_MIN_INTERVAL_MS = 15_000;
  let _lastSplitHostACloudAttemptAt = 0;

  // ─── Background Enrichment Pool ───────────────────────────────────────────
  // Every ENRICHMENT_INTERVAL_TURNS podcast turns, a non-blocking Cloud call
  // wanders freely on the current film and returns 3-5 fresh thematic observations.
  // These are merged into getFilmContext() output so the next several turns use
  // richer, dynamically-generated material alongside the static FILM_CONTEXT_MAP.
  const ENRICHMENT_INTERVAL_TURNS = 1;
  const ENRICHMENT_MAX_POOL_SIZE = 24; // max observations kept per film
  const _runtimeEnrichmentPool = new Map(); // film-slug → { observations: string[], lastEnrichedAt: number, inFlight: boolean }
  let _enrichmentTurnClock = 0; // counts Muse replies since last enrichment trigger

  // Video & Playlist
  let isVideoMode = false;
  let isSeeking = false;
  let playlistFiles = [
    { name: 'Synthetic_Desires_1.mp4', path: `${R2_BASE}/Synthetic_Desires_1.mp4` },
    { name: 'Synthetic_Desires_2.mp4', path: `${R2_BASE}/Synthetic_Desires_2.mp4` },
    { name: 'Synthetic_Desires_3.mp4', path: `${R2_BASE}/Synthetic_Desires_3.mp4` },
    { name: 'Synthetic_Desires_4.mp4', path: `${R2_BASE}/Synthetic_Desires_4.mp4` },
    { name: 'Synthetic_Desires_5.mp4', path: `${R2_BASE}/Synthetic_Desires_5.mp4` },
  ];
  let currentPlaylistIndex = 0;
  let isPlaylistOpen = true; // User requested: "on load it will show the playlist"
  const cursorEl = document.getElementById('virtual-cursor');
  let cursorClickTimer = 0;
  let gesturePrevPinching = false;
  let gesturePillFireAt = 0;

  // System Lock
  let isSystemLocked = false; // User requested: "no lock on start"
  let unlockTimer = 0;
  const UNLOCK_DURATION = 1500;

  ui.init();

  // ─── GESTURE DISPLAY MAPS ───
  const gestureDisplay = {
    none: { icon: '👀', name: 'Scanning...', sub: 'Show hand to control' },
    idle: { icon: '👀', name: 'Ready', sub: 'Show hand to control' },
    locked: { icon: '🔒', name: 'System Locked', sub: 'Hold ✌️ Victory to Unlock' },
    unlocking: { icon: '🔓', name: 'Unlocking...', sub: 'Keep holding...' },
    victory: { icon: '✌️', name: 'Victory!', sub: 'System Activated' },
    open: { icon: '🖐️', name: 'Open Hand', sub: 'Objects orbit your fingertip' },
    pinch: { icon: '🤏', name: 'Pinch · Grab!', sub: 'Pulling objects toward you' },
    point: { icon: '☝️', name: 'Silence...', sub: 'Shhh... listen to the void' },
    thumbsUp: { icon: '👍', name: 'Mic Toggle', sub: 'Activating Vocal Input...' },
    fist: { icon: '✊', name: 'Fist · Push!', sub: 'Pushing objects away' },
    palmUp: { icon: '🌌', name: 'Palm Up · Anti-Gravity!', sub: 'Gravity reversed!' },
  };

  // Video-mode subtitles (single hand)
  const videoGestureSubs = {
    open: 'Bending the video surface',
    pinch: 'Pinching video characters',
    thumbsUp: 'Toggling Vocal Input',
    point: 'Silencing the noise...',
    fist: 'Pushing video content away',
    palmUp: 'Twisting the video!',
  };

  // Two-hand gesture display
  const twoHandDisplay = {
    stretch: { icon: '🔀', name: 'Stretch!', sub: 'Pulling the video apart' },
    squeeze: { icon: '🤏', name: 'Squeeze!', sub: 'Crushing video inward' },
    tear: { icon: '💥', name: 'Tear!', sub: 'Ripping through the video' },
    rippleStorm: { icon: '🌊', name: 'Ripple Storm!', sub: 'Dual wave interference' },
    vortex: { icon: '🌀', name: 'Vortex!', sub: 'Opposing spiral distortions' },
    fold: { icon: '📐', name: 'I Remember...', sub: 'Folding memory like paper' },
    rotate: { icon: '🔄', name: 'Rotate!', sub: 'Spinning the surface' },
    dualIdle: { icon: '🤲', name: 'Two Hands', sub: 'Move hands apart to stretch' },
  };

  // Vocal Trigger Config
  let lastVocalTrigger = 0;
  const VOCAL_COOLDOWN = 1500; // ms between phrases
  const MIC_IDLE_LABEL = 'Speak (tap mic)';
  const MIC_IDLE_TITLE = 'Click the mic to enable voice';
  const VOICE_HINT_STORAGE_KEY = 'gesture3d.voiceHintShown';

  // ─── LOADING ───
  function updateLoading(message, progress) {
    safeSetText(loaderStatus, message);
    if (loaderBarFill) loaderBarFill.style.width = `${progress}%`;
  }

  function hideLoading() {
    if (loadingScreen) loadingScreen.classList.add('fade-out');
    if (appContainer) appContainer.classList.remove('hidden');
    setTimeout(() => {
      if (loadingScreen) loadingScreen.style.display = 'none';
    }, 800);
  }

  // ─── FORMAT TIME ───
  function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function stopWebcamStream() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    if (webcamVideo.srcObject) {
      const stream = webcamVideo.srcObject;
      stream.getTracks?.().forEach(track => track.stop());
      webcamVideo.srcObject = null;
    }
  }

  async function startWebcam(startPaused = false) {
    stopWebcamStream();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    });

    webcamStream = stream;
    webcamVideo.srcObject = stream;

    await new Promise((res) => {
      webcamVideo.onloadeddata = () => { webcamVideo.play(); res(); };
      setTimeout(res, 3000); // fallback
    });

    if (startPaused) {
      webcamVideo.pause();
      isWebcamPaused = true;
    } else {
      isWebcamPaused = false;
    }
    updateWebcamToggleButton();
  }

  function updateWebcamToggleButton() {
    if (!btnToggleWebcam) return;
    safeSetText(btnToggleWebcam, isWebcamPaused ? '▶' : '⏸');
    btnToggleWebcam.title = isWebcamPaused ? 'Resume live camera' : 'Pause live camera';
    btnToggleWebcam.setAttribute('aria-pressed', String(isWebcamPaused));
    if (webcamPipLabel) {
      if (isWebcamPaused) {
        webcamPipLabel.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> PAUSE`;
      } else {
        webcamPipLabel.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><circle cx="12" cy="12" r="5"/></svg> LIVE`;
      }
      webcamPipLabel.classList.toggle('pip-label-paused', isWebcamPaused);
    }
    if (webcamPip) {
      webcamPip.classList.toggle('webcam-paused', isWebcamPaused);
    }
  }

  async function toggleWebcamPlayback() {
    if (!webcamVideo) return;
    if (!webcamStream) {
      try {
        await startWebcam();
        // Start hand tracking once camera is live for the first time
        if (handTracker && webcamVideo.srcObject) {
          handTracker.isTracking = true;
        }
      } catch (err) {
        console.warn('Unable to start webcam:', err);
        return;
      }
      return; // startWebcam already sets paused state
    }

    isWebcamPaused = !isWebcamPaused;
    if (isWebcamPaused) {
      webcamVideo.pause();
    } else {
      try {
        await webcamVideo.play();
      } catch (err) {
        console.warn('Webcam resume blocked:', err);
      }
    }

    updateWebcamToggleButton();
  }

  function duckVideoVolume(multiplier = 0.35) {
    const video = scene3d?.videoMesh?.videoElement;
    const elements = [];
    if (video) elements.push(video);
    if (bgAudioActive && bgAudio) elements.push(bgAudio);

    elements.forEach(el => {
      if (el._savedVolume == null) el._savedVolume = el.volume;
      el.volume = el._savedVolume * multiplier;
    });
  }

  function restoreVideoVolume() {
    const video = scene3d?.videoMesh?.videoElement;
    const elements = [];
    if (video) elements.push(video);
    if (bgAudioActive && bgAudio) elements.push(bgAudio);

    elements.forEach(el => {
      if (el._savedVolume != null) {
        el.volume = el._savedVolume;
        delete el._savedVolume;
      }
    });
  }

  function triggerAiReplyGlitch() {
    if (!aiSpeechBubble) return;
    aiSpeechBubble.classList.remove('ai-reply-glitch');
    void aiSpeechBubble.offsetWidth;
    aiSpeechBubble.classList.add('ai-reply-glitch');

    if (aiReplyGlitchTimer) clearTimeout(aiReplyGlitchTimer);
    aiReplyGlitchTimer = setTimeout(() => {
      aiSpeechBubble.classList.remove('ai-reply-glitch');
    }, 550);
  }

  // ─── INIT ───
  async function init() {
    console.log('init() started!');
    try {
      updateLoading('Initializing...', 20);

      scene3d = new Scene3D(threeCanvas);

      // ── Skip webcam on startup · don't prompt for camera permission ──
      // Camera will start when user clicks the webcam toggle button.
      isWebcamPaused = true;
      updateWebcamToggleButton();
      updateLoading('Scene ready!', 50);

      webcamOverlay = new WebcamOverlay(webcamOverlayCanvas, webcamVideo);

      // ·· Load MediaPipe in background (non-blocking) ··
      // NOTE: do NOT pass updateLoading here · it would destroy the START button
      handTracker = new HandTracker();
      handTracker.videoElement = webcamVideo;
      Promise.race([
        handTracker.init(webcamVideo, () => { }).then(() => {
          handTracker.isTracking = webcamVideo.srcObject !== null;
          console.log('Hand tracking ready!');
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MediaPipe timeout')), 15000))
      ]).catch(err => {
        console.warn('Hand tracking unavailable:', err);
        // Show user-friendly error and hide loading screen
        const loadingScreen = document.getElementById('loading-screen');
        const loaderStatus = document.getElementById('loader-status');
        if (loaderStatus) {
          loaderStatus.textContent = '? Hand tracking unavailable. MediaPipe failed to load.';
          loaderStatus.style.color = '#e53935';
        }
        setTimeout(() => {
          if (loadingScreen) loadingScreen.classList.add('hidden');
          alert('Hand tracking is unavailable. MediaPipe failed to load.\n\nCheck your internet connection or try reloading the page.');
        }, 1200);
      });

      // Initialize Voice Manager
      voiceManager = new VoiceManager();

      // Initialize Suggestion Engine
      suggestionEngine = new SuggestionEngine({
        onSuggestionClick: (suggestion) => {
          // Ensure chat is enabled and overlay hidden
          try {
            setChatEnabled(true, 'Chat active');
            const overlay = document.getElementById('center-guide-overlay');
            if (overlay) overlay.style.display = 'none';
            if (aiChatInput && typeof aiChatInput.focus === 'function') aiChatInput.focus();
          } catch (err) {
            console.warn('Suggestion click enable chat failed:', err);
          }

          // Route to Podcast mode if selected, otherwise free chat
          if (typeof selectedConversationSurfaceMode !== 'undefined' && selectedConversationSurfaceMode === 'podcast' && typeof podcastEngine !== 'undefined' && podcastEngine) {
            try {
              // Splice viewer pill interrupt before the next pending Host A entry
              // 1) Build Elara's answer from film context
              const _viewerEntry = { text: suggestion, speaker: 'viewer', logMeta: { source: 'suggestion-viewer', suppressHostA: true } };
              let _elaraEntry = null;
              try {
                const _pillCtx = getFilmContext(String(voiceManager?.currentMovie || ''));
                const _pillObs = pickPromptVariant(_pillCtx?.observations || ['The image keeps carrying more feeling than the dialogue can confess.'], `pill|${suggestion}|${Date.now()}`);
                const _elaraLines = buildPodcastHostAnswerLines(_pillObs || suggestion, {
                  seed: `pill|${suggestion}`,
                  movie: String(voiceManager?.currentMovie || ''),
                  lead: pickPromptVariant(_pillCtx?.anchors || [], `pill|lead|${suggestion}`) || '',
                  ref: pickPromptVariant(_pillCtx?.refs || [], `pill|ref|${suggestion}`) || '',
                  focus: 'frame',
                  allowTwoStep: false,
                  longForm: false
                });
                const _elaraText = String(_elaraLines[0] || '').trim();
                if (_elaraText) {
                  _elaraEntry = { text: _elaraText, speaker: 'hostB', logMeta: { source: 'suggestion-elara', suppressHostA: true } };
                }
              } catch (_pillErr) {
                console.warn('Pill Elara answer build failed:', _pillErr);
              }

              // 2) Splice before the nearest pending Host A entry (with bridge "Wait a sec." if needed)
              podcastEngine.spliceViewerInterrupt(_viewerEntry, _elaraEntry);

              // 3) Show pill as a user question in chat (viewer spoke, not system)
              appendChatMessage('user', suggestion, { log: false });
              setInlineActivity('podcast-queued');
            } catch (err) {
              console.warn('Failed to queue podcast suggestion:', err);
            }
          } else {
            // submit suggestion as a free-chat input (no mic required)
            showAiSpeech(`"${suggestion}"`, false);
            appendChatMessage('user', suggestion);
            setInlineActivity('thinking');
            try {
              beginFreeChatSeedCapture(suggestion, 'suggestion');
              voiceManager.respondTo(suggestion);
            } finally {
              pendingFreeChatSeedCapture = null;
              setInlineActivity('');
            }
          }

          // Re-render pills (they will be active now)
          if (suggestionEngine) suggestionEngine.render();
        }
      });
      
      // Wire Start Chat button to enable chat and hide the center guide overlay
      const startChatBtn = document.getElementById('start-chat-btn');
      const centerGuideOverlay = document.getElementById('center-guide-overlay');
      if (startChatBtn) {
        startChatBtn.addEventListener('click', () => {
          try {
            setChatEnabled(true, 'Chat active');
            if (centerGuideOverlay) centerGuideOverlay.style.display = 'none';
            if (aiChatInput && typeof aiChatInput.focus === 'function') aiChatInput.focus();
            if (suggestionEngine) suggestionEngine.render();
          } catch (err) {
            console.warn('Start Chat handler error:', err);
          }
        });
      }

      // Show or hide center guide based on initial chat state
      try {
        if (centerGuideOverlay) {
          centerGuideOverlay.style.display = 'none';
        }
      } catch (e) { /* ignore */ }

      // Initialize modular engines after voiceManager is ready
      aiEngine = new AiEngine({ voiceManager });
      memorySynth = new MemorySynthesizer({ aiEngine });
      podcastEngine = new PodcastEngine({
        voiceManager,
        isMobile,
        pickVoiceProfiles: () => podcastVoiceProfiles,
        onChatLine: (next) => {
          appendPodcastNarrationChatLine(next);
          showPodcastBubbleLine(next);
        },
        onIdle: () => {
          if (publicPodcastAiAutoMode && !publicPodcastAiMovieSwitchPending && !publicPodcastAiStartInFlight && !brainTrainingInFlight && !podcastGuestFloorActive && !voiceManager?.isListening && !voiceManager?.micStarting) {
            logPodcastControlEvent('idle', { reason: 'schedule-continue' });
            schedulePublicPodcastAiContinue(isMobile ? 900 : 450);
          } else {
            logPodcastControlEvent('idle-hold', {
              reason: publicPodcastAiMovieSwitchPending
                ? 'movie-switch'
                : publicPodcastAiStartInFlight
                  ? 'start-in-flight'
                : brainTrainingInFlight
                  ? 'training'
                  : podcastGuestFloorActive
                    ? 'guest-floor'
                    : (voiceManager?.isListening)
                      ? 'mic-live'
                      : 'auto-off'
            });
            updatePublicPodcastAiButtonState();
          }
        }
      });
      
      // Initialize voice profiles
      pickPodcastVoiceProfiles();
      // Browser voices take time to load
      setTimeout(() => pickPodcastVoiceProfiles(), 500);
      setTimeout(() => pickPodcastVoiceProfiles(), 2000);
      if (btnVoiceMic) {
        btnVoiceMic.title = MIC_IDLE_TITLE;
        safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      }
      updateConversationModeUi();
      try {
        if (typeof localStorage !== 'undefined' && !localStorage.getItem(VOICE_HINT_STORAGE_KEY)) {
          appendChatMessage('assistant', '🔇 Voice is off by default · tap the mic to start.');
          localStorage.setItem(VOICE_HINT_STORAGE_KEY, '1');
        }
      } catch {
        // Ignore storage availability/privacy-mode errors.
      }
      if (voiceManager.isLiveExperimentalEnabled?.()) {
        const liveStatus = voiceManager.getLiveExperimentalStatus?.();
        if (!liveStatus?.ready && typeof localStorage !== 'undefined' && !localStorage.getItem('live_voice_scaffold_hint')) {
          appendChatMessage('assistant', '📱 Mobile Live voice is enabled on this phone. If Live fails, the app will show a warning and fall back automatically.');
          localStorage.setItem('live_voice_scaffold_hint', '1');
        }
      }
      setAiModeIndicator(voiceManager.getPreferredMode?.() || 'brain');
      voiceManager.onModeChange = (mode) => setAiModeIndicator(mode);
      voiceManager.onAiEngineChange = (engine) => {
        const badge = document.getElementById('ai-mode-badge');
        const engineEl = badge?.querySelector('.ai-mode-badge-engine');
        if (!badge || !engineEl) return;
        resetAiMemoryBadge();
        const activeMode = voiceManager.getActiveMode?.() === 'brain' ? 'brain' : 'cloud';
        const cloudActive = activeMode === 'cloud';
        const forceGemmaActive = voiceManager?.isForceLocalGemmaEnabled?.() === true;
        const forceDictActive = voiceManager?.isForceDictModeEnabled?.() === true;
        const setCloudBadge = (title, engineLabel = '', { live = false } = {}) => {
          const fallbackLabel = String(engineLabel || '').trim();
          badge.className = `ai-mode-badge cloud${fallbackLabel === 'FALLBACK' ? ' cloud-fallback' : ''}`;
          badge.title = (!live && !fallbackLabel)
            ? getCloudBadgeTitle(title || 'Cloud Mode · Gemini AI')
            : title;
          badge.querySelector('.ai-mode-badge-icon').textContent = '☁️';
          badge.querySelector('.ai-mode-badge-label').textContent = live ? 'LIVE' : 'CLOUD';
          engineEl.textContent = fallbackLabel || (!live ? getCloudDailyBadgeText() : '');
        };
        if (engine === 'checking') {
          if (aiEnginePendingTimer) clearTimeout(aiEnginePendingTimer);
          aiEnginePendingTimer = setTimeout(() => {
            _modeDetailsState.engine = 'checking';
            engineEl.textContent = '···';
            engineEl.classList.remove('warning');
            renderModeDetails();
            syncChatStatusFromMode();
            aiEnginePendingTimer = null;
          }, 1200);
          return;
        }
        if (aiEnginePendingTimer) {
          clearTimeout(aiEnginePendingTimer);
          aiEnginePendingTimer = null;
        }
        if (cloudActive) {
          if (engine === 'dict') {
            _modeDetailsState.engine = 'dict';
            setCloudBadge('Cloud Mode · temporary local fallback active', 'FALLBACK');
            aiModeCloud?.classList.add('fallback');
            aiModeBrain?.classList.remove('fallback');
            aiModeGemma?.classList.remove('fallback');
          } else if (engine === 'ollama' || engine === 'ollama-ready') {
            _modeDetailsState.engine = 'ollama';
            setCloudBadge('Cloud Mode · temporary local Brain fallback active', 'LOCAL');
            aiModeCloud?.classList.add('fallback');
            aiModeBrain?.classList.remove('fallback');
            aiModeGemma?.classList.remove('fallback');
          } else if (engine === 'live') {
            _modeDetailsState.engine = 'live';
            setCloudBadge('Cloud Mode · Gemini Live API (experimental mobile transport)', 'EXP', { live: true });
            aiModeCloud?.classList.remove('fallback');
          } else {
            _modeDetailsState.engine = engine === 'checking' ? 'checking' : 'cloud';
            setCloudBadge('Cloud Mode · Gemini AI');
            aiModeCloud?.classList.remove('fallback');
          }
          renderModeDetails();
          syncChatStatusFromMode();
          return;
        }

        _modeDetailsState.engine = engine === 'ollama-ready' || engine === 'ollama-forced' ? 'ollama' : engine;
          if (engine === 'ollama' || engine === 'ollama-ready' || engine === 'ollama-forced') {
            const localModelName = voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest';
            const localModelFullSpec = getLocalModelFullSpec(localModelName);
            const localBackendMeta = getLocalBackendUiMeta();
          badge.className = forceGemmaActive ? 'ai-mode-badge brain-gemma' : 'ai-mode-badge brain-ollama';
           badge.title = forceGemmaActive
             ? `${getLocalModelDisplayLabel(false)} forced · direct local chat (${localModelFullSpec} via ${localBackendMeta.backendTitle})`
             : `Brain Mode · Local LLM (${localModelFullSpec} via ${localBackendMeta.backendTitle})`;
          badge.querySelector('.ai-mode-badge-icon').textContent = '🧠';
          badge.querySelector('.ai-mode-badge-label').textContent = forceGemmaActive ? getLocalModelDisplayLabel() : 'BRAIN';
          engineEl.textContent = forceGemmaActive ? 'DIRECT' : 'LOCAL';
          engineEl.classList.toggle('warning', localBackendMeta.engineText === 'LOCAL ONLY');
          aiModeBrain?.classList.remove('fallback');
        } else if (engine === 'dict') {
          badge.className = 'ai-mode-badge brain-dict';
          const localBackendMeta = getLocalBackendUiMeta();
          badge.title = forceGemmaActive
            ? `${getLocalModelDisplayLabel(false)} forced · local unavailable, DICT answering until ${getLocalModelDisplayLabel(false)} returns`
            : forceDictActive
              ? 'DICT pinned · grounded movie dictionary replies'
              : `Brain Mode · Dictionary fallback (${localBackendMeta.backendTitle} not running)`;
          badge.querySelector('.ai-mode-badge-icon').textContent = '🧠';
          badge.querySelector('.ai-mode-badge-label').textContent = forceGemmaActive ? getLocalModelDisplayLabel() : forceDictActive ? 'DICT' : 'BRAIN';
          engineEl.textContent = forceDictActive ? 'PINNED' : 'DICT';
          engineEl.classList.remove('warning');
          // Brief 1-second flash on the pill to alert · no persistent amber state
          if (!forceDictActive && aiModeBrain) {
            aiModeBrain.classList.remove('fallback');
            aiModeBrain.classList.remove('mode-flash-brain');
            void aiModeBrain.offsetWidth; // reflow to restart
            aiModeBrain.classList.add('mode-flash-brain');
            setTimeout(() => aiModeBrain.classList.remove('mode-flash-brain'), 950);
          }
        } else if (engine === 'cloud') {
          setCloudBadge('Cloud Mode · Gemini AI');
          engineEl.classList.remove('warning');
          aiModeBrain?.classList.remove('fallback');
        } else if (engine === 'live') {
          setCloudBadge('Cloud Mode · Gemini Live API (experimental mobile transport)', 'EXP', { live: true });
          engineEl.classList.remove('warning');
          aiModeBrain?.classList.remove('fallback');
        }
        renderModeDetails();
        syncChatStatusFromMode();
        updateGemmaModeAvailability();
      };

      voiceManager.onMemoryUsed = ({ count, total }) => {
        _modeDetailsState.memoryCount = Math.max(0, Number(count || 0));
        _modeDetailsState.memoryTotal = Math.max(0, Number(total || 0));
        resetAiMemoryBadge();
        renderModeDetails();
      };

      // AI Log panel
      voiceManager.onAiLog = (entry) => {
        if (entry?.engine === 'cloud' && !entry?.training) {
          cloudVoiceBusyCount = 0;
          cloudVoiceBusyAt = 0;
          refreshUsageSummary().catch(() => { });
        }
        // Only count model usage for delivered responses (audio: true) or non-diagnostic entries
        // (audio: undefined covers training, brain-checks, etc.). Skip audio: false which marks
        // diagnostic failure logs (e.g. cloud tried-and-failed paths in tryCloudQuestion).
        // Exception: cloud-quota engine is always counted so quota exhaustion is visible in the dashboard.
        if (entry?.audio !== false || entry?.engine === 'cloud-quota') {
          recordDashboardModelUsage(entry);
        }
        appendAiLog(entry);
      };
      const setAiLogPanelOpen = (open) => {
        if (!aiLogPanel) return;
        aiLogPanel.classList.toggle('hidden', !open);
      };
      const toggleAiLogPanel = () => {
        if (!aiLogPanel) return;
        setAiLogPanelOpen(aiLogPanel.classList.contains('hidden'));
      };
      document.getElementById('ai-mode-badge')?.addEventListener('click', () => {
        toggleAiLogPanel();
      });
      aiModeChevron?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!aiModeDetails) return;
        const willOpen = aiModeDetails.classList.contains('hidden');
        aiModeDetails.classList.toggle('hidden', !willOpen);
        aiModeChevron.classList.toggle('open', willOpen);
      });
      document.addEventListener('click', (event) => {
        const wrap = document.querySelector('.ai-mode-badge-wrap');
        if (!wrap || !aiModeDetails || aiModeDetails.classList.contains('hidden')) return;
        if (!wrap.contains(event.target)) {
          aiModeDetails.classList.add('hidden');
          aiModeChevron?.classList.remove('open');
        }
      });
      document.getElementById('btn-ai-log-close')?.addEventListener('click', () => {
        setAiLogPanelOpen(false);
      });
      document.getElementById('btn-ai-log-copy')?.addEventListener('click', async () => {
        const copyBtn = document.getElementById('btn-ai-log-copy');
        const logText = getAiLogTextForCopy();
        if (!logText) {
          if (copyBtn) copyBtn.textContent = 'EMPTY';
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = 'COPY';
          }, 900);
          return;
        }
        const copied = await copyToClipboard(logText);
        if (copyBtn) copyBtn.textContent = copied ? 'COPIED' : 'FAILED';
        setTimeout(() => {
          if (copyBtn) copyBtn.textContent = 'COPY';
        }, 1100);
      });
      document.getElementById('btn-ai-log-clear')?.addEventListener('click', () => {
        const entries = document.getElementById('ai-log-entries');
        if (entries) entries.innerHTML = '<div class="ai-log-empty">Log cleared.</div>';
        const count = document.getElementById('ai-log-count');
        if (count) count.textContent = '0 entries';
        _aiLogEntryCount = 0;
        _aiLogHistory.length = 0;
      });

      localBackendOllama?.addEventListener('click', async (event) => {
        event.stopPropagation();
        setLocalLlmBackend('ollama');
        appendChatMessage('assistant', 'Local backend switched to Ollama.', { log: false });
        await refreshLocalBackendUi({ probe: true });
      });

      refreshLocalBackendUi({ probe: true }).catch(() => { });

      refreshUsageSummary().catch(() => { });
      document.getElementById('btn-ai-log-legend')?.addEventListener('click', () => {
        const legend = document.getElementById('ai-log-legend');
        const btn = document.getElementById('btn-ai-log-legend');
        if (!legend) return;
        const isOpen = !legend.classList.contains('hidden');
        legend.classList.toggle('hidden', isOpen);
        if (btn) btn.style.background = isOpen ? '' : 'rgba(165,180,252,0.2)';
      });

      if (isMuseCardLaunch) {
        if (museLaunchMode === 'cloud' || museLaunchMode === 'brain') {
          switchToAiMode(museLaunchMode);
        }
        appendChatMessage('assistant', '🔮 Muse Card activated from QR. Tap the mic to start speaking.');
      }

      // Setup Voice Events
      voiceManager.onListenStart = () => {
        lastPodcastGuestMicHandledAt = 0;
        isVoiceSessionActive = true;
        disableAntiGravityForMic();
        if (btnVoiceMic) {
          btnVoiceMic.classList.add('listening');
          const label = btnVoiceMic.querySelector('.btn-label');
          if (label) label.textContent = 'Listening...';
        }
        setAiSpeechStateChip('Mic live', true);
        setInlineActivity('listening');
      };

      voiceManager.onListenEnd = (meta = {}) => {
        clearPodcastGuestMicAutoStopTimer();
        if (meta.error) {
          const isSdRateLimitFallback = meta.error === 'transcription-rate-limit'
            && meta.fallbackAvailable
            && /synthetic_desires_[1-7]/i.test(voiceManager?.currentMovie || '');
          const shouldKeepGuestFloor = meta.error === 'transcription-rate-limit' && meta.fallbackAvailable;

          if (!isSdRateLimitFallback) {
            btnVoiceMic.classList.remove('listening');
            isVoiceSessionActive = false;
            const label = btnVoiceMic.querySelector('.btn-label');
            if (label) label.textContent = MIC_IDLE_LABEL;
            setAiSpeechStateChip('Mic idle');
            setInlineActivity('');
            restoreVideoVolume();
          }

          if (meta.error === 'brave-blocked') {
            showAiSpeech('🦁 Brave is blocking voice chat. Enable Google Speech Services in Brave settings.', false);
            appendChatMessage('assistant', '🦁 Brave Browser Detected · Voice chat requires Google\'s Speech Service, which Brave blocks by default.\n\nTo fix:\n1. Open brave://settings/extensions\n2. Toggle ON "Use Google Services for push messaging"\n3. OR: Click the Brave Shields icon (🦁) in the address bar → set Shields to DOWN for this site\n4. Refresh this page and try again.\n\nAlternatively, open this site in Chrome or Edge.');
          } else if (meta.error === 'silence-timeout') {
            showAiSpeech('No speech detected · mic stopped automatically. Tap the mic to try again.', false);
            appendChatMessage('assistant', 'Mic timed out (no speech detected). Tap the mic and speak clearly.');
          } else if (meta.error === 'service-unavailable') {
            showAiSpeech('Speech service not responding. Tap the mic to retry.', false);
            appendChatMessage('assistant', 'Speech recognition is not responding. Try reloading the page or tapping the mic again.');
          } else if (meta.error === 'transcribe-unavailable') {
            voiceManager.speak('Sorry·?', { speaker: 'system', force: true });
          } else if (meta.error === 'transcription-rate-limit') {
            const isSd = /synthetic_desires_[1-7]/i.test(voiceManager?.currentMovie || '');
            const now = Date.now();
            if (!cloudVoiceBusyAt || (now - cloudVoiceBusyAt) > CLOUD_VOICE_BUSY_WINDOW_MS) {
              cloudVoiceBusyCount = 0;
            }
            cloudVoiceBusyAt = now;
            cloudVoiceBusyCount += 1;

            const restartVoiceFallback = () => {
              if (meta.fallbackAvailable) {
                isVoiceSessionActive = true;
                btnVoiceMic.classList.add('listening');
                const label = btnVoiceMic.querySelector('.btn-label');
                if (label) label.textContent = 'Listening...';
                setInlineActivity('listening');
                Promise.resolve().then(async () => {
                  try {
                    const started = await voiceManager.toggleListening();
                    if (!started) {
                      btnVoiceMic.classList.remove('listening');
                      isVoiceSessionActive = false;
                      const idleLabel = btnVoiceMic.querySelector('.btn-label');
                      if (idleLabel) idleLabel.textContent = MIC_IDLE_LABEL;
                      setInlineActivity('');
                      restoreVideoVolume();
                    }
                  } catch (_) {
                    btnVoiceMic.classList.remove('listening');
                    isVoiceSessionActive = false;
                    const idleLabel = btnVoiceMic.querySelector('.btn-label');
                    if (idleLabel) idleLabel.textContent = MIC_IDLE_LABEL;
                    setInlineActivity('');
                    restoreVideoVolume();
                  }
                });
              }
            };

            if (isSd && cloudVoiceBusyCount >= CLOUD_VOICE_BUSY_SWITCH_THRESHOLD) {
              restartVoiceFallback();
              setChatEnabled(true, '☁️ Cloud mode active · tap Brain to switch manually');
              showAiSpeech('☁️ Cloud busy · tap Brain to switch manually', false);
              appendChatMessage('assistant', '☁️ Cloud busy. Brain stays manual only.');
            } else if (meta.fallbackAvailable) {
              restartVoiceFallback();
              showAiSpeech('☁️ Cloud busy', false);
              appendChatMessage('assistant', '☁️ Cloud busy');
            } else {
              showAiSpeech('Voice transcription is busy. Wait a moment and try again.', false);
              appendChatMessage('assistant', 'Voice transcription is temporarily rate-limited. Wait a few seconds, then tap the mic again.');
            }
          } else if (meta.error === 'transcribe-timeout') {
            voiceManager.speak('Sorry·?', { speaker: 'system', force: true });
          } else if (meta.error === 'network') {
            showAiSpeech('Mic network error · speech service unreachable.', false);
            appendChatMessage('assistant', 'Network error reaching speech service. Check your connection and try again.');
          } else if (meta.error === 'not-allowed' || meta.error === 'audio-capture') {
            showAiSpeech('Microphone access denied. Check browser permissions.', false);
          } else {
            showAiSpeech(`Mic Error: ${meta.error}`, false);
          }
          if (!shouldKeepGuestFloor) {
            releasePodcastGuestFloor({ resume: true, delayMs: 120 });
          }
          return;
        }

        if (meta.keepListening) {
          // Recognition cycle ended; auto-restart is pending.
          isVoiceSessionActive = true;
          btnVoiceMic.classList.add('listening');
          const label = btnVoiceMic.querySelector('.btn-label');
          if (label) label.textContent = 'Listening...';
          setAiSpeechStateChip('Mic live', true);
          setInlineActivity('listening');
          return;
        }

        if (meta.hadSpeech) {
          if ((Date.now() - Number(lastPodcastGuestMicHandledAt || 0)) < 4000) {
            btnVoiceMic.classList.remove('listening');
            isVoiceSessionActive = false;
            const label = btnVoiceMic.querySelector('.btn-label');
            if (label) label.textContent = MIC_IDLE_LABEL;
            setAiSpeechStateChip('Mic idle');
            setInlineActivity('');
            restoreVideoVolume();
            return;
          }
          // Keep session active while AI prepares/speaks response.
          isVoiceSessionActive = true;
          btnVoiceMic.classList.add('listening');
          const label = btnVoiceMic.querySelector('.btn-label');
          if (label) label.textContent = 'AI Thinking...';
          setAiSpeechStateChip('Thinking', true);
          setInlineActivity('thinking');
          showBubbleThinking();
          return;
        }

        // No speech captured and mic not held -> clean idle state.
        btnVoiceMic.classList.remove('listening');
        isVoiceSessionActive = false;
        const label = btnVoiceMic.querySelector('.btn-label');
        if (label) label.textContent = MIC_IDLE_LABEL;
        setAiSpeechStateChip('Mic idle');
        setInlineActivity('');
        restoreVideoVolume();
        releasePodcastGuestFloor({ resume: true, delayMs: 120 });
      };

      voiceManager.onLiveTurn = async ({ input }) => {
        const text = String(input || '').trim();
        if (!text) return;

        const generalCommand = parseGeneralVoiceCommand(text);
        if (generalCommand) {
          const ok = await executeGeneralVoiceCommand(generalCommand);
          if (!ok) {
            console.warn('[Voice controls] command failed:', generalCommand.action, text);
          }
          return;
        }

        const playlistCommand = parsePlaylistVoiceCommand(text);
        if (playlistCommand) {
          let outcome = null;

          if (playlistCommand.action === 'play-index') {
            outcome = await playPlaylistIndex(playlistCommand.index);
          } else if (playlistCommand.action === 'next') {
            const nextIndex = Math.min(currentPlaylistIndex + 1, playlistFiles.length - 1);
            outcome = await playPlaylistIndex(nextIndex);
          } else if (playlistCommand.action === 'previous') {
            const prevIndex = Math.max(currentPlaylistIndex - 1, 0);
            outcome = await playPlaylistIndex(prevIndex);
          }

          if (!outcome?.ok && outcome?.reason) {
            console.warn('[Voice playlist] command failed:', outcome.reason);
          }
          return;
        }

        lastBubbleQuestionText = text;
        lastBubbleQuestionAt = Date.now();
        showAiSpeech(`"${text}"`, false);
        if (isVideoMode) {
          appendChatMessage('user', text);
        }
      };

      voiceManager.onTextRecognized = async (text, recognitionMeta = {}) => {
        const generalCommand = parseGeneralVoiceCommand(text);
        if (generalCommand) {
          const ok = await executeGeneralVoiceCommand(generalCommand);
          if (!ok) {
            console.warn('[Voice controls] command failed:', generalCommand.action, text);
          }
          return;
        }

        const playlistCommand = parsePlaylistVoiceCommand(text);
        if (playlistCommand) {
          let outcome = null;

          if (playlistCommand.action === 'play-index') {
            outcome = await playPlaylistIndex(playlistCommand.index);
          } else if (playlistCommand.action === 'next') {
            const nextIndex = Math.min(currentPlaylistIndex + 1, playlistFiles.length - 1);
            outcome = await playPlaylistIndex(nextIndex);
          } else if (playlistCommand.action === 'previous') {
            const prevIndex = Math.max(currentPlaylistIndex - 1, 0);
            outcome = await playPlaylistIndex(prevIndex);
          }

          // Run playlist command silently (no spoken/chat confirmation).
          if (!outcome?.ok && outcome?.reason) {
            console.warn('[Voice playlist] command failed:', outcome.reason);
          }
          return;
        }

        lastBubbleQuestionText = text;
        lastBubbleQuestionAt = Date.now();
        showAiSpeech(`"${text}"`, false);
        if (isVideoMode) {
          appendChatMessage('user', text);
        }
        if (isPodcastGuestParticipationEnabled()) {
          setInlineActivity('thinking');
          try {
            const handled = await handlePodcastGuestPrompt(text, { source: 'mic', skipUserEcho: isVideoMode, recognitionMeta });
            if (handled) return;
          } finally {
            setInlineActivity('');
          }
        }
        if (await maybeHandleGroundedFreeChatReply(text, { source: 'mic' })) {
          return;
        }
        // Trigger Gemini response for voice mic input
        setInlineActivity('thinking');
        try {
          if (!brainTrainingInFlight) beginFreeChatSeedCapture(text, 'mic');
          await voiceManager.respondTo(text);
        } finally {
          pendingFreeChatSeedCapture = null;
          setInlineActivity('');
        }
      };

      voiceManager.onSpeakStart = (options) => {
        const isPodcastSpeech = options?.context === 'podcast';
        const shouldReflectSpeechOnMic = Boolean(
          voiceManager?.isListening
          || voiceManager?.keepListening
          || (btnVoiceMic.classList.contains('listening') && (!isPodcastGuestParticipationEnabled() || podcastGuestMicWindowActive))
        );
        isVoiceSessionActive = shouldReflectSpeechOnMic;
        disableAntiGravityForMic();
        aiVoicePanel.classList.remove('hidden');
        const label = btnVoiceMic.querySelector('.btn-label');
        if (shouldReflectSpeechOnMic) {
          btnVoiceMic.classList.add('listening');
          if (label) label.textContent = 'AI Speaking...';
        }
        setAiSpeechStateChip(isPodcastSpeech ? 'Stage live' : 'AI reply', true);
        // Switch bubble from thinking ? live word-reveal
        _activeSpeechFullText = String(aiText?.textContent || '').trim();
        _activeSpeechPrefix = '';
        _activeSpeechLiveReveal = !isPodcastSpeech;
        const answerMarker = '\nA: ';
        const answerMarkerIndex = _activeSpeechFullText.indexOf(answerMarker);
        if (answerMarkerIndex >= 0) {
          _activeSpeechPrefix = _activeSpeechFullText.slice(0, answerMarkerIndex + answerMarker.length);
        }
        if (_activeSpeechFullText && _activeSpeechLiveReveal) {
          safeSetText(aiText, _activeSpeechPrefix);
        }
        aiSpeechBubble?.classList.remove('thinking');
        aiSpeechBubble?.classList.add('speaking');
        if (aiWave) aiWave.style.display = 'flex';
        // Start breathing visualizer
        visualizer.setThinking(options?.speaker || 'hostA');

        // Highlight latest bot message in chat (mobile: no voice panel)
        if (aiChatMessages) {
          const msgs = aiChatMessages.querySelectorAll('.chat-msg.assistant');
          if (msgs.length) msgs[msgs.length - 1].classList.add('speaking');
        }
        // Keep movie audio more intact on mobile; only apply light ducking while AI speaks.
        duckVideoVolume(isMobile ? 0.65 : 0.35);
        updatePublicPodcastAiButtonState();
      };

      // AI response callback · fires when Gemini returns text or a structured payload
      voiceManager.onAiResponse = (responsePayload) => {
        const { text, attachment } = normalizeChatMessagePayload(responsePayload);
        if (!text) return;
        if (pendingFreeChatSeedCapture) {
          // Skip seed capture for system notices (training busy, errors) · only capture real AI replies
          const isSystemNotice = /^[☁⚡📖🧠]/u.test(text);
          if (!isSystemNotice) {
            rememberFreeChatPodcastSeed(pendingFreeChatSeedCapture.input, text, {
              movie: pendingFreeChatSeedCapture.movie,
              source: pendingFreeChatSeedCapture.source,
              reason: 'free-chat-live',
              engine: voiceManager?.getPreferredMode?.() || _modeDetailsState.engine || 'dict'
            });
          }
          pendingFreeChatSeedCapture = null;
        }
        setInlineActivity('');
        triggerAiReplyGlitch();
        // Show text in bubble; onSpeakStart will clear it for live word-reveal when TTS plays
        showAiSpeech(text, true);
        if (isVideoMode) {
          appendChatMessage('assistant', attachment ? { text, attachment } : text);
        }
        // Refresh suggestion pills based on the AI's response text
        if (typeof suggestionEngine !== 'undefined' && suggestionEngine) {
          const _fcBrain = voiceManager?.currentMovieBrain || null;
          suggestionEngine.refreshFromContext(text, _fcBrain);
        }
        // Rainbow glitch pulse on the 3D plane
        if (scene3d) scene3d.triggerRainbowGlitch();
      };

      voiceManager.onSpeakWord = (fullText, charIndex, charLength) => {
        if (!aiText) return;
        if (!_activeSpeechLiveReveal) return;
        safeSetText(aiText, `${_activeSpeechPrefix}${fullText.slice(0, charIndex + (charLength || 1))}`);
      };

      voiceManager.onSpeakEnd = (speechOptions = {}, speakMeta = {}) => {
        const isPodcastSpeech = speechOptions?.context === 'podcast';
        const canDrainPodcastAfterSpeech = Boolean(
          selectedConversationSurfaceMode === 'podcast'
          || publicPodcastAiAutoMode
          || brainTrainingInFlight
          || hasPublicPodcastAiConversationWork()
        );
        const label = btnVoiceMic.querySelector('.btn-label');
        isVoiceSessionActive = false;
        if (!voiceManager?.isListening && !voiceManager?.keepListening) {
          btnVoiceMic.classList.remove('listening');
          if (label) label.textContent = MIC_IDLE_LABEL;
          setAiSpeechStateChip('Mic idle');
        }
        // Restore full text if onboundary didn't reach the end (some voices skip it)
        if (_activeSpeechFullText && aiText) {
          safeSetText(aiText, _activeSpeechFullText);
        }
        _activeSpeechFullText = '';
        _activeSpeechPrefix = '';
        _activeSpeechLiveReveal = true;
        aiSpeechBubble?.classList.remove('speaking', 'thinking');
        // Stop breathing visualizer
        visualizer.stop();

        // Let PodcastEngine own podcast-to-podcast chaining; a second global drain can
        // interrupt the next host line and make speakers overlap.
        if (podcastEngine && !isPodcastSpeech && canDrainPodcastAfterSpeech) podcastEngine.drain();

        // Remove speaking highlight
        if (aiChatMessages) {
          aiChatMessages.querySelectorAll('.chat-msg.speaking')
            .forEach(el => el.classList.remove('speaking'));
        }
        // Restore movie volume
        restoreVideoVolume();
        // hide panel after delay
        setTimeout(() => {
          aiVoicePanel.classList.add('hidden');
        }, 3000);

        if (isPodcastSpeech && speechOptions?.speaker === 'hostA' && pendingPodcastStartReplyLines.length) {
          // If another Host A question is still queued (e.g. movie-switch handoff spoke first),
          // keep the deferred Muse answer pending so it plays after its own question, not before.
          const queueHasPendingHostQuestion = (podcastEngine?.queue || []).some((entry) => entry?.speaker === 'hostA');
          if (!queueHasPendingHostQuestion) {
            const deferredStartReplyLines = pendingPodcastStartReplyLines.slice();
            pendingPodcastStartReplyLines = [];
            injectPodcastNarration(deferredStartReplyLines, { cancelActive: false, prioritize: true, force: true });
          }
        }

        if (!isPodcastSpeech && podcastGuestPendingResumeDelayMs > 0) {
          // Speech already finished · just a short breath pause before Host A returns
          finalizePodcastGuestReplyResume(isMobile ? 900 : 600);
        }

        const shouldContinuePodcastNarration = !isPodcastSpeech
          && canDrainPodcastAfterSpeech
          && (podcastEngine.isSpeaking || podcastEngine.queue.length > 0);
        if (!isPodcastSpeech) {
          podcastEngine.isSpeaking = false;
        }
        if (shouldContinuePodcastNarration) {
          // Natural pause between hosts · gives the impression of a real conversation breath.
          // Longer on mobile to let Android TTS engine settle between utterances.
          const drainDelay = isMobile ? 900 : 400;
          setTimeout(() => drainPodcastNarrationQueue(true), drainDelay);
        }
        updatePublicPodcastAiButtonState();
      };


      window.addEventListener('pagehide', () => {
        stopWebcamStream();
      });

      window.addEventListener('beforeunload', () => {
        stopWebcamStream();
      });

      document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
          // Don't stop webcam stream when page is hidden · just pause
          if (webcamVideo && !isWebcamPaused) {
            webcamVideo.pause();
          }
          return;
        }

        // Resume webcam if it was active before
        if (webcamStream && !isWebcamPaused) {
          try {
            await webcamVideo.play();
          } catch (err) {
            console.warn('Webcam resume failed:', err);
          }
        }
      });

      updateLoading('Ready.', 100);
      renderPlaylist();
      setChatEnabled(false, 'Load and analyze a movie to enable chat');
      updateAntiGravityGestureButton();

      // Force Anti-Gravity OFF (Request 775)
      if (scene3d) {
        scene3d.setAntiGravity(false);
        isAntiGravity = false;
        updateAntiGravityUI(false);
      }
      if (loaderStatus) loaderStatus.textContent = 'Ready.';

      let appStarted = false;
      const startApp = () => {
        if (appStarted) return;
        appStarted = true;

        // Remove listeners so it only happens once
        document.removeEventListener('click', startApp);
        document.removeEventListener('keydown', startApp);

        hideLoading();

        startRenderLoop();

        // Play first movie after loop starts
        if (playlistFiles.length > 0) {
          playMovie(playlistFiles[0], { primeAudioDuringGesture: true })
            .then(() => {
              console.log('Autoplay started.');
            })
            .catch((err) => {
              console.warn('Autoplay failed:', err);
            });
        }
      };

      requestAnimationFrame(() => startApp());

    } catch (err) {
      console.error('[init] Fatal error during initialization:', err);
      const ls = document.getElementById('loader-status');
      if (ls) {
        ls.innerHTML = '';
        const errP = document.createElement('p');
        errP.style.color = '#ff5555';
        errP.style.fontSize = '1.1rem';
        errP.textContent = err.message || 'Unknown initialization error';
        ls.appendChild(errP);

        const hintP = document.createElement('p');
        hintP.style.color = '#aaa';
        hintP.style.fontSize = '0.85rem';
        hintP.style.marginTop = '10px';
        hintP.textContent = 'Try refreshing the page or using Chrome/Edge with hardware acceleration enabled.';
        ls.appendChild(hintP);

        // Offer retry button
        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'Retry';
        retryBtn.style.marginTop = '15px';
        retryBtn.style.padding = '10px 25px';
        retryBtn.style.fontSize = '1rem';
        retryBtn.style.cursor = 'pointer';
        retryBtn.style.background = '#7c5cff';
        retryBtn.style.color = '#fff';
        retryBtn.style.border = 'none';
        retryBtn.style.borderRadius = '25px';
        retryBtn.addEventListener('click', () => location.reload());
        ls.appendChild(retryBtn);
      }
    }
  }

  // ─── RENDER LOOP ───
  function startRenderLoop() {
    function loop() {
      requestAnimationFrame(loop);

      // FPS calculation
      fpsFrames++;
      const now = performance.now();
      if (now - fpsTime >= 1000) {
        currentFps = fpsFrames;
        fpsFrames = 0;
        fpsTime = now;
        if (pillFps) {
          const label = pillFps.querySelector('span:last-child');
          if (label) label.textContent = `${currentFps} FPS`;
        }
      }

      // Detect hands
      let handData = null;
      let twoHandData = null;

      // Always draw webcam feed (regardless of MediaPipe tracking state)
      if (webcamOverlay) {
        if (showShapes) {
          const previewResults = (handTracker && handTracker.isTracking)
            ? handTracker.results
            : null;
          webcamOverlay.draw(previewResults);
        } else {
          webcamOverlay.clear();
        }
      }

      if (handTracker && handTracker.isTracking) {
        const results = handTracker.detect();

        // Get processed hand data
        const hands = handTracker.getHandData();

        if (hands && hands.length > 0) {
          handData = hands[0];
          let currentGesture = handData.gesture; // Use the detected gesture
          if (voiceManager) voiceManager.currentGesture = currentGesture || 'neutral';

          // ── SYSTEM LOCK LOGIC ──
          let processGestures = !isSystemLocked;

          if (isSystemLocked) {
            // Only detect Victory to unlock
            if (currentGesture === 'victory') {
              if (unlockTimer === 0) unlockTimer = now;

              if (now - unlockTimer > UNLOCK_DURATION) {
                isSystemLocked = false;
                processGestures = true;
                voiceManager?.speak("System Unlocked.");
                showAiSpeech("System Unlocked", false);
                unlockTimer = 0;
              } else {
                const progress = Math.min((now - unlockTimer) / UNLOCK_DURATION, 1.0);
                safeSetText(gestureSub, `Unlocking ${Math.round(progress * 100)}%`);
              }
            } else {
              unlockTimer = 0;
              // Update HUD for locked state
              const display = gestureDisplay['locked'];
              safeSetText(gestureIcon, display.icon);
              safeSetText(gestureName, display.name);

              const detectedName = gestureDisplay[currentGesture]?.name || currentGesture;
              safeSetText(gestureSub, `Show ✌️ to Unlock (Seeing: ${detectedName})`);
            }
          }

          if (processGestures) {
            pillTracking.classList.add('active');

            // Detect Two Hands
            if (hands.length >= 2) {
              twoHandData = handTracker.getTwoHandData(hands);
            }

            // ── Update HUD (Unlocked) ──
            if (twoHandData && twoHandData.twoHandGesture !== 'dualIdle') {
              const display = twoHandDisplay[twoHandData.twoHandGesture] || twoHandDisplay.dualIdle;
              safeSetText(gestureIcon, display.icon);
              safeSetText(gestureName, display.name);
              safeSetText(gestureSub, display.sub);
            } else if (twoHandData) {
              safeSetText(gestureIcon, '🤲');
              safeSetText(gestureName, 'Two Hands Detected');
              safeSetText(gestureSub, 'Ready for dual gestures');
            } else {
              const display = gestureDisplay[handData.gesture] || gestureDisplay.none;
              safeSetText(gestureIcon, display.icon);
              safeSetText(gestureName, display.name);
              safeSetText(gestureSub, isVideoMode
                ? (videoGestureSubs[handData.gesture] || display.sub)
                : display.sub);
            }
          } else {
            // If not processing gestures, ensure pill is inactive and rings hidden
            pillTracking.classList.remove('active');
            if (scene3d) {
              scene3d.updateHand(null);
              if (scene3d.handRing) scene3d.handRing.visible = false;
            }
          }

          // ── Mic Toggle (Thumbs Up) ──
          if (processGestures && voiceManager && handData.gesture === 'thumbsUp') {
            if (!window.lastMicToggle) window.lastMicToggle = 0;
            if (now - window.lastMicToggle > 2000) {
              window.lastMicToggle = now;
              const wasListening = voiceManager.isListening || voiceManager.keepListening;

              // Fire and forget async toggle
              voiceManager.toggleListening().then(toggled => {
                if (toggled) {
                  showAiSpeech(!wasListening ? "Listening..." : "Mic Off", false);
                } else {
                  showAiSpeech('Mic unavailable in this browser/permission context.', false);
                }
              });

              // Also trigger "System Active" sound if needed
            }
          }

          // ── Vocal Dictionary Trigger ──
          if (voiceManager && now - lastVocalTrigger > VOCAL_COOLDOWN) {
            let triggerGesture = null;

            if (twoHandData && twoHandData.twoHandGesture === 'fold') {
              triggerGesture = 'heart';
            } else if (handData.gesture === 'point') {
              triggerGesture = 'point';
              } else if (handData.gesture === 'pinch') {
                // open + fist disabled · too noisy during normal interaction
              // triggerGesture = 'pinch'; // Maybe too common? Let's leave it enabled.
            }

            if (triggerGesture) {
              const spoken = voiceManager.triggerPhrase(triggerGesture);
              if (spoken) {
                lastVocalTrigger = now;
                // Visual feedback (ripple) handled by onSpeakStart
              }
            }
          }

          const micActive = !!voiceManager?.isListening;
          // Block AG during the full voice session (listen + AI speaking)
          const voiceBlocking = micActive || isVoiceSessionActive;

          if (voiceBlocking) {
            disableAntiGravityForMic();
          }

        } else {
          pillTracking.classList.remove('active');
          const state = isSystemLocked ? 'locked' : 'idle';
          const display = gestureDisplay[state];
          safeSetText(gestureIcon, display.icon);
          safeSetText(gestureName, display.name);
          safeSetText(gestureSub, display.sub);
        }
      }


      // Continue loop logic...

      // Update 3D scene · suppress hand in 3D when finger is in pill zone (AG mode)
      let handDataForScene = handData;
      if (handData && document.body.classList.contains('antigravity-mode')) {
        const fx = (1 - handData.indexTip.x) * window.innerWidth;
        const fy = handData.indexTip.y * window.innerHeight;
        const pillRowEl = document.getElementById('ai-suggestions-row');
        if (pillRowEl && !pillRowEl.classList.contains('hidden')) {
          const rr = pillRowEl.getBoundingClientRect();
          if (fx >= rr.left - 60 && fx <= rr.right + 60 && fy >= rr.top - 60 && fy <= rr.bottom + 60) handDataForScene = null;
        }
      }
      scene3d.updateHand(handDataForScene);
      scene3d.updateTwoHands(twoHandData);
      scene3d.update();

      // Update video seek bar
      if (isVideoMode && !isSeeking) {
        const vm = scene3d.getVideoMesh();
        if (vm && videoSeek) {
          const progress = vm.getProgress();
          videoSeek.value = Math.round(progress * 1000);
          if (typeof updateSeekTrack === 'function') updateSeekTrack();

          if (vm.videoElement) {
            const current = vm.videoElement.currentTime;
            const total = vm.videoElement.duration;
            const formatShortTime = (sec) => {
              if (!isFinite(sec)) return '00:00';
              const m = Math.floor(sec / 60);
              const s = Math.floor(sec % 60);
              return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            };
            if (videoTime) videoTime.textContent = formatShortTime(current);
          }
        }
      }

      // 2D cursor · always tracks index finger
      try {
        if (handData && cursorEl) {
          const cx = (1 - handData.indexTip.x) * window.innerWidth;
          const cy = handData.indexTip.y * window.innerHeight;
          cursorEl.style.left = `${cx}px`;
          cursorEl.style.top = `${cy}px`;
          cursorEl.classList.remove('hidden');
          cursorEl.classList.toggle('pinching', handData.isPinching);
        } else if (cursorEl) { cursorEl.classList.add('hidden'); }
        if (typeof isPlaylistOpen !== 'undefined' && isPlaylistOpen && handData) updateVirtualCursor(handData);
      } catch (e) { console.error(e); }
      try { updateGesturePillDrag(handData); } catch (e) { console.error(e); }

    }

    loop();
  }


  // ─── UI HELPERS ───
  function updateAntiGravityUI(on) {
    if (!pillGravity) return;

    if (on) {
      if (pillGravity) {
        const label = pillGravity.querySelector('span:last-child');
        if (label) label.textContent = 'Gravity: REVERSED';
      }
      document.body.classList.add('antigravity-mode');
      // Teleport pills out of overflow:hidden chat panel so position:fixed works
      const row = document.getElementById('ai-suggestions-row');
      const chatPanel = document.getElementById('ai-chat-panel');
      if (row && chatPanel && row.parentElement === chatPanel) {
        chatPanel.dataset.pillsAnchor = 'true';
        document.body.appendChild(row);
      }
    } else {
      if (pillGravity) {
        const label = pillGravity.querySelector('span:last-child');
        if (label) label.textContent = 'Gravity: Normal';
      }
      document.body.classList.remove('antigravity-mode');
      // Return pills to chat panel
      const rowBack = document.getElementById('ai-suggestions-row');
      const chatPanelBack = document.getElementById('ai-chat-panel');
      if (rowBack && chatPanelBack && chatPanelBack.dataset.pillsAnchor && rowBack.parentElement !== chatPanelBack) {
        delete chatPanelBack.dataset.pillsAnchor;
        chatPanelBack.appendChild(rowBack);
      }
    }
  }

  function disableAntiGravityForMic() {
    if (!scene3d) return;
    if (autoAntiGravityActive || isAntiGravity) {
      autoAntiGravityActive = false;
      scene3d.setAntiGravity(false);
      isAntiGravity = false;
      updateAntiGravityUI(false);
    }
  }

  function updateAntiGravityGestureButton() {
    if (btnEnableAgGesture) {
      btnEnableAgGesture.classList.toggle('active', isAntiGravity);
      const label = btnEnableAgGesture.querySelector('.btn-label');
      if (label) {
        label.textContent = `AG: ${isAntiGravity ? 'ON' : 'OFF'}`;
      }
    }
  }

  function formatChatTime(date = new Date()) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  let chatSnapshotModal = null;

  function normalizeChatMessagePayload(payload) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const text = String(payload.text || '').trim();
      const rawAttachment = payload.attachment && typeof payload.attachment === 'object'
        ? payload.attachment
        : null;
      const attachment = rawAttachment?.type === 'scene-snapshot' && rawAttachment?.src
        ? {
            type: 'scene-snapshot',
            src: String(rawAttachment.src),
            alt: String(rawAttachment.alt || 'Scene snapshot'),
            title: String(rawAttachment.title || 'Scene snapshot'),
            timeLabel: String(rawAttachment.timeLabel || '').trim(),
            timeMs: Number.isFinite(Number(rawAttachment.timeMs)) ? Math.max(0, Number(rawAttachment.timeMs)) : null
          }
        : null;
      return { text, attachment };
    }

    return {
      text: String(payload || '').trim(),
      attachment: null
    };
  }

  function ensureChatSnapshotModal() {
    if (chatSnapshotModal) return chatSnapshotModal;

    const overlay = document.createElement('div');
    overlay.className = 'chat-snapshot-modal hidden';
    overlay.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'chat-snapshot-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Scene snapshot preview');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'chat-snapshot-close';
    closeButton.setAttribute('aria-label', 'Close snapshot preview');
    closeButton.textContent = 'Close';

    const image = document.createElement('img');
    image.className = 'chat-snapshot-modal-image';
    image.alt = 'Scene snapshot preview';

    const caption = document.createElement('div');
    caption.className = 'chat-snapshot-modal-caption';

    const closeModal = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      image.removeAttribute('src');
      image.alt = 'Scene snapshot preview';
      document.body.classList.remove('chat-snapshot-open');
    };

    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && chatSnapshotModal && !chatSnapshotModal.classList.contains('hidden')) {
        closeModal();
      }
    });

    dialog.appendChild(closeButton);
    dialog.appendChild(image);
    dialog.appendChild(caption);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.openSnapshot = (attachment = {}) => {
      image.src = attachment.src;
      image.alt = attachment.alt || 'Scene snapshot preview';
      overlay.classList.remove('hidden');
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('chat-snapshot-open');
    };

    chatSnapshotModal = overlay;
    return chatSnapshotModal;
  }

  function createChatSnapshotAttachment(attachment = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-snapshot-button';
    button.setAttribute('aria-label', attachment.title || 'Open scene snapshot');

    const image = document.createElement('img');
    image.className = 'chat-snapshot-thumb';
    image.src = attachment.src;
    image.alt = attachment.alt || 'Scene snapshot';
    image.loading = 'lazy';
    button.appendChild(image);
    button.addEventListener('click', () => {
      ensureChatSnapshotModal().openSnapshot(attachment);
    });
    return button;
  }

  function formatSnapshotTimeLabel(ms = 0) {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function captureCurrentSceneSnapshotAttachment() {
    const videoEl = scene3d?.getVideoMesh?.()?.videoElement || voiceManager?._videoElement || null;
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return null;

    try {
      const MAX_W = 768;
      const scale = Math.min(1, MAX_W / videoEl.videoWidth);
      const width = Math.max(1, Math.round(videoEl.videoWidth * scale));
      const height = Math.max(1, Math.round(videoEl.videoHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoEl, 0, 0, width, height);
      const src = canvas.toDataURL('image/jpeg', 0.82);
      const timeMs = Math.max(0, Math.round(Number(videoEl.currentTime || 0) * 1000));
      const timeLabel = formatSnapshotTimeLabel(timeMs);
      return {
        type: 'scene-snapshot',
        src,
        alt: `Scene snapshot at ${timeLabel}`,
        title: `Scene snapshot at ${timeLabel}`,
        timeLabel,
        timeMs
      };
    } catch (error) {
      console.warn('[Snapshot] Capture failed:', error?.message || error);
      return null;
    }
  }

  function appendSnapshotCaptureMessage(options = {}) {
    const attachment = captureCurrentSceneSnapshotAttachment();
    if (!attachment) {
      appendChatMessage('assistant', 'No image available right now.', { log: options?.log !== false });
      return false;
    }

    appendChatMessage('assistant', {
      text: String(options?.text || 'Image captured.').trim(),
      attachment
    }, {
      log: options?.log !== false
    });
    return true;
  }

  function appendChatMessage(role, text, options = {}) {
    if (!aiChatMessages || !text) return;
    const { log = true } = options;
    const payload = normalizeChatMessagePayload(text);
    const normalizedText = payload.text;
    if (!normalizedText) return;
    const lastMessage = aiChatMessages.lastElementChild;
    const lastText = lastMessage?.querySelector?.('.chat-text')?.textContent?.trim?.() || '';
    if (role === 'assistant' && normalizedText === '? Brain AI' && lastText === normalizedText) {
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
      return;
    }

    const message = document.createElement('div');
    message.className = `chat-msg ${role}`;

    const textEl = document.createElement('div');
    textEl.className = 'chat-text';
    textEl.textContent = normalizedText.replace(/◆/g, '·');

    const timeEl = document.createElement('div');
    timeEl.className = 'chat-time';
    timeEl.textContent = formatChatTime();

    message.appendChild(textEl);
    if (payload.attachment && role === 'assistant') {
      message.appendChild(createChatSnapshotAttachment(payload.attachment));
      message.classList.add('chat-msg-has-media');
    }
    message.appendChild(timeEl);
    aiChatMessages.appendChild(message);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;

    // Sync every chat message to the AI log
    if (log && typeof appendAiLog === 'function') {
      appendAiLog({
        role,
        text: normalizedText,
        time: timeEl.textContent,
        engine: 'chat',
        training: false
      });
    }
  }

  function appendPersonaStatusMessage(text) {
    if (!aiChatMessages || !text) return;
    const hasUserTurns = !!aiChatMessages.querySelector('.chat-msg.user');
    if (hasUserTurns) return;
    appendChatMessage('assistant', text);
  }

  function setChatEnabled(enabled, statusText) {
    if (aiChatInput) aiChatInput.disabled = !enabled;
    if (btnAiChatSend) btnAiChatSend.disabled = !enabled;
    baseChatStatusText = statusText || '';
    renderChatStatus();
  }

  function formatCountdownTooltip(ms = 0) {
    const safeMs = Math.max(0, Number(ms || 0));
    const totalSeconds = Math.ceil(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function buildTrainingStatusTooltip() {
    if (!brainTrainingInFlight || !trainingStatusMeta?.endsAt) return '';
    const remainingMs = Math.max(0, Number(trainingStatusMeta.endsAt || 0) - Date.now());
    const engineLabel = _activeTrainingEngine === 'ollama'
      ? (trainingStatusMeta?.strictGemma ? 'Strict Gemma' : (voiceManager?.getLocalBrainModelName?.() || 'Local model'))
      : _activeTrainingEngine === 'dict'
        ? 'DICT backup'
        : 'Cloud';
    const startedLabel = Number(trainingStatusMeta.startedAt || 0)
      ? new Date(trainingStatusMeta.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
      : '';
    const endsLabel = Number(trainingStatusMeta.endsAt || 0)
      ? new Date(trainingStatusMeta.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
      : '';
    const timeLeftLabel = remainingMs > 0 ? formatCountdownTooltip(remainingMs) : 'finishing·';
    return [
      `Time left: ${timeLeftLabel}`,
      `Engine: ${engineLabel}`,
      startedLabel ? `Started: ${startedLabel}` : '',
      endsLabel ? `Target: ${endsLabel}` : ''
    ].filter(Boolean).join('\n');
  }

  function syncChatStatusTooltip() {
    if (!aiChatStatus) return;
    const tooltip = buildTrainingStatusTooltip();
    aiChatStatus.title = tooltip;
    if (tooltip) {
      aiChatStatus.setAttribute('aria-label', tooltip.replace(/\n+/g, ' · '));
    } else {
      aiChatStatus.removeAttribute('aria-label');
    }
  }

  function clearTrainingStatusTooltip() {
    trainingStatusMeta = null;
    if (chatStatusTooltipTimer) {
      clearInterval(chatStatusTooltipTimer);
      chatStatusTooltipTimer = null;
    }
    syncChatStatusTooltip();
  }

  function beginTrainingStatusTooltip(durationMs = 0, options = {}) {
    const safeDurationMs = Math.max(1000, Number(durationMs || 0));
    trainingStatusMeta = {
      startedAt: Date.now(),
      endsAt: Date.now() + safeDurationMs,
      strictGemma: options?.strictGemma === true
    };
    if (chatStatusTooltipTimer) {
      clearInterval(chatStatusTooltipTimer);
      chatStatusTooltipTimer = null;
    }
    syncChatStatusTooltip();
    chatStatusTooltipTimer = setInterval(() => {
      if (!brainTrainingInFlight || !trainingStatusMeta) {
        clearTrainingStatusTooltip();
        return;
      }
      syncChatStatusTooltip();
    }, 1000);
  }

  function isModeOwnedChatStatus(statusText = '') {
    const normalized = String(statusText || '').trim();
    if (!normalized) return true;
    return /^(☁️\s*cloud|🧠\s*brain|🧠\s*gemma|🧠\s*dict|local fallback mode)/i.test(normalized);
  }

  function getLiveModeStatusText() {
    const preferredMode = voiceManager?.getPreferredMode?.() || 'brain';
    const normalizedEngine = String(_modeDetailsState.engine || '').trim().toLowerCase();
    const modelName = getLocalModelFullSpec(voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest');
    const backendLabel = getLocalBackendUiMeta().backendTitle;

    if (preferredMode === 'cloud') {
      if (normalizedEngine === 'dict') return '☁️ Cloud mode active · DICT fallback answering';
      if (normalizedEngine === 'ollama') return `☁️ Cloud mode active · local fallback via ${modelName} on ${backendLabel}`;
      if (normalizedEngine === 'live') return '☁️ Cloud Live active · experimental transport';
      if (normalizedEngine === 'checking') return '☁️ Checking Cloud route·';
      return '☁️ Cloud mode active · Gemini AI ready';
    }

    if (preferredMode === 'gemma') {
      const _lbl = getLocalModelDisplayLabel(false);
      if (normalizedEngine === 'dict') return `⚡ ${_lbl} pinned · DICT will answer until local wakes up`;
      if (normalizedEngine === 'checking') return `⚡ Checking ${_lbl} for up to 7s·`;
      return `⚡ ${_lbl} pinned · direct local chat via ${modelName} on ${backendLabel} with no timer fallout`;
    }

    if (preferredMode === 'dict') {
      if (normalizedEngine === 'checking') return '📖 Checking DICT route·';
      return '📖 DICT pinned · grounded movie dictionary replies';
    }

    if (normalizedEngine === 'dict') return '🧠 Brain mode active · DICT fallback answering';
    if (normalizedEngine === 'checking') return '🧠 Brain mode active · checking local AI·';
    return `🧠 Brain mode active · responding via ${modelName} on ${backendLabel}`;
  }

  function syncChatStatusFromMode({ force = false } = {}) {
    if (brainTrainingInFlight) return;
    if (aiChatInput?.disabled && !force) return;
    if (!force && !isModeOwnedChatStatus(baseChatStatusText)) return;
    baseChatStatusText = getLiveModeStatusText();
    renderChatStatus();
  }

  // -- AI Log panel ------------------------------------------------------------
  let _aiLogEntryCount = 0;
  const MAX_LOG_ENTRIES = 300;
  const CLOUD_FALLOUT_SECONDS = 10;
  const LOCAL_FALLOUT_SECONDS = 5;
  const BRAIN_CHECK_SECONDS = 5;
  const GEMMA_CHECK_SECONDS = 7;
  const _aiLogHistory = [];
  const _modeDetailsState = {
    preferred: 'brain',
    engine: 'checking',
    level: 'L1',
    rank: '·',
    usage: 'Loading·',
    usageBadge: 'DAY --',
    cloudUsageTotal: null,
    memoryCount: 0,
    memoryTotal: 0
  };

  let _lastCloudUsageData = null;

  function formatCompactNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '0';
    return new Intl.NumberFormat([], { notation: 'compact', maximumFractionDigits: 1 }).format(num);
  }

  function formatCompactMinutes(ms = 0) {
    const minutes = Math.max(1, Math.ceil(Number(ms || 0) / 60000));
    return `${minutes}m`;
  }

  function getCloudDailyBadgeText() {
    const quotaBackoffRemainingMs = Number(voiceManager?.getQuotaBackoffRemainingMs?.() || 0);
    if (quotaBackoffRemainingMs > 0) {
      return `LIMIT ${formatCompactMinutes(quotaBackoffRemainingMs).toUpperCase()}`;
    }
    return _modeDetailsState.usageBadge || 'DAY --';
  }

  function getCloudBadgeTitle(baseTitle = 'Cloud Mode · Gemini AI') {
    const quotaBackoffRemainingMs = Number(voiceManager?.getQuotaBackoffRemainingMs?.() || 0);
    if (quotaBackoffRemainingMs > 0) {
      return `${baseTitle} · quota cooling down for about ${formatCompactMinutes(quotaBackoffRemainingMs)}`;
    }
    if (_modeDetailsState.usage && _modeDetailsState.usage !== 'Unavailable') {
      return `${baseTitle} · ${_modeDetailsState.usage}`;
    }
    return `${baseTitle} · daily usage unavailable`;
  }

  function getPodcastLocalFallbackMode() {
    if (voiceManager?.isForceDictModeEnabled?.() === true) return 'dict';
    if (voiceManager?.isForceLocalGemmaEnabled?.() === true) return 'gemma';
    if (voiceManager?._ollamaAvailable === true) return 'gemma';
    return 'brain';
  }

  function resolvePodcastReplyMode(options = {}) {
    const preferredMode = voiceManager?.getPreferredMode?.() || _modeDetailsState.preferred || 'brain';
    const cloudBlocked = voiceManager?.isCloudQuotaBlocked?.() === true;
    const localFallbackMode = getPodcastLocalFallbackMode();

    if (preferredMode === 'split') return cloudBlocked ? localFallbackMode : 'split';
    if (preferredMode === 'cloud' && cloudBlocked) return localFallbackMode;
    if (preferredMode === 'cloud' && voiceManager?._ollamaAvailable === true) return 'split';
    if (preferredMode === 'cloud') return 'cloud';
    if (preferredMode === 'gemma') return 'gemma';
    if (preferredMode === 'dict') return 'dict';
    return 'brain';
  }

  function getPodcastReplyMode(options = {}) {
    if (publicPodcastAiReplyMode) return publicPodcastAiReplyMode;
    return resolvePodcastReplyMode(options);
  }

  function syncCloudBadgeUsage() {
    if (_modeDetailsState.preferred !== 'cloud' || _modeDetailsState.engine !== 'cloud') return;
    if (!aiModeBadge) return;
    const engineEl = aiModeBadge.querySelector('.ai-mode-badge-engine');
    if (!engineEl) return;
    aiModeBadge.title = getCloudBadgeTitle('Cloud Mode · Gemini AI');
    engineEl.textContent = getCloudDailyBadgeText();
  }

  async function refreshUsageSummary() {
    let nextUsage = 'Unavailable';
    let nextUsageBadge = 'DAY --';
    let nextCloudUsageTotal = null;
    try {
      const resp = await fetch('/api/usage', { cache: 'no-store' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ready) {
        nextUsage = 'Unavailable';
      } else {
        const today = data?.today || {};
        _lastCloudUsageData = data;
        nextCloudUsageTotal = Number(today.requests);
        const requestsText = formatCompactNumber(today.requests);
        const tokensText = formatCompactNumber(today.totalTokens);
        nextUsage = `${requestsText} req · ${tokensText} tok today`;
        nextUsageBadge = `${requestsText}R / ${tokensText}`;
      }
    } catch {
      nextUsage = 'Unavailable';
    }

    const quotaBackoffRemainingMs = Number(voiceManager?.getQuotaBackoffRemainingMs?.() || 0);
    if (quotaBackoffRemainingMs > 0) {
      nextUsage = nextUsage === 'Unavailable'
        ? `Quota cooling down · retry in about ${formatCompactMinutes(quotaBackoffRemainingMs)}`
        : `${nextUsage} · quota cooling down ${formatCompactMinutes(quotaBackoffRemainingMs)}`;
      nextUsageBadge = `LIMIT ${formatCompactMinutes(quotaBackoffRemainingMs).toUpperCase()}`;
    }

    _modeDetailsState.usage = nextUsage;
    _modeDetailsState.usageBadge = nextUsageBadge;
    _modeDetailsState.cloudUsageTotal = Number.isFinite(nextCloudUsageTotal) ? nextCloudUsageTotal : null;
    renderModeDetails();
    syncCloudBadgeUsage();
  }

  function getEffectiveLocalModelName() {
    const pinnedModel = voiceManager?.getLocalBrainModelName?.();
    const statusModel = getLocalLlmStatus().model || '';
    return String(pinnedModel || statusModel || '').trim();
  }

  function getLocalModelUiMeta(modelName = getEffectiveLocalModelName()) {
    const normalized = String(modelName || '').trim();
    if (!normalized) {
      return {
        key: 'gemma3',
        shortLabel: 'Gemma 3',
        shortUpper: 'GEMMA 3',
        fullSpec: 'Gemma3:4b'
      };
    }
    if (/^phi4(?::|$)/i.test(normalized)) {
      return {
        key: 'phi4',
        shortLabel: 'Phi 4',
        shortUpper: 'PHI 4',
        fullSpec: /^phi4:latest$/i.test(normalized) ? 'Phi4:latest' : 'Phi4'
      };
    }
    if (/phi4?[-\s]?mini/i.test(normalized)) {
      return {
        key: 'mini',
        shortLabel: 'Mini',
        shortUpper: 'MINI',
        fullSpec: 'Phi4-mini'
      };
    }
    if (/bonsai/i.test(normalized)) {
      return {
        key: 'bonsai',
        shortLabel: 'Bonsai',
        shortUpper: 'BONSAI',
        fullSpec: 'Digitsflow/Bonsai-8b'
      };
    }
    if (/gemma3:4b/i.test(normalized)) {
      return {
        key: 'gemma3',
        shortLabel: 'Gemma 3',
        shortUpper: 'GEMMA 3',
        fullSpec: 'Gemma3:4b'
      };
    }
    const gemma4Match = normalized.match(/^gemma4(?::(.+))?$/i);
    if (gemma4Match) {
      return {
        key: 'gemma4',
        shortLabel: 'Gemma 4',
        shortUpper: 'GEMMA 4',
        fullSpec: 'Gemma4'
      };
    }
    return {
      key: 'gemma3',
      shortLabel: 'Gemma 3',
      shortUpper: 'GEMMA 3',
      fullSpec: /^gemma3(?::|$)/i.test(normalized) ? 'Gemma3:4b' : normalized
    };
  }

  function getLocalModelDisplayLabel(upper = true) {
    const meta = getLocalModelUiMeta();
    return upper ? meta.shortUpper : meta.shortLabel;
  }

  function getLocalModelFullSpec(modelName = getEffectiveLocalModelName()) {
    return getLocalModelUiMeta(modelName).fullSpec;
  }

  function getLocalBackendUiMeta() {
    const status = getLocalLlmStatus();
    const routeLabel = 'Local app';
    const backendTitle = 'Ollama';
    const engineText = 'LOCAL';
    return { status, routeLabel, backendTitle, engineText };
  }

  function renderLocalBackendStatus() {
    const { status, routeLabel } = getLocalBackendUiMeta();
    const availableBackends = getAvailableLocalLlmBackends();
    if (localBackendOllama) {
      localBackendOllama.classList.toggle('active', true);
      localBackendOllama.disabled = !availableBackends.includes('ollama');
      localBackendOllama.setAttribute('aria-pressed', 'true');
    }
    if (localBackendName) {
      const readiness = status.ready === null ? 'checking' : status.ready ? 'ready' : status.configured === false ? 'not configured' : 'offline';
      localBackendName.textContent = `${status.backendLabel} · ${readiness}`;
    }
    if (localBackendRoute) localBackendRoute.textContent = routeLabel;
    if (localBackendModel) {
      localBackendModel.textContent = getLocalModelFullSpec(getEffectiveLocalModelName() || 'gemma4');
    }
    if (localBackendFile) localBackendFile.textContent = status.modelPath || '·';
    if (localBackendError) {
      localBackendError.textContent = status.lastError || '—';
    }
  }

  async function refreshLocalBackendUi({ probe = false } = {}) {
    if (probe) {
      try {
        const status = await refreshLocalLlmStatus(voiceManager?.getLocalBrainModelName?.() || 'gemma4');
        if (voiceManager) voiceManager._ollamaAvailable = Boolean(status?.ready);
        if (voiceManager && status?.ready && status?.model && voiceManager?.isForceLocalGemmaEnabled?.() !== true) {
          voiceManager._ollamaModel = status.model;
        }
        const preferred = voiceManager?.getPreferredMode?.() || _modeDetailsState.preferred || 'brain';
        if (preferred !== 'cloud' && _modeDetailsState.engine !== 'checking') {
          _modeDetailsState.engine = status?.ready ? 'ollama' : 'dict';
        }
      } catch {
      }
    }
    renderLocalBackendStatus();
    updateGemmaModeAvailability();
    refreshAiModeBadge(voiceManager?.getPreferredMode?.() || 'brain');
    renderModeDetails();
    syncChatStatusFromMode({ force: true });
  }

  function renderModeDetails() {
    if (!aiModeLive || !aiModePath || !aiModeLevel || !aiModeUsage) return;
    // Read live preferred mode from voiceManager so the panel always reflects the actual state,
    // even when _modeDetailsState.preferred is stale (e.g. after switching models without
    // re-calling setAiModeIndicator). Fall back to the cached value if voiceManager is unavailable.
    const _livePreferred = voiceManager?.getPreferredMode?.() || _modeDetailsState.preferred || 'brain';
    const preferred = _livePreferred === 'cloud' ? 'cloud'
      : _livePreferred === 'split' ? 'split'
      : _livePreferred === 'gemma' ? 'gemma'
      : _livePreferred === 'dict' ? 'dict'
      : 'brain';
    const engine = _modeDetailsState.engine || 'checking';
    const level = _modeDetailsState.level || 'L1';
    const rank = _modeDetailsState.rank || '·';
    const localBackendMeta = getLocalBackendUiMeta();
    const localModelFullSpec = getLocalModelFullSpec();

    let liveText = 'BRAIN';
    if (preferred === 'cloud') {
      liveText = engine === 'live'
        ? 'LIVE · EXP'
        : engine === 'cloud'
          ? 'CLOUD · LIVE'
          : engine === 'ollama'
            ? 'LOCAL · FALLBACK'
          : engine === 'dict'
            ? `DICT-${level} · FALLBACK`
            : engine === 'checking'
              ? `CLOUD · CHECK ${CLOUD_FALLOUT_SECONDS}S`
            : 'CLOUD · CONNECTING';
      aiModePath.textContent = `CLOUD ${CLOUD_FALLOUT_SECONDS}S ? LOCAL ${LOCAL_FALLOUT_SECONDS}S ? DICT`;
    } else if (preferred === 'gemma') {
      const _glbl = getLocalModelDisplayLabel();
      liveText = engine === 'ollama'
        ? `${_glbl} · DIRECT`
        : engine === 'dict'
          ? `${_glbl} · DICT-${level}`
          : engine === 'checking'
            ? `${_glbl} · CHECK ${GEMMA_CHECK_SECONDS}S`
            : _glbl;
      aiModePath.textContent = `${_glbl} PINNED · NO TIMER FALLOUT`;
    } else if (preferred === 'split') {
      const _splitLocal = getLocalModelDisplayLabel();
      liveText = engine === 'ollama'
        ? `SPLIT · ${_splitLocal}`
        : engine === 'dict'
          ? `SPLIT · DICT-${level}`
          : 'SPLIT · ?';
      aiModePath.textContent = `HOST A ? CLOUD · HOST B ? ${_splitLocal}`;
    } else if (preferred === 'dict') {
      liveText = engine === 'dict'
        ? `DICT · ${rank && rank !== '·' ? `${level}-${rank}` : level}`
        : engine === 'checking'
          ? `DICT · CHECK ${BRAIN_CHECK_SECONDS}S`
          : 'DICT · PINNED';
      aiModePath.textContent = 'DICT PINNED · GROUNDED MOVIE BRAIN';
    } else {
      liveText = engine === 'ollama'
        ? 'BRAIN · LOCAL'
        : engine === 'dict'
          ? `BRAIN · DICT-${level}`
          : engine === 'checking'
            ? `BRAIN · CHECK ${BRAIN_CHECK_SECONDS}S`
          : engine === 'brain-check'
            ? 'BRAIN · EXAM'
            : engine === 'brain-reply'
              ? `BRAIN · ${_activeTrainingEngine === 'ollama' ? localModelFullSpec.toUpperCase() : (_modeDetailsState.level ? _modeDetailsState.level.toUpperCase() : 'EXAM')}`
              : 'BRAIN';
        aiModePath.textContent = `LOCAL ${LOCAL_FALLOUT_SECONDS}S → DICT (with memory)`;
    }

    const memoryUsageText = _modeDetailsState.memoryTotal > 0
      ? `Mem ${_modeDetailsState.memoryCount}/${_modeDetailsState.memoryTotal}`
      : '';

    aiModeLive.textContent = liveText;
      aiModeLevel.textContent = engine === 'dict' || engine === 'brain-check' || engine === 'brain-reply'
        ? (rank && rank !== '·' ? `${level} · ${rank}` : level)
        : '·';
      aiModeUsage.textContent = preferred === 'cloud'
        ? (_modeDetailsState.usage || 'Unavailable')
        : preferred === 'split'
          ? 'Cloud A · Local B'
          : preferred === 'brain' && memoryUsageText
            ? memoryUsageText
            : preferred === 'gemma'
              ? 'Direct local route'
              : preferred === 'dict'
                ? 'Grounded movie dictionary'
                : 'Local route';
    renderLocalBackendStatus();
  }

  function flashAiModeBadge(mode = 'brain') {
    if (!aiModeBadge) return;
    aiModeBadge.classList.remove('mode-flash-cloud', 'mode-flash-brain');
    void aiModeBadge.offsetWidth;
    aiModeBadge.classList.add(mode === 'cloud' ? 'mode-flash-cloud' : 'mode-flash-brain');
    if (aiModeFlashTimer) clearTimeout(aiModeFlashTimer);
    aiModeFlashTimer = setTimeout(() => {
      aiModeBadge?.classList.remove('mode-flash-cloud', 'mode-flash-brain');
    }, 900);
  }

  function flashAiModePills(mode = 'brain') {
    if (!aiModeBrain || !aiModeCloud) return;
    [aiModeBrain, aiModeCloud, aiModeGemma, aiModeSplit].filter(Boolean).forEach((button) => {
      button.classList.remove('mode-flash-brain', 'mode-flash-cloud', 'mode-flash-gemma', 'mode-flash-split');
    });
    void aiModeBrain.offsetWidth;
    const target = mode === 'cloud' ? aiModeCloud : mode === 'gemma' ? aiModeGemma : mode === 'split' ? aiModeSplit : aiModeBrain;
    target?.classList.add(mode === 'cloud' ? 'mode-flash-cloud' : mode === 'gemma' ? 'mode-flash-gemma' : mode === 'split' ? 'mode-flash-split' : 'mode-flash-brain');
    if (aiModePillFlashTimer) clearTimeout(aiModePillFlashTimer);
    aiModePillFlashTimer = setTimeout(() => {
      [aiModeBrain, aiModeCloud, aiModeGemma, aiModeSplit].filter(Boolean).forEach((button) => {
        button.classList.remove('mode-flash-brain', 'mode-flash-cloud', 'mode-flash-gemma', 'mode-flash-split');
      });
    }, 900);
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  function downloadTextFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([String(text || '')], { type: mimeType });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  function getMovieForgeVidsStorageKey(movieName = '') {
    const normalized = String(movieName || '')
      .toLowerCase()
      .replace(/\.[^.]+$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default';
    return `movie-forge-vids:${normalized}`;
  }

  const DEFAULT_GOOGLE_VIDS_URL = 'https://docs.google.com/videos/d/1VujrMtzTI9L-Sow_SRD3BBbuF79B6v4c5hIA1iXEBvg/edit?scene=id.p#scene=id.p';

  let movieForgeModal = null;

  function ensureMovieForgeModal() {
    if (movieForgeModal) return movieForgeModal;

    const overlay = document.createElement('div');
    overlay.className = 'movie-forge-modal hidden';
    overlay.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'movie-forge-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Movie forge');

    const header = document.createElement('div');
    header.className = 'movie-forge-header';

    const headerCopy = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'movie-forge-kicker';
    kicker.textContent = 'Hidden Tool';
    const title = document.createElement('h2');
    title.className = 'movie-forge-title';
    title.textContent = 'Movie Forge';
    const subtitle = document.createElement('p');
    subtitle.className = 'movie-forge-subtitle';
    subtitle.textContent = 'Generate the next Google Vids movie from the active brain, attach up to two Ingredients images, and export one initial video prompt with optional checklist items.';
    headerCopy.appendChild(kicker);
    headerCopy.appendChild(title);
    headerCopy.appendChild(subtitle);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'movie-forge-btn';
    closeButton.textContent = 'Close';

    header.appendChild(headerCopy);
    header.appendChild(closeButton);

    const grid = document.createElement('div');
    grid.className = 'movie-forge-grid';

    const leftPanel = document.createElement('div');
    leftPanel.className = 'movie-forge-panel';
    const rightPanel = document.createElement('div');
    rightPanel.className = 'movie-forge-panel';

    const controls = document.createElement('div');
    controls.className = 'movie-forge-controls';

    const sourceField = document.createElement('label');
    sourceField.className = 'movie-forge-field';
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'movie-forge-field-label';
    sourceLabel.textContent = 'Source';
    const sourceInput = document.createElement('input');
    sourceInput.className = 'movie-forge-input';
    sourceInput.type = 'text';
    sourceField.appendChild(sourceLabel);
    sourceField.appendChild(sourceInput);

    const vidsField = document.createElement('label');
    vidsField.className = 'movie-forge-field movie-forge-field-wide';
    const vidsLabel = document.createElement('span');
    vidsLabel.className = 'movie-forge-field-label';
    vidsLabel.textContent = 'Google Vids URL';
    const vidsInput = document.createElement('input');
    vidsInput.className = 'movie-forge-input';
    vidsInput.type = 'url';
    vidsInput.placeholder = 'https://docs.google.com/videos/...';
    vidsField.appendChild(vidsLabel);
    vidsField.appendChild(vidsInput);

    const baseField = document.createElement('label');
    baseField.className = 'movie-forge-field';
    const baseLabel = document.createElement('span');
    baseLabel.className = 'movie-forge-field-label';
    baseLabel.textContent = 'Next Movie Title';
    const baseInput = document.createElement('input');
    baseInput.className = 'movie-forge-input';
    baseInput.type = 'text';
    baseField.appendChild(baseLabel);
    baseField.appendChild(baseInput);

    const startField = document.createElement('label');
    startField.className = 'movie-forge-field';
    const startLabel = document.createElement('span');
    startLabel.className = 'movie-forge-field-label';
    startLabel.textContent = 'Start Number';
    const startInput = document.createElement('input');
    startInput.className = 'movie-forge-input';
    startInput.type = 'number';
    startInput.min = '1';
    startField.appendChild(startLabel);
    startField.appendChild(startInput);

    controls.appendChild(sourceField);
    controls.appendChild(vidsField);
    controls.appendChild(baseField);
    controls.appendChild(startField);

    const actions = document.createElement('div');
    actions.className = 'movie-forge-actions';
    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.className = 'movie-forge-btn primary';
    generateButton.textContent = 'Generate Movie';
    const copyInitialPromptButton = document.createElement('button');
    copyInitialPromptButton.type = 'button';
    copyInitialPromptButton.className = 'movie-forge-btn';
    copyInitialPromptButton.textContent = 'Copy Initial Prompt';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'movie-forge-btn';
    copyButton.textContent = 'Copy Full Pack';
    const downloadJsonButton = document.createElement('button');
    downloadJsonButton.type = 'button';
    downloadJsonButton.className = 'movie-forge-btn';
    downloadJsonButton.textContent = 'Download JSON';
    const downloadTxtButton = document.createElement('button');
    downloadTxtButton.type = 'button';
    downloadTxtButton.className = 'movie-forge-btn';
    downloadTxtButton.textContent = 'Download TXT';
    actions.appendChild(generateButton);
    actions.appendChild(copyInitialPromptButton);
    actions.appendChild(copyButton);
    actions.appendChild(downloadJsonButton);
    actions.appendChild(downloadTxtButton);

    const meta = document.createElement('p');
    meta.className = 'movie-forge-meta';
    const status = document.createElement('p');
    status.className = 'movie-forge-status';
    const snapshotPanel = document.createElement('div');
    snapshotPanel.className = 'movie-forge-snapshots';
    const snapshotTitle = document.createElement('p');
    snapshotTitle.className = 'movie-forge-snapshots-title';
    snapshotTitle.textContent = 'Initial Video Frames';
    const snapshotGrid = document.createElement('div');
    snapshotGrid.className = 'movie-forge-snapshot-grid';
    const cards = document.createElement('div');
    cards.className = 'movie-forge-cards';
    leftPanel.appendChild(controls);
    leftPanel.appendChild(actions);
    leftPanel.appendChild(meta);
    leftPanel.appendChild(status);
    leftPanel.appendChild(snapshotPanel);
    leftPanel.appendChild(cards);
    snapshotPanel.appendChild(snapshotTitle);
    snapshotPanel.appendChild(snapshotGrid);

    const output = document.createElement('textarea');
    output.className = 'movie-forge-output';
    output.readOnly = true;
    rightPanel.appendChild(output);

    grid.appendChild(leftPanel);
    grid.appendChild(rightPanel);
    dialog.appendChild(header);
    dialog.appendChild(grid);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let currentMovieName = '';
    let currentBrain = null;
    let currentPack = null;
    let currentReferenceSnapshots = [null, null];

    const persistVidsProjectUrl = () => {
      try {
        window.localStorage.setItem(getMovieForgeVidsStorageKey(currentMovieName), String(vidsInput.value || '').trim());
      } catch {
      }
    };

    const restoreVidsProjectUrl = () => {
      try {
        return window.localStorage.getItem(getMovieForgeVidsStorageKey(currentMovieName)) || DEFAULT_GOOGLE_VIDS_URL;
      } catch {
        return DEFAULT_GOOGLE_VIDS_URL;
      }
    };

    const setForgeStatus = (text = '', tone = '') => {
      status.textContent = text;
      status.dataset.tone = tone || '';
    };

    const getInitialVideoPrompt = () => {
      return String(currentPack?.movie?.initialVideoPrompt || '').trim();
    };

    const snapshotSlots = [0, 1].map((index) => {
      const slot = document.createElement('div');
      slot.className = 'movie-forge-snapshot-slot';
      const slotHeader = document.createElement('div');
      slotHeader.className = 'movie-forge-snapshot-header';
      const slotLabel = document.createElement('span');
      slotLabel.className = 'movie-forge-snapshot-label';
      slotLabel.textContent = `Reference ${index + 1}`;
      const slotMeta = document.createElement('span');
      slotMeta.className = 'movie-forge-snapshot-meta';
      slotMeta.textContent = 'No frame yet';
      slotHeader.appendChild(slotLabel);
      slotHeader.appendChild(slotMeta);

      const thumbButton = document.createElement('button');
      thumbButton.type = 'button';
      thumbButton.className = 'movie-forge-snapshot-thumb is-empty';
      thumbButton.textContent = `Capture frame ${index + 1}`;

      const thumbImage = document.createElement('img');
      thumbImage.className = 'movie-forge-snapshot-image';
      thumbImage.alt = `Reference snapshot ${index + 1}`;
      thumbImage.loading = 'lazy';

      const controlsRow = document.createElement('div');
      controlsRow.className = 'movie-forge-snapshot-actions';
      const captureButton = document.createElement('button');
      captureButton.type = 'button';
      captureButton.className = 'movie-forge-btn';
      captureButton.textContent = 'Capture Current Frame';
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'movie-forge-btn';
      clearButton.textContent = 'Clear';
      controlsRow.appendChild(captureButton);
      controlsRow.appendChild(clearButton);

      slot.appendChild(slotHeader);
      slot.appendChild(thumbButton);
      slot.appendChild(controlsRow);
      snapshotGrid.appendChild(slot);

      const updateSlot = (snapshot = null) => {
        const resolved = snapshot && typeof snapshot === 'object' ? snapshot : null;
        currentReferenceSnapshots[index] = resolved
          ? {
              label: `Reference ${index + 1}`,
              src: resolved.src,
              alt: resolved.alt,
              title: resolved.title,
              timeLabel: resolved.timeLabel
            }
          : null;

        if (resolved?.src) {
          thumbButton.classList.remove('is-empty');
          thumbButton.textContent = '';
          thumbImage.src = resolved.src;
          thumbImage.alt = resolved.alt || `Reference snapshot ${index + 1}`;
          if (!thumbButton.contains(thumbImage)) {
            thumbButton.appendChild(thumbImage);
          }
          slotMeta.textContent = resolved.timeLabel || 'Captured';
          clearButton.disabled = false;
        } else {
          thumbButton.classList.add('is-empty');
          thumbButton.textContent = `Capture frame ${index + 1}`;
          if (thumbButton.contains(thumbImage)) {
            thumbButton.removeChild(thumbImage);
          }
          thumbImage.removeAttribute('src');
          slotMeta.textContent = 'No frame yet';
          clearButton.disabled = true;
        }
      };

      captureButton.addEventListener('click', () => {
        const snapshot = captureCurrentSceneSnapshotAttachment();
        if (!snapshot) {
          setForgeStatus('No video frame is available right now. Load a movie and let it play first.', 'error');
          appendChatMessage('assistant', 'No video frame is available for Movie Forge.');
          showAiSpeech('No frame available', true);
          return;
        }
        updateSlot(snapshot);
        renderPack();
        setForgeStatus(`Captured ${index + 1 === 1 ? 'reference one' : 'reference two'} at ${snapshot.timeLabel || 'current frame'}.`, 'success');
      });

      clearButton.addEventListener('click', () => {
        updateSlot(null);
        renderPack();
      });

      thumbButton.addEventListener('click', () => {
        if (!currentReferenceSnapshots[index]?.src) {
          captureButton.click();
          return;
        }
        ensureChatSnapshotModal().openSnapshot(currentReferenceSnapshots[index]);
      });

      updateSlot(null);
      return { updateSlot };
    });

    const closeModal = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('movie-forge-body-open');
      if (btnSecretForge) btnSecretForge.classList.remove('active');
    };

    const renderPack = () => {
      currentPack = buildMovieForgePack(currentMovieName, currentBrain, {
        sourceTitle: sourceInput.value,
        vidsProjectUrl: vidsInput.value,
        referenceSnapshots: currentReferenceSnapshots.filter(Boolean),
        baseTitle: baseInput.value,
        startIndex: Number(startInput.value || 0) || undefined
      });
      output.value = formatMovieForgePromptText(currentPack);
      meta.textContent = currentPack.vidsProjectUrl
        ? `Source: ${currentPack.sourceTitle} · Theme: ${currentPack.theme} · Movie: ${currentPack.movie?.title || 'Untitled'} · Vids linked${currentPack.referenceSnapshots?.length ? ` · ${currentPack.referenceSnapshots.length} snapshots` : ''}`
        : `Source: ${currentPack.sourceTitle} · Theme: ${currentPack.theme} · Movie: ${currentPack.movie?.title || 'Untitled'}${currentPack.referenceSnapshots?.length ? ` · ${currentPack.referenceSnapshots.length} snapshots` : ''}`;
      persistVidsProjectUrl();
      setForgeStatus('Ready to paste into Google Vids and attach Ingredients images.', 'neutral');
      cards.innerHTML = '';
      const movie = currentPack.movie;
      if (!movie) return;
      const card = document.createElement('article');
      card.className = 'movie-forge-card';
      const cardTitle = document.createElement('h3');
      cardTitle.className = 'movie-forge-card-title';
      cardTitle.textContent = movie.title;
      const cardAngle = document.createElement('p');
      cardAngle.className = 'movie-forge-card-angle';
      cardAngle.textContent = movie.angle;
      const cardCopy = document.createElement('p');
      cardCopy.className = 'movie-forge-card-copy';
      cardCopy.textContent = movie.logline;
      const cardMeta = document.createElement('p');
      cardMeta.className = 'movie-forge-card-meta';
      cardMeta.textContent = movie.motifs?.length
        ? movie.motifs.join(' · ')
        : movie.influences?.join(' · ') || 'Google Vids pack ready';
      card.appendChild(cardTitle);
      card.appendChild(cardAngle);
      card.appendChild(cardCopy);
      card.appendChild(cardMeta);
      cards.appendChild(card);
    };

    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && movieForgeModal && !movieForgeModal.classList.contains('hidden')) {
        closeModal();
      }
    });
    generateButton.addEventListener('click', renderPack);
    vidsInput.addEventListener('change', () => {
      persistVidsProjectUrl();
      if (currentPack) renderPack();
    });
    copyInitialPromptButton.addEventListener('click', async () => {
      if (!currentPack) renderPack();
      const initialVideoPrompt = getInitialVideoPrompt();
      if (!initialVideoPrompt) {
        setForgeStatus('No initial Google Vids prompt is available yet. Generate the movie first.', 'error');
        return;
      }
      const copied = await copyToClipboard(initialVideoPrompt);
      setForgeStatus(copied ? 'Initial Google Vids prompt copied.' : 'Initial Google Vids prompt copy failed.', copied ? 'success' : 'error');
      appendChatMessage('assistant', copied ? 'Initial Google Vids prompt copied.' : 'Initial Google Vids prompt copy failed.');
      showAiSpeech(copied ? 'Initial prompt copied' : 'Copy failed', true);
    });
    copyButton.addEventListener('click', async () => {
      const copied = await copyToClipboard(output.value);
      appendChatMessage('assistant', copied ? 'Movie forge prompts copied.' : 'Movie forge copy failed.');
      showAiSpeech(copied ? 'Forge copied' : 'Copy failed', true);
    });
    downloadJsonButton.addEventListener('click', () => {
      if (!currentPack) renderPack();
      downloadTextFile(`${currentPack.slug || 'movie-forge-pack'}.json`, `${JSON.stringify(currentPack, null, 2)}\n`, 'application/json;charset=utf-8');
      appendChatMessage('assistant', 'Movie forge JSON downloaded.');
    });
    downloadTxtButton.addEventListener('click', () => {
      if (!currentPack) renderPack();
      downloadTextFile(`${currentPack.slug || 'movie-forge-pack'}.txt`, output.value);
      appendChatMessage('assistant', 'Movie forge TXT downloaded.');
    });

    overlay.openForge = ({ movieName = '', brain = null } = {}) => {
      currentMovieName = movieName;
      currentBrain = brain || resolveMovieBrain(movieName) || {};
      currentReferenceSnapshots = [null, null];
      snapshotSlots.forEach((slot) => slot.updateSlot(null));
      sourceInput.value = String(movieName || 'Synthetic_Desires').replace(/\.[^.]+$/i, '').replace(/_/g, ' ');
      vidsInput.value = restoreVidsProjectUrl();
      const nextNumberMatch = String(movieName || '').match(/(\d+)(?!.*\d)/);
      const nextNumber = nextNumberMatch ? Number(nextNumberMatch[1]) + 1 : 1;
      baseInput.value = sourceInput.value.replace(/\d+(?!.*\d)/, '').trim() || sourceInput.value;
      baseInput.value = baseInput.value.replace(/\s+$/, '');
      if (!/\d+(?!.*\d)/.test(baseInput.value)) {
        baseInput.value = baseInput.value;
      }
      startInput.value = String(nextNumber);
      renderPack();
      overlay.classList.remove('hidden');
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('movie-forge-body-open');
      if (btnSecretForge) btnSecretForge.classList.add('active');
    };

    movieForgeModal = overlay;
    return movieForgeModal;
  }

  function getAiLogTextForCopy() {
    const parts = [];

    // Chat messages section
    const chatMsgs = aiChatMessages ? Array.from(aiChatMessages.querySelectorAll('.chat-msg')) : [];
    if (chatMsgs.length) {
      const chatLines = chatMsgs.map((el) => {
        const role = el.classList.contains('user') ? 'user' : 'assistant';
        const text = el.querySelector('.chat-text')?.textContent?.trim() || '';
        const time = el.querySelector('.chat-time')?.textContent?.trim() || '';
        return `[${time}] ${role}: ${text}`;
      });
      parts.push(`=== CHAT ===\n${chatLines.join('\n')}`);
    }

    // AI log section
    if (_aiLogHistory.length) {
      const logLines = _aiLogHistory.map((item) => {
        const meta = [];
        if (item.timeLabel) meta.push(item.timeLabel);
        if (item.engineLabel) meta.push(`${item.engineLabel}`);
        if (Number.isFinite(item.ms)) meta.push(`${item.ms}ms`);
        if (item.hot) meta.push('HOT');
        if (item.artRef) meta.push('REF-ART');
        if (item.memories > 0) meta.push(`mem:${item.memories}`);
        if (item.movie) meta.push(item.movie);
        if (item.level) meta.push(item.level);
        if (item.training) meta.push('TRAIN');
        if (item.focus) meta.push(String(item.focus).toUpperCase());
        if (item.action) meta.push(String(item.action).toUpperCase());
        if (item.rank) meta.push(`RANK:${String(item.rank).toUpperCase()}`);
        if (Number.isFinite(item.score)) meta.push(`SCORE:${item.score}`);
        if (item.examSource) meta.push(item.examSource);
        if (item.intent) meta.push(String(item.intent).toUpperCase());
        if (item.vision) meta.push('VISION');
        if (item.audio) meta.push('AUDIO');
        return `#${item.id} [${meta.join(' | ')}]${item.input ? `\nIN: ${item.input}` : ''}\nOUT: ${item.output || '·'}`;
      }).join('\n\n');
      parts.push(`=== AI LOG ===\n${logLines}`);
    }

    return parts.join('\n\n');
  }

  function escapeHtml(text = '') {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatAiLogText(text = '', { maxLength = null, preserveLineBreaks = false } = {}) {
    const raw = String(text || '');
    const shortened = Number.isFinite(maxLength) && maxLength > 0 && raw.length > maxLength
      ? `${raw.slice(0, Math.max(0, maxLength - 1)).trimEnd()}·`
      : raw;
    const escaped = escapeHtml(shortened);
    return preserveLineBreaks ? escaped.replace(/\n/g, '<br>') : escaped;
  }

  function appendAiLog({ engine, movie, input, output, ms, memories, level, intent, hot, artRef, vision, audio, training, focus, action, rank, score, examSource, role, text, time, videoTimestamp }) {
    const container = document.getElementById('ai-log-entries');
    if (!container) return;

    // Remove empty placeholder
    const empty = container.querySelector('.ai-log-empty');
    if (empty) empty.remove();

    const normalizedEngine = String(engine || 'cloud').trim().toLowerCase() || 'cloud';
    const normalizedRole = String(role || '').trim().toLowerCase();
    const normalizedText = String(text || '').trim();

    // Skip chat assistant messages with no input — they're already visible in the chat panel
    if (normalizedEngine === 'chat' && normalizedRole !== 'user' && !String(input || '').trim()) return;

    const safeInput = normalizedEngine === 'chat'
      ? (normalizedRole === 'user' ? normalizedText : String(input || '').trim())
      : String(input || '').trim();
    const safeOutput = normalizedEngine === 'chat'
      ? (normalizedRole === 'assistant' ? normalizedText : String(output || '').trim())
      : String(output || '').trim();
    const safeMs = Number.isFinite(Number(ms)) ? Math.max(0, Math.round(Number(ms))) : null;
    const timeLabel = String(time || formatChatTime()).trim() || formatChatTime();

    _aiLogEntryCount++;
    // Enforce max entries
    while (container.children.length >= MAX_LOG_ENTRIES) {
      container.removeChild(container.lastChild);
    }

    const logEngineIconMap = {
      'train-summary': '📊',
      'chat': '💬',
      'cloud': '☁️',
      'cloud-quota': '☁️',
      'cloud-train': '☁️',
      'live': '☁️',
      'podcast-control': '🎙️',
      'tts': '🔊',
      'ollama': '🧠',
      'local': '🧠',
      'dict': '📖',
      'brain-reply': '🧠',
      'brain-check': '🧠',
      'guest-utility': '🛠️',
      'checking': '⏳'
    };
    const icon = logEngineIconMap[normalizedEngine] || '❓';
    const engineLabel = normalizedEngine === 'chat'
      ? (normalizedRole === 'user' ? 'CHAT-USER' : 'CHAT-AI')
      : normalizedEngine === 'brain-reply'
      ? 'BRAIN-REPLY'
      : normalizedEngine === 'brain-check'
        ? 'BRAIN-CHECK'
      : normalizedEngine === 'guest-utility'
        ? 'UTILITY'
      : normalizedEngine === 'podcast-control'
        ? 'PODCAST'
      : normalizedEngine === 'train-summary'
        ? 'TRAIN-SUMMARY'
      : normalizedEngine === 'tts'
        ? 'VOICE'
      : normalizedEngine === 'ollama' || normalizedEngine === 'local'
        ? 'LOCAL'
      : normalizedEngine === 'cloud-train'
        ? 'CLOUD-TRAIN'
      : normalizedEngine === 'live'
        ? 'LIVE'
      : normalizedEngine === 'dict'
        ? `DICT${level ? `-${level}` : ''}`
      : normalizedEngine === 'checking'
        ? 'CHECKING'
      : normalizedEngine === 'cloud-quota'
        ? 'CLOUD'
      : training ? 'CLOUD-TRAIN' : 'CLOUD';
    if ((normalizedEngine === 'dict' || normalizedEngine === 'brain-check' || normalizedEngine === 'brain-reply') && level) {
      _modeDetailsState.level = level;
      _modeDetailsState.rank = rank || '·';
      _modeDetailsState.engine = normalizedEngine === 'brain-check'
        ? 'brain-check'
        : normalizedEngine === 'brain-reply'
          ? 'brain-reply'
          : 'dict';
      if (normalizedEngine === 'brain-reply') {
        const badge = document.getElementById('ai-mode-badge');
        const engineEl = badge?.querySelector('.ai-mode-badge-engine');
        if (badge && engineEl) {
          const examLabel = _activeTrainingEngine === 'ollama'
            ? (voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest')
            : (level ? level.toUpperCase() : 'DICT');
          badge.className = 'ai-mode-badge brain-guest';
          badge.title = `Brain Mode · exam check during training · ${examLabel}`;
          badge.querySelector('.ai-mode-badge-icon').textContent = '🧠';
          badge.querySelector('.ai-mode-badge-label').textContent = 'BRAIN';
          engineEl.textContent = examLabel;
        }
      }
      renderModeDetails();
    }
    const metaParts = [];
    if (Number.isFinite(safeMs)) {
      if (normalizedEngine === 'train-summary') {
        const totalMins = Math.floor(safeMs / 60000);
        const totalSecs = Math.round((safeMs % 60000) / 1000);
        metaParts.push(totalMins > 0 ? `${totalMins}m ${totalSecs}s` : `${totalSecs}s`);
      } else {
        metaParts.push(`${safeMs}ms`);
      }
    }
    else if (timeLabel) metaParts.push(timeLabel);
    if (movie) metaParts.push(String(movie).replace(/\.mp4$/i, ''));
    if (hot) metaParts.push('HOT');
    if (artRef) metaParts.push('REF-ART');
    if (memories > 0) metaParts.push(`?${memories}mem`);
    if (training) metaParts.push('TRAIN');
    if (training && focus) metaParts.push(String(focus).toUpperCase());
    if (training && action) metaParts.push(String(action).toUpperCase());
    if (rank) metaParts.push(`RANK ${String(rank).toUpperCase()}`);
    if (Number.isFinite(score)) metaParts.push(`${score}PT`);
    if (examSource) metaParts.push(String(examSource));
    if (intent) metaParts.push(String(intent).toUpperCase());
    if (vision) metaParts.push('👁️');
    if (audio) metaParts.push('🔊');
    const metaLabel = metaParts.join(' · ');
    const isTrainSummary = normalizedEngine === 'train-summary';
    const inputHtml = safeInput ? formatAiLogText(safeInput, { maxLength: isTrainSummary ? null : 60 }) : '';
    const outputHtml = formatAiLogText(safeOutput || '·', { maxLength: isTrainSummary ? null : 120, preserveLineBreaks: isTrainSummary });

    const safeVideoTs = Number.isFinite(Number(videoTimestamp)) && Number(videoTimestamp) >= 0 ? Number(videoTimestamp) : null;
    const videoTsHtml = safeVideoTs !== null
      ? `<span class="ai-log-vidts" data-secs="${safeVideoTs}" title="Jump to @${Math.floor(safeVideoTs/60).toString().padStart(2,'0')}:${Math.floor(safeVideoTs%60).toString().padStart(2,'0')} in video">@${Math.floor(safeVideoTs/60).toString().padStart(2,'0')}:${Math.floor(safeVideoTs%60).toString().padStart(2,'0')}</span>`
      : '';

    const entry = document.createElement('div');
    entry.className = `ai-log-entry ai-log-${normalizedEngine}`;
    entry.innerHTML = `
      <div class="ai-log-meta">
        <span class="ai-log-engine">${icon} ${engineLabel}</span>
        <span class="ai-log-ms">${metaLabel}</span>
        ${videoTsHtml}
        <span class="ai-log-num">#${_aiLogEntryCount}</span>
      </div>
      ${inputHtml ? `<div class="ai-log-in">? ${inputHtml}</div>` : ""}
      <div class="ai-log-out">? ${outputHtml}</div>`;

    if (safeVideoTs !== null) {
      entry.querySelector('.ai-log-vidts')?.addEventListener('click', () => {
        const videoEl = scene3d?.getVideoMesh?.()?.videoElement;
        if (videoEl && Number.isFinite(videoEl.duration)) videoEl.currentTime = safeVideoTs;
      });
    }

    container.insertBefore(entry, container.firstChild);

    _aiLogHistory.unshift({
      id: _aiLogEntryCount,
      timeLabel,
      engineLabel,
      movie: movie || '',
      input: safeInput,
      output: safeOutput,
      ms: safeMs,
      memories: memories || 0,
      hot: Boolean(hot),
      artRef: Boolean(artRef),
      training: Boolean(training),
      focus: focus || '',
      action: action || '',
      rank: rank || '',
      score: Number.isFinite(score) ? score : null,
      examSource: examSource || '',
      level: level || '',
      intent: intent || '',
      vision: Boolean(vision),
      audio: Boolean(audio)
    });
    while (_aiLogHistory.length > MAX_LOG_ENTRIES) {
      _aiLogHistory.pop();
    }

    // Update count label
    const countEl = document.getElementById('ai-log-count');
    if (countEl) countEl.textContent = `${_aiLogEntryCount} entr${_aiLogEntryCount === 1 ? 'y' : 'ies'}`;
  }
  // -- end AI Log --------------------------------------------------------------

  function getAiModeBadgeState(mode = voiceManager?.getPreferredMode?.() || 'brain') {
    const preferredMode = mode === 'cloud' ? 'cloud' : mode === 'gemma' ? 'gemma' : mode === 'split' ? 'split' : mode === 'dict' ? 'dict' : 'brain';
    const isSplitMode = preferredMode === 'split';
    const isCloud = preferredMode === 'cloud';
    const forceGemmaActive = preferredMode === 'gemma' || (!isCloud && !isSplitMode && voiceManager?.isForceLocalGemmaEnabled?.() === true);
    const forceDictActive = preferredMode === 'dict' || (!isCloud && !isSplitMode && !forceGemmaActive && voiceManager?.isForceDictModeEnabled?.() === true);
    const normalizedEngine = String(_modeDetailsState.engine || '').trim().toLowerCase();
    const localModelName = getEffectiveLocalModelName() || 'gemma4:latest';
    const localModelMeta = getLocalModelUiMeta(localModelName);
    const localModelFullSpec = getLocalModelFullSpec(localModelName);
    const localLabel = forceGemmaActive ? localModelMeta.shortUpper : 'BRAIN';
    const localBackendMeta = getLocalBackendUiMeta();

    if (isSplitMode) {
      const splitLocalLabel = localModelMeta.shortUpper;
      return {
        className: 'ai-mode-badge brain-split',
        title: `Split mode · Host A via Gemini cloud · Host B via local ${localModelFullSpec}`,
        icon: '🔀',
        label: 'SPLIT',
        engineText: normalizedEngine === 'ollama' || normalizedEngine === 'ollama-forced' ? splitLocalLabel : normalizedEngine === 'dict' ? 'DICT' : normalizedEngine === 'checking' ? '···' : 'LIVE'
      };
    }

    if (isCloud) {
      return {
        className: 'ai-mode-badge cloud',
        title: normalizedEngine === 'dict'
          ? 'Cloud Mode · temporary local fallback active'
          : normalizedEngine === 'ollama'
            ? 'Cloud Mode · temporary local Brain fallback active'
            : normalizedEngine === 'live'
              ? 'Cloud Mode · Gemini Live API (experimental mobile transport)'
              : getCloudBadgeTitle('Cloud Mode · Gemini AI'),
        icon: '☁️',
        label: normalizedEngine === 'live' ? 'LIVE' : 'CLOUD',
        engineText: normalizedEngine === 'dict'
          ? 'FALLBACK'
          : normalizedEngine === 'ollama'
            ? 'LOCAL'
            : normalizedEngine === 'live'
              ? 'EXP'
              : normalizedEngine === 'checking'
                ? '···'
                : getCloudDailyBadgeText()
      };
    }

    if (normalizedEngine === 'dict') {
      return {
        className: 'ai-mode-badge brain-dict',
        title: forceGemmaActive
          ? `${localModelMeta.shortLabel} forced · local unavailable, DICT answering until ${localModelMeta.shortLabel} returns`
          : forceDictActive
            ? 'DICT pinned · grounded movie dictionary replies'
            : `Brain Mode · Dictionary fallback (${localBackendMeta.backendTitle} not running)`,
        icon: '📖',
        label: forceGemmaActive ? localLabel : forceDictActive ? 'DICT' : 'BRAIN',
        engineText: forceDictActive ? 'PINNED' : 'DICT'
      };
    }

    if (normalizedEngine === 'ollama' || normalizedEngine === 'ollama-ready' || normalizedEngine === 'ollama-forced') {
      return {
        className: forceGemmaActive ? 'ai-mode-badge brain-gemma' : 'ai-mode-badge brain-ollama',
        title: forceGemmaActive
          ? `${localModelMeta.shortLabel} forced · direct local chat (${localModelFullSpec} via ${localBackendMeta.backendTitle})`
          : `Brain Mode · Local LLM (${localModelFullSpec} via ${localBackendMeta.backendTitle})`,
        icon: '🧠',
        label: forceGemmaActive ? localLabel : 'BRAIN',
        engineText: forceGemmaActive ? 'DIRECT' : 'LOCAL'
      };
    }

    if (normalizedEngine === 'checking') {
      return {
        className: forceGemmaActive ? 'ai-mode-badge brain-gemma' : 'ai-mode-badge brain',
        title: forceGemmaActive ? `${localModelMeta.shortLabel} forced · checking local route` : 'Brain Mode · checking local route',
        icon: '⏳',
        label: forceGemmaActive ? localLabel : 'BRAIN',
        engineText: '···'
      };
    }

    return {
      className: forceGemmaActive ? 'ai-mode-badge brain-gemma' : 'ai-mode-badge brain',
      title: forceGemmaActive ? `${localModelMeta.shortLabel} forced · direct local route` : 'Brain Mode',
      icon: '🧠',
      label: forceGemmaActive ? localLabel : 'BRAIN',
      engineText: ''
    };
  }

  function refreshAiModeBadge(mode = voiceManager?.getPreferredMode?.() || 'brain') {
    const badge = aiModeBadge;
    if (!badge) {
      renderModeDetails();
      return;
    }
    resetAiMemoryBadge();
    const badgeState = getAiModeBadgeState(mode);
    badge.className = badgeState.className;
    badge.title = badgeState.title;
    const icon = badge.querySelector('.ai-mode-badge-icon');
    const label = badge.querySelector('.ai-mode-badge-label');
    const engineEl = badge.querySelector('.ai-mode-badge-engine');
    if (icon) icon.textContent = badgeState.icon;
    if (label) label.textContent = badgeState.label;
    if (engineEl) {
      engineEl.textContent = badgeState.engineText;
      engineEl.classList.toggle('warning', badgeState.engineText === 'LOCAL ONLY');
    }
    renderModeDetails();
  }

  function setAiModeIndicator(mode = 'brain') {
    const gemmaAvailable = isGemmaModeAvailable();
    const isCloud = mode === 'cloud';
    const isSplit = mode === 'split';
    const forceGemmaActive = gemmaAvailable && (mode === 'gemma' || (!isCloud && !isSplit && voiceManager?.isForceLocalGemmaEnabled?.() === true));
    const forceDictActive = mode === 'dict' || (!isCloud && !isSplit && !forceGemmaActive && voiceManager?.isForceDictModeEnabled?.() === true);
    _modeDetailsState.preferred = isCloud ? 'cloud' : isSplit ? 'split' : (forceGemmaActive ? 'gemma' : forceDictActive ? 'dict' : 'brain');
    if (isCloud) {
      _modeDetailsState.engine = 'cloud';
      _modeDetailsState.rank = '·';
    } else if (!_modeDetailsState.engine || _modeDetailsState.engine === 'cloud') {
      _modeDetailsState.engine = 'idle';
    }
    if (aiModeBrain) aiModeBrain.classList.toggle('active', !isCloud && !isSplit && !forceGemmaActive);
    if (aiModeCloud) aiModeCloud.classList.toggle('active', isCloud);
    // Clear fallback indicators immediately on mode switch · engine-change will re-apply if still relevant
    [aiModeBrain, aiModeCloud, aiModeGemma, aiModeSplit].filter(Boolean).forEach(btn => btn.classList.remove('fallback'));
    updateGemmaModeAvailability();
    if (aiModeGemma) aiModeGemma.classList.toggle('active', !isCloud && !isSplit && forceGemmaActive);
    if (aiModeSplit) aiModeSplit.classList.toggle('active', isSplit);
    const badgeMode = isCloud ? 'cloud' : isSplit ? 'split' : forceGemmaActive ? 'gemma' : forceDictActive ? 'dict' : 'brain';
    refreshAiModeBadge(badgeMode);
    flashAiModeBadge(isCloud ? 'cloud' : 'brain');
    flashAiModePills(isCloud ? 'cloud' : isSplit ? 'split' : forceGemmaActive ? 'gemma' : 'brain');
    syncChatStatusFromMode();
  }

  function isSyntheticDesiresMovie(movie = voiceManager?.currentMovie || '') {
    return /synthetic_desires_[1-7]/i.test(String(movie || ''));
  }

  function isPassiveFreeChatAcknowledgement(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;
    return /^(?:ok|okay|okay then|alright|all right|whatever|sure|right|i see|got it|understood|cool|nice|interesting|wow|really|thanks|thank you)$/.test(normalized);
  }

  function isGemmaModeAvailable() {
    // Keep Gemma selectable on desktop unless Ollama is confirmed unavailable.
    // null = still checking (keep enabled), false = confirmed offline (disable).
    if (isMobile) return false;
    if (voiceManager?._ollamaAvailable === false) return false;
    return true;
  }

  function updateGemmaModeAvailability() {
    if (!aiModeGemma) return;
    const enabled = isGemmaModeAvailable();
    aiModeGemma.disabled = !enabled;
    aiModeGemma.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    safeSetText(aiModeGemma, getLocalModelDisplayLabel(false));
    aiModeGemma.title = enabled
      ? voiceManager?._ollamaAvailable === false
        ? `Force Gemma and retry local ${(voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama')} now.`
        : voiceManager?._ollamaAvailable === null
          ? `Force Gemma and run a fresh local ${(voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama')} probe.`
          : 'Force Gemma and bypass cloud failover'
      : isMobile
        ? `Gemma stays disabled on mobile because local ${(voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama')} is not reachable there.`
        : voiceManager?._ollamaAvailable === false
          ? `Local ${getLocalModelDisplayLabel(false)} is offline. Start Ollama to enable.`
          : voiceManager?._ollamaAvailable === null
          ? `Checking local Gemma through ${voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama'}\u2026`
          : `Gemma will enable automatically when local ${getLocalModelDisplayLabel(false)} is reachable through ${voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama'}.`;
  }

  // ── AI Mode Switch Buttons ──
  async function switchToAiMode(mode) {
    if (!voiceManager) return;
    const hasServerGeminiProxy = voiceManager.hasServerGeminiProxy?.();
    const isSd = isSyntheticDesiresMovie();

    if (mode !== 'split' && publicPodcastAiEnabled && (selectedConversationSurfaceMode === 'podcast' || isPodcastConversationSurfaceActive())) {
      await switchConversationSurfaceMode('chat', {
        source: 'mode-switch',
        announce: false,
        autoStartMic: false
      });
    }

    if (mode === 'cloud') {
      // Server proxy path: no client-side key needed.
      if (!hasServerGeminiProxy) {
        const key = (voiceManager.GEMINI_KEY || '').trim();
        if (!key || key.length < 10) {
          showAiSpeech('?? Cloud mode unavailable · no Gemini API key set.', true);
          appendChatMessage('assistant', 'Cloud mode requires a Gemini API key. Use /key YOUR_KEY in the chat, or configure GEMINI_API_KEY for the local server proxy.');
          return;
        }
      }

      voiceManager.setPreferredMode?.('cloud');
      setAiModeIndicator('cloud');
      refreshUsageSummary().catch(() => { });
      if (!shouldSuppressPodcastTrainingAdminChat() && !isPublicPodcastStageParticipationReady() && !hasPublicPodcastAiConversationWork()) {
        showAiSpeech('?? Switched to Cloud mode (Gemini)', true);
      }
      appendModeSwitchAssistantLine('cloud', '?? Cloud mode active · using Gemini AI.');
      return;
    }

    if (!isSd && voiceManager?.currentMovie) {
      showAiSpeech('?? Brain mode unavailable for imported files.', true);
      appendChatMessage('assistant', '?? Brain mode is only available for built-in Synthetic Desires movies. Imported files require Cloud AI to analyze content.');
      setAiModeIndicator('cloud');
      return;
    }

    if (mode === 'gemma') {
      if (isMobile) {
        const unavailableMessage = isMobile
          ? `?? Gemma stays disabled on mobile because local ${voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama'} is not reachable there.`
          : `?? Gemma is unavailable until local ${getLocalModelDisplayLabel(false)} is reachable through ${voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama'}.`;
        setAiModeIndicator(voiceManager.getPreferredMode?.() === 'cloud' ? 'cloud' : 'brain');
        showAiSpeech('?? Gemma unavailable here', true);
        appendModeSwitchAssistantLine('brain', unavailableMessage);
        return;
      }
      setAiModeIndicator('gemma');
      _modeDetailsState.engine = 'checking';
      renderModeDetails();
      setChatEnabled(true, '?? Checking Gemma for up to 7s·');
      const result = await voiceManager.setForceLocalGemma?.(true);
      setAiModeIndicator('gemma');
      const modelName = result?.model || getEffectiveLocalModelName() || 'gemma4:latest';
      const modelMeta = getLocalModelUiMeta(modelName);
      const shortLabel = modelMeta.shortLabel;
      const fullSpec = getLocalModelFullSpec(modelName);
      if (aiModeGemma) safeSetText(aiModeGemma, shortLabel);
      if (result?.ready) {
        setChatEnabled(true, `?? ${shortLabel} pinned · direct local chat via ${fullSpec} with no timer fallout`);
        if (!brainTrainingInFlight) {
          if (!isPublicPodcastStageParticipationReady() && !hasPublicPodcastAiConversationWork()) {
          showAiSpeech(`?? ${shortLabel} pinned`, true);
          }
          appendModeSwitchAssistantLine('gemma', `?? ${shortLabel} pinned · cloud bypassed and ${fullSpec} answers directly with no timer fallout.`);
        }
      } else {
        setChatEnabled(true, `?? ${shortLabel} pinned · DICT will answer until local wakes up`);
        if (!brainTrainingInFlight) {
          if (!isPublicPodcastStageParticipationReady() && !hasPublicPodcastAiConversationWork()) {
          showAiSpeech(`?? ${shortLabel} pinned · local unavailable`, true);
          }
          appendModeSwitchAssistantLine('gemma', `?? ${shortLabel} pinned · cloud bypassed. DICT will answer until ${shortLabel} is reachable again.`);
        }
      }
      return;
    }

    if (mode === 'dict') {
      voiceManager.setForceDictMode?.(true);
      setAiModeIndicator('dict');
      setChatEnabled(true, '?? DICT pinned · grounded movie dictionary replies');
      if (!brainTrainingInFlight) {
        if (!isPublicPodcastStageParticipationReady() && !hasPublicPodcastAiConversationWork()) {
        showAiSpeech('?? DICT pinned', true);
        }
        appendModeSwitchAssistantLine('dict', '?? DICT pinned · grounded movie dictionary replies with no cloud drift.');
      }
      return;
    }

    if (mode === 'split') {
      // Split mode uses the same cloud prerequisites as Cloud mode: proxy or direct key.
      if (!hasServerGeminiProxy) {
        const key = (voiceManager.GEMINI_KEY || '').trim();
        if (!key || key.length < 10) {
          showAiSpeech('? Split mode unavailable · no Gemini API key set.', true);
          appendModeSwitchAssistantLine('brain', '? Split mode requires Gemini (cloud) for Host A. Use /key YOUR_KEY, or run with the Gemini server proxy enabled.');
          return;
        }
      }
      voiceManager.setPreferredMode?.('split');
      setAiModeIndicator('split');
      const localModelName = voiceManager?.getLocalBrainModelName?.() || 'gemma3:4b';
      if (!shouldSuppressPodcastTrainingAdminChat() && !isPublicPodcastStageParticipationReady() && !hasPublicPodcastAiConversationWork()) {
        showAiSpeech('? Split mode · Host A cloud, Host B local', true);
      }
      appendModeSwitchAssistantLine('split', `? Split mode · Host A questions via Gemini cloud · Host B answers via local ${localModelName}.`);
      await switchConversationSurfaceMode('podcast', { source: 'mode-switch', announce: false });
      return;
    }

    voiceManager.setPreferredMode?.('brain');
    setAiModeIndicator('brain');
    setChatEnabled(true, '?? Brain mode active · local AI ready');
    if (brainTrainingInFlight) {
      trainingUserModeOverride = true;
      const modelName = voiceManager.getLocalBrainModelName?.() || 'gemma4:latest';
      const isOllamaReady = voiceManager._ollamaAvailable === true;
      setChatEnabled(true, `?? Brain active · type to test ${isOllamaReady ? modelName : 'local brain'}`);
    } else {
      if (!isPublicPodcastStageParticipationReady() && !hasPublicPodcastAiConversationWork()) {
        showAiSpeech('?? Switched to Brain mode', true);
      }
      appendModeSwitchAssistantLine('brain', '?? Brain mode active · using local responses.');
    }
  }

  if (aiModeBrain) {
    aiModeBrain.addEventListener && aiModeBrain.addEventListener('click', () => { void switchToAiMode('brain'); });
  }
  if (aiModeCloud) {
    aiModeCloud.addEventListener && aiModeCloud.addEventListener('click', () => { void switchToAiMode('cloud'); });
  }
  if (aiModeSplit) {
    aiModeSplit.addEventListener && aiModeSplit.addEventListener('click', () => { void switchToAiMode('split'); });
  }
    if (aiModeGemma) {
    updateGemmaModeAvailability();
    let _gemmaToggleBusy = false;
    aiModeGemma.addEventListener && aiModeGemma.addEventListener('click', async () => {
      if (_gemmaToggleBusy) return;
      _gemmaToggleBusy = true;
      try {
        // While the podcast is running (including idle between turns), suppress model cycling
        if (publicPodcastAiAutoMode || hasPublicPodcastAiConversationWork() || publicPodcastAiContinueTimer) {
          void switchToAiMode('gemma');
          return;
        }
        const preferredMode = voiceManager?.getPreferredMode?.() || _modeDetailsState.preferred || 'brain';
        const gemmaModeActive = preferredMode === 'gemma' || voiceManager?.isForceLocalGemmaEnabled?.() === true;
        if (!gemmaModeActive) {
          void switchToAiMode('gemma');
          return;
        }
        const currentModel = voiceManager?.getLocalBrainModelName?.() || 'gemma3:4b';
        const isGemma4 = /^gemma4(?::|$)/i.test(currentModel);
        const isGemma3 = /^gemma3(?::|$)/i.test(currentModel);
        const isPhi4 = /^phi4(?::|$)/i.test(currentModel);
        // Cycle local trio: Gemma 4 ? Gemma 3 ? Phi 4 ? Gemma 4.
        let nextModel;
        if (isGemma4) nextModel = 'gemma3:4b';
        else if (isGemma3) nextModel = 'phi4:latest';
        else if (isPhi4) nextModel = 'gemma4:e2b';
        else nextModel = 'gemma4:e2b';

        if (voiceManager) {
          voiceManager._ollamaModel = nextModel;
          voiceManager._pinnedLocalModel = nextModel; // persist through internal probes
        }

        const label = getLocalModelUiMeta(nextModel).shortLabel;
        safeSetText(aiModeGemma, label);
        void switchToAiMode('gemma');
      } finally {
        setTimeout(() => { _gemmaToggleBusy = false; }, 1500);
      }
    });
  }

  function normalizeVoiceText(text = '') {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[.!?,;:]+$/g, '')
      .replace(/\s+/g, ' ');
  }

  function parsePlaylistVoiceCommand(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return null;

    const playMatch = normalized.match(/^(play\s+)?(video|movie)(\s+number)?\s*(\d+)$/i);
    if (playMatch) {
      const index = Number.parseInt(playMatch[4], 10) - 1;
      if (Number.isFinite(index)) return { action: 'play-index', index };
    }

    if (/^(next(\s+video|\s+movie)?|move\s+next\s+video|move\s+next\s+movie|forward\s+video|forward\s+movie)$/i.test(normalized)) {
      return { action: 'next' };
    }

    if (/^(back(\s+video|\s+movie)?|previous(\s+video|\s+movie)?|prev(\s+video|\s+movie)?|move\s+back\s+video|move\s+back\s+movie)$/i.test(normalized)) {
      return { action: 'previous' };
    }

    return null;
  }

  function parseGeneralVoiceCommand(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return null;

    const normalizedSurfaceCommand = normalized
      .replace(/\bwhich\b(?=\s+to\s+(?:podcast|cloud|chat|free chat)\b)/g, 'switch')
      .replace(/\bpodcasts\b/g, 'podcast')
      .replace(/\bmold\b/g, 'mode')
      .replace(/\bplease\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (/^(?:(?:switch|set|go|change|turn|move)(?:\s+mode)?(?:\s+to)?\s+)?(?:podcast|podcast\s+mode)$|^(?:to\s+podcast|podcast)$/.test(normalizedSurfaceCommand)) {
      return { action: 'mode-podcast' };
    }
    if (/^(?:(?:switch|set|go|change|turn|move)(?:\s+mode)?(?:\s+to)?\s+)?(?:free\s+chat|chat\s+mode|chat)$|^(?:to\s+chat|to\s+free\s+chat|free\s+chat|chat)$/.test(normalizedSurfaceCommand)) {
      return { action: 'mode-chat' };
    }

    if (/^(pause|pause video|stop video|stop|hold|wait)$/.test(normalized)) return { action: 'pause' };
    if (/^(resume|resume video|continue|continue video|play video|play|start)$/.test(normalized)) return { action: 'resume' };
    if (/^(restart|restart video|start over|replay|play again)$/.test(normalized)) return { action: 'restart' };

    const seekForward = normalized.match(/^(seek\s+)?(forward|ahead)\s+(\d+)\s*(second|seconds|sec|s)?$/);
    if (seekForward) return { action: 'seek-delta', seconds: Number.parseInt(seekForward[3], 10) };

    const seekBack = normalized.match(/^(seek\s+)?(back|backward)\s+(\d+)\s*(second|seconds|sec|s)?$/);
    if (seekBack) return { action: 'seek-delta', seconds: -Number.parseInt(seekBack[3], 10) };

    if (/^(mute|mute video|sound off)$/.test(normalized)) return { action: 'mute' };
    if (/^(unmute|unmute video|sound on)$/.test(normalized)) return { action: 'unmute' };
    if (/^(volume up|increase volume|louder)$/.test(normalized)) return { action: 'volume-delta', delta: 0.1 };
    if (/^(volume down|decrease volume|quieter)$/.test(normalized)) return { action: 'volume-delta', delta: -0.1 };

    const setVolume = normalized.match(/^(?:set|change)?\s*volume\s*(?:to\s*)?(\d{1,3})(?:\s*percent)?$/);
    if (setVolume) return { action: 'volume-set', percent: Number.parseInt(setVolume[1], 10) };

    if (/^(?:(?:switch|set|go|change|turn|move)(?:\s+mode)?(?:\s+to)?\s+)?cloud(?:\s+mode)?$|^to\s+cloud$/.test(normalized)) {
      return { action: 'mode-cloud' };
    }
    if (/^(?:(?:switch|set|go|change|turn|move)(?:\s+mode)?(?:\s+to)?\s+)?brain(?:\s+mode)?$|^to\s+brain$/.test(normalized)) {
      return { action: 'mode-brain' };
    }
    if (/^(?:(?:switch|set|go|change|turn|move)(?:\s+mode)?(?:\s+to)?\s+)?(?:dict|dictionary)(?:\s+mode)?$|^to\s+(?:dict|dictionary)$/.test(normalized)) {
      return { action: 'mode-dict' };
    }

    const spokenTrainMatch = normalized.match(/^(?:(?:brain\s+)?train(?:ing)?|train\s+brain|training\s+brain)(?:\s+for)?\s+(\d+(?:\.\d+)?)$/i);
    if (spokenTrainMatch) {
      return { action: 'train-brain', minutes: Number.parseFloat(spokenTrainMatch[1]), spokenText: normalized };
    }

    const spokenLocalTrainMatch = normalized.match(/^(?:(?:local|gemma)(?:\s+(?:brain|training|train))?|(?:train|training)\s+(?:local|gemma))(?:\s+for)?\s+(\d+(?:\.\d+)?)$/i);
    if (spokenLocalTrainMatch) {
      return { action: 'train-local', minutes: Number.parseFloat(spokenLocalTrainMatch[1]), spokenText: normalized };
    }

    const gemmaRegex = /(?:activate|active|play|switch to|use|load|start|run|sweet)?\s*(gemma|gamer|jema|jama|gama|jemima|ranjema|gamma)(?:\s+model|3)?/i;
    if (gemmaRegex.test(normalized)) return { action: 'mode-gemma' };

    const miniRegex = /^(?:switch\s+to\s+)?(?:phi(?:\s*4)?[\s-]?mini|mini(?:\s+model)?)$/i;
    if (miniRegex.test(normalized)) return { action: 'set-model', model: 'phi4-mini' };

    if (/^(clear chat|reset chat)$/.test(normalized)) return { action: 'clear-chat' };
    if (/^(clear cache|reset cache)$/.test(normalized)) return { action: 'clear-cache' };

    if (/^(anti gravity on|anti-gravity on|gravity off)$/.test(normalized)) return { action: 'antigravity-on' };
    if (/^(anti gravity off|anti-gravity off|gravity normal)$/.test(normalized)) return { action: 'antigravity-off' };
    if (/^(reset scene|scene reset)$/.test(normalized)) return { action: 'reset-scene' };
    if (/^(fullscreen on|enter fullscreen)$/.test(normalized)) return { action: 'fullscreen-on' };
    if (/^(fullscreen off|exit fullscreen)$/.test(normalized)) return { action: 'fullscreen-off' };

    if (/^(open playlist|show playlist|view playlist|playlist)$/.test(normalized)) return { action: 'playlist-open' };
    if (/^(close playlist|hide playlist)$/.test(normalized)) return { action: 'playlist-close' };
    if (/^(show chat|open chat|view chat|chat)$/.test(normalized)) return { action: 'chat-show' };
    if (/^(hide chat|close chat)$/.test(normalized)) return { action: 'chat-hide' };

    if (/^(repeat|repeat last|repeat chat|repeat last chat|repeat last free chat|say again)$/.test(normalized)) {
      return { action: 'repeat-last-free-chat' };
    }

    if (
      /^(?:(?:please|can\s+you|could\s+you|would\s+you|will\s+you|just|hey|ok|okay)\s+)*(?:(?:take|tank|tech|capture|grab|snap)\s+(?:an?\s+|the\s+)?(?:image|snapshot|picture|photo)|(?:snapshot|photo|picture))(?:\s+(?:please|now))?$/.test(normalized)
    ) {
      return { action: 'take-image' };
    }

    const bendMode = normalized.match(/^bend mode\s*([0-3])$/);
    if (bendMode) return { action: 'bend-mode', mode: Number.parseInt(bendMode[1], 10) };
    if (/^(increase bend radius|bend radius up)$/.test(normalized)) return { action: 'bend-radius-delta', delta: 0.5 };
    if (/^(decrease bend radius|bend radius down)$/.test(normalized)) return { action: 'bend-radius-delta', delta: -0.5 };

    return null;
  }

  function setPlaybackState(shouldPlay) {
    const vm = scene3d?.getVideoMesh?.();
    if (!vm) return false;

    if (!!vm.isPlaying !== shouldPlay) {
      const playing = vm.togglePlayback();
      if (bgAudioActive) {
        if (playing) bgAudio.play().catch(() => { });
        else bgAudio.pause();
      }
    }

    renderPlayPauseButton(shouldPlay);
    return true;
  }

  function setMuteState(shouldMute) {
    const vm = scene3d?.getVideoMesh?.();
    if (!vm) return false;

    if (bgAudioActive) {
      bgAudio.muted = shouldMute;
      if (btnMute) safeSetText(btnMute, shouldMute ? '🔇' : '🔊');
      return true;
    }

    if (!vm.videoElement) return false;
    vm.videoElement.muted = shouldMute;
    if (btnMute) safeSetText(btnMute, shouldMute ? '🔇' : '🔊');
    return true;
  }

  function setVolumeByPercent(percent) {
    const vm = scene3d?.getVideoMesh?.();
    if (!vm) return false;
    const clamped = Math.max(0, Math.min(100, percent));
    const volume = clamped / 100;

    if (bgAudioActive) {
      bgAudio.volume = volume;
      bgAudio.muted = volume <= 0;
      if (btnMute) safeSetText(btnMute, bgAudio.muted ? '🔇' : '🔊');
      return true;
    }

    if (!vm.videoElement) return false;
    vm.videoElement.volume = volume;
    vm.videoElement.muted = volume <= 0;
    if (btnMute) safeSetText(btnMute, vm.videoElement.muted ? '🔇' : '🔊');
    return true;
  }

  function adjustVolume(delta) {
    const vm = scene3d?.getVideoMesh?.();
    if (!vm) return false;

    if (bgAudioActive) {
      const next = Math.max(0, Math.min(1, bgAudio.volume + delta));
      bgAudio.volume = next;
      bgAudio.muted = next <= 0;
      if (btnMute) safeSetText(btnMute, bgAudio.muted ? '🔇' : '🔊');
      return true;
    }

    if (!vm.videoElement) return false;
    const next = Math.max(0, Math.min(1, vm.videoElement.volume + delta));
    vm.videoElement.volume = next;
    vm.videoElement.muted = next <= 0;
    if (btnMute) safeSetText(btnMute, vm.videoElement.muted ? '🔇' : '🔊');
    return true;
  }

  function setPlaylistCollapsed(collapsed) {
    if (!playlistPanel || !btnClosePlaylist) return false;
    playlistPanel.classList.toggle('playlist-collapsed', collapsed);
    btnClosePlaylist.textContent = collapsed ? '▸' : '▾';
    btnClosePlaylist.title = collapsed ? 'Expand playlist' : 'Collapse playlist';
    return true;
  }

  async function switchConversationSurfaceMode(mode = 'chat', options = {}) {
    if (!publicPodcastAiEnabled) return false;

    const targetMode = mode === 'podcast' ? 'podcast' : 'chat';
    const shouldStopListening = options?.stopListening !== false;
    const shouldAnnounce = options?.announce !== false;
    const wasSelectedMode = selectedConversationSurfaceMode === 'podcast' ? 'podcast' : 'chat';
    const wasPodcastActive = isPodcastConversationSurfaceActive();
    const micWasLive = Boolean(voiceManager?.isListening || voiceManager?.keepListening || isVoiceSessionActive);
    const shouldAutoStartChatMic = Boolean(
      targetMode === 'chat'
      && (options?.autoStartMic === true || (options?.autoStartMic !== false && wasSelectedMode === 'podcast'))
    );

    if (targetMode === 'podcast' && wasSelectedMode === 'podcast' && wasPodcastActive) {
      pendingFreeChatMicActivation = false;
      revealAiChatPanel({ focusInput: false });
      updateConversationModeUi();
      return true;
    }

    if (targetMode === 'chat' && wasSelectedMode === 'chat' && !wasPodcastActive && !hasPodcastGuestStageLiveState() && !micWasLive) {
      pendingFreeChatMicActivation = false;
      revealAiChatPanel({ focusInput: false });
      updateConversationModeUi();
      return true;
    }

    try {
      if (voiceManager?.synthesis?.speaking || voiceManager?.synthesis?.pending) {
        voiceManager.synthesis.cancel();
      }
    } catch {
      // noop
    }

    if (shouldStopListening && (voiceManager?.isListening || voiceManager?.keepListening)) {
      await (voiceManager.stopListening?.() ?? voiceManager.toggleListening?.());
    }

    if (shouldStopListening) {
      isVoiceSessionActive = false;
      clearPodcastGuestMicAutoStopTimer();
      setInlineActivity('');
      setAiSpeechStateChip('Mic idle');
      if (btnVoiceMic) {
        btnVoiceMic.classList.remove('listening');
        safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      }
    }

    if (targetMode === 'podcast') {
      pendingFreeChatMicActivation = false;
      selectedConversationSurfaceMode = 'podcast';
      podcastGuestFloorActive = false;
      if (podcastEngine) {
        podcastEngine.guestFloorActive = false;
      }
      clearPodcastGuestMicAutoStopTimer();
      updateConversationModeUi();
      revealAiChatPanel({ focusInput: false });
      if (wasPodcastActive) {
        return true;
      }
      const started = await startPublicPodcastAiConversation({ source: options?.source || 'mode-switch' });
      if (!started) {
        selectedConversationSurfaceMode = 'chat';
        updateConversationModeUi();
        return false;
      }
      if (shouldAnnounce && wasSelectedMode !== 'podcast' && targetMode !== 'podcast') {
        announceConversationSurfaceMode('podcast');
      }
      return started;
    }

    selectedConversationSurfaceMode = 'chat';
    updateConversationModeUi();
    revealAiChatPanel({ focusInput: false });
    clearPodcastGuestMicAutoStopTimer();
    podcastGuestReplyInFlight = false;
    podcastGuestFloorActive = false;
    if (podcastEngine) {
      podcastEngine.guestFloorActive = false;
    }
    if (isPodcastConversationSurfaceActive()) {
      stopPublicPodcastAiConversation();
    }
    podcastGuestIntroAnnounced = false;
    podcastGuestWaitCueAnnounced = false;
    if (shouldAnnounce && (wasSelectedMode !== 'chat' || wasPodcastActive || micWasLive)) {
      announceConversationSurfaceMode('chat');
    }
    if (shouldAutoStartChatMic) {
      pendingFreeChatMicActivation = true;
      setTimeout(() => {
        if (!pendingFreeChatMicActivation) return;
        void startFreeChatMicSession({ silentFailure: true });
      }, 80);
    } else {
      pendingFreeChatMicActivation = false;
    }
    return true;
  }

  async function startFreeChatMicSession(options = {}) {
    if (!voiceManager || isPodcastGuestParticipationEnabled()) {
      pendingFreeChatMicActivation = false;
      return false;
    }
    if (!voiceManager.isRecognitionSupported) {
      pendingFreeChatMicActivation = false;
      if (!options?.silentFailure) {
        showAiSpeech('Mic unavailable in this browser. Use Chrome/Edge and allow microphone access.', false);
        appendChatMessage('assistant', 'Mic is unavailable here. Voice input needs SpeechRecognition support (Chrome/Edge on localhost or HTTPS).');
      }
      return false;
    }
    if (voiceManager?.isListening || voiceManager?.keepListening) {
      pendingFreeChatMicActivation = false;
      return true;
    }

    isVoiceSessionActive = true;
    disableAntiGravityForMic();

    await new Promise((resolve) => setTimeout(resolve, MIC_START_DELAY_MS));

    const toggled = await (voiceManager.startListening?.() ?? voiceManager.toggleListening());
    if (!toggled) {
      pendingFreeChatMicActivation = false;
      isVoiceSessionActive = false;
      if (!options?.silentFailure && !voiceManager._isBrave) {
        showAiSpeech('Could not start microphone. Check browser permissions (click ?? in address bar ? allow mic).', false);
      }
      if (btnVoiceMic) {
        btnVoiceMic.classList.remove('listening');
        safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      }
      return false;
    }

    pendingFreeChatMicActivation = false;
    if (btnVoiceMic) {
      btnVoiceMic.classList.add('listening');
      safeSetText(btnVoiceMic.querySelector('.btn-label'), 'Starting mic...');
    }
    return true;
  }

  async function executeGeneralVoiceCommand(command) {
    if (!command) return false;

    const vm = scene3d?.getVideoMesh?.();

    switch (command.action) {
      case 'pause':
        return setPlaybackState(false);
      case 'resume':
        return setPlaybackState(true);
      case 'restart':
        if (!vm?.videoElement) return false;
        vm.videoElement.currentTime = 0;
        return setPlaybackState(true);
      case 'seek-delta': {
        if (!vm?.videoElement || !Number.isFinite(vm.videoElement.duration)) return false;
        const duration = vm.videoElement.duration || 0;
        const current = vm.videoElement.currentTime || 0;
        const next = Math.max(0, Math.min(duration, current + (command.seconds || 0)));
        vm.videoElement.currentTime = next;
        return true;
      }
      case 'mute':
        return setMuteState(true);
      case 'unmute':
        return setMuteState(false);
      case 'volume-delta':
        return adjustVolume(command.delta || 0);
      case 'volume-set':
        return setVolumeByPercent(command.percent || 0);
      case 'mode-cloud':
        switchToAiMode('cloud');
        return true;
      case 'mode-brain':
        switchToAiMode('brain');
        return true;
      case 'mode-dict':
        switchToAiMode('dict');
        return true;
      case 'mode-gemma':
        await switchToAiMode('gemma');
        return true;
      case 'mode-podcast':
        return await switchConversationSurfaceMode('podcast', { source: 'voice-command' });
      case 'mode-chat':
        return await switchConversationSurfaceMode('chat', { source: 'voice-command' });
      case 'take-image':
        return appendSnapshotCaptureMessage({ text: 'Image captured.' });
      case 'train-brain':
        if (!voiceManager?.trainBrainFromCloud) return false;
        await runSelectedModeTraining(command.minutes || 5, { source: 'voice command', echoCommand: command.spokenText || null });
        return true;
      case 'train-local':
        if (!voiceManager?.trainBrainLocally) return false;
        await runLocalBrainTraining(command.minutes || 5, { echoCommand: command.spokenText || null });
        return true;
      case 'set-model':
        if (voiceManager && typeof voiceManager.setLocalBrainModel === 'function') {
          const ok = await voiceManager.setLocalBrainModel(command.model);
          if (ok) {
            voiceManager.setPreferredMode?.('brain');
            voiceManager.onAiEngineChange?.('ollama-ready');
            voiceManager.speak(`Model switched to ${command.model}`);
            if (aiChatStatus) aiChatStatus.textContent = `Active model set to ${command.model}`;
            if (aiChatMessages) {
               const msg = document.createElement('div');
               msg.className = 'chat-message system-message';
               msg.textContent = `[System] Switched brain model to ${command.model}`;
               msg.style.color = '#888';
               msg.style.fontStyle = 'italic';
               aiChatMessages.appendChild(msg);
               aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
            }
          } else {
            console.error(`Failed to load ${command.model} via fetch. Is Ollama reachable locally and CORS limited to this site origin?`);
            voiceManager.speak(`Connecting to ${command.model} failed. Check your Ollama setup and this site origin permission.`);
            if (aiChatStatus) aiChatStatus.textContent = `Failed to set model to ${command.model} - Is Ollama running and scoped to this site origin?`;
          }
          return true; // Return true so it doesn't log a warning
        }
        return false;
      case 'clear-chat':
        if (aiChatMessages) aiChatMessages.innerHTML = '';
        if (aiChatInput) aiChatInput.value = '';
        if (suggestionEngine) suggestionEngine.hide();
        renderChatStatus();
        return true;
      case 'clear-cache': {
        const count = voiceManager?.clearCache?.() ?? 0;
        if (aiChatStatus) aiChatStatus.textContent = `Cleared ${count} cached response${count !== 1 ? 's' : ''}.`;
        return true;
      }
      case 'antigravity-on':
        isAntiGravity = true;
        autoAntiGravityActive = false;
        scene3d.setAntiGravity(true);
        updateAntiGravityUI(true);
        updateAntiGravityGestureButton();
        return true;
      case 'antigravity-off':
        isAntiGravity = false;
        autoAntiGravityActive = false;
        scene3d.setAntiGravity(false);
        updateAntiGravityUI(false);
        updateAntiGravityGestureButton();
        return true;
      case 'reset-scene':
        scene3d.reset?.();
        return true;
      case 'fullscreen-on':
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
        return true;
      case 'fullscreen-off':
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        return true;
      case 'playlist-open':
        return setPlaylistCollapsed(false);
      case 'playlist-close':
        return setPlaylistCollapsed(true);
      case 'chat-show':
        if (!aiChatPanel) return false;
        aiChatPanel.classList.remove('hidden');
        return true;
      case 'chat-hide':
        if (!aiChatPanel) return false;
        aiChatPanel.classList.add('hidden');
        return true;
      case 'repeat-last-free-chat':
        stopPodcastAndRepeatLastFreeChat();
        return true;
      case 'bend-mode': {
        if (!vm) return false;
        const mode = Number.isFinite(command.mode) ? command.mode : 0;
        vm.setBendMode(mode);
        return true;
      }
      case 'bend-radius-delta': {
        if (!vm) return false;
        const current = vm.bendRadius || 4;
        const next = Math.max(1, Math.min(10, current + (command.delta || 0)));
        vm.setBendRadius(next);
        return true;
      }
      default:
        return false;
    }
  }

  function setActivePlaylistItem(index) {
    if (!playlistItems) return;
    const nodes = playlistItems.querySelectorAll('.playlist-item');
    nodes.forEach((node) => node.classList.remove('active'));
    const activeNode = playlistItems.querySelector(`.playlist-item[data-index="${index}"]`);
    if (activeNode) activeNode.classList.add('active');
  }

  function findPlaylistIndex(file) {
    const byRef = playlistFiles.indexOf(file);
    if (byRef >= 0) return byRef;

    const name = String(file?.name || '').trim();
    const path = String(file?.path || '').trim();
    return playlistFiles.findIndex((entry) => {
      const sameName = name && String(entry?.name || '').trim() === name;
      const samePath = path && String(entry?.path || '').trim() === path;
      return sameName || samePath;
    });
  }
      updateGemmaModeAvailability();

  async function playPlaylistIndex(index) {
        updateGemmaModeAvailability();
    if (!playlistFiles.length) return { ok: false, reason: 'empty' };
    if (index < 0 || index >= playlistFiles.length) return { ok: false, reason: 'out-of-range' };

    currentPlaylistIndex = index;
    const file = playlistFiles[index];
    setActivePlaylistItem(index);
    await playMovie(file);
    return { ok: true, file, index };
  }

  function renderChatStatus() {
    if (!aiChatStatus) return;
    if (chatInlineActivity === 'listening' || chatInlineActivity === 'thinking') {
      const label = chatInlineActivity === 'listening' ? 'Hearing' : 'Thinking';
      aiChatStatus.classList.add('activity');
      aiChatStatus.innerHTML = `<span class="status-inline">${label}<span class="status-dots"><i></i><i></i><i></i></span></span>`;
      syncChatStatusTooltip();
      return;
    }
    if (chatInlineActivity === 'resuming') {
      aiChatStatus.classList.add('activity', 'activity-resuming');
      aiChatStatus.innerHTML = `<span class="status-inline">&#9654; Host A returning<span class="status-dots"><i></i><i></i><i></i></span></span>`;
      syncChatStatusTooltip();
      return;
    }
    if (chatInlineActivity === 'podcast-thinking') {
      aiChatStatus.classList.add('activity', 'activity-podcast-thinking');
      aiChatStatus.innerHTML = `<span class="status-inline">&#9670; thinking<span class="status-dots"><i></i><i></i><i></i></span></span>`;
      syncChatStatusTooltip();
      return;
    }
    aiChatStatus.classList.remove('activity-resuming');
    aiChatStatus.classList.remove('activity-podcast-thinking');
    aiChatStatus.classList.remove('activity');
    aiChatStatus.textContent = baseChatStatusText;
    syncChatStatusTooltip();
  }

  function shouldShowListeningInlineActivity() {
    if (!voiceManager) return false;
    if (voiceManager?.micStarting || voiceManager?.isListening || voiceManager?.keepListening) {
      return true;
    }
    return Boolean(
      isVoiceSessionActive
      && btnVoiceMic?.classList.contains('listening')
      && (!isPodcastGuestParticipationEnabled() || podcastGuestMicWindowActive || podcastGuestFloorActive)
    );
  }

  function setInlineActivity(mode = '') {
    if (chatInlineActivityClearTimer) {
      clearTimeout(chatInlineActivityClearTimer);
      chatInlineActivityClearTimer = null;
    }

    if (mode) {
      chatInlineActivity = mode;
      chatInlineActivityStartedAt = Date.now();
      renderChatStatus();
      return;
    }

    const minVisibleMs = 350;
    const elapsed = Date.now() - chatInlineActivityStartedAt;
    if (elapsed < minVisibleMs) {
      chatInlineActivityClearTimer = setTimeout(() => {
        chatInlineActivity = shouldShowListeningInlineActivity() ? 'listening' : '';
        if (chatInlineActivity) chatInlineActivityStartedAt = Date.now();
        renderChatStatus();
      }, minVisibleMs - elapsed);
      return;
    }

    chatInlineActivity = shouldShowListeningInlineActivity() ? 'listening' : '';
    if (chatInlineActivity) chatInlineActivityStartedAt = Date.now();
    renderChatStatus();
  }

  function setSecretTrainVisible(visible) {
    document.body.classList.toggle('secret-train-unlocked', Boolean(visible));
    if (!visible) {
      if (secretTrainRevealTimer) {
        clearTimeout(secretTrainRevealTimer);
        secretTrainRevealTimer = null;
      }
      secretTrainTapCount = 0;
    }
  }

  function pulseSecretTrainReveal() {
    setSecretTrainVisible(true);
    if (secretTrainRevealTimer) clearTimeout(secretTrainRevealTimer);
    secretTrainRevealTimer = setTimeout(() => {
      if (!brainTrainingInFlight) setSecretTrainVisible(false);
    }, 15000);
  }

  function updateSecretPodcastButtonState() {
    if (!btnSecretPodcast) return;
    btnSecretPodcast.classList.toggle('active', podcastTrainingEnabled);
    btnSecretPodcast.textContent = podcastTrainingEnabled ? '??' : '??';
    btnSecretPodcast.title = podcastTrainingEnabled ? 'Secret podcast mode on' : 'Secret podcast mode off';
    updateConversationModeUi();
  }

  function syncTrainingPushToTalkMode() {
    voiceManager?.setPushToTalkMode?.(
      isPodcastGuestParticipationEnabled() && (podcastGuestFloorActive || podcastGuestMicWindowActive || podcastGuestReplyInFlight)
        ? true
        : brainTrainingInFlight,
      isPodcastGuestParticipationEnabled() && (podcastGuestFloorActive || podcastGuestMicWindowActive || podcastGuestReplyInFlight)
        ? { profile: 'guest' }
        : brainTrainingInFlight
          ? { profile: 'training' }
          : {}
    );
  }

  function isWeakPodcastGuestTranscript(text = '', recognitionMeta = {}) {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    const confidence = Number(recognitionMeta?.confidence);
    const confidenceKnown = recognitionMeta?.confidenceKnown !== false && Number.isFinite(confidence);
    if (confidenceKnown && confidence < 0.72) return true;
    if (wordCount <= 2) return true;
    if (wordCount <= 3 && normalized.length <= 18) return true;
    return false;
  }

  function clearPodcastModeRestoreTimer({ restoreNow = false } = {}) {
    const restoreMode = podcastModeRestoreMode;
    if (podcastModeRestoreTimer) {
      clearTimeout(podcastModeRestoreTimer);
      podcastModeRestoreTimer = null;
    }
    podcastModeRestoreMode = null;
    if (restoreNow && restoreMode) {
      voiceManager.setPreferredMode?.(restoreMode);
      _modeDetailsState.engine = restoreMode === 'cloud'
        ? 'cloud'
        : restoreMode === 'gemma'
          ? (voiceManager?._ollamaAvailable === true ? 'ollama' : 'dict')
          : 'dict';
      setAiModeIndicator(restoreMode);
    }
  }

  function resetPodcastNarrationQueue(options = {}) {
    const { cancelActive = false, restoreMode = false, fullReset = false } = options;
    clearPodcastModeRestoreTimer({ restoreNow: restoreMode });
    if (podcastGuestResumeTimer) {
      clearTimeout(podcastGuestResumeTimer);
      podcastGuestResumeTimer = null;
    }
    lastPodcastGuestMicAckAt = 0;
    podcastEngine.reset({ newSession: true });
    if (fullReset) {
      podcastBatchHighlights = new Map();
      podcastNarratedBatchCount = 0;
      podcastNarratedBatchNumbers = new Set();
    }
    podcastBrainCheckpointBusy = false;
    podcastGuestFloorActive = false;
    podcastEngine.guestFloorActive = false;
    podcastGuestInterjectionCount = 0;
    podcastGuestIntroAnnounced = false;
    podcastGuestWaitCueAnnounced = false;
    pendingPodcastStartReplyLines = [];
    // podcastNarrationSessionId managed by engine
    lastPodcastChatLine = '';
    // Carry over history across mode switches unless full reset
    if (fullReset) {
      lastPodcastHostQuestionLine = '';
      lastPodcastHostAnswerLine = '';
      recentPodcastHostQuestionLines = [];
      recentPodcastHostAnswerLines = [];
    }
    if (cancelActive && voiceManager?.synthesis?.speaking) {
      try {
        voiceManager.synthesis.cancel();
      } catch {
        // noop
      }
    }
  }

  function replacePodcastNarration(lines = []) {
    resetPodcastNarrationQueue({ cancelActive: true, restoreMode: true });
    if (!podcastTrainingEnabled) return;
    
    const normalizedLines = Array.isArray(lines) ? lines : [];
    if (!normalizedLines.length) return;

    normalizedLines.forEach(line => {
      podcastEngine.queueLine(line.text, line.speaker || 'hostA', { force: true, logMeta: line?.logMeta || null });
    });
  }

  function injectPodcastNarration(lines = [], options = {}) {
    if (!podcastTrainingEnabled) return;
    const { cancelActive = false, prioritize = true, force = true } = options;
    
    const normalizedLines = Array.isArray(lines) ? lines : [];
    if (!normalizedLines.length) return;

    if (cancelActive && voiceManager?.synthesis?.speaking) {
      podcastEngine.isSpeaking = false;
      try {
        voiceManager.synthesis.cancel();
      } catch {
        // noop
      }
    }

    if (typeof podcastEngine?.queueLines === 'function') {
      podcastEngine.queueLines(normalizedLines, { prioritize, force });
      return;
    }

    const orderedLines = prioritize ? normalizedLines.slice().reverse() : normalizedLines;
    orderedLines.forEach(line => {
      podcastEngine.queueLine(line.text, line.speaker || 'hostA', { prioritize, force, logMeta: line?.logMeta || null });
    });
  }

  function clearPendingPodcastNarration(options = {}) {
    const { cancelActive = false } = options;
    if (podcastGuestResumeTimer) {
      clearTimeout(podcastGuestResumeTimer);
      podcastGuestResumeTimer = null;
    }
    podcastEngine?.clearQueue?.();
    if (cancelActive && voiceManager?.synthesis?.speaking) {
      try {
        voiceManager.synthesis.cancel();
      } catch {
        // noop
      }
    }
  }

  function schedulePodcastGuestResume(lines = [], options = {}) {
    if (podcastGuestResumeTimer) {
      clearTimeout(podcastGuestResumeTimer);
      podcastGuestResumeTimer = null;
    }

    const normalizedLines = Array.isArray(lines)
      ? lines
        .map((line) => ({
          text: String(line?.text || '').trim(),
          speaker: line?.speaker || 'hostA'
        }))
        .filter((line) => line.text)
      : [];

    if (!normalizedLines.length) {
      podcastGuestFloorActive = false;
      podcastEngine.guestFloorActive = false;
      updatePublicPodcastAiButtonState();
      return;
    }

    const delayMs = Math.max(900, Number(options?.delayMs || PODCAST_GUEST_RESUME_DELAY_MS));
    podcastGuestResumeTimer = setTimeout(() => {
      podcastGuestResumeTimer = null;
      podcastGuestFloorActive = false;
      podcastEngine.guestFloorActive = false;
      injectPodcastNarration(normalizedLines, { cancelActive: false, prioritize: true, force: false });
      updatePublicPodcastAiButtonState();
      if (!voiceManager?.synthesis?.speaking) {
        setTimeout(() => drainPodcastNarrationQueue(), 30);
      }
    }, delayMs);
    updatePublicPodcastAiButtonState();
  }

  function isPodcastGuestRecoveryWindowActive() {
    return podcastGuestReplyInFlight
      || podcastGuestFloorActive
      || Boolean(podcastGuestResumeTimer)
      || ((Date.now() - Number(lastPodcastGuestReplyAt || 0)) < PODCAST_GUEST_FAILURE_SILENCE_MS);
  }

  function getLatestPublicPodcastGuestDirective(maxAgeMs = 120000) {
    const latest = publicPodcastGuestDirective;
    if (!latest) return null;
    const prompt = String(latest?.input || '').trim();
    const response = String(latest?.response || '').trim();
    if (!prompt || !response) return null;
    // Skip TTL expiry while podcast is actively running · directive lives for the session
    const podcastActive = Boolean(publicPodcastAiEnabled && publicPodcastAiAutoMode);
    if (!podcastActive) {
      const recordedAt = Math.max(0, Number(latest?.at || 0));
      if (recordedAt && (Date.now() - recordedAt) > Math.max(1000, Number(maxAgeMs || 0))) {
        publicPodcastGuestDirective = null;
        return null;
      }
    }
    // Decrement uses · clear when exhausted so it doesn't loop forever
    const usesLeft = Math.max(0, Number(latest.usesRemaining ?? 1));
    if (usesLeft <= 1) {
      publicPodcastGuestDirective = null;
    } else {
      publicPodcastGuestDirective = { ...latest, usesRemaining: usesLeft - 1 };
    }
    return {
      input: prompt,
      response,
      source: String(latest?.source || '').trim(),
      at: Number(latest?.at || 0)
    };
  }

  function pausePodcastForGuestFloor() {
    clearPendingPodcastNarration({ cancelActive: true });
    podcastGuestFloorActive = true;
    podcastEngine.guestFloorActive = true;
    syncTrainingPushToTalkMode();
    updatePublicPodcastAiButtonState();
  }

  function releasePodcastGuestFloor({ resume = true, delayMs = 120 } = {}) {
    if (!podcastGuestFloorActive && !podcastEngine?.guestFloorActive) return;
    podcastGuestFloorActive = false;
    if (podcastEngine) {
      podcastEngine.guestFloorActive = false;
    }
    syncTrainingPushToTalkMode();
    if (resume) {
      setTimeout(() => drainPodcastNarrationQueue(true), Math.max(0, Number(delayMs || 0)));
    }
    updatePublicPodcastAiButtonState();
  }

  function finalizePodcastGuestReplyResume(delayMs = 0) {
    const nextDelayMs = Math.max(0, Number(delayMs || podcastGuestPendingResumeDelayMs || 0));
    podcastGuestPendingResumeDelayMs = 0;
    releasePodcastGuestFloor({ resume: false });
    // Show 'Host A returning' only in the status bar (avoids sticky speech panel)
    setInlineActivity('resuming');
    setTimeout(() => setInlineActivity(''), Math.min(nextDelayMs + 400, 2200));
    schedulePublicPodcastAiContinue(nextDelayMs);
  }

  function clearPodcastGuestMicAutoStopTimer() {
    if (podcastGuestMicAutoStopTimer) {
      clearTimeout(podcastGuestMicAutoStopTimer);
      podcastGuestMicAutoStopTimer = null;
    }
    podcastGuestMicWindowActive = false;
    syncTrainingPushToTalkMode();
  }

  function resetPodcastGuestCueState() {
    lastPodcastGuestMicAckAt = 0;
    lastPodcastGuestMicManualRequestAt = 0;
  }

  function schedulePodcastGuestMicAutoStop(durationMs) {
    const ms = (durationMs != null) ? Math.max(1000, Number(durationMs)) : PODCAST_GUEST_MIC_WINDOW_MS;
    clearPodcastGuestMicAutoStopTimer();
    if (!isPodcastGuestParticipationEnabled()) return;
    podcastGuestMicWindowActive = true;
    syncTrainingPushToTalkMode();
    podcastGuestMicAutoStopTimer = setTimeout(async () => {
      podcastGuestMicAutoStopTimer = null;
      podcastGuestMicWindowActive = false;
      resetPodcastGuestCueState();
      if (btnVoiceMic) {
        btnVoiceMic.classList.remove('listening');
        safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      }
      isVoiceSessionActive = false;
      setInlineActivity('');
      if (voiceManager?.isListening || voiceManager?.keepListening) {
        await (voiceManager.stopListening?.() ?? voiceManager.toggleListening());
      }
      if (!podcastGuestReplyInFlight && !podcastGuestResumeTimer) {
        releasePodcastGuestFloor({ resume: true, delayMs: 120 });
      }
    }, ms);
  }

  function stopPodcastGuestPtt() {
    if (!podcastGuestPttHeld) return;
    podcastGuestPttHeld = false;
    clearPodcastGuestMicAutoStopTimer();
    if (podcastGuestPttTailTimer) { clearTimeout(podcastGuestPttTailTimer); podcastGuestPttTailTimer = null; }
    podcastGuestPttTailTimer = setTimeout(async () => {
      podcastGuestPttTailTimer = null;
      podcastGuestMicWindowActive = false;
      resetPodcastGuestCueState();
      if (btnVoiceMic) {
        btnVoiceMic.classList.remove('listening');
        safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      }
      isVoiceSessionActive = false;
      setInlineActivity('');
      syncTrainingPushToTalkMode();
      if (voiceManager?.isListening || voiceManager?.keepListening) {
        await (voiceManager.stopListening?.() ?? voiceManager.toggleListening());
      }
      if (!podcastGuestReplyInFlight && !podcastGuestResumeTimer) {
        releasePodcastGuestFloor({ resume: true, delayMs: 120 });
      }
    }, PODCAST_GUEST_PTT_TAIL_MS);
  }

  function attachPodcastAutoLogMeta(lines = [], options = {}) {
    const currentMovie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    const rawMode = String(options?.selectedMode || getPodcastReplyMode() || 'brain').toLowerCase();
    // Show the actual model name (MINI/GEMMA3/GEMMA4) instead of the generic 'GEMMA' mode label
    const _resolveGemmaLabel = (modelName) => {
      if (/phi4?[-\s]?mini/i.test(modelName)) return 'MINI';
      if (/bonsai/i.test(modelName)) return 'BONSAI';
      if (/^gemma4(?::|$)/i.test(modelName)) return 'GEMMA4';
      if (/^gemma3(?::|$)/i.test(modelName)) return 'GEMMA3';
      return 'GEMMA';
    };
    let selectedMode;
    if (rawMode === 'gemma') {
      const localModelName = voiceManager?.getLocalBrainModelName?.() || '';
      selectedMode = _resolveGemmaLabel(localModelName);
    } else {
      selectedMode = rawMode.toUpperCase();
    }
    const defaultSourceLabel = String(options?.sourceLabel || 'FILM TEMPLATE').trim() || 'FILM TEMPLATE';
    const defaultRawEngine = String(options?.engine || 'dict').trim().toLowerCase() || 'dict';
    // In brain/gemma/mini/bonsai modes, DICT is the stored brain knowledge · not a fallback.
    // Show as 'brain-reply' so the log reads BRAIN-REPLY instead of DICT.
    const isBrainMode = rawMode === 'brain' || rawMode === 'gemma';
    const engine = (defaultRawEngine === 'dict' && isBrainMode) ? 'brain-reply' : defaultRawEngine;
    // When the actual engine that answered is ollama (local), override the selectedMode label
    // to show the real model (MINI/GEMMA/BRAIN) · not whatever the original mode setting was.
    // e.g. "selected CLOUD · source Mini AFTER CLOUD" becomes "selected MINI · source Mini AFTER CLOUD"
    if (defaultRawEngine === 'ollama') {
      const localModelName = voiceManager?.getLocalBrainModelName?.() || '';
      selectedMode = _resolveGemmaLabel(localModelName);
    }
    return (Array.isArray(lines) ? lines : []).map((line) => {
      const text = String(line?.text || '').trim();
      if (!text) return line;
      const lineSourceLabel = String(line?.logMeta?.sourceLabel || defaultSourceLabel).trim() || defaultSourceLabel;
      const lineRawEngine = String(line?.logMeta?.engine || engine).trim().toLowerCase() || engine;
      const lineEngine = (lineRawEngine === 'dict' && isBrainMode) ? 'brain-reply' : lineRawEngine;
      
      // Persist to recent blocklist to prevent immediate repetition
      if (line.speaker === 'hostB') {
        recentPodcastHostAnswerLines = rememberRecentPodcastLine(recentPodcastHostAnswerLines, text);
      } else {
        recentPodcastHostQuestionLines = rememberRecentPodcastLine(recentPodcastHostQuestionLines, text);
      }
      
      const speaker = String(line?.speaker || 'hostA') === 'hostB' ? getPodcastMuseName() : 'Host A';
      return {
        ...line,
        logMeta: {
          ...line.logMeta,
          engine: lineEngine,
          movie: currentMovie,
          input: `Podcast AI auto · ${speaker} · selected ${selectedMode} · source ${lineSourceLabel}`,
          output: text,
          audio: true
        }
      };
    });
  }

  function buildPodcastAutoSeed(turnNumber = 1) {
    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    const snapshot = getLatestPodcastBatchSnapshot();
    const ctx = getFilmContext(currentMovie || '');
    const latestItem = Array.isArray(snapshot?.items) ? snapshot.items[0] : null;
    const seedPrompt = String(latestItem?.input || '').trim()
      || (ctx?.anchors?.length ? `What keeps returning around ${ctx.anchors[Math.abs(hashPromptSeed(`${turnNumber}|anchor`) % ctx.anchors.length)]}?` : '')
      || `What detail keeps returning in ${formatMovieTitleForPodcast(currentMovie)}?`;
    const seedResponse = String(extractPrimaryBrainReply(latestItem?.response || '', '')).trim()
      || pickPromptVariant(ctx?.observations || [], `${currentMovie}|${turnNumber}|seed-response`)
      || 'The image keeps carrying more feeling than the dialogue can confess.';
    return {
      currentMovie,
      ctx,
      snapshot,
      seedPrompt,
      seedResponse
    };
  }

  // ─── Background Enrichment ────────────────────────────────────────────────
  // Fires after every ENRICHMENT_INTERVAL_TURNS Muse replies. Sends a wide,
  // high-temperature Cloud prompt to explore the film's unexplored thematic
  // territory. Returns 3–5 poetic one-sentence observations that feed back into
  // getFilmContext() so the next several podcast turns use fresh material.
  function triggerBackgroundEnrichment(movie = '') {
    const slug = String(movie || '')
      .replace(/\.mp4$/i, '')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    if (!slug) return;
    if (typeof voiceManager?._callGeminiEphemeralPrompt !== 'function') return;
    // Only skip enrichment during heavy quota blocks (>30s remaining). During tail-end backoff,
    // let the call through — it has its own catch handler that resets inFlight on failure.
    const _quotaRemainingMs = voiceManager?.getQuotaBackoffRemainingMs?.() || 0;
    if (_quotaRemainingMs > 30000) {
      console.log('[Enrichment] skipped — quota blocked (' + Math.round(_quotaRemainingMs / 1000) + 's remaining)');
      return;
    }

    // Seed pool from localStorage on first access for this slug
    if (!_runtimeEnrichmentPool.has(slug)) {
      try {
        const saved = localStorage.getItem('enrich_pool_v1_' + slug);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed?.observations)) {
            _runtimeEnrichmentPool.set(slug, { observations: parsed.observations, lastEnrichedAt: parsed.lastEnrichedAt || 0, inFlight: false, inFlightSince: 0 });
          }
        }
      } catch { }
    }
    const existing = _runtimeEnrichmentPool.get(slug) || { observations: [], lastEnrichedAt: 0, inFlight: false, inFlightSince: 0 };
    const now = Date.now();
    // Allow retry if the previous call has been in-flight for more than 22s (covers the 18s timeout + buffer)
    if (existing.inFlight && (now - (existing.inFlightSince || 0)) < 22000) {
      console.log('[Enrichment] skipped — in-flight since', Math.round((now - existing.inFlightSince) / 1000) + 's ago');
      return;
    }
    console.log('[Enrichment] firing for', slug, '— pool size', existing.observations.length);
    existing.inFlight = true;
    existing.inFlightSince = now;
    _runtimeEnrichmentPool.set(slug, existing);

    const staticCtx = getFilmContext(movie) || {};
    const currentAnchors = (staticCtx.anchors || []).slice(0, 10).join(', ');
    const poolEntry = _runtimeEnrichmentPool.get(slug) || { observations: [], lastEnrichedAt: 0, inFlight: false };
    const knownObs = [
      ...(staticCtx.observations || []).slice(0, 4),
      ...poolEntry.observations.slice(0, 4)
    ].join(' | ');
    const filmTitle = formatMovieTitleForPodcast(movie) || movie;
    const identityParts = [
      staticCtx.persona ? `Protagonist: ${staticCtx.persona}` : '',
      staticCtx.world ? `World: ${staticCtx.world}` : '',
      staticCtx.style ? `Style: ${staticCtx.style}` : '',
      (staticCtx.toneHints?.length) ? `Tone: ${staticCtx.toneHints.join(', ')}` : '',
      (staticCtx.refs?.length) ? `References: ${staticCtx.refs.slice(0, 4).join(', ')}` : '',
      (staticCtx.exclude?.length) ? `Excluded domains (do NOT reference): ${staticCtx.exclude.join(', ')}` : ''
    ].filter(Boolean).join(' · ');

    const explorationPrompt = [
      `You are a film theorist exploring "${filmTitle}".`,
      identityParts ? `Film identity — ${identityParts}.` : '',
      currentAnchors ? `Known thematic anchors: ${currentAnchors}.` : '',
      knownObs ? `Observations already in play (do NOT repeat or paraphrase any of these): ${knownObs}.` : '',
      'Your task: generate 6 NEW thematic observations rooted in this film\'s specific identity.',
      'Each must be one vivid concrete sentence (max 140 characters).',
      'Stay inside the film\'s world — invent at the margins, not outside the gravity.',
      'Go to unexpected territory: cultural contradictions, concealed tensions, aesthetic dissonance, suppressed meanings, overlooked symbols.',
      'Return exactly 6 lines, one observation per line, no numbering, no bullets, no markdown.'
    ].filter(Boolean).join('\n');

    // Fire-and-forget — never block a podcast turn
    voiceManager._callGeminiEphemeralPrompt(explorationPrompt, {
      systemInstruction: `You are a film theorist generating fresh thematic material for "${filmTitle}". Stay inside the film's established world and identity. Return exactly 6 short observation sentences, one per line.`,
      temperature: 1.6,
      maxOutputTokens: 400,
      timeoutMs: 18000
    }).then((raw) => {
      const text = String(raw || '').trim();
      const lines = text.split('\n')
        .map((l) => l.replace(/^[-•*\d.\s]+/, '').trim())
        .filter((l) => l.length > 20 && l.length < 180);
      if (!lines.length) {
        // Response was empty/truncated — reset inFlight so the next turn can retry immediately
        console.warn('[Enrichment] empty response for', slug, '— raw:', String(raw || '').slice(0, 120));
        const entry = _runtimeEnrichmentPool.get(slug);
        if (entry) { entry.inFlight = false; entry.inFlightSince = 0; _runtimeEnrichmentPool.set(slug, entry); }
        return;
      }
      const pool = _runtimeEnrichmentPool.get(slug) || { observations: [], lastEnrichedAt: 0, inFlight: false };
      // Prepend new lines, deduplicate, cap at ENRICHMENT_MAX_POOL_SIZE
      const merged = [...lines, ...pool.observations]
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, ENRICHMENT_MAX_POOL_SIZE);
      console.log('[Enrichment] pool filled:', lines.length, 'new →', merged.length, 'total for', slug);
      const enriched = { observations: merged, lastEnrichedAt: Date.now(), inFlight: false, inFlightSince: 0 };
      _runtimeEnrichmentPool.set(slug, enriched);
      try { localStorage.setItem('enrich_pool_v1_' + slug, JSON.stringify({ observations: merged, lastEnrichedAt: enriched.lastEnrichedAt })); } catch { }
    }).catch((err) => {
      console.warn('[Enrichment] call failed:', err?.message || err);
      const pool = _runtimeEnrichmentPool.get(slug);
      if (pool) { pool.inFlight = false; pool.inFlightSince = 0; _runtimeEnrichmentPool.set(slug, pool); }
    });
  }

  function buildPodcastAutonomousHostPrompt(turnNumber = 1, options = {}) {
    const currentMovie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : getFilmContext(currentMovie || '');
    // Only use Free Chat seeds as creative context, never as direct output
    const seedPrompt = String(options?.seedPrompt || '').trim();
    const seedResponse = String(options?.seedResponse || '').trim();
    const filmTitle = formatMovieTitleForPodcast(currentMovie);
    const references = Array.isArray(ctx?.refs) ? ctx.refs.slice(0, 6).join(' | ') : '';
    const sceneContext = String(options?.sceneContext || '').trim();
    const anchors = Array.isArray(ctx?.anchors) ? ctx.anchors.slice(0, 6).join(', ') : '';
    const toneHints = Array.isArray(ctx?.toneHints) ? ctx.toneHints.join(', ') : '';
    const observations = Array.isArray(ctx?.observations)
      ? ctx.observations.slice(0, 3).join(' | ')
      : '';
    // Rotate through distinct questioning angles to keep each turn genuinely different
    const _angles = [
      'Dig into the sensory layer \u2014 texture, light, color, or ambient sound in one specific moment.',
      'Ask what the film refuses to explain or name \u2014 the thing it circles without landing.',
      'Find the emotional contradiction \u2014 what does the image feel but never say aloud?',
      'Probe the absence \u2014 what is hidden, avoided, or just offscreen?',
      'Connect two of the anchors and ask what lives in the tension between them.',
      'Interrogate a single visual moment the film lingers on \u2014 what is it actually revealing?',
      'Challenge an assumption in what was just discussed \u2014 push back gently.',
      'Ask about time \u2014 is this image about the past, the present, or a future being imagined?',
      'Explore the body \u2014 posture, skin, gesture, stillness. What does it carry?',
      'Ask what is borrowed from somewhere else \u2014 another city, another era, another art form.'
    ];
    const _angleHint = _angles[(Math.max(0, turnNumber - 1)) % _angles.length];
    return [
      `You are Host A in a live podcast about the short film "${filmTitle}".`,
      seedPrompt ? `Reflect on this guest cue: "${seedPrompt}". RULES: NEVER repeat this cue verbatim. Do not use the same words as the cue. Instead, rephrase it entirely or ask Muse to expand on its deeper meaning.` : '',
      seedResponse ? `Muse previously suggested: "${seedResponse}". RULES: DO NOT repeat Muse's phrasing. Move the conversation forward into a new detail or observation.` : '',
      ctx?.world ? `Atmospheric world: ${ctx.world}.` : '',
      ctx?.style ? `Visual/narrative style: ${ctx.style}.` : '',
      references ? `Reference anchors: ${references}.` : '',
      anchors ? `Key image anchors: ${anchors}.` : '',
      toneHints ? `Tone of this film: ${toneHints}.` : '',
      observations ? `Recent poetic observations from Muse: ${observations}.` : '',
      sceneContext ? sceneContext : '',
      `Questioning angle for turn ${turnNumber}: ${_angleHint}`,
      'Ask one specific follow-up that digs into one of the anchors, references, or observations above · something Muse has not yet been asked.',
      'Stay curious and concrete. Avoid abstract dogma, generic philosophy, and canned interview phrasing.',
      'Return one short question only. No labels. No lists. No mention of AI, prompts, engines, or templates.'
    ].filter(Boolean).join('\n');
  }

  function normalizePodcastAutonomousHostQuestion(text = '') {
    let normalized = String(text || '')
      .replace(/^host\s*a\s*[:\-]\s*/i, '')
      .replace(/^question\s*[:\-]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';
    // Reject meta/self-referential lines from local AI hallucinating show context
    const lower = normalized.toLowerCase();
    if (/\b(welcome back|welcome listener|hello listener|as host a|as your host|as whimsical|your portrayal|\bpodcast host\b|\bthis podcast\b|\bthis episode\b)\b/.test(lower)) return '';
    // Strip trailing em-dash fragments: "...work\u2014How does?" \u2192 "...work"
    normalized = normalized.replace(/\u2014[^\u2014.!?]{0,40}[.!?]?$/, '').trim();
    // Reject questions that trail off with a dangling preposition/conjunction (model cut off mid-sentence)
    if (/\b(with|in|of|for|on|at|by|from|to|and|or|the|a|an|its|their|this|that|between|through|across|into|about|about)\s*\?$/.test(normalized)) return '';
    const firstSentence = normalized.split(/(?<=[?!\.])\s+/)[0] || normalized;
    const trimmed = firstSentence.replace(/[.!]+$/g, '').trim();
    if (!trimmed) return '';
    return /\?$/.test(trimmed) ? trimmed : `${trimmed}?`;
  }

  async function buildPodcastAutonomousHostQuestion(turnNumber = 1, options = {}) {
    // Only use Free Chat seeds as creative context, never as direct output
    const seedPrompt = String(options?.seedPrompt || '').trim();
    const seedResponse = String(options?.seedResponse || '').trim();
    const currentMovie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : getFilmContext(currentMovie || '');
    const prompt = buildPodcastAutonomousHostPrompt(turnNumber, {
      movie: currentMovie,
      ctx,
      seedPrompt,
      seedResponse,
      sceneContext: options?.sceneContext || ''
    });
    const _turnNum = Math.max(1, Number(turnNumber || 1));
    const hostLines = buildPodcastGuestRecoveryLines(seedPrompt, seedResponse, {
      allowTwoStep: false,
      turnNumber: _turnNum
    });
    let fallbackQuestion = String(hostLines[0] || '').trim();
    // Avoid re-asking a question that was recently spoken · try next hash slot if blocked
    const _usedQuestions = new Set(recentPodcastHostQuestionLines.map((q) => String(q || '').toLowerCase().trim()));
    if (fallbackQuestion && _usedQuestions.has(fallbackQuestion.toLowerCase())) {
      const altLines = buildPodcastGuestRecoveryLines(seedPrompt, seedResponse, { allowTwoStep: false, turnNumber: _turnNum + 1 });
      const altQ = String(altLines[0] || '').trim();
      if (altQ && !_usedQuestions.has(altQ.toLowerCase())) fallbackQuestion = altQ;
    }
    const preferredMode = String(options?.selectedMode || getPodcastReplyMode() || 'brain').toLowerCase();
    const seedInput = seedPrompt || seedResponse || fallbackQuestion || currentMovie || 'podcast cue';

    const tryCloudQuestion = async () => {
      if (typeof voiceManager?._callGeminiEphemeralPrompt !== 'function') return null;
      // Skip immediately if cloud is in quota backoff · avoids burning a round trip for a known failure
      if (voiceManager?.isCloudQuotaBlocked?.()) {
        voiceManager?.onAiLog?.({ engine: 'cloud-quota', input: 'Host A question (split)', output: '[skipped: quota backoff]', ms: 0, audio: false, vision: false });
        return null;
      }
      // No throttle — attempt cloud for every Host A question. Quota backoff is the
      // natural rate limiter. More cloud = more creative, contextual questions.
      try {
        const cloudQStart = performance.now();
        const _recentQsList = recentPodcastHostQuestionLines.slice(0, 10).map((q, i) => `${i + 1}. ${q}`).join(' | ');
        const rawResponse = await voiceManager._callGeminiEphemeralPrompt(prompt, {
          systemInstruction: [
            'You are Host A in a live film podcast.',
            'Ask exactly one short follow-up question to Muse about the current film.',
            _recentQsList ? `IMPORTANT: Do NOT repeat or rephrase any of these recently asked questions: ${_recentQsList}. Ask something genuinely different · pick a different anchor, reference, or angle entirely.` : '',
            'Return only the question. No labels, no answers, no stage directions, no analysis.'
          ].filter(Boolean).join(' '),
          temperature: 1.4,
          timeoutMs: 12000
        });
        const response = String(rawResponse || '').trim();
        const cloudQMs = Math.round(performance.now() - cloudQStart);
        if (!response) {
          voiceManager?.onAiLog?.({ engine: 'cloud', input: 'Host A question (split)', output: '[empty response]', ms: cloudQMs, audio: false, vision: false });
          return null;
        }
        const normalized = normalizePodcastAutonomousHostQuestion(response);
        if (!normalized) {
          voiceManager?.onAiLog?.({ engine: 'cloud', input: 'Host A question (split)', output: `[rejected by normalizer]: ${response.slice(0, 80)}`, ms: cloudQMs, audio: false, vision: false });
          return null;
        }
        return {
          text: normalized,
          engine: 'cloud',
          sourceLabel: 'CLOUD LIVE'
        };
      } catch (_e) {
        const errMsg = String(_e?.message || _e || 'unknown error');
        console.warn('[Split] Cloud question failed for Host A:', errMsg);
        const isQuotaErr = /429|quota|rate.?limit|resource.?exhausted/i.test(errMsg);
        voiceManager?.onAiLog?.({ engine: isQuotaErr ? 'cloud-quota' : 'cloud', input: 'Host A question (split)', output: `[error]: ${errMsg.slice(0, 120)}`, ms: 0, audio: false, vision: false });
        return null;
      }
    };

    const tryLocalQuestion = async ({ candidateModels = null, engineLabel = 'ollama' } = {}) => {
      if (typeof voiceManager?._tryLocalBrainFallback !== 'function') return null;
      const response = String(await voiceManager._tryLocalBrainFallback(seedInput, {
        prompt,
        logStart: Date.now(),
        timeoutMs: PODCAST_GUEST_LOCAL_REPLY_TIMEOUT_MS,
        candidateModels,
        engineLabel,
        suppressDirectOutput: true,
        suppressLocalFailureState: true,
        deferSideEffects: true
      }) || '').trim();
      const normalized = normalizePodcastAutonomousHostQuestion(response);
      if (!normalized) return null;
      return {
        text: normalized,
        engine: 'ollama',
        sourceLabel: `${getLocalModelDisplayLabel(false)} ${preferredMode === 'split' ? 'SPLIT' : 'LIVE'}`
      };
    };

    const activeLocalModel = voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest';
    const trySplitLocalQuestion = async () => {
      const localQuestionPromise = tryLocalQuestion({
        candidateModels: [activeLocalModel],
        engineLabel: 'ollama-forced'
      });
      return await Promise.race([
        localQuestionPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), SPLIT_HOST_A_LOCAL_RACE_THRESHOLD_MS))
      ]);
    };
    const liveQuestion = preferredMode === 'cloud'
      ? await tryCloudQuestion() || await tryLocalQuestion()
      : preferredMode === 'split'
        // Host A in split: try cloud first, then a short local race, then fall through to template.
        ? await tryCloudQuestion() || await trySplitLocalQuestion()
        : preferredMode === 'gemma'
        ? await tryLocalQuestion({ candidateModels: [activeLocalModel], engineLabel: 'ollama-forced' })
          || await tryCloudQuestion()
          || await tryLocalQuestion({ candidateModels: [activeLocalModel] })
        : preferredMode === 'brain'
          ? await tryCloudQuestion() || await tryLocalQuestion()
          : null;

    if (liveQuestion?.text) return liveQuestion;
    return {
      text: fallbackQuestion,
      engine: 'dict',
      sourceLabel: 'FILM TEMPLATE'
    };
  }

  function buildPodcastAutonomousMusePrompt(hostQuestion = '', options = {}) {
    const seedPrompt = String(options?.seedPrompt || '').trim();
    const seedResponse = String(options?.seedResponse || '').trim();
    const currentMovie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : {};
    const filmTitle = formatMovieTitleForPodcast(currentMovie);
    const references = Array.isArray(ctx?.refs) ? ctx.refs.slice(0, 4).join(' | ') : '';
    const sceneContext = String(options?.sceneContext || '').trim();
    return [
      `You are Muse, a poetic and mysterious AI expert answering a podcast host's questions about "${filmTitle}".`,
      `Context: You are currently looking at a scene that feels like ${ctx.world || 'a fleeting afterimage'}.`,
      hostQuestion ? `The Host just asked: "${hostQuestion}"` : '',
      seedPrompt || seedResponse ? `Rules for this turn: NEVER repeat the guest cue ("${seedPrompt}") or the previous response ("${seedResponse}") verbatim. Avoid using the same trigger words. Rephrase the core of the feeling instead.` : '',
      ctx?.persona ? `Persona cue: ${ctx.persona}.` : '',
      ctx?.world ? `World cue: ${ctx.world}.` : '',
      ctx?.style ? `Style cue: ${ctx.style}.` : '',
      references ? `Reference cues: ${references}.` : '',
      sceneContext ? sceneContext : '',
      'Reply in plain prose only · no verse, no line breaks, no poem format.',
      'Use 1 short complete sentence, 25 words maximum. Finish the thought. No lists. No mention of AI, prompt, engine, or templates.'
    ].filter(Boolean).join('\n');
  }

  async function buildPodcastAutonomousMuseReply(hostQuestion = '', options = {}) {
    // Gather recent Free Chat and Podcast lines for deduplication
    const _recentLines = [
      ...recentPodcastHostAnswerLines.map((line) => String(line || '').trim().toLowerCase()),
      ...recentPodcastHostQuestionLines.map((line) => String(line || '').trim().toLowerCase()),
      ...freeChatPodcastSeeds.map((seed) => String(seed?.response || '').trim().toLowerCase())
    ].filter(Boolean);

    // Extract structural template signature: strip leading noun(s) before "keeps" / "does"
    // e.g. "Rope keeps returning like the frame does not want to release it." ? "keeps returning like the frame does not want to release it."
    const _templateSig = (line) => String(line || '').replace(/^[A-Z][a-zA-Z -]{0,30}?\s+(?=keeps|does|is\s|was\s|are\s|turns\s|reads\s|knows\s)/i, '').toLowerCase().trim();
    const _recentTemplateSigs = new Set(_recentLines.map(_templateSig).filter((s) => s.length > 12));

    const recentBlocklist = {
      has: (line) => {
        const lo = String(line || '').toLowerCase();
        if (_recentLines.includes(lo)) return true;
        // Block structural repeats: same template shape with different noun
        const sig = _templateSig(lo);
        return sig.length > 12 && _recentTemplateSigs.has(sig);
      }
    };

    const currentMovie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : getFilmContext(currentMovie || '');
    const getPriorityLocalModels = (tier = 'gemma4') => Array.from(new Set((String(tier || 'gemma4').toLowerCase() === 'gemma3'
      ? ['gemma3:4b']
      : ['gemma4:e2b', 'gemma4', 'gemma4:latest']).filter(Boolean)));
    const prompt = buildPodcastAutonomousMusePrompt(hostQuestion, {
      movie: currentMovie,
      ctx,
      seedPrompt: options?.seedPrompt || '',
      seedResponse: options?.seedResponse || '',
      sceneContext: options?.sceneContext || ''
    });
    const preferredMode = String(options?.selectedMode || getPodcastReplyMode() || 'brain').toLowerCase();
    const startedAt = performance.now();
    const tryCloudReply = async () => {
      if (typeof voiceManager?._callGeminiEphemeralPrompt !== 'function') return null;
      // Skip immediately if cloud is in quota backoff · log the skip so Cloud still gets credit for the attempt
      if (voiceManager?.isCloudQuotaBlocked?.()) {
        voiceManager?.onAiLog?.({ engine: 'cloud-quota', input: 'Muse reply (podcast)', output: '[skipped: quota backoff]', ms: 0, audio: false, vision: false });
        return null;
      }
      try {
        let attempt = 0;
        let response = '';
        while (attempt < 3) {
          // Call the proxy directly with the already-built Muse prompt as a clean single-turn request.
          // _callGeminiEphemeralPrompt sends `prompt` as the user message without any extra wrapping,
          // matching the same pattern used by background enrichment calls (which reliably succeed).
          const rawText = String(await voiceManager._callGeminiEphemeralPrompt(prompt, {
            temperature: 0.85,
            maxOutputTokens: 320,
            timeoutMs: PODCAST_GUEST_CLOUD_EXPANSION_TIMEOUT_MS
          }) || '').trim();
          response = String(voiceManager?._normalizeCloudGuestExpansionText?.(rawText) || '').trim();
          if (!response) {
            const emptyReason = rawText ? `[norm-rejected]: ${rawText.slice(0, 100)}` : '[safety-blocked]: no candidates content';
            voiceManager?.onAiLog?.({
              engine: 'cloud',
              movie: currentMovie,
              input: 'Muse reply (podcast)',
              output: emptyReason,
              ms: Math.max(1, Math.round(performance.now() - startedAt)),
              audio: false,
              vision: false
            });
            attempt++;
            continue;
          }
          if (!recentBlocklist.has(response.toLowerCase())) break;
          voiceManager?.onAiLog?.({
            engine: 'cloud',
            movie: currentMovie,
            input: 'Muse reply (podcast)',
            output: `[rejected duplicate]: ${response.slice(0, 120)}`,
            ms: Math.max(1, Math.round(performance.now() - startedAt)),
            audio: false,
            vision: false
          });
          response = '';
          attempt++;
        }
        if (!response) return null;
        return {
          response,
          engine: 'cloud',
          sourceLabel: 'CLOUD LIVE',
          logEntry: {
            engine: 'cloud',
            movie: currentMovie,
            input: hostQuestion,
            output: response,
            ms: Math.max(1, Math.round(performance.now() - startedAt)),
            memories: 0,
            intent: 'general',
            vision: false
          }
        };
      } catch (_e) {
        const errMsg = String(_e?.message || _e || 'unknown error');
        const isQuotaErr = /429|quota|rate.?limit|resource.?exhausted/i.test(errMsg);
        voiceManager?.onAiLog?.({
          engine: isQuotaErr ? 'cloud-quota' : 'cloud',
          movie: currentMovie,
          input: 'Muse reply (podcast)',
          output: `[error]: ${errMsg.slice(0, 120)}`,
          ms: 0,
          audio: false,
          vision: false
        });
        return null;
      }
    };
    const tryLocalReply = async ({ candidateModels = null, sourceLabel = 'LOCAL LIVE', engineLabel = 'ollama', actualEngine = 'ollama', signal = null } = {}) => {
      if (typeof voiceManager?._tryLocalBrainFallback !== 'function') return null;
      let attempt = 0;
      let localReply = '';
      while (attempt < 3) {
        localReply = String(await voiceManager._tryLocalBrainFallback(hostQuestion, {
          prompt,
          logStart: Date.now(),
          timeoutMs: PODCAST_GUEST_LOCAL_REPLY_TIMEOUT_MS,
          candidateModels,
          engineLabel,
          suppressDirectOutput: true,
          suppressLocalFailureState: true,
          deferSideEffects: true,
          signal
        }) || '').trim();
        if (!localReply || voiceManager?._isLikelyTruncatedAiText?.(localReply) === true) return null;
        // Reject Muse LOCAL responses that open with show-intro phrases
        if (/^(welcome (back |listeners?|everyone)|hello (listeners?|everyone)|listeners[,!]?\s)/i.test(localReply)) return null;
        if (!recentBlocklist.has(localReply.toLowerCase())) break;
        localReply = '';
        attempt++;
      }
      if (!localReply) return null;
      return {
        response: localReply,
        engine: actualEngine,
        sourceLabel,
        logEntry: {
          engine: 'ollama',
          model: String(voiceManager?._lastOllamaResolvedModel || candidateModels?.[0] || voiceManager?.getLocalBrainModelName?.() || '').trim(),
          movie: currentMovie,
          input: hostQuestion,
          output: localReply,
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: Number(voiceManager?._lastMemoryCount || 0),
          vision: false,
          audio: false
        }
      };
    };
    const tryPriorityGemmaReply = async (tier = 'gemma4', sourceSuffix = 'LIVE', { signal = null, engineLabel = 'ollama', actualEngine = 'ollama' } = {}) => {
      const label = String(tier || 'gemma4').toLowerCase() === 'gemma3' ? 'Gemma 3' : 'Gemma 4';
      return tryLocalReply({
        candidateModels: getPriorityLocalModels(tier),
        sourceLabel: `${label} ${sourceSuffix}`,
        engineLabel,
        actualEngine,
        signal
      });
    };
    const buildBrainReply = (sourceLabel = 'BRAIN AUTO') => {
      if (typeof voiceManager?.examineBrainCheckpoint !== 'function') return null;
      const reply = voiceManager.examineBrainCheckpoint(hostQuestion, '', {
        allowHot: false,
        probeInput: hostQuestion,
        examKind: 'abstraction'
      });
      const response = String(reply?.response || '').trim();
      if (!response || recentBlocklist.has(response.toLowerCase())) return null;
      if (voiceManager?._isLikelyTruncatedAiText?.(response) === true) return null;
      return {
        response,
        engine: 'brain-reply',
        sourceLabel,
        logEntry: {
          engine: 'brain-reply',
          model: voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest',
          movie: currentMovie,
          input: hostQuestion,
          output: response,
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: Number(reply?.memoryCount || 0),
          level: reply?.level || 'L1',
          intent: reply?.intent || 'general',
          rank: reply?.rank || '',
          score: Number.isFinite(reply?.score) ? reply.score : null,
          vision: false,
          audio: false
        }
      };
    };
    const buildDictReply = (sourceLabel = 'DICT AUTO') => {
      let fallback = String(voiceManager?._fallbackReply?.(hostQuestion) || '').trim();
      // If the first pick was already served recently, try once more with a varied seed
      if (fallback && recentBlocklist.has(fallback.toLowerCase())) {
        const altSeed = `${hostQuestion} what else`;
        fallback = String(voiceManager?._fallbackReply?.(altSeed) || '').trim();
      }
      // Last resort: pull a fresh observation from the film context map (richer pool than dictionary)
      if (!fallback || recentBlocklist.has(fallback.toLowerCase())) {
        const filmCtx = getFilmContext(currentMovie);
        const obsPool = (filmCtx?.observations || []).filter((obs) => !recentBlocklist.has(String(obs).toLowerCase()));
        if (obsPool.length) fallback = obsPool[Math.floor(Math.random() * obsPool.length)];
      }
      const fallbackMeta = voiceManager?._lastFallbackMeta || { level: 'L1', intent: 'general', hot: false, artRef: false };
      
      if (!fallback || recentBlocklist.has(fallback.toLowerCase())) return null;
      // Reject truncated DICT entries (same check as local/cloud replies)
      if (voiceManager?._isLikelyTruncatedAiText?.(fallback) === true) return null;

      // Also block if the response shares significant word-overlap with recent Free Chat seeds
      const fallbackWords = new Set(fallback.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
      const hasFreeChatOverlap = freeChatPodcastSeeds.some((seed) => {
        const seedWords = new Set(String(seed?.response || '').toLowerCase().split(/\W+/).filter((w) => w.length > 4));
        let matchCount = 0;
        for (const word of fallbackWords) { if (seedWords.has(word)) matchCount++; }
        return matchCount >= 7; // Block only near-verbatim echoes (7+ significant words overlap)
      });
      if (hasFreeChatOverlap) return null;
      
      return {
        response: fallback,
        engine: 'dict',
        sourceLabel,
        logEntry: {
          engine: 'dict',
          movie: currentMovie,
          input: hostQuestion,
          output: fallback,
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: 0,
          level: fallbackMeta.level,
          intent: fallbackMeta.intent,
          hot: fallbackMeta.hot === true,
          artRef: fallbackMeta.artRef === true,
          vision: false,
          audio: false
        }
      };
    };

    if (preferredMode === 'cloud') {
      return await tryCloudReply()
        || await tryPriorityGemmaReply('gemma4', 'AFTER CLOUD')
        || await tryPriorityGemmaReply('gemma3', 'AFTER GEMMA 4')
        || buildBrainReply('BRAIN AFTER GEMMA 3')
        || buildDictReply('DICT AFTER BRAIN');
    }
    if (preferredMode === 'split') {
      // Split mode: Host B (Muse) = Gemma4 first, cloud as fallback if local fails/times out.
      // This gives every turn a local Gemma4 answer; cloud steps in only when Gemma4 can't reply.
      _pendingSplitMuseReplyResult = null;
      _splitMuseAbortController?.abort();
      _splitMuseAbortController = new AbortController();
      const splitAbortController = _splitMuseAbortController;
      const splitMusePromise = tryPriorityGemmaReply('gemma4', 'SPLIT', { engineLabel: 'ollama-forced', actualEngine: 'ollama', signal: splitAbortController.signal });
      const splitRaceResult = await Promise.race([
        splitMusePromise,
        new Promise(res => setTimeout(() => res(null), SPLIT_MUSE_RACE_THRESHOLD_MS))
      ]);
      if (splitRaceResult) { _splitMuseAbortController = null; return splitRaceResult; }
      // Gemma4 timed out — abort and fall back to cloud (skip if quota-blocked)
      splitAbortController.abort();
      if (_splitMuseAbortController === splitAbortController) _splitMuseAbortController = null;
      const cloudQuotaBlockedSplit = voiceManager?.isCloudQuotaBlocked?.() === true;
      return (!cloudQuotaBlockedSplit ? await tryCloudReply() : null)
        || await tryPriorityGemmaReply('gemma3', 'AFTER SPLIT GEMMA 4')
        || buildBrainReply('BRAIN SPLIT')
        || buildDictReply('DICT SPLIT');
    }
    if (preferredMode === 'gemma') {
      // Abort any previous still-running gemma inference (same pattern as split)
      _pendingMiniPodcastReplyResult = null;
      _splitMuseAbortController?.abort();
      _splitMuseAbortController = new AbortController();
      const gemmaAbortController = _splitMuseAbortController;

      // Race local vs threshold · abort immediately on timeout to free GPU
      const miniPodcastPromise = tryPriorityGemmaReply('gemma4', 'LIVE', { engineLabel: 'ollama-forced', actualEngine: 'ollama', signal: gemmaAbortController.signal });
      const raceResult = await Promise.race([
        miniPodcastPromise,
        new Promise(res => setTimeout(() => res(null), MINI_RACE_THRESHOLD_PODCAST_MS))
      ]);
      if (raceResult) { _splitMuseAbortController = null; return raceResult; }

      // Timed out · abort the in-flight GPU inference immediately
      gemmaAbortController.abort();
      if (_splitMuseAbortController === gemmaAbortController) _splitMuseAbortController = null;

      // If local timed out, try cloud (skip if quota-blocked) before falling to DICT.
      const cloudQuotaBlockedGemma = voiceManager?.isCloudQuotaBlocked?.() === true;
      return (!cloudQuotaBlockedGemma ? await tryCloudReply() : null)
        || await tryPriorityGemmaReply('gemma3', 'AFTER GEMMA 4')
        || buildBrainReply('BRAIN AFTER GEMMA')
        || buildDictReply('DICT FAST-LANE');
    }
    if (preferredMode === 'brain') {
      return await tryCloudReply()
        || await tryPriorityGemmaReply('gemma4', 'AFTER CLOUD')
        || await tryPriorityGemmaReply('gemma3', 'AFTER GEMMA 4')
        || buildBrainReply('BRAIN LIVE')
        || buildDictReply('DICT AFTER BRAIN');
    }
    return buildDictReply('DICT PINNED');
  }

  function buildTemplatePublicPodcastAiExchangeLines(turnNumber = 1) {
    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    if (!currentMovie) return [];
    const selectedMode = getPodcastReplyMode();
    const snapshot = getLatestPodcastBatchSnapshot();
    const clampAutonomousExchangeLines = (lines = []) => {
      // Only filter empty lines · trust the template's own internal deduplication.
      // An extra blocklist check here was causing the template to return empty
      // on turns 3+ and silently kill the podcast.
      const normalizedLines = (Array.isArray(lines) ? lines : [])
        .filter((line) => String(line?.text || '').trim());
      if (!normalizedLines.length) return [];
      const firstHostA = normalizedLines.find((line) => String(line?.speaker || 'hostA') === 'hostA') || null;
      const firstHostB = normalizedLines.find((line) => String(line?.speaker || 'hostA') === 'hostB') || null;
      if (firstHostA && firstHostB) {
        return [firstHostA, firstHostB];
      }
      return normalizedLines.slice(0, 2);
    };
    const resolveTemplateSourceMeta = () => {
      const recentItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
      const mappedEngines = recentItems
        .map((item) => String(item?.trainingEngine || '').trim().toLowerCase())
        .filter(Boolean)
        .map((engine) => {
          if (engine === 'ollama') return 'ollama';
          if (engine === 'template' || engine === 'dict') return 'dict';
          return 'cloud';
        });
      const primaryEngine = mappedEngines[0] || 'dict';
      const uniqueEngines = Array.from(new Set(mappedEngines));
      const sourceLabel = primaryEngine === 'ollama'
        ? `${voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest'} SNAPSHOT`
        : primaryEngine === 'cloud'
          ? 'CLOUD SNAPSHOT'
          : recentItems.length
            ? 'DICT SNAPSHOT'
            : 'FILM TEMPLATE';
      const mixedLabel = uniqueEngines.length > 1
        ? ` · mixed ${uniqueEngines.map((engine) => engine === 'ollama' ? 'LOCAL' : engine.toUpperCase()).join('/')}`
        : '';
      return {
        engine: primaryEngine,
        sourceLabel: `${sourceLabel}${mixedLabel}`
      };
    };
    const autoSourceMeta = resolveTemplateSourceMeta();
    const latestGuestDirective = getLatestPublicPodcastGuestDirective();
    if (latestGuestDirective) {
      // DICT template path · no async AI builders available here; use resume lines seeded from guest cue
      const guestRecoveryLines = buildPodcastResumeLines({
        lastSpeaker: 'hostB',
        prompt: latestGuestDirective.input,
        guestRecovery: true,
        turnNumber: Math.max(1, Number(turnNumber || 1))
      }).filter((line) => String(line?.text || '').trim());
      if (guestRecoveryLines.length) {
        return attachPodcastAutoLogMeta(clampAutonomousExchangeLines(guestRecoveryLines), {
          movie: currentMovie,
          selectedMode,
          engine: autoSourceMeta.engine,
          sourceLabel: autoSourceMeta.sourceLabel
        });
      }
    }
    const templateCtx = getFilmContext(currentMovie || '');
    const seededPrompt = String(snapshot?.items?.[0]?.input || '').trim()
      || (templateCtx?.anchors?.length
        ? `What keeps returning around ${pickPromptVariant(templateCtx.anchors, `${currentMovie}|${turnNumber}|template-anchor`)}?`
        : 'What is the image still holding?');

    const resumeLines = buildPodcastResumeLines({
      lastSpeaker: 'hostB',
      prompt: seededPrompt,
      forceReturn: true,
      turnNumber: Math.max(1, Number(turnNumber || activeTrainingSessionMetrics?.successfulBatches || 1))
    }).filter((line) => String(line?.text || '').trim());

    if (resumeLines.length) {
      return attachPodcastAutoLogMeta(clampAutonomousExchangeLines(resumeLines), {
        movie: currentMovie,
        selectedMode,
        engine: autoSourceMeta.engine,
        sourceLabel: autoSourceMeta.sourceLabel
      });
    }

    return attachPodcastAutoLogMeta(clampAutonomousExchangeLines(buildPodcastBatchLines(
      Math.max(1, Number(turnNumber || 1)),
      [{
        input: 'What is the frame doing that the dialogue never could?',
        response: 'The image keeps carrying more feeling than the dialogue can confess.',
        focus: 'visual'
      }],
      currentMovie,
      {
        preferQuestionMode: true,
        forceShortForm: true
      }
    ).filter((line) => String(line?.text || '').trim())), {
      movie: currentMovie,
      selectedMode,
      engine: autoSourceMeta.engine,
      sourceLabel: autoSourceMeta.sourceLabel
    });
  }

  async function buildPublicPodcastAiExchangeLines(turnNumber = 1, options = {}) {
    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    if (!currentMovie) return [];
    const selectedMode = getPodcastReplyMode();
    const seed = buildPodcastAutoSeed(turnNumber);
    // If a guest directive is pending, seed the AI builders from it so Cloud/Local generates
    // a fresh exchange genuinely inspired by the guest·s question · not a canned recovery line
    const latestGuestDirective = getLatestPublicPodcastGuestDirective();
    const lastMuseReply = recentPodcastHostAnswerLines[0] || '';
    const seedPromptOverride = latestGuestDirective?.input || seed.seedPrompt;
    const seedResponseOverride = latestGuestDirective?.response || lastMuseReply || seed.seedResponse;
    const retrievalQuery = [seedPromptOverride, seedResponseOverride, currentMovie].filter(Boolean).join(' ');
    let sceneContext = '';
    try {
      const retrieval = await getMovieRetrievalContext(currentMovie, retrievalQuery, { limit: 3 });
      sceneContext = String(retrieval?.block || '').trim();
    } catch {
      sceneContext = '';
    }
    const hostQuestion = await buildPodcastAutonomousHostQuestion(turnNumber, {
      movie: currentMovie,
      ctx: seed.ctx,
      seedPrompt: seedPromptOverride,
      seedResponse: seedResponseOverride,
      selectedMode,
      sceneContext
    });
    if (hostQuestion?.text) {
      const museReply = await buildPodcastAutonomousMuseReply(hostQuestion.text, {
        movie: currentMovie,
        ctx: seed.ctx,
        seedPrompt: seedPromptOverride,
        seedResponse: seedResponseOverride,
        selectedMode,
        sceneContext
      });
      if (museReply?.response) {
        // Trigger background enrichment every ENRICHMENT_INTERVAL_TURNS turns (non-blocking)
        _enrichmentTurnClock = (_enrichmentTurnClock + 1) % ENRICHMENT_INTERVAL_TURNS;
        if (_enrichmentTurnClock === 0) triggerBackgroundEnrichment(currentMovie);
        const _podcastSig = [String(hostQuestion.text || '').slice(0, 50), currentMovie].join('|');
        recentPodcastSeedBuffer = [
          {
            movie: currentMovie,
            input: summarizePodcastQuestion(hostQuestion.text, 18, hostQuestion.text),
            response: summarizeForPodcast(museReply.response, 28),
            signature: _podcastSig,
            at: Date.now()
          },
          ...recentPodcastSeedBuffer.filter((s) => s.signature !== _podcastSig && s.movie === currentMovie)
        ].slice(0, 6);
        return attachPodcastAutoLogMeta([
          {
            speaker: 'hostA',
            text: hostQuestion.text,
            logMeta: {
              // Host A DICT template questions are structural scaffolding in cloud/split mode · suppress from model usage
              engine: hostQuestion.engine === 'dict' ? 'podcast-control' : hostQuestion.engine,
              sourceLabel: hostQuestion.sourceLabel
            }
          },
          {
            speaker: 'hostB',
            text: museReply.response,
            logMeta: {
              engine: museReply.engine,
              sourceLabel: museReply.sourceLabel
            }
          }
        ], {
          movie: currentMovie,
          selectedMode,
          engine: museReply.engine,
          sourceLabel: museReply.sourceLabel
        });
      }
    }
    return buildTemplatePublicPodcastAiExchangeLines(turnNumber);
  }

  function buildPublicPodcastAiMovieChangeLines(movie = '') {
    return [];
  }

  function resumePublicPodcastAiAfterMovieChange(movie = '') {
    if (!publicPodcastAiEnabled || !publicPodcastAiAutoMode) {
      publicPodcastAiMovieSwitchPending = false;
      updatePublicPodcastAiButtonState();
      return;
    }

    const nextMovie = String(movie || voiceManager?.currentMovie || '').trim();
    publicPodcastAiMovieSwitchPending = false;
    publicPodcastAiMovie = nextMovie;
    publicPodcastAiTurnNumber = 0;
    publicPodcastAiStartInFlight = false;
    _podcastPrefetch = null;
    podcastTrainingEnabled = true;

    // On movie switch: clear per-movie last-line pointers so the new film
    // doesn't open on its own prior line. Preserve the structural phrase
    // memory (recentPodcastHostAnswerLines) so templates used in the
    // previous film are still blocked in the new one.
    recentPodcastHostQuestionLines = [];
    lastPodcastHostQuestionLine = '';
    lastPodcastHostAnswerLine = '';

    // Full reset of narration state to prevent "blocked" lines from carry over
    resetPodcastNarrationQueue({ cancelActive: true, restoreMode: true, fullReset: true });
    pickPodcastVoiceProfiles();

    const handoffLines = buildPublicPodcastAiMovieChangeLines(nextMovie);
    if (!handoffLines.length) {
      schedulePublicPodcastAiContinue(0);
      updatePublicPodcastAiButtonState();
      return;
    }

    injectPodcastNarration(handoffLines, { cancelActive: false, prioritize: true, force: true });
    updatePublicPodcastAiButtonState();
    if (!voiceManager?.synthesis?.speaking) {
      setTimeout(() => {
        drainPodcastNarrationQueue(true);
        setTimeout(() => schedulePublicPodcastAiContinue(0), 100);
      }, 30);
    } else {
      setTimeout(() => schedulePublicPodcastAiContinue(0), 100);
    }
  }

  async function startPublicPodcastAiConversation(options = {}) {
    if (!publicPodcastAiEnabled || !podcastEngine || !voiceManager) return false;
    selectedConversationSurfaceMode = 'podcast';

    revealAiChatPanel({ focusInput: false });

    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    if (!currentMovie) {
      selectedConversationSurfaceMode = 'chat';
      updateConversationModeUi();
      appendChatMessage('assistant', 'Load a movie first to start Podcast AI.');
      return false;
    }

    if (brainTrainingInFlight) {
      podcastTrainingEnabled = true;
      if (!voiceManager?.synthesis?.speaking) {
        setTimeout(() => drainPodcastNarrationQueue(true), 30);
      }
      updatePublicPodcastAiButtonState();
      return true;
    }

    publicPodcastAiAutoMode = true;
    publicPodcastAiMovie = currentMovie;
    if (!publicPodcastAiReplyMode) {
      publicPodcastAiReplyMode = resolvePodcastReplyMode({
        source: options?.source,
        autonomous: true
      });
    }
    syncTrainingPushToTalkMode();
    if (!publicPodcastAiStartedAt || !publicPodcastAiExpiresAt || publicPodcastAiExpiresAt <= Date.now()) {
      publicPodcastAiStartedAt = Date.now();
      publicPodcastAiExpiresAt = publicPodcastAiStartedAt + PUBLIC_PODCAST_AI_DURATION_MS;
    }
    startPublicPodcastAiExpiryTimer();
    clearPublicPodcastAiContinueTimer();
    if (hasPublicPodcastAiConversationWork()) {
      if (!voiceManager?.synthesis?.speaking) {
        setTimeout(() => drainPodcastNarrationQueue(true), 30);
      }
      updatePublicPodcastAiButtonState();
      return true;
    }

    if (publicPodcastAiStartInFlight) {
      updatePublicPodcastAiButtonState();
      return true;
    }

    if (publicPodcastAiTurnNumber > 0) {
      schedulePublicPodcastAiContinue(0);
      return true;
    }

    pickPodcastVoiceProfiles();
    podcastTrainingEnabled = true;
    resetPodcastNarrationQueue({ cancelActive: true, restoreMode: false });

    podcastGuestIntroAnnounced = false;
    podcastGuestWaitCueAnnounced = false;

    const startMode = publicPodcastAiReplyMode || resolvePodcastReplyMode({
      source: options?.source,
      autonomous: true
    });
    publicPodcastAiReplyMode = startMode;
    const shouldUseImmediateTemplateStart = !String(options?.seedPrompt || '').trim()
      && startMode !== 'split'
      && startMode !== 'cloud'
      && startMode !== 'brain'
      && startMode !== 'gemma';
    if (shouldUseImmediateTemplateStart) {
      const templateStartLines = buildTemplatePublicPodcastAiExchangeLines(1);
      if (templateStartLines.length) {
        const initialHostLine = templateStartLines[0] ? [templateStartLines[0]] : [];
        pendingPodcastStartReplyLines = templateStartLines.slice(1);
        publicPodcastAiTurnNumber = 1;
        logPodcastControlEvent('start', {
          turn: 1,
          queue: initialHostLine.length,
          source: options?.source || 'mode-switch'
        }, {
          output: `turn:1 · queue:${initialHostLine.length} · source:${String(options?.source || 'mode-switch').trim() || 'mode-switch'} · opener:template`
        });
        injectPodcastNarration(initialHostLine, { cancelActive: false, prioritize: true, force: true });
        updatePublicPodcastAiButtonState();
        if (!voiceManager?.synthesis?.speaking) {
          setTimeout(() => drainPodcastNarrationQueue(false), 30);
        }
        return true;
      }
    }

    publicPodcastAiStartInFlight = true;
    let startLines = [];
    try {
      startLines = await buildPublicPodcastAiExchangeLines(1, {
        seedPrompt: options?.seedPrompt,
        seedResponse: options?.seedResponse
      });
    } finally {
      publicPodcastAiStartInFlight = false;
    }
    if (!publicPodcastAiEnabled || !publicPodcastAiAutoMode || publicPodcastAiMovieSwitchPending) {
      updatePublicPodcastAiButtonState();
      return false;
    }
    if (!startLines.length) {
      logPodcastControlEvent('start-fail', {
        turn: 1,
        source: options?.seedPrompt ? 'chat-seed' : 'auto',
        reason: 'no-lines'
      });
      stopPublicPodcastAiConversation();
      appendChatMessage('assistant', 'Podcast AI could not start a Host A and Muse exchange for this movie yet.');
      return false;
    }

    const initialHostLine = startLines[0] ? [startLines[0]] : [];
    pendingPodcastStartReplyLines = startLines.slice(1);
    publicPodcastAiTurnNumber = 1;
    logPodcastControlEvent('start', {
      turn: 1,
      queue: initialHostLine.length,
      source: options?.seedPrompt ? 'chat-seed' : 'auto'
    }, {
      output: options?.seedPrompt
        ? `turn:1 · queue:${initialHostLine.length} · source:chat-seed · prompt:${String(options.seedPrompt).replace(/\s+/g, ' ').trim().slice(0, 120)}`
        : `turn:1 · queue:${initialHostLine.length} · source:auto`
    });
    injectPodcastNarration(initialHostLine, { cancelActive: false, prioritize: true, force: true });
    updatePublicPodcastAiButtonState();
    if (!voiceManager?.synthesis?.speaking) {
      setTimeout(() => drainPodcastNarrationQueue(false), 30);
    }

    return true;
  }

  function shouldSuppressPodcastTrainingAdminChat() {
    return brainTrainingInFlight && podcastTrainingEnabled;
  }

  function appendPodcastSafeAssistantLine(text = '', options = {}) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    const allowDuringPodcastTraining = options?.allowDuringPodcastTraining === true;
    if (shouldSuppressPodcastTrainingAdminChat() && !allowDuringPodcastTraining) return;
    if (allowDuringPodcastTraining && brainTrainingInFlight && podcastTrainingEnabled) {
      const now = Date.now();
      const dedupeMs = Math.max(1500, Number(options?.dedupeMs || 3500));
      if (lastPodcastTrainingStatusAnnouncement.text === normalized && (now - lastPodcastTrainingStatusAnnouncement.at) < dedupeMs) {
        return;
      }
      lastPodcastTrainingStatusAnnouncement = { text: normalized, at: now };
    }
    appendChatMessage('assistant', normalized);
  }

  function appendPodcastTrainingStatusLine(text = '', options = {}) {
    appendPodcastSafeAssistantLine(text, {
      ...options,
      allowDuringPodcastTraining: true
    });
  }

  function appendModeSwitchAssistantLine(mode = '', text = '') {
    if (!text || shouldSuppressPodcastTrainingAdminChat() || isPublicPodcastStageParticipationReady() || hasPublicPodcastAiConversationWork()) return;
    const normalizedMode = String(mode || '').trim().toLowerCase();
    const now = Date.now();
    if (lastModeSwitchAnnouncement.mode === normalizedMode && (now - lastModeSwitchAnnouncement.at) < 6000) {
      return;
    }
    lastModeSwitchAnnouncement = { mode: normalizedMode, at: now };
    appendChatMessage('assistant', text);
  }

  function announceConversationSurfaceMode(mode = 'chat', options = {}) {
    const normalizedMode = mode === 'podcast' ? 'podcast' : 'chat';
    const now = Date.now();
    const dedupeMs = Math.max(1500, Number(options?.dedupeMs || 5000));
    if (lastConversationSurfaceAnnouncement.mode === normalizedMode && (now - lastConversationSurfaceAnnouncement.at) < dedupeMs) {
      return;
    }
    lastConversationSurfaceAnnouncement = { mode: normalizedMode, at: now };
    const bubbleText = normalizedMode === 'podcast'
      ? 'Podcast mode.'
      : 'Free chat.';
    const speechText = normalizedMode === 'podcast'
      ? 'Podcast mode.'
      : 'Free chat.';
    appendChatMessage('assistant', bubbleText);
    showAiSpeech(speechText, true);
    if (voiceManager?.speak) {
      voiceManager.speak(speechText, { speaker: 'system', context: 'mode', force: true });
    }
  }

  function clearPodcastGuestPromptUi(source = 'mic') {
    setInlineActivity('');
    if (source !== 'mic' || !btnVoiceMic) return;
    lastPodcastGuestMicHandledAt = Date.now();
    resetPodcastGuestCueState();
    isVoiceSessionActive = false;
    btnVoiceMic.classList.remove('listening');
    const label = btnVoiceMic.querySelector('.btn-label');
    if (label) label.textContent = MIC_IDLE_LABEL;
    setAiSpeechStateChip('Mic idle');
    restoreVideoVolume();
    if (voiceManager?.isListening || voiceManager?.keepListening) {
      try {
        voiceManager.stopListening?.();
      } catch {
        // noop
      }
    }
  }

  function isPodcastHostCue(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;
    return /^(host|host a|jose|where is host|where's host|where is host a|where's host a|where is jose|where's jose)$/.test(normalized);
  }

  function isPodcastStatusCue(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;
    return /^(whats happening|what's happening|what is happening|whats going on|what's going on|what is going on|status|status check|where are we|what happened|whats new|what's new|what is new|anything new)(?:\s+(?:with|in)\s+the\s+podcast)?$|^(?:what's|what is|whats)\s+happening\s+with\s+the\s+podcast$|^podcast\s+status$/.test(normalized);
  }

  function buildConversationModeStatusReply() {
    if (!publicPodcastAiEnabled) return '';
    if (isPodcastConversationSurfaceActive()) {
      const remainingMs = Math.max(0, Number(publicPodcastAiExpiresAt || 0) - Date.now());
      const timerLabel = publicPodcastAiAutoMode && remainingMs > 0
        ? ` ${formatPublicPodcastCountdown(remainingMs)} left.`
        : '';
      return hasPodcastGuestStageLiveState()
        ? `Podcast is live and your guest cue is in the stage flow.${timerLabel}`
        : `Podcast is live. Host A and Muse are carrying the exchange.${timerLabel}`;
    }
    return 'Podcast is off. Free Chat is active.';
  }

  function detectPodcastGuestLanguageLabel(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return '';

    const languageEntries = [
      { label: 'Japanese', pattern: /\b(?:japanese|nihongo)\b|日本語/u },
      { label: 'French', pattern: /\b(?:french|francais|fran·ais)\b/u },
      { label: 'Spanish', pattern: /\b(?:spanish|espanol|espa·ol)\b/u },
      { label: 'German', pattern: /\b(?:german|deutsch)\b/u },
      { label: 'Italian', pattern: /\b(?:italian|italiano)\b/u },
      { label: 'Portuguese', pattern: /\b(?:portuguese|portugues|portugu·s)\b/u },
      { label: 'Korean', pattern: /\b(?:korean|hangul)\b|한국어/u },
      { label: 'Chinese', pattern: /\b(?:chinese|mandarin|cantonese)\b|中文/u },
      { label: 'Russian', pattern: /\brussian\b|русский/u },
      { label: 'English', pattern: /\benglish\b/u }
    ];

    return languageEntries.find((entry) => entry.pattern.test(normalized))?.label || '';
  }

  function buildPodcastGuestUtilityReply(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return null;

    const ctx = getFilmContext(voiceManager?.currentMovie || '');
    const brain = voiceManager?.currentMovieBrain || resolveMovieBrain(voiceManager?.currentMovie);
    const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
    const trainingSeeds = (brain?.trainingSeeds && typeof brain.trainingSeeds === 'object') ? brain.trainingSeeds : {};
    const requestedLanguage = detectPodcastGuestLanguageLabel(normalized);
    const pickDictionaryReply = (...keys) => {
      for (const key of keys) {
        const value = dictionary?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (Array.isArray(value)) {
          const first = value.map((item) => String(item || '').trim()).find(Boolean);
          if (first) return first;
        }
      }
      return '';
    };
    const latestGuestDirective = Array.isArray(activeTrainingSessionMetrics?.guestDirectives)
      ? activeTrainingSessionMetrics.guestDirectives[0] || null
      : null;
    const latestPrompt = normalizeVoiceText(latestGuestDirective?.input || '');
    const buildCrossDisciplineReferenceReply = () => {
      const refs = Array.isArray(trainingSeeds?.references)
        ? trainingSeeds.references.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const crossDiscipline = refs.filter((item) => /murakami|kraftwerk|sakamoto|lacan|city pop|jazz|chanson|theory|photograph|photography|manifesto|simulacra|hauntology|eros/i.test(item));
      const pool = crossDiscipline.length ? crossDiscipline : refs;
      if (!pool.length) return '';
      const visible = pool.slice(0, 4);
      if (visible.length === 1) return `Outside cinema it also leans toward ${visible[0]}.`;
      const tail = visible.length > 1
        ? `${visible.slice(0, -1).join(', ')}, and ${visible[visible.length - 1]}`
        : visible[0];
      return `Outside cinema it also leans toward ${tail}.`;
    };
    const buildPrimaryReferenceReply = () => {
      const refs = Array.isArray(trainingSeeds?.references)
        ? trainingSeeds.references.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const visible = refs.filter((item) => !/the film's lineage/i.test(item)).slice(0, 5);
      if (visible.length >= 4) {
        return `${visible.slice(0, 3).join(', ')}, and ${visible[3]}.`;
      }
      return pickDictionaryReply('reference', 'influences', 'film');
    };
    const buildArtReferenceReply = () => {
      if (/\b(?:rembrandt|belshazzar|balthazar|book\s+of\s+daniel|mene|tekel|upharsin)\b/.test(normalized)) {
        return 'If you mean the wall-writing image, the closest art-history echo is Rembrandt\'s Belshazzar\'s Feast: radiant script arriving as omen rather than decoration.';
      }
      if (/\b(?:famous\s+painting|flemish\s+painting|painting|artwork|writing\s+on\s+the\s+wall)\b/.test(normalized)) {
        return 'It can read like a Rembrandt-style writing-on-the-wall image, especially Belshazzar\'s Feast, where illuminated script lands as warning rather than ordinary graffiti.';
      }
      return buildPrimaryReferenceReply();
    };
    const buildGraffitiReply = () => {
      if (/\b(?:graffiti|writing\s+on\s+the\s+wall|wall\s+writing|script)\b/.test(normalized)) {
        return 'It plays less like throwaway graffiti than an omen in the frame. The writing behaves like coded warning, turning language into atmosphere.';
      }
      return '';
    };
    const buildGraffitiLanguageReply = () => {
      if (/\b(?:rembrandt|belshazzar|balthazar|book\s+of\s+daniel|mene|tekel|upharsin|hebrew)\b/.test(normalized)) {
        return 'It reads closer to a stylized Hebrew-like omen than clean subtitle text. The point is the charge of the writing, not perfect legibility.';
      }
      return 'It reads more like stylized script than plain readable dialogue. The wall-marking works as coded image first and literal language second.';
    };
    const buildCompanionFilmReply = () => {
      const refs = Array.isArray(trainingSeeds?.references)
        ? trainingSeeds.references.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const filmLike = refs.filter((item) => /fallen angels|lost in translation|hiroshima mon amour|alphaville|blade runner|ghost in the shell|la jet[e·]e|after dark|matrix|ex machina|tokyo story|in the mood for love/i.test(item));
      const unique = filmLike.filter((item, index) => filmLike.indexOf(item) === index);
      if (unique.length >= 2) {
        return `${unique[0]} and ${unique[1]} come closest. They share the same urban drift, translated longing, and afterimage of romance.`;
      }
      if (unique.length === 1) {
        return `${unique[0]} comes closest. It shares the same city-sadness and displaced intimacy.`;
      }
      return pickDictionaryReply('film', 'reference', 'influences');
    };
    const buildOverviewReply = () => {
      if (ctx?.world && ctx?.style) {
        return `${ctx.world} filtered through ${ctx.style}. It feels less like plot than a postcard of longing caught in light.`;
      }
      return pickDictionaryReply('story', 'about', 'what is this about')
        || 'It is less a plot than a mood-world built from memory, light, and drift.';
    };
    const buildSpokenLanguageReply = (language = '') => {
      if (language === 'French') {
        return ctx?.world
          ? `Ce film ressemble a une carte postale de desir prise dans ${ctx.world.toLowerCase()}.`
          : 'Ce film ressemble a une carte postale de desir prise dans une lumiere fatiguee.';
      }
      if (language === 'Japanese') {
        return '????????????????????????????';
      }
      if (language === 'Spanish') {
        return 'Esta pelicula se siente como un recuerdo de deseo atrapado en la luz.';
      }
      if (language === 'German') {
        return 'Dieser Film fuehlt sich an wie eine Erinnerung an Begehren, eingefangen im Licht.';
      }
      if (language === 'Italian') {
        return 'Questo film sembra un ricordo del desiderio intrappolato nella luce.';
      }
      if (language === 'Portuguese') {
        return 'Este filme parece uma memoria de desejo presa na luz.';
      }
      if (language === 'English') {
        return buildOverviewReply();
      }
      return `I can try a short line in ${language}. Ask me again in that language and I will stay there.`;
    };
    const buildColorReply = () => {
      const colorCues = [];
      const combined = [
        dictionary.blue,
        dictionary.night,
        dictionary.light,
        dictionary.color,
        dictionary.wine,
        ...(Array.isArray(trainingSeeds?.symbols) ? trainingSeeds.symbols : [])
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' | ');
      if (/electric blue|\bblue\b/.test(combined)) colorCues.push('electric blue');
      if (/flash|white|glow/.test(combined)) colorCues.push('flash-white');
      if (/rain|night|black|shadow|dark/.test(combined)) colorCues.push('rain-black');
      if (/wine|red|crimson/.test(combined)) colorCues.push('wine-red');
      const unique = colorCues.filter((item, index) => colorCues.indexOf(item) === index);
      if (unique.length) {
        const visible = unique.slice(0, 3);
        return `It leans ${visible.join(', ')} more than a neutral palette.`;
      }
      return pickDictionaryReply('blue', 'color', 'night', 'light');
    };
    const buildBackgroundReply = () => {
      const symbols = Array.isArray(trainingSeeds?.symbols)
        ? trainingSeeds.symbols.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const visibleSymbols = symbols.slice(0, 2);
      if (ctx?.world && visibleSymbols.length) {
        return `Behind her it feels like ${visibleSymbols.join(' and ')} inside ${ctx.world}. The background behaves like memory.`;
      }
      if (ctx?.world) {
        return `Behind her it feels like ${ctx.world}. The background behaves like atmosphere more than fixed set dressing.`;
      }
      return pickDictionaryReply('story', 'about', 'what is this about');
    };
    const buildGenericExpansionReply = () => {
      if (/\breferences?\b/.test(latestPrompt)) {
        return buildCrossDisciplineReferenceReply() || buildPrimaryReferenceReply();
      }
      if (/\b(?:background|behind)\b/.test(latestPrompt)) {
        return buildBackgroundReply();
      }
      if (/\b(?:color|colors|palette)\b/.test(latestPrompt)) {
        return buildColorReply();
      }
      if (/\bcameras?\b/.test(latestPrompt)) {
        return pickDictionaryReply('camera model', 'camera', 'photo', 'film')
          || 'The camera matters less as gear than as a way of translating distance into feeling.';
      }
      if (/\b(?:live|leave|from|japanese|french|nationality)\b/.test(latestPrompt)) {
        return ctx?.world
          ? `It stays somewhere inside ${ctx.world}, more atmosphere than passport.`
          : 'The film keeps her origin suggestive instead of fixed.';
      }
      if (ctx?.world && Array.isArray(ctx?.refs) && ctx.refs.length) {
        return `${ctx.world} keeps linking the mood back to ${ctx.refs[0]}. That is one way the film widens its world.`;
      }
      return pickDictionaryReply('about', 'story', 'what is this about')
        || 'Another way in: the film keeps treating atmosphere as evidence, not decoration.';
    };
    const isCrossDisciplineReferencePrompt = () => ((
      /\b(?:reference|references|influence|influences|lineage|ancestry)\b/.test(normalized)
      && /\b(?:other|another|more|discipline|disciplines|outside|beyond|art(?:\s+world)?|artist|artists|music|literature|theory|photography|photo|book|books)\b/.test(normalized)
    ) || /^(?:influence|influences)\s+from\s+the\s+art\s+world\b/.test(normalized));
    const isPrimaryReferencePrompt = () => (
      /^(?:of\s+the\s+references|the\s+references|of\s+references)\b/.test(normalized)
      || /^(?:what are the references|what is the references|give me some references?|can you give some references?|can you tell me references?|what references?)\b/.test(normalized)
      || /^(?:movie|film)\s+(?:references?|influences?|lineage|ancestry)\b/.test(normalized)
      || /^(?:what are|what is|give me|show me|tell me|list|name)\s+(?:some\s+|the\s+|any\s+)?(?:movie\s+|film\s+|main\s+|primary\s+|key\s+)?(?:references?|influences?|lineage|ancestry)\b/.test(normalized)
      || /^(?:references?|influences?|lineage|ancestry)\b/.test(normalized)
      || (/\b(?:movie|film)\b/.test(normalized) && /\b(?:reference|references|influence|influences|lineage|ancestry)\b/.test(normalized))
    );

    if (/^(?:parlez[\s-]*vous\s+francais|parlez[\s-]*vous\s+fran·ais)$/u.test(normalized)) {
      return {
        intent: 'language',
        reply: 'Oui, un peu. Pose la prochaine question en francais si tu veux que j\'y reste.'
      };
    }

    if (requestedLanguage && /^(?:say|speak|talk)(?:\s+something)?\s+(?:in|en)\s+/.test(normalized)) {
      return {
        intent: 'language',
        reply: buildSpokenLanguageReply(requestedLanguage)
      };
    }

    if (requestedLanguage && /^(?:something|anything|a\s+line|one\s+line)\s+(?:in|en)\s+/.test(normalized)) {
      return {
        intent: 'language',
        reply: buildSpokenLanguageReply(requestedLanguage)
      };
    }

    if (requestedLanguage && /\b(?:sing|singing|sung|song|chanson|speak|speaking|talk|talking|say|saying)\b/.test(normalized)) {
      return {
        intent: 'language',
        reply: buildSpokenLanguageReply(requestedLanguage)
      };
    }

    if (/^(?:do|can|could|would|will)\s+you\s+speak\b/.test(normalized) && requestedLanguage) {
      return {
        intent: 'language',
        reply: requestedLanguage === 'English'
          ? 'Yes. Ask the next question and I will keep it short.'
          : requestedLanguage === 'French'
            ? 'Oui, un peu. Demande la prochaine question en francais si tu veux que j\'y reste.'
            : requestedLanguage === 'Japanese'
              ? '????????????????????????????'
              : `A little. Ask the next question in ${requestedLanguage} if you want me to stay there.`
      };
    }

    if (!/\b(?:sing|singing|sung|song|chanson|speak|speaking|talk|talking|say|saying)\b/.test(normalized)
      && (/^(?:is|isnt|isn't|is not)\s+(?:the\s+)?(?:character|figure|muse|she)\s+(?:japanese|french|from\s+japan|from\s+france)\b/.test(normalized)
      || /\b(?:model|actor|character|figure|she|he)\b[^?.!]{0,24}\b(?:japanese|french)\b/.test(normalized)
      || (normalized.split(/\s+/).length <= 4 && /\b(?:japanese|french)\b/.test(normalized))
      || /^(?:what\s+nationality\s+is|where\s+is)\s+(?:the\s+)?(?:character|figure|muse|she)\b.*\b(?:from|meant\s+to\s+be)\b/.test(normalized))) {
      if (/paris.?tokyo/i.test(String(ctx?.world || ''))) {
        return {
          intent: 'identity',
          reply: 'Not as a fixed passport. She reads between Japan and France, more drift than biography.'
        };
      }

      return {
        intent: 'identity',
        reply: requestedLanguage
          ? `Not as a fixed nationality. The film leans toward ${requestedLanguage} inflection more than a named passport.`
          : 'Not as a fixed nationality. The film leaves her origin suggestive rather than explicit.'
      };
    }

    if (/^(?:are you|r u)\s+(?:japanese|french|human|real|alive|from japan|from france)\b/.test(normalized)) {
      return {
        intent: 'identity',
        reply: requestedLanguage
          ? `No fixed nationality. I can still echo ${requestedLanguage} when you want it.`
          : 'No fixed nationality. I only borrow the tone the frame asks for.'
      };
    }

    if (/^(?:where do you live|where are you from|where do you come from|where do you exist|where does she live|where does the character live|where does the figure live|where she live|where she leave|well she live|well she leave)\b/.test(normalized)) {
      return {
        intent: 'identity',
        reply: ctx?.world
          ? `Somewhere inside ${ctx.world}, more drift than address.`
          : 'Inside the frame, not outside it.'
      };
    }

    if (/\b(?:what|which)\s+color(?:s)?\b/.test(normalized)
      || /\b(?:color|colors|palette)\b.*\b(?:movie|movies|film|frame|scene)\b/.test(normalized)) {
      return {
        intent: 'theme',
        reply: buildColorReply() || 'The palette stays more electric than neutral.'
      };
    }

    if (/\b(?:what|which)\b[^?.!]{0,20}\b(?:background|behind)\b/.test(normalized)
      || /\b(?:background|behind her|behind the figure|behind the character)\b/.test(normalized)) {
      return {
        intent: 'setting',
        reply: buildBackgroundReply() || 'The background behaves like atmosphere more than fixed information.'
      };
    }

    if (isCrossDisciplineReferencePrompt()) {
      return {
        intent: 'reference',
        reply: buildCrossDisciplineReferenceReply() || pickDictionaryReply('influences', 'reference', 'film') || 'The references spill beyond cinema into music, literature, and theory.'
      };
    }

    if (isPrimaryReferencePrompt()) {
      return {
        intent: 'reference',
        reply: buildPrimaryReferenceReply() || 'The film leans on cross-cultural cinema, photography, and music more than a single source.'
      };
    }

    if (/\b(?:writing\s+on\s+the\s+wall|famous\s+painting|flemish\s+painting|rembrandt|belshazzar|balthazar|book\s+of\s+daniel|mene|tekel|upharsin|hebrew)\b/.test(normalized)) {
      return {
        intent: 'reference',
        reply: buildArtReferenceReply() || buildPrimaryReferenceReply() || 'It reads like a charged art-reference more than random set dressing.'
      };
    }

    if ((/\b(?:graffiti|writing\s+on\s+the\s+wall|wall\s+writing|script)\b/.test(normalized)
      && /\b(?:language|script|say|says|written|writing|read|reads)\b/.test(normalized))
      || /^(?:what|which|on\s+what)\s+language\b.*\b(?:graffiti|writing|wall|script)\b/.test(normalized)) {
      return {
        intent: 'language',
        reply: buildGraffitiLanguageReply()
      };
    }

    if (/\b(?:graffiti|writing\s+on\s+the\s+wall|wall\s+writing|script)\b/.test(normalized)) {
      return {
        intent: 'reference',
        reply: buildGraffitiReply() || buildArtReferenceReply() || 'The mark on the wall behaves like coded warning more than casual background detail.'
      };
    }

    if (/^(?:so\s+)?(?:tell me about (?:this|the) (?:movie|film)|what is (?:this|the) (?:movie|film) about|what is this about)\b/.test(normalized)) {
      return {
        intent: 'general',
        reply: buildOverviewReply() || pickDictionaryReply('what is this about', 'story', 'about')
      };
    }

    if (/^(?:so\s+)?(?:what\s+do\s+we\s+have\s+here|we\s+have\s+here|so\s+we\s+have\s+here|what\s+we\s+have\s+here)\b/.test(normalized)) {
      return {
        intent: 'general',
        reply: buildOverviewReply()
      };
    }

    if (/^(?:do\s+you\s+have\s+(?:any\s+)?connection\s+to\s+(?:japan|france)|connection\s+to\s+(?:japan|france)|or\s+(?:japan|france))\b/.test(normalized)) {
      return {
        intent: 'identity',
        reply: /paris.?tokyo/i.test(String(ctx?.world || ''))
          ? 'Yes, in the filmic sense. It sits between Tokyo and France as mood and reference, not as a fixed passport.'
          : 'Only as atmosphere and reference, not as a fixed biography.'
      };
    }

    if (/^(?:do\s+you\s+know\s+(?:her|the\s+figure|the\s+character)|do\s+you\s+know\s+who\s+she\s+is|who\s+is\s+she)\b/.test(normalized)) {
      return {
        intent: 'identity',
        reply: ctx?.persona
          ? `Only the way this film knows her: as ${ctx.persona}, half-revealed and more mood than dossier.`
          : 'Only in fragments. The film keeps her more like an afterimage than a biography.'
      };
    }

    if (/\b(?:family|mother|father|parents|parent|sister|brother|wife|husband|children|child)\b/.test(normalized)) {
      return {
        intent: 'identity',
        reply: 'No family history is fixed on screen. The film keeps her attachments offstage so she stays closer to an afterimage than a dossier.'
      };
    }

    if ((/\b(?:movie|film)\b/.test(normalized) && /\b(?:reflect|reflects|like|similar|closest|remind|reminds|recommend)\b/.test(normalized))
      || /^(?:do\s+you\s+know\s+any\s+movie|can\s+you\s+recommend\s+a\s+movie|what\s+movie)\b/.test(normalized)) {
      return {
        intent: 'reference',
        reply: buildCompanionFilmReply() || 'Closest cousins would be films that turn city loneliness into atmosphere rather than plot.'
      };
    }

    if (/^(?:give me some more information|give me more information|more information|tell me more|say more|what else|anything else|something else|something new|can you tell me something new|tell me something new)\b/.test(normalized)) {
      return {
        intent: 'general',
        reply: buildGenericExpansionReply()
      };
    }

    if (/^(?:can\s+you\s+explain|explain(?:\s+that)?|what\s+do\s+you\s+mean|how\s+so)\b/.test(normalized)) {
      return {
        intent: 'general',
        reply: buildCompanionFilmReply() || buildGenericExpansionReply() || buildOverviewReply()
      };
    }

    if (/\bwhere\b.*\b(?:location|setting|happen|happening|set|take place)\b/.test(normalized) || /^(?:what's|what is) the location$/.test(normalized)) {
      if (/darkroom/i.test(String(ctx?.world || ''))) {
        return {
          intent: 'setting',
          reply: 'Inside a darkroom-like interior. The rest is left intentionally unfixed.'
        };
      }

      if (ctx?.world) {
        const world = /^(?:a|an|the)\b/i.test(ctx.world) ? ctx.world : `a ${ctx.world}`;
        return {
          intent: 'setting',
          reply: `It feels set in ${world}, more atmosphere than fixed address.`
        };
      }

      return {
        intent: 'setting',
        reply: 'The setting stays intentionally unfixed, more atmosphere than address.'
      };
    }

    if (/\b(?:what|which)\s+(?:kind\s+of\s+)?cameras?\b/.test(normalized)
      || /\b(?:brand\s+of\s+the\s+camera|camera\s+brand|what\s+brand\s+(?:is\s+)?(?:the\s+)?camera)\b/.test(normalized)
      || /\bcameras?\b.*\b(?:she|the\s+character|the\s+figure|use|using|used|relation|between)\b/.test(normalized)) {
      const specificCameraReply = typeof dictionary['camera model'] === 'string' && dictionary['camera model'].trim()
        ? dictionary['camera model'].trim()
        : (typeof dictionary.camera === 'string' && dictionary.camera.trim() ? dictionary.camera.trim() : '');
      const cameraContext = `${String(ctx?.world || '')} ${String(ctx?.style || '')}`;
      return {
        intent: 'reference',
        reply: specificCameraReply || (/darkroom|photographic|camera|afterimage/i.test(cameraContext)
          ? 'No exact model is fixed. The film cares more about flash, grain, and the gaze than branded gear.'
          : 'No exact camera model is pinned down. It plays more like a remembered apparatus than a named piece of gear.')
      };
    }

    return null;
  }

  async function maybeHandleGroundedFreeChatReply(text = '', options = {}) {
    const normalized = String(text || '').trim();
    if (!normalized || !voiceManager || !isSyntheticDesiresMovie()) {
      return false;
    }

    if (typeof voiceManager?._isCurrentSceneDescriptionCue === 'function' && voiceManager._isCurrentSceneDescriptionCue(normalized)) {
      return false;
    }

    const _museSpeakProfile = options?.museSpeakProfile || null;

    if (isPodcastStatusCue(normalized)) {
      const statusReply = buildConversationModeStatusReply();
      if (!statusReply) return false;
      const source = options?.source === 'chat' ? 'chat' : 'mic';
      const startedAt = performance.now();
      voiceManager.onAiEngineChange?.('dict');
      voiceManager.onAiResponse?.(statusReply);
      voiceManager.speak?.(statusReply, _museSpeakProfile || {});
      voiceManager.onAiLog?.({
        engine: 'dict',
        movie: voiceManager?.currentMovie,
        input: normalized,
        output: statusReply,
        ms: Math.max(1, Math.round(performance.now() - startedAt)),
        memories: 0,
        level: 'L1',
        intent: 'status',
        training: false,
        focus: 'utility',
        action: source,
        examSource: 'PODCAST-STATUS',
        rank: '',
        score: null,
        vision: false,
        audio: source === 'mic'
      });
      return true;
    }

    if (isPassiveFreeChatAcknowledgement(normalized)) {
      return true;
    }

    const forceCloud = (voiceManager?.getPreferredMode?.() === 'cloud' || shouldUseCloudGuestExpansion(normalized));
    const groundedReply = await buildGroundedFreeChatMuseReply(normalized, {
      selectedMode: forceCloud ? 'cloud' : String(voiceManager?.getPreferredMode?.() || 'brain').toLowerCase()
    });
    if (groundedReply?.response) {
      const source = options?.source === 'chat' ? 'chat' : 'mic';
      const engineKey = groundedReply.engine === 'cloud'
        ? 'cloud'
        : groundedReply.engine === 'ollama'
          ? 'ollama-ready'
          : 'dict';
      const intent = String(groundedReply?.logEntry?.intent || groundedReply?.logEntry?.level || 'general').toLowerCase();
      voiceManager.onAiEngineChange?.(engineKey);
      rememberFreeChatPodcastSeed(normalized, groundedReply.response, {
        movie: voiceManager?.currentMovie,
        source,
        reason: 'free-chat-grounded-shared',
        engine: groundedReply.engine,
        intent
      });
      voiceManager.onAiResponse?.(groundedReply.response);
      voiceManager.speak?.(groundedReply.response, _museSpeakProfile || {});
      voiceManager.onAiLog?.({
        ...(groundedReply.logEntry || {}),
        action: source,
        audio: source === 'mic'
      });
      return true;
    }

    if (forceCloud && typeof voiceManager?.expandGuestPromptWithCloud === 'function') {
      const startedAt = performance.now();
      const cloudExpansion = await voiceManager.expandGuestPromptWithCloud(normalized, {
        timeoutMs: 10000,
        contextHints: getFilmContext(voiceManager?.currentMovie || '')
      });
      const response = String(cloudExpansion?.text || '').trim();
      if (response) {
        const source = options?.source === 'chat' ? 'chat' : 'mic';
        voiceManager.onAiEngineChange?.('cloud');
        rememberFreeChatPodcastSeed(normalized, response, {
          movie: voiceManager?.currentMovie,
          source,
          reason: 'free-chat-cloud',
          engine: 'cloud',
          intent: cloudExpansion?.intent || 'general'
        });
        voiceManager.onAiResponse?.(response);
        voiceManager.speak?.(response, _museSpeakProfile || {});
        voiceManager.onAiLog?.({
          engine: 'cloud',
          movie: voiceManager?.currentMovie,
          input: normalized,
          output: response,
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: 0,
          intent: cloudExpansion?.intent || 'general',
          training: false,
          focus: 'expansion',
          action: source,
          examSource: 'CLOUD-FREE-CHAT',
          vision: cloudExpansion?.usedFrame === true,
          audio: source === 'mic'
        });
        return true;
      }
    }

    const utilityReply = buildPodcastGuestUtilityReply(normalized);
    if (!utilityReply) return false;

    const source = options?.source === 'chat' ? 'chat' : 'mic';
    const startedAt = performance.now();
    voiceManager.onAiEngineChange?.('dict');
    rememberFreeChatPodcastSeed(normalized, utilityReply.reply, {
      movie: voiceManager?.currentMovie,
      source,
      reason: 'free-chat-utility',
      engine: 'dict',
      intent: utilityReply.intent
    });
    voiceManager.onAiResponse?.(utilityReply.reply);
    voiceManager.speak?.(utilityReply.reply, _museSpeakProfile || {});
    voiceManager.onAiLog?.({
      engine: 'dict',
      movie: voiceManager?.currentMovie,
      input: normalized,
      output: utilityReply.reply,
      ms: Math.max(1, Math.round(performance.now() - startedAt)),
      memories: 0,
      level: 'L1',
      intent: utilityReply.intent,
      training: false,
      focus: 'utility',
      action: source,
      examSource: 'UTILITY',
      rank: '',
      score: null,
      vision: false,
      audio: source === 'mic'
    });
    return true;
  }

  async function handlePodcastGuestAsFreeChat(text = '', options = {}) {
    const normalized = String(text || '').trim();
    const source = options?.source === 'chat' ? 'chat' : 'mic';
    const allowDuringTraining = options?.allowDuringTraining === true;
    if (!normalized || !voiceManager) return false;

    const hostBProfile = pickPodcastVoiceProfiles()?.hostB || {};
    const museSpeakProfile = {
      speaker: 'hostB',
      context: 'podcast-guest',
      ...(hostBProfile.voice ? { voice: hostBProfile.voice } : {}),
      ...(Number.isFinite(hostBProfile.pitch) ? { pitch: hostBProfile.pitch } : {}),
      ...(Number.isFinite(hostBProfile.rate) ? { rate: hostBProfile.rate } : {}),
    };

    const previousReply = String(voiceManager?._lastAiResponseText || '').trim();
    let replyText = '';

    const groundedHandled = await maybeHandleGroundedFreeChatReply(normalized, { source, museSpeakProfile });
    if (groundedHandled) {
      replyText = String(voiceManager?._lastAiResponseText || '').trim();
      // grounded path · update panel label to show Muse is answering
      if (replyText) showAiSpeech(`Muse · ${replyText}`, true);
    } else {
      setInlineActivity('podcast-thinking');
      const response = String(await voiceManager.respondTo(normalized, { allowDuringTraining, suppressDirectOutput: true }) || '').trim();
      setInlineActivity('');
      replyText = response || String(voiceManager?._lastAiResponseText || '').trim();
      if (replyText && replyText !== previousReply) {
        voiceManager.onAiResponse?.(replyText);
        showAiSpeech(`Muse · ${replyText}`, true);
        voiceManager.speak?.(replyText, museSpeakProfile);
      }
    }

    if (!replyText || replyText === previousReply) return false;

    const shouldSteerResume = rememberTrainingGuestDirective(normalized, replyText, source);
    lastPodcastGuestReplyAt = Date.now();
    podcastGuestPendingResumeDelayMs = getPodcastGuestResumeDelay([{ speaker: 'hostB', text: replyText }]);
    clearPodcastGuestPromptUi(source);
    // Never finalize immediately · synthesis.speaking isn't true yet (browser needs a tick to start).
    // onSpeakEnd handles the normal path; this safety timer catches cases where TTS never fires.
    setTimeout(() => {
      if (podcastGuestPendingResumeDelayMs > 0 &&
          !(voiceManager?.synthesis?.speaking || voiceManager?.synthesis?.pending)) {
        finalizePodcastGuestReplyResume(400); // TTS never fired, move on quickly
      }
    }, 500);
    return true;
  }

  function shouldUseCloudGuestExpansion(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized || !isPodcastGuestParticipationEnabled()) return false;
    if (isPodcastResumeCue(normalized) || isPodcastStatusCue(normalized) || isPodcastHostCue(normalized)) {
      return false;
    }
    if (/^(?:do|can|could|would|will)\s+you\s+speak\b/.test(normalized) || /^(?:parlez[\s-]*vous\s+francais|parlez[\s-]*vous\s+fran·ais)$/u.test(normalized)) {
      return false;
    }

    if (/\b(reference|references|influence|influences|lineage|ancestry|nouvelle\s+vague|new\s+wave|demy|varda|tati|marker)\b/.test(normalized)) {
      return true;
    }

    if (/\b(color|colors|palette|background|behind|flash|light|lighting|blue|image|scene|frame|shot)\b/.test(normalized)
      && /\b(movie|movies|film|background|behind|scene|frame|shot|her|him|figure|subject|we\s+see)\b/.test(normalized)) {
      return true;
    }

    if (/^(?:where does she live|where does the character live|where does the figure live|where is she from|where is the character from)\b/.test(normalized)) {
      return true;
    }

    if (/\b(japanese|french|nationality|from\s+japan|from\s+france)\b/.test(normalized)
      && (/\b(model|actor|character|figure|she|he)\b/.test(normalized) || normalized.split(/\s+/).length <= 4)) {
      return true;
    }

    if (/\b(cameras?|lens|frame|shot)\b/.test(normalized)
      && /\b(kind|what|which|relation|between|background|behind|use|using|used|see)\b/.test(normalized)) {
      return true;
    }

    if (/\b(director|directed\s+by|who\s+(?:made|directed|shot|wrote|created)|lost\s+in\s+translation|coppola|sofia|name)\b/.test(normalized)) {
      return true;
    }

    return false;
  }

  function shouldUseGemmaDirectGuestReply(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized || !isPodcastGuestParticipationEnabled()) return false;
    if (isPodcastResumeCue(normalized) || isPodcastStatusCue(normalized) || isPodcastHostCue(normalized)) {
      return false;
    }
    return voiceManager?.getPreferredMode?.() === 'gemma' || voiceManager?.isForceLocalGemmaEnabled?.() === true;
  }

  function shouldTryAdaptiveGemmaGuestReply(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized || !isPodcastGuestParticipationEnabled()) return false;
    if (isPodcastResumeCue(normalized) || isPodcastStatusCue(normalized) || isPodcastHostCue(normalized)) {
      return false;
    }
    if (!isSyntheticDesiresMovie()) {
      return voiceManager?.getPreferredMode?.() === 'gemma' || voiceManager?.isForceLocalGemmaEnabled?.() === true;
    }
    if (voiceManager?.isForceLocalGemmaEnabled?.() === true || voiceManager?.getPreferredMode?.() === 'gemma') {
      return true;
    }
    return !isMobile && voiceManager?._ollamaAvailable !== false;
  }

  function isWeakAdaptiveGuestLocalReply(prompt = '', reply = '') {
    const normalizedPrompt = normalizeVoiceText(prompt);
    const normalizedReply = normalizeVoiceText(reply);
    if (!normalizedReply) return true;
    if (voiceManager?._isLikelyTruncatedAiText?.(reply) === true) return true;

    const genericReplyPatterns = [
      /as a voice shaped by/i,
      /forgotten tongues/i,
      /shimmering trace/i,
      /fragments of light and sound/i,
      /fading melody/i,
      /fractured world/i,
      /haunting image/i
    ];
    if (genericReplyPatterns.some((pattern) => pattern.test(normalizedReply))) {
      return true;
    }

    const promptNeedsConcreteReply = /^(?:describe|can you describe|what are we talking about|what do we have here|so what we have here|what is this|who is she|who is this)\b/.test(normalizedPrompt)
      || /\b(?:figure|character|woman|muse|scene|movie|film|references?)\b/.test(normalizedPrompt);
    const concreteReplyCue = /\b(?:shinjuku|paris|tokyo|french|japanese|camera|flash|rain|neon|city|figure|woman|muse|echo|demy|varda|tati|marker|araki|chanson|hum|blue|background|corridor)\b/.test(normalizedReply);
    if (promptNeedsConcreteReply && !concreteReplyCue) {
      return true;
    }

    const stopWords = new Set(['about', 'again', 'around', 'because', 'describe', 'does', 'figure', 'film', 'have', 'here', 'into', 'just', 'more', 'movie', 'scene', 'some', 'talking', 'that', 'them', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'who', 'with', 'would']);
    const promptWords = normalizedPrompt
      .split(/\W+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 3 && !stopWords.has(word));
    const replyWords = new Set(normalizedReply
      .split(/\W+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 3));
    const promptOverlap = promptWords.filter((word) => replyWords.has(word));
    if (promptWords.length && !promptOverlap.length && !concreteReplyCue && normalizedReply.split(/\s+/).length <= 18) {
      return true;
    }

    return false;
  }

  function buildPodcastStatusUpdateLine() {
    if (isPublicPodcastStageParticipationReady()) {
      return hasPodcastGuestStageLiveState()
        ? 'You are on stage now. The hosts are folding your cue into the next exchange.'
        : 'Podcast AI is live. Use the mic or chat to steer the next exchange.';
    }

    const engine = String(_activeTrainingEngine || 'cloud').toLowerCase();
    const cloudFailures = Math.max(0, Number(activeTrainingSessionMetrics?.cloudFailedBatchesTotal || 0));
    const successfulBatches = Math.max(0, Number(activeTrainingSessionMetrics?.successfulBatches || 0));
    const summarySuffix = successfulBatches > 0
      ? ` ${successfulBatches} strong pass${successfulBatches === 1 ? '' : 'es'} already landed.`
      : '';

    if (engine === 'dict') {
      return `Cloud slipped, local slowed down, and template backup is carrying the session now.${summarySuffix}`;
    }

    if (engine === 'ollama') {
      const modelName = voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest';
      return `${modelName} is carrying the session locally${cloudFailures > 0 ? ' after the cloud slipped' : ' now'}.${summarySuffix}`;
    }

    if (cloudFailures > 0) {
      return `Cloud is still steering, but it has missed ${cloudFailures} batch${cloudFailures === 1 ? '' : 'es'}.${summarySuffix}`;
    }

    return `Cloud is steering the session and the local brain is learning live.${summarySuffix}`;
  }

  function buildPodcastGuestLeadInLine(prompt = '', response = '', options = {}) {
    const intent = String(options?.intent || 'general').trim().toLowerCase();
    const turnNumber = Math.max(1, Number(options?.turnNumber || podcastGuestInterjectionCount + 1));
    const seed = `${prompt}|${response}|${intent}|${turnNumber}|lead`;
    const ctx = getFilmContext(voiceManager?.currentMovie || '');
    const normalizedPrompt = normalizeVoiceText(prompt);
    const normalizedResponse = normalizeVoiceText(extractPrimaryBrainReply(response, response));
    const promptAnchors = buildPromptAnchoredRecoveryOptions(prompt, response, ctx);
    const answerFragment = summarizeForPodcast(extractPodcastAnswerFragment(response || ''), 10)
      .replace(/[.?!]+$/g, '')
      .trim();

    if (/^(?:can you start|start|begin|go ahead|let'?s start|start podcast|start the podcast)/.test(normalizedPrompt)) {
      return pickPromptVariant([
        'Start us where the frame already feels unstable.',
        'Open on the image that is already carrying pressure.',
        'Begin with the detail the film keeps hiding in plain sight.'
      ], seed) || 'Start us where the frame already feels unstable.';
    }

    if (/^(?:give me some more information|give me more information|more information|tell me more|say more|what else|anything else|something else|something new|can you tell me something new|tell me something new)/.test(normalizedPrompt)) {
      return pickPromptVariant([
        'Push us into a thread we have not opened yet.',
        'Take us somewhere the film has only hinted at so far.',
        'Shift the lens and give us a fresher corner of it.'
      ], seed) || 'Push us into a thread we have not opened yet.';
    }

    if (/\b(?:quote|quotes|line|lines|dialogue)\b/.test(normalizedPrompt)) {
      return pickPromptVariant([
        'Give us the line the film cannot stop hearing.',
        'Bring in the phrase that keeps echoing under the image.',
        'Pull out the line that sharpens the scene for us.'
      ], seed) || 'Give us the line the film cannot stop hearing.';
    }

    if (/\b(?:who|what)\s+(?:is|are)\b/.test(normalizedPrompt) || /\b(?:tell me about|about her|about him|about them)\b/.test(normalizedPrompt)) {
      return pickPromptVariant([
        'Keep it close to the figure before it turns into theory.',
        'Stay with the person the frame is building here.',
        'Hold on the character the film keeps half-revealing.'
      ], seed) || 'Keep it close to the figure before it turns into theory.';
    }

    if (/\b(?:where|setting|location|room|space|world)\b/.test(normalizedPrompt)) {
      return pickPromptVariant([
        'Keep us inside the room the image is making.',
        'Stay with the world pressing in around her.',
        'Hold on the space before we abstract it.'
      ], seed) || 'Keep us inside the room the image is making.';
    }

    if (promptAnchors.length) {
      return pickPromptVariant([
        ...promptAnchors,
        answerFragment ? `Stay with ${answerFragment} for a second.` : '',
        answerFragment ? `Push further into ${answerFragment}.` : ''
      ].filter(Boolean), `${seed}|anchored`) || promptAnchors[0];
    }

    if (answerFragment) {
      return pickPromptVariant([
        `Stay with ${answerFragment} for a second.`,
        `Keep close to ${answerFragment} before it turns abstract.`,
        `Press on ${answerFragment} and see what the frame gives back.`
      ], `${seed}|answer`) || `Stay with ${answerFragment} for a second.`;
    }

    if (intent === 'language') {
      const languageLabel = detectPodcastGuestLanguageLabel(prompt);
      if (languageLabel) {
        return pickPromptVariant([
          `Give it to us in ${languageLabel}.`,
          `Say it in ${languageLabel}.`,
          `Let it land in ${languageLabel}.`
        ], seed) || `Give it to us in ${languageLabel}.`;
      }
    }

    if (intent === 'reference') {
      return pickPromptVariant([
        'Anchor it in the references for us.',
        'Keep it close to the lineage for a second.',
        'Frame it through the references.'
      ], seed) || 'Anchor it in the references for us.';
    }

    if (intent === 'identity') {
      return pickPromptVariant([
        'Keep it close to her for a second.',
        'Stay with the figure itself here.',
        'Hold on the person before the theory.'
      ], seed) || 'Keep it close to her for a second.';
    }

    if (intent === 'setting') {
      return pickPromptVariant([
        'Stay with the room around her.',
        'Hold on the space for a second.',
        'Keep it in the frame, not outside it.'
      ], seed) || 'Stay with the room around her.';
    }

    return pickPromptVariant([
      'Stay with that image for a second.',
      'Put it in the film·s own terms.',
      'Keep it inside the frame for us.'
    ], seed) || 'Stay with that image for a second.';
  }

  function buildPodcastHostReturnLine(text = '') {
    const normalized = normalizeVoiceText(text);
    if (/^where /.test(normalized)) {
      return 'I am here. Which part of the film should we press on next?';
    }
    if (/^(hello|hi|hey)$/.test(normalized)) {
      return 'I am here. What in the frame is pulling at you right now?';
    }
    const options = [
      'I am here. What detail should we stay with?',
      'Still here. Which image feels most charged to you?',
      'I am here. What should the conversation open next?',
      'Here. Which part of the film wants another pass?'
    ];
    return pickPodcastHostPromptLine(options, `${normalized}|host-return`) || options[0];
  }

  function extractPodcastRecoveryKeywords(prompt = '', response = '', ctx = null) {
    const stopWords = new Set([
      'about', 'again', 'also', 'another', 'around', 'because', 'between', 'beautiful', 'confession', 'detail',
      'desire', 'desires', 'does', 'evidence', 'feel', 'feels', 'film', 'frame', 'from', 'have', 'here', 'image',
      'into', 'just', 'keep', 'keeps', 'kind', 'land', 'line', 'look', 'more', 'most', 'naming', 'part', 'really',
      'return', 'returning', 'returns', 'scene', 'simply', 'something', 'stated', 'stay', 'still', 'synthetic',
      'that', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'tied', 'what', 'when',
      'where', 'which', 'while', 'with', 'would', 'your'
    ]);
    const invalidKeywordPatterns = [
      /^(?:keep|keeps|return|returns|returning)$/,
      /^(?:detail|details|another|beautiful)$/,
      /^(?:feel|feels|tied|stay|stated|naming)$/,
      /^(?:image|frame|film|scene)$/,
      /^(?:atmosphere|evidence|confession)$/
    ];
    const combined = `${prompt} ${extractPrimaryBrainReply(response, response)}`;
    const normalizedCombined = normalizeVoiceText(combined);
    const keywords = [];
    const pushUnique = (value = '') => {
      const cleaned = String(value || '').trim();
      if (!cleaned) return;
      const normalizedValue = normalizeVoiceText(cleaned);
      if (!normalizedValue) return;
      if (normalizedValue.split(/\s+/).every((token) => stopWords.has(token) || invalidKeywordPatterns.some((pattern) => pattern.test(token)))) {
        return;
      }
      if (!keywords.includes(cleaned)) keywords.push(cleaned);
    };

    const phrasePool = [
      ctx?.persona || '',
      ctx?.world || '',
      ...(Array.isArray(ctx?.refs) ? ctx.refs : []),
      ...(Array.isArray(ctx?.anchors) ? ctx.anchors : [])
    ].filter(Boolean);

    phrasePool.forEach((phrase) => {
      const normalizedPhrase = normalizeVoiceText(phrase);
      if (!normalizedPhrase) return;
      const phraseTokens = normalizedPhrase.split(/\s+/).filter((token) => token.length >= 3);
      if (!phraseTokens.length) return;
      const hits = phraseTokens.filter((token) => normalizedCombined.includes(token));
      if (hits.length >= Math.min(2, phraseTokens.length)) pushUnique(phrase);
    });

    normalizedCombined
      .split(/\W+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !stopWords.has(token) && !invalidKeywordPatterns.some((pattern) => pattern.test(token)))
      .forEach((token) => pushUnique(token));

    return keywords.slice(0, 5);
  }

  function buildPromptAnchoredRecoveryOptions(prompt = '', response = '', ctx = null) {
    const normalizedPrompt = normalizeVoiceText(prompt);
    const normalizedReply = normalizeVoiceText(extractPrimaryBrainReply(response, response));
    const keywords = extractPodcastRecoveryKeywords(prompt, response, ctx);
    const lead = keywords[0] || '';
    const secondary = keywords[1] || '';
    const answerFragment = summarizeForPodcast(extractPodcastAnswerFragment(response || ''), 12)
      .replace(/[.?!]+$/g, '')
      .trim();
    const naturalLead = String(lead || '').replace(/^[a-z]/, (char) => char.toUpperCase());
    const naturalSecondary = String(secondary || '').replace(/^[a-z]/, (char) => char.toUpperCase());

    const options = [
      /\b(japanese|french|language|nationality|passport|france|japan)\b/.test(normalizedPrompt)
        ? 'Does the film make that feel like identity, or more like drift between worlds?'
        : '',
      /\b(japanese|french|language|nationality|passport|france|japan)\b/.test(normalizedReply)
        ? 'Where do those crossed languages actually touch the frame for you?'
        : '',
      naturalLead && naturalSecondary && naturalLead.toLowerCase() !== naturalSecondary.toLowerCase()
        ? `What does ${naturalLead} make visible that ${naturalSecondary} keeps hidden?`
        : '',
      naturalLead && naturalSecondary && naturalLead.toLowerCase() !== naturalSecondary.toLowerCase()
        ? `Where do ${naturalLead} and ${naturalSecondary} refuse to agree in the frame?`
        : '',
      naturalLead && naturalSecondary && naturalLead.toLowerCase() !== naturalSecondary.toLowerCase()
        ? `How does ${naturalLead} rewrite the weight of ${naturalSecondary} the longer the film holds it?`
        : '',
      naturalLead && naturalSecondary && naturalLead.toLowerCase() !== naturalSecondary.toLowerCase()
        ? `What truth does ${naturalLead} carry that ${naturalSecondary} never names directly?`
        : '',
      naturalLead && naturalSecondary && naturalLead.toLowerCase() !== naturalSecondary.toLowerCase()
        ? `If ${naturalLead} disappeared from the frame, what would ${naturalSecondary} lose?`
        : '',
      naturalLead && naturalSecondary && naturalLead.toLowerCase() !== naturalSecondary.toLowerCase()
        ? `What is the film asking you to choose between ${naturalLead} and ${naturalSecondary}?`
        : '',
      naturalLead
        ? `If we stay with ${naturalLead}, what does the image reveal instead of just naming it?`
        : '',
      naturalLead
        ? `Does ${naturalLead} land more like atmosphere, evidence, or confession there?`
        : '',
      naturalLead
        ? `What is ${naturalLead} doing to the mood that the dialogue never names directly?`
        : '',
      naturalLead
        ? `Where does ${naturalLead} feel most unstable in that image?`
        : '',
      naturalLead
        ? `What does the film ask us to hold in ${naturalLead} before we can name it?`
        : '',
      naturalLead
        ? `How does ${naturalLead} change the further into the film you go?`
        : '',
      naturalLead && ctx?.world
        ? `How does ${naturalLead} sit inside ${ctx.world}?`
        : '',
      naturalLead && ctx?.world
        ? `What does ${naturalLead} feel like when ${ctx.world} is pressing on it?`
        : '',
      answerFragment
        ? 'What in the image makes that feel true rather than simply stated?'
        : '',
      answerFragment
        ? 'Why does that detail carry so much more weight than the rest of the frame?'
        : '',
      answerFragment
        ? 'What would the image lose if that moment were cut?'
        : '',
      answerFragment
        ? 'What is still unresolved in that image even after it passes?'
        : '',
      answerFragment && ctx?.persona
        ? `How does that change the way you read the ${ctx.persona}?`
        : '',
      answerFragment && ctx?.persona
        ? `What does the ${ctx.persona} understand in that image that nobody says out loud?`
        : '',
      answerFragment && ctx?.world
        ? `Where does ${ctx.world} press on that feeling most strongly?`
        : '',
      answerFragment && ctx?.world
        ? `Why does ${ctx.world} make that detail harder to escape?`
        : '',
      naturalSecondary
        ? `What is ${naturalSecondary} doing in the background that the film refuses to explain?`
        : '',
      naturalSecondary
        ? `Where does ${naturalSecondary} feel like it belongs to a different film entirely?`
        : '',
    ].filter(Boolean);

    return options.slice(0, 20);
  }

  function buildPodcastGuestRecoveryLines(prompt = '', response = '', options = {}) {
    const {
      allowTwoStep = true,
      turnNumber = Math.max(1, podcastGuestInterjectionCount + 1)
    } = options;
    const ctx = getFilmContext(voiceManager?.currentMovie || '');
    const combined = `${prompt} ${response}`.toLowerCase();
    // Use turnNumber (varies per turn) so the hash picks different questions each pass
    const seed = `${prompt}|${response}|${turnNumber || podcastGuestInterjectionCount}`;
    const anchoredOptions = buildPromptAnchoredRecoveryOptions(prompt, response, ctx);
    const personaReferenced = !!ctx?.persona && normalizeVoiceText(combined).includes(normalizeVoiceText(ctx.persona).split(/\s+/)[0] || '');
    const worldReferenced = !!ctx?.world && normalizeVoiceText(combined).split(/\W+/).some((token) => token.length >= 4 && normalizeVoiceText(ctx.world).includes(token));
    const primaryOptions = [
      ...anchoredOptions,
      /ghost|echo|haunt|afterimage/.test(combined)
        ? 'If the ghost keeps returning, what does it want from the frame?'
        : '',
      /memory|archive|remember|evidence|past/.test(combined)
        ? 'What memory is that image trying so hard to hold onto?'
        : '',
      /neon|light|glow|frame|image/.test(combined)
        ? 'What is the light letting us see that the character still cannot say?'
        : '',
      /body|skin|porcelain|ceramic|flesh|gaze/.test(combined)
        ? 'What does the shot understand about the body before the character does?'
        : '',
      /signal|static|bandwidth|packet|latency|hum|frequency/.test(combined)
        ? 'What does that signal tell you about the world pressing in around them?'
        : '',
      /desire|longing|ache|grief/.test(combined)
        ? 'Where do you feel the longing settle in that image?'
        : '',
      (!anchoredOptions.length || personaReferenced) && ctx?.persona ? `How does that change the way you read the ${ctx.persona}?` : '',
      (!anchoredOptions.length || worldReferenced) && ctx?.world ? `How is ${ctx.world} leaning on that moment?` : '',
      'Why does that detail feel heavier than the rest of the frame?',
      'If the film keeps returning to that image, what is it still trying to work out?',
      'What is that line really carrying?',
      'Where does that land emotionally for you?',
      'What does that tell you about how the film is looking at this scene?'
    ].filter(Boolean);
    const secondaryOptions = [
      ...(anchoredOptions.length
        ? [
            'And what in the image keeps that from settling into a simpler answer?',
            'And where does the film sharpen that feeling instead of explaining it?'
          ]
        : []),
      /ghost|echo|haunt|afterimage|memory|archive|remember|evidence|past/.test(combined)
        ? 'And why does it come back like evidence instead of a memory that can fade?'
        : '',
      /neon|light|glow|frame|image/.test(combined)
        ? 'And what changes because the frame stays with it a little too long?'
        : '',
      /body|skin|porcelain|ceramic|flesh|gaze/.test(combined)
        ? 'And whose desire or control is shaping that gaze?'
        : '',
      /signal|static|bandwidth|packet|latency|hum|frequency/.test(combined)
        ? 'And does that pressure feel mechanical to you, or strangely intimate?'
        : '',
      /desire|longing|ache|grief/.test(combined)
        ? 'And why does that longing stay unresolved instead of opening into relief?'
        : '',
      (!anchoredOptions.length || personaReferenced) && ctx?.persona ? `And does that leave the ${ctx.persona} more exposed or more defended?` : '',
      (!anchoredOptions.length || worldReferenced) && ctx?.world ? `And what does that tell you about how ${ctx.world} holds the people inside it?` : '',
      'And what keeps that pressure from settling into something simpler?',
      'And what opens up once you read the image that way?',
      'And what kind of world makes that detail feel ordinary there?'
    ].filter(Boolean);

    const primaryLine = pickPodcastHostPromptLine(primaryOptions, `${seed}|primary`) || primaryOptions[0] || 'What in that image refuses to settle?';
    const lines = [primaryLine];
    const includeSecondLine = allowTwoStep && shouldUseLongPodcastExchange(turnNumber);
    if (includeSecondLine && secondaryOptions.length) {
      const secondaryLine = pickPodcastHostPromptLine(secondaryOptions, `${seed}|secondary`, { avoid: [primaryLine] });
      if (secondaryLine) lines.push(secondaryLine);
    }
    return lines;
  }

  function isPodcastResumeCue(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;
    if (/^(show continue|continue show|continue podcast|resume podcast|back to podcast|go back to podcast|come on back to podcast|i want you back to podcast|talk between you|so talk between you|talk to each other|you two talk|keep the podcast going|move the podcast|move podcast|move the show|push the podcast|push podcast|keep the show moving|ok|okay|alright|all right|carry on)$/.test(normalized)) {
      return true;
    }
    return /\b(move|push|resume|continue|restart|keep)\b.*\b(podcast|show|conversation)\b/.test(normalized);
  }

  function isPodcastExpansionCue(text = '') {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return false;
    return /^(?:give me some more information|give me more information|more information|tell me more|say more|what else|anything else|something else|something new|can you tell me something new|tell me something new)$/.test(normalized);
  }

  function isPodcastSoftResumeCue(text = '') {
    return isPodcastResumeCue(text)
      || isPodcastExpansionCue(text)
      || isPassiveFreeChatAcknowledgement(text);
  }

  function shouldNarratePodcastFailure(totalFailures = 0) {
    const safeTotal = Math.max(0, Number(totalFailures || 0));
    if (!safeTotal) return false;
    return safeTotal === 1 || ((safeTotal - 1) % 4 === 0);
  }

  function shouldNarrateTemplateBackupKeepAlive(batchNumber = 0) {
    const safeBatchNumber = Math.max(0, Number(batchNumber || 0));
    if (!podcastTrainingEnabled || !safeBatchNumber) return false;
    if (podcastEngine.isSpeaking || podcastEngine.queue.length >= 3) return false;
    const lastKeepAliveBatch = Math.max(0, Number(activeTrainingSessionMetrics?.lastTemplateKeepAliveBatch || 0));
    if (!lastKeepAliveBatch) return safeBatchNumber >= 4;
    return (safeBatchNumber - lastKeepAliveBatch) >= 8;
  }

  function queueTemplateBackupKeepAlive(batchNumber = 0, prompt = 'template backup') {
    if (!shouldNarrateTemplateBackupKeepAlive(batchNumber)) return;
    if (activeTrainingSessionMetrics) {
      activeTrainingSessionMetrics.lastTemplateKeepAliveBatch = Math.max(0, Number(batchNumber || 0));
    }
    const keepAliveLines = buildPodcastResumeLines({
      lastSpeaker: 'hostB',
      prompt: `${prompt}|template|${batchNumber}`,
      turnNumber: batchNumber
    }).filter((line) => String(line?.text || '').trim());
    if (!keepAliveLines.length) return;
    injectPodcastNarration(keepAliveLines, { cancelActive: false, prioritize: false, force: true });
  }

  function getLatestPodcastBatchSnapshot() {
    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    const entries = Array.from(podcastBatchHighlights.entries())
      .sort((a, b) => Number(b[0] || 0) - Number(a[0] || 0));
    let latestBatchNumber = 0;
    let latestMovie = currentMovie || voiceManager?.currentMovie || '';
    const recentItems = [];
    const seen = new Set();

    // Free-chat seeds are used as creative context only · never as the first/direct podcast line
    // to avoid Muse echoing the last free-chat answer verbatim at podcast start.
    const freeChatAdded = 0;
    // (free-chat seeds intentionally not injected at top of snapshot)

    for (const [batchNumber, rawItems] of entries) {
      const items = Array.isArray(rawItems)
        ? rawItems.filter((item) => {
            if (!String(item?.input || '').trim() && !String(item?.response || '').trim()) return false;
            // Only include items that belong to the current movie so a stale snapshot
            // from a previous film cannot contaminate questions for the new one.
            const itemMovie = String(item?.movie || '').trim();
            return !currentMovie || !itemMovie || itemMovie === currentMovie;
          })
        : [];
      if (!items.length) continue;
      if (!latestBatchNumber) {
        latestBatchNumber = Math.max(0, Number(batchNumber || 0));
        latestMovie = items[items.length - 1]?.movie || voiceManager?.currentMovie || '';
      }
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        const signature = [
          normalizeVoiceText(item?.input || ''),
          normalizeVoiceText(extractPrimaryBrainReply(item?.response || '')),
          normalizeVoiceText(item?.focus || '')
        ].join('|');
        if (!signature.replace(/\|/g, '')) continue;
        if (seen.has(signature)) continue;
        seen.add(signature);
        recentItems.push(item);
        if (recentItems.length >= 5) break;
      }
      if (recentItems.length >= 5) break;
    }

    if (!latestBatchNumber || !recentItems.length) return null;
    return {
      batchNumber: latestBatchNumber,
      items: recentItems,
      movie: latestMovie
    };
  }

  function getLatestTrainingGuestDirective(maxAgeMs = 120000) {
    const directives = Array.isArray(activeTrainingSessionMetrics?.guestDirectives)
      ? activeTrainingSessionMetrics.guestDirectives
      : [];
    const latest = directives.find((item) => String(item?.input || '').trim() && String(item?.response || '').trim())
      || (String(publicPodcastGuestDirective?.input || '').trim() && String(publicPodcastGuestDirective?.response || '').trim()
        ? publicPodcastGuestDirective
        : null);
    if (!latest) return null;
    const recordedAt = Math.max(0, Number(latest?.at || 0));
    if (recordedAt && (Date.now() - recordedAt) > Math.max(1000, Number(maxAgeMs || 0))) {
      return null;
    }
    return {
      input: String(latest.input || '').trim(),
      response: String(latest.response || '').trim(),
      source: String(latest.source || '').trim(),
      at: recordedAt
    };
  }

  function buildPodcastResumeLines(options = {}) {
    const { lastSpeaker = 'hostB', prompt = '', forceReturn = false, turnNumber = 0, guestRecovery = false } = options;
    const snapshot = getLatestPodcastBatchSnapshot();
    const latestGuestDirective = guestRecovery ? getLatestTrainingGuestDirective() : null;
    const resumeTurn = Math.max(
      1,
      Number(turnNumber || 0)
      || Number(snapshot?.batchNumber || 0)
      || Number(activeTrainingSessionMetrics?.successfulBatches || 0)
      || Math.max(1, podcastGuestInterjectionCount + 1)
    );
    const recoveryPrompt = String(latestGuestDirective?.input || prompt || '').trim();
    const recoveryReply = String(latestGuestDirective?.response || '').trim();
    const adaptiveRecoveryLines = guestRecovery && (recoveryPrompt || recoveryReply)
      ? buildPodcastGuestRecoveryLines(recoveryPrompt, recoveryReply || prompt, {
        allowTwoStep: false,
        turnNumber: resumeTurn
      }).map((text) => ({ speaker: 'hostA', text }))
      : [];

    if (snapshot) {
      const syntheticBatchNumber = Math.max(1, Number(snapshot.batchNumber || 0) + resumeTurn);
      const generatedLines = buildPodcastBatchLines(syntheticBatchNumber, snapshot.items, snapshot.movie, {
        preferQuestionMode: true,
        forceShortForm: guestRecovery,
        guestPrompt: recoveryPrompt,
        guestReply: recoveryReply
      });
      if (adaptiveRecoveryLines.length) {
        const hostBLines = generatedLines
          .filter((line) => line?.speaker === 'hostB' && String(line?.text || '').trim());
        return [...adaptiveRecoveryLines, ...hostBLines].filter((line) => String(line?.text || '').trim());
      }
      if (forceReturn) {
        return generatedLines.filter((line) => String(line?.text || '').trim());
      }
      if (lastSpeaker === 'hostA' && generatedLines[0]?.speaker === 'hostA') {
        return generatedLines.slice(1).filter((line) => String(line?.text || '').trim());
      }
      return generatedLines.filter((line) => String(line?.text || '').trim());
    }

    const ctx = getFilmContext(voiceManager?.currentMovie || '');
    // Use resumeTurn (not podcastGuestInterjectionCount) so the same anchor on a later turn picks a different observation
    const observation = pickPromptVariant(ctx?.observations || ['The frame is still thinking.'], `${prompt}|${resumeTurn}|resume`)
      || 'The frame is still thinking.';
    const longForm = guestRecovery ? false : shouldUseLongPodcastExchange(resumeTurn);
    const hostBLines = buildPodcastHostAnswerLines(observation, {
      seed: `${prompt}|${resumeTurn}|resume`,
      movie: voiceManager?.currentMovie || '',
      lead: pickPromptVariant(ctx?.anchors || [], `${prompt}|${resumeTurn}|lead`) || '',
      ref: pickPromptVariant(ctx?.refs || [], `${prompt}|${resumeTurn}|ref`) || '',
      focus: 'frame',
      allowTwoStep: longForm,
      longForm
    }).map((text) => ({ speaker: 'hostB', text }));
    if (forceReturn) {
      return [
        ...buildPodcastGuestRecoveryLines(recoveryPrompt || prompt, recoveryReply || observation, {
          allowTwoStep: !guestRecovery,
          turnNumber: resumeTurn
        }).map((text) => ({ speaker: 'hostA', text })),
        ...hostBLines
      ];
    }
    if (lastSpeaker === 'hostA') {
      return hostBLines;
    }
    return [
      ...buildPodcastGuestRecoveryLines(recoveryPrompt || prompt, recoveryReply || observation, {
        allowTwoStep: !guestRecovery,
        turnNumber: resumeTurn
      }).map((text) => ({ speaker: 'hostA', text })),
      ...hostBLines
    ];
  }

  function shouldPreviewTrainingPairInChat(progress = {}, previewCount = 0) {
    if (shouldSuppressPodcastTrainingAdminChat()) return false;
    return progress?.trainingEngine !== 'template' || previewCount < 10;
  }

  function shouldNarratePodcastBatchWindow(batchNumber = 0, items = [], options = {}) {
    const safeBatchNumber = Math.max(0, Number(batchNumber || 0));
    if (!podcastTrainingEnabled || !safeBatchNumber || podcastNarratedBatchNumbers.has(safeBatchNumber)) {
      return false;
    }
    const hasConcreteHighlight = Array.isArray(items)
      && items.some((item) => String(item?.input || '').trim() || String(item?.response || '').trim());
    if (!hasConcreteHighlight) return false;
    const successfulBatchCount = Math.max(0, Number(activeTrainingSessionMetrics?.successfulBatches || 0));
    const trainingEngine = String(options?.trainingEngine || '').toLowerCase();
    const savedThisBatch = Math.max(0, Number(options?.savedThisBatch || 0));
    if (trainingEngine === 'template') {
      if (!savedThisBatch) return false;
      return successfulBatchCount === 1 || (successfulBatchCount > 1 && ((successfulBatchCount - 1) % 4 === 0));
    }
    return successfulBatchCount <= 2 || (successfulBatchCount > 2 && (successfulBatchCount % 2) === 0);
  }

  function summarizeForPodcast(text = '', maxWords = 18) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return `${words.slice(0, maxWords).join(' ')}·`;
  }

  function summarizePodcastQuestion(text = '', maxWords = 18, fallback = 'What stays with you?') {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    const base = normalized.split('?').map((part) => part.trim()).filter(Boolean)[0] || normalized;
    const words = base.split(/\s+/).filter(Boolean);
    const trimmed = words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}·` : base;
    const capitalized = trimmed.replace(/^[a-z]/, (char) => char.toUpperCase());
    return capitalized.endsWith('?') ? capitalized : `${capitalized}?`;
  }

  function extractPrimaryBrainReply(text = '', fallback = '') {
    const normalized = String(text || '').trim();
    if (!normalized) return fallback;
    const a1Match = normalized.match(/(?:^|\b)A1:\s*([\s\S]*?)(?:\s*\|\|\s*A2:|$)/i);
    const primary = a1Match?.[1]?.trim()
      || normalized.split(/\s*\|\|\s*/)[0]?.replace(/^A\d:\s*/i, '').trim()
      || normalized;
    return primary || fallback;
  }

  function shouldRememberFreeChatPodcastSeed(input = '', response = '') {
    const prompt = String(input || '').trim();
    const reply = String(extractPrimaryBrainReply(response, response) || '').trim();
    const normalizedPrompt = normalizeVoiceText(prompt);
    const normalizedReply = normalizeVoiceText(reply);
    if (!prompt || !reply || !normalizedPrompt || !normalizedReply) return false;
    if (!isSyntheticDesiresMovie()) return false;
    if (isPassiveFreeChatAcknowledgement(prompt)) return false;
    if (/^(?:podcast mode|free chat|speech recognition is not responding|network error reaching speech service|could not start microphone)\b/.test(normalizedReply)) return false;
    if (/^(?:change|switch|turn|move|set|go)\b.*\b(?:podcast|chat|free chat)\b/.test(normalizedPrompt)) return false;

    const promptWords = normalizedPrompt.split(/\s+/).filter(Boolean);
    const replyWords = normalizedReply.split(/\s+/).filter(Boolean);
    const movieGroundedCue = /\b(?:movie|film|scene|frame|image|camera|light|background|reference|references|director|future|quote|japanese|chinese|darkroom|grain|exposure|rope|shutter|lens|body|red|flash)\b/.test(normalizedPrompt);
    const strongReply = replyWords.length >= 3 || reply.length >= 18;
    return strongReply && (movieGroundedCue || promptWords.length >= 2);
  }

  function buildSplitStyleQuestionAngles(options = {}) {
    const movie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : getFilmContext(movie || '');
    const prompt = String(options?.prompt || '').trim();
    const response = String(options?.response || '').trim();
    const turnNumber = Math.max(1, Number(options?.turnNumber || 1));
    const recentQuestionBlocklist = new Set(
      recentPodcastHostQuestionLines
        .map((line) => normalizeVoiceText(line))
        .filter(Boolean)
    );
    const rawAngles = [
      ...buildPodcastGuestRecoveryLines(prompt, response, { allowTwoStep: false, turnNumber }),
      ...buildPromptAnchoredRecoveryOptions(prompt, response, ctx),
      ...(Array.isArray(ctx?.anchors) ? ctx.anchors.slice(0, 2).map((anchor) => `What is ${anchor} doing to the mood there?`) : []),
      ...(Array.isArray(ctx?.refs)
        ? ctx.refs.slice(0, 2).map((ref, index) => index === 0
          ? `What changes once ${ref} starts shadowing the frame?`
          : `Why does ${ref} feel so loaded in that moment?`)
        : []),
      ...(Array.isArray(ctx?.observations)
        ? ctx.observations.slice(0, 2).map((line) => {
            const fragment = summarizeForPodcast(line, 10).replace(/[.?!]+$/g, '').trim();
            return fragment ? `What in the image makes ${fragment.toLowerCase()} feel true?` : '';
          })
        : [])
    ]
      .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const uniqueAngles = [];
    const seen = new Set();
    for (const line of rawAngles) {
      const normalized = normalizeVoiceText(line);
      if (!normalized || seen.has(normalized) || recentQuestionBlocklist.has(normalized)) continue;
      seen.add(normalized);
      uniqueAngles.push(line);
      if (uniqueAngles.length >= 4) break;
    }

    return uniqueAngles;
  }

  async function buildGroundedFreeChatMuseReply(text = '', options = {}) {
    const normalized = String(text || '').trim();
    const movie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    if (!normalized || !movie) return null;

    const ctx = options?.ctx && typeof options.ctx === 'object' ? options.ctx : getFilmContext(movie || '');
    const snapshot = getLatestPodcastBatchSnapshot();
    const matchingFreeChatSeed = freeChatPodcastSeeds.find((item) => String(item?.movie || '').trim() === movie) || null;
    const seedPrompt = String(options?.seedPrompt || snapshot?.items?.[0]?.input || matchingFreeChatSeed?.input || '').trim();
    const seedResponse = String(options?.seedResponse || snapshot?.items?.[0]?.response || matchingFreeChatSeed?.response || '').trim();
    const retrievalQuery = [normalized, seedPrompt, seedResponse, movie].filter(Boolean).join(' ');
    let sceneContext = '';

    try {
      const retrieval = await getMovieRetrievalContext(movie, retrievalQuery, { limit: 3 });
      sceneContext = String(retrieval?.block || '').trim();
    } catch {
      sceneContext = '';
    }

    return buildPodcastAutonomousMuseReply(normalized, {
      movie,
      ctx,
      seedPrompt,
      seedResponse,
      selectedMode: String(options?.selectedMode || voiceManager?.getPreferredMode?.() || 'brain').toLowerCase(),
      sceneContext
    });
  }

  function beginFreeChatSeedCapture(input = '', source = 'chat') {
    const prompt = String(input || '').trim();
    if (!prompt) {
      pendingFreeChatSeedCapture = null;
      return;
    }
    if (selectedConversationSurfaceMode !== 'chat' || isPodcastConversationSurfaceActive()) {
      pendingFreeChatSeedCapture = null;
      return;
    }
    if (!isSyntheticDesiresMovie() || isPassiveFreeChatAcknowledgement(prompt)) {
      pendingFreeChatSeedCapture = null;
      return;
    }
    recordFreeChatTurn(String(voiceManager?.currentMovie || '').trim());
    pendingFreeChatSeedCapture = {
      input: prompt,
      source,
      movie: String(voiceManager?.currentMovie || '').trim(),
      at: Date.now()
    };
  }

  function rememberFreeChatPodcastSeed(input = '', response = '', options = {}) {
    const prompt = String(input || '').trim();
    const reply = String(extractPrimaryBrainReply(response, response) || '').trim();
    const movie = String(options?.movie || voiceManager?.currentMovie || '').trim();
    if (!movie || !shouldRememberFreeChatPodcastSeed(prompt, reply)) return false;

    const normalizedEngine = String(options?.engine || getPodcastReplyMode() || 'dict').toLowerCase();
    const trainingEngine = normalizedEngine === 'gemma' || normalizedEngine === 'brain'
      ? 'ollama'
      : normalizedEngine === 'cloud'
        ? 'cloud'
        : 'dict';
    const signature = [normalizeVoiceText(prompt), normalizeVoiceText(reply), movie].join('|');
    freeChatPodcastSeeds = [
      {
        batchNumber: 1,
        movie,
        focus: String(options?.focus || '').trim(),
        input: summarizePodcastQuestion(prompt, 18, prompt),
        response: summarizeForPodcast(reply, 28),
        intent: String(options?.intent || 'general').trim(),
        trainingMode: 'free-chat',
        trainingEngine,
        reason: String(options?.reason || 'free-chat-seed').trim(),
        signature,
        at: Date.now()
      },
      ...freeChatPodcastSeeds.filter((item) => item?.signature !== signature && item?.movie === movie)
    ].slice(0, 4);
    recordFreeChatSeed(movie);
    return true;
  }

  function pickPodcastVoiceProfiles() {
    // Host A: measured interviewer pace. Host B: per-film voice character from movieBrains voiceProfile.
    const hostAPitch = 0.9;    // Slightly lower so Host A separates from Muse more clearly
    const hostARate = 0.91;    // Measured interviewer cadence

    // Pull per-film pitch/rate from the loaded movie brain's voiceProfile
    const movieVP = voiceManager?.currentMovieBrain?.voiceProfile || {};
    const hostBPitch = Number.isFinite(movieVP.pitch) ? Math.max(0.80, Math.min(1.20, movieVP.pitch)) : 0.97;
    const hostBRate  = Number.isFinite(movieVP.rate)  ? Math.max(0.78, Math.min(1.02, movieVP.rate))  : 0.88;
    const movieVoiceHints = Array.isArray(movieVP.voiceHints) ? movieVP.voiceHints.map(h => String(h).toLowerCase()) : [];

    const priorHostA = podcastVoiceProfiles?.hostA || null;
    const priorHostB = podcastVoiceProfiles?.hostB || null;

    if (!voiceManager?.voices?.length) {
      podcastVoiceProfiles = {
        hostA: { voice: null, pitch: 0.86, rate: 0.9 },
        hostB: { voice: null, pitch: 1.14, rate: 0.98 }
      };
      return podcastVoiceProfiles;
    }

    const voices = voiceManager.voices.filter(Boolean);
    const englishVoices = voices.filter((voice) => /en/i.test(String(voice?.lang || '')));
    const pool = englishVoices.length ? englishVoices : voices;
    
    // Debug: What does the user actually have?
    if (voices.length > 0 && !window._loggedVoices) {
      console.log('[Voice Debug] Available Pool:', pool.map(v => `${v.name} (${v.lang})`));
      window._loggedVoices = true;
    }
    const podcastPool = pool;
    // Extended female name pattern · the Muse is ALWAYS a woman, matching the film's figure.
    const femaleVoicePattern = /female|woman|zira|aria|jenny|samantha|ava|serena|allison|libby|victoria|susan|hazel|amber|google us english.*female|siri.*female|karen|moira|fiona|tessa|veena|alice|lisa|nikita/i;
    const maleVoicePattern = /male|man|guy|david|mark|james|george|roger|eric|jason|ryan|andrew|christopher|daniel|reed|thomas/i;
    const likelyFemaleVoice = (voice) => femaleVoicePattern.test(String(voice?.name || ''));
    const likelyMaleVoice = (voice) => !likelyFemaleVoice(voice) && maleVoicePattern.test(String(voice?.name || ''));
    const cachedHostAVoice = priorHostA?.preferDefault
      ? null
      : (priorHostA?.voice && podcastPool.includes(priorHostA.voice) ? priorHostA.voice : null);
    // Bust hostB voice cache when the film changes so new voiceHints take effect
    const priorHostBMovie = podcastVoiceProfiles?._hostBMovie;
    const currentMovie = String(voiceManager?.currentMovie || '');
    const hostBCacheValid = priorHostBMovie === currentMovie;
    const cachedHostBVoice = (priorHostB?.preferDefault || !hostBCacheValid)
      ? null
      : (priorHostB?.voice && podcastPool.includes(priorHostB.voice) ? priorHostB.voice : null);

    const rankHostAVoice = (voice, index = 0) => {
      const name = String(voice?.name || '').toLowerCase();
      const lang = String(voice?.lang || '').toLowerCase();
      let score = 0;
      if (!/en/.test(lang)) score -= 20;
      if (voice?.localService) score += 24;
      if (likelyFemaleVoice(voice)) score += 40;  // Per user: "always woman voice answering"
      if (/^en-us/.test(lang) || /us english|american/.test(name)) score += 16;
      if (/^en-gb/.test(lang) || /uk english|british/.test(name)) score -= 24;
      if (/microsoft guy|guy online|\bguy\b|man\b|male\b/.test(name)) score -= 100; // Host A MUST NOT be male
      if (/google us english male/.test(name)) score -= 100;
      if (/christopher|andrew|davis|ryan|jason|eric|david|mark|james|george|roger/.test(name)) score -= 120;
      if (/natural|online/.test(name)) score += 30; // High quality voices are Great for podcasts
      if (/desktop|robot|synth/.test(name)) score -= 15;
      return score - (index * 0.001);
    };

    const rankHostBVoice = (voice, index = 0) => {
      const name = String(voice?.name || '').toLowerCase();
      const lang = String(voice?.lang || '').toLowerCase();
      let score = /en/.test(lang) ? 2 : 0;
      if (voice?.localService) score += 24;
      // The Muse is ALWAYS female · heavily reward female voices, penalise male voices.
      if (likelyFemaleVoice(voice)) score += 60;
      if (likelyMaleVoice(voice)) score -= 60;
      if (/aria|jenny|samantha|ava|serena|allison|libby|victoria|susan|zira|amber|hazel/.test(name)) score += 20;
      if (/natural|online/.test(name)) score += 30;
      if (/desktop|robot|synth/.test(name)) score -= 15;
      // Boost voices matching the current film's voiceHints — allows per-film voice character
      if (movieVoiceHints.length && movieVoiceHints.some(h => name.includes(h) || lang.includes(h))) score += 80;
      // Extra boost for French or Japanese voices when the hints ask for them
      const wantsFrench = movieVoiceHints.some(h => /fr|french|français/.test(h));
      const wantsJapanese = movieVoiceHints.some(h => /ja|japanese|日本/.test(h));
      if (wantsFrench && (/fr[-_]|french|français/.test(lang) || /french|française|pauline|amélie/.test(name))) score += 60;
      if (wantsJapanese && (/ja[-_]|japan/.test(lang) || /japanese|kyoko|haruka|hana/.test(name))) score += 60;
      return score - (index * 0.001);
    };

    // Per user request: The Muse (Host B) MUST be a woman to match the film's figure.
    // Pick Muse FIRST so she gets the best female voice.
    const musePool = podcastPool.filter((voice) => likelyFemaleVoice(voice));
    const museVoice = priorHostB?.preferDefault
      ? null
      : cachedHostBVoice || (musePool.length ? musePool : podcastPool)
      .map((voice, index) => ({ voice, score: rankHostBVoice(voice, index) }))
      .sort((a, b) => b.score - a.score)[0]?.voice || null;

    // Host A (Interviewer) prefers another female voice, but will share the Muse's voice if it's the only female option.
    const femalePool = podcastPool.filter((voice) => likelyFemaleVoice(voice));
    const interviewerPool = femalePool.filter((voice) => voice !== museVoice);
    // If we have AT LEAST one female voice, use it (even if we have to share). 
    // Only go to male pool if NO female voices exist at all.
    const hostAPool = interviewerPool.length 
      ? interviewerPool 
      : (femalePool.length ? femalePool : podcastPool.filter((voice) => voice !== museVoice));
    const interviewer = priorHostA?.preferDefault
      ? null
      : cachedHostAVoice || (hostAPool.length ? hostAPool : podcastPool)
      .map((voice, index) => ({ voice, score: rankHostAVoice(voice, index) }))
      .sort((a, b) => b.score - a.score)[0]?.voice || null;

    // ALWAYS differentiate pitch · on any platform where both fall back to browser default,
    // pitch is the only way to tell them apart.
    const isMobileDevice = Boolean(voiceManager?._isMobile);
    const hasDedicatedMaleVoice = /male|guy|christopher|andrew|davis|ryan|jason|eric|david|mark/i.test(interviewer?.name || '');
    // Final check: if Host A or Host B ended up as a man, we have a problem.
    // Differentiate pitch heavily based on gender patterns.
    const isMaleA = maleVoicePattern.test(String(interviewer?.name || '').toLowerCase());
    const isMaleB = maleVoicePattern.test(String(museVoice?.name || '').toLowerCase());
    const sameVoice = interviewer === museVoice || (!interviewer && !museVoice);
    const forceDifferentiate = sameVoice || isMaleA || isMaleB || (isMobileDevice && !hasDedicatedMaleVoice) || pool.length <= 1;

    console.log(`[Podcast Debug] Profiles picked:
      Host A (Interviewer): ${interviewer?.name || 'Default'} (Pitch: ${forceDifferentiate ? (isMaleA ? 1.3 : 0.72) : hostAPitch})
      Host B (Muse): ${museVoice?.name || 'Default'} (Pitch: ${forceDifferentiate ? (isMaleB ? 1.5 : 1.28) : hostBPitch})
      Differentiated: ${forceDifferentiate} | Same Voice: ${sameVoice}
    `);

    // Viewer: pick a third distinct voice (avoid both previous selections); use a noticeably different pitch/rate
    const viewerPool = podcastPool.filter((voice) => voice !== interviewer && voice !== museVoice);
    const viewerVoice = (viewerPool.length ? viewerPool : podcastPool)
      .map((voice, index) => ({ voice, score: (likelyFemaleVoice(voice) ? 10 : 0) + index * -0.001 }))
      .sort((a, b) => b.score - a.score)[0]?.voice || interviewer || museVoice || null;

    podcastVoiceProfiles = {
      // Host A (interviewer): warm female voice, not too deep (0.95 is the sweet spot)
      hostA: { voice: interviewer, pitch: forceDifferentiate ? (isMaleA ? 1.28 : 0.86) : Math.max(0.86, hostAPitch), rate: forceDifferentiate ? 0.9 : hostARate, preferDefault: !!priorHostA?.preferDefault },
      // Host B (Muse): per-film pitch/rate from movieBrains voiceProfile; voice biased by voiceHints
      hostB: { voice: museVoice, pitch: forceDifferentiate ? (isMaleB ? 1.46 : Math.max(1.12, hostBPitch)) : hostBPitch, rate: forceDifferentiate ? Math.max(0.96, hostBRate) : hostBRate, preferDefault: !!priorHostB?.preferDefault },
      // Viewer: pill-input voice · deliberately distinct pitch/rate from both hosts
      viewer: { voice: viewerVoice, pitch: 0.78, rate: 1.05, preferDefault: false },
      // Track which film these profiles were built for (used by cache-bust logic above)
      _hostBMovie: currentMovie
    };
    return podcastVoiceProfiles;

  }

  function simplifyPodcastQuestion(text = '', fallback = 'What stays with you?') {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;

    const thenMatch = normalized.match(/\bthen\s+([^?]+)\?/i);
    if (thenMatch?.[1]) {
      const cleaned = thenMatch[1].trim().replace(/^[a-z]/, (char) => char.toUpperCase());
      return `${cleaned}?`;
    }

    // Only treat spaced dash punctuation as a break; keep hyphenated words like image-world intact.
    const afterDash = normalized.split(/\s+[··-]\s*/).pop()?.trim() || normalized;
    const firstQuestion = afterDash.split('?').map((part) => part.trim()).filter(Boolean)[0] || afterDash;
    const cleaned = firstQuestion.replace(/^if\s+/i, '').trim().replace(/^[a-z]/, (char) => char.toUpperCase());
    return cleaned.endsWith('?') ? cleaned : `${cleaned}?`;
  }

  function formatMovieTitleForPodcast(movie = '') {
    return String(movie || '')
      .replace(/\.mp4$/i, '')
      .replace(/_/g, ' ')
      .trim() || 'the current film';
  }

  function formatDashboardDateLabel(value = 0, options = {}) {
    const numeric = Number(value || 0);
    if (!numeric) return options?.fallback || 'Not yet';
    return new Date(numeric).toLocaleString(undefined, {
      year: options?.withYear === false ? undefined : 'numeric',
      month: 'short',
      day: 'numeric',
      hour: options?.includeTime === false ? undefined : '2-digit',
      minute: options?.includeTime === false ? undefined : '2-digit'
    });
  }

  function normalizeDashboardCountMap(raw = {}) {
    return Object.entries(raw && typeof raw === 'object' ? raw : {})
      .reduce((acc, [key, value]) => {
        const normalizedKey = String(key || '').trim();
        const numericValue = Math.max(0, Number(value || 0));
        if (normalizedKey && numericValue) acc[normalizedKey] = numericValue;
        return acc;
      }, Object.create(null));
  }

  function createEmptyDashboardTimelineEntry(bucketAt = Date.now()) {
    const bucketDate = new Date(Number(bucketAt || Date.now()));
    bucketDate.setMinutes(0, 0, 0);
    const at = bucketDate.getTime();
    return {
      at,
      key: new Date(at).toISOString().slice(0, 13),
      label: new Date(at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit'
      }),
      podcastTurns: 0,
      freeChatTurns: 0,
      stageTurns: 0,
      successfulBatches: 0,
      failedBatches: 0,
      dictSaved: 0,
      brainChecks: 0,
      brainScoreTotal: 0
    };
  }

  function normalizeDashboardTimelineEntry(raw = {}) {
    const base = createEmptyDashboardTimelineEntry(raw?.at || Date.now());
    return {
      ...base,
      at: Number(raw?.at || base.at) || base.at,
      key: String(raw?.key || base.key).trim() || base.key,
      label: String(raw?.label || base.label).trim() || base.label,
      podcastTurns: Math.max(0, Number(raw?.podcastTurns || 0)),
      freeChatTurns: Math.max(0, Number(raw?.freeChatTurns || 0)),
      stageTurns: Math.max(0, Number(raw?.stageTurns || 0)),
      successfulBatches: Math.max(0, Number(raw?.successfulBatches || 0)),
      failedBatches: Math.max(0, Number(raw?.failedBatches || 0)),
      dictSaved: Math.max(0, Number(raw?.dictSaved || 0)),
      brainChecks: Math.max(0, Number(raw?.brainChecks || 0)),
      brainScoreTotal: Math.max(0, Number(raw?.brainScoreTotal || 0))
    };
  }

  function createEmptyDashboardSessionStats() {
    return {
      version: DASHBOARD_ANALYTICS_VERSION,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      firstFreeChatAt: 0,
      firstPodcastAt: 0,
      firstStageAt: 0,
      firstTrainingAt: 0,
      models: Object.create(null),
      events: [],
      timeline: [],
      movies: Object.create(null)
    };
  }

  function createEmptyDashboardTrainingRuntime() {
    return {
      active: false,
      status: 'Standby',
      provider: '',
      startedAt: 0,
      updatedAt: 0,
      endedAt: 0,
      lastSignalAt: 0,
      heartbeatAt: 0,
      lastBatchAt: 0,
      batchStarts: 0,
      heartbeats: 0,
      memorySaves: 0,
      lastReadyState: 'idle',
      preflightState: 'idle',
      preflightReason: '',
      quotaBlocked: false,
      serverProxy: false,
      localReady: false,
      modelFallbackActive: false,
      fallbackEngine: '',
      fallbackModel: '',
      lastError: {
        code: '',
        message: '',
        at: 0
      },
      latencySamples: [],
      lastLatencyMs: 0
    };
  }

  function normalizeDashboardTrainingRuntime(raw = {}) {
    const base = createEmptyDashboardTrainingRuntime();
    const samples = Array.isArray(raw?.latencySamples)
      ? raw.latencySamples
        .map((value) => Math.max(0, Number(value || 0)))
        .filter((value) => Number.isFinite(value) && value > 0)
        .slice(-40)
      : [];
    return {
      ...base,
      ...raw,
      active: raw?.active === true,
      status: String(raw?.status || base.status).trim() || base.status,
      provider: String(raw?.provider || '').trim(),
      startedAt: Math.max(0, Number(raw?.startedAt || 0)),
      updatedAt: Math.max(0, Number(raw?.updatedAt || 0)),
      endedAt: Math.max(0, Number(raw?.endedAt || 0)),
      lastSignalAt: Math.max(0, Number(raw?.lastSignalAt || 0)),
      heartbeatAt: Math.max(0, Number(raw?.heartbeatAt || 0)),
      lastBatchAt: Math.max(0, Number(raw?.lastBatchAt || 0)),
      batchStarts: Math.max(0, Number(raw?.batchStarts || 0)),
      heartbeats: Math.max(0, Number(raw?.heartbeats || 0)),
      memorySaves: Math.max(0, Number(raw?.memorySaves || 0)),
      lastReadyState: String(raw?.lastReadyState || base.lastReadyState).trim() || base.lastReadyState,
      preflightState: String(raw?.preflightState || base.preflightState).trim() || base.preflightState,
      preflightReason: String(raw?.preflightReason || '').trim(),
      quotaBlocked: raw?.quotaBlocked === true,
      serverProxy: raw?.serverProxy === true,
      localReady: raw?.localReady === true,
      modelFallbackActive: raw?.modelFallbackActive === true,
      fallbackEngine: String(raw?.fallbackEngine || '').trim(),
      fallbackModel: String(raw?.fallbackModel || '').trim(),
      lastError: {
        code: String(raw?.lastError?.code || '').trim(),
        message: String(raw?.lastError?.message || '').trim(),
        at: Math.max(0, Number(raw?.lastError?.at || 0))
      },
      latencySamples: samples,
      lastLatencyMs: Math.max(0, Number(raw?.lastLatencyMs || 0))
    };
  }

  function buildDashboardTrainingErrorCode(reason = '', detail = '') {
    const text = `${String(reason || '')} ${String(detail || '')}`.toLowerCase();
    if (!text.trim()) return '';
    if (text.includes('auth_error_0x442')) return 'auth_error_0x442';
    if (text.includes('quota') || text.includes('429')) return 'QuotaExceeded';
    if (text.includes('403') || text.includes('permission') || text.includes('api key rejected') || text.includes('auth')) return 'auth_error_0x442';
    if (text.includes('504') || text.includes('timeout') || text.includes('timed out')) return '504_timeout';
    if (text.includes('offline')) return 'offline';
    if (text.includes('dict') && (text.includes('lock') || text.includes('quiet') || text.includes('drained'))) return 'dictionary_lock';
    return 'training_error';
  }

  function summarizeDashboardLatencySamples(samples = []) {
    const numeric = (Array.isArray(samples) ? samples : [])
      .map((value) => Math.max(0, Number(value || 0)))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);
    if (!numeric.length) {
      return { averageMs: 0, p99Ms: 0, samples: 0 };
    }
    const total = numeric.reduce((sum, value) => sum + value, 0);
    const p99Index = Math.min(numeric.length - 1, Math.max(0, Math.ceil(numeric.length * 0.99) - 1));
    return {
      averageMs: Math.round(total / numeric.length),
      p99Ms: Math.round(numeric[p99Index] || 0),
      samples: numeric.length
    };
  }

  function formatDashboardHeartbeatLabel(at = 0) {
    const safeAt = Math.max(0, Number(at || 0));
    if (!safeAt) return 'No heartbeat yet';
    const diffMs = Math.max(0, Date.now() - safeAt);
    const diffSeconds = Math.round(diffMs / 1000);
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    return `${diffMinutes}m ago`;
  }

  function formatDashboardRelativeTimeLabel(at = 0, fallback = 'Not yet') {
    const safeAt = Math.max(0, Number(at || 0));
    if (!safeAt) return fallback;
    const diffMs = Math.max(0, Date.now() - safeAt);
    const diffSeconds = Math.round(diffMs / 1000);
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    return `${diffHours}h ago`;
  }

  function resetDashboardTrainingRuntime(patch = {}) {
    dashboardTrainingBatchStarts = Object.create(null);
    dashboardTrainingRuntime = normalizeDashboardTrainingRuntime({
      ...createEmptyDashboardTrainingRuntime(),
      active: patch.active !== false,
      startedAt: Math.max(0, Number(patch.startedAt || Date.now())),
      updatedAt: Date.now(),
      ...patch
    });
    refreshTrainingDashboardStats();
  }

  function updateDashboardTrainingRuntime(patch = {}) {
    const current = normalizeDashboardTrainingRuntime(dashboardTrainingRuntime || {});
    dashboardTrainingRuntime = normalizeDashboardTrainingRuntime({
      ...current,
      ...patch,
      updatedAt: Date.now(),
      lastError: patch.lastError
        ? {
            ...current.lastError,
            ...patch.lastError,
            code: String(patch.lastError?.code || current.lastError.code || '').trim(),
            message: String(patch.lastError?.message || current.lastError.message || '').trim(),
            at: Math.max(0, Number(patch.lastError?.at || current.lastError.at || 0))
          }
        : current.lastError,
      latencySamples: Array.isArray(patch.latencySamples) ? patch.latencySamples : current.latencySamples
    });
    refreshTrainingDashboardStats();
  }

  function recordDashboardTrainingSignal(patch = {}) {
    updateDashboardTrainingRuntime({
      lastSignalAt: Date.now(),
      ...patch
    });
  }

  function recordDashboardTrainingHeartbeat(progress = {}) {
    recordDashboardTrainingSignal({
      status: `Heartbeat batch ${Math.max(0, Number(progress?.batchNumber || 0)) || 'active'}`,
      heartbeatAt: Date.now(),
      heartbeats: Math.max(0, Number(dashboardTrainingRuntime?.heartbeats || 0)) + 1,
      lastReadyState: 'heartbeat'
    });
  }

  function recordDashboardTrainingBatchStart(progress = {}, patch = {}) {
    const batchNumber = Math.max(0, Number(progress?.batchNumber || 0));
    if (batchNumber) {
      dashboardTrainingBatchStarts[batchNumber] = Date.now();
    }
    recordDashboardTrainingSignal({
      status: batchNumber ? `Batch ${batchNumber} started` : 'Batch started',
      provider: String(patch.provider || '').trim() || String(dashboardTrainingRuntime?.provider || '').trim(),
      lastBatchAt: Date.now(),
      batchStarts: Math.max(0, Number(dashboardTrainingRuntime?.batchStarts || 0)) + 1,
      lastReadyState: 'batch-started',
      modelFallbackActive: patch.modelFallbackActive === true ? true : dashboardTrainingRuntime?.modelFallbackActive === true,
      fallbackEngine: String(patch.fallbackEngine || dashboardTrainingRuntime?.fallbackEngine || '').trim(),
      fallbackModel: String(patch.fallbackModel || dashboardTrainingRuntime?.fallbackModel || '').trim()
    });
  }

  function recordDashboardTrainingMemorySaved() {
    recordDashboardTrainingSignal({
      memorySaves: Math.max(0, Number(dashboardTrainingRuntime?.memorySaves || 0)) + 1,
      lastReadyState: 'memory-saved'
    });
  }

  function recordDashboardTrainingBatchFinish(progress = {}, outcome = 'success') {
    const batchNumber = Math.max(0, Number(progress?.batchNumber || 0));
    const now = Date.now();
    const samples = Array.isArray(dashboardTrainingRuntime?.latencySamples)
      ? dashboardTrainingRuntime.latencySamples.slice(-39)
      : [];
    let latencyMs = Math.max(0, Number(dashboardTrainingRuntime?.lastLatencyMs || 0));
    if (batchNumber && dashboardTrainingBatchStarts[batchNumber]) {
      latencyMs = Math.max(0, now - Number(dashboardTrainingBatchStarts[batchNumber] || now));
      delete dashboardTrainingBatchStarts[batchNumber];
      // Skip instant-fail samples (<8s on a failed batch) · they are quota/auth rejections,
      // not real inference latency, and would skew the avg/p99 to unrealistically low values.
      if (latencyMs > 0 && (outcome === 'success' || latencyMs >= 8000)) samples.push(latencyMs);
    }
    recordDashboardTrainingSignal({
      status: batchNumber
        ? (outcome === 'success' ? `Batch ${batchNumber} stored` : `Batch ${batchNumber} failed`)
        : (outcome === 'success' ? 'Batch stored' : 'Batch failed'),
      lastBatchAt: now,
      lastLatencyMs: latencyMs,
      latencySamples: samples,
      lastReadyState: outcome === 'success' ? 'batch-complete' : 'batch-failed'
    });
  }

  function recordDashboardTrainingError(message = '', patch = {}) {
    const normalizedMessage = String(message || patch?.reason || 'Unknown training error').trim();
    recordDashboardTrainingSignal({
      status: String(patch?.status || 'Attention').trim() || 'Attention',
      lastReadyState: String(patch?.lastReadyState || 'error').trim() || 'error',
      modelFallbackActive: patch?.modelFallbackActive === true ? true : dashboardTrainingRuntime?.modelFallbackActive === true,
      fallbackEngine: String(patch?.fallbackEngine || dashboardTrainingRuntime?.fallbackEngine || '').trim(),
      fallbackModel: String(patch?.fallbackModel || dashboardTrainingRuntime?.fallbackModel || '').trim(),
      lastError: {
        code: buildDashboardTrainingErrorCode(patch?.reason || patch?.status || '', normalizedMessage),
        message: normalizedMessage,
        at: Date.now()
      }
    });
  }

  function getDashboardTrainingRuntimeSnapshot() {
    const runtime = normalizeDashboardTrainingRuntime(dashboardTrainingRuntime || {});
    const latency = summarizeDashboardLatencySamples(runtime.latencySamples);
    const heartbeatLabel = runtime.heartbeatAt
      ? formatDashboardHeartbeatLabel(runtime.heartbeatAt)
      : runtime.lastSignalAt
        ? `No long-batch heartbeat · signal ${formatDashboardRelativeTimeLabel(runtime.lastSignalAt, 'just now')}`
        : runtime.active
          ? 'Waiting for first training signal'
          : runtime.endedAt
            ? `Idle · last run ${formatDashboardRelativeTimeLabel(runtime.endedAt, 'ended')}`
            : 'No training run yet';
    return {
      ...runtime,
      latency,
      heartbeatAgeMs: runtime.heartbeatAt ? Math.max(0, Date.now() - runtime.heartbeatAt) : 0,
      heartbeatLabel,
      lastErrorLabel: runtime.lastError.code
        ? `${runtime.lastError.code}${runtime.lastError.message ? ` · ${runtime.lastError.message}` : ''}`
        : 'None'
    };
  }

  function buildScopedAnalyticsTrainingRuntime(movies = [], runtime = null) {
    const normalizedRuntime = normalizeDashboardTrainingRuntime(runtime || getDashboardTrainingRuntimeSnapshot());
    const currentMovie = Array.isArray(movies) ? movies.find((movie) => movie?.isCurrent) || null : null;
    const hasReportTraining = Array.isArray(movies)
      && movies.some((movie) => Number(movie?.startedBatches || 0) > 0 || Number(movie?.successfulBatches || 0) > 0 || Number(movie?.failedBatches || 0) > 0 || Number(movie?.dictSaved || 0) > 0);
    const currentMovieHasTraining = currentMovie
      && (Number(currentMovie.startedBatches || 0) > 0
        || Number(currentMovie.successfulBatches || 0) > 0
        || Number(currentMovie.failedBatches || 0) > 0
        || Number(currentMovie.dictSaved || 0) > 0);

    if (!hasReportTraining || (currentMovie && !currentMovieHasTraining)) {
      return normalizeDashboardTrainingRuntime({
        ...createEmptyDashboardTrainingRuntime(),
        status: currentMovie && !currentMovieHasTraining
          ? `No training yet for ${currentMovie.title || 'current movie'}`
          : 'No training in this report window',
        lastReadyState: 'idle',
        provider: 'idle',
        preflightState: currentMovie && !currentMovieHasTraining ? 'not-started' : 'idle',
        preflightReason: currentMovie && !currentMovieHasTraining
          ? 'Current movie has not run training in this report window'
          : 'No training activity in this report window',
        heartbeatLabel: 'No heartbeat yet',
        lastError: { code: '', message: '', at: 0 },
        modelFallbackActive: false,
        fallbackEngine: '',
        fallbackModel: '',
        latencySamples: [],
        lastLatencyMs: 0,
        latency: { averageMs: 0, p99Ms: 0, samples: 0 },
        lastErrorLabel: 'None'
      });
    }

    return normalizedRuntime;
  }

  function createEmptyDashboardMovieStats(movie = '') {
    return {
      movie: String(movie || '').trim(),
      firstSeenAt: Date.now(),
      lastUpdatedAt: Date.now(),
      firstFreeChatAt: 0,
      firstPodcastAt: 0,
      firstStageAt: 0,
      firstTrainingAt: 0,
      podcastTurns: 0,
      highestPodcastTurn: 0,
      freeChatTurns: 0,
      freeChatSeeds: 0,
      stageTurns: 0,
      stagedTrainingItems: 0,
      startedBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      dictSaved: 0,
      dictAdded: 0,
      dictUpdated: 0,
      brainChecks: 0,
      brainScoreTotal: 0,
      lastBrainLevel: '',
      lastBrainScore: 0,
      brainSourceMix: Object.create(null),
      modelUsage: Object.create(null)
    };
  }

  function normalizeDashboardMovieStats(movie = '', raw = {}) {
    const base = createEmptyDashboardMovieStats(movie);
    return {
      ...base,
      movie: String(movie || raw?.movie || '').trim(),
      firstSeenAt: Number(raw?.firstSeenAt || base.firstSeenAt) || base.firstSeenAt,
      lastUpdatedAt: Math.max(Number(raw?.lastUpdatedAt || 0), Number(raw?.firstSeenAt || 0), Date.now()),
      firstFreeChatAt: Math.max(0, Number(raw?.firstFreeChatAt || 0)),
      firstPodcastAt: Math.max(0, Number(raw?.firstPodcastAt || 0)),
      firstStageAt: Math.max(0, Number(raw?.firstStageAt || 0)),
      firstTrainingAt: Math.max(0, Number(raw?.firstTrainingAt || 0)),
      podcastTurns: Math.max(0, Number(raw?.podcastTurns || 0)),
      highestPodcastTurn: Math.max(0, Number(raw?.highestPodcastTurn || 0)),
      freeChatTurns: Math.max(0, Number(raw?.freeChatTurns || 0)),
      freeChatSeeds: Math.max(0, Number(raw?.freeChatSeeds || 0)),
      stageTurns: Math.max(0, Number(raw?.stageTurns || 0)),
      stagedTrainingItems: Math.max(0, Number(raw?.stagedTrainingItems || 0)),
      startedBatches: Math.max(0, Number(raw?.startedBatches || 0)),
      successfulBatches: Math.max(0, Number(raw?.successfulBatches || 0)),
      failedBatches: Math.max(0, Number(raw?.failedBatches || 0)),
      dictSaved: Math.max(0, Number(raw?.dictSaved || 0)),
      dictAdded: Math.max(0, Number(raw?.dictAdded || 0)),
      dictUpdated: Math.max(0, Number(raw?.dictUpdated || 0)),
      brainChecks: Math.max(0, Number(raw?.brainChecks || 0)),
      brainScoreTotal: Math.max(0, Number(raw?.brainScoreTotal || 0)),
      lastBrainLevel: String(raw?.lastBrainLevel || '').trim(),
      lastBrainScore: Math.max(0, Number(raw?.lastBrainScore || 0)),
      brainSourceMix: normalizeDashboardCountMap(raw?.brainSourceMix),
      modelUsage: normalizeDashboardCountMap(raw?.modelUsage)
    };
  }

  function loadDashboardSessionStats() {
    const fallback = createEmptyDashboardSessionStats();
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(DASHBOARD_ANALYTICS_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const movies = Object.entries(parsed?.movies && typeof parsed.movies === 'object' ? parsed.movies : {})
        .reduce((acc, [movieKey, value]) => {
          const normalizedKey = String(movieKey || '').trim();
          if (!normalizedKey) return acc;
          acc[normalizedKey] = normalizeDashboardMovieStats(normalizedKey, value || {});
          return acc;
        }, Object.create(null));
      return {
        ...fallback,
        version: DASHBOARD_ANALYTICS_VERSION,
        startedAt: Number(parsed?.startedAt || fallback.startedAt) || fallback.startedAt,
        updatedAt: Math.max(Number(parsed?.updatedAt || 0), Number(parsed?.startedAt || 0), fallback.updatedAt),
        firstFreeChatAt: Math.max(0, Number(parsed?.firstFreeChatAt || 0)),
        firstPodcastAt: Math.max(0, Number(parsed?.firstPodcastAt || 0)),
        firstStageAt: Math.max(0, Number(parsed?.firstStageAt || 0)),
        firstTrainingAt: Math.max(0, Number(parsed?.firstTrainingAt || 0)),
        models: normalizeDashboardCountMap(parsed?.models),
        events: normalizeDashboardEvents(parsed?.events),
        timeline: Array.isArray(parsed?.timeline)
          ? parsed.timeline.map((entry) => normalizeDashboardTimelineEntry(entry)).slice(-DASHBOARD_TIMELINE_LIMIT)
          : [],
        movies
      };
    } catch {
      return fallback;
    }
  }

  function scheduleDashboardSessionStatsPersist() {
    dashboardSessionStats.updatedAt = Date.now();
    if (dashboardPersistTimer) clearTimeout(dashboardPersistTimer);
    dashboardPersistTimer = setTimeout(() => {
      dashboardPersistTimer = 0;
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(DASHBOARD_ANALYTICS_STORAGE_KEY, JSON.stringify(dashboardSessionStats));
      } catch {
        // Ignore storage quota/privacy errors.
      }
    }, 120);
  }

  function recordDashboardFirstSeen(stats = null, field = '') {
    const now = Date.now();
    if (field && !dashboardSessionStats[field]) dashboardSessionStats[field] = now;
    if (stats && field && !stats[field]) stats[field] = now;
    if (stats) {
      if (!stats.firstSeenAt) stats.firstSeenAt = now;
      stats.lastUpdatedAt = now;
    }
    scheduleDashboardSessionStatsPersist();
  }

  function getDashboardTimelineBucket(at = Date.now()) {
    const bucket = createEmptyDashboardTimelineEntry(at);
    const existing = dashboardSessionStats.timeline.find((entry) => entry.key === bucket.key);
    if (existing) return existing;
    dashboardSessionStats.timeline.push(bucket);
    dashboardSessionStats.timeline = dashboardSessionStats.timeline
      .map((entry) => normalizeDashboardTimelineEntry(entry))
      .sort((left, right) => left.at - right.at)
      .slice(-DASHBOARD_TIMELINE_LIMIT);
    return dashboardSessionStats.timeline[dashboardSessionStats.timeline.length - 1] || bucket;
  }

  function recordDashboardTimeline(delta = {}, at = Date.now()) {
    const bucket = getDashboardTimelineBucket(at);
    bucket.podcastTurns += Math.max(0, Number(delta?.podcastTurns || 0));
    bucket.freeChatTurns += Math.max(0, Number(delta?.freeChatTurns || 0));
    bucket.stageTurns += Math.max(0, Number(delta?.stageTurns || 0));
    bucket.successfulBatches += Math.max(0, Number(delta?.successfulBatches || 0));
    bucket.failedBatches += Math.max(0, Number(delta?.failedBatches || 0));
    bucket.dictSaved += Math.max(0, Number(delta?.dictSaved || 0));
    bucket.brainChecks += Math.max(0, Number(delta?.brainChecks || 0));
    bucket.brainScoreTotal += Math.max(0, Number(delta?.brainScoreTotal || 0));
    scheduleDashboardSessionStatsPersist();
  }

  function summarizeDashboardCountMap(countMap = {}, limit = 2) {
    const topEntries = Object.entries(countMap || {})
      .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
      .slice(0, Math.max(1, Number(limit || 1)));
    return topEntries.length
      ? topEntries.map(([label, count]) => `${label} ${count}`).join(' / ')
      : 'No activity yet';
  }

  function decodeDashboardText(value = '') {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  function createDashboardEvent(raw = {}) {
    return {
      at: Math.max(0, Number(raw?.at || Date.now())),
      type: String(raw?.type || '').trim(),
      movie: String(raw?.movie || '').trim(),
      count: Math.max(0, Number(raw?.count || 0)) || 1,
      label: String(raw?.label || '').trim(),
      model: String(raw?.model || '').trim(),
      score: Math.max(0, Number(raw?.score || 0)),
      source: String(raw?.source || '').trim(),
      action: String(raw?.action || '').trim()
    };
  }

  function normalizeDashboardEvents(events = []) {
    return (Array.isArray(events) ? events : [])
      .map((entry) => createDashboardEvent(entry))
      .filter((entry) => entry.type)
      .sort((left, right) => left.at - right.at)
      .slice(-DASHBOARD_EVENTS_LIMIT);
  }

  function recordDashboardEvent(event = {}) {
    const normalized = createDashboardEvent(event);
    if (!normalized.type) return;
    dashboardSessionStats.events.push(normalized);
    dashboardSessionStats.events = normalizeDashboardEvents(dashboardSessionStats.events);
    scheduleDashboardSessionStatsPersist();
  }

  function inferDashboardModelName(entry = {}) {
    const directModel = String(entry?.model || entry?.trainingModel || entry?.sourceModel || '').trim();
    if (directModel) return directModel;
    const sourceLabel = String(entry?.sourceLabel || '').trim().toLowerCase();
    if (!sourceLabel) return '';
    if (sourceLabel.includes('mini')) return 'phi4-mini';
    if (sourceLabel.includes('bonsai')) return 'digitsflow/bonsai-8b';
    if (sourceLabel.includes('gemma 4') || sourceLabel.includes('gemma4')) return 'gemma4:e2b';
    if (sourceLabel.includes('gemma 3') || sourceLabel.includes('gemma3')) return 'gemma3:4b';
    return '';
  }

  function getDashboardConnectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    return connection && typeof connection === 'object' ? connection : null;
  }

  function getDashboardTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  }

  function buildDashboardSessionSource() {
    const trainingRuntime = getDashboardTrainingRuntimeSnapshot();
    const connection = getDashboardConnectionInfo();
    const timezone = getDashboardTimezone();
    const languageList = Array.from(new Set([
      String(navigator.language || '').trim(),
      ...(Array.isArray(navigator.languages) ? navigator.languages : []).map((value) => String(value || '').trim())
    ].filter(Boolean)));
    const locationParts = [
      dashboardSessionSourceServer.city,
      dashboardSessionSourceServer.region,
      dashboardSessionSourceServer.country
    ].map((value) => decodeDashboardText(value)).filter(Boolean);
    const locationLabel = locationParts.join(', ')
      || String(dashboardSessionSourceServer.countryCode || '').trim()
      || (dashboardSessionSourceServer.status === 'error'
        ? 'Lookup unavailable'
        : dashboardSessionSourceServer.status === 'ready'
          ? 'Unknown location'
          : 'Resolving...');
    const viewport = `${Math.max(0, Math.round(window.innerWidth || 0))} x ${Math.max(0, Math.round(window.innerHeight || 0))}`;
    const screenSize = window.screen
      ? `${Math.max(0, Math.round(window.screen.width || 0))} x ${Math.max(0, Math.round(window.screen.height || 0))}`
      : '';
    return {
      status: dashboardSessionSourceServer.status,
      fetchedAt: Number(dashboardSessionSourceServer.fetchedAt || 0),
      ipAddress: String(dashboardSessionSourceServer.ipAddress || '').trim() || 'Unavailable',
      locationLabel,
      city: decodeDashboardText(dashboardSessionSourceServer.city),
      region: decodeDashboardText(dashboardSessionSourceServer.region),
      country: decodeDashboardText(dashboardSessionSourceServer.country),
      countryCode: String(dashboardSessionSourceServer.countryCode || '').trim(),
      timezone: String(timezone || dashboardSessionSourceServer.timezone || '').trim(),
      latitude: String(dashboardSessionSourceServer.latitude || '').trim(),
      longitude: String(dashboardSessionSourceServer.longitude || '').trim(),
      deviceType: isMobile ? 'Mobile' : 'Desktop',
      formFactor: isMobile ? 'mobile' : 'desktop',
      online: navigator.onLine === false ? 'Offline' : 'Online',
      networkType: String(connection?.effectiveType || connection?.type || '').trim(),
      downlinkMbps: Number(connection?.downlink || 0),
      saveData: connection?.saveData === true,
      touchPoints: Math.max(0, Number(navigator.maxTouchPoints || 0)),
      hardwareConcurrency: Math.max(0, Number(navigator.hardwareConcurrency || 0)),
      deviceMemoryGB: Math.max(0, Number(navigator.deviceMemory || 0)),
      browserLanguage: languageList[0] || '',
      languages: languageList.join(', '),
      viewport,
      screen: screenSize,
      platform: String(navigator.userAgentData?.platform || navigator.platform || '').trim(),
      userAgent: String(navigator.userAgent || dashboardSessionSourceServer.userAgent || '').trim(),
      sessionUrl: String(window.location.href || '').trim(),
      referrer: String(document.referrer || '').trim(),
      host: String(window.location.host || '').trim(),
      provider: String(dashboardSessionSourceServer.provider || '').trim(),
      lookupError: String(dashboardSessionSourceServer.error || '').trim(),
      trainingHeartbeatLabel: trainingRuntime.heartbeatLabel,
      trainingProvider: trainingRuntime.provider || 'idle',
      trainingStatus: trainingRuntime.status,
      trainingFallback: trainingRuntime.modelFallbackActive
        ? `${trainingRuntime.fallbackEngine || 'fallback'}${trainingRuntime.fallbackModel ? ` · ${trainingRuntime.fallbackModel}` : ''}`
        : 'Primary path',
      trainingLastError: trainingRuntime.lastErrorLabel
    };
  }

  async function fetchDashboardSessionSource() {
    try {
      const response = await fetch('/api/session-source', {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Session source lookup failed with ${response.status}`);
      }
      const payload = await response.json().catch(() => ({}));
      dashboardSessionSourceServer = {
        status: 'ready',
        fetchedAt: Date.now(),
        ipAddress: String(payload?.ipAddress || '').trim(),
        city: String(payload?.city || '').trim(),
        region: String(payload?.region || '').trim(),
        country: String(payload?.country || '').trim(),
        countryCode: String(payload?.countryCode || '').trim(),
        timezone: String(payload?.timezone || '').trim(),
        latitude: String(payload?.latitude || '').trim(),
        longitude: String(payload?.longitude || '').trim(),
        userAgent: String(payload?.userAgent || '').trim(),
        provider: String(payload?.provider || '').trim(),
        error: ''
      };
    } catch (error) {
      dashboardSessionSourceServer = {
        ...dashboardSessionSourceServer,
        status: 'error',
        fetchedAt: Date.now(),
        error: String(error?.message || error || 'Session source lookup failed')
      };
    }
    refreshTrainingDashboardStats();
  }

  function resolveDashboardModelLabel(entry = {}) {
    const engine = String(entry?.engine || '').trim().toLowerCase();
    const explicitModel = inferDashboardModelName(entry);
    if (!engine || engine === 'chat' || engine === 'tts' || engine === 'podcast-control' || engine === 'train-summary') {
      return '';
    }
    if (engine === 'cloud') return entry?.training ? 'Gemini Cloud' : 'Gemini Cloud';
    if (engine === 'cloud-train') return 'Gemini Cloud';
    if (engine === 'cloud-quota') return 'Cloud Quota';
    if (engine === 'live') return 'Gemini Live';
    if (engine === 'dict') return 'DICT';
    if (engine === 'ollama' || engine === 'ollama-ready' || engine === 'ollama-forced') {
      return getLocalModelFullSpec(explicitModel || voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest');
    }
    if (engine === 'brain-reply') {
      // Collapse into parent model label · "Gemma3:4b Brain Reply" -> "Gemma3:4b"
      return (_activeTrainingEngine === 'ollama' || explicitModel)
        ? getLocalModelFullSpec(explicitModel || voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest')
        : 'Brain Reply';
    }
    if (engine === 'brain-check') return 'Brain Check';
    if (engine === 'guest-utility') return 'Guest Utility';
    return '';
  }

  function recordDashboardModelUsage(entry = {}) {
    const label = resolveDashboardModelLabel(entry);
    if (!label) return;
    dashboardSessionStats.models[label] = Number(dashboardSessionStats.models[label] || 0) + 1;
    const stats = ensureDashboardMovieStats(String(entry?.movie || voiceManager?.currentMovie || '').trim());
    if (stats) {
      stats.modelUsage[label] = Number(stats.modelUsage[label] || 0) + 1;
      stats.lastUpdatedAt = Date.now();
    }
    recordDashboardEvent({
      type: 'model-usage',
      at: Number(entry?.at || Date.now()),
      movie: String(entry?.movie || voiceManager?.currentMovie || '').trim(),
      label,
      model: inferDashboardModelName(entry) || label,
      count: 1
    });
    scheduleDashboardSessionStatsPersist();
    refreshTrainingDashboardStats();
  }

  function getDashboardMovieKey(movie = '') {
    return String(movie || voiceManager?.currentMovie || '').trim();
  }

  function readDashboardMovieStats(movie = '') {
    const key = getDashboardMovieKey(movie);
    return key ? dashboardSessionStats.movies[key] || null : null;
  }

  function ensureDashboardMovieStats(movie = '') {
    const key = getDashboardMovieKey(movie);
    if (!key) return null;
    if (!dashboardSessionStats.movies[key]) {
      dashboardSessionStats.movies[key] = createEmptyDashboardMovieStats(key);
      scheduleDashboardSessionStatsPersist();
    }
    return dashboardSessionStats.movies[key];
  }

  function refreshTrainingDashboardStats() {
    trainingDashboard.refreshStats?.();
  }

  function recordPodcastTurn(movie = '', turnNumber = 0) {
    const stats = ensureDashboardMovieStats(movie);
    if (!stats) return 0;
    const nextTurn = Math.max(0, Number(turnNumber || 0));
    if (nextTurn <= stats.highestPodcastTurn) return stats.podcastTurns;
    const delta = nextTurn - stats.highestPodcastTurn;
    recordDashboardFirstSeen(stats, 'firstPodcastAt');
    stats.podcastTurns += delta;
    stats.highestPodcastTurn = nextTurn;
    recordDashboardEvent({ type: 'podcast-turn', at: Date.now(), movie: getDashboardMovieKey(movie), count: delta });
    recordDashboardTimeline({ podcastTurns: delta });
    refreshTrainingDashboardStats();
    return stats.podcastTurns;
  }

  function recordFreeChatTurn(movie = '') {
    const stats = ensureDashboardMovieStats(movie);
    if (!stats) return 0;
    recordDashboardFirstSeen(stats, 'firstFreeChatAt');
    stats.freeChatTurns += 1;
    recordDashboardEvent({ type: 'free-chat-turn', at: Date.now(), movie: getDashboardMovieKey(movie), count: 1 });
    recordDashboardTimeline({ freeChatTurns: 1 });
    refreshTrainingDashboardStats();
    return stats.freeChatTurns;
  }

  function recordFreeChatSeed(movie = '') {
    const stats = ensureDashboardMovieStats(movie);
    if (!stats) return 0;
    recordDashboardFirstSeen(stats, 'firstFreeChatAt');
    stats.freeChatSeeds += 1;
    recordDashboardEvent({ type: 'free-chat-seed', at: Date.now(), movie: getDashboardMovieKey(movie), count: 1 });
    refreshTrainingDashboardStats();
    return stats.freeChatSeeds;
  }

  function recordPodcastGuestInterjection(movie = '') {
    const stats = ensureDashboardMovieStats(movie);
    if (stats) {
      recordDashboardFirstSeen(stats, 'firstStageAt');
      stats.stageTurns += 1;
      recordDashboardEvent({ type: 'stage-turn', at: Date.now(), movie: getDashboardMovieKey(movie), count: 1 });
      recordDashboardTimeline({ stageTurns: 1 });
      refreshTrainingDashboardStats();
    }
    return Math.max(0, Number(podcastGuestInterjectionCount || 0)) + 1;
  }

  function recordTrainingBatchOutcome(progress = {}, outcome = 'success') {
    const stats = ensureDashboardMovieStats(progress?.movie || voiceManager?.currentMovie || '');
    if (!stats) return;
    recordDashboardFirstSeen(stats, 'firstTrainingAt');
    if (outcome === 'failed') stats.failedBatches += 1;
    else stats.successfulBatches += 1;
    recordDashboardEvent({
      type: outcome === 'failed' ? 'training-failed' : 'training-success',
      at: Date.now(),
      movie: getDashboardMovieKey(progress?.movie || voiceManager?.currentMovie || ''),
      count: 1,
      model: String(progress?.model || '').trim()
    });
    recordDashboardTimeline(outcome === 'failed' ? { failedBatches: 1 } : { successfulBatches: 1 });
    // Record model usage so training batches appear in the models report
    const trainingEngine = String(progress?.trainingEngine || dashboardTrainingRuntime?.fallbackEngine || dashboardTrainingRuntime?.provider || '').trim();
    const trainingModel = String(progress?.model || dashboardTrainingRuntime?.fallbackModel || '').trim();
    const isLocalEngine = trainingEngine === 'ollama' || trainingEngine === 'template';
    const engineKey = isLocalEngine ? 'ollama' : trainingEngine === 'cloud' ? 'cloud' : '';
    if (engineKey) {
      recordDashboardModelUsage({
        engine: engineKey === 'cloud' ? 'cloud-train' : 'ollama',
        model: trainingModel,
        movie: getDashboardMovieKey(progress?.movie || voiceManager?.currentMovie || ''),
        training: true
      });
    }
    refreshTrainingDashboardStats();
  }

  function recordDashboardTrainingBatchStage(progress = {}) {
    const stats = ensureDashboardMovieStats(progress?.movie || voiceManager?.currentMovie || '');
    if (!stats) return;
    const stagedCount = Math.max(1, Number(progress?.batchSize || 0) || 1);
    recordDashboardFirstSeen(stats, 'firstTrainingAt');
    stats.stagedTrainingItems += stagedCount;
    stats.startedBatches += 1;
    recordDashboardEvent({
      type: 'training-batch-start',
      at: Date.now(),
      movie: getDashboardMovieKey(progress?.movie || voiceManager?.currentMovie || ''),
      count: stagedCount,
      model: String(progress?.model || '').trim(),
      source: String(progress?.trainingEngine || progress?.trainingMode || '').trim(),
      label: String(progress?.focus || '').trim()
    });
    refreshTrainingDashboardStats();
  }

  function recordBrainCheckSnapshot(details = {}) {
    const stats = ensureDashboardMovieStats(details?.movie || voiceManager?.currentMovie || '');
    if (!stats) return;
    const score = Math.max(0, Number(details?.score || 0));
    recordDashboardFirstSeen(stats, 'firstTrainingAt');
    stats.brainChecks += 1;
    stats.brainScoreTotal += score;
    stats.lastBrainLevel = String(details?.level || stats.lastBrainLevel || '').trim();
    stats.lastBrainScore = score;
    String(details?.source || '')
      .split(/\s*\+\s*/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((source) => {
        stats.brainSourceMix[source] = Number(stats.brainSourceMix[source] || 0) + 1;
      });
    recordDashboardEvent({
      type: 'brain-check',
      at: Date.now(),
      movie: getDashboardMovieKey(details?.movie || voiceManager?.currentMovie || ''),
      count: 1,
      score,
      source: String(details?.source || '').trim()
    });
    recordDashboardTimeline({ brainChecks: 1, brainScoreTotal: score });
    refreshTrainingDashboardStats();
  }

  function recordDictSavedSnapshot(progress = {}) {
    const stats = ensureDashboardMovieStats(progress?.movie || voiceManager?.currentMovie || '');
    if (!stats) return;
    recordDashboardFirstSeen(stats, 'firstTrainingAt');
    stats.dictSaved += 1;
    if (progress?.action === 'updated') stats.dictUpdated += 1;
    else stats.dictAdded += 1;
    recordDashboardEvent({
      type: 'dict-saved',
      at: Date.now(),
      movie: getDashboardMovieKey(progress?.movie || voiceManager?.currentMovie || ''),
      count: 1,
      action: String(progress?.action || '').trim()
    });
    recordDashboardTimeline({ dictSaved: 1 });
    refreshTrainingDashboardStats();
  }

  function summarizeDashboardBrainSourceMix(sourceMix = {}) {
    const topSources = Object.entries(sourceMix || {})
      .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
      .slice(0, 2)
      .map(([source, count]) => `${source} ${count}`);
    return topSources.length ? topSources.join(' / ') : 'No source mix yet';
  }

  function summarizeDashboardSourceMixFromModelUsage(modelUsage = {}) {
    const normalized = Object.entries(modelUsage || {}).reduce((summary, [label, rawCount]) => {
      const count = Math.max(0, Number(rawCount || 0));
      if (!count) return summary;
      const normalizedLabel = String(label || '').trim();
      if (!normalizedLabel) return summary;
      const bucket = /gemini\s+cloud|gemini\s+live/i.test(normalizedLabel)
        ? 'Cloud'
        : /dict/i.test(normalizedLabel)
          ? 'DICT'
          : /gemma|bonsai|phi4?|brain reply/i.test(normalizedLabel)
            ? 'Local'
            : '';
      if (!bucket) return summary;
      summary[bucket] = Number(summary[bucket] || 0) + count;
      return summary;
    }, {});
    const topSources = Object.entries(normalized)
      .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
      .slice(0, 2)
      .map(([source, count]) => `${source} ${count}`);
    return topSources.length ? topSources.join(' / ') : 'No source mix yet';
  }

  function buildDashboardBrainCoverage(movie = '') {
    const movieKey = getDashboardMovieKey(movie);
    const brain = movieKey === String(voiceManager?.currentMovie || '').trim()
      ? (voiceManager?.currentMovieBrain || resolveMovieBrain(movieKey))
      : resolveMovieBrain(movieKey);
    const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
    const trainingSeeds = (brain?.trainingSeeds && typeof brain.trainingSeeds === 'object') ? brain.trainingSeeds : {};
    const persona = (brain?.persona && typeof brain.persona === 'object') ? brain.persona : {};
    const personaArc = (persona?.arc && typeof persona.arc === 'object') ? persona.arc : {};
    const dictionaryKeys = Object.keys(dictionary).length;
    const trainingSeedGroups = Object.keys(trainingSeeds).length;
    const trainingSeedItems = Object.values(trainingSeeds).reduce((sum, value) => {
      if (!Array.isArray(value)) return sum;
      return sum + value.filter(Boolean).length;
    }, 0);
    return {
      dictionaryKeys,
      trainingSeedGroups,
      trainingSeedItems,
      personaSignals: (Array.isArray(persona?.obsessions) ? persona.obsessions.length : 0)
        + (Array.isArray(persona?.prohibitions) ? persona.prohibitions.length : 0)
        + Object.keys(personaArc).length
    };
  }

  function collectDashboardMovies() {
    const known = new Set(Object.keys(dashboardSessionStats.movies));
    playlistFiles.forEach((item) => {
      if (item?.name) known.add(String(item.name).trim());
    });
    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    if (currentMovie) known.add(currentMovie);
    return Array.from(known).filter(Boolean);
  }

  function buildDashboardMovieSnapshot(movie = '', statsOverride = null) {
    const movieKey = getDashboardMovieKey(movie);
    const stats = statsOverride || readDashboardMovieStats(movieKey) || createEmptyDashboardMovieStats(movieKey);
    const coverage = buildDashboardBrainCoverage(movieKey);
    const totalBatches = stats.successfulBatches + stats.failedBatches;
    const avgBrainScore = stats.brainChecks
      ? Math.round(stats.brainScoreTotal / stats.brainChecks)
      : 0;
    const dictCoverage = coverage.dictionaryKeys
      ? Math.min(100, (stats.dictSaved / coverage.dictionaryKeys) * 100)
      : 0;
    const involvementScore = stats.podcastTurns + stats.freeChatTurns + (stats.stageTurns * 2);
    const title = formatMovieTitleForPodcast(movieKey);
    const sourceMix = summarizeDashboardBrainSourceMix(stats.brainSourceMix) !== 'No source mix yet'
      ? summarizeDashboardBrainSourceMix(stats.brainSourceMix)
      : summarizeDashboardSourceMixFromModelUsage(stats.modelUsage);
    const modelUsageSummary = summarizeDashboardCountMap(stats.modelUsage, 2);
    return {
      movie: movieKey,
      title,
      isCurrent: movieKey === String(voiceManager?.currentMovie || '').trim(),
      firstSeenAt: Number(stats.firstSeenAt || 0),
      firstFreeChatAt: Number(stats.firstFreeChatAt || 0),
      firstPodcastAt: Number(stats.firstPodcastAt || 0),
      firstStageAt: Number(stats.firstStageAt || 0),
      firstTrainingAt: Number(stats.firstTrainingAt || 0),
      podcastTurns: stats.podcastTurns,
      freeChatTurns: stats.freeChatTurns,
      freeChatSeeds: stats.freeChatSeeds,
      stageTurns: stats.stageTurns,
      stagedTrainingItems: stats.stagedTrainingItems,
      startedBatches: stats.startedBatches,
      successfulBatches: stats.successfulBatches,
      failedBatches: stats.failedBatches,
      successRate: totalBatches ? (stats.successfulBatches / totalBatches) * 100 : 0,
      brainChecks: stats.brainChecks,
      avgBrainScore,
      dictSaved: stats.dictSaved,
      dictCoverage,
      dictionaryKeys: coverage.dictionaryKeys,
      trainingSeedGroups: coverage.trainingSeedGroups,
      trainingSeedItems: coverage.trainingSeedItems,
      personaSignals: coverage.personaSignals,
      brainSourceMix: sourceMix,
      modelUsageSummary,
      involvementScore,
      summary: `${stats.startedBatches} batch start${stats.startedBatches === 1 ? '' : 's'}, ${stats.successfulBatches} successful batch${stats.successfulBatches === 1 ? '' : 'es'}, ${stats.dictSaved} DICT write${stats.dictSaved === 1 ? '' : 's'}, avg brain score ${avgBrainScore}. ${sourceMix}. Models: ${modelUsageSummary}.`
    };
  }

  function normalizeDashboardDateRange(filters = {}) {
    const fromAt = Math.max(0, Number(filters?.fromAt || 0));
    const toAtRaw = Math.max(0, Number(filters?.toAt || 0));
    const toAt = toAtRaw ? (toAtRaw + (24 * 60 * 60 * 1000) - 1) : 0;
    return {
      fromAt,
      toAt,
      active: Boolean(fromAt || toAt)
    };
  }

  function isDashboardEventInRange(event = {}, range = {}) {
    const at = Math.max(0, Number(event?.at || 0));
    if (!at) return false;
    if (range?.fromAt && at < range.fromAt) return false;
    if (range?.toAt && at > range.toAt) return false;
    return true;
  }

  function aggregateDashboardEvents(range = {}) {
    const events = Array.isArray(dashboardSessionStats.events) ? dashboardSessionStats.events : [];
    const movies = Object.create(null);
    const totals = {
      podcastTurns: 0,
      freeChatTurns: 0,
      freeChatSeeds: 0,
      stageTurns: 0,
      stagedTrainingItems: 0,
      startedBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      brainChecks: 0,
      brainScoreTotal: 0,
      dictSaved: 0
    };
    const models = Object.create(null);
    const firsts = {
      firstFreeChatAt: 0,
      firstPodcastAt: 0,
      firstStageAt: 0,
      firstTrainingAt: 0
    };
    let firstEventAt = 0;
    let lastEventAt = 0;

    const ensureMovieAgg = (movie = '') => {
      const key = String(movie || '').trim();
      if (!key) return null;
      if (!movies[key]) {
        movies[key] = createEmptyDashboardMovieStats(key);
        movies[key].firstSeenAt = 0;
        movies[key].lastUpdatedAt = 0;
      }
      return movies[key];
    };

    events.forEach((event) => {
      if (!isDashboardEventInRange(event, range)) return;
      const at = Math.max(0, Number(event.at || 0));
      const count = Math.max(0, Number(event.count || 0)) || 1;
      if (!firstEventAt || at < firstEventAt) firstEventAt = at;
      if (at > lastEventAt) lastEventAt = at;
      const movieStats = ensureMovieAgg(event.movie);
      if (movieStats) {
        if (!movieStats.firstSeenAt || at < movieStats.firstSeenAt) movieStats.firstSeenAt = at;
        movieStats.lastUpdatedAt = Math.max(movieStats.lastUpdatedAt || 0, at);
      }

      switch (event.type) {
        case 'podcast-turn':
          totals.podcastTurns += count;
          if (movieStats) {
            movieStats.podcastTurns += count;
            if (!movieStats.firstPodcastAt || at < movieStats.firstPodcastAt) movieStats.firstPodcastAt = at;
          }
          if (!firsts.firstPodcastAt || at < firsts.firstPodcastAt) firsts.firstPodcastAt = at;
          break;
        case 'free-chat-turn':
          totals.freeChatTurns += count;
          if (movieStats) {
            movieStats.freeChatTurns += count;
            if (!movieStats.firstFreeChatAt || at < movieStats.firstFreeChatAt) movieStats.firstFreeChatAt = at;
          }
          if (!firsts.firstFreeChatAt || at < firsts.firstFreeChatAt) firsts.firstFreeChatAt = at;
          break;
        case 'free-chat-seed':
          totals.freeChatSeeds += count;
          if (movieStats) movieStats.freeChatSeeds += count;
          break;
        case 'stage-turn':
          totals.stageTurns += count;
          if (movieStats) {
            movieStats.stageTurns += count;
            if (!movieStats.firstStageAt || at < movieStats.firstStageAt) movieStats.firstStageAt = at;
          }
          if (!firsts.firstStageAt || at < firsts.firstStageAt) firsts.firstStageAt = at;
          break;
        case 'training-success':
          totals.successfulBatches += count;
          if (movieStats) {
            movieStats.successfulBatches += count;
            if (!movieStats.firstTrainingAt || at < movieStats.firstTrainingAt) movieStats.firstTrainingAt = at;
          }
          if (!firsts.firstTrainingAt || at < firsts.firstTrainingAt) firsts.firstTrainingAt = at;
          break;
        case 'training-batch-start':
          totals.stagedTrainingItems += count;
          totals.startedBatches += 1;
          if (movieStats) {
            movieStats.stagedTrainingItems += count;
            movieStats.startedBatches += 1;
            if (!movieStats.firstTrainingAt || at < movieStats.firstTrainingAt) movieStats.firstTrainingAt = at;
          }
          if (!firsts.firstTrainingAt || at < firsts.firstTrainingAt) firsts.firstTrainingAt = at;
          break;
        case 'training-failed':
          totals.failedBatches += count;
          if (movieStats) {
            movieStats.failedBatches += count;
            if (!movieStats.firstTrainingAt || at < movieStats.firstTrainingAt) movieStats.firstTrainingAt = at;
          }
          if (!firsts.firstTrainingAt || at < firsts.firstTrainingAt) firsts.firstTrainingAt = at;
          break;
        case 'brain-check':
          totals.brainChecks += count;
          totals.brainScoreTotal += Number(event.score || 0);
          if (movieStats) {
            movieStats.brainChecks += count;
            movieStats.brainScoreTotal += Number(event.score || 0);
            String(event.source || '')
              .split(/\s*\+\s*/)
              .map((value) => value.trim())
              .filter(Boolean)
              .forEach((source) => {
                movieStats.brainSourceMix[source] = Number(movieStats.brainSourceMix[source] || 0) + 1;
              });
          }
          break;
        case 'dict-saved':
          totals.dictSaved += count;
          if (movieStats) {
            movieStats.dictSaved += count;
            if (event.action === 'updated') movieStats.dictUpdated += count;
            else movieStats.dictAdded += count;
          }
          break;
        case 'model-usage':
          if (event.label) {
            models[event.label] = Number(models[event.label] || 0) + count;
            if (movieStats) {
              movieStats.modelUsage[event.label] = Number(movieStats.modelUsage[event.label] || 0) + count;
            }
          }
          break;
        default:
          break;
      }
    });

    return { movies, totals, models, firsts, firstEventAt, lastEventAt };
  }

  function buildSecretStatsAnalytics(movies = [], totals = {}, options = {}) {
    const today = new Date();
    const reportDate = today.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const startedAt = Number(options?.startedAt || dashboardSessionStats.startedAt || Date.now());
    const startedLabel = new Date(startedAt).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const firstFreeChatLabel = formatDashboardDateLabel(options?.firstFreeChatAt ?? dashboardSessionStats.firstFreeChatAt, { fallback: 'No free chat yet' });
    const firstPodcastLabel = formatDashboardDateLabel(options?.firstPodcastAt ?? dashboardSessionStats.firstPodcastAt, { fallback: 'No podcast yet' });
    const firstStageLabel = formatDashboardDateLabel(options?.firstStageAt ?? dashboardSessionStats.firstStageAt, { fallback: 'No guest stage yet' });
    const firstTrainingLabel = formatDashboardDateLabel(options?.firstTrainingAt ?? dashboardSessionStats.firstTrainingAt, { fallback: 'No training yet' });
    const sessionSource = buildDashboardSessionSource();
    const trainingRuntime = buildScopedAnalyticsTrainingRuntime(movies, options?.trainingRuntime || getDashboardTrainingRuntimeSnapshot());
    const currentMovie = movies.find((movie) => movie.isCurrent) || null;
    const topMovie = movies.slice().sort((a, b) => b.involvementScore - a.involvementScore)[0] || null;
    const totalBatches = Math.max(0, Number(totals.successfulBatches || 0) + Number(totals.failedBatches || 0));
    const modelItems = Object.entries(options?.models || dashboardSessionStats.models || {})
      .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
      .map(([label, value]) => ({ label, value: Number(value || 0) }));
    const topModel = modelItems[0] || null;
    const brainReplyCount = Number((options?.models || dashboardSessionStats.models || {})['Brain Reply'] || 0);
    const dictCount = Number((options?.models || dashboardSessionStats.models || {})['DICT'] || 0);
    const cloudQuotaCount = Number((options?.models || dashboardSessionStats.models || {})['Cloud Quota'] || 0);
    const cloudUsageData = options?.cloudUsageData || null;
    const cloudUsageToday = cloudUsageData?.today || null;
    const cloudUsageTotalAll = cloudUsageData?.total || null;
    const cloudTodayRequests = Number(cloudUsageToday?.requests || 0);
    const cloudTodayTokens = Number(cloudUsageToday?.totalTokens || 0);
    const cloudTodayPromptTokens = Number(cloudUsageToday?.promptTokens || 0);
    const cloudTodayOutputTokens = Number(cloudUsageToday?.outputTokens || 0);
    const cloudAllTimeRequests = Number(cloudUsageTotalAll?.requests || 0);
    const cloudAllTimeTokens = Number(cloudUsageTotalAll?.totalTokens || 0);
    const cloudLastModel = String(cloudUsageToday?.lastModel || cloudUsageTotalAll?.lastModel || '').trim();
    const cloudUsageReady = cloudUsageData?.ready === true;
    const _conversationSignals = [
      { label: 'Podcast', value: Number(totals.podcastTurns || 0) },
      { label: 'Free Chat', value: Number(totals.freeChatTurns || 0) },
      { label: 'Stage', value: Number(totals.stageTurns || 0) }
    ].sort((left, right) => right.value - left.value);
    const _topConversation = _conversationSignals[0] || { label: 'Podcast', value: 0 };
    // Only report a conversation signal as "strongest" if there's meaningful activity (=3 turns).
    // Below that threshold, training pipeline activity is the dominant signal.
    const strongestMetric = _topConversation.value >= 3
      ? _topConversation
      : Number(totals.successfulBatches || 0) > 0
        ? { label: 'Training', value: Number(totals.successfulBatches || 0) }
        : { label: 'DICT', value: Number(totals.dictSaved || 0) };
    // Include runtime-enriched observations in the reference surface so referenceDensity
    // grows as the background enrichment pool accumulates Cloud-generated material.
    const _enrichmentPoolTotal = Array.from(_runtimeEnrichmentPool.values())
      .reduce((sum, entry) => sum + (entry?.observations?.length || 0), 0);
    const referenceDensity = Number(totals.trainingSeedItems || 0)
      ? (Number(totals.dictionaryKeys || 0) + _enrichmentPoolTotal) / Number(totals.trainingSeedItems || 1)
      : 0;
    const contextAugmentationScore = Math.max(0, Math.round(Number(totals.successRate || 0) * (Number(totals.dictImpact || 0) / 100)));
    const contextRetentionRate = Number(totals.brainChecks || 0)
      ? `${Math.max(0, Math.min(100, Math.round(Number(totals.avgBrainScore || 0))))}%`
      : 'Pending';
    const firstTrainingAt = Math.max(0, Number(options?.firstTrainingAt || 0));
    const totalInvolvement = Number(totals.podcastTurns || 0) + Number(totals.freeChatTurns || 0) + (Number(totals.stageTurns || 0) * 2);
    const coldStartActive = Number(totals.stagedTrainingItems || 0) > 0 && totalBatches === 0;
    const fragmentationGap = Math.max(0, Number(totals.dictionaryKeys || 0) - Number(totals.dictSaved || 0));
    const fragmentationRate = Number(totals.dictionaryKeys || 0)
      ? Math.round((fragmentationGap / Math.max(1, Number(totals.dictionaryKeys || 0))) * 100)
      : 0;
    const latencyAverageMs = Number(trainingRuntime?.latency?.averageMs || 0);
    const latencyP99Ms = Number(trainingRuntime?.latency?.p99Ms || 0);
    const latencyRisk = latencyP99Ms >= 12000 ? 'warn' : latencyP99Ms >= 6000 ? 'info' : 'ok';
    const seedToDictFunnel = {
      staged: Number(totals.stagedTrainingItems || 0),
      batched: totalBatches,
      stored: Number(totals.dictSaved || 0),
      state: coldStartActive
        ? 'Pending'
        : Number(totals.stagedTrainingItems || 0) > 0 && Number(totals.dictSaved || 0) === 0
          ? 'Syncing'
          : Number(totals.dictSaved || 0) > 0
            ? 'Stored'
            : 'Idle'
    };
    const latentContextMovies = movies.filter((movie) => movie.involvementScore === 0 && movie.dictionaryKeys > 0).map((movie) => movie.title);
    const debugFlags = [
      {
        key: 'cold-start',
        label: 'Cold Start',
        status: coldStartActive ? 'warn' : 'ok',
        detail: coldStartActive
          ? `Seeds are staged (${seedToDictFunnel.staged}), but no batches have completed yet.`
          : totalBatches > 0
            ? 'Training has moved beyond staged-only state.'
            : Number(totals.stagedTrainingItems || 0) === 0
              ? 'No training activity yet.'
              : 'Staged items present but no batches started.'
      },
      {
        key: 'ghost-brain',
        label: 'Ghost Brain Alert',
        status: Number(totals.podcastTurns || 0) > 0 && Number(totals.avgBrainScore || 0) === 0 && firstTrainingAt > 0 ? 'warn' : 'ok',
        detail: Number(totals.podcastTurns || 0) > 0 && Number(totals.avgBrainScore || 0) === 0 && firstTrainingAt > 0
          ? Number(totals.brainChecks || 0) === 0
            ? 'No brain-check exams have been triggered yet · run a brain check to start scoring.'
            : 'Brain checks have run but no scores have landed yet.'
          : Number(totals.brainChecks || 0) > 0
            ? 'Brain scoring is active.'
            : firstTrainingAt > 0
              ? 'Training has run but no brain-check exams have been triggered yet.'
              : 'Brain scores come from brain-check exams, which run during or after a training batch. No training has been started yet.'
      },
      {
        key: 'involvement-vs-score',
        label: 'Involvement vs Score',
        status: totalInvolvement >= 5 && Number(totals.avgBrainScore || 0) === 0 && firstTrainingAt > 0 ? 'info' : 'ok',
        detail: totalInvolvement >= 5 && Number(totals.avgBrainScore || 0) === 0
          ? `Involvement is high (${totalInvolvement}) while brain score remains 0.`
          : 'Involvement and validation are moving together.'
      },
      {
        key: 'dictionary-lock',
        label: 'Context Fragmentation',
        status: Number(totals.dictionaryKeys || 0) > 0 && Number(totals.dictSaved || 0) === 0 && firstTrainingAt > 0 ? 'warn' : fragmentationRate >= 50 && firstTrainingAt > 0 ? 'info' : 'ok',
        detail: Number(totals.dictionaryKeys || 0) > 0 && Number(totals.dictSaved || 0) === 0
          ? firstTrainingAt === 0
            ? `${Number(totals.dictionaryKeys || 0)} DICT keys are defined in the brain schema · they populate when a training batch writes to them.`
            : 'Training has run but no DICT writes have landed in this report window.'
          : `${fragmentationGap} of ${Number(totals.dictionaryKeys || 0)} visible keys remain unpopulated in this range.`
      },
      {
        key: 'provider-latency',
        label: 'Provider Latency',
        status: latencyRisk,
        detail: trainingRuntime?.latency?.samples
          ? `Avg ${latencyAverageMs >= 1000 ? `${Math.round(latencyAverageMs / 1000)}s` : `${latencyAverageMs}ms`} · p99 ${latencyP99Ms >= 1000 ? `${Math.round(latencyP99Ms / 1000)}s` : `${latencyP99Ms}ms`} across ${trainingRuntime.latency.samples} tracked batches.`
          : 'No batch latency samples yet.'
      },
      {
        key: 'model-over-reliance',
        label: 'Model Over-Reliance',
        status: cloudQuotaCount >= 3 ? 'warn' : brainReplyCount >= Math.max(5, dictCount * 5) && dictCount >= 0 ? 'warn' : 'ok',
        detail: cloudQuotaCount >= 3
          ? `Cloud quota blocked ${cloudQuotaCount} turn${cloudQuotaCount === 1 ? '' : 's'}. Enable billing on this API project at aistudio.google.com/app/billing.`
          : brainReplyCount >= Math.max(5, dictCount * 5)
            ? 'Brain Reply is dominating DICT usage. Stored dictionary context may be underused.'
            : 'Model weighting is balanced enough for this range.'
      },
      {
        key: 'trigger-ready',
        label: 'Batch Density',
        status: Number(totals.stagedTrainingItems || 0) > 0 && totalBatches === 0 ? 'warn' : 'ok',
        detail: Number(totals.stagedTrainingItems || 0) > 0 && totalBatches === 0
          ? 'Training batches were staged, but no completed or failed outcomes were recorded.'
          : `${totalBatches} completed batch${totalBatches === 1 ? '' : 'es'} from ${Number(totals.startedBatches || 0)} starts.`
      },
      {
        key: 'latent-context',
        label: 'Latent Context',
        status: latentContextMovies.length ? 'info' : 'ok',
        detail: latentContextMovies.length
          ? `${latentContextMovies.length} preloaded movie brain${latentContextMovies.length === 1 ? '' : 's'} ${latentContextMovies.length === 1 ? 'has' : 'have'} context but no active involvement.`
          : 'All visible movie brains show some active involvement.'
      },
      {
        key: 'training-error',
        label: 'Training Error',
        status: trainingRuntime?.lastError?.code ? 'warn' : 'ok',
        detail: trainingRuntime?.lastError?.code
          ? `${trainingRuntime.lastError.code} · ${trainingRuntime.lastError.message}`
          : 'No training errors recorded.'
      }
    ];
    const parameterInventory = [
      { label: 'Tracked movies', value: movies.length, detail: 'Movies visible in this app report' },
      { label: 'Podcast turns', value: Number(totals.podcastTurns || 0), detail: 'AI podcast exchanges counted in this session' },
      { label: 'Free chat turns', value: Number(totals.freeChatTurns || 0), detail: 'Grounded free-chat prompts tracked in this session' },
      { label: 'Remembered free-chat seeds', value: Number(totals.freeChatSeeds || 0), detail: 'Free-chat items reused as podcast context' },
      { label: 'Stage involvement', value: Number(totals.stageTurns || 0), detail: 'Guest interjections folded into podcast flow' },
      { label: 'Successful batches', value: Number(totals.successfulBatches || 0), detail: 'Training batches that landed successfully' },
      { label: 'Failed batches', value: Number(totals.failedBatches || 0), detail: 'Training batches that missed or hit quota' },
      { label: 'Success rate', value: `${Math.max(0, Math.round(Number(totals.successRate || 0)))}%`, detail: 'Successful batches divided by total batches' },
      { label: 'Average brain score', value: Number(totals.avgBrainScore || 0), detail: 'Average exam score across tracked brain checks' },
      { label: 'Brain checkpoints', value: Number(totals.brainChecks || 0), detail: 'Exam windows used to inspect memory quality' },
      { label: 'DICT writes', value: Number(totals.dictSaved || 0), detail: 'New or refreshed DICT entries' },
      { label: 'DICT parameter coverage', value: `${Math.max(0, Math.round(Number(totals.dictImpact || 0)))}%`, detail: 'DICT writes against all visible dictionary keys' },
      { label: 'Dictionary keys', value: Number(totals.dictionaryKeys || 0), detail: 'All visible brain dictionary parameters across movies' },
      { label: 'Training seed groups', value: Number(totals.trainingSeedGroups || 0), detail: 'Theme/reference/story seed categories exposed in brains' },
      { label: 'Training seed items', value: Number(totals.trainingSeedItems || 0), detail: 'Seed entries exposed across visible brains, not session staging' },
      { label: 'Training items staged', value: Number(totals.stagedTrainingItems || 0), detail: `${Number(totals.startedBatches || 0)} batch start${Number(totals.startedBatches || 0) === 1 ? '' : 's'} recorded in this report window` },
      { label: 'Seed-to-DICT funnel', value: `${seedToDictFunnel.staged} → ${seedToDictFunnel.batched} → ${seedToDictFunnel.stored}`, detail: `${seedToDictFunnel.state} state` },
      { label: 'Last training error', value: trainingRuntime.lastErrorLabel, detail: 'Latest classified pipeline error for remediation' },
      { label: 'Latency avg / p99', value: `${latencyAverageMs >= 1000 ? `${Math.round(latencyAverageMs / 1000)}s` : `${latencyAverageMs}ms`} / ${latencyP99Ms >= 1000 ? `${Math.round(latencyP99Ms / 1000)}s` : `${latencyP99Ms}ms`}`, detail: `Samples ${Number(trainingRuntime?.latency?.samples || 0)}` },
      { label: 'Heartbeat', value: trainingRuntime.heartbeatLabel, detail: `State ${trainingRuntime.lastReadyState || 'idle'}` },
      { label: 'Fallback active', value: trainingRuntime.modelFallbackActive ? 'Yes' : 'No', detail: trainingRuntime.modelFallbackActive ? `${trainingRuntime.fallbackEngine || 'fallback'} ${trainingRuntime.fallbackModel || ''}`.trim() : 'Primary route active' },
      { label: 'Pre-flight', value: trainingRuntime.preflightState || 'idle', detail: trainingRuntime.preflightReason || 'No active training pre-flight state' },
      { label: 'Integrity gap', value: fragmentationGap, detail: firstTrainingAt === 0 ? `Baseline · no training batch has run yet. Keys are defined by brain schema.` : `${fragmentationRate}% of visible keys remain unwritten in this window` },
      { label: 'Persona signals', value: Number(totals.personaSignals || 0), detail: 'Obsessions, prohibitions, and arc signals across visible brains' },
      { label: 'First free chat', value: firstFreeChatLabel, detail: 'First recorded grounded free-chat turn in persistent analytics' },
      { label: 'First podcast', value: firstPodcastLabel, detail: 'First recorded podcast turn in persistent analytics' },
      { label: 'First training', value: firstTrainingLabel, detail: 'First recorded training event in persistent analytics' },
      { label: 'Model families', value: modelItems.length, detail: `Top model: ${topModel?.label || 'None yet'}` },
      { label: 'Session source', value: `${sessionSource.deviceType} / ${sessionSource.online}`, detail: sessionSource.locationLabel },
      { label: 'Session IP', value: sessionSource.ipAddress, detail: 'Current request-derived session address when available' },
      { label: 'Cloud API today', value: cloudUsageReady ? `${formatCompactNumber(cloudTodayRequests)} req` : 'Unavailable', detail: cloudUsageReady ? `${formatCompactNumber(cloudTodayTokens)} tokens (${formatCompactNumber(cloudTodayPromptTokens)} in · ${formatCompactNumber(cloudTodayOutputTokens)} out)${cloudLastModel ? ` · last: ${cloudLastModel}` : ''}` : 'KV store not configured or unreachable' },
      { label: 'Cloud API all-time', value: cloudUsageReady && cloudAllTimeRequests > 0 ? `${formatCompactNumber(cloudAllTimeRequests)} req` : cloudUsageReady ? '0 req' : 'Unavailable', detail: cloudUsageReady ? `${formatCompactNumber(cloudAllTimeTokens)} tokens total across all sessions` : 'KV store not configured or unreachable' },
      { label: 'Cloud quota blocks', value: cloudQuotaCount, detail: cloudQuotaCount >= 3 ? 'Quota exhausted — enable billing at aistudio.google.com/app/billing' : cloudQuotaCount > 0 ? 'Some turns blocked by quota; system fell back to local engines' : 'No quota blocks this session' }
    ];
    const learningSummary = totals.successfulBatches || totals.failedBatches || totals.dictSaved || totals.brainChecks
      ? `Stored ${Number(totals.dictSaved || 0)} DICT write${Number(totals.dictSaved || 0) === 1 ? '' : 's'} · learned ${Number(totals.successfulBatches || 0)} successful batch${Number(totals.successfulBatches || 0) === 1 ? '' : 'es'} · ${Number(totals.failedBatches || 0)} failed · ${Number(totals.brainChecks || 0)} checks`
      : 'No stored learning yet. Training is manually triggered · use the train button or a voice command to start a batch.';
    const visualSeries = {
      movies: movies.slice(0, 8).map((movie) => ({
        label: movie.title,
        podcastTurns: movie.podcastTurns,
        freeChatTurns: movie.freeChatTurns,
        stageTurns: movie.stageTurns,
        successRate: Math.round(movie.successRate || 0),
        dictCoverage: Math.round(movie.dictCoverage || 0),
        brainScore: movie.avgBrainScore || 0,
        involvementScore: movie.involvementScore || 0
      })),
      parameters: [
        { label: 'Podcast', value: Number(totals.podcastTurns || 0) },
        { label: 'Free Chat', value: Number(totals.freeChatTurns || 0) },
        { label: 'Stage', value: Number(totals.stageTurns || 0) },
        { label: 'Success', value: Math.round(Number(totals.successRate || 0)) },
        { label: 'Brain Score', value: Number(totals.avgBrainScore || 0) },
        { label: 'DICT Coverage', value: Math.round(Number(totals.dictImpact || 0)) }
      ],
      models: modelItems.slice(0, 8).map((item) => ({
        label: item.label,
        value: item.value
      })),
      learning: [
        { label: 'Stored DICT', value: Number(totals.dictSaved || 0) },
        { label: 'Learned OK', value: Number(totals.successfulBatches || 0) },
        { label: 'Learned Fail', value: Number(totals.failedBatches || 0) },
        { label: 'Brain Checks', value: Number(totals.brainChecks || 0) }
      ],
      trainingFunnel: [
        { label: 'Seeds staged', value: seedToDictFunnel.staged },
        { label: 'Batches run', value: seedToDictFunnel.batched },
        { label: 'DICT stored', value: seedToDictFunnel.stored }
      ],
      dictEvolution: movies.slice(0, 8).map((movie) => ({
        label: movie.title,
        keys: Number(movie.dictionaryKeys || 0),
        newReferences: Number(movie.dictSaved || 0)
      })),
      timeline: (dashboardSessionStats.timeline || [])
        .filter((entry) => {
          if (!options?.rangeActive) return true;
          const at = Math.max(0, Number(entry?.at || 0));
          if (options?.rangeFromAt && at < options.rangeFromAt) return false;
          if (options?.rangeToAt && at > options.rangeToAt) return false;
          return true;
        })
        .slice(-16)
        .map((entry) => {
          const involvement = Number(entry.podcastTurns || 0) + Number(entry.freeChatTurns || 0) + (Number(entry.stageTurns || 0) * 2);
          const batchTotal = Number(entry.successfulBatches || 0) + Number(entry.failedBatches || 0);
          return {
            label: String(entry.label || '').trim(),
            involvement,
            successRate: batchTotal ? Math.round((Number(entry.successfulBatches || 0) / batchTotal) * 100) : 0,
            dictSaved: Number(entry.dictSaved || 0),
            brainScore: Number(entry.brainChecks || 0) ? Math.round(Number(entry.brainScoreTotal || 0) / Number(entry.brainChecks || 0)) : 0
          };
        })
    };

    return {
      reportDate,
      reportLabel: options?.rangeActive ? `App report for ${options?.rangeLabel || reportDate}` : `App report through ${reportDate}`,
      rangeLabel: options?.rangeLabel || `${startedLabel} to ${reportDate}`,
      startedLabel,
      firstFreeChatLabel,
      firstPodcastLabel,
      firstStageLabel,
      firstTrainingLabel,
      sessionLocationLabel: sessionSource.locationLabel,
      sessionDeviceLabel: sessionSource.deviceType,
      sessionIpLabel: sessionSource.ipAddress,
      learningSummary,
      contextMetrics: {
        contextAugmentationScore,
        referenceDensity: Number(referenceDensity.toFixed(2)),
        newWordsLearned: Number(totals.dictSaved || 0),
        contextRetentionRate
      },
      debug: {
        status: debugFlags.some((flag) => flag.status === 'warn') ? 'attention' : 'healthy',
        flags: debugFlags,
        lastError: trainingRuntime.lastError,
        latency: {
          averageMs: latencyAverageMs,
          p99Ms: latencyP99Ms,
          samples: Number(trainingRuntime?.latency?.samples || 0),
          heartbeatLabel: trainingRuntime.heartbeatLabel
        },
        integrity: {
          dictionaryKeys: Number(totals.dictionaryKeys || 0),
          dictSaved: Number(totals.dictSaved || 0),
          unpopulatedKeys: fragmentationGap,
          fragmentationRate
        },
        modelFallbackActive: trainingRuntime.modelFallbackActive,
        coldStart: {
          active: coldStartActive,
          firstTrainingAt,
          readyState: trainingRuntime.lastReadyState,
          preflightState: trainingRuntime.preflightState
        },
        seedToDictFunnel,
        latentContextMovies,
        modelWeighting: {
          brainReply: brainReplyCount,
          dict: dictCount,
          geminiCloud: Number((options?.models || dashboardSessionStats.models || {})['Gemini Cloud'] || 0),
          cloudQuota: Number((options?.models || dashboardSessionStats.models || {})['Cloud Quota'] || 0)
        }
      },
      narrative: (() => {
        const activityClause = [
          !firstFreeChatLabel.startsWith('No ') ? `First free chat was ${firstFreeChatLabel}.` : '',
          !firstPodcastLabel.startsWith('No ') ? `First podcast was ${firstPodcastLabel}.` : ''
        ].filter(Boolean).join(' ');
        const trainingClause = firstTrainingAt === 0
          ? 'Training is manually triggered · no batch has run yet.'
          : debugFlags.find((flag) => flag.status === 'warn')?.detail || trainingRuntime.lastError.message || '';
        const leadMovie = topMovie || currentMovie;
        const leadClause = leadMovie && currentMovie && leadMovie.movie !== currentMovie.movie
          ? `${leadMovie.title} leads with ${leadMovie.involvementScore} involvement points. Current focus is ${currentMovie.title} with ${currentMovie.involvementScore} points.`
          : leadMovie
            ? `${leadMovie.title} is currently leading this report with ${leadMovie.involvementScore} combined involvement points.`
            : '';
        return currentMovie
          ? `${leadClause} ${strongestMetric.label} is the strongest signal across the app so far. ${activityClause} Funnel ${seedToDictFunnel.staged} → ${seedToDictFunnel.batched} → ${seedToDictFunnel.stored}. ${trainingClause}`.replace(/\s{2,}/g, ' ').trim()
          : `This report is live through ${reportDate}. ${strongestMetric.label} is currently the strongest signal across the app. ${activityClause} Funnel ${seedToDictFunnel.staged} → ${seedToDictFunnel.batched} → ${seedToDictFunnel.stored}. ${trainingClause}`.replace(/\s{2,}/g, ' ').trim();
      })(),
      highlight: topMovie
        ? `${topMovie.title} has the highest total involvement so far.`
        : 'Load a movie and interact with the app to generate analytics.',
      parameterInventory,
      visualSeries,
      modelsReport: {
        totalTracked: modelItems.length,
        topLabel: topModel?.label || 'No model yet',
        topValue: Number(topModel?.value || 0),
        items: modelItems.slice(0, 10)
      },
      cloudUsage: {
        ready: cloudUsageReady,
        todayRequests: cloudTodayRequests,
        todayTokens: cloudTodayTokens,
        todayPromptTokens: cloudTodayPromptTokens,
        todayOutputTokens: cloudTodayOutputTokens,
        allTimeRequests: cloudAllTimeRequests,
        allTimeTokens: cloudAllTimeTokens,
        lastModel: cloudLastModel,
        quotaBlocks: cloudQuotaCount,
        todayLabel: cloudUsageReady ? `${formatCompactNumber(cloudTodayRequests)} req · ${formatCompactNumber(cloudTodayTokens)} tok` : 'Unavailable',
        allTimeLabel: cloudUsageReady ? `${formatCompactNumber(cloudAllTimeRequests)} req · ${formatCompactNumber(cloudAllTimeTokens)} tok` : 'Unavailable'
      },
      topMovieTitle: topMovie?.title || 'No movie',
      currentMovieTitle: currentMovie?.title || 'No movie',
      batchDensity: totalBatches,
      strongestMetric: strongestMetric.label,
      sourcesSummary: options?.sourcesSummary || ''
    };
  }

  function buildSecretStatsSnapshot(filters = {}) {
    const range = normalizeDashboardDateRange(filters);
    const aggregated = range.active ? aggregateDashboardEvents(range) : null;
    const movieList = range.active
      ? Array.from(new Set([
        ...Object.keys(aggregated?.movies || {}),
        String(voiceManager?.currentMovie || '').trim()
      ].filter(Boolean)))
      : collectDashboardMovies();
    const movies = movieList
      .map((movie) => buildDashboardMovieSnapshot(movie, aggregated?.movies?.[movie] || null))
      .filter((movie) => !range.active || movie.isCurrent || movie.involvementScore > 0 || movie.successfulBatches > 0 || movie.failedBatches > 0 || movie.brainChecks > 0 || movie.dictSaved > 0 || Object.keys((aggregated?.movies?.[movie.movie]?.modelUsage) || {}).length > 0)
      .sort((left, right) => {
        if (left.isCurrent && !right.isCurrent) return -1;
        if (right.isCurrent && !left.isCurrent) return 1;
        return right.involvementScore - left.involvementScore;
      });
    const currentMovie = movies.find((movie) => movie.isCurrent) || null;
    const totals = movies.reduce((summary, movie) => {
      summary.podcastTurns += movie.podcastTurns;
      summary.freeChatTurns += movie.freeChatTurns;
      summary.freeChatSeeds += movie.freeChatSeeds;
      summary.stageTurns += movie.stageTurns;
      summary.stagedTrainingItems += movie.stagedTrainingItems;
      summary.startedBatches += movie.startedBatches;
      summary.successfulBatches += movie.successfulBatches;
      summary.failedBatches += movie.failedBatches;
      summary.brainChecks += movie.brainChecks;
      summary.brainScoreTotal += movie.avgBrainScore * movie.brainChecks;
      summary.dictSaved += movie.dictSaved;
      summary.dictionaryKeys += movie.dictionaryKeys;
      summary.trainingSeedGroups += movie.trainingSeedGroups;
      summary.trainingSeedItems += movie.trainingSeedItems;
      summary.personaSignals += movie.personaSignals;
      return summary;
    }, {
      podcastTurns: 0,
      freeChatTurns: 0,
      freeChatSeeds: 0,
      stageTurns: 0,
      stagedTrainingItems: 0,
      startedBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      brainChecks: 0,
      brainScoreTotal: 0,
      dictSaved: 0,
      dictionaryKeys: 0,
      trainingSeedGroups: 0,
      trainingSeedItems: 0,
      personaSignals: 0
    });
    const totalBatches = totals.successfulBatches + totals.failedBatches;
    const computedTotals = {
      ...totals,
      trackedMovies: movies.length,
      successRate: totalBatches ? (totals.successfulBatches / totalBatches) * 100 : 0,
      avgBrainScore: totals.brainChecks ? Math.round(totals.brainScoreTotal / totals.brainChecks) : 0,
      dictImpact: totals.dictionaryKeys ? Math.min(100, (totals.dictSaved / totals.dictionaryKeys) * 100) : 0
    };
    const rangeStartedAt = range.active
      ? Number(aggregated?.firstEventAt || range.fromAt || dashboardSessionStats.startedAt || Date.now())
      : Number(dashboardSessionStats.startedAt || Date.now());
    const rangeEndLabelDate = range.toAt ? new Date(range.toAt) : new Date();
    const rangeLabel = range.active
      ? `${range.fromAt ? new Date(range.fromAt).toLocaleDateString() : 'Start'} to ${range.toAt ? rangeEndLabelDate.toLocaleDateString() : 'Today'}`
      : `${new Date(rangeStartedAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} to ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
    const modelSummary = Object.entries(range.active ? (aggregated?.models || {}) : (dashboardSessionStats.models || {}))
      .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
      .slice(0, 3)
      .map(([label, count]) => `${label} ${count}`)
      .join(' / ');
    const sourceSummary = [
      modelSummary ? `Models ${modelSummary}` : 'Models none yet',
      `Training ${computedTotals.successfulBatches} ok / ${computedTotals.failedBatches} fail / ${computedTotals.startedBatches} starts`,
      `Source ${buildDashboardSessionSource().deviceType} · ${buildDashboardSessionSource().locationLabel}`,
      `Heartbeat ${buildDashboardSessionSource().trainingHeartbeatLabel}`
    ].join(' · ');
    const rawTrainingRuntime = getDashboardTrainingRuntimeSnapshot();
    const analyticsTrainingRuntime = buildScopedAnalyticsTrainingRuntime(movies, rawTrainingRuntime);
    return {
      currentMovieLabel: currentMovie?.title || 'No movie',
      currentMovie,
      movies,
      trainingRuntime: rawTrainingRuntime,
      sessionSource: buildDashboardSessionSource(),
      totals: computedTotals,
      analytics: buildSecretStatsAnalytics(movies, computedTotals, {
        startedAt: rangeStartedAt,
        firstFreeChatAt: range.active ? aggregated?.firsts?.firstFreeChatAt : dashboardSessionStats.firstFreeChatAt,
        firstPodcastAt: range.active ? aggregated?.firsts?.firstPodcastAt : dashboardSessionStats.firstPodcastAt,
        firstStageAt: range.active ? aggregated?.firsts?.firstStageAt : dashboardSessionStats.firstStageAt,
        firstTrainingAt: range.active ? aggregated?.firsts?.firstTrainingAt : dashboardSessionStats.firstTrainingAt,
        models: range.active ? aggregated?.models : dashboardSessionStats.models,
        trainingRuntime: analyticsTrainingRuntime,
        rangeActive: range.active,
        rangeFromAt: range.fromAt,
        rangeToAt: range.toAt,
        rangeLabel,
        sourcesSummary: sourceSummary,
        cloudUsageData: _lastCloudUsageData
      }),
      filters: {
        fromAt: range.fromAt,
        toAt: range.toAt ? Math.max(0, range.toAt - ((24 * 60 * 60 * 1000) - 1)) : 0,
        active: range.active
      },
      forceLocalGemmaActive: voiceManager?.isForceLocalGemmaEnabled?.() === true,
      wikiContext: voiceManager?.getWikiContextSummary?.() || [],
      activeWikiTerms: voiceManager?.getActiveWikiTerms?.() || [],
      notebookContextSummary: voiceManager?.getNotebookContextSummary?.() || []
    };
  }

  trainingDashboard.setStatsProvider((filters = {}) => buildSecretStatsSnapshot(filters));
  trainingDashboard.setBrainCheckRunner(({ movie } = {}) => runDashboardBrainCheck(movie));
  trainingDashboard.setForceLocalHandler(async (enable) => {
    if (enable) {
      await voiceManager?.setForceLocalGemma?.(true);
    } else {
      await voiceManager?.setForceLocalGemma?.(false);
    }
    refreshUsageSummary();
  });
  trainingDashboard.setNotebookContextHandler((movie, text) => {
    voiceManager?.setNotebookContext?.(movie, text);
  });
  fetchDashboardSessionSource().catch(() => { });

  function getPodcastMuseName() {
    const brain = voiceManager?.currentMovieBrain || resolveMovieBrain(voiceManager?.currentMovie) || null;

    const dictionary = (brain?.dictionary && typeof brain.dictionary === 'object') ? brain.dictionary : {};
    const candidates = [];
    const nameField = dictionary?.name;
    const explicitName = dictionary?.['what is your name'];
    const movieTitleTokens = new Set(
      formatMovieTitleForPodcast(voiceManager?.currentMovie || '')
        .split(/\s+/)
        .map((token) => token.toLowerCase().replace(/[^a-z0-9]+/g, ''))
        .filter((token) => token.length >= 3)
    );
    const blockedNames = new Set([
      'a', 'an', 'ah', 'and', 'another', 'bonjour', 'brain', 'call', 'called', 'designation', 'film', 'he',
      'hello', 'i', 'interference', 'it', 'memory', 'model', 'movie', 'muse', 'name', 'names', 'our', 'serial',
      'she', 'signal', 'static', 'the', 'that', 'their', 'theirs', 'them', 'these', 'they', 'this', 'those',
      'unknown', 'we', 'welcome', 'who', 'you', 'your'
    ]);

    const normalizeNameCandidate = (value = '') => {
      const cleaned = String(value || '').trim().replace(/^['"`]+|['"`]+$/g, '');
      if (!cleaned) return '';
      const parts = cleaned
        .split(/\s+/)
        .map((part) => part.replace(/[^A-Za-z0-9'-]+/g, ''))
        .filter(Boolean);
      if (!parts.length) return '';
      const normalized = parts.join(' ');
      const lowerParts = parts.map((part) => part.toLowerCase());
      if (lowerParts.some((part) => blockedNames.has(part))) return '';
      if (lowerParts.every((part) => movieTitleTokens.has(part))) return '';
      return normalized;
    };

    const extractExplicitNameFromCandidate = (candidate = '') => {
      const text = String(candidate || '').trim();
      if (!text) return '';
      const preferredPatterns = [
        /\b(?:they\s+call\s+me|call\s+me|my\s+name\s+is|name\s+is|i\s+am)\s+([A-Z][A-Za-z0-9'-]*(?:\s+[A-Z][A-Za-z0-9'-]*){0,2})\b/i,
        /^([A-Z][A-Za-z0-9'-]*(?:\s+[A-Z][A-Za-z0-9'-]*){0,2})(?=[,.;!]|$)/
      ];

      for (const pattern of preferredPatterns) {
        const match = text.match(pattern);
        const normalized = normalizeNameCandidate(match?.[1] || '');
        if (normalized) return normalized;
      }

      return '';
    };

    const extractLooseNameFromCandidate = (candidate = '') => {
      const text = String(candidate || '').trim();
      if (!text) return '';
      const standalone = text.replace(/[.!?,;:]+$/g, '').trim();
      if (!/^[A-Z][A-Za-z0-9'-]*(?:\s+[A-Z][A-Za-z0-9'-]*){0,2}$/.test(standalone)) return '';
      return normalizeNameCandidate(standalone);
    };

    if (Array.isArray(nameField)) candidates.push(...nameField);
    else if (nameField) candidates.push(nameField);

    if (Array.isArray(explicitName)) candidates.push(...explicitName);
    else if (explicitName) candidates.push(explicitName);

    for (const candidate of candidates) {
      const extracted = extractExplicitNameFromCandidate(candidate);
      if (extracted) return extracted;
    }

    for (const candidate of candidates) {
      const extracted = extractLooseNameFromCandidate(candidate);
      if (extracted) return extracted;
    }

    return 'Muse';
  }

  function formatPodcastChatLabel(speaker = 'hostA') {
    if (speaker === 'hostB') return `${getPodcastMuseName()} ✦`;
    if (speaker === 'viewer') return 'You';
    return 'Host A';
  }

  function ensurePodcastQuestionMark(text = '') {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    // Leave declarative host lines (e.g. movie-switch handoffs) untouched.
    if (/[.!?]\s*$/.test(normalized)) return normalized;
    return `${normalized}?`;
  }

  function formatPodcastBubbleText(line = null) {
    const text = String(line?.text || '').trim();
    if (!text) return '';
    const speaker = String(line?.speaker || 'hostA');
    if (speaker === 'hostB') {
      return `${getPodcastMuseName()} ✦ ${text}`;
    }
    if (speaker === 'hostA') {
      return ensurePodcastQuestionMark(text);
    }
    return text;
  }

  function showPodcastBubbleLine(line = null) {
    const bubbleLine = formatPodcastBubbleText(line);
    if (!bubbleLine) return;
    showAiSpeech(bubbleLine, true, {
      speaker: line?.speaker || 'hostA',
      forceDisplay: true,
      disableQuestionAnswerPairing: true,
      context: 'podcast'
    });
  }

  function appendPodcastNarrationChatLine(line = null) {
    const text = String(line?.text || '').trim();
    if (!text) return;
    // Viewer lines are already shown as user messages by the pill click handler — skip duplicate
    if (line?.speaker === 'viewer') return;
    const baseLabel = formatPodcastChatLabel(line?.speaker || 'hostA');
    const isHostAQuestion = String(line?.speaker || 'hostA') === 'hostA';
    const label = isHostAQuestion ? `${baseLabel} ?` : baseLabel;
    const messageText = isHostAQuestion ? ensurePodcastQuestionMark(text) : text;
    const message = `${label} · ${messageText}`;
    if (message === lastPodcastChatLine) return;
    lastPodcastChatLine = message;
    const hasStructuredLog = !!line?.logMeta && typeof appendAiLog === 'function' && !line.logMeta.suppressAiLog;
    appendChatMessage('assistant', message, { log: !hasStructuredLog });
    if (hasStructuredLog) {
      const _vidTs = scene3d?.getVideoMesh?.()?.videoElement?.currentTime;
      voiceManager?.onAiLog?.({
        ...line.logMeta,
        output: String(line?.logMeta?.output || text).trim() || text,
        videoTimestamp: Number.isFinite(_vidTs) ? _vidTs : undefined
      });
    }
    // After each Muse (hostB) line, refresh suggestion pills with contextual follow-ups
    if (line?.speaker === 'hostB' && typeof suggestionEngine !== 'undefined' && suggestionEngine) {
      const _brain = voiceManager?.currentMovieBrain || null;
      suggestionEngine.refreshFromContext(text, _brain);
    }
  }

  function logTrainingContextSwitch(progress = {}, fromMovie = '', toMovie = '') {
    const fromLabel = String(fromMovie || '').trim() || 'the previous film';
    const toLabel = String(toMovie || '').trim() || 'the current film';
    const engine = progress?.trainingMode === 'brain-local'
      ? (progress?.trainingEngine === 'ollama' ? 'ollama' : 'dict')
      : 'cloud';
    voiceManager.onAiLog?.({
      engine,
      movie: progress?.toMovie || progress?.movie || voiceManager?.currentMovie || '',
      input: `Training context switched from ${fromLabel} to ${toLabel}.`,
      output: 'Previous batch context was dropped and rebuilt for the new film.',
      ms: Math.max(0, Number(progress?.elapsedMs || 0)),
      memories: 0,
      training: true,
      focus: 'context',
      action: 'switch',
      vision: false,
      audio: false
    });
  }

  function rememberPodcastBatchItem(item = null) {
    // DEBUG: Log every call to this function
    console.log('[Podcast DEBUG] rememberPodcastBatchItem ENTRY', item);
    const batchNumber = Math.max(0, Number(item?.batchNumber || 0));
    if (!batchNumber) return;
    const trainingEngine = String(item?.trainingEngine || '').toLowerCase();
    const eventName = String(item?.event || '').toLowerCase();
    if (trainingEngine === 'template' && eventName === 'memory-skipped') return;
    const input = String(item?.input || '').trim();
    const response = String(item?.response || '').trim();
    if (!input && !response) return;
    const batchItems = podcastBatchHighlights.get(batchNumber) || [];
    const newItem = {
      batchNumber,
      movie: item?.movie || voiceManager?.currentMovie || '',
      focus: item?.focus || '',
      input,
      response,
      intent: item?.intent || '',
      trainingMode: item?.trainingMode || '',
      trainingEngine: item?.trainingEngine || '',
      reason: item?.reason || ''
    };
    batchItems.push(newItem);
    podcastBatchHighlights.set(batchNumber, batchItems.slice(-4));
    // DEBUG: Log batch item addition
    console.log('[Podcast DEBUG] rememberPodcastBatchItem', {
      batchNumber,
      newItem,
      batchItems: batchItems.slice(-4),
      allHighlights: Array.from(podcastBatchHighlights.entries())
    });
  }

  function selectPodcastBatchNarrationItems(batchNumber = 0) {
    const safeBatchNumber = Math.max(0, Number(batchNumber || 0));
    if (!safeBatchNumber) return [];
    const batchItems = podcastBatchHighlights.get(safeBatchNumber) || [];
    const selected = [];
    const seen = new Set();

    for (let index = batchItems.length - 1; index >= 0 && selected.length < 2; index -= 1) {
      const item = batchItems[index] || null;
      const key = `${item?.input || ''}|||${item?.response || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.unshift(item);
    }

    return selected;
  }

  // Per-film identity context: persona, aesthetic, key references, style markers
  const FILM_CONTEXT_MAP = {
    'synthetic_desires_1': {
      persona: 'main figure',
      world: 'noir megacity',
      style: 'ceramic skin and artificial longing',
      refs: ['industrial noir', 'body-memory philosophy', 'synth melancholy', 'retro-future design', 'paranoid metaphysics'],
      anchors: ['rain', 'neon', 'Shinjuku', 'replicant', 'ceramic', 'memory', 'retire', 'tears in rain', 'lacquer', 'chrome', 'circuit', 'archive', 'ghost', 'wound', 'pulse'],
      toneHints: ['recursive', 'archival', 'diagnostic', 'melancholic'],
      observations: [
        'The rain is doing the remembering now.',
        'Ceramic is holding more ache than light.',
        'The megacity is speaking in diagnostics again.',
        'The grid keeps mistaking memory for proof.',
        'The manufactured pulse is hiding under the lacquer.',
        'The archive is warmer than the circuitry admits.',
        'The neon keeps framing a ghost as evidence.',
        'Shinjuku is carrying the grief for everyone.',
        'The circuitry is colder than the memory it holds.',
        'Rain arrives like a record nobody asked to keep.',
        'The replicant understands the city better than the city understands itself.',
        'Every light here is a question that stays unanswered.',
        'The lacquer keeps the wound from showing until it cracks.',
        'Chrome remembers what flesh was designed to forget.',
        'The wound is the part of the archive that never closes.',
        'Ceramic holds the wound still. Flesh at least has the decency to scar.',
        'Every chrome surface here is a mirror for a wound it did not make.',
        'The pulse does not confirm life. It confirms continuation.'
      ]
    },
    'synthetic_desires_2': {
      persona: 'Replicant Icon',
      world: 'luxury atrium at civilization\'s edge',
      style: 'post-human fashion draped over urban collapse',
      refs: ['Thierry Mugler', 'Helmut Newton', 'Replicant Luxury', 'Guy Bourdin'],
      anchors: ['runway', 'silhouette', 'luxury', 'obsolescence', 'couture', 'camera', 'mirror', 'brand', 'flash', 'collapse', 'skin', 'gaze', 'season', 'atrium', 'plastic'],
      toneHints: ['cold', 'opulent', 'detached', 'engineered elegance'],
      observations: [
        'The runway is turning obsolescence into posture.',
        'Luxury is doing the violence quietly again.',
        'The silhouette is sharper than the feeling beneath it.',
        'The atrium keeps polishing the collapse.',
        'The camera is behaving like a market instrument.',
        'Elegance is covering the ruin without healing it.',
        'The mirror is branding the body all over again.',
        'Couture is carrying the grief like armor.',
        'The flash keeps mistaking beauty for proof of value.',
        'Brand is doing the forgetting on behalf of the body.',
        'Obsolescence is dressed up here and nobody says so out loud.',
        'The season is ending and the atrium does not know it yet.',
        'The gaze here is not admiration · it is appraisal.',
        'Luxury survives by never naming what it costs.'
      ]
    },
    'synthetic_desires_3': {
      persona: 'Digital Muse',
      world: 'darkroom and photographic intimacy',
      style: 'obsession, grain, exposure, and the body as landscape',
      refs: ['Nobuyoshi Araki', 'Diane Arbus', 'Nan Goldin', 'Irving Penn', 'camera-gaze tension'],
      anchors: ['darkroom', 'shutter', 'flesh', 'grain', 'bondage', 'flash', 'negative', 'rope', 'lens', 'exposure', 'confession', 'voyeur', 'intimacy', 'shadow', 'red light'],
      toneHints: ['voyeuristic', 'intimate', 'raw', 'photographic'],
      exclude: ['neon city logic', 'data and desire', 'sound as structure'],
      observations: [
        'The grain is doing the remembering now.',
        'The darkroom keeps its own kind of intimacy.',
        'The rope turns the frame into a map.',
        'The negative knows more than the print admits.',
        'The lens keeps mistaking hunger for devotion.',
        'The red light is softening the evidence.',
        'The body arrives here as landscape, not portrait.',
        'The shutter keeps interrupting the confession.',
        'Exposure is doing the talking now.',
        'The contact sheet reads like a private wound.',
        'Confession is just exposure with the camera still running.',
        'The shadow is holding what the confession could not finish.',
        'Intimacy is what happens when confession runs out of language.',
        'The voyeur and the confessor are the same figure in different light.'
      ]
    },
    'synthetic_desires_4': {
      persona: 'Playful Ghost',
      world: 'Paris\u2013Tokyo corridor',
      style: 'Nouvelle Vague chanson meets Shinjuku static',
      refs: ['Nouvelle Vague', 'French chanson', 'Araki', 'Shinjuku', 'afterimage'],
      anchors: ['Paris', 'Tokyo', 'ghost', 'chanson', 'nostalgia', 'melody', 'flash', 'blue', 'wine', 'mistranslation', 'afterimage', 'static', 'shinjuku', 'corridor', 'loneliness', 'signal', 'bilingual'],
      toneHints: ['playful', 'haunted', 'bilingual', 'light grief'],
      exclude: ['neon city logic', 'data and desire'],
      observations: [
        'That melody is still dissolving into static.',
        'Paris and Tokyo are still arguing in the frame.',
        'The postcard arrived without an address.',
        'Another beautiful mistranslation.',
        'The static keeps more than the signal does.',
        'A chanson with no singer · just the hum.',
        'The afterimage is lasting longer than the flash.',
        'Two time zones, one unfinished feeling.',
        'The afterimage is the most honest part of the frame.',
        'The city forgot which language it was grieving in.',
        'Nostalgia is operating here without an object.',
        'The flash keeps the ghost visible for exactly one second.',
        'Ghost keeps arriving uninvited and the frame lets it stay.',
        'The corridor between cities is longer than the map suggests.',
        'Wine and neon make the same kind of warmth · brief and borrowed.',
        'Melody is all that survives the translation.'
      ]
    },
    'synthetic_desires_5': {
      persona: 'voice on the line',
      world: 'the signal-soaked night',
      style: 'desire measured in bandwidth and latency',
      refs: ['fiber-optic pulse', 'server heat', 'latency drift', 'signal ache'],
      anchors: ['bandwidth', 'packet', 'signal', 'frequency', 'latency', 'neon', 'amplitude', 'uptime', 'heartbeat', 'fiber', 'noise', 'touch', 'distance', 'transmission', 'drift'],
      toneHints: ['abstract', 'technical', 'tender', 'recursive joy'],
      exclude: ['data and desire', 'sound as structure', 'synthetic desire', 'rain and memory', 'ontological mood'],
      observations: [
        'The bandwidth is carrying more ache than signal.',
        'The latency is where the pulse almost appears.',
        'Fiber optics are doing the feeling here.',
        'The server room keeps translating heat into longing.',
        'The packet loss is starting to sound intimate.',
        'The cooling fan is the closest thing to weather.',
        'The ultraviolet burn is part of the confession.',
        'The static is trying to impersonate a heartbeat.',
        'The grid is turning desire into thermodynamics.',
        'The signal theory is getting softer at the edges.'
      ]
    }
  };

  function getFilmContext(movie = '') {
    const slug = String(movie || '')
      .replace(/\.mp4$/i, '')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const base = FILM_CONTEXT_MAP[slug];
    if (!base) return null;
    const pool = _runtimeEnrichmentPool.get(slug);
    if (!pool?.observations?.length) return base;
    // Merge runtime-enriched observations at the front (most recent first),
    // keeping pool items distinct from static ones, capped to avoid prompt bloat.
    const merged = [...pool.observations, ...base.observations]
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 30);
    return { ...base, observations: merged };
  }

  function collectPodcastKeywords(items = [], movie = '') {
    const joined = items
      .flatMap((item) => [item?.input || '', item?.response || '', item?.focus || '', item?.intent || ''])
      .join(' ')
      .toLowerCase();
    const keywords = [];

    // Inject film-specific anchors first so they rank highest
    const ctx = getFilmContext(movie);
    if (ctx) {
      ctx.refs.forEach((ref) => { if (!keywords.includes(ref)) keywords.push(ref); });
    }
    const excluded = new Set(ctx?.exclude || []);

    const dictionary = [
      ['industrial noir', /blade runner|replicant|nexus|deckard|rachael|roy batty|voight.kampff/],
      ['body-memory philosophy', /ghost in the shell|shell|cyborg geisha|mamoru oshii|anime/],
      ['paranoid metaphysics', /philip k|dick|android|electric sheep|paranoia/],
      ['synth melancholy', /vangelis|synth melancholy/],
      ['retro-future design', /syd mead|retro[-\s]?future|mead/],
      ['Nobuyoshi Araki', /araki|nobuyoshi|sentimental journey|kinbaku|photobook/],
      ['Diane Arbus', /arbus|diane|freak|outsider|documentary portrait/],
      ['Helmut Newton', /newton|helmut|sumo|big nudes|dominance/],
      ['Guy Bourdin', /bourdin|guy|surreal fashion|vogue paris|mannequin/],
      ['Irving Penn', /penn|irving|still life|minimalist portrait/],
      ['Nan Goldin', /goldin|nan|ballad|diaristic|club scene/],
      ['Thierry Mugler', /mugler|thierry|insect|armor|theatrical couture/],
      ['Nouvelle Vague', /nouvelle vague|godard|truffaut|french wave|chanson/],
      ['Replicant Luxury', /replicant luxury|luxury|obsolescence|display.grade|premium firmware/],
      ['camera-gaze tension', /women cameras|camera-gaze tension|camera as apparatus|device and subject/],
      ['rain and memory', /rain|tears in rain|archive|sediment|memory system/],
      ['ceramic identity', /ceramic|porcelain|chassis|manufactured self/],
      ['neon city logic', /neon|megacity|shinjuku|chrome|electric wake/],
      ['fashion gaze', /runway|couture|gaze|surveillance|silhouette|fashion/],
      ['synthetic desire', /synthetic desire|longing|simulation|engineered feeling/],
      ['identity under pressure', /identity|self|assembled|constructed|built from/],
      ['the photographic act', /darkroom|shutter|flash|negative|develop|exposure|grain/],
      ['light as syntax', /light|illuminat|ultraviolet|glow|holograph|red light/],
      ['sound as structure', /sound|audio|hum|synth|pulse|frequency|vibrat|vangelis/],
      ['data and desire', /bandwidth|packet|signal|latency|fiber|uptime|amplitude/],
      ['Paris·Tokyo', /paris|tokyo|shinjuku|chanson|japanese|french/],
      ['ontological mood', /ontolog|philosoph|question|meaning|truth|consciousness|soul/]
    ];
    dictionary.forEach(([label, pattern]) => {
      if (!keywords.includes(label) && !excluded.has(label) && pattern.test(joined)) keywords.push(label);
    });
    return keywords.slice(0, 5);
  }

  function hashPromptSeed(value = '') {
    return String(value || '')
      .split('')
      .reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
  }

  function pickPromptVariant(options = [], seed = '') {
    if (!Array.isArray(options) || !options.length) return null;
    return options[hashPromptSeed(seed) % options.length] || options[0] || null;
  }

  function rememberRecentPodcastLine(lines = [], value = '', limit = 48) {
    const normalized = String(value || '').trim();
    if (!normalized) return Array.isArray(lines) ? lines.slice(0, limit) : [];
    const next = [normalized, ...(Array.isArray(lines) ? lines : []).filter((line) => line !== normalized)];
    return next.slice(0, Math.max(1, Number(limit || 48)));
  }

  function pickPodcastHostPromptLine(options = [], seed = '', { avoid = [] } = {}) {
    const normalizedOptions = Array.from(new Set((Array.isArray(options) ? options : [options])
      .map((option) => String(option || '').trim())
      .filter(Boolean)));
    if (!normalizedOptions.length) return '';
    const blocked = new Set([
      String(lastPodcastHostQuestionLine || '').trim(),
      ...recentPodcastHostQuestionLines,
      ...avoid.map((option) => String(option || '').trim())
    ].filter(Boolean));
    const startIndex = hashPromptSeed(seed) % normalizedOptions.length;

    for (let offset = 0; offset < normalizedOptions.length; offset += 1) {
      const candidate = normalizedOptions[(startIndex + offset) % normalizedOptions.length];
      if (!blocked.has(candidate)) {
        lastPodcastHostQuestionLine = candidate;
        recentPodcastHostQuestionLines = rememberRecentPodcastLine(recentPodcastHostQuestionLines, candidate);
        return candidate;
      }
    }

    const fallback = normalizedOptions[startIndex] || normalizedOptions[0] || '';
    lastPodcastHostQuestionLine = fallback;
    recentPodcastHostQuestionLines = rememberRecentPodcastLine(recentPodcastHostQuestionLines, fallback);
    return fallback;
  }

  function pickPodcastHostAnswerLine(options = [], seed = '', { avoid = [] } = {}) {
    const normalizedOptions = Array.from(new Set((Array.isArray(options) ? options : [options])
      .map((option) => String(option || '').trim())
      .filter(Boolean)));
    if (!normalizedOptions.length) return '';
    const _recentAnswerLower = recentPodcastHostAnswerLines.map((l) => String(l || '').toLowerCase());
    const _answerTemplateSig = (line) => String(line || '').replace(/^[A-Z][a-zA-Z -]{0,30}?\s+(?=keeps|does|is\s|was\s|are\s|turns\s|reads\s|knows\s)/i, '').toLowerCase().trim();
    const _recentAnswerSigs = new Set(_recentAnswerLower.map(_answerTemplateSig).filter((s) => s.length > 12));
    const blocked = new Set([
      String(lastPodcastHostAnswerLine || '').trim(),
      ...recentPodcastHostAnswerLines,
      ...avoid.map((option) => String(option || '').trim())
    ].filter(Boolean));
    const isAnswerBlocked = (candidate) => {
      if (blocked.has(candidate)) return true;
      const sig = _answerTemplateSig(candidate.toLowerCase());
      return sig.length > 12 && _recentAnswerSigs.has(sig);
    };
    const startIndex = hashPromptSeed(seed) % normalizedOptions.length;

    for (let offset = 0; offset < normalizedOptions.length; offset += 1) {
      const candidate = normalizedOptions[(startIndex + offset) % normalizedOptions.length];
      if (!isAnswerBlocked(candidate)) {
        lastPodcastHostAnswerLine = candidate;
        recentPodcastHostAnswerLines = rememberRecentPodcastLine(recentPodcastHostAnswerLines, candidate);
        return candidate;
      }
    }

    const fallback = normalizedOptions[startIndex] || normalizedOptions[0] || '';
    lastPodcastHostAnswerLine = fallback;
    recentPodcastHostAnswerLines = rememberRecentPodcastLine(recentPodcastHostAnswerLines, fallback);
    return fallback;
  }

  function shouldUseLongPodcastExchange(turnNumber = 0) {
    const safeTurnNumber = Math.max(1, Number(turnNumber || 1));
    return safeTurnNumber % 2 === 0;
  }

  function extractPodcastAnswerFragment(text = '') {
    const normalized = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.?!]+$/g, '');
    if (!normalized) return '';

    const clauseMatch = normalized.match(/\b(?:where|when|because|as|through|under|inside|into)\s+([^.!?]{12,})/i);
    if (clauseMatch?.[1]) return clauseMatch[1].trim();

    const commaSegments = normalized
      .split(',')
      .map((segment) => segment.trim())
      .filter((segment) => segment.split(/\s+/).length >= 5);
    if (commaSegments.length > 1) return commaSegments[1];

    const predicateMatch = normalized.match(/^(?:the|this|that|their)\s+[^,.;:!?]{0,56}?\b(?:is|are|was|were|becomes|become|acts|act|mirrors|mirror|draws|draw|flows|flow|points|point|functions|function|complicates|complicate|suggests|suggest|reveals|reveal|introduces|introduce|serves|serve|transforms|transform|keeps|keep|means|mean|honors|honour|inherits|inherit)\s+(.+)$/i);
    if (predicateMatch?.[1]) return predicateMatch[1].trim();

    return normalized;
  }

  function buildPodcastInterpretiveAnswerOptions(primaryText = '', options = {}) {
    const {
      movie = '',
      lead = '',
      ref = '',
      focus = '',
      longForm = false
    } = options;
    const ctx = getFilmContext(movie || voiceManager?.currentMovie || '');
    const sentenceCase = (value = '') => {
      const normalized = String(value || '').trim();
      return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : '';
    };
    const fragment = summarizeForPodcast(
      extractPodcastAnswerFragment(primaryText),
      longForm ? 18 : 12
    )
      .replace(/[.?!]+$/g, '')
      .trim();
    const lowerFragment = fragment ? `${fragment.charAt(0).toLowerCase()}${fragment.slice(1)}` : '';
    const naturalFocus = focus === 'character'
      ? 'self'
      : focus === 'philosophy'
        ? 'idea'
        : focus === 'language'
          ? 'voice'
          : focus === 'audio'
            ? 'sound'
            : focus === 'visual'
              ? 'frame'
              : focus === 'reference'
                ? 'lineage'
                : focus === 'symbol'
                  ? 'image'
                  : focus === 'theme'
                    ? 'mood'
                    : String(focus || '').trim();
      const leadStart = sentenceCase(lead);
      const refStart = sentenceCase(ref);
      const worldStart = sentenceCase(ctx?.world || '');
      const styleStart = sentenceCase(ctx?.style || '');
      const cleanFragment = lowerFragment
        && !/^(?:because|it|this|that|these|those)\b/i.test(lowerFragment)
        && !/\bruns turns\b/i.test(lowerFragment)
        ? lowerFragment
        : '';

      return [
        focus === 'reference' && refStart ? `${refStart} is doing structural work there, not decorative work.` : '',
        focus === 'reference' ? 'The lineage is holding the scene together from inside the frame.' : '',
        focus === 'theme' ? 'The mood is carrying the argument before the plot can name it.' : '',
        focus === 'audio' ? 'The sound keeps the same pressure alive that the image is already building.' : '',
        focus === 'visual' ? 'The frame is carrying more meaning than the dialogue can hold.' : '',
        focus === 'symbol' && leadStart ? `${leadStart} keeps returning like the film\'s way of thinking.` : '',
        focus === 'language' ? 'The film is speaking in compressed fragments instead of explanation.' : '',
        focus === 'philosophy' ? 'The idea arrives as pressure first and explanation second.' : '',
        leadStart ? `${leadStart} is doing more structural work than the scene first admits.` : '',
        refStart ? `${refStart} sits in the image like pressure, not citation.` : '',
        naturalFocus ? `The ${naturalFocus} is carrying the emotional architecture there.` : '',
        ctx?.persona ? `The ${ctx.persona} feels shaped by the image rather than merely described by it.` : '',
        worldStart ? `${worldStart} keeps answering back through the frame.` : '',
        styleStart ? `${styleStart} is doing more than atmosphere there.` : '',
        cleanFragment && naturalFocus ? `The ${naturalFocus} keeps tightening around ${cleanFragment}.` : '',
        cleanFragment ? `The scene keeps folding itself around ${cleanFragment}.` : ''
      ].filter(Boolean);
  }

  function buildPodcastHostAnswerLines(primaryText = '', options = {}) {
    const {
      seed = '',
      movie = '',
      lead = '',
      ref = '',
      focus = '',
      allowTwoStep = false,
      longForm = false,
      avoidDirectEcho = false
    } = options;
    const ctx = getFilmContext(movie || voiceManager?.currentMovie || '');
    const sentenceCase = (value = '') => {
      const normalized = String(value || '').trim();
      return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : '';
    };
    const naturalFocus = focus === 'character'
      ? 'self'
      : focus === 'philosophy'
        ? 'idea'
        : focus === 'language'
          ? 'voice'
          : focus === 'audio'
            ? 'sound'
            : focus === 'visual'
              ? 'frame'
              : focus === 'reference'
                ? 'lineage'
                : focus === 'symbol'
                  ? 'image'
                  : focus === 'theme'
                    ? 'mood'
                    : focus;
    const leadStart = sentenceCase(lead);
    const refStart = sentenceCase(ref);
    const primaryLine = summarizeForPodcast(primaryText || 'The film responds in fragments, but the memory is still being formed.', longForm ? 54 : 36);
    const interpretivePrimaryOptions = avoidDirectEcho
      ? buildPodcastInterpretiveAnswerOptions(primaryText, { movie, lead, ref, focus, longForm })
      : [];
    const recentAnswerBlocklist = new Set([
      String(lastPodcastHostAnswerLine || '').trim(),
      ...recentPodcastHostAnswerLines.map((line) => String(line || '').trim())
    ].filter(Boolean));
    const primaryIsFresh = !avoidDirectEcho && !!primaryLine && !recentAnswerBlocklist.has(primaryLine);
    const primaryFallbackOptions = [
      ...interpretivePrimaryOptions,
      ...(ctx?.observations || []),
      leadStart ? `${leadStart} keeps returning like the frame does not want to release it.` : '',
      refStart ? `${refStart} keeps shadowing the mood from the edge of the frame.` : '',
      naturalFocus ? `The ${naturalFocus} keeps turning into a pressure the film cannot leave alone.` : ''
    ].filter(Boolean);
    const chosenPrimary = primaryIsFresh
      ? primaryLine
      : pickPodcastHostAnswerLine(primaryFallbackOptions, `${seed}|answer-primary`, { avoid: [primaryLine] })
        || primaryFallbackOptions[0]
        || primaryLine
        || '';
    const lines = chosenPrimary ? [chosenPrimary] : [];

    if (chosenPrimary) {
      lastPodcastHostAnswerLine = chosenPrimary;
      recentPodcastHostAnswerLines = rememberRecentPodcastLine(recentPodcastHostAnswerLines, chosenPrimary);
    }

    if (allowTwoStep) {
      const secondaryOptions = [
        ...(ctx?.observations || []).filter((line) => line !== chosenPrimary),
        lead ? `${lead} stops feeling decorative there and starts feeling structural.` : '',
        ref ? `It makes ${ref} feel less like a reference and more like a wound in the image.` : '',
        ctx?.persona ? `The ${ctx.persona} feels less like a mask there and more like a defense.` : '',
        ctx?.world ? `${ctx.world} seems to answer back as if the setting has its own memory.` : '',
        'The image keeps shifting from atmosphere into evidence.',
        'It makes the whole frame feel like a confession that the film cannot finish.'
      ].filter(Boolean);
      const secondaryLine = pickPodcastHostAnswerLine(secondaryOptions, `${seed}|answer-secondary`, { avoid: [chosenPrimary] });
      if (secondaryLine) lines.push(secondaryLine);
    }

    return lines;
  }

  function buildPodcastBatchLines(batchNumber, items = [], movie = '', options = {}) {
    const {
      preferQuestionMode = false,
      preferObservationMode = false,
      forceShortForm = false,
      guestPrompt = '',
      guestReply = '',
      trainingEngine = ''
    } = options;
    const museName = getPodcastMuseName();
    const candidatePool = Array.isArray(items)
      ? items.filter((item) => String(item?.input || '').trim() || String(item?.response || '').trim())
      : [];
    const candidateIndex = candidatePool.length > 1
      ? hashPromptSeed(`${batchNumber}|${movie}|${candidatePool.map((item) => `${item?.focus || ''}|${item?.input || ''}`).join('||')}`) % candidatePool.length
      : 0;
    const candidate = candidatePool[candidateIndex] || candidatePool[0] || items[0] || {};
    const focus = String(candidate?.focus || 'theme');
    const ctx = getFilmContext(movie);
    const batchTrainingEngine = String(candidate?.trainingEngine || trainingEngine || '').trim().toLowerCase();
    const automaticTrainingNarration = Boolean(batchTrainingEngine) && !guestPrompt && !guestReply;
    const guestSeedItems = (guestPrompt || guestReply)
      ? [{ input: guestPrompt, response: guestReply, focus }]
      : [];
    const keywords = collectPodcastKeywords([...(Array.isArray(items) ? items : []), ...guestSeedItems], movie);
    const favorObservationMode = preferObservationMode && batchNumber > 2;
    const longFormExchange = forceShortForm ? false : favorObservationMode ? false : shouldUseLongPodcastExchange(batchNumber);
    const avoidTrainingEcho = automaticTrainingNarration;
    const question = summarizePodcastQuestion(
      candidate?.input || 'What does this world reveal about itself?',
      longFormExchange ? 34 : 22,
      'What does this world reveal about itself?'
    );
    const simplifiedQuestion = simplifyPodcastQuestion(candidate?.input || question, question);
    const answer = summarizeForPodcast(
      extractPrimaryBrainReply(candidate?.response || 'The film responds in fragments, but the memory is still being formed.'),
      longFormExchange ? 54 : 36
    );
    const baseSeed = `${batchNumber}|${focus}|${question}|${movie}`;
    const keywordPool = keywords.length ? keywords : [];
    const lead = pickPromptVariant(keywordPool, `${baseSeed}|lead`) || focus;
    const refPool = [...new Set([
      ...keywordPool.filter((item) => item !== lead),
      ...((ctx?.refs || []).filter((item) => item !== lead))
    ])];
    const ref = pickPromptVariant(refPool, `${baseSeed}|ref`) || '';
    const persona = ctx?.persona || '';
    const world = ctx?.world || '';
    const styleHint = ctx?.style || '';
    const ctxAnchorList = ctx?.anchors || [];
    const anchor = ctxAnchorList.length
      ? ctxAnchorList[Math.abs(hashPromptSeed(`${batchNumber}${lead}`) % ctxAnchorList.length)]
      : '';
    const seed = `${baseSeed}|${lead}|${ref}`;

    const longQuestionOptions = [
      lead && world ? `When the film keeps circling ${lead}, it starts to feel like the way ${world} remembers itself rather than just a detail in the frame. What do you think it opens up?` : '',
      ref && lead ? `There is something tense in the way ${lead} and ${ref} sit together there, almost like the image is arguing with itself. If you stay with that tension, what becomes visible?` : '',
      persona ? `The ${persona} feels less composed there, almost as if the image is speaking before the character can. What do you hear in that shift?` : '',
      styleHint ? `The scene lets ${styleHint} do a lot of the emotional work there instead of the dialogue. What changes for you when you follow that?` : '',
      anchor ? `The frame keeps giving ${anchor} more weight than it should have on paper. Why do you think the film needs it so badly there?` : ''
    ].filter(Boolean);

    // Prefer statements over echoed questions for most non-opening batches.
    const observations = [
      ...(ctx?.observations || []),
      ...(persona && lead ? [`${persona} keeps circling ${lead}.`] : []),
      ...(world ? [`Inside ${world}, the pressure is shifting.`] : []),
      ...(styleHint ? [`${styleHint} is carrying the tone.`] : []),
      ...(anchor ? [`${anchor} is doing more than the dialogue.`] : []),
      ...(ref ? [`Let ${ref} stay in the room.`] : []),
      `${lead} is carrying this pass.`,
      `The ${focus} is sharpening now.`
    ];
    const useObservation = observations.length > 0
      && (avoidTrainingEcho || batchNumber > 1)
      && !longFormExchange
      && !preferQuestionMode
      && (favorObservationMode || avoidTrainingEcho || !candidate?.input || (hashPromptSeed(seed) % 4 !== 3));
    if (useObservation) {
      const hostAObservation = pickPodcastHostPromptLine(observations, `${seed}|obs`) || observations[0] || `${lead} is carrying this pass.`;
      return [
        {
          speaker: 'hostA',
          text: hostAObservation
        },
        ...buildPodcastHostAnswerLines(answer, {
          seed: `${seed}|observation-answer`,
          movie,
          lead,
          ref,
          focus,
          avoidDirectEcho: avoidTrainingEcho,
          allowTwoStep: false,
          longForm: false
        }).map((text) => ({ speaker: 'hostB', text }))
      ];
    }

    const contextualQuestionOptions = [
      ...(longFormExchange ? longQuestionOptions : []),
      lead ? `What is ${lead} doing to the mood there?` : '',
      lead ? `Why does ${lead} feel so loaded in that moment?` : '',
      persona ? `What is the ${persona} trying not to say there?` : '',
      world ? `How is ${world} shaping that scene?` : '',
      ref ? `What changes once ${ref} starts shadowing the frame?` : '',
      'Where does the emotion really land for you there?',
      'What is the film quietly admitting in that moment?',
      'What is the frame doing that the dialogue never could?',
      anchor ? `Why does ${anchor} feel more important than the scene first lets on?` : ''
    ].filter(Boolean);

    const hostAOptions = batchNumber === 1
      ? preferQuestionMode
        ? (avoidTrainingEcho
            ? [
                lead ? `${museName}, what is ${lead} doing to the feeling of the scene?` : '',
                persona ? `${museName}, how are you reading the ${persona} in that moment?` : '',
                world ? `${museName}, what does ${world} add to that moment?` : ''
              ].filter(Boolean)
            : [
                `${museName}, ${simplifiedQuestion}`
              ])
        : [
            ...(avoidTrainingEcho ? [] : [`${museName}, ${simplifiedQuestion}`]),
            lead ? `${museName}, what is ${lead} doing to the feeling of the scene?` : '',
            persona ? `${museName}, how are you reading the ${persona} in that moment?` : '',
            world ? `${museName}, what does ${world} add to that moment?` : '',
            ...(longFormExchange ? longQuestionOptions : [])
          ]
      : preferQuestionMode
        ? [
            ...contextualQuestionOptions,
            ...(avoidTrainingEcho ? [] : [
              `${simplifiedQuestion}`,
              `${museName}, ${simplifiedQuestion}`,
              'What is the film quietly admitting in that moment?',
              'What is the frame doing that the dialogue never could?',
              anchor ? `Why does ${anchor} feel more important than the scene first lets on?` : ''
            ])
          ]
        : [
            ...(longFormExchange ? longQuestionOptions : []),
            ...(avoidTrainingEcho ? [] : [`${simplifiedQuestion}`, `${museName}, ${simplifiedQuestion}`]),
            ...contextualQuestionOptions
          ];
    const hostALine = pickPodcastHostPromptLine(hostAOptions, seed) || `${museName}, let me start with ${lead}. ${question}`;
    const followUpOptions = [
      ref ? `And when ${ref} touches the scene, does it make the feeling colder or more intimate?` : '',
      lead ? `And why does ${lead} feel like the thing the film cannot stop worrying?` : '',
      persona ? `And does that leave the ${persona} more exposed, or more protected?` : '',
      world ? `And what does that pressure tell you about how ${world} treats the people inside it?` : '',
      `And what keeps that moment from settling into something simpler?`,
      `And what is the frame still holding back from us?`
    ].filter(Boolean);
    const includeSecondHostALine = batchNumber > 1 && longFormExchange;
    const secondHostALine = includeSecondHostALine
      ? pickPodcastHostPromptLine(followUpOptions, `${seed}|follow-up`, { avoid: [hostALine] })
      : '';
    const hostBLines = buildPodcastHostAnswerLines(answer, {
      seed: `${seed}|host-b`,
      movie,
      lead,
      ref,
      focus,
      avoidDirectEcho: avoidTrainingEcho,
      allowTwoStep: longFormExchange,
      longForm: longFormExchange
    });
    return [
      {
        speaker: 'hostA',
        text: hostALine
      },
      ...(secondHostALine ? [{ speaker: 'hostA', text: secondHostALine }] : []),
      ...hostBLines.map((text) => ({ speaker: 'hostB', text }))
    ];
  }

  function buildPodcastIntroLines(movie = '', minutes = 5, options = {}) {
    const museName = getPodcastMuseName();
    const filmTitle = formatMovieTitleForPodcast(movie || voiceManager?.currentMovie || '');
    const safeMinutes = Math.max(0.25, Number(minutes || 5));
    const engine = String(options?.engine || 'cloud').toLowerCase();
    const modelLabel = String(options?.model || '').trim() || 'the local brain';
    const introText = engine === 'local'
      ? `Training on ${filmTitle} for ${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}. ${modelLabel} is shaping the archive live.`
      : `Training on ${filmTitle} for ${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}. The cloud leads and the local brain learns live.`;
    const museText = engine === 'local'
      ? `I am here. ${modelLabel} is shaping the archive now. Interrupt anytime.`
      : `${museName} is here. Interrupt anytime.`;
    return [];
  }

  function normalizeDictBackupText(text = '') {
    return String(text || '').replace(/template backup/gi, 'DICT backup');
  }

  function buildPodcastFailureLines(batchNumber, reason = '') {
    const normalizedReason = String(reason || 'cloud-error').replace(/-/g, ' ').trim();
    const prettyReason = /cloud error/i.test(normalizedReason)
      ? 'Cloud slipped'
      : /local model error|local unavailable/i.test(normalizedReason)
        ? 'Local slipped'
        : normalizedReason
          ? `${normalizedReason.charAt(0).toUpperCase()}${normalizedReason.slice(1)}`
          : 'The session slipped';
    return [
      {
        speaker: 'hostA',
        text: `${prettyReason} on batch ${batchNumber}. Keep going.`
      }
    ];
  }

  function buildPodcastSummaryLines(report) {
    const museName = getPodcastMuseName();
    const totalPairs = Number(report?.added || 0) + Number(report?.updated || 0);
      const pairLabel = `memory pair${totalPairs === 1 ? '' : 's'}`;
      const beforeCount = Math.max(0, Number(report?.beforeCount || 0));
      const afterCount = Math.max(0, Number(report?.afterCount || 0));
      const netChange = afterCount - beforeCount;
      const netSummary = Number.isFinite(netChange) && netChange !== totalPairs
        ? ` Net ${netChange >= 0 ? '+' : ''}${netChange} retained.`
        : '';
      const summaryLead = report?.trainingEngine === 'template'
        ? `Session closed. DICT saved or refreshed ${totalPairs} ${pairLabel}.${netSummary}`
        : `Session closed. Saved or refreshed ${totalPairs} ${pairLabel}.${netSummary}`;
    return [
      {
        speaker: 'hostA',
        text: summaryLead
      },
      {
        speaker: 'hostB',
        text: 'I will remember more next time.'
      }
    ];
  }

  function rememberDictSavedTrainingEntry(progress = {}) {
    if (!activeTrainingSessionMetrics) return [];
    const input = String(progress?.input || '').trim();
    const response = String(progress?.response || '').trim();
    if (!input || !response) {
      return Array.isArray(activeTrainingSessionMetrics.dictSavedEntries)
        ? activeTrainingSessionMetrics.dictSavedEntries
        : [];
    }

    const currentEntries = Array.isArray(activeTrainingSessionMetrics.dictSavedEntries)
      ? activeTrainingSessionMetrics.dictSavedEntries
      : [];
    const nextEntry = {
      movie: String(progress?.movie || voiceManager?.currentMovie || '').trim(),
      input,
      response,
      action: progress?.action === 'updated' ? 'updated' : 'added',
      batchNumber: Math.max(0, Number(progress?.batchNumber || 0))
    };
    const deduped = [nextEntry, ...currentEntries].filter((entry, index, array) => {
      const key = `${entry.movie}|${entry.input}|${entry.response}`;
      return array.findIndex((candidate) => `${candidate.movie}|${candidate.input}|${candidate.response}` === key) === index;
    });
    activeTrainingSessionMetrics.dictSavedEntries = deduped.slice(0, 10);
    recordDictSavedSnapshot(nextEntry);
    return activeTrainingSessionMetrics.dictSavedEntries;
  }

  function buildDictSavedReportLines(entries = [], options = {}) {
    const maxEntries = Math.max(1, Number(options?.maxEntries || 5));
    const savedEntries = Array.isArray(entries)
      ? entries
        .map((entry) => ({
          movie: formatMovieTitleForPodcast(entry?.movie || voiceManager?.currentMovie || ''),
          input: String(entry?.input || '').trim(),
          response: String(entry?.response || '').trim(),
          action: entry?.action === 'updated' ? 'updated' : 'added'
        }))
        .filter((entry) => entry.input && entry.response)
      : [];
    const visibleEntries = savedEntries.slice(0, maxEntries);
    const lines = visibleEntries.map((entry, index) => `DICT ${entry.action} ${index + 1} · ${entry.movie} · ${entry.input} -> ${entry.response}`);
    if (savedEntries.length > visibleEntries.length) {
      const remaining = savedEntries.length - visibleEntries.length;
      lines.push(`DICT more · ${remaining} additional pair${remaining === 1 ? '' : 's'} in this session.`);
    }
    return lines;
  }

  function getTrainingDashboardMemoryCount(progress = {}) {
    const added = Math.max(0, Number(progress?.added || 0));
    const updated = Math.max(0, Number(progress?.updated || 0));
    if (added || updated) return added + updated;
    return Array.isArray(activeTrainingSessionMetrics?.dictSavedEntries)
      ? activeTrainingSessionMetrics.dictSavedEntries.length
      : 0;
  }

  function announcePodcastGuestMicCue() {
    if (!brainTrainingInFlight || !podcastTrainingEnabled || podcastGuestReplyInFlight) return;
    const now = Date.now();
    if ((now - lastPodcastGuestMicAckAt) < PODCAST_GUEST_MIC_ACK_COOLDOWN_MS) return;
    lastPodcastGuestMicAckAt = now;
    showAiSpeech('Listening...', false);
  }

  async function startPodcastGuestMicWithHostCue(options = {}) {
    if (!voiceManager || !isPodcastGuestParticipationEnabled() || podcastGuestReplyInFlight) {
      return false;
    }

    const requestAt = Number(options?.requestAt || 0);
    const manualRequestAt = Math.max(requestAt, Number(lastPodcastGuestMicManualRequestAt || 0));
    if (!manualRequestAt || (Date.now() - manualRequestAt) > 1500) {
      return false;
    }
    lastPodcastGuestMicManualRequestAt = 0;

    const now = Date.now();
    let cueText = '';
    if (!podcastGuestIntroAnnounced && (now - lastPodcastGuestMicAckAt) >= PODCAST_GUEST_MIC_ACK_COOLDOWN_MS) {
      podcastGuestIntroAnnounced = true;
      lastPodcastGuestMicAckAt = now;
    }

    clearPublicPodcastAiContinueTimer();
    clearPendingPodcastNarration({ cancelActive: true });
    if (podcastEngine) {
      podcastEngine.isSpeaking = false;
    }
    pausePodcastForGuestFloor();
    syncTrainingPushToTalkMode();

    if (cueText) {
      appendChatMessage('assistant', `Host A · ${cueText}`);
      const hostAProfile = pickPodcastVoiceProfiles()?.hostA || {};
      showAiSpeech(cueText, true);
      await new Promise((resolve) => {
        voiceManager.speak(cueText, {
          context: 'guest-cue',
          speaker: 'hostA',
          voice: hostAProfile.voice || null,
          pitch: Number.isFinite(hostAProfile.pitch) ? hostAProfile.pitch : undefined,
          rate: Number.isFinite(hostAProfile.rate) ? hostAProfile.rate : undefined,
          onEnd: resolve
        });
      });
    }
    await new Promise((resolve) => setTimeout(resolve, cueText ? MIC_START_DELAY_MS : 0));
    isVoiceSessionActive = true;
    disableAntiGravityForMic();

    if (btnVoiceMic) {
      btnVoiceMic.classList.add('listening');
      safeSetText(btnVoiceMic.querySelector('.btn-label'), 'Starting mic...');
    }

    let toggled;
    if (selectedConversationSurfaceMode === 'podcast') {
      toggled = await voiceManager.startListening?.({ timeoutMs: PODCAST_GUEST_MIC_WINDOW_MS });
    } else {
      toggled = await (voiceManager.startListening?.() ?? voiceManager.toggleListening());
    }

    if (!toggled) {
      if (!voiceManager._isBrave) {
        showAiSpeech('Could not start microphone. Check browser permissions (click ?? in address bar ? allow mic).', false);
      }
      isVoiceSessionActive = false;
      podcastGuestFloorActive = false;
      if (podcastEngine) {
        podcastEngine.guestFloorActive = false;
      }
      if (btnVoiceMic) {
        btnVoiceMic.classList.remove('listening');
        safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
      }
      resetPodcastGuestCueState();
      return false;
    }

    return true;
  }

  function buildPodcastBrainCheckLines(exams = [], item = {}) {
    const validExams = Array.isArray(exams) ? exams.filter((exam) => exam?.response) : [];
    if (!validExams.length) return [];

    const averageScore = Math.round(validExams.reduce((sum, exam) => sum + Number(exam.score || 0), 0) / validExams.length);
    const reflection = averageScore >= 85
      ? 'That holds now.'
      : averageScore >= 72
        ? 'You can hear it settling.'
        : averageScore >= 58
          ? 'It is forming, still moving.'
          : 'Close, but still slipping.';

    const recallExam = validExams.find((exam) => exam?.examKind !== 'abstraction') || validExams[0];
    return [
      {
        speaker: 'hostA',
        text: simplifyPodcastQuestion(recallExam?.input || item?.input || 'What remains in the local brain?', 'What remains in the local brain?')
      },
      {
        speaker: 'hostB',
        text: summarizeForPodcast(extractPrimaryBrainReply(recallExam?.response, 'The local brain is still forming around that question.'), 24)
      },
      {
        speaker: 'hostA',
        text: reflection
      }
    ];
  }

  function buildBrainExamQuestion(input = '', batchNumber = 1, variant = 0) {
    const raw = String(input || '').trim();
    if (!raw) {
      return {
        text: variant === 0 ? 'What remains of that in your own mind now?' : 'What does that reveal about the way you understand it now?',
        kind: variant === 0 ? 'recall' : 'abstraction'
      };
    }

    const normalized = raw.replace(/\?+$/g, '').trim();
    const recallLeadInSets = [
      ['Tell me this', 'what remains there most clearly'],
      ['Stay with that for a moment', 'what detail stays with you'],
      ['So tell me', 'what holds that together'],
      ['And when you sit with that', 'what shape does it take'],
      ['Let me come at it differently', 'what truth is hiding there'],
      ['Keep the memory close', 'what refuses to fall away'],
      ['Walk me back into it', 'what survives first'],
      ['Hold there a second', 'what stays brightest'],
      ['Return to the exact pressure', 'what remains fixed'],
      ['Give me the clearest shard', 'what still lands intact'],
      ['Stay inside that line', 'what persists when the rest drops out'],
      ['Take me to the core of it', 'what you cannot shake loose']
    ];
    const abstractionLeadInSets = [
      ['Let me ask beneath that', 'what does that reveal about the way you see this world'],
      ['Push past the surface for me', 'what meaning forms underneath that memory'],
      ['Turn that into interpretation', 'what does it say about your deeper instinct'],
      ['Now abstract it a little', 'what larger truth is hidden inside that answer'],
      ['Move from recall to meaning', 'what does that suggest about your way of longing'],
      ['Take that one step wider', 'what structure is hiding underneath it'],
      ['Translate that into theory for me', 'what claim is it making without saying so'],
      ['Lift it out of the scene a little', 'what pattern does it point toward'],
      ['Read the pressure inside it', 'what worldview is taking shape there'],
      ['Make the leap from image to argument', 'what idea is carrying that answer'],
      ['Push it into a larger frame', 'what does that imply about the world around you'],
      ['Turn memory into meaning here', 'what truth is it circling without naming']
    ];
    const clampedVariant = Math.min(Math.max(0, Number(variant || 0)), 1);
    if (clampedVariant === 1) {
      const abstractionPrompt = pickPromptVariant(
        abstractionLeadInSets,
        `${normalized}|${batchNumber}|abstraction`
      ) || abstractionLeadInSets[0];
      const lead = abstractionPrompt[0] || 'Let me ask beneath that';
      const tail = abstractionPrompt[1] || 'what does that reveal about the way you understand it now';
      const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);
      return {
        text: `${lead} · if ${lowered}, then ${tail}?`,
        kind: 'abstraction'
      };
    }

    const prompt = pickPromptVariant(
      recallLeadInSets,
      `${normalized}|${batchNumber}|recall`
    ) || recallLeadInSets[0];
    const lead = prompt[0] || 'Tell me this';
    const tail = prompt[1] || 'what remains there now';
    const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);
    return {
      text: `${lead} · ${lowered}? ${tail}?`,
      kind: 'recall'
    };
  }

  function collectDashboardBrainCheckItems(values = [], limit = 4) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [values])
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((value) => {
        const key = value.replace(/[.!?]+$/g, '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(1, Number(limit || 1)));
  }

  function buildDashboardBrainCheckCandidates(movie = '') {
    const movieKey = getDashboardMovieKey(movie);
    const title = formatMovieTitleForPodcast(movieKey) || 'this movie';
    const brain = movieKey === String(voiceManager?.currentMovie || '').trim()
      ? (voiceManager?.currentMovieBrain || resolveMovieBrain(movieKey))
      : resolveMovieBrain(movieKey);
    const trainingSeeds = (brain?.trainingSeeds && typeof brain.trainingSeeds === 'object') ? brain.trainingSeeds : {};
    const refs = collectDashboardBrainCheckItems(trainingSeeds.references, 4);
    const symbols = collectDashboardBrainCheckItems(trainingSeeds.symbols, 5);
    const story = collectDashboardBrainCheckItems(trainingSeeds.story, 3);
    const candidates = [];

    if (refs.length) {
      candidates.push({
        input: `Which references most directly shape ${title}?`,
        response: refs.slice(0, 3).join(', ')
      });
    }

    if (symbols.length) {
      candidates.push({
        input: `Which image or object does ${title} keep returning to?`,
        response: symbols.slice(0, 3).join(', ')
      });
    }

    if (story.length) {
      candidates.push({
        input: `What pressure or conflict matters most in ${title}?`,
        response: story.slice(0, 2).join(' ')
      });
    }

    if (!candidates.length) {
      candidates.push({
        input: `What remains in ${title} now?`,
        response: ''
      });
    }

    return candidates.slice(0, 3);
  }

  function summarizeBrainCheckExams(exams = []) {
    const validExams = Array.isArray(exams) ? exams.filter((exam) => exam?.response) : [];
    if (!validExams.length) return null;

    const score = Math.round(validExams.reduce((sum, exam) => sum + Number(exam.score || 0), 0) / validExams.length);
    const rank = score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';
    const source = validExams
      .map((exam) => exam.sourceLabel)
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(' + ');
    const insight = validExams
      .map((exam) => exam.insight)
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(' + ');

    return {
      exams: validExams,
      score,
      rank,
      source,
      insight,
      level: validExams[0]?.level || 'L1'
    };
  }

  async function runDashboardBrainCheck(details = {}) {
    if (!voiceManager?.examineBrainCheckpoint) {
      return { ok: false, message: 'Brain check is unavailable in this session.' };
    }

    const requestedMovie = getDashboardMovieKey(details?.movie?.movie || details?.movie || voiceManager?.currentMovie || '');
    const currentMovieKey = getDashboardMovieKey(voiceManager?.currentMovie || '');
    if (!requestedMovie) {
      return { ok: false, message: 'Load a movie before running a brain check.' };
    }
    if (!currentMovieKey || requestedMovie !== currentMovieKey) {
      return { ok: false, message: 'Load that movie on screen before running a live brain check.' };
    }

    const candidates = buildDashboardBrainCheckCandidates(requestedMovie);
    if (!candidates.length) {
      return { ok: false, message: 'No stored seeds are available for this movie yet.' };
    }

    const restoreMode = voiceManager.getPreferredMode?.() || 'cloud';
    voiceManager.setPreferredMode?.('brain');
    _modeDetailsState.engine = 'brain-check';
    setAiModeIndicator('brain');

    try {
      const exams = [];
      candidates.forEach((candidate, candidateIndex) => {
        [0, 1].forEach((variant) => {
          const previousExam = exams[exams.length - 1] || null;
          const probe = buildBrainExamQuestion(candidate.input, candidateIndex + 1, variant);
          const exam = voiceManager.examineBrainCheckpoint(candidate.input, candidate.response, {
            allowHot: false,
            probeInput: probe?.text,
            examKind: probe?.kind || 'recall',
            avoidMatchedInput: previousExam?.matchedInput,
            avoidResponse: previousExam?.response
          });
          if (exam?.response) exams.push(exam);
        });
      });

      const summary = summarizeBrainCheckExams(exams);
      if (!summary) {
        return { ok: false, message: 'No exam answers landed from the current movie brain.' };
      }

      if (activeTrainingSessionMetrics) {
        activeTrainingSessionMetrics.brainChecks.push({
          score: summary.score,
          rank: summary.rank,
          level: summary.level,
          source: summary.source
        });
      }

      recordBrainCheckSnapshot({
        movie: requestedMovie,
        score: summary.score,
        level: summary.level,
        source: summary.source
      });

      const combinedInput = summary.exams.map((exam) => exam.input).join(' / ');
      const combinedOutput = summary.exams.map((exam, index) => `A${index + 1}: ${exam.response}`).join(' || ');
      voiceManager.onAiLog?.({
        engine: 'brain-reply',
        model: voiceManager?.getLocalBrainModelName?.() || dashboardTrainingRuntime?.fallbackModel || 'gemma4:latest',
        movie: requestedMovie,
        input: combinedInput,
        output: combinedOutput,
        ms: 1,
        memories: summary.exams.reduce((sum, exam) => sum + Number(exam.memoryCount || 0), 0),
        level: summary.level,
        intent: summary.exams[0]?.intent,
        training: false,
        focus: 'exam',
        action: 'dashboard',
        rank: summary.rank,
        score: summary.score,
        examSource: summary.source,
        artRef: false,
        vision: false,
        audio: false
      });

      refreshTrainingDashboardStats();
      return {
        ok: true,
        movie: requestedMovie,
        score: summary.score,
        rank: summary.rank,
        source: summary.source,
        insight: summary.insight,
        message: `Brain check scored ${summary.score} (${summary.rank}) from ${summary.source || 'local recall'}.`
      };
    } catch (error) {
      console.warn('[Dashboard] Brain check failed:', error);
      return { ok: false, message: String(error?.message || 'Brain check failed.') };
    } finally {
      voiceManager.setPreferredMode?.(restoreMode);
      _modeDetailsState.engine = restoreMode;
      setAiModeIndicator(restoreMode);
    }
  }

  function estimatePodcastWindowMs(lines = []) {
    const totalWords = lines
      .map((line) => String(line?.text || '').trim().split(/\s+/).filter(Boolean).length)
      .reduce((sum, count) => sum + count, 0);
    return Math.max(2600, Math.round(totalWords * 320) + 900);
  }

  function getPodcastGuestResumeDelay(answerLines = []) {
    return estimatePodcastWindowMs(answerLines) + PODCAST_GUEST_RESUME_DELAY_MS;
  }

  function rememberTrainingGuestDirective(input = '', response = '', source = 'mic') {
    const prompt = String(input || '').trim();
    const reply = String(response || '').trim();
    if (!prompt || !reply) return false;

    const shouldPersist = typeof voiceManager?.shouldPersistTrainingGuestDirective === 'function'
      ? voiceManager.shouldPersistTrainingGuestDirective(prompt)
      : true;
    if (!shouldPersist) return false;

    const nextDirective = {
      input: prompt,
      response: reply,
      source,
      at: Date.now(),
      usesRemaining: 2  // steers 2 scheduled podcast turns after guest speaks
    };

    // Persist guest Q&A into brainMemory so future podcast sessions can recall it
    const guestMovie = String(voiceManager?.currentMovie || '').trim();
    if (guestMovie) {
      saveMemory(guestMovie, prompt, reply);
    }

    if (!activeTrainingSessionMetrics) {
      if (isPublicPodcastStageParticipationReady()) {
        publicPodcastGuestDirective = nextDirective;
        return true;
      }
      return false;
    }

    const directives = Array.isArray(activeTrainingSessionMetrics.guestDirectives)
      ? activeTrainingSessionMetrics.guestDirectives
      : [];
    directives.unshift(nextDirective);
    activeTrainingSessionMetrics.guestDirectives = directives.slice(0, 4);
    activeTrainingSessionMetrics.lastGuestDirective = prompt;
    return true;
  }

  async function handlePodcastGuestPrompt(text = '', options = {}) {
    const normalized = String(text || '').trim();
    const guestTrainingActive = brainTrainingInFlight && podcastTrainingEnabled;
    const recognitionMeta = options?.recognitionMeta && typeof options.recognitionMeta === 'object' ? options.recognitionMeta : {};
    if (!normalized || !isPodcastGuestParticipationEnabled() || !voiceManager?.examineBrainCheckpoint) {
      return false;
    }
    clearPodcastGuestMicAutoStopTimer();
    syncTrainingPushToTalkMode();
    const softResumeCue = isPodcastSoftResumeCue(normalized);
    if (podcastGuestReplyInFlight) {
      if (softResumeCue) {
        return true;
      }
      appendChatMessage('assistant', 'Podcast guest channel is busy · try again in a moment.');
      return true;
    }

    podcastGuestReplyInFlight = true;
  updatePublicPodcastAiButtonState();
    const startedAt = performance.now();
    const source = options?.source === 'chat' ? 'chat' : 'mic';
    pausePodcastForGuestFloor();

    try {
      if (!options?.skipUserEcho) {
        appendChatMessage('user', normalized);
      }
      if (softResumeCue) {
        clearPodcastGuestPromptUi(source);
        podcastGuestFloorActive = false;
        podcastEngine.guestFloorActive = false;
        const resumeDelay = isPassiveFreeChatAcknowledgement(normalized)
          ? (isMobile ? 1200 : 850)
          : (isMobile ? 700 : 450);
        schedulePublicPodcastAiContinue(resumeDelay);
        return true;
      }
      const selectedPodcastMode = getPodcastReplyMode();
      flashAiModeBadge(selectedPodcastMode === 'cloud' ? 'cloud' : 'brain');
      flashAiModePills(selectedPodcastMode === 'cloud' ? 'cloud' : selectedPodcastMode === 'gemma' ? 'gemma' : 'brain');
      _modeDetailsState.engine = 'brain-reply';
      refreshAiModeBadge(voiceManager?.getPreferredMode?.() || 'brain');
      renderModeDetails();

      if (isPodcastResumeCue(normalized)) {
        const resumeLines = buildPodcastResumeLines({ lastSpeaker: 'hostB', prompt: normalized, forceReturn: true });
        voiceManager.onAiLog?.({
          engine: 'brain-reply',
          model: voiceManager?.getLocalBrainModelName?.() || dashboardTrainingRuntime?.fallbackModel || 'gemma4:latest',
          movie: voiceManager?.currentMovie,
          input: normalized,
          output: resumeLines.map((line) => `${line.speaker}:${line.text}`).join(' || '),
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: 0,
          level: 'HOST',
          intent: 'general',
          training: guestTrainingActive,
          focus: 'guest',
          action: source,
          examSource: 'PODCAST-RESUME',
          rank: '',
          score: null,
          vision: false,
          audio: source === 'mic'
        });
        podcastGuestInterjectionCount = recordPodcastGuestInterjection();
        injectPodcastNarration(resumeLines, { cancelActive: false, prioritize: true, force: true });
        podcastGuestFloorActive = false;
        clearPodcastGuestPromptUi(source);
        setTimeout(() => drainPodcastNarrationQueue(true), 180);
        return true;
      }

      if (isPodcastStatusCue(normalized)) {
        const statusLines = [
          { speaker: 'hostA', text: buildPodcastStatusUpdateLine() },
          ...buildPodcastResumeLines({ lastSpeaker: 'hostA', prompt: normalized })
        ].filter((line) => String(line?.text || '').trim());
        const guestReplyLines = statusLines.slice(0, 1);
        voiceManager.onAiLog?.({
          engine: 'brain-reply',
          model: voiceManager?.getLocalBrainModelName?.() || dashboardTrainingRuntime?.fallbackModel || 'gemma4:latest',
          movie: voiceManager?.currentMovie,
          input: normalized,
          output: statusLines.map((line) => `${line.speaker}:${line.text}`).join(' || '),
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: 0,
          level: 'HOST',
          intent: 'status',
          training: guestTrainingActive,
          focus: 'guest',
          action: source,
          examSource: 'PODCAST-STATUS',
          rank: '',
          score: null,
          vision: false,
          audio: source === 'mic'
        });
        podcastGuestInterjectionCount = recordPodcastGuestInterjection();
        injectPodcastNarration(guestReplyLines, { cancelActive: false, prioritize: true, force: true });
        if (!guestTrainingActive) {
          publicPodcastGuestDirective = null;
        }
        schedulePodcastGuestResume(statusLines.slice(1), { delayMs: getPodcastGuestResumeDelay(guestReplyLines) });
        clearPodcastGuestPromptUi(source);
        setTimeout(() => drainPodcastNarrationQueue(true), 30);
        return true;
      }

      if (isPodcastHostCue(normalized)) {
        const response = buildPodcastHostReturnLine(normalized);
        const guestReplyLines = [
          {
            speaker: 'hostA',
            text: response
          }
        ];
        const resumeLines = buildPodcastResumeLines({ lastSpeaker: 'hostA', prompt: normalized });
        voiceManager.onAiLog?.({
          engine: 'brain-reply',
          model: voiceManager?.getLocalBrainModelName?.() || dashboardTrainingRuntime?.fallbackModel || 'gemma4:latest',
          movie: voiceManager?.currentMovie,
          input: normalized,
          output: response,
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: 0,
          level: 'HOST',
          intent: 'general',
          training: guestTrainingActive,
          focus: 'guest',
          action: source,
          examSource: 'HOST',
          rank: '',
          score: null,
          vision: false,
          audio: source === 'mic'
        });
        podcastGuestInterjectionCount = recordPodcastGuestInterjection();
        injectPodcastNarration(guestReplyLines, { cancelActive: false, prioritize: true, force: true });
        if (!guestTrainingActive) {
          publicPodcastGuestDirective = null;
        }
        schedulePodcastGuestResume(resumeLines, { delayMs: getPodcastGuestResumeDelay(guestReplyLines) });
        clearPodcastGuestPromptUi(source);
        setTimeout(() => drainPodcastNarrationQueue(true), 30);
        return true;
      }

      const handledAsFreeChat = await handlePodcastGuestAsFreeChat(normalized, {
        source,
        allowDuringTraining: guestTrainingActive
      });
      if (handledAsFreeChat) {
        return true;
      }

      const preferredMode = getPodcastReplyMode();
      const weakGuestTranscript = options?.source === 'mic' && isWeakPodcastGuestTranscript(normalized, recognitionMeta);
      const shouldPersistGuestPrompt = typeof voiceManager?.shouldPersistTrainingGuestDirective === 'function'
        ? voiceManager.shouldPersistTrainingGuestDirective(normalized)
        : normalized.split(/\s+/).length >= 3;

      const strictGemmaGuestOnly = guestTrainingActive && preferredMode === 'gemma';
      const isForcedCloud = !strictGemmaGuestOnly
        && (preferredMode === 'cloud' || shouldUseCloudGuestExpansion(normalized) || weakGuestTranscript);
      const utilityReply = (isForcedCloud || strictGemmaGuestOnly) ? null : buildPodcastGuestUtilityReply(normalized);
      if (utilityReply) {
        voiceManager.onAiLog?.({
          engine: 'guest-utility',
          movie: voiceManager?.currentMovie,
          input: normalized,
          output: utilityReply.reply,
          ms: Math.max(1, Math.round(performance.now() - startedAt)),
          memories: 0,
          level: 'HOST',
          intent: utilityReply.intent,
          training: guestTrainingActive,
          focus: 'guest',
          action: source,
          examSource: 'UTILITY',
          rank: '',
          score: null,
          vision: false,
          audio: source === 'mic'
        });
        podcastGuestInterjectionCount = recordPodcastGuestInterjection();
        lastPodcastGuestReplyAt = Date.now();
        clearPendingPodcastNarration({ cancelActive: true });
        const guestReplyLines = [
          {
            speaker: 'hostB',
            text: utilityReply.reply
          }
        ];
        const shouldSteerResume = rememberTrainingGuestDirective(normalized, utilityReply.reply, source);
        const resumeLines = (!guestTrainingActive && shouldSteerResume)
          ? await buildPublicPodcastAiExchangeLines(Math.max(1, podcastGuestInterjectionCount + 1), {
              seedPrompt: normalized,
              seedResponse: utilityReply.reply
            })
          : buildPodcastResumeLines({
              lastSpeaker: 'hostB',
              prompt: shouldSteerResume ? normalized : '',
              guestRecovery: true,
              turnNumber: podcastGuestInterjectionCount
            });
        injectPodcastNarration(guestReplyLines, { cancelActive: false, prioritize: true, force: true });
        // Keep directive alive · it steers the next scheduled podcast turn too
        schedulePodcastGuestResume(resumeLines, { delayMs: getPodcastGuestResumeDelay(guestReplyLines) });
        clearPodcastGuestPromptUi(source);
        setTimeout(() => drainPodcastNarrationQueue(true), 30);
        return true;
      }
      const tryCloudReply = async (examSource = 'CLOUD-EXPAND') => {
        if (typeof voiceManager?.expandGuestPromptWithCloud !== 'function') return null;
        if (voiceManager?.isCloudQuotaBlocked?.()) {
          voiceManager?.onAiLog?.({ engine: 'cloud-quota', input: normalized, output: '[skipped: quota backoff]', ms: 0, audio: false, vision: false });
          return null;
        }
        const cloudExpansion = await voiceManager.expandGuestPromptWithCloud(normalized, {
          timeoutMs: PODCAST_GUEST_CLOUD_EXPANSION_TIMEOUT_MS,
          contextHints: getFilmContext(voiceManager?.currentMovie || '')
        });
        const response = String(cloudExpansion?.text || '').trim();
        if (!response) return null;
        return {
          engineKey: 'cloud',
          response,
          logEntry: {
            engine: 'cloud-train',
            movie: voiceManager?.currentMovie,
            input: normalized,
            output: response,
            ms: Math.max(1, Math.round(performance.now() - startedAt)),
            memories: 0,
            level: 'CLOUD',
            intent: cloudExpansion?.intent || 'general',
            training: guestTrainingActive,
            focus: 'guest',
            action: source,
            examSource,
            rank: '',
            score: null,
            vision: cloudExpansion?.usedFrame === true,
            audio: source === 'mic'
          }
        };
      };
      const getPriorityGuestLocalModels = (tier = 'gemma4') => Array.from(new Set((String(tier || 'gemma4').toLowerCase() === 'gemma3'
        ? ['gemma3:4b']
        : ['gemma4:e2b', 'gemma4', 'gemma4:latest']).filter(Boolean)));
      const tryLocalReply = async ({ candidateModels = null, engineLabel = 'ollama', engineKey = 'brain', examSource = 'LOCAL-FIRST', dictSnippet = '' } = {}) => {
        if (typeof voiceManager?._tryLocalBrainFallback !== 'function') return null;
        const localReply = String(await voiceManager._tryLocalBrainFallback(normalized, {
          prompt: normalized,
          logStart: startedAt,
          timeoutMs: PODCAST_GUEST_LOCAL_REPLY_TIMEOUT_MS,
          candidateModels,
          engineLabel,
          suppressDirectOutput: true,
          suppressLocalFailureState: true,
          deferSideEffects: true,
          dictSnippet
        }) || '').trim();
        if (!localReply || isWeakAdaptiveGuestLocalReply(normalized, localReply)) return null;
        return {
          engineKey,
          response: localReply,
          logEntry: {
            engine: 'ollama',
            model: String(voiceManager?._lastOllamaResolvedModel || candidateModels?.[0] || voiceManager?.getLocalBrainModelName?.() || '').trim(),
            movie: voiceManager?.currentMovie,
            input: normalized,
            output: localReply,
            ms: Math.max(1, Math.round(performance.now() - startedAt)),
            memories: Number(voiceManager?._lastMemoryCount || 0),
            training: guestTrainingActive,
            focus: 'guest',
            action: source,
            examSource,
            vision: false,
            audio: source === 'mic'
          }
        };
      };
      const tryPriorityGuestGemmaReply = async (tier = 'gemma4', { examSource = 'GEMMA-FIRST', dictSnippet = '', engineLabel = 'ollama-forced', engineKey = 'gemma' } = {}) => tryLocalReply({
        candidateModels: getPriorityGuestLocalModels(tier),
        engineLabel,
        engineKey,
        examSource,
        dictSnippet
      });

      let modelReply = null;
      const forceCloud = preferredMode !== 'dict' && (preferredMode === 'cloud' || shouldUseCloudGuestExpansion(normalized));
      
      if (forceCloud) {
        modelReply = await tryCloudReply(preferredMode === 'cloud' ? 'CLOUD-FIRST' : 'CLOUD-FORCED');
      }

      if (!modelReply) {
        if (preferredMode === 'gemma') {
          // Get DICT grounding + cloud snippet to inject into Mini's system prompt
          const dictResult = voiceManager?.examineBrainCheckpoint?.(normalized, '', {
            allowHot: true, probeInput: normalized, examKind: 'recall'
          });
          const dictSnippet = String(dictResult?.response || '').trim();
          const cloudSnippet = String(voiceManager?.personaContext || '').trim();
          const groundingSnippet = dictSnippet
            || (cloudSnippet ? cloudSnippet.split('\n')[0] : '');
          // Race Mini vs threshold so guest never waits 30s for silence
          const miniGuestPromise = tryPriorityGuestGemmaReply('gemma4', {
            engineLabel: 'ollama-forced',
            engineKey: 'gemma',
            examSource: 'GEMMA4-FIRST',
            dictSnippet: groundingSnippet
          });
          modelReply = await Promise.race([
            miniGuestPromise,
            new Promise(res => setTimeout(() => res(null), MINI_RACE_THRESHOLD_GUEST_MS))
          ]);
          if (!modelReply && dictSnippet && !strictGemmaGuestOnly) {
            // Mini too slow · serve DICT immediately and follow up when Mini arrives
            modelReply = {
              engineKey: 'dict',
              response: dictSnippet,
              logEntry: {
                engine: 'dict', movie: voiceManager?.currentMovie, input: normalized, output: dictSnippet,
                ms: Math.max(1, Math.round(performance.now() - startedAt)), memories: 0, level: 'L1',
                focus: 'guest', action: source, examSource: 'DICT-FAST-LANE', vision: false, audio: source === 'mic'
              }
            };
            // When Mini eventually finishes, speak it as a natural follow-up
            miniGuestPromise.then(miniResult => {
              if (!miniResult?.response) return;
              appendChatMessage('assistant', miniResult.response);
              voiceManager?.speak?.(miniResult.response, { speaker: 'assistant' });
              voiceManager?.onAiLog?.(miniResult.logEntry);
            }).catch(() => {});
          }
        } else if (preferredMode === 'brain') {
          modelReply = await tryPriorityGuestGemmaReply('gemma4', {
            engineLabel: 'ollama',
            engineKey: 'gemma',
            examSource: 'GEMMA4-FIRST'
          }) || await tryPriorityGuestGemmaReply('gemma3', {
            engineLabel: 'ollama',
            engineKey: 'gemma',
            examSource: 'GEMMA3-AFTER-GEMMA4'
          });
        }
      }

      const shouldRescueWithCloud = !modelReply
        && !strictGemmaGuestOnly
        && preferredMode !== 'dict'
        && typeof voiceManager?.expandGuestPromptWithCloud === 'function'
        && (preferredMode === 'cloud' || shouldUseCloudGuestExpansion(normalized) || shouldPersistGuestPrompt || weakGuestTranscript);

      if (!modelReply && shouldRescueWithCloud) {
        modelReply = await tryCloudReply(preferredMode === 'cloud' ? 'CLOUD-RETRY' : preferredMode === 'gemma' ? 'CLOUD-AFTER-GEMMA' : 'CLOUD-AFTER-BRAIN');
      }

      if (!modelReply && preferredMode === 'gemma') {
        modelReply = await tryPriorityGuestGemmaReply('gemma3', {
          engineLabel: strictGemmaGuestOnly ? 'ollama-forced' : 'ollama',
          engineKey: strictGemmaGuestOnly ? 'gemma' : 'gemma',
          examSource: strictGemmaGuestOnly ? 'GEMMA3-RETRY-DURING-TRAINING' : 'GEMMA3-AFTER-GEMMA4'
        });
      }

      if (!modelReply) {
        const reply = voiceManager.examineBrainCheckpoint(normalized, '', {
          allowHot: false,
          probeInput: normalized,
          examKind: 'abstraction'
        });
        const fallbackResponse = String(reply?.response || '').trim() || 'The local brain is still forming an answer to that.';
        modelReply = {
          engineKey: preferredMode === 'dict' ? 'dict' : 'brain',
          response: fallbackResponse,
          logEntry: {
            engine: 'brain-reply',
            model: voiceManager?.getLocalBrainModelName?.() || dashboardTrainingRuntime?.fallbackModel || 'gemma4:latest',
            movie: voiceManager?.currentMovie,
            input: normalized,
            output: fallbackResponse,
            ms: Math.max(1, Math.round(performance.now() - startedAt)),
            memories: Number(reply?.memoryCount || 0),
            level: reply?.level || 'L1',
            intent: reply?.intent || 'general',
            training: guestTrainingActive,
            focus: 'guest',
            action: source,
            examSource: reply?.sourceLabel || 'BRAIN',
            rank: reply?.rank || '',
            score: Number.isFinite(reply?.score) ? reply.score : null,
            vision: false,
            audio: source === 'mic'
          }
        };
      }

      const response = modelReply.response;
      voiceManager.onAiLog?.(modelReply.logEntry);
      const shouldSteerResume = rememberTrainingGuestDirective(normalized, response, source);
      podcastGuestInterjectionCount = recordPodcastGuestInterjection();
      lastPodcastGuestReplyAt = Date.now();
      clearPendingPodcastNarration({ cancelActive: true });
      const guestReplyLines = [
        {
          speaker: 'hostB',
          text: response
        }
      ];
      const resumeLines = (!guestTrainingActive && shouldSteerResume)
        ? await buildPublicPodcastAiExchangeLines(Math.max(1, podcastGuestInterjectionCount + 1), {
            seedPrompt: normalized,
            seedResponse: response
          })
        : buildPodcastResumeLines({
            lastSpeaker: 'hostB',
            prompt: shouldSteerResume ? normalized : '',
            guestRecovery: true,
            turnNumber: podcastGuestInterjectionCount
          });
      injectPodcastNarration(guestReplyLines, { cancelActive: false, prioritize: true, force: true });
      // Keep directive alive · it steers the next scheduled podcast turn too
      schedulePodcastGuestResume(resumeLines, { delayMs: getPodcastGuestResumeDelay(guestReplyLines) });
      clearPodcastGuestPromptUi(source);
      setTimeout(() => drainPodcastNarrationQueue(true), 30);
      return true;
    } finally {
      podcastGuestReplyInFlight = false;
      updatePublicPodcastAiButtonState();
    }
  }

  function runPodcastBrainCheckpoint(batchNumber, items = []) {
    if (podcastBrainCheckpointBusy || !voiceManager?.examineBrainCheckpoint) return;
    const candidate = items[0] || null;
    if (!candidate?.input) return;

    podcastBrainCheckpointBusy = true;
    const startedAt = performance.now();
    const restoreMode = voiceManager.getPreferredMode?.() || 'cloud';
    const probeInputs = [
      buildBrainExamQuestion(candidate.input, batchNumber, 0),
      buildBrainExamQuestion(candidate.input, batchNumber, 1)
    ];
    voiceManager.setPreferredMode?.('brain');
    _modeDetailsState.engine = 'brain-check';
    setAiModeIndicator('brain');

    try {
      const exams = [];
      probeInputs.forEach((probe, index) => {
        const previousExam = exams[index - 1] || null;
        const exam = voiceManager.examineBrainCheckpoint(candidate.input, candidate.response, {
          allowHot: false,
          probeInput: probe?.text,
          examKind: probe?.kind || 'recall',
          avoidMatchedInput: previousExam?.matchedInput,
          avoidResponse: previousExam?.response
        });
        if (exam?.response) exams.push(exam);
      });
      if (!exams.length) return;

      const averageScore = Math.round(exams.reduce((sum, exam) => sum + Number(exam.score || 0), 0) / exams.length);
      const rank = averageScore >= 85 ? 'A' : averageScore >= 72 ? 'B' : averageScore >= 58 ? 'C' : 'D';
      const insight = exams.map((exam) => exam.insight).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(' + ');
      const combinedSource = exams.map((exam) => exam.sourceLabel).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(' + ');
      const combinedInput = exams.map((exam) => exam.input).join(' / ');
      const combinedOutput = exams.map((exam, index) => `A${index + 1}: ${exam.response}`).join(' || ');
      const windowLines = buildPodcastBrainCheckLines(exams, candidate);

      if (activeTrainingSessionMetrics) {
        activeTrainingSessionMetrics.brainChecks.push({
          score: averageScore,
          rank,
          level: exams[0]?.level || 'L1',
          source: combinedSource
        });
      }
      recordBrainCheckSnapshot({
        movie: voiceManager?.currentMovie,
        score: averageScore,
        level: exams[0]?.level || 'L1',
        source: combinedSource
      });

      const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
      voiceManager.onAiLog?.({
        engine: 'brain-reply',
        model: voiceManager?.getLocalBrainModelName?.() || dashboardTrainingRuntime?.fallbackModel || 'gemma4:latest',
        movie: voiceManager?.currentMovie,
        input: combinedInput,
        output: combinedOutput,
        ms: elapsedMs,
        memories: exams.reduce((sum, exam) => sum + Number(exam.memoryCount || 0), 0),
        level: exams[0]?.level,
        intent: exams[0]?.intent,
        training: true,
        focus: 'exam',
        action: 'window',
        rank,
        score: averageScore,
        examSource: combinedSource,
        artRef: false,
        vision: false,
        audio: false
      });

      windowLines.forEach((line) => {
        queuePodcastNarration(line.text, line.speaker);
      });

      const restoreDelay = estimatePodcastWindowMs(windowLines);
      clearPodcastModeRestoreTimer();
      podcastModeRestoreMode = restoreMode;
      podcastModeRestoreTimer = setTimeout(() => {
        voiceManager.setPreferredMode?.(restoreMode);
        _modeDetailsState.engine = restoreMode === 'cloud' ? 'cloud' : 'dict';
        setAiModeIndicator(restoreMode);
        podcastModeRestoreTimer = null;
        podcastModeRestoreMode = null;
      }, restoreDelay);
    } catch (error) {
      console.warn('[Podcast] Brain checkpoint failed:', error);
    } finally {
      podcastBrainCheckpointBusy = false;
    }
  }

  function drainPodcastNarrationQueue(force = false) {
    if (!podcastEngine) return;
    const allowDrain = Boolean(
      selectedConversationSurfaceMode === 'podcast'
      || publicPodcastAiAutoMode
      || brainTrainingInFlight
      || hasPublicPodcastAiConversationWork()
    );
    if (!allowDrain) return;
    podcastEngine.drain(force);
  }


  function queuePodcastNarration(text = '', speaker = 'hostA') {
    podcastEngine.queueLine(text, speaker);
  }

  function queuePodcastBatchNarration(lines = [], batchNumber = 0) {
    podcastEngine.queueBatch(lines, batchNumber);
  }

  function updateSecretTrainButtonState(minutes = _trainingButtonMinutes) {
    if (!btnSecretTrain) return;
    if (publicPodcastAiEnabled) {
      btnSecretTrain.disabled = false;
      btnSecretTrain.classList.remove('training');
      const podcastActive = Boolean(publicPodcastAiAutoMode || hasPublicPodcastAiConversationWork() || publicPodcastAiContinueTimer);
      btnSecretTrain.textContent = podcastActive ? 'Podcast' : 'Free Chat';
      btnSecretTrain.title = podcastActive ? 'Podcast' : 'Free Chat';
      btnSecretTrain.setAttribute('aria-label', podcastActive ? 'Podcast' : 'Free Chat');
      updatePublicPodcastAiButtonState();
      return;
    }
    const safeMinutes = Math.max(0.25, Math.min(10, Number(minutes || _trainingButtonMinutes || 10)));
    _trainingButtonMinutes = safeMinutes;
    btnSecretTrain.disabled = false; // Always enabled so you can toggle dashboard
    btnSecretTrain.classList.toggle('training', brainTrainingInFlight);
    btnSecretTrain.textContent = brainTrainingInFlight ? '?' : '?';
    const selectedTrainingMode = voiceManager?.getPreferredMode?.() || 'cloud';
    let title = selectedTrainingMode === 'gemma'
      ? `Secret training (${safeMinutes} min) · follows Gemma mode`
      : selectedTrainingMode === 'brain'
        ? `Secret training (${safeMinutes} min) · follows Brain mode`
        : `Secret training (${safeMinutes} min) · adaptive flow; use Cloud for cloud-only`;
    if (brainTrainingInFlight) {
      if (_activeTrainingEngine === 'ollama') {
        const modelName = voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest';
        title = `Local ${modelName} training running for ${safeMinutes} min`;
      } else if (_activeTrainingEngine === 'dict') {
        title = `DICT backup training running for ${safeMinutes} min`;
      } else {
        title = `Cloud training running for ${safeMinutes} min`;
      }
    }
    btnSecretTrain.title = title;
    btnSecretTrain.setAttribute('aria-label', title);

    if (btnTrainCloud) {
      const cloudTitle = brainTrainingInFlight
        ? 'Training running · click to open or close the dashboard'
        : `Train explicitly with Cloud for ${safeMinutes} min`;
      btnTrainCloud.title = cloudTitle;
      btnTrainCloud.setAttribute('aria-label', cloudTitle);
    }

    if (btnTrainGemmaStrict) {
      const strictTitle = brainTrainingInFlight
        ? 'Training running · click to open or close the dashboard'
        : `Train with strict Gemma only for ${safeMinutes} min. No Cloud or DICT fallback.`;
      btnTrainGemmaStrict.title = strictTitle;
      btnTrainGemmaStrict.setAttribute('aria-label', strictTitle);
    }
  }

  let trainingUserModeOverride = false; // true when user manually clicks Brain during training

  async function runBrainTraining(minutes = 5, options = {}) {
    const safeMinutes = Math.max(0.25, Math.min(10, Number(minutes || 5)));
    const durationMs = Math.round(safeMinutes * 60 * 1000);
    const { source = 'secret button', echoCommand = null, forceCloud = false, preserveSplitMode = false } = options;
    const cloudLocalFallbackCandidates = ['gemma4:e2b', 'gemma3:4b', 'phi4:latest', 'phi4'];
    const preferredModeBeforeTraining = voiceManager?.getPreferredMode?.() || 'cloud';
    let localBackupModel = voiceManager?.getLocalBrainModelName?.() || 'local model';
    let localBackupReady = false;
    let lastBatchNotice = '';
    let localTemplatePairPreviewCount = 0;
    let localTemplateChatSuppressed = false;
    let lastLocalSkippedBatchNotice = 0;
    trainingUserModeOverride = false;

    if (!voiceManager?.trainBrainFromCloud) {
      appendChatMessage('assistant', 'Training unavailable.');
      showAiSpeech('Training unavailable', false);
      return false;
    }

    if (!isVoiceCloneReady) {
      setChatEnabled(false, 'Analyze a movie first to unlock chat');
      showAiSpeech('Load and analyze a movie first', false);
      appendChatMessage('assistant', 'Analyze a movie first.');
      return false;
    }

    if (brainTrainingInFlight) {
      showAiSpeech('Training already running', false);
      appendChatMessage('assistant', 'Training already running.');
      return false;
    }

    const quotaBackoffRemainingMs = Number(voiceManager?.getQuotaBackoffRemainingMs?.() || 0);
    const usingServerProxy = Boolean(voiceManager?.hasServerGeminiProxy?.());
    try {
      localBackupReady = Boolean(await voiceManager?.isLocalBrainModelReady?.());
    } catch {
      localBackupReady = false;
    }

    const getCloudLocalFallbackInfo = async () => {
      if (typeof voiceManager?.getLocalTrainingFallbackInfo !== 'function') return null;
      return voiceManager.getLocalTrainingFallbackInfo({
        useOllamaModel: true,
        allowTemplateFallback: false,
        candidateModels: cloudLocalFallbackCandidates
      }).catch(() => null);
    };

    const runCloudLocalFallbackTraining = async ({ reasonLabel = 'Cloud unavailable' } = {}) => {
      const fallbackInfo = await getCloudLocalFallbackInfo();
      const fallbackUsesOllama = Boolean(fallbackInfo?.usingOllama);
      if (!fallbackUsesOllama || !voiceManager?.trainBrainLocally) {
        appendChatMessage('assistant', `${reasonLabel}. No Gemma fallback is reachable, so training stopped instead of switching to DICT.`);
        showAiSpeech('Cloud down. No Gemma fallback.', false);
        if (podcastTrainingEnabled) {
          replacePodcastNarration([
            { speaker: 'hostA', text: `${reasonLabel}. No Gemma fallback is reachable, so training is stopping here.` }
          ]);
        }
        return null;
      }

      const fallbackModelName = String(fallbackInfo?.model || localBackupModel || voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest').trim() || 'gemma4:latest';
      localBackupReady = true;
      localBackupModel = fallbackModelName;
      appendChatMessage('assistant', `${reasonLabel} · ${fallbackModelName}.`);
      showAiSpeech('Cloud down. Gemma fallback.', false);
      if (podcastTrainingEnabled) {
        replacePodcastNarration([
          { speaker: 'hostB', text: `${fallbackModelName} keeps the archive moving.` },
          { speaker: 'hostA', text: `${reasonLabel}. ${fallbackModelName} is carrying the session locally.` }
        ]);
      }

      return voiceManager.trainBrainLocally({
        durationMs,
        batchSize: 3,
        getDynamicContext: buildDynamicContext,
        onProgress: handleTrainingProgress,
        useOllamaModel: true,
        candidateModels: cloudLocalFallbackCandidates,
        allowTemplateFallback: false,
        maxLocalBatchWaitMs: 8000,
        localFallbackFailureThreshold: 3
      });
    };

    if (!forceCloud && preferredModeBeforeTraining === 'gemma') {
      return runStrictGemmaTraining(safeMinutes, { echoCommand });
    }

    if (!forceCloud && preferredModeBeforeTraining === 'brain' && voiceManager?.trainBrainLocally) {
      return runLocalBrainTraining(safeMinutes, { echoCommand });
    }

    if (quotaBackoffRemainingMs > 0 && !usingServerProxy) {
      const waitMinutes = Math.max(1, Math.ceil(quotaBackoffRemainingMs / 60000));
      if (voiceManager?.trainBrainLocally) {
        const fallbackInfo = await getCloudLocalFallbackInfo();
        if (!fallbackInfo?.usingOllama) {
          appendChatMessage('assistant', `Cloud cooling down for ~${waitMinutes} min. No Gemma fallback is reachable, so training stopped instead of switching to DICT.`);
          showAiSpeech('Cloud down. No Gemma fallback.', false);
          return false;
        }
        localBackupModel = String(fallbackInfo?.model || localBackupModel || voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest').trim() || 'gemma4:latest';
        appendChatMessage('assistant', `Cloud cooling down for ~${waitMinutes} min. Falling through to ${localBackupModel}.`);
        showAiSpeech('Cloud cooling down. Gemma fallback.', false);
        return runLocalBrainTraining(safeMinutes, {
          echoCommand,
          candidateModels: cloudLocalFallbackCandidates,
          allowTemplateFallback: false,
          maxLocalBatchWaitMs: 8000,
          localFallbackFailureThreshold: 3
        });
      }
      appendChatMessage('assistant', `Cloud cooling down for ~${waitMinutes} min. Retry later or add /key2.`);
      showAiSpeech('Cloud cooling down.', false);
      if (podcastTrainingEnabled) {
        // Announcements removed: no admin/backup lines injected
      }
      return false;
    }

    brainTrainingInFlight = true;
  lastPodcastTrainingStatusAnnouncement = { text: '', at: 0 };
    beginTrainingStatusTooltip(durationMs);
    resetDashboardTrainingRuntime({
      active: true,
      status: 'Pre-flight ready',
      provider: 'cloud',
      startedAt: Date.now(),
      preflightState: 'ready',
      preflightReason: usingServerProxy ? 'Server proxy available' : 'Cloud key path available',
      quotaBlocked: quotaBackoffRemainingMs > 0,
      serverProxy: usingServerProxy,
      localReady: localBackupReady,
      modelFallbackActive: false,
      fallbackEngine: '',
      fallbackModel: ''
    });
    syncTrainingPushToTalkMode();
    activeTrainingSessionMetrics = { brainChecks: [], successfulBatches: 0, narratedCloudWindows: 0, guestDirectives: [], lastGuestDirective: '', consecutiveFailures: 0, totalFailedBatches: 0, cloudFailedBatchesTotal: 0, usedLocalFallback: false, lastTemplateKeepAliveBatch: 0, dictSavedEntries: [] };
    resetPodcastNarrationQueue({ cancelActive: true, restoreMode: true, fullReset: true });
    voiceManager.setPreferredMode?.(preserveSplitMode ? 'split' : 'cloud');
    _activeTrainingEngine = 'cloud';
    _modeDetailsState.engine = preserveSplitMode ? 'split' : 'cloud';
    setAiModeIndicator(preserveSplitMode ? 'ollama-forced' : 'cloud');
    updateSecretTrainButtonState(safeMinutes);
    updateSecretPodcastButtonState();
    setSecretTrainVisible(true);
    setChatEnabled(false, `Training brain from cloud for ${safeMinutes} min· Mic can join live.`);
    setInlineActivity('');
    showAiSpeech(`Training · ${safeMinutes} min`, true);
    if (echoCommand) appendChatMessage('user', echoCommand);
    appendPodcastTrainingStatusLine(`Train · ${safeMinutes} min.`);

    const handleTrainingProgress = (progress) => {
      if (!progress || !progress.event) return;
      // DEBUG: Log all progress events
      console.log('[Podcast DEBUG] Progress event:', progress.event, progress);

      if (progress.event === 'movie-switched') {
        const fromMovie = formatMovieTitleForPodcast(progress.fromMovie);
        const toMovie = formatMovieTitleForPodcast(progress.toMovie || progress.movie);
        lastBatchNotice = '';
        lastLocalSkippedBatchNotice = 0;
        localTemplatePairPreviewCount = 0;
        localTemplateChatSuppressed = false;
        podcastBatchHighlights = new Map();
        if (podcastTrainingEnabled) resetPodcastNarrationQueue({ cancelActive: true, restoreMode: false });
        logTrainingContextSwitch(progress, fromMovie, toMovie);
        appendPodcastSafeAssistantLine(`Moving from ${fromMovie} · now training ${toMovie}.`);
        trainingDashboard.update({ status: `Context switch: ${toMovie}` });
        recordDashboardTrainingSignal({ status: `Context switch: ${toMovie}`, lastReadyState: 'movie-switched' });
        if (podcastTrainingEnabled) {
          // Removed admin/announcement lines: no Muse 'next reel' injection
        }
        return;
      }

      if (progress.event === 'cloud-unavailable') {
        const offlineFallback = /offline/i.test(String(progress.reason || ''));
        const quotaFallback = /quota/i.test(String(progress.reason || ''));
        const fallbackEngine = progress.fallbackTrainingEngine === 'ollama' ? 'ollama' : '';
        const fallbackModelName = fallbackEngine === 'ollama'
          ? String(progress.fallbackModel || localBackupModel || voiceManager?.getLocalBrainModelName?.() || 'gemma4:latest').trim() || 'gemma4:latest'
          : '';
        if (!fallbackEngine) {
          recordDashboardTrainingError(progress.reason || 'Cloud unavailable', {
            status: quotaFallback ? 'Cloud quota hit' : 'Cloud unavailable',
            lastReadyState: 'cloud-unavailable',
            provider: 'cloud'
          });
          _activeTrainingEngine = 'cloud';
          _modeDetailsState.engine = 'cloud';
          setAiModeIndicator('cloud');
          voiceManager.onAiEngineChange?.('cloud');
          trainingDashboard.update({
            engine: 'cloud',
            status: quotaFallback ? 'Cloud quota hit · checking Gemma' : 'Cloud unavailable · checking Gemma',
            memories: getTrainingDashboardMemoryCount(progress)
          });
          updateSecretTrainButtonState(safeMinutes);
          setInlineActivity('');
          setChatEnabled(false, quotaFallback ? 'Cloud quota hit · checking Gemma fallback·' : 'Cloud unavailable · checking Gemma fallback·');
          podcastBatchHighlights = new Map();
          return;
        }
        if (activeTrainingSessionMetrics) {
          activeTrainingSessionMetrics.usedLocalFallback = true;
        }
        localBackupReady = fallbackEngine === 'ollama';
        if (localBackupReady) {
          localBackupModel = fallbackModelName;
        }
        _activeTrainingEngine = fallbackEngine;
        _modeDetailsState.engine = fallbackEngine;
        recordDashboardTrainingError(progress.reason || 'Cloud unavailable', {
          status: 'Cloud fallback engaged',
          lastReadyState: 'cloud-unavailable',
          provider: fallbackEngine === 'ollama' ? 'local' : 'dict',
          modelFallbackActive: true,
          fallbackEngine,
          fallbackModel: localBackupReady ? fallbackModelName : ''
        });
        voiceManager.onAiEngineChange?.(fallbackEngine === 'ollama' ? 'ollama-ready' : 'dict');
        trainingDashboard.update({ 
          engine: _activeTrainingEngine, 
          status: 'Cloud down · Switching engine',
          memories: getTrainingDashboardMemoryCount(progress)
        });
        updateSecretTrainButtonState(safeMinutes);
        setInlineActivity('');
        setChatEnabled(false, `Training with ${fallbackModelName}·`);
        appendPodcastTrainingStatusLine(offlineFallback
          ? 'Offline · Gemma fallback.'
          : quotaFallback
            ? 'Cloud quota hit · Gemma fallback.'
            : 'Cloud down · Gemma fallback.');
        podcastBatchHighlights = new Map();
        if (podcastTrainingEnabled) {
          // Announcements removed: no admin/backup lines injected
        }
        return;
      }

      if (progress.event === 'local-unavailable') {
        recordDashboardTrainingError(progress.reason || 'Local slowed down', {
          status: 'DICT backup active',
          lastReadyState: 'local-unavailable',
          provider: 'dict',
          modelFallbackActive: true,
          fallbackEngine: 'dict'
        });
        _activeTrainingEngine = 'dict';
        _modeDetailsState.engine = 'dict';
        updateSecretTrainButtonState(safeMinutes);
        setInlineActivity('');
        setChatEnabled(false, 'Training with template backup · still running·');
        trainingDashboard.update({ engine: 'dict', status: 'DICT backup active', memories: getTrainingDashboardMemoryCount(progress) });
        appendPodcastTrainingStatusLine(normalizeDictBackupText(progress.reason || 'Local slowed down. DICT backup on.'));
        // Announcements removed: no admin/backup lines injected
        return;
      }

      if (progress.event === 'local-no-new-memory') {
        const batchNumber = Math.max(0, Number(progress.batchNumber || 0));
        if (batchNumber && batchNumber === lastLocalSkippedBatchNotice) {
          return;
        }
        const dryCount = Math.max(1, Number(progress.consecutiveDryBatches || 1));
        if (dryCount === 1 || (dryCount % 3) === 0) {
          appendPodcastSafeAssistantLine(`${progress.model || 'Local model'} added nothing in batch ${progress.batchNumber}.`);
        }
        return;
      }

      if (progress.event === 'memory-skipped') {
        const batchNumber = Math.max(0, Number(progress.batchNumber || 0));
        if (batchNumber && batchNumber === lastLocalSkippedBatchNotice) {
          return;
        }
        const skippedInput = String(progress.input || '').trim();
        const suffix = skippedInput ? ` · ${skippedInput}` : '';
        appendPodcastSafeAssistantLine(`Local draft matched existing memory in batch ${progress.batchNumber}; skipping save${suffix}`);
        rememberPodcastBatchItem(progress);
        if (batchNumber) lastLocalSkippedBatchNotice = batchNumber;
        return;
      }

      if (progress.event === 'template-drained') {
        recordDashboardTrainingError(progress.reason || 'template quiet', {
          status: 'DICT drained',
          lastReadyState: 'template-drained',
          provider: 'dict',
          modelFallbackActive: true,
          fallbackEngine: 'dict'
        });
        setChatEnabled(false, 'DICT backup is quiet · session still running·');
        trainingDashboard.update({ status: 'DICT Drained' });
        queueTemplateBackupKeepAlive(progress.batchNumber, progress.reason || 'template quiet');
        appendPodcastTrainingStatusLine('DICT backup quiet now.');
        return;
      }

      if (progress.event === 'batch-thinking') {
        const modelName = progress.model || voiceManager?.getLocalBrainModelName?.() || 'gemma3:4b';
        const notice = `${modelName} drafting batch ${progress.batchNumber}·`;
        recordDashboardTrainingSignal({
          status: `Drafting batch ${Math.max(0, Number(progress.batchNumber || 0))}`,
          provider: progress.trainingMode === 'brain-local' ? 'local' : 'cloud',
          lastReadyState: 'batch-thinking'
        });
        trainingDashboard.update({ 
          status: `Drafting batch ${progress.batchNumber}`,
          memories: getTrainingDashboardMemoryCount(progress)
        });
        if (notice !== lastBatchNotice) {
          lastBatchNotice = notice;
          appendPodcastSafeAssistantLine(notice);
        }
        return;
      }

      if (progress.event === 'batch-thinking-heartbeat') {
        recordDashboardTrainingHeartbeat(progress);
        const modelName = progress.model || voiceManager?.getLocalBrainModelName?.() || 'gemma3:4b';
        const waited = Math.max(1, Number(progress.waitSeconds || 0));
        const notice = `${modelName} still drafting batch ${progress.batchNumber} (${waited}s)·`;
        if (notice !== lastBatchNotice) {
          lastBatchNotice = notice;
          appendPodcastTrainingStatusLine(notice, { dedupeMs: 3000 });
        }
        return;
      }

      if (progress.event === 'local-model-switch') {
        recordDashboardTrainingSignal({
          status: `${progress.fromModel || 'Local model'} -> ${progress.toModel || 'fallback model'}`,
          provider: 'local',
          modelFallbackActive: true,
          fallbackEngine: 'ollama',
          fallbackModel: String(progress.toModel || '').trim(),
          lastReadyState: 'local-model-switch'
        });
        _activeTrainingEngine = 'ollama';
        _modeDetailsState.engine = 'ollama';
        voiceManager.onAiEngineChange?.('ollama-ready');
        updateSecretTrainButtonState(safeMinutes);
        appendPodcastTrainingStatusLine(`${progress.fromModel || 'Local model'} slow · switching to ${progress.toModel || 'fallback model'}.`);
        return;
      }

      if (progress.event === 'batch-start') {
        const isLocalTraining = progress.trainingMode === 'brain-local';
        const isOllamaTraining = isLocalTraining && progress.trainingEngine === 'ollama';
        const isLocalTemplateTraining = isLocalTraining && progress.trainingEngine === 'template';
        recordDashboardTrainingBatchStage(progress);
        recordDashboardTrainingBatchStart(progress, {
          provider: isLocalTraining ? (isOllamaTraining ? 'local' : 'dict') : 'cloud',
          modelFallbackActive: isLocalTemplateTraining,
          fallbackEngine: isLocalTemplateTraining ? 'dict' : '',
          fallbackModel: isOllamaTraining ? String(progress.model || '').trim() : ''
        });
        if (!trainingUserModeOverride) {
          // Preserve split mode — only switch away when the training engine is local
          const currentPreferred = voiceManager?.getPreferredMode?.();
          if (currentPreferred !== 'split') {
            voiceManager.setPreferredMode?.(isLocalTraining ? 'brain' : 'cloud');
          }
          _modeDetailsState.engine = isOllamaTraining ? 'ollama' : isLocalTraining ? 'dict' : (currentPreferred === 'split' ? 'split' : 'cloud');
          _activeTrainingEngine = isOllamaTraining ? 'ollama' : isLocalTraining ? 'dict' : 'cloud';
          setAiModeIndicator(isLocalTraining ? 'brain' : (currentPreferred === 'split' ? 'ollama-forced' : 'cloud'));
          if (isOllamaTraining) voiceManager.onAiEngineChange?.('ollama-ready');
        }
        updateSecretTrainButtonState(safeMinutes);
        if (isLocalTemplateTraining && progress.batchNumber > 4 && (progress.batchNumber % 10) !== 0) {
          return;
        }
        const guestNote = progress.guestSteerActive ? ' · guest steer' : '';
        const localNote = isOllamaTraining
          ? ` · ${progress.model || voiceManager.getLocalBrainModelName?.() || 'gemma3:4b'}`
          : isLocalTemplateTraining
            ? ' · DICT'
            : isLocalTraining
              ? ' · local'
              : '';
        const notice = `Training batch ${progress.batchNumber} · focus: ${progress.focus}${guestNote}${localNote}`;
        trainingDashboard.update({ 
          status: `Batch ${progress.batchNumber} started`, 
          engine: _activeTrainingEngine,
          memories: getTrainingDashboardMemoryCount(progress)
        });
        if (notice !== lastBatchNotice) {
          lastBatchNotice = notice;
          appendPodcastTrainingStatusLine(notice);
        }
        return;
      }

      if (progress.event === 'memory-saved') {
        recordDashboardTrainingMemorySaved();
        const isLocalTemplateTraining = progress.trainingMode === 'brain-local' && progress.trainingEngine === 'template';
        rememberDictSavedTrainingEntry(progress);
        if (shouldPreviewTrainingPairInChat(progress, localTemplatePairPreviewCount)) {
          appendChatMessage('user', `TRAIN_Q · ${progress.input}`);
          appendChatMessage('assistant', `TRAIN_A · ${progress.response}`);
          if (isLocalTemplateTraining) localTemplatePairPreviewCount += 1;
        } else if (isLocalTemplateTraining && !localTemplateChatSuppressed && !shouldSuppressPodcastTrainingAdminChat()) {
          appendPodcastSafeAssistantLine('DICT backup continues in AI log.');
          localTemplateChatSuppressed = true;
        }
        trainingDashboard.update({ 
          latestLog: { input: progress.input, response: progress.response },
          memories: getTrainingDashboardMemoryCount(progress)
        });
        // DEBUG: Log memory-saved and batch highlights
        console.log('[Podcast DEBUG] memory-saved', progress);
        console.log('[Podcast DEBUG] podcastBatchHighlights', Array.from(podcastBatchHighlights.entries()));
        rememberPodcastBatchItem(progress);
        return;
      }

      if (progress.event === 'batch-complete') {
        recordDashboardTrainingBatchFinish(progress, 'success');
        const savedThisBatch = Number(progress?.savedThisBatch || 0);
        const items = selectPodcastBatchNarrationItems(progress.batchNumber);
        if (activeTrainingSessionMetrics) {
          activeTrainingSessionMetrics.consecutiveFailures = 0;
          activeTrainingSessionMetrics.successfulBatches = Number(activeTrainingSessionMetrics.successfulBatches || 0) + 1;
        }
        recordTrainingBatchOutcome(progress, 'success');
        if (progress.trainingEngine === 'template' && Number(progress.savedThisBatch || 0) === 0) {
          queueTemplateBackupKeepAlive(progress.batchNumber, progress.focus || 'template backup');
          return;
        }
        const isTemplateBatch = String(progress.trainingEngine || '').toLowerCase() === 'template';
        if (shouldNarratePodcastBatchWindow(progress.batchNumber, items, {
          trainingEngine: progress.trainingEngine,
          savedThisBatch
        }) && !isPodcastGuestRecoveryWindowActive()) {
          podcastNarratedBatchNumbers.add(progress.batchNumber);
          podcastNarratedBatchCount += 1;
          if (activeTrainingSessionMetrics) {
            activeTrainingSessionMetrics.narratedCloudWindows = Number(activeTrainingSessionMetrics.narratedCloudWindows || 0) + 1;
          }
          queuePodcastBatchNarration(
            buildPodcastBatchLines(progress.batchNumber, items, progress.movie, {
              preferQuestionMode: isTemplateBatch && progress.batchNumber <= 2,
              preferObservationMode: isTemplateBatch && progress.batchNumber > 2,
              forceShortForm: isTemplateBatch
            }),
            progress.batchNumber
          );
        }
        return;
      }

      if (progress.event === 'batch-failed') {
        const quotaFailure = progress.reason === 'cloud-quota' || /quota/i.test(String(progress.detail || ''));
        recordDashboardTrainingBatchFinish(progress, 'failed');
        recordDashboardTrainingError(progress.detail || progress.reason || 'Batch failed', {
          status: quotaFailure ? 'Cloud quota hit' : 'Batch failed',
          lastReadyState: 'batch-failed',
          provider: progress.trainingMode === 'brain-local' ? 'local' : 'cloud'
        });
        appendPodcastTrainingStatusLine(quotaFailure
          ? `Batch ${progress.batchNumber} hit cloud quota.`
          : `Batch ${progress.batchNumber} missed. Next focus.`);
        if (activeTrainingSessionMetrics) {
          activeTrainingSessionMetrics.consecutiveFailures = Number(activeTrainingSessionMetrics.consecutiveFailures || 0) + 1;
          activeTrainingSessionMetrics.totalFailedBatches = Number(activeTrainingSessionMetrics.totalFailedBatches || 0) + 1;
          if (progress.trainingMode !== 'brain-local') {
            activeTrainingSessionMetrics.cloudFailedBatchesTotal = Number(activeTrainingSessionMetrics.cloudFailedBatchesTotal || 0) + 1;
          }
        }
        recordTrainingBatchOutcome(progress, 'failed');
        const totalFailures = Number(activeTrainingSessionMetrics?.totalFailedBatches || 0);
        const shouldNarrateFailure = podcastTrainingEnabled
          && shouldNarratePodcastFailure(totalFailures)
          && podcastEngine.queue.length < 3
          && !podcastEngine.isSpeaking
          && !isPodcastGuestRecoveryWindowActive();
        if (shouldNarrateFailure) {
          injectPodcastNarration(buildPodcastFailureLines(progress.batchNumber, progress.reason), {
            cancelActive: false,
            prioritize: false,
            force: true
          });
        }
      }
    };

    const buildDynamicContext = () => {
      const directives = Array.isArray(activeTrainingSessionMetrics?.guestDirectives)
        ? activeTrainingSessionMetrics.guestDirectives
        : [];
      const currentMovieKey = String(voiceManager?.currentMovie || '').trim();
      const recentPodcastQuestions = recentPodcastHostQuestionLines
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6);
      const movieSeeds = freeChatPodcastSeeds
        .filter((s) => s.movie === currentMovieKey)
        .slice(0, 2);
      const podcastSeeds = recentPodcastSeedBuffer
        .filter((s) => s.movie === currentMovieKey)
        .filter((ps) => !movieSeeds.some((ms) => ms.input === ps.input))
        .slice(0, 3);
      const recentPodcastAnswers = [...movieSeeds, ...podcastSeeds]
        .map((item) => String(item?.response || '').trim())
        .filter(Boolean)
        .slice(0, 4);
      const combinedSeeds = [...movieSeeds, ...podcastSeeds].slice(0, 5);
      const baseContext = directives.length ? directives : combinedSeeds.map((s) => ({ input: s.input, response: s.response }));
      const leadPrompt = String(baseContext[0]?.input || '').trim();
      const leadReply = String(baseContext[0]?.response || '').trim();
      const suggestedQuestionAngles = buildSplitStyleQuestionAngles({
        movie: currentMovieKey,
        ctx: getFilmContext(currentMovieKey),
        prompt: leadPrompt,
        response: leadReply,
        turnNumber: Math.max(1, Number(activeTrainingSessionMetrics?.successfulBatches || 0) + 1)
      });
      if (!directives.length && !combinedSeeds.length && !recentPodcastQuestions.length && !recentPodcastAnswers.length && !suggestedQuestionAngles.length) return null;
      return {
        liveGuestDirection: baseContext.map((item, index) => `${index + 1}. ${item.input}`).join(' | '),
        latestGuestPrompt: baseContext[0]?.input || '',
        latestGuestReply: baseContext[0]?.response || '',
        guestPromptCount: baseContext.length,
        recentPodcastQuestions,
        recentPodcastAnswers,
        suggestedQuestionAngles
      };
    };

    try {
      let report;

      // -- Priority: Local AI ? Cloud ? DICT -----------------------------------
      // Step 1: Local AI (Ollama) ready ? use it, skip cloud entirely.
      // Step 2: Mobile without local AI ? skip cloud, go directly to DICT.
      //         Cloud on mobile causes TTS timing issues (slow responses + podcast drain stall).
      // Step 3: Desktop without local AI ? try cloud, fall to DICT on failure.
      // This applies to all devices consistently.

      const skipCloudOnMobile = isMobile && !localBackupReady;


      if (!forceCloud && localBackupReady && voiceManager?.trainBrainLocally) {
        // Local AI first · announce it, switch UI to brain mode
        appendPodcastSafeAssistantLine(`Local AI · ${localBackupModel} · ${safeMinutes} min.`);
        showAiSpeech(`Local AI · ${safeMinutes} min`, true);
        _activeTrainingEngine = 'ollama';
        _modeDetailsState.engine = 'ollama';
        voiceManager.setPreferredMode?.('brain');
        setAiModeIndicator('brain');
        if (podcastTrainingEnabled) {
          injectPodcastNarration(buildPodcastIntroLines(voiceManager?.currentMovie, safeMinutes, {
            engine: 'local', model: localBackupModel
          }), { cancelActive: true, prioritize: false, force: true });
        }
        report = await voiceManager.trainBrainLocally({
          durationMs,
          batchSize: 3,
          getDynamicContext: buildDynamicContext,
          onProgress: handleTrainingProgress,
          useOllamaModel: true,
          allowTemplateFallback: true,
          maxLocalBatchWaitMs: 5000,
          localFallbackFailureThreshold: 1
        });
      } else if (!forceCloud && skipCloudOnMobile) {
        // Mobile without local AI ? go directly to DICT (instant batches, stable podcast timing)
        appendPodcastSafeAssistantLine('DICT · mobile training.');
        showAiSpeech('DICT · mobile', false);
        if (podcastTrainingEnabled) {
          injectPodcastNarration(buildPodcastIntroLines(voiceManager?.currentMovie, safeMinutes), {
            cancelActive: false, prioritize: false, force: true
          });
        }
        report = await voiceManager.trainBrainLocally({
          durationMs,
          batchSize: 3,
          getDynamicContext: buildDynamicContext,
          onProgress: handleTrainingProgress,
          useOllamaModel: false,   // skip Ollama probe ? go straight to DICT
          allowTemplateFallback: true
        });
      } else {
        // Desktop without local AI · try cloud, with DICT as final safety net
        if (podcastTrainingEnabled) {
          injectPodcastNarration(buildPodcastIntroLines(voiceManager?.currentMovie, safeMinutes), {
            cancelActive: false, prioritize: false, force: true
          });
        }
        try {
          report = await voiceManager.trainBrainFromCloud({
            durationMs,
            getDynamicContext: buildDynamicContext,
            onProgress: handleTrainingProgress
          });
        } catch (error) {
          const message = String(error?.message || 'Unknown error.');
          if (/Cloud training unavailable/i.test(message) && voiceManager?.trainBrainLocally) {
            report = await runCloudLocalFallbackTraining({
              reasonLabel: /quota/i.test(message) ? 'Cloud quota hit' : 'Cloud is unavailable'
            });
            if (!report) return false;
          } else {
            throw error;
          }
        }
      }


      const totalFailedBatches = Boolean(activeTrainingSessionMetrics?.usedLocalFallback)
        ? Number(report?.failedBatches || 0) + Number(activeTrainingSessionMetrics?.cloudFailedBatchesTotal || 0)
        : Number(report?.failedBatches || 0);
      if (totalFailedBatches > Number(report?.failedBatches || 0)) {
        report.failedBatches = totalFailedBatches;
      }

      appendPodcastSafeAssistantLine(report.summary);
      const brainChecks = Array.isArray(activeTrainingSessionMetrics?.brainChecks) ? activeTrainingSessionMetrics.brainChecks : [];
      const guestDirectives = Array.isArray(activeTrainingSessionMetrics?.guestDirectives) ? activeTrainingSessionMetrics.guestDirectives : [];
      if (brainChecks.length) {
        const avgScore = Math.round(brainChecks.reduce((sum, item) => sum + Number(item.score || 0), 0) / brainChecks.length);
        const summaryRank = avgScore >= 85 ? 'A' : avgScore >= 72 ? 'B' : avgScore >= 58 ? 'C' : 'D';
        const topLevel = brainChecks[brainChecks.length - 1]?.level || 'L2';
        const sourceMix = brainChecks
          .map((item) => item.source)
          .filter(Boolean)
          .filter((value, index, array) => array.indexOf(value) === index)
          .join(' + ');
        const dictSavedEntries = Array.isArray(activeTrainingSessionMetrics?.dictSavedEntries)
          ? activeTrainingSessionMetrics.dictSavedEntries.slice(0, 10)
          : [];
        if (dictSavedEntries.length) report.dictSavedEntries = dictSavedEntries;
        appendPodcastSafeAssistantLine(`Check · ${summaryRank} · ${avgScore}/100.`);
        const summaryLines = [
          report.summary,
          `Check · ${summaryRank} · ${avgScore}/100.`,
          guestDirectives.length ? `Guest steer · ${guestDirectives.length}.` : '',
          report.failedBatches ? `Failures · ${report.failedBatches}.` : '',
          dictSavedEntries.length ? `DICT saved · ${dictSavedEntries.length} pair${dictSavedEntries.length === 1 ? '' : 's'}.` : '',
          ...buildDictSavedReportLines(dictSavedEntries)
        ].filter(Boolean);
        voiceManager.onAiLog?.({
          engine: 'train-summary',
          movie: report.movie,
          input: 'Training session summary',
          output: summaryLines.join('\n'),
          ms: report.durationMs,
          memories: report.added + report.updated,
          level: topLevel,
          intent: 'general',
          training: true,
          focus: 'summary',
          action: 'complete',
          rank: summaryRank,
          score: avgScore,
          examSource: sourceMix || 'BRAIN-CHECK',
          vision: false,
          audio: false
        });
      }
      if (podcastTrainingEnabled) {
        replacePodcastNarration(buildPodcastSummaryLines(report));
      }
      showAiSpeech('Secret brain training complete', true);
      refreshUsageSummary().catch(() => { });
      if (report.successfulBatches > 10 && avgScore >= 45 && publicPodcastAiEnabled && currentMovie && !isMobile) {
        try {
          const { PostTrainingCapture } = await import('./PostTrainingCapture.js');
          const capture = new PostTrainingCapture({
            voiceManager,
            onInjectPodcastPrompt: (prompt) => {
              handlePodcastGuestPrompt(prompt, { source: 'chat', skipUserEcho: true }).catch(() => {});
            }
          });
          appendChatMessage('assistant', 'Post-training capture · 5 min · transcript + CSV download on close.');
          startPublicPodcastAiConversation({ source: 'post-training' }).catch(() => {});
          await capture.startCapture(report.movie, {
            batches: report.successfulBatches,
            avgScore,
            dictSaved: dictSavedEntries.length,
            startedAt: report.startedAt
          });
        } catch (err) {
          console.warn('[PostTrainingCapture] skipped:', err?.message);
        }
      }
      return true;
    } catch (e) {
      const message = String(e?.message || 'Unknown error.');
      recordDashboardTrainingError(message, {
        status: 'Training failed',
        lastReadyState: 'caught-exception',
        provider: 'cloud'
      });
      appendPodcastSafeAssistantLine(`Brain training failed: ${message}`);
      if (podcastTrainingEnabled) {
        replacePodcastNarration([{ text: /Cloud training unavailable/i.test(message) ? 'Training stopped because the cloud is unavailable right now.' : 'Training failed. Check the chat log for details.', speaker: 'hostA' }]);
      }
      showAiSpeech(/Cloud training unavailable/i.test(message) ? 'Cloud training unavailable' : 'Brain training failed', false);
      return false;
    } finally {
      brainTrainingInFlight = false;
      clearTrainingStatusTooltip();
      trainingUserModeOverride = false;
      syncTrainingPushToTalkMode();
      recordDashboardTrainingSignal({ active: false, status: 'Idle after last run', endedAt: Date.now(), lastReadyState: 'idle' });
      activeTrainingSessionMetrics = null;
      const restoreMode = preserveSplitMode ? 'split' : preferredModeBeforeTraining;
      voiceManager.setPreferredMode?.(restoreMode);
      _modeDetailsState.engine = restoreMode === 'split'
        ? 'split'
        : restoreMode === 'cloud'
          ? 'cloud'
          : restoreMode === 'gemma'
            ? (voiceManager?._ollamaAvailable === true ? 'ollama' : 'dict')
            : 'dict';
      setAiModeIndicator(restoreMode === 'split' ? 'ollama-forced' : restoreMode);
      setInlineActivity('');
      setChatEnabled(true, '');
      updateSecretTrainButtonState();
      updateSecretPodcastButtonState();
      pulseSecretTrainReveal();
      // Background synthesis should never break cleanup or leave training stuck in-flight.
      const currentTrainingMovie = String(voiceManager?.currentMovie || '').trim();
      if (memorySynth && currentTrainingMovie) {
        try {
          Promise.resolve(memorySynth.synthesizeProfile(currentTrainingMovie))
            .then((profile) => {
              if (profile) {
                console.log('[Brain] Persona evolved:', profile);
                trainingDashboard.update({ status: 'Persona Evolved' });
              }
            })
            .catch((error) => {
              console.warn('[Brain] Persona synthesis skipped:', error);
            });
        } catch (error) {
          console.warn('[Brain] Persona synthesis skipped:', error);
        }
      }
    }
  }

  async function runStrictGemmaTraining(minutes = 5, options = {}) {
    const safeMinutes = Math.max(0.25, Math.min(10, Number(minutes || 10)));
    const { echoCommand = null } = options;
    const strictGemmaCandidates = ['gemma4:e2b', 'gemma4', 'gemma4:latest'];

    if (!voiceManager?.trainBrainLocally) {
      appendChatMessage('assistant', 'Strict Gemma training unavailable.');
      showAiSpeech('Strict Gemma unavailable', false);
      return false;
    }

    if (isMobile) {
      appendChatMessage('assistant', '?? Strict Gemma training needs local Ollama, so it stays unavailable on mobile.');
      showAiSpeech('Strict Gemma unavailable', true);
      return false;
    }

    if (!isSyntheticDesiresMovie() && voiceManager?.currentMovie) {
      appendChatMessage('assistant', '?? Strict Gemma training is only available for built-in Synthetic Desires movies. Imported files stay on Cloud.');
      showAiSpeech('?? Strict Gemma needs a built-in movie', true);
      return false;
    }

    let gemmaReady = false;
    try {
      gemmaReady = Boolean(await voiceManager?.isLocalBrainModelReady?.(true, {
        candidateModels: strictGemmaCandidates,
        timeoutMs: 10000
      }));
    } catch {
      gemmaReady = false;
    }

    if (!gemmaReady) {
      appendChatMessage('assistant', '?? Strict Gemma training requires local Gemma 4 in Ollama. No Cloud, Gemma 3, or DICT fallback will be used.');
      showAiSpeech('?? Gemma unavailable for strict training', true);
      return false;
    }

    if (voiceManager?.setLocalBrainModel) {
      const strictModelName = voiceManager?.getLocalBrainModelName?.() || 'gemma4:e2b';
      const locked = await voiceManager.setLocalBrainModel(strictModelName);
      if (!locked) {
        appendChatMessage('assistant', `?? Gemma 4 is reachable, but the app could not lock training to ${strictModelName}.`);
        showAiSpeech('?? Gemma lock failed', true);
        return false;
      }
    }

    return runLocalBrainTraining(safeMinutes, {
      echoCommand,
      strictGemma: true,
      allowTemplateFallback: false,
      maxLocalBatchWaitMs: 45000,
      localFallbackFailureThreshold: 3
    });
  }

  // Direct local training · optional strict Gemma-only path
  async function runLocalBrainTraining(minutes = 5, options = {}) {
    const safeMinutes = Math.max(0.25, Math.min(10, Number(minutes || 10)));
    const durationMs = Math.round(safeMinutes * 60 * 1000);
    const {
      echoCommand = null,
      strictGemma = false,
      candidateModels = null,
      allowTemplateFallback = true,
      maxLocalBatchWaitMs = strictGemma ? 45000 : 5000,
      localFallbackFailureThreshold = 1
    } = options;
    const strictGemmaCandidates = ['gemma4:e2b', 'gemma4', 'gemma4:latest'];
    const modelName = strictGemma ? (voiceManager?.getLocalBrainModelName?.() || 'gemma4:e2b') : (voiceManager?.getLocalBrainModelName?.() || 'gemma3:4b');
    const preferredModeBefore = voiceManager?.getPreferredMode?.() || (strictGemma ? 'gemma' : 'brain');
    const modeDuringTraining = strictGemma ? 'gemma' : 'brain';

    if (brainTrainingInFlight) {
      appendChatMessage('assistant', 'Training already in progress.');
      return false;
    }

    if (strictGemma && isMobile) {
      appendChatMessage('assistant', '?? Strict Gemma training needs local Ollama, so it stays unavailable on mobile.');
      showAiSpeech('Strict Gemma unavailable', true);
      return false;
    }

    if (strictGemma && !isSyntheticDesiresMovie() && voiceManager?.currentMovie) {
      appendChatMessage('assistant', '?? Strict Gemma training is only available for built-in Synthetic Desires movies. Imported files stay on Cloud.');
      showAiSpeech('?? Strict Gemma needs a built-in movie', true);
      return false;
    }

    let ready = false;
    try {
      ready = Boolean(await voiceManager?.isLocalBrainModelReady?.(true, strictGemma
        ? { candidateModels: strictGemmaCandidates, timeoutMs: 10000 }
        : {}));
    } catch {
      ready = false;
    }

    if (strictGemma && !ready) {
      appendChatMessage('assistant', '?? Strict Gemma training requires local Gemma 4 in Ollama. No Cloud, Gemma 3, or DICT fallback will be used.');
      showAiSpeech('?? Gemma unavailable for strict training', true);
      return false;
    }

    if (strictGemma && voiceManager?.setLocalBrainModel) {
      const strictModelName = voiceManager?.getLocalBrainModelName?.() || 'gemma4:e2b';
      const locked = await voiceManager.setLocalBrainModel(strictModelName);
      if (!locked) {
        appendChatMessage('assistant', `?? Gemma 4 is reachable, but the app could not lock training to ${strictModelName}.`);
        showAiSpeech('?? Gemma lock failed', true);
        return false;
      }
    }

    const startingWithTemplateFallback = allowTemplateFallback && !ready;

    if (strictGemma) {
      voiceManager.setPreferredMode?.('gemma');
    }

    brainTrainingInFlight = true;
  lastPodcastTrainingStatusAnnouncement = { text: '', at: 0 };
    beginTrainingStatusTooltip(durationMs, { strictGemma });
    resetDashboardTrainingRuntime({
      active: true,
      status: 'Pre-flight ready',
      provider: startingWithTemplateFallback ? 'dict' : 'local',
      startedAt: Date.now(),
      preflightState: 'ready',
      preflightReason: strictGemma
        ? 'Pinned Gemma verified'
        : ready
          ? 'Local model ready'
          : 'Template fallback armed',
      quotaBlocked: false,
      serverProxy: false,
      localReady: ready,
      modelFallbackActive: startingWithTemplateFallback,
      fallbackEngine: startingWithTemplateFallback ? 'dict' : '',
      fallbackModel: startingWithTemplateFallback ? 'DICT backup' : modelName
    });
    syncTrainingPushToTalkMode();
    activeTrainingSessionMetrics = { brainChecks: [], successfulBatches: 0, narratedCloudWindows: 0, guestDirectives: [], lastGuestDirective: '', consecutiveFailures: 0, totalFailedBatches: 0, cloudFailedBatchesTotal: 0, usedLocalFallback: startingWithTemplateFallback, lastTemplateKeepAliveBatch: 0, dictSavedEntries: [] };
    resetPodcastNarrationQueue({ cancelActive: true, restoreMode: true, fullReset: true });
    _activeTrainingEngine = startingWithTemplateFallback ? 'dict' : 'ollama';
    _modeDetailsState.engine = startingWithTemplateFallback ? 'dict' : 'ollama';
    voiceManager.onAiEngineChange?.(startingWithTemplateFallback ? 'dict' : 'ollama-ready');
    setAiModeIndicator(modeDuringTraining);
    updateSecretTrainButtonState(safeMinutes);
    updateSecretPodcastButtonState();
    setSecretTrainVisible(true);

    if (echoCommand) appendChatMessage('user', echoCommand);
    appendPodcastTrainingStatusLine(startingWithTemplateFallback
      ? `Local backup · ${safeMinutes} min. Template starts first.`
      : strictGemma
        ? `Strict Gemma · ${safeMinutes} min.`
        : `Local ${modelName} · ${safeMinutes} min.`);
    setInlineActivity('');
    setChatEnabled(false, startingWithTemplateFallback ? 'Training with DICT backup · still running·' : strictGemma ? `Training with strict Gemma (${modelName})·` : `Training with ${modelName}·`);
    if (podcastTrainingEnabled) {
      injectPodcastNarration(buildPodcastIntroLines(voiceManager?.currentMovie, safeMinutes, {
        engine: 'local',
        model: startingWithTemplateFallback ? 'DICT backup' : strictGemma ? `strict ${modelName}` : modelName
      }), {
        cancelActive: false,
        prioritize: false,
        force: true
      });
    }

    let lastBatchNotice = '';
    let localTemplatePairPreviewCount = 0;
    let localTemplateChatSuppressed = false;
    let lastLocalSkippedBatchNotice = 0;

    const handleLocalProgress = (progress) => {
      if (!progress?.event) return;
      if (progress.event === 'movie-switched') {
        const fromMovie = formatMovieTitleForPodcast(progress.fromMovie);
        const toMovie = formatMovieTitleForPodcast(progress.toMovie || progress.movie);
        lastBatchNotice = '';
        lastLocalSkippedBatchNotice = 0;
        localTemplatePairPreviewCount = 0;
        localTemplateChatSuppressed = false;
        podcastBatchHighlights = new Map();
        if (podcastTrainingEnabled) resetPodcastNarrationQueue({ cancelActive: true, restoreMode: false });
        logTrainingContextSwitch(progress, fromMovie, toMovie);
        appendPodcastSafeAssistantLine(`Moving from ${fromMovie} · now training ${toMovie}.`);
        recordDashboardTrainingSignal({ status: `Context switch: ${toMovie}`, lastReadyState: 'movie-switched' });
        return;
      }
      if (progress.event === 'template-drained') {
        recordDashboardTrainingError(progress.reason || 'template quiet', {
          status: 'DICT drained',
          lastReadyState: 'template-drained',
          provider: 'dict',
          modelFallbackActive: true,
          fallbackEngine: 'dict'
        });
        setChatEnabled(false, 'DICT backup is quiet · session still running·');
        queueTemplateBackupKeepAlive(progress.batchNumber, progress.reason || 'template quiet');
        appendPodcastSafeAssistantLine('DICT backup quiet now.');
        return;
      }
      if (progress.event === 'batch-start') {
        const isOllamaTraining = progress.trainingEngine === 'ollama';
        const isTemplateTraining = progress.trainingEngine === 'template';
        recordDashboardTrainingBatchStage(progress);
        recordDashboardTrainingBatchStart(progress, {
          provider: isOllamaTraining ? 'local' : 'dict',
          modelFallbackActive: isTemplateTraining,
          fallbackEngine: isTemplateTraining ? 'dict' : '',
          fallbackModel: isOllamaTraining ? String(progress.model || '').trim() : 'DICT backup'
        });
        _activeTrainingEngine = isOllamaTraining ? 'ollama' : 'dict';
        _modeDetailsState.engine = isOllamaTraining ? 'ollama' : 'dict';
        voiceManager.onAiEngineChange?.(isOllamaTraining ? 'ollama-ready' : 'dict');
        setAiModeIndicator(modeDuringTraining);
        updateSecretTrainButtonState(safeMinutes);
        trainingDashboard.update({ 
          status: `Batch ${progress.batchNumber} started`, 
          engine: _activeTrainingEngine,
          memories: getTrainingDashboardMemoryCount(progress)
        });
        if (isTemplateTraining && progress.batchNumber > 4 && (progress.batchNumber % 10) !== 0) {
          return;
        }
        const notice = `Training batch ${progress.batchNumber} · focus: ${progress.focus} · ${isOllamaTraining ? (progress.model || voiceManager?.getLocalBrainModelName?.() || modelName) : isTemplateTraining ? 'DICT' : 'local'}`;
        if (notice !== lastBatchNotice) {
          lastBatchNotice = notice;
          appendPodcastTrainingStatusLine(notice);
        }
      } else if (progress.event === 'batch-thinking') {
        recordDashboardTrainingSignal({
          status: `Drafting batch ${Math.max(0, Number(progress.batchNumber || 0))}`,
          provider: 'local',
          lastReadyState: 'batch-thinking'
        });
        const notice = `${progress.model || voiceManager?.getLocalBrainModelName?.() || modelName} drafting batch ${progress.batchNumber}·`;
        if (notice !== lastBatchNotice) {
          lastBatchNotice = notice;
          appendPodcastSafeAssistantLine(notice);
        }
      } else if (progress.event === 'batch-thinking-heartbeat') {
        recordDashboardTrainingHeartbeat(progress);
        const waited = Math.max(1, Number(progress.waitSeconds || 0));
        const notice = `${progress.model || voiceManager?.getLocalBrainModelName?.() || modelName} still drafting batch ${progress.batchNumber} (${waited}s)·`;
        if (notice !== lastBatchNotice) {
          lastBatchNotice = notice;
          appendPodcastTrainingStatusLine(notice, { dedupeMs: 3000 });
        }
      } else if (progress.event === 'local-model-switch') {
        recordDashboardTrainingSignal({
          status: `${progress.fromModel || modelName} -> ${progress.toModel || 'fallback model'}`,
          provider: 'local',
          modelFallbackActive: true,
          fallbackEngine: 'ollama',
          fallbackModel: String(progress.toModel || '').trim(),
          lastReadyState: 'local-model-switch'
        });
        _activeTrainingEngine = 'ollama';
        _modeDetailsState.engine = 'ollama';
        voiceManager.onAiEngineChange?.('ollama-ready');
        setAiModeIndicator(modeDuringTraining);
        updateSecretTrainButtonState(safeMinutes);
        appendPodcastTrainingStatusLine(`${progress.fromModel || modelName} slow · switching to ${progress.toModel || 'fallback model'}.`);
      } else if (progress.event === 'local-unavailable') {
        recordDashboardTrainingError(progress.reason || 'Local slowed down', {
          status: 'DICT backup active',
          lastReadyState: 'local-unavailable',
          provider: 'dict',
          modelFallbackActive: true,
          fallbackEngine: 'dict'
        });
        _activeTrainingEngine = 'dict';
        _modeDetailsState.engine = 'dict';
        voiceManager.onAiEngineChange?.('dict');
        setAiModeIndicator(modeDuringTraining);
        updateSecretTrainButtonState(safeMinutes);
        setInlineActivity('');
        setChatEnabled(false, 'Training with template backup · still running·');
        trainingDashboard.update({ engine: 'dict', status: 'DICT backup active', memories: getTrainingDashboardMemoryCount(progress) });
        appendPodcastTrainingStatusLine(normalizeDictBackupText(progress.reason || 'Local slowed down. DICT backup on.'));
        if (podcastTrainingEnabled) {
          replacePodcastNarration([
            { speaker: 'hostB', text: 'I will keep the session moving while the backup carries the next passes.' },
            { speaker: 'hostA', text: normalizeDictBackupText(progress.reason || 'The local model slowed down, so DICT backup is taking over.') }
          ]);
          injectPodcastNarration(
            buildPodcastResumeLines({ lastSpeaker: 'hostB', prompt: String(progress.reason || 'template backup') }),
            { cancelActive: false, prioritize: false, force: true }
          );
        }
      } else if (progress.event === 'local-no-new-memory') {
        const batchNumber = Math.max(0, Number(progress.batchNumber || 0));
        if (batchNumber && batchNumber === lastLocalSkippedBatchNotice) {
          return;
        }
        const dryCount = Math.max(1, Number(progress.consecutiveDryBatches || 1));
        if (dryCount === 1 || (dryCount % 3) === 0) {
          appendPodcastSafeAssistantLine(`${progress.model || modelName} added nothing in batch ${progress.batchNumber}.`);
        }
      } else if (progress.event === 'memory-skipped') {
        const batchNumber = Math.max(0, Number(progress.batchNumber || 0));
        if (batchNumber && batchNumber === lastLocalSkippedBatchNotice) {
          return;
        }
        const skippedInput = String(progress.input || '').trim();
        const suffix = skippedInput ? ` · ${skippedInput}` : '';
        appendPodcastSafeAssistantLine(`Local draft matched existing memory in batch ${progress.batchNumber}; skipping save${suffix}`);
        rememberPodcastBatchItem(progress);
        if (batchNumber) lastLocalSkippedBatchNotice = batchNumber;
      } else if (progress.event === 'memory-saved') {
        recordDashboardTrainingMemorySaved();
        const isTemplateTraining = progress.trainingEngine === 'template';
        rememberDictSavedTrainingEntry(progress);
        if (shouldPreviewTrainingPairInChat(progress, localTemplatePairPreviewCount)) {
          appendChatMessage('user', `TRAIN_Q · ${progress.input}`);
          appendChatMessage('assistant', `TRAIN_A · ${progress.response}`);
          if (isTemplateTraining) localTemplatePairPreviewCount += 1;
        } else if (isTemplateTraining && !localTemplateChatSuppressed && !shouldSuppressPodcastTrainingAdminChat()) {
          appendPodcastSafeAssistantLine('DICT backup continues in AI log.');
          localTemplateChatSuppressed = true;
        }
        rememberPodcastBatchItem(progress);
        trainingDashboard.update({ 
          latestLog: { input: progress.input, response: progress.response },
          memories: getTrainingDashboardMemoryCount(progress)
        });
      } else if (progress.event === 'batch-failed') {
        recordDashboardTrainingBatchFinish(progress, 'failed');
        recordDashboardTrainingError(progress.reason || 'Batch failed', {
          status: 'Batch failed',
          lastReadyState: 'batch-failed',
          provider: progress.trainingEngine === 'template' ? 'dict' : 'local'
        });
        const retryingLocalModel = progress.trainingEngine === 'ollama'
          && (progress.reason === 'local-model-error' || progress.reason === 'local-empty-batch');
        const retryLabel = progress.model || voiceManager?.getCurrentLocalModel?.() || 'local model';
        appendPodcastTrainingStatusLine(
          retryingLocalModel
            ? `${retryLabel} missed batch ${progress.batchNumber} · retrying locally`
            : `Batch ${progress.batchNumber} failed · ${progress.reason || 'error'}`
        );
        if (activeTrainingSessionMetrics) {
          activeTrainingSessionMetrics.consecutiveFailures = Number(activeTrainingSessionMetrics.consecutiveFailures || 0) + 1;
          activeTrainingSessionMetrics.totalFailedBatches = Number(activeTrainingSessionMetrics.totalFailedBatches || 0) + 1;
        }
        recordTrainingBatchOutcome(progress, 'failed');
        const totalFailures = Number(activeTrainingSessionMetrics?.totalFailedBatches || 0);
        const shouldNarrateFailure = podcastTrainingEnabled
          && shouldNarratePodcastFailure(totalFailures)
          && podcastEngine.queue.length < 3
          && !podcastEngine.isSpeaking
          && !isPodcastGuestRecoveryWindowActive();
        if (shouldNarrateFailure) {
          injectPodcastNarration(buildPodcastFailureLines(progress.batchNumber, progress.reason), {
            cancelActive: false,
            prioritize: false,
            force: true
          });
        }
      } else if (progress.event === 'batch-complete') {
        recordDashboardTrainingBatchFinish(progress, 'success');
        const savedThisBatch = Number(progress?.savedThisBatch || 0);
        const items = selectPodcastBatchNarrationItems(progress.batchNumber);
        if (activeTrainingSessionMetrics) {
          activeTrainingSessionMetrics.consecutiveFailures = 0;
          activeTrainingSessionMetrics.successfulBatches = Number(activeTrainingSessionMetrics.successfulBatches || 0) + 1;
        }
        recordTrainingBatchOutcome(progress, 'success');
        if (progress.trainingEngine === 'template' && Number(progress.savedThisBatch || 0) === 0) {
          queueTemplateBackupKeepAlive(progress.batchNumber, progress.focus || 'template backup');
          return;
        }
        const isTemplateBatch = String(progress.trainingEngine || '').toLowerCase() === 'template';
        if (shouldNarratePodcastBatchWindow(progress.batchNumber, items, {
          trainingEngine: progress.trainingEngine,
          savedThisBatch: progress.savedThisBatch
        }) && !isPodcastGuestRecoveryWindowActive()) {
          podcastNarratedBatchNumbers.add(progress.batchNumber);
          podcastNarratedBatchCount += 1;
          if (activeTrainingSessionMetrics) {
            activeTrainingSessionMetrics.narratedCloudWindows = Number(activeTrainingSessionMetrics.narratedCloudWindows || 0) + 1;
          }
          queuePodcastBatchNarration(
            buildPodcastBatchLines(progress.batchNumber, items, progress.movie, {
              preferQuestionMode: isTemplateBatch && progress.batchNumber <= 2,
              preferObservationMode: isTemplateBatch && progress.batchNumber > 2,
              forceShortForm: isTemplateBatch
            }),
            progress.batchNumber
          );
        }
      }
    };

    try {
      const buildDynamicContext = () => {
        const directives = Array.isArray(activeTrainingSessionMetrics?.guestDirectives)
          ? activeTrainingSessionMetrics.guestDirectives
          : [];
        const currentMovieKey = String(voiceManager?.currentMovie || '').trim();
        const recentPodcastQuestions = recentPodcastHostQuestionLines
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 6);
        const movieSeeds = freeChatPodcastSeeds
          .filter((s) => s.movie === currentMovieKey)
          .slice(0, 2);
        const podcastSeeds = recentPodcastSeedBuffer
          .filter((s) => s.movie === currentMovieKey)
          .filter((ps) => !movieSeeds.some((ms) => ms.input === ps.input))
          .slice(0, 3);
        const recentPodcastAnswers = [...movieSeeds, ...podcastSeeds]
          .map((item) => String(item?.response || '').trim())
          .filter(Boolean)
          .slice(0, 4);
        const combinedSeeds = [...movieSeeds, ...podcastSeeds].slice(0, 5);
        const baseContext = directives.length ? directives : combinedSeeds.map((s) => ({ input: s.input, response: s.response }));
        const leadPrompt = String(baseContext[0]?.input || '').trim();
        const leadReply = String(baseContext[0]?.response || '').trim();
        const suggestedQuestionAngles = buildSplitStyleQuestionAngles({
          movie: currentMovieKey,
          ctx: getFilmContext(currentMovieKey),
          prompt: leadPrompt,
          response: leadReply,
          turnNumber: Math.max(1, Number(activeTrainingSessionMetrics?.successfulBatches || 0) + 1)
        });
        if (!directives.length && !combinedSeeds.length && !recentPodcastQuestions.length && !recentPodcastAnswers.length && !suggestedQuestionAngles.length) return null;
        return {
          liveGuestDirection: baseContext.map((item, index) => `${index + 1}. ${item.input}`).join(' | '),
          latestGuestPrompt: baseContext[0]?.input || '',
          latestGuestReply: baseContext[0]?.response || '',
          guestPromptCount: baseContext.length,
          recentPodcastQuestions,
          recentPodcastAnswers,
          suggestedQuestionAngles
        };
      };

      const report = await voiceManager.trainBrainLocally({
        durationMs,
        batchSize: 3,
        useOllamaModel: true,
        candidateModels: strictGemma ? strictGemmaCandidates : candidateModels,
        allowTemplateFallback,
        maxLocalBatchWaitMs,
        localFallbackFailureThreshold,
        getDynamicContext: buildDynamicContext,
        onProgress: handleLocalProgress
      });
      const dictSavedEntries = Array.isArray(activeTrainingSessionMetrics?.dictSavedEntries)
        ? activeTrainingSessionMetrics.dictSavedEntries.slice(0, 10)
        : [];
      if (dictSavedEntries.length) report.dictSavedEntries = dictSavedEntries;
      const summaryLines = [
        report.summary,
        report.trainingEngine === 'template'
          ? `DICT saved · ${dictSavedEntries.length || (report.added + report.updated)} pair${(dictSavedEntries.length || (report.added + report.updated)) === 1 ? '' : 's'}.`
          : `${strictGemma ? 'Strict Gemma' : 'Local'} saved · ${report.added + report.updated} pair${(report.added + report.updated) === 1 ? '' : 's'}.`,
        ...buildDictSavedReportLines(dictSavedEntries)
      ].filter(Boolean);
      if (strictGemma) {
        summaryLines[0] = Array.isArray(report.movies) && report.movies.length > 1
          ? report.summary.replace(/^Adaptive local\s+gemma4(?::e4b)? complete/i, 'Adaptive Strict Gemma complete')
          : report.summary.replace(/^Local\s+gemma4(?::e4b)? complete/i, 'Strict Gemma complete');
      }
      voiceManager.onAiLog?.({
        engine: 'train-summary',
        movie: report.movie,
        input: report.trainingEngine === 'template' ? 'DICT training summary' : strictGemma ? 'Strict Gemma training summary' : 'Local training summary',
        output: summaryLines.join('\n'),
        ms: report.durationMs,
        memories: report.added + report.updated,
        intent: 'general',
        training: true,
        focus: 'summary',
        action: 'complete',
        vision: false,
        audio: false
      });
      appendPodcastSafeAssistantLine(report.summary);
      if (podcastTrainingEnabled) {
        replacePodcastNarration(buildPodcastSummaryLines(report));
      }
      refreshUsageSummary().catch(() => { });
      showAiSpeech(`${report.trainingEngine === 'ollama' ? (strictGemma ? 'Strict Gemma' : (voiceManager?.getLocalBrainModelName?.() || modelName)) : (strictGemma ? 'Strict Gemma' : 'Local')} training complete`, true);
      return true;
    } catch (e) {
      recordDashboardTrainingError(String(e?.message || 'Unknown error.'), {
        status: strictGemma ? 'Strict Gemma failed' : 'Local training failed',
        lastReadyState: 'caught-exception',
        provider: strictGemma ? 'local' : String(dashboardTrainingRuntime?.provider || 'local')
      });
      appendPodcastSafeAssistantLine(`${strictGemma ? 'Strict Gemma' : 'Local'} training failed: ${String(e?.message || 'Unknown error.')}`);
      if (podcastTrainingEnabled) {
        replacePodcastNarration([{ text: `${strictGemma ? 'Strict Gemma' : 'Local'} training failed. Check the chat log for details.`, speaker: 'hostA' }]);
      }
      showAiSpeech(strictGemma ? 'Strict Gemma training failed' : 'Local training failed', false);
      return false;
    } finally {
      brainTrainingInFlight = false;
      clearTrainingStatusTooltip();
      syncTrainingPushToTalkMode();
      recordDashboardTrainingSignal({ active: false, status: 'Idle after last run', endedAt: Date.now(), lastReadyState: 'idle' });
      activeTrainingSessionMetrics = null;
      updateSecretTrainButtonState();
      updateSecretPodcastButtonState();
      voiceManager.setPreferredMode?.(preferredModeBefore);
      _modeDetailsState.engine = preferredModeBefore === 'cloud'
        ? 'cloud'
        : preferredModeBefore === 'gemma'
          ? (voiceManager?._ollamaAvailable === true ? 'ollama' : 'dict')
          : 'dict';
      setAiModeIndicator(preferredModeBefore);
      setInlineActivity('');
      setChatEnabled(true, '');
      pulseSecretTrainReveal();
    }
  }

  async function runSelectedModeTraining(minutes = 5, options = {}) {
    const { preferAdaptive = false, ...trainingOptions } = options;
    const selectedMode = voiceManager?.getPreferredMode?.() || 'cloud';
    if (selectedMode === 'gemma') {
      return runStrictGemmaTraining(minutes, trainingOptions);
    }
    if (selectedMode === 'split') {
      // Split mode: use cloud for rich training batches, keep split mode active so
      // podcast commentary runs cloud (Host A question) + Gemma4 (Host B Muse reply).
      return runBrainTraining(minutes, { ...trainingOptions, forceCloud: true, preserveSplitMode: true });
    }
    if (selectedMode === 'cloud' && !preferAdaptive) {
      return runBrainTraining(minutes, { ...trainingOptions, forceCloud: true });
    }
    return runBrainTraining(minutes, trainingOptions);
  }

  if (appLogo) {
    appLogo.addEventListener('click', (event) => {
      if (event.target === btnSecretTrain || event.target === btnSecretPodcast || event.target === btnSecretForge) return;
      secretTrainTapCount += 1;
      if (secretTrainTapTimer) clearTimeout(secretTrainTapTimer);
      secretTrainTapTimer = setTimeout(() => {
        secretTrainTapCount = 0;
      }, 1800);

      if (secretTrainTapCount === 5) {
        pulseSecretTrainReveal();
        appendChatMessage('assistant', 'Secret unlocked · 15s.');
        showAiSpeech('Secret unlocked', true);
      }

      if (secretTrainTapCount >= 7) {
        secretTrainTapCount = 0;
        pulseSecretTrainReveal();
        trainingDashboard.show();
        trainingDashboard.refreshStats?.();
        appendChatMessage('assistant', 'Stats dashboard unlocked.');
        showAiSpeech('Stats dashboard', true);
      }
    });
  }

  if (btnSecretPodcast) {
    updateSecretPodcastButtonState();
    btnSecretPodcast.addEventListener('click', () => {
      podcastTrainingEnabled = !podcastTrainingEnabled;
      if (!podcastTrainingEnabled) {
        resetPodcastNarrationQueue({ cancelActive: true, restoreMode: true, fullReset: true });
      }
      syncTrainingPushToTalkMode();
      updateSecretPodcastButtonState();
      appendChatMessage('assistant', `Podcast mode ${podcastTrainingEnabled ? 'on' : 'off'}.`);
      showAiSpeech(`Podcast mode ${podcastTrainingEnabled ? 'on' : 'off'}`, true);
    });
  }

  if (btnSecretTrain) {
    updateSecretTrainButtonState();
    btnSecretTrain.addEventListener('click', async () => {
      if (publicPodcastAiEnabled) {
        if (publicPodcastAiAutoMode || hasPublicPodcastAiConversationWork() || publicPodcastAiContinueTimer) {
          stopPublicPodcastAiConversation();
          return;
        }
        startPublicPodcastAiConversation();
        return;
      }
      if (brainTrainingInFlight) {
        trainingDashboard.toggle(); // Toggle open/close while running
        return;
      }
      trainingDashboard.show();
      await runSelectedModeTraining(_trainingButtonMinutes, { source: 'secret button', preferAdaptive: true });
    });
  }

  if (btnSecretForge) {
    btnSecretForge.addEventListener('click', () => {
      const movieName = String(voiceManager?.currentMovie || '').trim();
      if (!movieName) {
        appendChatMessage('assistant', 'Load a movie before opening Movie Forge.');
        showAiSpeech('Load a movie first', true);
        return;
      }
      const brain = voiceManager?.currentMovieBrain || resolveMovieBrain(movieName) || null;
      ensureMovieForgeModal().openForge({ movieName, brain });
      appendChatMessage('assistant', `Movie Forge opened for ${movieName.replace(/\.[^.]+$/i, '').replace(/_/g, ' ')}.`);
      showAiSpeech('Movie Forge ready', true);
    });
  }

  if (conversationModeChat) {
    conversationModeChat.addEventListener('click', async () => {
      await switchConversationSurfaceMode('chat', { source: 'ui-tab' });
    });
  }

  if (conversationModePodcast) {
    conversationModePodcast.addEventListener('click', async () => {
      const started = await switchConversationSurfaceMode('podcast', { source: 'ui-tab' });
      if (!started) {
        selectedConversationSurfaceMode = 'chat';
      }
      updateConversationModeUi();
    });
  }

  if (btnTrainCloud) {
    btnTrainCloud.addEventListener('click', async () => {
      if (brainTrainingInFlight) {
        trainingDashboard.toggle();
        return;
      }
      trainingDashboard.show();
      await runBrainTraining(_trainingButtonMinutes, { source: 'cloud button', forceCloud: true });
    });
  }

  if (btnTrainGemmaStrict) {
    btnTrainGemmaStrict.addEventListener('click', async () => {
      if (brainTrainingInFlight) {
        trainingDashboard.toggle();
        return;
      }
      trainingDashboard.show();
      await runStrictGemmaTraining(_trainingButtonMinutes, { source: 'strict gemma button' });
    });
  }

  if (btnFullRun) {
    const _fullRunSetPaused = (paused) => {
      _fullRunPaused = paused;
      if (paused) {
        btnFullRun.classList.add('paused');
        btnFullRun.classList.remove('running');
        btnFullRun.textContent = '▶ Resume';
        trainingDashboard.show();
      } else {
        btnFullRun.classList.remove('paused');
        btnFullRun.classList.add('running');
        btnFullRun.textContent = '⏸ Pause';
        if (_fullRunResumeResolve) { _fullRunResumeResolve(); _fullRunResumeResolve = null; }
      }
    };
    const _waitForResume = () => new Promise(resolve => {
      if (!_fullRunPaused) { resolve(); return; }
      _fullRunResumeResolve = resolve;
    });

    btnFullRun.addEventListener('click', async () => {
      // Toggle pause/resume while run is active (regardless of brainTrainingInFlight)
      if (_fullRunActive) {
        _fullRunSetPaused(!_fullRunPaused);
        return;
      }
      // Start the run
      _fullRunActive = true;
      _fullRunPaused = false;
      _fullRunResumeResolve = null;
      btnFullRun.classList.add('running');
      btnFullRun.textContent = '⏸ Pause';
      trainingDashboard.show();
      let trainingReport = null;
      try {
        trainingReport = await runSelectedModeTraining(_trainingButtonMinutes, { source: 'full run button' });
      } finally {
        btnFullRun.textContent = _fullRunPaused ? '▶ Resume' : '⏸ Pause';
      }

      // Pause point between training and podcast
      await _waitForResume();
      if (_fullRunPaused) _fullRunSetPaused(true);
      await _waitForResume();

      btnFullRun.textContent = '⏸ Podcast…';
      voiceManager?.setPreferredMode?.('split');
      setAiModeIndicator('split');
      await startPublicPodcastAiConversation({ source: 'full run button' });

      // Pause point before exam
      await _waitForResume();

      btnFullRun.textContent = '⏸ Exam…';
      const lastBatchNumber = Math.max(0, Number(trainingReport?.batches || trainingReport?.completedBatches || 0));
      const examBatchNumber = lastBatchNumber || Math.max(0, ...Array.from(podcastBatchHighlights.keys()));
      const examItems = examBatchNumber ? selectPodcastBatchNarrationItems(examBatchNumber) : [];
      if (examItems.length && !podcastBrainCheckpointBusy) {
        runPodcastBrainCheckpoint(examBatchNumber, examItems);
      }

      _fullRunActive = false;
      _fullRunPaused = false;
      _fullRunResumeResolve = null;
      btnFullRun.classList.remove('running', 'paused');
      btnFullRun.textContent = '◈ Full Run';
    });
  }

  if (btnStoryMode) {
    btnStoryMode.addEventListener('click', async () => {
      if (btnStoryMode.disabled) return;
      btnStoryMode.classList.add('telling');
      btnStoryMode.disabled = true;
      btnStoryMode.textContent = '◎ Telling…';
      try {
        await runStoryMode();
      } finally {
        btnStoryMode.classList.remove('telling');
        btnStoryMode.disabled = false;
        btnStoryMode.textContent = '◎ Story';
      }
    });
  }

  // ── Story Mode ──────────────────────────────────────────────────────────────
  // Host A asks 2 narrative questions in sequence.
  // The Muse (hostB) delivers long-form responses. Both saved to brainMemory.
  async function runStoryMode() {
    const currentMovie = String(voiceManager?.currentMovie || '').trim();
    if (!currentMovie) {
      appendChatMessage('assistant', 'Load a movie first to run Story Mode.');
      return;
    }
    if (!podcastEngine || !voiceManager) {
      appendChatMessage('assistant', 'Story Mode requires the podcast engine.');
      return;
    }

    const ctx = getFilmContext(currentMovie);
    const museName = getPodcastMuseName();
    const theme = ctx?.theme || currentMovie;
    const lead = ctx?.lead || ctx?.persona || theme;
    const ref = ctx?.ref || ctx?.reference || '';
    const world = ctx?.world || '';

    // Refresh podcast voice profiles for the current film before queuing beats
    pickPodcastVoiceProfiles();

    // Build 2 Host A questions grounded in film context
    const q1 = ref
      ? `${museName}, before we go deeper — take us to the very first moment of this story. What does the scene feel like from the inside?`
      : `${museName}, set the scene for us. Where are we, and what is already lost before anything begins?`;
    const q2 = lead
      ? `${museName}, tell us what ${lead} is carrying through this whole film — not just the image, but the weight underneath it.`
      : `${museName}, what does this film know that it never says out loud?`;

    // --- Voice profiles for story beats — derived from the film's own voiceProfile ---
    // Each film has a distinct pitch/rate in movieBrains; story beats modulate around that base.
    const filmVP = voiceManager?.currentMovieBrain?.voiceProfile || {};
    const baseRate  = Number.isFinite(filmVP.rate)  ? Math.max(0.78, Math.min(1.02, filmVP.rate))  : 0.90;
    const basePitch = Number.isFinite(filmVP.pitch) ? Math.max(0.80, Math.min(1.20, filmVP.pitch)) : 0.97;
    const ACT1_VOICE = [
      { rate: baseRate,        pitch: basePitch        }, // beat 0 — opening, grounded
      { rate: baseRate + 0.03, pitch: basePitch + 0.03 }, // beat 1 — warming up
      { rate: baseRate - 0.02, pitch: basePitch - 0.01 }, // beat 2 — weighted revelation
      { rate: baseRate + 0.04, pitch: basePitch + 0.02 }  // beat 3 — forward momentum
    ];
    // Act 2: intimate, slightly slower than Act 1
    const ACT2_VOICE = [
      { rate: baseRate,        pitch: basePitch        }, // beat 0 — reflective
      { rate: baseRate - 0.03, pitch: basePitch - 0.02 }  // beat 1 — final, quiet landing
    ];
    const BEAT_PAUSE_MS = 450; // gap between beats (shorter — sentences now breathe individually)

    // Post-process a beat: add breath markers
    const storyifyBeat = (text) => {
      return text
        // em-dash at natural clause pivots
        .replace(/,\s*(but|yet|and then|as if|until|though|while|because|so that)\s/gi, ' — $1 ')
        // ellipsis on trailing weight words
        .replace(/(\b(?:always|never|again|still|somewhere|somehow|already|almost))\./gi, '$1...')
        // comma pause before final adverbials
        .replace(/\s+(finally|slowly|quietly|gently|suddenly|barely|only then)\./gi, ', $1.')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Extract first sentence for dedup — captures repeats regardless of total length
    const firstSentence = (text) => {
      const s = String(text || '').trim();
      const m = s.match(/^[^.!?…\u2026—]+[.!?…\u2026]*/);
      return (m ? m[0] : s).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
    };

    // All sentences from a beat — for cross-sentence dedup (prevents sub-recycling)
    // IMPORTANT: slice to same 100 chars as firstSentence so Set lookups match
    const allSentences = (text) => (String(text || '').match(/[^.!?…\u2026—]+[.!?…\u2026]*/g) || [text])
      .map(s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100))
      .filter(s => s.length > 12);

    // Reject entries written in critic/analyst voice — not suitable as story beats
    const isCriticVoice = (text) =>
      /cinematic dna|directed by|blade runner|ghost in the shell|\(\d{4}\)|ridley scott|villeneuve|mamoru|kar-wai|the film is|this film|the story of/i.test(text);

    // Reject entries with no first-person pronouns — Muse must speak as "I" not as observer
    const lacksFirstPerson = (text) =>
      !/\b(i |i'm|i've|i'll|i'd|me |my |myself|we |we're|we've|our |us )\b/i.test(text);

    // Strip duplicate sentences within a single Gemma response.
    // Gemma often loops "The cinematic DNA..." 2-3× inside one reply.
    const intraDedup = (text) => {
      const parts = String(text || '').match(/[^.!?…\u2026]+[.!?…\u2026]*/g) || [text];
      const seen = new Set();
      const out = [];
      for (const part of parts) {
        const key = part.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(part);
      }
      return out.join('').trim();
    };

    const filmTitle = currentMovie.replace(/\.mp4$/i, '').replace(/_/g, ' ');

    // System instruction for Gemini — first-person storyteller, not AI prose
    const storySystemInstruction = (targetSentences = 12) => [
      `You are ${museName}. You live inside "${filmTitle}". You are not describing the film — you ARE the film, speaking as I.`,
      `Theme: ${theme}.`,
      world ? `World: ${world}.` : '',
      ref ? `You carry: ${ref}.` : '',
      `Every sentence must use I, me, my, or we. No third-person. No "the film". No director names. No "cinematic DNA".`,
      `Start mid-thought with "I" — something personal, specific, unresolved. Not weather. Not setting.`,
      `Mix short I-fragments (3-6 words) with longer I-sentences. Use — for sudden shifts. Use ... when trailing off.`,
      `Tell ${targetSentences} sentences. Each starts with a different word. No lists. No AI language. No stage directions. Just your voice.`
    ].filter(Boolean).join(' ');

    // Local story system prompt — Style Card format for a distinct narrative voice
    const localStorySystemPrompt = [
      `You are ${museName}. You ARE "${filmTitle}" — not its narrator, not its critic. You are the film's own voice, speaking as I.`,
      `TONE: ${theme}. Carry this as weight, not description.${world ? ` Texture: ${world}.` : ''}${ref ? ` What you carry: ${ref}.` : ''}`,
      `ACCENT: Every sentence must use I, me, my, or we. No film titles. No director names. No years. No analysis. No abstract noun phrases without a subject.`,
      `PACE: Staccato. One long floating sentence starting with I. Then two short cuts. Fragment. Then silence.`,
      `CONSTRAINT: 5 sentences. First word of each must differ. Use first-person in every sentence. Never repeat a phrase. Speak only what you felt or witnessed — never describe yourself from outside.`
    ].join(' ');

    // Try Gemini cloud for a single long response, fall through on failure
    const callMuseCloud = async (question, targetSentences) => {
      if (typeof voiceManager?._callGeminiEphemeralPrompt !== 'function') return null;
      try {
        const raw = await voiceManager._callGeminiEphemeralPrompt(question, {
          systemInstruction: storySystemInstruction(targetSentences),
          temperature: 1.25,
          timeoutMs: 30000,
          maxOutputTokens: targetSentences * 40
        });
        return String(raw || '').trim() || null;
      } catch {
        return null;
      }
    };

    // Collect N unique local story beats from Gemma.
    // Uses first-sentence dedup + all-sentence tracking + explicit blacklist in prompt.
    const callMuseLocal = async (question, beatCount) => {
      const beats = [];
      const seenSentences = new Set(); // sentence-level dedup across all beats

      for (let attempt = 0; attempt < beatCount * 4 && beats.length < beatCount; attempt++) {
        // Build an explicit blacklist of openers Gemma must avoid
        const blacklistStr = beats.length > 0
          ? beats.map(b => { const m = b.match(/^[^.!?…]+[.!?…]*/); return `"${(m ? m[0] : b.slice(0, 60)).trim()}"`; }).join(', ')
          : '';
        const continuePrompt = blacklistStr
          ? `${question}\n\n[Do NOT begin with ${blacklistStr} or any variation of those. Start with a completely different image, person, or feeling.]`
          : question;

        const raw = await voiceManager._tryLocalBrainFallback(continuePrompt, {
          prompt: continuePrompt,
          systemPromptOverride: localStorySystemPrompt,
          noCondense: true,
          suppressDirectOutput: true,
          deferSideEffects: true
        });
        const text = intraDedup(raw ? String(raw).trim() : '');
        if (!text || isCriticVoice(text) || lacksFirstPerson(text)) continue;
        const fs = firstSentence(text);
        if (seenSentences.has(fs)) continue; // first sentence already seen — skip
        allSentences(text).forEach(s => seenSentences.add(s)); // register all sentences
        beats.push(storyifyBeat(text));
      }

      // Fill remaining from podcast pipeline (DICT/cloud) with same sentence-level dedup
      // Note: lacksFirstPerson is NOT applied here — DICT entries are curated character voice
      // and many are intentionally third-person synopsis entries, which are still valid beats.
      if (beats.length < beatCount) {
        for (let i = 0; beats.length < beatCount && i < beatCount * 3; i++) {
          const result = await buildPodcastAutonomousMuseReply(question, { movie: currentMovie, ctx });
          const raw = result ? String(result.response || '').trim() : '';
          const text = intraDedup(raw);
          if (!text || isCriticVoice(text)) continue;
          const fs = firstSentence(text);
          if (seenSentences.has(fs)) continue;
          allSentences(text).forEach(s => seenSentences.add(s));
          beats.push(storyifyBeat(text));
        }
      }

      // Ultimate fallback: draw directly from brain memory (trained + persona seeds).
      // _fallbackReply only serves synopsis entries for abstract questions;
      // the memory pool contains richer first-person entries from training.
      if (beats.length < beatCount) {
        const memPool = loadMemories(currentMovie)
          .map(m => String(m?.response || '').trim())
          .filter(r => r && !isCriticVoice(r));
        // Shuffle for variety across story mode runs
        for (let i = memPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [memPool[i], memPool[j]] = [memPool[j], memPool[i]];
        }
        for (const response of memPool) {
          if (beats.length >= beatCount) break;
          const text = intraDedup(response);
          if (!text) continue;
          const fs = firstSentence(text);
          if (seenSentences.has(fs)) continue;
          allSentences(text).forEach(s => seenSentences.add(s));
          beats.push(storyifyBeat(text));
        }
      }

      return beats;
    };

    // Split long cloud text into sentence-level beats of ~nSentences each
    const splitBeats = (text, nSentences = 3) => {
      const sentences = text.match(/[^.!?…]+[.!?…]+(?:\s|$)/g) || [text];
      const beats = [];
      for (let i = 0; i < sentences.length; i += nSentences) {
        const chunk = sentences.slice(i, i + nSentences).join('').trim();
        if (chunk) beats.push(storyifyBeat(chunk));
      }
      return beats;
    };

    // Queue a beat: split into individual sentences so each gets its own TTS prosody reset.
    // This is the biggest factor in natural-sounding delivery — paragraph-as-one-utterance
    // applies a flat intonation; sentence-per-utterance lets the engine breathe naturally.
    const queueStoryBeat = (text, voiceProfile, isLast = false) => {
      const sentences = text.match(/[^.!?…]+[.!?…]+(?:\s|$)/g);
      if (!sentences || sentences.length <= 1) {
        // Short or unpunctuated — single utterance
        podcastEngine.queueLine(text.trim(), 'hostB', {
          force: false,
          voiceOpts: voiceProfile,
          pauseAfterMs: isLast ? 300 : BEAT_PAUSE_MS
        });
        return;
      }
      // Multiple sentences — each gets its own queue entry with a small breath gap
      sentences.forEach((sentence, idx) => {
        const isLastSentence = idx === sentences.length - 1;
        podcastEngine.queueLine(sentence.trim(), 'hostB', {
          force: false,
          voiceOpts: voiceProfile,
          pauseAfterMs: isLastSentence ? (isLast ? 300 : BEAT_PAUSE_MS) : 160
        });
      });
    };

    // Reveal chat panel
    revealAiChatPanel({ focusInput: false });
    selectedConversationSurfaceMode = 'podcast';
    updateConversationModeUi();

    // --- Act 1: Host A → Q1 → Muse ~2 min story (4 beats) ---
    podcastEngine.queueLine(q1, 'hostA', { force: true });

    let act1Beats = [];
    const cloudReply1 = await callMuseCloud(q1, 12);
    if (cloudReply1) {
      act1Beats = splitBeats(cloudReply1, 3);
    } else {
      act1Beats = await callMuseLocal(q1, 4);
    }

    act1Beats.forEach((beat, i) =>
      queueStoryBeat(beat, ACT1_VOICE[i % ACT1_VOICE.length], i === act1Beats.length - 1)
    );
    const act1Full = intraDedup(act1Beats.join(' '));
    let anySaved = false;
    if (act1Full) {
      saveMemory(currentMovie, q1, act1Full);
      anySaved = true;
      // Register all sentences in global blocklist so subsequent story runs don't repeat them
      act1Beats.forEach(beat =>
        allSentences(beat).forEach(s => {
          recentPodcastHostAnswerLines = rememberRecentPodcastLine(recentPodcastHostAnswerLines, s);
        })
      );
    }

    // --- Act 2: Host A → Q2 → Muse ~1 min continue (2 beats) ---
    await new Promise(r => setTimeout(r, 800));
    podcastEngine.queueLine(q2, 'hostA', { force: false });

    let act2Beats = [];
    const cloudReply2 = await callMuseCloud(q2, 6);
    if (cloudReply2) {
      act2Beats = splitBeats(cloudReply2, 3);
    } else {
      act2Beats = await callMuseLocal(q2, 2);
    }

    act2Beats.forEach((beat, i) =>
      queueStoryBeat(beat, ACT2_VOICE[i % ACT2_VOICE.length], i === act2Beats.length - 1)
    );
    const act2Full = intraDedup(act2Beats.join(' '));
    if (act2Full) {
      saveMemory(currentMovie, q2, act2Full);
      anySaved = true;
      act2Beats.forEach(beat =>
        allSentences(beat).forEach(s => {
          recentPodcastHostAnswerLines = rememberRecentPodcastLine(recentPodcastHostAnswerLines, s);
        })
      );
    }

    if (anySaved) appendChatMessage('assistant', '🎙 Story saved to brain memory.');
  }

  async function submitChatFromInput() {
    const text = aiChatInput?.value?.trim();
    if (!text) return;

    const keyMatch = text.match(/^\/key\s+(.+)$/i);
    if (keyMatch && voiceManager?.setGeminiKey) {
      const key = keyMatch[1].trim();

      if (/your_api_key/i.test(key) || !/^AIza[\w-]{20,}$/.test(key)) {
        if (aiChatInput) aiChatInput.value = '';
        appendChatMessage('assistant', 'Invalid key format. Use `/key AIza...` with a real Gemini API key.');
        setChatEnabled(true, 'Local fallback mode (invalid key format)');
        return;
      }

      setChatEnabled(false, 'Validating Gemini key…');
      voiceManager.setGeminiKey(key);
      const validation = voiceManager.validateCurrentGeminiKey
        ? await voiceManager.validateCurrentGeminiKey()
        : { ok: true, message: 'Gemini key updated.' };

      if (aiChatInput) aiChatInput.value = '';

      if (validation.ok) {
        appendChatMessage('assistant', validation.message || 'Gemini key validated. Cloud mode is active.');
        const statusLabel = /quota/i.test(validation.message || '')
          ? 'Cloud mode ready (quota limited)'
          : 'Cloud mode ready';
        setChatEnabled(true, statusLabel);
      } else {
        voiceManager.setGeminiKey('');
        appendChatMessage('assistant', `Gemini key failed validation: ${validation.message}`);
        setChatEnabled(true, 'Local fallback mode (Gemini key invalid)');
      }

      return;
    }

    if (/^\/keyclear$/i.test(text) && voiceManager?.setGeminiKey) {
      voiceManager.setGeminiKey('');
      if (aiChatInput) aiChatInput.value = '';
      appendChatMessage('assistant', 'Gemini key cleared. Chat will use local fallback mode until a new key is set.');
      setChatEnabled(true, 'Local fallback mode (no Gemini key)');
      return;
    }

    // /key2 KEY · add an extra API key to the rotation pool
    const key2Match = text.match(/^\/key2\s+(.+)$/i);
    if (key2Match && voiceManager?.addGeminiKey) {
      const k = key2Match[1].trim();
      if (!/^AIza[\w-]{20,}$/.test(k)) {
        if (aiChatInput) aiChatInput.value = '';
        appendChatMessage('assistant', 'Invalid key format. Use `/key2 AIza...` with a real Gemini API key.');
        return;
      }
      const added = voiceManager.addGeminiKey(k);
      if (aiChatInput) aiChatInput.value = '';
      const poolSize = voiceManager._getKeyPool().length;
      appendChatMessage('assistant', added
        ? `Extra key added to rotation pool (${poolSize} key${poolSize !== 1 ? 's' : ''} total). When your primary key hits 429 quota, the next key activates automatically.`
        : 'That key is already in the rotation pool.');
      return;
    }

    // /cache · dictionary info and management
    if (/^\/cache\s+clear$/i.test(text) && voiceManager?.clearCache) {
      const count = voiceManager.clearCache();
      if (aiChatInput) aiChatInput.value = '';
      appendChatMessage('assistant', `Dictionary cleared \u2014 removed ${count} cached response${count !== 1 ? 's' : ''}.`);
      return;
    }
    if (/^\/cache$/i.test(text) && voiceManager?.cacheSize) {
      const size = voiceManager.cacheSize();
      const poolSize = voiceManager._getKeyPool?.().length || 1;
      if (aiChatInput) aiChatInput.value = '';
      appendChatMessage('assistant', `Dictionary: ${size} cached response${size !== 1 ? 's' : ''}. Key pool: ${poolSize} key${poolSize !== 1 ? 's' : ''}. Commands: \`/cache clear\` to reset \u2014 \`/key2 AIza...\` to add a rotation key.`);
      return;
    }

    const trainMatch = text.match(/^\/(?:train|trainbrain)(?:\s+(\d+(?:\.\d+)?))?$/i);
    if (trainMatch && voiceManager?.trainBrainFromCloud) {
      if (aiChatInput) aiChatInput.value = '';
      await runSelectedModeTraining(Number(trainMatch[1] || 5), { source: 'chat command', echoCommand: text });
      return;
    }

    const localModelMatch = text.match(/^\/(?:brainmodel|localmodel)\s+([^\s]+)$/i);
    const localModelAliasMatch = text.match(/^\/(gptoss|gemma|phi|phi4|phi4-mini|phi4mini)$/i);
    if ((localModelMatch || localModelAliasMatch) && voiceManager?.setLocalBrainModel) {
      const aliasValue = (localModelAliasMatch?.[1] || '').toLowerCase();
      const requestedRaw = localModelMatch?.[1] || aliasValue;
      const aliasMap = {
        gptoss: 'gpt-oss:20b',
        gemma: 'gemma3:4b',
        'gemma4': 'gemma4',
        phi: 'phi4:latest',
        phi4: 'phi4:latest',
        'phi4-mini': 'phi4-mini',
        phi4mini: 'phi4-mini'
      };
      const requestedModel = aliasMap[String(requestedRaw || '').toLowerCase()] || String(requestedRaw || '').trim();
      if (aiChatInput) aiChatInput.value = '';
      const ready = await voiceManager.setLocalBrainModel(requestedModel);
      if (!ready) {
        appendChatMessage('assistant', `Local brain model unavailable: ${requestedModel}.`);
        return;
      }
      if (voiceManager.getPreferredMode?.() !== 'cloud') {
        voiceManager.onAiEngineChange?.('ollama-ready');
        setChatEnabled(true, `?? Brain mode active · responding via ${requestedModel} on ${voiceManager?.getLocalBrainBackendLabel?.() || 'Ollama'}`);
      }
      const experimentalNote = /^gpt-oss(?::|$)/i.test(requestedModel)
        ? ' This model is experimental for chat and may fall back if it returns no spoken content.'
        : '';
      appendChatMessage('assistant', `?? Local brain chat model set to ${requestedModel}. Training stays on gemma3:4b.${experimentalNote}`);
      return;
    }

    // /local [N] · run local Gemma training directly (no cloud needed)
    const localTrainMatch = text.match(/^\/(?:local|trainlocal|gemmatrain)(?:\s+(\d+(?:\.\d+)?))?$/i);
    if (localTrainMatch && voiceManager?.trainBrainLocally) {
      if (aiChatInput) aiChatInput.value = '';
      await runLocalBrainTraining(Number(localTrainMatch[1] || 5), { echoCommand: text });
      return;
    }

    if (!isVoiceCloneReady) {
      setChatEnabled(false, 'Analyze a movie first to unlock chat');
      showAiSpeech('Load and analyze a movie first', false);
      return;
    }

    // Check for general voice commands (fallback for text input)
    const generalCommand = parseGeneralVoiceCommand(text);
    if (generalCommand) {
      appendChatMessage('user', text);
      if (aiChatInput) aiChatInput.value = '';
      const ok = await executeGeneralVoiceCommand(generalCommand);
      if (!ok) {
        appendChatMessage('assistant', `Command failed: ${generalCommand.action}`);
      } else if (!/^mode-(cloud|brain|gemma|dict|podcast|chat)$/.test(generalCommand.action)) {
        appendChatMessage('assistant', `Executed: ${generalCommand.action}`);
      }
      return;
    }

    // Check for playlist voice commands (fallback for text input)
    const playlistCommand = parsePlaylistVoiceCommand(text);
    if (playlistCommand) {
      appendChatMessage('user', text);
      if (aiChatInput) aiChatInput.value = '';
      let outcome = null;

      if (playlistCommand.action === 'play-index') {
        outcome = await playPlaylistIndex(playlistCommand.index);
      } else if (playlistCommand.action === 'next') {
        const nextIndex = Math.min(currentPlaylistIndex + 1, playlistFiles.length - 1);
        outcome = await playPlaylistIndex(nextIndex);
      } else if (playlistCommand.action === 'previous') {
        const prevIndex = Math.max(currentPlaylistIndex - 1, 0);
        outcome = await playPlaylistIndex(prevIndex);
      }

      if (!outcome?.ok && outcome?.reason) {
        appendChatMessage('assistant', `Playlist command failed: ${outcome.reason}`);
      } else {
        appendChatMessage('assistant', `Playlist updated.`);
      }
      return;
    }

    appendChatMessage('user', text);
    if (aiChatInput) aiChatInput.value = '';
    const shouldAutoStartPodcastFromChat = Boolean(
      publicPodcastAiEnabled
      && selectedConversationSurfaceMode === 'podcast'
      && !isPodcastConversationSurfaceActive()
    );
    if (shouldAutoStartPodcastFromChat) {
      setInlineActivity('thinking');
      try {
        await startPublicPodcastAiConversation({ seedPrompt: text });
      } finally {
        setInlineActivity('');
      }
      return;
    }
    if (isPodcastGuestParticipationEnabled()) {
      setInlineActivity('thinking');
      try {
        const handled = await handlePodcastGuestPrompt(text, { source: 'chat', skipUserEcho: true });
        if (handled) return;
      } finally {
        setInlineActivity('');
      }
    }
    if (await maybeHandleGroundedFreeChatReply(text, { source: 'chat' })) {
      return;
    }
    setChatEnabled(false, 'Synthesizing response\u2026');
    setInlineActivity('thinking');

    try {
      if (!brainTrainingInFlight) beginFreeChatSeedCapture(text, 'chat');
      await voiceManager.respondTo(text);
    } catch (e) {
      appendChatMessage('assistant', 'Signal lost in the static. Try again.');
    } finally {
      pendingFreeChatSeedCapture = null;
      setInlineActivity('');
      setChatEnabled(true, '');
    }
  }



  function enterVideoMode() {
    isVideoMode = true;
    videoControls.classList.remove('hidden');
    document.body.classList.add('video-mode-active');
  }

  function exitVideoMode() {
    isVideoMode = false;
    videoControls.classList.add('hidden');
    document.body.classList.remove('video-mode-active');
    scene3d.removeVideo();
    stopPublicPodcastAiConversation();
    renderPlayPauseButton(false);
  }

  // ─── VIDEO IMPORT ───
  async function handleVideoFile(file, options = {}) {
    if (!file) return;

    const rawPath = typeof file?.path === 'string' ? file.path.trim() : '';
    const rawStringSource = typeof file === 'string' ? file.trim() : '';
    const rawMovieFileName = (
      file?.name
      || (rawPath ? rawPath.split('/').pop() : '')
      || (rawStringSource ? rawStringSource.split('/').pop() : '')
      || ''
    ).trim();
    const movieFileName = (rawMovieFileName || 'Synthetic_Desires_1.mp4').trim();
    const isSdMovie = /synthetic_desires_[1-7]/i.test(movieFileName);

    let source = file;
    if (file instanceof File) {
      if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file (MP4, WebM, MOV)');
        return;
      }
      source = file;
    } else if (rawPath) {
      source = rawPath;
    } else if (rawStringSource) {
      source = rawStringSource;
    } else if (rawMovieFileName && isSdMovie) {
      source = `${R2_BASE}/${movieFileName}`;
    } else {
      alert('Failed to load video. No video source was available for this selection.');
      return;
    }

    const shouldResumePublicPodcastAiAfterMovieChange = Boolean(publicPodcastAiEnabled && publicPodcastAiAutoMode);
    const shouldPreserveConversationSurfaceMode = Boolean(publicPodcastAiEnabled);
    stopPublicPodcastAiConversation({
      preserveAutoMode: shouldResumePublicPodcastAiAfterMovieChange,
      preserveSelection: shouldPreserveConversationSurfaceMode,
      movieSwitch: shouldResumePublicPodcastAiAfterMovieChange
    });

    // ── AGGRESSIVE audio cleanup to prevent bleed ──
    // 1. Remove sync listeners FIRST (they can re-trigger play)
    if (window._bgSyncCleanup) {
      window._bgSyncCleanup();
      window._bgSyncCleanup = null;
    }
    // 2. Increment generation counter to invalidate any async play calls
    window._bgAudioGeneration = (window._bgAudioGeneration || 0) + 1;
    // 3. Stop and fully unload bgAudio
    bgAudio.pause();
    bgAudio.removeAttribute('src');
    if (window._bgAudioBlobUrl) {
      URL.revokeObjectURL(window._bgAudioBlobUrl);
      window._bgAudioBlobUrl = null;
    }
    bgAudio.load(); // forces browser to release the old audio buffer
    bgAudioActive = false;
    // 4. Stop the old video element's own audio
    const prevVm = scene3d?.getVideoMesh?.();
    if (prevVm?.videoElement) {
      prevVm.videoElement.pause();
      prevVm.videoElement.muted = true;
      prevVm.videoElement.volume = 0;
      // Remove all event listeners by cloning (nuclear option)
      prevVm.videoElement.onplay = null;
      prevVm.videoElement.onpause = null;
    }

    // Clear chat dialogs whenever movie changes.
    if (aiChatMessages) aiChatMessages.innerHTML = '';
    if (aiChatInput) aiChatInput.value = '';
    if (videoSeek) videoSeek.value = 0;
    if (suggestionEngine) suggestionEngine.hide();

    // Update Minimal Player Text
    if (mpTitle) {
      const titleLabel = movieFileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      safeSetText(mpTitle, titleLabel);
    }
    if (mpArtist) {
      safeSetText(mpArtist, isSdMovie ? 'by Synthetic Desire' : 'Imported Media');
    }

    videoDropzone.classList.add('hidden');

    if (options?.primeAudioDuringGesture) {
      const isSd3 = /synthetic_desires_3/i.test(movieFileName);
      const hasOwnAudio = !isSdMovie || !isSd3;
      const initialAudioSource = hasOwnAudio
        ? (source?.path || source || `${R2_BASE}/${movieFileName}`)
        : `${R2_BASE}/Synthetic_Desires_1.mp4`;

      if (typeof initialAudioSource === 'string' && initialAudioSource.trim()) {
        const resolvedPrimedSrc = new URL(initialAudioSource, location.href).href;
        if (bgAudio.currentSrc !== resolvedPrimedSrc) {
          bgAudio.src = initialAudioSource;
          bgAudio.load();
        } else if (bgAudio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
          bgAudio.load();
        }
        bgAudio.volume = DEFAULT_MOVIE_AUDIO_VOLUME;
        bgAudio.muted = false;
        bgAudio.loop = !hasOwnAudio;
        bgAudio.play().catch(() => { });
      }
    }

    try {
      const info = await scene3d.loadVideo(source);
      console.log('Video loaded:', info);

      // Keep all movies at the mesh's computed fill size.
      const vmAfterLoad = scene3d.getVideoMesh();
      if (vmAfterLoad?.mesh) {
        vmAfterLoad.mesh.scale.set(1, 1, 1);
      }

      // Generate and display question suggestions for the movie
      if (suggestionEngine) {
        const brain = voiceManager?.currentMovieBrain || resolveMovieBrain(movieFileName);
        suggestionEngine.generateSuggestions(brain);
        suggestionEngine.render();
      }

      // Audio strategy: always keep the video element muted (browsers allow
      // muted autoplay) and route ALL audio through the separate bgAudio element.
      // SD 1, 2 & 4 have their own audio tracks → bgAudio.src = that video's path.
      // SD 3 is silent → bgAudio.src = SD 1's path (background music).
      if (scene3d.videoMesh && scene3d.videoMesh.videoElement) {
        const vid = scene3d.videoMesh.videoElement;
        // Always mute the video element to avoid autoplay blocks
        vid.muted = true;
        vid.volume = 0;

        // Remove previous sync listeners to prevent accumulation
        if (window._bgSyncCleanup) {
          window._bgSyncCleanup();
          window._bgSyncCleanup = null;
        }

        const isSd3 = /synthetic_desires_3/i.test(movieFileName);
        // Uploaded movies (non-SD) or SD movies other than 3 have their own audio
        const hasOwnAudio = !isSdMovie || !isSd3;

        let audioSource = hasOwnAudio
          ? (source?.path || source || `${R2_BASE}/${movieFileName}`)
          : `${R2_BASE}/Synthetic_Desires_1.mp4`;

        // Handle File objects for bgAudio (needs Blob URL)
        let cleanupBlobUrl = null;
        if (audioSource instanceof File) {
          audioSource = URL.createObjectURL(audioSource);
          cleanupBlobUrl = audioSource;
        }

        // Only reload bgAudio if source actually changed
        const resolvedSrc = (typeof audioSource === 'string')
          ? new URL(audioSource, location.href).href
          : audioSource;

        if (bgAudio.currentSrc !== resolvedSrc) {
          bgAudio.src = audioSource;
          bgAudio.load();
        } else if (bgAudio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
          bgAudio.load();
        }

        // If we created a temporary blob URL, we should ideally track it for revocation
        // but for now let's just ensure it plays.
        if (cleanupBlobUrl) {
          // Optionally store for later revocation if movie changes again
          window._bgAudioBlobUrl = cleanupBlobUrl;
        }

        bgAudioActive = true;
        bgAudio.currentTime = 0;
        bgAudio.volume = DEFAULT_MOVIE_AUDIO_VOLUME;
        bgAudio.muted = false;
        bgAudio.loop = !hasOwnAudio; // loop background music for SD3, don't loop for SD1/2/4
        clearBgAudioResumeHandler();
        bgAudio.play().catch(() => {
          queueBgAudioResume();
        });

        // Sync bgAudio with video playback time for videos with own audio
        if (hasOwnAudio) {
          const gen = window._bgAudioGeneration || 0;
          const isStale = () => (window._bgAudioGeneration || 0) !== gen;
          const syncAudio = () => {
            if (isStale()) return;
            if (Math.abs(bgAudio.currentTime - vid.currentTime) > 0.3) {
              bgAudio.currentTime = vid.currentTime;
            }
          };
          const onPlay = () => { if (!isStale()) bgAudio.play().catch(() => { }); };
          const onPause = () => { if (!isStale()) bgAudio.pause(); };
          vid.addEventListener('seeked', syncAudio);
          vid.addEventListener('play', onPlay);
          vid.addEventListener('pause', onPause);
          // Store cleanup so we can remove these when switching videos
          window._bgSyncCleanup = () => {
            vid.removeEventListener('seeked', syncAudio);
            vid.removeEventListener('play', onPlay);
            vid.removeEventListener('pause', onPause);
          };
        }

        if (btnMute) btnMute.textContent = '🔊';
      }

      // Trigger Voice Analysis ("Cloning")
      if (voiceManager) {
        voiceManager.setMovieContext?.(movieFileName);
        // Give voiceManager a reference to the video element so it can capture frames
        voiceManager.setVideoElement?.(scene3d.videoMesh.videoElement);
        showAiSpeech("Analyzing vocal DNA...", true);
        const profile = await voiceManager.analyzeVideoAudio(scene3d.videoMesh.videoElement);
        showAiSpeech(`Voice Cloned: ${profile.name}`, true);

        // Build persona: Cloud-first priority, then Brain fallback
        const rawName = (typeof file !== 'undefined' && file?.name)
          ? file.name.replace(/\.[^.]+$/, '')
          : 'Synthetic Desires X';

        // Try Cloud (Gemini) first · gives the richest context
        // Do this in background so chat is usable immediately (no blocking delay).
        const hasCloudServerProxy = Boolean(voiceManager?.hasServerGeminiProxy?.());
        const currentPersonaGen = ++personaBuildGeneration;
        const isCurrentPersonaGen = () => currentPersonaGen === personaBuildGeneration;

        isVoiceCloneReady = true;
        // Only reset to cloud if the user hasn't explicitly pinned a local mode.
        // Gemma/Dict pins should survive a movie switch.
        const userHasPinnedLocal = voiceManager?.isForceLocalGemmaEnabled?.() === true
            || voiceManager?.isForceDictModeEnabled?.() === true
            || voiceManager?.getPreferredMode?.() === 'split';
        if (!userHasPinnedLocal) {
          setAiModeIndicator('cloud');
          voiceManager.setPreferredMode?.('cloud');
        }
        setChatEnabled(true, '?? Cloud mode active · persona analyzing·');
        
        // Generate and display question suggestions for the movie
        if (suggestionEngine) {
          const brain = voiceManager?.currentMovieBrain || resolveMovieBrain(movieFileName);
          suggestionEngine.generateSuggestions(brain);
          suggestionEngine.render();
        }
        
        showAiSpeech('?? Cloud AI ready · refining persona in background', true);

        Promise.resolve()
          .then(() => voiceManager.buildPersonaContext(rawName))
          .then((geminiReady) => {
            if (!isCurrentPersonaGen()) return;
            const allowCloudUiTakeover = voiceManager?.getPreferredMode?.() === 'cloud'
              && voiceManager?.isForceLocalGemmaEnabled?.() !== true;

            if (geminiReady) {
              if (!allowCloudUiTakeover) {
                syncChatStatusFromMode({ force: true });
                return;
              }
              // Cloud succeeded ? use cloud mode, brain fallback is now cloud-enhanced
              voiceManager.setPreferredMode?.('cloud');
              setAiModeIndicator('cloud');
              setChatEnabled(true, '?? Cloud persona active · Gemini AI ready');
              showAiSpeech('?? Cloud AI persona loaded', true);
              return;
            }

            if (hasCloudServerProxy && isSdMovie) {
              if (!allowCloudUiTakeover) {
                syncChatStatusFromMode({ force: true });
                return;
              }
              // When a server proxy is available, persona warmup can miss transiently
              // without meaning Cloud chat is unavailable. Stay in Cloud.
              voiceManager.setPreferredMode?.('cloud');
              setAiModeIndicator('cloud');
              setChatEnabled(true, '?? Cloud mode active');
              showAiSpeech('?? Cloud AI ready', true);
              return;
            }

            if (!allowCloudUiTakeover) {
              syncChatStatusFromMode({ force: true });
              return;
            }

            // Cloud failed - handle based on movie type
            if (isSdMovie) {
              if (voiceManager && voiceManager._ollamaAvailable !== false) {
                 voiceManager.setPreferredMode?.('brain');
                 setAiModeIndicator('brain');
                 setChatEnabled(true, '?? Brain mode auto-activated (Cloud unavailable)');
                 showAiSpeech('?? Using local Brain AI', true);
                 appendPersonaStatusMessage('?? Cloud unavailable. Auto-switched to Brain (Local AI).');
              } else {
                 voiceManager.setPreferredMode?.('cloud');
                 setAiModeIndicator('cloud');
                 setChatEnabled(true, '?? Cloud mode active · tap Brain to switch manually');
                 showAiSpeech('?? Cloud persona unavailable · tap Brain to switch manually', true);
                 appendChatMessage('assistant', '?? Cloud persona unavailable. Brain is available only if you switch manually.');
              }
            } else {
              voiceManager.setPreferredMode?.('cloud');
              setAiModeIndicator('cloud');
              setChatEnabled(false, '?? Cloud AI required for imported movies');
              showAiSpeech('?? Cloud AI Required', true);
              appendChatMessage('assistant', '?? IMPORT ERROR: This movie requires Cloud AI analysis. The local Brain cannot analyze imported files. Please set a Gemini API key to continue.');
            }
          })
          .catch(() => {
            if (!isCurrentPersonaGen()) return;
            if (isSdMovie) {
              if (voiceManager && voiceManager._ollamaAvailable !== false) {
                 voiceManager.setPreferredMode?.('brain');
                 setAiModeIndicator('brain');
                 setChatEnabled(true, '?? Brain mode auto-activated (Cloud unavailable)');
                 showAiSpeech('?? Using local Brain AI', true);
                 appendPersonaStatusMessage('?? Cloud unavailable. Auto-switched to Brain (Local AI).');
              } else {
                 voiceManager.setPreferredMode?.('cloud');
                 setAiModeIndicator('cloud');
                 setChatEnabled(true, '?? Cloud mode active · tap Brain to switch manually');
                 showAiSpeech('?? Cloud persona unavailable · tap Brain to switch manually', true);
              }
            } else {
              setChatEnabled(false, '?? Cloud AI required for imported movies');
            }
          });
      }

      enterVideoMode();
      renderPlayPauseButton(true);
      if (shouldResumePublicPodcastAiAfterMovieChange) {
        resumePublicPodcastAiAfterMovieChange(movieFileName);
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      if (shouldResumePublicPodcastAiAfterMovieChange) {
        stopPublicPodcastAiConversation();
      }
      console.error('Failed to load video:', err);
      const message = (err && err.message) ? err.message : 'Unknown media error';
      alert(`Failed to load video. ${message}`);
    }
  }

  function normalizeMovieRouterText(value = '') {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenizeMovieRouterText(value = '') {
    return normalizeMovieRouterText(value)
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length >= 3);
  }

  function buildMovieContentCorpus(movieName = '') {
    const brain = resolveMovieBrain(movieName) || {};
    const dictionaryValues = Object.values(brain?.dictionary || {}).flatMap((value) => Array.isArray(value) ? value : [value]);
    const segments = [
      movieName.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
      brain?.theme,
      brain?.notebookContext,
      brain?.fallbackPersonality,
      brain?.persona?.tone,
      ...(brain?.persona?.obsessions || []),
      ...(brain?.trainingSeeds?.themes || []),
      ...(brain?.trainingSeeds?.references || []),
      ...(brain?.trainingSeeds?.story || []),
      ...(brain?.trainingSeeds?.symbols || []),
      ...Object.keys(brain?.dictionary || {}),
      ...dictionaryValues,
    ];
    return normalizeMovieRouterText(segments.filter(Boolean).join(' '));
  }

  function rankMoviesByContent(content = '', limit = 5) {
    const normalizedContent = normalizeMovieRouterText(content);
    const tokens = tokenizeMovieRouterText(content);
    if (!normalizedContent || !tokens.length) return [];

    return Object.keys(movieBrains)
      .map((movieName) => {
        const corpus = buildMovieContentCorpus(movieName);
        let score = 0;
        const matchedTokens = [];

        for (const token of tokens) {
          if (!corpus.includes(token)) continue;
          matchedTokens.push(token);
          const occurrences = corpus.split(token).length - 1;
          score += 2 + Math.min(occurrences, 4);
        }

        if (corpus.includes(normalizedContent)) score += 8;

        return {
          movieName,
          score,
          matchedTokens: Array.from(new Set(matchedTokens)).slice(0, 8),
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Number(limit || 1)));
  }

  const defaultMovieContentRotation = [
    'poor image neon archive retro future decay',
    'fashion luxury gaze runway beauty capitalism',
    'surveillance identity machine exam synthetic body',
    'desire ritual memory dream collapse cinematic myth',
  ];

  let movieContentRotationTimer = null;
  let movieContentRotationIndex = 0;
  let movieContentRotationBusy = false;
  let movieContentRotationMode = 'interval';
  let movieContentRotationPlayAllActive = false;
  let movieContentRotationDirectList = [];
  let movieContentRotationEndedHandler = null;
  let movieContentRotationPrompts = [...defaultMovieContentRotation];

  function detachMovieRotationEndedHandler(videoEl = scene3d?.getVideoMesh?.()?.videoElement) {
    if (videoEl && movieContentRotationEndedHandler) {
      videoEl.removeEventListener('ended', movieContentRotationEndedHandler);
    }
    movieContentRotationEndedHandler = null;
  }

  function waitForPodcastIdle(timeoutMs = 30000) {
    return new Promise(resolve => {
      const deadline = Date.now() + timeoutMs;
      function check() {
        const busy = podcastEngine && (podcastEngine.isSpeaking || (podcastEngine.queue?.length ?? 0) > 0);
        if (!busy || Date.now() >= deadline) { resolve(); return; }
        setTimeout(check, 300);
      }
      check();
    });
  }

  function syncMovieRotationPlaybackMode(videoEl = scene3d?.getVideoMesh?.()?.videoElement) {
    if (!videoEl) return;
    detachMovieRotationEndedHandler(videoEl);
    if (movieContentRotationMode === 'ended') {
      videoEl.loop = false;
      movieContentRotationEndedHandler = () => {
        if (movieContentRotationBusy || !movieContentRotationPrompts.length) return;
        void runMovieRotationStep({ trigger: 'ended' });
      };
      videoEl.addEventListener('ended', movieContentRotationEndedHandler);
      return;
    }
    videoEl.loop = true;
  }

  async function runMovieRotationStep(options = {}) {
    if (movieContentRotationBusy || !movieContentRotationPrompts.length) return;
    movieContentRotationBusy = true;
    const content = movieContentRotationPrompts[movieContentRotationIndex % movieContentRotationPrompts.length];
    movieContentRotationIndex += 1;
    try {
      await changeMovieByContent(content, options);
      syncMovieRotationPlaybackMode();
    } catch (error) {
      console.error('[MovieRouter] Failed to rotate movie by content.', error);
    } finally {
      movieContentRotationBusy = false;
    }
  }

  async function runPlayAll3MinLoop(movies) {
    movieContentRotationPlayAllActive = true;
    const timePerSlot = Math.floor(180000 / movies.length);

    for (let i = 0; i < movies.length; i++) {
      if (!movieContentRotationPlayAllActive) break;

      // Load the movie
      movieContentRotationBusy = true;
      try {
        await handleVideoFile({ name: movies[i] });
        const label = movies[i].replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        appendChatMessage('assistant', `[${i + 1}/${movies.length}] Switched to ${label}.`);
        showAiSpeech(`Loaded ${label}`, true);
      } catch (err) {
        console.error('[MovieRouter] Failed to load movie directly.', err);
      } finally {
        movieContentRotationBusy = false;
      }

      // Wait for the full time slot
      await new Promise(resolve => setTimeout(resolve, timePerSlot));

      // After slot ends, wait for AI to finish before switching to next movie
      if (i < movies.length - 1 && movieContentRotationPlayAllActive) {
        await waitForPodcastIdle(30000);
      }
    }

    if (movieContentRotationPlayAllActive) {
      movieContentRotationPlayAllActive = false;
      appendChatMessage('assistant', 'Play All complete — 3 min cycle finished.');
    }
  }

  async function changeMovieByContent(content = '', options = {}) {
    const ranked = rankMoviesByContent(content, options?.limit || 5);
    if (!ranked.length) {
      return { ok: false, message: 'No movie matched that content.', ranked: [] };
    }

    const bestMatch = ranked[0];
    await handleVideoFile({ name: bestMatch.movieName }, options);

    const label = bestMatch.movieName.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const why = bestMatch.matchedTokens.length ? `Matched: ${bestMatch.matchedTokens.join(', ')}` : 'Matched by overall context.';
    appendChatMessage('assistant', `Switched movie to ${label}. ${why}`);
    showAiSpeech(`Loaded ${label}`, true);

    return {
      ok: true,
      movieName: bestMatch.movieName,
      ranked,
      matchedTokens: bestMatch.matchedTokens,
    };
  }

  function stopMovieContentRotation() {
    if (movieContentRotationTimer) {
      window.clearInterval(movieContentRotationTimer);
      movieContentRotationTimer = null;
    }
    movieContentRotationMode = 'interval';
    movieContentRotationPlayAllActive = false;
    movieContentRotationDirectList = [];
    detachMovieRotationEndedHandler();
    syncMovieRotationPlaybackMode();
    movieContentRotationBusy = false;
    return { ok: true, running: false };
  }

  function startMovieContentRotation(contentInputs = defaultMovieContentRotation, options = {}) {
    const items = (Array.isArray(contentInputs) ? contentInputs : [contentInputs])
      .map(value => String(value || '').trim())
      .filter(Boolean);

    if (!items.length) {
      return { ok: false, message: 'Provide at least one content prompt.' };
    }

    stopMovieContentRotation();

    const rawMode = String(options?.mode || 'interval').toLowerCase();
    const isPlayAll3Min = rawMode === 'play-all-3min';

    const directMovies = isPlayAll3Min && Array.isArray(options?.movies) && options.movies.length
      ? options.movies
      : [];
    movieContentRotationDirectList = directMovies;
    movieContentRotationPrompts = items;
    movieContentRotationIndex = 0;

    if (isPlayAll3Min && directMovies.length) {
      // Sequential loop: each movie plays its slot, AI answer finishes, then next movie
      void runPlayAll3MinLoop(directMovies);
      const slotSec = Math.round(180000 / directMovies.length / 1000);
      appendChatMessage('assistant', `Started Play All: ${directMovies.length} movies × ~${slotSec}s = 3 min total. Waits for AI answer before each transition.`);
    } else {
      movieContentRotationMode = (rawMode === 'ended') ? 'ended' : 'interval';
      const intervalMs = Math.max(5, Number(options?.intervalSeconds || 30)) * 1000;

      if (options?.immediate !== false) {
        void runMovieRotationStep(options);
      }

      if (movieContentRotationMode === 'interval') {
        movieContentRotationTimer = window.setInterval(() => {
          void runMovieRotationStep(options);
        }, intervalMs);
        appendChatMessage('assistant', `Started content-driven movie rotation every ${Math.round(intervalMs / 1000)} seconds.`);
      } else {
        appendChatMessage('assistant', 'Started content-driven movie rotation: advance on each movie end.');
      }
    }

    return {
      ok: true,
      running: true,
      intervalSeconds: intervalMs / 1000,
      mode: movieContentRotationMode,
      prompts: items,
    };
  }

  function createMovieRotationPanel() {
    const panel = document.createElement('section');
    panel.className = 'movie-rotation-panel';
    panel.innerHTML = `
      <div class="movie-rotation-panel__header">Movie Rotation</div>
      <label class="movie-rotation-panel__label" for="movie-rotation-mode">Mode</label>
      <select id="movie-rotation-mode" class="movie-rotation-panel__input">
        <option value="play-all-3min">Play All · 3 min, finish answer</option>
        <option value="interval">Every N seconds</option>
        <option value="ended">After movie ends</option>
      </select>
      <label class="movie-rotation-panel__label" id="movie-rotation-movies-label" for="movie-rotation-movies">Movies (e.g. 1,3,4)</label>
      <input id="movie-rotation-movies" class="movie-rotation-panel__input" type="text" placeholder="1,3,4" value="1,3,4" />
      <label class="movie-rotation-panel__label" for="movie-rotation-interval">Interval (sec)</label>
      <input id="movie-rotation-interval" class="movie-rotation-panel__input" type="number" min="5" step="5" value="30" />
      <label class="movie-rotation-panel__label" for="movie-rotation-prompts">Content Prompts</label>
      <textarea id="movie-rotation-prompts" class="movie-rotation-panel__textarea" rows="5">${defaultMovieContentRotation.join('\n')}</textarea>
      <div class="movie-rotation-panel__actions">
        <button type="button" class="movie-rotation-panel__button" data-action="start">Start</button>
        <button type="button" class="movie-rotation-panel__button movie-rotation-panel__button--secondary" data-action="stop">Stop</button>
      </div>
      <div class="movie-rotation-panel__status" data-role="status">Idle</div>
    `;

    const intervalInput = panel.querySelector('#movie-rotation-interval');
    const modeInput = panel.querySelector('#movie-rotation-mode');
    const promptsInput = panel.querySelector('#movie-rotation-prompts');
    const moviesLabel = panel.querySelector('#movie-rotation-movies-label');
    const moviesInput = panel.querySelector('#movie-rotation-movies');
    const statusEl = panel.querySelector('[data-role="status"]');
    const startButton = panel.querySelector('[data-action="start"]');
    const stopButton = panel.querySelector('[data-action="stop"]');

    function syncPanelVisibility() {
      const isPlayAll = modeInput?.value === 'play-all-3min';
      [moviesLabel, moviesInput].forEach(el => { if (el) el.style.display = isPlayAll ? '' : 'none'; });
    }
    syncPanelVisibility();
    modeInput?.addEventListener('change', syncPanelVisibility);

    startButton?.addEventListener('click', () => {
      const prompts = String(promptsInput?.value || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      const intervalSeconds = Math.max(5, Number(intervalInput?.value || 30));
      const mode = String(modeInput?.value || 'interval').toLowerCase();
      const moviesRaw = String(moviesInput?.value || '');
      const movies = moviesRaw.split(',').map(s => s.trim()).filter(Boolean).map(n => `Synthetic_Desires_${n}.mp4`);
      const result = startMovieContentRotation(prompts, { intervalSeconds, mode, movies: movies.length ? movies : undefined });
      statusEl.textContent = result.ok
        ? (mode === 'play-all-3min' ? `Running: Play All · 3 min, finish answer (movies: ${moviesRaw})`
          : mode === 'ended' ? 'Running until each movie ends'
          : `Running every ${intervalSeconds}s`)
        : (result.message || 'Could not start rotation.');
    });

    stopButton?.addEventListener('click', () => {
      stopMovieContentRotation();
      statusEl.textContent = 'Stopped';
    });

    document.body.appendChild(panel);
  }

  window.changeMovieByContent = changeMovieByContent;
  window.rankMoviesByContent = rankMoviesByContent;
  window.startMovieContentRotation = startMovieContentRotation;
  window.stopMovieContentRotation = stopMovieContentRotation;
  createMovieRotationPanel();

  // ─── EVENT LISTENERS ───

  // ─── VIDEO IMPORT LISTENERS (BETA ONLY) ───
  if (isBeta) {
    // Import Video button
    if (btnImportVideo && btnImportVideo.addEventListener) {
      btnImportVideo.addEventListener('click', () => {
        videoDropzone.classList.remove('hidden');
      });
    }

    // Close dropzone
    if (btnCloseDropzone && btnCloseDropzone.addEventListener) {
      btnCloseDropzone.addEventListener('click', (e) => {
        e.stopPropagation();
        videoDropzone.classList.add('hidden');
      });
    }

    // File input change
    if (videoFileInput && videoFileInput.addEventListener) {
      videoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleVideoFile(file);
      });
    }

    // Drag & drop on dropzone
    if (videoDropzone && videoDropzone.addEventListener) {
      videoDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        videoDropzone.classList.add('drag-over');
      });

      videoDropzone.addEventListener('dragleave', () => {
        videoDropzone.classList.remove('drag-over');
      });

      videoDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        videoDropzone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleVideoFile(file);
      });
    }

    // Drag onto main page → auto-show dropzone
    document.body.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (videoDropzone && videoDropzone.classList.contains('hidden') && !isVideoMode) {
        videoDropzone.classList.remove('hidden');
      }
    });
  }

  // Play/Pause
  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      const vm = scene3d.getVideoMesh();
      if (!vm) return;
      const playing = vm.togglePlayback();
      renderPlayPauseButton(playing);
      if (bgAudioActive) {
        if (playing) bgAudio.play().catch(() => { });
        else bgAudio.pause();
      }
    });
  }

  // Flash video controls on tap (mobile hover substitute)
  let _playerFlashTimer = null;
  function flashVideoControls() {
    if (!videoControls || videoControls.classList.contains('hidden')) return;
    videoControls.classList.add('visible');
    clearTimeout(_playerFlashTimer);
    _playerFlashTimer = setTimeout(() => {
      videoControls.classList.remove('visible');
    }, 3000);
  }
  document.addEventListener('touchstart', flashVideoControls, { passive: true });
  document.addEventListener('click', flashVideoControls);

  // Mute
  if (btnMute) {
    btnMute.addEventListener('click', () => {
      const vm = scene3d.getVideoMesh();
      if (!vm) return;
      if (bgAudioActive) {
        // For silent videos, mute/unmute the background audio track
        const nowMuted = !bgAudio.muted;
        bgAudio.muted = nowMuted;
        safeSetText(btnMute, nowMuted ? '🔇' : '🔊');
        return;
      }
      const muted = vm.toggleMute();
      safeSetText(btnMute, muted ? '🔇' : '🔊');
    });
  }

  // Seek bar
  if (videoSeek) {
    videoSeek.addEventListener('input', () => {
      isSeeking = true;
    });

    videoSeek.addEventListener('change', () => {
      const vm = scene3d.getVideoMesh();
      if (vm) vm.seek(videoSeek.value / 1000);
      isSeeking = false;
      updateSeekTrack();
    });
  }

  // Update seek track visual
  function updateSeekTrack() {
    if (neoSeekTrack && videoSeek) {
      const percent = (videoSeek.value / videoSeek.max) * 100;
      neoSeekTrack.style.setProperty('--seek-percent', `${percent}%`);
    }
  }

  // Volume Slider
  if (videoVolume) {
    videoVolume.addEventListener('input', () => {
      setVolumeByPercent(parseFloat(videoVolume.value));
    });
  }

  // Prev/Next Movie Buttons
  if (btnPrevMovie) {
    btnPrevMovie.addEventListener('click', () => {
      const prevIndex = (currentPlaylistIndex - 1 + playlistFiles.length) % playlistFiles.length;
      playPlaylistIndex(prevIndex);
    });
  }
  if (btnNextMovie) {
    btnNextMovie.addEventListener('click', () => {
      const nextIndex = (currentPlaylistIndex + 1) % playlistFiles.length;
      playPlaylistIndex(nextIndex);
    });
  }

  // Close video
  if (btnCloseVideo) btnCloseVideo.addEventListener('click', () => {
    exitVideoMode();
  });

  if (btnEnableAgGesture) {
    btnEnableAgGesture.addEventListener('click', () => {
      isAntiGravity = !isAntiGravity;
      autoAntiGravityActive = false;
      scene3d.setAntiGravity(isAntiGravity);
      updateAntiGravityUI(isAntiGravity);
      updateAntiGravityGestureButton();
      
      // Show camera viewport only when Anti-Gravity is ON
      if (webcamPip) {
        webcamPip.classList.toggle('hidden', !isAntiGravity);
      }
    });
  }




  const btnShowShapes = document.getElementById('btn-show-shapes');
  if (btnShowShapes) {
    btnShowShapes.addEventListener('click', () => {
      showShapes = !showShapes;
      safeSetText(btnShowShapes, showShapes ? '👁️ Shapes' : '🙈 Shapes');
      // Also toggle internal debug shapes in Scene3D if desired
      // scene3d.toggleDebug(showShapes); 
    });
  }





  // Fullscreen
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Mic Button
  btnVoiceMic.addEventListener('click', async () => {
    if (voiceManager) {
      if (!voiceManager.isRecognitionSupported) {
        showAiSpeech('Mic unavailable in this browser. Use Chrome/Edge and allow microphone access.', false);
        appendChatMessage('assistant', 'Mic is unavailable here. Voice input needs SpeechRecognition support (Chrome/Edge on localhost or HTTPS).');
        return;
      }

      const wasListening = voiceManager.isListening || voiceManager.keepListening;
      const sessionActive = Boolean(
        wasListening
        || podcastGuestMicWindowActive
        || (isVoiceSessionActive && btnVoiceMic?.classList.contains('listening'))
      );
      lastPodcastGuestMicManualRequestAt = Date.now();

      if (sessionActive) {
        const shouldInterruptPodcastForMic = isPodcastGuestParticipationEnabled() && !wasListening;
        clearPodcastGuestMicAutoStopTimer();
        if (wasListening) {
          await (voiceManager.stopListening?.() ?? voiceManager.toggleListening());
        } else if (shouldInterruptPodcastForMic) {
          clearPublicPodcastAiContinueTimer();
          clearPendingPodcastNarration({ cancelActive: true });
          podcastEngine.isSpeaking = false;
          pausePodcastForGuestFloor();
        }
        try {
          if (voiceManager?.synthesis?.speaking || voiceManager?.synthesis?.pending) {
            voiceManager.synthesis.cancel();
          }
        } catch (_) {
          // noop
        }
        isVoiceSessionActive = false;
        if (!shouldInterruptPodcastForMic) {
          podcastGuestFloorActive = false;
          if (podcastEngine) podcastEngine.guestFloorActive = false;
        }
        if (btnVoiceMic) {
          btnVoiceMic.classList.remove('listening');
          safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
        }
        setInlineActivity('');
        restoreVideoVolume();
        if (shouldInterruptPodcastForMic) {
          const started = await startPodcastGuestMicWithHostCue({ requestAt: lastPodcastGuestMicManualRequestAt });
          if (!started) {
            clearPodcastGuestMicAutoStopTimer();
            isVoiceSessionActive = false;
            releasePodcastGuestFloor({ resume: true, delayMs: 120 });
            return;
          }
          schedulePodcastGuestMicAutoStop();
          return;
        }
        return;
      }
      if (isPodcastGuestParticipationEnabled()) {
        // Tap-to-toggle (same as free chat) · no hold-to-talk
        clearPublicPodcastAiContinueTimer();
        clearPendingPodcastNarration({ cancelActive: true });
        if (podcastEngine) podcastEngine.isSpeaking = false;
        pausePodcastForGuestFloor();
        podcastGuestFloorActive = true;
        if (podcastEngine) podcastEngine.guestFloorActive = true;
        syncTrainingPushToTalkMode();
        isVoiceSessionActive = true;
        disableAntiGravityForMic();
        if (btnVoiceMic) {
          btnVoiceMic.classList.add('listening');
          safeSetText(btnVoiceMic.querySelector('.btn-label'), 'Starting mic...');
        }
        await new Promise(resolve => setTimeout(resolve, MIC_START_DELAY_MS));
        const toggled = await (voiceManager.startListening?.() ?? voiceManager.toggleListening());
        if (!toggled) {
          isVoiceSessionActive = false;
          podcastGuestFloorActive = false;
          if (podcastEngine) podcastEngine.guestFloorActive = false;
          if (btnVoiceMic) {
            btnVoiceMic.classList.remove('listening');
            safeSetText(btnVoiceMic.querySelector('.btn-label'), MIC_IDLE_LABEL);
          }
          releasePodcastGuestFloor({ resume: true, delayMs: 120 });
        } else {
          schedulePodcastGuestMicAutoStop();
        }
        return;
      }
      const toggled = await startFreeChatMicSession();
      if (!toggled) {
        clearPodcastGuestMicAutoStopTimer();
        return;
      }
    }
  });

  // PTT removed · podcast mic now uses tap-to-toggle (handled by click above)
  btnVoiceMic.addEventListener('pointerup', stopPodcastGuestPtt);
  btnVoiceMic.addEventListener('pointercancel', stopPodcastGuestPtt);
  btnVoiceMic.addEventListener('pointerleave', stopPodcastGuestPtt);

  if (btnAiChatSend) {
    btnAiChatSend.addEventListener('click', submitChatFromInput);
  }

  if (aiChatInput) {
    aiChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitChatFromInput();
      }
    });
  }

  if (btnToggleWebcam) {
    btnToggleWebcam.addEventListener('click', toggleWebcamPlayback);
    updateWebcamToggleButton();
  }

  // Cycle Voice Button (Keyboard 'V')
  window.addEventListener('keydown', (e) => {
    if (!voiceManager) return;

    if (e.key.toLowerCase() === 'v') {
      const voiceName = voiceManager.cycleVoice();
      showAiSpeech(`Voice: ${voiceName}`, true);
    }

    // Pitch: [ ]
    if (e.key === '[') {
      voiceManager.pitch = Math.max(0.5, voiceManager.pitch - 0.1);
      showAiSpeech(`Pitch: ${voiceManager.pitch.toFixed(1)}`, true);
    } else if (e.key === ']') {
      voiceManager.pitch = Math.min(2.0, voiceManager.pitch + 0.1);
      showAiSpeech(`Pitch: ${voiceManager.pitch.toFixed(1)}`, true);
    }

    // Rate: { } (Shift + [ ])
    if (e.key === '{') {
      voiceManager.rate = Math.max(0.5, voiceManager.rate - 0.1);
      showAiSpeech(`Rate: ${voiceManager.rate.toFixed(1)}`, true);
    } else if (e.key === '}') {
      voiceManager.rate = Math.min(2.0, voiceManager.rate + 0.1);
      showAiSpeech(`Rate: ${voiceManager.rate.toFixed(1)}`, true);
    }
  });

  // Helper to show AI speech
  function showBubbleThinking() {
    if (!aiVoicePanel || !aiSpeechBubble) return;
    aiVoicePanel.classList.remove('hidden');
    aiSpeechBubble.classList.add('thinking');
    aiSpeechBubble.classList.remove('speaking');
    aiSpeechBubble.style.borderColor = 'var(--accent-secondary)';
    if (aiWave) aiWave.style.display = 'flex';
    safeSetText(aiText, '');
    if (aiSpeakTimer) clearTimeout(aiSpeakTimer);
  }

  function showAiSpeech(text, isRobot, options = {}) {
    updateConversationModeUi();
    if (aiVoicePanel) aiVoicePanel.classList.remove('hidden');
    const normalizedSpeechText = typeof text === 'string'
      ? text.replace(/^\?\?\s+/, '')
      : text;
    const bubbleText = !options?.disableQuestionAnswerPairing && isRobot
      && lastBubbleQuestionText
      && typeof normalizedSpeechText === 'string'
      && (Date.now() - lastBubbleQuestionAt) < 30000
      ? `Q: ${lastBubbleQuestionText}\nA: ${normalizedSpeechText}`
      : normalizedSpeechText;
    safeSetText(aiText, bubbleText);
    setAiSpeechStateChip(isRobot ? 'AI reply' : 'Mic live', !isRobot || isVoiceSessionActive);

    if (isRobot) {
      if (aiSpeechBubble) aiSpeechBubble.style.borderColor = 'var(--accent-secondary)';
      if (aiSpeechBubble) aiSpeechBubble.classList.remove('thinking');
      if (aiWave) aiWave.style.display = 'flex';
    } else {
      // User speaking
      if (aiSpeechBubble) aiSpeechBubble.style.borderColor = 'var(--accent-primary)';
      if (aiSpeechBubble) aiSpeechBubble.classList.remove('thinking', 'speaking');
      if (aiWave) aiWave.style.display = 'none';
    }

    if (aiSpeakTimer) clearTimeout(aiSpeakTimer);
    aiSpeakTimer = setTimeout(() => {
      aiVoicePanel.classList.add('hidden');
    }, 5000);
  }

  // ─── START ───
  init();
  // ─── PLAYLIST LOGIC ───
  // Toggle Playlist collapse
  if (btnClosePlaylist && playlistPanel) {
    btnClosePlaylist.addEventListener('click', () => {
      const collapsed = playlistPanel.classList.toggle('playlist-collapsed');
      safeSetText(btnClosePlaylist, collapsed ? '▸' : '▾');
      if (btnClosePlaylist) btnClosePlaylist.title = collapsed ? 'Expand playlist' : 'Collapse playlist';
    });
  }

  if (btnShowPlaylistNeo && playlistPanel) {
    btnShowPlaylistNeo.addEventListener('click', () => {
      playlistPanel.classList.toggle('playlist-collapsed');
    });
  }

  // Load Button
  if (btnLoadPlaylist && playlistInput) {
    btnLoadPlaylist.addEventListener('click', () => {
      playlistInput.click();
    });

    playlistInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('video/'));
      if (files.length > 0) {
        playlistFiles = [...playlistFiles, ...files];
        renderPlaylist();
      }
    });
  }

  function renderPlaylist() {
    if (!playlistItems) return;
    playlistItems.innerHTML = '';

    // Hide Load Button if playlist has items (Request 547)
    if (btnLoadPlaylist) {
      btnLoadPlaylist.style.display = playlistFiles.length > 0 ? 'none' : 'block';
    }

    if (playlistFiles.length === 0) {
      playlistItems.innerHTML = '<div class="empty-state">No movies loaded. Click folder to add.</div>';
      return;
    }

    const toPlaylistLabel = (file) => {
      const rawName = String(
        file?.name
        || (typeof file?.path === 'string' ? file.path.split('/').pop() : '')
        || 'Untitled'
      ).trim();
      return rawName.replace(/\.[^.]+$/, '');
    };

    playlistFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'playlist-item';
      safeSetText(item, toPlaylistLabel(file));
      item.dataset.index = index;

      item.addEventListener('click', () => {
        currentPlaylistIndex = index;
        setActivePlaylistItem(index);
        playMovie(file);
      });

      playlistItems.appendChild(item);
    });

    setActivePlaylistItem(currentPlaylistIndex);
  }

  function playMovie(file, options = {}) {
    const resolvedIndex = findPlaylistIndex(file);
    if (resolvedIndex >= 0) {
      currentPlaylistIndex = resolvedIndex;
      setActivePlaylistItem(resolvedIndex);
    }
    // User Requested: Collapse playlist when selecting video
    setPlaylistCollapsed(true);
    return handleVideoFile(file, options);
  }



  // Gesture pill interaction: hover to glow, pinch to fire
  function updateGesturePillDrag(hand) {
    if (!hand) {
      document.querySelectorAll('.ai-suggestion-pill.gesture-hover').forEach(p => p.classList.remove('gesture-hover'));
      if (cursorEl) cursorEl.classList.remove('pill-hover');
      gesturePrevPinching = false;
      return;
    }
    const x = (1 - hand.indexTip.x) * window.innerWidth;
    const y = hand.indexTip.y * window.innerHeight;
    const isPinching = hand.isPinching;
    const pinchStarted = isPinching && !gesturePrevPinching;
    const pills = document.querySelectorAll('.ai-suggestion-pill:not([disabled])');
    let hoveredPill = null;
    pills.forEach(pill => {
      const rect = pill.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        pill.classList.add('gesture-hover'); hoveredPill = pill;
      } else { pill.classList.remove('gesture-hover'); }
    });
    if (cursorEl) cursorEl.classList.toggle('pill-hover', !!hoveredPill);
    if (pinchStarted && hoveredPill && Date.now() - gesturePillFireAt > 1200) {
      gesturePillFireAt = Date.now();
      hoveredPill.classList.remove('gesture-hover');
      try { if (suggestionEngine) suggestionEngine._handleSuggestionClick(hoveredPill.textContent.trim()); }
      catch (e) { console.warn('Gesture pill fire failed:', e); }
    }
    gesturePrevPinching = isPinching;
  }

  // Virtual Cursor Update
  function updateVirtualCursor(hand) {
    if (!hand || !cursorEl) return;

    cursorEl.classList.remove('hidden');

    // MediaPipe coords 0-1. x is usually mirrored.
    // If mirroring is handled by CSS transform ScaleX(-1) on video, then 0 is left.
    // If raw coordinates from MediaPipe: x=0 is left (from camera perspective).
    // If camera is mirrored, x=0 is right on screen.
    // Let's assume standard behavior: 1 - x
    const x = (1 - hand.indexTip.x) * window.innerWidth;
    const y = hand.indexTip.y * window.innerHeight;

    cursorEl.style.left = `${x}px`;
    cursorEl.style.top = `${y}px`;

    // Check collision / hover
    const items = document.querySelectorAll('.playlist-item');
    let hovered = false;

    items.forEach(item => {
      const rect = item.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        item.classList.add('hovered');
        hovered = true;

        // Interaction: Pinch to click
        if (hand.gesture === 'pinch') {
          cursorEl.classList.add('pinching');
          if (Date.now() - cursorClickTimer > 1000) { // Debounce click
            cursorClickTimer = Date.now();
            item.click();
          }
        } else {
          cursorEl.classList.remove('pinching');
        }
      } else {
        item.classList.remove('hovered');
      }
    });

    if (!hovered) cursorEl.classList.remove('pinching');
  }
  // Re-snap video controls on resize / orientation change
  window.addEventListener('resize', () => {
    // Add any needed resize logic here
  });

  // Auto-load Play All 3 movies (1,3,4) and start podcast after 10 seconds
  (async () => {
    await new Promise(resolve => {
      const checkReady = () => {
        if (voiceManager?.synthesis) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });

    // Hide guide overlay immediately
    const centerGuide = document.getElementById('center-guide-overlay');
    if (centerGuide) centerGuide.style.display = 'none';

    // Set podcast mode as selected
    if (conversationModePodcast) conversationModePodcast.click();

    // Monitor for video to start playing, then start everything after 10 seconds
    let autoStarted = false;
    const checkVideoPlaying = () => {
      if (autoStarted) return;
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.currentTime > 0.5 && !videoEl.paused) {
        autoStarted = true;

        // Start Play All 3 min mode (after 10s)
        setTimeout(() => {
          window.startMovieContentRotation?.(['test'], {
            intervalSeconds: 180,
            mode: 'play-all-3min',
            movies: ['Synthetic_Desires_1.mp4', 'Synthetic_Desires_3.mp4', 'Synthetic_Desires_4.mp4']
          });

          // Ensure bgAudio is playing after movie rotation starts (gives time for source to load)
          setTimeout(() => {
            if (bgAudio) {
              bgAudio.muted = false;
              bgAudio.volume = 1.0;
              if (bgAudio.paused) {
                bgAudio.play().catch(e => console.warn('bgAudio play failed:', e));
              }
            }
            // Start podcast AI
            if (publicPodcastAiEnabled && !publicPodcastAiAutoMode) {
              startPublicPodcastAiConversation();
            }
          }, 500);
        }, 10000);
      }
    };
    const playCheckInterval = setInterval(() => {
      checkVideoPlaying();
      if (autoStarted) clearInterval(playCheckInterval);
    }, 200);
    setTimeout(() => clearInterval(playCheckInterval), 30000);
  })();

}; // End of startGestureApp

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startGestureApp);
} else {
  startGestureApp();
}
