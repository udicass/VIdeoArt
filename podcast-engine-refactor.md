# Podcast Engine & AI Brain Refactor Plan

## Overview
Refactor the massive `main.js` and `voiceManager.js` files into modular, maintainable components. Introduce advanced visual feedback (breathing waveforms, secret training dashboard) to make the AI feel "alive." Enhance the AI memory logic in the background (semantic categorization, persona summarization) without exposing text search or text chat to the user.

## Project Type
WEB

## Success Criteria
1. `main.js` size is reduced by at least 50% by extracting logical managers.
2. The UI features a distinct visual feedback state (glow/waveform) synced with the podcast TTS output.
3. The "Secret Training" reveals a sleek UI overlay showing memory batch processing in real-time.
4. The AI memory organically generates and maintains a synthesized persona profile without needing typed text search.

## Tech Stack
- Vanilla JavaScript / ES Modules (Current Architecture)
- CSS for animations and visual enhancements
- Vercel KV for persistent training (already configured)

## File Structure Changes
```
src/
├── main.js (Shattered into managers)
├── voiceManager.js (Slimmed down strictly to TTS)
├── ui/
│   ├── uiSystem.js (Handles DOM/Events)
│   ├── trainingDashboard.js (UI for Secret Training)
│   └── visualizer.js (Breathing waveforms/glow)
├── core/
│   ├── podcastEngine.js (Narration queue logic)
│   ├── aiEngine.js (Ollama & Cloud API calls)
│   └── memorySynthesizer.js (Background persona generation)
```

## Task Breakdown

### Phase 1: Modular Refactoring
- **Task 1: Extract UI Logic to `uiSystem.js`**
  - **Agent:** `frontend-specialist`
  - **INPUT:** `main.js` DOM elements and event listeners.
  - **OUTPUT:** `uiSystem.js` exporting DOM update functions.
  - **VERIFY:** UI buttons still function normally without console errors.

- **Task 2: Extract Podcast Logic to `podcastEngine.js`**
  - **Agent:** `backend-specialist`
  - **INPUT:** `main.js` `queuePodcastNarration` and drain logic.
  - **OUTPUT:** A discrete `PodcastEngine` module.
  - **VERIFY:** Podcast still speaks automatically on mobile and desktop.

- **Task 3: Extract AI APIs to `aiEngine.js`**
  - **Agent:** `backend-specialist`
  - **INPUT:** Ollama/Gemini API fetch functions in `voiceManager.js`.
  - **OUTPUT:** Clean `aiEngine.js` dedicated to fetching inference.
  - **VERIFY:** Brain training continues to successfully hit local/cloud targets.

### Phase 2: Visuals & "Wow Factor"
- **Task 4: Implement "Breathing" Glow / Waveform visuals**
  - **Agent:** `frontend-specialist`
  - **INPUT:** `voiceManager.js` speech lifecycle (`onSpeakStart`/`onSpeakEnd`).
  - **OUTPUT:** Dynamic CSS variables / canvas overlay providing a pulsing glow when Host A or B speaks.
  - **VERIFY:** Screen visually pulses matching the actual TTS output.

- **Task 5: Implement Training Dashboard UI**
  - **Agent:** `frontend-specialist`
  - **INPUT:** The existing "Secret Training" button click.
  - **OUTPUT:** An overlay/floating panel showing the live Q&A batches and pairs added, cleanly formatted.
  - **VERIFY:** Clicking the train button reveals the live stats instead of just updating a button title.

### Phase 3: Silent Brain Enhancements
- **Task 6: Abstract Persona Synthesizer**
  - **Agent:** `backend-specialist`
  - **INPUT:** `brainMemory.js` memory sets.
  - **OUTPUT:** Background logic that aggregates recent pairs into a concise "Profile" (e.g., mood, tone) that auto-injects into the system prompt. No text-search UI involved.
  - **VERIFY:** Cloud and Local AI get enriched prompt contexts and respond more organically.

## Phase X: Verification
- [ ] Run Lint/Type Checks (if configured)
- [ ] `npm run dev` successfully builds without circular dependency errors
- [ ] UI visualizer pulses correctly on speech
- [ ] Network tab confirms Memory sets still push to Vercel KV
- [ ] Mobile/Desktop fallback logic is preserved perfectly
