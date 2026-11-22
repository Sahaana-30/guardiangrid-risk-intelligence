import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  resolveBackNavigationTarget,
  useInAppNavigation,
} from '../context/NavigationContext';

interface BackNavButtonProps {
  fallbackPath?: string;
  explicitReturnTo?: string | null;
  label?: string;
  variant?: 'light' | 'dark';
  showLabel?: boolean;
  className?: string;
}

export const BackNavButton: React.FC<BackNavButtonProps> = ({
  fallbackPath,
  explicitReturnTo,
  label,
  variant = 'light',
  showLabel = false,
  className = '',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { previousRoute } = useInAppNavigation();

  const resolved = resolveBackNavigationTarget({
    currentPathname: location.pathname,
    previousRoute,
    explicitReturnTo,
    fallbackPath,
  });

  const displayTarget = label || resolved.label;
  const tooltipText = `Back to ${displayTarget}`;

  const variantClasses =
    variant === 'dark'
      ? 'border-white/25 bg-white/10 hover:bg-white/20 text-white focus:ring-white/40'
      : 'border-[#E9E1D3] bg-white hover:bg-[#FBF8F3] hover:border-[#0F766E]/40 text-[#1B2A38] hover:text-[#0F766E] focus:ring-[#0F766E]/40 shadow-2xs';

  return (
    <button
      type="button"
      onClick={() => navigate(resolved.path)}
      aria-label={tooltipText}
      title={tooltipText}
      className={`inline-flex items-center justify-center gap-1.5 ${
        showLabel ? 'px-3 py-1.5' : 'w-8 h-8'
      } rounded-xl border text-xs font-semibold transition-colors cursor-pointer shrink-0 focus:outline-none focus:ring-2 ${variantClasses} ${className}`}
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      {showLabel && <span>{tooltipText}</span>}
    </button>
  );
};
