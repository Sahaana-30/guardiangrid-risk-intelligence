import type { PublicHospitalContext } from './maps';

export type MedicalSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE';

export type MedicalHandoffStatus =
  | 'DRAFT_PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface EnvironmentalVariableReading {
  value: number | null;
  unit: string;
  available: boolean;
  note?: string;
}

export interface EnvironmentalSnapshot {
  fetchedAt: string;
  observationTime: string | null;
  latitude: number | null;
  longitude: number | null;
  sources: string[];
  weatherStatus: 'ok' | 'unavailable' | 'timeout' | 'rate_limited';
  marineStatus: 'ok' | 'unavailable' | 'timeout' | 'rate_limited';
  windSpeedKmh: EnvironmentalVariableReading;
  windDirectionDeg: EnvironmentalVariableReading;
  precipitationMm: EnvironmentalVariableReading;
  airTemperatureC: EnvironmentalVariableReading;
  relativeHumidityPct: EnvironmentalVariableReading;
  waveHeightM: EnvironmentalVariableReading;
  wavePeriodS: EnvironmentalVariableReading;
  seaSurfaceTemperatureC: EnvironmentalVariableReading;
  unavailableFields: string[];
}

export interface NexconnMessageReference {
  messageId: string;
  senderUserId: string;
  sentAt: string;
  kind: 'text' | 'voice' | 'image' | 'file' | 'other';
  textPreview?: string;
  voiceTranscriptStatus?: 'available' | 'unavailable';
  voiceTranscript?: string | null;
  imageMetadata?: {
    uploadedAt: string;
    fileType: string;
    senderUserId: string;
    note: string;
  };
}

export interface SbarSectionContent {
  situation: {
    whatHappened: string;
    currentIncidentCondition: string;
    victimCount: string;
    currentRescueLocation: string;
  };
  background: {
    incidentHistory: string;
    responderReportedObservations: string[];
    relevantRecentMessages: string[];
    environmentalSummary: string;
    knownRelevantInformation: string[];
    missingInformation: string[];
  };
  assessment: {
    preliminaryOperationalAssessment: string;
    supportingEvidence: string[];
    uncertaintiesAndUnavailableInfo: string[];
  };
  recommendation: {
    immediateHandoffInformation: string[];
    suggestedCoordination: string[];
    environmentalAndSiteHazards: string[];
    verifyByReceivingMedicalTeam: string[];
  };
  medicalDisclaimer: string;
}

export interface MedicalHandoffStructuredPayload {
  incidentId: string;
  organizationId: string;
  regionId: string;
  generatedAt: string;
  language: 'en-ta';
  severity: MedicalSeverity;
  severityRationale: string;
  situation: SbarSectionContent['situation'];
  background: SbarSectionContent['background'];
  assessment: SbarSectionContent['assessment'];
  recommendation: SbarSectionContent['recommendation'];
  english: SbarSectionContent;
  tamil: SbarSectionContent;
  knownInformation: string[];
  unavailableInformation: string[];
  environmentalConditions: EnvironmentalSnapshot;
  sourceReferences: {
    incidentCode: string;
    incidentCreatedAt: string;
    nexconnGroupId: string | null;
    nexconnRetrievalStatus: 'ok' | 'no_group' | 'unavailable';
    nexconnMessagesCount: number;
    nexconnMessages: NexconnMessageReference[];
    environmentalSources: string[];
    environmentalObservationTime: string | null;
  };
  requiresHumanReview: true;
}

export interface MedicalHandoffReportRecord {
  id: string;
  organizationId: string;
  regionId: string | null;
  incidentId: string;
  incidentCode: string;
  cellId: string;
  version: number;
  status: MedicalHandoffStatus;
  severity: MedicalSeverity;
  severityRationale: string;
  payload: MedicalHandoffStructuredPayload;
  modelUsed: string;
  requiresHumanReview: boolean;
  generatedByUserId: string;
  generatedByName: string;
  generatedAt: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  sharedToNexconnAt: string | null;
  nexconnMessageId: string | null;
  clientRequestId: string | null;
}

export interface MedicalHandoffLinkMetadata {
  id: string;
  reportId: string;
  reportVersion: number;
  incidentId: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  isActive: boolean;
}

export interface PublicParamedicTrackingPayload {
  incidentCode: string;
  incidentStatus: string;
  incidentCategory: string;
  rescueCell: {
    cellId: string;
    cellLabel: string;
    siteName: string;
    regionName: string;
    vhfChannel: string;
    lat?: number | null;
    lon?: number | null;
    radiusMeters?: number | null;
  };
  rescueLocation: {
    lat: number | null;
    lon: number | null;
    locationSource: string;
  };
  respondersLiveGps: Array<{
    callsign: string;
    availability: string;
    lat: number;
    lon: number;
    updatedAt: string;
  }>;
  lastLocationUpdateAt: string;
  hospitalContext?: PublicHospitalContext | null;
  approvedSbar: {
    reportVersion: number;
    approvedAt: string;
    approvedByName: string;
    severity: MedicalSeverity;
    severityRationale: string;
    english: SbarSectionContent;
    tamil: SbarSectionContent;
    knownInformation: string[];
    unavailableInformation: string[];
  };
  environmentalHazards: {
    observationTime: string | null;
    sources: string[];
    windSpeedKmh: EnvironmentalVariableReading;
    windDirectionDeg: EnvironmentalVariableReading;
    precipitationMm: EnvironmentalVariableReading;
    airTemperatureC: EnvironmentalVariableReading;
    relativeHumidityPct: EnvironmentalVariableReading;
    waveHeightM: EnvironmentalVariableReading;
    wavePeriodS: EnvironmentalVariableReading;
    seaSurfaceTemperatureC: EnvironmentalVariableReading;
    unavailableFields: string[];
  };
  linkMeta: {
    expiresAt: string;
    readOnly: true;
    disclaimer: string;
  };
}
