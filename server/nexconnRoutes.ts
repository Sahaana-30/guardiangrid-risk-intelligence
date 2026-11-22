import { randomInt } from 'crypto';
import express from 'express';
import { Configuration } from '@nexconn/server-sdk/configuration.ts';
import { UserManagementApi } from '@nexconn/server-sdk/api.ts';
import { ApiException } from '@nexconn/server-sdk/base.ts';
import { optionalAuth, type AuthRequest } from '../src/middleware/auth.ts';
import { DEFAULT_ORGANIZATION_ID } from '../src/db/users.ts';
import { isLocalDevDemoAllowed } from './envAuthPolicy.ts';

export interface DemoOperator {
  userId: string;
  name: string;
  role: string;
  station: string;
  initials: string;
  avatarUrl?: string;
}

/**
 * Fixed server-validated demo operator allowlist for development testing.
 * Arbitrary userIds from client requests are strictly rejected.
 */
export const DEMO_OPERATORS: DemoOperator[] = [
  {
    userId: 'gg-analyst-ss',
    name: 'Senior Safety Analyst (SS)',
    role: 'Lead Risk Analyst',
    station: 'GuardianGrid Command',
    initials: 'SS',
  },
  {
    userId: 'gg-lifeguard-marina',
    name: 'Marina Lifeguard Lead',
    role: 'Coastal Patrol Officer',
    station: 'Marina Beach Tower 1',
    initials: 'ML',
  },
  {
    userId: 'gg-dispatch-chennai',
    name: 'Coastal Dispatch Control',
    role: 'Emergency Coordinator',
    station: 'Chennai Rescue HQ',
    initials: 'CD',
  },
  {
    userId: 'gg-hydro-field',
    name: 'Hydrology Field Officer',
    role: 'Marine & Basin Telemetry',
    station: 'Ennore & Elliot Sector',
    initials: 'HF',
  },
];

  // Legacy alias kept concise; host/environment gating uses isLocalDevDemoAllowed(req).

