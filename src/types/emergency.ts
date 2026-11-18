export type EmergencyCategory = 'drowning' | 'swept_away' | 'missing_person' | 'medical';

export type EmergencySeverity = 'critical' | 'high' | 'moderate';

export type IncidentState =
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'ON_SCENE'
  | 'MEDICAL_HANDOFF'
  | 'RESOLVED'
  | 'REJECTED';

export type EmergencyLanguage = 'en' | 'ta';

export type ResponderAvailability = 'available' | 'dispatched' | 'on_scene' | 'off_duty';

export interface RescueCell {
  id: string;
  siteId: string;
  siteName: string;
  label: string;
  labelTa: string;
  towerName: string;
  lat: number;
  lon: number;
  radiusMeters: number;
  vhfChannel: string;
  accessLandmark: string;
}

export interface ResponderProfile {
  id: string;
  nexconnUserId: string;
  name: string;
  role: string;
  station: string;
  qualifications: string[];
  homeCellId: string;
  lat: number;
  lon: number;
  availability: ResponderAvailability;
  activeIncidentId: string | null;
  radioCallsign: string;
  isSimulated: true;
}

export interface AllocationFactor {
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface RankedResponder {
  responder: ResponderProfile;
  totalScore: number;
  distanceMeters: number;
  estimatedEtaMinutes: number;
  factors: AllocationFactor[];
  recommendedAsBackup?: boolean;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: 'public' | 'dispatcher' | 'responder' | 'system';
  action: string;
  fromState?: IncidentState;
  toState?: IncidentState;
  summary: string;
}

export interface EscalationState {
  active: boolean;
  timeoutSeconds: number;
  deadlineIso: string;
  backupResponderId: string | null;
  backupResponderName: string | null;
  escalated: boolean;
  escalatedAt?: string;
}

export interface LostChildDetails {
  approximateAge?: string;
  clothingDescription?: string;
  lastSeenMinutesAgo?: number;
}

export interface EmergencyIncident {
  id: string;
  code: string;
  clientRequestId?: string;
  category: EmergencyCategory;
  severity: EmergencySeverity;
  state: IncidentState;
  isSimulated: boolean;
  language: EmergencyLanguage;
  description: string;
  reporterNameMasked?: string;
  reporterPhoneMasked?: string;
  lostChildDetails?: LostChildDetails;
  cellId: string;
  cellLabel: string;
  siteId: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  gpsAccuracyMeters?: number | null;
  locationSource: 'gps' | 'cell_qr' | 'manual';
  hasPhotoAttachment: boolean;
  photoDataUrl?: string;
  hasVoiceNote: boolean;
  voiceTranscript?: string;
  assignedResponderIds: string[];
  assignedResponderNames: string[];
  nexconnGroupId: string | null;
  nexconnGroupName: string | null;
  nexconnGroupLive: boolean;
  nexconnGroupError?: string | null;
  escalation: EscalationState | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  dispatchedAt?: string;
  acknowledgedAt?: string;
  enRouteAt?: string;
  onSceneAt?: string;
  resolvedAt?: string;
  closureSummary?: string;
  auditTrail: AuditEvent[];
}

export interface PublicSOSPayload {
  clientRequestId?: string;
  category: EmergencyCategory;
  language: EmergencyLanguage;
  description: string;
  reporterName?: string;
  reporterPhone?: string;
  cellId?: string;
  lat?: number | null;
  lon?: number | null;
  gpsAccuracyMeters?: number | null;
  locationSource?: 'gps' | 'cell_qr' | 'manual';
  photoDataUrl?: string;
  hasVoiceNote?: boolean;
  voiceTranscript?: string;
  lostChildDetails?: LostChildDetails;
}

export interface PublicSOSReceipt {
  incidentId: string;
  code: string;
  state: IncidentState;
  cellId: string;
  cellLabel: string;
  siteName: string;
  createdAt: string;
  deduplicated: boolean;
  emergencyNumber: '112';
  vhfChannel: string;
}

export interface EmergencyStorageMeta {
  mechanism: string;
  persistenceScope: string;
  multiSessionShared: boolean;
  restartLimitation: string;
}
