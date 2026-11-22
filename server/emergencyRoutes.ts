import { randomInt } from 'crypto';
import express from 'express';
import { Configuration } from '@nexconn/server-sdk/configuration.ts';
import { GroupChannelManagementApi } from '@nexconn/server-sdk/api.ts';
import { ApiException } from '@nexconn/server-sdk/base.ts';
import type { EmergencyCategory, IncidentState, PublicSOSPayload } from '../src/types/emergency.ts';
import { ALLOWED_TRANSITIONS } from './emergencyStore.ts';
import { getEmergencyRepository } from '../src/db/repositories/index.ts';
import {
  filterItemsByAuthorizedRegion,
  optionalAuth,
  requireRole,
  type AuthRequest,
} from '../src/middleware/auth.ts';
import { DEFAULT_ORGANIZATION_ID } from '../src/db/users.ts';
import { executeAutomaticSosDispatch } from './sosInstantRoutes.ts';
import { isLocalDevDemoAllowed } from './envAuthPolicy.ts';
import { DEMO_OPERATORS } from './nexconnRoutes.ts';
import { incrementWorkspaceCounter } from './workspaceRoutes.ts';

const VALID_CATEGORIES: EmergencyCategory[] = ['drowning', 'swept_away', 'missing_person', 'medical'];

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

function buildNexconnConfiguration(): Configuration | null {
  const appKey = cleanEnv(process.env.NEXCONN_APP_KEY);
  const appSecret = cleanEnv(process.env.NEXCONN_APP_SECRET);
  const primary = normalizeDomain(process.env.NEXCONN_PRIMARY_API_DOMAIN);
  const secondary = normalizeDomain(process.env.NEXCONN_SECONDARY_API_DOMAIN);
  if (!appKey || !appSecret || !primary || !secondary) return null;

  const configuration = new Configuration();
  configuration.setNexconnCredentials(appKey, appSecret);
  configuration.setPrimaryBackupDomains(primary, secondary);
  configuration.setAutoFailoverEnabled(true);
  configuration.setNonceGenerator(() => String(randomInt(100000000, 999999999)));
  return configuration;
}

async function createRealNexconnIncidentGroup(params: {
  organizationId: string;
  incidentCode: string;
  cellId: string;
  category: string;
  ownerUserId: string;
  memberUserIds: string[];
}): Promise<{ groupId: string; groupName: string; live: boolean; errorMessage?: string }> {
  const cleanCode = params.incidentCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const orgPrefix = params.organizationId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const groupId = `gg-${orgPrefix}-${cleanCode}-${Date.now().toString(36)}`;
  const groupName = `${params.incidentCode} · ${params.cellId} (${params.category.replace('_', ' ')})`;

  const configuration = buildNexconnConfiguration();
  if (!configuration) {
    return {
      groupId,
      groupName,
      live: false,
      errorMessage: 'Nexconn server credentials are not configured.',
    };
  }

  try {
    const groupApi = new GroupChannelManagementApi(configuration);
    const uniqueMembers = Array.from(new Set([params.ownerUserId, ...params.memberUserIds]));
    await groupApi.createGroupChannel({
      channelId: groupId,
      name: groupName.slice(0, 60),
      owner: params.ownerUserId,
      userIds: uniqueMembers,
      groupProfile: {
        introduction: `GuardianGrid Incident Command group for ${params.incidentCode} at ${params.cellId}.`,
      },
    });
    incrementWorkspaceCounter('nexconnGroupsTriggered', 1, params.organizationId);
    return { groupId, groupName, live: true };
  } catch (err: any) {
    const msg =
      err instanceof ApiException
        ? `Nexconn Server API error (${err.errorCode}): ${err.errorMessage || `HTTP ${err.httpStatus}`}`
        : err?.message || 'Unable to create Nexconn group';
    console.error('Nexconn incident group creation failed:', msg);
    return { groupId, groupName, live: false, errorMessage: msg };
  }
}