function cleanEnvValue(value?: string): string {
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

function normalizeDomainUrl(domain?: string): string {
  const cleaned = cleanEnvValue(domain).replace(/\/+$/, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  return `https://${cleaned}`;
}

function inspectSecretFormat(rawValue?: string) {
  const raw = rawValue || '';
  const cleaned = cleanEnvValue(raw);
  return {
    configured: cleaned.length > 0,
    length: cleaned.length,
    hadOuterWhitespace: raw !== raw.trim(),
    hadOuterQuotes: cleaned !== raw.trim(),
    hasInternalWhitespace: /\s/.test(cleaned),
    hasInnerQuotesOrBackticks: /["'`]/.test(cleaned),
    hasEqualsOrLabelPrefix: /[=:]/.test(cleaned),
    isPrintableAsciiOnly: /^[\x21-\x7E]+$/.test(cleaned),
  };
}

function inspectDomainFormat(rawValue?: string) {
  const normalized = normalizeDomainUrl(rawValue);
  let validUrl = false;
  let protocol = '';
  let hasNonRootPath = false;
  let looksLikeSingaporeApi = false;
  let looksLikeNexconnHost = false;

  if (normalized) {
    try {
      const parsed = new URL(normalized);
      validUrl = Boolean(parsed.hostname);
      protocol = parsed.protocol;
      hasNonRootPath = parsed.pathname !== '/' && parsed.pathname !== '';
      const host = parsed.hostname.toLowerCase();
      looksLikeNexconnHost = host.includes('nexconn') || host.includes('rongcloud') || host.includes('ronghub');
      looksLikeSingaporeApi = /(^|[.-])sg([.-]|$)|singapore/i.test(host);
    } catch {
      validUrl = false;
    }
  }

  return {
    configured: normalized.length > 0,
    validUrl,
    isHttps: protocol === 'https:',
    hasNonRootPath,
    looksLikeNexconnHost,
    looksLikeSingaporeApi,
  };
}

function getEnvStatus() {
  const rawAppKey = process.env.NEXCONN_APP_KEY || '';
  const rawAppSecret = process.env.NEXCONN_APP_SECRET || '';
  const rawPrimary = process.env.NEXCONN_PRIMARY_API_DOMAIN || '';
  const rawSecondary = process.env.NEXCONN_SECONDARY_API_DOMAIN || '';
  const appKey = cleanEnvValue(rawAppKey);
  const appSecret = cleanEnvValue(rawAppSecret);
  const primaryDomain = normalizeDomainUrl(rawPrimary);
  const secondaryDomain = normalizeDomainUrl(rawSecondary);
  const areaCode = cleanEnvValue(process.env.NEXCONN_AREA_CODE || 'SG').toUpperCase();

  return {
    appKey,
    appSecret,
    primaryDomain,
    secondaryDomain,
    areaCode,
    vars: {
      NEXCONN_APP_KEY: appKey.length > 0 ? 'CONFIGURED' : 'MISSING',
      NEXCONN_APP_SECRET: appSecret.length > 0 ? 'CONFIGURED' : 'MISSING',
      NEXCONN_PRIMARY_API_DOMAIN: primaryDomain.length > 0 ? 'CONFIGURED' : 'MISSING',
      NEXCONN_SECONDARY_API_DOMAIN: secondaryDomain.length > 0 ? 'CONFIGURED' : 'MISSING',
      NEXCONN_AREA_CODE: cleanEnvValue(process.env.NEXCONN_AREA_CODE).length > 0 ? 'CONFIGURED' : 'MISSING',
    },
    diagnostics: {
      appKey: inspectSecretFormat(rawAppKey),
      appSecret: inspectSecretFormat(rawAppSecret),
      keyEqualsSecret: appKey.length > 0 && appKey === appSecret,
      primaryDomain: inspectDomainFormat(rawPrimary),
      secondaryDomain: inspectDomainFormat(rawSecondary),
      primaryEqualsSecondary: primaryDomain.length > 0 && primaryDomain === secondaryDomain,
    },
    isConfigured:
      appKey.length > 0 &&
      appSecret.length > 0 &&
      primaryDomain.length > 0 &&
      secondaryDomain.length > 0,
  };
}

export const nexconnRouter = express.Router();

/**
 * Safe diagnostic check inside the running Express server process.
 * Never returns or logs secret values.
 */
nexconnRouter.get('/health', (req, res) => {
  const status = getEnvStatus();
  res.json({
    configured: status.isConfigured,
    environment: process.env.NODE_ENV || 'development',
    demoAuthAllowed: isLocalDevDemoAllowed(req),
    areaCodeIsSG: status.areaCode === 'SG',
    variables: status.vars,
    diagnostics: status.diagnostics,
  });
});

/**
 * Returns the predefined demo operator directory (strictly local development only).
 */
nexconnRouter.get('/directory', (req, res) => {
  if (!isLocalDevDemoAllowed(req)) {
    return res.status(403).json({
      error: 'Demo operator directory is disabled outside local development. Sign in with an authenticated operator session.',
    });
  }

  return res.json({
    operators: DEMO_OPERATORS,
  });
});

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Issues a Nexconn user access token using @nexconn/server-sdk Configuration + UserManagementApi.issueAccessToken().
 * - When a verified Firebase Bearer token is present, scopes the Nexconn identity to organization_id + user_id.
 * - In development without a Bearer token, preserves the server-validated DEMO_OPERATORS allowlist.
 */
nexconnRouter.post('/token', optionalAuth, async (req: AuthRequest, res) => {
  const authCtx = req.authContext;
  const organizationId = authCtx?.organizationId || DEFAULT_ORGANIZATION_ID;

  let resolvedUserId = '';
  let resolvedName = '';
  let resolvedRole = '';
  let resolvedStation = 'GuardianGrid Command';
  let resolvedInitials = 'GG';
  let resolvedAvatarUrl: string | undefined;

  if (authCtx?.isAuthenticated) {
    if (authCtx.role === 'PUBLIC_SOS') {
      return res.status(403).json({
        error: 'Public SOS guest sessions are not authorized for operational Nexconn channels.',
      });
    }
    resolvedUserId = authCtx.nexconnUserId;
    resolvedName = authCtx.displayName;
    resolvedRole = authCtx.role;
    resolvedInitials = computeInitials(authCtx.displayName);
  } else {
    if (!isLocalDevDemoAllowed(req)) {
      return res.status(401).json({
        error: 'Authenticated operator session is required to issue a Nexconn access token.',
      });
    }

    const operatorId = typeof req.body?.operatorId === 'string' ? req.body.operatorId.trim() : '';
    const operator = DEMO_OPERATORS.find((op) => op.userId === operatorId);

    if (!operator) {
      return res.status(403).json({
        error: 'Invalid operatorId. Only predefined server-validated demo identities are permitted.',
      });
    }

    resolvedUserId = operator.userId;
    resolvedName = operator.name;
    resolvedRole = operator.role;
    resolvedStation = operator.station;
    resolvedInitials = operator.initials;
    resolvedAvatarUrl = operator.avatarUrl;
  }

  const env = getEnvStatus();
  if (!env.isConfigured) {
    return res.status(503).json({
      error: 'Nexconn server credentials are incomplete. Configure NEXCONN_APP_KEY, NEXCONN_APP_SECRET, NEXCONN_PRIMARY_API_DOMAIN, and NEXCONN_SECONDARY_API_DOMAIN in AI Studio Secrets.',
      variables: env.vars,
    });
  }

  try {
    const configuration = new Configuration();
    configuration.setNexconnCredentials(env.appKey, env.appSecret);
    configuration.setPrimaryBackupDomains(env.primaryDomain, env.secondaryDomain);
    configuration.setAutoFailoverEnabled(true);
    configuration.setNonceGenerator(() => String(randomInt(100000000, 999999999)));

    const userManagementApi = new UserManagementApi(configuration);
    const { data } = await userManagementApi.issueAccessToken({
      userId: resolvedUserId,
      name: resolvedName,
      ...(resolvedAvatarUrl ? { avatarUrl: resolvedAvatarUrl } : {}),
    });

    const issuedToken = data?.result?.accessToken;
    if (!issuedToken) {
      return res.status(502).json({
        error: `Nexconn Server API returned code ${data?.code ?? 'unknown'} without an accessToken.`,
      });
    }

    return res.json({
      userId: data?.result?.userId || resolvedUserId,
      organizationId,
      name: resolvedName,
      role: resolvedRole,
      station: resolvedStation,
      initials: resolvedInitials,
      token: issuedToken,
      appKey: env.appKey,
      areaCode: env.areaCode || 'SG',
    });
  } catch (error: any) {
    if (error instanceof ApiException) {
      const serverDate = error.responseHeaders?.date || error.responseHeaders?.Date || null;
      const localUtc = new Date().toISOString();
      console.error(
        `Nexconn Server SDK ApiException: HTTP ${error.httpStatus}, code=${error.errorCode}, msg=${error.errorMessage}, serverDate=${serverDate}, localUtc=${localUtc}`
      );
      const detail =
        error.errorCode === 1004
          ? `${error.errorMessage || 'Signature error'}. Verify in AI Studio Settings → Secrets that NEXCONN_APP_KEY, NEXCONN_APP_SECRET, and API domains match the same app & region in your Nexconn Console.`
          : error.errorMessage || 'Failed to issue access token';
      return res.status(error.httpStatus >= 400 && error.httpStatus < 600 ? error.httpStatus : 502).json({
        error: `Nexconn Server API error (${error.errorCode}): ${detail}`,
        errorCode: error.errorCode,
        serverDate,
        localUtc,
      });
    }

    console.error('Nexconn token issuance failed:', error?.message || 'Unknown error');
    return res.status(500).json({
      error: error?.message || 'Unable to issue Nexconn access token.',
    });
  }
});

/**
 * POST /api/nexconn/logout
 * Expires active Nexconn access token via UserManagementApi.expireAccessToken on operator sign-out.
 */
nexconnRouter.post('/logout', optionalAuth, async (req: AuthRequest, res) => {
  const authCtx = req.authContext;
  let targetUserId = '';

  if (authCtx?.isAuthenticated && authCtx.nexconnUserId) {
    targetUserId = authCtx.nexconnUserId;
  } else if (isLocalDevDemoAllowed(req)) {
    const requestedId =
      typeof req.body?.operatorId === 'string' ? req.body.operatorId.trim() : '';
    const match = DEMO_OPERATORS.find((op) => op.userId === requestedId);
    if (match) {
      targetUserId = match.userId;
    }
  }

  if (!targetUserId) {
    return res.json({ ok: true, revoked: false, reason: 'no_active_operator_session' });
  }

  const env = getEnvStatus();
  if (!env.isConfigured) {
    return res.json({ ok: true, revoked: false, userId: targetUserId, reason: 'nexconn_unconfigured' });
  }

  try {
    const configuration = new Configuration();
    configuration.setNexconnCredentials(env.appKey, env.appSecret);
    configuration.setPrimaryBackupDomains(env.primaryDomain, env.secondaryDomain);
    configuration.setAutoFailoverEnabled(true);
    configuration.setNonceGenerator(() => String(randomInt(100000000, 999999999)));

    const userManagementApi = new UserManagementApi(configuration);
    await userManagementApi.expireAccessToken({
      userIds: [targetUserId],
      expiresAt: Date.now(),
    });
    return res.json({ ok: true, revoked: true, userId: targetUserId });
  } catch (err: any) {
    console.warn('Nexconn token expiration warning during logout:', err?.message || 'Unknown error');
    return res.json({
      ok: true,
      revoked: false,
      userId: targetUserId,
      warning: 'Token expiration call failed; client session disconnected.',
    });
  }
});
