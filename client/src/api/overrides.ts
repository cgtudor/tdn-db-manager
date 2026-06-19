import { apiGet, apiDelete, ApiError } from './client';
import { subscribeSSE } from './live';

export interface OverrideFile {
  name: string;
  size: number;
  mtime: number;
}

export function listOverrides(base: string): Promise<OverrideFile[]> {
  return apiGet(base);
}

export function deleteOverride(base: string, name: string): Promise<{ success: boolean }> {
  return apiDelete(`${base}/${encodeURIComponent(name)}`);
}

/**
 * Upload one or more files via multipart/form-data. Cannot use apiPost, which
 * forces a JSON Content-Type; the browser sets the multipart boundary itself.
 */
export async function uploadOverrides(base: string, files: File[]): Promise<OverrideFile[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }

  const res = await fetch(base, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

/** Subscribe to the real-time file list (server pushes the full list on change). */
export function subscribeOverrides(base: string, onMessage: (files: OverrideFile[]) => void): () => void {
  return subscribeSSE<OverrideFile[]>(`${base}/stream`, onMessage);
}
