import { randomInt } from 'crypto';
import express from 'express';
import { Configuration } from '@nexconn/server-sdk/configuration.ts';
import { GroupChannelManagementApi } from '@nexconn/server-sdk/api.ts';
import { ApiException } from '@nexconn/server-sdk/base.ts';
import type { EmergencyCategory, IncidentState, PublicSOSPayload } from '../src/types/emergency';
import {
  ALLOWED_TRANSITIONS,
  STORAGE_META,
  assignRespondersToIncident,
  attachNexconnGroupToIncident,
  clearSimulatedIncidents,
  createPublicSOS,
  getIncidentById,
  listIncidents,
  listRescueCells,
  listResponders,
  rankRespondersForIncident,
  updateIncidentState,
  verifyIncident,
} from './emergencyStore';

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
  incidentCode: string;
  cellId: string;
  category: string;
  ownerUserId: string;
  memberUserIds: string[];
}): Promise<{ groupId: string; groupName: string; live: boolean; errorMessage?: string }> {
  const cleanCode = params.incidentCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const groupId = `gg-${cleanCode}-${Date.now().toString(36)}`;
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

export const emergencyRouter = express.Router();

/**
 * Public rescue cell directory (no sensitive incident data).
 */
emergencyRouter.get('/cells', (_req, res) => {
  res.json({
    cells: listRescueCells(),
    emergencyNumber: '112',
    storage: STORAGE_META,
  });
});

/**
 * Public Emergency SOS submission endpoint.
 * Always creates an UNVERIFIED report; never exposes other incidents.
 */
emergencyRouter.post('/sos', (req, res) => {
  const body = req.body as Partial<PublicSOSPayload>;
  const category = body?.category;
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: 'Valid emergency category is required (drowning, swept_away, missing_person, medical).',
    });
  }

  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (description.length < 3) {
    return res.status(400).json({
      error: 'Please provide a brief description of the emergency.',
    });
  }

  const { incident, cell, deduplicated } = createPublicSOS(
    {
      clientRequestId: typeof body.clientRequestId === 'string' ? body.clientRequestId : undefined,
      category,
      language: body.language === 'ta' ? 'ta' : 'en',
      description,
      reporterName: typeof body.reporterName === 'string' ? body.reporterName : undefined,
      reporterPhone: typeof body.reporterPhone === 'string' ? body.reporterPhone : undefined,
      cellId: typeof body.cellId === 'string' ? body.cellId : undefined,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lon: typeof body.lon === 'number' ? body.lon : null,
      gpsAccuracyMeters: typeof body.gpsAccuracyMeters === 'number' ? body.gpsAccuracyMeters : null,
      locationSource: body.locationSource,
      photoDataUrl: typeof body.photoDataUrl === 'string' ? body.photoDataUrl : undefined,
      hasVoiceNote: Boolean(body.hasVoiceNote),
      voiceTranscript: typeof body.voiceTranscript === 'string' ? body.voiceTranscript : undefined,
      lostChildDetails: body.lostChildDetails,
    },
    { isSimulated: false }
  );

  return res.status(deduplicated ? 200 : 201).json({
    incidentId: incident.id,
    code: incident.code,
    state: incident.state,
    cellId: cell.id,
    cellLabel: cell.label,
    siteName: cell.siteName,
    createdAt: incident.createdAt,
    deduplicated,
    emergencyNumber: '112',
    vhfChannel: cell.vhfChannel,
  });
});

/**
 * Operational guard: restrict incident details to operational command/responder views.
 */
function requireOperationalScope(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const role = String(req.header('x-gg-role') || '').toLowerCase();
  if (role !== 'dispatcher' && role !== 'responder' && role !== 'command') {
    return res.status(403).json({
      error: 'Operational incident data is restricted to authorized command and responder sessions.',
    });
  }
  return next();
}

emergencyRouter.get('/incidents', requireOperationalScope, (req, res) => {
  const scopeParam = String(req.query.scope || 'all').toLowerCase();
  const scope = scopeParam === 'real' || scopeParam === 'simulated' ? scopeParam : 'all';
  res.json({
    incidents: listIncidents(scope),
    responders: listResponders(),
    storage: STORAGE_META,
    allowedTransitions: ALLOWED_TRANSITIONS,
  });
});

emergencyRouter.get('/incidents/:id', requireOperationalScope, (req, res) => {
  const incident = getIncidentById(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }
  return res.json({ incident });
});

emergencyRouter.get('/responders', requireOperationalScope, (_req, res) => {
  res.json({ responders: listResponders() });
});

/**
 * Human Dispatcher Verification Gate.
 * Transitions UNVERIFIED -> VERIFIED (or REJECTED) and optionally creates a real Nexconn group.
 */
emergencyRouter.post('/incidents/:id/verify', requireOperationalScope, async (req, res) => {
  const decision = req.body?.decision === 'reject' ? 'reject' : 'verify';
  const dispatcherId =
    typeof req.body?.dispatcherId === 'string' && req.body.dispatcherId.trim()
      ? req.body.dispatcherId.trim()
      : 'gg-dispatch-chennai';
  const dispatcherName =
    typeof req.body?.dispatcherName === 'string' && req.body.dispatcherName.trim()
      ? req.body.dispatcherName.trim()
      : 'Coastal Dispatch Control';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
  const createNexconnGroup = req.body?.createNexconnGroup !== false;

  try {
    let incident = verifyIncident({
      incidentId: req.params.id,
      decision,
      dispatcherId,
      dispatcherName,
      notes,
    });

    if (decision === 'verify' && createNexconnGroup && !incident.nexconnGroupLive) {
      const groupResult = await createRealNexconnIncidentGroup({
        incidentCode: incident.code,
        cellId: incident.cellId,
        category: incident.category,
        ownerUserId: dispatcherId,
        memberUserIds: ['gg-analyst-ss', 'gg-dispatch-chennai'],
      });

      incident = attachNexconnGroupToIncident({
        incidentId: incident.id,
        groupId: groupResult.live ? groupResult.groupId : null,
        groupName: groupResult.groupName,
        live: groupResult.live,
        errorMessage: groupResult.errorMessage || null,
        actorId: dispatcherId,
        actorName: dispatcherName,
      });
    }

    return res.json({ incident });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Verification failed.' });
  }
});

