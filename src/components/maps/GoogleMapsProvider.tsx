import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

interface GoogleMapsStatusContextValue {
  hasApiKey: boolean;
  mapId: string;
  useGoogleMaps: boolean;
  fallbackReason: string | null;
  reportFailure: (reason: string) => void;
  isProviderMounted?: boolean;
}

const GoogleMapsStatusContext = createContext<GoogleMapsStatusContextValue>({
  hasApiKey: false,
  mapId: 'DEMO_MAP_ID',
  useGoogleMaps: false,
  fallbackReason: 'Google Maps API key not configured',
  reportFailure: () => {},
  isProviderMounted: false,
});

export function useGoogleMapsStatus(): GoogleMapsStatusContextValue {
  return useContext(GoogleMapsStatusContext);
}

export function resolveGoogleMapsState(params: {
  rawApiKey?: string | null;
  rawMapId?: string | null;
  runtimeFailureReason?: string | null;
}): {
  apiKey: string;
  hasApiKey: boolean;
  mapId: string;
  useGoogleMaps: boolean;
  fallbackReason: string | null;
} {
  const trimmed = (params.rawApiKey || '').trim();
  const apiKey = !trimmed || trimmed === 'MY_GOOGLE_MAPS_BROWSER_API_KEY' ? '' : trimmed;
  const mapId = (params.rawMapId || '').trim() || 'DEMO_MAP_ID';
  const fallbackReason = !apiKey
    ? 'Google Maps API key not configured — using fallback map'
    : params.runtimeFailureReason || null;
  return {
    apiKey,
    hasApiKey: Boolean(apiKey),
    mapId,
    useGoogleMaps: Boolean(apiKey) && !fallbackReason,
    fallbackReason,
  };
}

export const GoogleMapsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const parent = useContext(GoogleMapsStatusContext);

  const initial = useMemo(
    () =>
      resolveGoogleMapsState({
        rawApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        rawMapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
      }),
    []
  );
  const apiKey = initial.apiKey;
  const mapId = initial.mapId;
  const [fallbackReason, setFallbackReason] = useState<string | null>(initial.fallbackReason);

  const reportFailure = useCallback((reason: string) => {
    setFallbackReason((prev) => prev || reason);
  }, []);

  useEffect(() => {
    if (parent.isProviderMounted) return;

    const onQuotaExceeded = () => {
      reportFailure('Google Maps Platform quota exceeded — using fallback map');
    };
    const onFallbackTriggered = (evt: Event) => {
      const detail = (evt as CustomEvent<{ reason?: string }>).detail;
      reportFailure(detail?.reason || 'Google Maps Platform unavailable — using fallback map');
    };

    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    window.addEventListener('gmp-fallback-triggered', onFallbackTriggered);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
      window.removeEventListener('gmp-fallback-triggered', onFallbackTriggered);
    };
  }, [parent.isProviderMounted, reportFailure]);

  // Safety watchdog: if Google Maps API key is configured but script never initializes (e.g. offline/blocked/invalid), fall back cleanly
  useEffect(() => {
    if (parent.isProviderMounted || !apiKey || fallbackReason) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      reportFailure('Offline mode detected — using fallback map');
      return;
    }

    const timer = window.setTimeout(() => {
      const hasGoogleMapsGlobal = Boolean((window as any).google?.maps?.Map);
      if (!hasGoogleMapsGlobal) {
        reportFailure('Google Maps JavaScript API failed to initialize — using fallback map');
      }
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [parent.isProviderMounted, apiKey, fallbackReason, reportFailure]);

  const value = useMemo<GoogleMapsStatusContextValue>(
    () => ({
      hasApiKey: Boolean(apiKey),
      mapId,
      useGoogleMaps: Boolean(apiKey) && !fallbackReason,
      fallbackReason,
      reportFailure,
      isProviderMounted: true,
    }),
    [apiKey, mapId, fallbackReason, reportFailure]
  );

  // Deduplicate APIProvider if a parent GoogleMapsProvider is already mounted
  if (parent.isProviderMounted) {
    return <>{children}</>;
  }

  if (!apiKey || fallbackReason) {
    return (
      <GoogleMapsStatusContext.Provider value={value}>
        {children}
      </GoogleMapsStatusContext.Provider>
    );
  }

  return (
    <GoogleMapsStatusContext.Provider value={value}>
      <APIProvider
        apiKey={apiKey}
        language="en"
        region="IN"
        onError={() =>
          reportFailure('Unable to load Google Maps JavaScript API — using fallback map')
        }
      >
        {children}
      </APIProvider>
    </GoogleMapsStatusContext.Provider>
  );
};
