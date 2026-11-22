export type OfficialAlertChannel = 'sms' | 'whatsapp';

export type OfficialAlertStatus =
  | 'QUEUED'
  | 'PROVIDER_ACCEPTED'
  | 'SENT'
  | 'DELIVERED'
  | 'SIMULATED'
  | 'NOT_CONFIGURED'
  | 'FAILED';

export interface OfficialAlertLog {
  id: string;
  incidentId: string;
  incidentCode: string;
  organizationId: string;
  recipientId: string;
  recipientName: string;
  recipientRole: 'RESPONDER' | 'DISPATCHER' | 'SUPERVISOR' | 'AMBULANCE_CONTROL';
  recipientPhoneMasked: string;
  channel: OfficialAlertChannel;
  status: OfficialAlertStatus;
  isSimulated: boolean;
  isSandboxRecipient: boolean;
  provider: 'twilio' | 'simulator' | 'none';
  providerMessageSid: string | null;
  errorMessage: string | null;
  messageBodyEn: string;
  messageBodyTa: string;
  fullMessageBody: string;
  googleMapsUrl: string;
  fieldKitDeepLink: string;
  createdAt: string;
  initiatedAt: string | null;
  completedAt: string | null;
  deliveryDurationMs: number | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  retryCount: number;
  idempotencyKey?: string | null;
}

export interface InstantSosLatencyMetrics {
  submittedAt: string;
  persistedAt: string;
  persistDurationMs: number;
  outboxQueuedAt: string;
  fanoutStartedAt: string;
  fanoutCompletedAt: string;
  fanoutDurationMs: number;
}

export interface InstantSosResponse {
  incidentId: string;
  code: string;
  category: string;
  severity: string;
  state: string;
  isSimulated?: boolean;
  deduplicated?: boolean;
  cellId: string;
  cellLabel: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  locationQuality?: 'verified_gps' | 'low_accuracy_gps' | 'cell_qr_only' | 'missing_gps';
  qrCellValid?: boolean;
  vhfChannel: string;
  emergencyNumber: string;
  createdAt: string;
  escalationTimeoutSeconds: number;
  nexconnGroup: {
    groupId: string;
    groupName: string;
    live: boolean;
    alertCardPosted: boolean;
    error: string | null;
    memberUserIds: string[];
  };
  officialAlerts: OfficialAlertLog[];
  nearestResponders: Array<{
    id: string;
    name: string;
    station: string;
    radioCallsign: string;
    distanceMeters: number;
    etaMinutes: number;
  }>;
  bystanderChannelToken?: string;
  latency: InstantSosLatencyMetrics;
}

export interface PublicNexconnTokenResponse {
  userId: string;
  displayName: string;
  role: 'PUBLIC_SOS';
  configured: boolean;
  token: string | null;
  appKey: string | null;
  areaCode: string;
  expiresInSeconds: number;
  notice?: string;
}

export interface SosStreamEvent {
  type:
    | 'sos:instant_created'
    | 'sos:escalation_triggered'
    | 'sos:bystander_update'
    | 'alert:status_updated'
    | 'alert:acknowledged'
    | 'connected';
  organizationId: string;
  timestamp: string;
  incident?: any;
  alerts?: OfficialAlertLog[];
  alert?: OfficialAlertLog;
  bystanderUpdate?: {
    updateId: string;
    incidentId: string;
    kind: 'text' | 'voice_transcript' | 'photo';
    text: string;
    sentAt: string;
  };
  latency?: InstantSosLatencyMetrics;
}
