import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  AllocationFactor,
  AuditEvent,
  EmergencyCategory,
  EmergencyIncident,
  EmergencySeverity,
  EmergencyStorageMeta,
  IncidentState,
  PublicSOSPayload,
  RankedResponder,
  RescueCell,
  ResponderProfile,
} from '../src/types/emergency';
import { CHENNAI_RESCUE_CELLS, INITIAL_SIMULATED_RESPONDERS } from './emergencyData';

interface PersistedEmergencyState {
  version: 1;
  sequence: number;
  incidents: EmergencyIncident[];
  responders: ResponderProfile[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STATE_FILE = path.join(DATA_DIR, 'emergency-state.json');

export const STORAGE_META: EmergencyStorageMeta = {
  mechanism: 'Server-authoritative Express JSON store (server/data/emergency-state.json)',
  persistenceScope: 'Shared across all connected browser tabs and sessions on this server instance',
  multiSessionShared: true,
  restartLimitation:
    'Persists across local Express restarts; in ephemeral cloud containers, migrate to a hosted database (Firestore/Cloud SQL) before production.',
};

/**
 * Validated incident lifecycle transitions.
 * CRITICAL SAFETY INVARIANT: UNVERIFIED can ONLY transition to VERIFIED or REJECTED.
 * Dispatching directly from UNVERIFIED is blocked at the state-machine layer.
 */
export const ALLOWED_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  UNVERIFIED: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['DISPATCHED', 'RESOLVED', 'REJECTED'],
  DISPATCHED: ['EN_ROUTE', 'ON_SCENE', 'MEDICAL_HANDOFF', 'RESOLVED'],
  EN_ROUTE: ['ON_SCENE', 'MEDICAL_HANDOFF', 'RESOLVED'],
  ON_SCENE: ['MEDICAL_HANDOFF', 'RESOLVED'],
  MEDICAL_HANDOFF: ['RESOLVED'],
  RESOLVED: [],
  REJECTED: [],
};

let state: PersistedEmergencyState = loadInitialState();

function loadInitialState(): PersistedEmergencyState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as PersistedEmergencyState;
      if (parsed && Array.isArray(parsed.incidents) && Array.isArray(parsed.responders)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Emergency store load fallback (starting fresh):', (err as Error)?.message);
  }
  return {
    version: 1,
    sequence: 1000,
    incidents: [],
    responders: INITIAL_SIMULATED_RESPONDERS.map((r) => ({ ...r })),
  };
}

function persistState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.error('Emergency store persist failed:', (err as Error)?.message);
  }
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function resolveRescueCell(
  cellId?: string,
  lat?: number | null,
  lon?: number | null
): RescueCell {
  if (cellId) {
    const exact = CHENNAI_RESCUE_CELLS.find((c) => c.id.toUpperCase() === cellId.toUpperCase());
    if (exact) return exact;
  }
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    let best = CHENNAI_RESCUE_CELLS[0];
    let bestDist = Infinity;
    for (const cell of CHENNAI_RESCUE_CELLS) {
      const d = haversineMeters(lat, lon, cell.lat, cell.lon);
      if (d < bestDist) {
        bestDist = d;
        best = cell;
      }
    }
    return best;
  }
  return CHENNAI_RESCUE_CELLS[0];
}

function maskPhone(raw?: string): string | undefined {
  const digits = (raw || '').replace(/[^\d+]/g, '');
  if (!digits) return undefined;
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

function maskReporterName(raw?: string): string | undefined {
  const trimmed = (raw || '').trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(/\s+/);
  return parts
    .map((p) => (p.length <= 2 ? `${p[0]}*` : `${p.slice(0, 2)}${'*'.repeat(Math.min(4, p.length - 2))}`))
    .join(' ');
}

function defaultSeverityForCategory(category: EmergencyCategory): EmergencySeverity {
  if (category === 'drowning' || category === 'swept_away') return 'critical';
  if (category === 'medical') return 'high';
  return 'high';
}

function createAuditEvent(params: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...params,
  };
}

