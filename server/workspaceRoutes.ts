import express from 'express';
import { randomUUID } from 'crypto';
import { getEmergencyRepository } from '../src/db/repositories/index.ts';
import { isPostgresConfigured, createPool } from '../src/db/index.ts';
import {
  optionalAuth,
  requireRole,
  type AuthRequest,
} from '../src/middleware/auth.ts';
import { DEFAULT_ORGANIZATION_ID } from '../src/db/users.ts';
import { generateBilingualMedicalHandoff } from './services/medicalHandoffAi.ts';
import type {
  EmergencySimulationResult,
  SimulationStepRecord,
  WorkspaceUsageResponse,
} from '../src/types/workspace.ts';

export const workspaceRouter = express.Router();

const requireOperational = [optionalAuth, requireRole(['ORG_ADMIN', 'DISPATCHER', 'RESPONDER'])];
const requireAdmin = [optionalAuth, requireRole(['ORG_ADMIN'])];

const DEMO_SANDBOX_ORG_ID = 'org-demo-simulation-sandbox';
const serverBootTime = Date.now();

// Instrumented per-tenant in-process counters (reset on server restart, never fabricated)
interface TenantRuntimeCounters {
  geminiBriefingsGenerated: number;
  nexconnGroupsTriggered: number;
  mapsApiCalls: number;
}

const runtimeCountersByOrg = new Map<string, TenantRuntimeCounters>();

function getTenantRuntimeCounters(orgId: string): TenantRuntimeCounters {
  const existing = runtimeCountersByOrg.get(orgId);
  if (existing) return existing;
  const fresh: TenantRuntimeCounters = {
    geminiBriefingsGenerated: 0,
    nexconnGroupsTriggered: 0,
    mapsApiCalls: 0,
  };
  runtimeCountersByOrg.set(orgId, fresh);
  return fresh;
}

export function incrementWorkspaceCounter(
  key: keyof TenantRuntimeCounters,
  by = 1,
  organizationId = DEFAULT_ORGANIZATION_ID
): void {
  const counters = getTenantRuntimeCounters(organizationId);
  counters[key] += by;
}

// Ephemeral in-memory storage for the admin-only demo simulation (never writes real SOS records)
let latestSimulation: EmergencySimulationResult | null = null;

function getOrgId(req: AuthRequest): string {
  return req.authContext?.organizationId || DEFAULT_ORGANIZATION_ID;
}

/**
 * GET /api/workspace/usage
 * Returns strictly tenant-scoped instrumented counts from PostgreSQL/repo + server uptime counters,
 * clearly separated from simulated demonstration usage figures for SaaS plan presentation.
 */
workspaceRouter.get('/usage', ...requireOperational, async (req: AuthRequest, res) => {
  const orgId = getOrgId(req);

  let incidentsTotal = 0;
  let incidentsActive = 0;
  let medicalHandoffsTotal = 0;
  let publicTrackingLinksTotal = 0;

  try {
    const repo = getEmergencyRepository();
    const incidents = await repo.listIncidents(orgId, 'all');
    incidentsTotal = incidents.length;
    incidentsActive = incidents.filter(
      (i) => i.state !== 'RESOLVED' && i.state !== 'REJECTED'
    ).length;

    if (isPostgresConfigured() && process.env.USE_JSON_FALLBACK !== 'true') {
      const pool = createPool();
      const [mhRes, linkRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS cnt FROM medical_handoff_reports WHERE organization_id = $1`,
          [orgId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS cnt FROM medical_handoff_links WHERE organization_id = $1`,
          [orgId]
        ),
      ]);
      medicalHandoffsTotal = mhRes.rows[0]?.cnt ?? 0;
      publicTrackingLinksTotal = linkRes.rows[0]?.cnt ?? 0;
    }
  } catch (err: any) {
    console.warn('Workspace usage DB count fallback:', err?.message);
  }

  const isEnterprise = orgId !== 'org-ecr-coastal-resort';

  const payload: WorkspaceUsageResponse = {
    organizationId: orgId,
    instrumented: {
      dataSource: 'live_database_and_runtime',
      incidentsTotal,
      incidentsActive,
      medicalHandoffsTotal,
      publicTrackingLinksTotal,
      serverUptimeSeconds: Math.max(1, Math.round((Date.now() - serverBootTime) / 1000)),
      runtimeCounters: { ...getTenantRuntimeCounters(orgId) },
    },
    simulatedDemoMetrics: {
      dataSource: 'simulated_demonstration_only',
      disclaimer:
        'Simulated demonstration values for SaaS plan presentation only. No real billing transactions, metered invoices, or payment charges exist in this build.',
      billingCycleLabel: 'Demo Preview Cycle (No Payment Active)',
      nexconnMessagesUsed: isEnterprise ? 1420 : 210,
      nexconnMessagesLimit: isEnterprise ? 25000 : 1000,
      geminiBriefingsUsed: isEnterprise ? 64 : 12,
      geminiBriefingsLimit: isEnterprise ? 1000 : 50,
      monthlyHistory: isEnterprise
        ? [
            { month: 'Month -3 (Demo)', nexconnMessages: 980, geminiBriefings: 41, incidentsHandled: 14 },
            { month: 'Month -2 (Demo)', nexconnMessages: 1185, geminiBriefings: 53, incidentsHandled: 19 },
            { month: 'Month -1 (Demo)', nexconnMessages: 1420, geminiBriefings: 64, incidentsHandled: 22 },
          ]
        : [
            { month: 'Month -3 (Demo)', nexconnMessages: 120, geminiBriefings: 6, incidentsHandled: 3 },
            { month: 'Month -2 (Demo)', nexconnMessages: 165, geminiBriefings: 9, incidentsHandled: 4 },
            { month: 'Month -1 (Demo)', nexconnMessages: 210, geminiBriefings: 12, incidentsHandled: 5 },
          ],
    },
  };

  return res.json(payload);
});

