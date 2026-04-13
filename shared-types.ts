export interface AuthUser {
  id: string
  name: string
  email: string
  createdAt: string
  sexForTSPU: SexForTSPU
}

export interface StoredSession {
  id: string
  userEmail: string
  completedAt: string
  durationSeconds: number
  totalReps: number
  validReps: number
  invalidReps: number
  depthScore: number
  postureScore: number
  notes: string[]
  totalSets: number
  repsPerSet: number
}

export interface SessionDraft {
  completedAt: string
  durationSeconds: number
  totalReps: number
  validReps: number
  invalidReps: number
  depthScore: number
  postureScore: number
  notes: string[]
  totalSets: number
  repsPerSet: number
}

export type SexForTSPU = 'male' | 'female' | 'unspecified'

export const fmsPatternKeys = [
  'deepSquat',
  'hurdleStep',
  'inlineLunge',
  'shoulderMobility',
  'activeStraightLegRaise',
  'trunkStabilityPushUp',
  'rotaryStability'
] as const

export type FmsPatternKey = (typeof fmsPatternKeys)[number]
export type FmsScoreValue = 0 | 1 | 2 | 3
export type FmsSessionStatus = 'in_progress' | 'completed' | 'stopped_pain' | 'incomplete'

export interface FmsPatternScore {
  rawLeft?: FmsScoreValue
  rawRight?: FmsScoreValue
  finalScore?: FmsScoreValue
  pain: boolean
  clearingPain?: boolean
  notes: string[]
  confidence: number
}

export type FmsPatternMap = Record<FmsPatternKey, FmsPatternScore>

export interface StoredFmsSession {
  sessionId: string
  startedAt: string
  completedAt?: string
  status: FmsSessionStatus
  disclaimerAccepted: boolean
  sexForTSPU: SexForTSPU
  equipmentConfirmed: boolean
  patterns: FmsPatternMap
  totalScore?: number
  anyPain: boolean
  anyAsymmetry: boolean
  notes: string[]
}

export interface FmsSessionDraft {
  startedAt: string
  completedAt?: string
  status: FmsSessionStatus
  disclaimerAccepted: boolean
  sexForTSPU: SexForTSPU
  equipmentConfirmed: boolean
  patterns: FmsPatternMap
  totalScore?: number
  anyPain: boolean
  anyAsymmetry: boolean
  notes: string[]
}

export type TrackedPageName = 'home' | 'details' | 'live' | 'results' | 'profile' | 'fms'

export interface PageVisitDraft {
  pageName: TrackedPageName
  enteredAt: string
  exitedAt: string
  durationMs: number
  browserSessionId: string
}

export interface ProfileStats {
  totalSessions: number
  totalValidReps: number
  avgDepthScore: number
  avgPostureScore: number
  streakDays: number
}
