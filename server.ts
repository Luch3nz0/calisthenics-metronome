import express, { type NextFunction, type Request, type Response } from 'express'
import { randomBytes, randomUUID, createHash, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import {
  fmsPatternKeys,
  type AuthUser,
  type FmsPatternKey,
  type FmsPatternMap,
  type FmsSessionDraft,
  type FmsSessionStatus,
  type FmsScoreValue,
  type PageVisitDraft,
  type SessionDraft,
  type SexForTSPU,
  type StoredFmsSession,
  type StoredSession,
  type TrackedPageName
} from './shared-types.js'

const scrypt = promisify(scryptCallback)
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = join(rootDir, 'dist')
const assetsDir = join(rootDir, 'assets')

const port = Number(process.env.PORT ?? 8080)
const databasePath = resolve(process.env.DATABASE_PATH ?? join(rootDir, '.data', 'noskip.sqlite'))
const databaseDir = dirname(databasePath)
const sessionCookieName = 'noskip_session'
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30
const adminDashboardUsername = (process.env.ADMIN_DASHBOARD_USERNAME ?? 'admin').trim() || 'admin'
const adminDashboardPassword = process.env.ADMIN_DASHBOARD_PASSWORD?.trim() ?? ''
const trackedPageNames: readonly TrackedPageName[] = ['home', 'details', 'live', 'results', 'profile', 'fms']

type DatabaseUserRow = {
  id: string
  name: string
  email: string
  created_at: string
  sex_for_tspu: SexForTSPU
  password_hash?: string
}

type DatabaseWorkoutSessionRow = {
  id: string
  user_id: string
  user_email: string
  completed_at: string
  duration_seconds: number
  total_reps: number
  valid_reps: number
  invalid_reps: number
  depth_score: number
  posture_score: number
  notes: string
  total_sets: number
  reps_per_set: number
  created_at: string
}

type DatabasePageVisitRow = {
  id: string
  user_id: string
  user_email: string
  browser_session_id: string
  page_name: TrackedPageName
  entered_at: string
  exited_at: string
  duration_ms: number
  created_at: string
}

type DatabaseAuthSessionRow = {
  user_id: string
  id: string
  name: string
  email: string
  created_at: string
  sex_for_tspu: SexForTSPU
}

type DatabaseFmsSessionRow = {
  id: string
  user_id: string
  user_email: string
  started_at: string
  completed_at: string | null
  status: FmsSessionStatus
  disclaimer_accepted: number
  sex_for_tspu: SexForTSPU
  equipment_confirmed: number
  patterns_json: string
  total_score: number | null
  any_pain: number
  any_asymmetry: number
  notes_json: string
  created_at: string
}

type DashboardSummaryRow = {
  total_users: number
  users_with_workouts: number
  active_users_7d: number
  total_workouts: number
  total_workout_seconds: number
  total_tracked_seconds: number
}

type DashboardPageMetricRow = {
  page_name: TrackedPageName
  views: number
  unique_users: number
  avg_duration_seconds: number
  total_duration_seconds: number
}

type DashboardUserMetricRow = {
  id: string
  name: string
  email: string
  created_at: string
  last_seen_at: string
  last_workout_at: string | null
  total_sessions: number
  workout_duration_seconds: number
  avg_depth_score: number
  avg_posture_score: number
  total_page_views: number
  app_duration_seconds: number
  favorite_page: TrackedPageName | null
}

type DashboardRecentWorkoutRow = {
  id: string
  name: string
  email: string
  completed_at: string
  duration_seconds: number
  total_reps: number
  valid_reps: number
  depth_score: number
  posture_score: number
}

type AuthenticatedRequest = Request & {
  authUser?: AuthUser
  authUserId?: string
}

mkdirSync(databaseDir, { recursive: true })

const db = new DatabaseSync(databasePath)

function exec(sql: string): void {
  db.exec(sql)
}

function run(sql: string, params: readonly SQLInputValue[] = []): void {
  db.prepare(sql).run(...params)
}

function get<T>(sql: string, params: readonly SQLInputValue[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined
}

function all<T>(sql: string, params: readonly SQLInputValue[] = []): T[] {
  return db.prepare(sql).all(...params) as T[]
}

function toAuthUser(row: DatabaseUserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: new Date(row.created_at).toISOString(),
    sexForTSPU: parseSexForTSPU(row.sex_for_tspu)
  }
}

function parseSexForTSPU(value: unknown): SexForTSPU {
  return value === 'male' || value === 'female' ? value : 'unspecified'
}

function parseNotesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

function sanitizeTextList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => String(item).trim())
    .filter((item) => item !== '')
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxChars))
}

function parseFmsScoreValue(value: unknown): FmsScoreValue | undefined {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : undefined
}

function parseFmsSessionStatus(value: unknown): FmsSessionStatus | null {
  return value === 'in_progress' || value === 'completed' || value === 'stopped_pain' || value === 'incomplete'
    ? value
    : null
}

