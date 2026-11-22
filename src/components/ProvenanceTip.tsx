import React, { useState } from 'react';
import { Info, Clock } from 'lucide-react';

export type DataTrustClassification =
  | 'live_measured'
  | 'historical_recorded'
  | 'forecast'
  | 'derived_analytical'
  | 'simulated_demo'
  | 'unavailable';

export const DATA_TRUST_META: Record<
  DataTrustClassification,
  { label: string; shortLabel: string; badgeClass: string; tooltipClass: string }
> = {
  live_measured: {
    label: 'Live measured',
    shortLabel: 'Live measured',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    tooltipClass: 'text-emerald-700 bg-emerald-50',
  },
  historical_recorded: {
    label: 'Historical recorded',
    shortLabel: 'Historical',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    tooltipClass: 'text-slate-700 bg-slate-100',
  },
  forecast: {
    label: 'Forecast',
    shortLabel: 'Forecast',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    tooltipClass: 'text-sky-700 bg-sky-50',
  },
  derived_analytical: {
    label: 'Derived analytical metric',
    shortLabel: 'Derived',
    badgeClass: 'bg-teal-50 text-[#0F766E] border-[#0F766E]/25',
    tooltipClass: 'text-teal-800 bg-teal-50',
  },
  simulated_demo: {
    label: 'Simulated demonstration',
    shortLabel: 'Simulated',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    tooltipClass: 'text-amber-800 bg-amber-50',
  },
  unavailable: {
    label: 'Unavailable',
    shortLabel: 'Unavailable',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    tooltipClass: 'text-rose-800 bg-rose-50',
  },
};

export function formatReadingAge(
  timestamp?: string | null,
  staleThresholdMinutes = 90
): { ageLabel: string; isStale: boolean; formattedTime: string } {
  if (!timestamp) {
    return { ageLabel: 'Unknown age', isStale: true, formattedTime: 'N/A' };
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { ageLabel: 'Unknown age', isStale: true, formattedTime: timestamp };
  }
  const diffMs = Date.now() - parsed.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const formattedTime = parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffMins < 0) {
    return {
      ageLabel: `Forecast (${Math.abs(diffMins)}m ahead)`,
      isStale: false,
      formattedTime,
    };
  }
  if (diffMins < 2) {
    return { ageLabel: 'Just now', isStale: false, formattedTime };
  }
  if (diffMins < 60) {
    return {
      ageLabel: `${diffMins}m ago`,
      isStale: diffMins > staleThresholdMinutes,
      formattedTime,
    };
  }
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 48) {
    return {
      ageLabel: `${diffHours}h ago`,
      isStale: diffMins > staleThresholdMinutes,
      formattedTime,
    };
  }
  const diffDays = Math.round(diffHours / 24);
  return {
    ageLabel: `${diffDays}d ago`,
    isStale: true,
    formattedTime,
  };
}

interface DataTrustBadgeProps {
  classification: DataTrustClassification;
  source?: string;
  timestamp?: string | null;
  note?: string;
  compact?: boolean;
  showStaleIndicator?: boolean;
  className?: string;
}

export const DataTrustBadge: React.FC<DataTrustBadgeProps> = ({
  classification,
  source,
  timestamp,
  note,
  compact = false,
  showStaleIndicator = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const meta = DATA_TRUST_META[classification];
  const ageInfo = timestamp ? formatReadingAge(timestamp) : null;
  const showStale =
    showStaleIndicator &&
    classification === 'live_measured' &&
    ageInfo?.isStale;

  return (
    <span className={`relative inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`Data classification: ${meta.label}${source ? `, source: ${source}` : ''}`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold leading-none cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
          showStale
            ? 'bg-amber-50 text-amber-800 border-amber-300'
            : meta.badgeClass
        }`}
      >
        <span>{showStale ? 'Stale' : compact ? meta.shortLabel : meta.label}</span>
        {(source || timestamp || note) && <Info className="w-2.5 h-2.5 opacity-75" />}
      </button>

      {open && (source || timestamp || note) && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 bg-[#1B2A38] text-white text-xs rounded-xl shadow-xl border border-white/10 pointer-events-none text-left">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.tooltipClass}`}>
              {meta.label}
            </span>
            {showStale && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300 font-semibold">
                <Clock className="w-2.5 h-2.5" /> Stale
              </span>
            )}
          </div>
          {source && (
            <div className="text-[11px] text-white/85 leading-snug mb-1">
              Source: <span className="text-white font-medium">{source}</span>
            </div>
          )}
          {ageInfo && (
            <div className="text-[10px] text-white/65 mb-1">
              Updated: {ageInfo.formattedTime} ({ageInfo.ageLabel})
            </div>
          )}
          {note && (
            <div className="text-[10px] text-white/75 leading-snug border-t border-white/10 pt-1 mt-1">
              {note}
            </div>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1B2A38]" />
        </div>
      )}
    </span>
  );
};

interface ProvenanceTipProps {
  source: string;
  timestamp?: string;
  type?: 'observed' | 'forecast' | 'estimated' | 'fallback' | DataTrustClassification;
  confidence?: number;
  className?: string;
}

export const ProvenanceTip: React.FC<ProvenanceTipProps> = ({
  source,
  timestamp,
  type = 'observed',
  confidence,
  className = '',
}) => {
  const [show, setShow] = useState(false);

  const legacyTypeLabels: Record<string, { text: string; color: string }> = {
    observed: { text: 'Live measured', color: 'text-emerald-700 bg-emerald-50' },
    forecast: { text: 'Forecast', color: 'text-sky-700 bg-sky-50' },
    estimated: { text: 'Derived analytical metric', color: 'text-teal-800 bg-teal-50' },
    fallback: { text: 'Unavailable / Baseline fallback', color: 'text-amber-800 bg-amber-50' },
    live_measured: { text: 'Live measured', color: 'text-emerald-700 bg-emerald-50' },
    historical_recorded: { text: 'Historical recorded', color: 'text-slate-700 bg-slate-100' },
    derived_analytical: { text: 'Derived analytical metric', color: 'text-teal-800 bg-teal-50' },
    simulated_demo: { text: 'Simulated demonstration', color: 'text-amber-800 bg-amber-50' },
    unavailable: { text: 'Unavailable', color: 'text-rose-800 bg-rose-50' },
  };

  const labelInfo = legacyTypeLabels[type] || legacyTypeLabels.observed;

  return (
    <div className={`relative inline-flex items-center ml-1.5 ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        aria-label="View data provenance"
        className="text-[#5B687A]/70 hover:text-[#0F766E] transition-colors p-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 rounded"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 bg-[#1B2A38] text-white text-xs rounded-xl shadow-xl border border-white/10 pointer-events-none transition-all text-left">
          <div className="font-semibold text-white/95 mb-1 flex items-center justify-between">
            <span>Data Provenance</span>
            {confidence !== undefined && (
              <span className="text-[10px] text-emerald-400 font-mono">{confidence}% Conf</span>
            )}
          </div>
          <div className="text-[11px] text-white/80 mb-1 leading-snug">
            Source: <span className="text-white font-medium">{source}</span>
          </div>
          {timestamp && (
            <div className="text-[10px] text-white/60 mb-1.5">
              Ref: {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div className="mt-1">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${labelInfo.color}`}>
              {labelInfo.text}
            </span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1B2A38]" />
        </div>
      )}
    </div>
  );
};