export function evaluateEscalations(): void {
  const now = Date.now();
  let changed = false;

  for (const incident of state.incidents) {
    if (
      incident.state === 'DISPATCHED' &&
      !incident.acknowledgedAt &&
      incident.escalation &&
      incident.escalation.active &&
      !incident.escalation.escalated
    ) {
      const deadlineMs = new Date(incident.escalation.deadlineIso).getTime();
      if (Number.isFinite(deadlineMs) && now >= deadlineMs) {
        incident.escalation.escalated = true;
        incident.escalation.escalatedAt = new Date(now).toISOString();
        incident.updatedAt = incident.escalation.escalatedAt;
        incident.auditTrail.push(
          createAuditEvent({
            actorId: 'system-escalation',
            actorName: 'Escalation Monitor',
            actorRole: 'system',
            action: 'ESCALATION_TRIGGERED',
            fromState: incident.state,
            toState: incident.state,
            summary: incident.escalation.backupResponderName
              ? `No acknowledgement within ${incident.escalation.timeoutSeconds}s. Backup responder ${incident.escalation.backupResponderName} flagged for dispatcher escalation.`
              : `No acknowledgement within ${incident.escalation.timeoutSeconds}s. Backup escalation flagged for dispatcher review.`,
          })
        );
        changed = true;
      }
    }
  }

  if (changed) {
    persistState();
  }
}

export function listRescueCells(): RescueCell[] {
  return CHENNAI_RESCUE_CELLS;
}

export function listResponders(): ResponderProfile[] {
  return state.responders;
}

