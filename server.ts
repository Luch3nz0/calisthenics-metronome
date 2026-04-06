import express, { type NextFunction, type Request, type Response } from 'express'
import { randomBytes, randomUUID, createHash, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import type { AuthUser, PageVisitDraft, SessionDraft, StoredSession, TrackedPageName } from './shared-types.js'

const scrypt = promisify(scryptCallback)
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = join(rootDir, 'dist')
const assetsDir = join(rootDir, 'assets')

const port = Number(process.env.PORT ?? 8080)
const databaseUrl = process.env.DATABASE_URL
const databaseSchema = (() => {
  const value = (process.env.DATABASE_SCHEMA ?? 'noskip').trim()

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error('DATABASE_SCHEMA must be a valid PostgreSQL identifier.')
  }

  return value
})()
const quotedSchema = `"${databaseSchema}"`
const usersTable = `${quotedSchema}.users`
const authSessionsTable = `${quotedSchema}.auth_sessions`
const workoutSessionsTable = `${quotedSchema}.workout_sessions`
const pageVisitsTable = `${quotedSchema}.page_visits`
const sessionCookieName = 'noskip_session'
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30
const adminDashboardUsername = (process.env.ADMIN_DASHBOARD_USERNAME ?? 'admin').trim() || 'admin'
const adminDashboardPassword = process.env.ADMIN_DASHBOARD_PASSWORD?.trim() ?? ''
const trackedPageNames: readonly TrackedPageName[] = ['home', 'details', 'live', 'results', 'profile']

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to start the Noskip server.')
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10
})

type DatabaseUserRow = {
  id: string
  name: string
  email: string
  created_at: Date
  password_hash?: string
}

type DatabaseSessionRow = {
  id: string
  user_email: string
  completed_at: Date
  duration_seconds: number
  total_reps: number
  valid_reps: number
  invalid_reps: number
  depth_score: number
  posture_score: number
  notes: unknown
  total_sets: number
  reps_per_set: number
}

type DatabasePageVisitRow = {
  id: string
  user_id: string
  user_email: string
  browser_session_id: string
  page_name: TrackedPageName
  entered_at: Date
  exited_at: Date
  duration_ms: number
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
  created_at: Date
  last_seen_at: Date
  last_workout_at: Date | null
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
  completed_at: Date
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

function toAuthUser(row: DatabaseUserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: new Date(row.created_at).toISOString()
  }
}

function toStoredSession(row: DatabaseSessionRow): StoredSession {
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
    notes: Array.isArray(row.notes) ? row.notes.map(String) : [],
    totalSets: row.total_sets,
    repsPerSet: row.reps_per_set
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

async function createAuthSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionTtlMs)

  await pool.query(
    `
      insert into ${authSessionsTable} (id, user_id, token_hash, expires_at)
      values ($1, $2, $3, $4)
    `,
    [randomUUID(), userId, hashSessionToken(token), expiresAt.toISOString()]
  )

  return token
}

async function destroyAuthSession(token: string | null): Promise<void> {
  if (!token) return
  await pool.query(`delete from ${authSessionsTable} where token_hash = $1`, [hashSessionToken(token)])
}

