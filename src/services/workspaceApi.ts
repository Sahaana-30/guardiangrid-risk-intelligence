import { auth } from '../lib/firebase';
import { getActiveOrganizationId } from './tenantScope';
import { apiUrl, getApiCredentials } from './apiBase';
import type { EmergencySimulationResult, WorkspaceUsageResponse } from '../types/workspace';

async function buildWorkspaceHeaders(
  roleHeader: 'ORG_ADMIN' | 'DISPATCHER' = 'DISPATCHER'
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-gg-role': roleHeader,
    'x-gg-org-id': getActiveOrganizationId(),
  };
  try {
    const user = auth?.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // Non-production dev header fallback
  }
  return headers;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchWorkspaceUsageApi(
  roleHeader: 'ORG_ADMIN' | 'DISPATCHER' = 'DISPATCHER'
): Promise<WorkspaceUsageResponse> {
  const res = await fetch(apiUrl('/api/workspace/usage'), {
    credentials: getApiCredentials(),
    headers: await buildWorkspaceHeaders(roleHeader),
  });
  return parseJson<WorkspaceUsageResponse>(res);
}

export async function fetchLatestSimulationApi(): Promise<{
  demoTenantId: string;
  simulation: EmergencySimulationResult | null;
}> {
  const res = await fetch(apiUrl('/api/workspace/simulation'), {
    credentials: getApiCredentials(),
    headers: await buildWorkspaceHeaders('ORG_ADMIN'),
  });
  return parseJson(res);
}

export async function runAdminSimulationApi(): Promise<{
  simulation: EmergencySimulationResult;
}> {
  const res = await fetch(apiUrl('/api/workspace/simulation/run'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildWorkspaceHeaders('ORG_ADMIN'),
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function resetAdminSimulationApi(): Promise<{
  reset: boolean;
  demoTenantId: string;
}> {
  const res = await fetch(apiUrl('/api/workspace/simulation/reset'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildWorkspaceHeaders('ORG_ADMIN'),
    body: JSON.stringify({}),
  });
  return parseJson(res);
}