function parseFmsPatternMap(value: unknown): FmsPatternMap | null {
  if (!value || typeof value !== 'object') return null

  const next = {} as FmsPatternMap

  for (const patternKey of fmsPatternKeys) {
    const current = (value as Record<string, unknown>)[patternKey]
    if (!current || typeof current !== 'object') return null

    const rawLeft = parseFmsScoreValue((current as Record<string, unknown>).rawLeft)
    const rawRight = parseFmsScoreValue((current as Record<string, unknown>).rawRight)
    const finalScore = parseFmsScoreValue((current as Record<string, unknown>).finalScore)
    const confidenceValue = (current as Record<string, unknown>).confidence

    if (typeof (current as Record<string, unknown>).pain !== 'boolean') return null
    if (
      (current as Record<string, unknown>).clearingPain !== undefined &&
      typeof (current as Record<string, unknown>).clearingPain !== 'boolean'
    ) {
      return null
    }

    next[patternKey] = {
      rawLeft,
      rawRight,
      finalScore,
      pain: Boolean((current as Record<string, unknown>).pain),
      clearingPain:
        typeof (current as Record<string, unknown>).clearingPain === 'boolean'
          ? Boolean((current as Record<string, unknown>).clearingPain)
          : undefined,
      notes: sanitizeTextList((current as Record<string, unknown>).notes, 8, 220),
      confidence:
        typeof confidenceValue === 'number' && Number.isFinite(confidenceValue)
          ? Math.max(0, Math.min(1, confidenceValue))
          : 1
    }
  }

  return next
}

function toStoredSession(row: DatabaseWorkoutSessionRow): StoredSession {
  return {
    id: row.id,
    userEmail: row.user_email,
    completedAt: new Date(row.completed_at).toISOString(),
    durationSeconds: row.duration_seconds,
    totalReps: row.total_reps,
    validReps: row.valid_reps,
    invalidReps: row.invalid_reps,
    depthScore: row.depth_score,
    postureScore: row.posture_score,
    notes: parseNotesJson(row.notes),
    totalSets: row.total_sets,
    repsPerSet: row.reps_per_set
  }
}

function parseFmsPatternsJson(value: string): FmsPatternMap | null {
  try {
    return parseFmsPatternMap(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

function toStoredFmsSession(row: DatabaseFmsSessionRow): StoredFmsSession | null {
  const patterns = parseFmsPatternsJson(row.patterns_json)
  if (!patterns) return null

  return {
    sessionId: row.id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    status: row.status,
    disclaimerAccepted: row.disclaimer_accepted === 1,
    sexForTSPU: parseSexForTSPU(row.sex_for_tspu),
    equipmentConfirmed: row.equipment_confirmed === 1,
    patterns,
    totalScore: typeof row.total_score === 'number' ? row.total_score : undefined,
    anyPain: row.any_pain === 1,
    anyAsymmetry: row.any_asymmetry === 1,
    notes: parseNotesJson(row.notes_json)
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function readCookie(header: string | undefined, key: string): string | null {
  if (!header) return null

  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (rawName === key) {
      return decodeURIComponent(rest.join('='))
    }
  }

  return null
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false

  const derived = (await scrypt(password, salt, 64)) as Buffer
  const stored = Buffer.from(hash, 'hex')

  if (stored.length !== derived.length) return false
  return timingSafeEqual(stored, derived)
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function nowIso(): string {
  return new Date().toISOString()
}

function cleanupExpiredSessions(): void {
  run(`delete from auth_sessions where expires_at <= ?`, [nowIso()])
}

async function createAuthSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString()

  run(
    `
      insert into auth_sessions (id, user_id, token_hash, expires_at, created_at)
      values (?, ?, ?, ?, ?)
    `,
    [randomUUID(), userId, hashSessionToken(token), expiresAt, createdAt]
  )

  return token
}

function destroyAuthSession(token: string | null): void {
  if (!token) return
  run(`delete from auth_sessions where token_hash = ?`, [hashSessionToken(token)])
}

function findSessionUser(token: string | null): { user: AuthUser; userId: string } | null {
  if (!token) return null

  cleanupExpiredSessions()

  const row = get<DatabaseAuthSessionRow>(
    `
      select users.id, auth_sessions.user_id, users.name, users.email, users.created_at, users.sex_for_tspu
      from auth_sessions
      inner join users on users.id = auth_sessions.user_id
      where auth_sessions.token_hash = ?
        and auth_sessions.expires_at > ?
      limit 1
    `,
    [hashSessionToken(token), nowIso()]
  )

  if (!row) return null

  return {
    user: toAuthUser(row),
    userId: row.user_id
  }
}

function setSessionCookie(response: Response, token: string): void {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionTtlMs,
    path: '/'
  })
}

function clearSessionCookie(response: Response): void {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  })
}

function parseSessionDraft(value: unknown): SessionDraft | null {
  if (!value || typeof value !== 'object') return null

  const payload = value as Record<string, unknown>
  const notes = sanitizeTextList(payload.notes, 6, 180)

  const numericKeys = [
    'durationSeconds',
    'totalReps',
    'validReps',
    'invalidReps',
    'depthScore',
    'postureScore',
    'totalSets',
    'repsPerSet'
  ] as const

  for (const key of numericKeys) {
    if (typeof payload[key] !== 'number' || !Number.isFinite(payload[key])) return null
  }

  if (typeof payload.completedAt !== 'string') return null
  if (Number.isNaN(Date.parse(payload.completedAt))) return null

  const durationSeconds = payload.durationSeconds as number
  const totalReps = payload.totalReps as number
  const validReps = payload.validReps as number
  const invalidReps = payload.invalidReps as number
  const depthScore = payload.depthScore as number
  const postureScore = payload.postureScore as number
  const totalSets = payload.totalSets as number
  const repsPerSet = payload.repsPerSet as number

  return {
    completedAt: payload.completedAt,
    durationSeconds: Math.max(1, Math.round(durationSeconds)),
    totalReps: Math.max(0, Math.round(totalReps)),
    validReps: Math.max(0, Math.round(validReps)),
    invalidReps: Math.max(0, Math.round(invalidReps)),
    depthScore: Math.max(0, Math.min(100, Math.round(depthScore))),
    postureScore: Math.max(0, Math.min(100, Math.round(postureScore))),
    notes,
    totalSets: Math.max(1, Math.round(totalSets)),
    repsPerSet: Math.max(1, Math.round(repsPerSet))
  }
}

