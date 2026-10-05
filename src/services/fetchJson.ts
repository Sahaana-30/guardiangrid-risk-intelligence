export class ApiError extends Error {
  constructor(message: string, public status?: number, public source?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  cacheTtlMs?: number;
}

const memoryCache = new Map<string, { timestamp: number; data: any }>();

export async function fetchJson<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    timeoutMs = 12000,
    retries = 2,
    cacheTtlMs = 1000 * 60 * 30,
    ...init
  } = options;

  if (init.method === undefined || init.method === 'GET') {
    const cached = memoryCache.get(url);
    if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
      return cached.data as T;
    }

    try {
      const stored = localStorage.getItem(`cache_${url}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < cacheTtlMs) {
          memoryCache.set(url, parsed);
          return parsed.data as T;
        }
      }
    } catch {}
  }

  let attempt = 0;
  let lastError: any;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ApiError(
          `Request to ${url} failed with status ${response.status}`,
          response.status
        );
      }

      const data = await response.json();

      if (init.method === undefined || init.method === 'GET') {
        const cacheEntry = { timestamp: Date.now(), data };
        memoryCache.set(url, cacheEntry);
        try {
          localStorage.setItem(`cache_${url}`, JSON.stringify(cacheEntry));
        } catch {}
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      attempt++;

      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 400));
      }
    }
  }

  try {
    const stored = localStorage.getItem(`cache_${url}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.warn(`[GuardianGrid] Serving stale cache for ${url} (offline fallback)`);
      return parsed.data as T;
    }
  } catch {}

  throw new ApiError(
    `Failed to fetch from ${url} after ${retries + 1} attempts: ${lastError?.message || 'Network error'}`
  );
}
