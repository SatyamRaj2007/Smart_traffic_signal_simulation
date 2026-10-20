const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `API request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export const json = (method, body) => ({ method, body: JSON.stringify(body) });