function parseFmsSessionDraft(value: unknown): FmsSessionDraft | null {
  if (!value || typeof value !== 'object') return null

  const payload = value as Record<string, unknown>
  const status = parseFmsSessionStatus(payload.status)
  const sexForTSPU = parseSexForTSPU(payload.sexForTSPU)
  const patterns = parseFmsPatternMap(payload.patterns)

  if (!status || !patterns) return null
  if (typeof payload.startedAt !== 'string' || Number.isNaN(Date.parse(payload.startedAt))) return null
  if (
    payload.completedAt !== undefined &&
    (typeof payload.completedAt !== 'string' || Number.isNaN(Date.parse(payload.completedAt)))
  ) {
    return null
  }
  if (typeof payload.disclaimerAccepted !== 'boolean') return null
  if (typeof payload.equipmentConfirmed !== 'boolean') return null
  if (typeof payload.anyPain !== 'boolean') return null
  if (typeof payload.anyAsymmetry !== 'boolean') return null
  if (payload.totalScore !== undefined && (typeof payload.totalScore !== 'number' || !Number.isFinite(payload.totalScore))) {
    return null
  }

  return {
    startedAt: payload.startedAt,
    completedAt: typeof payload.completedAt === 'string' ? payload.completedAt : undefined,
    status,
    disclaimerAccepted: payload.disclaimerAccepted,
    sexForTSPU,
    equipmentConfirmed: payload.equipmentConfirmed,
    patterns,
    totalScore: typeof payload.totalScore === 'number' ? Math.max(0, Math.min(21, Math.round(payload.totalScore))) : undefined,
    anyPain: payload.anyPain,
    anyAsymmetry: payload.anyAsymmetry,
    notes: sanitizeTextList(payload.notes, 10, 220)
  }
}

function parsePageVisitDraft(value: unknown): PageVisitDraft | null {
  if (!value || typeof value !== 'object') return null

  const payload = value as Record<string, unknown>
  const pageName = typeof payload.pageName === 'string' ? payload.pageName : ''
  const enteredAt = typeof payload.enteredAt === 'string' ? payload.enteredAt : ''
  const exitedAt = typeof payload.exitedAt === 'string' ? payload.exitedAt : ''
  const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : Number.NaN
  const browserSessionId =
    typeof payload.browserSessionId === 'string' ? payload.browserSessionId.trim() : ''

  if (!trackedPageNames.includes(pageName as TrackedPageName)) return null
  if (browserSessionId.length < 8 || browserSessionId.length > 120) return null
  if (Number.isNaN(Date.parse(enteredAt)) || Number.isNaN(Date.parse(exitedAt))) return null
  if (!Number.isFinite(durationMs)) return null

  const enteredAtMs = Date.parse(enteredAt)
  const exitedAtMs = Date.parse(exitedAt)
  if (exitedAtMs < enteredAtMs) return null

  const roundedDurationMs = Math.round(durationMs)
  if (roundedDurationMs < 0 || roundedDurationMs > 1000 * 60 * 60 * 12) return null

  const observedDurationMs = exitedAtMs - enteredAtMs
  if (roundedDurationMs > observedDurationMs + 1000 * 60 * 5) return null

  return {
    pageName: pageName as TrackedPageName,
    enteredAt,
    exitedAt,
    durationMs: roundedDurationMs,
    browserSessionId
  }
}

function safeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function parseBasicAuthHeader(header: string | undefined): { username: string; password: string } | null {
  if (!header?.startsWith('Basic ')) return null

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex < 0) return null

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    }
  } catch {
    return null
  }
}

