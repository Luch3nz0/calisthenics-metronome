import { trainingPrograms } from './exercises.js';
const TRAININGS = [
    {
        id: 'default-training',
        name: 'Calistenia corpo inteiro (1h)',
        description: 'Barra fixa, barra com anilhas e colchonete.',
        programKey: 'intensive',
        difficulty: 1
    },
    {
        id: 'home-training',
        name: 'Treino em casa',
        description: '45s de exercício · 15s de pausa · sem equipamento.',
        programKey: 'home',
        difficulty: 1
    },
    {
        id: 'core-training',
        name: 'Abdômen 8 min',
        description: '60s por exercício · sem pausa.',
        programKey: 'core',
        difficulty: 1
    },
    {
        id: 'stretch-training',
        name: 'Alongamento',
        description: '30s por exercício · sem pausa.',
        programKey: 'stretch',
        difficulty: 1
    },
    {
        id: 'flash-training',
        name: 'Treino iniciante flash',
        description: '10 movimentos de 60s + aquecimento · pausa de 2s.',
        programKey: 'flash',
        difficulty: 1
    },
    {
        id: 'test-training-easy',
        name: 'Treino teste curto (fácil)',
        description: 'Sequência curta para validar telas · XP x1.',
        programKey: 'test',
        difficulty: 1
    },
    {
        id: 'test-training-medium',
        name: 'Treino teste curto (intermediário)',
        description: 'Sequência curta para validar telas · XP x2.',
        programKey: 'test',
        difficulty: 2
    },
    {
        id: 'test-training-hard',
        name: 'Treino teste curto (difícil)',
        description: 'Sequência curta para validar telas · XP x3.',
        programKey: 'test',
        difficulty: 3
    }
];
const HISTORY_STORAGE_KEY = 'calisthenics-history';
const XP_RATE = 1;
const PREP_DELAY_SECONDS = 5;
const NO_TIPS_MESSAGE = 'Sem dicas adicionais para este exercício.';
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
    segmentStartedAt: 0
};
let historyEntries = [];
function byId(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Element not found: ${id}`);
    return el;
}
const els = {
    screens: Array.from(document.querySelectorAll('[data-screen]')),
    trainingList: byId('training-list'),
    historyShortcut: byId('history-shortcut'),
    selectHistory: byId('select-history-btn'),
    detailTrainingName: byId('detail-training-name'),
    detailTrainingDesc: byId('detail-training-desc'),
    totalTime: byId('total-time'),
    segmentCount: byId('segment-count'),
    totalSets: byId('total-sets'),
    totalExercises: byId('total-exercises'),
    detailExerciseList: byId('detail-exercise-list'),
    detailBack: byId('detail-back-btn'),
    detailStart: byId('detail-start-btn'),
    exerciseDetailTitle: byId('exercise-detail-title'),
    exerciseDetailMeta: byId('exercise-detail-meta'),
    exerciseDetailTips: byId('exercise-detail-tips'),
    exerciseBack: byId('exercise-back-btn'),
    playerTrainingName: byId('player-training-name'),
    playerTrainingDesc: byId('player-training-desc'),
    start: byId('start-btn'),
    pause: byId('pause-btn'),
    reset: byId('reset-btn'),
    statusChip: byId('status-chip'),
    currentTitle: byId('current-title'),
    currentDetail: byId('current-detail'),
    currentRemaining: byId('current-remaining'),
    phasePill: byId('phase-pill'),
    phaseLabel: byId('phase-label'),
    segmentProgress: byId('segment-progress-bar'),
    phaseBlocks: byId('phase-blocks'),
    progressBar: byId('progress-bar'),
    sessionRemaining: byId('session-remaining'),
    playerPlaceholder: byId('player-placeholder'),
    playerMain: byId('player-main'),
    completeCount: byId('complete-count'),
    completeXpEarned: byId('complete-xp-earned'),
    completeTotalXp: byId('complete-total-xp'),
    completeTrainingName: byId('complete-training-name'),
    completeToSelection: byId('complete-to-selection'),
    completeToHistory: byId('complete-to-history'),
    historyList: byId('history-list'),
    historyTotalXp: byId('history-total-xp'),
    historyBack: byId('history-back-btn'),
    metronomeBack: byId('metronome-back-btn')
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
    els.selectHistory.addEventListener('click', () => {
        renderHistory();
        showScreen('history');
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
        resetSession();
        showScreen('details');
    });
    els.historyShortcut.addEventListener('click', () => {
        renderHistory();
        showScreen('history');
    });
    els.historyBack.addEventListener('click', () => {
        showScreen('select');
    });
    els.completeToSelection.addEventListener('click', () => {
        resetSession();
        showScreen('select');
    });
    els.completeToHistory.addEventListener('click', () => {
        renderHistory();
        showScreen('history');
    });
    els.start.addEventListener('click', () => {
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
    els.reset.addEventListener('click', () => resetSession());
    if (TRAININGS.length) {
        selectTraining(TRAININGS[0].id);
    }
    renderHistory();
    updateHistoryShortcut();
    showScreen('select');
}
function showScreen(screen) {
    els.screens.forEach(panel => {
        panel.hidden = panel.dataset.screen !== screen;
    });
}
function setButtonStyle(btn, { primary }) {
    if (!btn)
        return;
    btn.classList.toggle('primary', primary);
    btn.classList.toggle('ghost', !primary);
}
function updateHistoryShortcut() {
    const hasHistory = historyEntries.length > 0;
    els.historyShortcut.hidden = !hasHistory;
    els.selectHistory.hidden = !hasHistory;
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
        const desc = training.description.trim();
        return `
      <button class="training-card ${active}" type="button" data-training-id="${training.id}">
        <div>
          <p class="eyebrow">Treino</p>
          <h3>${training.name}</h3>
          ${desc ? `<p class="muted small">${desc}</p>` : ''}
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
    els.detailTrainingDesc.textContent = training.description;
    els.detailTrainingDesc.hidden = training.description.trim().length === 0;
    els.playerTrainingName.textContent = training.name;
    els.playerTrainingDesc.textContent = training.description;
    els.playerTrainingDesc.hidden = training.description.trim().length === 0;
    els.sessionRemaining.textContent = `Total: ${formatSeconds(summary.totalSeconds)}`;
    renderExerciseList();
}
function updateDetailStats(training) {
    const summary = computeProgramSummary(training.programKey);
    els.totalTime.textContent = formatSeconds(summary.totalSeconds);
    els.totalSets.textContent = String(summary.totalSets);
    els.totalExercises.textContent = String(summary.exercisesCount);
    els.segmentCount.textContent = String(summary.segmentCount);
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
    updateHistoryShortcut();
    return entry;
}
function renderCompletion(entry) {
    const totalXp = getTotalXp(historyEntries);
    els.completeTrainingName.textContent = entry.trainingName;
    els.completeCount.textContent = String(historyEntries.length);
    els.completeXpEarned.textContent = `${entry.xpEarned} XP`;
    els.completeTotalXp.textContent = `${totalXp} XP`;
}
function renderHistory() {
    if (!historyEntries.length) {
        els.historyList.innerHTML = '<p class="muted small">Nenhum treino concluído ainda.</p>';
        els.historyTotalXp.textContent = '0 XP';
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
    els.historyTotalXp.textContent = `${getTotalXp(historyEntries)} XP`;
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
    els.start.textContent = 'Reiniciar';
    els.pause.textContent = 'Pausar';
    els.pause.disabled = false;
    els.reset.disabled = false;
    els.sessionRemaining.textContent = `Tempo restante: ${formatSeconds(Math.ceil(state.sessionTotalMs / 1000))}`;
    setPlayerActive(true);
    startSegment(state.schedule[state.pointer]);
}
function pauseSession() {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.status = 'paused';
    updateStatusChip();
    els.pause.textContent = 'Retomar';
}
function resumeSession() {
    if (!state.schedule.length)
        return;
    state.status = 'running';
    updateStatusChip();
    els.pause.textContent = 'Pausar';
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
    els.reset.disabled = true;
    els.currentTitle.textContent = 'Pronto para começar';
    els.currentDetail.textContent = 'Toque em iniciar para começar o treino.';
    els.currentRemaining.textContent = '--';
    els.phaseLabel.textContent = 'Pronto';
    setPhasePill(null);
    els.progressBar.style.width = '0%';
    if (els.segmentProgress)
        els.segmentProgress.style.width = '0%';
    const summary = computeProgramSummary(state.programKey);
    els.sessionRemaining.textContent = `Total: ${formatSeconds(summary.totalSeconds)}`;
    if (updateChip)
        updateStatusChip();
    clearActiveCards();
    setPlayerActive(false);
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
    if (els.segmentProgress)
        els.segmentProgress.style.width = '0%';
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
    els.sessionRemaining.textContent = 'Concluído';
    els.progressBar.style.width = '100%';
    if (els.segmentProgress)
        els.segmentProgress.style.width = '100%';
    setPhasePill(null, { label: 'Concluído', tone: 0 });
    playTone(1020, 0.25);
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
        if (els.segmentProgress)
            els.segmentProgress.style.width = '0%';
        if (els.phaseBlocks)
            els.phaseBlocks.innerHTML = '';
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
    els.phaseLabel.textContent = phase.label || '';
    setPhasePill(segment, phase);
    renderPhaseBlocks(segment);
    const remainingSessionMs = (state.sessionTotalMs || 0) - (state.completedMs + (state.segmentDurationMs - state.remainingMs));
    els.sessionRemaining.textContent = `Tempo restante: ${formatSeconds(Math.max(0, Math.ceil(remainingSessionMs / 1000)))}`;
    const progress = ((state.completedMs + (state.segmentDurationMs - state.remainingMs)) / (state.sessionTotalMs || 1)) * 100;
    els.progressBar.style.width = `${Math.min(100, progress)}%`;
    const segmentProgress = ((state.segmentDurationMs - state.remainingMs) / (state.segmentDurationMs || 1)) * 100;
    if (els.segmentProgress) {
        els.segmentProgress.style.width = `${Math.min(100, segmentProgress)}%`;
    }
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
    els.statusChip.classList.remove('paused', 'done', 'live');
    if (state.status === 'running') {
        els.statusChip.textContent = 'Em andamento';
        els.statusChip.classList.add('live');
    }
    else if (state.status === 'paused') {
        els.statusChip.textContent = 'Pausado';
        els.statusChip.classList.add('paused');
    }
    else if (state.status === 'done') {
        els.statusChip.textContent = 'Concluído';
        els.statusChip.classList.add('done');
    }
    else {
        els.statusChip.textContent = 'Pronto';
        els.statusChip.classList.add('live');
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
function playTone(frequency, duration = 0.12, volume = 0.14) {
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
        playTone(remainingSec === 1 ? 980 : 620, 0.08, 0.12);
    }
}
