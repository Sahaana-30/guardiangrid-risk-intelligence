import type express from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { isPostgresConfigured } from '../db/index.ts';
import { DEFAULT_ORGANIZATION_ID, getOrCreateUser, type UserRole } from '../db/users.ts';
import { isLocalDevDemoAllowed } from '../../server/envAuthPolicy.ts';

export type { UserRole };

export interface AuthContext {
  uid: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  organizationId: string;
  authorizedRegionIds: string[];
  nexconnUserId: string;
  isAuthenticated: boolean;
}

export interface AuthRequest extends express.Request {
  authContext?: AuthContext;
}

function mapOperationalHeaderToRole(headerValue?: string): UserRole | null {
  const normalized = (headerValue || '').trim().toLowerCase();
  if (normalized === 'org_admin' || normalized === 'admin' || normalized === 'command') {
    return 'ORG_ADMIN';
  }
  if (normalized === 'dispatcher') {
    return 'DISPATCHER';
  }
  if (normalized === 'responder') {
    return 'RESPONDER';
  }
  if (normalized === 'public_sos' || normalized === 'public') {
    return 'PUBLIC_SOS';
  }
  return null;
}

function resolveTenantOrgId(req: express.Request): string {
  const headerOrg = String(req.header('x-gg-org-id') || '').trim();
  if (headerOrg && /^[a-zA-Z0-9_-]{3,64}$/.test(headerOrg)) {
    return headerOrg;
  }
  return DEFAULT_ORGANIZATION_ID;
}

function buildGuestContext(organizationId: string): AuthContext {
  return {
    uid: 'public-sos-guest',
    email: null,
    displayName: 'Public SOS Reporter',
    role: 'PUBLIC_SOS',
    organizationId,
    authorizedRegionIds: [],
    nexconnUserId: 'public-sos-guest',
    isAuthenticated: false,
  };
}

export function filterItemsByAuthorizedRegion<T extends { regionId?: string | null }>(
  req: AuthRequest,
  items: T[]
): T[] {
  const authorized = req.authContext?.authorizedRegionIds || [];
  if (authorized.length === 0) return items;
  return items.filter((item) => !item.regionId || authorized.includes(item.regionId));
}

/**
 * Verifies a Firebase ID token if provided in Authorization: Bearer <token>.
 * Syncs authenticated users into PostgreSQL when Cloud SQL is active.
 * Never rejects unauthenticated requests on its own; use requireAuth or requireRole to enforce access.
 */
export async function optionalAuth(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.header('authorization') || '';
  const devDemoAllowed = isLocalDevDemoAllowed(req);
  const requestedOrgId = resolveTenantOrgId(req);

  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      return res.status(401).json({ error: 'Invalid Authorization header.' });
    }

    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = decoded.email || `${decoded.uid}@guardiangrid.local`;
      const displayName = decoded.name || email.split('@')[0] || 'GuardianGrid Operator';
      const claimOrg =
        typeof (decoded as any).organizationId === 'string' &&
        /^[a-zA-Z0-9_-]{3,64}$/.test((decoded as any).organizationId)
          ? String((decoded as any).organizationId)
          : null;

      if (isPostgresConfigured() && process.env.USE_JSON_FALLBACK !== 'true') {
        const dbUser = await getOrCreateUser({
          uid: decoded.uid,
          email,
          displayName,
          organizationId: devDemoAllowed
            ? requestedOrgId
            : claimOrg || DEFAULT_ORGANIZATION_ID,
          defaultRole: 'DISPATCHER',
        });

        req.authContext = {
          uid: dbUser.uid,
          email: dbUser.email,
          displayName: dbUser.displayName,
          role: dbUser.role,
          organizationId: dbUser.organizationId,
          authorizedRegionIds: dbUser.authorizedRegionIds,
          nexconnUserId:
            dbUser.nexconnUserId || `gg_${dbUser.organizationId}_${dbUser.uid.slice(0, 16)}`,
          isAuthenticated: true,
        };
      } else {
        const resolvedOrgId = devDemoAllowed
          ? requestedOrgId
          : claimOrg || DEFAULT_ORGANIZATION_ID;
        const claimRole = (decoded as any).role as UserRole | undefined;
        const resolvedRole: UserRole =
          claimRole === 'ORG_ADMIN' ||
          claimRole === 'DISPATCHER' ||
          claimRole === 'RESPONDER'
            ? claimRole
            : 'DISPATCHER';

        req.authContext = {
          uid: decoded.uid,
          email,
          displayName,
          role: resolvedRole,
          organizationId: resolvedOrgId,
          authorizedRegionIds: Array.isArray((decoded as any).authorizedRegionIds)
            ? (decoded as any).authorizedRegionIds.filter((r: unknown) => typeof r === 'string')
            : [],
          nexconnUserId: `gg_${resolvedOrgId}_${decoded.uid.slice(0, 16)}`,
          isAuthenticated: true,
        };
      }

      return next();
    } catch (error) {
      console.error('Firebase ID token verification failed:', (error as Error)?.message);
      return res.status(401).json({ error: 'Authentication token is invalid or expired.' });
    }
  }

  // Strictly local development fallback only — disabled in hosted preview, staging, and production
  const headerRole = mapOperationalHeaderToRole(req.header('x-gg-role'));
  if (devDemoAllowed && headerRole && headerRole !== 'PUBLIC_SOS') {
    req.authContext = {
      uid: headerRole === 'RESPONDER' ? 'gg-lifeguard-marina' : 'gg-dispatch-chennai',
      email: null,
      displayName:
        headerRole === 'RESPONDER' ? 'Marina Lifeguard Lead' : 'Coastal Dispatch Control',
      role: headerRole,
      organizationId: requestedOrgId,
      authorizedRegionIds: [],
      nexconnUserId: headerRole === 'RESPONDER' ? 'gg-lifeguard-marina' : 'gg-dispatch-chennai',
      isAuthenticated: false,
    };
    return next();
  }

  req.authContext = buildGuestContext(devDemoAllowed ? requestedOrgId : DEFAULT_ORGANIZATION_ID);
  return next();
}

/**
 * Strictly requires a verified Firebase Bearer ID token.
 */
export async function requireAuth(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  return optionalAuth(req, res, () => {
    if (!req.authContext?.isAuthenticated) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    return next();
  });
}

/**
 * Enforces Role-Based Access Control (RBAC) across ORG_ADMIN, DISPATCHER, RESPONDER, and PUBLIC_SOS.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const check = () => {
      const ctx = req.authContext;
      if (!ctx) {
        return res.status(401).json({ error: 'Authentication context missing.' });
      }
      if (!allowedRoles.includes(ctx.role)) {
        return res.status(403).json({
          error: 'Insufficient permissions for this operational endpoint.',
          requiredRoles: allowedRoles,
        });
      }
      return next();
    };

    if (req.authContext) {
      return check();
    }

    return optionalAuth(req, res, check);
  };
}
