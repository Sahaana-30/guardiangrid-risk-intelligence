import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, desc, eq } from 'drizzle-orm';
import { db, isPostgresConfigured, isPostgresRequired } from '../index.ts';
import {
  incidentEvents,
  incidents,
  medicalHandoffLinks,
  medicalHandoffReports,
} from '../schema.ts';
import type {
  MedicalHandoffLinkMetadata,
  MedicalHandoffReportRecord,
  MedicalHandoffStructuredPayload,
} from '../../types/medicalHandoff.ts';

interface JsonHandoffStore {
  reports: MedicalHandoffReportRecord[];
  links: Array<{
    id: string;
    organizationId: string;
    regionId: string | null;
    incidentId: string;
    reportId: string;
    tokenHash: string;
    createdByUserId: string;
    createdByName: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    revokedByUserId: string | null;
    accessCount: number;
    lastAccessedAt: string | null;
  }>;
}

const JSON_FILE = path.resolve(process.cwd(), 'server/data/medical-handoff-state.json');

function usePostgres(): boolean {
  if (isPostgresRequired()) {
    if (!isPostgresConfigured() || process.env.USE_JSON_FALLBACK === 'true' || !db) {
      throw new Error(
        'REQUIRE_POSTGRES=true requires a valid PostgreSQL configuration for medical handoff persistence.'
      );
    }
    return true;
  }
  return isPostgresConfigured() && process.env.USE_JSON_FALLBACK !== 'true' && Boolean(db);
}

