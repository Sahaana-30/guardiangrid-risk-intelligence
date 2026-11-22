import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export interface PublicSosBackResolution {
  target: 'in_app' | 'landing';
  path: string;
}

export interface PageBackResolution {
  path: string;
  usedHistory: boolean;
  label: string;
}

export function isSosRoute(pathname: string): boolean {
  return pathname === '/sos' || pathname.startsWith('/sos/');
}

export function isSafeInternalPath(path?: string | null): path is string {
  if (!path) return false;
  return path.startsWith('/') && !path.startsWith('//') && !isSosRoute(path);
}

export function resolvePublicSosBackTarget(params: {
  hasInAppOrigin: boolean;
  lastNonSosRoute: string | null;
}): PublicSosBackResolution {
  if (params.hasInAppOrigin && isSafeInternalPath(params.lastNonSosRoute)) {
    return { target: 'in_app', path: params.lastNonSosRoute };
  }
  return { target: 'landing', path: '/' };
}

export function getDefaultBackLabel(path: string): string {
  const pathname = path.split('?')[0] || '/';
  if (pathname === '/' || pathname === '') return 'Home';
  if (pathname === '/dashboard') return 'Overview';
  if (pathname === '/command') return 'Live Operations';
  if (pathname === '/incidents') return 'Incidents & SOS';
  if (pathname === '/responders') return 'Responders';
  if (pathname === '/field-kit') return 'Responder Field Kit';
  if (pathname === '/medical-handoff') return 'Medical Handoff';
  if (pathname === '/map') return 'Risk Map';
  if (pathname === '/analytics') return 'Coastal Intelligence';
  if (pathname === '/water-bodies') return 'Water Bodies';
  if (pathname === '/forecast') return 'Forecast';
  if (pathname === '/reports') return 'Reports';
  if (pathname === '/messages') return 'Communications';
  if (pathname === '/workspace') return 'Workspaces';
  if (pathname === '/settings') return 'Settings';
  return 'Previous View';
}

export function getDefaultParentFallback(pathname: string): string {
  if (pathname.startsWith('/water-bodies/')) return '/water-bodies';
  if (pathname.startsWith('/reports/')) return '/reports';
  if (
    ['/water-bodies', '/forecast', '/explain', '/clusters', '/fairness', '/methodology', '/reports'].includes(
      pathname
    )
  ) {
    return '/analytics';
  }
  return '/dashboard';
}

export function resolveBackNavigationTarget(params: {
  currentPathname: string;
  previousRoute: string | null;
  explicitReturnTo?: string | null;
  fallbackPath?: string;
}): PageBackResolution {
  const fallback =
    params.fallbackPath && isSafeInternalPath(params.fallbackPath)
      ? params.fallbackPath
      : getDefaultParentFallback(params.currentPathname);

  if (
    isSafeInternalPath(params.explicitReturnTo) &&
    params.explicitReturnTo.split('?')[0] !== params.currentPathname
  ) {
    return {
      path: params.explicitReturnTo,
      usedHistory: false,
      label: getDefaultBackLabel(params.explicitReturnTo),
    };
  }

  if (
    isSafeInternalPath(params.previousRoute) &&
    params.previousRoute.split('?')[0] !== params.currentPathname
  ) {
    return {
      path: params.previousRoute,
      usedHistory: true,
      label: getDefaultBackLabel(params.previousRoute),
    };
  }

  return {
    path: fallback,
    usedHistory: false,
    label: getDefaultBackLabel(fallback),
  };
}

export function shouldConfirmSosLeave(state: {
  submitting: boolean;
  instantFiring: boolean;
  hasReceipt: boolean;
  hasInstantResult: boolean;
  hasQueuedConfirmation: boolean;
  liveVideoActive?: boolean;
  description: string;
  reporterName: string;
  reporterPhone: string;
  voiceTranscript: string;
  photoDataUrl?: string;
  childAge: string;
  childClothing: string;
  bystanderChatInput: string;
}): boolean {
  if (state.submitting || state.instantFiring || state.liveVideoActive) {
    return true;
  }
  if (state.hasInstantResult && state.bystanderChatInput.trim().length > 0) {
    return true;
  }
  if (state.hasReceipt || state.hasInstantResult || state.hasQueuedConfirmation) {
    return false;
  }
  return Boolean(
    state.description.trim() ||
      state.reporterName.trim() ||
      state.reporterPhone.trim() ||
      state.voiceTranscript.trim() ||
      state.photoDataUrl ||
      state.childAge.trim() ||
      state.childClothing.trim()
  );
}

interface NavigationContextValue {
  hasInAppOrigin: boolean;
  lastNonSosRoute: string | null;
  previousRoute: string | null;
}

const NavigationContext = createContext<NavigationContextValue>({
  hasInAppOrigin: false,
  lastNonSosRoute: null,
  previousRoute: null,
});

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [lastNonSosRoute, setLastNonSosRoute] = useState<string | null>(null);
  const [previousRoute, setPreviousRoute] = useState<string | null>(null);
  const currentFullRouteRef = useRef<string | null>(null);

  useEffect(() => {
    const fullRoute = `${location.pathname}${location.search || ''}`;
    if (currentFullRouteRef.current && currentFullRouteRef.current !== fullRoute) {
      if (!isSosRoute(currentFullRouteRef.current.split('?')[0])) {
        setPreviousRoute(currentFullRouteRef.current);
      }
    }
    currentFullRouteRef.current = fullRoute;

    if (!isSosRoute(location.pathname)) {
      setLastNonSosRoute(fullRoute);
    }
  }, [location.pathname, location.search]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      hasInAppOrigin: Boolean(lastNonSosRoute),
      lastNonSosRoute,
      previousRoute,
    }),
    [lastNonSosRoute, previousRoute]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export function useInAppNavigation(): NavigationContextValue {
  return useContext(NavigationContext);
}
