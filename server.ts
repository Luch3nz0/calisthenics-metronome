import express, { type NextFunction, type Request, type Response } from 'express'
import { randomBytes, randomUUID, createHash, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import type { AuthUser, SessionDraft, StoredSession } from './shared-types.js'

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
const sessionCookieName = 'noskip_session'
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30

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

    create index if not exists ${databaseSchema}_auth_sessions_user_id_idx on ${authSessionsTable} (user_id);
    create index if not exists ${databaseSchema}_auth_sessions_expires_at_idx on ${authSessionsTable} (expires_at);
    create index if not exists ${databaseSchema}_workout_sessions_user_id_completed_idx
      on ${workoutSessionsTable} (user_id, completed_at desc);
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
      "script-src 'self' https://cdn.jsdelivr.net",
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
