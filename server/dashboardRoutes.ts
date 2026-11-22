import express from 'express';
import { getEmergencyRepository } from '../src/db/repositories/index.ts';
import { isPostgresConfigured, createPool } from '../src/db/index.ts';
import {
  optionalAuth,
  requireRole,
  type AuthRequest,
} from '../src/middleware/auth.ts';
import { DEFAULT_ORGANIZATION_ID } from '../src/db/users.ts';
import { listOfficialAlertLogs } from './officialAlertService.ts';
import type { EmergencyCategory, EmergencyIncident, ResponderProfile } from '../src/types/emergency.ts';

export const dashboardRouter = express.Router();

const requireOperational = [optionalAuth, requireRole(['ORG_ADMIN', 'DISPATCHER', 'RESPONDER'])];

function getOrgId(req: AuthRequest): string {
  return req.authContext?.organizationId || DEFAULT_ORGANIZATION_ID;
}

function resolveDateWindow(query: express.Request['query']): {
  rangeKey: '24h' | '7d' | '30d' | 'custom';
  fromIso: string;
  toIso: string;
  daysSpan: number;
} {
  const now = new Date();
  const rangeParam = String(query.range || '30d').toLowerCase();

  if (rangeParam === 'custom') {
    const rawFrom = typeof query.from === 'string' ? new Date(query.from) : null;
    const rawTo = typeof query.to === 'string' ? new Date(query.to) : null;
    if (
      rawFrom &&
      rawTo &&
      !Number.isNaN(rawFrom.getTime()) &&
      !Number.isNaN(rawTo.getTime()) &&
      rawFrom.getTime() <= rawTo.getTime()
    ) {
      const daysSpan = Math.max(
        1,
        Math.ceil((rawTo.getTime() - rawFrom.getTime()) / (1000 * 60 * 60 * 24))
      );
      return {
        rangeKey: 'custom',
        fromIso: rawFrom.toISOString(),
        toIso: rawTo.toISOString(),
        daysSpan,
      };
    }
  }

  if (rangeParam === '24h') {
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { rangeKey: '24h', fromIso: from.toISOString(), toIso: now.toISOString(), daysSpan: 1 };
  }
  if (rangeParam === '7d') {
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { rangeKey: '7d', fromIso: from.toISOString(), toIso: now.toISOString(), daysSpan: 7 };
  }

  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { rangeKey: '30d', fromIso: from.toISOString(), toIso: now.toISOString(), daysSpan: 30 };
}

function isWithinRange(iso: string, fromMs: number, toMs: number): boolean {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return ts >= fromMs && ts <= toMs;
}

function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * GET /api/dashboard/overview
 * Server-side multi-tenant & region-scoped aggregation for Overview and Live Operations dashboards.
 * Strictly separates real operational incidents from simulated demonstration drills.
 */
