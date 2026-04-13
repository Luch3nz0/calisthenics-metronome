import type { FmsTask } from './fms-data.js'
import type { SexForTSPU } from './shared-types.js'

export type FmsPoseLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
  presence?: number
}

export type FmsPoseFrame = {
  landmarks: FmsPoseLandmark[]
  worldLandmarks: FmsPoseLandmark[]
}

export type FmsCaptureMode = 'primary' | 'heelsElevated' | 'diagonalRegression'
export type FmsLivePhase = 'awaiting_pose' | 'locking' | 'ready' | 'capturing' | 'captured'

export type FmsLiveCapture = {
  score: 1 | 2 | 3
  confidence: number
  notes: string[]
  metrics: string[]
  mode: FmsCaptureMode
}

export type FmsLiveAssessment = {
  phase: FmsLivePhase
  statusLabel: string
  guidance: string
  lockFrames: number
  confidence: number
  landmarks: FmsPoseLandmark[]
  capture?: FmsLiveCapture
}

type Side = 'left' | 'right'

type BaselineState = {
  side: Side
  bodyScale: number
  stanceWidthNorm: number
  torsoVerticalErrorDeg: number
  kneeAngleDeg: number
  hipAngleDeg: number
  hipX: number
  hipY: number
  movingAnkleY?: number
  movingWristY?: number
  movingWristX?: number
  movingAnkleX?: number
  wristDistanceNorm?: number
  shoulderLiftY?: number
  hipLiftY?: number
}

type SampleState = {
  timestampMs: number
  side: Side
  bodyScale: number
  torsoVerticalErrorDeg: number
  hipX: number
  hipY: number
  torsoTibiaParallelErrorDeg?: number
  kneeAngleDeg?: number
  hipAngleDeg?: number
  femurAngleToHorizontalDeg?: number
  lumbarProxyDeg?: number
  kneeOverFootOffsetNorm?: number
  dowelOverMidfootOffsetNorm?: number
  movingAnkleY?: number
  movingAnkleX?: number
  movingAnkleLiftNorm?: number
  movingAnkleProjectionY?: number
  movingKneeAngleDeg?: number
  groundedKneeAngleDeg?: number
  groundedHeelLiftNorm?: number
  hipKneeAnkleAlignmentError?: number
  trunkSwayDeg?: number
  pelvisTiltDeg?: number
  balanceRecoveryNorm?: number
  movingWristY?: number
  movingWristX?: number
  shoulderLiftY?: number
  hipLiftY?: number
  headShoulderHipVerticalityError?: number
  rearKneeTargetDistanceNorm?: number
  frontFootSagittalAlignmentError?: number
  wristsDistanceNorm?: number
  handLengthNorm?: number
  creepMotionNorm?: number
  elbowExtensionDeg?: number
  hipSagNorm?: number
  bodyLineErrorDeg?: number
  spineLagProxyDeg?: number
  handPlacementClass?: 1 | 2 | 3
  sameSideExtensionNorm?: number
  elbowKneeTouchDistanceNorm?: number
  midlineDriftNorm?: number
  trunkRotationDeg?: number
}

type CaptureAccumulator = {
  startedAtMs: number
  movementDetectedAtMs: number
  maxMovementNorm: number
  minKneeAngleDeg: number
  maxKneeAngleDeg: number
  minHipAngleDeg: number
  maxHipAngleDeg: number
  minHipY: number
  maxHipY: number
  minTorsoTibiaParallelErrorDeg: number
  maxTorsoTibiaParallelErrorDeg: number
  minTorsoVerticalErrorDeg: number
  maxTorsoVerticalErrorDeg: number
  minLumbarProxyDeg: number
  maxLumbarProxyDeg: number
  minKneeOverFootOffsetNorm: number
  maxKneeOverFootOffsetNorm: number
  minDowelOverMidfootOffsetNorm: number
  maxDowelOverMidfootOffsetNorm: number
  minMovingAnkleY: number
  maxMovingAnkleY: number
  minMovingAnkleX: number
  maxMovingAnkleX: number
  maxMovingAnkleLiftNorm: number
  minGroundedHeelLiftNorm: number
  maxGroundedHeelLiftNorm: number
  minMovingKneeAngleDeg: number
  minGroundedKneeAngleDeg: number
  maxHipKneeAnkleAlignmentError: number
  maxPelvisTiltDeg: number
  maxTrunkSwayDeg: number
  maxBalanceRecoveryNorm: number
  minRearKneeTargetDistanceNorm: number
  maxFrontFootSagittalAlignmentError: number
  minWristsDistanceNorm: number
  handLengthNorm: number
  maxCreepMotionNorm: number
  maxElbowExtensionDeg: number
  minHipSagNorm: number
  maxHipSagNorm: number
  maxBodyLineErrorDeg: number
  maxSpineLagProxyDeg: number
  bestHandPlacementClass: 1 | 2 | 3
  maxSameSideExtensionNorm: number
  minElbowKneeTouchDistanceNorm: number
  maxMidlineDriftNorm: number
  maxTrunkRotationDeg: number
  achievedReturn: boolean
  achievedTouch: boolean
}

const FMS_LOCK_FRAME_TARGET = 10
const MIN_LANDMARK_CONFIDENCE = 0.6
const FRONT_CHAIN: readonly number[] = [0, 11, 12, 23, 24, 25, 26, 27, 28]
const LEFT_CHAIN: readonly number[] = [11, 13, 15, 19, 21, 23, 25, 27, 29, 31]
const RIGHT_CHAIN: readonly number[] = [12, 14, 16, 20, 22, 24, 26, 28, 30, 32]
const FMS_TUNING = {
  deepSquat: {
    startKneeDropDeg: 18,
    startHipDropNorm: 0.06,
    returnKneeWindowDeg: 12,
    returnHipWindowNorm: 0.05
  },
  hurdleStep: {
    startLiftNorm: 0.1,
    returnWindowNorm: 0.04
  },
  inlineLunge: {
    startRearKneeDropNorm: 0.08,
    returnWindowNorm: 0.05
  },
  shoulderMobility: {
    startDistanceChangeNorm: 0.08,
    settleWindowMs: 900,
    maxCaptureMs: 3200
  },
  activeStraightLegRaise: {
    startLiftNorm: 0.1,
    returnWindowNorm: 0.05
  },
  trunkStabilityPushUp: {
    startLiftNorm: 0.035,
    topHoldMs: 260
  },
  rotaryStability: {
    extensionStartNorm: 0.16,
    returnWindowNorm: 0.08
  }
} as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function distance(a: FmsPoseLandmark, b: FmsPoseLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: FmsPoseLandmark, b: FmsPoseLandmark): FmsPoseLandmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
    presence: Math.min(a.presence ?? 1, b.presence ?? 1)
  }
}

function confidenceOf(landmark: FmsPoseLandmark): number {
  return Math.min(landmark.visibility ?? 1, landmark.presence ?? 1)
}

function landmarkIsConfident(landmark: FmsPoseLandmark | undefined): landmark is FmsPoseLandmark {
  if (!landmark) return false
  return confidenceOf(landmark) >= MIN_LANDMARK_CONFIDENCE
}

