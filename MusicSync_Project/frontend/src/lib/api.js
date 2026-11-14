// Session: a short-lived access token (JWT) sent with every request, and a long-lived refresh
// token that quietly buys a new one when it expires. Signing in once lasts until you sign out
// (or stay away for 30 days).
const TOKEN_KEY = 'musicsync.token';
const REFRESH_KEY = 'musicsync.refresh';

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* private mode: the session just won't survive a reload */ }
};

export const getToken = () => read(TOKEN_KEY);
// Sessions created before refresh tokens existed stored one token that now serves as the refresh token.
const getRefreshToken = () => read(REFRESH_KEY) || read(TOKEN_KEY);
export const hasSession = () => !!getRefreshToken();

export const setSession = (login) => {
  write(TOKEN_KEY, login?.token || null);
  write(REFRESH_KEY, login?.refreshToken || null);
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const fallback = res.status >= 500 ? "The server isn't responding. Try again in a moment." : `Something went wrong (${res.status})`;
    throw new ApiError(res.status, data?.error || fallback);
  }
  return data;
}

let refreshing = null; // one refresh at a time, shared by every request that needs it

function refresh() {
  if (!refreshing) {
    const refreshToken = getRefreshToken();
    refreshing = (async () => {
      if (!refreshToken) throw new ApiError(401, 'Please sign in again');
      const login = await request('/auth/refresh', { method: 'POST', body: { refreshToken } });
      setSession(login);
      return login.token;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

const PUBLIC = /^\/auth\/(login|register|refresh|available)/;

export async function api(path, options = {}) {
  if (PUBLIC.test(path)) return request(path, options);
  try {
    return await request(path, options, getToken());
  } catch (e) {
    if (e.status !== 401 || path === '/auth/logout') throw e;
  }
  // The access token expired: get a new one and try once more. A 401 from here means the session is over.
  const token = await refresh();
  return request(path, options, token);
}

export async function signOut() {
  const refreshToken = getRefreshToken();
  setSession(null);
  if (refreshToken) {
    try { await request('/auth/logout', { method: 'POST', body: { refreshToken } }); } catch { /* signed out locally either way */ }
  }
}
