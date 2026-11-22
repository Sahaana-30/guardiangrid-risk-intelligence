# GuardianGrid – Hackathon Changelog

This changelog clearly distinguishes **original GuardianGrid platform capabilities** from the **newly engineered capabilities built across Phases 1–7**.

---

## Original GuardianGrid Capabilities (Pre-Hackathon Baseline)

The baseline GuardianGrid application provided water-safety analytics and coastal risk intelligence:

- **Risk Intelligence Map (`/map`)**: Interactive Leaflet + Esri satellite map displaying coastal risk zones, shoreline layers, and hazard overlays.
- **Predictive Risk & Analytics Suite**:
  - 7-day coastal risk forecasting (`/forecast`).
  - Quantitative risk scoring and factor breakdown (`/analytics`).
  - SHAP feature explainability (`/explainability`).
  - Zone clustering and fairness analysis (`/clustering`).
  - Intelligence reports (`/reports`).
  - Operational overview dashboard (`/`) and baseline incident/settings views (`/incidents`, `/settings`).
- **Guardian Analyst (`/analyst`)**: AI-assisted coastal risk query interface powered by `@google/genai`.
- **Baseline Coastal Regions**: Reference coastal datasets (including Marina Beach / Chennai, Sydney, Miami).

---

## Newly Engineered Capabilities (Phases 1–7)

### Phase 1 – Multi-Tenant & Multi-Region Cloud SQL Architecture + RBAC
- Provisioned **Google Cloud SQL (PostgreSQL)** with Drizzle ORM schema (`src/db/schema.ts`) for multi-tenant, multi-region emergency operations.
- Expanded India multi-region operational coverage: **Chennai**, **Mumbai**, **Goa**, and **Kerala** (preserving existing frontend coastal intelligence regions).
- Integrated **Firebase Authentication** and 4-role RBAC (`ORG_ADMIN`, `DISPATCHER`, `RESPONDER`, `PUBLIC_SOS`) via server-side middleware (`src/middleware/auth.ts`).
- Implemented strict tenant isolation (`organizationId` / `x-gg-org-id`) across operational queries and mutations.

### Phase 2 – Public QR SOS Intake & Dispatcher Command Center
- Built lightweight **Public Emergency SOS Portal (`/sos`)** supporting QR rescue-cell deep links, GPS coordinates, victim count, distress description, and emergency submission without heavy map bundles.
- Built **Dispatcher Command Center (`/command`)** with real-time incident queue, verification workflow, rescue-cell mapping, escalation timers, responder allocation, and immutable incident audit trail.
- Enforced server-side incident state-machine transitions (`REPORTED` → `VERIFIED` → `DISPATCHED` → `EN_ROUTE` → `ON_SCENE` → `VICTIM_RECOVERED` → `HANDED_OVER` → `RESOLVED`).

### Phase 3 – Real-Time Communications (Nexconn Integration)
- Integrated **Nexconn Web Chat, UI, and Call SDKs** for per-incident responder group channels, real-time messaging, voice notes, and audio/video calls.
- Added server-side Nexconn token/channel orchestration endpoints with RBAC enforcement and graceful fallback behavior when Nexconn credentials are not configured.

### Phase 4 – Mobile Responder Field Kit (`/field-kit`)
- Built mobile-first, high-contrast outdoor-readable **Responder Field Kit** with **Glove Mode** (oversized touch targets for wet/outdoor use).
- Added one-tap status progression controls (`EN_ROUTE`, `ON_SCENE`, `VICTIM_RECOVERED`, `REQUEST_BACKUP`).
- Added live GPS telemetry synchronization, offline action queueing, and embedded Nexconn incident chat/call controls.

### Phase 5 – AI Medical SBAR & Ambulance Handoff Pipeline
- Created `POST /api/incidents/:id/medical-handoff` powered by **Google Gemini (`@google/genai`)** with structured JSON output generating **bilingual English + Tamil SBAR** (Situation, Background, Assessment, Recommendation) medical handoff briefs.
- Enforced clinical safety guardrails: clearly separates responder-reported facts, environmental/sensor context, and AI-synthesized summary; requires fresh dispatcher approval per version before external sharing; preserves full version history.
- Built secure read-only **Public Paramedic Tracking View (`/#/track/:token`)** with server-side token validation, rate limiting, `Cache-Control: no-store`, referrer protection, minimal responder location exposure, and immediate termination on expiry/revocation.

### Phase 6 – Google Maps Platform Integration (Primary + Automatic Leaflet Fallback)
- Integrated **Google Maps Platform** via `@vis.gl/react-google-maps` as the primary emergency map on:
  - Command Center (`src/components/emergency/CommandIncidentMap.tsx`)
  - Responder Field Kit (`src/pages/ResponderFieldKit.tsx`)
  - Public Paramedic Tracking (`src/pages/PublicParamedicTrack.tsx`)
- Preserved the original **Leaflet + Esri Risk Intelligence Map (`/map`)** untouched and kept **Public SOS (`/sos`)** lightweight.
- Retained **automatic Leaflet fallback** when Google Maps fails to load or is unconfigured.
- Built authenticated server-side Google Maps proxy (`server/mapsRoutes.ts`) exposing `/api/maps/health`, `/api/maps/nearby-hospitals`, `/api/maps/route`, `/api/maps/eta-matrix`, and `/api/maps/reverse-geocode` with RBAC, region scoping, rate limiting, and ephemeral in-memory TTL caching.

### Phase 7 – Commercial SaaS & Hackathon Readiness
- **White-Label Workspace Switcher (`src/pages/WorkspaceSettings.tsx`, `/workspace`)**:
  - Three configurable demo tenant workspaces: **Marina Beach Municipal Command**, **ECR Coastal Resort & Waterpark**, and **Chennai Port Maritime Safety**.
  - Organization-specific branding, colors, logo badge, dashboard identity, region/geofence configuration, and active workspace sidebar indicator (`src/components/AppShell.tsx`).
  - Strict tenant isolation: switching workspaces updates `x-gg-org-id` across API clients and clears/reloads in-memory emergency state immediately.
- **SaaS Subscription & Usage Dashboard (`/workspace`)**:
  - Plan comparison and preview between **Starter** and **Enterprise Port / Resort** tiers (no real payment processing or billing charges).
  - Clearly separates **instrumented live PostgreSQL & server runtime metrics** (`GET /api/workspace/usage`) from **clearly labeled simulated demo quotas/history** for Nexconn and Gemini usage.
- **Hidden Admin-Only 9-Step Emergency Simulation (`/workspace`)**:
  - Accessible exclusively to `ORG_ADMIN` (enforced server-side via `requireRole(['ORG_ADMIN'])` on `GET/POST /api/workspace/simulation*`).
  - Runs a synthetic 9-step end-to-end scenario inside isolated tenant `org-demo-simulation-sandbox` (risk spike → synthetic QR SOS → verification → sandbox Nexconn channel → responder assignment → status progression → Gemini bilingual SBAR handoff → resolution → audit timeline) with reset and replay.
  - Never creates real public SOS records, never contacts 112, and never dispatches real responders or publishes real patient data.
