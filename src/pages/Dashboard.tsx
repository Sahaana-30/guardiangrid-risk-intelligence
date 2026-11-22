import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Waves,
  AlertTriangle,
  ShieldAlert,
  Users,
  Stethoscope,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Filter,
  Wind,
  CloudRain,
  Compass,
  Clock,
  MapPin,
  Siren,
  Activity,
  X,
  Building2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { TierBadge } from '../components/TierBadge';
import { MapComponent } from '../components/MapComponent';
import { DataTrustBadge, formatReadingAge } from '../components/ProvenanceTip';
import { RescuePerformanceSection } from '../components/emergency/RescuePerformanceSection';
import {
  fetchDashboardOverview,
  type DashboardOverviewResponse,
} from '../services/dashboardApi';
import { getEsriSatelliteThumbnail } from '../config';
import type { EmergencyCategory } from '../types/emergency';
import type { RiskTier } from '../types';

type RiskCategoryFilter = 'ALL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

/**
 * Explicit, consistent mapping from existing RiskModel tiers (`Low | Medium | High | Severe`)
 * to displayed coastal hazard categories (`LOW | MODERATE | HIGH | CRITICAL`).
 * Uses existing `calculateRiskScore` output without duplicating any risk formula.
 */
export function mapRiskTierToCategory(tier?: RiskTier): 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
  if (tier === 'Severe') return 'CRITICAL';
  if (tier === 'High') return 'HIGH';
  if (tier === 'Medium') return 'MODERATE';
  return 'LOW';
}

