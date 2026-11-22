import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  MessageSquare,
  QrCode,
  ExternalLink,
  Clock,
  MapPin,
  Radio,
  Phone,
  RefreshCw,
  FileCheck2,
  Video,
  Volume2,
  VolumeX,
  Siren,
  Zap,
  Waves,
} from 'lucide-react';
import { useEmergency } from '../context/EmergencyContext';
import { useNexconn } from '../context/NexconnContext';
import { useApp } from '../context/AppContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { DataTrustBadge } from '../components/ProvenanceTip';
import { BackNavButton } from '../components/BackNavButton';
import { mapRiskTierToCategory } from './Dashboard';
import { ResponderAllocationPanel } from '../components/emergency/ResponderAllocationPanel';
import { DigitalTwinDrillBar } from '../components/emergency/DigitalTwinDrillBar';
import { BeachSafetyCardModal } from '../components/emergency/BeachSafetyCardModal';
import { CommandIncidentMap } from '../components/emergency/CommandIncidentMap';
import { CommandWarRoomChatUI } from '../components/emergency/CommandWarRoomChatUI';
import { MedicalHandoffCard } from '../components/emergency/MedicalHandoffCard';
import { OutOfBandDispatchLog } from '../components/emergency/OutOfBandDispatchLog';
import { EmergencyResponseTimeline } from '../components/emergency/EmergencyResponseTimeline';
import {
  acknowledgeOfficialAlertApi,
  fetchOfficialAlertLogs,
  retryOfficialAlertApi,
  subscribeToSosStream,
} from '../services/officialAlertService';
import type { EmergencyIncident, IncidentState, ResponderProfile } from '../types/emergency';
import type { OfficialAlertLog } from '../types/officialAlerts';

export function resolveIncidentCallTarget(
  targetIncident: Pick<EmergencyIncident, 'assignedResponderIds'>,
  responders: ResponderProfile[],
  activeOperatorUserId?: string | null
): { ok: true; calleeId: string; responderName: string } | { ok: false; error: string } {
  for (const assignedResponderId of targetIncident.assignedResponderIds) {
    const matchedResponder = responders.find(
      (responder) => responder.id === assignedResponderId
    );
    if (!matchedResponder) continue;
    const nexconnId = matchedResponder.nexconnUserId?.trim();
    if (!nexconnId || nexconnId.startsWith('resp-')) {
      return {
        ok: false,
        error: `Assigned responder ${matchedResponder.name} lacks a configured Nexconn User ID.`,
      };
    }
    if (activeOperatorUserId && nexconnId === activeOperatorUserId) {
      continue;
    }
    return {
      ok: true,
      calleeId: nexconnId,
      responderName: matchedResponder.name,
    };
  }

  if (targetIncident.assignedResponderIds.length === 0) {
    return {
      ok: false,
      error: 'Assign an available responder before initiating a Nexconn call.',
    };
  }

  return {
    ok: false,
    error:
      'No assigned responder with a valid external Nexconn User ID is available to call.',
  };
}

