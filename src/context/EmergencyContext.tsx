import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  EmergencyCategory,
  EmergencyIncident,
  EmergencyLanguage,
  EmergencyStorageMeta,
  IncidentState,
  RescueCell,
  ResponderProfile,
} from '../types/emergency';
import {
  assignRespondersApi,
  clearSimulatedIncidentsApi,
  createIncidentNexconnGroupApi,
  fetchOperationalIncidents,
  fetchRescueCells,
  triggerSimulatedSOSApi,
  updateIncidentStatusApi,
  verifyIncidentApi,
} from '../services/emergencyApi';

interface EmergencyContextValue {
  cells: RescueCell[];
  incidents: EmergencyIncident[];
  responders: ResponderProfile[];
  storageMeta: EmergencyStorageMeta | null;
  scopeFilter: 'all' | 'real' | 'simulated';
  setScopeFilter: (scope: 'all' | 'real' | 'simulated') => void;
  loading: boolean;
  error: string | null;
  unverifiedCount: number;
  activeCount: number;
  refreshIncidents: () => Promise<void>;
  verifyIncident: (params: {
    incidentId: string;
    decision: 'verify' | 'reject';
    dispatcherId: string;
    dispatcherName: string;
    notes?: string;
    createNexconnGroup?: boolean;
  }) => Promise<EmergencyIncident>;
  assignResponders: (params: {
    incidentId: string;
    responderIds: string[];
    backupResponderId?: string | null;
    escalationTimeoutSeconds?: number;
    dispatcherId: string;
    dispatcherName: string;
  }) => Promise<{ incident: EmergencyIncident; groupInviteSynced: boolean }>;
  updateIncidentStatus: (params: {
    incidentId: string;
    nextState?: IncidentState;
    actorId: string;
    actorName: string;
    actorRole: 'dispatcher' | 'responder';
    note?: string;
    acknowledgeOnly?: boolean;
    requestBackup?: boolean;
    rejectAssignment?: boolean;
    clientRequestId?: string;
    responderLat?: number | null;
    responderLon?: number | null;
    arrivalVerification?: EmergencyIncident['arrivalVerification'];
  }) => Promise<EmergencyIncident>;
  createNexconnGroupForIncident: (params: {
    incidentId: string;
    ownerUserId: string;
    actorName: string;
  }) => Promise<{ incident: EmergencyIncident; live: boolean; error: string | null }>;
  triggerSimulatedDrill: (params: {
    category: EmergencyCategory;
    cellId: string;
    language: EmergencyLanguage;
  }) => Promise<EmergencyIncident>;
  clearSimulatedDrills: () => Promise<number>;
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

export const EmergencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cells, setCells] = useState<RescueCell[]>([]);
  const [incidents, setIncidents] = useState<EmergencyIncident[]>([]);
  const [responders, setResponders] = useState<ResponderProfile[]>([]);
  const [storageMeta, setStorageMeta] = useState<EmergencyStorageMeta | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'real' | 'simulated'>('real');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshIncidents = useCallback(async () => {
    try {
      const data = await fetchOperationalIncidents(scopeFilter);
      setIncidents(data.incidents);
      setResponders(data.responders);
      setStorageMeta(data.storage);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to sync incidents from Express server.');
    } finally {
      setLoading(false);
    }
  }, [scopeFilter]);

  useEffect(() => {
    fetchRescueCells()
      .then((res) => {
        setCells(res.cells);
        setStorageMeta(res.storage);
      })
      .catch(() => {
        // Handled by incident polling error state if backend unavailable
      });
  }, []);

  useEffect(() => {
    void refreshIncidents();
    const interval = window.setInterval(() => {
      void refreshIncidents();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refreshIncidents]);

  // Strict tenant isolation on workspace switch: immediately clear previous tenant data & reload
  useEffect(() => {
    const onTenantChanged = () => {
      setIncidents([]);
      setResponders([]);
      setLoading(true);
      void refreshIncidents();
      fetchRescueCells()
        .then((res) => {
          setCells(res.cells);
          setStorageMeta(res.storage);
        })
        .catch(() => {
          setCells([]);
        });
    };
    window.addEventListener('gg-tenant-changed', onTenantChanged);
    return () => window.removeEventListener('gg-tenant-changed', onTenantChanged);
  }, [refreshIncidents]);

  const upsertIncident = useCallback((updated: EmergencyIncident) => {
    setIncidents((prev) => {
      const exists = prev.some((i) => i.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((i) => (i.id === updated.id ? updated : i));
    });
  }, []);

  const verifyIncident = useCallback(
    async (params: {
      incidentId: string;
      decision: 'verify' | 'reject';
      dispatcherId: string;
      dispatcherName: string;
      notes?: string;
      createNexconnGroup?: boolean;
    }) => {
      const { incident } = await verifyIncidentApi(params);
      upsertIncident(incident);
      return incident;
    },
    [upsertIncident]
  );

  const assignResponders = useCallback(
    async (params: {
      incidentId: string;
      responderIds: string[];
      backupResponderId?: string | null;
      escalationTimeoutSeconds?: number;
      dispatcherId: string;
      dispatcherName: string;
    }) => {
      const res = await assignRespondersApi(params);
      upsertIncident(res.incident);
      setResponders(res.responders);
      return { incident: res.incident, groupInviteSynced: res.groupInviteSynced };
    },
    [upsertIncident]
  );

  const updateIncidentStatus = useCallback(
    async (params: {
      incidentId: string;
      nextState?: IncidentState;
      actorId: string;
      actorName: string;
      actorRole: 'dispatcher' | 'responder';
      note?: string;
      acknowledgeOnly?: boolean;
      requestBackup?: boolean;
      rejectAssignment?: boolean;
      clientRequestId?: string;
      responderLat?: number | null;
      responderLon?: number | null;
      arrivalVerification?: EmergencyIncident['arrivalVerification'];
    }) => {
      const res = await updateIncidentStatusApi(params);
      upsertIncident(res.incident);
      setResponders(res.responders);
      return res.incident;
    },
    [upsertIncident]
  );

  const createNexconnGroupForIncident = useCallback(
    async (params: { incidentId: string; ownerUserId: string; actorName: string }) => {
      const res = await createIncidentNexconnGroupApi(params);
      upsertIncident(res.incident);
      return res;
    },
    [upsertIncident]
  );

  const triggerSimulatedDrill = useCallback(
    async (params: {
      category: EmergencyCategory;
      cellId: string;
      language: EmergencyLanguage;
    }) => {
      const { incident } = await triggerSimulatedSOSApi(params);
      setScopeFilter((prev) => (prev === 'real' ? 'simulated' : prev));
      upsertIncident(incident);
      return incident;
    },
    [upsertIncident]
  );

  const clearSimulatedDrills = useCallback(async () => {
    const res = await clearSimulatedIncidentsApi();
    await refreshIncidents();
    return res.removedCount;
  }, [refreshIncidents]);

  const unverifiedCount = useMemo(
    () => incidents.filter((i) => i.state === 'UNVERIFIED').length,
    [incidents]
  );

  const activeCount = useMemo(
    () => incidents.filter((i) => i.state !== 'RESOLVED' && i.state !== 'REJECTED').length,
    [incidents]
  );

  const value = useMemo<EmergencyContextValue>(
    () => ({
      cells,
      incidents,
      responders,
      storageMeta,
      scopeFilter,
      setScopeFilter,
      loading,
      error,
      unverifiedCount,
      activeCount,
      refreshIncidents,
      verifyIncident,
      assignResponders,
      updateIncidentStatus,
      createNexconnGroupForIncident,
      triggerSimulatedDrill,
      clearSimulatedDrills,
    }),
    [
      cells,
      incidents,
      responders,
      storageMeta,
      scopeFilter,
      loading,
      error,
      unverifiedCount,
      activeCount,
      refreshIncidents,
      verifyIncident,
      assignResponders,
      updateIncidentStatus,
      createNexconnGroupForIncident,
      triggerSimulatedDrill,
      clearSimulatedDrills,
    ]
  );

  return <EmergencyContext.Provider value={value}>{children}</EmergencyContext.Provider>;
};

export function useEmergency(): EmergencyContextValue {
  const ctx = useContext(EmergencyContext);
  if (!ctx) {
    throw new Error('useEmergency must be used inside EmergencyProvider');
  }
  return ctx;
}
