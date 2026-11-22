/**
 * Centralized Backend API URL helper for split Vercel frontend + Cloud Run backend hosting.
 *
 * - In local development (or combined single-origin hosting), leave VITE_API_BASE_URL empty
 *   to preserve same-origin `/api/*` requests.
 * - In production split hosting (Vercel frontend -> Cloud Run backend), set VITE_API_BASE_URL
 *   to the Cloud Run service base URL (e.g. https://guardiangrid-api-xxxx.run.app).
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!raw || raw === 'MY_API_BASE_URL') return '';
  return raw.replace(/\/+$/, '');
}

export function isCrossOriginApi(): boolean {
  return getApiBaseUrl().length > 0;
}

export function apiUrl(path: string): string {
  if (!path) return getApiBaseUrl() || '/';
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Auth relies on Authorization Bearer tokens and x-gg-* headers, never cookies.
 * Using 'omit' when cross-origin avoids unnecessary credentialed CORS issues, while
 * preserving 'same-origin' in local dev.
 */
export function getApiCredentials(): RequestCredentials {
  return isCrossOriginApi() ? 'omit' : 'same-origin';
}
