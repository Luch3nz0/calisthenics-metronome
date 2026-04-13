import { squatTraining } from './session-data.js';
import { getFmsSessionsForUser, getActiveUser, getProfileStats, getSessionsForUser, loginUser, logoutUser, recordPageVisit, registerUser, saveFmsSession, saveSession, updateSexForTSPU } from './storage.js';
import { computeFmsOutcome, createEmptyFmsPatterns, createFmsTasks, fmsDisclaimer, fmsEquipmentNotes, fmsOpeningVoice, fmsRequiredEquipment, fmsVoiceDisclaimer, getFmsPatternName } from './fms-data.js';
import { FMS_POSE_CONNECTIONS, FmsTaskAnalyzer } from './fms-mediapipe.js';
import { SquatSessionEngine } from './squat-engine.js';
import { VoiceCoach } from './voice-coach.js';
function loadBrowserSessionId() {
    const storageKey = 'noskip_browser_session_id';
    try {
        const existing = window.sessionStorage.getItem(storageKey)?.trim();
        if (existing)
            return existing;
        const next = window.crypto.randomUUID();
        window.sessionStorage.setItem(storageKey, next);
        return next;
    }
    catch {
        return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
}
const voiceCoach = new VoiceCoach();
const state = {
    screen: 'auth',
    authMode: 'signup',
    activeUser: null,
    sessions: [],
    fmsSessions: [],
    latestSession: null,
    bootstrapping: true,
    live: {
        engine: null,
        pose: null,
        stream: null,
        rafId: null,
        sending: false,
        paused: false,
        pausedAtMs: null,
        startedAtMs: 0,
        pausedDurationMs: 0,
        snapshot: null,
        completionHandled: false
    },
    fms: {
        draft: null,
        currentTaskIndex: 0,
        latestSession: null,
        camera: {
            taskId: null,
            analyzer: null,
            landmarker: null,
            stream: null,
            rafId: null,
            loading: false,
            error: null,
            review: null,
            assessment: null,
            mode: 'primary',
            lastVideoTime: -1,
            running: false
        }
    },
    analytics: {
        currentVisit: null,
        browserSessionId: loadBrowserSessionId()
    }
};
function byId(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing element: ${id}`);
    return element;
}
function queryScreen(screen) {
    const panel = document.querySelector(`[data-screen="${screen}"]`);
    if (!panel)
        throw new Error(`Missing screen: ${screen}`);
    return panel;
}
const els = {
    screens: Array.from(document.querySelectorAll('[data-screen]')),
    authForm: byId('auth-form'),
    authModeLabel: byId('auth-mode-label'),
    authTitle: byId('auth-title'),
    authHelper: byId('auth-helper'),
    authNameRow: byId('auth-name-row'),
    authSexRow: byId('auth-sex-row'),
    authNameInput: byId('auth-name-input'),
    authSexSelect: byId('auth-sex-select'),
    authEmailInput: byId('auth-email-input'),
    authPasswordInput: byId('auth-password-input'),
    authSubmitBtn: byId('auth-submit-btn'),
    authSwitchCopy: byId('auth-switch-copy'),
    authSwitchBtn: byId('auth-switch-btn'),
    authError: byId('auth-error'),
    homeGreeting: byId('home-greeting'),
    homeSessionCopy: byId('home-session-copy'),
    homeProfileBtn: byId('home-profile-btn'),
    homeCoachName: byId('home-coach-name'),
    homeCoachRole: byId('home-coach-role'),
    homeCoachBio: byId('home-coach-bio'),
    homeTotalSessions: byId('home-total-sessions'),
    coachCard: byId('coach-card'),
    homeNavHome: byId('home-nav-home'),
    homeNavFms: byId('home-nav-fms'),
    homeNavProfile: byId('home-nav-profile'),
    fmsHomeBtn: byId('fms-home-btn'),
    fmsProfileBtn: byId('fms-profile-btn'),
    fmsRoot: byId('fms-root'),
    fmsNavHome: byId('fms-nav-home'),
    fmsNavFms: byId('fms-nav-fms'),
    fmsNavProfile: byId('fms-nav-profile'),
    detailsBackBtn: byId('details-back-btn'),
    detailsCoachName: byId('details-coach-name'),
    detailsCoachRole: byId('details-coach-role'),
    detailsTitle: byId('details-title'),
    detailsSubtitle: byId('details-subtitle'),
    detailsSets: byId('details-sets'),
    detailsReps: byId('details-reps'),
    detailsRest: byId('details-rest'),
    detailsFocusList: byId('details-focus-list'),
    detailsTips: byId('details-tips'),
    detailsStartBtn: byId('details-start-btn'),
    cameraVideo: byId('camera-video'),
    cameraCanvas: byId('camera-canvas'),
    orientationChip: byId('orientation-chip'),
    cameraError: byId('camera-error'),
    liveSetValue: byId('live-set-value'),
    liveRepValue: byId('live-rep-value'),
    restPill: byId('rest-pill'),
    pauseToggleBtn: byId('pause-toggle-btn'),
    quitBtn: byId('quit-btn'),
    resultsName: byId('results-name'),
    resultsTotalReps: byId('results-total-reps'),
    resultsValidReps: byId('results-valid-reps'),
    resultsDepthScore: byId('results-depth-score'),
    resultsPostureScore: byId('results-posture-score'),
    resultsNotes: byId('results-notes'),
    resultsHomeBtn: byId('results-home-btn'),
    resultsProfileBtn: byId('results-profile-btn'),
    profileHomeBtn: byId('profile-home-btn'),
    logoutBtn: byId('logout-btn'),
    profileName: byId('profile-name'),
    profileEmail: byId('profile-email'),
    profileTotalSessions: byId('profile-total-sessions'),
    profileTotalValidReps: byId('profile-total-valid-reps'),
    profileDepthScore: byId('profile-depth-score'),
    profilePostureScore: byId('profile-posture-score'),
    historyList: byId('history-list'),
    profileNavHome: byId('profile-nav-home'),
    profileNavFms: byId('profile-nav-fms'),
    profileNavProfile: byId('profile-nav-profile')
};
function formatPercent(value) {
    return `${Math.round(value)}%`;
}
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${`${secs}`.padStart(2, '0')}`;
}
function formatDate(value) {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(new Date(value));
}
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
function formatFmsStatus(status) {
    if (status === 'completed')
        return 'Completed';
    if (status === 'stopped_pain')
        return 'Stopped for pain';
    if (status === 'incomplete')
        return 'Incomplete';
    return 'In progress';
}
function sexForFms(user) {
    return user?.sexForTSPU ?? 'unspecified';
}
function buildFmsPatternFinalScore(patternKey, pattern) {
    if (pattern.pain || pattern.clearingPain)
        return 0;
    if (patternKey === 'deepSquat' || patternKey === 'trunkStabilityPushUp') {
        return pattern.rawRight;
    }
    if (pattern.rawLeft === undefined || pattern.rawRight === undefined) {
        return undefined;
    }
    return Math.min(pattern.rawLeft, pattern.rawRight);
}
function cloneFmsDraft(draft) {
    return {
        ...draft,
        notes: [...draft.notes],
        patterns: structuredClone(draft.patterns)
    };
}
function collectFmsSessionNotes(draft) {
    const outcome = computeFmsOutcome(draft.patterns);
    const notes = new Set();
    if (outcome.anyPain) {
        notes.add('Pain was reported during at least one movement or clearing test.');
    }
    if (outcome.anyAsymmetry) {
        notes.add('Asymmetry was detected between right and left scores in at least one bilateral pattern.');
    }
    for (const patternKey of outcome.lowestPatterns) {
        notes.add(`${getFmsPatternName(patternKey)} was one of the lowest-scoring patterns.`);
    }
    for (const patternKey of Object.keys(draft.patterns)) {
        for (const note of draft.patterns[patternKey].notes) {
            notes.add(note);
        }
    }
    return Array.from(notes).slice(0, 10);
}
function recalculateFmsDraft(draft) {
    const next = cloneFmsDraft(draft);
    for (const patternKey of Object.keys(next.patterns)) {
        next.patterns[patternKey].finalScore = buildFmsPatternFinalScore(patternKey, next.patterns[patternKey]);
    }
    const outcome = computeFmsOutcome(next.patterns);
    next.anyPain = outcome.anyPain;
    next.anyAsymmetry = outcome.anyAsymmetry;
    next.totalScore = outcome.complete ? outcome.totalScore : undefined;
    next.notes = collectFmsSessionNotes(next);
    return next;
}
function createNewFmsDraft(user, disclaimerAccepted, equipmentConfirmed) {
    return {
        startedAt: new Date().toISOString(),
        status: 'in_progress',
        disclaimerAccepted,
        sexForTSPU: user.sexForTSPU,
        equipmentConfirmed,
        patterns: createEmptyFmsPatterns(),
        totalScore: undefined,
        anyPain: false,
        anyAsymmetry: false,
        notes: []
    };
}
async function refreshUserData() {
    state.activeUser = await getActiveUser();
    state.sessions = state.activeUser ? await getSessionsForUser() : [];
    state.fmsSessions = state.activeUser ? await getFmsSessionsForUser() : [];
    state.fms.latestSession = state.fmsSessions[0] ?? null;
    if (!state.activeUser) {
        state.analytics.currentVisit = null;
    }
}
function isTrackedScreen(screen) {
    return screen !== 'auth';
}
function startTrackedScreenVisit(screen) {
    state.analytics.currentVisit = {
        screen,
        enteredAt: new Date().toISOString(),
        startedAtMs: performance.now()
    };
}
function resumeTrackedScreenVisit() {
    if (!state.activeUser || !isTrackedScreen(state.screen) || document.visibilityState === 'hidden') {
        return;
    }
    if (!state.analytics.currentVisit || state.analytics.currentVisit.screen !== state.screen) {
        startTrackedScreenVisit(state.screen);
    }
}
async function flushTrackedScreenVisit(useBeacon = false) {
    const currentVisit = state.analytics.currentVisit;
    if (!currentVisit || !state.activeUser) {
        state.analytics.currentVisit = null;
        return;
    }
    state.analytics.currentVisit = null;
    const payload = {
        pageName: currentVisit.screen,
        enteredAt: currentVisit.enteredAt,
        exitedAt: new Date().toISOString(),
        durationMs: Math.max(250, Math.round(performance.now() - currentVisit.startedAtMs)),
        browserSessionId: state.analytics.browserSessionId
    };
    try {
        await recordPageVisit(payload, { useBeacon });
    }
    catch (error) {
        console.error('Could not record page visit', error);
    }
}
function setActiveScreen(screen) {
    if (screen !== state.screen) {
        void flushTrackedScreenVisit();
    }
    if (state.screen === 'fms' && screen !== 'fms') {
        void stopFmsCameraResources({ closeLandmarker: true });
    }
    state.screen = screen;
    if (!state.activeUser || !isTrackedScreen(screen)) {
        state.analytics.currentVisit = null;
    }
    else if (!state.analytics.currentVisit || state.analytics.currentVisit.screen !== screen) {
        startTrackedScreenVisit(screen);
    }
    for (const panel of els.screens) {
        panel.hidden = panel.dataset.screen !== screen;
    }
}
function setText(element, value) {
    element.textContent = value;
}
function showAuthError(message) {
    els.authError.hidden = message.trim() === '';
    els.authError.textContent = message;
}
function renderAuth() {
    const isSignup = state.authMode === 'signup';
    els.authModeLabel.textContent = isSignup ? 'Create account' : 'Log in';
    els.authTitle.textContent = isSignup ? 'Start your Noskip profile' : 'Welcome back to Noskip';
    els.authHelper.textContent = isSignup
        ? 'Create a secure account so your squat sessions and history sync to the backend.'
        : 'Log in to continue your saved squat history and profile progress.';
    els.authNameRow.hidden = !isSignup;
    els.authSexRow.hidden = !isSignup;
    els.authSubmitBtn.textContent = isSignup ? 'Create account' : 'Log in';
    els.authSwitchCopy.textContent = isSignup ? 'Already have an account?' : 'Need an account instead?';
    els.authSwitchBtn.textContent = isSignup ? 'Log in' : 'Create one';
    if (!state.bootstrapping) {
        showAuthError('');
    }
}
function renderHome() {
    const user = state.activeUser;
    if (!user)
        return;
    setText(els.homeGreeting, `${user.name}, your squat coach is ready.`);
    setText(els.homeSessionCopy, `Today’s protocol is ${squatTraining.session.protocol.sets} sets of ${squatTraining.session.protocol.repsPerSet} reps with ${squatTraining.session.protocol.restSeconds} seconds of rest. Front camera capture is enabled by default on phones.`);
    setText(els.homeCoachName, squatTraining.coach.name);
    setText(els.homeCoachRole, squatTraining.coach.role);
    setText(els.homeCoachBio, squatTraining.coach.bio);
    setText(els.homeTotalSessions, String(state.sessions.length));
}
function renderDetails() {
    setText(els.detailsCoachName, squatTraining.coach.name);
    setText(els.detailsCoachRole, squatTraining.coach.role);
    setText(els.detailsTitle, squatTraining.session.title);
    setText(els.detailsSubtitle, `${squatTraining.session.subtitle} The live session starts with the phone front camera when available.`);
    setText(els.detailsSets, String(squatTraining.session.protocol.sets));
    setText(els.detailsReps, String(squatTraining.session.protocol.repsPerSet));
    setText(els.detailsRest, `${squatTraining.session.protocol.restSeconds}s`);
    els.detailsFocusList.innerHTML = '';
    els.detailsTips.innerHTML = '';
    for (const item of squatTraining.session.readinessTips) {
        const li = document.createElement('li');
        li.textContent = item;
        els.detailsFocusList.append(li);
    }
    for (const item of [
        'Phone front camera is requested first so you can keep the screen visible during setup.',
        ...squatTraining.session.techniqueTips
    ]) {
        const li = document.createElement('li');
        li.textContent = item;
        els.detailsTips.append(li);
    }
}
function renderProfile() {
    const user = state.activeUser;
    if (!user)
        return;
    const stats = getProfileStats(state.sessions);
    setText(els.profileName, user.name);
    setText(els.profileEmail, user.email);
    setText(els.profileTotalSessions, String(stats.totalSessions));
    setText(els.profileTotalValidReps, String(stats.totalValidReps));
    setText(els.profileDepthScore, formatPercent(stats.avgDepthScore));
    setText(els.profilePostureScore, formatPercent(stats.avgPostureScore));
    els.historyList.innerHTML = '';
    if (state.sessions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = 'No sessions saved yet. Finish your first squat session to populate the backend history.';
        els.historyList.append(empty);
        return;
    }
    for (const session of state.sessions) {
        const entry = document.createElement('article');
        entry.className = 'history-entry';
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
      <strong>${formatDate(session.completedAt)}</strong>
      <span class="history-meta">${session.validReps}/${session.totalReps} valid reps</span>
    `;
        const scores = document.createElement('div');
        scores.className = 'history-row history-meta';
        scores.innerHTML = `
      <span>Depth ${formatPercent(session.depthScore)}</span>
      <span>Posture ${formatPercent(session.postureScore)}</span>
      <span>${formatDuration(session.durationSeconds)}</span>
    `;
        entry.append(row, scores);
        if (session.notes.length > 0) {
            const note = document.createElement('p');
            note.className = 'history-note';
            note.textContent = session.notes.join(' ');
            entry.append(note);
        }
        els.historyList.append(entry);
    }
}
function buildFmsHistoryMarkup() {
    if (state.fmsSessions.length === 0) {
        return '<p class="history-empty">No FMS sessions saved yet. Complete the guided screen to build a movement-screen history.</p>';
    }
    return state.fmsSessions
        .slice(0, 5)
        .map((session) => {
        const totalScoreMarkup = session.status === 'completed' && typeof session.totalScore === 'number'
            ? `<span class="history-meta">Total ${session.totalScore} / 21</span>`
            : `<span class="history-meta">${escapeHtml(formatFmsStatus(session.status))}</span>`;
        return `
        <article class="history-entry">
          <div class="history-row">
            <strong>${escapeHtml(formatDate(session.startedAt))}</strong>
            ${totalScoreMarkup}
          </div>
          <div class="history-row history-meta">
            <span>${session.anyPain ? 'Pain present' : 'No pain reported'}</span>
            <span>${session.anyAsymmetry ? 'Asymmetry present' : 'Symmetry preserved'}</span>
          </div>
        </article>
      `;
    })
        .join('');
}
function buildFmsSummaryMarkup(session) {
    const patternMarkup = Object.entries(session.patterns)
        .map(([patternKey, pattern]) => {
        const scoreLabel = pattern.finalScore === undefined ? 'Pending' : String(pattern.finalScore);
        const flags = [
            pattern.pain ? 'Pain' : '',
            pattern.clearingPain ? 'Clearing pain' : '',
            pattern.rawLeft !== undefined && pattern.rawRight !== undefined && pattern.rawLeft !== pattern.rawRight
                ? 'Asymmetry'
                : ''
        ]
            .filter((item) => item !== '')
            .join(' · ');
        return `
        <div class="fms-pattern-row">
          <span>${escapeHtml(getFmsPatternName(patternKey))}</span>
          <strong>${escapeHtml(scoreLabel)}</strong>
          <small>${escapeHtml(flags || 'No flags')}</small>
        </div>
      `;
    })
        .join('');
    const summaryLead = session.status === 'completed' && typeof session.totalScore === 'number'
        ? `Total score ${session.totalScore} / 21`
        : formatFmsStatus(session.status);
    return `
    <div class="card fms-summary-card">
      <div class="section-head">
        <p class="eyebrow">Latest result</p>
        <h2>${escapeHtml(summaryLead)}</h2>
        <p class="section-copy">
          ${session.anyPain ? 'Pain was reported, so this result should not be treated as a diagnosis.' : 'Use the lowest-scoring patterns and any asymmetry as the main review points.'}
        </p>
      </div>
      <div class="fms-pattern-grid">
        ${patternMarkup}
      </div>
    </div>
  `;
}
const FMS_TASKS_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1/wasm';
const FMS_HEAVY_MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';
function resetFmsCameraViewState() {
    state.fms.camera.taskId = null;
    state.fms.camera.analyzer = null;
    state.fms.camera.loading = false;
    state.fms.camera.error = null;
    state.fms.camera.assessment = null;
    state.fms.camera.lastVideoTime = -1;
    state.fms.camera.running = false;
}
function getFmsCameraElements() {
    return {
        video: document.querySelector('#fms-camera-video'),
        canvas: document.querySelector('#fms-camera-canvas'),
        status: document.querySelector('#fms-camera-status'),
        guidance: document.querySelector('#fms-camera-guidance'),
        error: document.querySelector('#fms-camera-error')
    };
}
function updateFmsCameraFeedback(assessment) {
    const camera = getFmsCameraElements();
    if (!camera.status || !camera.guidance || !camera.error)
        return;
    if (state.fms.camera.error) {
        camera.error.hidden = false;
        camera.error.textContent = state.fms.camera.error;
    }
    else {
        camera.error.hidden = true;
        camera.error.textContent = '';
    }
    if (!assessment) {
        camera.status.className = 'status-pill camera-status';
        camera.status.textContent = state.fms.camera.loading ? 'Loading camera' : 'Waiting';
        camera.guidance.textContent = state.fms.camera.loading
            ? 'Loading the heavy pose model and opening the camera.'
            : 'Prepare the camera, then hold still while the app checks your setup.';
        return;
    }
    camera.status.className = 'status-pill camera-status';
    if (assessment.phase === 'ready') {
        camera.status.classList.add('is-ready');
    }
    camera.status.textContent = assessment.statusLabel;
    camera.guidance.textContent = assessment.guidance;
}
function drawFmsPose(landmarks) {
    const camera = getFmsCameraElements();
    if (!camera.canvas || !camera.video)
        return;
    if (camera.video.videoWidth === 0 || camera.video.videoHeight === 0)
        return;
    if (camera.canvas.width !== camera.video.videoWidth || camera.canvas.height !== camera.video.videoHeight) {
        camera.canvas.width = camera.video.videoWidth;
        camera.canvas.height = camera.video.videoHeight;
    }
    const context = camera.canvas.getContext('2d');
    if (!context)
        return;
    context.clearRect(0, 0, camera.canvas.width, camera.canvas.height);
    if (!landmarks || landmarks.length === 0)
        return;
    context.strokeStyle = '#68e5ff';
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const [startIndex, endIndex] of FMS_POSE_CONNECTIONS) {
        const start = landmarks[startIndex];
        const end = landmarks[endIndex];
        if (!start || !end)
            continue;
        if ((start.visibility ?? 1) < 0.5 || (end.visibility ?? 1) < 0.5)
            continue;
        context.beginPath();
        context.moveTo(start.x * camera.canvas.width, start.y * camera.canvas.height);
        context.lineTo(end.x * camera.canvas.width, end.y * camera.canvas.height);
        context.stroke();
    }
    context.fillStyle = '#f5f7fb';
    for (const landmark of landmarks) {
        if ((landmark.visibility ?? 1) < 0.5)
            continue;
        context.beginPath();
        context.arc(landmark.x * camera.canvas.width, landmark.y * camera.canvas.height, 4, 0, Math.PI * 2);
        context.fill();
    }
}
async function stopFmsCameraResources(options = {}) {
    if (state.fms.camera.rafId !== null) {
        cancelAnimationFrame(state.fms.camera.rafId);
        state.fms.camera.rafId = null;
    }
    if (state.fms.camera.stream) {
        for (const track of state.fms.camera.stream.getTracks()) {
            track.stop();
        }
        state.fms.camera.stream = null;
    }
    if (options.closeLandmarker && state.fms.camera.landmarker) {
        state.fms.camera.landmarker.close();
        state.fms.camera.landmarker = null;
    }
    const camera = getFmsCameraElements();
    if (camera.video) {
        camera.video.srcObject = null;
    }
    if (camera.canvas) {
        camera.canvas.getContext('2d')?.clearRect(0, 0, camera.canvas.width, camera.canvas.height);
    }
    if (!options.preserveReview) {
        state.fms.camera.review = null;
    }
    resetFmsCameraViewState();
    updateFmsCameraFeedback(state.fms.camera.assessment);
}
async function getMediaPipeVisionModule() {
    if (!window.__mediaPipeVisionModulePromise) {
        window.__mediaPipeVisionModulePromise = import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1/vision_bundle.mjs');
    }
    return window.__mediaPipeVisionModulePromise;
}
async function ensureFmsLandmarker() {
    if (state.fms.camera.landmarker) {
        return state.fms.camera.landmarker;
    }
    const vision = await getMediaPipeVisionModule();
    const fileset = await vision.FilesetResolver.forVisionTasks(FMS_TASKS_WASM_ROOT);
    state.fms.camera.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
            modelAssetPath: FMS_HEAVY_MODEL_PATH
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false
    });
    return state.fms.camera.landmarker;
}
function renderFmsCaptureMetrics(metrics) {
    if (metrics.length === 0)
        return '';
    return `
    <div class="fms-metric-grid">
      ${metrics.map((metric) => `<div class="results-note">${escapeHtml(metric)}</div>`).join('')}
    </div>
  `;
}
function reviewActionMarkup(task, review) {
    const actions = ['<button class="secondary-button" data-fms-action="retry-capture" type="button">Retry capture</button>'];
    if (task.patternKey === 'deepSquat' && review.score < 3 && review.mode === 'primary') {
        actions.push('<button class="secondary-button" data-fms-action="retry-heels" type="button">Retry with heels elevated</button>');
    }
    if (task.patternKey === 'rotaryStability' && review.score < 3 && review.mode === 'primary') {
        actions.push('<button class="secondary-button" data-fms-action="retry-diagonal" type="button">Try diagonal regression</button>');
    }
    return actions.join('');
}
async function startFmsMovementCapture(task, mode = state.fms.camera.mode) {
    const draft = state.fms.draft;
    if (!draft)
        return;
    if (state.fms.camera.running && state.fms.camera.taskId === task.id && state.fms.camera.mode === mode) {
        return;
    }
    await stopFmsCameraResources({ preserveReview: false });
    state.fms.camera.mode = mode;
    state.fms.camera.taskId = task.id;
    state.fms.camera.loading = true;
    state.fms.camera.error = null;
    state.fms.camera.review = null;
    state.fms.camera.assessment = null;
    updateFmsCameraFeedback(null);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        const landmarker = await ensureFmsLandmarker();
        const camera = getFmsCameraElements();
        if (!camera.video) {
            throw new Error('The FMS camera view is missing from the screen.');
        }
        state.fms.camera.stream = stream;
        state.fms.camera.analyzer = new FmsTaskAnalyzer(task, draft.sexForTSPU, mode);
        state.fms.camera.lastVideoTime = -1;
        state.fms.camera.running = true;
        state.fms.camera.loading = false;
        camera.video.srcObject = stream;
        await camera.video.play();
        updateFmsCameraFeedback(null);
        const tick = () => {
            if (!state.fms.camera.running || !state.fms.camera.analyzer)
                return;
            state.fms.camera.rafId = requestAnimationFrame(tick);
            const currentCamera = getFmsCameraElements();
            if (!currentCamera.video || currentCamera.video.readyState < 2)
                return;
            if (currentCamera.video.currentTime === state.fms.camera.lastVideoTime)
                return;
            state.fms.camera.lastVideoTime = currentCamera.video.currentTime;
            const result = landmarker.detectForVideo(currentCamera.video, performance.now());
            const landmarks = result.landmarks[0] ?? [];
            const worldLandmarks = result.worldLandmarks[0] ?? [];
            const assessment = state.fms.camera.analyzer.processFrame({ landmarks, worldLandmarks }, performance.now());
            state.fms.camera.assessment = assessment;
            updateFmsCameraFeedback(assessment);
            drawFmsPose(assessment.landmarks);
            if (assessment.phase === 'ready' && !state.fms.camera.analyzer.hasAnnouncedReady) {
                state.fms.camera.analyzer.markReadyAnnounced();
                voiceCoach.speak({
                    key: `fms-ready-${task.id}-${mode}`,
                    message: 'Perform the movement now.',
                    minIntervalMs: 0
                });
            }
            if (assessment.phase === 'captured' && assessment.capture) {
                state.fms.camera.review = assessment.capture;
                voiceCoach.speak({
                    key: `fms-captured-${task.id}-${mode}`,
                    message: 'Movement captured.',
                    interrupt: true,
                    minIntervalMs: 0
                });
                void stopFmsCameraResources({ preserveReview: true });
                renderApp();
            }
        };
        voiceCoach.speak({
            key: `fms-task-${task.id}-${mode}`,
            message: task.voiceScript,
            interrupt: true,
            minIntervalMs: 0
        });
        tick();
    }
    catch (error) {
        state.fms.camera.loading = false;
        state.fms.camera.error = error instanceof Error ? error.message : 'Could not start the heavy pose model.';
        state.fms.camera.running = false;
        updateFmsCameraFeedback(null);
    }
}
function renderFms() {
    const user = state.activeUser;
    if (!user)
        return;
    const latestFmsSession = state.fms.latestSession ?? state.fmsSessions[0] ?? null;
    const draft = state.fms.draft;
    const currentSex = draft?.sexForTSPU ?? sexForFms(user);
    const tasks = createFmsTasks(currentSex);
    const task = draft ? tasks[state.fms.currentTaskIndex] : null;
    const progressLabel = task ? `Step ${state.fms.currentTaskIndex + 1} of ${tasks.length}` : 'Before you start';
    const latestSummaryMarkup = latestFmsSession ? buildFmsSummaryMarkup(latestFmsSession) : '';
    if (!draft) {
        void stopFmsCameraResources({ closeLandmarker: true });
        const sexPromptMarkup = currentSex === 'unspecified'
            ? `
            <div class="card fms-card">
              <div class="section-head">
                <p class="eyebrow">Profile requirement</p>
                <h2>Save the sex used for the push-up rule</h2>
                <p class="section-copy">
                  The Trunk Stability Push-Up uses different official hand positions for male and female standards. This is saved to the profile for scoring, but it is not shown on the visible profile screen.
                </p>
              </div>
              <label class="field">
                <span>Sex used for the FMS standard</span>
                <select id="fms-sex-select">
                  <option value="">Select one</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <div class="action-bar">
                <button class="primary-button" data-fms-action="save-sex" type="button">Save to profile</button>
              </div>
            </div>
          `
            : '';
        els.fmsRoot.innerHTML = `
      <div class="card splash-card">
        <p class="eyebrow">Functional Movement Screen</p>
        <h1>Run the seven-pattern FMS in a fixed order.</h1>
        <p class="section-copy">
          Heavy MediaPipe pose tracking verifies setup, captures movement attempts, stores FMS history, and keeps the official seven-pattern order locked from start to finish.
        </p>
        <div class="hero-badges">
          <span class="pill">7 patterns</span>
          <span class="pill">Fixed order</span>
          <span class="pill">Pain aware</span>
          <span class="pill">Heavy pose model</span>
        </div>
      </div>

      ${sexPromptMarkup}

      <div class="card fms-card">
        <div class="section-head">
          <p class="eyebrow">Safety</p>
          <h2>Mandatory disclaimer</h2>
          <p class="section-copy">${escapeHtml(fmsDisclaimer)}</p>
        </div>
        <label class="checkbox-row">
          <input id="fms-disclaimer-checkbox" type="checkbox">
          <span>I understand that this is a screening tool and not a diagnosis.</span>
        </label>
      </div>

      <div class="card fms-card">
        <div class="section-head">
          <p class="eyebrow">Equipment</p>
          <h2>Prepare the full setup first</h2>
        </div>
        <ul class="bullet-list">
          ${fmsRequiredEquipment.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
        <div class="fms-note-stack">
          ${fmsEquipmentNotes.map((item) => `<p class="results-note">${escapeHtml(item)}</p>`).join('')}
        </div>
        <label class="checkbox-row">
          <input id="fms-equipment-checkbox" type="checkbox">
          <span>All required equipment is ready and visible enough for the test.</span>
        </label>
      </div>

      <div class="action-bar">
        <button class="primary-button" data-fms-action="start" type="button">Start FMS</button>
      </div>

      ${latestSummaryMarkup}

      <div class="card history-card">
        <div class="section-head tight">
          <p class="eyebrow">FMS history</p>
          <h2>Recent screens</h2>
        </div>
        <div>${buildFmsHistoryMarkup()}</div>
      </div>
    `;
        return;
    }
    if (!task) {
        void stopFmsCameraResources({ closeLandmarker: true });
        els.fmsRoot.innerHTML = latestSummaryMarkup;
        return;
    }
    const review = state.fms.camera.review;
    const taskTitle = `${task.patternName}${task.side ? ` · ${task.side}` : ''}`;
    if (task.kind === 'movement') {
        const cameraCardMarkup = review
            ? `
          <div class="card fms-card">
            <div class="section-head">
              <p class="eyebrow">Capture review</p>
              <h2>Detected score ${review.score}</h2>
              <p class="section-copy">
                Confidence ${Math.round(review.confidence * 100)}%. Review the notes below, then report pain if needed before continuing.
              </p>
            </div>
            ${renderFmsCaptureMetrics(review.metrics)}
            <div class="fms-note-stack">
              ${review.notes.length === 0 ? '<p class="results-note">No extra capture notes were generated for this attempt.</p>' : review.notes.map((item) => `<p class="results-note">${escapeHtml(item)}</p>`).join('')}
            </div>
            <div class="action-bar">
              ${reviewActionMarkup(task, review)}
            </div>
          </div>
        `
            : `
          <div class="card camera-card fms-live-camera-card">
            <div class="camera-stage">
              <video id="fms-camera-video" class="camera-video" autoplay muted playsinline></video>
              <canvas id="fms-camera-canvas" class="camera-canvas"></canvas>
              <div class="camera-gradient"></div>
              <div class="camera-hud">
                <div class="camera-stats">
                  <div class="camera-stat">
                    <span>View</span>
                    <strong>${escapeHtml(task.cameraView)}</strong>
                  </div>
                  <div class="camera-stat">
                    <span>Model</span>
                    <strong>Pose heavy</strong>
                  </div>
                </div>
                <span class="status-pill camera-status" id="fms-camera-status">Loading camera</span>
              </div>
            </div>
            <p class="section-copy" id="fms-camera-guidance">Loading the heavy pose model and opening the camera.</p>
            <p class="camera-error" id="fms-camera-error" hidden></p>
          </div>
        `;
        els.fmsRoot.innerHTML = `
      <div class="card fms-card">
        <div class="section-head">
          <p class="eyebrow">${escapeHtml(progressLabel)}</p>
          <h2>${escapeHtml(taskTitle)}</h2>
          <p class="section-copy">
            ${escapeHtml(task.cameraView)}. Hold still for position lock, wait for the green ready state, then perform the movement once.
          </p>
        </div>
        <div class="hero-badges">
          ${task.equipment.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join('')}
        </div>
        <ul class="bullet-list">
          ${task.instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
        <div class="action-bar">
          <button class="secondary-button" data-fms-action="voice" type="button">Read instructions aloud</button>
          <button class="secondary-button" data-fms-action="restart-camera" type="button">Restart camera</button>
        </div>
      </div>

      ${cameraCardMarkup}

      <div class="card fms-card">
        <div class="section-head">
          <p class="eyebrow">Pain and notes</p>
          <h2>Finish this step</h2>
          <p class="section-copy">${escapeHtml(task.painPrompt)}</p>
        </div>
        <label class="checkbox-row">
          <input id="fms-pain-checkbox" type="checkbox">
          <span>Pain was present during this movement.</span>
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea id="fms-note-input" rows="4" placeholder="Optional notes about balance loss, compensation, asymmetry, or setup issues."></textarea>
        </label>
      </div>

      <div class="action-bar">
        <button class="secondary-button" data-fms-action="quit" type="button">Save and stop</button>
        <button class="primary-button" data-fms-action="advance" type="button">${state.fms.currentTaskIndex === tasks.length - 1 ? 'Finish FMS' : 'Next step'}</button>
      </div>
    `;
        if (!review && state.screen === 'fms') {
            void startFmsMovementCapture(task, state.fms.camera.mode);
        }
        else {
            updateFmsCameraFeedback(null);
        }
        return;
    }
    void stopFmsCameraResources({ preserveReview: false });
    els.fmsRoot.innerHTML = `
    <div class="card fms-card">
      <div class="section-head">
        <p class="eyebrow">${escapeHtml(progressLabel)}</p>
        <h2>${escapeHtml(taskTitle)}</h2>
        <p class="section-copy">
          ${escapeHtml(task.cameraView)}. This clearing step only records whether pain is present.
        </p>
      </div>
      <div class="hero-badges">
        ${task.equipment.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join('')}
      </div>
      <ul class="bullet-list">
        ${task.instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <div class="action-bar">
        <button class="secondary-button" data-fms-action="voice" type="button">Read instructions aloud</button>
      </div>
    </div>

    <div class="card fms-card">
      <div class="section-head">
        <p class="eyebrow">Clearing test</p>
        <h2>Record pain only</h2>
        <p class="section-copy">${escapeHtml(task.painPrompt)}</p>
      </div>
      <label class="checkbox-row">
        <input id="fms-pain-checkbox" type="checkbox">
        <span>Pain was present during this clearing test.</span>
      </label>
      <label class="field">
        <span>Notes</span>
        <textarea id="fms-note-input" rows="4" placeholder="Optional notes about the clearing response."></textarea>
      </label>
    </div>

    <div class="action-bar">
      <button class="secondary-button" data-fms-action="quit" type="button">Save and stop</button>
      <button class="primary-button" data-fms-action="advance" type="button">${state.fms.currentTaskIndex === tasks.length - 1 ? 'Finish FMS' : 'Next step'}</button>
    </div>
  `;
}
function getCurrentFmsTask() {
    const user = state.activeUser;
    const draft = state.fms.draft;
    if (!user || !draft)
        return null;
    return createFmsTasks(draft.sexForTSPU ?? user.sexForTSPU)[state.fms.currentTaskIndex] ?? null;
}
function appendPatternNote(pattern, note) {
    const trimmed = note.trim();
    if (trimmed === '')
        return;
    pattern.notes = Array.from(new Set([...pattern.notes, trimmed.slice(0, 220)])).slice(0, 8);
}
function applyFmsTaskResult(draft, task, score, pain, note, options = {}) {
    const next = cloneFmsDraft(draft);
    const pattern = next.patterns[task.patternKey];
    if (task.kind === 'movement') {
        if (score === null) {
            throw new Error('A score is required for this movement.');
        }
        if (task.side === 'left') {
            pattern.rawLeft = pain ? 0 : score;
        }
        else {
            pattern.rawRight = pain ? 0 : score;
        }
        if (pain) {
            pattern.pain = true;
        }
    }
    else if (pain) {
        pattern.clearingPain = true;
    }
    if (typeof options.confidence === 'number') {
        pattern.confidence = Math.min(pattern.confidence, options.confidence);
    }
    if (pain) {
        appendPatternNote(pattern, `${task.patternName}: pain reported.`);
    }
    for (const generatedNote of options.autoNotes ?? []) {
        appendPatternNote(pattern, generatedNote);
    }
    if (note.trim() !== '') {
        appendPatternNote(pattern, task.side ? `${task.side}: ${note.trim()}` : note.trim());
    }
    return recalculateFmsDraft(next);
}
async function persistFmsDraft(nextDraft) {
    try {
        voiceCoach.stop();
        await stopFmsCameraResources({ closeLandmarker: true });
        const saved = await saveFmsSession(nextDraft);
        state.fms.latestSession = saved;
        await refreshUserData();
        state.fms.draft = null;
        state.fms.currentTaskIndex = 0;
        state.fms.camera.mode = 'primary';
        setActiveScreen('fms');
        renderApp();
        return true;
    }
    catch (error) {
        window.alert(error instanceof Error ? error.message : 'The FMS session could not be saved to the backend.');
        return false;
    }
}
async function saveAndExitFms(status) {
    const draft = state.fms.draft;
    if (!draft)
        return;
    const next = recalculateFmsDraft(cloneFmsDraft(draft));
    next.status = status;
    next.completedAt = new Date().toISOString();
    if (status !== 'completed') {
        next.totalScore = undefined;
    }
    await persistFmsDraft(next);
}
async function startFmsFlow() {
    const user = state.activeUser;
    if (!user)
        return;
    if (user.sexForTSPU === 'unspecified') {
        window.alert('Save the sex used for the Trunk Stability Push-Up standard before starting the FMS flow.');
        return;
    }
    const disclaimerAccepted = document.querySelector('#fms-disclaimer-checkbox')?.checked ?? false;
    const equipmentConfirmed = document.querySelector('#fms-equipment-checkbox')?.checked ?? false;
    if (!disclaimerAccepted) {
        window.alert('You must accept the screening disclaimer before starting.');
        return;
    }
    if (!equipmentConfirmed) {
        window.alert('Confirm the equipment setup before starting.');
        return;
    }
    state.fms.draft = createNewFmsDraft(user, disclaimerAccepted, equipmentConfirmed);
    state.fms.currentTaskIndex = 0;
    state.fms.camera.mode = 'primary';
    state.fms.camera.review = null;
    renderApp();
    voiceCoach.stop();
    voiceCoach.speak({
        key: 'fms-opening',
        message: `${fmsVoiceDisclaimer} ${fmsOpeningVoice}`,
        interrupt: true,
        minIntervalMs: 0
    });
}
async function saveFmsProfileSex() {
    const select = document.querySelector('#fms-sex-select');
    const value = select?.value === 'male' || select?.value === 'female' ? select.value : null;
    if (!value) {
        window.alert('Select male or female to save the FMS setup.');
        return;
    }
    const result = await updateSexForTSPU(value);
    if (!result.ok) {
        window.alert(result.message ?? 'Could not update the profile.');
        return;
    }
    await refreshUserData();
    renderApp();
}
async function advanceFmsFlow() {
    const draft = state.fms.draft;
    const task = getCurrentFmsTask();
    if (!draft || !task)
        return;
    const pain = document.querySelector('#fms-pain-checkbox')?.checked ?? false;
    const note = document.querySelector('#fms-note-input')?.value ?? '';
    const review = task.kind === 'movement' ? state.fms.camera.review : null;
    const score = task.kind === 'movement' ? review?.score ?? null : null;
    let nextDraft;
    try {
        if (task.kind === 'movement' && !review) {
            throw new Error('Capture the movement before continuing.');
        }
        nextDraft = applyFmsTaskResult(draft, task, score, pain, note, {
            autoNotes: review?.notes,
            confidence: review?.confidence
        });
    }
    catch (error) {
        window.alert(error instanceof Error ? error.message : 'This step is incomplete.');
        return;
    }
    if (pain) {
        const continueAfterPain = window.confirm('Pain reported. This movement will be marked as pain present. Do you want to continue with the next step?');
        if (!continueAfterPain) {
            state.fms.draft = nextDraft;
            await saveAndExitFms('stopped_pain');
            return;
        }
    }
    const nextIndex = state.fms.currentTaskIndex + 1;
    const tasks = createFmsTasks(nextDraft.sexForTSPU);
    if (nextIndex >= tasks.length) {
        const completedDraft = recalculateFmsDraft(nextDraft);
        completedDraft.status = 'completed';
        completedDraft.completedAt = new Date().toISOString();
        await persistFmsDraft(completedDraft);
        return;
    }
    state.fms.draft = nextDraft;
    state.fms.currentTaskIndex = nextIndex;
    state.fms.camera.mode = 'primary';
    state.fms.camera.review = null;
    renderApp();
    const nextTask = tasks[nextIndex];
    if (nextTask) {
        voiceCoach.speak({
            key: `fms-${nextTask.id}`,
            message: nextTask.voiceScript,
            interrupt: true,
            minIntervalMs: 0
        });
    }
}
function renderResults(session) {
    const user = state.activeUser;
    if (!user)
        return;
    setText(els.resultsName, user.name);
    setText(els.resultsTotalReps, String(session.totalReps));
    setText(els.resultsValidReps, String(session.validReps));
    setText(els.resultsDepthScore, formatPercent(session.depthScore));
    setText(els.resultsPostureScore, formatPercent(session.postureScore));
    els.resultsNotes.innerHTML = '';
    if (session.notes.length === 0) {
        const note = document.createElement('div');
        note.className = 'results-note';
        note.textContent = 'Clean session. No persistent correction theme was detected.';
        els.resultsNotes.append(note);
        return;
    }
    for (const item of session.notes) {
        const note = document.createElement('div');
        note.className = 'results-note';
        note.textContent = item;
        els.resultsNotes.append(note);
    }
}
function renderLiveSnapshot(snapshot) {
    state.live.snapshot = snapshot;
    const liveSetLabel = snapshot.phase === 'SESSION_COMPLETE'
        ? `${squatTraining.session.protocol.sets} / ${squatTraining.session.protocol.sets}`
        : `${snapshot.setNumber} / ${squatTraining.session.protocol.sets}`;
    const liveRepLabel = snapshot.phase === 'SESSION_COMPLETE'
        ? `${squatTraining.session.protocol.repsPerSet} / ${squatTraining.session.protocol.repsPerSet}`
        : `${snapshot.repInSet} / ${squatTraining.session.protocol.repsPerSet}`;
    const startPositionReady = snapshot.phase === 'READY' ||
        snapshot.phase === 'DESCENDING' ||
        snapshot.phase === 'BOTTOM' ||
        snapshot.phase === 'ASCENDING' ||
        snapshot.phase === 'SESSION_COMPLETE' ||
        (snapshot.orientationAccepted && snapshot.startPostureOk);
    setText(els.liveSetValue, liveSetLabel);
    setText(els.liveRepValue, liveRepLabel);
    els.orientationChip.className = 'status-pill camera-status';
    if (snapshot.phase === 'REST') {
        els.orientationChip.hidden = true;
    }
    else if (startPositionReady) {
        els.orientationChip.hidden = false;
        els.orientationChip.classList.add('is-ready');
        setText(els.orientationChip, 'Starting position ready');
    }
    else {
        els.orientationChip.hidden = false;
        setText(els.orientationChip, 'Adjust position');
    }
    if (snapshot.phase === 'REST') {
        els.restPill.hidden = false;
        setText(els.restPill, `Rest ${Math.ceil(snapshot.restRemainingMs / 1000)}s`);
    }
    else {
        els.restPill.hidden = true;
    }
    els.pauseToggleBtn.textContent = state.live.paused ? 'Resume' : 'Pause';
}
function syncNavigation() {
    const isHome = state.screen === 'home';
    const isFms = state.screen === 'fms';
    const isProfile = state.screen === 'profile';
    els.homeNavHome.classList.toggle('is-active', isHome);
    els.homeNavFms.classList.toggle('is-active', isFms);
    els.homeNavProfile.classList.toggle('is-active', isProfile);
    els.fmsNavHome.classList.toggle('is-active', isHome);
    els.fmsNavFms.classList.toggle('is-active', isFms);
    els.fmsNavProfile.classList.toggle('is-active', isProfile);
    els.profileNavHome.classList.toggle('is-active', isHome);
    els.profileNavFms.classList.toggle('is-active', isFms);
    els.profileNavProfile.classList.toggle('is-active', isProfile);
}
function renderApp() {
    renderAuth();
    if (!state.activeUser) {
        setActiveScreen('auth');
        return;
    }
    renderHome();
    renderFms();
    renderDetails();
    renderProfile();
    if (state.latestSession) {
        renderResults(state.latestSession);
    }
    setActiveScreen(state.screen);
    syncNavigation();
}
function handleEngineEvents(events) {
    for (const event of events) {
        voiceCoach.speak({
            key: event.key,
            message: event.message,
            interrupt: event.interrupt
        });
    }
}
function syncCanvasToVideo() {
    if (els.cameraVideo.videoWidth === 0 || els.cameraVideo.videoHeight === 0)
        return;
    if (els.cameraCanvas.width !== els.cameraVideo.videoWidth ||
        els.cameraCanvas.height !== els.cameraVideo.videoHeight) {
        els.cameraCanvas.width = els.cameraVideo.videoWidth;
        els.cameraCanvas.height = els.cameraVideo.videoHeight;
    }
}
function toCanvasPoint(point, width, height) {
    return {
        x: point.x * width,
        y: point.y * height
    };
}
function drawPose(landmarks, trackedSide) {
    syncCanvasToVideo();
    const context = els.cameraCanvas.getContext('2d');
    if (!context)
        return;
    const width = els.cameraCanvas.width;
    const height = els.cameraCanvas.height;
    context.clearRect(0, 0, width, height);
    if (!landmarks || landmarks.length === 0)
        return;
    const side = trackedSide ?? 'left';
    const indices = side === 'left'
        ? [11, 23, 25, 27, 29, 31]
        : [12, 24, 26, 28, 30, 32];
    const points = indices.map((index) => toCanvasPoint(landmarks[index], width, height));
    context.strokeStyle = side === 'left' ? '#6dd6ff' : '#ffbe6f';
    context.lineWidth = 8;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
        context.lineTo(points[index].x, points[index].y);
    }
    context.stroke();
    context.fillStyle = '#f5f7fb';
    for (const point of points) {
        context.beginPath();
        context.arc(point.x, point.y, 7, 0, Math.PI * 2);
        context.fill();
    }
}
async function stopLiveResources() {
    if (state.live.rafId !== null) {
        cancelAnimationFrame(state.live.rafId);
        state.live.rafId = null;
    }
    if (state.live.stream) {
        for (const track of state.live.stream.getTracks()) {
            track.stop();
        }
        state.live.stream = null;
    }
    if (state.live.pose?.close) {
        await state.live.pose.close();
    }
    state.live.pose = null;
    state.live.engine = null;
    state.live.sending = false;
    state.live.paused = false;
    state.live.pausedAtMs = null;
    state.live.pausedDurationMs = 0;
    state.live.snapshot = null;
    state.live.completionHandled = false;
    voiceCoach.stop();
    const context = els.cameraCanvas.getContext('2d');
    context?.clearRect(0, 0, els.cameraCanvas.width, els.cameraCanvas.height);
    els.cameraVideo.srcObject = null;
}
async function handleSessionComplete(snapshot) {
    if (!state.activeUser || state.live.completionHandled)
        return;
    state.live.completionHandled = true;
    const durationSeconds = Math.max(1, Math.round((performance.now() - state.live.startedAtMs - state.live.pausedDurationMs) / 1000));
    const notes = Array.from(new Set(snapshot.results
        .flatMap((result) => result.feedback)
        .filter((message) => message.trim() !== ''))).slice(0, 3);
    const sessionPayload = {
        completedAt: new Date().toISOString(),
        durationSeconds,
        totalReps: snapshot.totalReps,
        validReps: snapshot.validReps,
        invalidReps: snapshot.invalidReps,
        depthScore: snapshot.depthScore,
        postureScore: snapshot.postureScore,
        notes,
        totalSets: squatTraining.session.protocol.sets,
        repsPerSet: squatTraining.session.protocol.repsPerSet
    };
    try {
        const savedSession = await saveSession(sessionPayload);
        state.latestSession = savedSession;
        await refreshUserData();
    }
    catch (error) {
        const fallback = {
            id: crypto.randomUUID(),
            userEmail: state.activeUser.email,
            ...sessionPayload
        };
        state.latestSession = fallback;
        window.alert(error instanceof Error ? error.message : 'The session could not be saved to the backend.');
    }
    if (state.latestSession) {
        renderResults(state.latestSession);
    }
    await stopLiveResources();
    setActiveScreen('results');
}
async function handlePoseResults(results) {
    if (!state.live.engine)
        return;
    drawPose(results.poseLandmarks, state.live.snapshot?.trackedSide ?? null);
    if (state.live.paused) {
        if (state.live.snapshot)
            renderLiveSnapshot(state.live.snapshot);
        return;
    }
    const now = performance.now();
    const update = results.poseLandmarks && results.poseLandmarks.length > 0
        ? state.live.engine.processLandmarks(results.poseLandmarks, now)
        : state.live.engine.tickWithoutPose(now);
    renderLiveSnapshot(update.snapshot);
    handleEngineEvents(update.events);
    if (update.snapshot.phase === 'SESSION_COMPLETE') {
        await handleSessionComplete(update.snapshot);
    }
}
async function startPoseLoop() {
    const tick = async () => {
        if (!state.live.pose || !state.live.stream)
            return;
        state.live.rafId = requestAnimationFrame(() => {
            void tick();
        });
        if (state.live.sending || els.cameraVideo.readyState < 2)
            return;
        state.live.sending = true;
        try {
            await state.live.pose.send({ image: els.cameraVideo });
        }
        catch (error) {
            els.cameraError.hidden = false;
            els.cameraError.textContent = error instanceof Error ? error.message : 'Pose processing failed.';
        }
        finally {
            state.live.sending = false;
        }
    };
    await tick();
}
async function startLiveSession() {
    if (!state.activeUser) {
        setActiveScreen('auth');
        return;
    }
    await stopLiveResources();
    setActiveScreen('live');
    els.cameraError.hidden = true;
    els.cameraError.textContent = '';
    if (typeof Pose === 'undefined') {
        els.cameraError.hidden = false;
        els.cameraError.textContent = 'MediaPipe Pose could not be loaded in this browser.';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        state.live.stream = stream;
        state.live.engine = new SquatSessionEngine(squatTraining.session.protocol);
        state.live.startedAtMs = performance.now();
        state.live.pausedDurationMs = 0;
        state.live.paused = false;
        state.live.pausedAtMs = null;
        state.live.snapshot = state.live.engine.getSnapshot();
        state.live.completionHandled = false;
        els.cameraVideo.srcObject = stream;
        await els.cameraVideo.play();
        syncCanvasToVideo();
        state.live.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        state.live.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            selfieMode: false,
            enableSegmentation: false,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });
        state.live.pose.onResults((results) => {
            void handlePoseResults(results);
        });
        renderLiveSnapshot(state.live.snapshot);
        voiceCoach.speak({
            key: 'welcome',
            message: `Welcome, ${state.activeUser.name}. Today you will perform a squat training: 3 sets of 5 reps. Front camera is live. Get into position.`,
            interrupt: true,
            minIntervalMs: 0
        });
        await startPoseLoop();
    }
    catch (error) {
        els.cameraError.hidden = false;
        els.cameraError.textContent =
            error instanceof Error
                ? error.message
                : 'Camera access failed. Use a secure session and allow front camera permission.';
    }
}
async function quitLiveSession(nextScreen) {
    await stopLiveResources();
    state.latestSession = null;
    setActiveScreen(nextScreen);
    renderApp();
}
async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = els.authEmailInput.value.trim();
    const password = els.authPasswordInput.value;
    if (email === '' || password.trim() === '') {
        showAuthError('Email and password are required.');
        return;
    }
    if (state.authMode === 'signup') {
        const name = els.authNameInput.value.trim();
        const sexForTSPU = els.authSexSelect.value === 'male' || els.authSexSelect.value === 'female' ? els.authSexSelect.value : null;
        if (name === '') {
            showAuthError('Your name is required.');
            return;
        }
        if (!sexForTSPU) {
            showAuthError('Sex is required for the FMS setup.');
            return;
        }
        const result = await registerUser(name, email, password, sexForTSPU);
        if (!result.ok) {
            showAuthError(result.message ?? 'Could not create the account.');
            return;
        }
    }
    else {
        const result = await loginUser(email, password);
        if (!result.ok) {
            showAuthError(result.message ?? 'Could not log in.');
            return;
        }
    }
    await refreshUserData();
    els.authForm.reset();
    setActiveScreen('home');
    renderApp();
}
async function bootstrap() {
    renderApp();
    try {
        await refreshUserData();
        if (state.activeUser) {
            setActiveScreen('home');
        }
        else {
            state.authMode = 'signup';
            setActiveScreen('auth');
        }
    }
    catch (error) {
        showAuthError(error instanceof Error ? error.message : 'Could not reach the backend.');
        setActiveScreen('auth');
    }
    finally {
        state.bootstrapping = false;
        renderApp();
    }
    els.authSwitchBtn.addEventListener('click', () => {
        state.authMode = state.authMode === 'signup' ? 'login' : 'signup';
        renderAuth();
    });
    els.authForm.addEventListener('submit', (event) => {
        void handleAuthSubmit(event);
    });
    els.homeProfileBtn.addEventListener('click', () => {
        setActiveScreen('profile');
        renderApp();
    });
    els.homeNavHome.addEventListener('click', () => {
        setActiveScreen('home');
        renderApp();
    });
    els.homeNavFms.addEventListener('click', () => {
        setActiveScreen('fms');
        renderApp();
    });
    els.homeNavProfile.addEventListener('click', () => {
        setActiveScreen('profile');
        renderApp();
    });
    els.fmsNavHome.addEventListener('click', () => {
        setActiveScreen('home');
        renderApp();
    });
    els.fmsNavFms.addEventListener('click', () => {
        setActiveScreen('fms');
        renderApp();
    });
    els.fmsNavProfile.addEventListener('click', () => {
        setActiveScreen('profile');
        renderApp();
    });
    els.fmsHomeBtn.addEventListener('click', () => {
        setActiveScreen('home');
        renderApp();
    });
    els.fmsProfileBtn.addEventListener('click', () => {
        setActiveScreen('profile');
        renderApp();
    });
    els.profileNavHome.addEventListener('click', () => {
        setActiveScreen('home');
        renderApp();
    });
    els.profileNavFms.addEventListener('click', () => {
        setActiveScreen('fms');
        renderApp();
    });
    els.profileNavProfile.addEventListener('click', () => {
        setActiveScreen('profile');
        renderApp();
    });
    els.profileHomeBtn.addEventListener('click', () => {
        setActiveScreen('home');
        renderApp();
    });
    els.fmsRoot.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement))
            return;
        const actionTarget = target.closest('[data-fms-action]');
        const action = actionTarget?.dataset.fmsAction;
        if (!action)
            return;
        if (action === 'save-sex') {
            void saveFmsProfileSex();
            return;
        }
        if (action === 'start') {
            void startFmsFlow();
            return;
        }
        if (action === 'voice') {
            const task = getCurrentFmsTask();
            if (!task)
                return;
            voiceCoach.speak({
                key: `fms-manual-${task.id}`,
                message: task.voiceScript,
                interrupt: true,
                minIntervalMs: 0
            });
            return;
        }
        if (action === 'advance') {
            void advanceFmsFlow();
            return;
        }
        if (action === 'restart-camera') {
            const task = getCurrentFmsTask();
            if (task?.kind === 'movement') {
                void startFmsMovementCapture(task, 'primary');
            }
            return;
        }
        if (action === 'retry-capture') {
            const task = getCurrentFmsTask();
            if (task?.kind === 'movement') {
                state.fms.camera.review = null;
                state.fms.camera.mode = 'primary';
                renderApp();
            }
            return;
        }
        if (action === 'retry-heels') {
            const task = getCurrentFmsTask();
            if (task?.kind === 'movement') {
                state.fms.camera.review = null;
                state.fms.camera.mode = 'heelsElevated';
                renderApp();
            }
            return;
        }
        if (action === 'retry-diagonal') {
            const task = getCurrentFmsTask();
            if (task?.kind === 'movement') {
                state.fms.camera.review = null;
                state.fms.camera.mode = 'diagonalRegression';
                renderApp();
            }
            return;
        }
        if (action === 'quit') {
            if (window.confirm('Save the current FMS progress as incomplete and stop now?')) {
                void saveAndExitFms('incomplete');
            }
        }
    });
    els.coachCard.addEventListener('click', () => {
        setActiveScreen('details');
        renderApp();
    });
    els.detailsBackBtn.addEventListener('click', () => {
        setActiveScreen('home');
        renderApp();
    });
    els.detailsStartBtn.addEventListener('click', () => {
        void startLiveSession();
    });
    els.quitBtn.addEventListener('click', () => {
        if (window.confirm('Quit the current session? Current progress will be discarded.')) {
            void quitLiveSession('details');
        }
    });
    els.pauseToggleBtn.addEventListener('click', () => {
        if (!state.live.engine)
            return;
        if (state.live.paused) {
            const resumedAt = performance.now();
            state.live.engine.resume(resumedAt);
            if (state.live.pausedAtMs !== null) {
                state.live.pausedDurationMs += resumedAt - state.live.pausedAtMs;
            }
            state.live.pausedAtMs = null;
            state.live.paused = false;
        }
        else {
            state.live.paused = true;
            state.live.pausedAtMs = performance.now();
            state.live.engine.pause(state.live.pausedAtMs);
            voiceCoach.stop();
        }
        if (state.live.snapshot)
            renderLiveSnapshot(state.live.snapshot);
    });
    els.resultsHomeBtn.addEventListener('click', () => {
        state.latestSession = null;
        setActiveScreen('home');
        renderApp();
    });
    els.resultsProfileBtn.addEventListener('click', async () => {
        state.latestSession = null;
        await refreshUserData();
        setActiveScreen('profile');
        renderApp();
    });
    els.logoutBtn.addEventListener('click', () => {
        void (async () => {
            voiceCoach.stop();
            try {
                await stopFmsCameraResources({ closeLandmarker: true });
                await flushTrackedScreenVisit(true);
                await logoutUser();
            }
            catch (error) {
                window.alert(error instanceof Error ? error.message : 'Could not log out.');
            }
            state.activeUser = null;
            state.sessions = [];
            state.fmsSessions = [];
            state.latestSession = null;
            state.fms.draft = null;
            state.fms.currentTaskIndex = 0;
            state.fms.latestSession = null;
            state.fms.camera.mode = 'primary';
            state.fms.camera.review = null;
            state.authMode = 'login';
            setActiveScreen('auth');
            renderApp();
        })();
    });
    window.addEventListener('resize', syncCanvasToVideo);
    window.addEventListener('pagehide', () => {
        void flushTrackedScreenVisit(true);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            void flushTrackedScreenVisit(true);
            return;
        }
        resumeTrackedScreenVisit();
    });
}
void bootstrap();
