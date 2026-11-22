import express from 'express';
import { getEmergencyRepository } from '../src/db/repositories/index.ts';
import {
  createMedicalHandoffVersion,
  createPublicHandoffLink,
  findMedicalHandoffByClientRequestId,
  listMedicalHandoffsForIncident,
  markMedicalHandoffSharedToNexconn,
  resolveAndTouchPublicHandoffToken,
  reviewMedicalHandoffReport,
  revokePublicHandoffLink,
} from '../src/db/repositories/medicalHandoffRepository.ts';
import {
  optionalAuth,
  requireRole,
  type AuthRequest,
} from '../src/middleware/auth.ts';
import { DEFAULT_ORGANIZATION_ID } from '../src/db/users.ts';
import type { EmergencyIncident } from '../src/types/emergency.ts';
import type { PublicParamedicTrackingPayload } from '../src/types/medicalHandoff.ts';
import { fetchEnvironmentalConditionsForIncident } from './services/openMeteoServer.ts';
import {
  fetchNexconnGroupContext,
  publishMedicalHandoffToNexconnGroup,
} from './services/nexconnChannelReader.ts';
import { generateBilingualMedicalHandoff } from './services/medicalHandoffAi.ts';
import { getPublicHospitalContextForIncident } from './mapsRoutes.ts';

export const medicalHandoffRouter = express.Router();
export const publicHandoffRouter = express.Router();

const requireOperational = [optionalAuth, requireRole(['ORG_ADMIN', 'DISPATCHER', 'RESPONDER'])];
const requireDispatcher = [optionalAuth, requireRole(['ORG_ADMIN', 'DISPATCHER'])];

function getOrgId(req: AuthRequest): string {
  return req.authContext?.organizationId || DEFAULT_ORGANIZATION_ID;
}

async function loadAuthorizedIncident(
  req: AuthRequest,
  res: express.Response
): Promise<EmergencyIncident | null> {
  const orgId = getOrgId(req);
  const repo = getEmergencyRepository();
  const incident = await repo.getIncidentById(orgId, req.params.id);
  if (!incident) {
    res.status(404).json({ error: 'Incident not found in your organization.' });
    return null;
  }

  const authorizedRegions = req.authContext?.authorizedRegionIds || [];
  if (
    authorizedRegions.length > 0 &&
    incident.regionId &&
    !authorizedRegions.includes(incident.regionId)
  ) {
    res.status(403).json({
      error: 'Access denied: this incident belongs to a region outside your authorized scope.',
    });
    return null;
  }

  return incident;
}

/**
 * GET /api/incidents/:id/medical-handoff
 * Lists versioned medical handoff reports & public link metadata (never raw tokens).
 */
medicalHandoffRouter.get('/:id/medical-handoff', ...requireOperational, async (req: AuthRequest, res) => {
  try {
    const incident = await loadAuthorizedIncident(req, res);
    if (!incident) return;

    const orgId = getOrgId(req);
    const data = await listMedicalHandoffsForIncident({
      organizationId: orgId,
      incidentId: incident.id,
      incidentCode: incident.code,
      cellId: incident.cellId,
    });

    return res.json({
      incidentId: incident.id,
      incidentCode: incident.code,
      reports: data.reports,
      links: data.links,
    });
  } catch (err: any) {
    console.error('GET /api/incidents/:id/medical-handoff failed:', err?.message);
    return res.status(500).json({ error: 'Unable to load medical handoff reports.' });
  }
});

/**
 * POST /api/incidents/:id/medical-handoff
 * Gathers incident data, Nexconn group messages, and Open-Meteo environmental conditions,
 * generates a validated bilingual (English + Tamil) SBAR report with Gemini structured JSON,
 * and saves a new version requiring human dispatcher review.
 */
