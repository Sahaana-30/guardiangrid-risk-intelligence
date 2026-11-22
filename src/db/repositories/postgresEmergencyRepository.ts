import { randomUUID } from 'crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../index.ts';
import {
  incidentEvents,
  incidents,
  nexconnChannels,
  regions,
  rescueCells,
  responderLocations,
  users,
} from '../schema.ts';
import { DEFAULT_ORGANIZATION_ID, ensureDefaultOrganization } from '../users.ts';
import { ALLOWED_TRANSITIONS, haversineMeters } from '../../../server/emergencyStore.ts';
import {
  ALL_INDIA_RESCUE_CELLS,
  CHENNAI_RESCUE_CELLS,
  INDIA_REGIONS,
  INITIAL_SIMULATED_RESPONDERS,
} from '../../../server/emergencyData.ts';
import type {
  AllocationFactor,
  AuditEvent,
  EmergencyCategory,
  EmergencyIncident,
  EmergencySeverity,
  EmergencyStorageMeta,
  EscalationState,
  IncidentState,
  LostChildDetails,
  PublicSOSPayload,
  RankedResponder,
  RegionSummary,
  RescueCell,
  ResponderAvailability,
  ResponderProfile,
} from '../../types/emergency.ts';
import type { IEmergencyRepository, IncidentScope } from './types.ts';

const POSTGRES_STORAGE_META: EmergencyStorageMeta = {
  mechanism: 'Multi-tenant, multi-region PostgreSQL repository (Drizzle ORM)',
  persistenceScope: 'Durable relational storage across sessions, regions, and restarts',
  multiSessionShared: true,
  restartLimitation: 'Persists durably in hosted PostgreSQL (Cloud SQL / Supabase / Neon).',
};

const seededOrgs = new Set<string>();

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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
  return 'high';
}

function resolveRegionPk(organizationId: string, baseRegionId: string): string {
  return organizationId === DEFAULT_ORGANIZATION_ID
    ? baseRegionId
    : `${organizationId}:${baseRegionId}`;
}

async function ensureOrganizationSeeded(organizationId: string): Promise<void> {
  if (seededOrgs.has(organizationId)) return;

  try {
    await ensureDefaultOrganization(organizationId);

    // 1. Seed geographical regions idempotently (globally unique IDs, org-scoped unique codes)
    for (const reg of INDIA_REGIONS) {
      const regionPk = resolveRegionPk(organizationId, reg.id);
      await db
        .insert(regions)
        .values({
          id: regionPk,
          organizationId,
          code: reg.code,
          slug: reg.slug,
          name: reg.name,
          stateOrTerritory: reg.stateOrTerritory,
          country: reg.country,
          lat: reg.lat,
          lon: reg.lon,
          vhfChannel: reg.vhfChannel,
          isActive: reg.isActive,
        })
        .onConflictDoNothing();
    }

    // 2. Seed rescue cells additively (never overwriting existing Chennai cells)
    for (const cell of ALL_INDIA_RESCUE_CELLS) {
      const cellPk =
        organizationId === DEFAULT_ORGANIZATION_ID ? cell.id : `${organizationId}:${cell.id}`;
      const regionPk = cell.regionId
        ? resolveRegionPk(organizationId, cell.regionId)
        : resolveRegionPk(organizationId, 'reg-india-chennai');

      await db
        .insert(rescueCells)
        .values({
          id: cellPk,
          organizationId,
          regionId: regionPk,
          regionName: cell.regionName || 'Chennai, Tamil Nadu',
          cellCode: cell.id,
          siteId: cell.siteId,
          siteName: cell.siteName,
          label: cell.label,
          labelTa: cell.labelTa,
          towerName: cell.towerName,
          lat: cell.lat,
          lon: cell.lon,
          radiusMeters: cell.radiusMeters,
          vhfChannel: cell.vhfChannel,
          accessLandmark: cell.accessLandmark,
          isProposed: Boolean(cell.isProposed),
        })
        .onConflictDoNothing();
    }

    // 3. Seed baseline responders & responder_locations idempotently
    const existingResponders = await db
      .select({ id: responderLocations.id })
      .from(responderLocations)
      .where(eq(responderLocations.organizationId, organizationId))
      .limit(1);

    if (existingResponders.length === 0) {
      const allOrgRegionIds = INDIA_REGIONS.map((r) => resolveRegionPk(organizationId, r.id));
      for (const resp of INITIAL_SIMULATED_RESPONDERS) {
        const uid =
          organizationId === DEFAULT_ORGANIZATION_ID ? resp.id : `${organizationId}:${resp.id}`;
        const regionPk = resolveRegionPk(organizationId, resp.regionId || 'reg-india-chennai');

        await db
          .insert(users)
          .values({
            uid,
            organizationId,
            defaultRegionId: regionPk,
            authorizedRegionIdsJson: JSON.stringify(allOrgRegionIds),
            email: `${resp.id}@${organizationId}.guardiangrid.local`,
            displayName: resp.name,
            role: 'RESPONDER',
            nexconnUserId: resp.nexconnUserId,
            station: resp.station,
            qualificationsJson: JSON.stringify(resp.qualifications),
            homeCellId: resp.homeCellId,
            radioCallsign: resp.radioCallsign,
            isSimulated: resp.isSimulated,
          })
          .onConflictDoNothing({ target: users.uid });

        await db
          .insert(responderLocations)
          .values({
            id: `loc-${uid}`,
            organizationId,
            regionId: regionPk,
            responderId: uid,
            lat: resp.lat,
            lon: resp.lon,
            availability: resp.availability,
            activeIncidentId: resp.activeIncidentId,
          })
          .onConflictDoNothing({ target: responderLocations.responderId });
      }
    }

    seededOrgs.add(organizationId);
  } catch (error) {
    throw new Error('Failed to initialize multi-region organization baseline data.', {
      cause: error,
    });
  }
}