function describeWmoWeatherCode(code?: number): string {
  if (code === undefined || code === null) return 'Unavailable';
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog / mist';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Precipitation';
  if (code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return `WMO ${code}`;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    currentCity,
    sites,
    siteRisks,
    siteForecasts,
    isLoading: envLoading,
    loadError: envError,
    lastUpdated: envLastUpdated,
    refreshData: refreshEnvData,
  } = useApp();
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();

  // Consistent page-level filters (initialized from URL query params if returning from drill-down)
  const [range, setRange] = useState<'24h' | '7d' | '30d' | 'custom'>(() => {
    const r = searchParams.get('range');
    return r === '24h' || r === '7d' || r === '30d' || r === 'custom' ? r : '30d';
  });
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const f = searchParams.get('from');
    if (f) return f;
    const d = new Date(Date.now() - 14 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState<string>(
    () => searchParams.get('to') || new Date().toISOString().slice(0, 10)
  );
  const [regionFilter, setRegionFilter] = useState<string>(
    () => searchParams.get('region') || 'all'
  );
  const [beachFilter, setBeachFilter] = useState<string>(
    () => searchParams.get('beach') || 'all'
  );
  const [cellFilter, setCellFilter] = useState<string>(
    () => searchParams.get('cell') || 'all'
  );
  const [categoryFilter, setCategoryFilter] = useState<EmergencyCategory | 'all'>(() => {
    const c = searchParams.get('category');
    return c === 'drowning' || c === 'swept_away' || c === 'missing_person' || c === 'medical'
      ? c
      : 'all';
  });
  const [riskFilter, setRiskFilter] = useState<RiskCategoryFilter>(() => {
    const rf = (searchParams.get('risk') || '').toUpperCase();
    return rf === 'LOW' || rf === 'MODERATE' || rf === 'HIGH' || rf === 'CRITICAL' ? rf : 'ALL';
  });

  // Sync active filters to URL so drill-down "Return to Previous View" restores exact filter context
  useEffect(() => {
    const params = new URLSearchParams();
    if (range !== '30d') params.set('range', range);
    if (range === 'custom') {
      params.set('from', customFrom);
      params.set('to', customTo);
    }
    if (regionFilter !== 'all') params.set('region', regionFilter);
    if (beachFilter !== 'all') params.set('beach', beachFilter);
    if (cellFilter !== 'all') params.set('cell', cellFilter);
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (riskFilter !== 'ALL') params.set('risk', riskFilter);
    setSearchParams(params, { replace: true });
  }, [range, customFrom, customTo, regionFilter, beachFilter, cellFilter, categoryFilter, riskFilter, setSearchParams]);

  const dashboardReturnUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (range !== '30d') params.set('range', range);
    if (range === 'custom') {
      params.set('from', customFrom);
      params.set('to', customTo);
    }
    if (regionFilter !== 'all') params.set('region', regionFilter);
    if (beachFilter !== 'all') params.set('beach', beachFilter);
    if (cellFilter !== 'all') params.set('cell', cellFilter);
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (riskFilter !== 'ALL') params.set('risk', riskFilter);
    const qs = params.toString();
    return encodeURIComponent(qs ? `/dashboard?${qs}` : '/dashboard');
  }, [range, customFrom, customTo, regionFilter, beachFilter, cellFilter, categoryFilter, riskFilter]);

  // Backend Emergency Operations aggregation state
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [opsLoading, setOpsLoading] = useState<boolean>(true);
  const [opsError, setOpsError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOpsLoading(true);
    try {
      const data = await fetchDashboardOverview({
        range,
        from: range === 'custom' ? new Date(customFrom).toISOString() : undefined,
        to:
          range === 'custom'
            ? new Date(`${customTo}T23:59:59.999Z`).toISOString()
            : undefined,
        regionId: regionFilter,
        beach: beachFilter,
        cellId: cellFilter,
        category: categoryFilter,
        includeSimulated: false, // Never sum simulated incidents into real totals
      });
      setOverview(data);
      setOpsError(null);
    } catch (err: any) {
      setOpsError(err?.message || 'Unable to load Emergency Operations metrics.');
    } finally {
      setOpsLoading(false);
    }
  }, [range, customFrom, customTo, regionFilter, beachFilter, cellFilter, categoryFilter]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, activeWorkspace.organizationId]);

  // Clear previous tenant data immediately on workspace switch
  useEffect(() => {
    const onTenantChanged = () => {
      setOverview(null);
      setRegionFilter('all');
      setBeachFilter('all');
      setCellFilter('all');
      void loadOverview();
    };
    window.addEventListener('gg-tenant-changed', onTenantChanged);
    return () => window.removeEventListener('gg-tenant-changed', onTenantChanged);
  }, [loadOverview]);

  // Filter sites consistently using beach & risk category filters
  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      if (beachFilter !== 'all' && site.name.toLowerCase() !== beachFilter.toLowerCase()) {
        return false;
      }
      if (riskFilter !== 'ALL') {
        const risk = siteRisks.get(site.id);
        const cat = mapRiskTierToCategory(risk?.tier);
        if (cat !== riskFilter) return false;
      }
      return true;
    });
  }, [sites, siteRisks, beachFilter, riskFilter]);

  const sortedSites = useMemo(() => {
    return [...filteredSites].sort((a, b) => {
      const sA = siteRisks.get(a.id)?.score ?? -1;
      const sB = siteRisks.get(b.id)?.score ?? -1;
      return sB - sA;
    });
  }, [filteredSites, siteRisks]);

  const riskDistribution = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 };
    filteredSites.forEach((s) => {
      const cat = mapRiskTierToCategory(siteRisks.get(s.id)?.tier);
      counts[cat] += 1;
    });
    return [
      { category: 'CRITICAL', count: counts.CRITICAL, fill: '#991B1B' },
      { category: 'HIGH', count: counts.HIGH, fill: '#D65A4A' },
      { category: 'MODERATE', count: counts.MODERATE, fill: '#E9A03B' },
      { category: 'LOW', count: counts.LOW, fill: '#2F855A' },
    ];
  }, [filteredSites, siteRisks]);

  const attentionBeaches = useMemo(() => {
    return sortedSites.filter((s) => {
      const cat = mapRiskTierToCategory(siteRisks.get(s.id)?.tier);
      return cat === 'CRITICAL' || cat === 'HIGH';
    });
  }, [sortedSites, siteRisks]);

  // Unique beach names across both Open-Meteo sites and Rescue Cells
  const beachOptions = useMemo(() => {
    const set = new Set<string>();
    sites.forEach((s) => set.add(s.name));
    (overview?.cells || []).forEach((c) => {
      if (c.siteName) set.add(c.siteName);
    });
    return Array.from(set).sort();
  }, [sites, overview?.cells]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ label: string; onClear?: () => void }> = [
      { label: `Workspace: ${activeWorkspace.name}` },
      {
        label:
          range === 'custom'
            ? `Range: ${customFrom} → ${customTo}`
            : `Range: Last ${range.toUpperCase()}`,
      },
    ];
    if (regionFilter !== 'all') {
      const regName = overview?.regions.find((r) => r.id === regionFilter)?.name || regionFilter;
      chips.push({ label: `Region: ${regName}`, onClear: () => setRegionFilter('all') });
    }
    if (beachFilter !== 'all') {
      chips.push({ label: `Beach: ${beachFilter}`, onClear: () => setBeachFilter('all') });
    }
    if (cellFilter !== 'all') {
      chips.push({ label: `Cell: ${cellFilter}`, onClear: () => setCellFilter('all') });
    }
    if (categoryFilter !== 'all') {
      chips.push({
        label: `Type: ${categoryFilter.replace('_', ' ')}`,
        onClear: () => setCategoryFilter('all'),
      });
    }
    if (riskFilter !== 'ALL') {
      chips.push({ label: `Risk: ${riskFilter}`, onClear: () => setRiskFilter('ALL') });
    }
    return chips;
  }, [
    activeWorkspace.name,
    range,
    customFrom,
    customTo,
    regionFilter,
    overview?.regions,
    beachFilter,
    cellFilter,
    categoryFilter,
    riskFilter,
  ]);

  const resetAllFilters = () => {
    setRange('30d');
    setRegionFilter('all');
    setBeachFilter('all');
    setCellFilter('all');
    setCategoryFilter('all');
    setRiskFilter('ALL');
  };

  const mapCenter: [number, number] = [currentCity.lat, currentCity.lon];
  const bannerImg = getEsriSatelliteThumbnail(currentCity.lat, currentCity.lon, 0.04);

  const kpis = overview?.kpis;
  const drowningStats = overview?.drowningStats;

  const criticalBeachesCount = useMemo(
    () =>
      filteredSites.filter(
        (site) => mapRiskTierToCategory(siteRisks.get(site.id)?.tier) === 'CRITICAL'
      ).length,
    [filteredSites, siteRisks]
  );

  const coastalRiskSummary = useMemo(() => {
    const rank: Record<'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL', number> = {
      LOW: 1,
      MODERATE: 2,
      HIGH: 3,
      CRITICAL: 4,
    };
    let highestCat: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
    let highestScore = 0;
    let highestSiteName = '';
    for (const site of filteredSites) {
      const r = siteRisks.get(site.id);
      if (!r) continue;
      const cat = mapRiskTierToCategory(r.tier);
      if (rank[cat] > rank[highestCat] || (rank[cat] === rank[highestCat] && r.score > highestScore)) {
        highestCat = cat;
        highestScore = r.score;
        highestSiteName = site.name;
      }
    }
    return { category: highestCat, score: highestScore, siteName: highestSiteName };
  }, [filteredSites, siteRisks]);

  const primaryCoastalSite = useMemo(() => {
    return sortedSites.find((s) => s.isCoastal) || sortedSites[0] || null;
  }, [sortedSites]);
  const primaryCoastalRisk = primaryCoastalSite ? siteRisks.get(primaryCoastalSite.id) : undefined;
  const primaryCoastalEnv = primaryCoastalRisk?.environmentalFactors;
  const primaryCoastalAge = formatReadingAge(primaryCoastalEnv?.timestamp);

  return (
    <div className="space-y-6">
      {/* Unified Header & Active Workspace Indicator */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#1B2A38]">
              Coastal Safety &amp; Operations Overview
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0F766E]/10 text-[#0B3B3C] border border-[#0F766E]/20 text-[11px] font-semibold">
              <Building2 className="w-3.5 h-3.5 text-[#0F766E]" />
              {activeWorkspace.name}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#5B687A] mt-1">
            Unified Emergency Operations Intelligence and Coastal Environmental Risk Intelligence for{' '}
            <span className="font-semibold text-[#1B2A38]">{currentCity.name}</span>. Every value carries an explicit provenance classification.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              void loadOverview();
              void refreshEnvData();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${opsLoading || envLoading ? 'animate-spin text-[#0F766E]' : ''}`} />
            <span>Refresh All</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(`/map?returnTo=${dashboardReturnUrl}`)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#0F766E]/30 bg-white text-xs font-semibold text-[#0B3B3C] hover:border-[#0F766E] cursor-pointer transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Open Risk Map</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/command')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B5D56] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Open Live Operations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Consistent Global Filter Bar */}
      <div className="glass-card rounded-2xl p-4 border border-[#E9E1D3] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1B2A38]">
            <Filter className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Operational &amp; Coastal Filters</span>
          </div>
          {activeFilterChips.length > 2 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {/* Organization / Workspace */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Workspace
            </label>
            <select
              value={activeWorkspace.id}
              onChange={(e) => switchWorkspace(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Time Window
            </label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Region */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Region
            </label>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              <option value="all">All Regions</option>
              {(overview?.regions || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Beach */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Beach / Water Body
            </label>
            <select
              value={beachFilter}
              onChange={(e) => setBeachFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              <option value="all">All Locations</option>
              {beachOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Rescue Cell */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Rescue Cell
            </label>
            <select
              value={cellFilter}
              onChange={(e) => setCellFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              <option value="all">All Rescue Cells</option>
              {(overview?.cells || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.siteName}
                </option>
              ))}
            </select>
          </div>

          {/* Incident Type */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Incident Type
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              <option value="all">All Types</option>
              <option value="drowning">Drowning</option>
              <option value="swept_away">Swept Away</option>
              <option value="missing_person">Missing Person</option>
              <option value="medical">Medical</option>
            </select>
          </div>

          {/* Risk Category */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-[#5B687A] mb-1">
              Risk Category
            </label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskCategoryFilter)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] cursor-pointer focus:outline-none focus:border-[#0F766E]"
            >
              <option value="ALL">All Categories</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MODERATE">MODERATE</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-[#E9E1D3]/60 text-xs">
            <label className="flex items-center gap-1.5 text-[#5B687A]">
              <span>From:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#E9E1D3] text-[#1B2A38]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[#5B687A]">
              <span>To:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#E9E1D3] text-[#1B2A38]"
              />
            </label>
          </div>
        )}

        {/* Visible Active Filter State */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {activeFilterChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F6F1E7] border border-[#E9E1D3] text-[11px] font-medium text-[#1B2A38]"
            >
              <span>{chip.label}</span>
              {chip.onClear && (
                <button
                  type="button"
                  onClick={chip.onClear}
                  aria-label={`Remove ${chip.label}`}
                  className="text-[#5B687A] hover:text-[#D65A4A] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* SECTION 4A: 8 PRIMARY OVERVIEW KPIs (OPERATIONS + COASTAL RISK) */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
              Primary Operations &amp; Coastal KPIs
            </h3>
            <p className="text-xs text-[#5B687A]">
              8 decision-ready metrics combining emergency operations and coastal conditions. Click any card to drill down with filters applied.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {kpis && kpis.simulatedExcludedCount > 0 && (
              <DataTrustBadge
                classification="simulated_demo"
                source="Emergency Drill Isolation"
                note={`${kpis.simulatedExcludedCount} simulated demonstration incident(s) are strictly excluded from real operational totals.`}
              />
            )}
            {overview?.alertLogsSummary?.simulatorMode && (
              <DataTrustBadge
                classification="simulated_demo"
                source="Official Alert Simulator (ENABLE_ALERT_SIMULATOR=true)"
                note={`${overview.alertLogsSummary.simulatedCount} simulated SMS/WhatsApp dispatch log(s); ${overview.alertLogsSummary.sentCount} real Twilio deliveries.`}
              />
            )}
          </div>
        </div>

        {opsError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Emergency operations metrics unavailable: {opsError}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="px-3 py-1 rounded-lg bg-white border border-rose-200 text-rose-800 font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : opsLoading && !overview ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="glass-card rounded-2xl p-4 border border-[#E9E1D3] h-32 animate-pulse bg-[#FBF8F3]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Active Incidents',
                value: String(kpis?.pointInTime.activeIncidents ?? 0),
                sublabel: 'Point-in-time · non-resolved real SOS',
                definition:
                  'Count of real (non-simulated) emergency incidents currently in active workflow states (UNVERIFIED through MEDICAL_HANDOFF) in the selected workspace.',
                trust: 'live_measured' as const,
                source: `${overview?.storage?.mechanism || 'Operational Store'} (${activeWorkspace.name})`,
                timestamp: overview?.generatedAt,
                icon: ShieldAlert,
                accent: 'text-[#D65A4A]',
                onClick: () =>
                  navigate(`/map?layer=incident&focus=incidents&returnTo=${dashboardReturnUrl}`),
              },
              {
                label: 'Drowning Incidents',
                value: String(kpis?.windowed.totalDrowningIncidents ?? 0),
                sublabel: `Windowed (${range.toUpperCase()}) · drowning & swept away`,
                definition:
                  'Total real incidents categorized as drowning or swept_away within the active time window and workspace filters.',
                trust: 'historical_recorded' as const,
                source: `${overview?.storage?.mechanism || 'Operational Store'} (${activeWorkspace.name})`,
                timestamp: overview?.generatedAt,
                icon: Waves,
                accent: 'text-[#D65A4A]',
                onClick: () => navigate('/incidents?category=drowning'),
              },
              {
                label: 'Critical Beaches',
                value: String(criticalBeachesCount),
                sublabel: `of ${filteredSites.length} monitored site(s) at CRITICAL`,
                definition:
                  'Count of monitored coastal sites currently classified as CRITICAL (Severe tier) by GuardianGrid RiskModel from Open-Meteo marine & weather feeds.',
                trust: 'derived_analytical' as const,
                source: 'GuardianGrid RiskModel (Open-Meteo feeds)',
                timestamp: primaryCoastalEnv?.timestamp,
                icon: AlertTriangle,
                accent: 'text-rose-700',
                onClick: () => navigate(`/map?risk=CRITICAL&returnTo=${dashboardReturnUrl}`),
              },
              {
                label: 'Responders On Duty',
                value: String(kpis?.pointInTime.respondersOnDuty ?? 0),
                sublabel: 'Point-in-time · active duty roster',
                definition:
                  'Count of responders in the active workspace whose current status is on duty (available, dispatched, or on scene; excludes off-duty personnel).',
                trust: 'live_measured' as const,
                source: `Responder Roster (${activeWorkspace.name})`,
                timestamp: overview?.generatedAt,
                icon: Users,
                accent: 'text-[#0F766E]',
                onClick: () => navigate('/responders?status=on_duty'),
              },
              {
                label: 'Unacknowledged SOS',
                value: String(kpis?.pointInTime.unacknowledgedSosAlerts ?? 0),
                sublabel: 'Point-in-time · awaiting verification',
                definition:
                  'Count of real SOS alerts currently in UNVERIFIED state awaiting human dispatcher verification and assignment.',
                trust: 'live_measured' as const,
                source: `SOS Dispatch Queue (${activeWorkspace.name})`,
                timestamp: overview?.generatedAt,
                icon: Siren,
                accent: 'text-[#D65A4A]',
                onClick: () => navigate('/command?filter=UNVERIFIED'),
              },
              {
                label: 'Coastal Risk Level',
                value: coastalRiskSummary.category,
                sublabel: coastalRiskSummary.siteName
                  ? `Peak ${coastalRiskSummary.score}/100 · ${coastalRiskSummary.siteName}`
                  : 'Highest tier across filtered sites',
                definition:
                  'Highest coastal hazard category (CRITICAL > HIGH > MODERATE > LOW) across active filtered sites, derived from existing GuardianGrid RiskModel scores.',
                trust: 'derived_analytical' as const,
                source: 'GuardianGrid RiskModel (Max-tier aggregation)',
                timestamp: primaryCoastalEnv?.timestamp,
                icon: Compass,
                accent:
                  coastalRiskSummary.category === 'CRITICAL'
                    ? 'text-[#D65A4A]'
                    : coastalRiskSummary.category === 'HIGH'
                    ? 'text-amber-700'
                    : 'text-[#0F766E]',
                onClick: () =>
                  navigate(
                    `/map?risk=${coastalRiskSummary.category}&returnTo=${dashboardReturnUrl}`
                  ),
              },
              {
                label: 'Water Conditions',
                value:
                  primaryCoastalEnv?.waveHeight !== undefined
                    ? `${primaryCoastalEnv.waveHeight.toFixed(1)}m · ${Math.round(primaryCoastalEnv.windSpeed ?? 0)}km/h`
                    : 'Data unavailable',
                sublabel: primaryCoastalSite
                  ? `${primaryCoastalSite.name} · ${describeWmoWeatherCode(primaryCoastalEnv?.weatherCode)} · Tide gauge: unavailable`
                  : 'Open-Meteo marine & weather · Tide gauge unavailable',
                definition:
                  'Wave height, wind speed, and WMO weather from Open-Meteo Marine & Weather forecast/reanalysis. In-situ coastal water level (tide gauge) is unavailable and never substituted.',
                trust:
                  primaryCoastalEnv?.isLive === false
                    ? ('unavailable' as const)
                    : ('forecast' as const),
                source: 'Open-Meteo Marine & Weather API (Tide gauge unavailable)',
                timestamp: primaryCoastalEnv?.timestamp,
                icon: Wind,
                accent: 'text-sky-700',
                onClick: () =>
                  navigate(
                    `/map?layer=environmental${primaryCoastalSite ? `&siteId=${primaryCoastalSite.id}` : ''}&returnTo=${dashboardReturnUrl}`
                  ),
              },
              {
                label: 'Resolved Incidents',
                value: String(kpis?.windowed.incidentsResolved ?? 0),
                sublabel: `Windowed (${range.toUpperCase()}) · closed rescues`,
                definition:
                  'Count of real operational incidents that reached RESOLVED state within the active time window.',
                trust: 'historical_recorded' as const,
                source: `${overview?.storage?.mechanism || 'Operational Store'} (${activeWorkspace.name})`,
                timestamp: overview?.generatedAt,
                icon: CheckCircle2,
                accent: 'text-emerald-700',
                onClick: () => navigate('/incidents?state=RESOLVED'),
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  role="button"
                  tabIndex={0}
                  title={card.definition}
                  onClick={card.onClick}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      card.onClick();
                    }
                  }}
                  className="text-left glass-card rounded-2xl p-4 border border-[#E9E1D3] hover:border-[#0F766E]/50 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between gap-2 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40"
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <span className="text-[11px] font-semibold text-[#5B687A] leading-snug">
                      {card.label}
                    </span>
                    <Icon className={`w-4 h-4 shrink-0 ${card.accent}`} />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-[#1B2A38] leading-tight break-words">
                    {card.value}
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="text-[10px] text-[#5B687A] font-medium leading-snug line-clamp-2 break-words">
                      {card.sublabel}
                    </div>
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-[10px] text-[#5B687A]">
                        {card.timestamp ? formatReadingAge(card.timestamp).ageLabel : 'Live'}
                      </span>
                      <DataTrustBadge
                        classification={card.trust}
                        compact
                        source={card.source}
                        timestamp={card.timestamp}
                        note={card.definition}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 4B: SECONDARY OPERATIONAL READINESS & WAVE/WEATHER STRIP */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-serif-heading text-base font-bold text-[#1B2A38]">
              Secondary Operational Readiness &amp; Coastal Conditions
            </h3>
            <p className="text-[11px] text-[#5B687A]">
              Supporting responder deployment, alert dispatch status, medical handoffs, and site-level marine telemetry.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#5B687A]">
            <Clock className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Last telemetry sync: {envLastUpdated || 'Syncing...'}</span>
          </div>
        </div>

        {/* Compact 4-Card Secondary Operational Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/responders?status=assigned')}
            className="text-left rounded-xl p-3 bg-[#FBF8F3] border border-[#E9E1D3] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-[#5B687A] font-medium">
              <span>Responder Availability</span>
              <Activity className="w-3.5 h-3.5 text-sky-700" />
            </div>
            <div className="text-sm font-bold text-[#1B2A38] mt-1">
              {kpis?.pointInTime.respondersAssigned ?? 0} Assigned · {kpis?.pointInTime.respondersEnRoute ?? 0} En Route
            </div>
            <div className="text-[10px] text-[#5B687A] mt-0.5">Point-in-time dispatch status</div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/command')}
            className="text-left rounded-xl p-3 bg-[#FBF8F3] border border-[#E9E1D3] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-[#5B687A] font-medium">
              <span>Emergency Notifications</span>
              {overview?.alertLogsSummary?.simulatorMode && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                  SIMULATED
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-[#1B2A38] mt-1">
              {overview?.alertLogsSummary?.simulatorMode
                ? `${overview.alertLogsSummary.simulatedCount} Simulated`
                : `${overview?.alertLogsSummary?.sentCount ?? 0} Sent`}
            </div>
            <div className="text-[10px] text-[#5B687A] mt-0.5">
              {overview?.alertLogsSummary?.simulatorMode
                ? 'Alert simulator active (no live SMS)'
                : 'Live SMS / WhatsApp dispatch log'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/medical-handoff')}
            className="text-left rounded-xl p-3 bg-[#FBF8F3] border border-[#E9E1D3] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-[#5B687A] font-medium">
              <span>Medical Handoff Status</span>
              <Stethoscope className="w-3.5 h-3.5 text-[#0F766E]" />
            </div>
            <div className="text-sm font-bold text-[#1B2A38] mt-1">
              {kpis?.pointInTime.pendingMedicalHandoffs ?? 0} Pending Handoff(s)
            </div>
            <div className="text-[10px] text-[#5B687A] mt-0.5">EMS &amp; hospital transfer queue</div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/incidents')}
            className="text-left rounded-xl p-3 bg-[#FBF8F3] border border-[#E9E1D3] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-[#5B687A] font-medium">
              <span>Rescue-Cell Activity</span>
              <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
            </div>
            <div className="text-sm font-bold text-[#1B2A38] mt-1">
              {drowningStats?.frequentlyAffectedCells.length ?? 0} Active Cell(s)
            </div>
            <div className="text-[10px] text-[#5B687A] mt-0.5">
              {kpis?.windowed.totalIncidentsReported ?? 0} total reported ({range.toUpperCase()})
            </div>
          </button>
        </div>

        {/* Compact Coastal Water-Level & Tide Gauge Honesty Notice */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#1B2A38]">
            <span className="font-bold">Coastal Water Level (In-Situ Tide Gauge): Data unavailable.</span>
            <DataTrustBadge
              classification="unavailable"
              compact
              source="No Tide-Gauge Sensor Feed Connected"
              note="Requires an in-situ coastal tide-gauge feed (e.g. INCOIS Tide Gauge Network or Port Authority sensors). Wave height and Open-Meteo sea_level_height_msl are never substituted as measured water level."
            />
            <span className="text-[#5B687A]">
              Wave height, wind, and modelled sea-surface height (MSL) below are Open-Meteo Forecast/Reanalysis.
            </span>
          </div>
          <span className="text-[10px] text-[#5B687A] shrink-0">
            Primary obs: {primaryCoastalAge.formattedTime} ({primaryCoastalAge.ageLabel})
          </span>
        </div>

        {envError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Environmental telemetry notice: {envError}
          </div>
        )}

        {/* Compact Wave & Weather Conditions Grid (Top 3 Coastal Sites) */}
        {sortedSites.length === 0 ? (
          <div className="glass-card rounded-xl p-4 text-center text-xs text-[#5B687A] border border-[#E9E1D3]">
            No beaches or water bodies match the active beach/risk filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {sortedSites.slice(0, 3).map((site) => {
              const risk = siteRisks.get(site.id);
              const f = risk?.environmentalFactors;
              const age = formatReadingAge(f?.timestamp);
              const hazardCat = mapRiskTierToCategory(risk?.tier);
              const isFallback = f?.isLive === false;

              return (
                <div
                  key={site.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    navigate(
                      `/map?layer=environmental&siteId=${site.id}&returnTo=${dashboardReturnUrl}`
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      navigate(
                        `/map?layer=environmental&siteId=${site.id}&returnTo=${dashboardReturnUrl}`
                      );
                    }
                  }}
                  className="text-left rounded-xl p-3 bg-[#FBF8F3] border border-[#E9E1D3] hover:border-[#0F766E]/40 cursor-pointer transition-all space-y-2 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40"
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <h4 className="font-semibold text-xs text-[#1B2A38] leading-snug line-clamp-2 break-words">
                        {site.name}
                      </h4>
                      <div className="text-[10px] text-[#5B687A] leading-snug break-words">
                        {site.region} · {site.isCoastal ? 'Coastal' : 'Inland'} · {hazardCat} ({risk?.score ?? '--'})
                      </div>
                    </div>
                    <div className="shrink-0">
                      <TierBadge tier={risk?.tier ?? 'Medium'} size="sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="px-2 py-1.5 rounded-lg bg-white border border-[#E9E1D3]/70">
                      <div className="text-[9px] text-[#5B687A]">Wave</div>
                      <div className="font-bold text-[#1B2A38]">
                        {site.isCoastal && f?.waveHeight !== undefined
                          ? `${f.waveHeight.toFixed(2)}m`
                          : 'N/A'}
                      </div>
                    </div>
                    <div className="px-2 py-1.5 rounded-lg bg-white border border-[#E9E1D3]/70">
                      <div className="text-[9px] text-[#5B687A]">Wind</div>
                      <div className="font-bold text-[#1B2A38]">
                        {f?.windSpeed !== undefined ? `${Math.round(f.windSpeed)} km/h` : 'N/A'}
                      </div>
                    </div>
                    <div className="px-2 py-1.5 rounded-lg bg-white border border-[#E9E1D3]/70">
                      <div className="text-[9px] text-[#5B687A]">MSL Model</div>
                      <div className="font-bold text-[#1B2A38]">
                        {site.isCoastal && f?.seaLevelMsl !== undefined
                          ? `${f.seaLevelMsl >= 0 ? '+' : ''}${f.seaLevelMsl.toFixed(2)}m`
                          : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#5B687A]">
                    <span className="truncate">
                      {describeWmoWeatherCode(f?.weatherCode)} · {age.ageLabel}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <DataTrustBadge
                        classification={isFallback ? 'unavailable' : 'forecast'}
                        compact
                        showStaleIndicator
                        source="Open-Meteo Marine & Weather"
                        timestamp={f?.timestamp}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/water-bodies/${site.id}`);
                        }}
                        className="text-[10px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
                      >
                        SHAP →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 4B.5: COMPACT RESCUE PERFORMANCE ANALYTICS (PERSISTED TIMESTAMPS ONLY) */}
      <RescuePerformanceSection
        overview={overview}
        compact
        filters={{
          range,
          from: range === 'custom' ? customFrom : undefined,
          to: range === 'custom' ? customTo : undefined,
          regionId: regionFilter,
          beach: beachFilter,
          cellId: cellFilter,
          category: categoryFilter,
        }}
      />

      {/* SECTION 4C & 4E: DROWNING STATISTICS, TRENDS & BEACH-WISE COMPARISON */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Daily Drowning & Incident Trend */}
        <div className="lg:col-span-7 glass-card rounded-2xl p-5 border border-[#E9E1D3] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                  Drowning &amp; Incident Trends
                </h3>
                <DataTrustBadge
                  classification="historical_recorded"
                  compact
                  source={`GuardianGrid Incidents (${activeWorkspace.name})`}
                  timestamp={overview?.generatedAt}
                />
              </div>
              <p className="text-xs text-[#5B687A]">
                Daily recorded incidents, drowning alerts, and resolutions ({range.toUpperCase()} window, real incidents only).
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-[#1B2A38]">
                {kpis?.windowed.drowningFrequencyPerDay ?? 0} drowning/day
              </div>
              <DataTrustBadge
                classification="unavailable"
                compact
                source="Exposure-Adjusted Rate"
                note={
                  drowningStats?.exposureAdjustedRate.reason ||
                  'No verified beach visitor-count denominator connected.'
                }
              />
            </div>
          </div>

          {drowningStats && drowningStats.dailyTrend.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={drowningStats.dailyTrend}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9E1D3" opacity={0.7} />
                  <XAxis
                    dataKey="date"
                    stroke="#5B687A"
                    fontSize={10}
                    tickFormatter={(v) => String(v).slice(5)}
                    tickLine={false}
                  />
                  <YAxis stroke="#5B687A" fontSize={10} allowDecimals={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1B2A38',
                      borderColor: '#1B2A38',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      fontSize: '11px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="All Incidents"
                    stroke="#0B3B3C"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="drowning"
                    name="Drowning / Swept Away"
                    stroke="#D65A4A"
                    strokeWidth={2.5}
                    dot={{ r: 2.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="resolved"
                    name="Resolved"
                    stroke="#2F855A"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-[#5B687A] bg-[#F6F1E7]/50 rounded-xl">
              No recorded incidents in the selected time window.
            </div>
          )}

          <div className="text-[11px] text-[#5B687A] bg-[#F6F1E7]/70 rounded-xl p-2.5 border border-[#E9E1D3]/80">
            <strong>Exposure-Adjusted Rate:</strong> Unavailable — no verified beach visitor-count denominator is connected. Showing absolute counts and daily frequency only.
          </div>
        </div>

        {/* Beach-wise Drowning Bar Chart & Risk Distribution */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                  Beach-Wise Drowning Counts
                </h3>
                <p className="text-xs text-[#5B687A]">Absolute count by beach in selected window</p>
              </div>
              <DataTrustBadge
                classification="historical_recorded"
                compact
                source="Operational Incidents"
              />
            </div>

            {drowningStats && drowningStats.byBeach.length > 0 ? (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={drowningStats.byBeach.slice(0, 6)}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9E1D3" opacity={0.6} />
                    <XAxis
                      dataKey="siteName"
                      stroke="#5B687A"
                      fontSize={10}
                      tickFormatter={(v) => String(v).slice(0, 12)}
                      tickLine={false}
                    />
                    <YAxis stroke="#5B687A" fontSize={10} allowDecimals={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1B2A38',
                        borderColor: '#1B2A38',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        fontSize: '11px',
                      }}
                    />
                    <Bar dataKey="drowningCount" name="Drowning" fill="#D65A4A" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="totalIncidents" name="Total" fill="#0F766E" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-36 flex items-center justify-center text-xs text-[#5B687A] bg-[#F6F1E7]/50 rounded-xl">
                No beach-level incident counts recorded in this window.
              </div>
            )}
          </div>

          {/* Current Beach Risk Distribution */}
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-serif-heading text-base font-bold text-[#1B2A38]">
                  Beach Risk Distribution
                </h3>
                <p className="text-xs text-[#5B687A]">
                  Derived from existing GuardianGrid RiskModel (Low / Moderate / High / Critical)
                </p>
              </div>
              <DataTrustBadge
                classification="derived_analytical"
                compact
                source="GuardianGrid RiskModel (calculateRiskScore)"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {riskDistribution.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  onClick={() =>
                    setRiskFilter(riskFilter === item.category ? 'ALL' : (item.category as RiskCategoryFilter))
                  }
                  className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                    riskFilter === item.category
                      ? 'border-[#0F766E] bg-white shadow-xs'
                      : 'border-[#E9E1D3] bg-[#F6F1E7]/60 hover:bg-white'
                  }`}
                >
                  <div className="text-[10px] font-bold" style={{ color: item.fill }}>
                    {item.category}
                  </div>
                  <div className="text-lg font-bold text-[#1B2A38] mt-0.5">{item.count}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4D & MAP OVERVIEW: RISK MAP + TOP RISK BEACHES & FORECASTS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] shadow-md flex flex-col">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                    Coastal Risk &amp; Safety Map Overview
                  </h3>
                  <DataTrustBadge
                    classification="derived_analytical"
                    compact
                    source="RiskModel + Esri / Leaflet"
                  />
                </div>
                <p className="text-xs text-[#5B687A]">
                  Real-time spatial distribution across {currentCity.name} ({filteredSites.length} shown)
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/map?returnTo=${dashboardReturnUrl}`)}
                className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Full Risk Map</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-[380px] w-full rounded-2xl overflow-hidden border border-[#E9E1D3] shadow-inner relative">
              <MapComponent
                center={mapCenter}
                zoom={11}
                sites={filteredSites}
                siteRisks={siteRisks}
                activeLayers={{
                  risk: true,
                  forecast: false,
                  cluster: false,
                  incident: false,
                  environmental: false,
                }}
              />
            </div>
          </div>

          {/* Preserved Satellite Community Banner */}
          <div className="relative rounded-2xl overflow-hidden shadow-lg h-36 border border-[#E9E1D3]">
            <img
              src={bannerImg}
              alt="Coastal Community Satellite View"
              className="w-full h-full object-cover filter saturate-110 brightness-90"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B3B3C]/90 via-[#0B3B3C]/60 to-transparent flex flex-col justify-center px-6">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-300">
                GuardianGrid · Coastal Intelligence
              </span>
              <h4 className="font-serif-heading text-xl sm:text-2xl font-bold text-white mt-1">
                Safer Coasts, Stronger Communities
              </h4>
              <p className="text-xs text-white/80 mt-1">
                Connecting hydro-meteorological hazard forecasting with live emergency dispatch and medical handoff.
              </p>
            </div>
          </div>
        </div>

        {/* Beach Risk Intelligence & Immediate Attention List */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E1D3]">
              <div>
                <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                  Beach Risk Intelligence
                </h3>
                <p className="text-xs text-[#5B687A]">
                  {attentionBeaches.length} beach(es) currently at HIGH or CRITICAL risk
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/analytics?tab=forecast')}
                className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>7-Day Forecast</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#E9E1D3]/70">
              {sortedSites.slice(0, 6).map((site) => {
                const risk = siteRisks.get(site.id);
                const fc = siteForecasts.get(site.id);
                const score = risk?.score ?? 0;
                const tier = risk?.tier ?? 'Low';
                const cat = mapRiskTierToCategory(tier);
                const next3DaysMax = fc?.daily
                  ?.slice(0, 3)
                  .reduce((m, d) => Math.max(m, d.maxScore), score);
                const topDriver = risk?.topShapFactors?.[0];

                return (
                  <div
                    key={site.id}
                    className="py-3 flex items-center justify-between gap-2 px-1"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/water-bodies/${site.id}`)}
                      className="text-left flex-1 min-w-0 cursor-pointer group focus:outline-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs sm:text-sm text-[#1B2A38] group-hover:text-[#0F766E] truncate">
                          {site.name}
                        </span>
                        <span className="text-[10px] font-bold text-[#5B687A]">{cat}</span>
                      </div>
                      <div className="text-[11px] text-[#5B687A] truncate mt-0.5">
                        {topDriver
                          ? `Driver: ${topDriver.label} (+${topDriver.shap})`
                          : 'Within baseline environmental margins'}
                        {next3DaysMax !== undefined && ` · 3d peak: ${next3DaysMax}/100`}
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-[#1B2A38]">{score}</span>
                      <TierBadge tier={tier} size="sm" />
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/map?siteId=${site.id}&returnTo=${dashboardReturnUrl}`)
                        }
                        title="Focus location on Risk Map"
                        className="p-1.5 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] hover:border-[#0F766E]/40 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Frequently Affected Rescue Cells */}
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3]">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E9E1D3]">
              <h3 className="font-serif-heading text-base font-bold text-[#1B2A38]">
                Frequently Affected Rescue Cells
              </h3>
              <DataTrustBadge
                classification="historical_recorded"
                compact
                source="Operational Incidents"
              />
            </div>

            {drowningStats && drowningStats.frequentlyAffectedCells.length > 0 ? (
              <div className="divide-y divide-[#E9E1D3]/70 mt-1">
                {drowningStats.frequentlyAffectedCells.slice(0, 5).map((cell) => (
                  <button
                    key={cell.cellId}
                    type="button"
                    onClick={() => navigate(`/incidents?cellId=${cell.cellId}`)}
                    className="w-full py-2.5 flex items-center justify-between text-left hover:bg-[#F6F1E7]/60 px-2 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#1B2A38] truncate">
                        {cell.cellId} · {cell.siteName}
                      </div>
                      <div className="text-[11px] text-[#5B687A] truncate">{cell.cellLabel}</div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-xs font-bold text-[#D65A4A]">
                        {cell.drowningCount} drowning
                      </div>
                      <div className="text-[10px] text-[#5B687A]">{cell.count} total</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#5B687A]">
                No rescue-cell incident clusters recorded in this window.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* LIVE INCIDENT TABLE */}
      <section className="glass-card rounded-2xl p-5 border border-[#E9E1D3] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                Recent Operational Incidents ({activeWorkspace.name})
              </h3>
              <DataTrustBadge
                classification="live_measured"
                compact
                source="Operational Incident Queue"
                timestamp={overview?.generatedAt}
              />
            </div>
            <p className="text-xs text-[#5B687A]">
              Showing real incidents matching active filters. Click any row to open in Live Operations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/incidents')}
            className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>All Incidents &amp; SOS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {overview && overview.recentIncidents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E9E1D3] text-[10px] uppercase tracking-wider text-[#5B687A]">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Beach / Cell</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Reported</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E1D3]/60">
                {overview.recentIncidents.slice(0, 8).map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => navigate(`/command?incidentId=${inc.id}`)}
                    className="hover:bg-[#F6F1E7]/70 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-3 font-mono font-bold text-[#0B3B3C]">
                      {inc.code}
                    </td>
                    <td className="py-2.5 pr-3 capitalize">{inc.category.replace('_', ' ')}</td>
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-[#1B2A38]">{inc.siteName}</span>
                      <span className="text-[#5B687A]"> · {inc.cellId}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="px-2 py-0.5 rounded-full bg-[#F6F1E7] border border-[#E9E1D3] text-[10px] font-semibold">
                        {inc.state.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 uppercase font-semibold text-[10px]">
                      <span
                        className={
                          inc.severity === 'critical'
                            ? 'text-[#D65A4A]'
                            : inc.severity === 'high'
                            ? 'text-amber-700'
                            : 'text-[#0F766E]'
                        }
                      >
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-[#5B687A]">
                      {formatReadingAge(inc.createdAt).ageLabel}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            `/map?incidentId=${inc.id}&layer=incident&returnTo=${dashboardReturnUrl}`
                          );
                        }}
                        title="View on Risk Map"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E9E1D3] bg-white text-[11px] font-medium text-[#1B2A38] hover:border-[#0F766E]/40 cursor-pointer"
                      >
                        <MapPin className="w-3 h-3 text-[#0F766E]" />
                        <span>Map</span>
                      </button>
                      <span className="font-semibold text-[#0F766E]">Open →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-[#5B687A] bg-[#F6F1E7]/40 rounded-xl">
            No real operational incidents recorded for the current filter selection.
          </div>
        )}
      </section>
    </div>
  );
};