function readJsonStore(): JsonHandoffStore {
  try {
    if (fs.existsSync(JSON_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
      return {
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        links: Array.isArray(parsed.links) ? parsed.links : [],
      };
    }
  } catch {
    // Fallback to empty store
  }
  return { reports: [], links: [] };
}

function writeJsonStore(store: JsonHandoffStore): void {
  const dir = path.dirname(JSON_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(JSON_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function hashPublicToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateSecurePublicToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashPublicToken(rawToken) };
}

function mapPgReport(
  row: typeof medicalHandoffReports.$inferSelect,
  incidentCode: string,
  cellId: string
): MedicalHandoffReportRecord {
  const payload = JSON.parse(row.payloadJson) as MedicalHandoffStructuredPayload;
  return {
    id: row.id,
    organizationId: row.organizationId,
    regionId: row.regionId,
    incidentId: row.incidentId,
    incidentCode,
    cellId,
    version: row.version,
    status: row.status as MedicalHandoffReportRecord['status'],
    severity: row.severity as MedicalHandoffReportRecord['severity'],
    severityRationale: row.severityRationale,
    payload,
    modelUsed: row.modelUsed,
    requiresHumanReview: row.requiresHumanReview,
    generatedByUserId: row.generatedByUserId,
    generatedByName: row.generatedByName,
    generatedAt: row.generatedAt.toISOString(),
    reviewedByUserId: row.reviewedByUserId,
    reviewedByName: row.reviewedByName,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewNotes: row.reviewNotes,
    sharedToNexconnAt: row.sharedToNexconnAt ? row.sharedToNexconnAt.toISOString() : null,
    nexconnMessageId: row.nexconnMessageId,
    clientRequestId: row.clientRequestId,
  };
}

function mapLinkMetadata(
  row: {
    id: string;
    reportId: string;
    incidentId: string;
    createdByUserId: string;
    createdByName: string;
    createdAt: Date | string;
    expiresAt: Date | string;
    revokedAt: Date | string | null;
    revokedByUserId: string | null;
    accessCount: number;
    lastAccessedAt: Date | string | null;
  },
  reportVersion: number
): MedicalHandoffLinkMetadata {
  const expiresIso = row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt;
  const revokedIso =
    row.revokedAt instanceof Date ? row.revokedAt.toISOString() : row.revokedAt || null;
  const isActive = !revokedIso && new Date(expiresIso).getTime() > Date.now();
  return {
    id: row.id,
    reportId: row.reportId,
    reportVersion,
    incidentId: row.incidentId,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    expiresAt: expiresIso,
    revokedAt: revokedIso,
    revokedByUserId: row.revokedByUserId,
    accessCount: row.accessCount,
    lastAccessedAt:
      row.lastAccessedAt instanceof Date
        ? row.lastAccessedAt.toISOString()
        : row.lastAccessedAt || null,
    isActive,
  };
}

export async function listMedicalHandoffsForIncident(params: {
  organizationId: string;
  incidentId: string;
  incidentCode: string;
  cellId: string;
}): Promise<{
  reports: MedicalHandoffReportRecord[];
  links: MedicalHandoffLinkMetadata[];
}> {
  if (usePostgres() && db) {
    const reportRows = await db
      .select()
      .from(medicalHandoffReports)
      .where(
        and(
          eq(medicalHandoffReports.organizationId, params.organizationId),
          eq(medicalHandoffReports.incidentId, params.incidentId)
        )
      )
      .orderBy(desc(medicalHandoffReports.version));

    const versionById = new Map(reportRows.map((r) => [r.id, r.version]));
    const linkRows = await db
      .select()
      .from(medicalHandoffLinks)
      .where(
        and(
          eq(medicalHandoffLinks.organizationId, params.organizationId),
          eq(medicalHandoffLinks.incidentId, params.incidentId)
        )
      )
      .orderBy(desc(medicalHandoffLinks.createdAt));

    return {
      reports: reportRows.map((r) => mapPgReport(r, params.incidentCode, params.cellId)),
      links: linkRows.map((l) => mapLinkMetadata(l, versionById.get(l.reportId) || 1)),
    };
  }

  const store = readJsonStore();
  const reports = store.reports
    .filter(
      (r) => r.organizationId === params.organizationId && r.incidentId === params.incidentId
    )
    .sort((a, b) => b.version - a.version);
  const versionById = new Map(reports.map((r) => [r.id, r.version]));
  const links = store.links
    .filter(
      (l) => l.organizationId === params.organizationId && l.incidentId === params.incidentId
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((l) => mapLinkMetadata(l, versionById.get(l.reportId) || 1));

  return { reports, links };
}

export async function findMedicalHandoffByClientRequestId(params: {
  organizationId: string;
  incidentId: string;
  incidentCode: string;
  cellId: string;
  clientRequestId: string;
}): Promise<MedicalHandoffReportRecord | null> {
  if (usePostgres() && db) {
    const [row] = await db
      .select()
      .from(medicalHandoffReports)
      .where(
        and(
          eq(medicalHandoffReports.organizationId, params.organizationId),
          eq(medicalHandoffReports.incidentId, params.incidentId),
          eq(medicalHandoffReports.clientRequestId, params.clientRequestId)
        )
      )
      .limit(1);
    return row ? mapPgReport(row, params.incidentCode, params.cellId) : null;
  }

  const store = readJsonStore();
  return (
    store.reports.find(
      (r) =>
        r.organizationId === params.organizationId &&
        r.incidentId === params.incidentId &&
        r.clientRequestId === params.clientRequestId
    ) || null
  );
}

export async function createMedicalHandoffVersion(params: {
  organizationId: string;
  regionId: string | null;
  incidentId: string;
  incidentCode: string;
  cellId: string;
  payload: MedicalHandoffStructuredPayload;
  modelUsed: string;
  actorId: string;
  actorName: string;
  actorRole: 'dispatcher' | 'responder';
  clientRequestId?: string;
}): Promise<MedicalHandoffReportRecord> {
  const id = `mh-${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date();

  if (usePostgres() && db) {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ version: medicalHandoffReports.version })
        .from(medicalHandoffReports)
        .where(
          and(
            eq(medicalHandoffReports.organizationId, params.organizationId),
            eq(medicalHandoffReports.incidentId, params.incidentId)
          )
        )
        .orderBy(desc(medicalHandoffReports.version))
        .limit(1);

      const nextVersion = (existing[0]?.version || 0) + 1;
      const action = nextVersion > 1 ? 'MEDICAL_HANDOFF_REGENERATED' : 'MEDICAL_HANDOFF_GENERATED';

      const [inserted] = await tx
        .insert(medicalHandoffReports)
        .values({
          id,
          organizationId: params.organizationId,
          regionId: params.regionId,
          incidentId: params.incidentId,
          version: nextVersion,
          status: 'DRAFT_PENDING_REVIEW',
          severity: params.payload.severity,
          severityRationale: params.payload.severityRationale,
          payloadJson: JSON.stringify(params.payload),
          modelUsed: params.modelUsed,
          requiresHumanReview: true,
          generatedByUserId: params.actorId,
          generatedByName: params.actorName,
          generatedAt: now,
          clientRequestId: params.clientRequestId || null,
        })
        .returning();

      await tx.insert(incidentEvents).values({
        id: `evt-${crypto.randomBytes(6).toString('hex')}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        action,
        summary: `AI medical handoff v${nextVersion} generated (${params.payload.severity}) — pending human dispatcher review.`,
      });

      return mapPgReport(inserted, params.incidentCode, params.cellId);
    });
  }

  const store = readJsonStore();
  const prevVersions = store.reports.filter(
    (r) => r.organizationId === params.organizationId && r.incidentId === params.incidentId
  );
  const nextVersion = prevVersions.reduce((max, r) => Math.max(max, r.version), 0) + 1;

  const record: MedicalHandoffReportRecord = {
    id,
    organizationId: params.organizationId,
    regionId: params.regionId,
    incidentId: params.incidentId,
    incidentCode: params.incidentCode,
    cellId: params.cellId,
    version: nextVersion,
    status: 'DRAFT_PENDING_REVIEW',
    severity: params.payload.severity,
    severityRationale: params.payload.severityRationale,
    payload: params.payload,
    modelUsed: params.modelUsed,
    requiresHumanReview: true,
    generatedByUserId: params.actorId,
    generatedByName: params.actorName,
    generatedAt: now.toISOString(),
    reviewedByUserId: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNotes: null,
    sharedToNexconnAt: null,
    nexconnMessageId: null,
    clientRequestId: params.clientRequestId || null,
  };

  store.reports.unshift(record);
  writeJsonStore(store);
  return record;
}

