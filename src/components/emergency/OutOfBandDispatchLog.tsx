import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { OfficialAlertLog, OfficialAlertStatus } from '../../types/officialAlerts';

interface OutOfBandDispatchLogProps {
  alerts: OfficialAlertLog[];
  channelsStatus: {
    smsConfigured: boolean;
    whatsappConfigured: boolean;
    simulatorEnabled: boolean;
  } | null;
  loading?: boolean;
  onAcknowledge: (logId: string) => Promise<void>;
  onRetry: (logId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const STATUS_BADGE: Record<
  OfficialAlertStatus,
  { label: string; className: string }
> = {
  DELIVERED: {
    label: 'Delivered (Provider Confirmed)',
    className: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
  },
  PROVIDER_ACCEPTED: {
    label: 'Provider Accepted (Pending Delivery)',
    className: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  },
  SENT: {
    label: 'Sent to Provider',
    className: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  },
  SIMULATED: {
    label: 'SIMULATED (Demo Mode)',
    className: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  },
  NOT_CONFIGURED: {
    label: 'NOT CONFIGURED',
    className: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
  },
  QUEUED: {
    label: 'Queued in Outbox',
    className: 'bg-[#FFF7ED] text-[#9A3412] border-[#FED7AA]',
  },
  FAILED: {
    label: 'Delivery Failed',
    className: 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]',
  },
};

function formatTime(iso?: string | null): string {
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

export const OutOfBandDispatchLog: React.FC<OutOfBandDispatchLogProps> = ({
  alerts,
  channelsStatus,
  loading,
  onAcknowledge,
  onRetry,
  onRefresh,
}) => {
  const [previewAlert, setPreviewAlert] = useState<OfficialAlertLog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const groupedByRecipient = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        recipientName: string;
        recipientRole: string;
        recipientPhoneMasked: string;
        incidentCode: string;
        isSandboxRecipient: boolean;
        sms?: OfficialAlertLog;
        whatsapp?: OfficialAlertLog;
      }
    >();

    for (const log of alerts) {
      const key = `${log.incidentId}:${log.recipientId}`;
      const existing = map.get(key) || {
        key,
        recipientName: log.recipientName,
        recipientRole: log.recipientRole,
        recipientPhoneMasked: log.recipientPhoneMasked,
        incidentCode: log.incidentCode,
        isSandboxRecipient: log.isSandboxRecipient,
      };
      if (log.channel === 'sms' && !existing.sms) existing.sms = log;
      if (log.channel === 'whatsapp' && !existing.whatsapp) existing.whatsapp = log;
      map.set(key, existing);
    }

    return Array.from(map.values());
  }, [alerts]);

  const handleAck = async (logId: string) => {
    setBusyId(logId);
    try {
      await onAcknowledge(logId);
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (logId: string) => {
    setBusyId(logId);
    try {
      await onRetry(logId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B3B3C] flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[#0F766E]" />
            <span>Out-of-Band Dispatch Log (SMS &amp; WhatsApp)</span>
          </h3>
          <p className="text-[11px] text-[#5B687A] mt-0.5">
            Durable server outbox notifying officials even if their Command Center tab is closed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {channelsStatus && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span
                className={`px-2 py-0.5 rounded-full border font-semibold ${
                  channelsStatus.smsConfigured
                    ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                    : channelsStatus.simulatorEnabled
                      ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                      : 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]'
                }`}
              >
                SMS: {channelsStatus.smsConfigured ? 'Twilio Live' : channelsStatus.simulatorEnabled ? 'Simulator' : 'Off'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full border font-semibold ${
                  channelsStatus.whatsappConfigured
                    ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                    : channelsStatus.simulatorEnabled
                      ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                      : 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]'
                }`}
              >
                WhatsApp: {channelsStatus.whatsappConfigured ? 'Twilio Live' : channelsStatus.simulatorEnabled ? 'Simulator' : 'NOT_CONFIGURED'}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="p-1.5 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E]"
            title="Refresh alert delivery logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#5B687A] text-center">
          No out-of-band SMS or WhatsApp alerts recorded for this incident yet. Trigger a 1-Tap Instant Drowning SOS to view live outbox telemetry.
        </div>
      ) : (
        <div className="space-y-2.5">
          {groupedByRecipient.map((group) => {
            const primaryLog = group.sms || group.whatsapp!;
            return (
              <div
                key={group.key}
                className="p-3 rounded-xl bg-white border border-[#E9E1D3] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#1B2A38] flex items-center gap-1.5">
                      <span>{group.recipientName}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569]">
                        {group.recipientRole}
                      </span>
                      {group.isSandboxRecipient && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">
                          SANDBOX
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#5B687A]">
                      {group.incidentCode} · {group.recipientPhoneMasked}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewAlert(primaryLog)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#0F766E]/30 bg-[#0F766E]/5 hover:bg-[#0F766E]/10 text-[#0B3B3C] text-[11px] font-semibold"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>Preview Phone Notification</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[group.sms, group.whatsapp].filter(Boolean).map((log) => {
                    if (!log) return null;
                    const badge = STATUS_BADGE[log.status];
                    return (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg bg-[#FBF8F3] border border-[#E9E1D3] text-[11px] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold uppercase text-[#1B2A38] flex items-center gap-1">
                            {log.channel === 'sms' ? (
                              <Phone className="w-3 h-3 text-[#0F766E]" />
                            ) : (
                              <MessageSquare className="w-3 h-3 text-[#15803D]" />
                            )}
                            {log.channel === 'sms' ? 'SMS' : 'WhatsApp'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <div className="text-[10px] text-[#5B687A] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            Initiated: {formatTime(log.initiatedAt)}
                          </span>
                          {log.deliveryDurationMs !== null && (
                            <span>Dispatch time: {log.deliveryDurationMs} ms</span>
                          )}
                          {log.providerMessageSid && (
                            <span className="font-mono text-[9px]">SID: {log.providerMessageSid}</span>
                          )}
                        </div>

                        {log.errorMessage && (
                          <div className="text-[10px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded px-2 py-1">
                            {log.errorMessage}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          {log.acknowledgedAt ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#065F46]">
                              <CheckCircle2 className="w-3 h-3" />
                              Acknowledged by {log.acknowledgedBy} ({formatTime(log.acknowledgedAt)})
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === log.id || log.status === 'NOT_CONFIGURED'}
                              onClick={() => void handleAck(log.id)}
                              className="text-[10px] font-semibold text-[#0F766E] hover:underline disabled:opacity-40"
                            >
                              {busyId === log.id ? 'Recording...' : 'Record Official Ack'}
                            </button>
                          )}

                          {(log.status === 'FAILED' || log.status === 'QUEUED') && (
                            <button
                              type="button"
                              disabled={busyId === log.id}
                              onClick={() => void handleRetry(log.id)}
                              className="text-[10px] font-semibold text-[#B94334] hover:underline disabled:opacity-40"
                            >
                              Retry Outbox
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1-Click Preview Phone Notification Modal */}
      {previewAlert && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewAlert(null)}
        >
          <div
            className="w-full max-w-md bg-[#0F172A] text-white rounded-3xl border border-slate-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Simulated Phone Status Bar */}
            <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-xs font-bold tracking-wide">
                  Official Mobile Alert Preview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAlert(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {previewAlert.isSimulated && (
                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>SIMULATED (Demo Mode):</strong> Logged in{' '}
                    <code>official_alert_logs</code>. Not sent to a real carrier handset.
                  </span>
                </div>
              )}

              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>To: {previewAlert.recipientName} ({previewAlert.recipientPhoneMasked})</span>
                <span className="uppercase font-semibold text-teal-300">
                  {previewAlert.channel}
                </span>
              </div>

              {/* SMS / WhatsApp Message Bubble */}
              <div className="rounded-2xl bg-slate-800/90 border border-slate-700 p-4 space-y-3 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                <div className="text-red-300 font-semibold">{previewAlert.messageBodyEn}</div>
                <div className="border-t border-slate-700 pt-2.5 text-slate-200">
                  {previewAlert.messageBodyTa}
                </div>
              </div>

              {/* Quick Action Links matching what official taps on phone */}
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={previewAlert.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700"
                >
                  <MapPin className="w-3.5 h-3.5 text-red-400" />
                  <span>Google Maps Pin</span>
                </a>
                <a
                  href={previewAlert.fieldKitDeepLink}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5E58] text-xs font-semibold text-white"
                  onClick={() => setPreviewAlert(null)}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Field Kit</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
