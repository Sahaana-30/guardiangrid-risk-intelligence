export const DEFAULT_TENANT_ORG_ID = 'org-guardian-grid-india';

let activeOrganizationId = DEFAULT_TENANT_ORG_ID;

export function getActiveOrganizationId(): string {
  return activeOrganizationId;
}

export function setActiveOrganizationId(orgId: string): void {
  const clean = (orgId || '').trim();
  activeOrganizationId = clean || DEFAULT_TENANT_ORG_ID;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gg-tenant-changed', {
        detail: { organizationId: activeOrganizationId },
      })
    );
  }
}
