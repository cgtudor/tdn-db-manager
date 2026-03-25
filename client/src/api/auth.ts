import { apiGet, apiPost } from './client';
import type { AuthStatus } from '../types';

export function getAuthStatus(): Promise<AuthStatus> {
  return apiGet<AuthStatus>('/auth/status');
}

export function logout(): Promise<void> {
  return apiPost('/auth/logout');
}