/**
 * Explainable responder ranking for a verified incident.
 */
emergencyRouter.get('/incidents/:id/rank-responders', requireOperationalScope, (req, res) => {
  try {
    const ranked = rankRespondersForIncident(req.params.id);
    return res.json({ ranked });
  } catch (err: any) {
    return res.status(404).json({ error: err?.message || 'Unable to rank responders.' });
  }
});

/**
 * Human-approved responder dispatch + escalation timer + real Nexconn group member invite.
 */
emergencyRouter.post('/incidents/:id/assign', requireOperationalScope, async (req, res) => {
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
    typeof req.body?.dispatcherId === 'string' && req.body.dispatcherId.trim()
      ? req.body.dispatcherId.trim()
      : 'gg-dispatch-chennai';
  const dispatcherName =
    typeof req.body?.dispatcherName === 'string' && req.body.dispatcherName.trim()
      ? req.body.dispatcherName.trim()
      : 'Coastal Dispatch Control';

  try {
    const { incident, assignedProfiles } = assignRespondersToIncident({
      incidentId: req.params.id,
      responderIds,
      backupResponderId,
      escalationTimeoutSeconds,
      dispatcherId,
      dispatcherName,
    });

    let groupInviteSynced = false;
    if (incident.nexconnGroupLive && incident.nexconnGroupId) {
      const nexconnIds = assignedProfiles.map((p) => p.nexconnUserId);
      groupInviteSynced = await inviteUsersToNexconnGroup(incident.nexconnGroupId, nexconnIds);
    }

    return res.json({ incident, groupInviteSynced, responders: listResponders() });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Assignment failed.' });
  }
});

/**
 * Validated incident state transition or acknowledgement.
 */
emergencyRouter.post('/incidents/:id/status', requireOperationalScope, (req, res) => {
  const nextState = req.body?.nextState as IncidentState;
  const acknowledgeOnly = Boolean(req.body?.acknowledgeOnly);
  const actorId =
    typeof req.body?.actorId === 'string' && req.body.actorId.trim()
      ? req.body.actorId.trim()
      : 'gg-dispatch-chennai';
  const actorName =
    typeof req.body?.actorName === 'string' && req.body.actorName.trim()
      ? req.body.actorName.trim()
      : 'Coastal Dispatch Control';
  const actorRole = req.body?.actorRole === 'responder' ? 'responder' : 'dispatcher';
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

  try {
    const incident = updateIncidentState({
      incidentId: req.params.id,
      nextState,
      actorId,
      actorName,
      actorRole,
      note,
      acknowledgeOnly,
    });
    return res.json({ incident, responders: listResponders() });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Status update failed.' });
  }
});

/**
 * Explicitly create a real Nexconn incident group for a verified incident if not already created.
 */
emergencyRouter.post('/incidents/:id/nexconn-group', requireOperationalScope, async (req, res) => {
  const incident = getIncidentById(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found.' });
  }
  if (incident.state === 'UNVERIFIED' || incident.state === 'REJECTED') {
    return res.status(400).json({ error: 'Verify the incident before creating a Nexconn incident group.' });
  }

  const ownerUserId =
    typeof req.body?.ownerUserId === 'string' && req.body.ownerUserId.trim()
      ? req.body.ownerUserId.trim()
      : 'gg-dispatch-chennai';
  const actorName =
    typeof req.body?.actorName === 'string' && req.body.actorName.trim()
      ? req.body.actorName.trim()
      : 'Coastal Dispatch Control';

  const responders = listResponders();
  const assignedNexconnIds = responders
    .filter((r) => incident.assignedResponderIds.includes(r.id))
    .map((r) => r.nexconnUserId);

  const groupResult = await createRealNexconnIncidentGroup({
    incidentCode: incident.code,
    cellId: incident.cellId,
    category: incident.category,
    ownerUserId,
    memberUserIds: ['gg-analyst-ss', 'gg-dispatch-chennai', ...assignedNexconnIds],
  });

  const updated = attachNexconnGroupToIncident({
    incidentId: incident.id,
    groupId: groupResult.live ? groupResult.groupId : null,
    groupName: groupResult.groupName,
    live: groupResult.live,
    errorMessage: groupResult.errorMessage || null,
    actorId: ownerUserId,
    actorName,
  });

  return res.status(groupResult.live ? 200 : 502).json({
    incident: updated,
    live: groupResult.live,
    error: groupResult.errorMessage || null,
  });
});

/**
 * Rescue Digital Twin drill endpoint — clearly separated & flagged `isSimulated: true`.
 */
emergencyRouter.post('/simulate/sos', requireOperationalScope, (req, res) => {
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

  const { incident } = createPublicSOS(
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
          ? { approximateAge: '7', clothingDescription: 'Yellow t-shirt, blue shorts', lastSeenMinutesAgo: 6 }
          : undefined,
    },
    { isSimulated: true, actorName: 'Rescue Digital Twin (Simulated Drill)' }
  );

  return res.status(201).json({ incident });
});

emergencyRouter.delete('/simulate/clear', requireOperationalScope, (_req, res) => {
  const result = clearSimulatedIncidents();
  return res.json(result);
});
