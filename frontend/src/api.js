const TOKEN_KEY = 'gerenciamento.token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, token = getToken(), signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error.name === 'TimeoutError') throw new Error('O servidor demorou para responder. Tente novamente.');
    throw new Error('Não foi possível conectar ao servidor. Tente novamente em instantes.');
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token && token === getToken()) window.dispatchEvent(new Event('session-expired'));
    const error = new Error(data?.message || data?.error || 'Não foi possível concluir. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const register = (body) => api('/cadastro', { method: 'POST', body, token: null });

export async function login(body) {
  const token = await api('/login', { method: 'POST', body, token: null });
  if (typeof token !== 'string' || !token) throw new Error('Não foi possível iniciar sua sessão. Tente novamente.');
  const user = await api('/auth/me', { token });
  return { token, user };
}

export function queryString(params) {
  return new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)).toString();
}