async function findSessionUser(token: string | null): Promise<{ user: AuthUser; userId: string } | null> {
  if (!token) return null

  const result = await pool.query<DatabaseUserRow & { session_user_id: string }>(
    `
      select users.id, users.name, users.email, users.created_at, auth_sessions.user_id as session_user_id
      from ${authSessionsTable} as auth_sessions
      inner join ${usersTable} as users on users.id = auth_sessions.user_id
      where auth_sessions.token_hash = $1
        and auth_sessions.expires_at > now()
      limit 1
    `,
    [hashSessionToken(token)]
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    user: toAuthUser(row),
    userId: row.session_user_id
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
  const notes = Array.isArray(payload.notes)
    ? payload.notes
        .map((item) => String(item).trim())
        .filter((item) => item !== '')
        .slice(0, 6)
        .map((item) => item.slice(0, 180))
    : []

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
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return 'Never'

  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m'

  if (seconds < 60) {
    return `${seconds}s`
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

async function loadDashboardData(): Promise<{
  summary: DashboardSummaryRow
  pageMetrics: DashboardPageMetricRow[]
  userMetrics: DashboardUserMetricRow[]
  recentWorkouts: DashboardRecentWorkoutRow[]
}> {
  const [summaryResult, pageMetricsResult, userMetricsResult, recentWorkoutsResult] = await Promise.all([
    pool.query<DashboardSummaryRow>(`
      select
        (select count(*)::int from ${usersTable}) as total_users,
        (select count(distinct user_id)::int from ${workoutSessionsTable}) as users_with_workouts,
        (
          select count(*)::int
          from (
            select user_id from ${pageVisitsTable} where exited_at >= now() - interval '7 days'
            union
            select user_id from ${workoutSessionsTable} where completed_at >= now() - interval '7 days'
          ) as active_users
        ) as active_users_7d,
        (select count(*)::int from ${workoutSessionsTable}) as total_workouts,
        (select coalesce(sum(duration_seconds), 0)::int from ${workoutSessionsTable}) as total_workout_seconds,
        (select coalesce(round(sum(duration_ms) / 1000.0), 0)::int from ${pageVisitsTable}) as total_tracked_seconds
    `),
    pool.query<DashboardPageMetricRow>(`
      select
        page_name,
        count(*)::int as views,
        count(distinct user_id)::int as unique_users,
        coalesce(round(avg(duration_ms) / 1000.0), 0)::int as avg_duration_seconds,
        coalesce(round(sum(duration_ms) / 1000.0), 0)::int as total_duration_seconds
      from ${pageVisitsTable}
      group by page_name
      order by total_duration_seconds desc, page_name asc
    `),
    pool.query<DashboardUserMetricRow>(`
      with workout_stats as (
        select
          user_id,
          count(*)::int as total_sessions,
          coalesce(sum(duration_seconds), 0)::int as workout_duration_seconds,
          coalesce(round(avg(depth_score)), 0)::int as avg_depth_score,
          coalesce(round(avg(posture_score)), 0)::int as avg_posture_score,
          max(completed_at) as last_workout_at
        from ${workoutSessionsTable}
        group by user_id
      ),
      visit_stats as (
        select
          user_id,
          count(*)::int as total_page_views,
          coalesce(round(sum(duration_ms) / 1000.0), 0)::int as app_duration_seconds,
          max(exited_at) as last_seen_at
        from ${pageVisitsTable}
        group by user_id
      )
      select
        users.id,
        users.name,
        users.email,
        users.created_at,
        greatest(
          users.created_at,
          coalesce(visit_stats.last_seen_at, users.created_at),
          coalesce(workout_stats.last_workout_at, users.created_at)
        ) as last_seen_at,
        workout_stats.last_workout_at,
        coalesce(workout_stats.total_sessions, 0)::int as total_sessions,
        coalesce(workout_stats.workout_duration_seconds, 0)::int as workout_duration_seconds,
        coalesce(workout_stats.avg_depth_score, 0)::int as avg_depth_score,
        coalesce(workout_stats.avg_posture_score, 0)::int as avg_posture_score,
        coalesce(visit_stats.total_page_views, 0)::int as total_page_views,
        coalesce(visit_stats.app_duration_seconds, 0)::int as app_duration_seconds,
        favorite_page.favorite_page
      from ${usersTable} as users
      left join workout_stats on workout_stats.user_id = users.id
      left join visit_stats on visit_stats.user_id = users.id
      left join lateral (
        select page_name as favorite_page
        from ${pageVisitsTable}
        where user_id = users.id
        group by page_name
        order by sum(duration_ms) desc, page_name asc
        limit 1
      ) as favorite_page on true
      order by last_seen_at desc, users.created_at desc
    `),
    pool.query<DashboardRecentWorkoutRow>(`
      select
        workout_sessions.id,
        users.name,
        users.email,
        workout_sessions.completed_at,
        workout_sessions.duration_seconds,
        workout_sessions.total_reps,
        workout_sessions.valid_reps,
        workout_sessions.depth_score,
        workout_sessions.posture_score
      from ${workoutSessionsTable} as workout_sessions
      inner join ${usersTable} as users on users.id = workout_sessions.user_id
      order by workout_sessions.completed_at desc
      limit 18
    `)
  ])

  return {
    summary: summaryResult.rows[0] ?? {
      total_users: 0,
      users_with_workouts: 0,
      active_users_7d: 0,
      total_workouts: 0,
      total_workout_seconds: 0,
      total_tracked_seconds: 0
    },
    pageMetrics: pageMetricsResult.rows,
    userMetrics: userMetricsResult.rows,
    recentWorkouts: recentWorkoutsResult.rows
  }
}

function renderDashboardHtml(data: {
  summary: DashboardSummaryRow
  pageMetrics: DashboardPageMetricRow[]
  userMetrics: DashboardUserMetricRow[]
  recentWorkouts: DashboardRecentWorkoutRow[]
}): string {
  const pageMetricsMarkup =
    data.pageMetrics.length === 0
      ? `
          <tr>
            <td colspan="5" class="empty-row">No page analytics yet. Screen-time tracking starts after this dashboard release.</td>
          </tr>
        `
      : data.pageMetrics
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
      --accent-strong: #34c5ff;
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
        Live snapshot of the Fly PostgreSQL data: users, workout history, tracked in-app screen time, and recent product activity.
      </p>
      <div class="pill-row">
        <span class="pill">Schema ${escapeHtml(databaseSchema)}</span>
        <span class="pill">Updated ${escapeHtml(formatDateTime(new Date()))}</span>
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

async function ensureSchema(): Promise<void> {
  await pool.query(`
    create schema if not exists ${quotedSchema};

    create table if not exists ${usersTable} (
      id text primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists ${authSessionsTable} (
      id text primary key,
      user_id text not null references ${usersTable}(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create table if not exists ${workoutSessionsTable} (
      id text primary key,
      user_id text not null references ${usersTable}(id) on delete cascade,
      user_email text not null,
      completed_at timestamptz not null,
      duration_seconds integer not null,
      total_reps integer not null,
      valid_reps integer not null,
      invalid_reps integer not null,
      depth_score integer not null,
      posture_score integer not null,
      notes jsonb not null default '[]'::jsonb,
      total_sets integer not null,
      reps_per_set integer not null,
      created_at timestamptz not null default now()
    );

    create table if not exists ${pageVisitsTable} (
      id text primary key,
      user_id text not null references ${usersTable}(id) on delete cascade,
      user_email text not null,
      browser_session_id text not null,
      page_name text not null,
      entered_at timestamptz not null,
      exited_at timestamptz not null,
      duration_ms integer not null check (duration_ms >= 0),
      created_at timestamptz not null default now()
    );

    create index if not exists ${databaseSchema}_auth_sessions_user_id_idx on ${authSessionsTable} (user_id);
    create index if not exists ${databaseSchema}_auth_sessions_expires_at_idx on ${authSessionsTable} (expires_at);
    create index if not exists ${databaseSchema}_workout_sessions_user_id_completed_idx
      on ${workoutSessionsTable} (user_id, completed_at desc);
    create index if not exists ${databaseSchema}_page_visits_user_id_exited_idx
      on ${pageVisitsTable} (user_id, exited_at desc);
    create index if not exists ${databaseSchema}_page_visits_page_name_exited_idx
      on ${pageVisitsTable} (page_name, exited_at desc);
  `)

  await pool.query(`delete from ${authSessionsTable} where expires_at <= now()`)
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

const loadAuthUser = asyncHandler(async (request, response, next) => {
  const authRequest = request as AuthenticatedRequest
  const token = readCookie(request.headers.cookie, sessionCookieName)
  const session = await findSessionUser(token)

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
  response.json({ ok: true })
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

    const existing = await pool.query<{ id: string }>(`select id from ${usersTable} where email = $1 limit 1`, [email])
    if (existing.rows[0]) {
      response.status(409).json({ message: 'An account with that email already exists.' })
      return
    }

    const userId = randomUUID()
    const passwordHash = await hashPassword(password)

    const result = await pool.query<DatabaseUserRow>(
      `
        insert into ${usersTable} (id, name, email, password_hash)
        values ($1, $2, $3, $4)
        returning id, name, email, created_at
      `,
      [userId, name, email, passwordHash]
    )

    const user = toAuthUser(result.rows[0])
    const token = await createAuthSession(userId)

    setSessionCookie(response, token)
    response.status(201).json({ ok: true, user })
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

    const result = await pool.query<DatabaseUserRow>(
      `select id, name, email, created_at, password_hash from ${usersTable} where email = $1 limit 1`,
      [email]
    )

    const row = result.rows[0]
    if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
      response.status(401).json({ message: 'Email or password is incorrect.' })
      return
    }

    const token = await createAuthSession(row.id)
    setSessionCookie(response, token)
    response.json({ ok: true, user: toAuthUser(row) })
  })
)

app.post(
  '/api/auth/logout',
  asyncHandler(async (request, response) => {
    const token = readCookie(request.headers.cookie, sessionCookieName)
    await destroyAuthSession(token)
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
    const authUser = authRequest.authUser
    const authUserId = authRequest.authUserId

    if (!authUser || !authUserId) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const pageVisit = parsePageVisitDraft(request.body)

    if (!pageVisit) {
      response.status(400).json({ message: 'Page visit payload is invalid.' })
      return
    }

    await pool.query<DatabasePageVisitRow>(
      `
        insert into ${pageVisitsTable} (
          id, user_id, user_email, browser_session_id, page_name, entered_at, exited_at, duration_ms
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        authUserId,
        authUser.email,
        pageVisit.browserSessionId,
        pageVisit.pageName,
        pageVisit.enteredAt,
        pageVisit.exitedAt,
        pageVisit.durationMs
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
    const result = await pool.query<DatabaseSessionRow>(
      `
        select id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
               depth_score, posture_score, notes, total_sets, reps_per_set
        from ${workoutSessionsTable}
        where user_id = $1
        order by completed_at desc
      `,
      [authRequest.authUserId]
    )

    response.json({ sessions: result.rows.map(toStoredSession) })
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
    const result = await pool.query<DatabaseSessionRow>(
      `
        insert into ${workoutSessionsTable} (
          id, user_id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
          depth_score, posture_score, notes, total_sets, reps_per_set
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
        returning id, user_email, completed_at, duration_seconds, total_reps, valid_reps, invalid_reps,
                  depth_score, posture_score, notes, total_sets, reps_per_set
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
        sessionDraft.repsPerSet
      ]
    )

    response.status(201).json({ session: toStoredSession(result.rows[0]) })
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

async function startServer(): Promise<void> {
  await ensureSchema()

  app.listen(port, () => {
    console.log(`Noskip server listening on port ${port}`)
  })
}

void startServer().catch((error) => {
  console.error('Failed to start Noskip server', error)
  process.exit(1)
})
