import { trainingPrograms } from './exercises.js';
const TRAININGS = [
    {
        id: 'default-training',
        name: 'Calistenia corpo inteiro',
        description: 'Barra fixa, barra com anilhas e colchonete.',
        equipment: 'Barra fixa, barra com anilhas e colchonete.',
        programKey: 'intensive',
        difficulty: 2
    },
    {
        id: 'home-training',
        name: 'Treino em casa',
        description: '45s de exercício · 15s de pausa · sem equipamento.',
        equipment: 'Sem equipamento.',
        programKey: 'home',
        difficulty: 1
    },
    {
        id: 'core-training',
        name: 'Abdômen 8 min',
        description: '60s por exercício · sem pausa.',
        equipment: 'Sem equipamento.',
        programKey: 'core',
        difficulty: 1
    },
    {
        id: 'stretch-training',
        name: 'Alongamento',
        description: '30s por exercício · sem pausa.',
        equipment: 'Sem equipamento.',
        programKey: 'stretch',
        difficulty: 1
    },
    {
        id: 'flash-training',
        name: 'Treino iniciante flash',
        description: '10 movimentos de 60s + aquecimento · pausa de 2s.',
        equipment: 'Sem equipamento.',
        programKey: 'flash',
        difficulty: 1
    },
    {
        id: 'test-training-easy',
        name: 'Treino teste curto (fácil)',
        description: 'Sequência curta para validar telas · XP x1.',
        equipment: 'Sem equipamento.',
        programKey: 'test',
        difficulty: 1
    },
    {
        id: 'test-training-medium',
        name: 'Treino teste curto (intermediário)',
        description: 'Sequência curta para validar telas · XP x2.',
        equipment: 'Sem equipamento.',
        video: {
            src: 'videos/portrait.MOV',
            orientation: 'portrait'
        },
        programKey: 'test',
        difficulty: 2
    },
    {
        id: 'test-training-hard',
        name: 'Treino teste curto (difícil)',
        description: 'Sequência curta para validar telas · XP x3.',
        equipment: 'Sem equipamento.',
        video: {
            src: 'videos/landscape.MOV',
            orientation: 'landscape'
        },
        programKey: 'test',
        difficulty: 3
    }
];
const HISTORY_STORAGE_KEY = 'calisthenics-history';
const XP_RATE = 1;
const PREP_DELAY_SECONDS = 5;
const NO_TIPS_MESSAGE = 'Sem dicas adicionais para este exercício.';
const EXIT_TRAINING_MESSAGE = 'Tem certeza que vc quer sair do treino? Seu progresso sera perdido.';
const SWIPE_THRESHOLD_PX = 70;
const SWIPE_DOMINANCE_RATIO = 1.2;
const SHARE_CARD_WIDTH = 1080;
const SHARE_CARD_HEIGHT = 1350;
const state = {
    programKey: 'intensive',
    selectedTrainingId: null,
    schedule: [],
    pointer: 0,
    status: 'idle',
    segmentDurationMs: 0,
    remainingMs: 0,
    completedMs: 0,
    animationId: null,
    lastCountdownSecond: null,
    audioCtx: null,
    sessionTotalMs: 0,
    segmentStartedAt: 0,
    musicMuted: false
};
const METRONOME_VOLUME = 0.14;
const MUSIC_VOLUME = METRONOME_VOLUME / 1.2;
const MUSIC_TRACKS = [
    'music/drift-phonk-200108.mp3',
    'music/fresh-457883.mp3',
    'music/she-hates-my-reps-464309.mp3',
    'music/summer-trip-audio-oficial-243190.mp3',
    'music/trap-future-bass-royalty-free-music-167020.mp3'
];
let musicPlayer = null;
let lastMusicIndex = null;
let historyEntries = [];
let pendingConfirmAction = null;
let latestCompletionEntry = null;
function byId(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Element not found: ${id}`);
    return el;
}
function byScreen(screen) {
    const panel = document.querySelector(`[data-screen="${screen}"]`);
    if (!panel)
        throw new Error(`Screen not found: ${screen}`);
    return panel;
}
const els = {
    screens: Array.from(document.querySelectorAll('[data-screen]')),
    selectScreen: byScreen('select'),
    detailsScreen: byScreen('details'),
    exerciseScreen: byScreen('exercise'),
    historyScreen: byScreen('history'),
    trainingList: byId('training-list'),
    selectTrainings: byId('select-trainings-btn'),
    selectProfile: byId('select-profile-btn'),
    historyTrainings: byId('history-trainings-btn'),
    historyProfile: byId('history-profile-btn'),
    detailTrainingName: byId('detail-training-name'),
    detailTrainingDesc: byId('detail-training-desc'),
    totalTime: byId('total-time'),
    detailExerciseList: byId('detail-exercise-list'),
    detailBack: byId('detail-back-btn'),
    detailStart: byId('detail-start-btn'),
    exerciseDetailTitle: byId('exercise-detail-title'),
    exerciseDetailMeta: byId('exercise-detail-meta'),
    exerciseDetailTips: byId('exercise-detail-tips'),
    exerciseBack: byId('exercise-back-btn'),
    exerciseVideo: byId('exercise-video'),
    exerciseVideoPlaceholder: byId('exercise-video-placeholder'),
    playerTrainingName: byId('player-training-name'),
    start: byId('start-btn'),
    pause: byId('pause-btn'),
    statusChip: byId('status-chip'),
    musicToggle: byId('music-toggle-btn'),
    playerVideo: byId('player-video'),
    playerVideoPlaceholder: byId('player-video-placeholder'),
    currentTitle: byId('current-title'),
    currentDetail: byId('current-detail'),
    currentRemaining: byId('current-remaining'),
    phasePill: byId('phase-pill'),
    segmentProgressWrap: byId('segment-progress'),
    segmentProgressBar: byId('segment-progress-bar'),
    phaseBlocks: byId('phase-blocks'),
    progressBar: byId('progress-bar'),
    sessionRemaining: byId('session-remaining'),
    playerPlaceholder: byId('player-placeholder'),
    playerMain: byId('player-main'),
    completeXpEarned: byId('complete-xp-earned'),
    completeTrainingTime: byId('complete-training-time'),
    completeStreak: byId('complete-streak'),
    completeTotalXp: byId('complete-total-xp'),
    completeTrainingName: byId('complete-training-name'),
    completeShare: byId('complete-share-btn'),
    completeShareTargets: byId('complete-share-targets'),
    completeShareInstagram: byId('complete-share-instagram-btn'),
    completeShareX: byId('complete-share-x-btn'),
    completeToSelection: byId('complete-to-selection'),
    completeToHistory: byId('complete-to-history'),
    historyList: byId('history-list'),
    historyTotalXp: byId('history-total-xp'),
    historyStreak: byId('history-streak'),
    metronomeBack: byId('metronome-back-btn'),
    confirmOverlay: byId('confirm-overlay'),
    confirmMessage: byId('confirm-message'),
    confirmNo: byId('confirm-no-btn'),
    confirmYes: byId('confirm-yes-btn')
};
const phaseMeta = {
    go: { label: 'Vai', tone: 880 },
    pause: { label: 'Pausa', tone: 720 },
    return: { label: 'Volta', tone: 900 },
    rest: { label: 'Descanso', tone: 520 },
    hold: { label: 'Segura', tone: 760 },
    setRest: { label: 'Descanso', tone: 460 },
    prep: { label: 'Prepare-se', tone: 0 }
};
const routineColors = {
    'Push-Up': getComputedStyle(document.documentElement).getPropertyValue('--push') || '#f4a261',
    'Pull-Up': getComputedStyle(document.documentElement).getPropertyValue('--pull') || '#3fa9f5',
    Squat: getComputedStyle(document.documentElement).getPropertyValue('--squat') || '#7ddf89',
    Core: getComputedStyle(document.documentElement).getPropertyValue('--core') || '#e9c46a',
    Cardio: getComputedStyle(document.documentElement).getPropertyValue('--cardio') || '#f3722c',
    Mobility: getComputedStyle(document.documentElement).getPropertyValue('--mobility') || '#8ecae6'
};
const routineLabels = {
    'Push-Up': 'Empurrar',
    'Pull-Up': 'Puxar',
    Squat: 'Agachamento',
    Core: 'Abdômen',
    Cardio: 'Cardio',
    Mobility: 'Mobilidade'
};
function hasTempo(exercise) {
    return 'tempo' in exercise;
}
function hasTime(exercise) {
    return 'time' in exercise;
}
function formatRoutineLabel(routine) {
    return routineLabels[routine] ?? routine;
}
function createTestExercise(exercise, group) {
    const rest = 2;
    if (hasTempo(exercise)) {
        return {
            ...exercise,
            group,
            sets: 1,
            reps: 2,
            rest,
            baseRest: rest,
            restMultiplier: 1,
            tempo: {
                go: 1,
                pause: 0,
                return: 1,
                rest: 0
            }
        };
    }
    if (hasTime(exercise)) {
        return {
            ...exercise,
            group,
            sets: 1,
            time: 5,
            rest,
            baseRest: rest,
            restMultiplier: 1
        };
    }
    const _exhaustive = exercise;
    throw new Error(`Unsupported exercise type: ${String(_exhaustive)}`);
}
const intensiveProgram = trainingPrograms.intensive;
if (intensiveProgram.kind !== 'intensive') {
    throw new Error('Programa intensivo inválido.');
}
const TEST_TRAINING_GROUPS = intensiveProgram.groups.map(group => ({
    group: group.group,
    restMultiplier: group.restMultiplier,
    exercises: group.exercises.slice(0, 1).map(exercise => createTestExercise(exercise, group.group))
}));
init();
function init() {
    historyEntries = loadHistory();
    els.trainingList.addEventListener('click', event => {
        const target = event.target.closest('[data-training-id]');
        const trainingId = target?.dataset.trainingId;
        if (!trainingId)
            return;
        selectTraining(trainingId);
        showScreen('details');
    });
    els.selectTrainings.addEventListener('click', () => {
        openTrainingRoutineScreen();
    });
    els.selectProfile.addEventListener('click', () => {
        openProfileScreen();
    });
    els.historyTrainings.addEventListener('click', () => {
        openTrainingRoutineScreen();
    });
    els.historyProfile.addEventListener('click', () => {
        openProfileScreen();
    });
    els.detailExerciseList.addEventListener('click', event => {
        const target = event.target.closest('[data-exercise-name]');
        const exerciseName = target?.dataset.exerciseName;
        if (!exerciseName)
            return;
        showExerciseDetails(exerciseName);
    });
    els.detailBack.addEventListener('click', () => {
        showScreen('select');
    });
    els.detailStart.addEventListener('click', () => {
        showScreen('metronome');
        startSession();
    });
    els.exerciseBack.addEventListener('click', () => {
        showScreen('details');
    });
    els.metronomeBack.addEventListener('click', () => {
        if (state.status === 'running' || state.status === 'paused') {
            openTrainingConfirm('leave');
            return;
        }
        resetSession();
        showScreen('details');
    });
    els.completeToSelection.addEventListener('click', () => {
        resetSession();
        openTrainingRoutineScreen();
    });
    els.completeToHistory.addEventListener('click', () => {
        openProfileScreen();
    });
    els.start.addEventListener('click', () => {
        if (state.status === 'running' || state.status === 'paused') {
            openTrainingConfirm('reset');
            return;
        }
        startSession();
    });
    els.pause.addEventListener('click', () => {
        if (state.status === 'running') {
            pauseSession();
        }
        else if (state.status === 'paused') {
            resumeSession();
        }
    });
    els.musicToggle.addEventListener('click', () => {
        setMusicMuted(!state.musicMuted);
    });
    els.completeShare.addEventListener('click', () => {
        els.completeShareTargets.hidden = !els.completeShareTargets.hidden;
    });
    els.completeShareInstagram.addEventListener('click', () => {
        void shareCompletion('instagram');
    });
    els.completeShareX.addEventListener('click', () => {
        void shareCompletion('x');
    });
    els.confirmNo.addEventListener('click', () => {
        closeTrainingConfirm();
    });
    els.confirmYes.addEventListener('click', () => {
        handleTrainingConfirm();
    });
    bindSwipeNavigation(els.selectScreen, {
        left: () => openProfileScreen()
    });
    bindSwipeNavigation(els.historyScreen, {
        right: () => openTrainingRoutineScreen()
    });
    bindSwipeNavigation(els.detailsScreen, {
        left: () => openTrainingRoutineScreen()
    });
    bindSwipeNavigation(els.exerciseScreen, {
        left: () => showScreen('details')
    });
    if (TRAININGS.length) {
        selectTraining(TRAININGS[0].id);
    }
    renderHistory();
    updateMusicToggle();
    showScreen('select');
}
function showScreen(screen) {
    els.screens.forEach(panel => {
        panel.hidden = panel.dataset.screen !== screen;
    });
    if (screen !== 'complete') {
        els.completeShareTargets.hidden = true;
    }
    if (screen !== 'metronome') {
        closeTrainingConfirm();
    }
    setMainNavActive(screen === 'history' ? 'history' : 'select');
}
function setButtonStyle(btn, { primary }) {
    if (!btn)
        return;
    btn.classList.toggle('primary', primary);
    btn.classList.toggle('ghost', !primary);
}
function openProfileScreen() {
    renderHistory();
    showScreen('history');
}
function openTrainingRoutineScreen() {
    showScreen('select');
}
function setMainNavActive(activeScreen) {
    const selectingTrainings = activeScreen === 'select';
    els.selectTrainings.classList.toggle('is-active', selectingTrainings);
    els.selectProfile.classList.toggle('is-active', !selectingTrainings);
    els.historyTrainings.classList.toggle('is-active', selectingTrainings);
    els.historyProfile.classList.toggle('is-active', !selectingTrainings);
}
function bindSwipeNavigation(element, handlers) {
    let startX = 0;
    let startY = 0;
    let isTracking = false;
    element.addEventListener('touchstart', event => {
        if (event.touches.length !== 1)
            return;
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isTracking = true;
    }, { passive: true });
    element.addEventListener('touchcancel', () => {
        isTracking = false;
    });
    element.addEventListener('touchend', event => {
        if (!isTracking)
            return;
        isTracking = false;
        const touch = event.changedTouches[0];
        if (!touch)
            return;
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX)
            return;
        if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_DOMINANCE_RATIO)
            return;
        if (deltaX < 0) {
            handlers.left?.();
        }
        else {
            handlers.right?.();
        }
    }, { passive: true });
}
function getSelectedTraining() {
    const training = TRAININGS.find(item => item.id === state.selectedTrainingId) ?? TRAININGS[0];
    if (!training)
        throw new Error('No trainings configured');
    return training;
}
function selectTraining(id) {
    state.selectedTrainingId = id;
    const training = getSelectedTraining();
    state.programKey = training.programKey;
    renderTrainingList();
    renderTrainingDetail();
    resetSession();
}
function renderTrainingList() {
    const cards = TRAININGS.map(training => {
        const summary = computeProgramSummary(training.programKey);
        const active = training.id === state.selectedTrainingId ? 'active' : '';
        return `
      <button class="training-card ${active}" type="button" data-training-id="${training.id}">
        <div>
          <h3>${training.name}</h3>
          <p class="muted small">equipamento: ${training.equipment}</p>
        </div>
        <div class="training-stat">
          <span class="label">Duração</span>
          <span class="value">${formatSeconds(summary.totalSeconds)}</span>
        </div>
      </button>
    `;
    });
    els.trainingList.innerHTML = cards.join('');
}
function renderTrainingDetail() {
    const training = getSelectedTraining();
    const summary = updateDetailStats(training);
    els.detailTrainingName.textContent = training.name;
    els.detailTrainingDesc.textContent = training.equipment;
    els.detailTrainingDesc.hidden = training.equipment.trim().length === 0;
    els.playerTrainingName.textContent = training.name;
    els.sessionRemaining.textContent = formatSeconds(summary.totalSeconds);
    updateVideoBlocks(training);
    renderExerciseList();
}
function updateVideoBlocks(training) {
    const video = training.video;
    updateVideoBlock(els.exerciseVideo, els.exerciseVideoPlaceholder, video);
    updateVideoBlock(els.playerVideo, els.playerVideoPlaceholder, video);
}
function updateVideoBlock(videoEl, placeholderEl, video) {
    if (!video) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.classList.remove('is-portrait');
        videoEl.hidden = true;
        placeholderEl.hidden = false;
        videoEl.load();
        return;
    }
    videoEl.hidden = false;
    placeholderEl.hidden = true;
    videoEl.classList.toggle('is-portrait', video.orientation === 'portrait');
    if (videoEl.getAttribute('src') !== video.src) {
        videoEl.pause();
        videoEl.setAttribute('src', video.src);
        videoEl.load();
    }
}
function updateDetailStats(training) {
    const summary = computeProgramSummary(training.programKey);
    els.totalTime.textContent = formatSeconds(summary.totalSeconds);
    return summary;
}
function renderExerciseList() {
    const exercises = getProgramExercises(state.programKey);
    const schedule = buildSchedule(state.programKey);
    const perExerciseSeconds = schedule.reduce((acc, seg) => {
        acc[seg.exerciseName] = (acc[seg.exerciseName] || 0) + seg.duration;
        return acc;
    }, {});
    const cards = exercises.map(ex => {
        const totalSeconds = perExerciseSeconds[ex.name] || 0;
        const color = routineColors[ex.routine] || 'var(--stroke)';
        const tempo = hasTempo(ex)
            ? `Tempo ${ex.tempo.go}-${ex.tempo.pause}-${ex.tempo.return}-${ex.tempo.rest}`
            : null;
        const setsCount = ex.sets ?? 0;
        const volume = hasTempo(ex)
            ? `${setsCount} x ${ex.reps} repetições`
            : hasTime(ex)
                ? `${setsCount} x ${ex.time}s`
                : `${setsCount} séries`;
        const restLabel = ex.rest > 0 ? `Pausa: ${formatSeconds(ex.rest || 0)}` : '';
        return `
      <button class="exercise-card" type="button" data-exercise-card="${ex.name}" data-exercise-name="${ex.name}" style="--card-accent:${color}">
        <div class="meta">
          <span class="badge">${formatRoutineLabel(ex.routine)}</span>
          <span class="time">~${formatSeconds(totalSeconds)}</span>
        </div>
        <div class="name">${ex.name}</div>
        <div class="tempo">${volume}${tempo ? ` · ${tempo}` : ''}</div>
        ${restLabel ? `<div class="tempo">${restLabel}</div>` : ''}
        ${ex.group
            ? `<div class="badge">Grupo ${ex.group} · Descanso x${Number(ex.restMultiplier || 1).toFixed(2)}</div>`
            : ''}
      </button>
    `;
    });
    els.detailExerciseList.innerHTML = cards.join('');
}
function showExerciseDetails(exerciseName) {
    const exercise = getProgramExercises(state.programKey).find(ex => ex.name === exerciseName);
    if (!exercise)
        return;
    updateVideoBlocks(getSelectedTraining());
    els.exerciseDetailTitle.textContent = exercise.name;
    els.exerciseDetailMeta.textContent = formatExerciseMeta(exercise);
    const tips = exercise.tips?.length ? exercise.tips.map(tip => `• ${tip}`).join('\n') : NO_TIPS_MESSAGE;
    els.exerciseDetailTips.textContent = tips;
    showScreen('exercise');
}
function formatExerciseMeta(exercise) {
    const base = `${formatRoutineLabel(exercise.routine)} · ${exercise.sets} séries`;
    if (hasTempo(exercise)) {
        const tempo = `${exercise.tempo.go}-${exercise.tempo.pause}-${exercise.tempo.return}-${exercise.tempo.rest}`;
        return `${base} · ${exercise.reps} repetições · Tempo ${tempo}`;
    }
    if (hasTime(exercise)) {
        return `${base} · ${exercise.time}s`;
    }
    return base;
}
function loadHistory() {
    if (!('localStorage' in window))
        return [];
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter(isHistoryEntry);
    }
    catch {
        return [];
    }
}
function isHistoryEntry(value) {
    if (!value || typeof value !== 'object')
        return false;
    const entry = value;
    return (typeof entry.id === 'string' &&
        typeof entry.trainingId === 'string' &&
        typeof entry.trainingName === 'string' &&
        typeof entry.completedAt === 'string' &&
        typeof entry.durationSeconds === 'number' &&
        typeof entry.xpEarned === 'number');
}
function saveHistory(entries) {
    if (!('localStorage' in window))
        return;
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}
function getTotalXp(entries) {
    return entries.reduce((sum, entry) => sum + entry.xpEarned, 0);
}
function formatStreak(streak) {
    return `${streak} ${streak === 1 ? 'dia' : 'dias'}`;
}
function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getCurrentStreak(entries) {
    if (!entries.length)
        return 0;
    const completedDays = new Set();
    entries.forEach(entry => {
        const date = new Date(entry.completedAt);
        if (!Number.isNaN(date.getTime())) {
            completedDays.add(getDateKey(date));
        }
    });
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    let streak = 0;
    while (completedDays.has(getDateKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}
function recordCompletion() {
    const training = getSelectedTraining();
    const durationSeconds = Math.max(0, Math.round(state.sessionTotalMs / 1000));
    const xpEarned = Math.round(durationSeconds * training.difficulty * XP_RATE);
    const entry = {
        id: `session-${Date.now()}`,
        trainingId: training.id,
        trainingName: training.name,
        completedAt: new Date().toISOString(),
        durationSeconds,
        xpEarned
    };
    historyEntries = [entry, ...historyEntries];
    saveHistory(historyEntries);
    return entry;
}
function renderCompletion(entry) {
    latestCompletionEntry = entry;
    const totalXp = getTotalXp(historyEntries);
    const streak = getCurrentStreak(historyEntries);
    els.completeTrainingName.textContent = entry.trainingName;
    els.completeXpEarned.textContent = `${entry.xpEarned} XP`;
    els.completeTrainingTime.textContent = formatSeconds(entry.durationSeconds);
    els.completeStreak.textContent = formatStreak(streak);
    els.completeTotalXp.textContent = `${totalXp} XP`;
    els.completeShareTargets.hidden = true;
}
function renderHistory() {
    const totalXp = getTotalXp(historyEntries);
    const streak = getCurrentStreak(historyEntries);
    els.historyTotalXp.textContent = `${totalXp} XP`;
    els.historyStreak.textContent = formatStreak(streak);
    if (!historyEntries.length) {
        els.historyList.innerHTML = '<p class="muted small">Nenhum treino concluído ainda.</p>';
        return;
    }
    const items = historyEntries
        .map(entry => {
        const date = new Date(entry.completedAt);
        const dateLabel = date.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        return `
        <div class="history-item">
          <div class="title">${entry.trainingName}</div>
          <div class="meta">
            <span>${dateLabel}</span>
            <span>${formatSeconds(entry.durationSeconds)} · ${entry.xpEarned} XP</span>
          </div>
        </div>
      `;
    })
        .join('');
    els.historyList.innerHTML = items;
}
function cloneExercise(exercise) {
    if (hasTempo(exercise)) {
        return {
            ...exercise,
            tempo: { ...exercise.tempo }
        };
    }
    if (hasTime(exercise)) {
        return { ...exercise };
    }
    return exercise;
}
function getProgramDefinition(key) {
    if (key === 'test') {
        return { kind: 'intensive', groups: TEST_TRAINING_GROUPS };
    }
    return trainingPrograms[key];
}
function getProgramExercises(key) {
    const program = getProgramDefinition(key);
    if (program.kind === 'sequence') {
        const seen = new Set();
        return program.sequence
            .filter(ex => {
            if (seen.has(ex.name))
                return false;
            seen.add(ex.name);
            return true;
        })
            .map(ex => cloneExercise(ex));
    }
    return program.groups.flatMap((group) => group.exercises.map(ex => ({
        ...cloneExercise(ex),
        group: group.group
    })));
}
function computeProgramSummary(programKey) {
    const exercises = getProgramExercises(programKey);
    const schedule = buildSchedule(programKey);
    const totalSeconds = schedule.reduce((sum, seg) => sum + seg.duration, 0);
    const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0);
    const segmentCount = schedule.length;
    return { totalSeconds, totalSets, segmentCount, exercisesCount: exercises.length };
}
function createSetSegments(exercise, setNumber, includeSetRest = true) {
    const segs = [];
    if (hasTempo(exercise)) {
        const phases = [
            { key: 'go', duration: exercise.tempo.go || 0 },
            { key: 'pause', duration: exercise.tempo.pause || 0 },
            { key: 'return', duration: exercise.tempo.return || 0 },
            { key: 'rest', duration: exercise.tempo.rest || 0 }
        ];
        for (let rep = 1; rep <= (exercise.reps || 0); rep++) {
            phases.forEach(phase => {
                if (phase.duration <= 0)
                    return;
                segs.push({
                    exerciseName: exercise.name,
                    routine: exercise.routine,
                    set: setNumber,
                    totalSets: exercise.sets,
                    rep,
                    totalReps: exercise.reps,
                    phase: phase.key,
                    type: phase.key === 'rest' ? 'micro-rest' : 'movement',
                    duration: phase.duration,
                    group: exercise.group || null,
                    tempoParts: {
                        go: exercise.tempo.go || 0,
                        pause: exercise.tempo.pause || 0,
                        return: exercise.tempo.return || 0,
                        rest: exercise.tempo.rest || 0
                    }
                });
            });
        }
    }
    else if (hasTime(exercise) && exercise.time) {
        segs.push({
            exerciseName: exercise.name,
            routine: exercise.routine,
            set: setNumber,
            totalSets: exercise.sets,
            rep: null,
            totalReps: null,
            phase: 'hold',
            type: 'hold',
            duration: exercise.time,
            group: exercise.group || null,
            tempoParts: {
                hold: exercise.time || 0
            }
        });
    }
    if (includeSetRest && setNumber < (exercise.sets || 0) && exercise.rest > 0) {
        const restBetweenSets = typeof exercise.rest === 'number' ? exercise.rest : 0;
        segs.push({
            exerciseName: exercise.name,
            routine: exercise.routine,
            set: setNumber,
            totalSets: exercise.sets,
            rep: null,
            totalReps: null,
            phase: 'setRest',
            type: 'rest',
            duration: restBetweenSets,
            group: exercise.group || null,
            tempoParts: {
                setRest: restBetweenSets
            }
        });
    }
    return segs;
}
function createPrepSegment() {
    return {
        exerciseName: 'Prepare-se',
        routine: 'Cardio',
        set: 0,
        totalSets: 0,
        rep: null,
        totalReps: null,
        phase: 'prep',
        type: 'rest',
        duration: PREP_DELAY_SECONDS,
        group: null,
        tempoParts: {
            hold: PREP_DELAY_SECONDS
        }
    };
}
function buildSchedule(programKey) {
    const program = getProgramDefinition(programKey);
    if (program.kind === 'sequence') {
        return buildSequenceSchedule(program.sequence);
    }
    return buildIntensiveSchedule(program.groups);
}
function buildIntensiveSchedule(groups) {
    const schedule = [];
    const items = [];
    groups.forEach((group) => {
        const exercises = group.exercises;
        const maxSets = Math.max(...exercises.map(ex => ex.sets || 0));
        for (let round = 1; round <= maxSets; round++) {
            exercises.forEach(exercise => {
                if (round > (exercise.sets || 0))
                    return;
                items.push({ exercise, round });
            });
        }
    });
    items.forEach((item, idx) => {
        const segments = createSetSegments(item.exercise, item.round, true);
        schedule.push(...segments);
        const restBetweenSets = typeof item.exercise.rest === 'number' ? item.exercise.rest : 0;
        if (restBetweenSets <= 0)
            return;
        const hasNextExercise = idx < items.length - 1;
        const endsWithRest = segments[segments.length - 1]?.phase === 'setRest';
        if (hasNextExercise && !endsWithRest) {
            schedule.push({
                exerciseName: item.exercise.name,
                routine: item.exercise.routine,
                set: item.round,
                totalSets: item.exercise.sets,
                rep: null,
                totalReps: null,
                phase: 'setRest',
                type: 'rest',
                duration: restBetweenSets,
                group: item.exercise.group || null,
                tempoParts: {
                    setRest: restBetweenSets
                }
            });
        }
    });
    if (PREP_DELAY_SECONDS > 0)
        schedule.unshift(createPrepSegment());
    return schedule;
}
function createRestSegment(exercise, setNumber, restSeconds) {
    return {
        exerciseName: exercise.name,
        routine: exercise.routine,
        set: setNumber,
        totalSets: exercise.sets,
        rep: null,
        totalReps: null,
        phase: 'setRest',
        type: 'rest',
        duration: restSeconds,
        group: exercise.group || null,
        tempoParts: {
            setRest: restSeconds
        }
    };
}
function buildSequenceSchedule(sequence) {
    const schedule = [];
    const totalsByName = sequence.reduce((acc, exercise) => {
        acc[exercise.name] = (acc[exercise.name] ?? 0) + 1;
        return acc;
    }, {});
    const occurrenceByName = {};
    sequence.forEach((exercise, index) => {
        occurrenceByName[exercise.name] = (occurrenceByName[exercise.name] ?? 0) + 1;
        const setNumber = occurrenceByName[exercise.name];
        const totalSets = totalsByName[exercise.name] || exercise.sets || 1;
        const resolved = totalSets !== exercise.sets ? { ...exercise, sets: totalSets } : exercise;
        const segments = createSetSegments(resolved, setNumber, false);
        schedule.push(...segments);
        const restAfter = typeof resolved.rest === 'number' ? resolved.rest : 0;
        const hasNext = index < sequence.length - 1;
        if (hasNext && restAfter > 0) {
            schedule.push(createRestSegment(resolved, setNumber, restAfter));
        }
    });
    if (PREP_DELAY_SECONDS > 0)
        schedule.unshift(createPrepSegment());
    return schedule;
}
function startSession() {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.schedule = buildSchedule(state.programKey);
    state.pointer = 0;
    state.completedMs = 0;
    state.lastCountdownSecond = null;
    const sessionTotalSeconds = state.schedule.reduce((sum, seg) => sum + seg.duration, 0);
    state.sessionTotalMs = sessionTotalSeconds * 1000;
    if (!state.schedule.length) {
        els.currentRemaining.textContent = '--';
        state.status = 'idle';
        updateStatusChip();
        return;
    }
    state.status = 'running';
    updateStatusChip();
    els.start.textContent = 'Resetar';
    els.pause.textContent = 'Pausar';
    els.pause.disabled = false;
    els.sessionRemaining.textContent = formatSeconds(Math.ceil(state.sessionTotalMs / 1000));
    setPlayerActive(true);
    startMusic();
    startSegment(state.schedule[state.pointer]);
}
function pauseSession() {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.status = 'paused';
    updateStatusChip();
    els.pause.textContent = 'Retomar';
    pauseMusic();
}
function resumeSession() {
    if (!state.schedule.length)
        return;
    state.status = 'running';
    updateStatusChip();
    els.pause.textContent = 'Pausar';
    resumeMusic();
    const elapsedBeforePause = state.segmentDurationMs - state.remainingMs;
    state.segmentStartedAt = performance.now() - elapsedBeforePause;
    state.lastCountdownSecond = null;
    const current = currentSegment();
    if (current) {
        playCueTone(current);
        updatePlayerUI();
        state.animationId = requestAnimationFrame(tick);
    }
}
function resetSession(updateChip = true) {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.status = 'idle';
    state.schedule = [];
    state.pointer = 0;
    state.completedMs = 0;
    state.sessionTotalMs = 0;
    state.segmentDurationMs = 0;
    state.remainingMs = 0;
    els.start.textContent = 'Iniciar';
    els.pause.textContent = 'Pausar';
    els.pause.disabled = true;
    els.currentTitle.textContent = 'Pronto para começar';
    els.currentDetail.textContent = 'Toque em iniciar para começar o treino.';
    els.currentRemaining.textContent = '--';
    setPhasePill(null);
    els.progressBar.style.width = '0%';
    els.segmentProgressBar.style.width = '0%';
    els.segmentProgressWrap.hidden = true;
    els.phaseBlocks.hidden = true;
    const summary = computeProgramSummary(state.programKey);
    els.sessionRemaining.textContent = formatSeconds(summary.totalSeconds);
    if (updateChip)
        updateStatusChip();
    clearActiveCards();
    setPlayerActive(false);
    pauseMusic(true);
}
function openTrainingConfirm(action) {
    if (state.status === 'running') {
        pauseSession();
    }
    pendingConfirmAction = action;
    els.confirmMessage.textContent = EXIT_TRAINING_MESSAGE;
    els.confirmOverlay.hidden = false;
}
function closeTrainingConfirm() {
    pendingConfirmAction = null;
    els.confirmOverlay.hidden = true;
}
function handleTrainingConfirm() {
    const action = pendingConfirmAction;
    closeTrainingConfirm();
    if (!action)
        return;
    if (action === 'leave') {
        resetSession();
        showScreen('details');
        return;
    }
    resetSession();
}
function setPlayerActive(isActive) {
    els.playerMain.hidden = !isActive;
    els.playerPlaceholder.hidden = isActive;
}
function startSegment(segment) {
    state.segmentDurationMs = segment.duration * 1000;
    state.remainingMs = state.segmentDurationMs;
    state.segmentStartedAt = performance.now();
    state.lastCountdownSecond = null;
    playCueTone(segment);
    els.segmentProgressBar.style.width = '0%';
    updatePlayerUI();
    tick();
}
function tick(now) {
    if (state.status !== 'running')
        return;
    if (!now) {
        state.animationId = requestAnimationFrame(tick);
        return;
    }
    const elapsed = now - state.segmentStartedAt;
    state.remainingMs = Math.max(0, state.segmentDurationMs - elapsed);
    updatePlayerUI();
    handleCountdownBeep();
    if (state.remainingMs <= 0) {
        advanceSegment();
        return;
    }
    state.animationId = requestAnimationFrame(tick);
}
function advanceSegment() {
    state.completedMs += state.segmentDurationMs;
    state.pointer += 1;
    if (state.pointer >= state.schedule.length) {
        finishSession();
        return;
    }
    const next = state.schedule[state.pointer];
    startSegment(next);
}
function finishSession() {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.status = 'done';
    updateStatusChip();
    els.pause.disabled = true;
    els.currentRemaining.textContent = '00:00';
    els.sessionRemaining.textContent = formatSeconds(0);
    els.progressBar.style.width = '100%';
    els.segmentProgressBar.style.width = '100%';
    setPhasePill(null, { label: 'Concluído', tone: 0 });
    playTone(1020, 0.25);
    pauseMusic(true);
    const entry = recordCompletion();
    renderCompletion(entry);
    renderHistory();
    showScreen('complete');
}
function currentSegment() {
    return state.schedule[state.pointer];
}
function updatePlayerUI() {
    const segment = currentSegment();
    const remainingSec = Math.max(0, Math.ceil(state.remainingMs / 1000));
    els.currentRemaining.textContent = remainingSec ? formatSeconds(remainingSec) : '00:00';
    if (!segment) {
        els.segmentProgressBar.style.width = '0%';
        els.phaseBlocks.innerHTML = '';
        els.segmentProgressWrap.hidden = true;
        els.phaseBlocks.hidden = true;
        return;
    }
    const phase = phaseMeta[segment.phase] ?? { label: segment.phase, tone: 0 };
    const repText = segment.totalReps && segment.totalReps > 1 && segment.rep
        ? `Repetição ${segment.rep}/${segment.totalReps}`
        : '';
    const setText = segment.totalSets && segment.totalSets > 1 ? `Série ${segment.set}/${segment.totalSets}` : '';
    const setRep = [setText, repText].filter(Boolean).join(' · ');
    els.currentTitle.textContent = `${segment.exerciseName}`;
    els.currentDetail.textContent = setRep || '';
    setPhasePill(segment, phase);
    renderPhaseBlocks(segment);
    const remainingSessionMs = (state.sessionTotalMs || 0) - (state.completedMs + (state.segmentDurationMs - state.remainingMs));
    els.sessionRemaining.textContent = formatSeconds(Math.max(0, Math.ceil(remainingSessionMs / 1000)));
    const progress = ((state.completedMs + (state.segmentDurationMs - state.remainingMs)) / (state.sessionTotalMs || 1)) * 100;
    els.progressBar.style.width = `${Math.min(100, progress)}%`;
    const segmentProgress = ((state.segmentDurationMs - state.remainingMs) / (state.segmentDurationMs || 1)) * 100;
    els.segmentProgressBar.style.width = `${Math.min(100, segmentProgress)}%`;
    const showRestProgress = segment.type === 'rest';
    els.segmentProgressWrap.hidden = !showRestProgress;
    els.phaseBlocks.hidden = showRestProgress;
    highlightActiveCard(segment.exerciseName);
    renderNextDuringRest();
}
function formatSeconds(totalSeconds) {
    const secs = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function setPhasePill(segment, phase) {
    const pill = els.phasePill;
    pill.className = 'phase-pill';
    if (!segment) {
        pill.textContent = phase?.label ?? 'Pronto';
        if (phase)
            pill.classList.add('rest');
        return;
    }
    const typeLabel = segment.type;
    const typeClass = typeLabel.includes('rest')
        ? 'rest'
        : typeLabel === 'hold'
            ? 'hold'
            : 'movement';
    pill.classList.add(typeClass);
    pill.textContent = phase?.label || segment.phase || 'Etapa';
}
function findRepRange(pointer) {
    const seg = state.schedule[pointer];
    if (!seg)
        return { start: pointer, end: pointer };
    let start = pointer;
    while (start - 1 >= 0) {
        const prev = state.schedule[start - 1];
        if (prev.exerciseName === seg.exerciseName &&
            prev.set === seg.set &&
            prev.rep === seg.rep) {
            start--;
        }
        else
            break;
    }
    let end = pointer;
    while (end + 1 < state.schedule.length) {
        const next = state.schedule[end + 1];
        if (next.exerciseName === seg.exerciseName &&
            next.set === seg.set &&
            next.rep === seg.rep) {
            end++;
        }
        else
            break;
    }
    return { start, end };
}
function renderPhaseBlocks(segment) {
    const tempoParts = segment.tempoParts || {};
    const order = ['go', 'pause', 'return', 'rest', 'hold', 'setRest'];
    const colorMap = {
        go: 'var(--accent)',
        pause: 'var(--accent-2)',
        return: '#8be0ff',
        rest: 'rgba(255,255,255,0.3)',
        setRest: 'rgba(255,255,255,0.3)',
        hold: 'var(--accent)',
        prep: 'rgba(255,255,255,0.3)'
    };
    let unitCounter = 0;
    const blocks = [];
    order.forEach(key => {
        const duration = Math.round(tempoParts[key] || 0);
        if (duration <= 0)
            return;
        for (let i = 0; i < duration; i++) {
            blocks.push({
                phase: key,
                color: colorMap[key] || 'var(--accent)',
                unitIndex: unitCounter
            });
            unitCounter++;
        }
    });
    if (!blocks.length) {
        els.phaseBlocks.innerHTML = '<span class="phase-block empty"></span>';
        return;
    }
    const { start } = findRepRange(state.pointer);
    let elapsedBeforeCurrent = 0;
    for (let i = start; i < state.pointer; i++) {
        elapsedBeforeCurrent += (state.schedule[i].duration || 0);
    }
    const currentElapsed = (state.segmentDurationMs - state.remainingMs) / 1000;
    const repElapsed = elapsedBeforeCurrent + currentElapsed;
    const unitIndex = Math.max(0, Math.min(unitCounter - 1, Math.floor(repElapsed)));
    const currentBlockIndex = blocks.findIndex(b => b.unitIndex === unitIndex);
    const html = blocks
        .map((block, idx) => {
        const cls = ['phase-block'];
        if (idx === currentBlockIndex)
            cls.push('current');
        const style = block.color ? `style="background:${block.color}"` : '';
        return `<span class="${cls.join(' ')}" ${style}></span>`;
    })
        .join('');
    els.phaseBlocks.innerHTML = html;
}
function updateStatusChip() {
    els.statusChip.classList.remove('is-paused', 'is-running', 'is-idle');
    if (state.status === 'running') {
        els.statusChip.classList.add('is-running');
        els.statusChip.setAttribute('aria-label', 'Em andamento');
    }
    else if (state.status === 'paused') {
        els.statusChip.classList.add('is-paused');
        els.statusChip.setAttribute('aria-label', 'Pausado');
    }
    else if (state.status === 'done') {
        els.statusChip.classList.add('is-idle');
        els.statusChip.setAttribute('aria-label', 'Concluído');
    }
    else {
        els.statusChip.classList.add('is-idle');
        els.statusChip.setAttribute('aria-label', 'Pronto');
    }
    updateButtons();
}
function updateButtons() {
    if (state.status === 'running') {
        setButtonStyle(els.pause, { primary: true });
        setButtonStyle(els.start, { primary: false });
    }
    else if (state.status === 'paused') {
        setButtonStyle(els.pause, { primary: true });
        setButtonStyle(els.start, { primary: false });
    }
    else {
        setButtonStyle(els.pause, { primary: false });
        setButtonStyle(els.start, { primary: true });
    }
}
function highlightActiveCard(name) {
    clearActiveCards();
    if (!name)
        return;
    const card = els.detailExerciseList.querySelector(`[data-exercise-card="${name}"]`);
    if (card)
        card.classList.add('is-live');
}
function clearActiveCards() {
    els.detailExerciseList.querySelectorAll('.exercise-card.is-live').forEach(card => card.classList.remove('is-live'));
}
function renderNextDuringRest() {
    const current = currentSegment();
    if (!current || (current.phase !== 'setRest' && current.phase !== 'prep'))
        return;
    const next = state.schedule[state.pointer + 1];
    if (!next)
        return;
    const nextPhase = phaseMeta[next.phase] ?? { label: next.phase, tone: 0 };
    const nextSetRep = [
        next.totalSets && next.totalSets > 1 ? `Série ${next.set}/${next.totalSets}` : '',
        next.totalReps && next.totalReps > 1 && next.rep
            ? `Repetição ${next.rep}/${next.totalReps}`
            : ''
    ]
        .filter(Boolean)
        .join(' · ');
    els.currentTitle.textContent = `Próximo: ${next.exerciseName}`;
    els.currentDetail.textContent = [nextPhase.label, nextSetRep].filter(Boolean).join(' • ');
}
function buildShareCardStats(entry) {
    return {
        trainingName: entry.trainingName,
        xpEarned: entry.xpEarned,
        sessionTime: formatSeconds(entry.durationSeconds),
        streak: getCurrentStreak(historyEntries),
        totalXp: getTotalXp(historyEntries)
    };
}
function buildShareMessage(stats) {
    return [
        `NoSkip | ${stats.trainingName}`,
        `XP: ${stats.xpEarned}`,
        `Tempo: ${stats.sessionTime}`,
        `Streak: ${formatStreak(stats.streak)}`,
        `Total XP: ${stats.totalXp}`
    ].join(' · ');
}
async function shareCompletion(target) {
    const entry = latestCompletionEntry;
    if (!entry)
        return;
    try {
        const stats = buildShareCardStats(entry);
        const message = buildShareMessage(stats);
        const blob = await createShareCardBlob(stats);
        const filename = `noskip-${Date.now()}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        const shared = await shareNatively(file, message);
        if (!shared) {
            downloadBlob(blob, filename);
            openShareFallback(target, message);
        }
    }
    catch {
        // silent failure keeps UI responsive even when share APIs are unavailable
    }
    finally {
        els.completeShareTargets.hidden = true;
    }
}
async function shareNatively(file, message) {
    const nav = navigator;
    if (!nav.share)
        return false;
    try {
        const supportsFiles = typeof nav.canShare === 'function' ? nav.canShare({ files: [file] }) : false;
        if (supportsFiles) {
            await nav.share({
                title: 'NoSkip',
                text: message,
                files: [file]
            });
            return true;
        }
        await nav.share({ title: 'NoSkip', text: message });
        return true;
    }
    catch {
        return false;
    }
}
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
function openShareFallback(target, message) {
    if (navigator.clipboard) {
        void navigator.clipboard.writeText(message).catch(() => undefined);
    }
    if (target === 'x') {
        const url = `https://x.com/intent/tweet?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener');
        return;
    }
    window.open('https://www.instagram.com/', '_blank', 'noopener');
}
async function createShareCardBlob(stats) {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context unavailable.');
    }
    drawShareCard(ctx, stats, canvas.width, canvas.height);
    return canvasToBlob(canvas);
}
function drawShareCard(ctx, stats, width, height) {
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#090f1d');
    background.addColorStop(1, '#101c33');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    const glowA = ctx.createRadialGradient(width * 0.1, height * 0.12, 10, width * 0.1, height * 0.12, width * 0.62);
    glowA.addColorStop(0, 'rgba(14, 222, 196, 0.34)');
    glowA.addColorStop(1, 'rgba(14, 222, 196, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, width, height);
    const glowB = ctx.createRadialGradient(width * 0.84, height * 0.06, 10, width * 0.84, height * 0.06, width * 0.5);
    glowB.addColorStop(0, 'rgba(255, 140, 66, 0.34)');
    glowB.addColorStop(1, 'rgba(255, 140, 66, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, width, height);
    const panelX = 62;
    const panelY = 62;
    const panelWidth = width - panelX * 2;
    const panelHeight = height - panelY * 2;
    drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 40);
    ctx.fillStyle = 'rgba(8, 15, 30, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#9bc0e3';
    ctx.font = '700 30px "Space Grotesk", "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('RESULTADO NO SKIP', panelX + 52, panelY + 92);
    ctx.fillStyle = '#f4f8ff';
    ctx.font = '800 58px "Space Grotesk", "DM Sans", sans-serif';
    const textY = drawWrappedText(ctx, stats.trainingName, panelX + 52, panelY + 158, panelWidth - 104, 68, 2);
    const cardWidth = (panelWidth - 124) / 2;
    const cardHeight = 166;
    const cardTop = textY + 42;
    const left = panelX + 52;
    const right = left + cardWidth + 20;
    drawStatCard(ctx, {
        x: left,
        y: cardTop,
        width: cardWidth,
        height: cardHeight,
        label: 'XP',
        value: `${stats.xpEarned}`,
        accent: '#3fa9f5',
        fill: 'rgba(63, 169, 245, 0.15)'
    });
    drawStatCard(ctx, {
        x: right,
        y: cardTop,
        width: cardWidth,
        height: cardHeight,
        label: 'TEMPO',
        value: stats.sessionTime,
        accent: '#6dd6ff',
        fill: 'rgba(109, 214, 255, 0.15)'
    });
    drawStatCard(ctx, {
        x: left,
        y: cardTop + cardHeight + 20,
        width: cardWidth,
        height: cardHeight,
        label: 'STREAK',
        value: formatStreak(stats.streak),
        accent: '#ff9a4d',
        fill: 'rgba(255, 154, 77, 0.18)'
    });
    drawStatCard(ctx, {
        x: right,
        y: cardTop + cardHeight + 20,
        width: cardWidth,
        height: cardHeight,
        label: 'TOTAL XP',
        value: `${stats.totalXp}`,
        accent: '#ffe08f',
        fill: 'rgba(255, 224, 143, 0.16)'
    });
    drawNoSkipLogo(ctx, width / 2, panelY + panelHeight - 104);
}
function drawStatCard(ctx, opts) {
    drawRoundedRect(ctx, opts.x, opts.y, opts.width, opts.height, 24);
    ctx.fillStyle = opts.fill;
    ctx.fill();
    ctx.strokeStyle = opts.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = opts.accent;
    ctx.font = '700 24px "Space Grotesk", "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.label, opts.x + 24, opts.y + 50);
    ctx.fillStyle = '#f5fbff';
    ctx.font = '800 44px "Space Grotesk", "DM Sans", sans-serif';
    ctx.fillText(opts.value, opts.x + 24, opts.y + 118);
}
function drawNoSkipLogo(ctx, centerX, baselineY) {
    ctx.save();
    ctx.translate(centerX, baselineY);
    ctx.textAlign = 'center';
    drawRoundedRect(ctx, -190, -56, 380, 94, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-140, 2);
    ctx.lineTo(-100, -20);
    ctx.lineTo(-62, 2);
    ctx.strokeStyle = '#0edec4';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.fillStyle = '#f2f8ff';
    ctx.font = '800 42px "Space Grotesk", "DM Sans", sans-serif';
    ctx.fillText('NoSkip', 42, 14);
    ctx.restore();
}
function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length)
        return y;
    let line = '';
    let renderedLines = 0;
    let drawY = y;
    for (let idx = 0; idx < words.length; idx++) {
        const word = words[idx];
        const candidate = line ? `${line} ${word}` : word;
        const width = ctx.measureText(candidate).width;
        if (width <= maxWidth || !line) {
            line = candidate;
            continue;
        }
        ctx.fillText(line, x, drawY);
        renderedLines += 1;
        drawY += lineHeight;
        line = word;
        if (renderedLines >= maxLines - 1)
            break;
    }
    if (renderedLines < maxLines && line) {
        let finalLine = line;
        if (ctx.measureText(finalLine).width > maxWidth) {
            while (finalLine.length > 1 && ctx.measureText(`${finalLine}…`).width > maxWidth) {
                finalLine = finalLine.slice(0, -1);
            }
            finalLine = `${finalLine}…`;
        }
        ctx.fillText(finalLine, x, drawY);
        renderedLines += 1;
    }
    return y + renderedLines * lineHeight;
}
function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Failed to create PNG blob.'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
}
function ensureAudio() {
    if (!state.audioCtx) {
        const AudioCtor = window.AudioContext ||
            window.webkitAudioContext;
        if (!AudioCtor)
            return;
        state.audioCtx = new AudioCtor();
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }
}
function pulsePing() {
    // removed visual ping
}
function playTone(frequency, duration = 0.12, volume = METRONOME_VOLUME) {
    ensureAudio();
    pulsePing();
    if (!state.audioCtx)
        return;
    const ctx = state.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}
function playCueTone(segment) {
    const meta = phaseMeta[segment.phase];
    if (!meta) {
        playTone(620);
        return;
    }
    if (meta.tone > 0) {
        playTone(meta.tone);
    }
}
function handleCountdownBeep() {
    const remainingSec = Math.ceil(state.remainingMs / 1000);
    if (remainingSec <= 3 && remainingSec !== state.lastCountdownSecond) {
        state.lastCountdownSecond = remainingSec;
        playTone(remainingSec === 1 ? 980 : 620, 0.08, METRONOME_VOLUME);
    }
}
function ensureMusicPlayer() {
    if (!MUSIC_TRACKS.length)
        return null;
    if (!musicPlayer) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = MUSIC_VOLUME;
        audio.addEventListener('ended', () => {
            if (state.status === 'running') {
                playRandomTrack();
            }
        });
        musicPlayer = audio;
    }
    return musicPlayer;
}
function pickRandomTrack() {
    if (!MUSIC_TRACKS.length)
        return null;
    let idx = Math.floor(Math.random() * MUSIC_TRACKS.length);
    if (MUSIC_TRACKS.length > 1 && idx === lastMusicIndex) {
        idx = (idx + 1) % MUSIC_TRACKS.length;
    }
    lastMusicIndex = idx;
    return MUSIC_TRACKS[idx];
}
function playRandomTrack() {
    const audio = ensureMusicPlayer();
    const track = pickRandomTrack();
    if (!audio || !track)
        return;
    audio.src = track;
    audio.currentTime = 0;
    audio.muted = state.musicMuted;
    if (!state.musicMuted) {
        void audio.play().catch(() => undefined);
    }
}
function startMusic() {
    const audio = ensureMusicPlayer();
    if (!audio)
        return;
    playRandomTrack();
}
function pauseMusic(reset = false) {
    if (!musicPlayer)
        return;
    musicPlayer.pause();
    if (reset) {
        musicPlayer.currentTime = 0;
    }
}
function resumeMusic() {
    if (!musicPlayer || state.musicMuted)
        return;
    void musicPlayer.play().catch(() => undefined);
}
function updateMusicToggle() {
    els.musicToggle.classList.toggle('is-muted', state.musicMuted);
    els.musicToggle.setAttribute('aria-pressed', String(state.musicMuted));
}
function setMusicMuted(muted) {
    state.musicMuted = muted;
    if (musicPlayer) {
        musicPlayer.muted = muted;
    }
    if (!muted && state.status === 'running') {
        resumeMusic();
    }
    updateMusicToggle();
}
