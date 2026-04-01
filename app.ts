import { squatTraining } from './session-data.js'
import {
  getActiveUser,
  getProfileStats,
  getSessionsForUser,
  loginUser,
  logoutUser,
  registerUser,
  saveSession,
  type StoredSession,
  type AuthUser,
  type SessionDraft
} from './storage.js'
import { SquatSessionEngine, type EngineSnapshot, type PoseLandmark } from './squat-engine.js'
import { VoiceCoach } from './voice-coach.js'

type ScreenKey = 'auth' | 'home' | 'details' | 'live' | 'results' | 'profile'
type AuthMode = 'signup' | 'login'

type LiveState = {
  engine: SquatSessionEngine | null
  pose: MediaPipePoseInstance | null
  stream: MediaStream | null
  rafId: number | null
  sending: boolean
  paused: boolean
  pausedAtMs: number | null
  startedAtMs: number
  pausedDurationMs: number
  snapshot: EngineSnapshot | null
  completionHandled: boolean
}

const voiceCoach = new VoiceCoach()

const state: {
  screen: ScreenKey
  authMode: AuthMode
  activeUser: AuthUser | null
  sessions: StoredSession[]
  latestSession: StoredSession | null
  voiceMuted: boolean
  bootstrapping: boolean
  live: LiveState
} = {
  screen: 'auth',
  authMode: 'signup',
  activeUser: null,
  sessions: [],
  latestSession: null,
  voiceMuted: false,
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
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element: ${id}`)
  return element as T
}

function queryScreen(screen: ScreenKey): HTMLElement {
  const panel = document.querySelector<HTMLElement>(`[data-screen="${screen}"]`)
  if (!panel) throw new Error(`Missing screen: ${screen}`)
  return panel
}

const els = {
  screens: Array.from(document.querySelectorAll<HTMLElement>('[data-screen]')),
  authForm: byId<HTMLFormElement>('auth-form'),
  authModeLabel: byId<HTMLElement>('auth-mode-label'),
  authTitle: byId<HTMLElement>('auth-title'),
  authHelper: byId<HTMLElement>('auth-helper'),
  authNameRow: byId<HTMLElement>('auth-name-row'),
  authNameInput: byId<HTMLInputElement>('auth-name-input'),
  authEmailInput: byId<HTMLInputElement>('auth-email-input'),
  authPasswordInput: byId<HTMLInputElement>('auth-password-input'),
  authSubmitBtn: byId<HTMLButtonElement>('auth-submit-btn'),
  authSwitchCopy: byId<HTMLElement>('auth-switch-copy'),
  authSwitchBtn: byId<HTMLButtonElement>('auth-switch-btn'),
  authError: byId<HTMLElement>('auth-error'),
  homeGreeting: byId<HTMLElement>('home-greeting'),
  homeSessionCopy: byId<HTMLElement>('home-session-copy'),
  homeProfileBtn: byId<HTMLButtonElement>('home-profile-btn'),
  homeCoachName: byId<HTMLElement>('home-coach-name'),
  homeCoachRole: byId<HTMLElement>('home-coach-role'),
  homeCoachBio: byId<HTMLElement>('home-coach-bio'),
  homeTotalSessions: byId<HTMLElement>('home-total-sessions'),
  coachCard: byId<HTMLButtonElement>('coach-card'),
  homeNavHome: byId<HTMLButtonElement>('home-nav-home'),
  homeNavProfile: byId<HTMLButtonElement>('home-nav-profile'),
  detailsBackBtn: byId<HTMLButtonElement>('details-back-btn'),
  detailsCoachName: byId<HTMLElement>('details-coach-name'),
  detailsCoachRole: byId<HTMLElement>('details-coach-role'),
  detailsTitle: byId<HTMLElement>('details-title'),
  detailsSubtitle: byId<HTMLElement>('details-subtitle'),
  detailsSets: byId<HTMLElement>('details-sets'),
  detailsReps: byId<HTMLElement>('details-reps'),
  detailsRest: byId<HTMLElement>('details-rest'),
  detailsFocusList: byId<HTMLElement>('details-focus-list'),
  detailsTips: byId<HTMLElement>('details-tips'),
  detailsStartBtn: byId<HTMLButtonElement>('details-start-btn'),
  liveBackBtn: byId<HTMLButtonElement>('live-back-btn'),
  voiceToggleBtn: byId<HTMLButtonElement>('voice-toggle-btn'),
  cameraVideo: byId<HTMLVideoElement>('camera-video'),
  cameraCanvas: byId<HTMLCanvasElement>('camera-canvas'),
  orientationChip: byId<HTMLElement>('orientation-chip'),
  liveCue: byId<HTMLElement>('live-cue'),
  liveFeedback: byId<HTMLElement>('live-feedback'),
  cameraError: byId<HTMLElement>('camera-error'),
  liveSetValue: byId<HTMLElement>('live-set-value'),
  liveRepValue: byId<HTMLElement>('live-rep-value'),
  liveValidValue: byId<HTMLElement>('live-valid-value'),
  livePhaseValue: byId<HTMLElement>('live-phase-value'),
  liveKneeValue: byId<HTMLElement>('live-knee-value'),
  liveHipValue: byId<HTMLElement>('live-hip-value'),
  liveTorsoValue: byId<HTMLElement>('live-torso-value'),
  liveHeelValue: byId<HTMLElement>('live-heel-value'),
  checkOrientation: byId<HTMLElement>('check-orientation'),
  checkStance: byId<HTMLElement>('check-stance'),
  checkDepth: byId<HTMLElement>('check-depth'),
  checkHeels: byId<HTMLElement>('check-heels'),
  restPill: byId<HTMLElement>('rest-pill'),
  pauseToggleBtn: byId<HTMLButtonElement>('pause-toggle-btn'),
  quitBtn: byId<HTMLButtonElement>('quit-btn'),
  resultsName: byId<HTMLElement>('results-name'),
  resultsTotalReps: byId<HTMLElement>('results-total-reps'),
  resultsValidReps: byId<HTMLElement>('results-valid-reps'),
  resultsDepthScore: byId<HTMLElement>('results-depth-score'),
  resultsPostureScore: byId<HTMLElement>('results-posture-score'),
  resultsNotes: byId<HTMLElement>('results-notes'),
  resultsHomeBtn: byId<HTMLButtonElement>('results-home-btn'),
  resultsProfileBtn: byId<HTMLButtonElement>('results-profile-btn'),
  profileHomeBtn: byId<HTMLButtonElement>('profile-home-btn'),
  logoutBtn: byId<HTMLButtonElement>('logout-btn'),
  profileName: byId<HTMLElement>('profile-name'),
  profileEmail: byId<HTMLElement>('profile-email'),
  profileTotalSessions: byId<HTMLElement>('profile-total-sessions'),
  profileTotalValidReps: byId<HTMLElement>('profile-total-valid-reps'),
  profileDepthScore: byId<HTMLElement>('profile-depth-score'),
  profilePostureScore: byId<HTMLElement>('profile-posture-score'),
  historyList: byId<HTMLElement>('history-list'),
  profileNavHome: byId<HTMLButtonElement>('profile-nav-home'),
  profileNavProfile: byId<HTMLButtonElement>('profile-nav-profile')
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${`${secs}`.padStart(2, '0')}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

async function refreshUserData(): Promise<void> {
  state.activeUser = await getActiveUser()
  state.sessions = state.activeUser ? await getSessionsForUser() : []
}

function setActiveScreen(screen: ScreenKey): void {
  state.screen = screen

  for (const panel of els.screens) {
    panel.hidden = panel.dataset.screen !== screen
  }
}

function setText(element: HTMLElement, value: string): void {
  element.textContent = value
}

function setCheck(element: HTMLElement, label: string, status: string, ok: boolean): void {
  const title = element.querySelector('span')
  const value = element.querySelector('strong')
  if (title) title.textContent = label
  if (value) value.textContent = status
  element.classList.toggle('is-good', ok)
  element.classList.toggle('is-bad', !ok)
}

function showAuthError(message: string): void {
  els.authError.hidden = message.trim() === ''
  els.authError.textContent = message
}

function renderAuth(): void {
  const isSignup = state.authMode === 'signup'

  els.authModeLabel.textContent = isSignup ? 'Create account' : 'Log in'
  els.authTitle.textContent = isSignup ? 'Start your Noskip profile' : 'Welcome back to Noskip'
  els.authHelper.textContent = isSignup
    ? 'Create a secure account so your squat sessions and history sync to the backend.'
    : 'Log in to continue your saved squat history and profile progress.'
  els.authNameRow.hidden = !isSignup
  els.authSubmitBtn.textContent = isSignup ? 'Create account' : 'Log in'
  els.authSwitchCopy.textContent = isSignup ? 'Already have an account?' : 'Need an account instead?'
  els.authSwitchBtn.textContent = isSignup ? 'Log in' : 'Create one'

  if (!state.bootstrapping) {
    showAuthError('')
  }
}

function renderHome(): void {
  const user = state.activeUser
  if (!user) return

  setText(els.homeGreeting, `${user.name}, your squat coach is ready.`)
  setText(
    els.homeSessionCopy,
    `Today’s protocol is ${squatTraining.session.protocol.sets} sets of ${squatTraining.session.protocol.repsPerSet} reps with ${squatTraining.session.protocol.restSeconds} seconds of rest. Front camera capture is enabled by default on phones.`
  )
  setText(els.homeCoachName, squatTraining.coach.name)
  setText(els.homeCoachRole, squatTraining.coach.role)
  setText(els.homeCoachBio, squatTraining.coach.bio)
  setText(els.homeTotalSessions, String(state.sessions.length))
}

function renderDetails(): void {
  setText(els.detailsCoachName, squatTraining.coach.name)
  setText(els.detailsCoachRole, squatTraining.coach.role)
  setText(els.detailsTitle, squatTraining.session.title)
  setText(els.detailsSubtitle, `${squatTraining.session.subtitle} The live session starts with the phone front camera when available.`)
  setText(els.detailsSets, String(squatTraining.session.protocol.sets))
  setText(els.detailsReps, String(squatTraining.session.protocol.repsPerSet))
  setText(els.detailsRest, `${squatTraining.session.protocol.restSeconds}s`)

  els.detailsFocusList.innerHTML = ''
  els.detailsTips.innerHTML = ''

  for (const item of squatTraining.session.readinessTips) {
    const li = document.createElement('li')
    li.textContent = item
    els.detailsFocusList.append(li)
  }

  for (const item of [
    'Phone front camera is requested first so you can keep the screen visible during setup.',
    ...squatTraining.session.techniqueTips
  ]) {
    const li = document.createElement('li')
    li.textContent = item
    els.detailsTips.append(li)
  }
}

function renderProfile(): void {
  const user = state.activeUser
  if (!user) return

  const stats = getProfileStats(state.sessions)

  setText(els.profileName, user.name)
  setText(els.profileEmail, user.email)
  setText(els.profileTotalSessions, String(stats.totalSessions))
  setText(els.profileTotalValidReps, String(stats.totalValidReps))
  setText(els.profileDepthScore, formatPercent(stats.avgDepthScore))
  setText(els.profilePostureScore, formatPercent(stats.avgPostureScore))

  els.historyList.innerHTML = ''

  if (state.sessions.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'history-empty'
    empty.textContent = 'No sessions saved yet. Finish your first squat session to populate the backend history.'
    els.historyList.append(empty)
    return
  }

  for (const session of state.sessions) {
    const entry = document.createElement('article')
    entry.className = 'history-entry'

    const row = document.createElement('div')
    row.className = 'history-row'
    row.innerHTML = `
      <strong>${formatDate(session.completedAt)}</strong>
      <span class="history-meta">${session.validReps}/${session.totalReps} valid reps</span>
    `

    const scores = document.createElement('div')
    scores.className = 'history-row history-meta'
    scores.innerHTML = `
      <span>Depth ${formatPercent(session.depthScore)}</span>
      <span>Posture ${formatPercent(session.postureScore)}</span>
      <span>${formatDuration(session.durationSeconds)}</span>
    `

    entry.append(row, scores)

    if (session.notes.length > 0) {
      const note = document.createElement('p')
      note.className = 'history-note'
      note.textContent = session.notes.join(' ')
      entry.append(note)
    }

    els.historyList.append(entry)
  }
}

function renderResults(session: StoredSession): void {
  const user = state.activeUser
  if (!user) return

  setText(els.resultsName, user.name)
  setText(els.resultsTotalReps, String(session.totalReps))
  setText(els.resultsValidReps, String(session.validReps))
  setText(els.resultsDepthScore, formatPercent(session.depthScore))
  setText(els.resultsPostureScore, formatPercent(session.postureScore))

  els.resultsNotes.innerHTML = ''

  if (session.notes.length === 0) {
    const note = document.createElement('div')
    note.className = 'results-note'
    note.textContent = 'Clean session. No persistent correction theme was detected.'
    els.resultsNotes.append(note)
    return
  }

  for (const item of session.notes) {
    const note = document.createElement('div')
    note.className = 'results-note'
    note.textContent = item
    els.resultsNotes.append(note)
  }
}

function renderLiveSnapshot(snapshot: EngineSnapshot): void {
  state.live.snapshot = snapshot

  const liveSetLabel =
    snapshot.phase === 'SESSION_COMPLETE'
      ? `${squatTraining.session.protocol.sets} / ${squatTraining.session.protocol.sets}`
      : `${snapshot.setNumber} / ${squatTraining.session.protocol.sets}`

  setText(els.liveSetValue, liveSetLabel)
  setText(els.liveRepValue, `${snapshot.repInSet} / ${squatTraining.session.protocol.repsPerSet}`)
  setText(els.liveValidValue, `${snapshot.validReps} / ${snapshot.totalReps}`)
  setText(els.livePhaseValue, snapshot.phaseLabel)
  setText(els.liveCue, snapshot.coachMessage)

  if (snapshot.metrics) {
    setText(els.liveKneeValue, `${Math.round(snapshot.metrics.kneeAngle)}°`)
    setText(els.liveHipValue, `${Math.round(snapshot.metrics.hipAngle)}°`)
    setText(els.liveTorsoValue, `${Math.round(snapshot.metrics.torsoLean)}°`)
    const heelPercent =
      snapshot.metrics.bodyHeight === 0
        ? 0
        : (snapshot.metrics.effectiveHeelLift / snapshot.metrics.bodyHeight) * 100
    setText(els.liveHeelValue, `${heelPercent.toFixed(1)}%`)
    setText(
      els.liveFeedback,
      `Front camera active · tracking ${snapshot.trackedSide ?? 'one'} side · depth ${snapshot.metrics.reachedDepth ? 'hit' : 'pending'} · posture ${formatPercent(snapshot.postureScore)}`
    )
  } else {
    setText(els.liveKneeValue, '--')
    setText(els.liveHipValue, '--')
    setText(els.liveTorsoValue, '--')
    setText(els.liveHeelValue, '--')
    setText(els.liveFeedback, 'Front camera is live. Full body visibility is required before the coach starts counting reps.')
  }

  els.orientationChip.className = 'status-pill'

  if (snapshot.phase === 'REST') {
    els.orientationChip.classList.add('is-rest')
    setText(els.orientationChip, 'Rest in progress')
  } else if (snapshot.orientationAccepted && snapshot.startPostureOk) {
    els.orientationChip.classList.add('is-ready')
    setText(els.orientationChip, 'Position ready')
  } else {
    setText(els.orientationChip, 'Adjust position')
  }

  if (snapshot.phase === 'REST') {
    els.restPill.hidden = false
    setText(els.restPill, `Rest ${Math.ceil(snapshot.restRemainingMs / 1000)}s`)
  } else {
    els.restPill.hidden = true
  }

  setCheck(els.checkOrientation, 'Orientation', snapshot.orientationAccepted ? 'Accepted' : 'Needs work', snapshot.orientationAccepted)
  setCheck(els.checkStance, 'Start posture', snapshot.startPostureOk ? 'Ready' : 'Reset tall', snapshot.startPostureOk)

  const depthReady = snapshot.metrics?.reachedDepth ?? false
  setCheck(els.checkDepth, 'Depth', depthReady ? 'Reached' : 'Pending', depthReady)

  const heelGood = snapshot.metrics ? snapshot.metrics.effectiveHeelLift <= snapshot.metrics.bodyHeight * 0.015 : false
  setCheck(els.checkHeels, 'Heel control', heelGood ? 'Grounded' : 'Lifting', heelGood)

  els.pauseToggleBtn.textContent = state.live.paused ? 'Resume' : 'Pause'
  els.voiceToggleBtn.textContent = state.voiceMuted ? 'Voice off' : 'Voice on'
}

function syncNavigation(): void {
  const isHome = state.screen === 'home'
  const isProfile = state.screen === 'profile'

  els.homeNavHome.classList.toggle('is-active', isHome)
  els.homeNavProfile.classList.toggle('is-active', !isHome)
  els.profileNavHome.classList.toggle('is-active', !isProfile)
  els.profileNavProfile.classList.toggle('is-active', isProfile)
}

function renderApp(): void {
  renderAuth()

  if (!state.activeUser) {
    setActiveScreen('auth')
    return
  }

  renderHome()
  renderDetails()
  renderProfile()

  if (state.latestSession) {
    renderResults(state.latestSession)
  }

  setActiveScreen(state.screen)
  syncNavigation()
}

function handleEngineEvents(events: { key: string; message: string; interrupt?: boolean }[]): void {
  for (const event of events) {
    voiceCoach.speak({
      key: event.key,
      message: event.message,
      interrupt: event.interrupt
    })
  }
}

function syncCanvasToVideo(): void {
  if (els.cameraVideo.videoWidth === 0 || els.cameraVideo.videoHeight === 0) return

  if (
    els.cameraCanvas.width !== els.cameraVideo.videoWidth ||
    els.cameraCanvas.height !== els.cameraVideo.videoHeight
  ) {
    els.cameraCanvas.width = els.cameraVideo.videoWidth
    els.cameraCanvas.height = els.cameraVideo.videoHeight
  }
}

function toCanvasPoint(point: PoseLandmark, width: number, height: number): { x: number; y: number } {
  return {
    x: point.x * width,
    y: point.y * height
  }
}

function drawPose(landmarks: PoseLandmark[] | undefined, trackedSide: 'left' | 'right' | null): void {
  syncCanvasToVideo()

  const context = els.cameraCanvas.getContext('2d')
  if (!context) return

  const width = els.cameraCanvas.width
  const height = els.cameraCanvas.height
  context.clearRect(0, 0, width, height)

  if (!landmarks || landmarks.length === 0) return

  const side = trackedSide ?? 'left'
  const indices =
    side === 'left'
      ? [11, 23, 25, 27, 29, 31]
      : [12, 24, 26, 28, 30, 32]

  const points = indices.map((index) => toCanvasPoint(landmarks[index], width, height))

  context.strokeStyle = side === 'left' ? '#6dd6ff' : '#ffbe6f'
  context.lineWidth = 8
  context.lineCap = 'round'
  context.lineJoin = 'round'

  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y)
  }
  context.stroke()

  context.fillStyle = '#f5f7fb'
  for (const point of points) {
    context.beginPath()
    context.arc(point.x, point.y, 7, 0, Math.PI * 2)
    context.fill()
  }
}

async function stopLiveResources(): Promise<void> {
  if (state.live.rafId !== null) {
    cancelAnimationFrame(state.live.rafId)
    state.live.rafId = null
  }

  if (state.live.stream) {
    for (const track of state.live.stream.getTracks()) {
      track.stop()
    }
    state.live.stream = null
  }

  if (state.live.pose?.close) {
    await state.live.pose.close()
  }

  state.live.pose = null
  state.live.engine = null
  state.live.sending = false
  state.live.paused = false
  state.live.pausedAtMs = null
  state.live.pausedDurationMs = 0
  state.live.snapshot = null
  state.live.completionHandled = false
  voiceCoach.stop()

  const context = els.cameraCanvas.getContext('2d')
  context?.clearRect(0, 0, els.cameraCanvas.width, els.cameraCanvas.height)
  els.cameraVideo.srcObject = null
}

async function handleSessionComplete(snapshot: EngineSnapshot): Promise<void> {
  if (!state.activeUser || state.live.completionHandled) return
  state.live.completionHandled = true

  const durationSeconds = Math.max(
    1,
    Math.round((performance.now() - state.live.startedAtMs - state.live.pausedDurationMs) / 1000)
  )

  const notes = Array.from(
    new Set(
      snapshot.results
        .flatMap((result) => result.feedback)
        .filter((message) => message.trim() !== '')
    )
  ).slice(0, 3)

  const sessionPayload: SessionDraft = {
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
  }

  try {
    const savedSession = await saveSession(sessionPayload)
    state.latestSession = savedSession
    await refreshUserData()
  } catch (error) {
    const fallback: StoredSession = {
      id: crypto.randomUUID(),
      userEmail: state.activeUser.email,
      ...sessionPayload
    }
    state.latestSession = fallback
    window.alert(error instanceof Error ? error.message : 'The session could not be saved to the backend.')
  }

  if (state.latestSession) {
    renderResults(state.latestSession)
  }

  await stopLiveResources()
  setActiveScreen('results')
}

async function handlePoseResults(results: PoseResults): Promise<void> {
  if (!state.live.engine) return

  drawPose(results.poseLandmarks, state.live.snapshot?.trackedSide ?? null)

  if (state.live.paused) {
    if (state.live.snapshot) renderLiveSnapshot(state.live.snapshot)
    return
  }

  const now = performance.now()
  const update =
    results.poseLandmarks && results.poseLandmarks.length > 0
      ? state.live.engine.processLandmarks(results.poseLandmarks as PoseLandmark[], now)
      : state.live.engine.tickWithoutPose(now)

  renderLiveSnapshot(update.snapshot)
  handleEngineEvents(update.events)

  if (update.snapshot.phase === 'SESSION_COMPLETE') {
    await handleSessionComplete(update.snapshot)
  }
}

async function startPoseLoop(): Promise<void> {
  const tick = async (): Promise<void> => {
    if (!state.live.pose || !state.live.stream) return
    state.live.rafId = requestAnimationFrame(() => {
      void tick()
    })

    if (state.live.sending || els.cameraVideo.readyState < 2) return

    state.live.sending = true
    try {
      await state.live.pose.send({ image: els.cameraVideo })
    } catch (error) {
      els.cameraError.hidden = false
      els.cameraError.textContent = error instanceof Error ? error.message : 'Pose processing failed.'
    } finally {
      state.live.sending = false
    }
  }

  await tick()
}

async function startLiveSession(): Promise<void> {
  if (!state.activeUser) {
    setActiveScreen('auth')
    return
  }

  await stopLiveResources()

  setActiveScreen('live')
  els.cameraError.hidden = true
  els.cameraError.textContent = ''

  if (typeof Pose === 'undefined') {
    els.cameraError.hidden = false
    els.cameraError.textContent = 'MediaPipe Pose could not be loaded in this browser.'
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })

    state.live.stream = stream
    state.live.engine = new SquatSessionEngine(squatTraining.session.protocol)
    state.live.startedAtMs = performance.now()
    state.live.pausedDurationMs = 0
    state.live.paused = false
    state.live.pausedAtMs = null
    state.live.snapshot = state.live.engine.getSnapshot()
    state.live.completionHandled = false

    els.cameraVideo.srcObject = stream
    await els.cameraVideo.play()
    syncCanvasToVideo()

    state.live.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    })
    state.live.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      selfieMode: false,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    })
    state.live.pose.onResults((results) => {
      void handlePoseResults(results)
    })

    renderLiveSnapshot(state.live.snapshot)
    voiceCoach.speak({
      key: 'welcome',
      message: `Welcome, ${state.activeUser.name}. Today you will perform a squat training: 3 sets of 5 reps. Front camera is live. Get into position.`,
      interrupt: true,
      minIntervalMs: 0
    })

    await startPoseLoop()
  } catch (error) {
    els.cameraError.hidden = false
    els.cameraError.textContent =
      error instanceof Error
        ? error.message
        : 'Camera access failed. Use a secure session and allow front camera permission.'
  }
}

async function quitLiveSession(nextScreen: ScreenKey): Promise<void> {
  await stopLiveResources()
  state.latestSession = null
  setActiveScreen(nextScreen)
  renderApp()
}

async function handleAuthSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault()

  const email = els.authEmailInput.value.trim()
  const password = els.authPasswordInput.value

  if (email === '' || password.trim() === '') {
    showAuthError('Email and password are required.')
    return
  }

  if (state.authMode === 'signup') {
    const name = els.authNameInput.value.trim()

    if (name === '') {
      showAuthError('Your name is required.')
      return
    }

    const result = await registerUser(name, email, password)
    if (!result.ok) {
      showAuthError(result.message ?? 'Could not create the account.')
      return
    }
  } else {
    const result = await loginUser(email, password)
    if (!result.ok) {
      showAuthError(result.message ?? 'Could not log in.')
      return
    }
  }

  await refreshUserData()
  els.authForm.reset()
  setActiveScreen('home')
  renderApp()
}

async function bootstrap(): Promise<void> {
  renderApp()

  try {
    await refreshUserData()
    if (state.activeUser) {
      setActiveScreen('home')
    } else {
      state.authMode = 'signup'
      setActiveScreen('auth')
    }
  } catch (error) {
    showAuthError(error instanceof Error ? error.message : 'Could not reach the backend.')
    setActiveScreen('auth')
  } finally {
    state.bootstrapping = false
    renderApp()
  }

  els.authSwitchBtn.addEventListener('click', () => {
    state.authMode = state.authMode === 'signup' ? 'login' : 'signup'
    renderAuth()
  })

  els.authForm.addEventListener('submit', (event) => {
    void handleAuthSubmit(event as SubmitEvent)
  })

  els.homeProfileBtn.addEventListener('click', () => {
    setActiveScreen('profile')
    renderApp()
  })

  els.homeNavHome.addEventListener('click', () => {
    setActiveScreen('home')
    renderApp()
  })

  els.homeNavProfile.addEventListener('click', () => {
    setActiveScreen('profile')
    renderApp()
  })

  els.profileNavHome.addEventListener('click', () => {
    setActiveScreen('home')
    renderApp()
  })

  els.profileNavProfile.addEventListener('click', () => {
    setActiveScreen('profile')
    renderApp()
  })

  els.profileHomeBtn.addEventListener('click', () => {
    setActiveScreen('home')
    renderApp()
  })

  els.coachCard.addEventListener('click', () => {
    setActiveScreen('details')
    renderApp()
  })

  els.detailsBackBtn.addEventListener('click', () => {
    setActiveScreen('home')
    renderApp()
  })

  els.detailsStartBtn.addEventListener('click', () => {
    void startLiveSession()
  })

  els.liveBackBtn.addEventListener('click', () => {
    if (window.confirm('Leave the live session? Current progress will be discarded.')) {
      void quitLiveSession('details')
    }
  })

  els.quitBtn.addEventListener('click', () => {
    if (window.confirm('Quit the current session? Current progress will be discarded.')) {
      void quitLiveSession('details')
    }
  })

  els.pauseToggleBtn.addEventListener('click', () => {
    if (!state.live.engine) return

    if (state.live.paused) {
      const resumedAt = performance.now()
      state.live.engine.resume(resumedAt)
      if (state.live.pausedAtMs !== null) {
        state.live.pausedDurationMs += resumedAt - state.live.pausedAtMs
      }
      state.live.pausedAtMs = null
      state.live.paused = false
    } else {
      state.live.paused = true
      state.live.pausedAtMs = performance.now()
      state.live.engine.pause(state.live.pausedAtMs)
      voiceCoach.stop()
    }

    if (state.live.snapshot) renderLiveSnapshot(state.live.snapshot)
  })

  els.voiceToggleBtn.addEventListener('click', () => {
    state.voiceMuted = !state.voiceMuted
    voiceCoach.setMuted(state.voiceMuted)
    els.voiceToggleBtn.textContent = state.voiceMuted ? 'Voice off' : 'Voice on'
  })

  els.resultsHomeBtn.addEventListener('click', () => {
    state.latestSession = null
    setActiveScreen('home')
    renderApp()
  })

  els.resultsProfileBtn.addEventListener('click', async () => {
    state.latestSession = null
    await refreshUserData()
    setActiveScreen('profile')
    renderApp()
  })

  els.logoutBtn.addEventListener('click', () => {
    void (async () => {
      voiceCoach.stop()
      try {
        await logoutUser()
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not log out.')
      }
      state.activeUser = null
      state.sessions = []
      state.latestSession = null
      state.authMode = 'login'
      setActiveScreen('auth')
      renderApp()
    })()
  })

  window.addEventListener('resize', syncCanvasToVideo)
}

void bootstrap()