function allLandmarksPresent(landmarks: readonly FmsPoseLandmark[], indices: readonly number[]): boolean {
  return indices.every((index) => landmarkIsConfident(landmarks[index]))
}

function jointAngle(a: FmsPoseLandmark, b: FmsPoseLandmark, c: FmsPoseLandmark): number {
  const abX = a.x - b.x
  const abY = a.y - b.y
  const cbX = c.x - b.x
  const cbY = c.y - b.y
  const dot = abX * cbX + abY * cbY
  const mag = Math.hypot(abX, abY) * Math.hypot(cbX, cbY)

  if (mag <= 0.000001) return 180

  return toDegrees(Math.acos(Math.max(-1, Math.min(1, dot / mag))))
}

function segmentAngleDeg(a: FmsPoseLandmark, b: FmsPoseLandmark): number {
  return toDegrees(Math.atan2(b.y - a.y, b.x - a.x))
}

function segmentAngleToHorizontalDeg(a: FmsPoseLandmark, b: FmsPoseLandmark): number {
  return segmentAngleDeg(a, b)
}

function verticalityErrorDeg(a: FmsPoseLandmark, b: FmsPoseLandmark): number {
  const angle = Math.abs(segmentAngleDeg(a, b))
  const normalized = angle > 180 ? angle - 180 : angle
  return Math.abs(90 - normalized)
}

function angleDifferenceDeg(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360
  return difference > 180 ? 360 - difference : difference
}

function normalize(value: number, scale: number): number {
  return Math.abs(value) / Math.max(scale, 0.001)
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averageConfidence(landmarks: readonly FmsPoseLandmark[], indices: readonly number[]): number {
  return mean(indices.map((index) => confidenceOf(landmarks[index] ?? { x: 0, y: 0 })))
}

function selectVisibleSide(landmarks: readonly FmsPoseLandmark[]): Side {
  const leftConfidence = averageConfidence(landmarks, LEFT_CHAIN)
  const rightConfidence = averageConfidence(landmarks, RIGHT_CHAIN)
  return leftConfidence >= rightConfidence ? 'left' : 'right'
}

function toBodyScale(landmarks: readonly FmsPoseLandmark[]): number {
  const shoulderMid = midpoint(landmarks[11], landmarks[12])
  const hipMid = midpoint(landmarks[23], landmarks[24])
  const ankleMid = midpoint(landmarks[27], landmarks[28])
  return Math.max(distance(shoulderMid, hipMid), distance(hipMid, ankleMid), distance(landmarks[11], landmarks[12]))
}

function sideIndices(side: Side): {
  shoulder: number
  elbow: number
  wrist: number
  index: number
  thumb: number
  hip: number
  knee: number
  ankle: number
  heel: number
  foot: number
  ear: number
} {
  return side === 'left'
    ? { shoulder: 11, elbow: 13, wrist: 15, index: 19, thumb: 21, hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31, ear: 7 }
    : { shoulder: 12, elbow: 14, wrist: 16, index: 20, thumb: 22, hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32, ear: 8 }
}

function oppositeSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left'
}

function minValue(...values: Array<number | undefined>): number {
  return Math.min(...values.filter((value): value is number => typeof value === 'number'))
}

function maxValue(...values: Array<number | undefined>): number {
  return Math.max(...values.filter((value): value is number => typeof value === 'number'))
}

function formatMetric(label: string, value: number, unit = ''): string {
  const rounded = Math.round(value * 10) / 10
  return `${label}: ${rounded}${unit}`
}

function shoulderMobilityHandLength(landmarks: readonly FmsPoseLandmark[], side: Side): number {
  const indices = sideIndices(side)
  return maxValue(
    distance(landmarks[indices.wrist], landmarks[indices.index]),
    distance(landmarks[indices.wrist], landmarks[indices.thumb])
  )
}

function handPlacementClassForPushUp(landmarks: readonly FmsPoseLandmark[], side: Side, sex: SexForTSPU): 1 | 2 | 3 {
  const lead = sideIndices(side)
  const wrist = landmarks[lead.wrist]
  const nose = landmarks[0]
  const ear = landmarks[lead.ear]
  const shoulder = landmarks[lead.shoulder]
  const mouth = midpoint(landmarks[9], landmarks[10])
  const chinTarget = midpoint(mouth, shoulder)
  const clavicleTarget = midpoint(shoulder, midpoint(landmarks[11], landmarks[12]))
  const foreheadDistance = distance(wrist, midpoint(nose, ear))
  const chinDistance = distance(wrist, chinTarget)
  const clavicleDistance = distance(wrist, clavicleTarget)
  const closest = minValue(foreheadDistance, chinDistance, clavicleDistance)

  if (sex === 'female') {
    if (closest === chinDistance) return 3
    if (closest === clavicleDistance) return 2
    return 1
  }

  if (closest === foreheadDistance) return 3
  if (closest === chinDistance) return 2
  return 1
}