export async function reviewMedicalHandoffReport(params: {
  organizationId: string;
  incidentId: string;
  incidentCode: string;
  cellId: string;
  reportId: string;
  decision: 'approve' | 'reject';
  reviewerId: string;
  reviewerName: string;
  reviewNotes?: string;
}): Promise<MedicalHandoffReportRecord | null> {
  const now = new Date();
  const nextStatus = params.decision === 'approve' ? 'APPROVED' : 'REJECTED';
  const action =
    params.decision === 'approve' ? 'MEDICAL_HANDOFF_APPROVED' : 'MEDICAL_HANDOFF_REJECTED';

  if (usePostgres() && db) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(medicalHandoffReports)
        .where(
          and(
            eq(medicalHandoffReports.id, params.reportId),
            eq(medicalHandoffReports.organizationId, params.organizationId),
            eq(medicalHandoffReports.incidentId, params.incidentId)
          )
        )
        .limit(1);

      if (!existing) return null;

      const [updated] = await tx
        .update(medicalHandoffReports)
        .set({
          status: nextStatus,
          reviewedByUserId: params.reviewerId,
          reviewedByName: params.reviewerName,
          reviewedAt: now,
          reviewNotes: params.reviewNotes || null,
        })
        .where(eq(medicalHandoffReports.id, existing.id))
        .returning();

      await tx.insert(incidentEvents).values({
        id: `evt-${crypto.randomBytes(6).toString('hex')}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.reviewerId,
        actorName: params.reviewerName,
        actorRole: 'dispatcher',
        action,
        summary: `Dispatcher ${params.decision === 'approve' ? 'approved' : 'rejected'} medical handoff v${existing.version}${
          params.reviewNotes ? ` — ${params.reviewNotes}` : ''
        }.`,
      });

      return mapPgReport(updated, params.incidentCode, params.cellId);
    });
  }

  const store = readJsonStore();
  const idx = store.reports.findIndex(
    (r) =>
      r.id === params.reportId &&
      r.organizationId === params.organizationId &&
      r.incidentId === params.incidentId
  );
  if (idx === -1) return null;

  store.reports[idx] = {
    ...store.reports[idx],
    status: nextStatus,
    reviewedByUserId: params.reviewerId,
    reviewedByName: params.reviewerName,
    reviewedAt: now.toISOString(),
    reviewNotes: params.reviewNotes || null,
  };
  writeJsonStore(store);
  return store.reports[idx];
}

export async function markMedicalHandoffSharedToNexconn(params: {
  organizationId: string;
  incidentId: string;
  incidentCode: string;
  cellId: string;
  reportId: string;
  nexconnMessageId: string | null;
  actorId: string;
  actorName: string;
}): Promise<MedicalHandoffReportRecord | null> {
  const now = new Date();

  if (usePostgres() && db) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(medicalHandoffReports)
        .where(
          and(
            eq(medicalHandoffReports.id, params.reportId),
            eq(medicalHandoffReports.organizationId, params.organizationId),
            eq(medicalHandoffReports.incidentId, params.incidentId)
          )
        )
        .limit(1);
      if (!existing) return null;

      const [updated] = await tx
        .update(medicalHandoffReports)
        .set({
          sharedToNexconnAt: now,
          nexconnMessageId: params.nexconnMessageId,
        })
        .where(eq(medicalHandoffReports.id, existing.id))
        .returning();

      await tx.insert(incidentEvents).values({
        id: `evt-${crypto.randomBytes(6).toString('hex')}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: 'dispatcher',
        action: 'MEDICAL_HANDOFF_SHARED_NEXCONN',
        summary: `Approved medical handoff v${existing.version} published to Nexconn incident group.`,
      });

      return mapPgReport(updated, params.incidentCode, params.cellId);
    });
  }

  const store = readJsonStore();
  const idx = store.reports.findIndex(
    (r) =>
      r.id === params.reportId &&
      r.organizationId === params.organizationId &&
      r.incidentId === params.incidentId
  );
  if (idx === -1) return null;

  store.reports[idx] = {
    ...store.reports[idx],
    sharedToNexconnAt: now.toISOString(),
    nexconnMessageId: params.nexconnMessageId,
  };
  writeJsonStore(store);
  return store.reports[idx];
}

