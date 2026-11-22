import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { nexconnRouter } from './server/nexconnRoutes';
import { emergencyRouter } from './server/emergencyRoutes';
import { medicalHandoffRouter, publicHandoffRouter } from './server/medicalHandoffRoutes';
import { mapsRouter } from './server/mapsRoutes';
import { workspaceRouter } from './server/workspaceRoutes';
import { runEscalationSweep, sosInstantRouter } from './server/sosInstantRoutes';
import { dashboardRouter } from './server/dashboardRoutes';
import { analystRouter } from './server/analystRoutes';
import { closeAllSosSseClients } from './server/sosEventBus';
import { isHostedOrProductionEnv } from './server/envAuthPolicy';
import { closePool, isPostgresConfigured, isPostgresRequired } from './src/db/index.ts';
import { isUsingPostgresRepository } from './src/db/repositories/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cleanOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '*' || trimmed === 'MY_FRONTEND_ORIGIN') return '';
  return trimmed;
}

function getAllowedCorsOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGIN || '';
  return raw
    .split(',')
    .map(cleanOrigin)
    .filter(Boolean);
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized) return false;
  if (allowedOrigins.includes(normalized)) return true;

  // In local development only (when FRONTEND_ORIGIN is unset), permit local Vite/preview origins
  if (!isHostedOrProductionEnv() && allowedOrigins.length === 0) {
    try {
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        (host.startsWith('ais-dev-') && host.endsWith('.run.app'))
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Cloud Run sits behind Google Front End (GFE) reverse proxy
app.set('trust proxy', 1);

// Strict CORS middleware using FRONTEND_ORIGIN for split Vercel frontend + Cloud Run backend
app.use((req, res, next) => {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!originHeader) {
    return next();
  }

  const allowedOrigins = getAllowedCorsOrigins();
  if (isOriginAllowed(originHeader, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
    res.append('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-gg-org-id, x-gg-role, x-gg-sos-token, x-cron-secret'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  }

  res.append('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    return res.status(403).json({ error: 'CORS origin not allowed.' });
  }
  return next();
});

app.use(express.json({ limit: '1mb' }));

// Cloud Run startup / liveness readiness endpoints (non-secret)
const healthHandler: express.RequestHandler = (_req, res) => {
  let usingPostgres = false;
  let dbError: string | null = null;
  try {
    usingPostgres = isUsingPostgresRepository();
  } catch (err: any) {
    dbError = err?.message || 'Database configuration error';
  }

  if (dbError) {
    return res.status(503).json({
      ok: false,
      service: 'guardiangrid-api',
      error: dbError,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json({
    ok: true,
    service: 'guardiangrid-api',
    environment: process.env.NODE_ENV || 'development',
    postgresConfigured: isPostgresConfigured(),
    postgresRequired: isPostgresRequired(),
    usingPostgres,
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

app.get('/healthz', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/nexconn', nexconnRouter);
app.use('/api/emergency', emergencyRouter);
app.use('/api/sos', sosInstantRouter);
app.use('/api/incidents', medicalHandoffRouter);
app.use('/api/public/handoff', publicHandoffRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/analyst', analystRouter);

// JSON 404 guard for unmatched /api/* routes (prevents SPA HTML fallback)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Production or Vite Dev Middleware
async function startServer() {
  // Fail fast if REQUIRE_POSTGRES=true is set without valid Postgres configuration
  isUsingPostgresRepository();

  if (process.env.NODE_ENV === 'production') {
    const distDir = fs.existsSync(path.resolve(__dirname, 'dist'))
      ? path.resolve(__dirname, 'dist')
      : path.resolve(__dirname, '..', 'dist');
    const distIndex = path.resolve(distDir, 'index.html');

    if (fs.existsSync(distIndex)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(distIndex);
      });
    } else {
      app.get('/', (_req, res) => {
        res.status(200).json({
          ok: true,
          service: 'guardiangrid-api',
          message: 'GuardianGrid API server running (frontend hosted separately).',
        });
      });
      app.use((_req, res) => {
        res.status(404).json({ error: 'Route not found on API service.' });
      });
    }
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
  const listenPort = Number.isFinite(portNumber) && portNumber > 0 ? portNumber : 3000;
  const httpServer = app.listen(listenPort, '0.0.0.0', () => {
    console.log(`GuardianGrid Server running on http://0.0.0.0:${listenPort}`);
  });

  // Automatic background escalation monitor for unverified/unacknowledged SOS incidents
  let sweepRunning = false;
  const escalationTimer = setInterval(async () => {
    if (sweepRunning) return;
    sweepRunning = true;
    try {
      await runEscalationSweep();
    } catch (err: any) {
      console.warn('Background escalation sweep warning:', err?.message);
    } finally {
      sweepRunning = false;
    }
  }, 15_000);
  escalationTimer.unref?.();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down GuardianGrid server gracefully...`);
    clearInterval(escalationTimer);
    closeAllSosSseClients();

    const forceTimer = setTimeout(() => {
      console.error('Forced exit after shutdown timeout.');
      process.exit(1);
    }, 10_000);
    forceTimer.unref?.();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await closePool().catch((err) => {
      console.warn('PostgreSQL pool close warning:', err?.message);
    });
    clearTimeout(forceTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

startServer().catch((err) => {
  console.error('Failed to start GuardianGrid server:', err);
  process.exit(1);
});
