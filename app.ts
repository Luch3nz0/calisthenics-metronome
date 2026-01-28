import { trainingPrograms } from './exercises.js'
import type { Exercise, TrainingGroup, TempoExercise, TimeExercise } from './exercises.js'

type ProgramKey = 'normal' | 'intensive'
type PhaseKey = 'go' | 'pause' | 'return' | 'rest' | 'setRest' | 'hold' | 'prep'
type SegmentType = 'movement' | 'micro-rest' | 'rest' | 'hold'

type PhaseMeta = { label: string; tone: number }

type ScheduleSegment = {
  exerciseName: string
  routine: Exercise['routine']
  set: number
  totalSets: number
  rep: number | null
  totalReps: number | null
  phase: PhaseKey
  type: SegmentType
  duration: number
  group: number | null
  tempoParts: Record<string, number>
}

type ProgramSummary = {
  totalSeconds: number
  totalSets: number
  segmentCount: number
  exercisesCount: number
}

type ExerciseTotals = {
  perRep: number | null
  perSet: number
  totalActive: number
  totalRest: number
  totalSeconds: number
}

type StateStatus = 'idle' | 'running' | 'paused' | 'done'

type State = {
  programKey: ProgramKey
  schedule: ScheduleSegment[]
  pointer: number
  status: StateStatus
  segmentDurationMs: number
  remainingMs: number
  completedMs: number
  animationId: number | null
  lastCountdownSecond: number | null
  audioCtx: AudioContext | null
  sessionTotalMs: number
  segmentStartedAt: number
}

const state: State = {
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
}

