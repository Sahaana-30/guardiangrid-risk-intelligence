import { auth } from '../lib/firebase';
import { getActiveOrganizationId } from './tenantScope';
import { apiUrl, getApiCredentials } from './apiBase';
import type {
  ComputedRouteResult,
  EtaMatrixResponse,
  NearbyHospitalsResponse,
  ReverseGeocodeResponse,
} from '../types/maps';

async function buildMapsAuthHeaders(
  roleHeader: 'DISPATCHER' | 'RESPONDER' = 'DISPATCHER'
): Promise<Record<string, string>> {
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
    // Non-production dev role header fallback
  }
  return headers;
}

function handleQuotaCheck(res: Response, data: any): void {
  if (
    res.status === 429 &&
    (data?.quotaExceeded === true ||
      data?.error?.status === 'RESOURCE_EXHAUSTED' ||
      String(data?.error || '').toLowerCase().includes('quota'))
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }
}

export async function fetchNearbyHospitalsApi(params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  limit?: number;
  regionId?: string;
  roleHeader?: 'DISPATCHER' | 'RESPONDER';
}): Promise<NearbyHospitalsResponse> {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    radius: String(params.radiusMeters ?? 10000),
    limit: String(params.limit ?? 6),
  });
  if (params.regionId) qs.set('regionId', params.regionId);
  const res = await fetch(apiUrl(`/api/maps/nearby-hospitals?${qs.toString()}`), {
    credentials: getApiCredentials(),
    headers: await buildMapsAuthHeaders(params.roleHeader || 'DISPATCHER'),
  });
  const data = await res.json().catch(() => ({}));
  handleQuotaCheck(res, data);
  if (!res.ok) {
    throw new Error(data?.error || `Nearby hospitals request failed (${res.status})`);
  }
  return data as NearbyHospitalsResponse;
}

export async function computeRouteApi(params: {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  travelMode?: 'DRIVE' | 'TWO_WHEELER' | 'WALK';
  regionId?: string;
  roleHeader?: 'DISPATCHER' | 'RESPONDER';
}): Promise<ComputedRouteResult> {
  const res = await fetch(apiUrl('/api/maps/route'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildMapsAuthHeaders(params.roleHeader || 'DISPATCHER'),
    body: JSON.stringify({
      origin: params.origin,
      destination: params.destination,
      travelMode: params.travelMode || 'DRIVE',
      regionId: params.regionId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  handleQuotaCheck(res, data);
  if (!res.ok) {
    throw new Error(data?.error || `Route calculation failed (${res.status})`);
  }
  return data as ComputedRouteResult;
}

export async function computeEtaMatrixApi(params: {
  origins: Array<{ id?: string; lat: number; lon: number }>;
  destinations: Array<{ id?: string; lat: number; lon: number }>;
  travelMode?: 'DRIVE' | 'TWO_WHEELER' | 'WALK';
  roleHeader?: 'DISPATCHER' | 'RESPONDER';
}): Promise<EtaMatrixResponse> {
  const res = await fetch(apiUrl('/api/maps/eta-matrix'), {
    method: 'POST',
    credentials: getApiCredentials(),
    headers: await buildMapsAuthHeaders(params.roleHeader || 'DISPATCHER'),
    body: JSON.stringify({
      origins: params.origins,
      destinations: params.destinations,
      travelMode: params.travelMode || 'DRIVE',
    }),
  });
  const data = await res.json().catch(() => ({}));
  handleQuotaCheck(res, data);
  if (!res.ok) {
    throw new Error(data?.error || `ETA matrix request failed (${res.status})`);
  }
  return data as EtaMatrixResponse;
}

export async function reverseGeocodeApi(params: {
  lat: number;
  lon: number;
  roleHeader?: 'DISPATCHER' | 'RESPONDER';
}): Promise<ReverseGeocodeResponse> {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
  });
  const res = await fetch(apiUrl(`/api/maps/reverse-geocode?${qs.toString()}`), {
    credentials: getApiCredentials(),
    headers: await buildMapsAuthHeaders(params.roleHeader || 'DISPATCHER'),
  });
  const data = await res.json().catch(() => ({}));
  handleQuotaCheck(res, data);
  if (!res.ok) {
    throw new Error(data?.error || `Reverse geocode request failed (${res.status})`);
  }
  return data as ReverseGeocodeResponse;
}
