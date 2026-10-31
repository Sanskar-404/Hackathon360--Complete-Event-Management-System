const BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export function token() {
  return localStorage.getItem('hackos_token');
}

export async function api(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object'
      ? (payload.detail || 'Request failed')
      : (payload || 'Request failed');
    throw new Error(message);
  }
  return payload;
}

export const post = (path, body) => api(path, {
  method: 'POST',
  body: JSON.stringify(body)
});

export const patch = (path, body) => api(path, {
  method: 'PATCH',
  body: JSON.stringify(body)
});
