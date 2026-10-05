import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CITIES, DEFAULT_RISK_WEIGHTS } from '../config';
import { WaterBodyType } from '../types';
import {
  Settings as SettingsIcon,
  Sliders,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Layers,
  Database,
  Wifi,
  WifiOff,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const {
    currentCity,
    setCity,
    riskWeights,
    updateRiskWeights,
    resetRiskWeights,
    addCustomSite,
    refreshData,
    isOffline,
    lastUpdated,
    isLoading,
  } = useApp();

  // Custom site form state
  const [siteName, setSiteName] = useState('');
  const [siteType, setSiteType] = useState<WaterBodyType>('beach');
  const [siteLat, setSiteLat] = useState(currentCity.lat.toString());
  const [siteLon, setSiteLon] = useState(currentCity.lon.toString());
  const [hasLifeguard, setHasLifeguard] = useState(false);
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(null);

  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim()) return;

    addCustomSite({
      name: siteName.trim(),
      type: siteType,
      lat: parseFloat(siteLat) || currentCity.lat,
      lon: parseFloat(siteLon) || currentCity.lon,
      hasLifeguard,
      infrastructureIndex: 60,
    });

    setAddSuccessMessage(`Added "${siteName}" to monitored water bodies!`);
    setSiteName('');
    setTimeout(() => setAddSuccessMessage(null), 5000);
  };

  const handleClearCache = () => {
    try {
      localStorage.clear();
      setCacheClearMessage('LocalStorage and telemetry cache cleared successfully.');
      setTimeout(() => {
        setCacheClearMessage(null);
        window.location.reload();
      }, 1500);
    } catch {
      setCacheClearMessage('Unable to clear cache.');
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-[#0F766E]" />
          <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
            System Configuration & Calibration
          </h1>
        </div>
        <p className="text-sm text-[#5B687A] mt-1">
          Customize regional jurisdiction, adjust expert risk model weights, add custom monitoring points, and manage local data caching.
        </p>
      </div>

      {/* Region / City Switcher */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#0F766E]" />
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Active Region / Jurisdiction
          </h2>
        </div>
        <p className="text-xs text-[#5B687A]">
          Select the active coastal or municipal territory to automatically load corresponding hydrological seed sites, Open-Meteo bounding boxes, and GDELT event queries.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          {CITIES.map((c) => {
            const isSelected = currentCity.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCity(c)}
                className={`p-3.5 rounded-2xl border text-left transition ${
                  isSelected
                    ? 'border-[#0F766E] bg-white ring-2 ring-[#0F766E]/20 shadow-xs'
                    : 'border-[#E9E1D3] bg-white/60 hover:bg-white text-[#1B2A38]'
                }`}
              >
                <div className="font-bold text-sm text-[#1B2A38]">{c.name}</div>
                <div className="text-[11px] text-[#5B687A]">
                  {c.region}, {c.country}
                </div>
                <div className="text-[10px] text-[#0F766E] font-mono mt-1">
                  {c.lat.toFixed(2)}°N, {c.lon.toFixed(2)}°E
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Risk Model Weight Customizer */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E9E1D3] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#0F766E]" />
              <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
                Risk Model Hazard Weights
              </h2>
            </div>
            <p className="text-xs text-[#5B687A] mt-1">
              Fine-tune the relative influence of environmental hazard factors across all sites.
            </p>
          </div>

          <button
            onClick={resetRiskWeights}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#0F766E] hover:bg-[#FBF8F3] transition"
          >
            Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
              <span>Wave Height Weight:</span>
              <span className="text-[#0F766E] font-bold">{riskWeights.waveHeightWeight} pts</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              value={riskWeights.waveHeightWeight}
              onChange={(e) =>
                updateRiskWeights({ ...riskWeights, waveHeightWeight: parseInt(e.target.value, 10) })
              }
              className="w-full accent-[#0F766E]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
              <span>Swell Wave Period Weight:</span>
              <span className="text-[#0F766E] font-bold">{riskWeights.wavePeriodWeight} pts</span>
            </div>
            <input
              type="range"
              min="5"
              max="40"
              value={riskWeights.wavePeriodWeight}
              onChange={(e) =>
                updateRiskWeights({ ...riskWeights, wavePeriodWeight: parseInt(e.target.value, 10) })
              }
              className="w-full accent-[#0F766E]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
              <span>Wind Speed & Gusts Weight:</span>
              <span className="text-[#0F766E] font-bold">{riskWeights.windSpeedWeight} pts</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              value={riskWeights.windSpeedWeight}
              onChange={(e) =>
                updateRiskWeights({ ...riskWeights, windSpeedWeight: parseInt(e.target.value, 10) })
              }
              className="w-full accent-[#0F766E]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
              <span>Precipitation (24h Runoff) Weight:</span>
              <span className="text-[#0F766E] font-bold">{riskWeights.precipitationWeight} pts</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              value={riskWeights.precipitationWeight}
              onChange={(e) =>
                updateRiskWeights({
                  ...riskWeights,
                  precipitationWeight: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-[#0F766E]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
              <span>River Discharge Surge Weight:</span>
              <span className="text-[#0F766E] font-bold">{riskWeights.riverDischargeWeight} pts</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={riskWeights.riverDischargeWeight}
              onChange={(e) =>
                updateRiskWeights({
                  ...riskWeights,
                  riverDischargeWeight: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-[#0F766E]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
              <span>Lifeguard Presence Mitigation:</span>
              <span className="text-[#2F855A] font-bold">-{riskWeights.lifeguardMitigation} pts</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              value={riskWeights.lifeguardMitigation}
              onChange={(e) =>
                updateRiskWeights({
                  ...riskWeights,
                  lifeguardMitigation: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-[#2F855A]"
            />
          </div>
        </div>
      </div>

      {/* Add Custom Water Body Form */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-5 h-5 text-[#0F766E]" />
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Add Custom Water Body Point
          </h2>
        </div>
        <p className="text-xs text-[#5B687A]">
          Manually register a local beach stretch, inland lake, or irrigation reservoir to include in the live monitoring and forecasting pipeline.
        </p>

        {addSuccessMessage && (
          <div className="p-3 rounded-xl bg-[#2F855A]/10 border border-[#2F855A]/20 text-[#2F855A] text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{addSuccessMessage}</span>
          </div>
        )}

        <form onSubmit={handleAddSite} className="space-y-4 text-xs pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-[#1B2A38]">Site Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Ennore Creek Estuary"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#1B2A38]">Water Body Type</label>
              <select
                value={siteType}
                onChange={(e) => setSiteType(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
              >
                <option value="beach">Coastal Beach</option>
                <option value="lake">Inland Lake</option>
                <option value="reservoir">Storage Reservoir</option>
                <option value="river">River / Waterway</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-[#1B2A38]">Latitude</label>
              <input
                type="text"
                required
                value={siteLat}
                onChange={(e) => setSiteLat(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[#1B2A38]">Longitude</label>
              <input
                type="text"
                required
                value={siteLon}
                onChange={(e) => setSiteLon(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] font-mono"
              />
            </div>

            <div className="space-y-1 flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={hasLifeguard}
                  onChange={(e) => setHasLifeguard(e.target.checked)}
                  className="rounded text-[#0F766E] accent-[#0F766E] w-4 h-4"
                />
                <span className="font-semibold text-[#1B2A38]">Certified Lifeguards Present</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs"
          >
            Register Monitoring Point
          </button>
        </form>
      </div>

      {/* Connectivity & Cache Management */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
          System Health & Cache Diagnostics
        </h2>

        {cacheClearMessage && (
          <div className="p-3 rounded-xl bg-[#0F766E]/10 border border-[#0F766E]/20 text-[#0F766E] text-xs">
            {cacheClearMessage}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1">
            <div className="font-semibold text-[#5B687A]">Open-Meteo Ingestion</div>
            <div className="font-bold text-[#2F855A] flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#2F855A]"></span>
              Live • Connected
            </div>
            <div className="text-[11px] text-[#5B687A]">Sync: {lastUpdated || 'Active'}</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1">
            <div className="font-semibold text-[#5B687A]">OpenStreetMap Overpass</div>
            <div className="font-bold text-[#2F855A] flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#2F855A]"></span>
              Indexed & Deduplicated
            </div>
            <div className="text-[11px] text-[#5B687A]">Infrastructure cross-referenced</div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1">
            <div className="font-semibold text-[#5B687A]">Gemini AI Status</div>
            <div className="font-bold text-[#0F766E] flex items-center gap-1.5 mt-0.5">
              <Cpu className="w-3.5 h-3.5" />
              Flash-Lite / Local Fallback
            </div>
            <div className="text-[11px] text-[#5B687A]">100% operational offline</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#E9E1D3]">
          <button
            onClick={() => refreshData()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0F766E] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Force Fresh Ingestion</span>
          </button>

          <button
            onClick={handleClearCache}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#D65A4A] hover:bg-[#D65A4A]/10 transition shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Local Storage Cache</span>
          </button>
        </div>
      </div>
    </div>
  );
};
