# GuardianGrid – Water Safety, Emergency Intelligence & Rescue Coordination Platform

GuardianGrid is a multi-tenant, multi-region coastal safety and emergency rescue coordination platform combining predictive water-risk intelligence with real-time emergency dispatch, mobile responder field operations, AI-assisted bilingual medical handoff, and Google Maps Platform routing.

---

## Original vs. Newly Engineered Capabilities

For a detailed phase-by-phase breakdown, see [`HACKATHON_CHANGELOG.md`](./HACKATHON_CHANGELOG.md).

- **Original Baseline**: Leaflet + Esri coastal Risk Intelligence Map (`/map`), 7-day forecasting (`/forecast`), risk analytics (`/analytics`), SHAP explainability (`/explainability`), clustering & fairness (`/clustering`), reports (`/reports`), and Guardian Analyst (`/analyst`).
- **Newly Engineered (Phases 1–7)**:
  - Multi-tenant, multi-region **Google Cloud SQL (PostgreSQL)** backend (`Chennai`, `Mumbai`, `Goa`, `Kerala`) + **Firebase Auth** & 4-role RBAC (`ORG_ADMIN`, `DISPATCHER`, `RESPONDER`, `PUBLIC_SOS`).
  - **Public QR SOS Portal (`/sos`)** and **Dispatcher Command Center (`/command`)** with state-machine enforcement and audit logs.
  - **Nexconn** per-incident group chat, voice notes, and audio/video calls.
  - **Mobile Responder Field Kit (`/field-kit`)** with outdoor high-contrast **Glove Mode**, live GPS sync, and offline action queue.
  - **AI Medical Handoff Pipeline**: Gemini-generated bilingual **English + Tamil SBAR** reports with versioned dispatcher approval and secure read-only **Public Paramedic Tracking (`/#/track/:token`)**.
  - **Google Maps Platform** (`@vis.gl/react-google-maps`) primary emergency maps with **automatic Leaflet fallback**, plus server-side Places/Routes/Geocoding proxy (`/api/maps/*`).
  - **Commercial SaaS Workspace Switcher & Usage Dashboard (`/workspace`)** with 3 white-label demo tenants, Starter vs. Enterprise plan preview, instrumented vs. simulated usage separation, and an **Admin-Only 9-Step Isolated Emergency Simulation**.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│ React 19 + TypeScript + Vite + Tailwind CSS v4 (HashRouter SPA)          │