/**
 * GET /api/workspace/simulation
 * Returns the latest admin-only demo simulation state (never leaks real tenant data).
 */
workspaceRouter.get('/simulation', ...requireAdmin, (_req: AuthRequest, res) => {
  return res.json({
    demoTenantId: DEMO_SANDBOX_ORG_ID,
    simulation: latestSimulation,
  });
});

/**
 * POST /api/workspace/simulation/run
 * Authorized ORG_ADMIN only. Executes a completely isolated 9-step synthetic demonstration
 * inside `org-demo-simulation-sandbox`. Never creates real SOS incidents, never contacts 112,
 * never dispatches real responders, and never publishes real patient information.
 */
workspaceRouter.post('/simulation/run', ...requireAdmin, async (req: AuthRequest, res) => {
  const actorName = req.authContext?.displayName || 'Authorized Admin';
  const startedAt = new Date().toISOString();
  const simId = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const syntheticIncidentCode = `DEMO-SOS-${Date.now().toString().slice(-4)}`;

  const baseTime = Date.now();
  const ts = (offsetSec: number) => new Date(baseTime + offsetSec * 1000).toISOString();

  const syntheticIncident = {
    id: `demo-inc-${simId.toLowerCase()}`,
    code: syntheticIncidentCode,
    organizationId: DEMO_SANDBOX_ORG_ID,
    regionId: 'reg-in-chennai',
    regionName: 'Chennai Coast (DEMO SANDBOX)',
    cellId: 'DEMO-MARINA-S3',
    cellLabel: 'Demo Sector 3 — Synthetic Drill Perimeter',
    siteName: 'Marina Beach (Synthetic Demo)',
    category: 'drowning' as const,
    state: 'VICTIM_RECOVERED' as const,
    description:
      '[DEMO SIMULATION] Synthetic rip-current swimmer distress drill for architecture walkthrough. No real person involved.',
    reporterName: 'Synthetic QR Drill Reporter',
    reporterPhone: null,
    language: 'en' as const,
    lat: 13.05,
    lon: 80.2824,
    locationSource: 'qr_cell' as const,
    isSimulated: true,
    assignedResponderIds: ['demo-unit-alpha'],
    backupResponderId: 'demo-unit-bravo',
    escalationTimeoutSeconds: 90,
    escalatedAt: null,
    nexconnGroupId: `demo-sandbox-${simId.toLowerCase()}`,
    nexconnGroupName: `[DEMO] ${syntheticIncidentCode} · Synthetic Drill`,
    severity: 'critical' as const,
    createdAt: startedAt,
    updatedAt: ts(120),
    auditTrail: [
      {
        id: 'demo-audit-1',
        timestamp: startedAt,
        actorRole: 'PUBLIC_SOS' as const,
        actorName: 'Synthetic QR Drill Reporter',
        action: 'SOS_REPORTED',
        summary: 'Synthetic QR SOS drill reported in Demo Sector 3',
      },
      {
        id: 'demo-audit-2',
        timestamp: ts(85),
        actorRole: 'RESPONDER' as const,
        actorName: 'Demo Lifeguard Alpha (Synthetic)',
        action: 'STATUS_VICTIM_RECOVERED',
        summary: 'Synthetic victim pulled to shore at Demo Sector 3',
      },
    ],
  };

  // Reuse real Phase 5 Gemini SBAR generator on strictly synthetic data (graceful fallback if offline)
  let sbarModel = 'gemini-3.1-flash-lite';
  let sbarSeverity = 'CRITICAL';
  let englishSummary =
    '[DEMO SIMULATION] Synthetic swimmer recovered from rip current in Demo Sector 3. Breathing status unconfirmed pending synthetic paramedic assessment.';
  let tamilSummary =
    '[மாதிரி ஒத்திகை] டெமோ பிரிவு 3-இல் செயற்கை நீரோட்ட மீட்பு ஒத்திகை நிறைவடைந்தது. மருத்துவக் குழு பரிசோதனை நிலுவையில் உள்ளது.';
  let sbarDisclaimer =
    'DEMO SIMULATION ONLY — Synthetic drill data generated for evaluation. Not a real medical record; no 112 call or ambulance dispatch occurred.';

  try {
    const aiResult = await generateBilingualMedicalHandoff({
      incident: syntheticIncident as any,
      organizationId: DEMO_SANDBOX_ORG_ID,
      assignedResponders: [
        {
          id: 'demo-unit-alpha',
          name: 'Demo Lifeguard Alpha (Synthetic)',
          radioCallsign: 'DEMO-ALPHA-1',
          availability: 'on_scene',
          lat: 13.0495,
          lon: 80.2821,
        } as any,
      ],
      nexconnMessages: [
        {
          messageId: 'demo-msg-1',
          senderUserId: 'demo-unit-alpha',
          sentAt: ts(85),
          kind: 'text',
          textPreview:
            '[DEMO SIMULATION] Synthetic victim pulled to shore at Demo Sector 3; requesting simulated medical handoff briefing.',
        },
      ],
      nexconnRetrievalStatus: 'ok',
      environmental: {
        observationTime: startedAt,
        sources: ['Synthetic Demo Telemetry'],
        windSpeedKmh: { value: 34, unit: 'km/h', available: true },
        windDirectionDeg: { value: 115, unit: 'deg', available: true },
        precipitationMm: { value: 4.2, unit: 'mm', available: true },
        airTemperatureC: { value: 30.5, unit: '°C', available: true },
        relativeHumidityPct: { value: 82, unit: '%', available: true },
        waveHeightM: { value: 2.3, unit: 'm', available: true },
        wavePeriodS: { value: 11, unit: 's', available: true },
        seaSurfaceTemperatureC: { value: 29.1, unit: '°C', available: true },
        unavailableFields: [],
      } as any,
      victimCount: 1,
    });
    incrementWorkspaceCounter('geminiBriefingsGenerated', 1, DEMO_SANDBOX_ORG_ID);
    sbarModel = aiResult.modelUsed;
    sbarSeverity = aiResult.payload.severity;
    englishSummary = `[DEMO SIMULATION] ${aiResult.payload.english.situation.whatHappened}`;
    tamilSummary = `[மாதிரி ஒத்திகை] ${aiResult.payload.tamil.situation.whatHappened}`;
    sbarDisclaimer = `DEMO SIMULATION ONLY — ${aiResult.payload.english.medicalDisclaimer}`;
  } catch (err: any) {
    console.warn('Demo simulation used deterministic SBAR fallback:', err?.message);
    sbarModel = 'deterministic-demo-fallback';
  }

  const steps: SimulationStepRecord[] = [
    {
      stepNumber: 1,
      code: 'RISK_SPIKE',
      title: 'Coastal Risk Spike Detected (Synthetic)',
      status: 'COMPLETED',
      timestamp: ts(0),
      actor: 'GuardianGrid Risk Engine (Demo)',
      detail:
        'Synthetic wave height jumped to 2.3m with 34 km/h onshore gusts; coastal risk score spiked from 48 (Medium) to 84 (Severe).',
      metadata: { riskBefore: 48, riskPeak: 84, waveHeightM: 2.3 },
    },
    {
      stepNumber: 2,
      code: 'SYNTHETIC_QR_SOS',
      title: 'Synthetic QR SOS Submitted (Sandbox Tenant)',
      status: 'COMPLETED',
      timestamp: ts(12),
      actor: 'Synthetic QR Drill Reporter',
      detail: `Created isolated synthetic SOS ${syntheticIncidentCode} inside tenant ${DEMO_SANDBOX_ORG_ID}. Zero real public SOS records created.`,
      metadata: { incidentCode: syntheticIncidentCode, tenantId: DEMO_SANDBOX_ORG_ID },
    },
    {
      stepNumber: 3,
      code: 'INCIDENT_VERIFIED',
      title: 'Dispatcher Verification Completed',
      status: 'COMPLETED',
      timestamp: ts(25),
      actor: actorName,
      detail: 'Human-in-the-loop verification confirmed synthetic alert priority P1 CRITICAL.',
      metadata: { state: 'VERIFIED' },
    },
    {
      stepNumber: 4,
      code: 'NEXCONN_GROUP_SANDBOX',
      title: 'Simulated Nexconn Emergency Channel Initialized',
      status: 'COMPLETED',
      timestamp: ts(30),
      actor: 'Nexconn Coordinator (Sandbox)',
      detail: `Provisioned sandbox channel ${syntheticIncident.nexconnGroupId} for synthetic dispatch + field unit coordination without messaging real operators.`,
      metadata: { channelId: syntheticIncident.nexconnGroupId, sandbox: true },
    },
    {
      stepNumber: 5,
      code: 'RESPONDER_ASSIGNED',
      title: 'Synthetic Responder Unit Assigned',
      status: 'COMPLETED',
      timestamp: ts(42),
      actor: actorName,
      detail:
        'Assigned DEMO-ALPHA-1 (primary) and DEMO-BRAVO-2 (backup, 90s escalation timer). No real responders dispatched.',
      metadata: { primaryUnit: 'DEMO-ALPHA-1', backupUnit: 'DEMO-BRAVO-2' },
    },
    {
      stepNumber: 6,
      code: 'RESPONDER_PROGRESSION',
      title: 'Responder Status Progression (EN_ROUTE → ON_SCENE → VICTIM_RECOVERED)',
      status: 'COMPLETED',
      timestamp: ts(95),
      actor: 'DEMO-ALPHA-1 (Synthetic)',
      detail:
        'Simulated mobile Field Kit GPS updates synced along coastal access route (2.1 km, 6 min est.) through EN_ROUTE, ON_SCENE, and VICTIM_RECOVERED.',
      metadata: { statesTraversed: 'DISPATCHED -> EN_ROUTE -> ON_SCENE -> VICTIM_RECOVERED' },
    },
    {
      stepNumber: 7,
      code: 'GEMINI_SBAR_HANDOFF',
      title: 'Gemini Bilingual Medical SBAR Handoff Generated (Demo)',
      status: 'COMPLETED',
      timestamp: ts(115),
      actor: `Gemini AI (${sbarModel})`,
      detail:
        'Generated synthetic English + Tamil SBAR briefing flagged for human dispatcher review. No real patient data or 112 dispatch triggered.',
      metadata: { modelUsed: sbarModel, severity: sbarSeverity, requiresHumanReview: true },
    },
    {
      stepNumber: 8,
      code: 'INCIDENT_RESOLVED',
      title: 'Synthetic Incident Resolved & Sandbox Closed',
      status: 'COMPLETED',
      timestamp: ts(145),
      actor: actorName,
      detail: `Closed ${syntheticIncidentCode} in sandbox tenant ${DEMO_SANDBOX_ORG_ID}; simulated tracking link revoked.`,
      metadata: { finalState: 'RESOLVED' },
    },
    {
      stepNumber: 9,
      code: 'AUDIT_TIMELINE_SEALED',
      title: 'Timeline & Audit History Verified',
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      actor: 'GuardianGrid Audit Trail',
      detail:
        'All 9 synthetic lifecycle events recorded with full actor attribution and strict tenant isolation.',
      metadata: { totalSteps: 9, isolated: true },
    },
  ];

  latestSimulation = {
    simulationId: simId,
    demoMode: true,
    demoTenantId: DEMO_SANDBOX_ORG_ID,
    banner:
      'DEMO SIMULATION — All events use synthetic data in an isolated demo tenant. No real SOS, 112 call, responder dispatch, or patient record was created.',
    startedAt,
    completedAt: new Date().toISOString(),
    syntheticIncidentCode,
    syntheticRiskScoreBefore: 48,
    syntheticRiskScorePeak: 84,
    steps,
    sbarPreview: {
      modelUsed: sbarModel,
      severity: sbarSeverity,
      englishSummary,
      tamilSummary,
      disclaimer: sbarDisclaimer,
    },
  };

  return res.status(201).json({ simulation: latestSimulation });
});

/**
 * POST /api/workspace/simulation/reset
 * Authorized ORG_ADMIN only. Clears the sandbox simulation state for instant replay.
 */
workspaceRouter.post('/simulation/reset', ...requireAdmin, (_req: AuthRequest, res) => {
  latestSimulation = null;
  return res.json({ reset: true, demoTenantId: DEMO_SANDBOX_ORG_ID });
});