const STATE_LABEL: Record<IncidentState, string> = {
  UNVERIFIED: 'Unverified SOS',
  VERIFIED: 'Verified',
  DISPATCHED: 'Dispatched',
  EN_ROUTE: 'En Route',
  ON_SCENE: 'On Scene',
  VICTIM_RECOVERED: 'Victim Recovered (Pending Closure)',
  MEDICAL_HANDOFF: 'Medical Handoff',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
};

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const CommandCenter: React.FC = () => {
  const navigate = useNavigate();
  const {
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
  } = useEmergency();
  const { activeOperator, selectChannel, startCall, connectionStatus } = useNexconn();

  const [searchParams] = useSearchParams();
  const demoRequested = searchParams.get('demo') === '1';
  const { sites, siteRisks } = useApp();
  const { activeWorkspace } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'triage' | 'comms' | 'medical' | 'resolution'>('triage');
  const [showTabMap, setShowTabMap] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [verifyNote, setVerifyNote] = useState('');
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  // Support URL drill-downs (?incidentId=..., ?filter=UNVERIFIED, or ?demo=1)
  useEffect(() => {
    const paramIncId = searchParams.get('incidentId');
    const paramFilter = searchParams.get('filter');
    if (paramIncId && incidents.some((i) => i.id === paramIncId)) {
      setSelectedId(paramIncId);
      return;
    }
    if (paramFilter === 'UNVERIFIED') {
      const firstUnverified = incidents.find((i) => i.state === 'UNVERIFIED');
      if (firstUnverified) setSelectedId(firstUnverified.id);
      return;
    }
    if (demoRequested && !selectedId) {
      const firstSim = incidents.find((i) => i.isSimulated && i.state !== 'REJECTED');
      if (firstSim) setSelectedId(firstSim.id);
    }
  }, [searchParams, incidents, demoRequested, selectedId]);

  const topHazardBeach = useMemo(() => {
    if (sites.length === 0) return null;
    const sorted = [...sites].sort(
      (a, b) => (siteRisks.get(b.id)?.score ?? -1) - (siteRisks.get(a.id)?.score ?? -1)
    );
    const site = sorted[0];
    const risk = site ? siteRisks.get(site.id) : null;
    return site ? { site, risk } : null;
  }, [sites, siteRisks]);
  const [closureNote, setClosureNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Real-time SSE alarm & Out-of-Band Dispatch Log state
  const [sseConnected, setSseConnected] = useState(false);
  const [alarmIncident, setAlarmIncident] = useState<EmergencyIncident | null>(null);
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [alertLogs, setAlertLogs] = useState<OfficialAlertLog[]>([]);
  const [channelsStatus, setChannelsStatus] = useState<{
    smsConfigured: boolean;
    whatsappConfigured: boolean;
    simulatorEnabled: boolean;
  } | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [bystanderStreamUpdates, setBystanderStreamUpdates] = useState<
    Array<{
      updateId: string;
      incidentId: string;
      kind: 'text' | 'voice_transcript' | 'photo';
      text: string;
      sentAt: string;
    }>
  >([]);
  const alarmIntervalRef = useRef<number | null>(null);

  const dispatcherId = activeOperator?.userId || 'gg-dispatch-chennai';
  const dispatcherName = activeOperator?.name || 'Coastal Dispatch Control';

  const playCriticalAlarmTone = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
      window.setTimeout(() => void ctx.close(), 500);
    } catch {
      // Browser autoplay policy may block audio until user interacts
    }
  }, []);

  const loadAlertLogs = useCallback(async (incidentId?: string) => {
    setAlertsLoading(true);
    try {
      const res = await fetchOfficialAlertLogs(incidentId);
      setAlertLogs(res.alerts);
      setChannelsStatus(res.channels);
    } catch {
      // Non-fatal if alert logs temporarily unavailable
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const [tenantVersion, setTenantVersion] = useState(0);
  const hadSseDisconnectRef = useRef(false);

  useEffect(() => {
    const onTenantChanged = () => {
      setAlertLogs([]);
      setBystanderStreamUpdates([]);
      setAlarmIncident(null);
      setTenantVersion((v) => v + 1);
    };
    window.addEventListener('gg-tenant-changed', onTenantChanged);
    return () => window.removeEventListener('gg-tenant-changed', onTenantChanged);
  }, []);

  // Subscribe to real-time SSE stream for instant Drowning SOS, escalations & alert delivery updates
  useEffect(() => {
    const unsubscribe = subscribeToSosStream(
      (event) => {
        if (event.type === 'sos:instant_created' && event.incident) {
          const inc = event.incident as EmergencyIncident;
          setSelectedId(inc.id);
          setAlarmIncident(inc);
          setAlarmMuted(false);
          if (Array.isArray(event.alerts) && event.alerts.length > 0) {
            setAlertLogs((prev) => {
              const incomingIds = new Set(event.alerts!.map((a) => a.id));
              return [...event.alerts!, ...prev.filter((p) => !incomingIds.has(p.id))];
            });
          }
          void refreshIncidents();
        } else if (event.type === 'sos:escalation_triggered' && event.incident) {
          const inc = event.incident as EmergencyIncident;
          setAlarmIncident(inc);
          setAlarmMuted(false);
          void refreshIncidents();
        } else if (event.type === 'sos:bystander_update' && event.bystanderUpdate) {
          const upd = event.bystanderUpdate;
          setBystanderStreamUpdates((prev) => [
            upd,
            ...prev.filter((item) => item.updateId !== upd.updateId).slice(0, 19),
          ]);
        } else if (
          (event.type === 'alert:status_updated' || event.type === 'alert:acknowledged') &&
          event.alert
        ) {
          setAlertLogs((prev) => {
            const exists = prev.some((a) => a.id === event.alert!.id);
            if (!exists) return [event.alert!, ...prev];
            return prev.map((a) => (a.id === event.alert!.id ? event.alert! : a));
          });
        }
      },
      (connected) => {
        setSseConnected(connected);
        if (!connected) {
          hadSseDisconnectRef.current = true;
        } else if (hadSseDisconnectRef.current) {
          hadSseDisconnectRef.current = false;
          // Immediate full resync on SSE reconnect so no missed events are dropped
          void refreshIncidents();
          void loadAlertLogs();
        }
      }
    );
    return unsubscribe;
  }, [refreshIncidents, loadAlertLogs, tenantVersion]);

  // Audible repeating alarm while an unmuted critical SOS banner is active
  useEffect(() => {
    if (alarmIncident && !alarmMuted) {
      playCriticalAlarmTone();
      alarmIntervalRef.current = window.setInterval(() => {
        playCriticalAlarmTone();
      }, 3200);
    }
    return () => {
      if (alarmIntervalRef.current) {
        window.clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, [alarmIncident, alarmMuted, playCriticalAlarmTone]);

  const selectedIncident: EmergencyIncident | null = useMemo(() => {
    if (incidents.length === 0) return null;
    if (selectedId) {
      const found = incidents.find((i) => i.id === selectedId);
      if (found) return found;
    }
    return incidents[0];
  }, [incidents, selectedId]);

  // Select appropriate default workspace tab when switching incidents
  useEffect(() => {
    if (!selectedIncident) return;
    if (selectedIncident.state === 'VICTIM_RECOVERED' || selectedIncident.state === 'MEDICAL_HANDOFF') {
      setWorkspaceTab('medical');
    } else if (selectedIncident.state === 'RESOLVED' || selectedIncident.state === 'REJECTED') {
      setWorkspaceTab('resolution');
    } else if (selectedIncident.state === 'EN_ROUTE' || selectedIncident.state === 'ON_SCENE') {
      setWorkspaceTab('comms');
    } else {
      setWorkspaceTab('triage');
    }
    setShowTabMap(false);
  }, [selectedIncident?.id]);

  const simulatedCount = useMemo(
    () => incidents.filter((i) => i.isSimulated).length,
    [incidents]
  );

  const handleVerify = async (decision: 'verify' | 'reject') => {
    if (!selectedIncident) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await verifyIncident({
        incidentId: selectedIncident.id,
        decision,
        dispatcherId,
        dispatcherName,
        notes: verifyNote.trim() || undefined,
        createNexconnGroup: decision === 'verify',
      });
      setVerifyNote('');
    } catch (err: any) {
      setActionError(err?.message || 'Verification failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStatusChange = async (nextState: IncidentState, acknowledgeOnly = false) => {
    if (!selectedIncident) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await updateIncidentStatus({
        incidentId: selectedIncident.id,
        nextState,
        actorId: dispatcherId,
        actorName: dispatcherName,
        actorRole: 'dispatcher',
        note: nextState === 'RESOLVED' ? closureNote.trim() || undefined : undefined,
        acknowledgeOnly,
      });
      if (nextState === 'RESOLVED') setClosureNote('');
    } catch (err: any) {
      setActionError(err?.message || 'Status update failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleOpenNexconnGroup = async (groupId: string) => {
    await selectChannel('group', groupId);
    navigate('/messages');
  };

  // Refresh out-of-band dispatch logs whenever selected incident changes
  useEffect(() => {
    void loadAlertLogs(selectedIncident?.id);
  }, [selectedIncident?.id, loadAlertLogs]);

  const handleDispatchNearestLifeguard = async (targetIncident: EmergencyIncident) => {
    setActionBusy(true);
    setActionError(null);
    try {
      let current = targetIncident;
      if (current.state === 'UNVERIFIED') {
        current = await verifyIncident({
          incidentId: current.id,
          decision: 'verify',
          dispatcherId,
          dispatcherName,
          notes: '1-click Critical SOS verification & rapid lifeguard dispatch',
          createNexconnGroup: !current.nexconnGroupId,
        });
      }
      const available = responders.filter((r) => r.availability === 'available');
      const pool = available.length > 0 ? available : responders;
      if (pool.length > 0) {
        const sorted = [...pool].sort((a, b) => {
          const dA = Math.hypot(a.lat - (current.lat ?? a.lat), a.lon - (current.lon ?? a.lon));
          const dB = Math.hypot(b.lat - (current.lat ?? b.lat), b.lon - (current.lon ?? b.lon));
          return dA - dB;
        });
        await assignResponders({
          incidentId: current.id,
          responderIds: [sorted[0].id],
          backupResponderId: sorted[1]?.id || null,
          escalationTimeoutSeconds: 90,
          dispatcherId,
          dispatcherName,
        });
      }
      setAlarmMuted(true);
    } catch (err: any) {
      setActionError(err?.message || 'Unable to dispatch nearest lifeguard.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStartLiveVideoTriage = async (targetIncident: EmergencyIncident) => {
    setActionError(null);
    const resolved = resolveIncidentCallTarget(
      targetIncident,
      responders,
      activeOperator?.userId
    );
    if (resolved.ok === false) {
      setActionError(resolved.error);
      return;
    }
    try {
      await startCall(resolved.calleeId, 'video');
    } catch (err: any) {
      setActionError(
        err?.message || 'Unable to initiate Nexconn video call. Verify Nexconn session is connected.'
      );
    }
  };

  const handleRetryGroup = async () => {
    if (!selectedIncident) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await createNexconnGroupForIncident({
        incidentId: selectedIncident.id,
        ownerUserId: dispatcherId,
        actorName: dispatcherName,
      });
      if (!res.live && res.error) {
        setActionError(res.error);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Unable to create Nexconn group.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <BackNavButton fallbackPath="/dashboard" />
            <h1 className="font-serif-heading text-2xl font-bold text-[#0B3B3C]">
              Live Operations · Incident Command Center
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-[#0F766E]/10 text-[#0B3B3C] text-[10px] font-semibold border border-[#0F766E]/20">
              {activeWorkspace.name}
            </span>
          </div>
          <p className="text-xs text-[#5B687A] mt-1">
            {activeCount} active · {unverifiedCount} pending human verification · Dispatcher:{' '}
            <span className="font-medium text-[#1B2A38]">{dispatcherName}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-[#E9E1D3]/60 p-1 rounded-xl text-xs">
            {(['real', 'all', 'simulated'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setScopeFilter(scope)}
                className={`px-3 py-1.5 rounded-lg font-medium capitalize transition-colors ${
                  scopeFilter === scope
                    ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                    : 'text-[#5B687A] hover:text-[#1B2A38]'
                }`}
              >
                {scope === 'all' ? 'All Incidents' : scope === 'real' ? 'Real SOS' : 'Simulated Drills'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E]/40"
          >
            <QrCode className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Rescue Cell QR Cards</span>
          </button>

          <Link
            to="/field-kit"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#0F766E]/40 bg-[#0F766E]/10 hover:bg-[#0F766E]/15 text-[#0B3B3C] text-xs font-semibold"
          >
            <Radio className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Mobile Field Kit</span>
          </Link>

          <Link
            to="/sos"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#D65A4A] hover:bg-[#B94334] text-white text-xs font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Public SOS</span>
          </Link>

          <button
            type="button"
            onClick={() => void refreshIncidents()}
            aria-label="Refresh incidents"
            className="p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E]"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Coastal Conditions & Live Operations Context Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card rounded-2xl p-3.5 border border-[#E9E1D3] flex items-start justify-between gap-2.5 min-w-0">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A] truncate">
                Highest Coastal Risk
              </span>
              {topHazardBeach?.risk?.score !== undefined && (
                <span className="px-1.5 py-0.5 rounded-md bg-[#0F766E]/10 text-[#0B3B3C] text-[10px] font-bold shrink-0">
                  {topHazardBeach.risk.score}/100
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-[#1B2A38] leading-snug line-clamp-2 break-words">
              {topHazardBeach ? topHazardBeach.site.name : 'Loading telemetry...'}
            </div>
            <div className="text-[11px] text-[#5B687A] flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
              {topHazardBeach ? (
                <>
                  <span>
                    Category:{' '}
                    <strong className="text-[#1B2A38]">
                      {mapRiskTierToCategory(topHazardBeach.risk?.tier)}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Wave:{' '}
                    <strong className="text-[#1B2A38]">
                      {topHazardBeach.risk?.environmentalFactors?.waveHeight !== undefined
                        ? `${topHazardBeach.risk.environmentalFactors.waveHeight.toFixed(1)}m`
                        : 'N/A'}
                    </strong>
                  </span>
                </>
              ) : (
                <span>Open-Meteo Marine</span>
              )}
            </div>
          </div>
          {topHazardBeach && (
            <button
              type="button"
              onClick={() => navigate(`/water-bodies/${topHazardBeach.site.id}`)}
              className="p-2 rounded-xl bg-[#0F766E]/10 text-[#0F766E] hover:bg-[#0F766E]/20 cursor-pointer shrink-0 mt-0.5"
              title="Inspect beach conditions"
              aria-label={`Inspect conditions for ${topHazardBeach.site.name}`}
            >
              <Waves className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="glass-card rounded-2xl p-3.5 border border-[#E9E1D3]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A]">
              Responders Ready
            </span>
            <DataTrustBadge classification="live_measured" compact source="Operational Roster" />
          </div>
          <div className="text-sm font-bold text-[#1B2A38] mt-0.5">
            {responders.filter((r) => r.availability !== 'off_duty').length} on duty ·{' '}
            {responders.filter((r) => r.availability === 'available').length} available
          </div>
          <button
            type="button"
            onClick={() => navigate('/responders?status=on_duty')}
            className="text-[11px] font-semibold text-[#0F766E] hover:underline mt-0.5 cursor-pointer"
          >
            View responder roster →
          </button>
        </div>

        <div className="glass-card rounded-2xl p-3.5 border border-[#E9E1D3]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A]">
              In-Situ Water Level
            </span>
            <DataTrustBadge
              classification="unavailable"
              compact
              source="No Tide Gauge Connected"
              note="Requires INCOIS or Port Authority tide-gauge sensor feed. Wave height is not substituted."
            />
          </div>
          <div className="text-sm font-bold text-[#1B2A38] mt-0.5">Data unavailable</div>
          <div className="text-[11px] text-[#5B687A] mt-0.5">
            Requires INCOIS / port tide-gauge feed
          </div>
        </div>

        <div className="glass-card rounded-2xl p-3.5 border border-[#E9E1D3]">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A]">
              Overview Analytics
            </span>
            <DataTrustBadge classification="derived_analytical" compact source="Overview Dashboard" />
          </div>
          <div className="text-sm font-bold text-[#1B2A38] mt-0.5">
            {activeCount} active · {unverifiedCount} unverified
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="text-[11px] font-semibold text-[#0F766E] hover:underline mt-0.5 cursor-pointer"
          >
            Open Executive Overview →
          </button>
        </div>
      </div>

      {/* LIVE CRITICAL DROWNING ALARM BANNER (Real-Time SSE Triggered) */}
      {alarmIncident && (
        <div className="rounded-2xl bg-[#991B1B] text-white border-2 border-red-300 shadow-xl p-4 sm:p-5 space-y-3 animate-pulse-once">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-white/15 shrink-0">
                <Siren className="w-6 h-6 text-amber-300 animate-bounce" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                  <span>CRITICAL SOS INCOMING</span>
                  <span>·</span>
                  <span>{alarmIncident.code}</span>
                  <span>·</span>
                  <span>{alarmIncident.cellLabel}</span>
                </div>
                <h2 className="text-base sm:text-lg font-extrabold mt-0.5 capitalize">
                  {alarmIncident.category.replace('_', ' ')} Alert at {alarmIncident.siteName}
                </h2>
                <p className="text-xs text-red-100 mt-0.5">
                  Map auto-centered on GPS pin ({alarmIncident.lat?.toFixed(4) ?? '—'},{' '}
                  {alarmIncident.lon?.toFixed(4) ?? '—'}). Out-of-band SMS/WhatsApp alerts dispatched.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAlarmMuted((m) => !m)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold"
              >
                {alarmMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{alarmMuted ? 'Muted' : 'Silence Alarm'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlarmMuted(true);
                  setAlarmIncident(null);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-black/25 hover:bg-black/40 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                if (alarmIncident.nexconnGroupId) {
                  void handleOpenNexconnGroup(alarmIncident.nexconnGroupId);
                } else {
                  navigate('/messages');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#991B1B] hover:bg-red-50 text-xs font-bold shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open Nexconn War Room</span>
            </button>

            <button
              type="button"
              onClick={() => void handleStartLiveVideoTriage(alarmIncident)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B5E58] text-white text-xs font-bold shadow-xs"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Start 1-Tap Live Video Triage</span>
            </button>

            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void handleDispatchNearestLifeguard(alarmIncident)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#1B2A38] text-xs font-extrabold shadow-xs disabled:opacity-60 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {alarmIncident.state === 'UNVERIFIED'
                  ? 'Verify & Dispatch Nearest'
                  : 'Dispatch Nearest Lifeguard'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Rescue Digital Twin Drill Controls */}
      <DigitalTwinDrillBar
        cells={cells}
        simulatedCount={simulatedCount}
        activeIncident={selectedIncident}
        nexconnConnected={connectionStatus === 'connected'}
        initialShowDemoGuide={demoRequested}
        simulatedAlertCount={
          selectedIncident
            ? alertLogs.filter(
                (a) => a.incidentId === selectedIncident.id && a.status === 'SIMULATED'
              ).length
            : 0
        }
        onTrigger={async (params) => {
          const created = await triggerSimulatedDrill(params);
          setSelectedId(created.id);
        }}
        onClearSimulated={async () => {
          await clearSimulatedDrills();
          setSelectedId(null);
        }}
      />

      {error && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#D65A4A]/40 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#D65A4A]/40 text-xs text-[#991B1B]">
          {actionError}
        </div>
      )}

      {/* Main Split Command Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Incident Queue */}
        <div className="lg:col-span-4 bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9E1D3] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#5B687A]">
              Emergency Queue ({incidents.length})
            </h2>
            <span className="text-[11px] text-[#5B687A]">
              {sseConnected ? 'Live SSE Connected' : 'Auto-syncing'}
            </span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-xs text-[#5B687A]">Loading incident queue...</div>
          ) : incidents.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-[#1B2A38]">
                {scopeFilter === 'real' ? 'No active real SOS incidents' : 'No incidents in this view'}
              </p>
              <p className="text-xs text-[#5B687A] leading-relaxed">
                Public SOS alerts from <span className="font-mono">/sos</span> arrive here in real time via SSE. Isolated training drills are available in the Training Sandbox above.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E9E1D3]/70 max-h-[680px] overflow-y-auto">
              {incidents.map((inc) => {
                const isSelected = selectedIncident?.id === inc.id;
                const isUnverified = inc.state === 'UNVERIFIED';
                return (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => setSelectedId(inc.id)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-[#0F766E]/10' : 'hover:bg-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0B3B3C]">{inc.code}</span>
                      <span
                        className={`font-semibold ${
                          isUnverified
                            ? 'text-[#D65A4A]'
                            : inc.state === 'RESOLVED'
                              ? 'text-[#0F766E]'
                              : 'text-[#1B2A38]'
                        }`}
                      >
                        {STATE_LABEL[inc.state]}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#1B2A38] mt-1 capitalize">
                      {inc.category.replace('_', ' ')} · {inc.cellId}
                    </p>
                    <p className="text-[11px] text-[#5B687A] line-clamp-2 mt-0.5">
                      {inc.description}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-[#5B687A]">
                      <span>
                        {inc.isSimulated ? 'SIMULATED DRILL' : 'REAL PUBLIC SOS'} ·{' '}
                        {inc.language === 'ta' ? 'Tamil' : 'English'}
                      </span>
                      <span className="font-mono">{formatTime(inc.createdAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Active Incident Workspace */}
        <div className="lg:col-span-8 bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 sm:p-6 space-y-5">
          {!selectedIncident ? (
            <div className="py-16 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-[#0F766E]/50 mx-auto" />
              <p className="text-sm font-semibold text-[#1B2A38]">
                Select or trigger an incident to coordinate response
              </p>
              <p className="text-xs text-[#5B687A]">
                All public SOS reports enter as UNVERIFIED and require human dispatcher verification before dispatch.
              </p>
            </div>
          ) : (
            <>
              {/* Incident Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E9E1D3]">
                <div>
                  <div className="text-xs font-semibold text-[#5B687A] flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[#0B3B3C] font-bold">{selectedIncident.code}</span>
                    <span>·</span>
                    <span className={selectedIncident.isSimulated ? 'text-[#B45309]' : 'text-[#D65A4A]'}>
                      {selectedIncident.isSimulated ? 'SIMULATED DRILL' : 'REAL PUBLIC SOS'}
                    </span>
                    <span>·</span>
                    <span>{STATE_LABEL[selectedIncident.state]}</span>
                  </div>
                  <h2 className="text-lg font-bold text-[#1B2A38] capitalize mt-1">
                    {selectedIncident.category.replace('_', ' ')} at {selectedIncident.siteName} (
                    {selectedIncident.cellId})
                  </h2>
                  <p className="text-xs text-[#5B687A] mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                      {selectedIncident.cellLabel}
                    </span>
                    {selectedIncident.lat !== null && selectedIncident.lon !== null && (
                      <span className="font-mono">
                        ({selectedIncident.lat.toFixed(4)}, {selectedIncident.lon.toFixed(4)})
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right text-xs text-[#5B687A] space-y-1.5">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/map?incidentId=${selectedIncident.id}&layer=incident&returnTo=${encodeURIComponent(
                            `/command?incidentId=${selectedIncident.id}`
                          )}`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E9E1D3] bg-white hover:border-[#0F766E]/40 text-[#0B3B3C] text-[11px] font-semibold cursor-pointer"
                    >
                      <MapPin className="w-3 h-3 text-[#0F766E]" />
                      <span>View on Risk Map</span>
                    </button>
                    <div className="inline-flex items-center gap-1.5 text-[#D65A4A] font-semibold">
                      <Phone className="w-3.5 h-3.5" />
                      <span>National 112 / VHF Fallback</span>
                    </div>
                  </div>
                  <div className="font-mono text-[11px]">
                    Reported: {formatTime(selectedIncident.createdAt)}
                  </div>
                </div>
              </div>

              {/* MANDATORY HUMAN VERIFICATION GATE — TOP PRIORITY FOR UNVERIFIED INCIDENTS */}
              {selectedIncident.state === 'UNVERIFIED' && (
                <section className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-[#D65A4A]/60 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-100 text-[#991B1B] text-[10px] font-bold uppercase tracking-wider mb-1">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Step 1 Gate · Verification Required</span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-[#991B1B]">
                        Human Dispatcher Verification Required
                      </h3>
                      <p className="text-xs text-[#5B687A] mt-0.5 leading-relaxed">
                        {selectedIncident.nexconnGroupLive
                          ? 'Initial alert notifications are recorded. Verify this SOS to unlock responder assignment and the interactive Nexconn War Room.'
                          : 'Confirm this SOS is genuine before assigning lifeguards. Verification will auto-create its dedicated Nexconn War Room group.'}
                      </p>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                    placeholder="Optional verification note (e.g., confirmed with Marina Tower 2 visual)"
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] text-xs bg-[#FBF8F3]"
                  />

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleVerify('verify')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-bold min-h-[42px] disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Verifying...'
                          : selectedIncident.nexconnGroupLive
                            ? 'Verify Incident for Responder Dispatch'
                            : 'Verify Incident & Create Nexconn Group'}
                      </span>
                    </button>

                    {confirmRejectId === selectedIncident.id ? (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs">
                        <span className="font-semibold text-rose-900">Confirm false alarm?</span>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => {
                            setConfirmRejectId(null);
                            void handleVerify('reject');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#D65A4A] hover:bg-[#B94334] text-white font-bold cursor-pointer"
                        >
                          Yes, Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRejectId(null)}
                          className="px-2 py-1 rounded-lg bg-white border border-[#E9E1D3] text-[#5B687A] font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => setConfirmRejectId(selectedIncident.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] hover:text-[#D65A4A] text-xs font-semibold text-[#5B687A] min-h-[42px] cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject as False Alarm</span>
                      </button>
                    )}
                  </div>
                </section>
              )}

              {/* At-a-Glance Operational Summary Strip (Priority, Responders, Alerts, War Room, Medical, Coastal Risk) */}
              {(() => {
                const incAlerts = alertLogs.filter((a) => a.incidentId === selectedIncident.id);
                const simCount = incAlerts.filter((a) => a.status === 'SIMULATED').length;
                const realCount = incAlerts.filter(
                  (a) => a.status === 'DELIVERED' || a.status === 'PROVIDER_ACCEPTED' || a.status === 'SENT'
                ).length;
                const matchedSite = sites.find(
                  (s) =>
                    s.id === selectedIncident.siteId ||
                    s.name.toLowerCase() === (selectedIncident.siteName || '').toLowerCase()
                );
                const matchedRisk = matchedSite ? siteRisks.get(matchedSite.id) : topHazardBeach?.risk;
                const riskCat = mapRiskTierToCategory(matchedRisk?.tier);
                const waveM = matchedRisk?.environmentalFactors?.waveHeight;

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 text-[11px]">
                    <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
                      <div className="text-[10px] text-[#5B687A] font-medium">Priority / Gate</div>
                      <div className="font-bold text-[#1B2A38] mt-0.5 uppercase">
                        {selectedIncident.severity} ·{' '}
                        {selectedIncident.state === 'UNVERIFIED' ? 'Unverified' : 'Verified'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
                      <div className="text-[10px] text-[#5B687A] font-medium">Assigned Units</div>
                      <div className="font-bold text-[#1B2A38] mt-0.5 truncate">
                        {selectedIncident.assignedResponderNames.length > 0
                          ? `${selectedIncident.assignedResponderNames.length} Assigned`
                          : 'Unassigned'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
                      <div className="text-[10px] text-[#5B687A] font-medium">Notifications</div>
                      <div className="font-bold text-[#1B2A38] mt-0.5 truncate">
                        {simCount > 0
                          ? `${simCount} SIMULATED`
                          : realCount > 0
                            ? `${realCount} Accepted`
                            : 'Queued / None'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
                      <div className="text-[10px] text-[#5B687A] font-medium">Nexconn War Room</div>
                      <div className="font-bold text-[#1B2A38] mt-0.5 truncate">
                        {selectedIncident.state === 'UNVERIFIED'
                          ? 'Unlocks on Verify'
                          : selectedIncident.nexconnGroupLive && connectionStatus === 'connected'
                            ? 'Live Group Ready'
                            : selectedIncident.nexconnGroupLive
                              ? `Group Ready (${connectionStatus})`
                              : 'Not Provisioned'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
                      <div className="text-[10px] text-[#5B687A] font-medium">Medical Handoff</div>
                      <div className="font-bold text-[#1B2A38] mt-0.5 truncate">
                        {selectedIncident.state === 'MEDICAL_HANDOFF'
                          ? 'In Progress'
                          : selectedIncident.state === 'VICTIM_RECOVERED'
                            ? 'Pending Review'
                            : selectedIncident.state === 'RESOLVED'
                              ? 'Completed / N/A'
                              : 'Standby'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-[#E9E1D3] p-2.5">
                      <div className="text-[10px] text-[#5B687A] font-medium">Coastal Risk</div>
                      <div className="font-bold text-[#1B2A38] mt-0.5 truncate">
                        {riskCat}
                        {waveM !== undefined ? ` · ${waveM.toFixed(1)}m` : ''}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Reported Details & Masked Contact */}
              <div className="space-y-3 text-xs">
                <p className="text-sm text-[#1B2A38] leading-relaxed bg-white border border-[#E9E1D3] rounded-xl p-4">
                  {selectedIncident.description}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#5B687A]">
                  <span>
                    Language:{' '}
                    <strong className="text-[#1B2A38]">
                      {selectedIncident.language === 'ta' ? 'Tamil' : 'English'}
                    </strong>
                  </span>
                  <span>
                    Location source:{' '}
                    <strong className="text-[#1B2A38]">{selectedIncident.locationSource}</strong>
                  </span>
                  {selectedIncident.reporterNameMasked && (
                    <span>
                      Reporter (masked):{' '}
                      <strong className="text-[#1B2A38]">{selectedIncident.reporterNameMasked}</strong>
                    </span>
                  )}
                  {selectedIncident.reporterPhoneMasked && (
                    <span>
                      Phone (masked):{' '}
                      <strong className="font-mono text-[#1B2A38]">
                        {selectedIncident.reporterPhoneMasked}
                      </strong>
                    </span>
                  )}
                </div>

                {selectedIncident.lostChildDetails && (
                  <div className="p-3.5 rounded-xl bg-[#FFF7ED] border border-[#F59E0B]/40 text-xs text-[#7C2D12]">
                    <strong>Lost-Child Details (Restricted Operational View):</strong>{' '}
                    Age: {selectedIncident.lostChildDetails.approximateAge || 'Unknown'} · Clothing:{' '}
                    {selectedIncident.lostChildDetails.clothingDescription || 'Not specified'} · Last seen:{' '}
                    {selectedIncident.lostChildDetails.lastSeenMinutesAgo ?? '?'} mins ago
                  </div>
                )}

                {selectedIncident.photoDataUrl && (
                  <div>
                    <p className="text-[11px] font-semibold text-[#5B687A] mb-1.5">
                      Reporter Photo Attachment
                    </p>
                    <img
                      src={selectedIncident.photoDataUrl}
                      alt="Reported emergency scene"
                      className="max-h-48 rounded-xl border border-[#E9E1D3] object-cover"
                    />
                  </div>
                )}
              </div>

              {bystanderStreamUpdates.some((u) => u.incidentId === selectedIncident.id) && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs">
                  <div className="font-bold text-amber-950 uppercase tracking-wider text-[10px]">
                    Live Bystander Updates (SSE Relay)
                  </div>
                  <ul className="space-y-1">
                    {bystanderStreamUpdates
                      .filter((u) => u.incidentId === selectedIncident.id)
                      .slice(0, 4)
                      .map((u) => (
                        <li
                          key={u.updateId}
                          className="flex items-center justify-between gap-2 text-amber-950"
                        >
                          <span>
                            <strong className="uppercase text-[10px] mr-1.5">[{u.kind}]</strong>
                            {u.text}
                          </span>
                          <span className="font-mono text-[10px] text-amber-800 shrink-0">
                            {formatTime(u.sentAt)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {selectedIncident.state === 'VICTIM_RECOVERED' && (
                <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#0F766E]/40 text-xs text-[#0B3B3C]">
                  <strong>Victim Recovered Reported by Field Responder</strong> — Confirm Medical
                  Handoff (SBAR) or close the incident in the Resolution &amp; Audit tab.
                </div>
              )}

              {actionError && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#D65A4A]/40 text-xs text-[#991B1B]">
                  {actionError}
                </div>
              )}

              {/* UNVERIFIED VIEW: Incident Map + Pre-Verification Notice + Out-of-Band Dispatch Log */}
              {selectedIncident.state === 'UNVERIFIED' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                    <div className="xl:col-span-7">
                      <CommandIncidentMap
                        incident={selectedIncident}
                        responders={responders}
                        cells={cells}
                      />
                    </div>
                    <div className="xl:col-span-5 rounded-2xl border border-dashed border-[#0F766E]/40 bg-white p-5 space-y-2.5 text-xs">
                      <div className="flex items-center gap-2 font-bold text-[#0B3B3C]">
                        <MessageSquare className="w-4 h-4 text-[#0F766E]" />
                        <span>Dispatch &amp; War Room Locked Until Verified</span>
                      </div>
                      <p className="text-[#5B687A] leading-relaxed">
                        Verify this emergency above to immediately unlock:
                      </p>
                      <ul className="space-y-1.5 text-[#1B2A38] text-[11px]">
                        <li>• Explainable Responder Dispatch &amp; Backup Escalation</li>
                        <li>• Dedicated Live Nexconn Incident War Room ChatUI</li>
                        <li>• Live Responder Audio / Video Triage Calling</li>
                        <li>• AI-Assisted SBAR Medical Handoff Review</li>
                      </ul>
                    </div>
                  </div>

                  <OutOfBandDispatchLog
                    alerts={alertLogs}
                    channelsStatus={channelsStatus}
                    loading={alertsLoading}
                    onRefresh={() => loadAlertLogs(selectedIncident.id)}
                    onAcknowledge={async (logId) => {
                      const updated = await acknowledgeOfficialAlertApi(logId, dispatcherName);
                      setAlertLogs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                    }}
                    onRetry={async (logId) => {
                      const updated = await retryOfficialAlertApi(logId);
                      setAlertLogs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                    }}
                  />
                </div>
              ) : (
                /* VERIFIED / ACTIVE / RESOLVED VIEW: 4-Tab Organized Command Workspace */
                <div className="space-y-4">
                  {/* 4 Focused Command Workspace Tabs */}
                  <div
                    role="tablist"
                    aria-label="Command workspace stages"
                    className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[#E9E1D3]/60 p-1.5 rounded-2xl text-xs font-semibold"
                  >
                    {(
                      [
                        { id: 'triage', label: '1. Triage & Dispatch' },
                        { id: 'comms', label: '2. Nexconn Comms' },
                        { id: 'medical', label: '3. Medical Handoff' },
                        { id: 'resolution', label: '4. Resolution & Audit' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        role="tab"
                        type="button"
                        aria-selected={workspaceTab === tab.id}
                        onClick={() => setWorkspaceTab(tab.id)}
                        className={`px-3 py-2 rounded-xl transition-colors cursor-pointer text-center ${
                          workspaceTab === tab.id
                            ? 'bg-white text-[#0B3B3C] font-bold shadow-xs'
                            : 'text-[#5B687A] hover:text-[#1B2A38]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB 1: TRIAGE & DISPATCH */}
                  {workspaceTab === 'triage' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                        <div className="xl:col-span-6">
                          <CommandIncidentMap
                            incident={selectedIncident}
                            responders={responders}
                            cells={cells}
                          />
                        </div>
                        <div className="xl:col-span-6 space-y-4">
                          <ResponderAllocationPanel
                            incident={selectedIncident}
                            dispatcherId={dispatcherId}
                            dispatcherName={dispatcherName}
                            onAssign={async ({
                              responderIds,
                              backupResponderId,
                              escalationTimeoutSeconds,
                            }) => {
                              await assignResponders({
                                incidentId: selectedIncident.id,
                                responderIds,
                                backupResponderId,
                                escalationTimeoutSeconds,
                                dispatcherId,
                                dispatcherName,
                              });
                            }}
                          />
                        </div>
                      </div>

                      {/* Dispatcher Status Shortcuts */}
                      {selectedIncident.state !== 'RESOLVED' &&
                        selectedIncident.state !== 'REJECTED' && (
                          <div className="p-3.5 rounded-xl bg-white border border-[#E9E1D3] flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#0B3B3C]">
                              Quick Operational Status Update:
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              {selectedIncident.state === 'DISPATCHED' &&
                                !selectedIncident.acknowledgedAt && (
                                  <button
                                    type="button"
                                    disabled={actionBusy}
                                    onClick={() => void handleStatusChange('DISPATCHED', true)}
                                    className="px-3 py-1.5 rounded-xl border border-[#0F766E] text-[#0F766E] text-xs font-semibold hover:bg-[#0F766E]/5 cursor-pointer"
                                  >
                                    Mark Acknowledged
                                  </button>
                                )}
                              {selectedIncident.state === 'DISPATCHED' && (
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleStatusChange('EN_ROUTE')}
                                  className="px-3 py-1.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E] cursor-pointer"
                                >
                                  Set En Route
                                </button>
                              )}
                              {(selectedIncident.state === 'DISPATCHED' ||
                                selectedIncident.state === 'EN_ROUTE') && (
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void handleStatusChange('ON_SCENE')}
                                  className="px-3 py-1.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E] cursor-pointer"
                                >
                                  Set On Scene
                                </button>
                              )}
                              {selectedIncident.state !== 'MEDICAL_HANDOFF' &&
                                selectedIncident.state !== 'VERIFIED' && (
                                  <button
                                    type="button"
                                    disabled={actionBusy}
                                    onClick={() => void handleStatusChange('MEDICAL_HANDOFF')}
                                    className="px-3 py-1.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E] cursor-pointer"
                                  >
                                    Mark Medical Handoff
                                  </button>
                                )}
                            </div>
                          </div>
                        )}

                      <OutOfBandDispatchLog
                        alerts={alertLogs}
                        channelsStatus={channelsStatus}
                        loading={alertsLoading}
                        onRefresh={() => loadAlertLogs(selectedIncident.id)}
                        onAcknowledge={async (logId) => {
                          const updated = await acknowledgeOfficialAlertApi(logId, dispatcherName);
                          setAlertLogs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                        }}
                        onRetry={async (logId) => {
                          const updated = await retryOfficialAlertApi(logId);
                          setAlertLogs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                        }}
                      />
                    </div>
                  )}

                  {/* TAB 2: NEXCONN COMMUNICATIONS */}
                  {workspaceTab === 'comms' && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                      <CommandIncidentMap
                        incident={selectedIncident}
                        responders={responders}
                        cells={cells}
                      />

                      <CommandWarRoomChatUI
                        incident={selectedIncident}
                        onProvisionGroup={handleRetryGroup}
                        onStartVideoCall={() => handleStartLiveVideoTriage(selectedIncident)}
                        onOpenFullMessages={() => {
                          if (selectedIncident.nexconnGroupId) {
                            void handleOpenNexconnGroup(selectedIncident.nexconnGroupId);
                          } else {
                            navigate('/messages');
                          }
                        }}
                        onStartAudioCall={async () => {
                          setActionError(null);
                          const resolved = resolveIncidentCallTarget(
                            selectedIncident,
                            responders,
                            activeOperator?.userId
                          );
                          if (resolved.ok === false) {
                            setActionError(resolved.error);
                            return;
                          }
                          try {
                            await startCall(resolved.calleeId, 'audio');
                          } catch (err: any) {
                            setActionError(err?.message || 'Unable to start Nexconn audio call.');
                          }
                        }}
                      />
                    </div>
                  )}

                  {/* TAB 3: MEDICAL HANDOFF */}
                  {workspaceTab === 'medical' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#5B687A]">
                          SBAR Hospital &amp; Paramedic Transfer
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowTabMap((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#0B3B3C] hover:border-[#0F766E]/40 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                          <span>{showTabMap ? 'Hide Incident Map' : 'Show Incident Map'}</span>
                        </button>
                      </div>

                      {showTabMap && (
                        <CommandIncidentMap
                          incident={selectedIncident}
                          responders={responders}
                          cells={cells}
                        />
                      )}

                      {selectedIncident.state === 'REJECTED' ? (
                        <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#5B687A]">
                          Medical Handoff is disabled for rejected false-alarm incidents.
                        </div>
                      ) : (
                        <MedicalHandoffCard
                          incidentId={selectedIncident.id}
                          incidentCode={selectedIncident.code}
                          cellId={selectedIncident.cellId}
                          nexconnGroupLive={selectedIncident.nexconnGroupLive}
                          canReviewAndShare={true}
                        />
                      )}
                    </div>
                  )}

                  {/* TAB 4: RESOLUTION & AUDIT */}
                  {workspaceTab === 'resolution' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#5B687A]">
                          Lifecycle Closure &amp; 11-Stage Audit Timeline
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowTabMap((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#0B3B3C] hover:border-[#0F766E]/40 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                          <span>{showTabMap ? 'Hide Incident Map' : 'Show Incident Map'}</span>
                        </button>
                      </div>

                      {showTabMap && (
                        <CommandIncidentMap
                          incident={selectedIncident}
                          responders={responders}
                          cells={cells}
                        />
                      )}

                      {selectedIncident.state !== 'RESOLVED' &&
                        selectedIncident.state !== 'REJECTED' && (
                          <section className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-3">
                            <h3 className="text-sm font-bold text-[#0B3B3C] flex items-center gap-2">
                              <FileCheck2 className="w-4 h-4 text-[#0F766E]" />
                              <span>Incident Closure Control (Dispatcher Authorization)</span>
                            </h3>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <input
                                type="text"
                                value={closureNote}
                                onChange={(e) => setClosureNote(e.target.value)}
                                placeholder="Closure summary (e.g., Swimmer safely brought ashore; declined hospital transport)"
                                className="flex-1 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-xs"
                              />
                              <button
                                type="button"
                                disabled={actionBusy}
                                onClick={() => void handleStatusChange('RESOLVED')}
                                className="px-4 py-2 rounded-xl bg-[#0B3B3C] hover:bg-[#1B2A38] text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                Close &amp; Resolve Incident
                              </button>
                            </div>
                          </section>
                        )}

                      <EmergencyResponseTimeline
                        incident={selectedIncident}
                        alertLogs={alertLogs}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Emergency Fallback Footer */}
          <div className="pt-4 border-t border-[#E9E1D3]/70 text-[11px] text-[#5B687A] flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#0F766E]" />
              If app or network is unavailable, switch to VHF Ch 16 / Call 112.
            </span>
          </div>
        </div>
      </div>

      <BeachSafetyCardModal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        cells={cells}
      />
    </div>
  );
};
