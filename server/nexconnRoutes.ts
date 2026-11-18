import { randomInt } from 'crypto';
import express from 'express';
import { Configuration } from '@nexconn/server-sdk/configuration.ts';
import { UserManagementApi } from '@nexconn/server-sdk/api.ts';
import { ApiException } from '@nexconn/server-sdk/base.ts';

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

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

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
nexconnRouter.get('/health', (_req, res) => {
  const status = getEnvStatus();
  res.json({
    configured: status.isConfigured,
    environment: process.env.NODE_ENV || 'development',
    demoAuthAllowed: !isProductionEnv(),
    areaCodeIsSG: status.areaCode === 'SG',
    variables: status.vars,
    diagnostics: status.diagnostics,
  });
});

/**
 * Returns the predefined demo operator directory (development only).
 */
nexconnRouter.get('/directory', (_req, res) => {
  if (isProductionEnv()) {
    return res.status(403).json({
      error: 'Demo operator directory is disabled in production. Configure authenticated user sessions before deploying.',
    });
  }

  return res.json({
    operators: DEMO_OPERATORS,
  });
});

/**
 * Issues a Nexconn user access token for a server-validated demo operator
 * using @nexconn/server-sdk Configuration + UserManagementApi.issueAccessToken().
 * Strictly disabled in production environments.
 */
nexconnRouter.post('/token', async (req, res) => {
  if (isProductionEnv()) {
    return res.status(403).json({
      error: 'Demo token issuance is disabled in production. Authenticated user sessions are required.',
    });
  }

  const operatorId = typeof req.body?.operatorId === 'string' ? req.body.operatorId.trim() : '';
  const operator = DEMO_OPERATORS.find((op) => op.userId === operatorId);

  if (!operator) {
    return res.status(403).json({
      error: 'Invalid operatorId. Only predefined server-validated demo identities are permitted.',
    });
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
      userId: operator.userId,
      name: operator.name,
      ...(operator.avatarUrl ? { avatarUrl: operator.avatarUrl } : {}),
    });

    const issuedToken = data?.result?.accessToken;
    if (!issuedToken) {
      return res.status(502).json({
        error: `Nexconn Server API returned code ${data?.code ?? 'unknown'} without an accessToken.`,
      });
    }

    return res.json({
      userId: data?.result?.userId || operator.userId,
      name: operator.name,
      role: operator.role,
      station: operator.station,
      initials: operator.initials,
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
