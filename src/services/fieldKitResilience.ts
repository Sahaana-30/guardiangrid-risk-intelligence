import type { EmergencyIncident, FieldResponderAction, IncidentState } from '../types/emergency';
import { getActiveOrganizationId } from './tenantScope';

export type ConnectionQualityTier = 'good' | 'degraded' | 'offline';

export interface NetworkQualitySnapshot {
  tier: ConnectionQualityTier;
  online: boolean;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  recommendedCallMode: 'video' | 'audio' | 'offline';
  summary: string;
}

export type OfflineQueueItemKind = 'status_update' | 'group_message' | 'media_metadata';
export type OfflineQueueItemStatus = 'pending' | 'sent' | 'failed';

export interface FieldKitQueueItem {
  id: string;
  organizationId?: string;
  clientRequestId: string;
  kind: OfflineQueueItemKind;
  incidentId: string;
  incidentCode: string;
  action?: FieldResponderAction;
  nextState?: IncidentState;
  requestBackup?: boolean;
  rejectAssignment?: boolean;
  arrivalVerification?: EmergencyIncident['arrivalVerification'];
  note?: string;
  actorId: string;
  actorName: string;
  responderLat?: number | null;
  responderLon?: number | null;
  groupId?: string | null;
  messageText?: string;
  mediaMeta?: {
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    mediaKind: 'photo' | 'voice';
  };
  status: OfflineQueueItemStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  syncedAt?: string;
}

const QUEUE_STORAGE_KEY_PREFIX = 'gg_fieldkit_offline_queue_v2';
const LEGACY_QUEUE_STORAGE_KEY = 'gg_fieldkit_offline_queue_v1';
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

function getScopedQueueKey(): string {
  return `${QUEUE_STORAGE_KEY_PREFIX}:${getActiveOrganizationId()}`;
}

interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
}

export function detectNetworkQuality(): NetworkQualitySnapshot {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!online) {
    return {
      tier: 'offline',
      online: false,
      effectiveType: null,
      downlinkMbps: 0,
      rttMs: null,
      recommendedCallMode: 'offline',
      summary: 'Connection lost — offline queue active. Use 112, VHF radio, or device SMS app.',
    };
  }

  const conn =
    typeof navigator !== 'undefined' ? (navigator as NavigatorWithConnection).connection : undefined;
  const effectiveType = conn?.effectiveType || null;
  const downlinkMbps = typeof conn?.downlink === 'number' ? conn.downlink : null;
  const rttMs = typeof conn?.rtt === 'number' ? conn.rtt : null;

  const isDegraded =
    Boolean(conn?.saveData) ||
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    effectiveType === '3g' ||
    (downlinkMbps !== null && downlinkMbps < 1.5) ||
    (rttMs !== null && rttMs > 450);

  if (isDegraded) {
    return {
      tier: 'degraded',
      online: true,
      effectiveType,
      downlinkMbps,
      rttMs,
      recommendedCallMode: 'audio',
      summary: 'Reduced bandwidth — switching visual triage to Audio-Only mode.',
    };
  }

  return {
    tier: 'good',
    online: true,
    effectiveType,
    downlinkMbps,
    rttMs,
    recommendedCallMode: 'video',
    summary: 'Good connectivity — Video + Audio Live Visual Triage ready.',
  };
}

export function createClientRequestId(prefix = 'fk'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadFieldKitQueue(): FieldKitQueueItem[] {
  try {
    const raw = localStorage.getItem(getScopedQueueKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid = (parsed as FieldKitQueueItem[]).filter((item) => {
      const ts = new Date(item.createdAt).getTime();
      return Number.isFinite(ts) && now - ts <= QUEUE_TTL_MS;
    });
    if (valid.length !== parsed.length) {
      saveFieldKitQueue(valid);
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveFieldKitQueue(items: FieldKitQueueItem[]): void {
  try {
    localStorage.setItem(getScopedQueueKey(), JSON.stringify(items.slice(0, 60)));
  } catch {
    // Ignore storage quota errors
  }
}

export function upsertFieldKitQueueItem(item: FieldKitQueueItem): FieldKitQueueItem[] {
  const scopedItem: FieldKitQueueItem = {
    ...item,
    organizationId: item.organizationId || getActiveOrganizationId(),
  };
  const current = loadFieldKitQueue();
  const exists = current.some((x) => x.clientRequestId === scopedItem.clientRequestId);
  const next = exists
    ? current.map((x) => (x.clientRequestId === scopedItem.clientRequestId ? scopedItem : x))
    : [scopedItem, ...current];
  saveFieldKitQueue(next);
  return next;
}

export function clearSentQueueItems(): FieldKitQueueItem[] {
  const next = loadFieldKitQueue().filter((x) => x.status !== 'sent');
  saveFieldKitQueue(next);
  return next;
}

/**
 * Purges all Field Kit offline queue entries across all tenants on logout.
 */
export function clearFieldKitLocalStorage(): void {
  try {
    localStorage.removeItem(LEGACY_QUEUE_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(QUEUE_STORAGE_KEY_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Builds an RFC-compliant `sms:` URI to open the device's native SMS application.
 * Browsers cannot silently send SMS; user confirmation in the SMS app is always required.
 */
export function buildEmergencySmsUri(params: {
  incidentCode: string;
  cellId: string;
  regionName?: string;
  statusLabel: string;
  responderName: string;
  lat?: number | null;
  lon?: number | null;
  note?: string;
}): string {
  const coords =
    typeof params.lat === 'number' && typeof params.lon === 'number'
      ? `${params.lat.toFixed(5)}, ${params.lon.toFixed(5)}`
      : 'GPS unavailable';

  const body = [
    `GuardianGrid Field Update [${params.incidentCode}]`,
    `Status: ${params.statusLabel}`,
    `Cell: ${params.cellId}${params.regionName ? ` (${params.regionName})` : ''}`,
    `Responder: ${params.responderName}`,
    `GPS: ${coords}`,
    params.note ? `Note: ${params.note}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `sms:?body=${encodeURIComponent(body)}`;
}