function mapIncidentRow(
  row: typeof incidents.$inferSelect,
  events: Array<typeof incidentEvents.$inferSelect>,
  channel?: typeof nexconnChannels.$inferSelect
): EmergencyIncident {
  const auditTrail: AuditEvent[] = events.map((e) => ({
    id: e.id,
    timestamp: e.timestamp.toISOString(),
    actorId: e.actorId,
    actorName: e.actorName,
    actorRole: e.actorRole as AuditEvent['actorRole'],
    action: e.action,
    fromState: (e.fromState as IncidentState | null) || undefined,
    toState: (e.toState as IncidentState | null) || undefined,
    summary: e.summary,
  }));

  const hasCoords = typeof row.lat === 'number' && typeof row.lon === 'number';
  const locationQuality: EmergencyIncident['locationQuality'] =
    row.locationSource === 'gps' && hasCoords
      ? typeof row.gpsAccuracyMeters === 'number' && row.gpsAccuracyMeters > 150
        ? 'low_accuracy_gps'
        : 'verified_gps'
      : row.locationSource === 'cell_qr'
        ? 'cell_qr_only'
        : 'missing_gps';

  return {
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    regionId: row.regionId || undefined,
    regionName: row.regionName || undefined,
    clientRequestId: row.clientRequestId || undefined,
    category: row.category as EmergencyCategory,
    severity: row.severity as EmergencySeverity,
    state: row.state as IncidentState,
    isSimulated: row.isSimulated,
    language: row.language === 'ta' ? 'ta' : 'en',
    description: row.description,
    reporterNameMasked: row.reporterNameMasked || undefined,
    reporterPhoneMasked: row.reporterPhoneMasked || undefined,
    lostChildDetails: safeJsonParse<LostChildDetails | undefined>(row.lostChildDetailsJson, undefined),
    cellId: row.cellId,
    cellLabel: row.cellLabel,
    siteId: row.siteId,
    siteName: row.siteName,
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    gpsAccuracyMeters: row.gpsAccuracyMeters ?? null,
    locationSource: (row.locationSource as EmergencyIncident['locationSource']) || 'manual',
    locationQuality,
    hasPhotoAttachment: row.hasPhotoAttachment,
    photoDataUrl: row.photoDataUrl || undefined,
    hasVoiceNote: row.hasVoiceNote,
    voiceTranscript: row.voiceTranscript || undefined,
    assignedResponderIds: safeJsonParse<string[]>(row.assignedResponderIdsJson, []),
    assignedResponderNames: safeJsonParse<string[]>(row.assignedResponderNamesJson, []),
    nexconnGroupId: channel?.channelId ?? null,
    nexconnGroupName: channel?.channelName ?? null,
    nexconnGroupLive: channel?.isLive ?? false,
    nexconnGroupError: channel?.errorMessage ?? null,
    escalation: safeJsonParse<EscalationState | null>(row.escalationJson, null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : undefined,
    verifiedBy: row.verifiedBy || undefined,
    dispatchedAt: row.dispatchedAt ? row.dispatchedAt.toISOString() : undefined,
    acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : undefined,
    enRouteAt: row.enRouteAt ? row.enRouteAt.toISOString() : undefined,
    onSceneAt: row.onSceneAt ? row.onSceneAt.toISOString() : undefined,
    victimRecoveredAt: row.victimRecoveredAt ? row.victimRecoveredAt.toISOString() : undefined,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : undefined,
    closureSummary: row.closureSummary || undefined,
    auditTrail,
  };
}

export class PostgresEmergencyRepository implements IEmergencyRepository {
  getStorageMeta(): EmergencyStorageMeta {
    return POSTGRES_STORAGE_META;
  }

  async listRegions(organizationId: string): Promise<RegionSummary[]> {
    await ensureOrganizationSeeded(organizationId);
    try {
      const rows = await db
        .select()
        .from(regions)
        .where(eq(regions.organizationId, organizationId))
        .orderBy(asc(regions.name));

      return rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        code: r.code,
        slug: r.slug,
        name: r.name,
        stateOrTerritory: r.stateOrTerritory,
        country: r.country,
        lat: r.lat,
        lon: r.lon,
        vhfChannel: r.vhfChannel,
        isActive: r.isActive,
      }));
    } catch (error) {
      throw new Error('Failed to load organization regions.', { cause: error });
    }
  }

  async listRescueCells(organizationId: string, regionId?: string): Promise<RescueCell[]> {
    await ensureOrganizationSeeded(organizationId);
    try {
      const conditions = [eq(rescueCells.organizationId, organizationId)];
      if (regionId) {
        conditions.push(eq(rescueCells.regionId, regionId));
      }

      const rows = await db
        .select()
        .from(rescueCells)
        .where(and(...conditions))
        .orderBy(asc(rescueCells.isProposed), asc(rescueCells.cellCode));

      return rows.map((r) => ({
        id: r.cellCode,
        regionId: r.regionId || undefined,
        regionName: r.regionName,
        siteId: r.siteId,
        siteName: r.siteName,
        label: r.label,
        labelTa: r.labelTa,
        towerName: r.towerName,
        lat: r.lat,
        lon: r.lon,
        radiusMeters: r.radiusMeters,
        vhfChannel: r.vhfChannel,
        accessLandmark: r.accessLandmark,
        isProposed: r.isProposed,
      }));
    } catch (error) {
      throw new Error('Failed to load rescue cells.', { cause: error });
    }
  }

  private async resolveCell(
    organizationId: string,
    cellId?: string,
    lat?: number | null,
    lon?: number | null
  ): Promise<RescueCell> {
    const cells = await this.listRescueCells(organizationId);
    if (cellId) {
      const exact = cells.find((c) => c.id.toUpperCase() === cellId.toUpperCase());
      if (exact) return exact;
    }
    if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
      let best = cells[0];
      let bestDist = Infinity;
      for (const cell of cells) {
        const d = haversineMeters(lat, lon, cell.lat, cell.lon);
        if (d < bestDist) {
          bestDist = d;
          best = cell;
        }
      }
      return best;
    }
    return cells[0] || CHENNAI_RESCUE_CELLS[0];
  }

  async listResponders(organizationId: string, regionId?: string): Promise<ResponderProfile[]> {
    await ensureOrganizationSeeded(organizationId);
    try {
      const conditions = [
        eq(users.organizationId, organizationId),
        eq(users.role, 'RESPONDER'),
      ];
      if (regionId) {
        conditions.push(eq(responderLocations.regionId, regionId));
      }

      const rows = await db
        .select({
          user: users,
          loc: responderLocations,
        })
        .from(users)
        .innerJoin(responderLocations, eq(users.uid, responderLocations.responderId))
        .where(and(...conditions));

      return rows.map(({ user, loc }) => ({
        id: user.uid,
        regionId: loc.regionId || user.defaultRegionId || undefined,
        name: user.displayName,
        role: user.station || 'Coastal Responder',
        station: user.station || 'Coastal Rescue Tower',
        nexconnUserId: user.nexconnUserId || user.uid,
        qualifications: safeJsonParse<string[]>(user.qualificationsJson, []),
        availability: (loc.availability as ResponderAvailability) || 'available',
        homeCellId: user.homeCellId || 'MARINA-C1',
        lat: loc.lat,
        lon: loc.lon,
        locationUpdatedAt: loc.updatedAt ? loc.updatedAt.toISOString() : undefined,
        activeIncidentId: loc.activeIncidentId ?? null,
        radioCallsign: user.radioCallsign || 'VHF Ch 16',
        isSimulated: user.isSimulated,
      }));
    } catch (error) {
      throw new Error('Failed to load responders.', { cause: error });
    }
  }

  private async evaluateEscalations(organizationId?: string): Promise<EmergencyIncident[]> {
    try {
      const stateFilter = inArray(incidents.state, ['UNVERIFIED', 'DISPATCHED']);
      const rows = await db
        .select()
        .from(incidents)
        .where(
          organizationId
            ? and(eq(incidents.organizationId, organizationId), stateFilter)
            : stateFilter
        );

      const now = Date.now();
      const newlyEscalatedByOrg = new Map<string, Array<typeof incidents.$inferSelect>>();

      for (const row of rows) {
        if (row.state === 'DISPATCHED' && row.acknowledgedAt) continue;
        if (!row.escalationJson) continue;
        const escalation = safeJsonParse<EscalationState | null>(row.escalationJson, null);
        if (!escalation || !escalation.active || escalation.escalated) continue;

        const deadlineMs = new Date(escalation.deadlineIso).getTime();
        if (Number.isFinite(deadlineMs) && now >= deadlineMs) {
          const escalatedAt = new Date(now);
          escalation.escalated = true;
          escalation.escalatedAt = escalatedAt.toISOString();

          await db
            .update(incidents)
            .set({
              escalationJson: JSON.stringify(escalation),
              updatedAt: escalatedAt,
            })
            .where(and(eq(incidents.id, row.id), eq(incidents.organizationId, row.organizationId)));

          const summary =
            row.state === 'UNVERIFIED' || escalation.stage === 'unverified_sos'
              ? `No official verification within ${escalation.timeoutSeconds}s. Unverified SOS escalated to duty supervisor & backup officials.`
              : escalation.backupResponderName
                ? `No acknowledgement within ${escalation.timeoutSeconds}s. Backup responder ${escalation.backupResponderName} flagged for dispatcher escalation.`
                : `No acknowledgement within ${escalation.timeoutSeconds}s. Backup escalation flagged for dispatcher review.`;

          await db.insert(incidentEvents).values({
            id: `evt-${randomUUID().slice(0, 8)}`,
            organizationId: row.organizationId,
            incidentId: row.id,
            timestamp: escalatedAt,
            actorId: 'system-escalation',
            actorName: 'Escalation Monitor',
            actorRole: 'system',
            action: 'ESCALATION_TRIGGERED',
            fromState: row.state,
            toState: row.state,
            summary,
          });

          const list = newlyEscalatedByOrg.get(row.organizationId) || [];
          list.push({ ...row, escalationJson: JSON.stringify(escalation), updatedAt: escalatedAt });
          newlyEscalatedByOrg.set(row.organizationId, list);
        }
      }

      const hydrated: EmergencyIncident[] = [];
      for (const [orgId, orgRows] of newlyEscalatedByOrg.entries()) {
        const items = await this.hydrateIncidents(orgId, orgRows);
        hydrated.push(...items);
      }
      return hydrated;
    } catch (error) {
      throw new Error('Failed to evaluate incident escalations.', { cause: error });
    }
  }

  async sweepEscalations(organizationId?: string): Promise<EmergencyIncident[]> {
    return this.evaluateEscalations(organizationId);
  }

  private async hydrateIncidents(
    organizationId: string,
    rows: Array<typeof incidents.$inferSelect>
  ): Promise<EmergencyIncident[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [eventRows, channelRows] = await Promise.all([
      db
        .select()
        .from(incidentEvents)
        .where(
          and(eq(incidentEvents.organizationId, organizationId), inArray(incidentEvents.incidentId, ids))
        )
        .orderBy(asc(incidentEvents.timestamp)),
      db
        .select()
        .from(nexconnChannels)
        .where(
          and(eq(nexconnChannels.organizationId, organizationId), inArray(nexconnChannels.incidentId, ids))
        ),
    ]);

    const eventsByIncident = new Map<string, Array<typeof incidentEvents.$inferSelect>>();
    for (const ev of eventRows) {
      const list = eventsByIncident.get(ev.incidentId) || [];
      list.push(ev);
      eventsByIncident.set(ev.incidentId, list);
    }

    const channelByIncident = new Map<string, typeof nexconnChannels.$inferSelect>();
    for (const ch of channelRows) {
      channelByIncident.set(ch.incidentId, ch);
    }

    return rows.map((row) =>
      mapIncidentRow(row, eventsByIncident.get(row.id) || [], channelByIncident.get(row.id))
    );
  }

  async listIncidents(
    organizationId: string,
    scope: IncidentScope = 'all',
    regionId?: string
  ): Promise<EmergencyIncident[]> {
    await ensureOrganizationSeeded(organizationId);
    await this.evaluateEscalations(organizationId);

    try {
      const conditions = [eq(incidents.organizationId, organizationId)];
      if (scope === 'real') conditions.push(eq(incidents.isSimulated, false));
      if (scope === 'simulated') conditions.push(eq(incidents.isSimulated, true));
      if (regionId) conditions.push(eq(incidents.regionId, regionId));

      const rows = await db
        .select()
        .from(incidents)
        .where(and(...conditions))
        .orderBy(desc(incidents.createdAt));

      return await this.hydrateIncidents(organizationId, rows);
    } catch (error) {
      throw new Error('Failed to load incidents.', { cause: error });
    }
  }

  async getIncidentById(
    organizationId: string,
    id: string
  ): Promise<EmergencyIncident | undefined> {
    await ensureOrganizationSeeded(organizationId);
    await this.evaluateEscalations(organizationId);

    try {
      const rows = await db
        .select()
        .from(incidents)
        .where(and(eq(incidents.organizationId, organizationId), eq(incidents.id, id)))
        .limit(1);

      if (rows.length === 0) return undefined;
      const [hydrated] = await this.hydrateIncidents(organizationId, rows);
      return hydrated;
    } catch (error) {
      throw new Error('Failed to load incident details.', { cause: error });
    }
  }

  async createPublicSOS(
    organizationId: string,
    payload: PublicSOSPayload,
    options?: { isSimulated?: boolean; actorName?: string; escalationTimeoutSeconds?: number }
  ): Promise<{ incident: EmergencyIncident; cell: RescueCell; deduplicated: boolean; qrCellValid: boolean }> {
    await ensureOrganizationSeeded(organizationId);
    const isSimulated = Boolean(options?.isSimulated);

    try {
      if (payload.clientRequestId) {
        const existingRows = await db
          .select()
          .from(incidents)
          .where(
            and(
              eq(incidents.organizationId, organizationId),
              eq(incidents.clientRequestId, payload.clientRequestId)
            )
          )
          .limit(1);

        if (existingRows.length > 0) {
          const [existing] = await this.hydrateIncidents(organizationId, existingRows);
          const matchedCell = await this.resolveCell(
            organizationId,
            existing.cellId,
            existing.lat,
            existing.lon
          );
          return { incident: existing, cell: matchedCell, deduplicated: true, qrCellValid: true };
        }
      }

      const allCells = await this.listRescueCells(organizationId);
      const qrCellValid = payload.cellId
        ? allCells.some((c) => c.id.toUpperCase() === payload.cellId!.toUpperCase())
        : true;
      const cell = await this.resolveCell(organizationId, payload.cellId, payload.lat, payload.lon);
      const now = new Date();
      const id = `inc-${randomUUID().slice(0, 8)}`;
      const codePrefix = isSimulated ? 'SIM-SOS' : 'GG-SOS';
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const code = `${codePrefix}-${suffix}`;

      const safePhoto =
        typeof payload.photoDataUrl === 'string' &&
        payload.photoDataUrl.startsWith('data:image/') &&
        payload.photoDataUrl.length <= 450_000
          ? payload.photoDataUrl
          : null;

      const hasValidGps =
        typeof payload.lat === 'number' &&
        typeof payload.lon === 'number' &&
        Number.isFinite(payload.lat) &&
        Number.isFinite(payload.lon);
      const locationSource = payload.locationSource || (payload.cellId && qrCellValid ? 'cell_qr' : hasValidGps ? 'gps' : 'manual');

      const escalationTimeoutSeconds =
        typeof options?.escalationTimeoutSeconds === 'number' && options.escalationTimeoutSeconds > 0
          ? Math.max(15, Math.min(600, Math.round(options.escalationTimeoutSeconds)))
          : null;
      const initialEscalation: EscalationState | null = escalationTimeoutSeconds
        ? {
            active: true,
            stage: 'unverified_sos',
            timeoutSeconds: escalationTimeoutSeconds,
            deadlineIso: new Date(now.getTime() + escalationTimeoutSeconds * 1000).toISOString(),
            backupResponderId: null,
            backupResponderName: 'Duty Supervisor / Secondary Official Channel',
            escalated: false,
          }
        : null;

      await db.insert(incidents).values({
        id,
        organizationId,
        regionId: cell.regionId || resolveRegionPk(organizationId, 'reg-india-chennai'),
        regionName: cell.regionName || 'Chennai, Tamil Nadu',
        code,
        clientRequestId: payload.clientRequestId || null,
        category: payload.category,
        severity: defaultSeverityForCategory(payload.category),
        state: 'UNVERIFIED',
        isSimulated,
        language: payload.language === 'ta' ? 'ta' : 'en',
        description: payload.description.trim().slice(0, 1000),
        reporterNameMasked: maskReporterName(payload.reporterName) || null,
        reporterPhoneMasked: maskPhone(payload.reporterPhone) || null,
        lostChildDetailsJson:
          payload.category === 'missing_person' && payload.lostChildDetails
            ? JSON.stringify(payload.lostChildDetails)
            : null,
        cellId: cell.id,
        cellLabel: cell.label,
        siteId: cell.siteId,
        siteName: cell.siteName,
        lat: hasValidGps ? payload.lat! : cell.lat,
        lon: hasValidGps ? payload.lon! : cell.lon,
        gpsAccuracyMeters:
          typeof payload.gpsAccuracyMeters === 'number' && Number.isFinite(payload.gpsAccuracyMeters)
            ? Math.round(payload.gpsAccuracyMeters)
            : null,
        locationSource,
        hasPhotoAttachment: Boolean(safePhoto),
        photoDataUrl: safePhoto,
        hasVoiceNote: Boolean(payload.hasVoiceNote || payload.voiceTranscript),
        voiceTranscript: payload.voiceTranscript?.trim().slice(0, 600) || null,
        assignedResponderIdsJson: '[]',
        assignedResponderNamesJson: '[]',
        escalationJson: initialEscalation ? JSON.stringify(initialEscalation) : null,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(incidentEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        organizationId,
        incidentId: id,
        timestamp: now,
        actorId: isSimulated ? 'sim-digital-twin' : 'public-sos',
        actorName:
          options?.actorName || (isSimulated ? 'Rescue Digital Twin (Simulated)' : 'Public SOS Reporter'),
        actorRole: isSimulated ? 'system' : 'public',
        action: 'SOS_REPORTED',
        toState: 'UNVERIFIED',
        summary: `${isSimulated ? '[SIMULATED] ' : ''}SOS received (${payload.category.replace('_', ' ')}) at ${cell.id} (${cell.siteName}).${!qrCellValid && payload.cellId ? ` Unrecognized QR cell "${payload.cellId}" fell back to ${cell.id}.` : ''} Awaiting mandatory human dispatcher verification.`,
      });

      const created = await this.getIncidentById(organizationId, id);
      if (!created) {
        throw new Error('Unable to read newly created incident.');
      }
      return {
        incident: { ...created, qrCellValid },
        cell,
        deduplicated: false,
        qrCellValid,
      };
    } catch (error) {
      throw new Error('Failed to record emergency SOS report.', { cause: error });
    }
  }

  async verifyIncident(params: {
    organizationId: string;
    incidentId: string;
    decision: 'verify' | 'reject';
    dispatcherId: string;
    dispatcherName: string;
    notes?: string;
  }): Promise<EmergencyIncident> {
    const incident = await this.getIncidentById(params.organizationId, params.incidentId);
    if (!incident) {
      throw new Error('Incident not found.');
    }

    const targetState: IncidentState = params.decision === 'verify' ? 'VERIFIED' : 'REJECTED';
    if (!ALLOWED_TRANSITIONS[incident.state].includes(targetState)) {
      throw new Error(`Invalid state transition from ${incident.state} to ${targetState}.`);
    }

    const prev = incident.state;
    const now = new Date();

    const clearedEscalation =
      incident.escalation && incident.escalation.stage === 'unverified_sos'
        ? { ...incident.escalation, active: false }
        : incident.escalation;

    try {
      await db
        .update(incidents)
        .set({
          state: targetState,
          updatedAt: now,
          escalationJson: clearedEscalation ? JSON.stringify(clearedEscalation) : null,
          ...(targetState === 'VERIFIED'
            ? { verifiedAt: now, verifiedBy: params.dispatcherName }
            : {
                resolvedAt: now,
                closureSummary:
                  params.notes?.trim() || 'Marked as false alarm / rejected by dispatcher.',
              }),
        })
        .where(
          and(
            eq(incidents.id, params.incidentId),
            eq(incidents.organizationId, params.organizationId)
          )
        );

      await db.insert(incidentEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
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
      });

      const updated = await this.getIncidentById(params.organizationId, params.incidentId);
      if (!updated) throw new Error('Incident not found after update.');
      return updated;
    } catch (error) {
      throw new Error('Failed to verify incident.', { cause: error });
    }
  }

  async attachNexconnGroupToIncident(params: {
    organizationId: string;
    incidentId: string;
    groupId: string | null;
    groupName: string;
    live: boolean;
    errorMessage?: string | null;
    actorId: string;
    actorName: string;
    memberUserIds?: string[];
  }): Promise<EmergencyIncident> {
    const incident = await this.getIncidentById(params.organizationId, params.incidentId);
    if (!incident) {
      throw new Error('Incident not found.');
    }

    const now = new Date();
    try {
      await db
        .insert(nexconnChannels)
        .values({
          id: `nxc-${randomUUID().slice(0, 8)}`,
          organizationId: params.organizationId,
          incidentId: params.incidentId,
          channelId: params.groupId,
          channelName: params.groupName,
          ownerUserId: params.actorId,
          memberUserIdsJson: JSON.stringify(params.memberUserIds || []),
          isLive: params.live,
          errorMessage: params.errorMessage || null,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: nexconnChannels.incidentId,
          set: {
            channelId: params.groupId,
            channelName: params.groupName,
            ownerUserId: params.actorId,
            memberUserIdsJson: JSON.stringify(params.memberUserIds || []),
            isLive: params.live,
            errorMessage: params.errorMessage || null,
          },
        });

      await db
        .update(incidents)
        .set({ updatedAt: now })
        .where(
          and(
            eq(incidents.id, params.incidentId),
            eq(incidents.organizationId, params.organizationId)
          )
        );

      await db.insert(incidentEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: 'system',
        action: params.live ? 'NEXCONN_GROUP_CREATED' : 'NEXCONN_GROUP_FAILED',
        fromState: incident.state,
        toState: incident.state,
        summary: params.live
          ? `Nexconn incident group "${params.groupName}" (${params.groupId}) created via official Nexconn Server SDK.`
          : `Nexconn incident group creation did not complete: ${params.errorMessage || 'Unknown error'}. Use VHF/phone fallback.`,
      });

      const updated = await this.getIncidentById(params.organizationId, params.incidentId);
      if (!updated) throw new Error('Incident not found after channel update.');
      return updated;
    } catch (error) {
      throw new Error('Failed to record Nexconn incident channel.', { cause: error });
    }
  }

  async rankRespondersForIncident(
    organizationId: string,
    incidentId: string
  ): Promise<RankedResponder[]> {
    const incident = await this.getIncidentById(organizationId, incidentId);
    if (!incident) {
      throw new Error('Incident not found.');
    }

    const responders = await this.listResponders(organizationId);
    const cell = await this.resolveCell(organizationId, incident.cellId);
    const targetLat = incident.lat ?? cell.lat;
    const targetLon = incident.lon ?? cell.lon;

    const requiredKeywords: Record<EmergencyCategory, string[]> = {
      drowning: ['Surf Rescue', 'CPR/AED', 'Rip Current'],
      swept_away: ['Surf Rescue', 'Jet-Ski', 'Rip Current'],
      missing_person: ['Child Search', 'Missing Person', 'Tamil'],
      medical: ['CPR/AED', 'First Aid', 'Medical Handoff'],
    };
    const desired = requiredKeywords[incident.category];

    const ranked = responders.map((responder): RankedResponder => {
      const distanceMeters = haversineMeters(targetLat, targetLon, responder.lat, responder.lon);
      const estimatedEtaMinutes = Math.max(1, Math.round(distanceMeters / 160));
      const locAgeMs = responder.locationUpdatedAt
        ? Date.now() - new Date(responder.locationUpdatedAt).getTime()
        : Number.POSITIVE_INFINITY;
      const isStaleLocation = !Number.isFinite(locAgeMs) || locAgeMs > 15 * 60 * 1000;
      const rawDistancePoints = Math.max(5, Math.round(40 * Math.max(0, 1 - distanceMeters / 8000)));
      const distancePoints = isStaleLocation ? Math.max(5, rawDistancePoints - 6) : rawDistancePoints;
      const availabilityPoints =
        responder.availability === 'available'
          ? 30
          : responder.availability === 'dispatched'
            ? 10
            : responder.availability === 'on_scene'
              ? 5
              : 0;
      const matchedQuals = responder.qualifications.filter((q) =>
        desired.some((k) => q.toLowerCase().includes(k.toLowerCase()))
      );
      const qualPoints = Math.min(20, matchedQuals.length * 10);
      const speaksTamil = responder.qualifications.some((q) => q.toLowerCase().includes('tamil'));
      const sameCell = responder.homeCellId === incident.cellId;
      const contextPoints = (sameCell ? 5 : 0) + (incident.language === 'ta' && speaksTamil ? 5 : 3);
      const totalScore = Math.min(100, distancePoints + availabilityPoints + qualPoints + contextPoints);

      const factors: AllocationFactor[] = [
        {
          label: 'Proximity to Rescue Cell',
          points: distancePoints,
          maxPoints: 40,
          detail: `${(distanceMeters / 1000).toFixed(2)} km (~${estimatedEtaMinutes} min ETA)${isStaleLocation ? ' · Stale GPS (>15m)' : ' · Live GPS'}`,
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
          detail: matchedQuals.length > 0 ? matchedQuals.join(', ') : 'General coastal response',
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

  async assignRespondersToIncident(params: {
    organizationId: string;
    incidentId: string;
    responderIds: string[];
    backupResponderId?: string | null;
    escalationTimeoutSeconds?: number;
    dispatcherId: string;
    dispatcherName: string;
    allowOverride?: boolean;
    overrideReason?: string;
  }): Promise<{ incident: EmergencyIncident; assignedProfiles: ResponderProfile[]; noEligibleAvailableWarning?: boolean }> {
    const incident = await this.getIncidentById(params.organizationId, params.incidentId);
    if (!incident) {
      throw new Error('Incident not found.');
    }

    if (incident.state === 'UNVERIFIED') {
      throw new Error('Human dispatcher verification is required before dispatching responders.');
    }
    if (incident.state === 'RESOLVED' || incident.state === 'REJECTED') {
      throw new Error(`Cannot assign responders to a ${incident.state} incident.`);
    }

    const allResponders = await this.listResponders(params.organizationId);
    const chosen = allResponders.filter((r) => params.responderIds.includes(r.id));
    if (chosen.length === 0) {
      throw new Error('Select at least one valid responder.');
    }

    const offDutySelected = chosen.filter((r) => r.availability === 'off_duty');
    if (offDutySelected.length > 0 && !params.allowOverride) {
      throw new Error(
        `Cannot dispatch off-duty responder(s) (${offDutySelected.map((r) => r.name).join(', ')}) without explicit dispatcher override.`
      );
    }

    const availablePool = allResponders.filter((r) => r.availability === 'available');
    const noEligibleAvailableWarning =
      availablePool.length === 0 || chosen.some((r) => r.availability !== 'available');

    const prev = incident.state;
    const now = new Date();
    const timeoutSec = Math.max(15, Math.min(600, params.escalationTimeoutSeconds || 90));

    const assignedIds = [...incident.assignedResponderIds];
    const assignedNames = [...incident.assignedResponderNames];
    for (const r of chosen) {
      if (!assignedIds.includes(r.id)) {
        assignedIds.push(r.id);
        assignedNames.push(r.name);
      }
    }

    const backup = params.backupResponderId
      ? allResponders.find((r) => r.id === params.backupResponderId)
      : (await this.rankRespondersForIncident(params.organizationId, params.incidentId)).find(
          (item) => !assignedIds.includes(item.responder.id) && item.responder.availability !== 'off_duty'
        )?.responder;

    const nextState: IncidentState = incident.state === 'VERIFIED' ? 'DISPATCHED' : incident.state;
    const escalation: EscalationState = {
      active: true,
      stage: 'dispatched_ack',
      timeoutSeconds: timeoutSec,
      deadlineIso: new Date(now.getTime() + timeoutSec * 1000).toISOString(),
      backupResponderId: backup?.id || null,
      backupResponderName: backup?.name || null,
      escalated: false,
    };

    try {
      await db
        .update(incidents)
        .set({
          state: nextState,
          assignedResponderIdsJson: JSON.stringify(assignedIds),
          assignedResponderNamesJson: JSON.stringify(assignedNames),
          escalationJson: JSON.stringify(escalation),
          dispatchedAt: incident.state === 'VERIFIED' ? now : undefined,
          updatedAt: now,
        })
        .where(
          and(
            eq(incidents.id, params.incidentId),
            eq(incidents.organizationId, params.organizationId)
          )
        );

      for (const r of chosen) {
        await db
          .update(responderLocations)
          .set({
            availability: 'dispatched',
            activeIncidentId: params.incidentId,
            updatedAt: now,
          })
          .where(
            and(
              eq(responderLocations.organizationId, params.organizationId),
              eq(responderLocations.responderId, r.id)
            )
          );
      }

      const overrideNote =
        offDutySelected.length > 0 && params.allowOverride
          ? ` [OVERRIDE${params.overrideReason ? `: ${params.overrideReason.trim()}` : ''}]`
          : '';

      await db.insert(incidentEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.dispatcherId,
        actorName: params.dispatcherName,
        actorRole: 'dispatcher',
        action: 'RESPONDER_DISPATCHED',
        fromState: prev,
        toState: nextState,
        summary: `Dispatcher ${params.dispatcherName} approved & dispatched ${chosen.map((c) => c.name).join(', ')}.${overrideNote} Backup escalation timer set (${timeoutSec}s${backup ? `, backup: ${backup.name}` : ''}).`,
      });

      const updated = await this.getIncidentById(params.organizationId, params.incidentId);
      if (!updated) throw new Error('Incident not found after assignment.');
      return { incident: updated, assignedProfiles: chosen, noEligibleAvailableWarning };
    } catch (error) {
      throw new Error('Failed to assign responders.', { cause: error });
    }
  }

  async updateIncidentState(params: {
    organizationId: string;
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
  }): Promise<{ incident: EmergencyIncident; deduplicated: boolean }> {
    const incident = await this.getIncidentById(params.organizationId, params.incidentId);
    if (!incident) {
      throw new Error('Incident not found.');
    }

    const now = new Date();
    const escalation = incident.escalation ? { ...incident.escalation } : null;

    try {
      // Idempotency guard: prevent duplicate events on offline retry
      if (params.clientRequestId) {
        const existing = await db
          .select({ id: incidentEvents.id })
          .from(incidentEvents)
          .where(
            and(
              eq(incidentEvents.organizationId, params.organizationId),
              eq(incidentEvents.clientRequestId, params.clientRequestId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          return { incident, deduplicated: true };
        }
      }

      // Sync responder GPS coordinates if provided
      if (
        typeof params.responderLat === 'number' &&
        typeof params.responderLon === 'number' &&
        Number.isFinite(params.responderLat) &&
        Number.isFinite(params.responderLon)
      ) {
        const matchingResponders = await db
          .select({ uid: users.uid })
          .from(users)
          .where(
            and(
              eq(users.organizationId, params.organizationId),
              eq(users.nexconnUserId, params.actorId)
            )
          );
        const targetIds = Array.from(
          new Set([params.actorId, ...matchingResponders.map((u) => u.uid)])
        );
        await db
          .update(responderLocations)
          .set({
            lat: params.responderLat,
            lon: params.responderLon,
            updatedAt: now,
          })
          .where(
            and(
              eq(responderLocations.organizationId, params.organizationId),
              inArray(responderLocations.responderId, targetIds)
            )
          );
      }

      if (params.requestBackup) {
        if (incident.state === 'RESOLVED' || incident.state === 'REJECTED') {
          throw new Error(`Cannot request backup on a ${incident.state} incident.`);
        }

        const backupCandidate = (
          await this.rankRespondersForIncident(params.organizationId, params.incidentId)
        ).find((item) => !incident.assignedResponderIds.includes(item.responder.id))?.responder;

        const nextEscalation: EscalationState = {
          active: true,
          timeoutSeconds: escalation?.timeoutSeconds ?? 60,
          deadlineIso: now.toISOString(),
          backupResponderId: escalation?.backupResponderId || backupCandidate?.id || null,
          backupResponderName: escalation?.backupResponderName || backupCandidate?.name || null,
          escalated: true,
          escalatedAt: now.toISOString(),
        };

        await db
          .update(incidents)
          .set({
            escalationJson: JSON.stringify(nextEscalation),
            updatedAt: now,
          })
          .where(
            and(
              eq(incidents.id, params.incidentId),
              eq(incidents.organizationId, params.organizationId)
            )
          );

        await db.insert(incidentEvents).values({
          id: `evt-${randomUUID().slice(0, 8)}`,
          organizationId: params.organizationId,
          incidentId: params.incidentId,
          timestamp: now,
          actorId: params.actorId,
          actorName: params.actorName,
          actorRole: params.actorRole,
          action: 'BACKUP_REQUESTED',
          fromState: incident.state,
          toState: incident.state,
          clientRequestId: params.clientRequestId || null,
          summary: `${params.actorName} requested urgent backup from field.${params.note ? ` Note: ${params.note.trim()}` : ''}`,
        });

        const updated = await this.getIncidentById(params.organizationId, params.incidentId);
        if (!updated) throw new Error('Incident not found after backup request.');
        return { incident: updated, deduplicated: false };
      }

      if (params.rejectAssignment) {
        if (incident.state === 'RESOLVED' || incident.state === 'REJECTED') {
          throw new Error(`Cannot reject assignment on a ${incident.state} incident.`);
        }
        const allResponders = await this.listResponders(params.organizationId);
        const matchingResponder = allResponders.find(
          (r) => r.id === params.actorId || r.nexconnUserId === params.actorId
        );
        const removeId = matchingResponder?.id || params.actorId;
        const removeName = matchingResponder?.name || params.actorName;

        const nextAssignedIds = incident.assignedResponderIds.filter((id) => id !== removeId);
        const nextAssignedNames = incident.assignedResponderNames.filter((name) => name !== removeName);

        const backupCandidate = (
          await this.rankRespondersForIncident(params.organizationId, params.incidentId)
        ).find(
          (item) =>
            !nextAssignedIds.includes(item.responder.id) &&
            item.responder.id !== removeId &&
            item.responder.availability !== 'off_duty'
        )?.responder;

        const nextEscalation: EscalationState = {
          active: true,
          stage: 'dispatched_ack',
          timeoutSeconds: escalation?.timeoutSeconds ?? 60,
          deadlineIso: now.toISOString(),
          backupResponderId: backupCandidate?.id || null,
          backupResponderName: backupCandidate?.name || null,
          escalated: true,
          escalatedAt: now.toISOString(),
        };

        await db
          .update(incidents)
          .set({
            assignedResponderIdsJson: JSON.stringify(nextAssignedIds),
            assignedResponderNamesJson: JSON.stringify(nextAssignedNames),
            escalationJson: JSON.stringify(nextEscalation),
            updatedAt: now,
          })
          .where(
            and(
              eq(incidents.id, params.incidentId),
              eq(incidents.organizationId, params.organizationId)
            )
          );

        if (matchingResponder) {
          await db
            .update(responderLocations)
            .set({ availability: 'available', activeIncidentId: null, updatedAt: now })
            .where(
              and(
                eq(responderLocations.organizationId, params.organizationId),
                eq(responderLocations.responderId, matchingResponder.id)
              )
            );
        }

        await db.insert(incidentEvents).values({
          id: `evt-${randomUUID().slice(0, 8)}`,
          organizationId: params.organizationId,
          incidentId: params.incidentId,
          timestamp: now,
          actorId: params.actorId,
          actorName: params.actorName,
          actorRole: params.actorRole,
          action: 'RESPONDER_REJECTED',
          fromState: incident.state,
          toState: incident.state,
          clientRequestId: params.clientRequestId || null,
          summary: `${params.actorName} declined dispatch assignment.${params.note ? ` Reason: ${params.note.trim()}` : ''} Immediate backup escalation flagged${backupCandidate ? ` (${backupCandidate.name})` : ''}.`,
        });

        const updated = await this.getIncidentById(params.organizationId, params.incidentId);
        if (!updated) throw new Error('Incident not found after assignment rejection.');
        return { incident: updated, deduplicated: false };
      }

      if (params.acknowledgeOnly && incident.state === 'DISPATCHED') {
        if (escalation) escalation.active = false;
        await db
          .update(incidents)
          .set({
            acknowledgedAt: incident.acknowledgedAt ? new Date(incident.acknowledgedAt) : now,
            escalationJson: escalation ? JSON.stringify(escalation) : null,
            updatedAt: now,
          })
          .where(
            and(
              eq(incidents.id, params.incidentId),
              eq(incidents.organizationId, params.organizationId)
            )
          );

        await db.insert(incidentEvents).values({
          id: `evt-${randomUUID().slice(0, 8)}`,
          organizationId: params.organizationId,
          incidentId: params.incidentId,
          timestamp: now,
          actorId: params.actorId,
          actorName: params.actorName,
          actorRole: params.actorRole,
          action: 'RESPONDER_ACKNOWLEDGED',
          fromState: incident.state,
          toState: incident.state,
          clientRequestId: params.clientRequestId || null,
          summary: `${params.actorName} acknowledged dispatch.${params.note ? ` ${params.note.trim()}` : ''}`,
        });

        const acked = await this.getIncidentById(params.organizationId, params.incidentId);
        if (!acked) throw new Error('Incident not found after acknowledgement.');
        return { incident: acked, deduplicated: false };
      }

      if (!params.nextState || !ALLOWED_TRANSITIONS[incident.state].includes(params.nextState)) {
        throw new Error(
          `Invalid transition from ${incident.state} to ${params.nextState || 'unknown'}.`
        );
      }

      const prev = incident.state;
      if (
        escalation &&
        ['EN_ROUTE', 'ON_SCENE', 'VICTIM_RECOVERED', 'RESOLVED'].includes(params.nextState)
      ) {
        escalation.active = false;
      }

      await db
        .update(incidents)
        .set({
          state: params.nextState,
          updatedAt: now,
          escalationJson: escalation ? JSON.stringify(escalation) : null,
          ...(params.nextState === 'EN_ROUTE'
            ? {
                acknowledgedAt: incident.acknowledgedAt ? new Date(incident.acknowledgedAt) : now,
                enRouteAt: now,
              }
            : {}),
          ...(params.nextState === 'ON_SCENE'
            ? {
                acknowledgedAt: incident.acknowledgedAt ? new Date(incident.acknowledgedAt) : now,
                onSceneAt: now,
              }
            : {}),
          ...(params.nextState === 'VICTIM_RECOVERED'
            ? {
                acknowledgedAt: incident.acknowledgedAt ? new Date(incident.acknowledgedAt) : now,
                victimRecoveredAt: now,
              }
            : {}),
          ...(params.nextState === 'RESOLVED'
            ? {
                resolvedAt: now,
                closureSummary: params.note?.trim() || 'Incident resolved and closed.',
              }
            : {}),
        })
        .where(
          and(
            eq(incidents.id, params.incidentId),
            eq(incidents.organizationId, params.organizationId)
          )
        );

      if (params.nextState === 'EN_ROUTE' && incident.assignedResponderIds.length > 0) {
        await db
          .update(responderLocations)
          .set({ availability: 'dispatched', activeIncidentId: params.incidentId, updatedAt: now })
          .where(
            and(
              eq(responderLocations.organizationId, params.organizationId),
              inArray(responderLocations.responderId, incident.assignedResponderIds)
            )
          );
      } else if (params.nextState === 'ON_SCENE' && incident.assignedResponderIds.length > 0) {
        await db
          .update(responderLocations)
          .set({ availability: 'on_scene', activeIncidentId: params.incidentId, updatedAt: now })
          .where(
            and(
              eq(responderLocations.organizationId, params.organizationId),
              inArray(responderLocations.responderId, incident.assignedResponderIds)
            )
          );
      } else if (params.nextState === 'RESOLVED') {
        await db
          .update(responderLocations)
          .set({ availability: 'available', activeIncidentId: null, updatedAt: now })
          .where(
            and(
              eq(responderLocations.organizationId, params.organizationId),
              eq(responderLocations.activeIncidentId, params.incidentId)
            )
          );
      }

      const arrivalNote =
        params.nextState === 'ON_SCENE' && params.arrivalVerification
          ? ` [Arrival: ${params.arrivalVerification === 'gps_verified' ? 'GPS geofence verified' : 'Manual confirmation'}]`
          : '';

      await db.insert(incidentEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        action: `STATE_${params.nextState}`,
        fromState: prev,
        toState: params.nextState,
        clientRequestId: params.clientRequestId || null,
        summary:
          params.nextState === 'VICTIM_RECOVERED'
            ? `${params.actorName} reported VICTIM RECOVERED. Awaiting dispatcher confirmation for final resolution.${params.note ? ` Note: ${params.note.trim()}` : ''}`
            : `${params.actorName} updated status to ${params.nextState.replace('_', ' ')}.${arrivalNote}${params.note ? ` Note: ${params.note.trim()}` : ''}`,
      });

      const updated = await this.getIncidentById(params.organizationId, params.incidentId);
      if (!updated) throw new Error('Incident not found after state update.');
      if (params.nextState === 'ON_SCENE' && params.arrivalVerification) {
        updated.arrivalVerification = params.arrivalVerification;
      }
      return { incident: updated, deduplicated: false };
    } catch (error) {
      throw new Error(
        error instanceof Error &&
          (error.message.startsWith('Invalid transition') ||
            error.message.startsWith('Cannot request backup'))
          ? error.message
          : 'Failed to update incident state.',
        { cause: error }
      );
    }
  }

  async clearSimulatedIncidents(organizationId: string): Promise<{ removedCount: number }> {
    await ensureOrganizationSeeded(organizationId);
    try {
      const simRows = await db
        .select({ id: incidents.id })
        .from(incidents)
        .where(and(eq(incidents.organizationId, organizationId), eq(incidents.isSimulated, true)));

      if (simRows.length === 0) return { removedCount: 0 };
      const simIds = simRows.map((r) => r.id);

      await db
        .update(responderLocations)
        .set({ availability: 'available', activeIncidentId: null, updatedAt: new Date() })
        .where(
          and(
            eq(responderLocations.organizationId, organizationId),
            inArray(responderLocations.activeIncidentId, simIds)
          )
        );

      await db
        .delete(incidents)
        .where(and(eq(incidents.organizationId, organizationId), eq(incidents.isSimulated, true)));

      return { removedCount: simIds.length };
    } catch (error) {
      throw new Error('Failed to clear simulated incidents.', { cause: error });
    }
  }
}
