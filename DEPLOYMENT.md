# GuardianGrid Production Deployment Guide (Architecture A)

GuardianGrid runs as two cleanly separated tiers:

- **Frontend (Vercel):** React 19 + Vite static SPA (`dist/`).
- **Backend (Google Cloud Run):** Persistent Node.js/Express API (`dist-server/server.mjs`) hosting all `/api/*` routes, authenticated SSE (`/api/sos/stream`), and the 15-second SOS escalation loop, backed by **PostgreSQL**.

---

## 1. PostgreSQL Preparation (Non-Destructive)

Before deploying Cloud Run with `REQUIRE_POSTGRES=true`, ensure your hosted PostgreSQL database (Cloud SQL, Supabase, or Neon) has both the base schema and the `official_alert_logs` table/indexes applied:

```bash
# Base schema (idempotent CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)
psql "$DATABASE_URL" -f schema.sql

# Explicit non-destructive migration for official_alert_logs
psql "$DATABASE_URL" -f migrations/001_add_official_alert_logs.sql
```

Or using individual connection variables:

```bash
PGPASSWORD="$SQL_ADMIN_PASSWORD" psql \
  -h "$SQL_HOST" -p "${SQL_PORT:-5432}" -U "$SQL_ADMIN_USER" -d "$SQL_DB_NAME" \
  -f schema.sql -f migrations/001_add_official_alert_logs.sql
```

### Known Remaining In-Memory / Local-Fallback Gaps
1. **`bystander_updates`**: Public bystander SOS follow-up notes (`POST /api/sos/incidents/:incidentId/updates`) currently relay to Nexconn and SSE in real time and write audit entries, without a dedicated PostgreSQL `bystander_updates` history table.
2. **In-Memory Rate Limiters & Workspace Usage Counters**: `publicEndpointHits` (`server/sosInstantRoutes.ts`, `server/emergencyRoutes.ts`) and `workspaceRoutes.ts` usage counters are per-instance in memory; keep Cloud Run at `max-instances=1` or front with Cloud Armor / Redis if horizontal scaling beyond 1 instance is added later.

---

## 2. Google Cloud Run Backend Deployment

The `Dockerfile` uses `.npmrc` (`legacy-peer-deps=true`) so `@nexconn/*` packages install cleanly without altering SDK versions, builds `dist-server/server.mjs`, and listens on `0.0.0.0:$PORT` (default `8080`).

### Recommended Cloud Run Settings
- **Min instances:** `1` (keeps SSE `/api/sos/stream` and the 15-second `runEscalationSweep` active continuously without cold starts)
- **Max instances:** `1` (recommended while SSE event bus and rate limiters remain single-instance in memory)
- **Request timeout:** `3600` seconds (allows long-lived SSE `/api/sos/stream` connections)
- **Session affinity:** Recommended if scaling above 1 instance in the future
- **Startup / Liveness Probe:** HTTP `GET /healthz` (also available at `GET /api/health`) on port `8080`
- **CPU / Memory:** `1 vCPU` / `512Mi`–`1Gi`

### Example Build & Deploy Commands (Manual Execution)
```bash
# 1. Build and push container with Artifact Registry / Cloud Build
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/guardiangrid/api:latest

# 2. Deploy to Cloud Run
gcloud run deploy guardiangrid-api \
  --image REGION-docker.pkg.dev/PROJECT_ID/guardiangrid/api:latest \
  --region REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 1 \
  --max-instances 1 \
  --timeout 3600 \
  --set-env-vars "NODE_ENV=production,ALLOW_DEMO_AUTH=false,USE_JSON_FALLBACK=false,REQUIRE_POSTGRES=true,SQL_SSL=true,SQL_SSL_REJECT_UNAUTHORIZED=true,ENABLE_ALERT_SIMULATOR=true,APP_URL=https://YOUR_VERCEL_DOMAIN,BACKEND_PUBLIC_URL=https://YOUR_CLOUD_RUN_URL,FRONTEND_ORIGIN=https://YOUR_VERCEL_DOMAIN"
```
*(Store sensitive values — `GEMINI_API_KEY`, `NEXCONN_APP_SECRET`, `SQL_PASSWORD`, `TWILIO_AUTH_TOKEN`, `GOOGLE_MAPS_SERVER_API_KEY`, `SOS_CHANNEL_SECRET`, `CRON_SECRET` — in Secret Manager and attach with `--set-secrets`.)*

### Required Backend Environment Variables (Cloud Run)
- `NODE_ENV=production`
- `ALLOW_DEMO_AUTH=false`
- `APP_URL` — Exact Vercel URL (`https://your-app.vercel.app`) for SMS/WhatsApp Field Kit links & `/#/track/:token` links
- `BACKEND_PUBLIC_URL` — Exact Cloud Run URL (`https://guardiangrid-api-xxxx.run.app`) for Twilio `X-Twilio-Signature` validation
- `FRONTEND_ORIGIN` — Comma-separated exact Vercel origins (`https://your-app.vercel.app`) for strict CORS
- `SQL_HOST`, `SQL_PORT`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`
- `SQL_SSL=true`, `SQL_SSL_REJECT_UNAUTHORIZED=true` (set `false` only if using self-signed cert without CA)
- `USE_JSON_FALLBACK=false`, `REQUIRE_POSTGRES=true`
- `GEMINI_API_KEY`
- `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`, `NEXCONN_PRIMARY_API_DOMAIN`, `NEXCONN_SECONDARY_API_DOMAIN`, `NEXCONN_AREA_CODE`
- `GOOGLE_MAPS_SERVER_API_KEY`
- `SOS_CHANNEL_SECRET`, `CRON_SECRET`
- `ENABLE_ALERT_SIMULATOR` (`true` unless switching to live Twilio)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM` (when live alerts are enabled)

---

## 3. Vercel Frontend Deployment

Vercel serves **only** the static Vite SPA (`dist/`). No Express serverless entrypoint is used on Vercel.

### Vercel Project Build Settings
- **Framework Preset:** `Vite`
- **Install Command:** `npm install` (uses `.npmrc` `legacy-peer-deps=true` automatically)
- **Build Command:** `npx vite build`
- **Output Directory:** `dist`

### Required Frontend Environment Variables (Vercel)
- `VITE_API_BASE_URL` = `https://YOUR_CLOUD_RUN_URL` (no trailing slash)
- `VITE_GOOGLE_MAPS_API_KEY` = Browser Maps JavaScript API key
- `VITE_GOOGLE_MAPS_MAP_ID` = Map ID (optional, defaults to `DEMO_MAP_ID`)

---

## 4. External Provider Console Updates
1. **Firebase Console → Authentication → Settings → Authorized domains:** Add your production Vercel domain (and custom domain if any).
2. **Google Cloud Console → Maps Browser Key Restrictions:** Restrict `VITE_GOOGLE_MAPS_API_KEY` HTTP referrers to `https://YOUR_VERCEL_DOMAIN/*` (and `http://localhost:3000/*` for local dev) and limit to **Maps JavaScript API**.
3. **Twilio Console (if using live webhooks):** Point the SMS/WhatsApp status callback URL to `https://YOUR_CLOUD_RUN_URL/api/sos/webhooks/twilio`.
4. **Cloud Scheduler (optional backup):** If calling `POST https://YOUR_CLOUD_RUN_URL/api/sos/escalations/sweep`, pass header `x-cron-secret: <CRON_SECRET>`.