async function inviteUsersToNexconnGroup(groupId: string, userIds: string[]): Promise<boolean> {
  const configuration = buildNexconnConfiguration();
  if (!configuration || userIds.length === 0) return false;
  try {
    const groupApi = new GroupChannelManagementApi(configuration);
    await groupApi.joinGroupChannel({
      channelId: groupId,
      userIds: Array.from(new Set(userIds)),
    });
    return true;
  } catch (err: any) {
    console.error('Nexconn group join failed:', err?.errorMessage || err?.message || 'Unknown error');
    return false;
  }
}

function getOrgId(req: AuthRequest): string {
  return req.authContext?.organizationId || DEFAULT_ORGANIZATION_ID;
}

function isRegionAuthorized(req: AuthRequest, regionId?: string): boolean {
  const authorized = req.authContext?.authorizedRegionIds || [];
  if (authorized.length === 0 || !regionId) return true;
  return authorized.includes(regionId);
}

// Burst-tolerant sliding-window rate limiter for public SOS endpoints
const publicSosHits = new Map<string, number[]>();
function checkPublicRateLimit(req: express.Request, maxRequests = 15, windowMs = 60_000): { allowed: boolean; retryAfterSec: number } {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip) || 'unknown';
  const now = Date.now();
  const timestamps = (publicSosHits.get(ip) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    publicSosHits.set(ip, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  publicSosHits.set(ip, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

export const emergencyRouter = express.Router();

const requireOperationalRead = requireRole(['ORG_ADMIN', 'DISPATCHER', 'RESPONDER']);
const requireDispatchPrivilege = requireRole(['ORG_ADMIN', 'DISPATCHER']);

/**
 * Public list of geographical regions managed by the organization.
 */
emergencyRouter.get('/regions', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const repo = getEmergencyRepository();
    const regions = await repo.listRegions(getOrgId(req));
    return res.json({ regions, organizationId: getOrgId(req) });
  } catch (error) {
    console.error('GET /api/emergency/regions failed:', error);
    return res.status(500).json({ error: 'Unable to load regions.' });
  }
});

/**
 * Public rescue cell directory (accessible to PUBLIC_SOS QR guests and authenticated users).
 */
emergencyRouter.get('/cells', optionalAuth, async (req: AuthRequest, res) => {
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId.trim() || undefined : undefined;
  try {
    const repo = getEmergencyRepository();
    const cells = await repo.listRescueCells(getOrgId(req), regionId);
    return res.json({
      cells,
      emergencyNumber: '112',
      storage: repo.getStorageMeta(),
    });
  } catch (error) {
    console.error('GET /api/emergency/cells failed:', error);
    return res.status(500).json({ error: 'Unable to load rescue cell directory.' });
  }
});

/**
 * Public Emergency SOS submission endpoint (PUBLIC_SOS guest QR reporters + all roles + offline queue flush).
 * Always creates an UNVERIFIED report AND runs the full automatic dispatch pipeline
 * (bilingual EN/TA alert, SMS/WhatsApp outbox, Nexconn War Room + Alert Card, Command Center SSE).
 * Never requires the bystander to draft a description before firing SOS.
 */
emergencyRouter.post('/sos', optionalAuth, async (req: AuthRequest, res) => {
  const rate = checkPublicRateLimit(req, 15, 60_000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return res.status(429).json({
      error: 'Too many SOS requests from this network. Call 112 immediately for life-threatening emergencies.',
      emergencyNumber: '112',
      retryAfterSec: rate.retryAfterSec,
    });
  }

  const body = req.body as Partial<PublicSOSPayload> & { reporterNexconnUserId?: string };
  const category = body?.category && VALID_CATEGORIES.includes(body.category)
    ? body.category
    : 'drowning';

  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    (typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : req.protocol) || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader).split(',')[0].trim();
  const envUrl = cleanEnv(process.env.APP_URL).replace(/\/+$/, '');
  const appBaseUrl = envUrl && envUrl !== 'MY_APP_URL' ? envUrl : `${proto}://${host}`;

  try {
    const result = await executeAutomaticSosDispatch({
      organizationId: getOrgId(req),
      appBaseUrl,
      category,
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
      isSandboxTest: false,
    });

    return res.status(result.deduplicated ? 200 : 201).json({
      incidentId: result.incidentId,
      code: result.code,
      state: result.state,
      cellId: result.cellId,
      cellLabel: result.cellLabel,
      siteName: result.siteName,
      createdAt: result.createdAt,
      deduplicated: Boolean(result.deduplicated),
      locationQuality: result.locationQuality,
      qrCellValid: result.qrCellValid,
      emergencyNumber: result.emergencyNumber,
      vhfChannel: result.vhfChannel,
      nexconnGroup: result.nexconnGroup,
      officialAlerts: result.officialAlerts,
    });
  } catch (error) {
    console.error('POST /api/emergency/sos failed:', error);
    return res.status(500).json({ error: 'Unable to record emergency SOS report.' });
  }
});

