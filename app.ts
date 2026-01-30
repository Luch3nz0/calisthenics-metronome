import { trainingPrograms } from './exercises.js'
import type {
  Exercise,
  TrainingGroup,
  TempoExercise,
  TimeExercise,
  TrainingProgram,
  TrainingProgramKey
} from './exercises.js'

type ProgramKey = TrainingProgramKey | 'test'

type ScreenKey = 'select' | 'details' | 'exercise' | 'metronome' | 'complete' | 'history'

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

type StateStatus = 'idle' | 'running' | 'paused' | 'done'

type Training = {
  id: string
  name: string
  description: string
  equipment: string
  programKey: ProgramKey
  difficulty: number
}

type HistoryEntry = {
  id: string
  trainingId: string
  trainingName: string
  completedAt: string
  durationSeconds: number
  xpEarned: number
}

type State = {
  programKey: ProgramKey
  selectedTrainingId: string | null
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
  musicMuted: boolean
}

const TRAININGS: Training[] = [
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
    programKey: 'test',
    difficulty: 2
  },
  {
    id: 'test-training-hard',
    name: 'Treino teste curto (difícil)',
    description: 'Sequência curta para validar telas · XP x3.',
    equipment: 'Sem equipamento.',
    programKey: 'test',
    difficulty: 3
  }
]

const HISTORY_STORAGE_KEY = 'calisthenics-history'
const XP_RATE = 1
const PREP_DELAY_SECONDS = 5
const NO_TIPS_MESSAGE = 'Sem dicas adicionais para este exercício.'

const state: State = {
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
}

const MUSIC_TRACKS = [
  'music/drift-phonk-200108.mp3',
  'music/fresh-457883.mp3',
  'music/she-hates-my-reps-464309.mp3',
  'music/summer-trip-audio-oficial-243190.mp3',
  'music/trap-future-bass-royalty-free-music-167020.mp3'
]

let musicPlayer: HTMLAudioElement | null = null
let lastMusicIndex: number | null = null

