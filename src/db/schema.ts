import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull().default('India'),
  region: text('region').notNull().default('Pan-India'), // Coverage scope (backward-compatible)
  areaCode: text('area_code').notNull().default('SG'),
  vhfFallbackChannel: text('vhf_fallback_channel').notNull().default('VHF Ch 16'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const regions = pgTable(
  'regions',
  {
    id: text('id').primaryKey(), // Globally unique region ID (e.g., reg-india-chennai)
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(), // Unique within an organization (e.g., TN-CHE, MH-MUM, GA-GOA, KL-KER)
    slug: text('slug').notNull(), // City/region slug matching frontend CITIES (e.g., chennai, mumbai, goa, kerala)
    name: text('name').notNull(),
    stateOrTerritory: text('state_or_territory').notNull(),
    country: text('country').notNull().default('India'),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    vhfChannel: text('vhf_channel').notNull().default('VHF Ch 16'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('regions_org_code_idx').on(table.organizationId, table.code),
    uniqueIndex('regions_org_slug_idx').on(table.organizationId, table.slug),
  ]
);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or seeded responder UID
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  defaultRegionId: text('default_region_id').references(() => regions.id, { onDelete: 'set null' }),
  authorizedRegionIdsJson: text('authorized_region_ids_json').notNull().default('[]'),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('DISPATCHER'), // ORG_ADMIN | DISPATCHER | RESPONDER | PUBLIC_SOS
  nexconnUserId: text('nexconn_user_id'),
  station: text('station'),
  qualificationsJson: text('qualifications_json').notNull().default('[]'),
  homeCellId: text('home_cell_id'),
  radioCallsign: text('radio_callsign'),
  isSimulated: boolean('is_simulated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const rescueCells = pgTable(
  'rescue_cells',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
    regionName: text('region_name').notNull().default('Chennai, Tamil Nadu'),
    cellCode: text('cell_code').notNull(),
    siteId: text('site_id').notNull(),
    siteName: text('site_name').notNull(),
    label: text('label').notNull(),
    labelTa: text('label_ta').notNull(),
    towerName: text('tower_name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    radiusMeters: integer('radius_meters').notNull().default(650),
    vhfChannel: text('vhf_channel').notNull(),
    accessLandmark: text('access_landmark').notNull(),
    isProposed: boolean('is_proposed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('rescue_cells_org_code_idx').on(table.organizationId, table.cellCode),
  ]
);

export const incidents = pgTable('incidents', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
  regionName: text('region_name').notNull().default('Chennai, Tamil Nadu'),
  code: text('code').notNull(),
  clientRequestId: text('client_request_id').unique(),
  category: text('category').notNull(), // drowning | swept_away | missing_person | medical
  severity: text('severity').notNull(), // critical | high | moderate
  state: text('state').notNull().default('UNVERIFIED'),
  isSimulated: boolean('is_simulated').notNull().default(false),
  language: text('language').notNull().default('en'),
  description: text('description').notNull(),
  reporterNameMasked: text('reporter_name_masked'),
  reporterPhoneMasked: text('reporter_phone_masked'),
  lostChildDetailsJson: text('lost_child_details_json'),
  cellId: text('cell_id').notNull(),
  cellLabel: text('cell_label').notNull(),
  siteId: text('site_id').notNull(),
  siteName: text('site_name').notNull(),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  gpsAccuracyMeters: integer('gps_accuracy_meters'),
  locationSource: text('location_source').notNull().default('manual'),
  hasPhotoAttachment: boolean('has_photo_attachment').notNull().default(false),
  photoDataUrl: text('photo_data_url'),
  hasVoiceNote: boolean('has_voice_note').notNull().default(false),
  voiceTranscript: text('voice_transcript'),
  assignedResponderIdsJson: text('assigned_responder_ids_json').notNull().default('[]'),
  assignedResponderNamesJson: text('assigned_responder_names_json').notNull().default('[]'),
  escalationJson: text('escalation_json'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: text('verified_by'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  enRouteAt: timestamp('en_route_at', { withTimezone: true }),
  onSceneAt: timestamp('on_scene_at', { withTimezone: true }),
  victimRecoveredAt: timestamp('victim_recovered_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closureSummary: text('closure_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const incidentEvents = pgTable('incident_events', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  incidentId: text('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  fromState: text('from_state'),
  toState: text('to_state'),
  clientRequestId: text('client_request_id').unique(),
  summary: text('summary').notNull(),
});

export const responderLocations = pgTable('responder_locations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
  responderId: text('responder_id').notNull().unique(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  availability: text('availability').notNull().default('available'),
  activeIncidentId: text('active_incident_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const nexconnChannels = pgTable('nexconn_channels', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  incidentId: text('incident_id')
    .notNull()
    .unique()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  channelId: text('channel_id'),
  channelName: text('channel_name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  memberUserIdsJson: text('member_user_ids_json').notNull().default('[]'),
  isLive: boolean('is_live').notNull().default(false),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const medicalHandoffReports = pgTable('medical_handoff_reports', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
  incidentId: text('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('DRAFT_PENDING_REVIEW'), // DRAFT_PENDING_REVIEW | APPROVED | REJECTED
  severity: text('severity').notNull(), // CRITICAL | HIGH | MODERATE
  severityRationale: text('severity_rationale').notNull(),
  payloadJson: text('payload_json').notNull(),
  modelUsed: text('model_used').notNull(),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  generatedByUserId: text('generated_by_user_id').notNull(),
  generatedByName: text('generated_by_name').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedByUserId: text('reviewed_by_user_id'),
  reviewedByName: text('reviewed_by_name'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),
  sharedToNexconnAt: timestamp('shared_to_nexconn_at', { withTimezone: true }),
  nexconnMessageId: text('nexconn_message_id'),
  clientRequestId: text('client_request_id').unique(),
});

export const medicalHandoffLinks = pgTable('medical_handoff_links', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  regionId: text('region_id').references(() => regions.id, { onDelete: 'set null' }),
  incidentId: text('incident_id')
    .notNull()
    .references(() => incidents.id, { onDelete: 'cascade' }),
  reportId: text('report_id')
    .notNull()
    .references(() => medicalHandoffReports.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdByUserId: text('created_by_user_id').notNull(),
  createdByName: text('created_by_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedByUserId: text('revoked_by_user_id'),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
});

export const officialAlertLogs = pgTable(
  'official_alert_logs',
  {
    id: text('id').primaryKey(),
    incidentId: text('incident_id').notNull(),
    incidentCode: text('incident_code').notNull(),
    organizationId: text('organization_id').notNull(),
    recipientId: text('recipient_id').notNull(),
    recipientName: text('recipient_name').notNull(),
    recipientRole: text('recipient_role').notNull(),
    recipientPhoneMasked: text('recipient_phone_masked').notNull(),
    channel: text('channel').notNull(),
    status: text('status').notNull(),
    isSimulated: boolean('is_simulated').notNull().default(false),
    isSandboxRecipient: boolean('is_sandbox_recipient').notNull().default(true),
    provider: text('provider').notNull(),
    providerMessageSid: text('provider_message_sid'),
    errorMessage: text('error_message'),
    messageBodyEn: text('message_body_en').notNull(),
    messageBodyTa: text('message_body_ta').notNull(),
    fullMessageBody: text('full_message_body').notNull(),
    googleMapsUrl: text('google_maps_url').notNull(),
    fieldKitDeepLink: text('field_kit_deep_link').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    initiatedAt: timestamp('initiated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    deliveryDurationMs: integer('delivery_duration_ms'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: text('acknowledged_by'),
    retryCount: integer('retry_count').notNull().default(0),
  },
  (table) => [
    index('idx_official_alert_logs_org_created').on(table.organizationId, table.createdAt.desc()),
    index('idx_official_alert_logs_incident').on(table.incidentId),
  ]
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  regions: many(regions),
  users: many(users),
  rescueCells: many(rescueCells),
  incidents: many(incidents),
}));

export const regionsRelations = relations(regions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [regions.organizationId],
    references: [organizations.id],
  }),
  rescueCells: many(rescueCells),
  incidents: many(incidents),
  responderLocations: many(responderLocations),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [incidents.organizationId],
    references: [organizations.id],
  }),
  region: one(regions, {
    fields: [incidents.regionId],
    references: [regions.id],
  }),
  events: many(incidentEvents),
  medicalHandoffReports: many(medicalHandoffReports),
  medicalHandoffLinks: many(medicalHandoffLinks),
  nexconnChannel: one(nexconnChannels, {
    fields: [incidents.id],
    references: [nexconnChannels.incidentId],
  }),
}));

export const incidentEventsRelations = relations(incidentEvents, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentEvents.incidentId],
    references: [incidents.id],
  }),
}));
