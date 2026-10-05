import React from 'react';
import { ShapContribution } from '../types';
import { ProvenanceTip } from './ProvenanceTip';

interface ShapBarsProps {
  shapValues: ShapContribution[];
  baseline: number;
  finalScore: number;
}

export const ShapBars: React.FC<ShapBarsProps> = ({
  shapValues,
  baseline,
  finalScore,
}) => {
  const sorted = [...shapValues].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
  const maxAbs = Math.max(...sorted.map((s) => Math.abs(s.shap)), 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between p-3.5 bg-[#E9E1D3]/40 rounded-xl text-xs">
        <div>
          <span className="text-[#5B687A]">90-Day Baseline Hazard:</span>{' '}
          <span className="font-bold text-[#1B2A38]">{baseline} pts</span>
          <ProvenanceTip
            source="Open-Meteo 90d Historical Reanalysis"
            type="observed"
          />
        </div>
        <div className="font-mono text-sm text-[#0F766E] font-semibold">
          Score = {baseline} + Σ SHAP = <span className="font-bold">{finalScore}</span>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((item) => {
          const isPositive = item.shap >= 0;
          const pct = Math.min(100, (Math.abs(item.shap) / maxAbs) * 100);

          return (
            <div key={item.featureKey} className="group">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-[#1B2A38] flex items-center">
                  {item.label}
                  <span className="text-[11px] text-[#5B687A] ml-1.5 font-normal">
                    ({item.value} {item.unit})
                  </span>
                </span>
                <span
                  className={`font-mono font-semibold ${
                    isPositive ? 'text-[#D65A4A]' : 'text-emerald-700'
                  }`}
                >
                  {isPositive ? `+${item.shap}` : `${item.shap}`} pts
                </span>
              </div>

              <div className="h-2 w-full bg-[#E9E1D3]/60 rounded-full overflow-hidden flex">
                <div className="w-1/2 flex justify-end">
                  {!isPositive && (
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-emerald-600 rounded-l-full transition-all duration-500"
                    />
                  )}
                </div>
                <div className="w-[1px] bg-slate-400 h-full" />
                <div className="w-1/2 flex justify-start">
                  {isPositive && (
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-[#D65A4A] rounded-r-full transition-all duration-500"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#5B687A] mt-0.5">
                <span>Model weight: {item.weight}%</span>
                <span>
                  Hazard index: {Math.round(item.hazard * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