export function listIncidents(scope: 'all' | 'real' | 'simulated' = 'all'): EmergencyIncident[] {
  evaluateEscalations();
  const filtered = state.incidents.filter((inc) => {
    if (scope === 'real') return !inc.isSimulated;
    if (scope === 'simulated') return inc.isSimulated;
    return true;
  });
  return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getIncidentById(id: string): EmergencyIncident | undefined {
  evaluateEscalations();
  return state.incidents.find((inc) => inc.id === id);
}

export function createPublicSOS(
  payload: PublicSOSPayload,
  options?: { isSimulated?: boolean; actorName?: string }
): { incident: EmergencyIncident; cell: RescueCell; deduplicated: boolean } {
  const isSimulated = Boolean(options?.isSimulated);

  // Idempotent retry handling for low-network offline queue
  if (payload.clientRequestId) {
    const existing = state.incidents.find((inc) => inc.clientRequestId === payload.clientRequestId);
    if (existing) {
      const matchedCell = resolveRescueCell(existing.cellId, existing.lat, existing.lon);
      return { incident: existing, cell: matchedCell, deduplicated: true };
    }
  }

  const cell = resolveRescueCell(payload.cellId, payload.lat, payload.lon);
  const nowIso = new Date().toISOString();
  state.sequence += 1;
  const codePrefix = isSimulated ? 'SIM-SOS' : 'GG-SOS';
  const code = `${codePrefix}-${state.sequence}`;

  const safePhoto =
    typeof payload.photoDataUrl === 'string' &&
    payload.photoDataUrl.startsWith('data:image/') &&
    payload.photoDataUrl.length <= 450_000
      ? payload.photoDataUrl
      : undefined;

  const incident: EmergencyIncident = {
    id: `inc-${randomUUID().slice(0, 8)}`,
    code,
    clientRequestId: payload.clientRequestId || undefined,
    category: payload.category,
    severity: defaultSeverityForCategory(payload.category),
    state: 'UNVERIFIED', // Mandatory safety invariant
    isSimulated,
    language: payload.language === 'ta' ? 'ta' : 'en',
    description: payload.description.trim().slice(0, 1000),
    reporterNameMasked: maskReporterName(payload.reporterName),
    reporterPhoneMasked: maskPhone(payload.reporterPhone),
    lostChildDetails: payload.category === 'missing_person' ? payload.lostChildDetails : undefined,
    cellId: cell.id,
    cellLabel: cell.label,
    siteId: cell.siteId,
    siteName: cell.siteName,
    lat: typeof payload.lat === 'number' && Number.isFinite(payload.lat) ? payload.lat : cell.lat,
    lon: typeof payload.lon === 'number' && Number.isFinite(payload.lon) ? payload.lon : cell.lon,
    gpsAccuracyMeters:
      typeof payload.gpsAccuracyMeters === 'number' && Number.isFinite(payload.gpsAccuracyMeters)
        ? Math.round(payload.gpsAccuracyMeters)
        : null,
    locationSource: payload.locationSource || (payload.cellId ? 'cell_qr' : 'manual'),
    hasPhotoAttachment: Boolean(safePhoto),
    photoDataUrl: safePhoto,
    hasVoiceNote: Boolean(payload.hasVoiceNote || payload.voiceTranscript),
    voiceTranscript: payload.voiceTranscript?.trim().slice(0, 600) || undefined,
    assignedResponderIds: [],
    assignedResponderNames: [],
    nexconnGroupId: null,
    nexconnGroupName: null,
    nexconnGroupLive: false,
    nexconnGroupError: null,
    escalation: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    auditTrail: [
      createAuditEvent({
        actorId: isSimulated ? 'sim-digital-twin' : 'public-sos',
        actorName: options?.actorName || (isSimulated ? 'Rescue Digital Twin (Simulated)' : 'Public SOS Reporter'),
        actorRole: isSimulated ? 'system' : 'public',
        action: 'SOS_REPORTED',
        toState: 'UNVERIFIED',
        summary: `${isSimulated ? '[SIMULATED] ' : ''}SOS received (${payload.category.replace('_', ' ')}) at ${cell.id} (${cell.siteName}). Awaiting mandatory human dispatcher verification.`,
      }),
    ],
  };

  state.incidents.unshift(incident);
  persistState();
  return { incident, cell, deduplicated: false };
}

export function verifyIncident(params: {
  incidentId: string;
  decision: 'verify' | 'reject';
  dispatcherId: string;
  dispatcherName: string;
  notes?: string;
}): EmergencyIncident {
  const incident = getIncidentById(params.incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }

  const targetState: IncidentState = params.decision === 'verify' ? 'VERIFIED' : 'REJECTED';
  if (!ALLOWED_TRANSITIONS[incident.state].includes(targetState)) {
    throw new Error(`Invalid state transition from ${incident.state} to ${targetState}.`);
  }

  const prev = incident.state;
  const nowIso = new Date().toISOString();
  incident.state = targetState;
  incident.updatedAt = nowIso;
  if (targetState === 'VERIFIED') {
    incident.verifiedAt = nowIso;
    incident.verifiedBy = params.dispatcherName;
  } else {
    incident.resolvedAt = nowIso;
    incident.closureSummary = params.notes?.trim() || 'Marked as false alarm / rejected by dispatcher.';
  }

  incident.auditTrail.push(
    createAuditEvent({
      actorId: params.dispatcherId,
      actorName: params.dispatcherName,
      actorRole: 'dispatcher',
      action: targetState === 'VERIFIED' ? 'DISPATCHER_VERIFIED' : 'DISPATCHER_REJECTED',
      fromState: prev,
      toState: targetState,
      summary:
        targetState === 'VERIFIED'
          ? `Human dispatcher ${params.dispatcherName} verified emergency.${params.notes ? ` Note: ${params.notes.trim()}` : ''}`
          : `Human dispatcher ${params.dispatcherName} rejected report.${params.notes ? ` Reason: ${params.notes.trim()}` : ''}`,
    })
  );

  persistState();
  return incident;
}

export function attachNexconnGroupToIncident(params: {
  incidentId: string;
  groupId: string | null;
  groupName: string;
  live: boolean;
  errorMessage?: string | null;
  actorId: string;
  actorName: string;
}): EmergencyIncident {
  const incident = getIncidentById(params.incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }

  incident.nexconnGroupId = params.groupId;
  incident.nexconnGroupName = params.groupName;
  incident.nexconnGroupLive = params.live;
  incident.nexconnGroupError = params.errorMessage || null;
  incident.updatedAt = new Date().toISOString();

  incident.auditTrail.push(
    createAuditEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: 'system',
      action: params.live ? 'NEXCONN_GROUP_CREATED' : 'NEXCONN_GROUP_FAILED',
      fromState: incident.state,
      toState: incident.state,
      summary: params.live
        ? `Nexconn incident group "${params.groupName}" (${params.groupId}) created via official Nexconn Server SDK.`
        : `Nexconn incident group creation did not complete: ${params.errorMessage || 'Unknown error'}. Use VHF/phone fallback.`,
    })
  );

  persistState();
  return incident;
}

