import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { SaasPlanTier, WorkspaceConfig } from '../types/workspace';
import { DEFAULT_TENANT_ORG_ID, setActiveOrganizationId } from '../services/tenantScope';

const STORAGE_KEY = 'gg_phase7_workspaces_v1';
const ACTIVE_WS_KEY = 'gg_phase7_active_workspace_id_v1';

export const DEFAULT_WORKSPACES: WorkspaceConfig[] = [
  {
    id: 'ws-marina-municipal',
    organizationId: DEFAULT_TENANT_ORG_ID,
    name: 'Marina Beach Municipal Command',
    sector: 'Municipal Coastal Command',
    planTier: 'ENTERPRISE',
    subscriptionStatus: 'ENTERPRISE_ACTIVE',
    branding: {
      displayName: 'GuardianGrid',
      shortTitle: 'Marina Municipal Command',
      tagline: 'Coastal Risk & Rescue Command',
      logoText: 'GG',
      icon: 'shield',
      primaryColor: '#0B3B3C',
      accentColor: '#0F766E',
    },
    geofence: {
      regionId: 'reg-in-chennai',
      regionName: 'Chennai Coast — Marina & Elliot Sectors',
      cityId: 'chennai',
      centerLat: 13.05,
      centerLon: 80.2824,
      radiusMeters: 3500,
    },
    settings: {
      autoEscalateSeconds: 90,
      enableBilingualTamil: true,
      enableHospitalDecisionSupport: true,
      requireDispatcherSbarApproval: true,
    },
    isPrimaryProductionOrg: true,
  },
  {
    id: 'ws-ecr-resort',
    organizationId: 'org-ecr-coastal-resort',
    name: 'ECR Coastal Resort & Waterpark',
    sector: 'Hospitality & Resort Safety',
    planTier: 'STARTER',
    subscriptionStatus: 'ACTIVE',
    branding: {
      displayName: 'ECR CoastSafe',
      shortTitle: 'ECR Resort & Waterpark',
      tagline: 'Guest Beachfront & Lagoon Safety',
      logoText: 'ECR',
      icon: 'waves',
      primaryColor: '#0C4A6E',
      accentColor: '#0284C7',
    },
    geofence: {
      regionId: 'reg-in-chennai',
      regionName: 'East Coast Road — Kovalam & Muttukadu Strip',
      cityId: 'chennai',
      centerLat: 12.8235,
      centerLon: 80.2448,
      radiusMeters: 1200,
    },
    settings: {
      autoEscalateSeconds: 60,
      enableBilingualTamil: true,
      enableHospitalDecisionSupport: true,
      requireDispatcherSbarApproval: true,
    },
    isPrimaryProductionOrg: false,
  },
  {
    id: 'ws-chennai-port',
    organizationId: 'org-chennai-port-maritime',
    name: 'Chennai Port Maritime Safety',
    sector: 'Maritime Port Authority',
    planTier: 'ENTERPRISE',
    subscriptionStatus: 'ENTERPRISE_ACTIVE',
    branding: {
      displayName: 'PortGuard Chennai',
      shortTitle: 'Chennai Port Maritime',
      tagline: 'Harbour Operations & Vessel Safety',
      logoText: 'CPM',
      icon: 'anchor',
      primaryColor: '#1E293B',
      accentColor: '#B45309',
    },
    geofence: {
      regionId: 'reg-in-chennai',
      regionName: 'Chennai Port Harbour & Outer Breakwater',
      cityId: 'chennai',
      centerLat: 13.0845,
      centerLon: 80.2998,
      radiusMeters: 5000,
    },
    settings: {
      autoEscalateSeconds: 75,
      enableBilingualTamil: true,
      enableHospitalDecisionSupport: true,
      requireDispatcherSbarApproval: true,
    },
    isPrimaryProductionOrg: false,
  },
];

interface WorkspaceContextValue {
  workspaces: WorkspaceConfig[];
  activeWorkspace: WorkspaceConfig;
  switchWorkspace: (workspaceId: string) => void;
  updateActiveWorkspace: (
    updater: (current: WorkspaceConfig) => WorkspaceConfig
  ) => void;
  setActiveWorkspacePlanPreview: (tier: SaasPlanTier) => void;
  resetWorkspacesToDefaults: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function loadStoredWorkspaces(): WorkspaceConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WORKSPACES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WORKSPACES;
    // Merge by id so all 3 required demo workspaces always exist
    const map = new Map<string, WorkspaceConfig>();
    DEFAULT_WORKSPACES.forEach((w) => map.set(w.id, w));
    parsed.forEach((w: WorkspaceConfig) => {
      if (w?.id && map.has(w.id)) {
        const defaults = map.get(w.id)!;
        const normalizedStatus =
          w.subscriptionStatus === 'ACTIVE_DEMO' || w.subscriptionStatus === 'TRIAL_PREVIEW'
            ? defaults.subscriptionStatus
            : w.subscriptionStatus;
        map.set(w.id, { ...defaults, ...w, subscriptionStatus: normalizedStatus });
      }
    });
    return Array.from(map.values());
  } catch {
    return DEFAULT_WORKSPACES;
  }
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>(loadStoredWorkspaces);
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_WS_KEY) || DEFAULT_WORKSPACES[0].id;
    } catch {
      return DEFAULT_WORKSPACES[0].id;
    }
  });

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) || workspaces[0] || DEFAULT_WORKSPACES[0],
    [workspaces, activeId]
  );

  // Synchronize active tenant organizationId across all API clients whenever workspace switches
  useEffect(() => {
    setActiveOrganizationId(activeWorkspace.organizationId);
    try {
      localStorage.setItem(ACTIVE_WS_KEY, activeWorkspace.id);
    } catch {
      // ignore storage errors
    }
  }, [activeWorkspace.id, activeWorkspace.organizationId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    } catch {
      // ignore storage errors
    }
  }, [workspaces]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveId(workspaceId);
  }, []);

  const updateActiveWorkspace = useCallback(
    (updater: (current: WorkspaceConfig) => WorkspaceConfig) => {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === activeWorkspace.id ? updater(w) : w))
      );
    },
    [activeWorkspace.id]
  );

  const setActiveWorkspacePlanPreview = useCallback(
    (tier: SaasPlanTier) => {
      updateActiveWorkspace((curr) => ({ ...curr, planTier: tier }));
    },
    [updateActiveWorkspace]
  );

  const resetWorkspacesToDefaults = useCallback(() => {
    setWorkspaces(DEFAULT_WORKSPACES);
    setActiveId(DEFAULT_WORKSPACES[0].id);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspace,
      switchWorkspace,
      updateActiveWorkspace,
      setActiveWorkspacePlanPreview,
      resetWorkspacesToDefaults,
    }),
    [
      workspaces,
      activeWorkspace,
      switchWorkspace,
      updateActiveWorkspace,
      setActiveWorkspacePlanPreview,
      resetWorkspacesToDefaults,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
