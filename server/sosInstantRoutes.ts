import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import express from 'express';
import { Configuration } from '@nexconn/server-sdk/configuration.ts';
import {
  GroupChannelManagementApi,
  MessageManagementApi,
  UserManagementApi,
} from '@nexconn/server-sdk/api.ts';
import { ApiException } from '@nexconn/server-sdk/base.ts';
import { getEmergencyRepository } from '../src/db/repositories/index.ts';
import {
  optionalAuth,
  requireRole,
  type AuthRequest,
} from '../src/middleware/auth.ts';
import { DEFAULT_ORGANIZATION_ID } from '../src/db/users.ts';
import type { EmergencyCategory } from '../src/types/emergency.ts';
import type {
  InstantSosResponse,
  OfficialAlertLog,
  PublicNexconnTokenResponse,
} from '../src/types/officialAlerts.ts';
import {
  acknowledgeOfficialAlert,
  deliverQueuedAlert,
  getTwilioChannelConfig,
  handleTwilioStatusWebhook,
  listOfficialAlertLogs,
  queueOfficialAlertOutbox,
  retryOfficialAlert,
  verifyTwilioSignature,
  type OfficialRecipient,
} from './officialAlertService.ts';
import {
  broadcastSosEvent,
  registerSosSseClient,
  removeSosSseClient,
} from './sosEventBus.ts';
import { getSosChannelSigningSecret } from './envAuthPolicy.ts';
import { incrementWorkspaceCounter } from './workspaceRoutes.ts';

export const sosInstantRouter = express.Router();

const VALID_CATEGORIES: EmergencyCategory[] = [
  'drowning',
  'swept_away',
  'missing_person',
  'medical',
];

const requireOperational = [
  optionalAuth,
  requireRole(['ORG_ADMIN', 'DISPATCHER', 'RESPONDER']),
];

