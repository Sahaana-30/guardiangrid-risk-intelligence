import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { organizations, users } from './schema.ts';

export type UserRole = 'ORG_ADMIN' | 'DISPATCHER' | 'RESPONDER' | 'PUBLIC_SOS';

export const DEFAULT_ORGANIZATION_ID =
  process.env.DEFAULT_ORGANIZATION_ID?.trim() || 'org-guardian-grid-india';

export interface DbUserRecord {
  id: number;
  uid: string;
  organizationId: string;
  defaultRegionId: string | null;
  authorizedRegionIds: string[];
  email: string;
  displayName: string;
  role: UserRole;
  nexconnUserId: string | null;
  station: string | null;
}

function parseRegionIds(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function ensureDefaultOrganization(
  organizationId: string = DEFAULT_ORGANIZATION_ID
): Promise<void> {
  const isIndiaDefault = organizationId === 'org-guardian-grid-india';
  try {
    await db
      .insert(organizations)
      .values({
        id: organizationId,
        slug: isIndiaDefault ? 'guardian-grid-india' : organizationId,
        name: isIndiaDefault
          ? 'GuardianGrid India Coastal Safety'
          : `GuardianGrid Organization (${organizationId})`,
        country: 'India',
        region: 'Pan-India',
        areaCode: 'SG',
        vhfFallbackChannel: 'VHF Ch 16',
      })
      .onConflictDoNothing({ target: organizations.id });
  } catch (error) {
    throw new Error('Failed to ensure default organization record.', { cause: error });
  }
}

function buildScopedNexconnUserId(organizationId: string, uid: string): string {
  const safeOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return `gg_${safeOrg}_${safeUid}`;
}

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  displayName: string;
  organizationId?: string;
  defaultRole?: UserRole;
  defaultRegionId?: string | null;
  authorizedRegionIds?: string[];
}): Promise<DbUserRecord> {
  const organizationId = params.organizationId || DEFAULT_ORGANIZATION_ID;
  const fallbackRole: UserRole = params.defaultRole || 'DISPATCHER';

  try {
    await ensureDefaultOrganization(organizationId);

    const nexconnUserId = buildScopedNexconnUserId(organizationId, params.uid);
    const defaultAuthorized =
      params.authorizedRegionIds && params.authorizedRegionIds.length > 0
        ? params.authorizedRegionIds
        : ['reg-india-chennai', 'reg-india-mumbai', 'reg-india-goa', 'reg-india-kerala'];

    const [record] = await db
      .insert(users)
      .values({
        uid: params.uid,
        organizationId,
        defaultRegionId: params.defaultRegionId ?? null,
        authorizedRegionIdsJson: JSON.stringify(defaultAuthorized),
        email: params.email,
        displayName: params.displayName,
        role: fallbackRole,
        nexconnUserId,
        station: 'GuardianGrid Command',
        isSimulated: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: params.email,
          displayName: params.displayName,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      id: record.id,
      uid: record.uid,
      organizationId: record.organizationId,
      defaultRegionId: record.defaultRegionId ?? null,
      authorizedRegionIds: parseRegionIds(record.authorizedRegionIdsJson),
      email: record.email,
      displayName: record.displayName,
      role: (record.role as UserRole) || 'DISPATCHER',
      nexconnUserId: record.nexconnUserId,
      station: record.station,
    };
  } catch (error) {
    throw new Error('Failed to synchronize authenticated user profile.', { cause: error });
  }
}

export async function getUserByUid(uid: string): Promise<DbUserRecord | null> {
  try {
    const [record] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (!record) return null;
    return {
      id: record.id,
      uid: record.uid,
      organizationId: record.organizationId,
      defaultRegionId: record.defaultRegionId ?? null,
      authorizedRegionIds: parseRegionIds(record.authorizedRegionIdsJson),
      email: record.email,
      displayName: record.displayName,
      role: (record.role as UserRole) || 'DISPATCHER',
      nexconnUserId: record.nexconnUserId,
      station: record.station,
    };
  } catch (error) {
    throw new Error('Failed to query user profile.', { cause: error });
  }
}
