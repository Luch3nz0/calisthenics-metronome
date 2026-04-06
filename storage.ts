import type { AuthUser, PageVisitDraft, ProfileStats, SessionDraft, StoredSession } from './shared-types.js'

export type { AuthUser, PageVisitDraft, ProfileStats, SessionDraft, StoredSession } from './shared-types.js'

type ApiErrorPayload = {
  message?: string
}

type AuthResponse = {
  ok: boolean
  user?: AuthUser
  message?: string
}

type MeResponse = {
  user: AuthUser | null
}

type HistoryResponse = {
  sessions: StoredSession[]
}

type SaveSessionResponse = {
  session: StoredSession
}

type OkResponse = {
  ok: boolean
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await readJson<ApiErrorPayload>(response)
    return payload.message?.trim() || fallback
  } catch {
    return fallback
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers
  })
}

function toDateKey(value: string): string {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export async function getActiveUser(): Promise<AuthUser | null> {
  const response = await requestJson<MeResponse>('/api/auth/me')

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not load the current user.'))
  }

  const payload = await readJson<MeResponse>(response)
  return payload.user
}

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ ok: boolean; message?: string; user?: AuthUser }> {
  const response = await requestJson<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  })

  if (!response.ok) {
    return {
      ok: false,
      message: await readErrorMessage(response, 'Could not create the account.')
    }
  }

  return readJson<AuthResponse>(response)
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ ok: boolean; message?: string; user?: AuthUser }> {
  const response = await requestJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })

  if (!response.ok) {
    return {
      ok: false,
      message: await readErrorMessage(response, 'Could not log in.')
    }
  }

  return readJson<AuthResponse>(response)
}

export async function logoutUser(): Promise<void> {
  const response = await requestJson<AuthResponse>('/api/auth/logout', {
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not log out.'))
  }
}

export async function getSessionsForUser(): Promise<StoredSession[]> {
  const response = await requestJson<HistoryResponse>('/api/history')

  if (response.status === 401) return []
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not load session history.'))
  }

  const payload = await readJson<HistoryResponse>(response)
  return payload.sessions
}

export async function saveSession(session: SessionDraft): Promise<StoredSession> {
  const response = await requestJson<SaveSessionResponse>('/api/history', {
    method: 'POST',
    body: JSON.stringify(session)
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not save the session.'))
  }

  const payload = await readJson<SaveSessionResponse>(response)
  return payload.session
}

export async function recordPageVisit(
  visit: PageVisitDraft,
  options: { useBeacon?: boolean } = {}
): Promise<void> {
  const payload = JSON.stringify(visit)

  if (options.useBeacon && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([payload], { type: 'application/json' })
    if (navigator.sendBeacon('/api/analytics/page-visit', blob)) {
      return
    }
  }

  const response = await requestJson<OkResponse>('/api/analytics/page-visit', {
    method: 'POST',
    body: payload,
    keepalive: options.useBeacon
  })

  if (response.status === 401) return
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not save page analytics.'))
  }
}

export function getProfileStats(sessions: StoredSession[]): ProfileStats {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalValidReps: 0,
      avgDepthScore: 0,
      avgPostureScore: 0,
      streakDays: 0
    }
  }

  const totalSessions = sessions.length
  const totalValidReps = sessions.reduce((sum, session) => sum + session.validReps, 0)
  const avgDepthScore = Math.round(
    sessions.reduce((sum, session) => sum + session.depthScore, 0) / sessions.length
  )
  const avgPostureScore = Math.round(
    sessions.reduce((sum, session) => sum + session.postureScore, 0) / sessions.length
  )

  const uniqueDays = Array.from(new Set(sessions.map((session) => toDateKey(session.completedAt))))
  const sortedDays = uniqueDays
    .map((day) => new Date(`${day}T00:00:00`))
    .sort((a, b) => b.getTime() - a.getTime())

  let streakDays = 0
  let cursor = new Date(sortedDays[0])

  for (const day of sortedDays) {
    if (toDateKey(day.toISOString()) !== toDateKey(cursor.toISOString())) break
    streakDays += 1
    cursor = addDays(cursor, -1)
  }

  return {
    totalSessions,
    totalValidReps,
    avgDepthScore,
    avgPostureScore,
    streakDays
  }
}
