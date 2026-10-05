import React from 'react';
import { RiskTier } from '../types';
import { ShieldCheck, AlertTriangle, AlertOctagon, Flame } from 'lucide-react';

interface TierBadgeProps {
  tier: RiskTier;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  tier,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  let bg = 'bg-[#2F855A]/12 text-[#1E6B44] border-[#2F855A]/25';
  let icon = <ShieldCheck className="w-3.5 h-3.5 text-[#2F855A]" />;
  let label = 'Low Risk';

  if (tier === 'Severe') {
    bg = 'bg-[#991B1B]/15 text-[#991B1B] border-[#991B1B]/40 font-bold';
    icon = <Flame className="w-3.5 h-3.5 text-[#991B1B] animate-pulse" />;
    label = 'Severe Risk';
  } else if (tier === 'High') {
    bg = 'bg-[#D65A4A]/15 text-[#B83827] border-[#D65A4A]/30 font-semibold';
    icon = <AlertOctagon className="w-3.5 h-3.5 text-[#D65A4A]" />;
    label = 'High Risk';
  } else if (tier === 'Medium') {
    bg = 'bg-[#E9A03B]/15 text-[#9A5B0B] border-[#E9A03B]/30 font-semibold';
    icon = <AlertTriangle className="w-3.5 h-3.5 text-[#E9A03B]" />;
    label = 'Medium Risk';
  } else {
    bg = 'bg-[#2F855A]/12 text-[#1E6B44] border-[#2F855A]/25 font-semibold';
    icon = <ShieldCheck className="w-3.5 h-3.5 text-[#2F855A]" />;
    label = 'Low Risk';
  }

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border shadow-xs tracking-tight transition-colors ${bg} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && icon}
      <span>{label}</span>
    </span>
  );
};