medicalHandoffRouter.post('/:id/medical-handoff', ...requireOperational, async (req: AuthRequest, res) => {
  try {
    const incident = await loadAuthorizedIncident(req, res);
    if (!incident) return;

    const orgId = getOrgId(req);
    const clientRequestId =
      typeof req.body?.clientRequestId === 'string' && req.body.clientRequestId.trim()
        ? req.body.clientRequestId.trim().slice(0, 80)
        : undefined;

    // Duplicate generation protection
    if (clientRequestId) {
      const existing = await findMedicalHandoffByClientRequestId({
        organizationId: orgId,
        incidentId: incident.id,
        incidentCode: incident.code,
        cellId: incident.cellId,
        clientRequestId,
      });
      if (existing) {
        return res.status(200).json({ report: existing, deduplicated: true });
      }
    }

    const repo = getEmergencyRepository();
    const [allResponders, cells] = await Promise.all([
      repo.listResponders(orgId, incident.regionId),
      repo.listRescueCells(orgId, incident.regionId),
    ]);

    const assignedResponders = allResponders.filter((r) =>
      (incident.assignedResponderIds || []).includes(r.id)
    );
    const cell = cells.find((c) => c.id === incident.cellId) || null;
    const targetLat = incident.lat ?? cell?.lat ?? null;
    const targetLon = incident.lon ?? cell?.lon ?? null;

    const actorId = req.authContext?.nexconnUserId || req.authContext?.uid || 'gg-dispatch-chennai';
    const actorName = req.authContext?.displayName || 'Coastal Dispatch Control';
    const actorRole: 'dispatcher' | 'responder' =
      req.authContext?.role === 'RESPONDER' ? 'responder' : 'dispatcher';

    const [environmental, nexconnContext] = await Promise.all([
      fetchEnvironmentalConditionsForIncident(targetLat, targetLon),
      fetchNexconnGroupContext({
        groupId: incident.nexconnGroupLive ? incident.nexconnGroupId : null,
        participantUserId: actorId,
      }),
    ]);

    const victimCount =
      typeof req.body?.victimCount === 'number' && Number.isFinite(req.body.victimCount)
        ? Math.max(0, Math.round(req.body.victimCount))
        : null;

    const { payload, modelUsed } = await generateBilingualMedicalHandoff({
      incident,
      organizationId: orgId,
      assignedResponders,
      nexconnMessages: nexconnContext.messages,
      nexconnRetrievalStatus: nexconnContext.status,
      environmental,
      victimCount,
    });

    const report = await createMedicalHandoffVersion({
      organizationId: orgId,
      regionId: incident.regionId || null,
      incidentId: incident.id,
      incidentCode: incident.code,
      cellId: incident.cellId,
      payload,
      modelUsed,
      actorId,
      actorName,
      actorRole,
      clientRequestId,
    });

    return res.status(201).json({ report, deduplicated: false });
  } catch (err: any) {
    console.error('POST /api/incidents/:id/medical-handoff failed:', err?.message);
    const status = err?.message?.includes('GEMINI_API_KEY') ? 503 : 502;
    return res.status(status).json({
      error: err?.message || 'Unable to generate medical handoff report.',
    });
  }
});

/**
 * POST /api/incidents/:id/medical-handoff/:reportId/review
 * Dispatcher approval or rejection gate. Every new version requires fresh approval.
 */
