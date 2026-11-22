import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Radio,
  ShieldAlert,
  Users,
  Stethoscope,
  XCircle,
  Bell,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Navigation,
  MapPin,
} from 'lucide-react';
import type { EmergencyIncident, EmergencyLanguage } from '../../types/emergency';
import type { OfficialAlertLog } from '../../types/officialAlerts';

interface EmergencyResponseTimelineProps {
  incident: EmergencyIncident;
  alertLogs?: OfficialAlertLog[];
  defaultLanguage?: EmergencyLanguage;
  compact?: boolean;
}

type StepStatus = 'completed' | 'simulated' | 'failed' | 'pending' | 'rejected' | 'unavailable';
type ActorOrigin = 'system' | 'operator' | 'responder' | 'public';

interface TimelineStage {
  step: number;
  key: string;
  labelEn: string;
  labelTa: string;
  status: StepStatus;
  timestamp?: string;
  actorOrigin: ActorOrigin;
  actorLabel: string;
  detail: string;
}

function formatTs(iso?: string): string {
  if (!iso) return 'Pending';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Pending';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return 'Pending';
  }
}

function formatDurationDelta(startIso?: string, endIso?: string): string | null {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `+${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `+${mins}m ${rem}s` : `+${mins}m`;
}

export const EmergencyResponseTimeline: React.FC<EmergencyResponseTimelineProps> = ({
  incident,
  alertLogs = [],
  defaultLanguage,
  compact = false,
}) => {
  const [lang, setLang] = useState<EmergencyLanguage>(defaultLanguage || incident.language || 'en');
  const [showRawAudit, setShowRawAudit] = useState(false);

  const incidentAlerts = useMemo(
    () => alertLogs.filter((a) => a.incidentId === incident.id),
    [alertLogs, incident.id]
  );

  const stages = useMemo<TimelineStage[]>(() => {
    const audit = incident.auditTrail || [];
    const findAudit = (matcher: (action: string, summary: string) => boolean) =>
      audit.find((e) => matcher(e.action.toUpperCase(), (e.summary || '').toLowerCase()));

    const isRejected = incident.state === 'REJECTED';

    // 1. SOS Received
    const sosAudit = findAudit(
      (a) => a.includes('SOS') || a.includes('CREATED') || a.includes('DRILL')
    );

    // 3 & 4. Notifications Queued & Provider Status
    const notifAudit = findAudit(
      (a, s) => a.includes('ALERT') || a.includes('NOTIF') || s.includes('sms') || s.includes('whatsapp')
    );
    const hasAlerts = incidentAlerts.length > 0;
    const simulatedCount = incidentAlerts.filter((a) => a.status === 'SIMULATED').length;
    const deliveredCount = incidentAlerts.filter((a) => a.status === 'DELIVERED').length;
    const acceptedCount = incidentAlerts.filter(
      (a) => a.status === 'PROVIDER_ACCEPTED' || a.status === 'SENT'
    ).length;
    const queuedCount = incidentAlerts.filter((a) => a.status === 'QUEUED').length;
    const failedCount = incidentAlerts.filter((a) => a.status === 'FAILED').length;
    const ackedAlertsCount = incidentAlerts.filter((a) => Boolean(a.acknowledgedAt)).length;
    const earliestAlertTs = hasAlerts
      ? [...incidentAlerts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt
      : notifAudit?.timestamp;

    let providerStatus: StepStatus = 'pending';
    let providerDetail =
      lang === 'ta'
        ? 'அறிவிப்பு நிலை இன்னும் பதிவு செய்யப்படவில்லை'
        : 'No provider delivery record persisted for this incident yet.';

    if (hasAlerts) {
      const parts: string[] = [];
      if (simulatedCount > 0) parts.push(`${simulatedCount} SIMULATED`);
      if (deliveredCount > 0) parts.push(`${deliveredCount} DELIVERED`);
      if (acceptedCount > 0) parts.push(`${acceptedCount} PROVIDER_ACCEPTED`);
      if (queuedCount > 0) parts.push(`${queuedCount} QUEUED`);
      if (failedCount > 0) parts.push(`${failedCount} FAILED`);
      if (ackedAlertsCount > 0) parts.push(`${ackedAlertsCount} ACKNOWLEDGED`);

      if (simulatedCount > 0 && deliveredCount === 0 && acceptedCount === 0 && failedCount === 0) {
        providerStatus = 'simulated';
      } else if (failedCount > 0 && deliveredCount === 0 && acceptedCount === 0 && simulatedCount === 0) {
        providerStatus = 'failed';
      } else {
        providerStatus = 'completed';
      }
      providerDetail = parts.join(' · ');
    } else if (notifAudit) {
      providerStatus = incident.isSimulated ? 'simulated' : 'completed';
      providerDetail = notifAudit.summary;
    }

    // 5. Verified / Rejected
    const verifyAudit = findAudit((a) => a.includes('VERIFY') || a.includes('REJECT'));
    const verifiedTs = incident.verifiedAt || verifyAudit?.timestamp;

    // 6. Responder Assigned
    const assignAudit = findAudit((a) => a.includes('ASSIGN') || a.includes('DISPATCH'));
    const dispatchedTs = incident.dispatchedAt || assignAudit?.timestamp;

    // 7. Responder Acknowledged
    const ackAudit = findAudit((a) => a.includes('ACK'));
    const ackTs = incident.acknowledgedAt || ackAudit?.timestamp;

    // 8. Responder En Route
    const enRouteAudit = findAudit((a) => a.includes('EN_ROUTE'));
    const enRouteTs = incident.enRouteAt || enRouteAudit?.timestamp;

    // 9. Responder Arrived (On Scene)
    const onSceneAudit = findAudit((a) => a.includes('ON_SCENE'));
    const onSceneTs = incident.onSceneAt || onSceneAudit?.timestamp;

    // 10. Medical Handoff Initiated
    const medAudit = findAudit(
      (a, s) =>
        a.includes('MEDICAL') ||
        a.includes('HANDOFF') ||
        a.includes('SBAR') ||
        s.includes('medical handoff')
    );
    const medReached =
      incident.state === 'MEDICAL_HANDOFF' ||
      Boolean(medAudit) ||
      Boolean(incident.victimRecoveredAt);
    const medTs = medAudit?.timestamp || incident.victimRecoveredAt;

    // 11. Incident Resolved
    const resolveAudit = findAudit((a) => a.includes('RESOLV'));
    const resolvedTs = incident.resolvedAt || resolveAudit?.timestamp;

    return [
      {
        step: 1,
        key: 'sos_received',
        labelEn: 'SOS Received',
        labelTa: 'SOS பெறப்பட்டது',
        status: incident.isSimulated ? 'simulated' : 'completed',
        timestamp: incident.createdAt,
        actorOrigin: incident.isSimulated ? 'operator' : 'public',
        actorLabel: incident.isSimulated
          ? 'Simulated Drill'
          : sosAudit?.actorName || 'Public Reporter',
        detail: `${incident.category.replace('_', ' ').toUpperCase()} · ${incident.locationSource.toUpperCase()}${
          incident.gpsAccuracyMeters ? ` (±${incident.gpsAccuracyMeters}m)` : ''
        }`,
      },
      {
        step: 2,
        key: 'incident_persisted',
        labelEn: 'Incident Persisted',
        labelTa: 'சம்பவம் பதிவு செய்யப்பட்டது',
        status: incident.isSimulated ? 'simulated' : 'completed',
        timestamp: incident.createdAt,
        actorOrigin: 'system',
        actorLabel: 'System Repository',
        detail: `Persisted as ${incident.code} · Cell ${incident.cellId} (${incident.siteName})`,
      },
      {
        step: 3,
        key: 'notifications_queued',
        labelEn: 'Official Notifications Queued',
        labelTa: 'அதிகாரப்பூர்வ அறிவிப்புகள் வரிசையில்',
        status: hasAlerts || notifAudit ? (incident.isSimulated || simulatedCount > 0 ? 'simulated' : 'completed') : 'pending',
        timestamp: earliestAlertTs,
        actorOrigin: 'system',
        actorLabel: 'Alert Dispatch Engine',
        detail: hasAlerts
          ? `${incidentAlerts.length} recipient notification(s) logged (SMS / WhatsApp / War Room)`
          : notifAudit
            ? notifAudit.summary
            : lang === 'ta'
              ? 'அறிவிப்பு பதிவு நிலுவையில் உள்ளது'
              : 'Awaiting alert dispatch log entry',
      },
      {
        step: 4,
        key: 'notification_provider',
        labelEn: 'Notification Provider Status',
        labelTa: 'அறிவிப்பு வழங்குநர் நிலை',
        status: providerStatus,
        timestamp: earliestAlertTs,
        actorOrigin: 'system',
        actorLabel: simulatedCount > 0 ? 'Alert Simulator' : 'Twilio / Messaging Provider',
        detail: providerDetail,
      },
      {
        step: 5,
        key: 'verified',
        labelEn: isRejected ? 'Incident Rejected (False Alarm)' : 'Incident Verified',
        labelTa: isRejected ? 'தவறான அலாரம் என நிராகரிக்கப்பட்டது' : 'சம்பவம் சரிபார்க்கப்பட்டது',
        status: isRejected ? 'rejected' : verifiedTs || incident.state !== 'UNVERIFIED' ? 'completed' : 'pending',
        timestamp: verifiedTs,
        actorOrigin: 'operator',
        actorLabel: incident.verifiedBy || verifyAudit?.actorName || 'Dispatcher Verification Gate',
        detail: isRejected
          ? verifyAudit?.summary || 'Rejected during human verification'
          : verifiedTs
            ? verifyAudit?.summary || 'Verified by human dispatcher for responder assignment'
            : lang === 'ta'
              ? 'மனித கட்டுப்பாட்டு அதிகாரி சரிபார்ப்பு நிலுவையில்'
              : 'Pending mandatory human dispatcher verification',
      },
      {
        step: 6,
        key: 'responder_assigned',
        labelEn: 'Responder Assigned',
        labelTa: 'மீட்புப் பணியாளர் நியமிக்கப்பட்டார்',
        status: isRejected
          ? 'unavailable'
          : dispatchedTs || incident.assignedResponderIds.length > 0
            ? 'completed'
            : 'pending',
        timestamp: dispatchedTs,
        actorOrigin: 'operator',
        actorLabel: assignAudit?.actorName || 'Dispatch Command',
        detail:
          incident.assignedResponderNames.length > 0
            ? incident.assignedResponderNames.join(', ')
            : isRejected
              ? 'Not applicable (incident rejected)'
              : lang === 'ta'
                ? 'மீட்புப் பணியாளர் நியமனம் நிலுவையில்'
                : 'Awaiting responder assignment',
      },
      {
        step: 7,
        key: 'responder_acknowledged',
        labelEn: 'Responder Acknowledged',
        labelTa: 'மீட்புப் பணியாளர் ஒப்புக்கொண்டார்',
        status: isRejected ? 'unavailable' : ackTs ? 'completed' : 'pending',
        timestamp: ackTs,
        actorOrigin: 'responder',
        actorLabel: ackAudit?.actorName || incident.assignedResponderNames[0] || 'Assigned Responder',
        detail: ackTs
          ? ackAudit?.summary || 'Assignment acknowledged by field responder'
          : isRejected
            ? 'Not applicable'
            : 'Pending responder acknowledgement',
      },
      {
        step: 8,
        key: 'responder_en_route',
        labelEn: 'Responder En Route',
        labelTa: 'மீட்புப் பணியாளர் புறப்பட்டார்',
        status: isRejected ? 'unavailable' : enRouteTs ? 'completed' : 'pending',
        timestamp: enRouteTs,
        actorOrigin: 'responder',
        actorLabel: enRouteAudit?.actorName || incident.assignedResponderNames[0] || 'Field Unit',
        detail: enRouteTs
          ? enRouteAudit?.summary || 'Responder moving to rescue cell'
          : isRejected
            ? 'Not applicable'
            : 'Pending EN_ROUTE telemetry update',
      },
      {
        step: 9,
        key: 'responder_arrived',
        labelEn: 'Responder Arrived On Scene',
        labelTa: 'மீட்புப் பணியாளர் சம்பவ இடத்திற்கு வந்தார்',
        status: isRejected ? 'unavailable' : onSceneTs ? 'completed' : 'pending',
        timestamp: onSceneTs,
        actorOrigin: 'responder',
        actorLabel: onSceneAudit?.actorName || incident.assignedResponderNames[0] || 'Field Unit',
        detail: onSceneTs
          ? `${onSceneAudit?.summary || 'Arrived on scene'}${
              incident.arrivalVerification ? ` (${incident.arrivalVerification.replace('_', ' ')})` : ''
            }`
          : isRejected
            ? 'Not applicable'
            : 'Pending ON_SCENE arrival confirmation',
      },
      {
        step: 10,
        key: 'medical_handoff',
        labelEn: 'Medical Handoff Initiated',
        labelTa: 'மருத்துவ ஒப்படைப்பு தொடங்கியது',
        status: isRejected ? 'unavailable' : medReached ? 'completed' : 'pending',
        timestamp: medTs,
        actorOrigin: 'operator',
        actorLabel: medAudit?.actorName || 'EMS / Medical Coordination',
        detail: medReached
          ? medAudit?.summary || 'Victim recovered / medical handoff coordination active'
          : isRejected
            ? 'Not applicable'
            : 'Pending medical handoff initiation (if required)',
      },
      {
        step: 11,
        key: 'resolved',
        labelEn: 'Incident Resolved',
        labelTa: 'சம்பவம் தீர்க்கப்பட்டது',
        status: isRejected
          ? 'rejected'
          : incident.state === 'RESOLVED' || resolvedTs
            ? 'completed'
            : 'pending',
        timestamp: resolvedTs,
        actorOrigin: 'operator',
        actorLabel: resolveAudit?.actorName || 'Command Closure',
        detail:
          incident.closureSummary ||
          (resolvedTs
            ? 'Incident closed and archived in operational ledger'
            : isRejected
              ? 'Closed as rejected false alarm'
              : 'Incident currently active'),
      },
    ];
  }, [incident, incidentAlerts, lang]);

  const completedStepsCount = stages.filter(
    (s) => s.status === 'completed' || s.status === 'simulated'
  ).length;

  const badgeForOrigin = (origin: ActorOrigin) => {
    switch (origin) {
      case 'system':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'operator':
        return 'bg-[#0F766E]/10 text-[#0B3B3C] border-[#0F766E]/25';
      case 'responder':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'public':
        return 'bg-rose-50 text-rose-800 border-rose-200';
    }
  };

  const iconForStatus = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-[#0F766E] shrink-0" />;
      case 'simulated':
        return <Bell className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'failed':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-[#D65A4A] shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-[#94A3B8] shrink-0" />;
    }
  };

  return (
    <section className="rounded-2xl border border-[#E9E1D3] bg-[#FBF8F3] p-4 space-y-3">
      {/* Timeline Header & Incident Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#E9E1D3]">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="w-4 h-4 text-[#0F766E]" />
            <h3 className="text-sm font-bold text-[#0B3B3C]">
              {lang === 'ta'
                ? 'அவசர மீட்பு காலவரிசை (11 நிலைகள்)'
                : 'Unified Emergency Response Timeline'}
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-white border border-[#E9E1D3] text-[10px] font-semibold text-[#1B2A38]">
              {completedStepsCount}/11 Recorded
            </span>
            {incident.isSimulated && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                SIMULATED DRILL
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5B687A]">
            <span className="font-mono font-semibold text-[#0B3B3C]">{incident.code}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#0F766E]" />
              {incident.cellId} · {incident.siteName}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3 text-[#0F766E]" />
              {incident.assignedResponderNames.length > 0
                ? incident.assignedResponderNames.join(', ')
                : 'Unassigned'}
            </span>
            <span className="font-semibold text-[#1B2A38]">
              Status: {incident.state.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
              lang === 'en'
                ? 'bg-[#0B3B3C] text-white'
                : 'bg-white border border-[#E9E1D3] text-[#5B687A]'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('ta')}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
              lang === 'ta'
                ? 'bg-[#0B3B3C] text-white'
                : 'bg-white border border-[#E9E1D3] text-[#5B687A]'
            }`}
          >
            தமிழ்
          </button>
        </div>
      </div>

      {/* 11-Stage Persisted Lifecycle List */}
      <ol className={`space-y-1.5 ${compact ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
        {stages.map((stage) => {
          const delta =
            stage.step > 1 && stage.timestamp
              ? formatDurationDelta(incident.createdAt, stage.timestamp)
              : null;

          return (
            <li
              key={stage.key}
              className={`rounded-xl border px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors ${
                stage.status === 'pending' || stage.status === 'unavailable'
                  ? 'bg-white/50 border-[#E9E1D3]/60 opacity-80'
                  : stage.status === 'simulated'
                    ? 'bg-amber-50/70 border-amber-200'
                    : stage.status === 'failed' || stage.status === 'rejected'
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-white border-[#E9E1D3]'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
                  <span className="w-5 h-5 rounded-full bg-[#F6F1E7] border border-[#E9E1D3] text-[10px] font-bold text-[#0B3B3C] flex items-center justify-center">
                    {stage.step}
                  </span>
                  {iconForStatus(stage.status)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-[#1B2A38]">
                      {lang === 'ta' ? stage.labelTa : stage.labelEn}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${badgeForOrigin(
                        stage.actorOrigin
                      )}`}
                    >
                      {stage.actorOrigin}
                    </span>
                    {stage.status === 'simulated' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                        SIMULATED
                      </span>
                    )}
                    {stage.status === 'failed' && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                        FAILED
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5B687A] mt-0.5 break-words">
                    <span className="font-medium text-[#1B2A38]">{stage.actorLabel}:</span>{' '}
                    {stage.detail}
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 pl-8 sm:pl-0">
                <span className="font-mono text-[11px] font-semibold text-[#1B2A38]">
                  {stage.status === 'unavailable' ? 'N/A' : formatTs(stage.timestamp)}
                </span>
                {delta && (
                  <span className="font-mono text-[10px] text-[#0F766E] font-semibold">
                    {delta} from SOS
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Expandable Raw Audit Log */}
      {incident.auditTrail && incident.auditTrail.length > 0 && (
        <div className="pt-2 border-t border-[#E9E1D3]/70">
          <button
            type="button"
            onClick={() => setShowRawAudit((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
          >
            {showRawAudit ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            <span>
              {showRawAudit ? 'Hide' : 'Show'} Raw Persisted Audit Log ({incident.auditTrail.length}{' '}
              entries)
            </span>
          </button>

          {showRawAudit && (
            <ol className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {incident.auditTrail.map((evt) => (
                <li
                  key={evt.id}
                  className="text-[11px] bg-white border border-[#E9E1D3]/80 rounded-lg px-3 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                >
                  <div>
                    <span className="font-mono text-[10px] uppercase text-[#0F766E] mr-1.5">
                      [{evt.actorRole}]
                    </span>
                    <span className="font-semibold text-[#1B2A38]">{evt.actorName}</span>
                    <span className="text-[#5B687A]"> · {evt.summary}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#5B687A] shrink-0">
                    {formatTs(evt.timestamp)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
};
