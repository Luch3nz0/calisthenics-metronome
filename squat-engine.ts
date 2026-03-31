export type PoseLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type PoseSide = 'left' | 'right'

export type EnginePhase =
  | 'WAITING_FOR_START_POSITION'
  | 'READY'
  | 'DESCENDING'
  | 'BOTTOM'
  | 'ASCENDING'
  | 'REST'
  | 'SESSION_COMPLETE'

export type ReadyIssueCode =
  | 'turn-sideways'
  | 'step-back'
  | 'adjust-position'
  | 'stand-tall'
  | 'move-into-frame'

export interface SquatMetrics {
  kneeAngle: number
  hipAngle: number
  ankleAngle: number
  torsoLean: number
  torsoTibiaDelta: number
  effectiveHeelLift: number
  reachedDepth: boolean
  orientationAccepted: boolean
  bodyHeight: number
  shoulderWidthRatio: number
}

export interface RepResult {
  setNumber: number
  repInSet: number
  depthValid: boolean
  postureValid: boolean
  tempoValid: boolean
  valid: boolean
  durationMs: number
  depthScore: number
  postureScore: number
  feedback: string[]
}

export interface EngineEvent {
  type: 'voice'
  key: string
  message: string
  interrupt?: boolean
}

export interface EngineSnapshot {
  phase: EnginePhase
  phaseLabel: string
  setNumber: number
  repInSet: number
  totalReps: number
  validReps: number
  invalidReps: number
  depthScore: number
  postureScore: number
  restRemainingMs: number
  orientationAccepted: boolean
  fullBodyVisible: boolean
  startPostureOk: boolean
  trackedSide: PoseSide | null
  coachMessage: string
  metrics: SquatMetrics | null
  results: RepResult[]
}

export interface EngineUpdate {
  snapshot: EngineSnapshot
  events: EngineEvent[]
}

type Point = {
  x: number
  y: number
  visibility: number
}

type SidePoints = {
  shoulder: Point
  hip: Point
  knee: Point
  ankle: Point
  heel: Point
  footIndex: Point
  ear: Point
}

type OrientationCheck = {
  accepted: boolean
  reason: ReadyIssueCode
  trackedSide: PoseSide
  fullBodyVisible: boolean
  shoulderWidthRatio: number
}

type AnalyzedFrame = {
  trackedSide: PoseSide
  sidePoints: SidePoints
  orientation: OrientationCheck
  startPostureOk: boolean
  readyToStart: boolean
  metrics: SquatMetrics
  bodyHeight: number
}

type RepTracker = {
  depthReached: boolean
  heelErrorFrames: number
  leanErrorFrames: number
  lowestKneeAngle: number
  maxTorsoLean: number
  maxHeelLift: number
  feedback: Set<string>
}

const LANDMARK_INDEX = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32
} as const

const READY_COPY: Record<ReadyIssueCode, string> = {
  'turn-sideways': 'Turn sideways to the camera.',
  'step-back': 'Move back so your full body fits on screen.',
  'adjust-position': 'Adjust your position until one side is clearly visible.',
  'stand-tall': 'Stand tall and get ready.',
  'move-into-frame': 'Move until your full body is visible.'
}

const PHASE_COPY: Record<EnginePhase, string> = {
  WAITING_FOR_START_POSITION: 'Setup',
  READY: 'Ready',
  DESCENDING: 'Descending',
  BOTTOM: 'Bottom',
  ASCENDING: 'Ascending',
  REST: 'Rest',
  SESSION_COMPLETE: 'Complete'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toPoint(landmarks: PoseLandmark[], index: number): Point {
  const source = landmarks[index]
  return {
    x: source?.x ?? 0,
    y: source?.y ?? 0,
    visibility: source?.visibility ?? 0
  }
}

function vec(a: Point, b: Point): Point {
  return { x: b.x - a.x, y: b.y - a.y, visibility: 1 }
}

function norm(v: Point): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

function angleABC(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, visibility: 1 }
  const bc = { x: c.x - b.x, y: c.y - b.y, visibility: 1 }
  const denom = norm(ba) * norm(bc)
  if (denom === 0) return 0
  const cosine = clamp(dot(ba, bc) / denom, -1, 1)
  return (Math.acos(cosine) * 180) / Math.PI
}

function angleToVertical(from: Point, to: Point): number {
  const segment = vec(from, to)
  const vertical = { x: 0, y: -1, visibility: 1 }
  const denom = norm(segment) * norm(vertical)
  if (denom === 0) return 0
  const cosine = clamp(dot(segment, vertical) / denom, -1, 1)
  return (Math.acos(cosine) * 180) / Math.PI
}