const PREP_DELAY_SECONDS = 5

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element not found: ${id}`)
  return el as T
}

const programButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-program]'))

const els = {
  programButtons,
  programLabel: byId<HTMLSpanElement>('program-label'),
  totalTime: byId<HTMLElement>('total-time'),
  totalSets: byId<HTMLElement>('total-sets'),
  totalExercises: byId<HTMLElement>('total-exercises'),
  sessionLength: byId<HTMLElement>('session-length'),
  segmentCount: byId<HTMLElement>('segment-count'),
  normalTime: byId<HTMLElement>('normal-time'),
  intensiveTime: byId<HTMLElement>('intensive-time'),
  start: byId<HTMLButtonElement>('start-btn'),
  pause: byId<HTMLButtonElement>('pause-btn'),
  reset: byId<HTMLButtonElement>('reset-btn'),
  exerciseList: byId<HTMLElement>('exercise-list'),
  statusChip: byId<HTMLElement>('status-chip'),
  currentTitle: byId<HTMLElement>('current-title'),
  currentDetail: byId<HTMLElement>('current-detail'),
  currentRemaining: byId<HTMLElement>('current-remaining'),
  phasePill: byId<HTMLElement>('phase-pill'),
  phaseLabel: byId<HTMLElement>('phase-label'),
  segmentProgress: byId<HTMLElement>('segment-progress-bar'),
  phaseBlocks: byId<HTMLElement>('phase-blocks'),
  progressBar: byId<HTMLElement>('progress-bar'),
  sessionRemaining: byId<HTMLElement>('session-remaining'),
  setupPanel: byId<HTMLElement>('setup-panel'),
  playerPanel: byId<HTMLElement>('player-panel'),
  sequenceBar: byId<HTMLElement>('sequence-bar')
}

const phaseMeta: Record<PhaseKey, PhaseMeta> = {
  go: { label: 'Go', tone: 880 },
  pause: { label: 'Pause', tone: 720 },
  return: { label: 'Return', tone: 900 },
  rest: { label: 'Rest', tone: 520 },
  hold: { label: 'Hold', tone: 760 },
  setRest: { label: 'Rest', tone: 460 },
  prep: { label: 'Get Ready', tone: 0 }
}

const routineColors: Record<Exercise['routine'], string> = {
  'Push-Up': getComputedStyle(document.documentElement).getPropertyValue('--push') || '#f4a261',
  'Pull-Up': getComputedStyle(document.documentElement).getPropertyValue('--pull') || '#3fa9f5',
  Squat: getComputedStyle(document.documentElement).getPropertyValue('--squat') || '#7ddf89'
}

function hasTempo(exercise: Exercise): exercise is TempoExercise {
  return 'tempo' in exercise
}

function hasTime(exercise: Exercise): exercise is TimeExercise {
  return 'time' in exercise
}

init()

/**
 * Wire up UI events and render initial view.
 */
function init() {
  els.programButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const program = btn.dataset.program === 'intensive' ? 'intensive' : 'normal'
      selectProgram(program)
    })
  })

  els.start.addEventListener('click', () => {
    startSession()
  })

  els.pause.addEventListener('click', () => {
    if (state.status === 'running') {
      pauseSession()
    } else if (state.status === 'paused') {
      resumeSession()
    }
  })

  els.reset.addEventListener('click', () => resetSession())

  selectProgram('normal')
  renderPreview()
}

/**
 * @param {boolean} isSession
 */
function setSessionMode(isSession: boolean): void {
  document.body.classList.toggle('session-mode', isSession)
}

function setButtonStyle(btn: HTMLButtonElement, { primary }: { primary: boolean }): void {
  if (!btn) return
  btn.classList.toggle('primary', primary)
  btn.classList.toggle('ghost', !primary)
}

/**
 * Render colored set sequence preview.
 */
function renderSetSequence() {
  if (!els.sequenceBar) return
  const sequence = buildSetSequence(state.programKey)
  const squares = sequence.map(item => {
    const color = routineColors[item.routine] || 'var(--stroke)'
    return `<span class="sequence-square" style="background:${color}"></span>`
  })
  els.sequenceBar.innerHTML = squares.join('') || '<p class="muted small">No sets found.</p>'
}

/**
 * @param {ProgramKey} key
 */
function selectProgram(key: ProgramKey): void {
  state.programKey = key
  els.programButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.program === key)
  })
  els.programLabel.textContent = key === 'intensive' ? 'Intensive Circuit' : 'Normal Flow'
  updateTotals()
  renderPreview()
  resetSession()
}

/**
 * @param {Exercise} exercise
 * @returns {Exercise}
 */
function cloneExercise(exercise: Exercise): Exercise {
  if (hasTempo(exercise)) {
    return {
      ...exercise,
      tempo: { ...exercise.tempo }
    }
  }
  if (hasTime(exercise)) {
    return { ...exercise }
  }
  return exercise
}

/**
 * @param {ProgramKey} key
 * @returns {Exercise[]}
 */
function getProgramExercises(key: ProgramKey): Exercise[] {
  if (key === 'intensive') {
    return trainingPrograms.intensive.flatMap((group: TrainingGroup) =>
      group.exercises.map(ex => ({
        ...cloneExercise(ex),
        group: group.group
      }))
    )
  }

  return trainingPrograms.normal.map(ex => ({
    ...cloneExercise(ex),
    group: null
  }))
}

/**
 * @param {Exercise} exercise
 * @returns {ExerciseTotals}
 */
function calcExerciseTotals(exercise: Exercise): ExerciseTotals {
  const restBetweenSets = typeof exercise.rest === 'number' ? exercise.rest : 0

  if (hasTempo(exercise)) {
    const perRep =
      (exercise.tempo.go || 0) +
      (exercise.tempo.pause || 0) +
      (exercise.tempo.return || 0) +
      (exercise.tempo.rest || 0)
    const perSet = perRep * (exercise.reps || 0)
    const totalActive = perSet * (exercise.sets || 0)
    const totalRest = restBetweenSets * Math.max(0, (exercise.sets || 1) - 1)
    return { perRep, perSet, totalActive, totalRest, totalSeconds: totalActive + totalRest }
  }

  const timed = hasTime(exercise) ? exercise : null
  const perSet = timed?.time || 0
  const totalActive = perSet * (exercise.sets || 0)
  const totalRest = restBetweenSets * Math.max(0, (exercise.sets || 1) - 1)
  return { perRep: null, perSet, totalActive, totalRest, totalSeconds: totalActive + totalRest }
}

/**
 * @param {ProgramKey} programKey
 * @returns {ProgramSummary}
 */
function computeProgramSummary(programKey: ProgramKey): ProgramSummary {
  const exercises = getProgramExercises(programKey)
  const schedule = buildSchedule(programKey)
  const totalSeconds = schedule.reduce((sum, seg) => sum + seg.duration, 0)
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0)
  const segmentCount = schedule.length
  return { totalSeconds, totalSets, segmentCount, exercisesCount: exercises.length }
}

/**
 * Update totals for current program selection.
 */
function updateTotals() {
  const current = computeProgramSummary(state.programKey)
  const normal = computeProgramSummary('normal')
  const intensive = computeProgramSummary('intensive')

  els.totalTime.textContent = formatSeconds(current.totalSeconds)
  els.totalSets.textContent = String(current.totalSets)
  els.totalExercises.textContent = String(current.exercisesCount)
  els.sessionLength.textContent = formatSeconds(current.totalSeconds)
  els.segmentCount.textContent = String(current.segmentCount)
  els.sessionRemaining.textContent = `Total: ${formatSeconds(current.totalSeconds)}`
  els.normalTime.textContent = formatSeconds(normal.totalSeconds)
  els.intensiveTime.textContent = formatSeconds(intensive.totalSeconds)
  renderSetSequence()
}

/**
 * Render exercise cards for the selected program.
 */
function renderPreview() {
  const exercises = getProgramExercises(state.programKey)
  const schedule = buildSchedule(state.programKey)
  const perExerciseSeconds = schedule.reduce<Record<string, number>>((acc, seg) => {
    acc[seg.exerciseName] = (acc[seg.exerciseName] || 0) + seg.duration
    return acc
  }, {})

  const cards = exercises.map(ex => {
    const totalSeconds = perExerciseSeconds[ex.name] || 0
    const color = routineColors[ex.routine] || 'var(--stroke)'
    const tempo = hasTempo(ex)
      ? `Tempo ${ex.tempo.go}-${ex.tempo.pause}-${ex.tempo.return}-${ex.tempo.rest}`
      : null
    const setsCount = ex.sets ?? 0
    const volume = hasTempo(ex)
      ? `${setsCount} x ${ex.reps} reps`
      : hasTime(ex)
      ? `${setsCount} x ${ex.time}s hold`
      : `${setsCount} sets`

    return `
      <div class="exercise-card" data-exercise-card="${ex.name}" style="--card-accent:${color}">
        <div class="meta">
          <span class="badge">${ex.routine || 'Exercise'}</span>
          <span class="time">~${formatSeconds(totalSeconds)}</span>
        </div>
        <div class="name">${ex.name}</div>
        <div class="tempo">${volume}${tempo ? ` · ${tempo}` : ''}</div>
        <div class="tempo">Rest between sets: ${formatSeconds(ex.rest || 0)}</div>
        ${
          ex.group
            ? `<div class="badge">Group ${ex.group} · Rest x${Number(ex.restMultiplier || 1).toFixed(2)}</div>`
            : ''
        }
      </div>
    `
  })

  els.exerciseList.innerHTML = cards.join('')
}

/**
 * @param {Exercise} exercise
 * @param {number} setNumber
 * @param {boolean} [includeSetRest]
 * @returns {ScheduleSegment[]}
 */
function createSetSegments(exercise: Exercise, setNumber: number, includeSetRest = true): ScheduleSegment[] {
  const segs: ScheduleSegment[] = []

  if (hasTempo(exercise)) {
    const phases: { key: PhaseKey; duration: number }[] = [
      { key: 'go', duration: exercise.tempo.go || 0 },
      { key: 'pause', duration: exercise.tempo.pause || 0 },
      { key: 'return', duration: exercise.tempo.return || 0 },
      { key: 'rest', duration: exercise.tempo.rest || 0 }
    ]

    for (let rep = 1; rep <= (exercise.reps || 0); rep++) {
      phases.forEach(phase => {
        if (phase.duration <= 0) return
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
        })
      })
    }
  } else if (hasTime(exercise) && exercise.time) {
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
    })
  }

  if (includeSetRest && setNumber < (exercise.sets || 0) && exercise.rest > 0) {
    const restBetweenSets = typeof exercise.rest === 'number' ? exercise.rest : 0
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
    })
  }

  return segs
}

function createPrepSegment(): ScheduleSegment {
  return {
    exerciseName: 'Get Ready',
    routine: 'Push-Up',
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
  }
}

/**
 * @param {ProgramKey} programKey
 * @returns {ScheduleSegment[]}
 */
function buildSchedule(programKey: ProgramKey): ScheduleSegment[] {
  const schedule: ScheduleSegment[] = []

  if (programKey === 'intensive') {
    trainingPrograms.intensive.forEach((group: TrainingGroup) => {
      const exercises = group.exercises
      const maxSets = Math.max(...exercises.map(ex => ex.sets || 0))
      for (let round = 1; round <= maxSets; round++) {
        exercises.forEach((exercise, idx) => {
          if (round > (exercise.sets || 0)) return
          const segments = createSetSegments(exercise, round, true)
          schedule.push(...segments)

          const restBetweenSets = typeof exercise.rest === 'number' ? exercise.rest : 0
          if (restBetweenSets <= 0) return
          const hasNextInRound = exercises
            .slice(idx + 1)
            .some(nextExercise => round <= (nextExercise.sets || 0))
          const hasNextRound = round < maxSets
          const hasNextExercise = hasNextInRound || hasNextRound
          const endsWithRest = segments[segments.length - 1]?.phase === 'setRest'
          if (hasNextExercise && !endsWithRest) {
            schedule.push({
              exerciseName: exercise.name,
              routine: exercise.routine,
              set: round,
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
            })
          }
        })
      }
    })
    if (PREP_DELAY_SECONDS > 0) schedule.unshift(createPrepSegment())
    return schedule
  }

  const exercises = getProgramExercises(programKey)
  exercises.forEach(exercise => {
    for (let set = 1; set <= (exercise.sets || 0); set++) {
      schedule.push(...createSetSegments(exercise, set, true))
    }
  })

  if (PREP_DELAY_SECONDS > 0) schedule.unshift(createPrepSegment())
  return schedule
}

/**
 * @param {ProgramKey} programKey
 * @returns {{ exerciseName: string, routine: Exercise['routine'] }[]}
 */
function buildSetSequence(programKey: ProgramKey): { exerciseName: string; routine: Exercise['routine'] }[] {
  const sequence: { exerciseName: string; routine: Exercise['routine'] }[] = []

  if (programKey === 'intensive') {
    trainingPrograms.intensive.forEach((group: TrainingGroup) => {
      const exercises = group.exercises
      const maxSets = Math.max(...exercises.map(ex => ex.sets || 0))
      for (let round = 1; round <= maxSets; round++) {
        exercises.forEach(exercise => {
          if (round > (exercise.sets || 0)) return
          sequence.push({ exerciseName: exercise.name, routine: exercise.routine })
        })
      }
    })
    return sequence
  }

  const exercises = getProgramExercises(programKey)
  exercises.forEach(exercise => {
    for (let set = 1; set <= (exercise.sets || 0); set++) {
      sequence.push({ exerciseName: exercise.name, routine: exercise.routine })
    }
  })

  return sequence
}

/**
 * Begin session playback.
 */
function startSession() {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.schedule = buildSchedule(state.programKey)
  state.pointer = 0
  state.completedMs = 0
  state.lastCountdownSecond = null
  const sessionTotalSeconds = state.schedule.reduce((sum, seg) => sum + seg.duration, 0)
  els.segmentCount.textContent = String(state.schedule.length)
  state.sessionTotalMs = sessionTotalSeconds * 1000

  if (!state.schedule.length) {
    els.currentRemaining.textContent = '--'
    state.status = 'idle'
    updateStatusChip()
    return
  }

  state.status = 'running'
  setSessionMode(true)
  updateStatusChip()
  els.start.textContent = 'Restart'
  els.pause.textContent = 'Pause'
  els.pause.disabled = false
  els.reset.disabled = false
  els.sessionRemaining.textContent = `Session left: ${formatSeconds(Math.ceil(state.sessionTotalMs / 1000))}`
  startSegment(state.schedule[state.pointer])
}

/**
 * Pause session playback.
 */
function pauseSession() {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.status = 'paused'
  updateStatusChip()
  els.pause.textContent = 'Resume'
}

/**
 * Resume session playback.
 */
function resumeSession() {
  if (!state.schedule.length) return
  state.status = 'running'
  updateStatusChip()
  els.pause.textContent = 'Pause'
  const elapsedBeforePause = state.segmentDurationMs - state.remainingMs
  state.segmentStartedAt = performance.now() - elapsedBeforePause
  state.lastCountdownSecond = null
  const current = currentSegment()
  if (current) {
    playCueTone(current)
    updatePlayerUI()
    state.animationId = requestAnimationFrame(tick)
  }
}

/**
 * @param {boolean} [updateChip]
 */
function resetSession(updateChip = true): void {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.status = 'idle'
  state.schedule = []
  state.pointer = 0
  state.completedMs = 0
  state.sessionTotalMs = 0
  setSessionMode(false)
  els.start.textContent = 'Start'
  els.pause.textContent = 'Pause'
  els.pause.disabled = true
  els.reset.disabled = true
  els.currentTitle.textContent = 'Select a routine and press start'
  els.currentDetail.textContent = 'All cues will show here.'
  els.currentRemaining.textContent = '--'
  els.phaseLabel.textContent = 'Ready'
  setPhasePill(null)
  els.progressBar.style.width = '0%'
  if (els.segmentProgress) els.segmentProgress.style.width = '0%'
  els.sessionRemaining.textContent = `Total: ${els.sessionLength.textContent}`
  if (updateChip) updateStatusChip()
  clearActiveCards()
}

/**
 * @param {ScheduleSegment} segment
 */
function startSegment(segment: ScheduleSegment): void {
  state.segmentDurationMs = segment.duration * 1000
  state.remainingMs = state.segmentDurationMs
  state.segmentStartedAt = performance.now()
  state.lastCountdownSecond = null
  playCueTone(segment)
  if (els.segmentProgress) els.segmentProgress.style.width = '0%'
  updatePlayerUI()
  tick()
}

/**
 * @param {number} [now]
 */
function tick(now?: number): void {
  if (state.status !== 'running') return

  if (!now) {
    state.animationId = requestAnimationFrame(tick)
    return
  }

  const elapsed = now - state.segmentStartedAt
  state.remainingMs = Math.max(0, state.segmentDurationMs - elapsed)

  updatePlayerUI()
  handleCountdownBeep()

  if (state.remainingMs <= 0) {
    advanceSegment()
    return
  }

  state.animationId = requestAnimationFrame(tick)
}

function advanceSegment() {
  state.completedMs += state.segmentDurationMs
  state.pointer += 1

  if (state.pointer >= state.schedule.length) {
    finishSession()
    return
  }

  const next = state.schedule[state.pointer]
  startSegment(next)
}

function finishSession() {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.status = 'done'
  updateStatusChip()
  els.pause.disabled = true
  els.currentRemaining.textContent = '00:00'
  els.sessionRemaining.textContent = 'Done'
  els.progressBar.style.width = '100%'
  if (els.segmentProgress) els.segmentProgress.style.width = '100%'
  setPhasePill(null, { label: 'Done', tone: 0 })
  playTone(1020, 0.25)
}

/**
 * @returns {ScheduleSegment | undefined}
 */
function currentSegment(): ScheduleSegment | undefined {
  return state.schedule[state.pointer]
}

function updatePlayerUI(): void {
  const segment = currentSegment()
  const remainingSec = Math.max(0, Math.ceil(state.remainingMs / 1000))
  els.currentRemaining.textContent = remainingSec ? formatSeconds(remainingSec) : '00:00'

  if (!segment) {
    if (els.segmentProgress) els.segmentProgress.style.width = '0%'
    if (els.phaseBlocks) els.phaseBlocks.innerHTML = ''
    return
  }

  const phase = phaseMeta[segment.phase] ?? { label: segment.phase, tone: 0 }
  const repText = segment.rep ? `Rep ${segment.rep}/${segment.totalReps}` : ''
  const setText = segment.totalSets ? `Set ${segment.set}/${segment.totalSets}` : ''
  const setRep = [setText, repText].filter(Boolean).join(' · ')

  els.currentTitle.textContent = `${segment.exerciseName}`
  els.currentDetail.textContent = setRep || ''
  els.phaseLabel.textContent = phase.label || ''
  setPhasePill(segment, phase)
  renderPhaseBlocks(segment)

  const remainingSessionMs =
    (state.sessionTotalMs || 0) - (state.completedMs + (state.segmentDurationMs - state.remainingMs))
  els.sessionRemaining.textContent = `Session left: ${formatSeconds(Math.max(0, Math.ceil(remainingSessionMs / 1000)))}`

  const progress =
    ((state.completedMs + (state.segmentDurationMs - state.remainingMs)) / (state.sessionTotalMs || 1)) * 100
  els.progressBar.style.width = `${Math.min(100, progress)}%`
  const segmentProgress =
    ((state.segmentDurationMs - state.remainingMs) / (state.segmentDurationMs || 1)) * 100
  if (els.segmentProgress) {
    els.segmentProgress.style.width = `${Math.min(100, segmentProgress)}%`
  }

  highlightActiveCard(segment.exerciseName)
  renderNextDuringRest()
}

/**
 * @param {number} totalSeconds
 */
function formatSeconds(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * @param {ScheduleSegment | null} segment
 * @param {PhaseMeta | undefined} [phase]
 */
function setPhasePill(segment: ScheduleSegment | null, phase?: PhaseMeta): void {
  const pill = els.phasePill
  pill.className = 'phase-pill'
  if (!segment) {
    pill.textContent = phase?.label ?? 'Idle'
    if (phase) pill.classList.add('rest')
    return
  }
  const typeLabel = segment.type
  const typeClass = typeLabel.includes('rest')
    ? 'rest'
    : typeLabel === 'hold'
    ? 'hold'
    : 'movement'
  pill.classList.add(typeClass)
  pill.textContent = phase?.label || segment.phase || 'Stage'
}

function findRepRange(pointer: number): { start: number; end: number } {
  const seg = state.schedule[pointer]
  if (!seg) return { start: pointer, end: pointer }
  let start = pointer
  while (start - 1 >= 0) {
    const prev = state.schedule[start - 1]
    if (
      prev.exerciseName === seg.exerciseName &&
      prev.set === seg.set &&
      prev.rep === seg.rep
    ) {
      start--
    } else break
  }
  let end = pointer
  while (end + 1 < state.schedule.length) {
    const next = state.schedule[end + 1]
    if (
      next.exerciseName === seg.exerciseName &&
      next.set === seg.set &&
      next.rep === seg.rep
    ) {
      end++
    } else break
  }
  return { start, end }
}

function renderPhaseBlocks(segment: ScheduleSegment): void {
  const tempoParts = segment.tempoParts || {}
  const order: PhaseKey[] = ['go', 'pause', 'return', 'rest', 'hold', 'setRest']
  const colorMap: Record<PhaseKey, string> = {
    go: 'var(--accent)',
    pause: 'var(--accent-2)',
    return: '#8be0ff',
    rest: 'rgba(255,255,255,0.3)',
    setRest: 'rgba(255,255,255,0.3)',
    hold: 'var(--accent)',
    prep: 'rgba(255,255,255,0.3)'
  }

  let unitCounter = 0
  const blocks: { phase: PhaseKey; color: string | null; unitIndex: number }[] = []
  order.forEach(key => {
    const duration = Math.round(tempoParts[key] || 0)
    if (duration <= 0) return
    for (let i = 0; i < duration; i++) {
      blocks.push({
        phase: key,
        color: colorMap[key] || 'var(--accent)',
        unitIndex: unitCounter
      })
      unitCounter++
    }
  })

  if (!blocks.length) {
    els.phaseBlocks.innerHTML = '<span class="phase-block empty"></span>'
    return
  }

  const { start } = findRepRange(state.pointer)
  let elapsedBeforeCurrent = 0
  for (let i = start; i < state.pointer; i++) {
    elapsedBeforeCurrent += (state.schedule[i].duration || 0)
  }
  const currentElapsed = (state.segmentDurationMs - state.remainingMs) / 1000
  const repElapsed = elapsedBeforeCurrent + currentElapsed
  const unitIndex = Math.max(0, Math.min(unitCounter - 1, Math.floor(repElapsed)))
  const currentBlockIndex = blocks.findIndex(b => b.unitIndex === unitIndex)

  const html = blocks
    .map((block, idx) => {
      const cls = ['phase-block']
      if (idx === currentBlockIndex) cls.push('current')
      const style = block.color ? `style="background:${block.color}"` : ''
      return `<span class="${cls.join(' ')}" ${style}></span>`
    })
    .join('')

  els.phaseBlocks.innerHTML = html
}

function updateStatusChip(): void {
  els.statusChip.classList.remove('paused', 'done', 'live')
  if (state.status === 'running') {
    els.statusChip.textContent = 'Running'
    els.statusChip.classList.add('live')
  } else if (state.status === 'paused') {
    els.statusChip.textContent = 'Paused'
    els.statusChip.classList.add('paused')
  } else if (state.status === 'done') {
    els.statusChip.textContent = 'Complete'
    els.statusChip.classList.add('done')
  } else {
    els.statusChip.textContent = 'Idle'
    els.statusChip.classList.add('live')
  }
  updateButtons()
}

function updateButtons(): void {
  if (state.status === 'running') {
    setButtonStyle(els.pause, { primary: true })
    setButtonStyle(els.start, { primary: false })
  } else if (state.status === 'paused') {
    setButtonStyle(els.pause, { primary: true })
    setButtonStyle(els.start, { primary: false })
  } else {
    setButtonStyle(els.pause, { primary: false })
    setButtonStyle(els.start, { primary: true })
  }
}

/**
 * @param {string | undefined} name
 */
function highlightActiveCard(name?: string): void {
  clearActiveCards()
  if (!name) return
  const card = els.exerciseList.querySelector(`[data-exercise-card="${name}"]`)
  if (card) card.classList.add('is-live')
}

function clearActiveCards(): void {
  els.exerciseList.querySelectorAll('.exercise-card.is-live').forEach(card => card.classList.remove('is-live'))
}

function renderNextDuringRest(): void {
  const current = currentSegment()
  if (!current || (current.phase !== 'setRest' && current.phase !== 'prep')) return
  const next = state.schedule[state.pointer + 1]
  if (!next) return
  const nextPhase = phaseMeta[next.phase] ?? { label: next.phase, tone: 0 }
  const nextSetRep = [
    next.totalSets ? `Set ${next.set}/${next.totalSets}` : '',
    next.rep ? `Rep ${next.rep}/${next.totalReps}` : ''
  ]
    .filter(Boolean)
    .join(' · ')

  els.currentTitle.textContent = `Next: ${next.exerciseName}`
  els.currentDetail.textContent = [nextPhase.label, nextSetRep].filter(Boolean).join(' • ')
}

function ensureAudio(): void {
  if (!state.audioCtx) {
    const AudioCtor =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return
    state.audioCtx = new AudioCtor()
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume()
  }
}

function pulsePing(): void {
  // removed visual ping
}

/**
 * @param {number} frequency
 * @param {number} [duration]
 * @param {number} [volume]
 */
function playTone(frequency: number, duration = 0.12, volume = 0.14): void {
  ensureAudio()
  pulsePing()
  if (!state.audioCtx) return
  const ctx = state.audioCtx
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = frequency
  osc.type = 'sine'
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

/**
 * @param {ScheduleSegment} segment
 */
function playCueTone(segment: ScheduleSegment): void {
  const meta = phaseMeta[segment.phase]
  if (!meta) {
    playTone(620)
    return
  }
  if (meta.tone > 0) {
    playTone(meta.tone)
  }
}

function handleCountdownBeep(): void {
  const remainingSec = Math.ceil(state.remainingMs / 1000)
  if (remainingSec <= 3 && remainingSec !== state.lastCountdownSecond) {
    state.lastCountdownSecond = remainingSec
    playTone(remainingSec === 1 ? 980 : 620, 0.08, 0.12)
  }
}
