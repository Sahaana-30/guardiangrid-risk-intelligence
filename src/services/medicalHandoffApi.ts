import { auth } from '../lib/firebase';
import { getActiveOrganizationId } from './tenantScope';
import { apiUrl, getApiCredentials } from './apiBase';
import type {
  MedicalHandoffLinkMetadata,
  MedicalHandoffReportRecord,
  PublicParamedicTrackingPayload,
} from '../types/medicalHandoff';

async function buildAuthHeaders(roleHeader: 'DISPATCHER' | 'RESPONDER' = 'DISPATCHER'): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-gg-role': roleHeader,
    'x-gg-org-id': getActiveOrganizationId(),
  };
  try {
    const user = auth?.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // Fall back to dev role header in non-production
  }
  return headers;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchMedicalHandoffsApi(
  incidentId: string,
  roleHeader: 'DISPATCHER' | 'RESPONDER' = 'DISPATCHER'
): Promise<{
  incidentId: string;
  incidentCode: string;
  reports: MedicalHandoffReportRecord[];
  links: MedicalHandoffLinkMetadata[];
}> {
  const res = await fetch(apiUrl(`/api/incidents/${encodeURIComponent(incidentId)}/medical-handoff`), {
    credentials: getApiCredentials(),
    headers: await buildAuthHeaders(roleHeader),
  });
  return parseJson(res);
}

export async function generateMedicalHandoffApi(params: {
  incidentId: string;
  victimCount?: number | null;
  clientRequestId?: string;
  roleHeader?: 'DISPATCHER' | 'RESPONDER';
}): Promise<{ report: MedicalHandoffReportRecord; deduplicated: boolean }> {
  const res = await fetch(
    apiUrl(`/api/incidents/${encodeURIComponent(params.incidentId)}/medical-handoff`),
    {
      method: 'POST',
      credentials: getApiCredentials(),
      headers: await buildAuthHeaders(params.roleHeader || 'DISPATCHER'),
      body: JSON.stringify({
        victimCount: params.victimCount ?? null,
        clientRequestId: params.clientRequestId,
      }),
    }
  );
  return parseJson(res);
}

export async function reviewMedicalHandoffApi(params: {
  incidentId: string;
  reportId: string;
  decision: 'approve' | 'reject';
  reviewNotes?: string;
}): Promise<{ report: MedicalHandoffReportRecord }> {
  const res = await fetch(
    apiUrl(
      `/api/incidents/${encodeURIComponent(params.incidentId)}/medical-handoff/${encodeURIComponent(
        params.reportId
      )}/review`
    ),
    {
      method: 'POST',
      credentials: getApiCredentials(),
      headers: await buildAuthHeaders('DISPATCHER'),
      body: JSON.stringify({
        decision: params.decision,
        reviewNotes: params.reviewNotes,
      }),
    }
  );
  return parseJson(res);
}

export async function shareMedicalHandoffToNexconnApi(params: {
  incidentId: string;
  reportId: string;
}): Promise<{ report: MedicalHandoffReportRecord; nexconnMessageId: string | null }> {
  const res = await fetch(
    apiUrl(
      `/api/incidents/${encodeURIComponent(params.incidentId)}/medical-handoff/${encodeURIComponent(
        params.reportId
      )}/share`
    ),
    {
      method: 'POST',
      credentials: getApiCredentials(),
      headers: await buildAuthHeaders('DISPATCHER'),
      body: JSON.stringify({}),
    }
  );
  return parseJson(res);
}

export async function createPublicParamedicLinkApi(params: {
  incidentId: string;
  reportId: string;
  expiresInMinutes: number;
}): Promise<{
  link: MedicalHandoffLinkMetadata;
  token: string;
  publicUrl: string;
  notice: string;
}> {
  const res = await fetch(
    apiUrl(
      `/api/incidents/${encodeURIComponent(params.incidentId)}/medical-handoff/${encodeURIComponent(
        params.reportId
      )}/public-link`
    ),
    {
      method: 'POST',
      credentials: getApiCredentials(),
      headers: await buildAuthHeaders('DISPATCHER'),
      body: JSON.stringify({ expiresInMinutes: params.expiresInMinutes }),
    }
  );
  return parseJson(res);
}

export async function revokePublicParamedicLinkApi(params: {
  incidentId: string;
  linkId: string;
}): Promise<{ link: MedicalHandoffLinkMetadata }> {
  const res = await fetch(
    apiUrl(
      `/api/incidents/${encodeURIComponent(params.incidentId)}/medical-handoff/links/${encodeURIComponent(
        params.linkId
      )}/revoke`
    ),
    {
      method: 'POST',
      credentials: getApiCredentials(),
      headers: await buildAuthHeaders('DISPATCHER'),
      body: JSON.stringify({}),
    }
  );
  return parseJson(res);
}

export async function fetchPublicParamedicTrackingApi(
  token: string
): Promise<PublicParamedicTrackingPayload> {
  const res = await fetch(apiUrl(`/api/public/handoff/${encodeURIComponent(token)}`), {
    credentials: getApiCredentials(),
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as any)?.error || `Unable to load tracking link (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return data as PublicParamedicTrackingPayload;
}
