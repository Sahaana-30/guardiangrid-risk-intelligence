import type {
  EmergencyCategory,
  EmergencyIncident,
  EmergencyLanguage,
  EmergencyStorageMeta,
  IncidentState,
  PublicSOSPayload,
  PublicSOSReceipt,
  RankedResponder,
  RescueCell,
  ResponderProfile,
} from '../types/emergency';

import { getActiveOrganizationId } from './tenantScope';
import { apiUrl, getApiCredentials } from './apiBase';

const OFFLINE_SOS_QUEUE_KEY = 'gg_offline_sos_queue_v1';

async function parseJson<T>(res: Response, endpoint: string): Promise<T> {
  const ct = res.headers.get('content-type') || 'unknown';
  if (!ct.toLowerCase().includes('application/json')) {
    throw new Error(
      `${endpoint} returned non-JSON response (HTTP ${res.status}, Content-Type: ${ct}).`
    );
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `${endpoint} failed (HTTP ${res.status}).`);
  }
  return data as T;
}

type TokenProvider = () => Promise<string | null>;
let authTokenProvider: TokenProvider | null = null;

export function setAuthTokenProvider(provider: TokenProvider | null): void {
  authTokenProvider = provider;
}

export async function buildOperationalHeaders(includeJsonBody = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-gg-role': 'dispatcher',
    'x-gg-org-id': getActiveOrganizationId(),
  };
  if (includeJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (authTokenProvider) {
    const token = await authTokenProvider();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function fetchRescueCells(): Promise<{
  cells: RescueCell[];
  emergencyNumber: '112';
  storage: EmergencyStorageMeta;
}> {
  const res = await fetch(apiUrl('/api/emergency/cells'), {
    credentials: getApiCredentials(),
    headers: { Accept: 'application/json' },
  });
  return parseJson(res, '/api/emergency/cells');
}

export async function submitPublicSOS(payload: PublicSOSPayload): Promise<PublicSOSReceipt> {
  const res = await fetch(apiUrl('/api/emergency/sos'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson<PublicSOSReceipt>(res, '/api/emergency/sos');
}

export function getOfflineSOSQueue(): PublicSOSPayload[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SOS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineSOS(payload: PublicSOSPayload): PublicSOSPayload[] {
  const queue = getOfflineSOSQueue();
  const next = [...queue, payload];
  try {
    localStorage.setItem(OFFLINE_SOS_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function clearOfflineSOSQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_SOS_QUEUE_KEY);
  } catch {
    // Ignore
  }
}

export async function flushOfflineSOSQueue(): Promise<{
  synced: PublicSOSReceipt[];
  remaining: number;
}> {
  const queue = getOfflineSOSQueue();
  if (queue.length === 0) return { synced: [], remaining: 0 };

  const synced: PublicSOSReceipt[] = [];
  const remaining: PublicSOSPayload[] = [];

  for (const item of queue) {
    try {
      const receipt = await submitPublicSOS(item);
      synced.push(receipt);
    } catch {
      remaining.push(item);
    }
  }

  try {
    if (remaining.length === 0) {
      localStorage.removeItem(OFFLINE_SOS_QUEUE_KEY);
    } else {
      localStorage.setItem(OFFLINE_SOS_QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch {
    // Ignore
  }

  return { synced, remaining: remaining.length };
}

export async function fetchOperationalIncidents(
  scope: 'all' | 'real' | 'simulated' = 'all'
): Promise<{
  incidents: EmergencyIncident[];
  responders: ResponderProfile[];
  storage: EmergencyStorageMeta;
}> {
  const res = await fetch(apiUrl(`/api/emergency/incidents?scope=${scope}`), {
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(false),
  });
  return parseJson(res, '/api/emergency/incidents');
}

export async function verifyIncidentApi(params: {
  incidentId: string;
  decision: 'verify' | 'reject';
  dispatcherId: string;
  dispatcherName: string;
  notes?: string;
  createNexconnGroup?: boolean;
}): Promise<{ incident: EmergencyIncident }> {
  const res = await fetch(apiUrl(`/api/emergency/incidents/${params.incidentId}/verify`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(true),
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/verify`);
}

export async function fetchRankedResponders(
  incidentId: string
): Promise<{ ranked: RankedResponder[] }> {
  const res = await fetch(apiUrl(`/api/emergency/incidents/${incidentId}/rank-responders`), {
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(false),
  });
  return parseJson(res, `/api/emergency/incidents/${incidentId}/rank-responders`);
}

export async function assignRespondersApi(params: {
  incidentId: string;
  responderIds: string[];
  backupResponderId?: string | null;
  escalationTimeoutSeconds?: number;
  dispatcherId: string;
  dispatcherName: string;
}): Promise<{
  incident: EmergencyIncident;
  groupInviteSynced: boolean;
  responders: ResponderProfile[];
}> {
  const res = await fetch(apiUrl(`/api/emergency/incidents/${params.incidentId}/assign`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(true),
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/assign`);
}

export async function updateIncidentStatusApi(params: {
  incidentId: string;
  nextState?: IncidentState;
  actorId: string;
  actorName: string;
  actorRole: 'dispatcher' | 'responder';
  note?: string;
  acknowledgeOnly?: boolean;
  requestBackup?: boolean;
  rejectAssignment?: boolean;
  clientRequestId?: string;
  responderLat?: number | null;
  responderLon?: number | null;
  arrivalVerification?: EmergencyIncident['arrivalVerification'];
}): Promise<{
  incident: EmergencyIncident;
  responders: ResponderProfile[];
  deduplicated?: boolean;
  organizationId?: string;
}> {
  const res = await fetch(apiUrl(`/api/emergency/incidents/${params.incidentId}/status`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(true),
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/status`);
}

export async function createIncidentNexconnGroupApi(params: {
  incidentId: string;
  ownerUserId: string;
  actorName: string;
}): Promise<{ incident: EmergencyIncident; live: boolean; error: string | null }> {
  const res = await fetch(apiUrl(`/api/emergency/incidents/${params.incidentId}/nexconn-group`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(true),
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/nexconn-group`);
}

export async function joinIncidentNexconnGroupApi(
  incidentId: string,
  memberUserId?: string
): Promise<{ ok: boolean; groupId: string; memberUserId: string; synced: boolean }> {
  const res = await fetch(apiUrl(`/api/emergency/incidents/${incidentId}/nexconn-group/join`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(true),
    body: JSON.stringify(memberUserId ? { memberUserId } : {}),
  });
  return parseJson(res, `/api/emergency/incidents/${incidentId}/nexconn-group/join`);
}

export async function triggerSimulatedSOSApi(params: {
  category: EmergencyCategory;
  cellId: string;
  language: EmergencyLanguage;
}): Promise<{ incident: EmergencyIncident }> {
  const res = await fetch(apiUrl('/api/emergency/simulate/sos'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(true),
    body: JSON.stringify(params),
  });
  return parseJson(res, '/api/emergency/simulate/sos');
}

export async function clearSimulatedIncidentsApi(): Promise<{ removedCount: number }> {
  const res = await fetch(apiUrl('/api/emergency/simulate/clear'), {
    method: 'DELETE',
    credentials: getApiCredentials(),
    headers: await buildOperationalHeaders(false),
  });
  return parseJson(res, '/api/emergency/simulate/clear');
}