emergencyRouter.get('/incidents', requireOperationalRead, async (req: AuthRequest, res) => {
  const scopeParam = String(req.query.scope || 'all').toLowerCase();
  const scope = scopeParam === 'real' || scopeParam === 'simulated' ? scopeParam : 'all';
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId.trim() || undefined : undefined;

  try {
    const repo = getEmergencyRepository();
    const orgId = getOrgId(req);
    const [rawIncidentsList, rawRespondersList] = await Promise.all([
      repo.listIncidents(orgId, scope, regionId),
      repo.listResponders(orgId, regionId),
    ]);
    const incidentsList = filterItemsByAuthorizedRegion(req, rawIncidentsList);
    const respondersList = filterItemsByAuthorizedRegion(req, rawRespondersList);
    return res.json({
      incidents: incidentsList,
      responders: respondersList,
      storage: repo.getStorageMeta(),
      allowedTransitions: ALLOWED_TRANSITIONS,
    });
  } catch (error) {
    console.error('GET /api/emergency/incidents failed:', error);
    return res.status(500).json({ error: 'Unable to load incidents.' });
  }
});

emergencyRouter.get('/incidents/:id', requireOperationalRead, async (req: AuthRequest, res) => {
  try {
    const repo = getEmergencyRepository();
    const incident = await repo.getIncidentById(getOrgId(req), req.params.id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    if (!isRegionAuthorized(req, incident.regionId)) {
      return res.status(403).json({
        error: 'Access denied: this incident belongs to a region outside your authorized scope.',
      });
    }
    return res.json({ incident });
  } catch (error) {
    console.error('GET /api/emergency/incidents/:id failed:', error);
    return res.status(500).json({ error: 'Unable to load incident.' });
  }
});

emergencyRouter.get('/responders', requireOperationalRead, async (req: AuthRequest, res) => {
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId.trim() || undefined : undefined;
  try {
    const repo = getEmergencyRepository();
    const rawResponders = await repo.listResponders(getOrgId(req), regionId);
    const responders = filterItemsByAuthorizedRegion(req, rawResponders);
    return res.json({ responders });
  } catch (error) {
    console.error('GET /api/emergency/responders failed:', error);
    return res.status(500).json({ error: 'Unable to load responders.' });
  }
});

/**
 * Human Dispatcher Verification Gate (ORG_ADMIN / DISPATCHER).
 * Transitions UNVERIFIED -> VERIFIED (or REJECTED) and optionally creates a real Nexconn group.
 */
emergencyRouter.post(
  '/incidents/:id/verify',
  requireDispatchPrivilege,
  async (req: AuthRequest, res) => {
    const orgId = getOrgId(req);
    const decision = req.body?.decision === 'reject' ? 'reject' : 'verify';
    const dispatcherId =
      req.authContext?.nexconnUserId ||
      (typeof req.body?.dispatcherId === 'string' && req.body.dispatcherId.trim()
        ? req.body.dispatcherId.trim()
        : 'gg-dispatch-chennai');
    const dispatcherName =
      (req.authContext?.isAuthenticated ? req.authContext.displayName : null) ||
      (typeof req.body?.dispatcherName === 'string' && req.body.dispatcherName.trim()
        ? req.body.dispatcherName.trim()
        : 'Coastal Dispatch Control');
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
    const createNexconnGroup = req.body?.createNexconnGroup !== false;

    try {
      const repo = getEmergencyRepository();
      const existing = await repo.getIncidentById(orgId, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Incident not found.' });
      }
      if (!isRegionAuthorized(req, existing.regionId)) {
        return res.status(403).json({
          error: 'Access denied: this incident belongs to a region outside your authorized scope.',
        });
      }

      let incident = await repo.verifyIncident({
        organizationId: orgId,
        incidentId: req.params.id,
        decision,
        dispatcherId,
        dispatcherName,
        notes,
      });

      if (decision === 'verify' && createNexconnGroup && !incident.nexconnGroupLive) {
        const responders = await repo.listResponders(orgId);
        const assignedNexconnIds = responders
          .filter((r) => incident.assignedResponderIds.includes(r.id))
          .map((r) => r.nexconnUserId);
        const memberUserIds = Array.from(new Set([dispatcherId, ...assignedNexconnIds]));
        const groupResult = await createRealNexconnIncidentGroup({
          organizationId: orgId,
          incidentCode: incident.code,
          cellId: incident.cellId,
          category: incident.category,
          ownerUserId: dispatcherId,
          memberUserIds,
        });

        incident = await repo.attachNexconnGroupToIncident({
          organizationId: orgId,
          incidentId: incident.id,
          groupId: groupResult.live ? groupResult.groupId : null,
          groupName: groupResult.groupName,
          live: groupResult.live,
          errorMessage: groupResult.errorMessage || null,
          actorId: dispatcherId,
          actorName: dispatcherName,
          memberUserIds,
        });
      }

      return res.json({ incident });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Verification failed.' });
    }
  }
);

/**
 * Explainable responder ranking for a verified incident.
 */
emergencyRouter.get(
  '/incidents/:id/rank-responders',
  requireOperationalRead,
  async (req: AuthRequest, res) => {
    try {
      const repo = getEmergencyRepository();
      const ranked = await repo.rankRespondersForIncident(getOrgId(req), req.params.id);
      return res.json({ ranked });
    } catch (err: any) {
      return res.status(404).json({ error: err?.message || 'Unable to rank responders.' });
    }
  }
);

/**
 * Human-approved responder dispatch + escalation timer + real Nexconn group member invite.
 */
emergencyRouter.post(
  '/incidents/:id/assign',
  requireDispatchPrivilege,
  async (req: AuthRequest, res) => {
    const orgId = getOrgId(req);
    const responderIds = Array.isArray(req.body?.responderIds)
      ? req.body.responderIds.filter((id: unknown) => typeof id === 'string')
      : [];
    const backupResponderId =
      typeof req.body?.backupResponderId === 'string' ? req.body.backupResponderId : null;
    const escalationTimeoutSeconds =
      typeof req.body?.escalationTimeoutSeconds === 'number'
        ? req.body.escalationTimeoutSeconds
        : 90;
    const dispatcherId =
      req.authContext?.nexconnUserId ||
      (typeof req.body?.dispatcherId === 'string' && req.body.dispatcherId.trim()
        ? req.body.dispatcherId.trim()
        : 'gg-dispatch-chennai');
    const dispatcherName =
      (req.authContext?.isAuthenticated ? req.authContext.displayName : null) ||
      (typeof req.body?.dispatcherName === 'string' && req.body.dispatcherName.trim()
        ? req.body.dispatcherName.trim()
        : 'Coastal Dispatch Control');

    const allowOverride = Boolean(req.body?.allowOverride);
    const overrideReason =
      typeof req.body?.overrideReason === 'string' ? req.body.overrideReason.trim().slice(0, 200) : undefined;

    try {
      const repo = getEmergencyRepository();
      const existing = await repo.getIncidentById(orgId, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Incident not found.' });
      }
      if (!isRegionAuthorized(req, existing.regionId)) {
        return res.status(403).json({
          error: 'Access denied: this incident belongs to a region outside your authorized scope.',
        });
      }

      const { incident, assignedProfiles, noEligibleAvailableWarning } =
        await repo.assignRespondersToIncident({
          organizationId: orgId,
          incidentId: req.params.id,
          responderIds,
          backupResponderId,
          escalationTimeoutSeconds,
          dispatcherId,
          dispatcherName,
          allowOverride,
          overrideReason,
        });

      let groupInviteSynced = false;
      if (incident.nexconnGroupLive && incident.nexconnGroupId) {
        const nexconnIds = assignedProfiles.map((p) => p.nexconnUserId);
        groupInviteSynced = await inviteUsersToNexconnGroup(incident.nexconnGroupId, nexconnIds);
      }

      const responders = await repo.listResponders(orgId);
      return res.json({ incident, groupInviteSynced, responders, noEligibleAvailableWarning });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Assignment failed.' });
    }
  }
);

/**
 * Validated incident state transition, acknowledgement, or field backup request.
 * Enforces organization isolation, region authorization, idempotency, and safety invariant
 * (responders cannot finalize RESOLVED — dispatcher confirmation is required).
 */
emergencyRouter.post(
  '/incidents/:id/status',
  requireOperationalRead,
  async (req: AuthRequest, res) => {
    const orgId = getOrgId(req);
    const nextState = req.body?.nextState as IncidentState | undefined;
    const acknowledgeOnly = Boolean(req.body?.acknowledgeOnly);
    const requestBackup = Boolean(req.body?.requestBackup);
    const rejectAssignment = Boolean(req.body?.rejectAssignment);
    const arrivalVerification: 'gps_verified' | 'manual_confirmed' | undefined =
      req.body?.arrivalVerification === 'gps_verified' ||
      req.body?.arrivalVerification === 'manual_confirmed'
        ? req.body.arrivalVerification
        : undefined;
    const clientRequestId =
      typeof req.body?.clientRequestId === 'string' && req.body.clientRequestId.trim()
        ? req.body.clientRequestId.trim().slice(0, 80)
        : undefined;
    const responderLat =
      typeof req.body?.responderLat === 'number' && Number.isFinite(req.body.responderLat)
        ? req.body.responderLat
        : null;
    const responderLon =
      typeof req.body?.responderLon === 'number' && Number.isFinite(req.body.responderLon)
        ? req.body.responderLon
        : null;

    const actorId =
      req.authContext?.nexconnUserId ||
      (typeof req.body?.actorId === 'string' && req.body.actorId.trim()
        ? req.body.actorId.trim()
        : 'gg-dispatch-chennai');
    const actorName =
      (req.authContext?.isAuthenticated ? req.authContext.displayName : null) ||
      (typeof req.body?.actorName === 'string' && req.body.actorName.trim()
        ? req.body.actorName.trim()
        : 'Coastal Dispatch Control');
    const isResponderRole =
      req.authContext?.role === 'RESPONDER' || req.body?.actorRole === 'responder';
    const actorRole: 'dispatcher' | 'responder' = isResponderRole ? 'responder' : 'dispatcher';
    const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

    // Safety invariant: Responders cannot auto-resolve an incident; dispatcher confirmation is required
    if (isResponderRole && nextState === 'RESOLVED') {
      return res.status(403).json({
        error:
          'Final incident resolution requires dispatcher confirmation. Report VICTIM_RECOVERED or MEDICAL_HANDOFF instead.',
      });
    }

    try {
      const repo = getEmergencyRepository();

      // Region-level access isolation check
      const existing = await repo.getIncidentById(orgId, req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Incident not found in your organization.' });
      }
      if (!isRegionAuthorized(req, existing.regionId)) {
        return res.status(403).json({
          error: 'Access denied: this incident belongs to a region outside your authorized scope.',
        });
      }

      const { incident, deduplicated } = await repo.updateIncidentState({
        organizationId: orgId,
        incidentId: req.params.id,
        nextState,
        actorId,
        actorName,
        actorRole,
        note,
        acknowledgeOnly,
        requestBackup,
        rejectAssignment,
        clientRequestId,
        responderLat,
        responderLon,
        arrivalVerification,
      });
      const responders = await repo.listResponders(orgId);
      return res.json({
        incident,
        responders,
        deduplicated,
        organizationId: orgId,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Status update failed.' });
    }
  }
);

/**
 * Explicitly create a real Nexconn incident group for a verified incident if not already created.
 */
emergencyRouter.post(
  '/incidents/:id/nexconn-group',
  requireDispatchPrivilege,
  async (req: AuthRequest, res) => {
    const orgId = getOrgId(req);
    try {
      const repo = getEmergencyRepository();
      const incident = await repo.getIncidentById(orgId, req.params.id);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found.' });
      }
      if (!isRegionAuthorized(req, incident.regionId)) {
        return res.status(403).json({
          error: 'Access denied: this incident belongs to a region outside your authorized scope.',
        });
      }
      if (incident.state === 'UNVERIFIED' || incident.state === 'REJECTED') {
        return res
          .status(400)
          .json({ error: 'Verify the incident before creating a Nexconn incident group.' });
      }

      const ownerUserId =
        req.authContext?.nexconnUserId ||
        (typeof req.body?.ownerUserId === 'string' && req.body.ownerUserId.trim()
          ? req.body.ownerUserId.trim()
          : 'gg-dispatch-chennai');
      const actorName =
        (req.authContext?.isAuthenticated ? req.authContext.displayName : null) ||
        (typeof req.body?.actorName === 'string' && req.body.actorName.trim()
          ? req.body.actorName.trim()
          : 'Coastal Dispatch Control');

      const responders = await repo.listResponders(orgId);
      const assignedNexconnIds = responders
        .filter((r) => incident.assignedResponderIds.includes(r.id))
        .map((r) => r.nexconnUserId);
      const memberUserIds = Array.from(new Set([ownerUserId, ...assignedNexconnIds]));

      const groupResult = await createRealNexconnIncidentGroup({
        organizationId: orgId,
        incidentCode: incident.code,
        cellId: incident.cellId,
        category: incident.category,
        ownerUserId,
        memberUserIds,
      });

      const updated = await repo.attachNexconnGroupToIncident({
        organizationId: orgId,
        incidentId: incident.id,
        groupId: groupResult.live ? groupResult.groupId : null,
        groupName: groupResult.groupName,
        live: groupResult.live,
        errorMessage: groupResult.errorMessage || null,
        actorId: ownerUserId,
        actorName,
        memberUserIds,
      });

      return res.status(groupResult.live ? 200 : 502).json({
        incident: updated,
        live: groupResult.live,
        error: groupResult.errorMessage || null,
      });
    } catch (error) {
      console.error('POST /api/emergency/incidents/:id/nexconn-group failed:', error);
      return res.status(500).json({ error: 'Unable to create Nexconn incident group.' });
    }
  }
);

/**
 * Ensure the currently authorized operational user (ORG_ADMIN, DISPATCHER, RESPONDER)
 * is a member of an incident's live Nexconn group within their organization and region scope.
 */
emergencyRouter.post(
  '/incidents/:id/nexconn-group/join',
  requireOperationalRead,
  async (req: AuthRequest, res) => {
    const orgId = getOrgId(req);
    try {
      const repo = getEmergencyRepository();
      const incident = await repo.getIncidentById(orgId, req.params.id);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found.' });
      }
      if (!isRegionAuthorized(req, incident.regionId)) {
        return res.status(403).json({
          error: 'Access denied: this incident belongs to a region outside your authorized scope.',
        });
      }
      if (!incident.nexconnGroupLive || !incident.nexconnGroupId) {
        return res.status(400).json({
          error: 'No live Nexconn incident group is provisioned for this incident yet.',
        });
      }

      // Never allow arbitrary user-supplied memberUserId.
      // Hosted/prod requires verified Firebase Auth; local dev validates against DEMO_OPERATORS / org responders.
      let memberUserId = '';
      if (req.authContext?.isAuthenticated && req.authContext.nexconnUserId) {
        memberUserId = req.authContext.nexconnUserId;
      } else {
        if (!isLocalDevDemoAllowed(req)) {
          return res.status(401).json({
            error: 'Authenticated operator session required to join an incident Nexconn group.',
          });
        }

        const requested =
          typeof req.body?.memberUserId === 'string' ? req.body.memberUserId.trim() : '';
        if (requested) {
          const isDemoOperator = DEMO_OPERATORS.some((op) => op.userId === requested);
          const orgResponders = await repo.listResponders(orgId, incident.regionId);
          const isOrgResponder = orgResponders.some((r) => r.nexconnUserId === requested);
          if (!isDemoOperator && !isOrgResponder) {
            return res.status(403).json({
              error: 'Forbidden: memberUserId is not an authorized operator or responder for this tenant/region.',
            });
          }
          memberUserId = requested;
        } else {
          memberUserId = req.authContext?.nexconnUserId || 'gg-dispatch-chennai';
        }
      }

      const synced = await inviteUsersToNexconnGroup(incident.nexconnGroupId, [memberUserId]);
      return res.json({
        ok: true,
        groupId: incident.nexconnGroupId,
        memberUserId,
        synced,
      });
    } catch (error) {
      console.error('POST /api/emergency/incidents/:id/nexconn-group/join failed:', error);
      return res.status(500).json({ error: 'Unable to join Nexconn incident group.' });
    }
  }
);

/**
 * Rescue Digital Twin drill endpoint — clearly separated & flagged `isSimulated: true`.
 */
emergencyRouter.post(
  '/simulate/sos',
  requireDispatchPrivilege,
  async (req: AuthRequest, res) => {
    const category: EmergencyCategory = VALID_CATEGORIES.includes(req.body?.category)
      ? req.body.category
      : 'drowning';
    const cellId = typeof req.body?.cellId === 'string' ? req.body.cellId : 'MARINA-C2';
    const language = req.body?.language === 'ta' ? 'ta' : 'en';

    const presets: Record<EmergencyCategory, string> = {
      drowning:
        language === 'ta'
          ? '[ஒத்திகை] மெரினா மையத்தில் நீச்சல் வீரர் வலுவான அலையில் சிக்கியுள்ளார். உடனடி மீட்பு தேவை.'
          : '[DRILL] Swimmer reported struggling in strong shorebreak rip current near Marina Central.',
      swept_away:
        '[DRILL] Two waders swept past the outer sandbar during rising swell near Marina South.',
      missing_person:
        '[DRILL] Missing 7-year-old child wearing a yellow t-shirt last seen near Elliot North promenade.',
      medical:
        '[DRILL] Bystander collapsed with suspected heat exhaustion near Marina Tower 1 access gate.',
    };

    try {
      const repo = getEmergencyRepository();
      const { incident } = await repo.createPublicSOS(
        getOrgId(req),
        {
          category,
          language,
          cellId,
          locationSource: 'cell_qr',
          description:
            typeof req.body?.description === 'string' && req.body.description.trim().length > 3
              ? req.body.description.trim()
              : presets[category],
          reporterName: 'Drill Observer',
          reporterPhone: '9840000000',
          lostChildDetails:
            category === 'missing_person'
              ? {
                  approximateAge: '7',
                  clothingDescription: 'Yellow t-shirt, blue shorts',
                  lastSeenMinutesAgo: 6,
                }
              : undefined,
        },
        { isSimulated: true, actorName: 'Rescue Digital Twin (Simulated Drill)' }
      );

      return res.status(201).json({ incident });
    } catch (error) {
      console.error('POST /api/emergency/simulate/sos failed:', error);
      return res.status(500).json({ error: 'Unable to create simulated drill incident.' });
    }
  }
);

emergencyRouter.delete(
  '/simulate/clear',
  requireDispatchPrivilege,
  async (req: AuthRequest, res) => {
    try {
      const repo = getEmergencyRepository();
      const result = await repo.clearSimulatedIncidents(getOrgId(req));
      return res.json(result);
    } catch (error) {
      console.error('DELETE /api/emergency/simulate/clear failed:', error);
      return res.status(500).json({ error: 'Unable to clear simulated incidents.' });
    }
  }
);