function requiredIndicesForTask(task: FmsTask): readonly number[] {
  switch (task.patternKey) {
    case 'deepSquat':
      return [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 15, 16]
    case 'hurdleStep':
      return [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
    case 'inlineLunge':
      return [0, 11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
    case 'shoulderMobility':
      return [11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24]
    case 'activeStraightLegRaise':
      return [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
    case 'trunkStabilityPushUp':
      return [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
    case 'rotaryStability':
      return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
  }
}

function defaultAssessment(phase: FmsLivePhase, lockFrames: number, guidance: string, landmarks: FmsPoseLandmark[]): FmsLiveAssessment {
  const statusLabel =
    phase === 'awaiting_pose'
      ? 'Center your body'
      : phase === 'locking'
        ? `Hold still ${lockFrames}/${FMS_LOCK_FRAME_TARGET}`
        : phase === 'ready'
          ? 'Ready'
          : phase === 'capturing'
            ? 'Capturing'
            : 'Captured'

  return {
    phase,
    statusLabel,
    guidance,
    lockFrames,
    confidence: clamp01(lockFrames / FMS_LOCK_FRAME_TARGET),
    landmarks
  }
}

export class FmsTaskAnalyzer {
  private lockFrames = 0
  private phase: FmsLivePhase = 'awaiting_pose'
  private baseline: BaselineState | null = null
  private capture: CaptureAccumulator | null = null
  private lastSample: SampleState | null = null
  private lastMovementAtMs = 0
  private readyAnnounced = false

  constructor(
    private readonly task: FmsTask,
    private readonly sex: SexForTSPU,
    private readonly mode: FmsCaptureMode = 'primary'
  ) {}

  get hasAnnouncedReady(): boolean {
    return this.readyAnnounced
  }

  markReadyAnnounced(): void {
    this.readyAnnounced = true
  }

  processFrame(frame: FmsPoseFrame, timestampMs: number): FmsLiveAssessment {
    if (!allLandmarksPresent(frame.landmarks, requiredIndicesForTask(this.task))) {
      this.lockFrames = 0
      this.phase = 'awaiting_pose'
      return defaultAssessment('awaiting_pose', 0, 'Keep the full setup and all major joints in frame.', frame.landmarks)
    }

    const sample = this.buildSample(frame.landmarks, frame.worldLandmarks, timestampMs)
    this.lastSample = sample

    if (!sample) {
      this.lockFrames = 0
      this.phase = 'awaiting_pose'
      return defaultAssessment('awaiting_pose', 0, 'Reposition to the required camera view before moving.', frame.landmarks)
    }

    if (this.phase === 'awaiting_pose' || this.phase === 'locking') {
      this.lockFrames += 1
      this.phase = this.lockFrames >= FMS_LOCK_FRAME_TARGET ? 'ready' : 'locking'

      if (this.phase === 'ready') {
        this.baseline = this.createBaseline(sample, frame.landmarks)
      }

      return defaultAssessment(
        this.phase,
        Math.min(this.lockFrames, FMS_LOCK_FRAME_TARGET),
        this.phase === 'ready' ? 'Perform the movement now.' : 'Hold still while the app verifies your setup.',
        frame.landmarks
      )
    }

    if (!this.baseline) {
      this.baseline = this.createBaseline(sample, frame.landmarks)
    }

    if (this.phase === 'ready') {
      if (!this.didMovementStart(sample, this.baseline)) {
        return defaultAssessment('ready', this.lockFrames, 'Perform the movement now.', frame.landmarks)
      }

      this.capture = this.createCaptureAccumulator(sample, timestampMs)
      this.lastMovementAtMs = timestampMs
      this.phase = 'capturing'
    }

    if (!this.capture) {
      return defaultAssessment('ready', this.lockFrames, 'Perform the movement now.', frame.landmarks)
    }

    this.updateCaptureAccumulator(this.capture, sample, timestampMs)

    if (!this.didMovementComplete(sample, this.baseline, this.capture, timestampMs)) {
      return {
        ...defaultAssessment('capturing', this.lockFrames, 'Keep moving until you return to the finish position.', frame.landmarks),
        confidence: clamp01(sample.bodyScale > 0 ? mean([sample.bodyScale, sample.torsoVerticalErrorDeg]) / 2 : 0.6)
      }
    }

    const capture = this.scoreCapture(this.capture)
    this.phase = 'captured'
    return {
      phase: 'captured',
      statusLabel: 'Movement captured',
      guidance: 'Review the result, report pain if needed, or retry this attempt.',
      lockFrames: this.lockFrames,
      confidence: capture.confidence,
      landmarks: frame.landmarks,
      capture
    }
  }

  private createBaseline(sample: SampleState, landmarks: readonly FmsPoseLandmark[]): BaselineState {
    return {
      side: sample.side,
      bodyScale: sample.bodyScale,
      stanceWidthNorm: normalize(landmarks[23].x - landmarks[24].x, sample.bodyScale),
      torsoVerticalErrorDeg: sample.torsoVerticalErrorDeg,
      kneeAngleDeg: sample.kneeAngleDeg ?? 180,
      hipAngleDeg: sample.hipAngleDeg ?? 180,
      hipX: sample.hipX,
      hipY: midpoint(landmarks[23], landmarks[24]).y,
      movingAnkleY: sample.movingAnkleY,
      movingWristY: sample.movingWristY,
      movingWristX: sample.movingWristX,
      movingAnkleX: sample.movingAnkleX,
      wristDistanceNorm: sample.wristsDistanceNorm,
      shoulderLiftY: midpoint(landmarks[11], landmarks[12]).y,
      hipLiftY: midpoint(landmarks[23], landmarks[24]).y
    }
  }

  private buildSample(
    landmarks: readonly FmsPoseLandmark[],
    worldLandmarks: readonly FmsPoseLandmark[],
    timestampMs: number
  ): SampleState | null {
    if (!allLandmarksPresent(landmarks, FRONT_CHAIN)) return null

    const bodyScale = toBodyScale(landmarks)
    const visibleSide = this.task.side === 'left' || this.task.side === 'right' ? this.task.side : selectVisibleSide(landmarks)
    const lead = sideIndices(visibleSide)
    const rearSide = oppositeSide(visibleSide)
    const rear = sideIndices(rearSide)
    const shoulderMid = midpoint(landmarks[11], landmarks[12])
    const hipMid = midpoint(landmarks[23], landmarks[24])
    const torsoVerticalErrorDeg = verticalityErrorDeg(shoulderMid, hipMid)
    const torsoSwayDeg = torsoVerticalErrorDeg
    const pelvisTiltDeg = angleDifferenceDeg(segmentAngleDeg(landmarks[23], landmarks[24]), 0)
    const balanceRecoveryNorm = this.baseline ? normalize(hipMid.x - this.baseline.hipX, bodyScale) : 0

    const common: SampleState = {
      timestampMs,
      side: visibleSide,
      bodyScale,
      torsoVerticalErrorDeg,
      hipX: hipMid.x,
      hipY: hipMid.y,
      trunkSwayDeg: torsoSwayDeg,
      pelvisTiltDeg,
      balanceRecoveryNorm
    }

    switch (this.task.patternKey) {
      case 'deepSquat': {
        const kneeAngleDeg = jointAngle(landmarks[lead.hip], landmarks[lead.knee], landmarks[lead.ankle])
        const hipAngleDeg = jointAngle(landmarks[lead.shoulder], landmarks[lead.hip], landmarks[lead.knee])
        const tibiaAngleDeg = segmentAngleDeg(landmarks[lead.knee], landmarks[lead.ankle])
        const torsoAngleDeg = segmentAngleDeg(landmarks[lead.shoulder], landmarks[lead.hip])
        const wristMid = midpoint(landmarks[15], landmarks[16])
        const footMid = midpoint(landmarks[lead.heel], landmarks[lead.foot])

        return {
          ...common,
          kneeAngleDeg,
          hipAngleDeg,
          femurAngleToHorizontalDeg: segmentAngleToHorizontalDeg(landmarks[lead.hip], landmarks[lead.knee]),
          torsoTibiaParallelErrorDeg: angleDifferenceDeg(torsoAngleDeg, tibiaAngleDeg),
          lumbarProxyDeg: hipAngleDeg,
          kneeOverFootOffsetNorm: normalize(landmarks[lead.knee].x - footMid.x, bodyScale),
          dowelOverMidfootOffsetNorm: normalize(wristMid.x - footMid.x, bodyScale)
        }
      }
      case 'hurdleStep': {
        const move = sideIndices(this.task.side === 'left' ? 'left' : 'right')
        const stance = sideIndices(this.task.side === 'left' ? 'right' : 'left')
        return {
          ...common,
          movingAnkleY: landmarks[move.ankle].y,
          movingAnkleLiftNorm: normalize(landmarks[move.ankle].y - landmarks[stance.ankle].y, bodyScale),
          hipKneeAnkleAlignmentError: normalize(landmarks[move.hip].x - landmarks[move.ankle].x, bodyScale),
          kneeOverFootOffsetNorm: normalize(landmarks[move.knee].x - landmarks[move.foot].x, bodyScale)
        }
      }
      case 'inlineLunge': {
        const frontSide = this.task.side === 'left' ? 'left' : 'right'
        const rearSideName = oppositeSide(frontSide)
        const front = sideIndices(frontSide)
        const back = sideIndices(rearSideName)
        const headPoint = landmarkIsConfident(landmarks[0]) ? landmarks[0] : midpoint(landmarks[front.ear], landmarks[back.ear])

        return {
          ...common,
          headShoulderHipVerticalityError: verticalityErrorDeg(headPoint, hipMid),
          rearKneeTargetDistanceNorm: normalize(distance(landmarks[back.knee], landmarks[front.heel]), bodyScale),
          frontFootSagittalAlignmentError: normalize(landmarks[front.knee].x - landmarks[front.ankle].x, bodyScale),
          movingAnkleY: landmarks[back.knee].y,
          kneeAngleDeg: jointAngle(landmarks[front.hip], landmarks[front.knee], landmarks[front.ankle])
        }
      }
      case 'shoulderMobility': {
        const topSide = this.task.side === 'left' ? 'left' : 'right'
        const bottomSide = oppositeSide(topSide)
        const top = sideIndices(topSide)
        const bottom = sideIndices(bottomSide)
        const wristsDistanceNorm = normalize(distance(landmarks[top.wrist], landmarks[bottom.wrist]), bodyScale)
        const handLengthNorm = normalize(
          (shoulderMobilityHandLength(landmarks, topSide) + shoulderMobilityHandLength(landmarks, bottomSide)) / 2,
          bodyScale
        )
        const previousDistanceNorm = this.lastSample?.wristsDistanceNorm ?? wristsDistanceNorm

        return {
          ...common,
          wristsDistanceNorm,
          handLengthNorm,
          creepMotionNorm: Math.max(0, previousDistanceNorm - wristsDistanceNorm)
        }
      }
      case 'activeStraightLegRaise': {
        const move = sideIndices(this.task.side === 'left' ? 'left' : 'right')
        const grounded = sideIndices(this.task.side === 'left' ? 'right' : 'left')
        return {
          ...common,
          movingAnkleY: landmarks[move.ankle].y,
          movingAnkleProjectionY: landmarks[move.ankle].y,
          movingKneeAngleDeg: jointAngle(landmarks[move.hip], landmarks[move.knee], landmarks[move.ankle]),
          groundedKneeAngleDeg: jointAngle(landmarks[grounded.hip], landmarks[grounded.knee], landmarks[grounded.ankle]),
          groundedHeelLiftNorm: normalize(landmarks[grounded.heel].y - landmarks[grounded.ankle].y, bodyScale),
          hipAngleDeg: jointAngle(landmarks[move.shoulder], landmarks[move.hip], landmarks[move.knee])
        }
      }
      case 'trunkStabilityPushUp': {
        const side = visibleSide
        const forward = sideIndices(side)
        const bodyLineErrorDeg = angleDifferenceDeg(
          segmentAngleDeg(landmarks[forward.shoulder], landmarks[forward.hip]),
          segmentAngleDeg(landmarks[forward.hip], landmarks[forward.ankle])
        )
        const hipToLineY =
          landmarks[forward.hip].y -
          (landmarks[forward.shoulder].y +
            ((landmarks[forward.ankle].y - landmarks[forward.shoulder].y) *
              (landmarks[forward.hip].x - landmarks[forward.shoulder].x)) /
              Math.max(0.001, landmarks[forward.ankle].x - landmarks[forward.shoulder].x))

        const shoulderLiftY = midpoint(landmarks[11], landmarks[12]).y
        const hipLiftY = midpoint(landmarks[23], landmarks[24]).y

        return {
          ...common,
          elbowExtensionDeg: jointAngle(landmarks[forward.shoulder], landmarks[forward.elbow], landmarks[forward.wrist]),
          hipSagNorm: normalize(hipToLineY, bodyScale),
          bodyLineErrorDeg,
          spineLagProxyDeg: angleDifferenceDeg(segmentAngleDeg(landmarks[forward.shoulder], landmarks[forward.hip]), 0),
          handPlacementClass: handPlacementClassForPushUp(landmarks, side, this.sex),
          movingWristY: landmarks[forward.wrist].y,
          shoulderLiftY,
          hipLiftY
        }
      }
      case 'rotaryStability': {
        const armSide = this.task.side === 'left' ? 'left' : 'right'
        const legSide = this.mode === 'diagonalRegression' ? oppositeSide(armSide) : armSide
        const arm = sideIndices(armSide)
        const leg = sideIndices(legSide)
        const elbowKneeDistance = normalize(distance(landmarks[arm.elbow], landmarks[leg.knee]), bodyScale)
        return {
          ...common,
          movingWristX: landmarks[arm.wrist].x,
          movingWristY: landmarks[arm.wrist].y,
          movingAnkleX: landmarks[leg.ankle].x,
          movingAnkleY: landmarks[leg.ankle].y,
          sameSideExtensionNorm: normalize(distance(landmarks[arm.wrist], landmarks[arm.shoulder]), bodyScale) +
            normalize(distance(landmarks[leg.ankle], landmarks[leg.hip]), bodyScale),
          elbowKneeTouchDistanceNorm: elbowKneeDistance,
          midlineDriftNorm: normalize(midpoint(landmarks[arm.wrist], landmarks[leg.ankle]).x - midpoint(landmarks[23], landmarks[24]).x, bodyScale),
          trunkRotationDeg:
            worldLandmarks.length >= 25
              ? Math.abs(toDegrees(Math.atan2((worldLandmarks[11].z ?? 0) - (worldLandmarks[12].z ?? 0), 1)))
              : angleDifferenceDeg(segmentAngleDeg(landmarks[11], landmarks[12]), 0)
        }
      }
    }
  }

  private didMovementStart(sample: SampleState, baseline: BaselineState): boolean {
    switch (this.task.patternKey) {
      case 'deepSquat':
        return (
          (baseline.kneeAngleDeg - (sample.kneeAngleDeg ?? baseline.kneeAngleDeg)) >= FMS_TUNING.deepSquat.startKneeDropDeg ||
          normalize((sample.hipY ?? baseline.hipY) - baseline.hipY, baseline.bodyScale) >= FMS_TUNING.deepSquat.startHipDropNorm
        )
      case 'hurdleStep':
        return normalize((baseline.movingAnkleY ?? sample.movingAnkleY ?? 0) - (sample.movingAnkleY ?? 0), baseline.bodyScale) >= FMS_TUNING.hurdleStep.startLiftNorm
      case 'inlineLunge':
        return normalize((sample.movingAnkleY ?? 0) - (baseline.movingAnkleY ?? sample.movingAnkleY ?? 0), baseline.bodyScale) >= FMS_TUNING.inlineLunge.startRearKneeDropNorm
      case 'shoulderMobility':
        return Math.abs((baseline.wristDistanceNorm ?? sample.wristsDistanceNorm ?? 0) - (sample.wristsDistanceNorm ?? 0)) >= FMS_TUNING.shoulderMobility.startDistanceChangeNorm
      case 'activeStraightLegRaise':
        return normalize((baseline.movingAnkleY ?? sample.movingAnkleY ?? 0) - (sample.movingAnkleY ?? 0), baseline.bodyScale) >= FMS_TUNING.activeStraightLegRaise.startLiftNorm
      case 'trunkStabilityPushUp':
        return (
          normalize((baseline.shoulderLiftY ?? sample.shoulderLiftY ?? 0) - (sample.shoulderLiftY ?? 0), baseline.bodyScale) >= FMS_TUNING.trunkStabilityPushUp.startLiftNorm ||
          normalize((baseline.hipLiftY ?? sample.hipLiftY ?? 0) - (sample.hipLiftY ?? 0), baseline.bodyScale) >= FMS_TUNING.trunkStabilityPushUp.startLiftNorm
        )
      case 'rotaryStability':
        return (
          normalize((sample.movingWristX ?? 0) - (baseline.movingWristX ?? sample.movingWristX ?? 0), baseline.bodyScale) >= FMS_TUNING.rotaryStability.extensionStartNorm ||
          normalize((sample.movingAnkleX ?? 0) - (baseline.movingAnkleX ?? sample.movingAnkleX ?? 0), baseline.bodyScale) >= FMS_TUNING.rotaryStability.extensionStartNorm
        )
    }
  }

  private createCaptureAccumulator(sample: SampleState, timestampMs: number): CaptureAccumulator {
    return {
      startedAtMs: timestampMs,
      movementDetectedAtMs: timestampMs,
      maxMovementNorm: 0,
      minKneeAngleDeg: sample.kneeAngleDeg ?? 180,
      maxKneeAngleDeg: sample.kneeAngleDeg ?? 180,
      minHipAngleDeg: sample.hipAngleDeg ?? 180,
      maxHipAngleDeg: sample.hipAngleDeg ?? 180,
      minHipY: sample.movingAnkleY ?? 1,
      maxHipY: sample.movingAnkleY ?? 0,
      minTorsoTibiaParallelErrorDeg: sample.torsoTibiaParallelErrorDeg ?? 180,
      maxTorsoTibiaParallelErrorDeg: sample.torsoTibiaParallelErrorDeg ?? 0,
      minTorsoVerticalErrorDeg: sample.torsoVerticalErrorDeg,
      maxTorsoVerticalErrorDeg: sample.torsoVerticalErrorDeg,
      minLumbarProxyDeg: sample.lumbarProxyDeg ?? 180,
      maxLumbarProxyDeg: sample.lumbarProxyDeg ?? 0,
      minKneeOverFootOffsetNorm: sample.kneeOverFootOffsetNorm ?? 1,
      maxKneeOverFootOffsetNorm: sample.kneeOverFootOffsetNorm ?? 0,
      minDowelOverMidfootOffsetNorm: sample.dowelOverMidfootOffsetNorm ?? 1,
      maxDowelOverMidfootOffsetNorm: sample.dowelOverMidfootOffsetNorm ?? 0,
      minMovingAnkleY: sample.movingAnkleY ?? 1,
      maxMovingAnkleY: sample.movingAnkleY ?? 0,
      minMovingAnkleX: sample.movingAnkleX ?? 1,
      maxMovingAnkleX: sample.movingAnkleX ?? 0,
      maxMovingAnkleLiftNorm: sample.movingAnkleLiftNorm ?? 0,
      minGroundedHeelLiftNorm: sample.groundedHeelLiftNorm ?? 0,
      maxGroundedHeelLiftNorm: sample.groundedHeelLiftNorm ?? 0,
      minMovingKneeAngleDeg: sample.movingKneeAngleDeg ?? 180,
      minGroundedKneeAngleDeg: sample.groundedKneeAngleDeg ?? 180,
      maxHipKneeAnkleAlignmentError: sample.hipKneeAnkleAlignmentError ?? 0,
      maxPelvisTiltDeg: sample.pelvisTiltDeg ?? 0,
      maxTrunkSwayDeg: sample.trunkSwayDeg ?? 0,
      maxBalanceRecoveryNorm: sample.balanceRecoveryNorm ?? 0,
      minRearKneeTargetDistanceNorm: sample.rearKneeTargetDistanceNorm ?? 1,
      maxFrontFootSagittalAlignmentError: sample.frontFootSagittalAlignmentError ?? 0,
      minWristsDistanceNorm: sample.wristsDistanceNorm ?? 1,
      handLengthNorm: sample.handLengthNorm ?? 0,
      maxCreepMotionNorm: sample.creepMotionNorm ?? 0,
      maxElbowExtensionDeg: sample.elbowExtensionDeg ?? 0,
      minHipSagNorm: sample.hipSagNorm ?? 1,
      maxHipSagNorm: sample.hipSagNorm ?? 0,
      maxBodyLineErrorDeg: sample.bodyLineErrorDeg ?? 0,
      maxSpineLagProxyDeg: sample.spineLagProxyDeg ?? 0,
      bestHandPlacementClass: sample.handPlacementClass ?? 1,
      maxSameSideExtensionNorm: sample.sameSideExtensionNorm ?? 0,
      minElbowKneeTouchDistanceNorm: sample.elbowKneeTouchDistanceNorm ?? 1,
      maxMidlineDriftNorm: sample.midlineDriftNorm ?? 0,
      maxTrunkRotationDeg: sample.trunkRotationDeg ?? 0,
      achievedReturn: false,
      achievedTouch: false
    }
  }

  private updateCaptureAccumulator(accumulator: CaptureAccumulator, sample: SampleState, timestampMs: number): void {
    accumulator.maxMovementNorm = Math.max(
      accumulator.maxMovementNorm,
      sample.movingAnkleLiftNorm ?? 0,
      sample.sameSideExtensionNorm ?? 0,
      sample.wristsDistanceNorm ? 1 - sample.wristsDistanceNorm : 0
    )
    accumulator.minKneeAngleDeg = Math.min(accumulator.minKneeAngleDeg, sample.kneeAngleDeg ?? accumulator.minKneeAngleDeg)
    accumulator.maxKneeAngleDeg = Math.max(accumulator.maxKneeAngleDeg, sample.kneeAngleDeg ?? accumulator.maxKneeAngleDeg)
    accumulator.minHipAngleDeg = Math.min(accumulator.minHipAngleDeg, sample.hipAngleDeg ?? accumulator.minHipAngleDeg)
    accumulator.maxHipAngleDeg = Math.max(accumulator.maxHipAngleDeg, sample.hipAngleDeg ?? accumulator.maxHipAngleDeg)
    accumulator.minTorsoTibiaParallelErrorDeg = Math.min(
      accumulator.minTorsoTibiaParallelErrorDeg,
      sample.torsoTibiaParallelErrorDeg ?? accumulator.minTorsoTibiaParallelErrorDeg
    )
    accumulator.maxTorsoTibiaParallelErrorDeg = Math.max(
      accumulator.maxTorsoTibiaParallelErrorDeg,
      sample.torsoTibiaParallelErrorDeg ?? accumulator.maxTorsoTibiaParallelErrorDeg
    )
    accumulator.minTorsoVerticalErrorDeg = Math.min(accumulator.minTorsoVerticalErrorDeg, sample.torsoVerticalErrorDeg)
    accumulator.maxTorsoVerticalErrorDeg = Math.max(accumulator.maxTorsoVerticalErrorDeg, sample.torsoVerticalErrorDeg)
    accumulator.minLumbarProxyDeg = Math.min(accumulator.minLumbarProxyDeg, sample.lumbarProxyDeg ?? accumulator.minLumbarProxyDeg)
    accumulator.maxLumbarProxyDeg = Math.max(accumulator.maxLumbarProxyDeg, sample.lumbarProxyDeg ?? accumulator.maxLumbarProxyDeg)
    accumulator.minKneeOverFootOffsetNorm = Math.min(
      accumulator.minKneeOverFootOffsetNorm,
      sample.kneeOverFootOffsetNorm ?? accumulator.minKneeOverFootOffsetNorm
    )
    accumulator.maxKneeOverFootOffsetNorm = Math.max(
      accumulator.maxKneeOverFootOffsetNorm,
      sample.kneeOverFootOffsetNorm ?? accumulator.maxKneeOverFootOffsetNorm
    )
    accumulator.minDowelOverMidfootOffsetNorm = Math.min(
      accumulator.minDowelOverMidfootOffsetNorm,
      sample.dowelOverMidfootOffsetNorm ?? accumulator.minDowelOverMidfootOffsetNorm
    )
    accumulator.maxDowelOverMidfootOffsetNorm = Math.max(
      accumulator.maxDowelOverMidfootOffsetNorm,
      sample.dowelOverMidfootOffsetNorm ?? accumulator.maxDowelOverMidfootOffsetNorm
    )
    accumulator.minMovingAnkleY = Math.min(accumulator.minMovingAnkleY, sample.movingAnkleY ?? accumulator.minMovingAnkleY)
    accumulator.maxMovingAnkleY = Math.max(accumulator.maxMovingAnkleY, sample.movingAnkleY ?? accumulator.maxMovingAnkleY)
    accumulator.minMovingAnkleX = Math.min(accumulator.minMovingAnkleX, sample.movingAnkleX ?? accumulator.minMovingAnkleX)
    accumulator.maxMovingAnkleX = Math.max(accumulator.maxMovingAnkleX, sample.movingAnkleX ?? accumulator.maxMovingAnkleX)
    accumulator.maxMovingAnkleLiftNorm = Math.max(accumulator.maxMovingAnkleLiftNorm, sample.movingAnkleLiftNorm ?? 0)
    accumulator.minGroundedHeelLiftNorm = Math.min(accumulator.minGroundedHeelLiftNorm, sample.groundedHeelLiftNorm ?? accumulator.minGroundedHeelLiftNorm)
    accumulator.maxGroundedHeelLiftNorm = Math.max(accumulator.maxGroundedHeelLiftNorm, sample.groundedHeelLiftNorm ?? accumulator.maxGroundedHeelLiftNorm)
    accumulator.minMovingKneeAngleDeg = Math.min(accumulator.minMovingKneeAngleDeg, sample.movingKneeAngleDeg ?? accumulator.minMovingKneeAngleDeg)
    accumulator.minGroundedKneeAngleDeg = Math.min(accumulator.minGroundedKneeAngleDeg, sample.groundedKneeAngleDeg ?? accumulator.minGroundedKneeAngleDeg)
    accumulator.maxHipKneeAnkleAlignmentError = Math.max(accumulator.maxHipKneeAnkleAlignmentError, sample.hipKneeAnkleAlignmentError ?? 0)
    accumulator.maxPelvisTiltDeg = Math.max(accumulator.maxPelvisTiltDeg, sample.pelvisTiltDeg ?? 0)
    accumulator.maxTrunkSwayDeg = Math.max(accumulator.maxTrunkSwayDeg, sample.trunkSwayDeg ?? 0)
    accumulator.maxBalanceRecoveryNorm = Math.max(accumulator.maxBalanceRecoveryNorm, sample.balanceRecoveryNorm ?? 0)
    accumulator.minRearKneeTargetDistanceNorm = Math.min(
      accumulator.minRearKneeTargetDistanceNorm,
      sample.rearKneeTargetDistanceNorm ?? accumulator.minRearKneeTargetDistanceNorm
    )
    accumulator.maxFrontFootSagittalAlignmentError = Math.max(
      accumulator.maxFrontFootSagittalAlignmentError,
      sample.frontFootSagittalAlignmentError ?? accumulator.maxFrontFootSagittalAlignmentError
    )
    accumulator.minWristsDistanceNorm = Math.min(accumulator.minWristsDistanceNorm, sample.wristsDistanceNorm ?? accumulator.minWristsDistanceNorm)
    accumulator.handLengthNorm = Math.max(accumulator.handLengthNorm, sample.handLengthNorm ?? 0)
    accumulator.maxCreepMotionNorm = Math.max(accumulator.maxCreepMotionNorm, sample.creepMotionNorm ?? 0)
    accumulator.maxElbowExtensionDeg = Math.max(accumulator.maxElbowExtensionDeg, sample.elbowExtensionDeg ?? 0)
    accumulator.minHipSagNorm = Math.min(accumulator.minHipSagNorm, sample.hipSagNorm ?? accumulator.minHipSagNorm)
    accumulator.maxHipSagNorm = Math.max(accumulator.maxHipSagNorm, sample.hipSagNorm ?? accumulator.maxHipSagNorm)
    accumulator.maxBodyLineErrorDeg = Math.max(accumulator.maxBodyLineErrorDeg, sample.bodyLineErrorDeg ?? 0)
    accumulator.maxSpineLagProxyDeg = Math.max(accumulator.maxSpineLagProxyDeg, sample.spineLagProxyDeg ?? 0)
    accumulator.bestHandPlacementClass = Math.max(accumulator.bestHandPlacementClass, sample.handPlacementClass ?? 1) as 1 | 2 | 3
    accumulator.maxSameSideExtensionNorm = Math.max(accumulator.maxSameSideExtensionNorm, sample.sameSideExtensionNorm ?? 0)
    accumulator.minElbowKneeTouchDistanceNorm = Math.min(
      accumulator.minElbowKneeTouchDistanceNorm,
      sample.elbowKneeTouchDistanceNorm ?? accumulator.minElbowKneeTouchDistanceNorm
    )
    accumulator.maxMidlineDriftNorm = Math.max(accumulator.maxMidlineDriftNorm, sample.midlineDriftNorm ?? 0)
    accumulator.maxTrunkRotationDeg = Math.max(accumulator.maxTrunkRotationDeg, sample.trunkRotationDeg ?? 0)
    accumulator.achievedTouch =
      accumulator.achievedTouch || (sample.elbowKneeTouchDistanceNorm ?? 1) <= 0.1

    if (this.baseline && this.hasReturnedToStart(sample, this.baseline)) {
      accumulator.achievedReturn = true
      this.lastMovementAtMs = timestampMs
    }
  }

  private hasReturnedToStart(sample: SampleState, baseline: BaselineState): boolean {
    switch (this.task.patternKey) {
      case 'deepSquat':
        return (
          Math.abs((sample.kneeAngleDeg ?? baseline.kneeAngleDeg) - baseline.kneeAngleDeg) <= FMS_TUNING.deepSquat.returnKneeWindowDeg &&
          normalize(sample.hipY - baseline.hipY, baseline.bodyScale) <= FMS_TUNING.deepSquat.returnHipWindowNorm
        )
      case 'hurdleStep':
        return normalize((sample.movingAnkleY ?? 0) - (baseline.movingAnkleY ?? sample.movingAnkleY ?? 0), baseline.bodyScale) <= FMS_TUNING.hurdleStep.returnWindowNorm
      case 'inlineLunge':
        return normalize((sample.movingAnkleY ?? 0) - (baseline.movingAnkleY ?? sample.movingAnkleY ?? 0), baseline.bodyScale) <= FMS_TUNING.inlineLunge.returnWindowNorm
      case 'shoulderMobility':
        return false
      case 'activeStraightLegRaise':
        return normalize((sample.movingAnkleY ?? 0) - (baseline.movingAnkleY ?? sample.movingAnkleY ?? 0), baseline.bodyScale) <= FMS_TUNING.activeStraightLegRaise.returnWindowNorm
      case 'trunkStabilityPushUp':
        return (sample.elbowExtensionDeg ?? 0) >= 150
      case 'rotaryStability':
        return (
          normalize((sample.movingWristX ?? 0) - (baseline.movingWristX ?? sample.movingWristX ?? 0), baseline.bodyScale) <= FMS_TUNING.rotaryStability.returnWindowNorm &&
          normalize((sample.movingAnkleX ?? 0) - (baseline.movingAnkleX ?? sample.movingAnkleX ?? 0), baseline.bodyScale) <= FMS_TUNING.rotaryStability.returnWindowNorm
        )
    }
  }

  private didMovementComplete(
    sample: SampleState,
    baseline: BaselineState,
    accumulator: CaptureAccumulator,
    timestampMs: number
  ): boolean {
    const elapsedMs = timestampMs - accumulator.startedAtMs

    switch (this.task.patternKey) {
      case 'shoulderMobility':
        return elapsedMs >= FMS_TUNING.shoulderMobility.settleWindowMs && accumulator.maxCreepMotionNorm < 0.12
          ? true
          : elapsedMs >= FMS_TUNING.shoulderMobility.maxCaptureMs
      case 'trunkStabilityPushUp':
        return (
          (sample.elbowExtensionDeg ?? 0) >= 150 &&
          normalize((baseline.shoulderLiftY ?? sample.shoulderLiftY ?? 0) - (sample.shoulderLiftY ?? 0), baseline.bodyScale) >= 0.025 &&
          elapsedMs >= FMS_TUNING.trunkStabilityPushUp.topHoldMs
        )
      case 'rotaryStability':
        return accumulator.achievedTouch && accumulator.achievedReturn && elapsedMs >= 900
      default:
        return accumulator.achievedReturn && elapsedMs >= 900
    }
  }

  private scoreCapture(accumulator: CaptureAccumulator): FmsLiveCapture {
    switch (this.task.patternKey) {
      case 'deepSquat':
        return this.scoreDeepSquat(accumulator)
      case 'hurdleStep':
        return this.scoreHurdleStep(accumulator)
      case 'inlineLunge':
        return this.scoreInlineLunge(accumulator)
      case 'shoulderMobility':
        return this.scoreShoulderMobility(accumulator)
      case 'activeStraightLegRaise':
        return this.scoreActiveStraightLegRaise(accumulator)
      case 'trunkStabilityPushUp':
        return this.scoreTrunkStabilityPushUp(accumulator)
      case 'rotaryStability':
        return this.scoreRotaryStability(accumulator)
    }
  }

  private scoreDeepSquat(accumulator: CaptureAccumulator): FmsLiveCapture {
    const femurBelowHorizontal = (this.lastSample?.femurAngleToHorizontalDeg ?? 0) <= -10 || accumulator.minHipAngleDeg <= 95
    const passesBase =
      accumulator.maxTorsoTibiaParallelErrorDeg <= 15 &&
      femurBelowHorizontal &&
      accumulator.maxKneeOverFootOffsetNorm <= 0.08 &&
      accumulator.minLumbarProxyDeg >= 145 &&
      accumulator.maxDowelOverMidfootOffsetNorm <= 0.12
    const score = passesBase ? (this.mode === 'heelsElevated' ? 2 : 3) : 1
    const notes: string[] = []

    if (!passesBase) {
      if (accumulator.maxTorsoTibiaParallelErrorDeg > 15) notes.push('Torso and tibia did not stay parallel enough at depth.')
      if (!femurBelowHorizontal) notes.push('Depth did not clearly reach the below-horizontal target.')
      if (accumulator.minLumbarProxyDeg < 145) notes.push('The trunk folded too much at the bottom position.')
      if (this.mode !== 'heelsElevated') notes.push('Retry with heels elevated on the board if score 3 is not available.')
    } else if (this.mode === 'heelsElevated') {
      notes.push('The movement met the board-assisted score 2 pathway.')
    }

    return {
      score,
      confidence: clamp01(0.55 + (passesBase ? 0.28 : 0.12)),
      notes,
      metrics: [
        formatMetric('Parallel error', accumulator.maxTorsoTibiaParallelErrorDeg, ' deg'),
        formatMetric('Knee over foot', accumulator.maxKneeOverFootOffsetNorm * 100, '%'),
        formatMetric('Lumbar proxy', accumulator.minLumbarProxyDeg, ' deg')
      ],
      mode: this.mode
    }
  }

  private scoreHurdleStep(accumulator: CaptureAccumulator): FmsLiveCapture {
    const completed = accumulator.maxMovingAnkleLiftNorm >= 0.1
    const cleanAlignment =
      accumulator.maxTrunkSwayDeg <= 10 &&
      accumulator.maxPelvisTiltDeg <= 10 &&
      accumulator.maxHipKneeAnkleAlignmentError <= 0.08 &&
      accumulator.maxBalanceRecoveryNorm <= 0.05
    const score = !completed || accumulator.maxBalanceRecoveryNorm > 0.1 ? 1 : cleanAlignment ? 3 : 2
    const notes: string[] = []

    if (!completed) notes.push('The step did not clear a strong enough lift-and-return pattern.')
    if (accumulator.maxBalanceRecoveryNorm > 0.1) notes.push('Balance recovery was detected during the step.')
    if (completed && !cleanAlignment) notes.push('The step completed, but alignment or trunk control drifted.')
    notes.push('Hurdle contact still needs manual review because the object itself is not detected.')

    return {
      score,
      confidence: clamp01(score === 3 ? 0.8 : 0.64),
      notes,
      metrics: [
        formatMetric('Trunk sway', accumulator.maxTrunkSwayDeg, ' deg'),
        formatMetric('Pelvis tilt', accumulator.maxPelvisTiltDeg, ' deg'),
        formatMetric('Alignment error', accumulator.maxHipKneeAnkleAlignmentError * 100, '%')
      ],
      mode: this.mode
    }
  }

  private scoreInlineLunge(accumulator: CaptureAccumulator): FmsLiveCapture {
    const completed = accumulator.minRearKneeTargetDistanceNorm <= 0.18
    const clean =
      accumulator.maxTrunkSwayDeg <= 10 &&
      accumulator.maxFrontFootSagittalAlignmentError <= 0.08 &&
      accumulator.minRearKneeTargetDistanceNorm <= 0.08 &&
      accumulator.maxBalanceRecoveryNorm <= 0.06 &&
      accumulator.maxTorsoVerticalErrorDeg <= 12
    const score = accumulator.maxBalanceRecoveryNorm > 0.1 || !completed ? 1 : clean ? 3 : 2
    const notes: string[] = []

    if (!completed) notes.push('The rear knee did not track close enough to the heel target.')
    if (accumulator.maxBalanceRecoveryNorm > 0.1) notes.push('Balance loss was detected during the lunge.')
    if (completed && !clean) notes.push('The lunge completed, but posture or sagittal control drifted.')
    notes.push('Dowel-body contact still needs manual review because this MVP uses pose-only proxies.')

    return {
      score,
      confidence: clamp01(score === 3 ? 0.76 : 0.6),
      notes,
      metrics: [
        formatMetric('Rear knee target', accumulator.minRearKneeTargetDistanceNorm * 100, '%'),
        formatMetric('Front foot alignment', accumulator.maxFrontFootSagittalAlignmentError * 100, '%'),
        formatMetric('Torso sway', accumulator.maxTrunkSwayDeg, ' deg')
      ],
      mode: this.mode
    }
  }

  private scoreShoulderMobility(accumulator: CaptureAccumulator): FmsLiveCapture {
    const ratio = accumulator.handLengthNorm > 0 ? accumulator.minWristsDistanceNorm / accumulator.handLengthNorm : 99
    const score = ratio <= 1 ? 3 : ratio <= 1.5 ? 2 : 1
    const notes: string[] = []

    if (accumulator.maxCreepMotionNorm > 0.08) notes.push('The wrists appeared to creep closer after the first placement.')
    if (score === 1) notes.push('The wrist distance stayed wider than one and a half hand lengths.')

    return {
      score,
      confidence: clamp01(0.58 + (score === 3 ? 0.22 : 0.12)),
      notes,
      metrics: [
        formatMetric('Wrist distance', accumulator.minWristsDistanceNorm * 100, '% body scale'),
        formatMetric('Hand length proxy', accumulator.handLengthNorm * 100, '% body scale'),
        formatMetric('Distance ratio', ratio)
      ],
      mode: this.mode
    }
  }

  private scoreActiveStraightLegRaise(accumulator: CaptureAccumulator): FmsLiveCapture {
    if (!this.lastSample) {
      return {
        score: 1,
        confidence: 0.4,
        notes: ['The raise could not be measured clearly.'],
        metrics: [],
        mode: this.mode
      }
    }

    const projectedY = accumulator.minMovingAnkleY
    const side = this.task.side === 'left' ? 'left' : 'right'
    const grounded = sideIndices(oppositeSide(side))
    const groundedHipY = this.lastSample.side === 'left' ? this.lastSample.movingAnkleProjectionY ?? projectedY : projectedY
    const groundedKneeY = groundedHipY + this.lastSample.bodyScale * 0.22
    const midThighY = (groundedHipY + groundedKneeY) / 2
    const zone = projectedY <= midThighY ? 3 : projectedY <= groundedKneeY ? 2 : 1
    const kneeIntegrity =
      accumulator.minMovingKneeAngleDeg >= 160 &&
      accumulator.minGroundedKneeAngleDeg >= 170 &&
      accumulator.maxGroundedHeelLiftNorm <= 0.03
    const score = kneeIntegrity ? zone : Math.min(zone, 1) as 1 | 2 | 3
    const notes: string[] = []

    if (!kneeIntegrity) notes.push('The moving or grounded leg lost the straight-leg requirement.')
    if (score === 1) notes.push('The ankle projection stayed below the grounded knee zone.')

    return {
      score,
      confidence: clamp01(0.62 + (zone === 3 ? 0.18 : 0.08)),
      notes,
      metrics: [
        formatMetric('Moving knee angle', accumulator.minMovingKneeAngleDeg, ' deg'),
        formatMetric('Grounded knee angle', accumulator.minGroundedKneeAngleDeg, ' deg'),
        formatMetric('Grounded heel lift', accumulator.maxGroundedHeelLiftNorm * 100, '%')
      ],
      mode: this.mode
    }
  }

  private scoreTrunkStabilityPushUp(accumulator: CaptureAccumulator): FmsLiveCapture {
    const repCompleted = accumulator.maxElbowExtensionDeg >= 150
    const cleanBodyLine =
      accumulator.maxBodyLineErrorDeg <= 14 &&
      accumulator.maxHipSagNorm <= 0.08 &&
      accumulator.maxSpineLagProxyDeg <= 20
    const handPlacement = accumulator.bestHandPlacementClass
    let score: 1 | 2 | 3 = 1

    if (repCompleted && cleanBodyLine) {
      if (handPlacement === 3) score = 3
      else if (handPlacement >= 2) score = 2
    }

    const notes: string[] = []
    if (!repCompleted) notes.push('The push-up did not reach a clear rigid-body top position.')
    if (repCompleted && !cleanBodyLine) notes.push('The trunk rose, but the body line sagged more than the target range.')
    if (repCompleted && cleanBodyLine && handPlacement === 1) notes.push('The hand placement looked easier than the official score 2 line.')

    return {
      score,
      confidence: clamp01(0.58 + (score === 3 ? 0.2 : score === 2 ? 0.14 : 0.06)),
      notes,
      metrics: [
        formatMetric('Elbow extension', accumulator.maxElbowExtensionDeg, ' deg'),
        formatMetric('Hip sag', accumulator.maxHipSagNorm * 100, '%'),
        formatMetric('Body line error', accumulator.maxBodyLineErrorDeg, ' deg')
      ],
      mode: this.mode
    }
  }

  private scoreRotaryStability(accumulator: CaptureAccumulator): FmsLiveCapture {
    const sameSidePassed =
      this.mode === 'primary' &&
      accumulator.maxSameSideExtensionNorm >= 0.45 &&
      accumulator.minElbowKneeTouchDistanceNorm <= 0.08 &&
      accumulator.maxMidlineDriftNorm <= 0.08 &&
      accumulator.maxTrunkRotationDeg <= 12
    const diagonalPassed =
      this.mode === 'diagonalRegression' &&
      accumulator.maxSameSideExtensionNorm >= 0.4 &&
      accumulator.minElbowKneeTouchDistanceNorm <= 0.1 &&
      accumulator.maxMidlineDriftNorm <= 0.1

    const score = sameSidePassed ? 3 : diagonalPassed ? 2 : 1
    const notes: string[] = []

    if (this.mode === 'primary' && !sameSidePassed) {
      notes.push('Same-side rotary stability did not meet the score 3 pattern.')
      notes.push('Retry in diagonal regression mode to check for score 2.')
    }

    if (this.mode === 'diagonalRegression' && !diagonalPassed) {
      notes.push('The diagonal regression did not complete with a clean elbow-to-knee touch.')
    }

    return {
      score,
      confidence: clamp01(score === 3 ? 0.74 : score === 2 ? 0.66 : 0.52),
      notes,
      metrics: [
        formatMetric('Touch distance', accumulator.minElbowKneeTouchDistanceNorm * 100, '%'),
        formatMetric('Midline drift', accumulator.maxMidlineDriftNorm * 100, '%'),
        formatMetric('Trunk rotation', accumulator.maxTrunkRotationDeg, ' deg')
      ],
      mode: this.mode
    }
  }
}

export const FMS_POSE_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
  [27, 29],
  [28, 30],
  [29, 31],
  [30, 32],
  [27, 31],
  [28, 32]
] as const
