import React from 'react';
import { AlertTriangle, FileHeart, MapPin, ShieldAlert } from 'lucide-react';
import type {
  AiSbarHandoffCardPayload,
  SosTelemetryCardPayload,
} from './NexconnEmergencyCards';

interface EmergencyChatCardProps {
  sosCard?: SosTelemetryCardPayload;
  sbarCard?: AiSbarHandoffCardPayload;
}

export const EmergencyChatCard: React.FC<EmergencyChatCardProps> = ({ sosCard, sbarCard }) => {
  if (sosCard) {
    const isCritical = sosCard.priority === 'P1 CRITICAL';
    const coords =
      sosCard.lat !== null && sosCard.lon !== null
        ? `${sosCard.lat.toFixed(4)}, ${sosCard.lon.toFixed(4)}`
        : 'GPS Pending';
    return (
      <div
        className={`w-full max-w-md rounded-2xl bg-[#FBF8F3] overflow-hidden shadow-xs border ${
          isCritical ? 'border-[#D65A4A]' : 'border-[#0F766E]'
        }`}
      >
        <div
          className={`px-3.5 py-2 text-white flex items-center justify-between gap-2 text-[11px] font-bold tracking-wide ${
            isCritical ? 'bg-[#991B1B]' : 'bg-[#0B3B3C]'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">SOS TELEMETRY · {sosCard.incidentCode}</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] shrink-0">
            {sosCard.priority}
          </span>
        </div>
        <div className="p-3 text-xs space-y-1.5 text-[#1B2A38]">
          <div className="flex justify-between gap-3 border-b border-[#E9E1D3] pb-1">
            <span className="text-[#5B687A]">Category / Status</span>
            <span className="font-semibold text-right text-[#0B3B3C]">
              {sosCard.category.replace(/_/g, ' ').toUpperCase()} · {sosCard.status}
            </span>
          </div>
          <div className="flex justify-between gap-3 border-b border-[#E9E1D3] pb-1">
            <span className="text-[#5B687A] inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location
            </span>
            <span className="font-semibold text-right">
              {sosCard.cellLabel} ({sosCard.siteName})
            </span>
          </div>
          <div className="flex justify-between gap-3 border-b border-[#E9E1D3] pb-1">
            <span className="text-[#5B687A]">GPS Coordinates</span>
            <span className="font-mono font-semibold text-[#0B3B3C]">{coords}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[#5B687A]">Responders</span>
            <span className="font-semibold text-right">
              {sosCard.assignedResponders.length > 0
                ? sosCard.assignedResponders.join(', ')
                : 'Awaiting assignment'}
            </span>
          </div>
          {sosCard.isSimulated && (
            <div className="mt-1 px-2 py-1 rounded bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold">
              SIMULATED DRILL RECORD
            </div>
          )}
        </div>
      </div>
    );
  }

  if (sbarCard) {
    const isApproved = sbarCard.approvalStatus === 'APPROVED';
    return (
      <div className="w-full max-w-md rounded-2xl bg-[#FBF8F3] border border-[#0F766E] overflow-hidden shadow-xs">
        <div className="px-3.5 py-2 bg-[#0B3B3C] text-white flex items-center justify-between gap-2 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1.5 truncate">
            <FileHeart className="w-3.5 h-3.5 shrink-0 text-emerald-300" />
            <span className="truncate">AI SBAR HANDOFF · {sbarCard.incidentCode}</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[9.5px] shrink-0 ${
              isApproved ? 'bg-[#065F46]' : 'bg-[#92400E]'
            }`}
          >
            {isApproved
              ? `APPROVED (v${sbarCard.version})`
              : `PENDING REVIEW (v${sbarCard.version})`}
          </span>
        </div>
        <div className="p-3 text-xs space-y-2 text-[#1B2A38]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0F766E]">
              Severity: {sbarCard.severity} · Situation
            </div>
            <p className="mt-0.5 leading-relaxed">{sbarCard.situationSummary}</p>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0F766E]">
              Coordination Recommendation
            </div>
            <p className="mt-0.5 leading-relaxed">{sbarCard.recommendationSummary}</p>
          </div>
          {sbarCard.authorizedBy && (
            <div className="text-[10px] font-semibold text-[#065F46]">
              Authorized by: {sbarCard.authorizedBy}
            </div>
          )}
          <div className="p-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[#78350F] text-[10px] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{sbarCard.medicalDisclaimer}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
