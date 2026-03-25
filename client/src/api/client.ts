export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  // Handle empty responses (204)
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }
  return res.text() as unknown as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return fetchJson<T>(url);
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return fetchJson<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

export function apiPut<T>(url: string, body?: unknown): Promise<T> {
  return fetchJson<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(url: string): Promise<T> {
  return fetchJson<T>(url, { method: 'DELETE' });
}