export async function createPublicHandoffLink(params: {
  organizationId: string;
  regionId: string | null;
  incidentId: string;
  reportId: string;
  reportVersion: number;
  createdByUserId: string;
  createdByName: string;
  expiresInMinutes: number;
}): Promise<{ rawToken: string; link: MedicalHandoffLinkMetadata }> {
  const { rawToken, tokenHash } = generateSecurePublicToken();
  const id = `mhl-${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date();
  const clampedMinutes = Math.max(5, Math.min(24 * 60, Math.round(params.expiresInMinutes)));
  const expiresAt = new Date(now.getTime() + clampedMinutes * 60 * 1000);

  if (usePostgres() && db) {
    const link = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(medicalHandoffLinks)
        .values({
          id,
          organizationId: params.organizationId,
          regionId: params.regionId,
          incidentId: params.incidentId,
          reportId: params.reportId,
          tokenHash,
          createdByUserId: params.createdByUserId,
          createdByName: params.createdByName,
          createdAt: now,
          expiresAt,
        })
        .returning();

      await tx.insert(incidentEvents).values({
        id: `evt-${crypto.randomBytes(6).toString('hex')}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.createdByUserId,
        actorName: params.createdByName,
        actorRole: 'dispatcher',
        action: 'PUBLIC_PARAMEDIC_LINK_CREATED',
        summary: `Read-only 112 / Paramedic live link created for approved handoff v${params.reportVersion} (expires ${expiresAt.toISOString()}).`,
      });

      return mapLinkMetadata(inserted, params.reportVersion);
    });

    return { rawToken, link };
  }

  const store = readJsonStore();
  const row = {
    id,
    organizationId: params.organizationId,
    regionId: params.regionId,
    incidentId: params.incidentId,
    reportId: params.reportId,
    tokenHash,
    createdByUserId: params.createdByUserId,
    createdByName: params.createdByName,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    revokedByUserId: null,
    accessCount: 0,
    lastAccessedAt: null,
  };
  store.links.unshift(row);
  writeJsonStore(store);
  return { rawToken, link: mapLinkMetadata(row, params.reportVersion) };
}

export async function revokePublicHandoffLink(params: {
  organizationId: string;
  incidentId: string;
  linkId: string;
  revokedByUserId: string;
  revokedByName: string;
}): Promise<MedicalHandoffLinkMetadata | null> {
  const now = new Date();

  if (usePostgres() && db) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(medicalHandoffLinks)
        .where(
          and(
            eq(medicalHandoffLinks.id, params.linkId),
            eq(medicalHandoffLinks.organizationId, params.organizationId),
            eq(medicalHandoffLinks.incidentId, params.incidentId)
          )
        )
        .limit(1);
      if (!existing) return null;

      const [updated] = await tx
        .update(medicalHandoffLinks)
        .set({
          revokedAt: now,
          revokedByUserId: params.revokedByUserId,
        })
        .where(eq(medicalHandoffLinks.id, existing.id))
        .returning();

      await tx.insert(incidentEvents).values({
        id: `evt-${crypto.randomBytes(6).toString('hex')}`,
        organizationId: params.organizationId,
        incidentId: params.incidentId,
        timestamp: now,
        actorId: params.revokedByUserId,
        actorName: params.revokedByName,
        actorRole: 'dispatcher',
        action: 'PUBLIC_PARAMEDIC_LINK_REVOKED',
        summary: `Read-only 112 / Paramedic live link (${existing.id}) immediately revoked.`,
      });

      const [rep] = await tx
        .select({ version: medicalHandoffReports.version })
        .from(medicalHandoffReports)
        .where(eq(medicalHandoffReports.id, existing.reportId))
        .limit(1);

      return mapLinkMetadata(updated, rep?.version || 1);
    });
  }

  const store = readJsonStore();
  const idx = store.links.findIndex(
    (l) =>
      l.id === params.linkId &&
      l.organizationId === params.organizationId &&
      l.incidentId === params.incidentId
  );
  if (idx === -1) return null;

  store.links[idx] = {
    ...store.links[idx],
    revokedAt: now.toISOString(),
    revokedByUserId: params.revokedByUserId,
  };
  writeJsonStore(store);

  const rep = store.reports.find((r) => r.id === store.links[idx].reportId);
  return mapLinkMetadata(store.links[idx], rep?.version || 1);
}

