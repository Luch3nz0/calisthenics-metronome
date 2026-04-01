async function readJson(response) {
    return (await response.json());
}
async function readErrorMessage(response, fallback) {
    try {
        const payload = await readJson(response);
        return payload.message?.trim() || fallback;
    }
    catch {
        return fallback;
    }
}
async function requestJson(path, init) {
    const headers = new Headers(init?.headers);
    if (!headers.has('Content-Type') && init?.body) {
        headers.set('Content-Type', 'application/json');
    }
    return fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers
    });
}
function toDateKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
}
export async function getActiveUser() {
    const response = await requestJson('/api/auth/me');
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not load the current user.'));
    }
    const payload = await readJson(response);
    return payload.user;
}
export async function registerUser(name, email, password) {
    const response = await requestJson('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
    });
    if (!response.ok) {
        return {
            ok: false,
            message: await readErrorMessage(response, 'Could not create the account.')
        };
    }
    return readJson(response);
}
export async function loginUser(email, password) {
    const response = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
        return {
            ok: false,
            message: await readErrorMessage(response, 'Could not log in.')
        };
    }
    return readJson(response);
}
export async function logoutUser() {
    const response = await requestJson('/api/auth/logout', {
        method: 'POST'
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not log out.'));
    }
}
export async function getSessionsForUser() {
    const response = await requestJson('/api/history');
    if (response.status === 401)
        return [];
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not load session history.'));
    }
    const payload = await readJson(response);
    return payload.sessions;
}
export async function saveSession(session) {
    const response = await requestJson('/api/history', {
        method: 'POST',
        body: JSON.stringify(session)
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not save the session.'));
    }
    const payload = await readJson(response);
    return payload.session;
}
export function getProfileStats(sessions) {
    if (sessions.length === 0) {
        return {
            totalSessions: 0,
            totalValidReps: 0,
            avgDepthScore: 0,
            avgPostureScore: 0,
            streakDays: 0
        };
    }
    const totalSessions = sessions.length;
    const totalValidReps = sessions.reduce((sum, session) => sum + session.validReps, 0);
    const avgDepthScore = Math.round(sessions.reduce((sum, session) => sum + session.depthScore, 0) / sessions.length);
    const avgPostureScore = Math.round(sessions.reduce((sum, session) => sum + session.postureScore, 0) / sessions.length);
    const uniqueDays = Array.from(new Set(sessions.map((session) => toDateKey(session.completedAt))));
    const sortedDays = uniqueDays
        .map((day) => new Date(`${day}T00:00:00`))
        .sort((a, b) => b.getTime() - a.getTime());
    let streakDays = 0;
    let cursor = new Date(sortedDays[0]);
    for (const day of sortedDays) {
        if (toDateKey(day.toISOString()) !== toDateKey(cursor.toISOString()))
            break;
        streakDays += 1;
        cursor = addDays(cursor, -1);
    }
    return {
        totalSessions,
        totalValidReps,
        avgDepthScore,
        avgPostureScore,
        streakDays
    };
}