let historyEntries: HistoryEntry[] = []

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element not found: ${id}`)
  return el as T
}

const els = {
  screens: Array.from(document.querySelectorAll<HTMLElement>('[data-screen]')),
  trainingList: byId<HTMLElement>('training-list'),
  historyShortcut: byId<HTMLButtonElement>('history-shortcut'),
  selectHistory: byId<HTMLButtonElement>('select-history-btn'),
  detailTrainingName: byId<HTMLElement>('detail-training-name'),
  detailTrainingDesc: byId<HTMLElement>('detail-training-desc'),
  totalTime: byId<HTMLElement>('total-time'),
  detailExerciseList: byId<HTMLElement>('detail-exercise-list'),
  detailBack: byId<HTMLButtonElement>('detail-back-btn'),
  detailStart: byId<HTMLButtonElement>('detail-start-btn'),
  exerciseDetailTitle: byId<HTMLElement>('exercise-detail-title'),
  exerciseDetailMeta: byId<HTMLElement>('exercise-detail-meta'),
  exerciseDetailTips: byId<HTMLElement>('exercise-detail-tips'),
  exerciseBack: byId<HTMLButtonElement>('exercise-back-btn'),
  playerTrainingName: byId<HTMLElement>('player-training-name'),
  start: byId<HTMLButtonElement>('start-btn'),
  pause: byId<HTMLButtonElement>('pause-btn'),
  statusChip: byId<HTMLElement>('status-chip'),
  musicToggle: byId<HTMLButtonElement>('music-toggle-btn'),
  currentTitle: byId<HTMLElement>('current-title'),
  currentDetail: byId<HTMLElement>('current-detail'),
  currentRemaining: byId<HTMLElement>('current-remaining'),
  phasePill: byId<HTMLElement>('phase-pill'),
  segmentProgressWrap: byId<HTMLElement>('segment-progress'),
  segmentProgressBar: byId<HTMLElement>('segment-progress-bar'),
  phaseBlocks: byId<HTMLElement>('phase-blocks'),
  progressBar: byId<HTMLElement>('progress-bar'),
  sessionRemaining: byId<HTMLElement>('session-remaining'),
  playerPlaceholder: byId<HTMLElement>('player-placeholder'),
  playerMain: byId<HTMLElement>('player-main'),
  completeCount: byId<HTMLElement>('complete-count'),
  completeXpEarned: byId<HTMLElement>('complete-xp-earned'),
  completeTotalXp: byId<HTMLElement>('complete-total-xp'),
  completeTrainingName: byId<HTMLElement>('complete-training-name'),
  completeToSelection: byId<HTMLButtonElement>('complete-to-selection'),
  completeToHistory: byId<HTMLButtonElement>('complete-to-history'),
  historyList: byId<HTMLElement>('history-list'),
  historyTotalXp: byId<HTMLElement>('history-total-xp'),
  historyBack: byId<HTMLButtonElement>('history-back-btn'),
  metronomeBack: byId<HTMLButtonElement>('metronome-back-btn')
}

const phaseMeta: Record<PhaseKey, PhaseMeta> = {
  go: { label: 'Vai', tone: 880 },
  pause: { label: 'Pausa', tone: 720 },
  return: { label: 'Volta', tone: 900 },
  rest: { label: 'Descanso', tone: 520 },
  hold: { label: 'Segura', tone: 760 },
  setRest: { label: 'Descanso', tone: 460 },
  prep: { label: 'Prepare-se', tone: 0 }
}

const routineColors: Record<Exercise['routine'], string> = {
  'Push-Up': getComputedStyle(document.documentElement).getPropertyValue('--push') || '#f4a261',
  'Pull-Up': getComputedStyle(document.documentElement).getPropertyValue('--pull') || '#3fa9f5',
  Squat: getComputedStyle(document.documentElement).getPropertyValue('--squat') || '#7ddf89',
  Core: getComputedStyle(document.documentElement).getPropertyValue('--core') || '#e9c46a',
  Cardio: getComputedStyle(document.documentElement).getPropertyValue('--cardio') || '#f3722c',
  Mobility: getComputedStyle(document.documentElement).getPropertyValue('--mobility') || '#8ecae6'
}

const routineLabels: Record<Exercise['routine'], string> = {
  'Push-Up': 'Empurrar',
  'Pull-Up': 'Puxar',
  Squat: 'Agachamento',
  Core: 'Abdômen',
  Cardio: 'Cardio',
  Mobility: 'Mobilidade'
}

function hasTempo(exercise: Exercise): exercise is TempoExercise {
  return 'tempo' in exercise
}

function hasTime(exercise: Exercise): exercise is TimeExercise {
  return 'time' in exercise
}

function formatRoutineLabel(routine: Exercise['routine']): string {
  return routineLabels[routine] ?? routine
}

function createTestExercise(exercise: Exercise, group: number): Exercise {
  const rest = 2
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
    }
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
    }
  }
  const _exhaustive: never = exercise
  throw new Error(`Unsupported exercise type: ${String(_exhaustive)}`)
}

const intensiveProgram = trainingPrograms.intensive
if (intensiveProgram.kind !== 'intensive') {
  throw new Error('Programa intensivo inválido.')
}

const TEST_TRAINING_GROUPS: TrainingGroup[] = intensiveProgram.groups.map(group => ({
  group: group.group,
  restMultiplier: group.restMultiplier,
  exercises: group.exercises.slice(0, 1).map(exercise => createTestExercise(exercise, group.group))
}))

init()

function init() {
  historyEntries = loadHistory()

  els.trainingList.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-training-id]')
    const trainingId = target?.dataset.trainingId
    if (!trainingId) return
    selectTraining(trainingId)
    showScreen('details')
  })

  els.selectHistory.addEventListener('click', () => {
    renderHistory()
    showScreen('history')
  })

  els.detailExerciseList.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-exercise-name]')
    const exerciseName = target?.dataset.exerciseName
    if (!exerciseName) return
    showExerciseDetails(exerciseName)
  })

  els.detailBack.addEventListener('click', () => {
    showScreen('select')
  })

  els.detailStart.addEventListener('click', () => {
    showScreen('metronome')
    startSession()
  })

  els.exerciseBack.addEventListener('click', () => {
    showScreen('details')
  })

  els.metronomeBack.addEventListener('click', () => {
    resetSession()
    showScreen('details')
  })

  els.historyShortcut.addEventListener('click', () => {
    renderHistory()
    showScreen('history')
  })

  els.historyBack.addEventListener('click', () => {
    showScreen('select')
  })

  els.completeToSelection.addEventListener('click', () => {
    resetSession()
    showScreen('select')
  })

  els.completeToHistory.addEventListener('click', () => {
    renderHistory()
    showScreen('history')
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

  els.musicToggle.addEventListener('click', () => {
    setMusicMuted(!state.musicMuted)
  })

  if (TRAININGS.length) {
    selectTraining(TRAININGS[0].id)
  }

  renderHistory()
  updateHistoryShortcut()
  updateMusicToggle()
  showScreen('select')
}

function showScreen(screen: ScreenKey): void {
  els.screens.forEach(panel => {
    panel.hidden = panel.dataset.screen !== screen
  })
}

function setButtonStyle(btn: HTMLButtonElement, { primary }: { primary: boolean }): void {
  if (!btn) return
  btn.classList.toggle('primary', primary)
  btn.classList.toggle('ghost', !primary)
}

function updateHistoryShortcut(): void {
  const hasHistory = historyEntries.length > 0
  els.historyShortcut.hidden = !hasHistory
  els.selectHistory.hidden = !hasHistory
  if (hasHistory) {
    const totalXp = getTotalXp(historyEntries)
    els.historyShortcut.textContent = `Histórico · ${totalXp} XP`
  }
}

function getSelectedTraining(): Training {
  const training = TRAININGS.find(item => item.id === state.selectedTrainingId) ?? TRAININGS[0]
  if (!training) throw new Error('No trainings configured')
  return training
}

function selectTraining(id: string): void {
  state.selectedTrainingId = id
  const training = getSelectedTraining()
  state.programKey = training.programKey
  renderTrainingList()
  renderTrainingDetail()
  resetSession()
}

function renderTrainingList(): void {
  const cards = TRAININGS.map(training => {
    const summary = computeProgramSummary(training.programKey)
    const active = training.id === state.selectedTrainingId ? 'active' : ''
    const desc = training.description.trim()
    return `
      <button class="training-card ${active}" type="button" data-training-id="${training.id}">
        <div>
          <h3>${training.name}</h3>
          <p class="muted small">equipamento: ${training.equipment}</p>
          ${desc ? `<p class="muted small">${desc}</p>` : ''}
        </div>
        <div class="training-stat">
          <span class="label">Duração</span>
          <span class="value">${formatSeconds(summary.totalSeconds)}</span>
        </div>
      </button>
    `
  })

  els.trainingList.innerHTML = cards.join('')
}

function renderTrainingDetail(): void {
  const training = getSelectedTraining()
  const summary = updateDetailStats(training)
  els.detailTrainingName.textContent = training.name
  els.detailTrainingDesc.textContent = training.description
  els.detailTrainingDesc.hidden = training.description.trim().length === 0
  els.playerTrainingName.textContent = training.name
  els.sessionRemaining.textContent = formatSeconds(summary.totalSeconds)
  renderExerciseList()
}

function updateDetailStats(training: Training): ProgramSummary {
  const summary = computeProgramSummary(training.programKey)
  els.totalTime.textContent = formatSeconds(summary.totalSeconds)
  return summary
}

function renderExerciseList(): void {
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
      ? `${setsCount} x ${ex.reps} repetições`
      : hasTime(ex)
      ? `${setsCount} x ${ex.time}s`
      : `${setsCount} séries`
    const restLabel = ex.rest > 0 ? `Pausa: ${formatSeconds(ex.rest || 0)}` : ''

    return `
      <button class="exercise-card" type="button" data-exercise-card="${ex.name}" data-exercise-name="${ex.name}" style="--card-accent:${color}">
        <div class="meta">
          <span class="badge">${formatRoutineLabel(ex.routine)}</span>
          <span class="time">~${formatSeconds(totalSeconds)}</span>
        </div>
        <div class="name">${ex.name}</div>
        <div class="tempo">${volume}${tempo ? ` · ${tempo}` : ''}</div>
        ${restLabel ? `<div class="tempo">${restLabel}</div>` : ''}
        ${
          ex.group
            ? `<div class="badge">Grupo ${ex.group} · Descanso x${Number(ex.restMultiplier || 1).toFixed(2)}</div>`
            : ''
        }
      </button>
    `
  })

  els.detailExerciseList.innerHTML = cards.join('')
}

function showExerciseDetails(exerciseName: string): void {
  const exercise = getProgramExercises(state.programKey).find(ex => ex.name === exerciseName)
  if (!exercise) return
  els.exerciseDetailTitle.textContent = exercise.name
  els.exerciseDetailMeta.textContent = formatExerciseMeta(exercise)
  const tips = exercise.tips?.length ? exercise.tips.map(tip => `• ${tip}`).join('\n') : NO_TIPS_MESSAGE
  els.exerciseDetailTips.textContent = tips
  showScreen('exercise')
}

function formatExerciseMeta(exercise: Exercise): string {
  const base = `${formatRoutineLabel(exercise.routine)} · ${exercise.sets} séries`
  if (hasTempo(exercise)) {
    const tempo = `${exercise.tempo.go}-${exercise.tempo.pause}-${exercise.tempo.return}-${exercise.tempo.rest}`
    return `${base} · ${exercise.reps} repetições · Tempo ${tempo}`
  }
  if (hasTime(exercise)) {
    return `${base} · ${exercise.time}s`
  }
  return base
}

function loadHistory(): HistoryEntry[] {
  if (!('localStorage' in window)) return []
  const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHistoryEntry)
  } catch {
    return []
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.trainingId === 'string' &&
    typeof entry.trainingName === 'string' &&
    typeof entry.completedAt === 'string' &&
    typeof entry.durationSeconds === 'number' &&
    typeof entry.xpEarned === 'number'
  )
}

function saveHistory(entries: HistoryEntry[]): void {
  if (!('localStorage' in window)) return
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries))
}

function getTotalXp(entries: HistoryEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.xpEarned, 0)
}

function recordCompletion(): HistoryEntry {
  const training = getSelectedTraining()
  const durationSeconds = Math.max(0, Math.round(state.sessionTotalMs / 1000))
  const xpEarned = Math.round(durationSeconds * training.difficulty * XP_RATE)
  const entry: HistoryEntry = {
    id: `session-${Date.now()}`,
    trainingId: training.id,
    trainingName: training.name,
    completedAt: new Date().toISOString(),
    durationSeconds,
    xpEarned
  }
  historyEntries = [entry, ...historyEntries]
  saveHistory(historyEntries)
  updateHistoryShortcut()
  return entry
}

function renderCompletion(entry: HistoryEntry): void {
  const totalXp = getTotalXp(historyEntries)
  els.completeTrainingName.textContent = entry.trainingName
  els.completeCount.textContent = String(historyEntries.length)
  els.completeXpEarned.textContent = `${entry.xpEarned} XP`
  els.completeTotalXp.textContent = `${totalXp} XP`
}

function renderHistory(): void {
  if (!historyEntries.length) {
    els.historyList.innerHTML = '<p class="muted small">Nenhum treino concluído ainda.</p>'
    els.historyTotalXp.textContent = '0 XP'
    return
  }

  const items = historyEntries
    .map(entry => {
      const date = new Date(entry.completedAt)
      const dateLabel = date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
      return `
        <div class="history-item">
          <div class="title">${entry.trainingName}</div>
          <div class="meta">
            <span>${dateLabel}</span>
            <span>${formatSeconds(entry.durationSeconds)} · ${entry.xpEarned} XP</span>
          </div>
        </div>
      `
    })
    .join('')

  els.historyList.innerHTML = items
  els.historyTotalXp.textContent = `${getTotalXp(historyEntries)} XP`
}

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

function getProgramDefinition(key: ProgramKey): TrainingProgram {
  if (key === 'test') {
    return { kind: 'intensive', groups: TEST_TRAINING_GROUPS }
  }
  return trainingPrograms[key]
}

function getProgramExercises(key: ProgramKey): Exercise[] {
  const program = getProgramDefinition(key)
  if (program.kind === 'sequence') {
    const seen = new Set<string>()
    return program.sequence
      .filter(ex => {
        if (seen.has(ex.name)) return false
        seen.add(ex.name)
        return true
      })
      .map(ex => cloneExercise(ex))
  }

  return program.groups.flatMap((group: TrainingGroup) =>
    group.exercises.map(ex => ({
      ...cloneExercise(ex),
      group: group.group
    }))
  )
}

function computeProgramSummary(programKey: ProgramKey): ProgramSummary {
  const exercises = getProgramExercises(programKey)
  const schedule = buildSchedule(programKey)
  const totalSeconds = schedule.reduce((sum, seg) => sum + seg.duration, 0)
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0)
  const segmentCount = schedule.length
  return { totalSeconds, totalSets, segmentCount, exercisesCount: exercises.length }
}

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
  }
}

function buildSchedule(programKey: ProgramKey): ScheduleSegment[] {
  const program = getProgramDefinition(programKey)
  if (program.kind === 'sequence') {
    return buildSequenceSchedule(program.sequence)
  }
  return buildIntensiveSchedule(program.groups)
}

function buildIntensiveSchedule(groups: TrainingGroup[]): ScheduleSegment[] {
  const schedule: ScheduleSegment[] = []
  const items: { exercise: Exercise; round: number }[] = []

  groups.forEach((group: TrainingGroup) => {
    const exercises = group.exercises
    const maxSets = Math.max(...exercises.map(ex => ex.sets || 0))
    for (let round = 1; round <= maxSets; round++) {
      exercises.forEach(exercise => {
        if (round > (exercise.sets || 0)) return
        items.push({ exercise, round })
      })
    }
  })

  items.forEach((item, idx) => {
    const segments = createSetSegments(item.exercise, item.round, true)
    schedule.push(...segments)

    const restBetweenSets = typeof item.exercise.rest === 'number' ? item.exercise.rest : 0
    if (restBetweenSets <= 0) return
    const hasNextExercise = idx < items.length - 1
    const endsWithRest = segments[segments.length - 1]?.phase === 'setRest'
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
      })
    }
  })
  if (PREP_DELAY_SECONDS > 0) schedule.unshift(createPrepSegment())
  return schedule
}

function createRestSegment(exercise: Exercise, setNumber: number, restSeconds: number): ScheduleSegment {
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
  }
}

function buildSequenceSchedule(sequence: Exercise[]): ScheduleSegment[] {
  const schedule: ScheduleSegment[] = []
  const totalsByName = sequence.reduce<Record<string, number>>((acc, exercise) => {
    acc[exercise.name] = (acc[exercise.name] ?? 0) + 1
    return acc
  }, {})
  const occurrenceByName: Record<string, number> = {}

  sequence.forEach((exercise, index) => {
    occurrenceByName[exercise.name] = (occurrenceByName[exercise.name] ?? 0) + 1
    const setNumber = occurrenceByName[exercise.name]
    const totalSets = totalsByName[exercise.name] || exercise.sets || 1
    const resolved = totalSets !== exercise.sets ? { ...exercise, sets: totalSets } : exercise
    const segments = createSetSegments(resolved, setNumber, false)
    schedule.push(...segments)

    const restAfter = typeof resolved.rest === 'number' ? resolved.rest : 0
    const hasNext = index < sequence.length - 1
    if (hasNext && restAfter > 0) {
      schedule.push(createRestSegment(resolved, setNumber, restAfter))
    }
  })

  if (PREP_DELAY_SECONDS > 0) schedule.unshift(createPrepSegment())
  return schedule
}

function startSession() {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.schedule = buildSchedule(state.programKey)
  state.pointer = 0
  state.completedMs = 0
  state.lastCountdownSecond = null
  const sessionTotalSeconds = state.schedule.reduce((sum, seg) => sum + seg.duration, 0)
  state.sessionTotalMs = sessionTotalSeconds * 1000

  if (!state.schedule.length) {
    els.currentRemaining.textContent = '--'
    state.status = 'idle'
    updateStatusChip()
    return
  }

  state.status = 'running'
  updateStatusChip()
  els.start.textContent = 'Reiniciar'
  els.pause.textContent = 'Pausar'
  els.pause.disabled = false
  els.sessionRemaining.textContent = formatSeconds(Math.ceil(state.sessionTotalMs / 1000))
  setPlayerActive(true)
  startMusic()
  startSegment(state.schedule[state.pointer])
}

function pauseSession() {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.status = 'paused'
  updateStatusChip()
  els.pause.textContent = 'Retomar'
  pauseMusic()
}

function resumeSession() {
  if (!state.schedule.length) return
  state.status = 'running'
  updateStatusChip()
  els.pause.textContent = 'Pausar'
  resumeMusic()
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

function resetSession(updateChip = true): void {
  if (state.animationId) cancelAnimationFrame(state.animationId)
  state.animationId = null
  state.status = 'idle'
  state.schedule = []
  state.pointer = 0
  state.completedMs = 0
  state.sessionTotalMs = 0
  state.segmentDurationMs = 0
  state.remainingMs = 0
  els.start.textContent = 'Iniciar'
  els.pause.textContent = 'Pausar'
  els.pause.disabled = true
  els.currentTitle.textContent = 'Pronto para começar'
  els.currentDetail.textContent = 'Toque em iniciar para começar o treino.'
  els.currentRemaining.textContent = '--'
  setPhasePill(null)
  els.progressBar.style.width = '0%'
  els.segmentProgressBar.style.width = '0%'
  els.segmentProgressWrap.hidden = true
  els.phaseBlocks.hidden = true
  const summary = computeProgramSummary(state.programKey)
  els.sessionRemaining.textContent = formatSeconds(summary.totalSeconds)
  if (updateChip) updateStatusChip()
  clearActiveCards()
  setPlayerActive(false)
  pauseMusic(true)
}

function setPlayerActive(isActive: boolean): void {
  els.playerMain.hidden = !isActive
  els.playerPlaceholder.hidden = isActive
}

function startSegment(segment: ScheduleSegment): void {
  state.segmentDurationMs = segment.duration * 1000
  state.remainingMs = state.segmentDurationMs
  state.segmentStartedAt = performance.now()
  state.lastCountdownSecond = null
  playCueTone(segment)
  els.segmentProgressBar.style.width = '0%'
  updatePlayerUI()
  tick()
}

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
  els.sessionRemaining.textContent = formatSeconds(0)
  els.progressBar.style.width = '100%'
  els.segmentProgressBar.style.width = '100%'
  setPhasePill(null, { label: 'Concluído', tone: 0 })
  playTone(1020, 0.25)
  pauseMusic(true)

  const entry = recordCompletion()
  renderCompletion(entry)
  renderHistory()
  showScreen('complete')
}

function currentSegment(): ScheduleSegment | undefined {
  return state.schedule[state.pointer]
}

function updatePlayerUI(): void {
  const segment = currentSegment()
  const remainingSec = Math.max(0, Math.ceil(state.remainingMs / 1000))
  els.currentRemaining.textContent = remainingSec ? formatSeconds(remainingSec) : '00:00'

  if (!segment) {
    els.segmentProgressBar.style.width = '0%'
    els.phaseBlocks.innerHTML = ''
    els.segmentProgressWrap.hidden = true
    els.phaseBlocks.hidden = true
    return
  }

  const phase = phaseMeta[segment.phase] ?? { label: segment.phase, tone: 0 }
  const repText =
    segment.totalReps && segment.totalReps > 1 && segment.rep
      ? `Repetição ${segment.rep}/${segment.totalReps}`
      : ''
  const setText =
    segment.totalSets && segment.totalSets > 1 ? `Série ${segment.set}/${segment.totalSets}` : ''
  const setRep = [setText, repText].filter(Boolean).join(' · ')

  els.currentTitle.textContent = `${segment.exerciseName}`
  els.currentDetail.textContent = setRep || ''
  setPhasePill(segment, phase)
  renderPhaseBlocks(segment)

  const remainingSessionMs =
    (state.sessionTotalMs || 0) - (state.completedMs + (state.segmentDurationMs - state.remainingMs))
  els.sessionRemaining.textContent = formatSeconds(Math.max(0, Math.ceil(remainingSessionMs / 1000)))

  const progress =
    ((state.completedMs + (state.segmentDurationMs - state.remainingMs)) / (state.sessionTotalMs || 1)) * 100
  els.progressBar.style.width = `${Math.min(100, progress)}%`
  const segmentProgress =
    ((state.segmentDurationMs - state.remainingMs) / (state.segmentDurationMs || 1)) * 100
  els.segmentProgressBar.style.width = `${Math.min(100, segmentProgress)}%`

  const showRestProgress = segment.type === 'rest'
  els.segmentProgressWrap.hidden = !showRestProgress
  els.phaseBlocks.hidden = showRestProgress

  highlightActiveCard(segment.exerciseName)
  renderNextDuringRest()
}

function formatSeconds(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function setPhasePill(segment: ScheduleSegment | null, phase?: PhaseMeta): void {
  const pill = els.phasePill
  pill.className = 'phase-pill'
  if (!segment) {
    pill.textContent = phase?.label ?? 'Pronto'
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
  pill.textContent = phase?.label || segment.phase || 'Etapa'
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
  els.statusChip.classList.remove('is-paused', 'is-running', 'is-idle')
  if (state.status === 'running') {
    els.statusChip.classList.add('is-running')
    els.statusChip.setAttribute('aria-label', 'Em andamento')
  } else if (state.status === 'paused') {
    els.statusChip.classList.add('is-paused')
    els.statusChip.setAttribute('aria-label', 'Pausado')
  } else if (state.status === 'done') {
    els.statusChip.classList.add('is-idle')
    els.statusChip.setAttribute('aria-label', 'Concluído')
  } else {
    els.statusChip.classList.add('is-idle')
    els.statusChip.setAttribute('aria-label', 'Pronto')
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

function highlightActiveCard(name?: string): void {
  clearActiveCards()
  if (!name) return
  const card = els.detailExerciseList.querySelector(`[data-exercise-card="${name}"]`)
  if (card) card.classList.add('is-live')
}

function clearActiveCards(): void {
  els.detailExerciseList.querySelectorAll('.exercise-card.is-live').forEach(card => card.classList.remove('is-live'))
}

function renderNextDuringRest(): void {
  const current = currentSegment()
  if (!current || (current.phase !== 'setRest' && current.phase !== 'prep')) return
  const next = state.schedule[state.pointer + 1]
  if (!next) return
  const nextPhase = phaseMeta[next.phase] ?? { label: next.phase, tone: 0 }
  const nextSetRep = [
    next.totalSets && next.totalSets > 1 ? `Série ${next.set}/${next.totalSets}` : '',
    next.totalReps && next.totalReps > 1 && next.rep
      ? `Repetição ${next.rep}/${next.totalReps}`
      : ''
  ]
    .filter(Boolean)
    .join(' · ')

  els.currentTitle.textContent = `Próximo: ${next.exerciseName}`
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

function ensureMusicPlayer(): HTMLAudioElement | null {
  if (!MUSIC_TRACKS.length) return null
  if (!musicPlayer) {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = 0.5
    audio.addEventListener('ended', () => {
      if (state.status === 'running') {
        playRandomTrack()
      }
    })
    musicPlayer = audio
  }
  return musicPlayer
}

function pickRandomTrack(): string | null {
  if (!MUSIC_TRACKS.length) return null
  let idx = Math.floor(Math.random() * MUSIC_TRACKS.length)
  if (MUSIC_TRACKS.length > 1 && idx === lastMusicIndex) {
    idx = (idx + 1) % MUSIC_TRACKS.length
  }
  lastMusicIndex = idx
  return MUSIC_TRACKS[idx]
}

function playRandomTrack(): void {
  const audio = ensureMusicPlayer()
  const track = pickRandomTrack()
  if (!audio || !track) return
  audio.src = track
  audio.currentTime = 0
  audio.muted = state.musicMuted
  if (!state.musicMuted) {
    void audio.play().catch(() => undefined)
  }
}

function startMusic(): void {
  const audio = ensureMusicPlayer()
  if (!audio) return
  playRandomTrack()
}

function pauseMusic(reset = false): void {
  if (!musicPlayer) return
  musicPlayer.pause()
  if (reset) {
    musicPlayer.currentTime = 0
  }
}

function resumeMusic(): void {
  if (!musicPlayer || state.musicMuted) return
  void musicPlayer.play().catch(() => undefined)
}

function updateMusicToggle(): void {
  els.musicToggle.classList.toggle('is-muted', state.musicMuted)
  els.musicToggle.setAttribute('aria-pressed', String(state.musicMuted))
}

function setMusicMuted(muted: boolean): void {
  state.musicMuted = muted
  if (musicPlayer) {
    musicPlayer.muted = muted
  }
  if (!muted && state.status === 'running') {
    resumeMusic()
  }
  updateMusicToggle()
}