export async function resolveAndTouchPublicHandoffToken(rawToken: string): Promise<
  | { status: 'not_found' }
  | { status: 'revoked' }
  | { status: 'expired' }
  | { status: 'unapproved' }
  | {
      status: 'valid';
      organizationId: string;
      incidentId: string;
      report: MedicalHandoffReportRecord;
      expiresAt: string;
    }
> {
  const tokenHash = hashPublicToken(rawToken);
  const now = new Date();

  if (usePostgres() && db) {
    const [linkRow] = await db
      .select()
      .from(medicalHandoffLinks)
      .where(eq(medicalHandoffLinks.tokenHash, tokenHash))
      .limit(1);

    if (!linkRow) return { status: 'not_found' };
    if (linkRow.revokedAt) return { status: 'revoked' };
    if (linkRow.expiresAt.getTime() <= now.getTime()) return { status: 'expired' };

    const [reportRow] = await db
      .select()
      .from(medicalHandoffReports)
      .where(eq(medicalHandoffReports.id, linkRow.reportId))
      .limit(1);

    if (!reportRow || reportRow.status !== 'APPROVED') {
      return { status: 'unapproved' };
    }

    const [incRow] = await db
      .select({ code: incidents.code, cellId: incidents.cellId })
      .from(incidents)
      .where(eq(incidents.id, linkRow.incidentId))
      .limit(1);

    const isFirstAccess = linkRow.accessCount === 0;
    await db
      .update(medicalHandoffLinks)
      .set({
        accessCount: linkRow.accessCount + 1,
        lastAccessedAt: now,
      })
      .where(eq(medicalHandoffLinks.id, linkRow.id));

    if (isFirstAccess) {
      await db.insert(incidentEvents).values({
        id: `evt-${crypto.randomBytes(6).toString('hex')}`,
        organizationId: linkRow.organizationId,
        incidentId: linkRow.incidentId,
        timestamp: now,
        actorId: 'public-paramedic-viewer',
        actorName: '112 / Paramedic Link Viewer',
        actorRole: 'system',
        action: 'PUBLIC_PARAMEDIC_LINK_ACCESSED',
        summary: `Read-only 112 / Paramedic live link (${linkRow.id}) accessed for the first time.`,
      });
    }

    return {
      status: 'valid',
      organizationId: linkRow.organizationId,
      incidentId: linkRow.incidentId,
      report: mapPgReport(reportRow, incRow?.code || 'INC', incRow?.cellId || ''),
      expiresAt: linkRow.expiresAt.toISOString(),
    };
  }

  const store = readJsonStore();
  const idx = store.links.findIndex((l) => l.tokenHash === tokenHash);
  if (idx === -1) return { status: 'not_found' };

  const linkRow = store.links[idx];
  if (linkRow.revokedAt) return { status: 'revoked' };
  if (new Date(linkRow.expiresAt).getTime() <= now.getTime()) return { status: 'expired' };

  const report = store.reports.find((r) => r.id === linkRow.reportId);
  if (!report || report.status !== 'APPROVED') return { status: 'unapproved' };

  store.links[idx] = {
    ...linkRow,
    accessCount: linkRow.accessCount + 1,
    lastAccessedAt: now.toISOString(),
  };
  writeJsonStore(store);

  return {
    status: 'valid',
    organizationId: linkRow.organizationId,
    incidentId: linkRow.incidentId,
    report,
    expiresAt: linkRow.expiresAt,
  };
}
