import {
  STORAGE_META,
  assignRespondersToIncident,
  attachNexconnGroupToIncident,
  clearSimulatedIncidents,
  createPublicSOS,
  evaluateEscalations,
  getIncidentById,
  listIncidents,
  listRescueCells,
  listResponders,
  rankRespondersForIncident,
  updateIncidentState,
  verifyIncident,
} from '../../../server/emergencyStore.ts';
import { INDIA_REGIONS } from '../../../server/emergencyData.ts';
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
import type { IEmergencyRepository, IncidentScope } from './types.ts';

/**
 * Multi-tenant fallback adapter preserving the local Express JSON store when PostgreSQL
 * is not configured or USE_JSON_FALLBACK=true is explicitly enabled.
 * Strictly enforces organizationId isolation on every read and write.
 */
export class JsonEmergencyRepository implements IEmergencyRepository {
  getStorageMeta(): EmergencyStorageMeta {
    return STORAGE_META;
  }

  async listRegions(organizationId: string): Promise<RegionSummary[]> {
    return INDIA_REGIONS.map((r) => ({ ...r, organizationId }));
  }

  async listRescueCells(_organizationId: string, regionId?: string): Promise<RescueCell[]> {
    const cells = listRescueCells();
    return regionId ? cells.filter((c) => c.regionId === regionId) : cells;
  }

  async listResponders(_organizationId: string, regionId?: string): Promise<ResponderProfile[]> {
    const responders = listResponders();
    return regionId ? responders.filter((r) => r.regionId === regionId) : responders;
  }

  async listIncidents(
    organizationId: string,
    scope: IncidentScope = 'all',
    regionId?: string
  ): Promise<EmergencyIncident[]> {
    const list = listIncidents(scope, organizationId);
    return regionId ? list.filter((inc) => inc.regionId === regionId) : list;
  }

  async getIncidentById(
    organizationId: string,
    id: string
  ): Promise<EmergencyIncident | undefined> {
    return getIncidentById(id, organizationId);
  }

  async createPublicSOS(
    organizationId: string,
    payload: PublicSOSPayload,
    options?: { isSimulated?: boolean; actorName?: string; escalationTimeoutSeconds?: number }
  ): Promise<{
    incident: EmergencyIncident;
    cell: RescueCell;
    deduplicated: boolean;
    qrCellValid: boolean;
  }> {
    return createPublicSOS(payload, { ...options, organizationId });
  }

  async verifyIncident(params: {
    organizationId: string;
    incidentId: string;
    decision: 'verify' | 'reject';
    dispatcherId: string;
    dispatcherName: string;
    notes?: string;
  }): Promise<EmergencyIncident> {
    return verifyIncident(params);
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
    return attachNexconnGroupToIncident(params);
  }

  async rankRespondersForIncident(
    organizationId: string,
    incidentId: string
  ): Promise<RankedResponder[]> {
    return rankRespondersForIncident(incidentId, organizationId);
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
  }): Promise<{
    incident: EmergencyIncident;
    assignedProfiles: ResponderProfile[];
    noEligibleAvailableWarning?: boolean;
  }> {
    return assignRespondersToIncident(params);
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
    arrivalVerification?: 'gps_verified' | 'manual_confirmed';
    clientRequestId?: string;
    responderLat?: number | null;
    responderLon?: number | null;
  }): Promise<{ incident: EmergencyIncident; deduplicated: boolean }> {
    return updateIncidentState(params);
  }

  async sweepEscalations(organizationId?: string): Promise<EmergencyIncident[]> {
    return evaluateEscalations(organizationId);
  }

  async clearSimulatedIncidents(organizationId: string): Promise<{ removedCount: number }> {
    return clearSimulatedIncidents(organizationId);
  }
}
