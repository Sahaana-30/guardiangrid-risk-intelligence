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

const OP_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'x-gg-role': 'dispatcher',
};

export async function fetchRescueCells(): Promise<{
  cells: RescueCell[];
  emergencyNumber: '112';
  storage: EmergencyStorageMeta;
}> {
  const res = await fetch('/api/emergency/cells', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  return parseJson(res, '/api/emergency/cells');
}

export async function submitPublicSOS(payload: PublicSOSPayload): Promise<PublicSOSReceipt> {
  const res = await fetch('/api/emergency/sos', {
    method: 'POST',
    credentials: 'same-origin',
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
  const res = await fetch(`/api/emergency/incidents?scope=${scope}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'x-gg-role': 'dispatcher' },
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
  const res = await fetch(`/api/emergency/incidents/${params.incidentId}/verify`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: OP_HEADERS,
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/verify`);
}

export async function fetchRankedResponders(
  incidentId: string
): Promise<{ ranked: RankedResponder[] }> {
  const res = await fetch(`/api/emergency/incidents/${incidentId}/rank-responders`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'x-gg-role': 'dispatcher' },
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
  const res = await fetch(`/api/emergency/incidents/${params.incidentId}/assign`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: OP_HEADERS,
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/assign`);
}

export async function updateIncidentStatusApi(params: {
  incidentId: string;
  nextState: IncidentState;
  actorId: string;
  actorName: string;
  actorRole: 'dispatcher' | 'responder';
  note?: string;
  acknowledgeOnly?: boolean;
}): Promise<{ incident: EmergencyIncident; responders: ResponderProfile[] }> {
  const res = await fetch(`/api/emergency/incidents/${params.incidentId}/status`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: OP_HEADERS,
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/status`);
}

export async function createIncidentNexconnGroupApi(params: {
  incidentId: string;
  ownerUserId: string;
  actorName: string;
}): Promise<{ incident: EmergencyIncident; live: boolean; error: string | null }> {
  const res = await fetch(`/api/emergency/incidents/${params.incidentId}/nexconn-group`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: OP_HEADERS,
    body: JSON.stringify(params),
  });
  return parseJson(res, `/api/emergency/incidents/${params.incidentId}/nexconn-group`);
}

export async function triggerSimulatedSOSApi(params: {
  category: EmergencyCategory;
  cellId: string;
  language: EmergencyLanguage;
}): Promise<{ incident: EmergencyIncident }> {
  const res = await fetch('/api/emergency/simulate/sos', {
    method: 'POST',
    credentials: 'same-origin',
    headers: OP_HEADERS,
    body: JSON.stringify(params),
  });
  return parseJson(res, '/api/emergency/simulate/sos');
}

export async function clearSimulatedIncidentsApi(): Promise<{ removedCount: number }> {
  const res = await fetch('/api/emergency/simulate/clear', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: OP_HEADERS,
  });
  return parseJson(res, '/api/emergency/simulate/clear');
}
