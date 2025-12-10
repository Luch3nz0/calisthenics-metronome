import { trainingPrograms } from './exercises.js';
const state = {
    programKey: 'normal',
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
function byId(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Element not found: ${id}`);
    return el;
}
const programButtons = Array.from(document.querySelectorAll('[data-program]'));
const els = {
    programButtons,
    programLabel: byId('program-label'),
    totalTime: byId('total-time'),
    totalSets: byId('total-sets'),
    totalExercises: byId('total-exercises'),
    sessionLength: byId('session-length'),
    segmentCount: byId('segment-count'),
    normalTime: byId('normal-time'),
    intensiveTime: byId('intensive-time'),
    start: byId('start-btn'),
    pause: byId('pause-btn'),
    reset: byId('reset-btn'),
    exerciseList: byId('exercise-list'),
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
    setupPanel: byId('setup-panel'),
    playerPanel: byId('player-panel'),
    sequenceBar: byId('sequence-bar')
};
const phaseMeta = {
    go: { label: 'Go', tone: 880 },
    pause: { label: 'Pause', tone: 720 },
    return: { label: 'Return', tone: 900 },
    rest: { label: 'Rest', tone: 520 },
    hold: { label: 'Hold', tone: 760 },
    setRest: { label: 'Rest', tone: 460 }
};
const routineColors = {
    'Push-Up': getComputedStyle(document.documentElement).getPropertyValue('--push') || '#f4a261',
    'Pull-Up': getComputedStyle(document.documentElement).getPropertyValue('--pull') || '#3fa9f5',
    Squat: getComputedStyle(document.documentElement).getPropertyValue('--squat') || '#7ddf89'
};
function hasTempo(exercise) {
    return 'tempo' in exercise;
}
function hasTime(exercise) {
    return 'time' in exercise;
}
init();
/**
 * Wire up UI events and render initial view.
 */
function init() {
    els.programButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const program = btn.dataset.program === 'intensive' ? 'intensive' : 'normal';
            selectProgram(program);
        });
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
    selectProgram('normal');
    renderPreview();
}
/**
 * @param {boolean} isSession
 */
function setSessionMode(isSession) {
    document.body.classList.toggle('session-mode', isSession);
}
function setButtonStyle(btn, { primary }) {
    if (!btn)
        return;
    btn.classList.toggle('primary', primary);
    btn.classList.toggle('ghost', !primary);
}
/**
 * Render colored set sequence preview.
 */
function renderSetSequence() {
    if (!els.sequenceBar)
        return;
    const sequence = buildSetSequence(state.programKey);
    const squares = sequence.map(item => {
        const color = routineColors[item.routine] || 'var(--stroke)';
        return `<span class="sequence-square" style="background:${color}"></span>`;
    });
    els.sequenceBar.innerHTML = squares.join('') || '<p class="muted small">No sets found.</p>';
}
/**
 * @param {ProgramKey} key
 */
function selectProgram(key) {
    state.programKey = key;
    els.programButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.program === key);
    });
    els.programLabel.textContent = key === 'intensive' ? 'Intensive Circuit' : 'Normal Flow';
    updateTotals();
    renderPreview();
    resetSession();
}
/**
 * @param {Exercise} exercise
 * @returns {Exercise}
 */
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
/**
 * @param {ProgramKey} key
 * @returns {Exercise[]}
 */
function getProgramExercises(key) {
    if (key === 'intensive') {
        return trainingPrograms.intensive.flatMap((group) => group.exercises.map(ex => ({
            ...cloneExercise(ex),
            group: group.group
        })));
    }
    return trainingPrograms.normal.map(ex => ({
        ...cloneExercise(ex),
        group: null
    }));
}
/**
 * @param {Exercise} exercise
 * @returns {ExerciseTotals}
 */
function calcExerciseTotals(exercise) {
    const restBetweenSets = typeof exercise.rest === 'number' ? exercise.rest : 0;
    if (hasTempo(exercise)) {
        const perRep = (exercise.tempo.go || 0) +
            (exercise.tempo.pause || 0) +
            (exercise.tempo.return || 0) +
            (exercise.tempo.rest || 0);
        const perSet = perRep * (exercise.reps || 0);
        const totalActive = perSet * (exercise.sets || 0);
        const totalRest = restBetweenSets * Math.max(0, (exercise.sets || 1) - 1);
        return { perRep, perSet, totalActive, totalRest, totalSeconds: totalActive + totalRest };
    }
    const timed = hasTime(exercise) ? exercise : null;
    const perSet = timed?.time || 0;
    const totalActive = perSet * (exercise.sets || 0);
    const totalRest = restBetweenSets * Math.max(0, (exercise.sets || 1) - 1);
    return { perRep: null, perSet, totalActive, totalRest, totalSeconds: totalActive + totalRest };
}
/**
 * @param {ProgramKey} programKey
 * @returns {ProgramSummary}
 */
function computeProgramSummary(programKey) {
    const exercises = getProgramExercises(programKey);
    const schedule = buildSchedule(programKey);
    const totalSeconds = schedule.reduce((sum, seg) => sum + seg.duration, 0);
    const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0);
    const segmentCount = schedule.length;
    return { totalSeconds, totalSets, segmentCount, exercisesCount: exercises.length };
}
/**
 * Update totals for current program selection.
 */
function updateTotals() {
    const current = computeProgramSummary(state.programKey);
    const normal = computeProgramSummary('normal');
    const intensive = computeProgramSummary('intensive');
    els.totalTime.textContent = formatSeconds(current.totalSeconds);
    els.totalSets.textContent = String(current.totalSets);
    els.totalExercises.textContent = String(current.exercisesCount);
    els.sessionLength.textContent = formatSeconds(current.totalSeconds);
    els.segmentCount.textContent = String(current.segmentCount);
    els.sessionRemaining.textContent = `Total: ${formatSeconds(current.totalSeconds)}`;
    els.normalTime.textContent = formatSeconds(normal.totalSeconds);
    els.intensiveTime.textContent = formatSeconds(intensive.totalSeconds);
    renderSetSequence();
}
/**
 * Render exercise cards for the selected program.
 */
function renderPreview() {
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
            ? `${setsCount} x ${ex.reps} reps`
            : hasTime(ex)
                ? `${setsCount} x ${ex.time}s hold`
                : `${setsCount} sets`;
        return `
      <div class="exercise-card" data-exercise-card="${ex.name}" style="--card-accent:${color}">
        <div class="meta">
          <span class="badge">${ex.routine || 'Exercise'}</span>
          <span class="time">~${formatSeconds(totalSeconds)}</span>
        </div>
        <div class="name">${ex.name}</div>
        <div class="tempo">${volume}${tempo ? ` · ${tempo}` : ''}</div>
        <div class="tempo">Rest between sets: ${formatSeconds(ex.rest || 0)}</div>
        ${ex.group
            ? `<div class="badge">Group ${ex.group} · Rest x${Number(ex.restMultiplier || 1).toFixed(2)}</div>`
            : ''}
      </div>
    `;
    });
    els.exerciseList.innerHTML = cards.join('');
}
/**
 * @param {Exercise} exercise
 * @param {number} setNumber
 * @param {boolean} [includeSetRest]
 * @returns {ScheduleSegment[]}
 */
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
/**
 * @param {ProgramKey} programKey
 * @returns {ScheduleSegment[]}
 */
function buildSchedule(programKey) {
    const schedule = [];
    if (programKey === 'intensive') {
        trainingPrograms.intensive.forEach((group) => {
            const exercises = group.exercises;
            const maxSets = Math.max(...exercises.map(ex => ex.sets || 0));
            for (let round = 1; round <= maxSets; round++) {
                exercises.forEach(exercise => {
                    if (round > (exercise.sets || 0))
                        return;
                    schedule.push(...createSetSegments(exercise, round, true));
                });
            }
        });
        return schedule;
    }
    const exercises = getProgramExercises(programKey);
    exercises.forEach(exercise => {
        for (let set = 1; set <= (exercise.sets || 0); set++) {
            schedule.push(...createSetSegments(exercise, set, true));
        }
    });
    return schedule;
}
/**
 * @param {ProgramKey} programKey
 * @returns {{ exerciseName: string, routine: Exercise['routine'] }[]}
 */
function buildSetSequence(programKey) {
    const sequence = [];
    if (programKey === 'intensive') {
        trainingPrograms.intensive.forEach((group) => {
            const exercises = group.exercises;
            const maxSets = Math.max(...exercises.map(ex => ex.sets || 0));
            for (let round = 1; round <= maxSets; round++) {
                exercises.forEach(exercise => {
                    if (round > (exercise.sets || 0))
                        return;
                    sequence.push({ exerciseName: exercise.name, routine: exercise.routine });
                });
            }
        });
        return sequence;
    }
    const exercises = getProgramExercises(programKey);
    exercises.forEach(exercise => {
        for (let set = 1; set <= (exercise.sets || 0); set++) {
            sequence.push({ exerciseName: exercise.name, routine: exercise.routine });
        }
    });
    return sequence;
}
/**
 * Begin session playback.
 */
function startSession() {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.schedule = buildSchedule(state.programKey);
    state.pointer = 0;
    state.completedMs = 0;
    state.lastCountdownSecond = null;
    const sessionTotalSeconds = state.schedule.reduce((sum, seg) => sum + seg.duration, 0);
    els.segmentCount.textContent = String(state.schedule.length);
    state.sessionTotalMs = sessionTotalSeconds * 1000;
    if (!state.schedule.length) {
        els.currentRemaining.textContent = '--';
        state.status = 'idle';
        updateStatusChip();
        return;
    }
    state.status = 'running';
    setSessionMode(true);
    updateStatusChip();
    els.start.textContent = 'Restart';
    els.pause.textContent = 'Pause';
    els.pause.disabled = false;
    els.reset.disabled = false;
    els.sessionRemaining.textContent = `Session left: ${formatSeconds(Math.ceil(state.sessionTotalMs / 1000))}`;
    startSegment(state.schedule[state.pointer]);
}
/**
 * Pause session playback.
 */
function pauseSession() {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.status = 'paused';
    updateStatusChip();
    els.pause.textContent = 'Resume';
}
/**
 * Resume session playback.
 */
function resumeSession() {
    if (!state.schedule.length)
        return;
    state.status = 'running';
    updateStatusChip();
    els.pause.textContent = 'Pause';
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
/**
 * @param {boolean} [updateChip]
 */
function resetSession(updateChip = true) {
    if (state.animationId)
        cancelAnimationFrame(state.animationId);
    state.animationId = null;
    state.status = 'idle';
    state.schedule = [];
    state.pointer = 0;
    state.completedMs = 0;
    state.sessionTotalMs = 0;
    setSessionMode(false);
    els.start.textContent = 'Start';
    els.pause.textContent = 'Pause';
    els.pause.disabled = true;
    els.reset.disabled = true;
    els.currentTitle.textContent = 'Select a routine and press start';
    els.currentDetail.textContent = 'All cues will show here.';
    els.currentRemaining.textContent = '--';
    els.phaseLabel.textContent = 'Ready';
    setPhasePill(null);
    els.progressBar.style.width = '0%';
    if (els.segmentProgress)
        els.segmentProgress.style.width = '0%';
    els.sessionRemaining.textContent = `Total: ${els.sessionLength.textContent}`;
    if (updateChip)
        updateStatusChip();
    clearActiveCards();
}
/**
 * @param {ScheduleSegment} segment
 */
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
/**
 * @param {number} [now]
 */
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
    els.sessionRemaining.textContent = 'Done';
    els.progressBar.style.width = '100%';
    if (els.segmentProgress)
        els.segmentProgress.style.width = '100%';
    setPhasePill(null, { label: 'Done', tone: 0 });
    playTone(1020, 0.25);
}
/**
 * @returns {ScheduleSegment | undefined}
 */
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
    const repText = segment.rep ? `Rep ${segment.rep}/${segment.totalReps}` : '';
    const setText = segment.totalSets ? `Set ${segment.set}/${segment.totalSets}` : '';
    const setRep = [setText, repText].filter(Boolean).join(' · ');
    els.currentTitle.textContent = `${segment.exerciseName}`;
    els.currentDetail.textContent = setRep || '';
    els.phaseLabel.textContent = phase.label || '';
    setPhasePill(segment, phase);
    renderPhaseBlocks(segment);
    const remainingSessionMs = (state.sessionTotalMs || 0) - (state.completedMs + (state.segmentDurationMs - state.remainingMs));
    els.sessionRemaining.textContent = `Session left: ${formatSeconds(Math.max(0, Math.ceil(remainingSessionMs / 1000)))}`;
    const progress = ((state.completedMs + (state.segmentDurationMs - state.remainingMs)) / (state.sessionTotalMs || 1)) * 100;
    els.progressBar.style.width = `${Math.min(100, progress)}%`;
    const segmentProgress = ((state.segmentDurationMs - state.remainingMs) / (state.segmentDurationMs || 1)) * 100;
    if (els.segmentProgress) {
        els.segmentProgress.style.width = `${Math.min(100, segmentProgress)}%`;
    }
    highlightActiveCard(segment.exerciseName);
    renderNextDuringRest();
}
/**
 * @param {number} totalSeconds
 */
function formatSeconds(totalSeconds) {
    const secs = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
/**
 * @param {ScheduleSegment | null} segment
 * @param {PhaseMeta | undefined} [phase]
 */
function setPhasePill(segment, phase) {
    const pill = els.phasePill;
    pill.className = 'phase-pill';
    if (!segment) {
        pill.textContent = phase?.label ?? 'Idle';
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
    pill.textContent = phase?.label || segment.phase || 'Stage';
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
        hold: 'var(--accent)'
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
        els.statusChip.textContent = 'Running';
        els.statusChip.classList.add('live');
    }
    else if (state.status === 'paused') {
        els.statusChip.textContent = 'Paused';
        els.statusChip.classList.add('paused');
    }
    else if (state.status === 'done') {
        els.statusChip.textContent = 'Complete';
        els.statusChip.classList.add('done');
    }
    else {
        els.statusChip.textContent = 'Idle';
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
/**
 * @param {string | undefined} name
 */
function highlightActiveCard(name) {
    clearActiveCards();
    if (!name)
        return;
    const card = els.exerciseList.querySelector(`[data-exercise-card="${name}"]`);
    if (card)
        card.classList.add('is-live');
}
function clearActiveCards() {
    els.exerciseList.querySelectorAll('.exercise-card.is-live').forEach(card => card.classList.remove('is-live'));
}
function renderNextDuringRest() {
    const current = currentSegment();
    if (!current || current.phase !== 'setRest')
        return;
    const next = state.schedule[state.pointer + 1];
    if (!next)
        return;
    const nextPhase = phaseMeta[next.phase] ?? { label: next.phase, tone: 0 };
    const nextSetRep = [
        next.totalSets ? `Set ${next.set}/${next.totalSets}` : '',
        next.rep ? `Rep ${next.rep}/${next.totalReps}` : ''
    ]
        .filter(Boolean)
        .join(' · ');
    els.currentTitle.textContent = `Next: ${next.exerciseName}`;
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
/**
 * @param {number} frequency
 * @param {number} [duration]
 * @param {number} [volume]
 */
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
/**
 * @param {ScheduleSegment} segment
 */
function playCueTone(segment) {
    const meta = phaseMeta[segment.phase];
    const freq = meta?.tone || 620;
    playTone(freq);
}
function handleCountdownBeep() {
    const remainingSec = Math.ceil(state.remainingMs / 1000);
    if (remainingSec <= 3 && remainingSec !== state.lastCountdownSecond) {
        state.lastCountdownSecond = remainingSec;
        playTone(remainingSec === 1 ? 980 : 620, 0.08, 0.12);
    }
}
