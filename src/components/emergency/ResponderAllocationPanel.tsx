import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck, Clock, AlertTriangle, Check } from 'lucide-react';
import type { EmergencyIncident, RankedResponder } from '../../types/emergency';
import { fetchRankedResponders } from '../../services/emergencyApi';

interface ResponderAllocationPanelProps {
  incident: EmergencyIncident;
  dispatcherId: string;
  dispatcherName: string;
  onAssign: (params: {
    responderIds: string[];
    backupResponderId: string | null;
    escalationTimeoutSeconds: number;
  }) => Promise<void>;
}

export const ResponderAllocationPanel: React.FC<ResponderAllocationPanelProps> = ({
  incident,
  onAssign,
}) => {
  const [ranked, setRanked] = useState<RankedResponder[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let active = true;
    fetchRankedResponders(incident.id)
      .then((res) => {
        if (!active) return;
        setRanked(res.ranked);
        if (res.ranked.length > 0 && incident.assignedResponderIds.length === 0) {
          setSelectedIds([res.ranked[0].responder.id]);
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      active = false;
    };
  }, [incident.id, incident.state, incident.assignedResponderIds.length]);

  useEffect(() => {
    if (!incident.escalation?.active) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [incident.escalation?.active]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDispatch = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const backup = ranked.find((r) => !selectedIds.includes(r.responder.id))?.responder.id || null;
      await onAssign({
        responderIds: selectedIds,
        backupResponderId: backup,
        escalationTimeoutSeconds: timeoutSeconds,
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to dispatch responder.');
    } finally {
      setSubmitting(false);
    }
  };

  const canDispatch =
    incident.state !== 'UNVERIFIED' &&
    incident.state !== 'RESOLVED' &&
    incident.state !== 'REJECTED';

  const secondsRemaining = incident.escalation?.deadlineIso
    ? Math.max(0, Math.ceil((new Date(incident.escalation.deadlineIso).getTime() - nowMs) / 1000))
    : 0;

  return (
    <section className="pt-5 border-t border-[#E9E1D3] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-[#0B3B3C] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0F766E]" />
            <span>Intelligent Responder Allocation</span>
          </h3>
          <p className="text-xs text-[#5B687A] mt-0.5">
            Explainable ranking by proximity, shift availability, qualifications, and language · Simulated responder roster
          </p>
        </div>
      </div>

      {/* Escalation Countdown Banner */}
      {incident.escalation && (incident.escalation.active || incident.escalation.escalated) && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
            incident.escalation.escalated
              ? 'bg-[#FEF2F2] border-[#D65A4A]/50 text-[#991B1B]'
              : 'bg-[#FFF7ED] border-[#F59E0B]/40 text-[#9A3412]'
          }`}
        >
          <div className="flex items-start gap-2">
            {incident.escalation.escalated ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D65A4A]" />
            ) : (
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
            )}
            <div>
              <p className="font-semibold">
                {incident.escalation.escalated
                  ? 'Backup Escalation Triggered — Primary Responder Unacknowledged'
                  : `Awaiting Responder Acknowledgement (${secondsRemaining}s remaining)`}
              </p>
              <p className="mt-0.5 opacity-90">
                Backup standby: {incident.escalation.backupResponderName || 'Next available unit'}
              </p>
            </div>
          </div>
          {incident.escalation.escalated && incident.escalation.backupResponderId && (
            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                void onAssign({
                  responderIds: [incident.escalation!.backupResponderId!],
                  backupResponderId: null,
                  escalationTimeoutSeconds: timeoutSeconds,
                })
              }
              className="px-3 py-1.5 rounded-lg bg-[#D65A4A] text-white font-semibold hover:bg-[#B94334]"
            >
              Approve & Dispatch Backup
            </button>
          )}
        </div>
      )}

      {incident.state === 'UNVERIFIED' && (
        <div className="p-3.5 rounded-xl bg-[#F6F1E7] border border-[#E9E1D3] text-xs text-[#5B687A]">
          Responder dispatch is locked until a human dispatcher explicitly verifies this SOS alert above.
        </div>
      )}

      {/* Ranked responder table */}
      <div className="space-y-2.5">
        {ranked.map((item, idx) => {
          const isAssigned = incident.assignedResponderIds.includes(item.responder.id);
          const isSelected = selectedIds.includes(item.responder.id);
          return (
            <div
              key={item.responder.id}
              className={`p-3.5 rounded-xl border transition-colors ${
                isAssigned
                  ? 'bg-[#0F766E]/5 border-[#0F766E]/40'
                  : isSelected && canDispatch
                    ? 'bg-white border-[#0F766E]'
                    : 'bg-white border-[#E9E1D3]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {canDispatch && !isAssigned && (
                    <button
                      type="button"
                      onClick={() => toggleSelect(item.responder.id)}
                      aria-label={`Select ${item.responder.name}`}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-[#0F766E] border-[#0F766E] text-white'
                          : 'bg-white border-[#CBD5E1]'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <div>
                    <div className="text-xs font-bold text-[#1B2A38] flex flex-wrap items-center gap-2">
                      <span>
                        #{idx + 1} {item.responder.name}
                      </span>
                      <span className="font-normal text-[#5B687A]">
                        · {item.responder.radioCallsign} · Simulated
                      </span>
                      {isAssigned && (
                        <span className="text-[#0F766E] font-semibold">· Assigned</span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#5B687A] mt-0.5">
                      {item.responder.role} · {item.responder.station} ·{' '}
                      {(item.distanceMeters / 1000).toFixed(2)} km (~{item.estimatedEtaMinutes} min ETA)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-[#0B3B3C]">{item.totalScore}/100</div>
                  <div className="text-[10px] text-[#5B687A] capitalize">
                    {item.responder.availability.replace('_', ' ')}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 pt-2.5 border-t border-[#E9E1D3]/60 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#5B687A]">
                {item.factors.map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-2">
                    <span>
                      {f.label}: <strong className="text-[#1B2A38] font-medium">{f.detail}</strong>
                    </span>
                    <span className="font-mono text-[#0F766E] shrink-0">
                      {f.points}/{f.maxPoints}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {canDispatch && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-[#5B687A]">
            <label htmlFor="esc-timeout">Backup escalation timer:</label>
            <select
              id="esc-timeout"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg border border-[#E9E1D3] bg-white text-xs text-[#1B2A38]"
            >
              <option value={30}>30 seconds (drill)</option>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
              <option value={120}>120 seconds</option>
            </select>
          </div>

          <button
            type="button"
            disabled={submitting || selectedIds.length === 0}
            onClick={() => void handleDispatch()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold disabled:opacity-50 min-h-[40px]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {submitting
                ? 'Dispatching...'
                : `Approve & Dispatch (${selectedIds.length} Selected)`}
            </span>
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[#D65A4A]">{error}</p>}
    </section>
  );
};
