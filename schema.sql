-- GuardianGrid Multi-Tenant, Multi-Region PostgreSQL Schema
-- Compatible with Google Cloud SQL (PostgreSQL), Supabase, and Neon.
-- Supports 4 RBAC roles: ORG_ADMIN, DISPATCHER, RESPONDER, PUBLIC_SOS.
-- Supports 1 organization -> N geographical regions (Pan-India & additional independent organizations).

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  region TEXT NOT NULL DEFAULT 'Pan-India',
  area_code TEXT NOT NULL DEFAULT 'SG',
  vhf_fallback_channel TEXT NOT NULL DEFAULT 'VHF Ch 16',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  state_or_territory TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  vhf_channel TEXT NOT NULL DEFAULT 'VHF Ch 16',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS regions_org_code_idx
  ON regions (organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS regions_org_slug_idx
  ON regions (organization_id, slug);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  default_region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  authorized_region_ids_json TEXT NOT NULL DEFAULT '[]',
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'DISPATCHER'
    CHECK (role IN ('ORG_ADMIN', 'DISPATCHER', 'RESPONDER', 'PUBLIC_SOS')),
  nexconn_user_id TEXT,
  station TEXT,
  qualifications_json TEXT NOT NULL DEFAULT '[]',
  home_cell_id TEXT,
  radio_callsign TEXT,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users (organization_id, role);
CREATE INDEX IF NOT EXISTS idx_users_default_region
  ON users (default_region_id);

CREATE TABLE IF NOT EXISTS rescue_cells (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  region_name TEXT NOT NULL DEFAULT 'Chennai, Tamil Nadu',
  cell_code TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  label TEXT NOT NULL,
  label_ta TEXT NOT NULL,
  tower_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 650,
  vhf_channel TEXT NOT NULL,
  access_landmark TEXT NOT NULL,
  is_proposed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rescue_cells_org_code_idx
  ON rescue_cells (organization_id, cell_code);
CREATE INDEX IF NOT EXISTS idx_rescue_cells_org_region
  ON rescue_cells (organization_id, region_id);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  region_name TEXT NOT NULL DEFAULT 'Chennai, Tamil Nadu',
  code TEXT NOT NULL,
  client_request_id TEXT UNIQUE,
  category TEXT NOT NULL
    CHECK (category IN ('drowning', 'swept_away', 'missing_person', 'medical')),
  severity TEXT NOT NULL
    CHECK (severity IN ('critical', 'high', 'moderate')),
  state TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (state IN (
      'UNVERIFIED', 'VERIFIED', 'DISPATCHED', 'EN_ROUTE',
      'ON_SCENE', 'VICTIM_RECOVERED', 'MEDICAL_HANDOFF', 'RESOLVED', 'REJECTED'
    )),
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  language TEXT NOT NULL DEFAULT 'en',
  description TEXT NOT NULL,
  reporter_name_masked TEXT,
  reporter_phone_masked TEXT,
  lost_child_details_json TEXT,
  cell_id TEXT NOT NULL,
  cell_label TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  gps_accuracy_meters INTEGER,
  location_source TEXT NOT NULL DEFAULT 'manual',
  has_photo_attachment BOOLEAN NOT NULL DEFAULT FALSE,
  photo_data_url TEXT,
  has_voice_note BOOLEAN NOT NULL DEFAULT FALSE,
  voice_transcript TEXT,
  assigned_responder_ids_json TEXT NOT NULL DEFAULT '[]',
  assigned_responder_names_json TEXT NOT NULL DEFAULT '[]',
  escalation_json TEXT,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  dispatched_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  on_scene_at TIMESTAMPTZ,
  victim_recovered_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closure_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_org_region_created
  ON incidents (organization_id, region_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_org_state
  ON incidents (organization_id, state);

CREATE TABLE IF NOT EXISTS incident_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  client_request_id TEXT UNIQUE,
  summary TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_events_incident_ts
  ON incident_events (incident_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS responder_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  responder_id TEXT NOT NULL UNIQUE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available',
  active_incident_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_responder_locations_org_region
  ON responder_locations (organization_id, region_id);

CREATE TABLE IF NOT EXISTS nexconn_channels (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  channel_id TEXT,
  channel_name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  member_user_ids_json TEXT NOT NULL DEFAULT '[]',
  is_live BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medical_handoff_reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT_PENDING_REVIEW'
    CHECK (status IN ('DRAFT_PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MODERATE')),
  severity_rationale TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  model_used TEXT NOT NULL,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  generated_by_user_id TEXT NOT NULL,
  generated_by_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_user_id TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  shared_to_nexconn_at TIMESTAMPTZ,
  nexconn_message_id TEXT,
  client_request_id TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_medical_handoff_reports_org_inc
  ON medical_handoff_reports (organization_id, incident_id, version DESC);

CREATE TABLE IF NOT EXISTS medical_handoff_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES medical_handoff_reports(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_medical_handoff_links_org_inc
  ON medical_handoff_links (organization_id, incident_id);

CREATE TABLE IF NOT EXISTS official_alert_logs (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  incident_code TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  recipient_phone_masked TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  is_sandbox_recipient BOOLEAN NOT NULL DEFAULT TRUE,
  provider TEXT NOT NULL,
  provider_message_sid TEXT,
  error_message TEXT,
  message_body_en TEXT NOT NULL,
  message_body_ta TEXT NOT NULL,
  full_message_body TEXT NOT NULL,
  google_maps_url TEXT NOT NULL,
  field_kit_deep_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delivery_duration_ms INTEGER,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_official_alert_logs_org_created
  ON official_alert_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_alert_logs_incident
  ON official_alert_logs (incident_id);

-- ============================================================================
-- Safe Transactional Migration: org-chennai-coastal -> org-guardian-grid-india
-- (Idempotent; preserves all existing Chennai rescue cells, responders, incidents)
-- ============================================================================
-- BEGIN;
--   INSERT INTO organizations (id, slug, name, country, region, area_code, vhf_fallback_channel)
--   VALUES ('org-guardian-grid-india', 'guardian-grid-india', 'GuardianGrid India Coastal Safety', 'India', 'Pan-India', 'SG', 'VHF Ch 16')
--   ON CONFLICT (id) DO NOTHING;
--
--   INSERT INTO regions (id, organization_id, code, slug, name, state_or_territory, country, lat, lon, vhf_channel)
--   VALUES
--     ('reg-india-chennai', 'org-guardian-grid-india', 'TN-CHE', 'chennai', 'Chennai', 'Tamil Nadu', 'India', 13.0827, 80.2707, 'VHF Ch 16 / Marine-01'),
--     ('reg-india-mumbai',  'org-guardian-grid-india', 'MH-MUM', 'mumbai',  'Mumbai',  'Maharashtra', 'India', 19.0760, 72.8777, 'VHF Ch 16 / Mumbai-Port'),
--     ('reg-india-goa',     'org-guardian-grid-india', 'GA-GOA', 'goa',     'Goa Coast', 'Goa', 'India', 15.4909, 73.8278, 'VHF Ch 16 / Goa-Coast'),
--     ('reg-india-kerala',  'org-guardian-grid-india', 'KL-KER', 'kerala',  'Kerala Coast', 'Kerala', 'India', 8.4004, 76.9787, 'VHF Ch 16 / Kerala-Coast')
--   ON CONFLICT (id) DO NOTHING;
--
--   UPDATE rescue_cells        SET organization_id = 'org-guardian-grid-india', region_id = COALESCE(region_id, 'reg-india-chennai'), region_name = COALESCE(NULLIF(region_name, ''), 'Chennai, Tamil Nadu') WHERE organization_id = 'org-chennai-coastal';
--   UPDATE users               SET organization_id = 'org-guardian-grid-india', default_region_id = COALESCE(default_region_id, 'reg-india-chennai'), authorized_region_ids_json = CASE WHEN authorized_region_ids_json = '[]' THEN '["reg-india-chennai","reg-india-mumbai","reg-india-goa","reg-india-kerala"]' ELSE authorized_region_ids_json END WHERE organization_id = 'org-chennai-coastal';
--   UPDATE responder_locations SET organization_id = 'org-guardian-grid-india', region_id = COALESCE(region_id, 'reg-india-chennai') WHERE organization_id = 'org-chennai-coastal';
--   UPDATE incidents           SET organization_id = 'org-guardian-grid-india', region_id = COALESCE(region_id, 'reg-india-chennai'), region_name = COALESCE(NULLIF(region_name, ''), 'Chennai, Tamil Nadu') WHERE organization_id = 'org-chennai-coastal';
--   UPDATE incident_events     SET organization_id = 'org-guardian-grid-india' WHERE organization_id = 'org-chennai-coastal';
--   UPDATE nexconn_channels    SET organization_id = 'org-guardian-grid-india' WHERE organization_id = 'org-chennai-coastal';
-- COMMIT;
