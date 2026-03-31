const REGISTERED_USER_KEY = 'noskip-registered-user';
const ACTIVE_USER_KEY = 'noskip-active-user';
const SESSION_HISTORY_KEY = 'noskip-session-history';
function readJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
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
export function getRegisteredUser() {
    return readJson(REGISTERED_USER_KEY, null);
}
export function hasRegisteredUser() {
    return getRegisteredUser() !== null;
}
export function getActiveUser() {
    const registered = getRegisteredUser();
    const activeEmail = localStorage.getItem(ACTIVE_USER_KEY);
    if (!registered || !activeEmail)
        return null;
    if (registered.email.toLowerCase() !== activeEmail.toLowerCase())
        return null;
    return registered;
}
export function registerUser(name, email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = getRegisteredUser();
    if (existing && existing.email.toLowerCase() !== normalizedEmail) {
        return {
            ok: false,
            message: 'This MVP keeps one local account per device. Log in with the existing account or clear local storage.'
        };
    }
    const user = {
        name: name.trim(),
        email: normalizedEmail,
        password,
        createdAt: existing?.createdAt ?? new Date().toISOString()
    };
    localStorage.setItem(REGISTERED_USER_KEY, JSON.stringify(user));
    localStorage.setItem(ACTIVE_USER_KEY, normalizedEmail);
    return { ok: true };
}
export function loginUser(email, password) {
    const registered = getRegisteredUser();
    if (!registered) {
        return { ok: false, message: 'No account found on this device yet. Create one first.' };
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (registered.email.toLowerCase() !== normalizedEmail || registered.password !== password) {
        return { ok: false, message: 'Email or password is incorrect.' };
    }
    localStorage.setItem(ACTIVE_USER_KEY, normalizedEmail);
    return { ok: true };
}
export function logoutUser() {
    localStorage.removeItem(ACTIVE_USER_KEY);
}
export function getSessionsForUser(email) {
    const normalizedEmail = email.trim().toLowerCase();
    const allSessions = readJson(SESSION_HISTORY_KEY, []);
    return allSessions
        .filter((session) => session.userEmail.toLowerCase() === normalizedEmail)
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
}
export function saveSession(session) {
    const allSessions = readJson(SESSION_HISTORY_KEY, []);
    allSessions.push(session);
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(allSessions));
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
