import fs from 'fs';
import path from 'path';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { createPool, isPostgresConfigured, isPostgresRequired } from '../src/db/index.ts';
import { broadcastSosEvent } from './sosEventBus.ts';
import type {
  OfficialAlertChannel,
  OfficialAlertLog,
  OfficialAlertStatus,
} from '../src/types/officialAlerts.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_FILE = path.resolve(__dirname, 'data', 'official_alert_logs.json');

let pgTableInitialized = false;

function cleanEnv(value?: string): string {
  const trimmed = (value || '').trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isStrictPostgresMode(): boolean {
  return (
    isPostgresRequired() ||
    (isPostgresConfigured() && process.env.USE_JSON_FALLBACK === 'false')
  );
}

function usePostgres(): boolean {
  if (isPostgresRequired()) {
    if (!isPostgresConfigured() || process.env.USE_JSON_FALLBACK === 'true') {
      throw new Error(
        'REQUIRE_POSTGRES=true requires SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME for official_alert_logs.'
      );
    }
    return true;
  }
  return isPostgresConfigured() && process.env.USE_JSON_FALLBACK !== 'true';
}

async function ensurePgTable(): Promise<void> {
  if (pgTableInitialized || !usePostgres()) return;
  const pool = createPool();
  await pool.query(`
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
  `);
  pgTableInitialized = true;
}

function readJsonLogs(): OfficialAlertLog[] {
  try {
    if (!fs.existsSync(LOGS_FILE)) return [];
    const raw = fs.readFileSync(LOGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonLogs(logs: OfficialAlertLog[]): void {
  const dir = path.dirname(LOGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${LOGS_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(logs.slice(0, 500), null, 2), 'utf-8');
  fs.renameSync(tmpPath, LOGS_FILE);
}

function mapPgRow(row: any): OfficialAlertLog {
  return {
    id: row.id,
    incidentId: row.incident_id,
    incidentCode: row.incident_code,
    organizationId: row.organization_id,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    recipientRole: row.recipient_role,
    recipientPhoneMasked: row.recipient_phone_masked,
    channel: row.channel,
    status: row.status,
    isSimulated: Boolean(row.is_simulated),
    isSandboxRecipient: Boolean(row.is_sandbox_recipient),
    provider: row.provider,
    providerMessageSid: row.provider_message_sid ?? null,
    errorMessage: row.error_message ?? null,
    messageBodyEn: row.message_body_en,
    messageBodyTa: row.message_body_ta,
    fullMessageBody: row.full_message_body,
    googleMapsUrl: row.google_maps_url,
    fieldKitDeepLink: row.field_kit_deep_link,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    initiatedAt: row.initiated_at
      ? row.initiated_at instanceof Date
        ? row.initiated_at.toISOString()
        : String(row.initiated_at)
      : null,
    completedAt: row.completed_at
      ? row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : String(row.completed_at)
      : null,
    deliveryDurationMs:
      typeof row.delivery_duration_ms === 'number' ? row.delivery_duration_ms : null,
    acknowledgedAt: row.acknowledged_at
      ? row.acknowledged_at instanceof Date
        ? row.acknowledged_at.toISOString()
        : String(row.acknowledged_at)
      : null,
    acknowledgedBy: row.acknowledged_by ?? null,
    retryCount: Number(row.retry_count || 0),
  };
}

async function saveAlertLog(log: OfficialAlertLog): Promise<void> {
  if (usePostgres()) {
    try {
      await ensurePgTable();
      const pool = createPool();
      await pool.query(
        `
        INSERT INTO official_alert_logs (
          id, incident_id, incident_code, organization_id,
          recipient_id, recipient_name, recipient_role, recipient_phone_masked,
          channel, status, is_simulated, is_sandbox_recipient,
          provider, provider_message_sid, error_message,
          message_body_en, message_body_ta, full_message_body,
          google_maps_url, field_kit_deep_link,
          created_at, initiated_at, completed_at, delivery_duration_ms,
          acknowledged_at, acknowledged_by, retry_count
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15,
          $16, $17, $18,
          $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          is_simulated = EXCLUDED.is_simulated,
          provider = EXCLUDED.provider,
          provider_message_sid = EXCLUDED.provider_message_sid,
          error_message = EXCLUDED.error_message,
          initiated_at = EXCLUDED.initiated_at,
          completed_at = EXCLUDED.completed_at,
          delivery_duration_ms = EXCLUDED.delivery_duration_ms,
          acknowledged_at = EXCLUDED.acknowledged_at,
          acknowledged_by = EXCLUDED.acknowledged_by,
          retry_count = EXCLUDED.retry_count
        `,
        [
          log.id,
          log.incidentId,
          log.incidentCode,
          log.organizationId,
          log.recipientId,
          log.recipientName,
          log.recipientRole,
          log.recipientPhoneMasked,
          log.channel,
          log.status,
          log.isSimulated,
          log.isSandboxRecipient,
          log.provider,
          log.providerMessageSid,
          log.errorMessage,
          log.messageBodyEn,
          log.messageBodyTa,
          log.fullMessageBody,
          log.googleMapsUrl,
          log.fieldKitDeepLink,
          log.createdAt,
          log.initiatedAt,
          log.completedAt,
          log.deliveryDurationMs,
          log.acknowledgedAt,
          log.acknowledgedBy,
          log.retryCount,
        ]
      );
      return;
    } catch (err: any) {
      if (isStrictPostgresMode()) {
        throw err;
      }
      console.warn('Postgres official_alert_logs write fell back to JSON:', err?.message);
    }
  }

  const all = readJsonLogs();
  const idx = all.findIndex((item) => item.id === log.id);
  if (idx >= 0) {
    all[idx] = log;
  } else {
    all.unshift(log);
  }
  writeJsonLogs(all);
}

export async function listOfficialAlertLogs(
  organizationId: string,
  incidentId?: string
): Promise<OfficialAlertLog[]> {
  if (usePostgres()) {
    try {
      await ensurePgTable();
      const pool = createPool();
      const query = incidentId
        ? `SELECT * FROM official_alert_logs WHERE organization_id = $1 AND incident_id = $2 ORDER BY created_at DESC LIMIT 100`
        : `SELECT * FROM official_alert_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100`;
      const params = incidentId ? [organizationId, incidentId] : [organizationId];
      const result = await pool.query(query, params);
      return result.rows.map(mapPgRow);
    } catch (err: any) {
      if (isStrictPostgresMode()) {
        throw err;
      }
      console.warn('Postgres official_alert_logs read fell back to JSON:', err?.message);
    }
  }

  const all = readJsonLogs();
  return all.filter(
    (log) =>
      log.organizationId === organizationId &&
      (!incidentId || log.incidentId === incidentId)
  );
}

export async function getOfficialAlertLogById(
  organizationId: string,
  logId: string
): Promise<OfficialAlertLog | null> {
  const logs = await listOfficialAlertLogs(organizationId);
  return logs.find((l) => l.id === logId) || null;
}

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length <= 4) return '****';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function getTwilioChannelConfig() {
  const accountSid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const authToken = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  const smsFrom = cleanEnv(process.env.TWILIO_FROM_NUMBER);
  const whatsappFromRaw = cleanEnv(process.env.TWILIO_WHATSAPP_FROM);
  const simulatorFlag = cleanEnv(process.env.ENABLE_ALERT_SIMULATOR).toLowerCase();

  const smsConfigured = Boolean(accountSid && authToken && smsFrom);
  // WhatsApp requires an explicit WhatsApp-enabled Twilio sender (never silently assume SMS sender supports WhatsApp)
  const whatsappConfigured = Boolean(
    accountSid &&
      authToken &&
      whatsappFromRaw &&
      whatsappFromRaw.toLowerCase().startsWith('whatsapp:')
  );
  // Default to simulator enabled when Twilio SMS credentials are not configured, unless explicitly set to 'false'
  const simulatorEnabled =
    simulatorFlag === 'true' || (!smsConfigured && simulatorFlag !== 'false');

  return {
    accountSid,
    authToken,
    smsFrom,
    whatsappFrom: whatsappFromRaw,
    smsConfigured,
    whatsappConfigured,
    simulatorEnabled,
  };
}

export interface OfficialRecipient {
  id: string;
  name: string;
  role: 'RESPONDER' | 'DISPATCHER' | 'SUPERVISOR' | 'AMBULANCE_CONTROL';
  phoneE164: string;
  isSandbox: boolean;
}

const CATEGORY_BILINGUAL: Record<string, { en: string; ta: string }> = {
  drowning: { en: 'DROWNING', ta: 'நீரில் மூழ்குதல்' },
  swept_away: { en: 'SWEPT-AWAY SWIMMER', ta: 'அலையில் இழுத்துச் செல்லப்பட்டவர்' },
  missing_person: { en: 'MISSING PERSON', ta: 'காணாமல் போனவர்' },
  medical: { en: 'MEDICAL EMERGENCY', ta: 'மருத்துவ அவசரம்' },
};

export function composeBilingualOfficialAlert(params: {
  incidentId: string;
  incidentCode: string;
  category: string;
  cellLabel: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  appBaseUrl: string;
  reportedAt?: string;
  incidentState?: string;
}): {
  messageBodyEn: string;
  messageBodyTa: string;
  fullMessageBody: string;
  googleMapsUrl: string;
  fieldKitDeepLink: string;
} {
  const cat = CATEGORY_BILINGUAL[params.category] || {
    en: params.category.toUpperCase(),
    ta: 'அவசரநிலை',
  };
  const latStr = typeof params.lat === 'number' ? params.lat.toFixed(5) : '13.05000';
  const lonStr = typeof params.lon === 'number' ? params.lon.toFixed(5) : '80.28240';
  const googleMapsUrl = `https://maps.google.com/?q=${latStr},${lonStr}`;
  const timestampIso = params.reportedAt || new Date().toISOString();
  const statusLabel = params.incidentState || 'UNVERIFIED';

  // Reuse actual existing HashRouter Field Kit route: /#/field-kit?incidentId={id}
  const cleanBase = params.appBaseUrl.replace(/\/+$/, '');
  const fieldKitDeepLink = `${cleanBase}/#/field-kit?incidentId=${encodeURIComponent(params.incidentId)}`;

  const messageBodyEn = [
    `[CRITICAL SOS · ${statusLabel}] ${cat.en} — ${params.incidentCode}`,
    `Beach / Cell: ${params.siteName} — ${params.cellLabel}`,
    `GPS: ${latStr}, ${lonStr} (${googleMapsUrl})`,
    `Time (UTC): ${timestampIso}`,
    `Open Field Kit & War Room: ${fieldKitDeepLink}`,
  ].join('\n');

  const messageBodyTa = [
    `[அவசர SOS · ${statusLabel}] ${cat.ta} — ${params.incidentCode}`,
    `கடற்கரை / மீட்பு பகுதி: ${params.siteName} — ${params.cellLabel}`,
    `இருப்பிடம் (GPS): ${latStr}, ${lonStr} (${googleMapsUrl})`,
    `நேரம் (UTC): ${timestampIso}`,
    `பணியாளர் தளம்: ${fieldKitDeepLink}`,
  ].join('\n');

  const fullMessageBody = `${messageBodyEn}\n---\n${messageBodyTa}`;

  return {
    messageBodyEn,
    messageBodyTa,
    fullMessageBody,
    googleMapsUrl,
    fieldKitDeepLink,
  };
}

/**
 * Step 1 (Durable Outbox): Persists QUEUED official_alert_logs rows BEFORE external delivery begins.
 */
export async function queueOfficialAlertOutbox(params: {
  incidentId: string;
  incidentCode: string;
  organizationId: string;
  category: string;
  cellLabel: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  appBaseUrl: string;
  reportedAt?: string;
  incidentState?: string;
  recipients: OfficialRecipient[];
}): Promise<Array<{ log: OfficialAlertLog; rawPhone: string; deduplicated?: boolean }>> {
  const composed = composeBilingualOfficialAlert(params);
  const channels: OfficialAlertChannel[] = ['sms', 'whatsapp'];
  const createdAt = new Date().toISOString();
  const existingLogs = await listOfficialAlertLogs(params.organizationId, params.incidentId);
  const queued: Array<{ log: OfficialAlertLog; rawPhone: string; deduplicated?: boolean }> = [];

  for (const recipient of params.recipients) {
    for (const channel of channels) {
      const idempotencyKey = `${params.incidentId}:${recipient.id}:${channel}`;
      const existing = existingLogs.find(
        (l) =>
          l.idempotencyKey === idempotencyKey ||
          (l.incidentId === params.incidentId &&
            l.recipientId === recipient.id &&
            l.channel === channel)
      );
      if (existing) {
        queued.push({ log: existing, rawPhone: recipient.phoneE164, deduplicated: true });
        continue;
      }

      const log: OfficialAlertLog = {
        id: `alt-${randomUUID().slice(0, 12)}`,
        idempotencyKey,
        incidentId: params.incidentId,
        incidentCode: params.incidentCode,
        organizationId: params.organizationId,
        recipientId: recipient.id,
        recipientName: recipient.name,
        recipientRole: recipient.role,
        recipientPhoneMasked: maskPhoneNumber(recipient.phoneE164),
        channel,
        status: 'QUEUED',
        isSimulated: false,
        isSandboxRecipient: recipient.isSandbox,
        provider: 'none',
        providerMessageSid: null,
        errorMessage: null,
        messageBodyEn: composed.messageBodyEn,
        messageBodyTa: composed.messageBodyTa,
        fullMessageBody: composed.fullMessageBody,
        googleMapsUrl: composed.googleMapsUrl,
        fieldKitDeepLink: composed.fieldKitDeepLink,
        createdAt,
        initiatedAt: null,
        completedAt: null,
        deliveryDurationMs: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        retryCount: 0,
      };
      await saveAlertLog(log);
      queued.push({ log, rawPhone: recipient.phoneE164, deduplicated: false });
    }
  }

  return queued;
}

async function sendViaTwilioRest(params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<{ sid: string; status: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    params.accountSid
  )}/Messages.json`;
  const auth = Buffer.from(`${params.accountSid}:${params.authToken}`).toString('base64');
  const form = new URLSearchParams({
    From: params.from,
    To: params.to,
    Body: params.body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(data?.message || `Twilio HTTP ${response.status}`);
  }
  return {
    sid: String(data?.sid || ''),
    status: String(data?.status || 'queued'),
  };
}

/**
 * Step 2 (Independent Channel Delivery): Dispatches queued outbox rows independently
 * for SMS and WhatsApp. Never sends real provider messages to sandbox test recipients.
 */
export async function deliverQueuedAlert(
  log: OfficialAlertLog,
  rawPhone: string,
  options?: { forceSandbox?: boolean }
): Promise<OfficialAlertLog> {
  const config = getTwilioChannelConfig();
  const startedMs = Date.now();
  const initiatedAt = new Date(startedMs).toISOString();

  const isSandbox = Boolean(options?.forceSandbox || log.isSandboxRecipient);

  let nextStatus: OfficialAlertStatus = 'FAILED';
  let isSimulated = false;
  let provider: OfficialAlertLog['provider'] = 'none';
  let providerMessageSid: string | null = null;
  let errorMessage: string | null = null;

  if (log.channel === 'whatsapp') {
    if (isSandbox || (config.simulatorEnabled && !config.whatsappConfigured)) {
      nextStatus = 'SIMULATED';
      isSimulated = true;
      provider = 'simulator';
      providerMessageSid = `SIM-WA-${randomUUID().slice(0, 10).toUpperCase()}`;
      errorMessage = config.whatsappConfigured
        ? null
        : 'Simulator mode active (TWILIO_WHATSAPP_FROM not configured yet). Payload recorded in official_alert_logs as SIMULATED.';
    } else if (!config.whatsappConfigured) {
      nextStatus = 'NOT_CONFIGURED';
      isSimulated = false;
      provider = 'none';
      errorMessage =
        'TWILIO_WHATSAPP_FROM (whatsapp:+...) is not configured on the backend and ENABLE_ALERT_SIMULATOR=false.';
    } else {
      try {
        const toWhatsApp = rawPhone.startsWith('whatsapp:') ? rawPhone : `whatsapp:${rawPhone}`;
        const result = await sendViaTwilioRest({
          accountSid: config.accountSid,
          authToken: config.authToken,
          from: config.whatsappFrom,
          to: toWhatsApp,
          body: log.fullMessageBody,
        });
        // Twilio POST /Messages.json only confirms provider acceptance; DELIVERED requires verified webhook callback
        nextStatus = 'PROVIDER_ACCEPTED';
        isSimulated = false;
        provider = 'twilio';
        providerMessageSid = result.sid;
      } catch (err: any) {
        nextStatus = 'FAILED';
        provider = 'twilio';
        errorMessage = err?.message || 'Twilio WhatsApp delivery failed';
      }
    }
  } else {
    // Independent SMS channel
    if (isSandbox || (config.simulatorEnabled && !config.smsConfigured)) {
      nextStatus = 'SIMULATED';
      isSimulated = true;
      provider = 'simulator';
      providerMessageSid = `SIM-SMS-${randomUUID().slice(0, 10).toUpperCase()}`;
      errorMessage = config.smsConfigured
        ? null
        : 'Simulator mode active (TWILIO_* credentials not configured yet). Payload recorded in official_alert_logs as SIMULATED.';
    } else if (!config.smsConfigured) {
      nextStatus = 'NOT_CONFIGURED';
      isSimulated = false;
      provider = 'none';
      errorMessage =
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER is not configured and ENABLE_ALERT_SIMULATOR=false.';
    } else {
      try {
        const result = await sendViaTwilioRest({
          accountSid: config.accountSid,
          authToken: config.authToken,
          from: config.smsFrom,
          to: rawPhone,
          body: log.fullMessageBody,
        });
        // Twilio POST /Messages.json only confirms provider acceptance; DELIVERED requires verified webhook callback
        nextStatus = 'PROVIDER_ACCEPTED';
        isSimulated = false;
        provider = 'twilio';
        providerMessageSid = result.sid;
      } catch (err: any) {
        nextStatus = 'FAILED';
        provider = 'twilio';
        errorMessage = err?.message || 'Twilio SMS delivery failed';
      }
    }
  }

  const completedMs = Date.now();
  const updated: OfficialAlertLog = {
    ...log,
    status: nextStatus,
    isSimulated,
    provider,
    providerMessageSid,
    errorMessage,
    initiatedAt,
    completedAt: new Date(completedMs).toISOString(),
    deliveryDurationMs: Math.max(0, completedMs - startedMs),
  };

  await saveAlertLog(updated);
  broadcastSosEvent({
    type: 'alert:status_updated',
    organizationId: updated.organizationId,
    timestamp: updated.completedAt!,
    alert: updated,
  });

  return updated;
}

export async function acknowledgeOfficialAlert(params: {
  organizationId: string;
  logId: string;
  actorName: string;
}): Promise<OfficialAlertLog | null> {
  const existing = await getOfficialAlertLogById(params.organizationId, params.logId);
  if (!existing) return null;

  const updated: OfficialAlertLog = {
    ...existing,
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: params.actorName,
  };
  await saveAlertLog(updated);
  broadcastSosEvent({
    type: 'alert:acknowledged',
    organizationId: updated.organizationId,
    timestamp: updated.acknowledgedAt!,
    alert: updated,
  });
  return updated;
}

export async function retryOfficialAlert(params: {
  organizationId: string;
  logId: string;
}): Promise<OfficialAlertLog | null> {
  const existing = await getOfficialAlertLogById(params.organizationId, params.logId);
  if (!existing) return null;

  const cfg = getTwilioChannelConfig();
  const nextRetryCount = existing.retryCount + 1;
  const incremented: OfficialAlertLog = {
    ...existing,
    retryCount: nextRetryCount,
  };

  // Never send real provider messages to a hardcoded placeholder phone when raw phone is masked at rest.
  // In simulator/sandbox mode (or when Twilio is unconfigured), retry safely in simulator mode.
  const mustSimulate =
    existing.isSandboxRecipient ||
    existing.isSimulated ||
    cfg.simulatorEnabled ||
    (existing.channel === 'sms' ? !cfg.smsConfigured : !cfg.whatsappConfigured);

  if (mustSimulate) {
    return deliverQueuedAlert(incremented, '+15005550006', { forceSandbox: true });
  }

  // Real-provider retry requires a verified stored phone; mark as FAILED with escalation guidance rather than calling a dummy number
  const failedRetry: OfficialAlertLog = {
    ...incremented,
    status: 'FAILED',
    errorMessage:
      'Recipient phone is masked at rest; manual redelivery via Command Center or alternate channel (VHF / 112) required.',
    completedAt: new Date().toISOString(),
  };
  await saveAlertLog(failedRetry);
  broadcastSosEvent({
    type: 'alert:status_updated',
    organizationId: failedRetry.organizationId,
    timestamp: failedRetry.completedAt!,
    alert: failedRetry,
  });
  return failedRetry;
}

/**
 * Verifies Twilio webhook X-Twilio-Signature header using HMAC-SHA1 per Twilio spec.
 */
export function verifyTwilioSignature(params: {
  url: string;
  bodyParams: Record<string, string>;
  signatureHeader: string;
  authToken: string;
}): boolean {
  if (!params.signatureHeader || !params.authToken) return false;
  const sortedKeys = Object.keys(params.bodyParams).sort();
  let data = params.url;
  for (const key of sortedKeys) {
    data += key + (params.bodyParams[key] ?? '');
  }
  const expected = createHmac('sha1', params.authToken).update(data, 'utf8').digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(params.signatureHeader.trim(), 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Updates official_alert_logs status from a verified Twilio delivery status webhook callback.
 */
export async function handleTwilioStatusWebhook(params: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<OfficialAlertLog | null> {
  const sid = params.messageSid.trim();
  if (!sid) return null;

  const statusLower = params.messageStatus.trim().toLowerCase();
  const mappedStatus: OfficialAlertStatus =
    statusLower === 'delivered' || statusLower === 'read'
      ? 'DELIVERED'
      : statusLower === 'sent'
        ? 'SENT'
        : statusLower === 'queued' || statusLower === 'accepted' || statusLower === 'sending'
          ? 'PROVIDER_ACCEPTED'
          : statusLower === 'failed' || statusLower === 'undelivered'
            ? 'FAILED'
            : 'PROVIDER_ACCEPTED';

  let target: OfficialAlertLog | null = null;
  if (usePostgres()) {
    try {
      await ensurePgTable();
      const pool = createPool();
      const result = await pool.query(
        `SELECT * FROM official_alert_logs WHERE provider_message_sid = $1 LIMIT 1`,
        [sid]
      );
      if (result.rows.length > 0) {
        target = mapPgRow(result.rows[0]);
      }
    } catch (err: any) {
      if (isStrictPostgresMode()) {
        throw err;
      }
      console.warn('Postgres webhook lookup fell back to JSON:', err?.message);
    }
  }

  if (!target) {
    const all = readJsonLogs();
    target = all.find((l) => l.providerMessageSid === sid) || null;
  }
  if (!target) return null;

  const nowIso = new Date().toISOString();
  const updated: OfficialAlertLog = {
    ...target,
    status: mappedStatus,
    errorMessage:
      mappedStatus === 'FAILED'
        ? params.errorMessage || (params.errorCode ? `Twilio error ${params.errorCode}` : 'Delivery failed')
        : target.errorMessage,
    completedAt: nowIso,
  };
  await saveAlertLog(updated);
  broadcastSosEvent({
    type: 'alert:status_updated',
    organizationId: updated.organizationId,
    timestamp: nowIso,
    alert: updated,
  });
  return updated;
}