function angleBetweenSegments(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const va = vec(a1, a2)
  const vb = vec(b1, b2)
  const denom = norm(va) * norm(vb)
  if (denom === 0) return 0
  const cosine = clamp(Math.abs(dot(va, vb)) / denom, -1, 1)
  return (Math.acos(cosine) * 180) / Math.PI
}

function inFrame(point: Point): boolean {
  return point.x >= 0.02 && point.x <= 0.98 && point.y >= 0.02 && point.y <= 0.98
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export class SquatSessionEngine {
  private readonly protocol: { sets: number; repsPerSet: number; restSeconds: number }
  private readonly smoothing = {
    kneeAngle: [] as number[],
    hipAngle: [] as number[],
    ankleAngle: [] as number[],
    torsoLean: [] as number[],
    torsoTibiaDelta: [] as number[]
  }

  private phase: EnginePhase = 'WAITING_FOR_START_POSITION'
  private setNumber = 1
  private repInSet = 0
  private totalReps = 0
  private validReps = 0
  private invalidReps = 0
  private results: RepResult[] = []

  private readyStableSince: number | null = null
  private repStartedAt: number | null = null
  private bottomHoldSince: number | null = null
  private restStartedAt: number | null = null
  private readyBaseline: { kneeAngle: number; hipAngle: number; heelY: number } | null = null
  private currentRep: RepTracker = this.createRepTracker()
  private lastMetrics: SquatMetrics | null = null
  private lastHipY: number | null = null
  private pausedAt: number | null = null
  private restGetReadyAnnounced = false
  private lastVoiceAt = new Map<string, number>()

  constructor(protocol: { sets: number; repsPerSet: number; restSeconds: number }) {
    this.protocol = protocol
  }

  pause(timestampMs: number): void {
    if (this.pausedAt === null) {
      this.pausedAt = timestampMs
    }
  }

  resume(timestampMs: number): void {
    if (this.pausedAt === null) return
    const delta = timestampMs - this.pausedAt

    this.readyStableSince = this.shiftTimestamp(this.readyStableSince, delta)
    this.repStartedAt = this.shiftTimestamp(this.repStartedAt, delta)
    this.bottomHoldSince = this.shiftTimestamp(this.bottomHoldSince, delta)
    this.restStartedAt = this.shiftTimestamp(this.restStartedAt, delta)
    this.pausedAt = null
  }

  getSnapshot(): EngineSnapshot {
    return this.buildSnapshot(null, this.messageForState(null))
  }

  tickWithoutPose(timestampMs: number): EngineUpdate {
    if (this.pausedAt !== null) {
      return { snapshot: this.getSnapshot(), events: [] }
    }

    const events: EngineEvent[] = []

    if (this.phase === 'REST') {
      this.handleRestTick(timestampMs, null, events)
      return {
        snapshot: this.buildSnapshot(null, this.messageForState(null)),
        events
      }
    }

    if (this.phase !== 'WAITING_FOR_START_POSITION' && this.phase !== 'SESSION_COMPLETE') {
      this.phase = 'WAITING_FOR_START_POSITION'
      this.clearMovementState()
    }

    this.readyStableSince = null
    this.maybeSpeak(events, 'move-into-frame', READY_COPY['move-into-frame'], timestampMs, 2600)

    return {
      snapshot: this.buildSnapshot(null, READY_COPY['move-into-frame']),
      events
    }
  }

  processLandmarks(landmarks: PoseLandmark[], timestampMs: number): EngineUpdate {
    if (this.pausedAt !== null) {
      return { snapshot: this.getSnapshot(), events: [] }
    }

    const frame = this.analyzeFrame(landmarks)
    const events: EngineEvent[] = []

    if (this.phase === 'REST') {
      this.handleRestTick(timestampMs, frame, events)
      return {
        snapshot: this.buildSnapshot(frame, this.messageForState(frame)),
        events
      }
    }

    if (!frame.orientation.accepted || !frame.startPostureOk) {
      this.phase = 'WAITING_FOR_START_POSITION'
      this.readyStableSince = null
      this.clearMovementState()
      this.maybeSpeak(events, frame.orientation.reason, READY_COPY[frame.orientation.reason], timestampMs, 2400)
      this.captureTopMetrics(frame)
      return {
        snapshot: this.buildSnapshot(frame, READY_COPY[frame.orientation.reason]),
        events
      }
    }

    switch (this.phase) {
      case 'WAITING_FOR_START_POSITION': {
        if (this.readyStableSince === null) {
          this.readyStableSince = timestampMs
        }

        if (timestampMs - this.readyStableSince >= 700) {
          this.phase = 'READY'
          this.captureTopMetrics(frame)
          this.maybeSpeak(events, 'start-performing', 'Start performing the exercise.', timestampMs, 900)
        }

        break
      }

      case 'READY': {
        this.captureTopMetrics(frame)

        if (this.shouldStartDescending(frame)) {
          this.phase = 'DESCENDING'
          this.repStartedAt = timestampMs
          this.currentRep = this.createRepTracker()
        }

        break
      }

      case 'DESCENDING':
      case 'BOTTOM':
      case 'ASCENDING': {
        this.trackRepFrame(frame, timestampMs, events)
        break
      }

      default:
        break
    }

    this.lastMetrics = frame.metrics
    this.lastHipY = frame.sidePoints.hip.y

    return {
      snapshot: this.buildSnapshot(frame, this.messageForState(frame)),
      events
    }
  }

  private shiftTimestamp(value: number | null, delta: number): number | null {
    return value === null ? null : value + delta
  }

  private createRepTracker(): RepTracker {
    return {
      depthReached: false,
      heelErrorFrames: 0,
      leanErrorFrames: 0,
      lowestKneeAngle: 180,
      maxTorsoLean: 0,
      maxHeelLift: 0,
      feedback: new Set<string>()
    }
  }

  private clearMovementState(): void {
    this.repStartedAt = null
    this.bottomHoldSince = null
    this.currentRep = this.createRepTracker()
  }

  private captureTopMetrics(frame: AnalyzedFrame): void {
    this.readyBaseline = {
      kneeAngle: frame.metrics.kneeAngle,
      hipAngle: frame.metrics.hipAngle,
      heelY: frame.sidePoints.heel.y
    }
    this.lastMetrics = frame.metrics
    this.lastHipY = frame.sidePoints.hip.y
  }

  private shouldStartDescending(frame: AnalyzedFrame): boolean {
    if (!this.readyBaseline) return false

    return (
      frame.metrics.kneeAngle <= this.readyBaseline.kneeAngle - 12 &&
      frame.metrics.hipAngle <= this.readyBaseline.hipAngle - 8
    )
  }

  private isTopPosition(frame: AnalyzedFrame): boolean {
    return (
      frame.metrics.kneeAngle >= 160 &&
      frame.metrics.hipAngle >= 150 &&
      frame.metrics.torsoLean <= 22
    )
  }

  private isMovingUp(frame: AnalyzedFrame): boolean {
    if (this.lastHipY === null || this.lastMetrics === null) return false
    return frame.sidePoints.hip.y < this.lastHipY - 0.0025 && frame.metrics.kneeAngle > this.lastMetrics.kneeAngle
  }

  private trackRepFrame(frame: AnalyzedFrame, timestampMs: number, events: EngineEvent[]): void {
    const heelLiftThreshold = frame.bodyHeight * 0.015
    const excessiveLean = frame.metrics.torsoLean > 45
    const heelLifted = frame.metrics.effectiveHeelLift > heelLiftThreshold

    this.currentRep.depthReached ||= frame.metrics.reachedDepth
    this.currentRep.lowestKneeAngle = Math.min(this.currentRep.lowestKneeAngle, frame.metrics.kneeAngle)
    this.currentRep.maxTorsoLean = Math.max(this.currentRep.maxTorsoLean, frame.metrics.torsoLean)
    this.currentRep.maxHeelLift = Math.max(this.currentRep.maxHeelLift, frame.metrics.effectiveHeelLift)

    if (heelLifted) {
      this.currentRep.heelErrorFrames += 1
      this.currentRep.feedback.add('Keep your heels on the ground.')
      this.maybeSpeak(events, 'keep-heels-down', 'Keep your heels on the ground.', timestampMs, 1800)
    } else if (excessiveLean) {
      this.currentRep.leanErrorFrames += 1
      this.currentRep.feedback.add('Keep your back straight.')
      this.maybeSpeak(events, 'keep-back-straight', 'Keep your back straight.', timestampMs, 1800)
    }

    if (this.phase === 'DESCENDING') {
      if (frame.metrics.kneeAngle <= 95 || frame.metrics.reachedDepth) {
        this.phase = 'BOTTOM'
        this.bottomHoldSince = timestampMs
      }
      return
    }

    if (this.phase === 'BOTTOM') {
      if (this.bottomHoldSince !== null && timestampMs - this.bottomHoldSince >= 80 && this.isMovingUp(frame)) {
        this.phase = 'ASCENDING'
      }
      return
    }

    if (this.phase === 'ASCENDING' && this.isTopPosition(frame)) {
      this.completeRep(frame, timestampMs, events)
    }
  }

  private completeRep(frame: AnalyzedFrame, timestampMs: number, events: EngineEvent[]): void {
    const repDurationMs = Math.max(0, timestampMs - (this.repStartedAt ?? timestampMs))
    const depthValid = this.currentRep.depthReached
    const postureValid = this.currentRep.heelErrorFrames <= 2 && this.currentRep.leanErrorFrames <= 3
    const tempoValid = repDurationMs >= 1000

    if (!depthValid) {
      this.currentRep.feedback.add('Go a little lower.')
    }

    if (!tempoValid) {
      this.currentRep.feedback.add('Slow down.')
    }

    const depthPenalty = Math.max(0, this.currentRep.lowestKneeAngle - 95) * 2.4
    const depthScore = clamp(Math.round(100 - depthPenalty), 20, 100)

    const leanPenalty = Math.max(0, this.currentRep.maxTorsoLean - 40) * 2
    const heelPenalty = frame.bodyHeight === 0 ? 0 : (this.currentRep.maxHeelLift / frame.bodyHeight) * 600
    const tempoPenalty = tempoValid ? 0 : 16
    const postureScore = clamp(Math.round(100 - leanPenalty - heelPenalty - tempoPenalty), 15, 100)

    const repResult: RepResult = {
      setNumber: this.setNumber,
      repInSet: this.repInSet + 1,
      depthValid,
      postureValid,
      tempoValid,
      valid: depthValid && postureValid && tempoValid,
      durationMs: repDurationMs,
      depthScore,
      postureScore,
      feedback: Array.from(this.currentRep.feedback)
    }

    this.totalReps += 1
    this.repInSet += 1
    this.results.push(repResult)

    if (repResult.valid) {
      this.validReps += 1
    } else {
      this.invalidReps += 1
    }

    this.maybeSpeak(events, `rep-${this.repInSet}`, String(this.repInSet), timestampMs, 0, true)

    this.clearMovementState()
    this.captureTopMetrics(frame)

    if (this.repInSet >= this.protocol.repsPerSet) {
      if (this.setNumber >= this.protocol.sets) {
        this.phase = 'SESSION_COMPLETE'
        this.maybeSpeak(events, 'great-job', 'Great job.', timestampMs, 0, true)
      } else {
        this.phase = 'REST'
        this.setNumber += 1
        this.repInSet = 0
        this.restStartedAt = timestampMs
        this.restGetReadyAnnounced = false
        this.maybeSpeak(events, 'rest-time', 'Rest time.', timestampMs, 0, true)
      }
      return
    }

    this.phase = 'READY'
  }

  private handleRestTick(timestampMs: number, frame: AnalyzedFrame | null, events: EngineEvent[]): void {
    if (this.restStartedAt === null) {
      this.restStartedAt = timestampMs
    }

    const remainingMs = Math.max(0, this.protocol.restSeconds * 1000 - (timestampMs - this.restStartedAt))

    if (!this.restGetReadyAnnounced && remainingMs <= 5000) {
      this.restGetReadyAnnounced = true
      this.maybeSpeak(events, 'get-ready', 'Get ready.', timestampMs, 0)
    }

    if (remainingMs > 0) {
      if (remainingMs <= 5000 && frame && !frame.readyToStart) {
        this.maybeSpeak(events, frame.orientation.reason, READY_COPY[frame.orientation.reason], timestampMs, 2400)
      }
      return
    }

    this.phase = 'WAITING_FOR_START_POSITION'
    this.restStartedAt = null
    this.readyStableSince = null
    this.currentRep = this.createRepTracker()

    if (frame && frame.readyToStart) {
      this.readyStableSince = timestampMs
      this.captureTopMetrics(frame)
      this.phase = 'READY'
      this.maybeSpeak(events, 'start-performing', 'Start performing the exercise.', timestampMs, 900)
    }
  }

  private maybeSpeak(
    events: EngineEvent[],
    key: string,
    message: string,
    timestampMs: number,
    minIntervalMs = 1800,
    interrupt = false
  ): void {
    const last = this.lastVoiceAt.get(key) ?? -Infinity
    if (timestampMs - last < minIntervalMs) return
    if (events.some((event) => event.type === 'voice')) return

    this.lastVoiceAt.set(key, timestampMs)
    events.push({ type: 'voice', key, message, interrupt })
  }

  private analyzeFrame(landmarks: PoseLandmark[]): AnalyzedFrame {
    const leftPoints: SidePoints = {
      shoulder: toPoint(landmarks, LANDMARK_INDEX.leftShoulder),
      hip: toPoint(landmarks, LANDMARK_INDEX.leftHip),
      knee: toPoint(landmarks, LANDMARK_INDEX.leftKnee),
      ankle: toPoint(landmarks, LANDMARK_INDEX.leftAnkle),
      heel: toPoint(landmarks, LANDMARK_INDEX.leftHeel),
      footIndex: toPoint(landmarks, LANDMARK_INDEX.leftFootIndex),
      ear: toPoint(landmarks, LANDMARK_INDEX.leftEar)
    }

    const rightPoints: SidePoints = {
      shoulder: toPoint(landmarks, LANDMARK_INDEX.rightShoulder),
      hip: toPoint(landmarks, LANDMARK_INDEX.rightHip),
      knee: toPoint(landmarks, LANDMARK_INDEX.rightKnee),
      ankle: toPoint(landmarks, LANDMARK_INDEX.rightAnkle),
      heel: toPoint(landmarks, LANDMARK_INDEX.rightHeel),
      footIndex: toPoint(landmarks, LANDMARK_INDEX.rightFootIndex),
      ear: toPoint(landmarks, LANDMARK_INDEX.rightEar)
    }

    const leftMeanVisibility = average([
      leftPoints.shoulder.visibility,
      leftPoints.hip.visibility,
      leftPoints.knee.visibility,
      leftPoints.ankle.visibility,
      leftPoints.heel.visibility,
      leftPoints.footIndex.visibility
    ])

    const rightMeanVisibility = average([
      rightPoints.shoulder.visibility,
      rightPoints.hip.visibility,
      rightPoints.knee.visibility,
      rightPoints.ankle.visibility,
      rightPoints.heel.visibility,
      rightPoints.footIndex.visibility
    ])

    const trackedSide: PoseSide = leftMeanVisibility >= rightMeanVisibility ? 'left' : 'right'
    const sidePoints = trackedSide === 'left' ? leftPoints : rightPoints
    const farPoints = trackedSide === 'left' ? rightPoints : leftPoints
    const trackedSideMean = trackedSide === 'left' ? leftMeanVisibility : rightMeanVisibility
    const farSideMean = trackedSide === 'left' ? rightMeanVisibility : leftMeanVisibility

    const nose = toPoint(landmarks, LANDMARK_INDEX.nose)
    const leftAnkle = leftPoints.ankle
    const rightAnkle = rightPoints.ankle
    const bodyHeight = Math.abs(nose.y - average([leftAnkle.y, rightAnkle.y]))
    const shoulderWidthRatio =
      bodyHeight === 0
        ? 0
        : Math.abs(leftPoints.shoulder.x - rightPoints.shoulder.x) / bodyHeight

    const requiredVisible =
      trackedSideMean >= 0.7 &&
      [
        sidePoints.shoulder,
        sidePoints.hip,
        sidePoints.knee,
        sidePoints.ankle,
        sidePoints.heel,
        sidePoints.footIndex
      ].every((point) => point.visibility >= 0.65)

    const fullBodyVisible =
      inFrame(nose) &&
      inFrame(sidePoints.shoulder) &&
      inFrame(sidePoints.knee) &&
      inFrame(sidePoints.ankle) &&
      inFrame(sidePoints.heel) &&
      inFrame(sidePoints.footIndex)

    let reason: ReadyIssueCode = 'move-into-frame'

    if (!fullBodyVisible) {
      reason = 'step-back'
    } else if (shoulderWidthRatio > 0.18) {
      reason = 'turn-sideways'
    } else if (!requiredVisible || trackedSideMean - farSideMean < 0.02) {
      reason = 'adjust-position'
    }

    const orientationAccepted =
      requiredVisible &&
      fullBodyVisible &&
      shoulderWidthRatio >= 0.03 &&
      shoulderWidthRatio <= 0.18 &&
      (trackedSideMean - farSideMean >= 0.08 || shoulderWidthRatio <= 0.12)

    const kneeAngle = this.smooth('kneeAngle', angleABC(sidePoints.hip, sidePoints.knee, sidePoints.ankle))
    const hipAngle = this.smooth('hipAngle', angleABC(sidePoints.shoulder, sidePoints.hip, sidePoints.knee))
    const ankleAngle = this.smooth('ankleAngle', angleABC(sidePoints.knee, sidePoints.ankle, sidePoints.footIndex))
    const torsoLean = this.smooth('torsoLean', angleToVertical(sidePoints.hip, sidePoints.shoulder))
    const torsoTibiaDelta = this.smooth(
      'torsoTibiaDelta',
      angleBetweenSegments(sidePoints.hip, sidePoints.shoulder, sidePoints.ankle, sidePoints.knee)
    )

    const baselineHeelY = this.readyBaseline?.heelY ?? sidePoints.heel.y
    const effectiveHeelLift = baselineHeelY - sidePoints.heel.y
    const depthTolerance = bodyHeight * 0.025
    const reachedDepth = kneeAngle <= 95 || sidePoints.hip.y >= sidePoints.knee.y - depthTolerance
    const startPostureOk = kneeAngle >= 155 && hipAngle >= 150 && torsoLean <= 20

    if (orientationAccepted && !startPostureOk) {
      reason = 'stand-tall'
    }

    return {
      trackedSide,
      sidePoints,
      bodyHeight,
      orientation: {
        accepted: orientationAccepted,
        reason,
        trackedSide,
        fullBodyVisible,
        shoulderWidthRatio
      },
      startPostureOk,
      readyToStart: orientationAccepted && startPostureOk,
      metrics: {
        kneeAngle,
        hipAngle,
        ankleAngle,
        torsoLean,
        torsoTibiaDelta,
        effectiveHeelLift,
        reachedDepth,
        orientationAccepted,
        bodyHeight,
        shoulderWidthRatio
      }
    }
  }

  private smooth(
    key: keyof SquatSessionEngine['smoothing'],
    rawValue: number
  ): number {
    const bucket = this.smoothing[key]
    bucket.push(rawValue)
    if (bucket.length > 5) bucket.shift()
    return average(bucket)
  }

  private buildSnapshot(frame: AnalyzedFrame | null, coachMessage: string): EngineSnapshot {
    const depthScore =
      this.results.length === 0
        ? 0
        : Math.round(this.results.reduce((sum, result) => sum + result.depthScore, 0) / this.results.length)

    const postureScore =
      this.results.length === 0
        ? 0
        : Math.round(this.results.reduce((sum, result) => sum + result.postureScore, 0) / this.results.length)

    const restRemainingMs =
      this.phase === 'REST' && this.restStartedAt !== null
        ? Math.max(0, this.protocol.restSeconds * 1000 - (performance.now() - this.restStartedAt))
        : 0

    return {
      phase: this.phase,
      phaseLabel: PHASE_COPY[this.phase],
      setNumber: this.setNumber,
      repInSet: this.repInSet,
      totalReps: this.totalReps,
      validReps: this.validReps,
      invalidReps: this.invalidReps,
      depthScore,
      postureScore,
      restRemainingMs,
      orientationAccepted: frame?.orientation.accepted ?? false,
      fullBodyVisible: frame?.orientation.fullBodyVisible ?? false,
      startPostureOk: frame?.startPostureOk ?? false,
      trackedSide: frame?.trackedSide ?? null,
      coachMessage,
      metrics: frame?.metrics ?? null,
      results: this.results
    }
  }

  private messageForState(frame: AnalyzedFrame | null): string {
    if (this.phase === 'REST') {
      return 'Rest time. Breathe, reset, and get ready for the next set.'
    }

    if (this.phase === 'READY') {
      return 'Start performing the exercise.'
    }

    if (this.phase === 'DESCENDING') {
      return 'Control the descent.'
    }

    if (this.phase === 'BOTTOM') {
      return 'Hold the bottom for a beat.'
    }

    if (this.phase === 'ASCENDING') {
      return 'Drive through the floor and stand tall.'
    }

    if (this.phase === 'SESSION_COMPLETE') {
      return 'Great job.'
    }

    return READY_COPY[frame?.orientation.reason ?? 'move-into-frame']
  }

  get trackedSideLabel(): string {
    return this.getSnapshot().trackedSide ? capitalize(this.getSnapshot().trackedSide ?? '') : 'None'
  }
}