function requireDashboardAuth(request: Request, response: Response): boolean {
  if (adminDashboardPassword === '') {
    response.status(404).type('text/plain').send('Dashboard not configured.')
    return false
  }

  const credentials = parseBasicAuthHeader(request.headers.authorization)
  const authorized =
    credentials !== null &&
    safeEqualText(credentials.username, adminDashboardUsername) &&
    safeEqualText(credentials.password, adminDashboardPassword)

  if (!authorized) {
    response.setHeader('WWW-Authenticate', 'Basic realm="Noskip dashboard"')
    response.status(401).type('text/plain').send('Authentication required.')
    return false
  }

  return true
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function humanizePageName(value: TrackedPageName): string {
  if (value === 'fms') return 'FMS'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m'

  if (seconds < 60) return `${seconds}s`

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  const filtered = values.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
  if (filtered.length === 0) return null
  return filtered.reduce((latest, value) => (value > latest ? value : latest))
}

async function loadDashboardData(): Promise<{
  summary: DashboardSummaryRow
  pageMetrics: DashboardPageMetricRow[]
  userMetrics: DashboardUserMetricRow[]
  recentWorkouts: DashboardRecentWorkoutRow[]
}> {
  const users = all<DatabaseUserRow>(`select id, name, email, created_at, sex_for_tspu from users`)
  const workouts = all<DatabaseWorkoutSessionRow>(
    `
      select
        id, user_id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
        depth_score, posture_score, notes, total_sets, reps_per_set, created_at
      from workout_sessions
      order by completed_at desc
    `
  )
  const pageVisits = all<DatabasePageVisitRow>(
    `
      select
        id, user_id, user_email, browser_session_id, page_name, entered_at, exited_at, duration_ms, created_at
      from page_visits
      order by exited_at desc
    `
  )

  const activeThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const usersById = new Map(users.map((user) => [user.id, user]))

  const activeUserIds = new Set<string>()
  for (const workout of workouts) {
    if (workout.completed_at >= activeThreshold) activeUserIds.add(workout.user_id)
  }
  for (const visit of pageVisits) {
    if (visit.exited_at >= activeThreshold) activeUserIds.add(visit.user_id)
  }

  const usersWithWorkouts = new Set(workouts.map((workout) => workout.user_id))

  const pageMetrics = trackedPageNames.map<DashboardPageMetricRow>((pageName) => {
    const visits = pageVisits.filter((visit) => visit.page_name === pageName)
    const totalDurationMs = visits.reduce((sum, visit) => sum + visit.duration_ms, 0)

    return {
      page_name: pageName,
      views: visits.length,
      unique_users: new Set(visits.map((visit) => visit.user_id)).size,
      avg_duration_seconds: visits.length === 0 ? 0 : Math.round(totalDurationMs / visits.length / 1000),
      total_duration_seconds: Math.round(totalDurationMs / 1000)
    }
  })

  const userMetrics = users
    .map<DashboardUserMetricRow>((user) => {
      const userWorkouts = workouts.filter((workout) => workout.user_id === user.id)
      const userVisits = pageVisits.filter((visit) => visit.user_id === user.id)
      const workoutDurationSeconds = userWorkouts.reduce((sum, workout) => sum + workout.duration_seconds, 0)
      const appDurationSeconds = Math.round(userVisits.reduce((sum, visit) => sum + visit.duration_ms, 0) / 1000)

      const pageDurationByName = new Map<TrackedPageName, number>()
      for (const pageName of trackedPageNames) {
        pageDurationByName.set(pageName, 0)
      }
      for (const visit of userVisits) {
        const current = pageDurationByName.get(visit.page_name) ?? 0
        pageDurationByName.set(visit.page_name, current + visit.duration_ms)
      }

      let favoritePage: TrackedPageName | null = null
      let favoritePageDuration = 0
      for (const pageName of trackedPageNames) {
        const duration = pageDurationByName.get(pageName) ?? 0
        if (duration > favoritePageDuration) {
          favoritePage = pageName
          favoritePageDuration = duration
        }
      }

      const lastWorkoutAt = maxIsoDate(userWorkouts.map((workout) => workout.completed_at))
      const lastVisitAt = maxIsoDate(userVisits.map((visit) => visit.exited_at))
      const lastSeenAt = maxIsoDate([user.created_at, lastWorkoutAt, lastVisitAt]) ?? user.created_at

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
        last_seen_at: lastSeenAt,
        last_workout_at: lastWorkoutAt,
        total_sessions: userWorkouts.length,
        workout_duration_seconds: workoutDurationSeconds,
        avg_depth_score:
          userWorkouts.length === 0
            ? 0
            : Math.round(userWorkouts.reduce((sum, workout) => sum + workout.depth_score, 0) / userWorkouts.length),
        avg_posture_score:
          userWorkouts.length === 0
            ? 0
            : Math.round(
                userWorkouts.reduce((sum, workout) => sum + workout.posture_score, 0) / userWorkouts.length
              ),
        total_page_views: userVisits.length,
        app_duration_seconds: appDurationSeconds,
        favorite_page: favoritePageDuration > 0 ? favoritePage : null
      }
    })
    .sort((left, right) => {
      if (left.last_seen_at === right.last_seen_at) {
        return right.created_at.localeCompare(left.created_at)
      }
      return right.last_seen_at.localeCompare(left.last_seen_at)
    })

  const recentWorkouts = workouts.slice(0, 18).map<DashboardRecentWorkoutRow>((workout) => {
    const user = usersById.get(workout.user_id)

    return {
      id: workout.id,
      name: user?.name ?? workout.user_email,
      email: user?.email ?? workout.user_email,
      completed_at: workout.completed_at,
      duration_seconds: workout.duration_seconds,
      total_reps: workout.total_reps,
      valid_reps: workout.valid_reps,
      depth_score: workout.depth_score,
      posture_score: workout.posture_score
    }
  })

  return {
    summary: {
      total_users: users.length,
      users_with_workouts: usersWithWorkouts.size,
      active_users_7d: activeUserIds.size,
      total_workouts: workouts.length,
      total_workout_seconds: workouts.reduce((sum, workout) => sum + workout.duration_seconds, 0),
      total_tracked_seconds: Math.round(pageVisits.reduce((sum, visit) => sum + visit.duration_ms, 0) / 1000)
    },
    pageMetrics,
    userMetrics,
    recentWorkouts
  }
}

