import express from 'express';
import {
  optionalAuth,
  requireRole,
  type AuthRequest,
} from '../src/middleware/auth.ts';
import {
  formatDistanceMeters,
  formatDurationSeconds,
  haversineMeters,
} from '../src/utils/polyline.ts';
import type {
  ComputedRouteResult,
  EtaMatrixEntry,
  EtaMatrixResponse,
  NearbyHospital,
  NearbyHospitalsResponse,
  PublicHospitalContext,
  ReverseGeocodeResponse,
} from '../src/types/maps.ts';

export const mapsRouter = express.Router();

const requireOperational = [optionalAuth, requireRole(['ORG_ADMIN', 'DISPATCHER', 'RESPONDER'])];

const HOSPITAL_DISCLAIMER =
  'Informational decision-support only. Dispatcher must confirm receiving hospital availability and ambulance routing; GuardianGrid does not auto-dispatch ambulances or confirm hospital acceptance.';
const ROUTE_DISCLAIMER =
  'Estimated road route and travel time for operational awareness only. Actual coastal access and emergency conditions may vary.';

// Ephemeral in-memory caches only (never persisted to database, compliant with Maps ToS)
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const nearbyHospitalsCache = new Map<string, CacheEntry<NearbyHospital[]>>();
const routeCache = new Map<string, CacheEntry<ComputedRouteResult>>();
const etaMatrixCache = new Map<string, CacheEntry<EtaMatrixEntry[]>>();
const reverseGeocodeCache = new Map<string, CacheEntry<ReverseGeocodeResponse>>();

const HOSPITALS_TTL_MS = 30 * 60 * 1000; // 30 minutes
const ROUTE_TTL_MS = 60 * 1000; // 60 seconds
const REVERSE_GEOCODE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 300;

function getCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Per-client sliding-window rate limiter (prevents quota abuse)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 45;