function cleanEnv(value?: string): string {
  const trimmed = (value || '').trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeDomain(domain?: string): string {
  const cleaned = cleanEnv(domain).replace(/\/+$/, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  return `https://${cleaned}`;
}

function buildNexconnConfig(): {
  configuration: Configuration;
  appKey: string;
  areaCode: string;
} | null {
  const appKey = cleanEnv(process.env.NEXCONN_APP_KEY);
  const appSecret = cleanEnv(process.env.NEXCONN_APP_SECRET);
  const primary = normalizeDomain(process.env.NEXCONN_PRIMARY_API_DOMAIN);
  const secondary = normalizeDomain(process.env.NEXCONN_SECONDARY_API_DOMAIN);
  const areaCode = cleanEnv(process.env.NEXCONN_AREA_CODE || 'SG').toUpperCase();
  if (!appKey || !appSecret || !primary || !secondary) return null;

  const configuration = new Configuration();
  configuration.setNexconnCredentials(appKey, appSecret);
  configuration.setPrimaryBackupDomains(primary, secondary);
  configuration.setAutoFailoverEnabled(true);
  configuration.setNonceGenerator(() => String(randomInt(100000000, 999999999)));
  return { configuration, appKey, areaCode };
}

function getOrgId(req: AuthRequest): string {
  return req.authContext?.organizationId || DEFAULT_ORGANIZATION_ID;
}

function resolveAppBaseUrl(req: express.Request): string {
  const envUrl = cleanEnv(process.env.APP_URL).replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_APP_URL') return envUrl;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    (typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : req.protocol) || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader).split(',')[0].trim();
  return `${proto}://${host}`;
}

function resolveBackendPublicUrl(req: express.Request): string {
  const envUrl = cleanEnv(process.env.BACKEND_PUBLIC_URL).replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_BACKEND_PUBLIC_URL') return envUrl;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    (typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : req.protocol) || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader).split(',')[0].trim();
  return `${proto}://${host}`;
}

// Burst-tolerant sliding-window rate limiter for public SOS endpoints
const publicEndpointHits = new Map<string, number[]>();
function checkPublicRateLimit(
  req: express.Request,
  bucket: string,
  maxRequests: number,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip) || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const timestamps = (publicEndpointHits.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    publicEndpointHits.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  publicEndpointHits.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

export interface BystanderChannelTokenPayload {
  incidentId: string;
  groupId: string;
  reporterNexconnUserId: string;
  organizationId: string;
  exp: number;
}

export function signBystanderChannelToken(payload: BystanderChannelTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSosChannelSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyBystanderChannelToken(
  token: string,
  expectedIncidentId: string
): BystanderChannelTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = createHmac('sha256', getSosChannelSigningSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as BystanderChannelTokenPayload;
    if (
      !decoded ||
      decoded.incidentId !== expectedIncidentId ||
      typeof decoded.groupId !== 'string' ||
      typeof decoded.reporterNexconnUserId !== 'string' ||
      typeof decoded.organizationId !== 'string' ||
      typeof decoded.exp !== 'number' ||
      decoded.exp < Date.now()
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * POST /api/sos/public-token
 * Zero-login temporary anonymous PUBLIC_SOS Nexconn token for bystander live guidance & chat.
 * Scoped strictly to public SOS reporter identity (never grants operational channel listing).
 */
sosInstantRouter.post('/public-token', async (req, res) => {
  const rate = checkPublicRateLimit(req, 'public-token', 25, 60_000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({
      error: 'Too many token requests. Call 112 immediately for life-threatening emergencies.',
      retryAfterSec: rate.retryAfterSec,
    });
  }

  if (req.body?.displayName !== undefined && typeof req.body.displayName !== 'string') {
    return res.status(400).json({ error: 'displayName must be a string when provided.' });
  }
  const rawDisplayName =
    typeof req.body?.displayName === 'string'
      ? req.body.displayName.replace(/[\u0000-\u001F\u007F<>]/g, '').trim()
      : '';
  if (rawDisplayName.length > 80) {
    return res.status(400).json({ error: 'displayName must be 80 characters or fewer.' });
  }

  const shortId = randomUUID().replace(/-/g, '').slice(0, 10);
  const userId = `pub-sos-${shortId}`;
  const displayName = rawDisplayName
    ? rawDisplayName.slice(0, 40)
    : `Bystander SOS #${shortId.slice(0, 4).toUpperCase()}`;

  const nexconn = buildNexconnConfig();
  if (!nexconn) {
    const payload: PublicNexconnTokenResponse = {
      userId,
      displayName,
      role: 'PUBLIC_SOS',
      configured: false,
      token: null,
      appKey: null,
      areaCode: 'SG',
      expiresInSeconds: 1800,
      notice:
        'Nexconn server credentials are not configured; public SOS remains active via REST fallback.',
    };
    return res.json(payload);
  }

  try {
    const userApi = new UserManagementApi(nexconn.configuration);
    const tokenRes = await userApi.issueAccessToken({
      userId,
      name: displayName,
    });
    const token =
      (tokenRes as any)?.data?.result?.accessToken ||
      (tokenRes as any)?.data?.token ||
      (tokenRes as any)?.token ||
      null;

    const payload: PublicNexconnTokenResponse = {
      userId,
      displayName,
      role: 'PUBLIC_SOS',
      configured: true,
      token,
      appKey: nexconn.appKey,
      areaCode: nexconn.areaCode,
      expiresInSeconds: 1800,
    };
    return res.json(payload);
  } catch (err: any) {
    const msg =
      err instanceof ApiException
        ? `Nexconn token error (${err.errorCode}): ${err.errorMessage || err.httpStatus}`
        : err?.message || 'Unable to issue temporary public SOS token';
    console.warn('POST /api/sos/public-token fallback:', msg);
    const payload: PublicNexconnTokenResponse = {
      userId,
      displayName,
      role: 'PUBLIC_SOS',
      configured: false,
      token: null,
      appKey: null,
      areaCode: nexconn.areaCode,
      expiresInSeconds: 1800,
      notice: msg,
    };
    return res.json(payload);
  }
});

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Resolves configured, authorized on-duty official and eligible nearest lifeguard contacts.
 * - Includes eligible nearest on-duty responders.
 * - Includes configured Coastal Dispatch Control & Duty Supervisor when configured.
 * - Includes Ambulance Control Room ONLY when AMBULANCE_CONTROL_PHONE is explicitly configured.
 * - Never sends real provider messages when isSandboxTest or ENABLE_ALERT_SIMULATOR=true.
 */
function resolveAuthorizedOfficialRecipients(params: {
  topResponders: Array<{
    responder: { id: string; name: string; isSimulated?: boolean; phone?: string };
  }>;
  isSandboxTest: boolean;
}): OfficialRecipient[] {
  const { topResponders, isSandboxTest } = params;
  const isProd = process.env.NODE_ENV === 'production';
  const configuredDispatchPhone = cleanEnv(process.env.OFFICIAL_DISPATCH_PHONE);
  const configuredSupervisorPhone = cleanEnv(process.env.OFFICIAL_SUPERVISOR_PHONE);
  const configuredAmbulancePhone = cleanEnv(process.env.AMBULANCE_CONTROL_PHONE);

  const recipients: OfficialRecipient[] = topResponders.map((entry, idx) => {
    const responderPhone =
      typeof entry.responder.phone === 'string' && isValidE164(entry.responder.phone)
        ? entry.responder.phone.trim()
        : null;
    const useSandbox = isSandboxTest || Boolean(entry.responder.isSimulated) || !responderPhone;
    return {
      id: entry.responder.id,
      name: entry.responder.name,
      role: 'RESPONDER' as const,
      phoneE164: useSandbox ? `+1500555000${idx + 1}` : responderPhone!,
      isSandbox: useSandbox,
    };
  });

  // Always notify authorized on-duty Coastal Dispatch Control
  const dispatchHasRealPhone = !isSandboxTest && isValidE164(configuredDispatchPhone);
  recipients.push({
    id: 'gg-dispatch-chennai',
    name: 'Coastal Dispatch Control',
    role: 'DISPATCHER',
    phoneE164: dispatchHasRealPhone ? configuredDispatchPhone : '+15005550009',
    isSandbox: !dispatchHasRealPhone || !isProd,
  });

  // Include Duty Supervisor when configured
  if (isValidE164(configuredSupervisorPhone)) {
    recipients.push({
      id: 'gg-duty-supervisor',
      name: 'Coastal Duty Supervisor',
      role: 'SUPERVISOR',
      phoneE164: isSandboxTest ? '+15005550008' : configuredSupervisorPhone,
      isSandbox: isSandboxTest || !isProd,
    });
  }

  // Include Ambulance Control Room ONLY when real authorized contact integration is configured
  if (!isSandboxTest && isValidE164(configuredAmbulancePhone)) {
    recipients.push({
      id: 'gg-ambulance-control',
      name: 'Authorized Ambulance Control Room',
      role: 'AMBULANCE_CONTROL',
      phoneE164: configuredAmbulancePhone,
      isSandbox: !isProd,
    });
  }

  return recipients;
}

export interface AutomaticSosDispatchInput {
  organizationId: string;
  appBaseUrl: string;
  category: EmergencyCategory;
  language: 'en' | 'ta';
  description?: string;
  reporterName?: string;
  reporterPhone?: string;
  reporterNexconnUserId?: string;
  clientRequestId?: string;
  cellId?: string;
  lat?: number | null;
  lon?: number | null;
  gpsAccuracyMeters?: number | null;
  locationSource?: 'gps' | 'qr_cell' | 'cell_qr' | 'manual';
  photoDataUrl?: string;
  hasVoiceNote?: boolean;
  voiceTranscript?: string;
  lostChildDetails?: {
    approximateAge?: string;
    clothingDescription?: string;
    lastSeenMinutesAgo?: number;
  };
  isSandboxTest?: boolean;
}

/**
 * Shared 7-step Fully Automatic SOS Dispatch Pipeline (used by POST /api/sos/instant and POST /api/emergency/sos):
 * 1. Immediately persist critical UNVERIFIED incident with 90s unverified-SOS escalation timer.
 * 2. Generate standardized bilingual EN/TA emergency alert (incident, GPS, beach, rescue cell, timestamp).
 * 3. Automatically enqueue & independently deliver SMS + WhatsApp alerts to authorized officials & nearest lifeguards.
 * 4. Automatically create or reuse incident-specific Nexconn War Room.
 * 5. Automatically add authorized participants and publish structured emergency Alert Card.
 * 6. Immediately broadcast critical incident to Command Center via SSE.
 * 7. Track each notification channel independently and support automatic escalation.
 */
export async function executeAutomaticSosDispatch(
  input: AutomaticSosDispatchInput
): Promise<InstantSosResponse> {
  const submittedMs = Date.now();
  const submittedAt = new Date(submittedMs).toISOString();

  const category: EmergencyCategory = VALID_CATEGORIES.includes(input.category)
    ? input.category
    : 'drowning';
  const language = input.language === 'ta' ? 'ta' : 'en';
  const isSandboxTest = Boolean(input.isSandboxTest);
  const organizationId = input.organizationId || DEFAULT_ORGANIZATION_ID;
  const reporterNexconnUserId =
    typeof input.reporterNexconnUserId === 'string' &&
    /^[a-zA-Z0-9_-]{3,48}$/.test(input.reporterNexconnUserId.trim())
      ? input.reporterNexconnUserId.trim()
      : `pub-sos-${randomUUID().replace(/-/g, '').slice(0, 8)}`;

  const defaultDescriptions: Record<EmergencyCategory, string> = {
    drowning:
      'ONE-TAP CRITICAL SOS: Drowning / நீரில் மூழ்குதல் reported via Public SOS portal. Immediate water rescue required.',
    swept_away:
      'ONE-TAP CRITICAL SOS: Swimmer swept away by current reported via Public SOS portal.',
    missing_person:
      'ONE-TAP URGENT SOS: Missing person / காணாமல் போனவர் reported via Public SOS portal.',
    medical:
      'ONE-TAP URGENT SOS: Coastal medical emergency / மருத்துவ அவசரம் reported via Public SOS portal.',
  };

  const description =
    typeof input.description === 'string' && input.description.trim().length >= 3
      ? input.description.trim()
      : defaultDescriptions[category];

  const repo = getEmergencyRepository();

  // STEP 1: Persist incident durably FIRST as UNVERIFIED with 90s escalation timer
  const { incident, cell, deduplicated, qrCellValid } = await repo.createPublicSOS(
    organizationId,
    {
      clientRequestId: input.clientRequestId,
      category,
      language,
      description,
      reporterName: input.reporterName || 'Anonymous Bystander',
      reporterPhone: input.reporterPhone,
      cellId: input.cellId,
      lat: typeof input.lat === 'number' ? input.lat : null,
      lon: typeof input.lon === 'number' ? input.lon : null,
      gpsAccuracyMeters:
        typeof input.gpsAccuracyMeters === 'number' ? input.gpsAccuracyMeters : null,
      locationSource:
        input.locationSource === 'gps' || input.locationSource === 'manual'
          ? input.locationSource
          : input.locationSource === 'qr_cell' || input.locationSource === 'cell_qr'
            ? 'cell_qr'
            : typeof input.lat === 'number'
              ? 'gps'
              : 'cell_qr',
      photoDataUrl: input.photoDataUrl,
      hasVoiceNote: Boolean(input.hasVoiceNote),
      voiceTranscript: input.voiceTranscript,
      lostChildDetails: input.lostChildDetails,
    },
    { isSimulated: isSandboxTest, actorName: 'Instant Public SOS', escalationTimeoutSeconds: 90 }
  );

  const persistedMs = Date.now();
  const persistedAt = new Date(persistedMs).toISOString();
  const persistDurationMs = Math.max(0, persistedMs - submittedMs);

  // Rank eligible nearest on-duty lifeguards/responders for this rescue cell
  const ranked = await repo.rankRespondersForIncident(organizationId, incident.id);
  const availableRanked = ranked.filter((r) => r.responder.availability === 'available');
  const eligibleNearest = (availableRanked.length > 0 ? availableRanked : ranked).slice(0, 3);

  // Idempotency guard: if this clientRequestId already created an incident, return existing state without re-fanning out
  if (deduplicated) {
    const existingAlerts = await listOfficialAlertLogs(organizationId, incident.id);
    const resolvedGroupId =
      incident.nexconnGroupId || `sos-${category}-${incident.id.slice(0, 24)}`;
    const bystanderChannelToken = signBystanderChannelToken({
      incidentId: incident.id,
      groupId: resolvedGroupId,
      reporterNexconnUserId,
      organizationId,
      exp: Date.now() + 6 * 60 * 60 * 1000,
    });
    return {
      incidentId: incident.id,
      code: incident.code,
      category: incident.category,
      severity: incident.severity,
      state: incident.state,
      deduplicated: true,
      locationQuality: incident.locationQuality,
      qrCellValid,
      cellId: cell.id,
      cellLabel: cell.label,
      siteName: cell.siteName,
      lat: incident.lat ?? cell.lat,
      lon: incident.lon ?? cell.lon,
      vhfChannel: cell.vhfChannel,
      emergencyNumber: '112',
      createdAt: incident.createdAt,
      escalationTimeoutSeconds: incident.escalation?.timeoutSeconds ?? 90,
      nexconnGroup: {
        groupId: resolvedGroupId,
        groupName: incident.nexconnGroupName || `SOS ${incident.code} · ${cell.id}`,
        live: incident.nexconnGroupLive,
        alertCardPosted: incident.nexconnGroupLive,
        error: incident.nexconnGroupError ?? null,
        memberUserIds: eligibleNearest.map((r) => r.responder.nexconnUserId || r.responder.id),
      },
      officialAlerts: existingAlerts,
      nearestResponders: eligibleNearest.map((r) => ({
        id: r.responder.id,
        name: r.responder.name,
        station: r.responder.station,
        radioCallsign: r.responder.radioCallsign,
        distanceMeters: r.distanceMeters,
        etaMinutes: r.estimatedEtaMinutes,
      })),
      bystanderChannelToken,
      latency: {
        submittedAt,
        persistedAt,
        persistDurationMs,
        outboxQueuedAt: persistedAt,
        fanoutStartedAt: persistedAt,
        fanoutCompletedAt: persistedAt,
        fanoutDurationMs: 0,
      },
    };
  }

  // STEP 2: Resolve configured authorized officials & eligible nearest lifeguards and persist durable bilingual outbox
  const recipients = resolveAuthorizedOfficialRecipients({
    topResponders: eligibleNearest,
    isSandboxTest,
  });

  const queuedAlerts = await queueOfficialAlertOutbox({
    incidentId: incident.id,
    incidentCode: incident.code,
    organizationId,
    category,
    cellLabel: cell.label,
    siteName: cell.siteName,
    lat: incident.lat ?? cell.lat,
    lon: incident.lon ?? cell.lon,
    appBaseUrl: input.appBaseUrl,
    reportedAt: incident.createdAt,
    incidentState: incident.state,
    recipients,
  });
  const outboxQueuedAt = new Date().toISOString();

  // STEP 3: Parallel Fan-Out (Nexconn War Room Create/Reuse + Alert Card + Independent SMS/WhatsApp + SSE)
  const fanoutStartedMs = Date.now();
  const fanoutStartedAt = new Date(fanoutStartedMs).toISOString();

  const cleanId = incident.id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24);
  const orgPrefix = organizationId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const tenantDispatcherId =
    organizationId === DEFAULT_ORGANIZATION_ID
      ? 'gg-dispatch-chennai'
      : `gg-dispatch-${orgPrefix}`;
  const groupId =
    incident.nexconnGroupId ||
    (category === 'drowning'
      ? `sos-${orgPrefix}-drowning-${cleanId}`
      : `sos-${orgPrefix}-${category}-${cleanId}`);
  const groupName = incident.nexconnGroupName || `SOS ${incident.code} · ${cell.id} (${category.toUpperCase()})`;
  const memberUserIds = Array.from(
    new Set([
      tenantDispatcherId,
      ...(organizationId === DEFAULT_ORGANIZATION_ID ? ['gg-analyst-ss'] : []),
      reporterNexconnUserId,
      ...eligibleNearest.map((r) => r.responder.nexconnUserId || r.responder.id),
    ])
  );

  const nexconnPromise = (async () => {
    const nexconn = buildNexconnConfig();
    if (!nexconn) {
      return {
        groupId,
        groupName,
        live: false,
        alertCardPosted: false,
        error: 'Nexconn server credentials are not configured.',
        memberUserIds,
      };
    }

    try {
      const groupApi = new GroupChannelManagementApi(nexconn.configuration);
      try {
        await groupApi.createGroupChannel({
          channelId: groupId,
          name: groupName.slice(0, 60),
          owner: tenantDispatcherId,
          userIds: memberUserIds,
          groupProfile: {
            introduction: `CRITICAL ${category.toUpperCase()} War Room for ${incident.code} at ${cell.label}.`,
          },
        });
        incrementWorkspaceCounter('nexconnGroupsTriggered', 1, organizationId);
      } catch (createErr: any) {
        // Reuse existing incident-specific War Room if already provisioned and ensure all authorized participants are added
        try {
          await groupApi.joinGroupChannel({
            channelId: groupId,
            userIds: memberUserIds,
          });
        } catch {
          throw createErr;
        }
      }

      let alertCardPosted = false;
      try {
        const msgApi = new MessageManagementApi(nexconn.configuration);
        const latVal = incident.lat ?? cell.lat;
        const lonVal = incident.lon ?? cell.lon;
        const alertCardText = [
          `🚨 [CRITICAL SOS ALERT CARD · ${incident.state}] ${incident.code}`,
          `Type: ${category.toUpperCase()} / ${category === 'drowning' ? 'நீரில் மூழ்குதல்' : 'அவசரநிலை'}`,
          `Beach / Rescue Cell: ${cell.siteName} — ${cell.label} · VHF ${cell.vhfChannel}`,
          `GPS: ${latVal.toFixed(5)}, ${lonVal.toFixed(5)} (https://maps.google.com/?q=${latVal.toFixed(5)},${lonVal.toFixed(5)})`,
          `Time (UTC): ${incident.createdAt}`,
          `Status: UNVERIFIED (Initial alerts & War Room auto-dispatched; human verification required before responder assignment)`,
          `Nearest Eligible Lifeguards Notified: ${eligibleNearest.map((r) => `${r.responder.name} (${r.distanceMeters}m)`).join(', ') || 'Coastal Dispatch Control'}`,
          `Field Kit: ${input.appBaseUrl}/#/field-kit?incidentId=${encodeURIComponent(incident.id)}`,
        ].join('\n');

        await msgApi.sendGroupChannelMessage({
          fromUserId: tenantDispatcherId,
          toChannelIds: [groupId],
          messageType: 'RC:TxtMsg',
          content: JSON.stringify({ content: alertCardText }),
          pushContent: `CRITICAL SOS ${incident.code}: ${cell.label}`,
        });
        alertCardPosted = true;
      } catch (msgErr: any) {
        console.warn('Nexconn alert card post warning:', msgErr?.message);
      }

      return {
        groupId,
        groupName,
        live: true,
        alertCardPosted,
        error: null,
        memberUserIds,
      };
    } catch (err: any) {
      const msg =
        err instanceof ApiException
          ? `Nexconn API error (${err.errorCode}): ${err.errorMessage || err.httpStatus}`
          : err?.message || 'Unable to provision Nexconn group';
      console.warn('Nexconn instant SOS group fallback:', msg);
      return {
        groupId,
        groupName,
        live: false,
        alertCardPosted: false,
        error: msg,
        memberUserIds,
      };
    }
  })();

  const alertsPromise = Promise.allSettled(
    queuedAlerts.map((item) =>
      item.deduplicated
        ? Promise.resolve(item.log)
        : deliverQueuedAlert(item.log, item.rawPhone, { forceSandbox: isSandboxTest })
    )
  );

  const [nexconnResult, alertResults] = await Promise.all([nexconnPromise, alertsPromise]);

  const finalAlerts: OfficialAlertLog[] = alertResults.map((resItem, idx) =>
    resItem.status === 'fulfilled' ? resItem.value : queuedAlerts[idx].log
  );

  // Attach Nexconn group metadata back to the persisted incident
  let updatedIncident = incident;
  try {
    updatedIncident = await repo.attachNexconnGroupToIncident({
      organizationId,
      incidentId: incident.id,
      groupId: nexconnResult.groupId,
      groupName: nexconnResult.groupName,
      live: nexconnResult.live,
      errorMessage: nexconnResult.error,
      actorId: 'system-instant-sos',
      actorName: 'Instant SOS Coordinator',
      memberUserIds: nexconnResult.memberUserIds,
    });
  } catch (attachErr: any) {
    console.warn('Attach Nexconn group warning:', attachErr?.message);
  }

  const fanoutCompletedMs = Date.now();
  const fanoutCompletedAt = new Date(fanoutCompletedMs).toISOString();
  const latency = {
    submittedAt,
    persistedAt,
    persistDurationMs,
    outboxQueuedAt,
    fanoutStartedAt,
    fanoutCompletedAt,
    fanoutDurationMs: Math.max(0, fanoutCompletedMs - fanoutStartedMs),
  };

  // Broadcast SSE event immediately to Command Center clients for this tenant
  broadcastSosEvent({
    type: 'sos:instant_created',
    organizationId,
    timestamp: fanoutCompletedAt,
    incident: updatedIncident,
    alerts: finalAlerts,
    latency,
  });

  const bystanderChannelToken = signBystanderChannelToken({
    incidentId: updatedIncident.id,
    groupId: nexconnResult.groupId,
    reporterNexconnUserId,
    organizationId,
    exp: Date.now() + 6 * 60 * 60 * 1000,
  });

  return {
    incidentId: updatedIncident.id,
    code: updatedIncident.code,
    category: updatedIncident.category,
    severity: updatedIncident.severity,
    state: updatedIncident.state,
    isSimulated: Boolean(updatedIncident.isSimulated),
    deduplicated: false,
    locationQuality: updatedIncident.locationQuality,
    qrCellValid,
    cellId: cell.id,
    cellLabel: cell.label,
    siteName: cell.siteName,
    lat: updatedIncident.lat ?? cell.lat,
    lon: updatedIncident.lon ?? cell.lon,
    vhfChannel: cell.vhfChannel,
    emergencyNumber: '112',
    createdAt: updatedIncident.createdAt,
    escalationTimeoutSeconds: 90,
    nexconnGroup: nexconnResult,
    officialAlerts: finalAlerts,
    nearestResponders: eligibleNearest.map((r) => ({
      id: r.responder.id,
      name: r.responder.name,
      station: r.responder.station,
      radioCallsign: r.responder.radioCallsign,
      distanceMeters: r.distanceMeters,
      etaMinutes: r.estimatedEtaMinutes,
    })),
    bystanderChannelToken,
    latency,
  };
}

/**
 * POST /api/sos/instant
 * Zero-friction 1-tap SOS pipeline.
 */
sosInstantRouter.post('/instant', optionalAuth, async (req: AuthRequest, res) => {
  const rate = checkPublicRateLimit(req, 'instant-sos', 15, 60_000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({
      error: 'Too many SOS requests from this network. Call 112 immediately for life-threatening emergencies.',
      emergencyNumber: '112',
      retryAfterSec: rate.retryAfterSec,
    });
  }

  const body = req.body || {};
  try {
    const responsePayload = await executeAutomaticSosDispatch({
      organizationId: getOrgId(req),
      appBaseUrl: resolveAppBaseUrl(req),
      category: VALID_CATEGORIES.includes(body.category) ? body.category : 'drowning',
      language: body.language === 'ta' ? 'ta' : 'en',
      description: typeof body.description === 'string' ? body.description : undefined,
      reporterName: typeof body.reporterName === 'string' ? body.reporterName : undefined,
      reporterPhone: typeof body.reporterPhone === 'string' ? body.reporterPhone : undefined,
      reporterNexconnUserId:
        typeof body.reporterNexconnUserId === 'string' ? body.reporterNexconnUserId : undefined,
      clientRequestId: typeof body.clientRequestId === 'string' ? body.clientRequestId : undefined,
      cellId: typeof body.cellId === 'string' ? body.cellId : undefined,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lon: typeof body.lon === 'number' ? body.lon : null,
      gpsAccuracyMeters:
        typeof body.gpsAccuracyMeters === 'number' ? body.gpsAccuracyMeters : null,
      locationSource: body.locationSource,
      photoDataUrl: typeof body.photoDataUrl === 'string' ? body.photoDataUrl : undefined,
      hasVoiceNote: Boolean(body.hasVoiceNote),
      voiceTranscript: typeof body.voiceTranscript === 'string' ? body.voiceTranscript : undefined,
      lostChildDetails: body.lostChildDetails,
      isSandboxTest: Boolean(body.isSandboxTest),
    });

    return res.status(responsePayload.deduplicated ? 200 : 201).json(responsePayload);
  } catch (error: any) {
    console.error('POST /api/sos/instant failed:', error);
    return res.status(500).json({
      error: 'Unable to persist instant SOS emergency alert.',
    });
  }
});

/**
 * POST /api/sos/incidents/:incidentId/updates
 * Public bystander rescue-update relay bound strictly to an incident via signed HMAC bystanderChannelToken.
 * Validates size & content, enforces rate limits, publishes to the incident Nexconn channel,
 * broadcasts SSE update to Command Center, and never exposes group members or private responder data.
 */
sosInstantRouter.post('/incidents/:incidentId/updates', async (req, res) => {
  const rate = checkPublicRateLimit(req, 'bystander-update', 20, 60_000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({
      error: 'Too many bystander updates sent. Wait a moment or call 112 for urgent help.',
      retryAfterSec: rate.retryAfterSec,
    });
  }

  const incidentId = String(req.params.incidentId || '').trim();
  const rawToken =
    (typeof req.headers['x-gg-sos-token'] === 'string' ? req.headers['x-gg-sos-token'] : '') ||
    (typeof req.body?.channelToken === 'string' ? req.body.channelToken : '');
  const tokenPayload = verifyBystanderChannelToken(rawToken, incidentId);
  if (!tokenPayload) {
    return res.status(401).json({
      error: 'Invalid or expired SOS update token for this incident.',
    });
  }

  const rawKind = req.body?.kind;
  const kind: 'text' | 'voice_transcript' | 'photo' =
    rawKind === 'voice_transcript' || rawKind === 'photo' ? rawKind : 'text';
  if (typeof req.body?.text !== 'string') {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  const cleanText = req.body.text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  if (!cleanText) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }
  if (cleanText.length > 1000) {
    return res.status(400).json({ error: 'Message update exceeds the 1000-character limit.' });
  }
  if (/^data:[a-z0-9+/=;]+/i.test(cleanText)) {
    return res.status(400).json({ error: 'Raw binary data URIs are not allowed in text updates.' });
  }

  try {
    const repo = getEmergencyRepository();
    const incident = await repo.getIncidentById(tokenPayload.organizationId, incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    if (incident.state === 'RESOLVED' || incident.state === 'REJECTED') {
      return res.status(409).json({
        error: 'This incident has been closed; bystander chat updates are no longer accepted.',
      });
    }
    if (incident.nexconnGroupId && incident.nexconnGroupId !== tokenPayload.groupId) {
      return res.status(403).json({ error: 'Incident channel authorization mismatch.' });
    }

    const updateId = `upd-${randomUUID().slice(0, 12)}`;
    const sentAt = new Date().toISOString();
    let deliveredToNexconn = false;

    const nexconn = buildNexconnConfig();
    if (nexconn && incident.nexconnGroupLive && incident.nexconnGroupId) {
      try {
        const msgApi = new MessageManagementApi(nexconn.configuration);
        const prefix =
          kind === 'voice_transcript'
            ? '[BYSTANDER VOICE UPDATE]'
            : kind === 'photo'
              ? '[BYSTANDER SCENE PHOTO NOTE]'
              : '[BYSTANDER LIVE UPDATE]';
        await msgApi.sendGroupChannelMessage({
          fromUserId: tokenPayload.reporterNexconnUserId,
          toChannelIds: [incident.nexconnGroupId],
          messageType: 'RC:TxtMsg',
          content: JSON.stringify({
            content: `${prefix} ${incident.code}: ${cleanText}`,
          }),
          pushContent: `${incident.code} bystander update: ${cleanText.slice(0, 80)}`,
        });
        deliveredToNexconn = true;
      } catch (err: any) {
        console.warn('Bystander update Nexconn delivery warning:', err?.message || 'Unknown error');
      }
    }

    broadcastSosEvent({
      type: 'sos:bystander_update',
      organizationId: tokenPayload.organizationId,
      timestamp: sentAt,
      bystanderUpdate: {
        updateId,
        incidentId: incident.id,
        kind,
        text: cleanText,
        sentAt,
      },
    });

    return res.status(201).json({
      ok: true,
      updateId,
      incidentId: incident.id,
      kind,
      text: cleanText,
      deliveredToNexconn,
      sentAt,
    });
  } catch (err: any) {
    console.error('POST /api/sos/incidents/:incidentId/updates failed:', err);
    return res.status(500).json({ error: 'Unable to record bystander update.' });
  }
});

/**
 * GET /api/sos/alerts
 * Operational RBAC: Returns tenant-scoped official_alert_logs and non-secret channel status.
 */
sosInstantRouter.get('/alerts', ...requireOperational, async (req: AuthRequest, res) => {
  const incidentId =
    typeof req.query.incidentId === 'string' ? req.query.incidentId.trim() || undefined : undefined;
  try {
    const logs = await listOfficialAlertLogs(getOrgId(req), incidentId);
    const cfg = getTwilioChannelConfig();
    return res.json({
      alerts: logs,
      channels: {
        smsConfigured: cfg.smsConfigured,
        whatsappConfigured: cfg.whatsappConfigured,
        simulatorEnabled: cfg.simulatorEnabled,
      },
    });
  } catch (err) {
    console.error('GET /api/sos/alerts failed:', err);
    return res.status(500).json({ error: 'Unable to load official alert logs.' });
  }
});

/**
 * POST /api/sos/alerts/:logId/acknowledge
 * Operational RBAC: Records real official acknowledgement timestamp & actor.
 */
sosInstantRouter.post(
  '/alerts/:logId/acknowledge',
  ...requireOperational,
  async (req: AuthRequest, res) => {
    const actorName =
      (typeof req.body?.actorName === 'string' && req.body.actorName.trim()) ||
      req.authContext?.displayName ||
      'Coastal Official';
    try {
      const updated = await acknowledgeOfficialAlert({
        organizationId: getOrgId(req),
        logId: req.params.logId,
        actorName,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Alert log not found for this organization.' });
      }
      return res.json({ alert: updated });
    } catch (err) {
      console.error('POST /api/sos/alerts/:logId/acknowledge failed:', err);
      return res.status(500).json({ error: 'Unable to acknowledge alert.' });
    }
  }
);

/**
 * POST /api/sos/alerts/:logId/retry
 * Operational RBAC: Retries a queued/failed outbox notification safely.
 */
sosInstantRouter.post(
  '/alerts/:logId/retry',
  ...requireOperational,
  async (req: AuthRequest, res) => {
    try {
      const updated = await retryOfficialAlert({
        organizationId: getOrgId(req),
        logId: req.params.logId,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Alert log not found for this organization.' });
      }
      return res.json({ alert: updated });
    } catch (err) {
      console.error('POST /api/sos/alerts/:logId/retry failed:', err);
      return res.status(500).json({ error: 'Unable to retry alert delivery.' });
    }
  }
);

export async function runEscalationSweep(organizationId?: string) {
  const repo = getEmergencyRepository();
  const escalatedIncidents = await repo.sweepEscalations(organizationId);
  const nowIso = new Date().toISOString();

  for (const inc of escalatedIncidents) {
    broadcastSosEvent({
      type: 'sos:escalation_triggered',
      organizationId: inc.organizationId || organizationId || DEFAULT_ORGANIZATION_ID,
      timestamp: nowIso,
      incident: inc,
    });
  }

  return {
    sweptAt: nowIso,
    escalatedCount: escalatedIncidents.length,
    incidents: escalatedIncidents,
  };
}

/**
 * POST /api/sos/escalations/sweep
 * Durable escalation sweep (callable by Vercel Cron with x-cron-secret OR authenticated operational roles).
 * Evaluates both UNVERIFIED SOS timeouts and DISPATCHED unacknowledged timeouts in durable storage
 * and broadcasts sos:escalation_triggered events to connected Command Center SSE clients.
 */
sosInstantRouter.post('/escalations/sweep', optionalAuth, async (req: AuthRequest, res) => {
  const cronSecret = cleanEnv(process.env.CRON_SECRET);
  const incomingSecret =
    (typeof req.headers['x-cron-secret'] === 'string' ? req.headers['x-cron-secret'].trim() : '') ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');
  const isCronAuthorized = Boolean(cronSecret && incomingSecret && incomingSecret === cronSecret);
  const role = req.authContext?.role;
  const isRoleAuthorized = role === 'ORG_ADMIN' || role === 'DISPATCHER' || role === 'RESPONDER';

  if (!isCronAuthorized && !isRoleAuthorized) {
    return res.status(403).json({ error: 'Operational role or valid cron secret required.' });
  }

  try {
    const targetOrgId = isCronAuthorized ? undefined : getOrgId(req);
    const result = await runEscalationSweep(targetOrgId);
    return res.json(result);
  } catch (err) {
    console.error('POST /api/sos/escalations/sweep failed:', err);
    return res.status(500).json({ error: 'Unable to run escalation sweep.' });
  }
});

/**
 * POST /api/sos/webhooks/twilio
 * Verified Twilio delivery status callback (HMAC-SHA1 X-Twilio-Signature).
 * Updates PROVIDER_ACCEPTED -> SENT / DELIVERED / FAILED honestly based on Twilio carrier receipts.
 */
sosInstantRouter.post(
  '/webhooks/twilio',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const cfg = getTwilioChannelConfig();
    if (!cfg.authToken) {
      return res.status(503).json({
        error: 'Twilio webhook verification unavailable: TWILIO_AUTH_TOKEN is not configured.',
      });
    }

    const signatureHeader =
      typeof req.headers['x-twilio-signature'] === 'string'
        ? req.headers['x-twilio-signature']
        : '';
    const fullUrl = `${resolveBackendPublicUrl(req)}${req.originalUrl}`;
    const bodyParams: Record<string, string> = {};
    if (req.body && typeof req.body === 'object') {
      for (const [k, v] of Object.entries(req.body)) {
        bodyParams[k] = String(v ?? '');
      }
    }

    const valid = verifyTwilioSignature({
      url: fullUrl,
      bodyParams,
      signatureHeader,
      authToken: cfg.authToken,
    });
    if (!valid) {
      return res.status(403).json({ error: 'Invalid X-Twilio-Signature.' });
    }

    const messageSid = bodyParams.MessageSid || bodyParams.SmsSid || '';
    const messageStatus = bodyParams.MessageStatus || bodyParams.SmsStatus || '';
    if (!messageSid || !messageStatus) {
      return res.status(400).json({ error: 'MessageSid and MessageStatus are required.' });
    }

    try {
      const updated = await handleTwilioStatusWebhook({
        messageSid,
        messageStatus,
        errorCode: bodyParams.ErrorCode,
        errorMessage: bodyParams.ErrorMessage,
      });
      return res.status(200).json({ ok: true, updated: Boolean(updated), status: updated?.status ?? null });
    } catch (err) {
      console.error('POST /api/sos/webhooks/twilio failed:', err);
      return res.status(500).json({ error: 'Failed to process Twilio status webhook.' });
    }
  }
);

/**
 * GET /api/sos/stream
 * Operational RBAC: Real-time Server-Sent Events (SSE) stream for Incident Command Center.
 */
sosInstantRouter.get('/stream', ...requireOperational, (req: AuthRequest, res) => {
  const orgId = getOrgId(req);
  const clientId = registerSosSseClient(orgId, res);

  req.on('close', () => {
    removeSosSseClient(clientId);
  });
});
