import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useEmergency } from '../context/EmergencyContext';
import { useNexconn } from '../context/NexconnContext';
import { ResponderAllocationPanel } from '../components/emergency/ResponderAllocationPanel';
import { DigitalTwinDrillBar } from '../components/emergency/DigitalTwinDrillBar';
import { BeachSafetyCardModal } from '../components/emergency/BeachSafetyCardModal';
import type { EmergencyIncident, IncidentState } from '../types/emergency';

const STATE_LABEL: Record<IncidentState, string> = {
  UNVERIFIED: 'Unverified SOS',
  VERIFIED: 'Verified',
  DISPATCHED: 'Dispatched',
  EN_ROUTE: 'En Route',
  ON_SCENE: 'On Scene',
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
  const { activeOperator, selectChannel } = useNexconn();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [verifyNote, setVerifyNote] = useState('');
  const [closureNote, setClosureNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const dispatcherId = activeOperator?.userId || 'gg-dispatch-chennai';
  const dispatcherName = activeOperator?.name || 'Coastal Dispatch Control';

  const selectedIncident: EmergencyIncident | null = useMemo(() => {
    if (incidents.length === 0) return null;
    if (selectedId) {
      const found = incidents.find((i) => i.id === selectedId);
      if (found) return found;
    }
    return incidents[0];
  }, [incidents, selectedId]);

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
          <h1 className="font-serif-heading text-2xl font-bold text-[#0B3B3C]">
            Incident Command Center
          </h1>
          <p className="text-xs text-[#5B687A] mt-1">
            {activeCount} active · {unverifiedCount} pending human verification · Dispatcher:{' '}
            <span className="font-medium text-[#1B2A38]">{dispatcherName}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-[#E9E1D3]/60 p-1 rounded-xl text-xs">
            {(['all', 'real', 'simulated'] as const).map((scope) => (
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

      {/* Rescue Digital Twin Drill Controls */}
      <DigitalTwinDrillBar
        cells={cells}
        simulatedCount={simulatedCount}
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

      {/* Main Split Command Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Incident Queue */}
        <div className="lg:col-span-4 bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9E1D3] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#5B687A]">
              Emergency Queue ({incidents.length})
            </h2>
            <span className="text-[11px] text-[#5B687A]">Auto-syncing</span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-xs text-[#5B687A]">Loading incident queue...</div>
          ) : incidents.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-[#1B2A38]">No incidents in this view</p>
              <p className="text-xs text-[#5B687A] leading-relaxed">
                Submit a Public SOS via <span className="font-mono">/sos</span> or trigger a clearly labeled Simulated Drill above.
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

                <div className="text-right text-xs text-[#5B687A] space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-[#D65A4A] font-semibold">
                    <Phone className="w-3.5 h-3.5" />
                    <span>National 112 / VHF Fallback</span>
                  </div>
                  <div className="font-mono text-[11px]">
                    Reported: {formatTime(selectedIncident.createdAt)}
                  </div>
                </div>
              </div>

              {/* Reported Details & Masked Contact */}
              <div className="space-y-3 text-xs">
                <p className="text-sm text-[#1B2A38] leading-relaxed bg-white border border-[#E9E1D3] rounded-xl p-4">
                  {selectedIncident.description}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#5B687A]">
                  <span>
                    Language: <strong className="text-[#1B2A38]">{selectedIncident.language === 'ta' ? 'Tamil' : 'English'}</strong>
                  </span>
                  <span>
                    Location source: <strong className="text-[#1B2A38]">{selectedIncident.locationSource}</strong>
                  </span>
                  {selectedIncident.reporterNameMasked && (
                    <span>
                      Reporter (masked): <strong className="text-[#1B2A38]">{selectedIncident.reporterNameMasked}</strong>
                    </span>
                  )}
                  {selectedIncident.reporterPhoneMasked && (
                    <span>
                      Phone (masked): <strong className="font-mono text-[#1B2A38]">{selectedIncident.reporterPhoneMasked}</strong>
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

              {actionError && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#D65A4A]/40 text-xs text-[#991B1B]">
                  {actionError}
                </div>
              )}

              {/* Step 1: Mandatory Human Dispatcher Verification Gate */}
              {selectedIncident.state === 'UNVERIFIED' && (
                <section className="p-4 rounded-xl bg-white border border-[#D65A4A]/40 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#991B1B]">
                      Human Dispatcher Verification Required
                    </h3>
                    <p className="text-xs text-[#5B687A] mt-0.5">
                      Verify the alert before dispatching responders. Verification automatically creates an incident-specific Nexconn group conversation.
                    </p>
                  </div>

                  <input
                    type="text"
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                    placeholder="Optional verification note (e.g., confirmed with Marina Tower 2 visual)"
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] text-xs"
                  />

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleVerify('verify')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold min-h-[40px] disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{actionBusy ? 'Verifying...' : 'Verify Incident & Create Nexconn Group'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleVerify('reject')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] hover:text-[#D65A4A] text-xs font-semibold text-[#5B687A] min-h-[40px]"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject as False Alarm</span>
                    </button>
                  </div>
                </section>
              )}

              {/* Step 2: Real Nexconn Incident Group Panel */}
              {selectedIncident.state !== 'UNVERIFIED' && selectedIncident.state !== 'REJECTED' && (
                <section className="p-4 rounded-xl bg-white border border-[#E9E1D3] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <MessageSquare className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold text-[#0B3B3C]">
                        Nexconn Incident Group Channel
                      </p>
                      {selectedIncident.nexconnGroupLive && selectedIncident.nexconnGroupId ? (
                        <p className="text-[#5B687A] mt-0.5">
                          Live group: <strong className="text-[#1B2A38]">{selectedIncident.nexconnGroupName}</strong>{' '}
                          <span className="font-mono text-[11px]">({selectedIncident.nexconnGroupId})</span>
                        </p>
                      ) : (
                        <p className="text-[#D65A4A] mt-0.5">
                          {selectedIncident.nexconnGroupError ||
                            'Not yet linked to a live Nexconn group. Use VHF radio fallback if unavailable.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedIncident.nexconnGroupLive && selectedIncident.nexconnGroupId ? (
                    <button
                      type="button"
                      onClick={() => void handleOpenNexconnGroup(selectedIncident.nexconnGroupId!)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open Group in Messages</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleRetryGroup()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#0F766E] text-[#0F766E] text-xs font-semibold hover:bg-[#0F766E]/5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Create Nexconn Group</span>
                    </button>
                  )}
                </section>
              )}

              {/* Step 3: Explainable Responder Allocation & Escalation */}
              <ResponderAllocationPanel
                incident={selectedIncident}
                dispatcherId={dispatcherId}
                dispatcherName={dispatcherName}
                onAssign={async ({ responderIds, backupResponderId, escalationTimeoutSeconds }) => {
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

              {/* Step 4: Validated Lifecycle Controls & Closure */}
              {selectedIncident.state !== 'UNVERIFIED' &&
                selectedIncident.state !== 'RESOLVED' &&
                selectedIncident.state !== 'REJECTED' && (
                  <section className="pt-5 border-t border-[#E9E1D3] space-y-3">
                    <h3 className="text-sm font-bold text-[#0B3B3C] flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-[#0F766E]" />
                      <span>Incident Status & Closure Controls</span>
                    </h3>

                    <div className="flex flex-wrap items-center gap-2">
                      {selectedIncident.state === 'DISPATCHED' && !selectedIncident.acknowledgedAt && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleStatusChange('DISPATCHED', true)}
                          className="px-3.5 py-2 rounded-xl border border-[#0F766E] text-[#0F766E] text-xs font-semibold hover:bg-[#0F766E]/5"
                        >
                          Mark Acknowledged
                        </button>
                      )}
                      {selectedIncident.state === 'DISPATCHED' && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleStatusChange('EN_ROUTE')}
                          className="px-3.5 py-2 rounded-xl bg-white border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E]"
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
                          className="px-3.5 py-2 rounded-xl bg-white border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E]"
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
                            className="px-3.5 py-2 rounded-xl bg-white border border-[#E9E1D3] text-xs font-semibold text-[#1B2A38] hover:border-[#0F766E]"
                          >
                            Mark Medical Handoff
                          </button>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={closureNote}
                        onChange={(e) => setClosureNote(e.target.value)}
                        placeholder="Closure summary (e.g., Swimmer safely brought ashore; declined hospital transport)"
                        className="flex-1 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs"
                      />
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleStatusChange('RESOLVED')}
                        className="px-4 py-2 rounded-xl bg-[#0B3B3C] hover:bg-[#1B2A38] text-white text-xs font-semibold shrink-0"
                      >
                        Close & Resolve Incident
                      </button>
                    </div>
                  </section>
                )}

              {/* Step 5: Timestamped Audit Trail */}
              <section className="pt-5 border-t border-[#E9E1D3] space-y-3">
                <h3 className="text-sm font-bold text-[#0B3B3C] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#0F766E]" />
                  <span>Timestamped Audit Trail ({selectedIncident.auditTrail.length})</span>
                </h3>
                <ol className="space-y-2">
                  {selectedIncident.auditTrail.map((evt) => (
                    <li
                      key={evt.id}
                      className="text-xs bg-white border border-[#E9E1D3]/80 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                    >
                      <div>
                        <span className="font-semibold text-[#1B2A38]">{evt.actorName}</span>
                        <span className="text-[#5B687A]"> · {evt.summary}</span>
                      </div>
                      <span className="font-mono text-[11px] text-[#5B687A] shrink-0">
                        {formatTime(evt.timestamp)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {/* Storage & Fallback Transparency Footer */}
          <div className="pt-4 border-t border-[#E9E1D3]/70 text-[11px] text-[#5B687A] flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#0F766E]" />
              If app or network is unavailable, switch to VHF Ch 16 / Call 112.
            </span>
            {storageMeta && <span>Store: {storageMeta.mechanism}</span>}
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
