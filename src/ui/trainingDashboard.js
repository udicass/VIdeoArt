import { resolveMovieBrain } from '../movieBrains.js';

export class TrainingDashboard {
  constructor() {
    this.statsProvider = null;
    this.brainCheckRunner = null;
    this.forceLocalHandler = null;
    this.notebookContextHandler = null;
    this.lastState = {
      engine: 'Awaiting',
      status: 'Standby',
      memories: 0,
      latestLog: null
    };
    this.filters = {
      fromAt: 0,
      toAt: 0
    };
    this.brainCheckPanelOpen = false;
    this.brainCheckRunState = {
      running: false,
      status: 'idle',
      message: '',
      movie: '',
      result: null
    };

    this.container = document.createElement('div');
    this.container.id = 'training-dashboard';
    this.container.className = 'valkyrie-dashboard hidden';
    this.container.innerHTML = `
      <div class="dashboard-shell">
        <div class="dashboard-topbar">
          <div class="dashboard-actions">
            <button id="dash-copy-json-btn" class="dash-action-btn no-select" type="button">Copy JSON</button>
            <button id="dash-download-json-btn" class="dash-action-btn no-select" type="button">Save JSON</button>
            <button id="dash-download-csv-btn" class="dash-action-btn no-select" type="button">Save CSV</button>
          </div>
          <button id="dash-close-btn" class="dash-close-btn no-select" type="button" aria-label="Close analytics dashboard">×</button>
        </div>
        <div class="dashboard-header">
          <div class="dashboard-header-copy">
            <div class="dashboard-kicker">Hidden Analytics Report</div>
            <div class="dashboard-title">Podcast / Free Chat / Brain / DICT</div>
            <div id="dash-report-date" class="dashboard-subtitle">App report through today</div>
          </div>
          <div class="dashboard-range-controls">
            <label class="dash-date-control">
              <span>From</span>
              <input id="dash-range-from" type="date" />
            </label>
            <label class="dash-date-control">
              <span>To</span>
              <input id="dash-range-to" type="date" />
            </label>
            <button id="dash-range-clear" class="dash-action-btn no-select" type="button">Clear</button>
          </div>
        </div>
        <div class="dashboard-meta-grid">
          <div class="stat-row"><span class="label">Engine</span><span class="value" id="dash-engine">Awaiting</span></div>
          <div class="stat-row"><span class="label">Status</span><span class="value" id="dash-status">Standby</span></div>
          <div class="stat-row"><span class="label">Memories</span><span class="value" id="dash-memories">0</span></div>
          <div class="stat-row"><span class="label">Current movie</span><span class="value" id="dash-current-movie-name">No movie</span></div>
        </div>
        <div id="dash-summary-grid" class="dash-summary-grid"></div>
        <div class="dash-body-grid">
          <div class="dash-column dash-column-wide">
            <div class="dash-section">
              <div class="dash-section-title">Analytics Overview <span class="dash-section-tip" data-tip="A summary of app activity: training performance, model usage, brain scores, and how well the AI is learning across all movies.">i</span></div>
              <div id="dash-analytics" class="dash-analytics-panel"></div>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">Current Movie <span class="dash-section-tip" data-tip="Detailed stats for the movie currently loaded — podcast turns, training batches, DICT writes, brain check scores, and seed coverage.">i</span></div>
              <div id="dash-current-movie" class="dash-current-movie">Waiting for session data...</div>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">Data Visualization <span class="dash-section-tip" data-tip="Bar and chart views of involvement, training success, DICT coverage, and model usage across the session date range.">i</span></div>
              <div id="dash-visualization" class="dash-visualization-grid"></div>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">Per Movie <span class="dash-section-tip" data-tip="Individual stat cards for each movie seen in this report — turns, training results, brain scores, DICT writes, and seed group counts.">i</span></div>
              <div id="dash-movie-grid" class="dash-movie-grid"></div>
            </div>
          </div>
          <div class="dash-column">
            <div class="dash-section">
              <div class="dash-section-title dash-section-title-row">
                Phrase Repetitions <span class="dash-section-tip" data-tip="Scans brain memories per film and highlights phrases (3 words) repeated ≥2 times and words repeated ≥4 times. Red = unreviewed. Orange = survived deduplication — present in distinct memories.">i</span>
                <button id="dash-optimize-btn" class="dash-inline-btn" type="button">Optimise Memories</button>
              </div>
              <div id="dash-optimize-progress-wrap" class="dash-optimize-progress-wrap" style="display:none">
                <div id="dash-optimize-progress-bar" class="dash-optimize-progress-bar"></div>
                <span id="dash-optimize-progress-label" class="dash-optimize-progress-label">Optimising…</span>
              </div>
              <div id="dash-phrase-repeats" class="dash-phrase-repeats dash-phrase-repeats-scroll">Scanning memories…</div>
            </div>
            <div class="dash-section">
              <div class="brain-activity-title">Brain Flux <span class="dash-section-tip" data-tip="Live animated waveform showing the AI processing heartbeat. Active when training, podcast, or brain-check exams are running.">i</span></div>
              <canvas id="dash-brain-canvas" width="560" height="84"></canvas>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">All Parameters <span class="dash-section-tip" data-tip="Full inventory of every tracked metric: training funnel, latency, model fallback, seeds, persona signals, and per-movie context data.">i</span></div>
              <div id="dash-parameter-grid" class="dash-parameter-grid"></div>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">System Health <span class="dash-section-tip" data-tip="Automated diagnostic flags: cold start, ghost brain, model over-reliance, context fragmentation, and training error status. Warn = needs attention.">i</span></div>
              <div id="dash-health-grid" class="dash-health-grid"></div>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">Source Summary <span class="dash-section-tip" data-tip="Session origin data: IP, location, device, network type, and current training provider and fallback status.">i</span></div>
              <div id="dash-session-source" class="dash-source-summary"></div>
            </div>
            <div class="dash-section">
              <div class="dash-section-title">Latest Injection <span class="dash-section-tip" data-tip="The most recent brain memory injected into the AI prompt — shows what context Gemma was given just before its last reply.">i</span></div>
              <div id="dash-live-feed" class="live-feed">Waiting for extraction...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.uiEngine = this.container.querySelector('#dash-engine');
    this.uiStatus = this.container.querySelector('#dash-status');
    this.uiMemories = this.container.querySelector('#dash-memories');
    this.uiCurrentMovieName = this.container.querySelector('#dash-current-movie-name');
    this.uiReportDate = this.container.querySelector('#dash-report-date');
    this.uiRangeFrom = this.container.querySelector('#dash-range-from');
    this.uiRangeTo = this.container.querySelector('#dash-range-to');
    this.uiRangeClear = this.container.querySelector('#dash-range-clear');

    // Default date range to today
    const _todayStart = new Date(); _todayStart.setHours(0, 0, 0, 0);
    const _todayEnd   = new Date(); _todayEnd.setHours(23, 59, 59, 999);
    this.filters.fromAt = _todayStart.getTime();
    this.filters.toAt   = _todayEnd.getTime();
    const _todayStr = this._formatDateInputValue(this.filters.fromAt);
    if (this.uiRangeFrom) this.uiRangeFrom.value = _todayStr;
    if (this.uiRangeTo)   this.uiRangeTo.value   = _todayStr;
    this.uiSummaryGrid = this.container.querySelector('#dash-summary-grid');
    this.uiAnalytics = this.container.querySelector('#dash-analytics');
    this.uiCurrentMovie = this.container.querySelector('#dash-current-movie');
    this.uiVisualization = this.container.querySelector('#dash-visualization');
    this.uiMovieGrid = this.container.querySelector('#dash-movie-grid');
    this.uiParameterGrid = this.container.querySelector('#dash-parameter-grid');
    this.uiHealthGrid = this.container.querySelector('#dash-health-grid');
    this.uiSessionSource = this.container.querySelector('#dash-session-source');
    this.uiLiveFeed = this.container.querySelector('#dash-live-feed');
    this.uiPhraseRepeats = this.container.querySelector('#dash-phrase-repeats');
    this.uiOptimizeProgressWrap = this.container.querySelector('#dash-optimize-progress-wrap');
    this.uiOptimizeProgressBar = this.container.querySelector('#dash-optimize-progress-bar');
    this.uiOptimizeProgressLabel = this.container.querySelector('#dash-optimize-progress-label');
    this.canvas = this.container.querySelector('#dash-brain-canvas');
    this.ctx = this.canvas.getContext('2d');

    const closeBtn = this.container.querySelector('#dash-close-btn');
    const copyJsonBtn = this.container.querySelector('#dash-copy-json-btn');
    const downloadJsonBtn = this.container.querySelector('#dash-download-json-btn');
    const downloadCsvBtn = this.container.querySelector('#dash-download-csv-btn');
    closeBtn.addEventListener('click', () => this.hide());
    copyJsonBtn.addEventListener('click', () => this._copySnapshotJson(copyJsonBtn));
    downloadJsonBtn.addEventListener('click', () => this._downloadSnapshotJson(downloadJsonBtn));
    downloadCsvBtn.addEventListener('click', () => this._downloadSnapshotCsv(downloadCsvBtn));
    this.container.addEventListener('click', (event) => {
      const exportBtn = event.target instanceof Element ? event.target.closest('[data-dash-wiki-export]') : null;
      if (exportBtn) { this._exportForNotebookLM(exportBtn); return; }
      const importBtn = event.target instanceof Element ? event.target.closest('[data-dash-wiki-import]') : null;
      if (importBtn) this._openNotebookImportModal();
    });
    this.uiRangeFrom?.addEventListener('change', () => this._handleRangeChange());
    this.uiRangeTo?.addEventListener('change', () => this._handleRangeChange());
    this.uiRangeClear?.addEventListener('click', () => this._clearRange());
    this.container.querySelector('#dash-optimize-btn')?.addEventListener('click', () => this._optimizeMemories());
    this.uiHealthGrid?.addEventListener('click', async (event) => {
      const btn = event.target instanceof Element ? event.target.closest('[data-dash-force-local]') : null;
      if (btn && this.forceLocalHandler) {
        const enable = btn.dataset.dashForceLocal === 'enable';
        btn.disabled = true;
        btn.textContent = enable ? 'Enabling…' : 'Restoring…';
        await this.forceLocalHandler(enable);
        this.refreshStats();
      }
    });
    this.uiCurrentMovie?.addEventListener('click', async (event) => {
      const runTrigger = event.target instanceof Element ? event.target.closest('[data-dash-brain-check-run]') : null;
      if (runTrigger) {
        await this._handleBrainCheckRun();
        return;
      }
      const trigger = event.target instanceof Element ? event.target.closest('[data-dash-brain-check-toggle]') : null;
      if (!trigger) return;
      this.brainCheckPanelOpen = !this.brainCheckPanelOpen;
      this.refreshStats();
    });

    this.offset = 0;
    this.active = false;
    this.draw();

    if (!document.getElementById('training-dashboard-styles')) {
      const style = document.createElement('style');
      style.id = 'training-dashboard-styles';
      style.textContent = `
        .valkyrie-dashboard {
          position: fixed;
          inset: 1rem;
          background: rgba(3, 6, 11, 0.58);
          backdrop-filter: blur(10px);
          z-index: 520;
          transition: opacity 0.26s ease, transform 0.26s ease;
        }
        .valkyrie-dashboard.hidden {
          opacity: 0;
          transform: translateY(18px);
          pointer-events: none;
        }
        .dashboard-shell {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: auto;
          border-radius: 24px;
          border: 1px solid rgba(110, 231, 255, 0.16);
          background: linear-gradient(180deg, rgba(8, 13, 21, 0.98), rgba(4, 7, 12, 0.98));
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62), inset 0 0 22px rgba(110, 231, 255, 0.05);
          color: #dbeaf5;
          font-family: 'JetBrains Mono', monospace;
          padding: 1.4rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .dashboard-topbar {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.8rem;
          z-index: 3;
        }
        .dashboard-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }
        .dash-action-btn,
        .dash-close-btn {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          cursor: pointer;
        }
        .dash-action-btn {
          min-height: 38px;
          padding: 0.65rem 0.9rem;
          border-radius: 999px;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .dash-close-btn {
          margin-left: auto;
          width: 42px;
          height: 42px;
          border-radius: 999px;
          font-size: 1.4rem;
          line-height: 1;
        }
        .dash-action-btn:hover,
        .dash-action-btn:focus-visible,
        .dash-close-btn:hover,
        .dash-close-btn:focus-visible {
          outline: none;
          background: rgba(248, 113, 113, 0.16);
          border-color: rgba(248, 113, 113, 0.4);
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding-bottom: 0.95rem;
          border-bottom: 1px solid rgba(110, 231, 255, 0.1);
        }
        .dashboard-range-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.5rem;
        }
        .dash-date-control {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(125, 211, 252, 0.62);
        }
        .dash-date-control input {
          min-height: 38px;
          min-width: 132px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
          padding: 0.45rem 0.55rem;
          font: inherit;
        }
        .dashboard-header-copy {
          display: flex;
          flex-direction: column;
          gap: 0.28rem;
        }
        .dashboard-kicker,
        .dash-section-title,
        .brain-activity-title,
        .dash-card-kicker,
        .dash-chart-title,
        .dash-mini-label,
        .dash-parameter-label {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: rgba(125, 211, 252, 0.62);
        }
        .dash-chart-status {
          display: inline-block;
          margin-left: 0.5em;
          padding: 0.1em 0.5em;
          border-radius: 3px;
          font-size: 0.62rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: none;
          vertical-align: middle;
        }
        .dash-chart-status-warn {
          background: rgba(251, 146, 60, 0.18);
          color: rgba(251, 190, 96, 0.95);
          border: 1px solid rgba(251, 146, 60, 0.35);
        }
        .dash-chart-status-wiki {
          background: rgba(167, 139, 250, 0.15);
          color: rgba(196, 181, 253, 0.9);
          border: 1px solid rgba(167, 139, 250, 0.3);
        }
        .dash-wiki-snippets {
          margin-top: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .dash-wiki-movie-label {
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(196, 181, 253, 0.7);
          margin-bottom: 0.3rem;
        }
        .dash-panel-scroll {
          max-height: 320px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(139,92,246,0.35) transparent;
        }
        .dash-panel-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .dash-panel-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .dash-panel-scroll::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.35);
          border-radius: 2px;
        }
        .dash-wiki-snippet {
          font-size: 0.72rem;
          color: rgba(223, 236, 246, 0.72);
          line-height: 1.45;
          padding: 0.4rem 0.6rem;
          background: rgba(255,255,255,0.03);
          border-left: 2px solid rgba(167, 139, 250, 0.35);
          border-radius: 0 3px 3px 0;
        }
        .dash-wiki-injected-label {
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(196, 181, 253, 0.7);
          margin: 0.8rem 0 0.4rem;
        }
        .dash-wiki-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-bottom: 0.5rem;
        }
        .dash-wiki-chip {
          font-size: 0.68rem;
          padding: 0.18rem 0.55rem;
          border-radius: 999px;
          background: rgba(139, 92, 246, 0.18);
          border: 1px solid rgba(167, 139, 250, 0.4);
          color: rgba(221, 214, 254, 0.9);
          white-space: nowrap;
        }
        .dash-wiki-chip-secondary {
          background: rgba(109, 40, 217, 0.1);
          border-color: rgba(139, 92, 246, 0.25);
          color: rgba(196, 181, 253, 0.75);
        }
        @keyframes wiki-chip-glow {
          0%   { box-shadow: 0 0 0px 0px rgba(52,211,153,0); border-color: rgba(167,139,250,0.4); color: rgba(221,214,254,0.9); }
          30%  { box-shadow: 0 0 7px 2px rgba(52,211,153,0.65); border-color: rgba(52,211,153,0.8); color: #d1fae5; }
          60%  { box-shadow: 0 0 12px 4px rgba(52,211,153,0.45); border-color: rgba(52,211,153,0.6); color: #a7f3d0; }
          100% { box-shadow: 0 0 0px 0px rgba(52,211,153,0); border-color: rgba(167,139,250,0.4); color: rgba(221,214,254,0.9); }
        }
        .dash-wiki-chip-live {
          animation: wiki-chip-glow 1.8s ease-in-out infinite;
        }
        .dash-wiki-chip-live.dash-wiki-chip-secondary {
          animation: wiki-chip-glow 2.4s ease-in-out infinite;
          animation-delay: 0.6s;
        }
        .dashboard-title {
          font-size: 1.28rem;
          font-weight: 700;
          color: #f8fdff;
        }
        .dashboard-subtitle {
          font-size: 0.82rem;
          color: rgba(223, 236, 246, 0.82);
        }
        .dashboard-meta-grid,
        .dash-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .dash-summary-grid {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
        .stat-row,
        .dash-summary-card,
        .dash-current-movie,
        .dash-movie-card,
        .dash-parameter-card,
        .dash-chart-panel,
        .dash-analytics-panel,
        .live-feed {
          border-radius: 16px;
          border: 1px solid rgba(110, 231, 255, 0.08);
          background: rgba(12, 18, 28, 0.82);
        }
        .stat-row {
          display: flex;
          justify-content: space-between;
          gap: 0.8rem;
          padding: 0.8rem 0.9rem;
          font-size: 0.8rem;
        }
        .stat-row .label {
          opacity: 0.72;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .stat-row .value {
          color: #ffffff;
          text-align: right;
        }
        .dash-summary-card {
          padding: 0.9rem;
        }
        .dash-summary-card-value {
          margin-top: 0.45rem;
          font-size: 1.22rem;
          color: #ffffff;
        }
        .dash-summary-card-hint,
        .dash-card-copy,
        .dash-current-movie-copy,
        .dash-mini-value,
        .dash-movie-card-line,
        .dash-parameter-detail,
        .dash-empty,
        .dash-chart-copy,
        .dash-chart-bar-label,
        .dash-chart-bar-value,
        .dash-live-question,
        .dash-live-answer {
          font-size: 0.78rem;
          line-height: 1.5;
          color: rgba(223, 236, 246, 0.84);
        }
        .dash-body-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.82fr);
          gap: 1rem;
          min-height: 0;
        }
        .dash-column {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-width: 0;
        }
        .dash-section {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .dash-analytics-panel {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .dash-card-title,
        .dash-current-movie-title,
        .dash-movie-card-title {
          font-size: 0.98rem;
          color: #ffffff;
        }
        .dash-card-stack,
        .dash-current-movie-main {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .dash-analytics-side {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.6rem;
        }
        .dash-analytics-mini {
          padding: 0.75rem;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(110, 231, 255, 0.07);
        }
        .dash-current-movie {
          padding: 1rem;
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 0.8rem;
        }
        .dash-current-movie-mini {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.6rem;
        }
        .dash-mini-card {
          border-radius: 14px;
          padding: 0.8rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(110, 231, 255, 0.07);
        }
        .dash-current-movie-actions {
          display: flex;
          gap: 0.6rem;
          margin-top: 0.2rem;
        }
        .dash-brain-memory-section {
          grid-column: 1 / -1;
          margin-top: 0.5rem;
          border-radius: 16px;
          border: 1px solid rgba(110, 231, 255, 0.1);
          background: rgba(7, 12, 19, 0.9);
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .dash-brain-memory-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.55rem;
        }
        .dash-brain-mem-stat {
          border-radius: 12px;
          padding: 0.68rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(110, 231, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .dash-brain-mem-key {
          font-size: 0.64rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(125, 211, 252, 0.62);
        }
        .dash-brain-mem-val {
          font-size: 0.92rem;
          color: #ffffff;
          font-weight: 600;
        }
        .dash-models-report {
          grid-column: 1 / -1;
          margin-top: 0.5rem;
          border-radius: 16px;
          border: 1px solid rgba(110, 231, 255, 0.1);
          background: rgba(7, 12, 19, 0.9);
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .dash-model-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.78rem;
          padding: 0.2rem 0;
        }
        .dash-model-label { width: 7.5rem; flex-shrink: 0; color: rgba(223, 236, 246, 0.84); }
        .dash-model-label-blocked { color: rgba(252, 165, 0, 0.85); }
        .dash-model-bar-wrap { flex: 1; height: 11px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
        .dash-model-bar { display: block; height: 100%; background: linear-gradient(90deg, rgba(96, 165, 250, 0.84), rgba(34, 211, 238, 0.84)); border-radius: 999px; transition: width 0.4s ease; }
        .dash-model-bar-blocked { background: linear-gradient(90deg, rgba(252,165,0,0.55), rgba(239,68,68,0.45)); }
        .dash-model-blocked-badge { font-size: 0.58rem; padding: 0.06rem 0.42rem; border-radius: 999px; background: rgba(252,165,0,0.12); border: 1px solid rgba(252,165,0,0.35); color: rgba(252,165,0,0.9); margin-left: 0.3rem; white-space: nowrap; vertical-align: middle; }
        .dash-model-count { width: 3rem; text-align: right; color: #ffffff; font-weight: 600; }
        .dash-model-count-blocked { color: rgba(252,165,0,0.9); }
        .dash-model-cloud-row {
          margin-top: 0.2rem;
          font-size: 0.72rem;
          color: rgba(223, 236, 246, 0.54);
          padding-top: 0.4rem;
          border-top: 1px solid rgba(110, 231, 255, 0.08);
        }
        .dash-inline-btn {
          min-height: 34px;
          padding: 0.55rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(110, 231, 255, 0.18);
          background: rgba(110, 231, 255, 0.08);
          color: #f8fdff;
          cursor: pointer;
          font: inherit;
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .dash-inline-btn:hover,
        .dash-inline-btn:focus-visible {
          outline: none;
          background: rgba(110, 231, 255, 0.14);
          border-color: rgba(110, 231, 255, 0.3);
        }
        .dash-inline-btn:disabled {
          cursor: wait;
          opacity: 0.58;
        }
        .dash-section-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
        }
        .dash-section-tip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 1px solid rgba(125,211,252,0.35);
          color: rgba(125,211,252,0.55);
          font-size: 0.62rem;
          font-weight: 400;
          cursor: default;
          position: relative;
          vertical-align: middle;
          margin-left: 0.3em;
          flex-shrink: 0;
          letter-spacing: 0;
          text-transform: none;
          font-style: italic;
        }
        .dash-section-tip::after {
          content: attr(data-tip);
          position: absolute;
          bottom: calc(100% + 7px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(8,16,28,0.97);
          border: 1px solid rgba(110,231,255,0.18);
          border-radius: 8px;
          padding: 0.5rem 0.7rem;
          width: 220px;
          font-size: 0.72rem;
          font-weight: 400;
          line-height: 1.55;
          color: rgba(200,225,245,0.9);
          text-align: left;
          white-space: normal;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s ease;
          z-index: 200;
          box-shadow: 0 4px 24px rgba(0,0,0,0.45);
        }
        .dash-section-tip:hover::after {
          opacity: 1;
        }
        .dash-phrase-repeats {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          font-size: 0.78rem;
        }
        .dash-phrase-repeats-scroll {
          max-height: 220px;
          overflow-y: auto;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(110,231,255,0.18) transparent;
        }
        .dash-optimize-progress-wrap {
          position: relative;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          margin-bottom: 0.4rem;
        }
        .dash-optimize-progress-bar {
          height: 100%;
          width: 0%;
          border-radius: 999px;
          background: linear-gradient(90deg, #34d399, #22d3ee);
          transition: width 0.3s ease;
        }
        .dash-optimize-progress-label {
          position: absolute;
          top: 8px;
          left: 0;
          font-size: 0.65rem;
          color: rgba(134,239,172,0.85);
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }
        .dash-phrase-movie-block {
          border: 1px solid rgba(110,231,255,0.07);
          border-radius: 10px;
          padding: 0.55rem 0.7rem;
          background: rgba(255,255,255,0.02);
          margin-bottom: 0.4rem;
        }
        .dash-phrase-movie-header {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(125,211,252,0.8);
          margin-bottom: 0.4rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .dash-phrase-group-label {
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(125, 211, 252, 0.65);
          margin-bottom: 0.15rem;
        }
        .dash-phrase-item {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          line-height: 1.5;
          color: rgba(223, 236, 246, 0.7);
        }
        .dash-repeat-mark {
          color: #f87171;
          font-weight: 600;
        }
        .dash-repeat-count {
          font-size: 0.65rem;
          background: rgba(248, 113, 113, 0.14);
          color: #f87171;
          border: 1px solid rgba(248, 113, 113, 0.25);
          border-radius: 999px;
          padding: 0 0.45em;
          white-space: nowrap;
        }
        .dash-phrase-repeats.is-optimised .dash-repeat-mark {
          color: #fb923c;
        }
        .dash-phrase-repeats.is-optimised .dash-repeat-count {
          background: rgba(251, 146, 60, 0.13);
          color: #fb923c;
          border-color: rgba(251, 146, 60, 0.25);
        }
        .dash-optimize-toast {
          font-size: 0.72rem;
          color: rgba(134, 239, 172, 0.94);
          margin-top: 0.3rem;
        }
        .dash-brain-check-panel {
          grid-column: 1 / -1;
          margin-top: 0.15rem;
          border-radius: 16px;
          border: 1px solid rgba(110, 231, 255, 0.1);
          background: rgba(7, 12, 19, 0.9);
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .dash-brain-check-copy {
          font-size: 0.78rem;
          line-height: 1.5;
          color: rgba(223, 236, 246, 0.84);
        }
        .dash-brain-check-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.7rem;
        }
        .dash-brain-check-status {
          min-height: 1.1rem;
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          color: rgba(125, 211, 252, 0.82);
        }
        .dash-brain-check-status.is-warn {
          color: rgba(252, 211, 77, 0.92);
        }
        .dash-brain-check-status.is-error {
          color: rgba(248, 113, 113, 0.94);
        }
        .dash-brain-check-status.is-success {
          color: rgba(134, 239, 172, 0.94);
        }
        .dash-brain-check-result {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.55rem;
        }
        .dash-brain-check-result-card {
          border-radius: 12px;
          padding: 0.68rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(110, 231, 255, 0.08);
        }
        .dash-brain-check-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.76rem;
        }
        .dash-brain-check-table th,
        .dash-brain-check-table td {
          text-align: left;
          vertical-align: top;
          padding: 0.58rem 0.5rem;
          border-top: 1px solid rgba(110, 231, 255, 0.08);
          color: rgba(223, 236, 246, 0.86);
        }
        .dash-brain-check-table th {
          font-size: 0.64rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(125, 211, 252, 0.62);
        }
        .dash-visualization-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
        }
        .dash-chart-panel {
          padding: 0.95rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .dash-chart-bars {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .dash-chart-bar {
          display: grid;
          grid-template-columns: minmax(92px, 116px) 1fr minmax(42px, 60px);
          align-items: center;
          gap: 0.55rem;
        }
        .dash-chart-track {
          position: relative;
          height: 11px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .dash-chart-fill {
          position: absolute;
          inset: 0 auto 0 0;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(34, 211, 238, 0.84), rgba(250, 204, 21, 0.84));
        }
        .dash-chart-fill[data-tone="warm"] {
          background: linear-gradient(90deg, rgba(251, 191, 36, 0.84), rgba(248, 113, 113, 0.84));
        }
        .dash-chart-fill[data-tone="cool"] {
          background: linear-gradient(90deg, rgba(96, 165, 250, 0.84), rgba(34, 211, 238, 0.84));
        }
        .dash-chart-fill[data-tone="violet"] {
          background: linear-gradient(90deg, rgba(167, 139, 250, 0.84), rgba(59, 130, 246, 0.84));
        }
        .dash-chart-track[data-tooltip] {
          cursor: default;
        }
        .dash-chart-bar[data-tooltip] {
          position: relative;
          cursor: default;
        }
        .dash-chart-bar[data-tooltip]:hover::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 7px);
          left: 50%;
          transform: translateX(-50%);
          background: rgba(10, 14, 22, 0.96);
          color: rgba(220, 235, 255, 0.92);
          font-size: 0.7rem;
          font-family: inherit;
          letter-spacing: 0.02em;
          padding: 0.28em 0.65em;
          border-radius: 6px;
          border: 1px solid rgba(110, 231, 255, 0.18);
          pointer-events: none;
          z-index: 99;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          max-width: 280px;
          white-space: normal;
          text-align: center;
        }
        .dash-movie-grid,
        .dash-parameter-grid,
        .dash-health-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.75rem;
        }
        .dash-health-card {
          border-radius: 14px;
          border: 1px solid rgba(110, 231, 255, 0.08);
          background: rgba(12, 18, 28, 0.82);
          padding: 0.75rem 0.8rem;
        }
        .dash-health-card[data-status="warn"] {
          border-color: rgba(248, 113, 113, 0.35);
          box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.08);
        }
        .dash-health-card[data-status="info"] {
          border-color: rgba(251, 191, 36, 0.35);
          box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.08);
        }
        .dash-health-status {
          margin-top: 0.3rem;
          font-size: 0.74rem;
          color: #ffffff;
        }
        .dash-source-summary {
          border-radius: 16px;
          border: 1px solid rgba(110, 231, 255, 0.08);
          background: rgba(12, 18, 28, 0.82);
          padding: 0.45rem 0.6rem;
          font-size: 0.62rem;
          line-height: 1.3;
          color: rgba(223, 236, 246, 0.64);
        }
        .dash-movie-card,
        .dash-parameter-card {
          padding: 0.9rem;
        }
        .dash-movie-card.is-current {
          border-color: rgba(251, 191, 36, 0.46);
          box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.15);
        }
        .dash-parameter-value {
          margin-top: 0.4rem;
          font-size: 1.08rem;
          color: #ffffff;
        }
        .live-feed {
          min-height: 120px;
          max-height: 320px;
          overflow: auto;
          padding: 0.95rem;
        }
        #dash-brain-canvas {
          width: 100%;
          min-height: 84px;
          background: rgba(0, 0, 0, 0.28);
          border-radius: 14px;
          border: 1px solid rgba(110, 231, 255, 0.08);
        }
        @media (max-width: 1180px) {
          .dashboard-meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .dash-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .dash-body-grid,
          .dash-current-movie,
          .dash-visualization-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 760px) {
          .valkyrie-dashboard {
            inset: 0.5rem;
          }
          .dashboard-shell {
            padding: 1rem;
          }
          .dashboard-meta-grid,
          .dash-summary-grid,
          .dash-current-movie-mini,
          .dash-analytics-side,
          .dash-movie-grid,
          .dash-parameter-grid {
            grid-template-columns: 1fr;
          }
          .dashboard-range-controls {
            width: 100%;
          }
          .dash-chart-bar {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  setStatsProvider(provider) {
    this.statsProvider = typeof provider === 'function' ? provider : null;
    this.refreshStats();
  }

  setBrainCheckRunner(runner) {
    this.brainCheckRunner = typeof runner === 'function' ? runner : null;
  }

  setForceLocalHandler(fn) {
    this.forceLocalHandler = typeof fn === 'function' ? fn : null;
  }

  setNotebookContextHandler(fn) {
    this.notebookContextHandler = typeof fn === 'function' ? fn : null;
  }

  toggle() {
    if (this.container.classList.contains('hidden')) {
      this.show();
      return;
    }
    this.hide();
  }

  show() {
    this.container.classList.remove('hidden');
    this.refreshStats();
    this._showSummaryPopup();
  }

  hide() {
    this.container.classList.add('hidden');
  }

  _escapeHtml(value = '') {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _formatPercent(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0%';
    return `${Math.max(0, Math.round(numeric))}%`;
  }

  _formatDate(value, fallback = 'Not yet') {
    const numeric = Number(value || 0);
    if (!numeric) return fallback;
    return new Date(numeric).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  _formatDateInputValue(value) {
    const numeric = Math.max(0, Number(value || 0));
    if (!numeric) return '';
    const date = new Date(numeric);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _parseDateInputValue(value = '') {
    const text = String(value || '').trim();
    if (!text) return 0;
    const at = Date.parse(`${text}T00:00:00`);
    return Number.isFinite(at) ? at : 0;
  }

  _getSnapshot() {
    return this.statsProvider ? (this.statsProvider({ ...this.filters }) || {}) : {};
  }

  async _handleBrainCheckRun() {
    const snapshot = this._getSnapshot();
    const movie = snapshot?.currentMovie || null;
    const movieKey = String(movie?.movie || '').trim();
    if (!movieKey) {
      this.brainCheckRunState = {
        running: false,
        status: 'error',
        message: 'Load a movie before running a live brain check.',
        movie: '',
        result: null
      };
      this.refreshStats();
      return;
    }
    if (typeof this.brainCheckRunner !== 'function') {
      this.brainCheckRunState = {
        running: false,
        status: 'error',
        message: 'Brain check runner is unavailable in this session.',
        movie: movieKey,
        result: null
      };
      this.refreshStats();
      return;
    }

    this.brainCheckRunState = {
      running: true,
      status: 'running',
      message: 'Running scored brain check against the current movie brain…',
      movie: movieKey,
      result: null
    };
    this.refreshStats();

    try {
      const result = await this.brainCheckRunner({ movie });
      this.brainCheckRunState = {
        running: false,
        status: result?.ok === false ? 'warn' : 'success',
        message: String(result?.message || (result?.ok === false ? 'Brain check did not complete.' : 'Brain check finished.')),
        movie: movieKey,
        result: result?.ok === false ? null : (result || null)
      };
    } catch (error) {
      this.brainCheckRunState = {
        running: false,
        status: 'error',
        message: String(error?.message || 'Brain check failed.'),
        movie: movieKey,
        result: null
      };
    }

    this.refreshStats();
  }

  _handleRangeChange() {
    this.filters = {
      fromAt: this._parseDateInputValue(this.uiRangeFrom?.value || ''),
      toAt: this._parseDateInputValue(this.uiRangeTo?.value || '')
    };
    if (this.filters.fromAt && this.filters.toAt && this.filters.toAt < this.filters.fromAt) {
      this.filters.toAt = this.filters.fromAt;
      if (this.uiRangeTo) this.uiRangeTo.value = this._formatDateInputValue(this.filters.toAt);
    }
    this.refreshStats();
  }

  _clearRange() {
    this.filters = { fromAt: 0, toAt: 0 };
    if (this.uiRangeFrom) this.uiRangeFrom.value = '';
    if (this.uiRangeTo) this.uiRangeTo.value = '';
    this.refreshStats();
  }

  async _copyText(text = '') {
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

  _downloadText(filename, text, mimeType = 'text/plain;charset=utf-8') {
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

  _setActionState(button, idleText, activeText) {
    if (!button) return;
    button.textContent = activeText;
    setTimeout(() => {
      button.textContent = idleText;
    }, 1200);
  }

  _buildExportJson(snapshot = {}) {
    return `${JSON.stringify(snapshot, null, 2)}\n`;
  }

  _csvRow(values = []) {
    return values.map((value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(',');
  }

  _buildExportCsv(snapshot = {}) {
    const lines = [];
    const analytics = snapshot?.analytics || {};
    const totals = snapshot?.totals || {};
    const movies = Array.isArray(snapshot?.movies) ? snapshot.movies : [];
    const sessionSource = snapshot?.sessionSource || {};
    const trainingRuntime = snapshot?.trainingRuntime || {};
    const modelItems = Array.isArray(analytics?.modelsReport?.items) ? analytics.modelsReport.items : [];
    const timeline = Array.isArray(analytics?.visualSeries?.timeline) ? analytics.visualSeries.timeline : [];

    lines.push(this._csvRow(['section', 'label', 'value', 'detail']));
    lines.push(this._csvRow(['summary', 'report_label', analytics?.reportLabel || '', analytics?.rangeLabel || '']));
    lines.push(this._csvRow(['summary', 'tracked_movies', totals?.trackedMovies || 0, '']));
    lines.push(this._csvRow(['summary', 'podcast_turns', totals?.podcastTurns || 0, '']));
    lines.push(this._csvRow(['summary', 'free_chat_turns', totals?.freeChatTurns || 0, '']));
    lines.push(this._csvRow(['summary', 'stage_turns', totals?.stageTurns || 0, '']));
    lines.push(this._csvRow(['summary', 'success_rate', this._formatPercent(totals?.successRate || 0), '']));
    lines.push(this._csvRow(['summary', 'avg_brain_score', totals?.avgBrainScore || 0, '']));
    lines.push('');
    lines.push(this._csvRow(['training_runtime', 'status', trainingRuntime?.status || '', trainingRuntime?.lastReadyState || '']));
    lines.push(this._csvRow(['training_runtime', 'heartbeat', trainingRuntime?.heartbeatLabel || '', trainingRuntime?.provider || '']));
    lines.push(this._csvRow(['training_runtime', 'last_error', trainingRuntime?.lastErrorLabel || 'None', '']));
    lines.push(this._csvRow(['training_runtime', 'latency_avg_ms', trainingRuntime?.latency?.averageMs || 0, `p99 ${trainingRuntime?.latency?.p99Ms || 0}`]));
    lines.push(this._csvRow(['training_runtime', 'fallback', trainingRuntime?.modelFallbackActive ? 'active' : 'inactive', trainingRuntime?.fallbackEngine || '']));
    lines.push(this._csvRow(['training_runtime', 'seed_to_dict_funnel', `${analytics?.debug?.seedToDictFunnel?.staged || 0} -> ${analytics?.debug?.seedToDictFunnel?.batched || 0} -> ${analytics?.debug?.seedToDictFunnel?.stored || 0}`, analytics?.debug?.seedToDictFunnel?.state || '']));
    lines.push('');
    lines.push(this._csvRow(['session_source', 'location', sessionSource?.locationLabel || '', sessionSource?.deviceType || '']));
    lines.push(this._csvRow(['session_source', 'ip_address', sessionSource?.ipAddress || '', sessionSource?.status || '']));
    lines.push(this._csvRow(['session_source', 'network', sessionSource?.networkType || '', sessionSource?.online || '']));
    lines.push(this._csvRow(['session_source', 'viewport', sessionSource?.viewport || '', sessionSource?.screen || '']));
    lines.push(this._csvRow(['session_source', 'language', sessionSource?.browserLanguage || '', sessionSource?.timezone || '']));
    lines.push(this._csvRow(['session_source', 'user_agent', sessionSource?.userAgent || '', '']));
    lines.push('');
    lines.push(this._csvRow(['models', 'label', 'count']));
    modelItems.forEach((item) => lines.push(this._csvRow(['models', item?.label || '', item?.value || 0])));
    lines.push('');
    lines.push(this._csvRow(['movies', 'movie', 'podcast_turns', 'free_chat_turns', 'stage_turns', 'success_rate', 'dict_writes', 'avg_brain_score', 'first_free_chat', 'first_podcast', 'models']));
    movies.forEach((movie) => {
      lines.push(this._csvRow([
        'movies',
        movie?.title || '',
        movie?.podcastTurns || 0,
        movie?.freeChatTurns || 0,
        movie?.stageTurns || 0,
        this._formatPercent(movie?.successRate || 0),
        movie?.dictSaved || 0,
        movie?.avgBrainScore || 0,
        this._formatDate(movie?.firstFreeChatAt, ''),
        this._formatDate(movie?.firstPodcastAt, ''),
        movie?.modelUsageSummary || ''
      ]));
    });
    lines.push('');
    lines.push(this._csvRow(['timeline', 'bucket', 'involvement', 'success_rate', 'dict_saved', 'brain_score']));
    timeline.forEach((point) => {
      lines.push(this._csvRow([
        'timeline',
        point?.label || '',
        point?.involvement || 0,
        this._formatPercent(point?.successRate || 0),
        point?.dictSaved || 0,
        point?.brainScore || 0
      ]));
    });

    return `${lines.join('\n')}\n`;
  }

  async _copySnapshotJson(button) {
    const text = this._buildExportJson(this._getSnapshot());
    const copied = await this._copyText(text);
    this._setActionState(button, 'Copy JSON', copied ? 'Copied' : 'Failed');
  }

  _downloadSnapshotJson(button) {
    const filename = `gesture-3d-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    this._downloadText(filename, this._buildExportJson(this._getSnapshot()), 'application/json;charset=utf-8');
    this._setActionState(button, 'Save JSON', 'Saved');
  }

  _downloadSnapshotCsv(button) {
    const filename = `gesture-3d-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    this._downloadText(filename, this._buildExportCsv(this._getSnapshot()), 'text/csv;charset=utf-8');
    this._setActionState(button, 'Save CSV', 'Saved');
  }

  _exportForNotebookLM(button) {
    const snapshot = this._getSnapshot();
    const wikiEntries = Array.isArray(snapshot?.wikiContext) ? snapshot.wikiContext : [];
    if (!wikiEntries.length) return;

    const lines = [
      '# Gesture-3D — Web Context Export for NotebookLM',
      `> Generated: ${new Date().toISOString()}`,
      '',
      'Upload this file to NotebookLM as a source document. After NotebookLM synthesises it,',
      'paste the synthesis into the `notebookContext` field inside the relevant brain in `src/movieBrains.js`.',
      'That will inject it as "highest authority" context into every training batch for that movie.',
      ''
    ];

    for (const entry of wikiEntries) {
      const movie = String(entry.movie || '').replace(/_/g, ' ').replace(/\.mp4$/i, '');
      const parts = entry.snippets ? entry.snippets.split(' | ').filter(Boolean) : [];
      if (!parts.length) continue;
      lines.push(`## ${movie}`);
      lines.push(`**Terms fetched:** ${(entry.terms || []).join(', ') || 'none'}`);
      lines.push('');
      for (const part of parts) {
        // Strip leading [Title · Source] bracket label for cleaner NotebookLM reading
        const clean = part.replace(/^\[[^\]]+\]\s*/, '');
        lines.push(`- ${clean}`);
      }
      lines.push('');
    }

    const notebookSummary = Array.isArray(snapshot?.notebookContextSummary) ? snapshot.notebookContextSummary : [];
    const withNc = notebookSummary.filter((n) => n.hasNotebookContext);
    if (withNc.length) {
      lines.push('---');
      lines.push('## Curated Notebook Context (already set in brains)');
      lines.push('');
      for (const n of withNc) {
        lines.push(`- **${String(n.movie).replace(/_/g, ' ').replace(/\.mp4$/i, '')}**: ${n.notebookContextLength} chars of curated synthesis already injected`);
      }
      lines.push('');
    }

    const filename = `gesture-3d-notebook-context-${new Date().toISOString().slice(0, 10)}.md`;
    this._downloadText(filename, lines.join('\n'), 'text/markdown;charset=utf-8');
    this._setActionState(button, 'Export for NotebookLM', 'Saved');
  }

  _openNotebookImportModal() {
    const snapshot = this._getSnapshot();
    const wikiEntries = Array.isArray(snapshot?.wikiContext) ? snapshot.wikiContext : [];
    const notebookSummary = Array.isArray(snapshot?.notebookContextSummary) ? snapshot.notebookContextSummary : [];

    // Build movie options list — notebookSummary keys match movieBrains.js exactly (TitleCase),
    // so seed from those first, then add wiki entries only if not already present (case-insensitive).
    const allMovies = notebookSummary.map((n) => String(n.movie || '')).filter(Boolean);
    for (const e of wikiEntries) {
      const key = String(e.movie || '').trim();
      if (key && !allMovies.find((m) => m.toLowerCase() === key.toLowerCase())) allMovies.push(key);
    }
    if (!allMovies.length) allMovies.push(String(snapshot?.currentMovie?.movie || '').trim() || 'Unknown');

    // Default selection: the currently active movie
    const activeMovie = String(snapshot?.currentMovie?.movie || '').trim();
    const defaultMovie = (activeMovie && allMovies.find((m) => m.toLowerCase() === activeMovie.toLowerCase())) || allMovies[0] || '';

    const existingPopup = document.getElementById('dash-notebook-import-modal');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'dash-notebook-import-modal';
    popup.innerHTML = `
      <div class="dnim-overlay">
        <div class="dnim-card">
          <div class="dnim-header">
            <span class="dnim-title">Import NotebookLM Synthesis</span>
            <span class="dnim-subtitle">Paste synthesis text &#x2192; injected as highest-authority context into Gemma training</span>
            <button id="dnim-close" class="dnim-close">✕</button>
          </div>
          <div class="dnim-body">
            <label class="dnim-label">Movie</label>
            <select id="dnim-movie-select" class="dnim-select">
              ${allMovies.map((m) => {
                const label = m.replace(/_/g, ' ').replace(/\.mp4$/i, '');
                const hasNc = notebookSummary.find((n) => n.movie === m)?.hasNotebookContext;
                const sel = m === defaultMovie ? ' selected' : '';
                return `<option value="${this._escapeHtml(m)}"${sel}>${this._escapeHtml(label)}${hasNc ? ' ● ' : ''}</option>`;
              }).join('')}
            </select>
            <label class="dnim-label" style="margin-top:0.9rem">Synthesis text <span class="dnim-hint">(paste NotebookLM output here)</span></label>
            <textarea id="dnim-textarea" class="dnim-textarea" placeholder="Paste the NotebookLM synthesis here. This will be injected before every training batch for the selected movie, above all Wikipedia/DDG/Open Library context." rows="10"></textarea>
            <div id="dnim-existing" class="dnim-existing" style="display:none"></div>
          </div>
          <div class="dnim-footer">
            <button id="dnim-clear-btn" class="dnim-action-btn dnim-action-btn-ghost">Clear</button>
            <button id="dnim-apply-btn" class="dnim-action-btn dnim-action-btn-primary">Apply</button>
            <span id="dnim-status" class="dnim-status"></span>
          </div>
          <div class="dnim-code-hint">
            <div class="dnim-code-hint-label">To persist permanently into <code>src/movieBrains.js</code>:</div>
            <pre id="dnim-code-snippet" class="dnim-code-snippet">// Select a movie and paste synthesis text above, then click Apply</pre>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <button id="dnim-copy-snippet" class="dnim-action-btn dnim-action-btn-ghost dnim-copy-snippet">Copy snippet</button>
              <button id="dnim-save-file-btn" class="dnim-action-btn dnim-action-btn-save">&#x1F4BE; Save to file</button>
              <button id="dnim-deploy-btn" class="dnim-action-btn dnim-action-btn-deploy">&#x1F680; Save &amp; Deploy</button>
              <span id="dnim-save-status" class="dnim-status"></span>
            </div>
            <div class="dnim-save-hint">Save to file writes directly to <code>src/movieBrains.js</code> (dev server only). Deploy also commits and pushes to Vercel.</div>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById('dash-notebook-import-styles')) {
      const st = document.createElement('style');
      st.id = 'dash-notebook-import-styles';
      st.textContent = `
        #dash-notebook-import-modal { position: fixed; inset: 0; z-index: 700; }
        .dnim-overlay {
          position: absolute; inset: 0;
          background: rgba(2,5,10,0.78);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
        }
        .dnim-card {
          width: min(640px, 96vw);
          max-height: 92vh;
          overflow-y: auto;
          background: rgba(6,11,20,0.97);
          border: 1px solid rgba(96,165,250,0.22);
          border-radius: 20px;
          padding: 1.6rem 1.8rem 1.5rem;
          box-shadow: 0 24px 80px rgba(0,0,0,0.75);
          font-family: inherit;
          color: rgba(210,230,255,0.92);
          display: flex; flex-direction: column; gap: 0;
        }
        .dnim-header { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .dnim-title { font-size: 1rem; font-weight: 700; color: rgba(220,240,255,0.97); }
        .dnim-subtitle { font-size: 0.72rem; color: rgba(140,180,220,0.55); flex: 1; min-width: 0; }
        .dnim-close { margin-left: auto; background: none; border: none; cursor: pointer; font-size: 1.2rem; color: rgba(180,210,240,0.45); transition: color 0.15s; }
        .dnim-close:hover { color: rgba(250,180,180,0.85); }
        .dnim-body { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1.1rem; }
        .dnim-label { font-size: 0.68rem; font-weight: 600; color: rgba(160,190,230,0.7); letter-spacing: 0.06em; text-transform: uppercase; }
        .dnim-hint { font-weight: 400; text-transform: none; color: rgba(130,170,210,0.5); font-size: 0.64rem; letter-spacing: 0; }
        .dnim-select {
          width: 100%; padding: 0.4rem 0.6rem; border-radius: 7px;
          background: rgba(20,30,50,0.85); border: 1px solid rgba(96,165,250,0.22);
          color: rgba(200,225,255,0.88); font-family: inherit; font-size: 0.78rem;
        }
        .dnim-textarea {
          width: 100%; padding: 0.55rem 0.7rem; border-radius: 7px;
          background: rgba(16,24,40,0.9); border: 1px solid rgba(96,165,250,0.18);
          color: rgba(200,225,255,0.88); font-family: inherit; font-size: 0.76rem;
          line-height: 1.6; resize: vertical; min-height: 160px;
          box-sizing: border-box;
        }
        .dnim-textarea:focus { outline: none; border-color: rgba(96,165,250,0.45); }
        .dnim-existing { font-size: 0.7rem; color: rgba(251,191,36,0.75); padding: 0.5rem 0.7rem; background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.18); border-radius: 6px; margin-top: 0.5rem; }
        .dnim-footer { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; }
        .dnim-status { font-size: 0.68rem; color: rgba(110,231,183,0.8); }
        .dnim-action-btn { padding: 0.28rem 0.9rem; border-radius: 6px; font-size: 0.7rem; font-family: inherit; cursor: pointer; transition: background 0.15s, color 0.15s; border: 1px solid transparent; }
        .dnim-action-btn-primary { background: rgba(96,165,250,0.18); border-color: rgba(96,165,250,0.4); color: rgba(147,197,253,0.95); }
        .dnim-action-btn-primary:hover { background: rgba(96,165,250,0.3); }
        .dnim-action-btn-ghost { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); color: rgba(180,200,230,0.6); }
        .dnim-action-btn-ghost:hover { background: rgba(255,255,255,0.08); }
        .dnim-code-hint { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .dnim-code-hint-label { font-size: 0.65rem; color: rgba(140,170,210,0.55); }
        .dnim-code-snippet {
          font-family: 'Consolas', 'Courier New', monospace; font-size: 0.65rem;
          background: rgba(14,20,36,0.85); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 6px; padding: 0.55rem 0.7rem; color: rgba(171,213,169,0.85);
          white-space: pre-wrap; word-break: break-all; margin: 0; max-height: 120px; overflow-y: auto;
        }
        .dnim-copy-snippet { align-self: flex-start; }
        .dnim-action-btn-save { background: rgba(52,211,153,0.12); border-color: rgba(52,211,153,0.4); color: rgba(110,231,183,0.95); }
        .dnim-action-btn-save:hover { background: rgba(52,211,153,0.22); }
        .dnim-action-btn-deploy { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.4); color: rgba(253,224,71,0.95); }
        .dnim-action-btn-deploy:hover { background: rgba(251,191,36,0.2); }
        .dnim-save-hint { font-size: 0.62rem; color: rgba(120,160,200,0.45); margin-top: 0.25rem; }
      `;
      document.head.appendChild(st);
    }

    document.body.appendChild(popup);

    const movieSelect = popup.querySelector('#dnim-movie-select');
    const textarea = popup.querySelector('#dnim-textarea');
    const existingDiv = popup.querySelector('#dnim-existing');
    const applyBtn = popup.querySelector('#dnim-apply-btn');
    const clearBtn = popup.querySelector('#dnim-clear-btn');
    const statusEl = popup.querySelector('#dnim-status');
    const codeSnippet = popup.querySelector('#dnim-code-snippet');
    const copySnippetBtn = popup.querySelector('#dnim-copy-snippet');
    const saveFileBtn = popup.querySelector('#dnim-save-file-btn');
    const deployBtn = popup.querySelector('#dnim-deploy-btn');
    const saveStatusEl = popup.querySelector('#dnim-save-status');

    const updateCodeSnippet = () => {
      const movie = movieSelect.value;
      const text = textarea.value.trim();
      if (!text) {
        codeSnippet.textContent = '// Paste synthesis text above to see the snippet';
        return;
      }
      const escaped = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
      codeSnippet.textContent = '// In src/movieBrains.js, inside \'' + movie + '\' \u2192 trainingSeeds:\nnotebookContext: `' + escaped + '`,';
    };

    const updateExisting = () => {
      const movie = movieSelect.value;
      const entry = notebookSummary.find((n) => n.movie === movie);
      if (entry?.hasNotebookContext) {
        existingDiv.style.display = '';
        existingDiv.textContent = `⚠ This movie already has ${entry.notebookContextLength} chars of notebook context. Applying will replace it.`;
      } else {
        existingDiv.style.display = 'none';
      }
    };

    movieSelect.addEventListener('change', () => { updateExisting(); updateCodeSnippet(); });
    textarea.addEventListener('input', updateCodeSnippet);
    updateExisting();
    updateCodeSnippet();

    applyBtn.addEventListener('click', async () => {
      const movie = movieSelect.value;
      const text = textarea.value.trim();
      if (!text) { statusEl.textContent = 'Paste synthesis text first.'; return; }
      if (typeof this.notebookContextHandler === 'function') {
        await this.notebookContextHandler(movie, text);
        statusEl.textContent = '✓ Applied — active from next training batch';
        updateCodeSnippet();
        setTimeout(() => this.refreshStats(), 300);
      } else {
        statusEl.textContent = 'Handler not connected — copy the snippet below instead.';
      }
    });

    clearBtn.addEventListener('click', () => {
      const movie = movieSelect.value;
      textarea.value = '';
      if (typeof this.notebookContextHandler === 'function') {
        this.notebookContextHandler(movie, '');
        statusEl.textContent = 'Cleared.';
        setTimeout(() => this.refreshStats(), 300);
      }
      updateCodeSnippet();
    });

    copySnippetBtn.addEventListener('click', () => {
      this._copyText(codeSnippet.textContent).then((ok) => {
        this._setActionState(copySnippetBtn, 'Copy snippet', ok ? 'Copied!' : 'Failed');
      });
    });

    saveFileBtn.addEventListener('click', async () => {
      const movie = movieSelect.value;
      const text = textarea.value.trim();
      if (!text) { saveStatusEl.textContent = 'Paste synthesis text first.'; return; }
      saveFileBtn.disabled = true;
      saveStatusEl.textContent = 'Saving\u2026';
      try {
        const res = await fetch('/api/dev/persist-notebook-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movie, notebookContext: text })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          saveStatusEl.textContent = '\u2713 Saved to src/movieBrains.js';
          saveStatusEl.style.color = 'rgba(110,231,183,0.9)';
          setTimeout(() => this.refreshStats(), 400);
        } else {
          saveStatusEl.textContent = 'Error: ' + (data.error || res.status);
          saveStatusEl.style.color = 'rgba(252,165,165,0.9)';
        }
      } catch (e) {
        saveStatusEl.textContent = 'Failed (dev server only)';
        saveStatusEl.style.color = 'rgba(252,165,165,0.9)';
      } finally {
        saveFileBtn.disabled = false;
      }
    });

    deployBtn.addEventListener('click', async () => {
      const movie = movieSelect.value;
      const text = textarea.value.trim();
      if (!text) { saveStatusEl.textContent = 'Paste synthesis text first.'; return; }
      deployBtn.disabled = true;
      saveStatusEl.style.color = '';
      saveStatusEl.textContent = 'Saving\u2026';
      try {
        // Step 1: write file
        const saveRes = await fetch('/api/dev/persist-notebook-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movie, notebookContext: text })
        });
        if (!saveRes.ok) {
          const d = await saveRes.json().catch(() => ({}));
          throw new Error(d.error || 'Save failed');
        }
        saveStatusEl.textContent = 'Committing\u2026';
        // Step 2: git commit + push
        const pushRes = await fetch('/api/dev/git-push-brains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movie })
        });
        const pushData = await pushRes.json().catch(() => ({}));
        if (pushRes.ok) {
          saveStatusEl.textContent = '\u2713 Deployed to Vercel';
          saveStatusEl.style.color = 'rgba(253,224,71,0.9)';
          setTimeout(() => this.refreshStats(), 400);
        } else {
          throw new Error(pushData.error || 'Push failed');
        }
      } catch (e) {
        saveStatusEl.textContent = 'Error: ' + e.message;
        saveStatusEl.style.color = 'rgba(252,165,165,0.9)';
      } finally {
        deployBtn.disabled = false;
      }
    });

    popup.querySelector('#dnim-close').addEventListener('click', () => popup.remove());
    popup.querySelector('.dnim-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) popup.remove(); });
  }

  _buildBars(items = [], options = {}) {
    const max = Math.max(1, ...items.map((item) => Number(item?.value || 0)));
    const tone = options?.tone || 'cool';
    return `
      <div class="dash-chart-bars">
        ${items.map((item) => {
          const value = Math.max(0, Number(item?.value || 0));
          const width = Math.max(4, Math.round((value / max) * 100));
          return `
            <div class="dash-chart-bar"${item?.tooltip ? ` data-tooltip="${this._escapeHtml(item.tooltip)}"` : ''}>
              <div class="dash-chart-bar-label">${this._escapeHtml(item?.label || '')}</div>
              <div class="dash-chart-track"><div class="dash-chart-fill" data-tone="${this._escapeHtml(item?.tone || tone)}" style="width:${width}%"></div></div>
              <div class="dash-chart-bar-value">${this._escapeHtml(item?.displayValue ?? value)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  _renderLatestLog(latestLog = null) {
    if (!this.uiLiveFeed) return;
    if (!latestLog?.input && !latestLog?.response) {
      this.uiLiveFeed.textContent = 'Waiting for extraction...';
      return;
    }

    this.uiLiveFeed.innerHTML = `
      <div class="dash-live-question">Q: ${this._escapeHtml(String(latestLog?.input || '').trim())}</div>
      <div class="dash-live-answer">A: ${this._escapeHtml(String(latestLog?.response || '').trim())}</div>
    `;
    this.uiLiveFeed.scrollTop = this.uiLiveFeed.scrollHeight;
  }

  _renderSummary(snapshot = {}) {
    if (!this.uiSummaryGrid) return;
    const analytics = snapshot?.analytics || {};
    const cards = [
      {
        label: 'Model leader',
        value: analytics?.modelsReport?.topLabel || 'No model yet',
        hint: `${analytics?.modelsReport?.topValue || 0} tracked log${Number(analytics?.modelsReport?.topValue || 0) === 1 ? '' : 's'}`
      },
      {
        label: 'Training success',
        value: this._formatPercent(snapshot?.totals?.successRate || 0),
        hint: `${snapshot?.totals?.successfulBatches || 0} ok / ${snapshot?.totals?.failedBatches || 0} fail`
      },
      {
        label: 'Training batches',
        value: (snapshot?.totals?.successfulBatches || 0) + (snapshot?.totals?.failedBatches || 0),
        hint: `${snapshot?.totals?.trackedMovies || 0} movie${Number(snapshot?.totals?.trackedMovies || 0) === 1 ? '' : 's'} in report`
      },
      {
        label: 'Podcast turns',
        value: snapshot?.totals?.podcastTurns || 0,
        hint: `${snapshot?.totals?.freeChatTurns || 0} free / ${snapshot?.totals?.stageTurns || 0} stage`
      },
      {
        label: 'Brain quality',
        value: snapshot?.totals?.avgBrainScore || 0,
        hint: `${snapshot?.totals?.brainChecks || 0} checkpoint${Number(snapshot?.totals?.brainChecks || 0) === 1 ? '' : 's'}`
      },
      {
        label: 'DICT writes',
        value: snapshot?.totals?.dictSaved || 0,
        hint: `${snapshot?.totals?.dictImpact || 0}% coverage`
      }
    ];

    this.uiSummaryGrid.innerHTML = cards.map((card) => `
      <div class="dash-summary-card">
        <div class="dash-card-kicker">${this._escapeHtml(card.label)}</div>
        <div class="dash-summary-card-value">${this._escapeHtml(card.value)}</div>
        <div class="dash-summary-card-hint">${this._escapeHtml(card.hint)}</div>
      </div>
    `).join('');
  }

  _renderAnalytics(snapshot = {}) {
    if (!this.uiAnalytics) return;
    const analytics = snapshot?.analytics || {};
    const modelsReport = analytics?.modelsReport || {};
    const trainingRuntime = snapshot?.trainingRuntime || {};
    const seedToDict = analytics?.debug?.seedToDictFunnel || {};
    const cloudUsage = analytics?.cloudUsage || {};
    const modelItems = Array.isArray(modelsReport?.items) ? modelsReport.items : [];
    const modelBarsHtml = modelItems.length
      ? modelItems.map((item) => {
          const isBlocked = item.label === 'Cloud Quota';
          const pct = modelsReport.topValue > 0 ? Math.round((Number(item.value || 0) / modelsReport.topValue) * 100) : 0;
          if (isBlocked) {
            return `<div class="dash-model-row" title="These are API rate-limit rejections — requests the cloud refused because the free quota was exhausted. Not actual model completions.">`
              + `<span class="dash-model-label dash-model-label-blocked">${this._escapeHtml(item.label)}<span class="dash-model-blocked-badge">blocked</span></span>`
              + `<span class="dash-model-bar-wrap"><span class="dash-model-bar dash-model-bar-blocked" style="width:${pct}%"></span></span>`
              + `<span class="dash-model-count dash-model-count-blocked">${this._escapeHtml(item.value)}</span>`
              + `</div>`;
          }
          return `<div class="dash-model-row"><span class="dash-model-label">${this._escapeHtml(item.label)}</span><span class="dash-model-bar-wrap"><span class="dash-model-bar" style="width:${pct}%"></span></span><span class="dash-model-count">${this._escapeHtml(item.value)}</span></div>`;
        }).join('')
      : '<div class="dash-empty">No model activity yet</div>';
    this.uiAnalytics.innerHTML = `
      <div class="dash-card-stack">
        <div class="dash-card-kicker">Overview</div>
        <div class="dash-card-title">${this._escapeHtml(analytics?.reportLabel || 'App report through today')}</div>
        <div class="dash-card-copy">${this._escapeHtml(analytics?.narrative || 'Live report data will appear here as the app is used.')}</div>
      </div>
      <div class="dash-analytics-side">
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Range</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.rangeLabel || 'Current session')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">First free chat</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.firstFreeChatLabel || 'No free chat yet')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">First podcast</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.firstPodcastLabel || 'No podcast yet')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Top model</div>
          <div class="dash-card-copy">${this._escapeHtml(modelsReport?.topLabel || 'No model yet')} · ${this._escapeHtml(modelsReport?.topValue || 0)} logs</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Training</div>
          <div class="dash-card-copy">${this._escapeHtml(snapshot?.totals?.successfulBatches || 0)} ok · ${this._escapeHtml(snapshot?.totals?.failedBatches || 0)} fail · ${this._escapeHtml(this._formatPercent(snapshot?.totals?.successRate || 0))}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Stored / learned</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.learningSummary || 'No stored learning yet')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Context augmentation</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.contextMetrics?.contextAugmentationScore ?? 0)} score · density ${this._escapeHtml(analytics?.contextMetrics?.referenceDensity ?? 0)}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Leader / Active</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.topMovieTitle || 'No movie')}${analytics?.currentMovieTitle && analytics.currentMovieTitle !== analytics.topMovieTitle ? ` · active: ${this._escapeHtml(analytics.currentMovieTitle)}` : ''}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Batch density</div>
          <div class="dash-card-copy">${this._escapeHtml(analytics?.batchDensity || 0)} total batch${Number(analytics?.batchDensity || 0) === 1 ? '' : 'es'}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Seed-to-DICT funnel</div>
          <div class="dash-card-copy">${this._escapeHtml(seedToDict?.staged || 0)} → ${this._escapeHtml(seedToDict?.batched || 0)} → ${this._escapeHtml(seedToDict?.stored || 0)} · ${this._escapeHtml(seedToDict?.state || 'Idle')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Heartbeat</div>
          <div class="dash-card-copy">${this._escapeHtml(trainingRuntime?.heartbeatLabel || 'No heartbeat yet')} · ${this._escapeHtml(trainingRuntime?.lastReadyState || 'idle')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Latency</div>
          <div class="dash-card-copy">Avg ${this._escapeHtml(trainingRuntime?.latency?.averageMs || 0)}ms · p99 ${this._escapeHtml(trainingRuntime?.latency?.p99Ms || 0)}ms</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Last error</div>
          <div class="dash-card-copy">${this._escapeHtml(trainingRuntime?.lastErrorLabel || 'None')}</div>
        </div>
        <div class="dash-analytics-mini">
          <div class="dash-mini-label">Fallback</div>
          <div class="dash-card-copy">${this._escapeHtml(trainingRuntime?.modelFallbackActive ? `${trainingRuntime?.fallbackEngine || 'fallback'} ${trainingRuntime?.fallbackModel || ''}`.trim() : 'Primary path')}</div>
        </div>
      </div>
      <div class="dash-models-report">
        <div class="dash-section-title">Models Report <span class="dash-section-tip" data-tip="Which engines and local models handled each turn — Gemma4, Brain Reply, DICT, Cloud, and quota-blocked attempts.">i</span></div>
        ${modelBarsHtml}
        ${cloudUsage?.ready ? `<div class="dash-model-cloud-row">Cloud today: ${this._escapeHtml(cloudUsage.todayLabel || '0 req')} · All-time: ${this._escapeHtml(cloudUsage.allTimeLabel || '0 req')} · Quota blocks: ${this._escapeHtml(cloudUsage.quotaBlocks || 0)}</div>` : ''}
      </div>
    `;
  }

  _renderCurrentMovie(snapshot = {}) {
    if (!this.uiCurrentMovie) return;
    const movie = snapshot?.currentMovie || null;
    if (!movie) {
      this.uiCurrentMovie.innerHTML = '<div class="dash-empty">Load a movie and start chatting or training to populate this report.</div>';
      return;
    }

    const brainCheckRows = this._buildBrainCheckRows(movie);
    const activeBrainCheckState = this.brainCheckRunState?.movie === String(movie?.movie || '').trim()
      ? this.brainCheckRunState
      : { running: false, status: 'idle', message: '', result: null };
    const brainCheckStatusClass = activeBrainCheckState.status && activeBrainCheckState.status !== 'idle'
      ? `dash-brain-check-status is-${this._escapeHtml(activeBrainCheckState.status)}`
      : 'dash-brain-check-status';
    const brainCheckResult = activeBrainCheckState?.result;
    const brainCheckResultMarkup = brainCheckResult ? `
      <div class="dash-brain-check-result">
        <div class="dash-brain-check-result-card">
          <div class="dash-mini-label">Score</div>
          <div class="dash-mini-value">${this._escapeHtml(brainCheckResult.score)}</div>
        </div>
        <div class="dash-brain-check-result-card">
          <div class="dash-mini-label">Rank</div>
          <div class="dash-mini-value">${this._escapeHtml(brainCheckResult.rank || 'D')}</div>
        </div>
        <div class="dash-brain-check-result-card">
          <div class="dash-mini-label">Source</div>
          <div class="dash-mini-value">${this._escapeHtml(brainCheckResult.source || 'Unknown')}</div>
        </div>
        <div class="dash-brain-check-result-card">
          <div class="dash-mini-label">Insight</div>
          <div class="dash-mini-value">${this._escapeHtml(brainCheckResult.insight || 'No insight')}</div>
        </div>
      </div>
    ` : '';
    const brainCheckMarkup = this.brainCheckPanelOpen ? `
      <div class="dash-brain-check-panel">
        <div class="dash-mini-label">Brain Check</div>
        <div class="dash-brain-check-copy">Use these prompts to test stored DICT with concrete recall instead of abstract mood language.</div>
        <div class="dash-brain-check-actions">
          <button class="dash-inline-btn" type="button" data-dash-brain-check-run="true" ${activeBrainCheckState.running ? 'disabled' : ''}>${activeBrainCheckState.running ? 'Running…' : 'Run Brain Check'}</button>
          <div class="${brainCheckStatusClass}">${this._escapeHtml(activeBrainCheckState.message || '')}</div>
        </div>
        ${brainCheckResultMarkup}
        <table class="dash-brain-check-table">
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Should Mention</th>
              <th>Fail If</th>
            </tr>
          </thead>
          <tbody>
            ${brainCheckRows.map((row) => `
              <tr>
                <td>${this._escapeHtml(row.prompt)}</td>
                <td>${this._escapeHtml(row.shouldMention)}</td>
                <td>${this._escapeHtml(row.failIf)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    this.uiCurrentMovie.innerHTML = `
      <div class="dash-current-movie-main">
        <div class="dash-mini-label">Movie</div>
        <div class="dash-current-movie-title">${this._escapeHtml(movie.title)}</div>
        <div class="dash-current-movie-copy">${this._escapeHtml(movie.summary)}</div>
        <div class="dash-current-movie-actions">
          <button class="dash-inline-btn" type="button" data-dash-brain-check-toggle="true">${this.brainCheckPanelOpen ? 'Hide Brain Check' : 'Brain Check'}</button>
        </div>
      </div>
      <div class="dash-current-movie-mini">
        <div class="dash-mini-card">
          <div class="dash-mini-label">Turns</div>
          <div class="dash-mini-value">Podcast ${movie.podcastTurns} · Free ${movie.freeChatTurns} · Stage ${movie.stageTurns}</div>
        </div>
        <div class="dash-mini-card">
          <div class="dash-mini-label">Training</div>
          <div class="dash-mini-value">${movie.successfulBatches} ok / ${movie.failedBatches} fail · ${this._formatPercent(movie.successRate)}</div>
        </div>
        <div class="dash-mini-card">
          <div class="dash-mini-label">Brain quality</div>
          <div class="dash-mini-value">Avg ${movie.avgBrainScore} · ${movie.brainChecks} checks · ${this._escapeHtml(movie.brainSourceMix)}</div>
        </div>
        <div class="dash-mini-card">
          <div class="dash-mini-label">Parameters</div>
          <div class="dash-mini-value">${movie.dictionaryKeys} dict keys · ${movie.trainingSeedGroups} seed groups · ${movie.trainingSeedItems} seed items · ${movie.personaSignals} persona signals</div>
        </div>
        <div class="dash-mini-card">
          <div class="dash-mini-label">First dates</div>
          <div class="dash-mini-value">Free ${this._escapeHtml(this._formatDate(movie.firstFreeChatAt, 'Not yet'))} · Podcast ${this._escapeHtml(this._formatDate(movie.firstPodcastAt, 'Not yet'))}</div>
        </div>
        <div class="dash-mini-card">
          <div class="dash-mini-label">Models</div>
          <div class="dash-mini-value">${this._escapeHtml(movie.modelUsageSummary || 'No model activity yet')}</div>
        </div>
      </div>
      <div class="dash-brain-memory-section">
        <div class="dash-section-title">Brain Memory (KV) <span class="dash-section-tip" data-tip="Live memory stats for this movie: source mix shows which layer answered (Local/L2/L3), DICT coverage tracks how many brain keys have been written, and checks show exam quality scores.">i</span></div>
        <div class="dash-brain-memory-grid">
          <div class="dash-brain-mem-stat"><div class="dash-brain-mem-key">Source mix</div><div class="dash-brain-mem-val">${this._escapeHtml(movie.brainSourceMix || '—')}</div></div>
          <div class="dash-brain-mem-stat"><div class="dash-brain-mem-key">Avg score</div><div class="dash-brain-mem-val">${movie.avgBrainScore ?? '—'}</div></div>
          <div class="dash-brain-mem-stat"><div class="dash-brain-mem-key">Brain checks</div><div class="dash-brain-mem-val">${movie.brainChecks ?? 0}</div></div>
          <div class="dash-brain-mem-stat"><div class="dash-brain-mem-key">DICT coverage</div><div class="dash-brain-mem-val">${this._formatPercent(movie.dictCoverage || 0)}</div></div>
          <div class="dash-brain-mem-stat"><div class="dash-brain-mem-key">DICT writes</div><div class="dash-brain-mem-val">${movie.dictSaved ?? 0}</div></div>
          <div class="dash-brain-mem-stat"><div class="dash-brain-mem-key">Dict keys visible</div><div class="dash-brain-mem-val">${movie.dictionaryKeys ?? 0}</div></div>
        </div>
      </div>
      ${brainCheckMarkup}
    `;
  }

  _collectBrainCheckItems(values = [], limit = 4) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [values])
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((value) => {
        const key = value.replace(/[.!?]+$/g, '').toLowerCase();
        if (!key || seen.has(key) || key === 'the film\'s lineage') return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(1, Number(limit || 1)));
  }

  _buildBrainCheckRows(movie = {}) {
    const movieKey = String(movie?.movie || '').trim();
    const brain = resolveMovieBrain(movieKey) || {};
    const refs = this._collectBrainCheckItems(brain?.trainingSeeds?.references, 4);
    const symbols = this._collectBrainCheckItems(brain?.trainingSeeds?.symbols, 6);
    const lowerSymbols = symbols.map((item) => item.toLowerCase());
    const title = String(movie?.title || 'this movie').trim();
    const rows = [];

    rows.push({
      prompt: `Which references most directly shape ${title}?`,
      shouldMention: refs.length ? refs.slice(0, 3).join(', ') : 'named references from the stored brain',
      failIf: 'answer stays vague or avoids naming any concrete references'
    });

    if (lowerSymbols.some((item) => /rope|shibari|restriction/.test(item))) {
      rows.push({
        prompt: 'Why does the rope matter in this film?',
        shouldMention: 'rope as structure, control, boundary, mapping, or power',
        failIf: 'it treats rope as decoration only'
      });
    }

    if (lowerSymbols.some((item) => /darkroom|red light|negative|grain/.test(item))) {
      rows.push({
        prompt: 'What does the darkroom change about the meaning of the image?',
        shouldMention: 'darkroom, red light, grain, exposure, or developing process',
        failIf: 'it drifts into generic mood talk with no image-process detail'
      });
    }

    if (lowerSymbols.some((item) => /camera|lens|glass|shutter|flash/.test(item))) {
      rows.push({
        prompt: 'What is the relationship between camera, gaze, and power here?',
        shouldMention: 'camera, gaze, lens, shutter, flash, witness, surveillance, or control',
        failIf: 'it ignores the apparatus and answers only with abstract feeling'
      });
    }

    if (lowerSymbols.some((item) => /body|skin|portrait|landscape/.test(item))) {
      rows.push({
        prompt: 'Why does the body read like landscape in this movie?',
        shouldMention: 'body, frame, surface, portrait, landscape, or image texture',
        failIf: 'it answers generically without any visual or photographic anchor'
      });
    }

    rows.push({
      prompt: 'What concrete motif should I notice first?',
      shouldMention: symbols.length ? symbols.slice(0, 3).join(', ') : 'a stored symbol or motif from the movie brain',
      failIf: 'it gives only philosophical language and no object, setting, or motif'
    });

    return rows.slice(0, 5);
  }

  _renderVisualization(snapshot = {}) {
    if (!this.uiVisualization) return;
    const movies = Array.isArray(snapshot?.analytics?.visualSeries?.movies) ? snapshot.analytics.visualSeries.movies : [];
    const parameters = Array.isArray(snapshot?.analytics?.visualSeries?.parameters) ? snapshot.analytics.visualSeries.parameters : [];
    const models = Array.isArray(snapshot?.analytics?.visualSeries?.models) ? snapshot.analytics.visualSeries.models : [];
    const learning = Array.isArray(snapshot?.analytics?.visualSeries?.learning) ? snapshot.analytics.visualSeries.learning : [];
    const trainingFunnel = Array.isArray(snapshot?.analytics?.visualSeries?.trainingFunnel) ? snapshot.analytics.visualSeries.trainingFunnel : [];
    const dictEvolution = Array.isArray(snapshot?.analytics?.visualSeries?.dictEvolution) ? snapshot.analytics.visualSeries.dictEvolution : [];
    const timeline = Array.isArray(snapshot?.analytics?.visualSeries?.timeline) ? snapshot.analytics.visualSeries.timeline : [];
    const movieBars = movies.map((movie) => ({
      label: movie.label,
      value: movie.involvementScore,
      displayValue: movie.involvementScore,
      tone: 'cool',
      tooltip: `${movie.label}: combined podcast, free-chat and stage turns weighted into a single involvement score of ${movie.involvementScore}`
    }));
    const successBars = movies.map((movie) => ({
      label: movie.label,
      value: movie.successRate,
      displayValue: `${movie.successRate}%`,
      tone: 'warm',
      tooltip: `${movie.label}: ${movie.successRate}% of training batches completed without error`
    }));
    const parameterBars = parameters.map((item, index) => ({
      label: item.label,
      value: item.value,
      displayValue: item.value,
      tone: index % 2 === 0 ? 'violet' : 'cool',
      tooltip: `${item.label}: ${item.value} — one of the main analytics parameters tracked across this report`
    }));
    const modelBars = models.map((item, index) => ({
      label: item.label,
      value: item.value,
      displayValue: item.value,
      tone: index % 2 === 0 ? 'cool' : 'warm',
      tooltip: `${item.label}: ${item.value} log${Number(item.value) === 1 ? '' : 's'} recorded for this engine or model`
    }));
    const learningBars = learning.map((item, index) => ({
      label: item.label,
      value: item.value,
      displayValue: item.value,
      tone: index % 2 === 0 ? 'warm' : 'violet',
      tooltip: `${item.label}: ${item.value} — what the app stored or verified in the current report window`
    }));
    const trainingFunnelBars = trainingFunnel.map((item, index) => ({
      label: item.label,
      value: item.value,
      displayValue: item.value,
      tone: index % 2 === 0 ? 'cool' : 'warm',
      tooltip: `${item.label}: ${item.value} — stage in the seed → batch → DICT write pipeline`
    }));
    const dictEvolutionBars = dictEvolution.map((item, index) => ({
      label: item.label,
      value: item.keys,
      displayValue: `${item.keys} / ${item.newReferences}`,
      tone: index % 2 === 0 ? 'cool' : 'violet',
      tooltip: `${item.label}: ${item.keys} dictionary keys, ${item.newReferences} saved reference${Number(item.newReferences) === 1 ? '' : 's'}`
    }));
    const timelineBars = timeline.map((item, index) => ({
      label: item.label,
      value: item.involvement,
      displayValue: `${item.involvement} / ${item.successRate}%`,
      tone: index % 2 === 0 ? 'violet' : 'cool',
      tooltip: `${item.label}: involvement score ${item.involvement}, training success rate ${item.successRate}%`
    }));

    this.uiVisualization.innerHTML = `
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Movie involvement</div>
        <div class="dash-chart-copy">Combined podcast, free-chat, and stage weight by movie.</div>
        ${this._buildBars(movieBars.length ? movieBars : [{ label: 'No data', value: 0, displayValue: 0 }], { tone: 'cool' })}
      </div>
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Success by movie</div>
        <div class="dash-chart-copy">Training success rate for each movie in the report.</div>
        ${this._buildBars(successBars.length ? successBars : [{ label: 'No data', value: 0, displayValue: '0%' }], { tone: 'warm' })}
      </div>
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Parameter distribution</div>
        <div class="dash-chart-copy">The main analytics parameters exposed by this app report through today.</div>
        ${this._buildBars(parameterBars.length ? parameterBars : [{ label: 'No data', value: 0, displayValue: 0 }], { tone: 'violet' })}
      </div>
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Stored / Learned</div>
        <div class="dash-chart-copy">What the app actually stored or learned in this report window: DICT writes, successful batches, failed batches, and brain checks.</div>
        ${this._buildBars(learningBars.length ? learningBars : [{ label: 'No learning yet', value: 0, displayValue: 0 }], { tone: 'warm' })}
      </div>
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Seed-to-DICT Funnel</div>
        <div class="dash-chart-copy">Tracks staged training seed items through executed batches into stored DICT writes.</div>
        ${this._buildBars(trainingFunnelBars.length ? trainingFunnelBars : [{ label: 'No funnel yet', value: 0, displayValue: 0 }], { tone: 'cool' })}
      </div>
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Knowledge Growth</div>
        <div class="dash-chart-copy">Dictionary size by movie with saved-reference count shown as the value suffix.</div>
        ${this._buildBars(dictEvolutionBars.length ? dictEvolutionBars : [{ label: 'No dict data', value: 0, displayValue: '0 / 0' }], { tone: 'cool' })}
      </div>
      ${(() => {
        const wikiEntries = Array.isArray(snapshot?.wikiContext) ? snapshot.wikiContext : [];
        if (!wikiEntries.length) return '';
        const wikiBars = wikiEntries.map((entry, i) => ({
          label: String(entry.movie || `Movie ${i + 1}`).replace(/_/g, ' ').replace(/\.mp4$/i, ''),
          value: entry.termCount || 0,
          displayValue: entry.termCount ? `${entry.termCount} term${entry.termCount === 1 ? '' : 's'}` : 'none',
          tone: entry.termCount > 0 ? 'violet' : 'cool',
          tooltip: entry.terms?.length
            ? `Wikipedia terms: ${entry.terms.join(' · ')}`
            : 'No Wikipedia terms fetched yet'
        }));

        // Build injected vocabulary chips: primary (article titles) + secondary (proper nouns from text)
        const _extractProperNouns = (text) => {
          const titles = [];
          // Bracketed article titles: [Title]
          const bracketRe = /\[([^\]]+)\]/g;
          let m;
          while ((m = bracketRe.exec(text)) !== null) titles.push(m[1]);
          // Quoted phrases: "phrase"
          const quoteRe = /"([^"]{4,40})"/g;
          while ((m = quoteRe.exec(text)) !== null) titles.push(m[1]);
          // Capitalized proper noun phrases (2-4 words, Title Case, not at sentence start)
          const capsRe = /(?<=[ \t])([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,3})/g;
          while ((m = capsRe.exec(text)) !== null) {
            const phrase = m[1].trim();
            if (phrase.split(' ').length >= 2) titles.push(phrase);
          }
          return [...new Set(titles)];
        };

        const allPrimary = [...new Set(wikiEntries.flatMap((e) => e.terms || []))];
        const allSecondary = [...new Set(
          wikiEntries.flatMap((e) => _extractProperNouns(e.snippets || ''))
            .filter((t) => !allPrimary.includes(t) && t.length > 3 && t.length < 50)
        )].slice(0, 28);

        const isLive = snapshot?.trainingRuntime?.active === true;
        const activeTermSet = new Set(
          (Array.isArray(snapshot?.activeWikiTerms) ? snapshot.activeWikiTerms : [])
            .map((t) => String(t).toLowerCase())
        );
        const injectedChips = [
          ...allPrimary.map((t) => {
            const live = isLive && activeTermSet.has(t.toLowerCase());
            return `<span class="dash-wiki-chip${live ? ' dash-wiki-chip-live' : ''}">${this._escapeHtml(t)}</span>`;
          }),
          ...allSecondary.map((t) => {
            const live = isLive && activeTermSet.has(t.toLowerCase());
            return `<span class="dash-wiki-chip dash-wiki-chip-secondary${live ? ' dash-wiki-chip-live' : ''}">${this._escapeHtml(t)}</span>`;
          })
        ].join('');

        const wikiDetail = wikiEntries.map((entry) => {
          const movieLabel = String(entry.movie || '').replace(/_/g, ' ').replace(/\.mp4$/i, '');
          const parts = entry.snippets ? entry.snippets.split(' | ').filter(Boolean) : [];
          if (!parts.length) return '';
          const partHtml = parts.map((p) => {
            const isOl = p.startsWith('[') && p.includes('· Open Library]');
            const isDdg = !isOl && p.startsWith('[') && !p.includes('· ');
            const sourceTag = isOl
              ? `<span style="font-size:0.57rem;padding:0.06rem 0.35rem;border-radius:999px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);color:rgba(251,191,36,0.85);margin-left:0.3rem;vertical-align:middle">Open Library</span>`
              : isDdg ? '' : '';
            return `<div class="dash-wiki-snippet">${sourceTag}${this._escapeHtml(p)}</div>`;
          }).join('');
          return `<div class="dash-wiki-movie"><div class="dash-wiki-movie-label">${this._escapeHtml(movieLabel)}</div>${partHtml}</div>`;
        }).filter(Boolean).join('');

        // Detect which sources are actually present
        const allSnippetText = wikiEntries.map((e) => e.snippets || '').join(' | ');
        const hasOl = allSnippetText.includes('· Open Library]');
        const hasDdg = !hasOl; // simplified: show DDG label if not OL-only
        const sourceLabel = hasOl ? 'Wikipedia · DDG · Open Library' : 'Wikipedia · DDG';
        const totalTerms = wikiEntries.reduce((s, e) => s + (e.termCount || 0), 0);

        const notebookSummary = Array.isArray(snapshot?.notebookContextSummary) ? snapshot.notebookContextSummary : [];
        const notebookCount = notebookSummary.filter((n) => n.hasNotebookContext).length;
        const notebookBadge = notebookCount > 0
          ? `<span style="margin-left:0.5rem;font-size:0.57rem;padding:0.06rem 0.4rem;border-radius:999px;background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.35);color:rgba(147,197,253,0.9)">● Notebook ×${notebookCount}</span>`
          : '';
        const exportBtn = `<button data-dash-wiki-export style="margin-left:auto;font-size:0.6rem;padding:0.15rem 0.55rem;border-radius:4px;border:1px solid rgba(167,139,250,0.35);background:rgba(167,139,250,0.08);color:rgba(196,181,253,0.85);cursor:pointer;white-space:nowrap">Export for NotebookLM</button>`;
        const importBtn = `<button data-dash-wiki-import style="margin-left:0.4rem;font-size:0.6rem;padding:0.15rem 0.55rem;border-radius:4px;border:1px solid rgba(96,165,250,0.35);background:rgba(96,165,250,0.08);color:rgba(147,197,253,0.85);cursor:pointer;white-space:nowrap">↩ Import synthesis</button>`;

        return `
      <div class="dash-chart-panel dash-chart-panel-wiki">
        <div class="dash-chart-title" style="display:flex;align-items:center;gap:0.3rem;flex-wrap:wrap">Web Context <span class="dash-chart-status dash-chart-status-wiki">${sourceLabel} · ${totalTerms} term${totalTerms === 1 ? '' : 's'}</span>${notebookBadge}${exportBtn}${importBtn}</div>
        <div class="dash-chart-copy">Context injected into Gemma training from Wikipedia, DuckDuckGo, and Open Library. Each term grounds the AI deeper in the film's cultural references.</div>
        <div class="dash-panel-scroll">
          ${this._buildBars(wikiBars, { tone: 'violet' })}
          ${injectedChips ? `<div class="dash-wiki-injected-label">Injected vocabulary${isLive ? ' <span style="color:#6ee7b7;font-size:0.58rem;letter-spacing:0.08em">● LIVE</span>' : ''}</div><div class="dash-wiki-chips">${injectedChips}</div>` : ''}
          ${wikiDetail ? `<div class="dash-wiki-snippets">${wikiDetail}</div>` : ''}
        </div>
      </div>`;
      })()}
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Timeline</div>
        <div class="dash-chart-copy">Recent buckets from the first recorded activity through now, weighted by involvement and shown with success-rate labels.</div>
        ${this._buildBars(timelineBars.length ? timelineBars : [{ label: 'No history', value: 0, displayValue: '0 / 0%' }], { tone: 'violet' })}
      </div>
      ${(() => {
        const samples = Array.isArray(snapshot?.trainingRuntime?.latencySamples) ? snapshot.trainingRuntime.latencySamples : [];
        const avgMs = snapshot?.trainingRuntime?.latency?.averageMs || 0;
        const p99Ms = snapshot?.trainingRuntime?.latency?.p99Ms || 0;
        const latencyBars = samples.map((ms, i) => ({
          label: `Batch ${i + 1}`,
          value: ms,
          displayValue: `${(ms / 1000).toFixed(1)}s`,
          tone: ms > 18000 ? 'warm' : 'cool',
          tooltip: `Batch ${i + 1}: ${(ms / 1000).toFixed(2)}s response time from local Ollama`
        }));
        if (!samples.length) return '';
        return `
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Batch Latency <span class="dash-chart-status dash-chart-status-warn">avg ${(avgMs/1000).toFixed(1)}s · p99 ${(p99Ms/1000).toFixed(1)}s</span></div>
        <div class="dash-chart-copy">Per-batch Ollama response time. Warm bars exceed 18s — indicative of model loading or memory pressure.</div>
        <div class="dash-panel-scroll">
          ${this._buildBars(latencyBars, { tone: 'cool' })}
        </div>
      </div>`;
      })()}
      <div class="dash-chart-panel">
        <div class="dash-chart-title">Quality snapshot</div>
        <div class="dash-chart-copy">Overall brain score and DICT coverage side by side.</div>
        ${this._buildBars([
          { label: 'Brain score', value: Number(snapshot?.totals?.avgBrainScore || 0), displayValue: Number(snapshot?.totals?.avgBrainScore || 0), tone: 'cool', tooltip: `Average brain quality score across all movies (higher = richer, more consistent character voice)` },
          { label: 'DICT coverage', value: Number(snapshot?.totals?.dictImpact || 0), displayValue: `${Math.round(Number(snapshot?.totals?.dictImpact || 0))}%`, tone: 'warm', tooltip: `Percentage of conversations answered using stored DICT entries rather than fallback defaults` },
          { label: 'Success rate', value: Number(snapshot?.totals?.successRate || 0), displayValue: `${Math.round(Number(snapshot?.totals?.successRate || 0))}%`, tone: 'violet', tooltip: `Overall training batch success rate — completed batches vs total attempts` }
        ])}
      </div>
    `;
  }

  _renderParameters(snapshot = {}) {
    if (!this.uiParameterGrid) return;
    const parameters = Array.isArray(snapshot?.analytics?.parameterInventory) ? snapshot.analytics.parameterInventory : [];
    if (!parameters.length) {
      this.uiParameterGrid.innerHTML = '<div class="dash-empty">No parameter analytics yet.</div>';
      return;
    }
    this.uiParameterGrid.innerHTML = parameters.map((item) => `
      <div class="dash-parameter-card">
        <div class="dash-parameter-label">${this._escapeHtml(item.label)}</div>
        <div class="dash-parameter-value">${this._escapeHtml(item.value)}</div>
        <div class="dash-parameter-detail">${this._escapeHtml(item.detail || '')}</div>
      </div>
    `).join('');
  }

  _renderSessionSource(snapshot = {}) {
    if (!this.uiSessionSource) return;
    const source = snapshot?.sessionSource || null;
    const analytics = snapshot?.analytics || {};
    if (!source) {
      this.uiSessionSource.innerHTML = '<div class="dash-empty">Session source data is not available yet.</div>';
      return;
    }

    const text = analytics?.sourcesSummary
      || `Models none yet · Training ${snapshot?.totals?.successfulBatches || 0} ok / ${snapshot?.totals?.failedBatches || 0} fail · Source ${source.deviceType || 'Unknown'} · ${source.locationLabel || 'Unknown'} · ${source.ipAddress || 'Unavailable'}`;
    const detail = [
      source.provider ? `provider ${source.provider}` : '',
      source.networkType ? `network ${source.networkType}` : source.online,
      source.trainingHeartbeatLabel ? `heartbeat ${source.trainingHeartbeatLabel}` : '',
      source.trainingFallback ? `fallback ${source.trainingFallback}` : '',
      source.timezone || '',
      source.trainingLastError && source.trainingLastError !== 'None' ? `error ${source.trainingLastError}` : '',
      source.lookupError || ''
    ].filter(Boolean).join(' · ');

    this.uiSessionSource.innerHTML = `
      <div>${this._escapeHtml(text)}</div>
      <div class="dash-parameter-detail">${this._escapeHtml(detail)}</div>
    `;
  }

  _renderHealth(snapshot = {}) {
    if (!this.uiHealthGrid) return;
    const flags = Array.isArray(snapshot?.analytics?.debug?.flags) ? snapshot.analytics.debug.flags : [];
    if (!flags.length) {
      this.uiHealthGrid.innerHTML = '<div class="dash-empty">No health diagnostics yet.</div>';
      return;
    }
    const forceLocalActive = snapshot?.forceLocalGemmaActive === true;
    const hasForceLocalHandler = typeof this.forceLocalHandler === 'function';
    this.uiHealthGrid.innerHTML = flags.map((flag) => {
      const isQuotaWarn = flag.key === 'model-over-reliance' && flag.status === 'warn' && hasForceLocalHandler;
      const actionHtml = isQuotaWarn
        ? forceLocalActive
          ? `<button class="dash-inline-btn dash-force-local-btn" data-dash-force-local="disable" type="button" style="margin-top:0.5rem">Restore Cloud</button>`
          : `<button class="dash-inline-btn dash-force-local-btn" data-dash-force-local="enable" type="button" style="margin-top:0.5rem">Force Local</button>`
        : '';
      return `
        <div class="dash-health-card${forceLocalActive && isQuotaWarn ? ' dash-force-local-active' : ''}" data-status="${this._escapeHtml(flag.status || 'ok')}">
          <div class="dash-parameter-label">${this._escapeHtml(flag.label || 'Health')}</div>
          <div class="dash-health-status">${this._escapeHtml(String(flag.status || 'ok').toUpperCase())}${forceLocalActive && isQuotaWarn ? ' · LOCAL FORCED' : ''}</div>
          <div class="dash-parameter-detail">${this._escapeHtml(flag.detail || '')}</div>
          ${actionHtml}
        </div>
      `;
    }).join('');
  }

  _renderMovies(snapshot = {}) {
    if (!this.uiMovieGrid) return;
    const movies = Array.isArray(snapshot?.movies) ? snapshot.movies : [];
    if (!movies.length) {
      this.uiMovieGrid.innerHTML = '<div class="dash-empty">No movie stats yet.</div>';
      return;
    }

    this.uiMovieGrid.innerHTML = movies.map((movie) => `
      <div class="dash-movie-card${movie.isCurrent ? ' is-current' : ''}">
        <div class="dash-card-kicker">${movie.isCurrent ? 'Current movie' : 'Movie'}</div>
        <div class="dash-movie-card-title">${this._escapeHtml(movie.title)}</div>
        <div class="dash-movie-card-line">Turns ${movie.podcastTurns} pod / ${movie.freeChatTurns} free / ${movie.stageTurns} stage</div>
        <div class="dash-movie-card-line">Training ${movie.successfulBatches} ok / ${movie.failedBatches} fail / ${this._formatPercent(movie.successRate)}</div>
        <div class="dash-movie-card-line">Brain avg ${movie.avgBrainScore} / checks ${movie.brainChecks} / sources ${this._escapeHtml(movie.brainSourceMix)}</div>
        <div class="dash-movie-card-line">DICT ${movie.dictSaved} writes / ${this._formatPercent(movie.dictCoverage)} coverage / ${movie.dictionaryKeys} parameters</div>
        <div class="dash-movie-card-line">Seed groups ${movie.trainingSeedGroups} / seed items ${movie.trainingSeedItems} / persona ${movie.personaSignals}</div>
        <div class="dash-movie-card-line">First free chat ${this._escapeHtml(this._formatDate(movie.firstFreeChatAt, 'Not yet'))} / first podcast ${this._escapeHtml(this._formatDate(movie.firstPodcastAt, 'Not yet'))}</div>
        <div class="dash-movie-card-line">Models ${this._escapeHtml(movie.modelUsageSummary || 'No model activity yet')}</div>
      </div>
    `).join('');
  }

  refreshStats() {
    if (!this.statsProvider) return;
    const snapshot = this._getSnapshot();
    const filterState = snapshot?.filters || this.filters;
    const currentMovieName = snapshot?.currentMovie?.title || snapshot?.currentMovieLabel || 'No movie';
    if (this.uiCurrentMovieName) this.uiCurrentMovieName.textContent = currentMovieName;
    if (this.uiReportDate) this.uiReportDate.textContent = snapshot?.analytics?.reportLabel || 'App report through today';
    if (this.uiRangeFrom) this.uiRangeFrom.value = this._formatDateInputValue(filterState?.fromAt || 0);
    if (this.uiRangeTo) this.uiRangeTo.value = this._formatDateInputValue(filterState?.toAt || 0);
    this._renderSummary(snapshot);
    this._renderAnalytics(snapshot);
    this._renderCurrentMovie(snapshot);
    this._renderVisualization(snapshot);
    this._renderParameters(snapshot);
    this._renderHealth(snapshot);
    this._renderSessionSource(snapshot);
    this._renderMovies(snapshot);
    this._renderPhraseRepeats();
  }

  update({ engine, status, memories, latestLog }) {
    if (engine) this.lastState.engine = String(engine).toUpperCase();
    if (status) this.lastState.status = String(status);
    if (memories !== undefined) this.lastState.memories = memories;
    if (latestLog) this.lastState.latestLog = latestLog;

    this.uiEngine.textContent = this.lastState.engine;
    this.uiStatus.textContent = this.lastState.status;
    this.uiMemories.textContent = this.lastState.memories;
    this._renderLatestLog(this.lastState.latestLog);
    this.refreshStats();
    this.active = true;
  }

  _showSummaryPopup() {
    const existing = document.getElementById('dash-summary-popup');
    if (existing) existing.remove();

    const snapshot = this._getSnapshot();
    const analytics = snapshot?.analytics || {};
    const totals = snapshot?.totals || {};
    const movies = Array.isArray(snapshot?.movies) ? snapshot.movies : [];
    const timeline = Array.isArray(analytics?.visualSeries?.timeline) ? analytics.visualSeries.timeline : [];

    // ── Gauges ──────────────────────────────────────────────────────────────
    const gauge = (value, max, label, sublabel, tone) => {
      const pct = Math.min(1, Math.max(0, Number(value || 0) / Math.max(1, Number(max || 100))));
      const r = 36, cx = 44, cy = 44, stroke = 7;
      const circ = 2 * Math.PI * r;
      const dash = circ * 0.75; // 270° arc
      const offset = dash - pct * dash;
      const gradId = `g${Math.random().toString(36).slice(2, 7)}`;
      const colors = {
        cool:   ['#60a5fa','#22d3ee'],
        warm:   ['#fbbf24','#f87171'],
        violet: ['#a78bfa','#3b82f6'],
        teal:   ['#34d399','#22d3ee']
      }[tone] || ['#60a5fa','#22d3ee'];
      return `
        <div class="dsp-gauge">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <defs>
              <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${colors[0]}"/>
                <stop offset="100%" stop-color="${colors[1]}"/>
              </linearGradient>
            </defs>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${stroke}"
              stroke-dasharray="${dash} ${circ}" stroke-dashoffset="0"
              stroke-linecap="round" transform="rotate(135 ${cx} ${cy})"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="${stroke}"
              stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${offset}"
              stroke-linecap="round" transform="rotate(135 ${cx} ${cy})"
              style="transition: stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)"/>
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="rgba(220,240,255,0.95)" font-size="13" font-weight="700" font-family="inherit">${this._escapeHtml(String(value))}</text>
            <text x="${cx}" y="${cy + 11}" text-anchor="middle" fill="rgba(160,200,240,0.55)" font-size="8" font-family="inherit">${this._escapeHtml(sublabel)}</text>
          </svg>
          <div class="dsp-gauge-label">${this._escapeHtml(label)}</div>
        </div>`;
    };

    // ── Activity heatmap (timeline buckets × movies, colour = involvement) ──
    const heatMovies = movies.slice(0, 6);
    const heatBuckets = timeline.slice(-12);
    const heatMax = Math.max(1, ...heatMovies.map(m => Number(m.involvementScore || 0)));
    const buildHeatmap = () => {
      if (!heatMovies.length || !heatBuckets.length) return '<div class="dsp-no-data">No activity data yet</div>';
      const colW = Math.floor(100 / heatBuckets.length);
      return `
        <div class="dsp-heatmap">
          <div class="dsp-heatmap-head">
            <div class="dsp-heatmap-corner"></div>
            ${heatBuckets.map(b => `<div class="dsp-heatmap-col-label">${this._escapeHtml(String(b.label || '').slice(0, 5))}</div>`).join('')}
          </div>
          ${heatMovies.map(m => {
            const rowMax = Math.max(1, Number(m.involvementScore || 0));
            return `
              <div class="dsp-heatmap-row">
                <div class="dsp-heatmap-row-label">${this._escapeHtml(m.label || m.title || '')}</div>
                ${heatBuckets.map(b => {
                  const val = Math.min(1, Number((b.involvement || 0)) / heatMax);
                  const alpha = (0.10 + val * 0.85).toFixed(2);
                  return `<div class="dsp-heatmap-cell" style="background:rgba(34,211,238,${alpha})" title="${this._escapeHtml(m.label || '')} · ${this._escapeHtml(String(b.label || ''))}"></div>`;
                }).join('')}
              </div>`;
          }).join('')}
        </div>`;
    };

    // ── Spark bars (top movies by involvement) ───────────────────────────────
    const topMovies = [...movies].sort((a, b) => Number(b.involvementScore || 0) - Number(a.involvementScore || 0)).slice(0, 5);
    const topMax = Math.max(1, ...topMovies.map(m => Number(m.involvementScore || 0)));
    const sparkBars = topMovies.map(m => {
      const w = Math.max(4, Math.round((Number(m.involvementScore || 0) / topMax) * 100));
      const sr = Math.round(Number(m.successRate || 0));
      return `
        <div class="dsp-spark-row">
          <div class="dsp-spark-label">${this._escapeHtml(m.label || m.title || '')}</div>
          <div class="dsp-spark-track"><div class="dsp-spark-fill" style="width:${w}%"></div></div>
          <div class="dsp-spark-val">${sr}%</div>
        </div>`;
    }).join('');

    // ── Stat pills ─────────────────────────────────────────────────────────
    const pill = (label, val) => `<div class="dsp-pill"><span class="dsp-pill-val">${this._escapeHtml(String(val))}</span><span class="dsp-pill-label">${this._escapeHtml(label)}</span></div>`;

    // ── Narrative blurb ────────────────────────────────────────────────────
    // (method defined below; needs analytics + totals already in scope)

    const popup = document.createElement('div');
    popup.id = 'dash-summary-popup';
    popup.innerHTML = `
      <div class="dsp-overlay">
        <div class="dsp-card">
          <div class="dsp-header">
            <div class="dsp-title">Session Summary</div>
            <div class="dsp-subtitle">${this._escapeHtml(analytics?.rangeLabel || 'Today')}</div>
            <button class="dsp-close" id="dsp-close-btn" type="button" aria-label="Close summary">×</button>
          </div>
          <div class="dsp-narrative">${this._escapeHtml(this._buildSummaryNarrative(analytics, totals))}</div>

          <div class="dsp-gauges">
            ${gauge(Math.round(Number(totals.successRate || 0)) + '%', 100,   'Training',     '% success', 'teal')}
            ${gauge(totals.avgBrainScore || 0,          100,   'Brain score',   'avg',         'cool')}
            ${gauge(totals.dictSaved || 0,              Math.max(totals.dictSaved || 1, 50), 'DICT writes', 'entries', 'violet')}
            ${gauge(totals.podcastTurns || 0,           Math.max(totals.podcastTurns || 1, 20), 'Podcast',   'turns',   'warm')}
          </div>

          <div class="dsp-pills">
            ${pill('batches ok',  totals.successfulBatches || 0)}
            ${pill('fails',       totals.failedBatches || 0)}
            ${pill('free chat',   totals.freeChatTurns || 0)}
            ${pill('memories',    analytics?.learningSummary || '—')}
            ${pill('movies',      totals.trackedMovies || 0)}
            ${pill('brain checks', totals.brainChecks || 0)}
          </div>

          <div class="dsp-lower">
            <div class="dsp-section">
              <div class="dsp-section-title">Activity Heatmap</div>
              ${buildHeatmap()}
            </div>
            <div class="dsp-section">
              <div class="dsp-section-title">Top Films · Involvement vs Success</div>
              <div class="dsp-sparks">${sparkBars || '<div class="dsp-no-data">No movie data yet</div>'}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById('dash-summary-popup-styles')) {
      const st = document.createElement('style');
      st.id = 'dash-summary-popup-styles';
      st.textContent = `
        #dash-summary-popup { position: fixed; inset: 0; z-index: 600; }
        .dsp-overlay {
          position: absolute; inset: 0;
          background: rgba(2,5,10,0.72);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          animation: dsp-fade-in 0.22s ease;
        }
        @keyframes dsp-fade-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .dsp-card {
          position: relative;
          width: min(780px, 94vw);
          max-height: 88vh;
          overflow-y: auto;
          background: rgba(6, 11, 20, 0.96);
          border: 1px solid rgba(110,231,255,0.18);
          border-radius: 22px;
          padding: 1.8rem 2rem 2rem;
          box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(96,165,250,0.06) inset;
          font-family: inherit;
          color: rgba(210,230,255,0.92);
        }
        .dsp-header { display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 0.55rem; }
        .dsp-title { font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; color: rgba(220,240,255,0.97); }
        .dsp-subtitle { font-size: 0.78rem; color: rgba(140,180,220,0.6); margin-right: auto; }
        .dsp-narrative {
          padding: 0.65rem 1rem;
          margin: 0 0 1.2rem;
          border-left: 2px solid rgba(110,231,255,0.28);
          font-size: 0.80rem;
          line-height: 1.65;
          color: rgba(200,225,245,0.78);
          font-style: italic;
        }
        .dsp-close {
          margin-left: auto; background: none; border: none; cursor: pointer;
          font-size: 1.4rem; line-height: 1; color: rgba(180,210,240,0.5);
          transition: color 0.15s; padding: 0 0.15rem;
        }
        .dsp-close:hover { color: rgba(220,240,255,0.9); }
        .dsp-gauges { display: flex; gap: 1.2rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.2rem; }
        .dsp-gauge { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
        .dsp-gauge-label { font-size: 0.68rem; letter-spacing: 0.07em; text-transform: uppercase; color: rgba(140,180,220,0.55); }
        .dsp-pills { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 1.4rem; }
        .dsp-pill {
          display: flex; flex-direction: column; align-items: center;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(110,231,255,0.1);
          border-radius: 10px; padding: 0.4rem 0.85rem; min-width: 72px;
        }
        .dsp-pill-val { font-size: 1rem; font-weight: 700; color: rgba(200,230,255,0.92); }
        .dsp-pill-label { font-size: 0.62rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(140,180,220,0.5); margin-top: 0.1rem; }
        .dsp-lower { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
        @media (max-width: 560px) { .dsp-lower { grid-template-columns: 1fr; } }
        .dsp-section-title { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(110,180,230,0.5); margin-bottom: 0.6rem; }
        .dsp-heatmap { display: flex; flex-direction: column; gap: 3px; }
        .dsp-heatmap-head { display: flex; gap: 3px; margin-left: 72px; }
        .dsp-heatmap-corner { width: 72px; flex-shrink: 0; }
        .dsp-heatmap-col-label { flex: 1; font-size: 0.56rem; color: rgba(140,180,220,0.4); text-align: center; overflow: hidden; }
        .dsp-heatmap-row { display: flex; align-items: center; gap: 3px; }
        .dsp-heatmap-row-label { width: 72px; flex-shrink: 0; font-size: 0.62rem; color: rgba(160,200,240,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dsp-heatmap-cell { flex: 1; height: 16px; border-radius: 3px; cursor: default; transition: opacity 0.15s; }
        .dsp-heatmap-cell:hover { opacity: 0.75; }
        .dsp-sparks { display: flex; flex-direction: column; gap: 0.45rem; }
        .dsp-spark-row { display: grid; grid-template-columns: minmax(60px,90px) 1fr 36px; align-items: center; gap: 0.5rem; }
        .dsp-spark-label { font-size: 0.66rem; color: rgba(160,200,240,0.65); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dsp-spark-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.07); overflow: hidden; }
        .dsp-spark-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, rgba(167,139,250,0.84), rgba(34,211,238,0.84)); }
        .dsp-spark-val { font-size: 0.68rem; color: rgba(140,180,220,0.55); text-align: right; }
        .dsp-no-data { font-size: 0.75rem; color: rgba(140,170,200,0.35); padding: 0.5rem 0; }
      `;
      document.head.appendChild(st);
    }

    document.body.appendChild(popup);
    popup.querySelector('#dsp-close-btn').addEventListener('click', () => popup.remove());
    popup.querySelector('.dsp-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) popup.remove(); });
  }

  // ── Phrase Repetition Analysis ────────────────────────────────────────────

  _buildSummaryNarrative(analytics = {}, totals = {}) {
    const movieTitle = analytics?.currentMovieTitle || analytics?.topMovieTitle || null;
    const sr = Math.round(Number(totals.successRate || 0));
    const dictSaved = Number(totals.dictSaved || 0);
    const dictKeys = Number(totals.dictKeys || 0);
    const coverage = Math.round(Number(totals.dictCoverage || analytics?.contextMetrics?.contextAugmentationScore || 0));
    const brainScore = Number(totals.avgBrainScore || 0);
    const batches = Number(totals.successfulBatches || 0);

    const reliability = sr >= 95 ? 'high technical reliability'
      : sr >= 75 ? 'solid technical reliability'
      : sr >= 50 ? 'moderate technical reliability'
      : 'early-stage technical progress';

    const knowledge = dictSaved >= 30 ? 'excellent knowledge capture'
      : dictSaved >= 15 ? 'strong knowledge capture'
      : dictSaved >= 5  ? 'growing knowledge capture'
      : 'initial knowledge capture';

    const coverageNote = coverage >= 70
      ? `with ${coverage}% dictionary coverage`
      : dictKeys > 0
        ? `across ${dictKeys} dictionary parameter${dictKeys === 1 ? '' : 's'}`
        : '';

    const brainNote = brainScore >= 70 ? ' Brain recall is performing well.'
      : brainScore >= 40 ? ' Brain recall is building momentum.'
      : batches > 0      ? ' More training will sharpen recall.'
      : '';

    const moviePart = movieTitle ? ` for "${movieTitle}"` : '';
    const coveragePart = coverageNote ? ` ${coverageNote}` : '';

    return `This summary visualizes the core health of your movie-training pipeline, indicating ${reliability} and ${knowledge}${moviePart}${coveragePart}.${brainNote}`;
  }

  _readAllMemories() {
    const result = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith('brain_mem_v1_')) continue;
        const movie = key.replace('brain_mem_v1_', '');
        try {
          const entries = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(entries)) result[movie] = entries;
        } catch { /* skip malformed */ }
      }
    } catch { /* localStorage unavailable */ }
    return result;
  }

  _analyzeMemoryPhrases() {
    const STOP = new Set(['a','an','the','and','or','but','in','on','at','to','for',
      'of','with','by','from','is','it','its','this','that','was','are','be','been',
      'has','had','have','will','would','could','should','not','no','so','as','up',
      'do','did','does','if','i','you','we','they','he','she','my','your','his',
      'her','our','their','me','him','us','them','what','which','who','when','where',
      'then','than','just','like','more','also','very','all','any','some','into',
      'out','about','can','get','got','there']);

    const memoriesByMovie = this._readAllMemories();
    const movieResults = {};

    for (const [movie, entries] of Object.entries(memoriesByMovie)) {
      const phraseMap = new Map();
      const wordMap = new Map();

      for (const entry of entries) {
        const text = (entry.response || '') + ' ' + (entry.input || '');
        const words = text.toLowerCase()
          .replace(/[^a-z0-9''\s-]/g, ' ')
          .split(/\s+/)
          .map(w => w.replace(/^['-]+|['-]+$/g, ''))
          .filter(w => w.length > 2 && !STOP.has(w));

        for (let j = 0; j < words.length - 2; j++) {
          const phrase = words.slice(j, j + 3).join(' ');
          phraseMap.set(phrase, (phraseMap.get(phrase) || 0) + 1);
        }
        // 2-grams
        for (let j = 0; j < words.length - 1; j++) {
          const bigram = words[j] + ' ' + words[j + 1];
          phraseMap.set(bigram, (phraseMap.get(bigram) || 0) + 1);
        }
        for (const w of words) {
          wordMap.set(w, (wordMap.get(w) || 0) + 1);
        }
      }

      const phrases = [...phraseMap.entries()]
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([phrase, count]) => ({ phrase, count }));

      const words = [...wordMap.entries()]
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word, count]) => ({ word, count }));

      if (phrases.length || words.length) {
        movieResults[movie] = { phrases, words, total: entries.length };
      }
    }

    return { movieResults, totalMovies: Object.keys(memoriesByMovie).length };
  }

  _renderPhraseRepeats() {
    if (!this.uiPhraseRepeats) return;
    this.uiPhraseRepeats.classList.remove('is-optimised');
    const { movieResults, totalMovies } = this._analyzeMemoryPhrases();
    const movies = Object.keys(movieResults);

    if (!movies.length) {
      this.uiPhraseRepeats.innerHTML = '<div class="dash-empty">No repetitions found across ' + totalMovies + ' movie' + (totalMovies === 1 ? '' : 's') + '.</div>';
      return;
    }

    let html = movies.map(movie => {
      const { phrases, words, total } = movieResults[movie];
      const label = movie.replace(/_/g, ' ');
      let section = `<div class="dash-phrase-movie-header">${this._escapeHtml(label)} <span class="dash-repeat-count">${total} mem</span></div>`;

      if (phrases.length) {
        section += '<div class="dash-phrase-group-label">3-word phrases</div>';
        section += phrases.map(({ phrase, count }) =>
          `<div class="dash-phrase-item">
            <span class="dash-repeat-mark">${this._escapeHtml(phrase)}</span>
            <span class="dash-repeat-count">×${count}</span>
          </div>`
        ).join('');
      }
      if (words.length) {
        section += '<div class="dash-phrase-group-label" style="margin-top:0.5rem">frequent words (≥4)</div>';
        section += words.map(({ word, count }) =>
          `<div class="dash-phrase-item">
            <span class="dash-repeat-mark">${this._escapeHtml(word)}</span>
            <span class="dash-repeat-count">×${count}</span>
          </div>`
        ).join('');
      }
      return `<div class="dash-phrase-movie-block">${section}</div>`;
    }).join('');

    this.uiPhraseRepeats.innerHTML = html;
  }

  _optimizeMemories() {
    const btn = this.container.querySelector('#dash-optimize-btn');
    const progressWrap = this.uiOptimizeProgressWrap;
    const progressBar = this.uiOptimizeProgressBar;
    const progressLabel = this.uiOptimizeProgressLabel;

    if (btn) btn.disabled = true;
    if (progressWrap) progressWrap.style.display = 'block';
    const _setProgress = (pct, label) => {
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressLabel) progressLabel.textContent = label;
    };

    const memoriesByMovie = this._readAllMemories();
    const movies = Object.entries(memoriesByMovie);
    let totalRemoved = 0;
    let done = 0;

    const _wordsOf = (text) => new Set(
      (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
    );
    const _jaccard = (a, b) => {
      const inter = [...a].filter(w => b.has(w)).length;
      const union = new Set([...a, ...b]).size;
      return union ? inter / union : 0;
    };

    const processNext = () => {
      if (done >= movies.length) {
        // Complete — re-render first, then prepend toast so it stays visible
        this._renderPhraseRepeats();
        _setProgress(100, 'Complete');
        if (progressBar) progressBar.style.background = 'linear-gradient(90deg, #34d399, #22d3ee)';
        setTimeout(() => {
          if (progressWrap) progressWrap.style.display = 'none';
          if (btn) { btn.disabled = false; btn.textContent = 'Optimise Memories'; }
        }, 1800);
        if (this.uiPhraseRepeats) {
          this.uiPhraseRepeats.classList.add('is-optimised');
          const toast = document.createElement('div');
          toast.className = 'dash-optimize-toast';
          toast.textContent = totalRemoved > 0
            ? `Removed ${totalRemoved} near-duplicate entr${totalRemoved === 1 ? 'y' : 'ies'}. Remaining phrases are from distinct memories.`
            : 'No duplicates found — memories are already clean.';
          this.uiPhraseRepeats.prepend(toast);
          setTimeout(() => toast.remove(), 6000);
        }
        return;
      }

      const [movie, entries] = movies[done];
      done++;
      const pct = Math.round((done / Math.max(movies.length, 1)) * 92); // up to 92%; 100 on finish
      _setProgress(pct, `Scanning ${movie}…`);

      const keep = [];
      const removed = new Set();
      for (let i = 0; i < entries.length; i++) {
        if (removed.has(i)) continue;
        const wordsI = _wordsOf(entries[i].response);
        let dominated = false;
        for (let j = 0; j < i; j++) {
          if (removed.has(j)) continue;
          if (_jaccard(wordsI, _wordsOf(entries[j].response)) > 0.62) { dominated = true; break; }
        }
        if (!dominated) keep.push(entries[i]);
        else { removed.add(i); totalRemoved++; }
      }
      if (removed.size > 0) {
        try { localStorage.setItem(`brain_mem_v1_${movie}`, JSON.stringify(keep)); } catch { /* quota */ }
      }

      // Yield to browser each movie so progress renders
      setTimeout(processNext, 0);
    };

    _setProgress(4, 'Starting…');
    setTimeout(processNext, 50);
  }

  draw() {
    requestAnimationFrame(() => this.draw());
    if (this.container.classList.contains('hidden') || !this.active) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(140, 220, 255, 0.55)';
    this.ctx.lineWidth = 1.3;
    for (let x = 0; x < this.canvas.width; x += 1) {
      const y = 42 + Math.sin(x * 0.03 + this.offset) * 12 + Math.sin(x * 0.085 - this.offset * 0.5) * 8;
      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.offset += 0.08;
  }
}

export const trainingDashboard = new TrainingDashboard();