export function rankRespondersForIncident(incidentId: string): RankedResponder[] {
  const incident = getIncidentById(incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }

  const targetLat = incident.lat ?? resolveRescueCell(incident.cellId).lat;
  const targetLon = incident.lon ?? resolveRescueCell(incident.cellId).lon;

  const requiredKeywords: Record<EmergencyCategory, string[]> = {
    drowning: ['Surf Rescue', 'CPR/AED', 'Rip Current'],
    swept_away: ['Surf Rescue', 'Jet-Ski', 'Rip Current'],
    missing_person: ['Child Search', 'Missing Person', 'Tamil'],
    medical: ['CPR/AED', 'First Aid', 'Medical Handoff'],
  };
  const desired = requiredKeywords[incident.category];

  const ranked = state.responders.map((responder): RankedResponder => {
    const distanceMeters = haversineMeters(targetLat, targetLon, responder.lat, responder.lon);
    const estimatedEtaMinutes = Math.max(1, Math.round(distanceMeters / 160)); // ~9.6 km/h beach ATV/run speed

    // 1. Distance score (max 40)
    const distancePoints = Math.max(5, Math.round(40 * Math.max(0, 1 - distanceMeters / 8000)));

    // 2. Availability score (max 30)
    const availabilityPoints =
      responder.availability === 'available'
        ? 30
        : responder.availability === 'dispatched'
          ? 10
          : responder.availability === 'on_scene'
            ? 5
            : 0;

    // 3. Qualification match score (max 20)
    const matchedQuals = responder.qualifications.filter((q) =>
      desired.some((k) => q.toLowerCase().includes(k.toLowerCase()))
    );
    const qualPoints = Math.min(20, matchedQuals.length * 10);

    // 4. Language / sector match (max 10)
    const speaksTamil = responder.qualifications.some((q) => q.toLowerCase().includes('tamil'));
    const sameCell = responder.homeCellId === incident.cellId;
    const contextPoints = (sameCell ? 5 : 0) + (incident.language === 'ta' && speaksTamil ? 5 : 3);

    const totalScore = Math.min(100, distancePoints + availabilityPoints + qualPoints + contextPoints);

    const factors: AllocationFactor[] = [
      {
        label: 'Proximity to Rescue Cell',
        points: distancePoints,
        maxPoints: 40,
        detail: `${(distanceMeters / 1000).toFixed(2)} km (~${estimatedEtaMinutes} min ETA)`,
      },
      {
        label: 'Shift Availability',
        points: availabilityPoints,
        maxPoints: 30,
        detail: responder.availability.replace('_', ' '),
      },
      {
        label: 'Qualification Match',
        points: qualPoints,
        maxPoints: 20,
        detail:
          matchedQuals.length > 0
            ? matchedQuals.join(', ')
            : 'General coastal response',
      },
      {
        label: 'Sector & Language Fit',
        points: contextPoints,
        maxPoints: 10,
        detail: `${sameCell ? 'Assigned cell' : responder.homeCellId}${speaksTamil ? ' · Tamil/English' : ' · English'}`,
      },
    ];

    return {
      responder,
      totalScore,
      distanceMeters,
      estimatedEtaMinutes,
      factors,
    };
  });

  ranked.sort((a, b) => b.totalScore - a.totalScore);
  if (ranked.length >= 2) {
    ranked[1].recommendedAsBackup = true;
  }
  return ranked;
}

export function assignRespondersToIncident(params: {
  incidentId: string;
  responderIds: string[];
  backupResponderId?: string | null;
  escalationTimeoutSeconds?: number;
  dispatcherId: string;
  dispatcherName: string;
}): { incident: EmergencyIncident; assignedProfiles: ResponderProfile[] } {
  const incident = getIncidentById(params.incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }

  // Enforce human verification gate before dispatch
  if (incident.state === 'UNVERIFIED') {
    throw new Error('Human dispatcher verification is required before dispatching responders.');
  }
  if (incident.state === 'RESOLVED' || incident.state === 'REJECTED') {
    throw new Error(`Cannot assign responders to a ${incident.state} incident.`);
  }

  const chosen = state.responders.filter((r) => params.responderIds.includes(r.id));
  if (chosen.length === 0) {
    throw new Error('Select at least one valid responder.');
  }

  const prev = incident.state;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const timeoutSec = Math.max(15, Math.min(600, params.escalationTimeoutSeconds || 90));

  for (const r of chosen) {
    if (!incident.assignedResponderIds.includes(r.id)) {
      incident.assignedResponderIds.push(r.id);
      incident.assignedResponderNames.push(r.name);
    }
    r.availability = 'dispatched';
    r.activeIncidentId = incident.id;
  }

  const backup = params.backupResponderId
    ? state.responders.find((r) => r.id === params.backupResponderId)
    : rankRespondersForIncident(incident.id).find((item) => !incident.assignedResponderIds.includes(item.responder.id))?.responder;

  if (incident.state === 'VERIFIED') {
    incident.state = 'DISPATCHED';
    incident.dispatchedAt = nowIso;
  }
  incident.updatedAt = nowIso;

  incident.escalation = {
    active: true,
    timeoutSeconds: timeoutSec,
    deadlineIso: new Date(now + timeoutSec * 1000).toISOString(),
    backupResponderId: backup?.id || null,
    backupResponderName: backup?.name || null,
    escalated: false,
  };

  incident.auditTrail.push(
    createAuditEvent({
      actorId: params.dispatcherId,
      actorName: params.dispatcherName,
      actorRole: 'dispatcher',
      action: 'RESPONDER_DISPATCHED',
      fromState: prev,
      toState: incident.state,
      summary: `Dispatcher ${params.dispatcherName} approved & dispatched ${chosen.map((c) => c.name).join(', ')}. Backup escalation timer set (${timeoutSec}s${backup ? `, backup: ${backup.name}` : ''}).`,
    })
  );

  persistState();
  return { incident, assignedProfiles: chosen };
}

