import React from 'react';
import { RiskTier } from '../types';

interface RiskGaugeProps {
  score: number;
  tier: RiskTier;
  size?: number;
  strokeWidth?: number;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  tier,
  size = 120,
  strokeWidth = 10,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (arcLength * Math.min(100, Math.max(0, score))) / 100;

  const color =
    tier === 'Severe'
      ? '#991B1B'
      : tier === 'High'
      ? '#D65A4A'
      : tier === 'Medium'
      ? '#E9A03B'
      : '#2F855A';

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        className="transform -rotate-135 origin-center"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E9E1D3"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tracking-tight text-[#1B2A38]">{score}</span>
        <span className="text-[10px] uppercase font-semibold text-[#5B687A]">/ 100</span>
      </div>
    </div>
  );
};