function renderDashboardHtml(data: {
  summary: DashboardSummaryRow
  pageMetrics: DashboardPageMetricRow[]
  userMetrics: DashboardUserMetricRow[]
  recentWorkouts: DashboardRecentWorkoutRow[]
}): string {
  const pageMetricsMarkup = data.pageMetrics
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(humanizePageName(row.page_name))}</td>
          <td>${row.views}</td>
          <td>${row.unique_users}</td>
          <td>${escapeHtml(formatDuration(row.avg_duration_seconds))}</td>
          <td>${escapeHtml(formatDuration(row.total_duration_seconds))}</td>
        </tr>
      `
    )
    .join('')

  const userMetricsMarkup =
    data.userMetrics.length === 0
      ? `
          <tr>
            <td colspan="9" class="empty-row">No users found in the database yet.</td>
          </tr>
        `
      : data.userMetrics
          .map(
            (row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.name)}</strong>
                  <div class="subtle">${escapeHtml(row.email)}</div>
                </td>
                <td>${escapeHtml(formatDateTime(row.created_at))}</td>
                <td>${escapeHtml(formatDateTime(row.last_seen_at))}</td>
                <td>${row.total_sessions}</td>
                <td>${escapeHtml(formatDuration(row.workout_duration_seconds))}</td>
                <td>${escapeHtml(formatDuration(row.app_duration_seconds))}</td>
                <td>${row.avg_depth_score}%</td>
                <td>${row.avg_posture_score}%</td>
                <td>${escapeHtml(row.favorite_page ? humanizePageName(row.favorite_page) : 'None')}</td>
              </tr>
            `
          )
          .join('')

  const recentWorkoutsMarkup =
    data.recentWorkouts.length === 0
      ? `
          <tr>
            <td colspan="6" class="empty-row">No workouts have been saved yet.</td>
          </tr>
        `
      : data.recentWorkouts
          .map(
            (row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.name)}</strong>
                  <div class="subtle">${escapeHtml(row.email)}</div>
                </td>
                <td>${escapeHtml(formatDateTime(row.completed_at))}</td>
                <td>${row.valid_reps}/${row.total_reps}</td>
                <td>${escapeHtml(formatDuration(row.duration_seconds))}</td>
                <td>${row.depth_score}%</td>
                <td>${row.posture_score}%</td>
              </tr>
            `
          )
          .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Noskip Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: dark;
      --bg: #08131d;
      --panel: rgba(10, 24, 37, 0.88);
      --panel-border: rgba(125, 173, 204, 0.16);
      --text: #eff7fb;
      --muted: #9fb8c9;
      --accent: #7ce2ff;
      --warm: #ffbf75;
      --shadow: 0 24px 48px rgba(2, 11, 18, 0.38);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Manrope', sans-serif;
      background:
        radial-gradient(circle at top left, rgba(52, 197, 255, 0.18), transparent 24%),
        radial-gradient(circle at top right, rgba(255, 191, 117, 0.16), transparent 26%),
        linear-gradient(180deg, #0c1a28 0%, var(--bg) 58%, #040a10 100%);
      color: var(--text);
      padding: 28px;
    }

    .shell {
      width: min(1260px, 100%);
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }

    .hero, .panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }

    .hero {
      padding: 28px;
      display: grid;
      gap: 14px;
    }

    .eyebrow {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 800;
    }

    h1, h2 {
      margin: 0;
      font-family: 'Sora', sans-serif;
      letter-spacing: -0.03em;
    }

    .hero-copy, .subtle {
      color: var(--muted);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }

    .metric {
      padding: 18px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      display: grid;
      gap: 8px;
    }

    .metric span {
      color: var(--muted);
      font-size: 13px;
    }

    .metric strong {
      font-size: 28px;
      font-family: 'Sora', sans-serif;
    }

    .grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 18px;
    }

    .panel {
      padding: 20px;
      overflow: hidden;
    }

    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 14px;
    }

    .table-wrap {
      overflow-x: auto;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 640px;
      background: rgba(0, 0, 0, 0.12);
    }

    th, td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 14px;
      vertical-align: top;
    }

    th {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.02);
    }

    tr:last-child td {
      border-bottom: none;
    }

    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .pill {
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(124, 226, 255, 0.1);
      color: var(--text);
      font-size: 13px;
      border: 1px solid rgba(124, 226, 255, 0.16);
    }

    .empty-row {
      color: var(--muted);
    }

    .refresh {
      color: var(--warm);
      text-decoration: none;
      font-weight: 700;
    }

    @media (max-width: 980px) {
      body { padding: 16px; }
      .grid { grid-template-columns: 1fr; }
      .hero, .panel { border-radius: 20px; }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 640px) {
      .summary-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <p class="eyebrow">Protected dashboard</p>
      <h1>Noskip product and database overview</h1>
      <p class="hero-copy">
        Live snapshot of the Fly SQLite data: users, workout history, tracked in-app screen time, and recent product activity.
      </p>
      <div class="pill-row">
        <span class="pill">SQLite volume-backed</span>
        <span class="pill">Updated ${escapeHtml(formatDateTime(nowIso()))}</span>
        <a class="refresh" href="/dashboard">Refresh</a>
      </div>
    </section>

    <section class="summary-grid">
      <article class="metric">
        <span>Total users</span>
        <strong>${data.summary.total_users}</strong>
      </article>
      <article class="metric">
        <span>Active users (7d)</span>
        <strong>${data.summary.active_users_7d}</strong>
      </article>
      <article class="metric">
        <span>Users with workouts</span>
        <strong>${data.summary.users_with_workouts}</strong>
      </article>
      <article class="metric">
        <span>Total workouts</span>
        <strong>${data.summary.total_workouts}</strong>
      </article>
      <article class="metric">
        <span>Workout time logged</span>
        <strong>${escapeHtml(formatDuration(data.summary.total_workout_seconds))}</strong>
      </article>
      <article class="metric">
        <span>Tracked page time</span>
        <strong>${escapeHtml(formatDuration(data.summary.total_tracked_seconds))}</strong>
      </article>
    </section>

    <div class="grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Engagement</p>
            <h2>Page time by screen</h2>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Views</th>
                <th>Unique users</th>
                <th>Avg time</th>
                <th>Total time</th>
              </tr>
            </thead>
            <tbody>${pageMetricsMarkup}</tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Recent activity</p>
            <h2>Latest workouts</h2>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Completed</th>
                <th>Valid reps</th>
                <th>Duration</th>
                <th>Depth</th>
                <th>Posture</th>
              </tr>
            </thead>
            <tbody>${recentWorkoutsMarkup}</tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">People</p>
          <h2>Users and retention signals</h2>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Joined</th>
              <th>Last seen</th>
              <th>Workouts</th>
              <th>Workout time</th>
              <th>App time</th>
              <th>Avg depth</th>
              <th>Avg posture</th>
              <th>Top page</th>
            </tr>
          </thead>
          <tbody>${userMetricsMarkup}</tbody>
        </table>
      </div>
    </section>
  </div>
</body>
</html>`
}

