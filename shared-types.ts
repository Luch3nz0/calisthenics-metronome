export interface AuthUser {
  id: string
  name: string
  email: string
  createdAt: string
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

export interface ProfileStats {
  totalSessions: number
  totalValidReps: number
  avgDepthScore: number
  avgPostureScore: number
  streakDays: number
}
