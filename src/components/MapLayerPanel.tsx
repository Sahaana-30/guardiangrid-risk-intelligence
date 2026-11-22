import React from 'react';
import { Layers, Filter, X } from 'lucide-react';
import type { GoogleMapViewType } from '../types/maps';

interface MapLayerPanelProps {
  layers: {
    risk: boolean;
    forecast: boolean;
    cluster: boolean;
    incident: boolean;
    environmental: boolean;
    rescueCells: boolean;
  };
  onToggleLayer: (layer: keyof MapLayerPanelProps['layers']) => void;
  filterType: string;
  setFilterType: (val: string) => void;
  filterRisk: string;
  setFilterRisk: (val: string) => void;
  timeRange: string;
  setTimeRange: (val: string) => void;
  useGoogleMaps?: boolean;
  mapType?: GoogleMapViewType;
  setMapType?: (val: GoogleMapViewType) => void;
  onClose?: () => void;
}

export const MapLayerPanel: React.FC<MapLayerPanelProps> = ({
  layers,
  onToggleLayer,
  filterType,
  setFilterType,
  filterRisk,
  setFilterRisk,
  timeRange,
  setTimeRange,
  useGoogleMaps = false,
  mapType = 'hybrid',
  setMapType,
  onClose,
}) => {
  return (
    <div className="w-64 sm:w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] overflow-y-auto bg-[#FBF8F3]/95 backdrop-blur-md rounded-2xl border border-[#E9E1D3] shadow-xl p-4 text-[#1B2A38] space-y-4 select-none">
      <div className="flex items-center justify-between pb-2 border-b border-[#E9E1D3]">
        <span className="text-xs uppercase tracking-wider font-semibold text-[#5B687A] flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#0F766E]" />
          Map Layers
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close layers panel"
            className="p-1 rounded-lg text-[#5B687A] hover:text-[#1B2A38] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {useGoogleMaps && setMapType && (
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A] block">
            Google Map View
          </span>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#E9E1D3]/50 text-[11px] font-semibold">
            {(['hybrid', 'roadmap', 'satellite'] as GoogleMapViewType[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMapType(mode)}
                className={`py-1 rounded-lg capitalize cursor-pointer transition-colors ${
                  mapType === mode
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#5B687A] hover:text-[#1B2A38]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {[
          { key: 'risk', label: 'Risk Markers' },
          { key: 'incident', label: 'Active SOS & Incidents' },
          { key: 'environmental', label: 'Environmental Zones' },
          { key: 'rescueCells', label: 'Beach Rescue Cells' },
          { key: 'forecast', label: 'Forecast Layer' },
          { key: 'cluster', label: 'Cluster Grouping' },
        ].map((item) => {
          const active = layers[item.key as keyof typeof layers];
          return (
            <div key={item.key} className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#1B2A38]">{item.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => onToggleLayer(item.key as keyof typeof layers)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                  active ? 'bg-[#0F766E]' : 'bg-[#E9E1D3]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white shadow-xs absolute top-0.5 transition-transform ${
                    active ? 'left-5' : 'left-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-[#E9E1D3]">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A] block mb-2">
          Risk Level Legend (4 Tiers)
        </span>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#991B1B] shrink-0" />
            <span className="text-[#1B2A38]">Critical / Severe (≥ 85)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D65A4A] shrink-0" />
            <span className="text-[#1B2A38]">High Risk (70–84)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E9A03B] shrink-0" />
            <span className="text-[#1B2A38]">Moderate Risk (35–69)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2F855A] shrink-0" />
            <span className="text-[#1B2A38]">Low Risk (&lt; 35)</span>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-[#E9E1D3] space-y-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[#5B687A] flex items-center gap-1">
          <Filter className="w-3 h-3 text-[#0F766E]" />
          Quick Filters
        </span>

        <select
          aria-label="Filter water body type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-full text-xs bg-white border border-[#E9E1D3] rounded-xl px-2.5 py-1.5 text-[#1B2A38] focus:outline-none focus:border-[#0F766E]"
        >
          <option value="all">All Water Bodies</option>
          <option value="beach">Beaches</option>
          <option value="lake">Lakes</option>
          <option value="river">Rivers</option>
          <option value="reservoir">Reservoirs</option>
        </select>

        <select
          aria-label="Filter risk category"
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
          className="w-full text-xs bg-white border border-[#E9E1D3] rounded-xl px-2.5 py-1.5 text-[#1B2A38] focus:outline-none focus:border-[#0F766E]"
        >
          <option value="all">All Risk Levels</option>
          <option value="CRITICAL">Critical / Severe Only</option>
          <option value="HIGH">High Risk Only</option>
          <option value="MODERATE">Moderate Risk Only</option>
          <option value="LOW">Low Risk Only</option>
        </select>

        <select
          aria-label="Filter incident time window"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="w-full text-xs bg-white border border-[#E9E1D3] rounded-xl px-2.5 py-1.5 text-[#1B2A38] focus:outline-none focus:border-[#0F766E]"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>
    </div>
  );
};