export function updateIncidentState(params: {
  incidentId: string;
  nextState: IncidentState;
  actorId: string;
  actorName: string;
  actorRole: 'dispatcher' | 'responder';
  note?: string;
  acknowledgeOnly?: boolean;
}): EmergencyIncident {
  const incident = getIncidentById(params.incidentId);
  if (!incident) {
    throw new Error('Incident not found.');
  }

  const nowIso = new Date().toISOString();

  if (params.acknowledgeOnly && incident.state === 'DISPATCHED') {
    incident.acknowledgedAt = incident.acknowledgedAt || nowIso;
    if (incident.escalation) {
      incident.escalation.active = false;
    }
    incident.updatedAt = nowIso;
    incident.auditTrail.push(
      createAuditEvent({
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        action: 'RESPONDER_ACKNOWLEDGED',
        fromState: incident.state,
        toState: incident.state,
        summary: `${params.actorName} acknowledged dispatch.${params.note ? ` ${params.note.trim()}` : ''}`,
      })
    );
    persistState();
    return incident;
  }

  if (!ALLOWED_TRANSITIONS[incident.state].includes(params.nextState)) {
    throw new Error(`Invalid transition from ${incident.state} to ${params.nextState}.`);
  }

  const prev = incident.state;
  incident.state = params.nextState;
  incident.updatedAt = nowIso;

  if (params.nextState === 'EN_ROUTE') {
    incident.acknowledgedAt = incident.acknowledgedAt || nowIso;
    incident.enRouteAt = nowIso;
    if (incident.escalation) incident.escalation.active = false;
  } else if (params.nextState === 'ON_SCENE') {
    incident.acknowledgedAt = incident.acknowledgedAt || nowIso;
    incident.onSceneAt = nowIso;
    if (incident.escalation) incident.escalation.active = false;
    for (const r of state.responders) {
      if (incident.assignedResponderIds.includes(r.id)) {
        r.availability = 'on_scene';
      }
    }
  } else if (params.nextState === 'RESOLVED') {
    incident.resolvedAt = nowIso;
    incident.closureSummary = params.note?.trim() || 'Incident resolved and closed.';
    if (incident.escalation) incident.escalation.active = false;
    for (const r of state.responders) {
      if (r.activeIncidentId === incident.id) {
        r.availability = 'available';
        r.activeIncidentId = null;
      }
    }
  }

  incident.auditTrail.push(
    createAuditEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: `STATE_${params.nextState}`,
      fromState: prev,
      toState: params.nextState,
      summary: `${params.actorName} updated status to ${params.nextState.replace('_', ' ')}.${params.note ? ` Note: ${params.note.trim()}` : ''}`,
    })
  );

  persistState();
  return incident;
}

export function clearSimulatedIncidents(): { removedCount: number } {
  const before = state.incidents.length;
  const removedIds = new Set(state.incidents.filter((i) => i.isSimulated).map((i) => i.id));
  state.incidents = state.incidents.filter((i) => !i.isSimulated);

  for (const r of state.responders) {
    if (r.activeIncidentId && removedIds.has(r.activeIncidentId)) {
      r.availability = 'available';
      r.activeIncidentId = null;
    }
  }

  persistState();
  return { removedCount: before - state.incidents.length };
}
