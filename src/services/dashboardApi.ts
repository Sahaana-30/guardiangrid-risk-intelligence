import { buildOperationalHeaders } from './emergencyApi';
import { apiUrl, getApiCredentials } from './apiBase';
import type {
  EmergencyCategory,
  EmergencyIncident,
  EmergencyStorageMeta,
  RegionSummary,
  RescueCell,
  ResponderProfile,
} from '../types/emergency';

export interface DashboardOverviewFilters {
  range?: '24h' | '7d' | '30d' | 'custom';
  from?: string;
  to?: string;
  regionId?: string;
  beach?: string;
  cellId?: string;
  category?: EmergencyCategory | 'all';
  includeSimulated?: boolean;
}

export interface DashboardOverviewResponse {
  organizationId: string;
  generatedAt: string;
  storage: EmergencyStorageMeta;
  appliedFilters: {
    range: '24h' | '7d' | '30d' | 'custom';
    from: string;
    to: string;
    daysSpan: number;
    regionId: string;
    beach: string;
    cellId: string;
    category: string;
    includeSimulated: boolean;
  };
  kpis: {
    pointInTime: {
      activeIncidents: number;
      unacknowledgedSosAlerts: number;
      respondersOnDuty: number;
      respondersAssigned: number;
      respondersEnRoute: number;
      pendingMedicalHandoffs: number;
      draftHandoffReportsCount: number;
    };
    windowed: {
      totalIncidentsReported: number;
      totalDrowningIncidents: number;
      criticalIncidents: number;
      incidentsResolved: number;
      drowningFrequencyPerDay: number;
    };
    simulatedExcludedCount: number;
    simulatedTotalCount: number;
  };
  operationalPerformance?: {
    sosAcknowledgementSeconds: { value: number | null; median?: number | null; sampleSize: number };
    sosVerificationSeconds?: { value: number | null; median?: number | null; sampleSize: number };
    responderAssignmentSeconds: { value: number | null; median?: number | null; sampleSize: number };
    responderAcceptanceSeconds: { value: number | null; median?: number | null; sampleSize: number };
    timeToSceneSeconds: { value: number | null; median?: number | null; sampleSize: number };
    incidentResolutionSeconds: { value: number | null; median?: number | null; sampleSize: number };
    queueBacklog?: {
      awaitingAcknowledgement: number;
      awaitingResponderAssignment: number;
      awaitingMedicalHandoff: number;
    };
    officialAlertLatencyMs: {
      real: { value: number | null; median?: number | null; sampleSize: number };
      simulated: { value: number | null; median?: number | null; sampleSize: number };
    };
    notificationFailureRatePct: { value: number | null; sampleSize: number };
    escalationFrequencyPct: { value: number | null; sampleSize: number };
    dataScope: 'real_only' | 'real_and_simulated';
  };
  drowningStats: {
    totalDrowningIncidents: number;
    byBeach: Array<{
      siteName: string;
      drowningCount: number;
      totalIncidents: number;
      criticalCount: number;
      resolvedCount: number;
    }>;
    byRegion: Array<{
      regionId: string;
      regionName: string;
      drowningCount: number;
      totalIncidents: number;
    }>;
    frequentlyAffectedCells: Array<{
      cellId: string;
      cellLabel: string;
      siteName: string;
      count: number;
      drowningCount: number;
    }>;
    dailyTrend: Array<{
      date: string;
      total: number;
      drowning: number;
      resolved: number;
    }>;
    weeklyTrend: Array<{
      week: string;
      total: number;
      drowning: number;
      resolved: number;
    }>;
    severityDistribution: {
      critical: number;
      high: number;
      moderate: number;
    };
    exposureAdjustedRate: {
      available: boolean;
      denominatorSource: string | null;
      reason: string;
    };
  };
  alertLogsSummary: {
    simulatorMode: boolean;
    totalLogged: number;
    simulatedCount: number;
    providerAcceptedCount?: number;
    sentCount: number;
    deliveredCount?: number;
    failedCount: number;
  };
  regions: RegionSummary[];
  cells: RescueCell[];
  responders: ResponderProfile[];
  recentIncidents: EmergencyIncident[];
}

export async function fetchDashboardOverview(
  filters: DashboardOverviewFilters = {}
): Promise<DashboardOverviewResponse> {
  const params = new URLSearchParams();
  if (filters.range) params.set('range', filters.range);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.regionId && filters.regionId !== 'all') params.set('regionId', filters.regionId);
  if (filters.beach && filters.beach !== 'all') params.set('beach', filters.beach);
  if (filters.cellId && filters.cellId !== 'all') params.set('cellId', filters.cellId);
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.includeSimulated) params.set('includeSimulated', 'true');

  const headers = await buildOperationalHeaders(false);
  const qs = params.toString();
  const res = await fetch(apiUrl(`/api/dashboard/overview${qs ? `?${qs}` : ''}`), {
    credentials: getApiCredentials(),
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Dashboard overview failed (${res.status})`);
  }
  return data as DashboardOverviewResponse;
}
