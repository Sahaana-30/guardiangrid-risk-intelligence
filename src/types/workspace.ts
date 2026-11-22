export type SaasPlanTier = 'STARTER' | 'ENTERPRISE';

export interface WorkspaceGeofence {
  regionId: string;
  regionName: string;
  cityId: string;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
}

export interface WorkspaceBranding {
  displayName: string;
  shortTitle: string;
  tagline: string;
  logoText: string;
  icon: 'shield' | 'waves' | 'anchor';
  primaryColor: string;
  accentColor: string;
}

export interface WorkspaceConfig {
  id: string;
  organizationId: string;
  name: string;
  sector: 'Municipal Coastal Command' | 'Hospitality & Resort Safety' | 'Maritime Port Authority';
  planTier: SaasPlanTier;
  subscriptionStatus: 'ACTIVE' | 'ENTERPRISE_ACTIVE' | 'TRIAL' | 'ACTIVE_DEMO' | 'TRIAL_PREVIEW';
  branding: WorkspaceBranding;
  geofence: WorkspaceGeofence;
  settings: {
    autoEscalateSeconds: number;
    enableBilingualTamil: boolean;
    enableHospitalDecisionSupport: boolean;
    requireDispatcherSbarApproval: true;
  };
  isPrimaryProductionOrg: boolean;
}

export interface WorkspaceUsageResponse {
  organizationId: string;
  instrumented: {
    dataSource: 'live_database_and_runtime';
    incidentsTotal: number;
    incidentsActive: number;
    medicalHandoffsTotal: number;
    publicTrackingLinksTotal: number;
    serverUptimeSeconds: number;
    runtimeCounters: {
      geminiBriefingsGenerated: number;
      nexconnGroupsTriggered: number;
      mapsApiCalls: number;
    };
  };
  simulatedDemoMetrics: {
    dataSource: 'simulated_demonstration_only';
    disclaimer: string;
    billingCycleLabel: string;
    nexconnMessagesUsed: number;
    nexconnMessagesLimit: number;
    geminiBriefingsUsed: number;
    geminiBriefingsLimit: number;
    monthlyHistory: Array<{
      month: string;
      nexconnMessages: number;
      geminiBriefings: number;
      incidentsHandled: number;
    }>;
  };
}

export interface SimulationStepRecord {
  stepNumber: number;
  code: string;
  title: string;
  status: 'COMPLETED';
  timestamp: string;
  actor: string;
  detail: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface EmergencySimulationResult {
  simulationId: string;
  demoMode: true;
  demoTenantId: 'org-demo-simulation-sandbox';
  banner: string;
  startedAt: string;
  completedAt: string;
  syntheticIncidentCode: string;
  syntheticRiskScoreBefore: number;
  syntheticRiskScorePeak: number;
  steps: SimulationStepRecord[];
  sbarPreview: {
    modelUsed: string;
    severity: string;
    englishSummary: string;
    tamilSummary: string;
    disclaimer: string;
  };
}