medicalHandoffRouter.post(
  '/:id/medical-handoff/:reportId/review',
  ...requireDispatcher,
  async (req: AuthRequest, res) => {
    try {
      const incident = await loadAuthorizedIncident(req, res);
      if (!incident) return;

      const decision = req.body?.decision === 'reject' ? 'reject' : req.body?.decision === 'approve' ? 'approve' : null;
      if (!decision) {
        return res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
      }

      const reviewNotes =
        typeof req.body?.reviewNotes === 'string' ? req.body.reviewNotes.trim().slice(0, 600) : undefined;

      const updated = await reviewMedicalHandoffReport({
        organizationId: getOrgId(req),
        incidentId: incident.id,
        incidentCode: incident.code,
        cellId: incident.cellId,
        reportId: req.params.reportId,
        decision,
        reviewerId: req.authContext?.uid || 'gg-dispatch-chennai',
        reviewerName: req.authContext?.displayName || 'Coastal Dispatch Control',
        reviewNotes,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Medical handoff report version not found.' });
      }

      return res.json({ report: updated });
    } catch (err: any) {
      console.error('POST review medical handoff failed:', err?.message);
      return res.status(500).json({ error: 'Unable to record dispatcher review.' });
    }
  }
);

/**
 * POST /api/incidents/:id/medical-handoff/:reportId/share
 * Publishes an APPROVED medical handoff notification to the Nexconn incident group.
 */
medicalHandoffRouter.post(
  '/:id/medical-handoff/:reportId/share',
  ...requireDispatcher,
  async (req: AuthRequest, res) => {
    try {
      const incident = await loadAuthorizedIncident(req, res);
      if (!incident) return;

      const orgId = getOrgId(req);
      const { reports } = await listMedicalHandoffsForIncident({
        organizationId: orgId,
        incidentId: incident.id,
        incidentCode: incident.code,
        cellId: incident.cellId,
      });

      const report = reports.find((r) => r.id === req.params.reportId);
      if (!report) {
        return res.status(404).json({ error: 'Medical handoff report not found.' });
      }
      if (report.status !== 'APPROVED') {
        return res.status(409).json({
          error: 'Dispatcher approval is required before sharing a medical handoff report.',
        });
      }
      if (!incident.nexconnGroupLive || !incident.nexconnGroupId) {
        return res.status(400).json({
          error: 'No live Nexconn incident group is linked to this incident yet.',
        });
      }

      const actorId = req.authContext?.nexconnUserId || 'gg-dispatch-chennai';
      const actorName = req.authContext?.displayName || 'Coastal Dispatch Control';

      const publishResult = await publishMedicalHandoffToNexconnGroup({
        groupId: incident.nexconnGroupId,
        fromUserId: actorId,
        reportId: report.id,
        incidentId: incident.id,
        incidentCode: incident.code,
        version: report.version,
        severity: report.severity,
        approvedByName: report.reviewedByName || actorName,
        summaryLine: report.payload.english.situation.whatHappened.slice(0, 180),
      });

      if (!publishResult.sent) {
        return res.status(502).json({
          error: publishResult.error || 'Failed to publish handoff to Nexconn incident group.',
        });
      }

      const updated = await markMedicalHandoffSharedToNexconn({
        organizationId: orgId,
        incidentId: incident.id,
        incidentCode: incident.code,
        cellId: incident.cellId,
        reportId: report.id,
        nexconnMessageId: publishResult.messageId,
        actorId,
        actorName,
      });

      return res.json({ report: updated, nexconnMessageId: publishResult.messageId });
    } catch (err: any) {
      console.error('POST share medical handoff failed:', err?.message);
      return res.status(500).json({ error: 'Unable to share medical handoff.' });
    }
  }
);

/**
 * POST /api/incidents/:id/medical-handoff/:reportId/public-link
 * Generates a cryptographically secure, time-limited, read-only 112 / Paramedic live link.
 * Blocked unless the target report version is APPROVED.
 */
medicalHandoffRouter.post(
  '/:id/medical-handoff/:reportId/public-link',
  ...requireDispatcher,
  async (req: AuthRequest, res) => {
    try {
      const incident = await loadAuthorizedIncident(req, res);
      if (!incident) return;

      const orgId = getOrgId(req);
      const { reports } = await listMedicalHandoffsForIncident({
        organizationId: orgId,
        incidentId: incident.id,
        incidentCode: incident.code,
        cellId: incident.cellId,
      });

      const report = reports.find((r) => r.id === req.params.reportId);
      if (!report) {
        return res.status(404).json({ error: 'Medical handoff report not found.' });
      }
      if (report.status !== 'APPROVED') {
        return res.status(409).json({
          error:
            'Dispatcher approval is required before generating a 112 / Paramedic live tracking link.',
        });
      }

      const expiresInMinutes =
        typeof req.body?.expiresInMinutes === 'number' && Number.isFinite(req.body.expiresInMinutes)
          ? req.body.expiresInMinutes
          : 120; // Default 2 hours

      const { rawToken, link } = await createPublicHandoffLink({
        organizationId: orgId,
        regionId: incident.regionId || null,
        incidentId: incident.id,
        reportId: report.id,
        reportVersion: report.version,
        createdByUserId: req.authContext?.uid || 'gg-dispatch-chennai',
        createdByName: req.authContext?.displayName || 'Coastal Dispatch Control',
        expiresInMinutes,
      });

      const envAppUrl = (process.env.APP_URL || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
        .replace(/\/+$/, '');
      const forwardedProto = req.header('x-forwarded-proto');
      const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol || 'https';
      const host = (req.header('x-forwarded-host') || req.get('host') || 'localhost:3000')
        .split(',')[0]
        .trim();
      const baseUrl =
        envAppUrl && envAppUrl !== 'MY_APP_URL' ? envAppUrl : `${proto}://${host}`;
      const publicUrl = `${baseUrl}/#/track/${rawToken}`;

      return res.status(201).json({
        link,
        token: rawToken,
        publicUrl,
        notice:
          'This read-only link shares approved handoff details and live assigned-responder GPS. It does NOT automatically contact 112 or dispatch an ambulance.',
      });
    } catch (err: any) {
      console.error('POST public-link failed:', err?.message);
      return res.status(500).json({ error: 'Unable to generate public tracking link.' });
    }
  }
);

/**
 * POST /api/incidents/:id/medical-handoff/links/:linkId/revoke
 * Immediately revokes an active public tracking link and halts live GPS sharing.
 */
medicalHandoffRouter.post(
  '/:id/medical-handoff/links/:linkId/revoke',
  ...requireDispatcher,
  async (req: AuthRequest, res) => {
    try {
      const incident = await loadAuthorizedIncident(req, res);
      if (!incident) return;

      const updated = await revokePublicHandoffLink({
        organizationId: getOrgId(req),
        incidentId: incident.id,
        linkId: req.params.linkId,
        revokedByUserId: req.authContext?.uid || 'gg-dispatch-chennai',
        revokedByName: req.authContext?.displayName || 'Coastal Dispatch Control',
      });

      if (!updated) {
        return res.status(404).json({ error: 'Public tracking link not found.' });
      }

      return res.json({ link: updated });
    } catch (err: any) {
      console.error('POST revoke public link failed:', err?.message);
      return res.status(500).json({ error: 'Unable to revoke public tracking link.' });
    }
  }
);

// ============================================================================
// Public Read-Only 112 / Paramedic Tracking Endpoint (Rate-Limited)
// ============================================================================

const PUBLIC_RATE_WINDOW_MS = 60_000;
const PUBLIC_RATE_MAX_REQUESTS = 40;
const publicRateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkPublicRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = publicRateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    publicRateBuckets.set(ip, { count: 1, resetAt: now + PUBLIC_RATE_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > PUBLIC_RATE_MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

publicHandoffRouter.get('/:token', async (req, res) => {
  // Strict security & privacy headers on every public response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const clientIp =
    (req.header('x-forwarded-for') || '').split(',')[0].trim() || req.ip || 'unknown';
  const rate = checkPublicRateLimit(clientIp);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return res.status(429).json({
      error: 'Rate limit exceeded for public tracking endpoint. Please retry shortly.',
    });
  }

  const rawToken = String(req.params.token || '').trim();
  if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
    return res.status(404).json({ error: 'Tracking link is invalid.' });
  }

  try {
    const resolved = await resolveAndTouchPublicHandoffToken(rawToken);
    if (resolved.status === 'not_found') {
      return res.status(404).json({ error: 'Tracking link not found.' });
    }
    if (resolved.status === 'revoked') {
      return res.status(410).json({ error: 'This tracking link has been revoked by dispatch.' });
    }
    if (resolved.status === 'expired') {
      return res.status(410).json({ error: 'This tracking link has expired.' });
    }
    if (resolved.status === 'unapproved') {
      return res.status(403).json({ error: 'Linked medical handoff is not approved for sharing.' });
    }

    const repo = getEmergencyRepository();
    const incident = await repo.getIncidentById(resolved.organizationId, resolved.incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Associated incident is no longer available.' });
    }

    const [responders, cells] = await Promise.all([
      repo.listResponders(resolved.organizationId, incident.regionId),
      repo.listRescueCells(resolved.organizationId, incident.regionId),
    ]);

    const assignedSet = new Set(incident.assignedResponderIds || []);
    const assignedResponders = responders.filter((r) => assignedSet.has(r.id));
    const cell = cells.find((c) => c.id === incident.cellId) || null;
    const env = resolved.report.payload.environmentalConditions;

    const rescueLat = incident.lat ?? cell?.lat ?? null;
    const rescueLon = incident.lon ?? cell?.lon ?? null;
    const primaryResponder = assignedResponders[0] || null;
    const hospitalContext = await getPublicHospitalContextForIncident(
      rescueLat,
      rescueLon,
      primaryResponder ? { lat: primaryResponder.lat, lon: primaryResponder.lon } : null
    );

    // Minimum-necessary read-only payload — zero internal DB IDs, PII, photos, or private chats
    const payload: PublicParamedicTrackingPayload = {
      incidentCode: incident.code,
      incidentStatus: incident.state,
      incidentCategory: incident.category,
      rescueCell: {
        cellId: incident.cellId,
        cellLabel: incident.cellLabel,
        siteName: incident.siteName,
        regionName: incident.regionName || cell?.regionName || 'Monitored Coastal Sector',
        vhfChannel: cell?.vhfChannel || 'VHF Ch 16',
        lat: cell?.lat ?? null,
        lon: cell?.lon ?? null,
        radiusMeters: cell?.radiusMeters ?? null,
      },
      rescueLocation: {
        lat: rescueLat,
        lon: rescueLon,
        locationSource: incident.locationSource,
      },
      respondersLiveGps: assignedResponders.map((r) => ({
        callsign: r.radioCallsign,
        availability: r.availability,
        lat: r.lat,
        lon: r.lon,
        updatedAt: incident.updatedAt,
      })),
      lastLocationUpdateAt: incident.updatedAt,
      hospitalContext,
      approvedSbar: {
        reportVersion: resolved.report.version,
        approvedAt: resolved.report.reviewedAt || resolved.report.generatedAt,
        approvedByName: resolved.report.reviewedByName || 'Coastal Dispatch Control',
        severity: resolved.report.severity,
        severityRationale: resolved.report.severityRationale,
        english: resolved.report.payload.english,
        tamil: resolved.report.payload.tamil,
        knownInformation: resolved.report.payload.knownInformation,
        unavailableInformation: resolved.report.payload.unavailableInformation,
      },
      environmentalHazards: {
        observationTime: env.observationTime,
        sources: env.sources,
        windSpeedKmh: env.windSpeedKmh,
        windDirectionDeg: env.windDirectionDeg,
        precipitationMm: env.precipitationMm,
        airTemperatureC: env.airTemperatureC,
        relativeHumidityPct: env.relativeHumidityPct,
        waveHeightM: env.waveHeightM,
        wavePeriodS: env.wavePeriodS,
        seaSurfaceTemperatureC: env.seaSurfaceTemperatureC,
        unavailableFields: env.unavailableFields,
      },
      linkMeta: {
        expiresAt: resolved.expiresAt,
        readOnly: true,
        disclaimer:
          'Read-only emergency handoff information link. This page does NOT automatically contact 112 or dispatch an ambulance. Paramedics must independently assess the patient.',
      },
    };

    return res.json(payload);
  } catch (err: any) {
    console.error('GET /api/public/handoff/:token failed:', err?.message);
    return res.status(500).json({ error: 'Unable to load tracking snapshot.' });
  }
});
