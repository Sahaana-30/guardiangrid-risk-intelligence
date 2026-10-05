import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { WaterBodyType, RiskTier } from '../types';
import { TierBadge } from '../components/TierBadge';
import { RiskGauge } from '../components/RiskGauge';
import { ProvenanceTip } from '../components/ProvenanceTip';
import { SatelliteThumbnail } from '../components/SatelliteThumbnail';
import {
  Search,
  Filter,
  ArrowUpDown,
  LifeBuoy,
  Wind,
  Waves,
  Thermometer,
  CloudRain,
  ExternalLink,
  Plus,
  Compass,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  Sparkles,
} from 'lucide-react';

export const WaterBodies: React.FC = () => {
  const navigate = useNavigate();
  const { currentCity, sites, siteRisks, isLoading, refreshData } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedLifeguard, setSelectedLifeguard] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'confidence'>('risk');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);

  // Filter & sort sites
  const filteredSites = useMemo(() => {
    return sites
      .filter((site) => {
        // Search
        if (
          searchTerm &&
          !site.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !site.type.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false;
        }

        // Type
        if (selectedType !== 'all' && site.type !== selectedType) {
          return false;
        }

        // Tier
        const risk = siteRisks.get(site.id);
        const tier = risk?.tier || 'Low';
        if (selectedTier !== 'all' && tier !== selectedTier) {
          return false;
        }

        // Lifeguard
        if (selectedLifeguard === 'yes' && !site.hasLifeguard) return false;
        if (selectedLifeguard === 'no' && site.hasLifeguard) return false;

        return true;
      })
      .sort((a, b) => {
        const riskA = siteRisks.get(a.id);
        const riskB = siteRisks.get(b.id);

        if (sortBy === 'risk') {
          const scoreA = riskA?.score ?? 0;
          const scoreB = riskB?.score ?? 0;
          return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
        }
        if (sortBy === 'name') {
          return sortOrder === 'desc'
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name);
        }
        if (sortBy === 'confidence') {
          const confA = riskA?.dataConfidence ?? 0;
          const confB = riskB?.dataConfidence ?? 0;
          return sortOrder === 'desc' ? confB - confA : confA - confB;
        }
        return 0;
      });
  }, [sites, siteRisks, searchTerm, selectedType, selectedTier, selectedLifeguard, sortBy, sortOrder]);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setDiscoveryMessage(null);
    try {
      await refreshData();
      setDiscoveryMessage(`Refreshed live telemetry for all water bodies in ${currentCity.name}.`);
    } catch {
      setDiscoveryMessage('Network issue refreshing OpenStreetMap and weather telemetry.');
    } finally {
      setIsDiscovering(false);
      setTimeout(() => setDiscoveryMessage(null), 6000);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
            Water Bodies Directory
          </h1>
          <p className="text-sm text-[#5B687A] mt-1">
            Real-time monitoring across coastal beaches, recreational lakes, rivers, and storage reservoirs in {currentCity.name}, {currentCity.region}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDiscover}
            disabled={isDiscovering || isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs disabled:opacity-50"
          >
            <Compass className={`w-4 h-4 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'Refreshing Feeds...' : 'Sync Live Telemetry'}</span>
          </button>
        </div>
      </div>

      {discoveryMessage && (
        <div className="p-4 rounded-xl bg-[#0F766E]/10 border border-[#0F766E]/20 text-[#0F766E] text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{discoveryMessage}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B687A]" />
            <input
              type="text"
              placeholder="Search by name or water body type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#E9E1D3] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E] text-[#1B2A38]"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="all">All Types</option>
              <option value="beach">Beaches</option>
              <option value="lake">Lakes</option>
              <option value="reservoir">Reservoirs</option>
              <option value="river">Rivers</option>
            </select>

            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="all">All Tiers</option>
              <option value="Low">Low Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="High">High Risk</option>
              <option value="Severe">Severe Risk</option>
            </select>

            <select
              value={selectedLifeguard}
              onChange={(e) => setSelectedLifeguard(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              <option value="all">All Lifeguard Status</option>
              <option value="yes">Lifeguard On Duty</option>
              <option value="no">Unpatrolled</option>
            </select>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 border border-[#E9E1D3] bg-white rounded-xl px-2 py-1">
              <span className="text-xs text-[#5B687A] pl-1">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs font-medium text-[#1B2A38] bg-transparent focus:outline-none py-1"
              >
                <option value="risk">Risk Score</option>
                <option value="name">Name</option>
                <option value="confidence">Data Confidence</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-1 hover:bg-[#E9E1D3]/50 rounded text-[#5B687A]"
                title="Toggle sort direction"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-[#E9E1D3] bg-white rounded-xl overflow-hidden p-0.5 ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'grid'
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#5B687A] hover:bg-[#E9E1D3]/40'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'table'
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#5B687A] hover:bg-[#E9E1D3]/40'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Status Count Summary */}
        <div className="flex items-center justify-between text-xs text-[#5B687A] pt-2 border-t border-[#E9E1D3]">
          <span>
            Showing <strong className="text-[#1B2A38]">{filteredSites.length}</strong> of{' '}
            <strong>{sites.length}</strong> monitored sites
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0F766E] animate-pulse"></span>
            Real-time live feeds active
          </span>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSites.map((site) => {
            const risk = siteRisks.get(site.id);
            const score = risk?.score ?? 40;
            const tier: RiskTier = risk?.tier ?? 'Low';
            const factors = risk?.environmentalFactors;
            const confidence = risk?.dataConfidence ?? 85;

            return (
              <div
                key={site.id}
                className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition group flex flex-col justify-between"
              >
                {/* Satellite Imagery Thumbnail Header */}
                <div className="relative h-44 overflow-hidden bg-[#1B2A38]">
                  <SatelliteThumbnail
                    lat={site.lat}
                    lon={site.lon}
                    altText={site.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-lg bg-black/60 backdrop-blur-md text-white border border-white/20">
                      {site.type}
                    </span>
                    <TierBadge tier={tier} size="sm" />
                  </div>

                  {/* Bottom Image Overlay Info */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white">
                    <div>
                      <h3 className="font-serif-heading text-lg font-bold drop-shadow-sm leading-tight text-white">
                        {site.name}
                      </h3>
                      <p className="text-xs text-stone-200 mt-0.5">
                        {site.lat.toFixed(4)}°N, {site.lon.toFixed(4)}°E
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold font-serif-heading drop-shadow-sm">
                        {score}
                        <span className="text-xs font-normal text-stone-300">/100</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  {/* Current Hazard Conditions */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {site.type === 'beach' ? (
                      <>
                        <div className="p-2.5 rounded-xl bg-white border border-[#E9E1D3] flex items-center justify-between">
                          <span className="text-[#5B687A] flex items-center gap-1.5">
                            <Waves className="w-3.5 h-3.5 text-[#0F766E]" /> Waves
                          </span>
                          <span className="font-semibold text-[#1B2A38]">
                            {factors?.waveHeight != null ? `${factors.waveHeight.toFixed(1)} m` : 'N/A'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-[#E9E1D3] flex items-center justify-between">
                          <span className="text-[#5B687A] flex items-center gap-1.5">
                            <Wind className="w-3.5 h-3.5 text-[#0F766E]" /> Wind
                          </span>
                          <span className="font-semibold text-[#1B2A38]">
                            {factors?.windSpeed != null ? `${Math.round(factors.windSpeed)} km/h` : 'N/A'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-2.5 rounded-xl bg-white border border-[#E9E1D3] flex items-center justify-between">
                          <span className="text-[#5B687A] flex items-center gap-1.5">
                            <CloudRain className="w-3.5 h-3.5 text-[#0F766E]" /> Rain
                          </span>
                          <span className="font-semibold text-[#1B2A38]">
                            {factors?.precipitation != null ? `${factors.precipitation.toFixed(1)} mm` : '0 mm'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white border border-[#E9E1D3] flex items-center justify-between">
                          <span className="text-[#5B687A] flex items-center gap-1.5">
                            <Thermometer className="w-3.5 h-3.5 text-[#0F766E]" /> Temp
                          </span>
                          <span className="font-semibold text-[#1B2A38]">
                            {factors?.temperature != null ? `${Math.round(factors.temperature)}°C` : 'N/A'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Safety & Provenance Row */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      <LifeBuoy
                        className={`w-3.5 h-3.5 ${
                          site.hasLifeguard ? 'text-[#2F855A]' : 'text-[#5B687A]'
                        }`}
                      />
                      <span className={site.hasLifeguard ? 'text-[#2F855A] font-medium' : 'text-[#5B687A]'}>
                        {site.hasLifeguard ? 'Lifeguard Patrolled' : 'Unpatrolled'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[#5B687A]">Confidence:</span>
                      <span className="font-semibold text-[#0F766E]">{confidence}%</span>
                      <ProvenanceTip
                        source="Open-Meteo & OpenStreetMap"
                        type="observed"
                        confidence={confidence}
                      />
                    </div>
                  </div>

                  {/* CTA Action */}
                  <div className="pt-3 border-t border-[#E9E1D3]">
                    <button
                      onClick={() => navigate(`/water-bodies/${site.id}`)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#E9E1D3]/50 text-[#0B3B3C] hover:bg-[#0F766E] hover:text-white transition flex items-center justify-center gap-2 group-hover:bg-[#0F766E] group-hover:text-white"
                    >
                      <span>View Full Intelligence & SHAP</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#E9E1D3]/40 border-b border-[#E9E1D3] text-xs font-semibold text-[#5B687A] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Water Body</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Risk Tier</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Key Conditions</th>
                  <th className="py-3 px-4">Safety Infra</th>
                  <th className="py-3 px-4">Data Confidence</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E1D3]/60 text-xs">
                {filteredSites.map((site) => {
                  const risk = siteRisks.get(site.id);
                  const score = risk?.score ?? 40;
                  const tier: RiskTier = risk?.tier ?? 'Low';
                  const factors = risk?.environmentalFactors;
                  const confidence = risk?.dataConfidence ?? 85;

                  return (
                    <tr key={site.id} className="hover:bg-white/60 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#1B2A38] text-sm">{site.name}</div>
                        <div className="text-[11px] text-[#5B687A]">
                          {site.lat.toFixed(4)}°N, {site.lon.toFixed(4)}°E
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-md bg-[#E9E1D3]/60 text-[#1B2A38] font-medium text-[11px]">
                          {site.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <TierBadge tier={tier} size="sm" />
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-serif-heading font-bold text-sm text-[#1B2A38]">
                          {score}
                        </span>
                        <span className="text-[#5B687A] text-[10px]"> / 100</span>
                      </td>
                      <td className="py-3.5 px-4 text-[#5B687A]">
                        {site.type === 'beach' ? (
                          <span>
                            Wave: {factors?.waveHeight != null ? `${factors.waveHeight.toFixed(1)}m` : 'N/A'} • Wind: {factors?.windSpeed != null ? `${Math.round(factors.windSpeed)}km/h` : 'N/A'}
                          </span>
                        ) : (
                          <span>
                            Rain: {factors?.precipitation != null ? `${factors.precipitation.toFixed(1)}mm` : '0mm'} • Temp: {factors?.temperature != null ? `${Math.round(factors.temperature)}°C` : 'N/A'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            site.hasLifeguard ? 'text-[#2F855A]' : 'text-[#5B687A]'
                          }`}
                        >
                          <LifeBuoy className="w-3.5 h-3.5" />
                          {site.hasLifeguard ? 'Patrolled' : 'None'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[#0F766E]">{confidence}%</span>
                          <ProvenanceTip
                            source="Open-Meteo & OpenStreetMap"
                            type="observed"
                            confidence={confidence}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => navigate(`/water-bodies/${site.id}`)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0F766E] text-white hover:bg-[#0B5A54] transition"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
