-- Non-destructive migration: Ensure official_alert_logs table and indexes exist
-- Run manually against your hosted PostgreSQL instance before or during Cloud Run cutover.
-- Safe and idempotent: never drops tables or deletes rows.

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