function mapsRateLimiter(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
): void {
  const orgId = req.authContext?.organizationId || 'default';
  const actor =
    req.authContext?.uid ||
    req.ip ||
    (req.headers['x-forwarded-for'] as string) ||
    'unknown';
  const key = `${orgId}:${actor}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }
  if (bucket.count >= RATE_MAX_REQUESTS) {
    res.status(429).json({
      error: 'Too many map service requests. Please wait a moment before retrying.',
      rateLimited: true,
    });
    return;
  }
  bucket.count += 1;
  next();
}

/**
 * Enforces multi-tenant region isolation on /api/maps/* requests.
 * If the authenticated user has restricted authorizedRegionIds and requests a regionId
 * outside their authorized scope, the request is rejected with 403.
 */
function enforceRegionScope(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
): void {
  const requestedRegionId = String(
    req.query?.regionId || req.body?.regionId || req.header('x-gg-region-id') || ''
  ).trim();
  const authorizedRegions = req.authContext?.authorizedRegionIds || [];
  if (
    requestedRegionId &&
    authorizedRegions.length > 0 &&
    !authorizedRegions.includes(requestedRegionId)
  ) {
    res.status(403).json({
      error: 'Access denied: requested region is outside your authorized scope.',
    });
    return;
  }
  next();
}

function cleanEnv(value?: string): string {
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

/**
 * Resolves the server-side Google Maps API key.
 * Prefers dedicated GOOGLE_MAPS_SERVER_API_KEY; falls back to server-env VITE_GOOGLE_MAPS_API_KEY
 * in development environments where a single key is provisioned. Never returned to clients.
 */
function getServerMapsApiKey(): string {
  return (
    cleanEnv(process.env.GOOGLE_MAPS_SERVER_API_KEY) ||
    cleanEnv(process.env.GOOGLE_MAPS_API_KEY) ||
    cleanEnv(process.env.VITE_GOOGLE_MAPS_API_KEY)
  );
}

function isValidCoordinate(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function parseDurationSeconds(durationStr?: string | null): number {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(parseFloat(match[1])) : 0;
}

function isQuotaError(status: number, payload: any): boolean {
  if (status === 429) return true;
  const errStatus = payload?.error?.status || payload?.status;
  return errStatus === 'RESOURCE_EXHAUSTED' || errStatus === 'OVER_QUERY_LIMIT';
}

export class MapsQuotaExceededError extends Error {
  constructor(message = 'Google Maps Platform quota exceeded') {
    super(message);
    this.name = 'MapsQuotaExceededError';
  }
}

/**
 * Server helper: Places API (New) Nearby Search for hospitals & emergency facilities.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */
export async function fetchNearbyHospitalsServer(params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  maxResults?: number;
}): Promise<NearbyHospitalsResponse> {
  const radius = Math.max(1000, Math.min(params.radiusMeters ?? 10000, 25000));
  const maxResults = Math.max(1, Math.min(params.maxResults ?? 6, 10));
  const cacheKey = `${params.lat.toFixed(3)},${params.lon.toFixed(3)},${radius},${maxResults}`;

  const cached = getCache(nearbyHospitalsCache, cacheKey);
  if (cached) {
    return {
      configured: true,
      source: 'google_places_new',
      cached: true,
      hospitals: cached,
      disclaimer: HOSPITAL_DISCLAIMER,
    };
  }

  const apiKey = getServerMapsApiKey();
  if (!apiKey) {
    return {
      configured: false,
      source: 'unavailable',
      cached: false,
      hospitals: [],
      disclaimer: HOSPITAL_DISCLAIMER,
      warning: 'Google Maps server API key is not configured.',
    };
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.nationalPhoneNumber',
    'places.currentOpeningHours.openNow',
    'places.googleMapsUri',
    'places.googleMapsLinks.directionsUri',
    'places.primaryType',
  ].join(',');

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      includedTypes: ['hospital'],
      maxResultCount: maxResults,
      rankPreference: 'DISTANCE',
      languageCode: 'en',
      locationRestriction: {
        circle: {
          center: {
            latitude: params.lat,
            longitude: params.lon,
          },
          radius,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (isQuotaError(response.status, payload)) {
    throw new MapsQuotaExceededError();
  }

  if (!response.ok) {
    const errMsg = payload?.error?.message || `Places API (New) returned HTTP ${response.status}`;
    return {
      configured: true,
      source: 'unavailable',
      cached: false,
      hospitals: [],
      disclaimer: HOSPITAL_DISCLAIMER,
      warning: errMsg,
    };
  }

  const rawPlaces: any[] = Array.isArray(payload?.places) ? payload.places : [];
  const hospitals: NearbyHospital[] = rawPlaces
    .filter((p) => typeof p?.location?.latitude === 'number' && typeof p?.location?.longitude === 'number')
    .map((p) => {
      const hLat = p.location.latitude;
      const hLng = p.location.longitude;
      return {
        placeId: String(p.id || `${hLat},${hLng}`),
        name: p.displayName?.text || 'Nearby Hospital',
        address: p.formattedAddress || '',
        lat: hLat,
        lng: hLng,
        distanceMeters: haversineMeters(params.lat, params.lon, hLat, hLng),
        phoneNumber: p.nationalPhoneNumber || null,
        openNow:
          typeof p.currentOpeningHours?.openNow === 'boolean'
            ? p.currentOpeningHours.openNow
            : null,
        googleMapsUri: p.googleMapsUri || null,
        directionsUri: p.googleMapsLinks?.directionsUri || null,
        primaryType: p.primaryType || 'hospital',
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  setCache(nearbyHospitalsCache, cacheKey, hospitals, HOSPITALS_TTL_MS);

  return {
    configured: true,
    source: 'google_places_new',
    cached: false,
    hospitals,
    disclaimer: HOSPITAL_DISCLAIMER,
  };
}

/**
 * Server helper: Routes API computeRoutes (traffic-aware driving route + polyline).
 * Docs: https://developers.google.com/maps/documentation/routes/compute_route_directions?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */
export async function computeRouteServer(params: {
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  travelMode?: 'DRIVE' | 'TWO_WHEELER' | 'WALK';
}): Promise<ComputedRouteResult> {
  const mode = params.travelMode || 'DRIVE';
  const cacheKey = `${mode}:${params.originLat.toFixed(3)},${params.originLon.toFixed(3)}->${params.destLat.toFixed(3)},${params.destLon.toFixed(3)}`;

  const cached = getCache(routeCache, cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const straightMeters = haversineMeters(
    params.originLat,
    params.originLon,
    params.destLat,
    params.destLon
  );
  // Conservative 35 km/h urban-coastal speed estimate for fallback only
  const fallbackSeconds = Math.max(60, Math.round((straightMeters / 1000 / 35) * 3600));

  const buildFallback = (configured: boolean, warning?: string): ComputedRouteResult => ({
    configured,
    source: 'straight_line_fallback',
    cached: false,
    distanceMeters: straightMeters,
    durationSeconds: fallbackSeconds,
    staticDurationSeconds: fallbackSeconds,
    distanceText: formatDistanceMeters(straightMeters),
    durationText: `~${formatDurationSeconds(fallbackSeconds)} (est.)`,
    encodedPolyline: null,
    routeDescription: null,
    trafficAware: false,
    disclaimer: ROUTE_DISCLAIMER,
    warning,
  });

  const apiKey = getServerMapsApiKey();
  if (!apiKey) {
    return buildFallback(false, 'Google Maps server API key is not configured.');
  }

  const fieldMask = [
    'routes.duration',
    'routes.staticDuration',
    'routes.distanceMeters',
    'routes.polyline.encodedPolyline',
    'routes.description',
  ].join(',');

  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: { latitude: params.originLat, longitude: params.originLon },
      },
    },
    destination: {
      location: {
        latLng: { latitude: params.destLat, longitude: params.destLon },
      },
    },
    travelMode: mode,
    computeAlternativeRoutes: false,
    languageCode: 'en-IN',
    units: 'METRIC',
  };

  if (mode === 'DRIVE' || mode === 'TWO_WHEELER') {
    body.routingPreference = 'TRAFFIC_AWARE';
  }

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (isQuotaError(response.status, payload)) {
    throw new MapsQuotaExceededError();
  }

  if (!response.ok || !Array.isArray(payload?.routes) || payload.routes.length === 0) {
    const errMsg = payload?.error?.message || `Routes API returned HTTP ${response.status}`;
    return buildFallback(true, errMsg);
  }

  const route = payload.routes[0];
  const distanceMeters =
    typeof route.distanceMeters === 'number' ? route.distanceMeters : straightMeters;
  const durationSeconds = parseDurationSeconds(route.duration) || fallbackSeconds;
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration) || null;

  const result: ComputedRouteResult = {
    configured: true,
    source: 'google_routes_api',
    cached: false,
    distanceMeters,
    durationSeconds,
    staticDurationSeconds,
    distanceText: formatDistanceMeters(distanceMeters),
    durationText: formatDurationSeconds(durationSeconds),
    encodedPolyline: route.polyline?.encodedPolyline || null,
    routeDescription: route.description || null,
    trafficAware: mode === 'DRIVE' || mode === 'TWO_WHEELER',
    disclaimer: ROUTE_DISCLAIMER,
  };

  setCache(routeCache, cacheKey, result, ROUTE_TTL_MS);
  return result;
}

/**
 * Server helper: Routes API Compute Route Matrix for multi-responder dispatch ETAs.
 * Docs: https://developers.google.com/maps/documentation/routes/compute_route_matrix?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */
export async function computeRouteMatrixServer(params: {
  origins: Array<{ id?: string; lat: number; lon: number }>;
  destinations: Array<{ id?: string; lat: number; lon: number }>;
  travelMode?: 'DRIVE' | 'TWO_WHEELER' | 'WALK';
}): Promise<EtaMatrixResponse> {
  const mode = params.travelMode || 'DRIVE';
  const cacheKey = `${mode}:${params.origins
    .map((o) => `${o.lat.toFixed(3)},${o.lon.toFixed(3)}`)
    .join('|')}->${params.destinations
    .map((d) => `${d.lat.toFixed(3)},${d.lon.toFixed(3)}`)
    .join('|')}`;

  const cached = getCache(etaMatrixCache, cacheKey);
  if (cached) {
    return {
      configured: true,
      source: 'google_routes_matrix',
      cached: true,
      entries: cached,
      disclaimer: ROUTE_DISCLAIMER,
    };
  }

  const buildFallback = (configured: boolean, warning?: string): EtaMatrixResponse => {
    const entries: EtaMatrixEntry[] = [];
    params.origins.forEach((o, oi) => {
      params.destinations.forEach((d, di) => {
        const dist = haversineMeters(o.lat, o.lon, d.lat, d.lon);
        const dur = Math.max(60, Math.round((dist / 1000 / 35) * 3600));
        entries.push({
          originIndex: oi,
          destinationIndex: di,
          originId: o.id,
          destinationId: d.id,
          distanceMeters: dist,
          durationSeconds: dur,
          distanceText: formatDistanceMeters(dist),
          durationText: `~${formatDurationSeconds(dur)}`,
          status: 'FALLBACK',
        });
      });
    });
    return {
      configured,
      source: 'straight_line_fallback',
      cached: false,
      entries,
      disclaimer: ROUTE_DISCLAIMER,
      warning,
    };
  };

  const apiKey = getServerMapsApiKey();
  if (!apiKey) {
    return buildFallback(false, 'Google Maps server API key is not configured.');
  }

  const body: Record<string, unknown> = {
    origins: params.origins.map((o) => ({
      waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lon } } },
    })),
    destinations: params.destinations.map((d) => ({
      waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lon } } },
    })),
    travelMode: mode,
  };
  if (mode === 'DRIVE' || mode === 'TWO_WHEELER') {
    body.routingPreference = 'TRAFFIC_AWARE';
  }

  const response = await fetch(
    'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition,status',
      },
      body: JSON.stringify(body),
    }
  );

  const payload = await response.json().catch(() => ([]));
  if (isQuotaError(response.status, payload)) {
    throw new MapsQuotaExceededError();
  }

  if (!response.ok || !Array.isArray(payload)) {
    const errMsg = (payload as any)?.error?.message || `Route Matrix API returned HTTP ${response.status}`;
    return buildFallback(true, errMsg);
  }

  const entries: EtaMatrixEntry[] = payload.map((item: any) => {
    const oi = Number(item.originIndex ?? 0);
    const di = Number(item.destinationIndex ?? 0);
    const dist = typeof item.distanceMeters === 'number' ? item.distanceMeters : 0;
    const dur = parseDurationSeconds(item.duration);
    const ok = item.condition === 'ROUTE_EXISTS';
    return {
      originIndex: oi,
      destinationIndex: di,
      originId: params.origins[oi]?.id,
      destinationId: params.destinations[di]?.id,
      distanceMeters: dist,
      durationSeconds: dur,
      distanceText: ok ? formatDistanceMeters(dist) : '—',
      durationText: ok ? formatDurationSeconds(dur) : 'Unavailable',
      status: ok ? 'OK' : 'UNAVAILABLE',
    };
  });

  setCache(etaMatrixCache, cacheKey, entries, ROUTE_TTL_MS);

  return {
    configured: true,
    source: 'google_routes_matrix',
    cached: false,
    entries,
    disclaimer: ROUTE_DISCLAIMER,
  };
}

/**
 * Server helper: Reverse Geocoding via Google Geocoding REST API with Nominatim fallback.
 * Docs: https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */
export async function reverseGeocodeServer(lat: number, lon: number): Promise<ReverseGeocodeResponse> {
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = getCache(reverseGeocodeCache, cacheKey);
  if (cached) return { ...cached, cached: true };

  const apiKey = getServerMapsApiKey();
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
        `${lat},${lon}`
      )}&language=en&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (isQuotaError(res.status, data)) {
        throw new MapsQuotaExceededError();
      }
      if (res.ok && data?.status === 'OK' && Array.isArray(data.results) && data.results[0]?.formatted_address) {
        const result: ReverseGeocodeResponse = {
          source: 'google_geocoding',
          cached: false,
          formattedAddress: data.results[0].formatted_address,
          lat,
          lon,
        };
        setCache(reverseGeocodeCache, cacheKey, result, REVERSE_GEOCODE_TTL_MS);
        return result;
      }
    } catch (err) {
      if (err instanceof MapsQuotaExceededError) throw err;
      // Fall through to Nominatim fallback
    }
  }

  // Fallback to Nominatim reverse geocoding
  try {
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'GuardianGrid-CoastalSafety/1.0',
        },
      }
    );
    if (nomRes.ok) {
      const nomData = await nomRes.json().catch(() => ({}));
      if (nomData?.display_name) {
        const result: ReverseGeocodeResponse = {
          source: 'nominatim_fallback',
          cached: false,
          formattedAddress: nomData.display_name,
          lat,
          lon,
        };
        setCache(reverseGeocodeCache, cacheKey, result, REVERSE_GEOCODE_TTL_MS);
        return result;
      }
    }
  } catch {
    // Fall through to coordinates-only
  }

  return {
    source: 'coordinates_only',
    cached: false,
    formattedAddress: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    lat,
    lon,
  };
}

/**
 * Tightly-scoped helper exclusively for token-validated Public Paramedic Tracking.
 * Returns nearest hospital, incident-to-hospital route, and optional responder-to-incident route
 * using ephemeral in-memory cache.
 */
export async function getPublicHospitalContextForIncident(
  lat: number | null,
  lon: number | null,
  primaryResponderCoords?: { lat: number; lon: number } | null
): Promise<PublicHospitalContext | null> {
  if (lat === null || lon === null || !isValidCoordinate(lat, lon)) {
    return null;
  }
  try {
    const [nearby, responderToIncidentRoute] = await Promise.all([
      fetchNearbyHospitalsServer({
        lat,
        lon,
        radiusMeters: 12000,
        maxResults: 3,
      }),
      primaryResponderCoords &&
      isValidCoordinate(primaryResponderCoords.lat, primaryResponderCoords.lon)
        ? computeRouteServer({
            originLat: primaryResponderCoords.lat,
            originLon: primaryResponderCoords.lon,
            destLat: lat,
            destLon: lon,
            travelMode: 'DRIVE',
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const nearest = nearby.hospitals[0] || null;
    if (!nearest) {
      return {
        nearestHospital: null,
        incidentToHospitalRoute: null,
        responderToIncidentRoute,
        disclaimer: HOSPITAL_DISCLAIMER,
      };
    }
    const route = await computeRouteServer({
      originLat: lat,
      originLon: lon,
      destLat: nearest.lat,
      destLon: nearest.lng,
      travelMode: 'DRIVE',
    });
    return {
      nearestHospital: nearest,
      incidentToHospitalRoute: route,
      responderToIncidentRoute,
      disclaimer: HOSPITAL_DISCLAIMER,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Authenticated Express Routes (/api/maps/*)
// Public unauthenticated users cannot call these endpoints.
// ============================================================================

mapsRouter.get('/health', ...requireOperational, (_req: AuthRequest, res) => {
  const dedicatedServerKey = Boolean(cleanEnv(process.env.GOOGLE_MAPS_SERVER_API_KEY));
  const serverKeyConfigured = Boolean(getServerMapsApiKey());
  const browserKeyConfigured = Boolean(cleanEnv(process.env.VITE_GOOGLE_MAPS_API_KEY));
  const mapIdConfigured = Boolean(cleanEnv(process.env.VITE_GOOGLE_MAPS_MAP_ID));
  return res.json({
    serverKeyConfigured,
    dedicatedServerKey,
    browserKeyConfigured,
    mapIdConfigured,
  });
});

mapsRouter.get(
  '/nearby-hospitals',
  ...requireOperational,
  enforceRegionScope,
  mapsRateLimiter,
  async (req: AuthRequest, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radius = req.query.radius ? Number(req.query.radius) : 10000;
    const maxResults = req.query.limit ? Number(req.query.limit) : 6;

    if (!isValidCoordinate(lat, lon)) {
      return res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
    }

    try {
      const data = await fetchNearbyHospitalsServer({
        lat,
        lon,
        radiusMeters: Number.isFinite(radius) ? radius : 10000,
        maxResults: Number.isFinite(maxResults) ? maxResults : 6,
      });
      return res.json(data);
    } catch (err: any) {
      if (err instanceof MapsQuotaExceededError) {
        return res.status(429).json({ error: err.message, quotaExceeded: true });
      }
      console.error('GET /api/maps/nearby-hospitals failed:', err?.message);
      return res.status(502).json({ error: 'Unable to fetch nearby hospitals.' });
    }
  }
);

mapsRouter.post(
  '/route',
  ...requireOperational,
  enforceRegionScope,
  mapsRateLimiter,
  async (req: AuthRequest, res) => {
    const originLat = Number(req.body?.origin?.lat);
    const originLon = Number(req.body?.origin?.lon ?? req.body?.origin?.lng);
    const destLat = Number(req.body?.destination?.lat);
    const destLon = Number(req.body?.destination?.lon ?? req.body?.destination?.lng);
    const travelMode = req.body?.travelMode;

    if (!isValidCoordinate(originLat, originLon) || !isValidCoordinate(destLat, destLon)) {
      return res.status(400).json({
        error: 'Valid origin ({lat, lon}) and destination ({lat, lon}) coordinates are required.',
      });
    }

    const safeMode: 'DRIVE' | 'TWO_WHEELER' | 'WALK' =
      travelMode === 'WALK' || travelMode === 'TWO_WHEELER' ? travelMode : 'DRIVE';

    try {
      const data = await computeRouteServer({
        originLat,
        originLon,
        destLat,
        destLon,
        travelMode: safeMode,
      });
      return res.json(data);
    } catch (err: any) {
      if (err instanceof MapsQuotaExceededError) {
        return res.status(429).json({ error: err.message, quotaExceeded: true });
      }
      console.error('POST /api/maps/route failed:', err?.message);
      return res.status(502).json({ error: 'Unable to compute route.' });
    }
  }
);

mapsRouter.post(
  '/eta-matrix',
  ...requireOperational,
  enforceRegionScope,
  mapsRateLimiter,
  async (req: AuthRequest, res) => {
    const rawOrigins = Array.isArray(req.body?.origins) ? req.body.origins : [];
    const rawDestinations = Array.isArray(req.body?.destinations) ? req.body.destinations : [];

    if (
      rawOrigins.length === 0 ||
      rawDestinations.length === 0 ||
      rawOrigins.length > 10 ||
      rawDestinations.length > 5
    ) {
      return res.status(400).json({
        error: 'Provide 1–10 origins and 1–5 destinations with valid lat/lon coordinates.',
      });
    }

    const origins = rawOrigins
      .map((o: any) => ({
        id: typeof o?.id === 'string' ? o.id : undefined,
        lat: Number(o?.lat),
        lon: Number(o?.lon ?? o?.lng),
      }))
      .filter((o: any) => isValidCoordinate(o.lat, o.lon));

    const destinations = rawDestinations
      .map((d: any) => ({
        id: typeof d?.id === 'string' ? d.id : undefined,
        lat: Number(d?.lat),
        lon: Number(d?.lon ?? d?.lng),
      }))
      .filter((d: any) => isValidCoordinate(d.lat, d.lon));

    if (origins.length !== rawOrigins.length || destinations.length !== rawDestinations.length) {
      return res.status(400).json({ error: 'All origins and destinations must have valid coordinates.' });
    }

    const travelMode =
      req.body?.travelMode === 'WALK' || req.body?.travelMode === 'TWO_WHEELER'
        ? req.body.travelMode
        : 'DRIVE';

    try {
      const data = await computeRouteMatrixServer({ origins, destinations, travelMode });
      return res.json(data);
    } catch (err: any) {
      if (err instanceof MapsQuotaExceededError) {
        return res.status(429).json({ error: err.message, quotaExceeded: true });
      }
      console.error('POST /api/maps/eta-matrix failed:', err?.message);
      return res.status(502).json({ error: 'Unable to compute ETA matrix.' });
    }
  }
);

mapsRouter.get(
  '/reverse-geocode',
  ...requireOperational,
  enforceRegionScope,
  mapsRateLimiter,
  async (req: AuthRequest, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!isValidCoordinate(lat, lon)) {
      return res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
    }

    try {
      const data = await reverseGeocodeServer(lat, lon);
      return res.json(data);
    } catch (err: any) {
      if (err instanceof MapsQuotaExceededError) {
        return res.status(429).json({ error: err.message, quotaExceeded: true });
      }
      console.error('GET /api/maps/reverse-geocode failed:', err?.message);
      return res.status(502).json({ error: 'Unable to reverse geocode coordinates.' });
    }
  }
);