dashboardRouter.get('/overview', ...requireOperational, async (req: AuthRequest, res) => {
  const orgId = getOrgId(req);
  const authorizedRegions = req.authContext?.authorizedRegionIds || [];
  const requestedRegionId =
    typeof req.query.regionId === 'string' && req.query.regionId.trim() && req.query.regionId !== 'all'
      ? req.query.regionId.trim()
      : undefined;

  if (
    requestedRegionId &&
    authorizedRegions.length > 0 &&
    !authorizedRegions.includes(requestedRegionId)
  ) {
    return res.status(403).json({
      error: 'Access denied: requested region is outside your authorized scope.',
    });
  }

  const beachFilter =
    typeof req.query.beach === 'string' && req.query.beach.trim() && req.query.beach !== 'all'
      ? req.query.beach.trim().toLowerCase()
      : undefined;
  const cellIdFilter =
    typeof req.query.cellId === 'string' && req.query.cellId.trim() && req.query.cellId !== 'all'
      ? req.query.cellId.trim()
      : undefined;
  const categoryFilter =
    typeof req.query.category === 'string' &&
    ['drowning', 'swept_away', 'missing_person', 'medical'].includes(req.query.category)
      ? (req.query.category as EmergencyCategory)
      : undefined;
  const includeSimulated = String(req.query.includeSimulated || 'false').toLowerCase() === 'true';

  const window = resolveDateWindow(req.query);
  const fromMs = new Date(window.fromIso).getTime();
  const toMs = new Date(window.toIso).getTime();

  try {
    const repo = getEmergencyRepository();
    const [allIncidentsRaw, respondersRaw, cells, regions] = await Promise.all([
      repo.listIncidents(orgId, 'all', requestedRegionId),
      repo.listResponders(orgId, requestedRegionId),
      repo.listRescueCells(orgId, requestedRegionId),
      repo.listRegions(orgId),
    ]);

    // Enforce authorized region list if present
    const regionScopedIncidents =
      authorizedRegions.length > 0
        ? allIncidentsRaw.filter(
            (i) => !i.regionId || authorizedRegions.includes(i.regionId)
          )
        : allIncidentsRaw;

    const regionScopedResponders =
      authorizedRegions.length > 0
        ? respondersRaw.filter(
            (r) => !r.regionId || authorizedRegions.includes(r.regionId)
          )
        : respondersRaw;

    // Separate real operational records from simulated demonstration drills
    const simulatedIncidents = regionScopedIncidents.filter((i) => i.isSimulated);
    const realIncidents = regionScopedIncidents.filter((i) => !i.isSimulated);
    const workingBase: EmergencyIncident[] = includeSimulated ? regionScopedIncidents : realIncidents;

    // Apply beach, rescue-cell, and incident-type filters consistently
    const filteredAllTime = workingBase.filter((inc) => {
      if (beachFilter && !(inc.siteName || '').toLowerCase().includes(beachFilter)) {
        return false;
      }
      if (cellIdFilter && inc.cellId !== cellIdFilter) {
        return false;
      }
      if (categoryFilter && inc.category !== categoryFilter) {
        return false;
      }
      return true;
    });

    const filteredInWindow = filteredAllTime.filter((inc) =>
      isWithinRange(inc.createdAt, fromMs, toMs)
    );

    const filteredResponders: ResponderProfile[] = regionScopedResponders.filter((r) => {
      if (cellIdFilter && r.homeCellId !== cellIdFilter) return false;
      if (beachFilter) {
        const cell = cells.find((c) => c.id === r.homeCellId);
        const matchStation = (r.station || '').toLowerCase().includes(beachFilter);
        const matchSite = (cell?.siteName || '').toLowerCase().includes(beachFilter);
        if (!matchStation && !matchSite) return false;
      }
      return true;
    });

    // Pending medical handoffs count (live DB query if Postgres active, else derived from incident states)
    let pendingMedicalHandoffs = filteredAllTime.filter(
      (i) => i.state === 'VICTIM_RECOVERED' || i.state === 'MEDICAL_HANDOFF'
    ).length;
    let draftHandoffReportsCount = 0;

    if (isPostgresConfigured() && process.env.USE_JSON_FALLBACK !== 'true') {
      try {
        const pool = createPool();
        const mhRes = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM medical_handoff_reports WHERE organization_id = $1 AND status = 'DRAFT_PENDING_REVIEW'`,
          [orgId]
        );
        draftHandoffReportsCount = mhRes.rows[0]?.cnt ?? 0;
        pendingMedicalHandoffs = Math.max(pendingMedicalHandoffs, draftHandoffReportsCount);
      } catch (err: any) {
        console.warn('Dashboard medical handoff count fallback:', err?.message);
      }
    }

    // Point-in-time KPIs
    const activeIncidents = filteredAllTime.filter(
      (i) => i.state !== 'RESOLVED' && i.state !== 'REJECTED'
    ).length;
    const unacknowledgedSosAlerts = filteredAllTime.filter(
      (i) => i.state === 'UNVERIFIED'
    ).length;
    const respondersOnDuty = filteredResponders.filter(
      (r) => r.availability !== 'off_duty'
    ).length;
    const respondersAssigned = filteredResponders.filter(
      (r) => Boolean(r.activeIncidentId) || r.availability === 'dispatched' || r.availability === 'on_scene'
    ).length;
    const respondersEnRoute = filteredAllTime.filter((i) => i.state === 'EN_ROUTE').length;

    // Windowed KPIs
    const totalIncidentsReported = filteredInWindow.length;
    const drowningInWindow = filteredInWindow.filter(
      (i) => i.category === 'drowning' || i.category === 'swept_away'
    );
    const totalDrowningIncidents = drowningInWindow.length;
    const criticalIncidents = filteredInWindow.filter(
      (i) => i.severity === 'critical'
    ).length;
    const incidentsResolved = filteredInWindow.filter(
      (i) => i.state === 'RESOLVED'
    ).length;

    // Drowning Statistics & Safety Trends
    const byBeachMap = new Map<
      string,
      { siteName: string; drowningCount: number; totalIncidents: number; criticalCount: number; resolvedCount: number }
    >();
    const byRegionMap = new Map<string, { regionId: string; regionName: string; drowningCount: number; totalIncidents: number }>();
    const byCellMap = new Map<string, { cellId: string; cellLabel: string; siteName: string; count: number; drowningCount: number }>();
    const severityDist = { critical: 0, high: 0, moderate: 0 };

    const dailyMap = new Map<string, { date: string; total: number; drowning: number; resolved: number }>();
    const weeklyMap = new Map<string, { week: string; total: number; drowning: number; resolved: number }>();

    // Pre-populate daily buckets for clean trend lines (up to 30 days)
    const bucketDays = Math.min(30, Math.max(1, window.daysSpan));
    for (let i = bucketDays - 1; i >= 0; i--) {
      const d = new Date(toMs - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, total: 0, drowning: 0, resolved: 0 });
    }

    for (const inc of filteredInWindow) {
      const isDrowning = inc.category === 'drowning' || inc.category === 'swept_away';
      const siteName = inc.siteName || 'Unspecified Coastal Sector';

      const b = byBeachMap.get(siteName) || {
        siteName,
        drowningCount: 0,
        totalIncidents: 0,
        criticalCount: 0,
        resolvedCount: 0,
      };
      b.totalIncidents += 1;
      if (isDrowning) b.drowningCount += 1;
      if (inc.severity === 'critical') b.criticalCount += 1;
      if (inc.state === 'RESOLVED') b.resolvedCount += 1;
      byBeachMap.set(siteName, b);

      const regKey = inc.regionId || 'unassigned';
      const regName =
        regions.find((r) => r.id === inc.regionId)?.name ||
        inc.regionName ||
        'Default Coastal Region';
      const rEntry = byRegionMap.get(regKey) || {
        regionId: regKey,
        regionName: regName,
        drowningCount: 0,
        totalIncidents: 0,
      };
      rEntry.totalIncidents += 1;
      if (isDrowning) rEntry.drowningCount += 1;
      byRegionMap.set(regKey, rEntry);

      const cellKey = inc.cellId || 'unknown';
      const cEntry = byCellMap.get(cellKey) || {
        cellId: cellKey,
        cellLabel: inc.cellLabel || cellKey,
        siteName,
        count: 0,
        drowningCount: 0,
      };
      cEntry.count += 1;
      if (isDrowning) cEntry.drowningCount += 1;
      byCellMap.set(cellKey, cEntry);

      if (inc.severity === 'critical') severityDist.critical += 1;
      else if (inc.severity === 'high') severityDist.high += 1;
      else severityDist.moderate += 1;

      const dayKey = inc.createdAt.slice(0, 10);
      const dayBucket = dailyMap.get(dayKey) || {
        date: dayKey,
        total: 0,
        drowning: 0,
        resolved: 0,
      };
      dayBucket.total += 1;
      if (isDrowning) dayBucket.drowning += 1;
      if (inc.state === 'RESOLVED') dayBucket.resolved += 1;
      dailyMap.set(dayKey, dayBucket);

      const weekKey = getIsoWeekKey(new Date(inc.createdAt));
      const weekBucket = weeklyMap.get(weekKey) || {
        week: weekKey,
        total: 0,
        drowning: 0,
        resolved: 0,
      };
      weekBucket.total += 1;
      if (isDrowning) weekBucket.drowning += 1;
      if (inc.state === 'RESOLVED') weekBucket.resolved += 1;
      weeklyMap.set(weekKey, weekBucket);
    }

    // Out-of-band alert logs summary (strictly separating SIMULATED vs real PROVIDER_ACCEPTED/SENT/DELIVERED)
    let alertLogsSummary = {
      simulatorMode: process.env.ENABLE_ALERT_SIMULATOR === 'true',
      totalLogged: 0,
      simulatedCount: 0,
      providerAcceptedCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
    };
    let orgAlertLogs: Awaited<ReturnType<typeof listOfficialAlertLogs>> = [];
    try {
      orgAlertLogs = await listOfficialAlertLogs(orgId);
      alertLogsSummary = {
        simulatorMode: process.env.ENABLE_ALERT_SIMULATOR === 'true',
        totalLogged: orgAlertLogs.length,
        simulatedCount: orgAlertLogs.filter((l) => l.status === 'SIMULATED').length,
        providerAcceptedCount: orgAlertLogs.filter((l) => l.status === 'PROVIDER_ACCEPTED').length,
        sentCount: orgAlertLogs.filter((l) => l.status === 'SENT').length,
        deliveredCount: orgAlertLogs.filter((l) => l.status === 'DELIVERED').length,
        failedCount: orgAlertLogs.filter((l) => l.status === 'FAILED').length,
      };
    } catch {
      // Non-fatal
    }

    // Genuine operational performance metrics derived strictly from recorded timestamps (never fabricated)
    const diffSeconds = (startIso?: string, endIso?: string): number | null => {
      if (!startIso || !endIso) return null;
      const a = new Date(startIso).getTime();
      const b = new Date(endIso).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
      return Math.round((b - a) / 1000);
    };
    const statsOrNull = (
      values: number[]
    ): { value: number | null; median: number | null; sampleSize: number } => {
      if (values.length === 0) return { value: null, median: null, sampleSize: 0 };
      const sum = values.reduce((acc, v) => acc + v, 0);
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const med =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      return {
        value: Math.round((sum / values.length) * 10) / 10,
        median: Math.round(med * 10) / 10,
        sampleSize: values.length,
      };
    };

    // Earliest official alert acknowledgement per incident (if any)
    const firstAlertAckByIncident = new Map<string, string>();
    for (const log of orgAlertLogs) {
      if (!log.incidentId || !log.acknowledgedAt) continue;
      const existing = firstAlertAckByIncident.get(log.incidentId);
      if (!existing || log.acknowledgedAt < existing) {
        firstAlertAckByIncident.set(log.incidentId, log.acknowledgedAt);
      }
    }

    const sosAckSamples = filteredInWindow
      .map((i) => {
        const ackTarget = firstAlertAckByIncident.get(i.id) || i.verifiedAt;
        return diffSeconds(i.createdAt, ackTarget);
      })
      .filter((v): v is number => v !== null);
    const sosVerificationSamples = filteredInWindow
      .map((i) => diffSeconds(i.createdAt, i.verifiedAt))
      .filter((v): v is number => v !== null);
    const assignmentSamples = filteredInWindow
      .map((i) => diffSeconds(i.verifiedAt, i.dispatchedAt))
      .filter((v): v is number => v !== null);
    const acceptanceSamples = filteredInWindow
      .map((i) => diffSeconds(i.dispatchedAt, i.acknowledgedAt))
      .filter((v): v is number => v !== null);
    const timeToSceneSamples = filteredInWindow
      .map((i) => diffSeconds(i.dispatchedAt, i.onSceneAt))
      .filter((v): v is number => v !== null);
    const resolutionSamples = filteredInWindow
      .map((i) => diffSeconds(i.createdAt, i.resolvedAt))
      .filter((v): v is number => v !== null);

    const realAlertLatencies = orgAlertLogs
      .filter((l) => !l.isSimulated && typeof l.deliveryDurationMs === 'number')
      .map((l) => l.deliveryDurationMs as number);
    const simAlertLatencies = orgAlertLogs
      .filter((l) => l.isSimulated && typeof l.deliveryDurationMs === 'number')
      .map((l) => l.deliveryDurationMs as number);

    const escalatedCount = filteredInWindow.filter(
      (i) => i.escalation?.escalated || i.auditTrail.some((e) => e.action === 'ESCALATION_TRIGGERED')
    ).length;

    const awaitingAcknowledgement = filteredAllTime.filter(
      (i) => i.state === 'UNVERIFIED'
    ).length;
    const awaitingResponderAssignment = filteredAllTime.filter(
      (i) =>
        (i.state === 'UNVERIFIED' || i.state === 'VERIFIED') &&
        i.assignedResponderIds.length === 0
    ).length;

    const operationalPerformance = {
      sosAcknowledgementSeconds: statsOrNull(sosAckSamples),
      sosVerificationSeconds: statsOrNull(sosVerificationSamples),
      responderAssignmentSeconds: statsOrNull(assignmentSamples),
      responderAcceptanceSeconds: statsOrNull(acceptanceSamples),
      timeToSceneSeconds: statsOrNull(timeToSceneSamples),
      incidentResolutionSeconds: statsOrNull(resolutionSamples),
      queueBacklog: {
        awaitingAcknowledgement,
        awaitingResponderAssignment,
        awaitingMedicalHandoff: pendingMedicalHandoffs,
      },
      officialAlertLatencyMs: {
        real: statsOrNull(realAlertLatencies),
        simulated: statsOrNull(simAlertLatencies),
      },
      notificationFailureRatePct:
        orgAlertLogs.length > 0
          ? {
              value: Math.round((alertLogsSummary.failedCount / orgAlertLogs.length) * 1000) / 10,
              sampleSize: orgAlertLogs.length,
            }
          : { value: null, sampleSize: 0 },
      escalationFrequencyPct:
        filteredInWindow.length > 0
          ? {
              value: Math.round((escalatedCount / filteredInWindow.length) * 1000) / 10,
              sampleSize: filteredInWindow.length,
            }
          : { value: null, sampleSize: 0 },
      dataScope: includeSimulated ? 'real_and_simulated' : 'real_only',
    };

    const storageMeta = repo.getStorageMeta();

    return res.json({
      organizationId: orgId,
      generatedAt: new Date().toISOString(),
      storage: storageMeta,
      appliedFilters: {
        range: window.rangeKey,
        from: window.fromIso,
        to: window.toIso,
        daysSpan: window.daysSpan,
        regionId: requestedRegionId || 'all',
        beach: beachFilter || 'all',
        cellId: cellIdFilter || 'all',
        category: categoryFilter || 'all',
        includeSimulated,
      },
      kpis: {
        pointInTime: {
          activeIncidents,
          unacknowledgedSosAlerts,
          respondersOnDuty,
          respondersAssigned,
          respondersEnRoute,
          pendingMedicalHandoffs,
          draftHandoffReportsCount,
        },
        windowed: {
          totalIncidentsReported,
          totalDrowningIncidents,
          criticalIncidents,
          incidentsResolved,
          drowningFrequencyPerDay:
            Math.round((totalDrowningIncidents / Math.max(1, window.daysSpan)) * 100) / 100,
        },
        simulatedExcludedCount: includeSimulated ? 0 : simulatedIncidents.length,
        simulatedTotalCount: simulatedIncidents.length,
      },
      operationalPerformance,
      drowningStats: {
        totalDrowningIncidents,
        byBeach: Array.from(byBeachMap.values()).sort(
          (a, b) => b.drowningCount - a.drowningCount || b.totalIncidents - a.totalIncidents
        ),
        byRegion: Array.from(byRegionMap.values()).sort(
          (a, b) => b.drowningCount - a.drowningCount
        ),
        frequentlyAffectedCells: Array.from(byCellMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        dailyTrend: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        weeklyTrend: Array.from(weeklyMap.values()).sort((a, b) => a.week.localeCompare(b.week)),
        severityDistribution: severityDist,
        exposureAdjustedRate: {
          available: false,
          denominatorSource: null,
          reason:
            'No verified beach visitor-count denominator is connected. Showing absolute incident counts and period frequency only; never using incidents as a denominator or fabricating visitor counts.',
        },
      },
      alertLogsSummary,
      regions,
      cells,
      responders: filteredResponders,
      recentIncidents: filteredInWindow.slice(0, 25),
    });
  } catch (error: any) {
    console.error('GET /api/dashboard/overview failed:', error?.message);
    return res.status(500).json({ error: 'Unable to aggregate dashboard overview metrics.' });
  }
});