function ensureSchema(): void {
  exec(`
    pragma foreign_keys = on;
    pragma journal_mode = wal;
    pragma busy_timeout = 5000;

    create table if not exists users (
      id text primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      created_at text not null,
      sex_for_tspu text not null default 'unspecified'
    );

    create table if not exists auth_sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at text not null,
      created_at text not null
    );

    create table if not exists workout_sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      user_email text not null,
      completed_at text not null,
      duration_seconds integer not null,
      total_reps integer not null,
      valid_reps integer not null,
      invalid_reps integer not null,
      depth_score integer not null,
      posture_score integer not null,
      notes text not null default '[]',
      total_sets integer not null,
      reps_per_set integer not null,
      created_at text not null
    );

    create table if not exists page_visits (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      user_email text not null,
      browser_session_id text not null,
      page_name text not null,
      entered_at text not null,
      exited_at text not null,
      duration_ms integer not null check (duration_ms >= 0),
      created_at text not null
    );

    create table if not exists fms_sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      user_email text not null,
      started_at text not null,
      completed_at text,
      status text not null check (status in ('in_progress', 'completed', 'stopped_pain', 'incomplete')),
      disclaimer_accepted integer not null check (disclaimer_accepted in (0, 1)),
      sex_for_tspu text not null default 'unspecified',
      equipment_confirmed integer not null check (equipment_confirmed in (0, 1)),
      patterns_json text not null,
      total_score integer,
      any_pain integer not null check (any_pain in (0, 1)),
      any_asymmetry integer not null check (any_asymmetry in (0, 1)),
      notes_json text not null default '[]',
      created_at text not null
    );

    create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id);
    create index if not exists auth_sessions_expires_at_idx on auth_sessions (expires_at);
    create index if not exists workout_sessions_user_id_completed_idx on workout_sessions (user_id, completed_at desc);
    create index if not exists page_visits_user_id_exited_idx on page_visits (user_id, exited_at desc);
    create index if not exists page_visits_page_name_exited_idx on page_visits (page_name, exited_at desc);
    create index if not exists fms_sessions_user_id_started_idx on fms_sessions (user_id, started_at desc);
    create index if not exists fms_sessions_status_completed_idx on fms_sessions (status, completed_at desc);
  `)

  const userColumns = all<{ name: string }>(`pragma table_info(users)`)
  if (!userColumns.some((column) => column.name === 'sex_for_tspu')) {
    run(`alter table users add column sex_for_tspu text not null default 'unspecified'`)
  }

  const pageVisitSql = get<{ sql: string | null }>(
    `select sql from sqlite_master where type = 'table' and name = 'page_visits' limit 1`
  )?.sql

  if (typeof pageVisitSql === 'string' && pageVisitSql.includes('check (page_name in')) {
    exec(`
      begin transaction;
      create table if not exists page_visits_migrated (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        user_email text not null,
        browser_session_id text not null,
        page_name text not null,
        entered_at text not null,
        exited_at text not null,
        duration_ms integer not null check (duration_ms >= 0),
        created_at text not null
      );
      insert into page_visits_migrated (id, user_id, user_email, browser_session_id, page_name, entered_at, exited_at, duration_ms, created_at)
      select id, user_id, user_email, browser_session_id, page_name, entered_at, exited_at, duration_ms, created_at
      from page_visits;
      drop table page_visits;
      alter table page_visits_migrated rename to page_visits;
      create index if not exists page_visits_user_id_exited_idx on page_visits (user_id, exited_at desc);
      create index if not exists page_visits_page_name_exited_idx on page_visits (page_name, exited_at desc);
      commit;
    `)
  }

  cleanupExpiredSessions()
}

const app = express()
app.set('trust proxy', 1)

app.use(express.json({ limit: '512kb' }))
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self' https://cdn.jsdelivr.net",
      "media-src 'self' blob:",
      "worker-src 'self' blob:"
    ].join('; ')
  )
  next()
})

const asyncHandler =
  (handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next)
  }

const loadAuthUser = asyncHandler(async (request, _response, next) => {
  const authRequest = request as AuthenticatedRequest
  const token = readCookie(request.headers.cookie, sessionCookieName)
  const session = findSessionUser(token)

  if (session) {
    authRequest.authUser = session.user
    authRequest.authUserId = session.userId
  }

  next()
})

function requireAuth(request: Request, response: Response): request is AuthenticatedRequest {
  const authRequest = request as AuthenticatedRequest

  if (!authRequest.authUser || !authRequest.authUserId) {
    response.status(401).json({ message: 'Authentication required.' })
    return false
  }

  return true
}

app.get('/healthz', (_request, response) => {
  response.json({ ok: true, databasePath })
})

app.get(
  '/api/auth/me',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    const authRequest = request as AuthenticatedRequest
    response.json({ user: authRequest.authUser ?? null })
  })
)

