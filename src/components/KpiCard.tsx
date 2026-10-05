import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  delta?: {
    value: string;
    isPositiveGood?: boolean;
    trend: 'up' | 'down' | 'neutral';
  };
  icon: React.ReactNode;
  iconBg?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtext,
  delta,
  icon,
  iconBg = 'bg-[#0F766E]/10 text-[#0F766E]',
}) => {
  return (
    <div className="glass-card glass-card-hover rounded-2xl p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-[#5B687A]">
            {title}
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1B2A38]">
            {value}
          </div>
        </div>
        <div className={`p-2.5 rounded-xl ${iconBg}`}>{icon}</div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        {delta ? (
          <div className="flex items-center gap-1 font-medium">
            {delta.trend === 'up' && (
              <span
                className={`inline-flex items-center gap-0.5 ${
                  delta.isPositiveGood ? 'text-emerald-700' : 'text-[#D65A4A]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {delta.value}
              </span>
            )}
            {delta.trend === 'down' && (
              <span
                className={`inline-flex items-center gap-0.5 ${
                  delta.isPositiveGood ? 'text-[#D65A4A]' : 'text-emerald-700'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                {delta.value}
              </span>
            )}
            {delta.trend === 'neutral' && (
              <span className="inline-flex items-center gap-0.5 text-slate-500">
                <Minus className="w-3.5 h-3.5" />
                {delta.value}
              </span>
            )}
            <span className="text-[#5B687A] ml-1">vs last week</span>
          </div>
        ) : (
          <span className="text-[#5B687A]">{subtext}</span>
        )}
      </div>
    </div>
  );
};
