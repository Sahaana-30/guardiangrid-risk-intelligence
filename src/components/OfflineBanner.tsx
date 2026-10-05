import React from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const OfflineBanner: React.FC = () => {
  const { isOffline, loadError, lastUpdated, refreshData, clearError } = useApp();

  if (!isOffline && !loadError) return null;

  return (
    <div className={`px-4 py-2 text-xs flex items-center justify-between shadow-md transition-colors ${loadError ? 'bg-[#991B1B] text-white' : 'bg-[#B5654A] text-white'}`}>
      <div className="flex items-center gap-2">
        {loadError ? (
          <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse text-amber-200" />
        ) : (
          <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
        )}
        <span>
          {loadError ? (
            <span>
              Telemetry Notice: {loadError} Cached baseline intelligence active.
            </span>
          ) : (
            <span>
              Offline mode — Displaying cached intelligence (last updated:{' '}
              <strong className="font-mono">{lastUpdated || 'recently'}</strong>).
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => refreshData()}
          className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white font-medium px-2.5 py-1 rounded-lg text-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Sync
        </button>
        {loadError && (
          <button
            onClick={() => clearError()}
            className="text-white/80 hover:text-white px-1.5 py-0.5 text-xs font-semibold"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