app.post(
  '/api/auth/signup',
  asyncHandler(async (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    const sexForTSPU = parseSexForTSPU(request.body?.sexForTSPU)

    if (name.length < 2 || name.length > 80) {
      response.status(400).json({ message: 'Name must be between 2 and 80 characters.' })
      return
    }

    if (!isValidEmail(email)) {
      response.status(400).json({ message: 'A valid email is required.' })
      return
    }

    if (password.length < 6) {
      response.status(400).json({ message: 'Password must be at least 6 characters.' })
      return
    }

    if (sexForTSPU === 'unspecified') {
      response.status(400).json({ message: 'Sex is required for the FMS setup.' })
      return
    }

    const existing = get<{ id: string }>(`select id from users where email = ? limit 1`, [email])
    if (existing) {
      response.status(409).json({ message: 'An account with that email already exists.' })
      return
    }

    const userId = randomUUID()
    const passwordHash = await hashPassword(password)
    const createdAt = nowIso()

    run(
      `
        insert into users (id, name, email, password_hash, created_at, sex_for_tspu)
        values (?, ?, ?, ?, ?, ?)
      `,
      [userId, name, email, passwordHash, createdAt, sexForTSPU]
    )

    const userRow = get<DatabaseUserRow>(
      `select id, name, email, created_at, sex_for_tspu from users where id = ? limit 1`,
      [userId]
    )

    if (!userRow) {
      response.status(500).json({ message: 'Account creation did not complete.' })
      return
    }

    const token = await createAuthSession(userId)
    setSessionCookie(response, token)
    response.status(201).json({ ok: true, user: toAuthUser(userRow) })
  })
)

app.post(
  '/api/auth/login',
  asyncHandler(async (request, response) => {
    const email = typeof request.body?.email === 'string' ? normalizeEmail(request.body.email) : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''

    if (!isValidEmail(email) || password.trim() === '') {
      response.status(400).json({ message: 'Email and password are required.' })
      return
    }

    const row = get<DatabaseUserRow>(
      `select id, name, email, created_at, sex_for_tspu, password_hash from users where email = ? limit 1`,
      [email]
    )

    if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
      response.status(401).json({ message: 'Email or password is incorrect.' })
      return
    }

    const token = await createAuthSession(row.id)
    setSessionCookie(response, token)
    response.json({ ok: true, user: toAuthUser(row) })
  })
)

app.patch(
  '/api/profile',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    if (!requireAuth(request, response)) return

    const authRequest = request as AuthenticatedRequest
    const authUserId = authRequest.authUserId
    const sexForTSPU = parseSexForTSPU(request.body?.sexForTSPU)

    if (!authUserId) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    if (sexForTSPU === 'unspecified') {
      response.status(400).json({ message: 'Select male or female to save the FMS setup.' })
      return
    }

    run(`update users set sex_for_tspu = ? where id = ?`, [sexForTSPU, authUserId])

    const row = get<DatabaseUserRow>(
      `select id, name, email, created_at, sex_for_tspu from users where id = ? limit 1`,
      [authUserId]
    )

    if (!row) {
      response.status(500).json({ message: 'Profile update did not complete.' })
      return
    }

    response.json({ ok: true, user: toAuthUser(row) })
  })
)

app.post(
  '/api/auth/logout',
  asyncHandler(async (request, response) => {
    const token = readCookie(request.headers.cookie, sessionCookieName)
    destroyAuthSession(token)
    clearSessionCookie(response)
    response.json({ ok: true })
  })
)

app.post(
  '/api/analytics/page-visit',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    if (!requireAuth(request, response)) return

    const authRequest = request as AuthenticatedRequest
    const pageVisit = parsePageVisitDraft(request.body)

    if (!pageVisit || !authRequest.authUser || !authRequest.authUserId) {
      response.status(400).json({ message: 'Page visit payload is invalid.' })
      return
    }

    run(
      `
        insert into page_visits (
          id, user_id, user_email, browser_session_id, page_name, entered_at, exited_at, duration_ms, created_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        authRequest.authUserId,
        authRequest.authUser.email,
        pageVisit.browserSessionId,
        pageVisit.pageName,
        pageVisit.enteredAt,
        pageVisit.exitedAt,
        pageVisit.durationMs,
        nowIso()
      ]
    )

    response.status(201).json({ ok: true })
  })
)

app.get(
  '/api/history',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    if (!requireAuth(request, response)) return

    const authRequest = request as AuthenticatedRequest
    const authUserId = authRequest.authUserId

    if (!authUserId) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const rows = all<DatabaseWorkoutSessionRow>(
      `
        select
          id, user_id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
          depth_score, posture_score, notes, total_sets, reps_per_set, created_at
        from workout_sessions
        where user_id = ?
        order by completed_at desc
      `,
      [authUserId]
    )

    response.json({ sessions: rows.map(toStoredSession) })
  })
)

app.post(
  '/api/history',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    if (!requireAuth(request, response)) return

    const authRequest = request as AuthenticatedRequest
    const authUser = authRequest.authUser
    const authUserId = authRequest.authUserId

    if (!authUser || !authUserId) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const sessionDraft = parseSessionDraft(request.body)

    if (!sessionDraft) {
      response.status(400).json({ message: 'Session payload is invalid.' })
      return
    }

    if (sessionDraft.validReps > sessionDraft.totalReps) {
      response.status(400).json({ message: 'Valid reps cannot exceed total reps.' })
      return
    }

    if (sessionDraft.validReps + sessionDraft.invalidReps !== sessionDraft.totalReps) {
      response.status(400).json({ message: 'Valid and invalid rep counts must add up to total reps.' })
      return
    }

    const sessionId = randomUUID()

    run(
      `
        insert into workout_sessions (
          id, user_id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
          depth_score, posture_score, notes, total_sets, reps_per_set, created_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        sessionId,
        authUserId,
        authUser.email,
        sessionDraft.completedAt,
        sessionDraft.durationSeconds,
        sessionDraft.totalReps,
        sessionDraft.validReps,
        sessionDraft.invalidReps,
        sessionDraft.depthScore,
        sessionDraft.postureScore,
        JSON.stringify(sessionDraft.notes),
        sessionDraft.totalSets,
        sessionDraft.repsPerSet,
        nowIso()
      ]
    )

    const row = get<DatabaseWorkoutSessionRow>(
      `
        select
          id, user_id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
          depth_score, posture_score, notes, total_sets, reps_per_set, created_at
        from workout_sessions
        where id = ?
        limit 1
      `,
      [sessionId]
    )

    if (!row) {
      response.status(500).json({ message: 'Session save did not complete.' })
      return
    }

    response.status(201).json({ session: toStoredSession(row) })
  })
)

