import type {
  EmergencyIncident,
  EmergencyStorageMeta,
  IncidentState,
  PublicSOSPayload,
  RankedResponder,
  RegionSummary,
  RescueCell,
  ResponderProfile,
} from '../../types/emergency.ts';

export type IncidentScope = 'all' | 'real' | 'simulated';

export interface IEmergencyRepository {
  getStorageMeta(): EmergencyStorageMeta;
  listRegions(organizationId: string): Promise<RegionSummary[]>;
  listRescueCells(organizationId: string, regionId?: string): Promise<RescueCell[]>;
  listResponders(organizationId: string, regionId?: string): Promise<ResponderProfile[]>;
  listIncidents(
    organizationId: string,
    scope?: IncidentScope,
    regionId?: string
  ): Promise<EmergencyIncident[]>;
  getIncidentById(organizationId: string, id: string): Promise<EmergencyIncident | undefined>;
  createPublicSOS(
    organizationId: string,
    payload: PublicSOSPayload,
    options?: {
      isSimulated?: boolean;
      actorName?: string;
      escalationTimeoutSeconds?: number;
    }
  ): Promise<{
    incident: EmergencyIncident;
    cell: RescueCell;
    deduplicated: boolean;
    qrCellValid?: boolean;
  }>;
  verifyIncident(params: {
    organizationId: string;
    incidentId: string;
    decision: 'verify' | 'reject';
    dispatcherId: string;
    dispatcherName: string;
    notes?: string;
  }): Promise<EmergencyIncident>;
  attachNexconnGroupToIncident(params: {
    organizationId: string;
    incidentId: string;
    groupId: string | null;
    groupName: string;
    live: boolean;
    errorMessage?: string | null;
    actorId: string;
    actorName: string;
    memberUserIds?: string[];
  }): Promise<EmergencyIncident>;
  rankRespondersForIncident(organizationId: string, incidentId: string): Promise<RankedResponder[]>;
  assignRespondersToIncident(params: {
    organizationId: string;
    incidentId: string;
    responderIds: string[];
    backupResponderId?: string | null;
    escalationTimeoutSeconds?: number;
    dispatcherId: string;
    dispatcherName: string;
    allowOverride?: boolean;
    overrideReason?: string;
  }): Promise<{
    incident: EmergencyIncident;
    assignedProfiles: ResponderProfile[];
    noEligibleAvailableWarning?: boolean;
  }>;
  updateIncidentState(params: {
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
    arrivalVerification?: 'gps_verified' | 'manual_confirmed';
    clientRequestId?: string;
    responderLat?: number | null;
    responderLon?: number | null;
  }): Promise<{ incident: EmergencyIncident; deduplicated: boolean }>;
  sweepEscalations(organizationId?: string): Promise<EmergencyIncident[]>;
  clearSimulatedIncidents(organizationId: string): Promise<{ removedCount: number }>;
}