│                                                                          │
│  /map (Leaflet+Esri)   /command (Google Maps + Leaflet fallback)         │
│  /sos (Lightweight)    /field-kit (Mobile Glove Mode + Nexconn + GPS)    │
│  /#/track/:token       /workspace (White-Label SaaS + Admin Simulation)  │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ Authenticated REST API (x-gg-org-id / Bearer)
┌───────────────────────────────────▼──────────────────────────────────────┐
│ Express + TypeScript Server (server.ts, Port 3000)                       │
│                                                                          │
│  /api/emergency/*      → Multi-tenant SOS, dispatch, GPS, audit state    │
│  /api/incidents/:id/medical-handoff → Gemini Bilingual SBAR + versions   │
│  /api/public/handoff/:token → Rate-limited, no-store paramedic view      │
│  /api/maps/*           → Google Maps server proxy (Places/Routes/Geocode)│
│  /api/workspace/*      → Tenant usage telemetry + ORG_ADMIN simulation   │
│  /api/analyst          → Guardian Analyst AI risk Q&A                    │
└───────────────────┬───────────────────────────────┬──────────────────────┘
                    │                               │
       ┌────────────▼────────────┐     ┌────────────▼────────────────────┐
       │ Google Cloud SQL        │     │ External Services               │
       │ PostgreSQL + Drizzle    │     │ • Firebase Authentication       │
       │ (Multi-Tenant Isolated) │     │ • Google Gemini API (@google/genai) │
       └─────────────────────────┘     │ • Google Maps Platform          │
                                       │ • Nexconn Chat / UI / Call SDKs │
                                       └─────────────────────────────────┘
```

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router (`HashRouter`), Recharts, Lucide Icons, `@vis.gl/react-google-maps`, Leaflet, Nexconn Web Chat/UI/Call SDKs.
- **Backend**: Node.js, Express, TypeScript (`tsx`), Drizzle ORM, `pg` (PostgreSQL), Firebase Admin/Client Auth, `@google/genai`.
- **Database**: Google Cloud SQL (PostgreSQL).
- **Maps & Geo**: Google Maps JavaScript API, Places API (New), Routes API, Geocoding API, with automatic Leaflet + Esri/OSM fallback.

---

## Setup & Environment Variables

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables (see `.env.example` — never commit real keys or `.env` files):
   - **Database**: `DATABASE_URL` (Cloud SQL PostgreSQL connection string)
   - **Gemini AI**: `GEMINI_API_KEY`
   - **Google Maps Platform**:
     - `VITE_GOOGLE_MAPS_API_KEY` (browser Maps JS key, HTTP-referrer restricted)
     - `VITE_GOOGLE_MAPS_MAP_ID` (optional Cloud Map ID for Advanced Markers)
     - `GOOGLE_MAPS_SERVER_API_KEY` (server-side proxy key for Places, Routes, Geocoding — never exposed to browser)
   - **Firebase Auth**: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` (or `firebase-applet-config.json`)
   - **Nexconn** (optional for live messaging/calling): `VITE_NEXCONN_APP_ID`, `NEXCONN_API_SECRET`
3. Start the development server (serves both Express API and Vite frontend on port 3000):
   ```bash
   npm run dev
   ```
4. Build and type-check for production:
   ```bash
   npm run lint
   npm run build
   npm start
   ```

---

## Deployment Notes

- Production builds compile the SPA via `vite build` (`dist/`) and run the Express server via `npm start` (`node server.ts` or `tsx server.ts` depending on host runtime).
- Keep `GOOGLE_MAPS_SERVER_API_KEY`, `GEMINI_API_KEY`, and `DATABASE_URL` strictly in server-side environment secrets (never prefixed with `VITE_`).
- Restrict `VITE_GOOGLE_MAPS_API_KEY` by HTTP referrer in Google Cloud Console before public production traffic.

---

## Hackathon Demo Walkthrough

1. **Coastal Risk Intelligence (`/map`, `/forecast`, `/explainability`)**: Inspect coastal risk zones on the Leaflet + Esri map, 7-day forecast, and SHAP explainability factors.
2. **White-Label Workspace Switcher (`/workspace`)**: Switch between **Marina Beach Municipal Command**, **ECR Coastal Resort & Waterpark**, and **Chennai Port Maritime Safety**. Observe sidebar branding updates and strict tenant isolation (incidents from one tenant never appear in another).
3. **SaaS Subscription & Usage (`/workspace` → SaaS Plan & Usage)**: Compare **Starter** vs. **Enterprise Port / Resort** tiers and inspect instrumented PostgreSQL/runtime counts alongside clearly labeled simulated demo Nexconn/Gemini metrics.
4. **Public QR SOS & Command Center (`/sos` → `/command`)**: Submit an SOS alert, verify and dispatch a responder on the Google Maps Command Center, and inspect nearby hospital discovery and routing.
5. **Mobile Responder Field Kit (`/field-kit`)**: Toggle **Glove Mode**, update responder status (`EN_ROUTE` → `ON_SCENE` → `VICTIM_RECOVERED`), and test GPS sync.
6. **AI Medical SBAR & Paramedic Link (`/command` → `/#/track/:token`)**: Generate a bilingual English + Tamil SBAR handoff brief, approve it as dispatcher, and open the time-limited read-only paramedic tracking link.
7. **Admin-Only 9-Step Emergency Simulation (`/workspace` → Emergency Simulation)**: Sign in or switch to `ORG_ADMIN`, unlock the hidden simulation tab, run the 9-step isolated sandbox scenario (`org-demo-simulation-sandbox`), review the synthetic SBAR and audit timeline, and reset cleanly.
