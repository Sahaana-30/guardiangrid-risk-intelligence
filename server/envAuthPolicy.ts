import { randomBytes } from 'crypto';
import type express from 'express';

const EPHEMERAL_FALLBACK_SECRET = randomBytes(32).toString('hex');

export function isHostedOrProductionEnv(): boolean {
  if (process.env.ALLOW_DEMO_AUTH === 'false') return true;
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview') {
    return true;
  }
  const appEnv = (process.env.APP_ENV || '').trim().toLowerCase();
  if (appEnv === 'production' || appEnv === 'staging' || appEnv === 'preview') {
    return true;
  }
  return false;
}

function extractRequestHostname(req?: express.Request): string {
  if (!req) return '';
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!raw) return '';
  // Strip IPv6 brackets or :port suffix
  if (raw.startsWith('[')) {
    const endIdx = raw.indexOf(']');
    return endIdx > 0 ? raw.slice(1, endIdx) : raw;
  }
  return raw.replace(/:\d+$/, '');
}

/**
 * Demo operator directory, unauthenticated demo Nexconn tokens, and header-based
 * `x-gg-role` spoofing are permitted ONLY in strict local development contexts
 * (localhost / 127.0.0.1 / AI Studio workspace dev host when NODE_ENV=development).
 *
 * Shared previews (`ais-pre-*`), Vercel previews, staging, and production always
 * reject demo token issuance and header-based role spoofing.
 */
export function isLocalDevDemoAllowed(req?: express.Request): boolean {
  if (isHostedOrProductionEnv()) return false;

  const hostname = extractRequestHostname(req);
  if (!hostname) {
    // Non-HTTP unit/CLI checks running in NODE_ENV=development
    return process.env.NODE_ENV !== 'production';
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // Allow active AI Studio dev workspace host ONLY in development; block shared preview `ais-pre-*`
  if (hostname.startsWith('ais-dev-') && hostname.endsWith('.run.app')) {
    return true;
  }

  return false;
}

export function getSosChannelSigningSecret(): string {
  return (
    process.env.SOS_CHANNEL_SECRET?.trim() ||
    process.env.NEXCONN_APP_SECRET?.trim() ||
    EPHEMERAL_FALLBACK_SECRET
  );
}
