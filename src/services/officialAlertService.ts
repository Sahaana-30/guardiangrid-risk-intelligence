import { auth } from '../lib/firebase';
import { getActiveOrganizationId } from './tenantScope';
import { apiUrl, getApiCredentials } from './apiBase';
import type { EmergencyCategory, EmergencyLanguage } from '../types/emergency';
import type {
  InstantSosResponse,
  OfficialAlertLog,
  PublicNexconnTokenResponse,
  SosStreamEvent,
} from '../types/officialAlerts';

/**
 * Frontend client for the Instant SOS & Out-of-Band Official Alert pipeline.
 * SECURITY: Never calls Twilio or external SMS/WhatsApp providers directly.
 * All provider credentials and REST API calls remain strictly on the Express backend.
 */

async function getOperationalHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-gg-org-id': getActiveOrganizationId(),
  };

  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      // Non-production dev fallback
    }
  }

  if (!headers.Authorization) {
    const storedOp = localStorage.getItem('gg_nexconn_operator_id') || 'gg-dispatch-chennai';
    headers['x-gg-role'] =
      storedOp === 'gg-lifeguard-marina'
        ? 'RESPONDER'
        : storedOp === 'gg-analyst-ss'
          ? 'ORG_ADMIN'
          : 'DISPATCHER';
  }

  return headers;
}

export async function requestPublicSosNexconnToken(
  displayName?: string
): Promise<PublicNexconnTokenResponse> {
  const res = await fetch(apiUrl('/api/sos/public-token'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-gg-org-id': getActiveOrganizationId(),
    },
    body: JSON.stringify({ displayName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as PublicNexconnTokenResponse;
}

export async function triggerInstantSos(params: {
  category: EmergencyCategory;
  cellId?: string;
  lat?: number | null;
  lon?: number | null;
  gpsAccuracyMeters?: number | null;
  locationSource?: 'gps' | 'qr_cell' | 'manual';
  language?: EmergencyLanguage;
  description?: string;
  reporterName?: string;
  reporterPhone?: string;
  reporterNexconnUserId?: string;
  clientRequestId?: string;
  isSandboxTest?: boolean;
}): Promise<InstantSosResponse> {
  const res = await fetch(apiUrl('/api/sos/instant'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-gg-org-id': getActiveOrganizationId(),
    },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Instant SOS failed (HTTP ${res.status})`);
  }
  return data as InstantSosResponse;
}

export async function sendBystanderSosUpdateApi(params: {
  incidentId: string;
  channelToken: string;
  kind: 'text' | 'voice_transcript' | 'photo';
  text: string;
}): Promise<{
  ok: boolean;
  updateId: string;
  incidentId: string;
  kind: 'text' | 'voice_transcript' | 'photo';
  text: string;
  deliveredToNexconn: boolean;
  sentAt: string;
}> {
  const res = await fetch(
    apiUrl(`/api/sos/incidents/${encodeURIComponent(params.incidentId)}/updates`),
    {
      method: 'POST',
      credentials: getApiCredentials(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-gg-org-id': getActiveOrganizationId(),
        'x-gg-sos-token': params.channelToken,
      },
      body: JSON.stringify({
        kind: params.kind,
        text: params.text,
        channelToken: params.channelToken,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to send SOS update (HTTP ${res.status})`);
  }
  return data;
}

export async function fetchOfficialAlertLogs(incidentId?: string): Promise<{
  alerts: OfficialAlertLog[];
  channels: {
    smsConfigured: boolean;
    whatsappConfigured: boolean;
    simulatorEnabled: boolean;
  };
}> {
  const headers = await getOperationalHeaders();
  const qs = incidentId ? `?incidentId=${encodeURIComponent(incidentId)}` : '';
  const res = await fetch(apiUrl(`/api/sos/alerts${qs}`), {
    credentials: getApiCredentials(),
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to load official alert logs (HTTP ${res.status})`);
  }
  return data;
}

export async function acknowledgeOfficialAlertApi(
  logId: string,
  actorName?: string
): Promise<OfficialAlertLog> {
  const headers = await getOperationalHeaders();
  const res = await fetch(apiUrl(`/api/sos/alerts/${encodeURIComponent(logId)}/acknowledge`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to acknowledge alert (HTTP ${res.status})`);
  }
  return data.alert as OfficialAlertLog;
}

export async function retryOfficialAlertApi(logId: string): Promise<OfficialAlertLog> {
  const headers = await getOperationalHeaders();
  const res = await fetch(apiUrl(`/api/sos/alerts/${encodeURIComponent(logId)}/retry`), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to retry alert (HTTP ${res.status})`);
  }
  return data.alert as OfficialAlertLog;
}

/**
 * Opens an authenticated Server-Sent Events (SSE) stream to /api/sos/stream using fetch
 * ReadableStream so Authorization Bearer & x-gg-org-id headers are sent securely.
 */
export function subscribeToSosStream(
  onEvent: (event: SosStreamEvent) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  let aborted = false;
  let controller: AbortController | null = null;
  let reconnectTimer: number | null = null;

  const connect = async () => {
    if (aborted) return;
    controller = new AbortController();

    try {
      const headers = await getOperationalHeaders();
      const res = await fetch(apiUrl('/api/sos/stream'), {
        method: 'GET',
        credentials: getApiCredentials(),
        headers: {
          ...headers,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE stream HTTP ${res.status}`);
      }

      onStatusChange?.(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim();
            }
          }
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine) as SosStreamEvent;
              onEvent(parsed);
            } catch {
              // Ignore malformed SSE comment/chunk
            }
          }
        }
      }
    } catch {
      onStatusChange?.(false);
    }

    if (!aborted) {
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, 4000);
    }
  };

  void connect();

  return () => {
    aborted = true;
    onStatusChange?.(false);
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    controller?.abort();
  };
}
