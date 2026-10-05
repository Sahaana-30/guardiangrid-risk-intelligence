import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface ProvenanceTipProps {
  source: string;
  timestamp?: string;
  type?: 'observed' | 'forecast' | 'estimated' | 'fallback';
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

  const typeLabels = {
    observed: { text: 'Live Observed Data', color: 'text-emerald-700 bg-emerald-50' },
    forecast: { text: 'Numerical Weather Forecast', color: 'text-sky-700 bg-sky-50' },
    estimated: { text: 'Deterministic Transformation', color: 'text-amber-700 bg-amber-50' },
    fallback: { text: 'Inland Baseline Fallback', color: 'text-slate-700 bg-slate-100' },
  };

  return (
    <div className={`relative inline-flex items-center ml-1.5 ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        aria-label="View data provenance"
        className="text-[#5B687A]/60 hover:text-[#0F766E] transition-colors p-0.5 focus:outline-none"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 bg-[#1B2A38] text-white text-xs rounded-xl shadow-xl border border-white/10 pointer-events-none transition-all">
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
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${typeLabels[type].color}`}>
              {typeLabels[type].text}
            </span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1B2A38]" />
        </div>
      )}
    </div>
  );
};
