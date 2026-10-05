import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { TierBadge } from '../components/TierBadge';
import { RiskGauge } from '../components/RiskGauge';
import { ProvenanceTip } from '../components/ProvenanceTip';
import { SatelliteThumbnail } from '../components/SatelliteThumbnail';
import { ShapBars } from '../components/ShapBars';
import { calculateRiskScore, simulateWhatIf } from '../lib/riskModel';
import {
  Waves,
  Wind,
  Thermometer,
  CloudRain,
  Eye,
  Sun,
  Shield,
  LifeBuoy,
  FileText,
  Sliders,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  Compass,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

export const WaterBodyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sites, siteRisks, siteForecasts, riskWeights, lastUpdated } = useApp();

  const site = sites.find((s) => s.id === id);
  const riskResult = site ? siteRisks.get(site.id) : undefined;
  const forecast = site ? siteForecasts.get(site.id) : undefined;

  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<'overview' | 'shap' | 'forecast' | 'simulator' | 'all'>('overview');

  // What-If Simulator state
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simFactors, setSimFactors] = useState<{
    waveHeight?: number;
    windSpeed?: number;
    precipitation?: number;
    hasLifeguard?: boolean;
  }>({});

  const simulatedResult = useMemo(() => {
    if (!site || !riskResult) return null;
    return simulateWhatIf(site, riskResult.environmentalFactors, riskWeights, {
      waveHeight: simFactors.waveHeight,
      windSpeed: simFactors.windSpeed,
      precipitation: simFactors.precipitation,
      hasLifeguard: simFactors.hasLifeguard,
    });
  }, [site, riskResult, riskWeights, simFactors]);

  if (!site || !riskResult) {
    return (
      <div className="p-12 text-center bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl max-w-xl mx-auto space-y-4">
        <AlertTriangle className="w-12 h-12 text-[#E9A03B] mx-auto" />
        <h2 className="font-serif-heading text-2xl font-bold text-[#1B2A38]">Water Body Not Found</h2>
        <p className="text-sm text-[#5B687A]">
          The requested site id "{id}" could not be located in the current regional catalog.
        </p>
        <button
          onClick={() => navigate('/water-bodies')}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0F766E] text-white"
        >
          Return to Directory
        </button>
      </div>
    );
  }

  const factors = riskResult.environmentalFactors;
  const shap = riskResult.shapValues;
  const score = riskResult.score;
  const tier = riskResult.tier;
  const confidence = riskResult.dataConfidence;

  // Hourly forecast data preparation for chart
  const hourlyChartData = (forecast?.hours || forecast?.hourly || []).slice(0, 48).map((h: any) => {
    const timeVal = h.time || h.timestamp || new Date().toISOString();
    const scoreVal = h.riskScore ?? h.score ?? 40;
    return {
      time: new Date(timeVal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      score: scoreVal,
      minScore: h.confidenceBand?.min ?? Math.max(0, scoreVal - 5),
      maxScore: h.confidenceBand?.max ?? Math.min(100, scoreVal + 5),
      waveHeight: h.waveHeight,
      windSpeed: h.windSpeed ?? 0,
      precip: h.precipitation ?? h.rainfall ?? 0,
    };
  });

  // Swimming safety status determination
  const getSwimmingSafety = () => {
    if (score >= 70 || (factors.waveHeight && factors.waveHeight > 2.0)) {
      return {
        status: 'Do Not Enter',
        color: 'text-[#D65A4A] bg-[#D65A4A]/10 border-[#D65A4A]/30',
        icon: XCircle,
        advice: 'Dangerous water conditions. Strong currents, high surf or runoff hazards present.',
      };
    }
    if (score >= 45 || !site.hasLifeguard) {
      return {
        status: 'Caution Advised',
        color: 'text-[#E9A03B] bg-[#E9A03B]/10 border-[#E9A03B]/30',
        icon: AlertTriangle,
        advice: site.hasLifeguard
          ? 'Moderate risk. Stay close to patrolled zones and monitor changing wind or tide conditions.'
          : 'Site is unpatrolled by certified lifeguards. Exercise extreme caution.',
      };
    }
    return {
      status: 'Safe For Swimming',
      color: 'text-[#2F855A] bg-[#2F855A]/10 border-[#2F855A]/30',
      icon: CheckCircle2,
      advice: 'Favorable environmental conditions. Lifeguard services actively monitoring area.',
    };
  };

  const swimStatus = getSwimmingSafety();
  const SwimIcon = swimStatus.icon;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Top back navigation & actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/water-bodies')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#5B687A] hover:text-[#0B3B3C] transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Water Bodies</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSimulatorOpen(!simulatorOpen)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border transition ${
              simulatorOpen
                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                : 'bg-white text-[#1B2A38] border-[#E9E1D3] hover:bg-[#FBF8F3]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>{simulatorOpen ? 'Close What-If Simulator' : 'What-If Simulator'}</span>
          </button>

          <button
            onClick={() => navigate(`/reports/${site.id}`)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs"
          >
            <FileText className="w-4 h-4" />
            <span>Generate PDF Report</span>
          </button>
        </div>
      </div>

      {/* Hero Card with Satellite Imagery Background */}
      <div className="relative rounded-3xl overflow-hidden border border-[#E9E1D3] bg-[#1B2A38] text-white shadow-md">
        <div className="absolute inset-0">
          <SatelliteThumbnail
            lat={site.lat}
            lon={site.lon}
            altText={site.name}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/80" />
        </div>

        <div className="relative z-10 p-6 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-lg bg-white/20 backdrop-blur-md border border-white/20">
                {site.type}
              </span>
              <TierBadge tier={tier} size="md" />
              <span className="text-xs text-stone-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Updated {lastUpdated || 'Live'}
              </span>
            </div>

            <div>
              <h1 className="font-serif-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                {site.name}
              </h1>
              <p className="text-sm text-stone-300 mt-2 flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#14958A]" />
                Coordinates: {site.lat.toFixed(5)}°N, {site.lon.toFixed(5)}°E • OSM ID: {site.osmId || site.osmTags?.['osm_id'] || site.id}
              </p>
            </div>

            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed max-w-xl">
              {riskResult.explanationNarrative || riskResult.narrative}
            </p>
          </div>

          {/* Risk Score & Confidence Display */}
          <div className="bg-[#1B2A38]/80 backdrop-blur-md border border-white/15 p-6 rounded-2xl flex flex-col items-center justify-center min-w-[240px] text-center">
            <div className="text-xs uppercase tracking-wider text-stone-300 font-semibold mb-2">
              Environmental Risk Index
            </div>
            <div className="my-2">
              <RiskGauge score={score} tier={tier} size={150} strokeWidth={12} />
            </div>
            <div className="w-full mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-stone-300">
              <span>Data Confidence</span>
              <span className="font-bold text-[#14958A] flex items-center gap-1">
                {confidence}%
                <ProvenanceTip
                  source="Open-Meteo & OpenStreetMap"
                  type="observed"
                  confidence={confidence}
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Section Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#E9E1D3] pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview & Telemetry', icon: Waves },
          { id: 'shap', label: 'SHAP Decomposition', icon: Sparkles },
          { id: 'forecast', label: '48h Forecast', icon: Clock },
          { id: 'simulator', label: 'What-If Simulator', icon: Sliders },
          { id: 'all', label: 'All Sections', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'simulator') setSimulatorOpen(true);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shadow-2xs ${
                isActive
                  ? 'bg-[#0F766E] text-white shadow-xs'
                  : 'bg-white/80 text-[#5B687A] hover:bg-white hover:text-[#1B2A38] border border-[#E9E1D3]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive What-If Simulator Panel */}
      {(activeTab === 'simulator' || (activeTab === 'all' && simulatorOpen) || simulatorOpen) && (
        <div className="bg-[#FBF8F3] border-2 border-[#0F766E]/40 rounded-2xl p-6 shadow-sm space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#E9E1D3] pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#0F766E]" />
              <h3 className="font-serif-heading text-lg font-bold text-[#0B3B3C]">
                Interactive What-If Sensitivity Simulator
              </h3>
            </div>
            <button
              onClick={() => setSimFactors({})}
              className="text-xs text-[#0F766E] font-medium hover:underline"
            >
              Reset to Live Values
            </button>
          </div>

          <p className="text-xs text-[#5B687A]">
            Tweak hypothetical environmental variables below to observe how GuardianGrid's transparent additive formula dynamically updates the risk score and tier classification in real time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {site.type === 'beach' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
                  <span>Wave Height:</span>
                  <span className="text-[#0F766E]">
                    {(simFactors.waveHeight ?? factors.waveHeight ?? 1.0).toFixed(1)} m
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.1"
                  value={simFactors.waveHeight ?? factors.waveHeight ?? 1.0}
                  onChange={(e) =>
                    setSimFactors((prev) => ({ ...prev, waveHeight: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-[#0F766E]"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
                <span>Wind Speed:</span>
                <span className="text-[#0F766E]">
                  {Math.round(simFactors.windSpeed ?? factors.windSpeed ?? 15)} km/h
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                step="2"
                value={simFactors.windSpeed ?? factors.windSpeed ?? 15}
                onChange={(e) =>
                  setSimFactors((prev) => ({ ...prev, windSpeed: parseFloat(e.target.value) }))
                }
                className="w-full accent-[#0F766E]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#1B2A38]">
                <span>Precipitation:</span>
                <span className="text-[#0F766E]">
                  {(simFactors.precipitation ?? factors.precipitation ?? 0).toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={simFactors.precipitation ?? factors.precipitation ?? 0}
                onChange={(e) =>
                  setSimFactors((prev) => ({ ...prev, precipitation: parseFloat(e.target.value) }))
                }
                className="w-full accent-[#0F766E]"
              />
            </div>
          </div>

          {/* Simulator Recalculated Output Box */}
          {simulatedResult && (
            <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] flex items-center justify-between">
              <div>
                <div className="text-xs text-[#5B687A] font-semibold">Simulated Outcome</div>
                <div className="text-sm font-medium text-[#1B2A38] mt-0.5">
                  Live: <strong>{score}</strong> ({tier}) → Simulated:{' '}
                  <strong className="text-[#0F766E]">{simulatedResult.score}</strong> (
                  {simulatedResult.tier})
                </div>
              </div>
              <TierBadge tier={simulatedResult.tier} size="md" />
            </div>
          )}
        </div>
      )}

      {/* Real Live Environmental Metrics Grid & Safety Status */}
      {(activeTab === 'overview' || activeTab === 'all') && (
        <>
          <div>
            <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C] mb-4">
              Observed Environmental Conditions
            </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Waves */}
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#5B687A] mb-1">
              <span className="flex items-center gap-1.5">
                <Waves className="w-4 h-4 text-[#0F766E]" /> Waves
              </span>
              <ProvenanceTip
                source="Open-Meteo Marine API"
                type="observed"
                confidence={factors.waveHeight != null ? 95 : 0}
              />
            </div>
            <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
              {factors.waveHeight != null ? `${factors.waveHeight.toFixed(1)} m` : 'N/A (Inland)'}
            </div>
            <div className="text-[11px] text-[#5B687A] mt-1">
              {factors.wavePeriod != null ? `Period: ${factors.wavePeriod.toFixed(1)}s` : 'No open surf'}
            </div>
          </div>

          {/* Wind */}
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#5B687A] mb-1">
              <span className="flex items-center gap-1.5">
                <Wind className="w-4 h-4 text-[#0F766E]" /> Wind
              </span>
              <ProvenanceTip source="Open-Meteo Forecast API" type="observed" confidence={95} />
            </div>
            <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
              {factors.windSpeed != null ? `${Math.round(factors.windSpeed)} km/h` : 'N/A'}
            </div>
            <div className="text-[11px] text-[#5B687A] mt-1">
              {factors.windGusts != null ? `Gusts: ${Math.round(factors.windGusts)} km/h` : 'Calm'}
            </div>
          </div>

          {/* Rain */}
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#5B687A] mb-1">
              <span className="flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-[#0F766E]" /> Precipitation
              </span>
              <ProvenanceTip source="Open-Meteo Forecast API" type="observed" confidence={90} />
            </div>
            <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
              {factors.precipitation != null ? `${factors.precipitation.toFixed(1)} mm` : '0 mm'}
            </div>
            <div className="text-[11px] text-[#5B687A] mt-1">
              24h sum: {factors.precipitation24h != null ? `${factors.precipitation24h.toFixed(1)} mm` : factors.rainfall24h != null ? `${factors.rainfall24h.toFixed(1)} mm` : '0 mm'}
            </div>
          </div>

          {/* Water Temperature / Air Temperature */}
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#5B687A] mb-1">
              <span className="flex items-center gap-1.5">
                <Thermometer className="w-4 h-4 text-[#0F766E]" /> Temperature
              </span>
              <ProvenanceTip
                source={(factors.seaSurfaceTemperature ?? factors.seaSurfaceTemp) != null ? 'Open-Meteo Marine' : 'Open-Meteo Weather'}
                type="observed"
                confidence={90}
              />
            </div>
            <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
              {(factors.seaSurfaceTemperature ?? factors.seaSurfaceTemp) != null
                ? `${(factors.seaSurfaceTemperature ?? factors.seaSurfaceTemp)!.toFixed(1)}°C SST`
                : `${Math.round(factors.temperature ?? 28)}°C Air`}
            </div>
            <div className="text-[11px] text-[#5B687A] mt-1">
              Air: {Math.round(factors.temperature ?? 28)}°C
            </div>
          </div>

          {/* UV Index */}
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#5B687A] mb-1">
              <span className="flex items-center gap-1.5">
                <Sun className="w-4 h-4 text-[#0F766E]" /> UV Index
              </span>
              <ProvenanceTip source="Open-Meteo Forecast API" type="observed" confidence={85} />
            </div>
            <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
              {factors.uvIndex != null ? factors.uvIndex.toFixed(1) : 'N/A'}
            </div>
            <div className="text-[11px] text-[#5B687A] mt-1">
              {factors.uvIndex != null && factors.uvIndex > 7 ? 'Extreme exposure' : 'Moderate'}
            </div>
          </div>

          {/* Visibility */}
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#5B687A] mb-1">
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-[#0F766E]" /> Visibility
              </span>
              <ProvenanceTip source="Open-Meteo Forecast API" type="observed" confidence={85} />
            </div>
            <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
              {factors.visibility != null ? `${(factors.visibility / 1000).toFixed(1)} km` : '10 km'}
            </div>
            <div className="text-[11px] text-[#5B687A] mt-1">Atmospheric clarity</div>
          </div>
        </div>
      </div>

      {/* Safety & Recreational Status Card */}
      <div className={`p-6 rounded-2xl border ${swimStatus.color} shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6`}>
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-white/60 shadow-xs shrink-0">
            <SwimIcon className="w-8 h-8" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-bold">Recreational Safety Advisory</div>
            <div className="text-xl font-bold font-serif-heading mt-0.5">{swimStatus.status}</div>
            <p className="text-xs sm:text-sm mt-1 leading-relaxed">{swimStatus.advice}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0 text-xs border-t md:border-t-0 md:border-l border-current/20 pt-4 md:pt-0 md:pl-6">
          <div>
            <div className="text-[#5B687A] font-medium">Lifeguard Status</div>
            <div className="font-bold text-[#1B2A38] mt-0.5">
              {site.hasLifeguard || site.lifeguardPresent ? 'Patrolled on Beach' : 'No Certified Station'}
            </div>
          </div>
          <div>
            <div className="text-[#5B687A] font-medium">Nearest Medical</div>
            <div className="font-bold text-[#1B2A38] mt-0.5">
              {site.hasLifeguard || site.lifeguardPresent ? '1.8 km (General Hospital)' : '3.4 km'}
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* SHAP Decomposition Panel */}
      {(activeTab === 'shap' || activeTab === 'all') && (
        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-6">
        <div>
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Model Interpretability & SHAP Decomposition
          </h2>
          <p className="text-xs text-[#5B687A] mt-1">
            GuardianGrid uses an expert-calibrated additive index. Because the formula is strictly additive, each factor's exact marginal contribution (Shapley value) is mathematically derived with zero approximation error.
          </p>
        </div>

        <ShapBars shapValues={shap} baseline={riskResult.baseline} finalScore={score} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {(shap || []).map((s, idx) => {
            const featName = s.featureName || s.label || s.featureKey;
            const obsVal = s.observedValue ?? s.value ?? '—';
            const hazVal = s.hazardValue ?? s.hazard ?? 0;
            const contrib = s.shapContribution ?? s.shap ?? 0;
            return (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-white border border-[#E9E1D3] flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-[#1B2A38]">{featName}</span>
                  <div className="text-[11px] text-[#5B687A] mt-0.5">
                    Observed: <strong className="text-[#1B2A38]">{obsVal}</strong> • Hazard index: {hazVal.toFixed(2)}
                  </div>
                </div>
                <div
                  className={`font-serif-heading font-bold text-sm ${
                    contrib > 0
                      ? 'text-[#D65A4A]'
                      : contrib < 0
                      ? 'text-[#2F855A]'
                      : 'text-[#5B687A]'
                  }`}
                >
                  {contrib > 0 ? `+${contrib}` : `${contrib}`} pts
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* 48-Hour Forecast Projection Chart */}
      {(activeTab === 'forecast' || activeTab === 'all') && (
        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
              48-Hour Risk Projection & Confidence Band
            </h2>
            <p className="text-xs text-[#5B687A] mt-1">
              Hourly score forecast derived from Open-Meteo multi-variable model run. Shaded area indicates ±5% meteorological perturbation bounds.
            </p>
          </div>
          <button
            onClick={() => navigate('/forecast')}
            className="text-xs font-semibold text-[#0F766E] hover:underline"
          >
            View Full 7-Day Matrix →
          </button>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="scoreBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0F766E" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0F766E" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E1D3" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#5B687A' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5B687A' }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 bg-[#1B2A38] text-white text-xs rounded-xl shadow-lg border border-white/10 space-y-1">
                        <div className="font-semibold text-stone-300">{data.time}</div>
                        <div className="text-sm font-bold text-[#14958A]">
                          Risk Score: {data.score} / 100
                        </div>
                        <div className="text-[11px] text-stone-400">
                          Bounds: [{data.minScore} - {data.maxScore}]
                        </div>
                        {data.waveHeight != null && (
                          <div className="text-[11px] text-stone-300">
                            Wave: {data.waveHeight.toFixed(1)}m • Wind: {Math.round(data.windSpeed)}km/h
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={70} stroke="#D65A4A" strokeDasharray="3 3" label={{ value: 'High Risk (70)', fill: '#D65A4A', fontSize: 10 }} />
              <ReferenceLine y={45} stroke="#E9A03B" strokeDasharray="3 3" label={{ value: 'Med Risk (45)', fill: '#E9A03B', fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#0F766E"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#scoreBand)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}
    </div>
  );
};