app.get(
  '/api/fms/history',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    if (!requireAuth(request, response)) return

    const authRequest = request as AuthenticatedRequest
    const authUserId = authRequest.authUserId

    if (!authUserId) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const rows = all<DatabaseFmsSessionRow>(
      `
        select
          id, user_id, user_email, started_at, completed_at, status, disclaimer_accepted, sex_for_tspu,
          equipment_confirmed, patterns_json, total_score, any_pain, any_asymmetry, notes_json, created_at
        from fms_sessions
        where user_id = ?
        order by started_at desc
      `,
      [authUserId]
    )

    response.json({ sessions: rows.map((row) => toStoredFmsSession(row)).filter((row): row is StoredFmsSession => row !== null) })
  })
)

app.post(
  '/api/fms/history',
  loadAuthUser,
  asyncHandler(async (request, response) => {
    if (!requireAuth(request, response)) return

    const authRequest = request as AuthenticatedRequest
    const authUser = authRequest.authUser
    const authUserId = authRequest.authUserId

    if (!authUser || !authUserId) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const sessionDraft = parseFmsSessionDraft(request.body)

    if (!sessionDraft) {
      response.status(400).json({ message: 'FMS payload is invalid.' })
      return
    }

    const effectiveSex = authUser.sexForTSPU === 'unspecified' ? sessionDraft.sexForTSPU : authUser.sexForTSPU

    if (effectiveSex === 'unspecified') {
      response.status(400).json({ message: 'Sex must be saved before starting the FMS flow.' })
      return
    }

    if (sessionDraft.status === 'completed' && sessionDraft.totalScore === undefined) {
      response.status(400).json({ message: 'Completed FMS sessions must include a total score.' })
      return
    }

    const sessionId = randomUUID()
    const completedAt =
      sessionDraft.status === 'completed' || sessionDraft.status === 'stopped_pain' || sessionDraft.status === 'incomplete'
        ? sessionDraft.completedAt ?? nowIso()
        : sessionDraft.completedAt

    run(
      `
        insert into fms_sessions (
          id, user_id, user_email, started_at, completed_at, status, disclaimer_accepted, sex_for_tspu,
          equipment_confirmed, patterns_json, total_score, any_pain, any_asymmetry, notes_json, created_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        sessionId,
        authUserId,
        authUser.email,
        sessionDraft.startedAt,
        completedAt ?? null,
        sessionDraft.status,
        sessionDraft.disclaimerAccepted ? 1 : 0,
        effectiveSex,
        sessionDraft.equipmentConfirmed ? 1 : 0,
        JSON.stringify(sessionDraft.patterns),
        sessionDraft.status === 'completed' ? sessionDraft.totalScore ?? null : null,
        sessionDraft.anyPain ? 1 : 0,
        sessionDraft.anyAsymmetry ? 1 : 0,
        JSON.stringify(sessionDraft.notes),
        nowIso()
      ]
    )

    const row = get<DatabaseFmsSessionRow>(
      `
        select
          id, user_id, user_email, started_at, completed_at, status, disclaimer_accepted, sex_for_tspu,
          equipment_confirmed, patterns_json, total_score, any_pain, any_asymmetry, notes_json, created_at
        from fms_sessions
        where id = ?
        limit 1
      `,
      [sessionId]
    )

    const stored = row ? toStoredFmsSession(row) : null

    if (!stored) {
      response.status(500).json({ message: 'FMS session save did not complete.' })
      return
    }

    response.status(201).json({ session: stored })
  })
)

app.get(
  '/dashboard',
  asyncHandler(async (request, response) => {
    if (!requireDashboardAuth(request, response)) return

    const dashboardData = await loadDashboardData()
    response.type('html').send(renderDashboardHtml(dashboardData))
  })
)

app.use('/dist', express.static(distDir, { maxAge: '1h', immutable: false, index: false }))
app.use('/assets', express.static(assetsDir, { maxAge: '1h', immutable: false, index: false }))
app.get('/styles.css', (_request, response) => {
  response.sendFile(join(rootDir, 'styles.css'))
})

app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
  response.sendFile(join(rootDir, 'index.html'))
})

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error('Unhandled error', error)
  response.status(500).json({ message: 'Internal server error.' })
})

function startServer(): void {
  ensureSchema()

  app.listen(port, () => {
    console.log(`Noskip server listening on port ${port} using SQLite at ${databasePath}`)
  })
}

try {
  startServer()
} catch (error) {
  console.error('Failed to start Noskip server', error)
  process.exit(1)
}
