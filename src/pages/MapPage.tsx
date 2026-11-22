import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEmergency } from '../context/EmergencyContext';
import { useGoogleMapsStatus } from '../components/maps/GoogleMapsProvider';
import { TopNav } from '../components/TopNav';
import { MapComponent } from '../components/MapComponent';
import { MapLayerPanel } from '../components/MapLayerPanel';
import { DataTrustBadge, formatReadingAge } from '../components/ProvenanceTip';
import { TierBadge } from '../components/TierBadge';
import { searchLocationNominatim } from '../services/nominatim';
import { normalizeRiskCategory, normalizeRiskFilterValue } from '../utils/riskTierFilter';
import type { WaterBody } from '../types';
import type { EmergencyIncident } from '../types/emergency';
import type { GoogleMapViewType } from '../types/maps';
import {
  Maximize2,
  Crosshair,
  Layers,
  Plus,
  Minus,
  ExternalLink,
  ShieldAlert,
  Waves,
  Wind,
  X,
  Siren,
} from 'lucide-react';
import { OfflineBanner } from '../components/OfflineBanner';
import { BackNavButton } from '../components/BackNavButton';

function parseSafeReturnTo(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return null;
}

export const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentCity, sites, siteRisks, incidents, dateRange, setDateRange } = useApp();
  const { incidents: emergencyIncidents, cells } = useEmergency();
  const { useGoogleMaps } = useGoogleMapsStatus();

  const [activeLayers, setActiveLayers] = useState({
    risk: true,
    forecast: false,
    cluster: false,
    incident: true,
    environmental: true,
    rescueCells: true,
  });

  const [filterType, setFilterType] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');
  const [mapType, setMapType] = useState<GoogleMapViewType>('hybrid');
  const [forceFallback, setForceFallback] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([currentCity.lat, currentCity.lon]);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [selectedSite, setSelectedSite] = useState<WaterBody | null>(null);
  const [selectedEmergencyIncident, setSelectedEmergencyIncident] =
    useState<EmergencyIncident | null>(null);

  const returnToPath = parseSafeReturnTo(searchParams.get('returnTo'));

  // Sync URL query params (?risk=, ?layer=, ?siteId=, ?incidentId=, ?lat=&lng=, ?focus=)
  useEffect(() => {
    const riskParam = searchParams.get('risk');
    if (riskParam) {
      setFilterRisk(normalizeRiskFilterValue(riskParam));
    }

    const layerParam = (searchParams.get('layer') || '').toLowerCase();
    const focusParam = (searchParams.get('focus') || '').toLowerCase();
    if (layerParam === 'incident' || focusParam === 'incidents') {
      setActiveLayers((prev) => ({ ...prev, incident: true, risk: true }));
    } else if (layerParam === 'environmental') {
      setActiveLayers((prev) => ({ ...prev, environmental: true, risk: true }));
    } else if (layerParam === 'forecast') {
      setActiveLayers((prev) => ({ ...prev, forecast: true, risk: true }));
    }

    const latParam = Number.parseFloat(searchParams.get('lat') || '');
    const lngParam = Number.parseFloat(searchParams.get('lng') || '');

    const targetIncidentId = searchParams.get('incidentId');
    if (targetIncidentId) {
      const matchedInc = emergencyIncidents.find((i) => i.id === targetIncidentId);
      if (matchedInc) {
        setSelectedEmergencyIncident(matchedInc);
        setSelectedSite(null);
        setActiveLayers((prev) => ({ ...prev, incident: true }));
        const cell = cells.find((c) => c.id === matchedInc.cellId);
        const iLat = typeof matchedInc.lat === 'number' ? matchedInc.lat : cell?.lat;
        const iLon = typeof matchedInc.lon === 'number' ? matchedInc.lon : cell?.lon;
        if (typeof iLat === 'number' && typeof iLon === 'number') {
          setMapCenter([iLat, iLon]);
          setZoomLevel(15);
          return;
        }
      }
    }

    const targetSiteId = searchParams.get('siteId');
    if (targetSiteId && sites.length > 0) {
      const found = sites.find((s) => s.id === targetSiteId);
      if (found) {
        setSelectedSite(found);
        setSelectedEmergencyIncident(null);
        setMapCenter([found.lat, found.lon]);
        setZoomLevel(14);
        return;
      }
    }

    if (Number.isFinite(latParam) && Number.isFinite(lngParam)) {
      setMapCenter([latParam, lngParam]);
      setZoomLevel(14);
      return;
    }

    if (focusParam === 'incidents') {
      const firstActive = emergencyIncidents.find(
        (i) => i.state !== 'RESOLVED' && i.state !== 'REJECTED'
      );
      if (firstActive) {
        setSelectedEmergencyIncident(firstActive);
        setSelectedSite(null);
        const cell = cells.find((c) => c.id === firstActive.cellId);
        const iLat = typeof firstActive.lat === 'number' ? firstActive.lat : cell?.lat;
        const iLon = typeof firstActive.lon === 'number' ? firstActive.lon : cell?.lon;
        if (typeof iLat === 'number' && typeof iLon === 'number') {
          setMapCenter([iLat, iLon]);
          setZoomLevel(13);
        }
      }
    }
  }, [searchParams, sites, emergencyIncidents, cells]);

  // Reset center cleanly when user switches monitored city in TopNav
  useEffect(() => {
    if (!searchParams.get('siteId') && !searchParams.get('incidentId') && !searchParams.get('lat')) {
      setMapCenter([currentCity.lat, currentCity.lon]);
      setZoomLevel(12);
      setSelectedSite(null);
    }
  }, [currentCity.id]);

  // Filter historical/community incidents by active dateRange so Time Range selector works meaningfully
  const filteredNewsIncidents = useMemo(() => {
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const cutoff = Date.now() - days * 86400000;
    return incidents.filter((inc) => {
      const ts = Date.parse(inc.date);
      return Number.isNaN(ts) || ts >= cutoff;
    });
  }, [incidents, dateRange]);

  const toggleLayer = (layer: keyof typeof activeLayers) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const matchedSites = sites
      .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
      .map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        site: s,
        isLocal: true,
      }));

    let remoteMatches: any[] = [];
    try {
      const places = await searchLocationNominatim(`${query} ${currentCity.name}`);
      remoteMatches = places.map((p) => ({
        id: p.place_id,
        name: p.display_name,
        lat: parseFloat(p.lat),
        lon: parseFloat(p.lon),
        isLocal: false,
      }));
    } catch {
      // Non-blocking geocoder fallback
    }

    setSearchResults([...matchedSites, ...remoteMatches.slice(0, 3)]);
  };

  const handleSelectLocation = (loc: { lat: number; lon: number; site?: WaterBody }) => {
    setMapCenter([loc.lat, loc.lon]);
    setZoomLevel(14);
    if (loc.site) {
      setSelectedSite(loc.site);
      setSelectedEmergencyIncident(null);
    }
    setSearchResults([]);
  };

  const resetToCityCenter = () => {
    setMapCenter([currentCity.lat, currentCity.lon]);
    setZoomLevel(12);
    setFilterRisk('all');
    setSearchParams({}, { replace: true });
  };

  const selectedRisk = selectedSite ? siteRisks.get(selectedSite.id) : undefined;
  const selectedSiteAge = formatReadingAge(selectedRisk?.environmentalFactors?.timestamp);
  const usingGoogleNow = useGoogleMaps && !forceFallback;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F6F1E7]">
      <OfflineBanner />

      <TopNav
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearch={handleSearch}
      />

      <div className="relative flex-1 w-full h-full overflow-hidden">
        <MapComponent
          center={mapCenter}
          zoom={zoomLevel}
          sites={sites}
          siteRisks={siteRisks}
          incidents={filteredNewsIncidents}
          emergencyIncidents={emergencyIncidents}
          rescueCells={cells}
          activeLayers={activeLayers}
          filterType={filterType}
          filterRisk={filterRisk}
          highlightedSiteId={selectedSite?.id}
          highlightedIncidentId={selectedEmergencyIncident?.id}
          mapType={mapType}
          forceFallback={forceFallback}
          onSelectSite={(site) => {
            setSelectedSite(site);
            setSelectedEmergencyIncident(null);
          }}
          onSelectEmergencyIncident={(inc) => {
            setSelectedEmergencyIncident(inc);
            setSelectedSite(null);
          }}
          className="h-full w-full"
        />

        {/* Map Overlay Controls (Sibling layer above map canvas with pointer-events-none wrapper) */}
        <div className="absolute inset-0 z-[1000] pointer-events-none overflow-hidden">
          {/* Always-available Back Navigation Chip */}
          <div className="absolute top-4 left-4 pointer-events-auto z-20">
            <BackNavButton
              fallbackPath="/dashboard"
              explicitReturnTo={returnToPath}
              showLabel
              className="bg-white/95 hover:bg-white shadow-lg"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#E9E1D3] p-2 space-y-1 pointer-events-auto z-30">
              <div className="text-[10px] uppercase font-bold text-[#5B687A] px-3 py-1">
                Matching Sites &amp; Places
              </div>
              {searchResults.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => handleSelectLocation(res)}
                  className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-[#F6F1E7] transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span className="font-medium text-[#1B2A38] truncate">{res.name}</span>
                  <span className="text-[10px] text-[#0F766E] font-semibold shrink-0 ml-2">
                    {res.isLocal ? 'Monitored Site' : 'Geocoded'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {panelOpen && (
            <div
              className={`absolute ${
                returnToPath ? 'top-16' : 'top-5'
              } left-4 sm:left-5 pointer-events-auto transition-all duration-300 z-10`}
            >
              <MapLayerPanel
                layers={activeLayers}
                onToggleLayer={toggleLayer}
                filterType={filterType}
                setFilterType={setFilterType}
                filterRisk={filterRisk}
                setFilterRisk={setFilterRisk}
                timeRange={dateRange}
                setTimeRange={(val) => setDateRange(val as '7d' | '30d' | '90d')}
                useGoogleMaps={usingGoogleNow}
                mapType={mapType}
                setMapType={setMapType}
                onClose={() => setPanelOpen(false)}
              />
            </div>
          )}

          {/* Right Map Toolbar */}
          <div className="absolute top-5 right-4 sm:right-5 flex flex-col gap-2.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => setPanelOpen(!panelOpen)}
              title="Toggle Map Layers Panel"
              aria-label="Toggle Map Layers Panel"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#0F766E]" />
            </button>

            <button
              type="button"
              onClick={resetToCityCenter}
              title="Recenter on current city"
              aria-label="Recenter on current city"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 cursor-pointer"
            >
              <Crosshair className="w-4 h-4 text-[#0F766E]" />
            </button>

            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(18, z + 1))}
              title="Zoom In"
              aria-label="Zoom In"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(8, z - 1))}
              title="Zoom Out"
              aria-label="Zoom Out"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>

            {useGoogleMaps && (
              <button
                type="button"
                onClick={() => setForceFallback((v) => !v)}
                title={forceFallback ? 'Switch to Google Maps' : 'Switch to Fallback Map'}
                className="px-2.5 py-1.5 bg-white/95 backdrop-blur-md hover:bg-white text-[#0B3B3C] rounded-xl shadow-lg border border-[#E9E1D3] text-[10px] font-bold cursor-pointer"
              >
                {forceFallback ? 'Google Maps' : 'Fallback'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.().catch(() => {});
                } else {
                  document.exitFullscreen?.().catch(() => {});
                }
              }}
              title="Toggle Fullscreen"
              aria-label="Toggle Fullscreen"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Selected Site Details Drawer Card */}
          {selectedSite && (
            <div className="absolute bottom-10 right-4 sm:right-5 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-[#FBF8F3]/98 backdrop-blur-md rounded-2xl border border-[#E9E1D3] shadow-2xl p-4 space-y-3 pointer-events-auto z-20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-serif-heading text-base font-bold text-[#0B3B3C] truncate">
                      {selectedSite.name}
                    </h3>
                    <TierBadge tier={selectedRisk?.tier || 'Low'} size="sm" />
                  </div>
                  <p className="text-[11px] text-[#5B687A] font-mono mt-0.5">
                    {selectedSite.lat.toFixed(4)}° N, {selectedSite.lon.toFixed(4)}° E ·{' '}
                    {selectedSite.lifeguardPresent ? 'Lifeguard active' : 'Unpatrolled water'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSite(null)}
                  aria-label="Close site details"
                  className="p-1 rounded-lg text-[#5B687A] hover:text-[#1B2A38] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-white border border-[#E9E1D3] p-2">
                  <div className="text-[10px] text-[#5B687A]">Risk Index</div>
                  <div className="font-extrabold text-[#0B3B3C] mt-0.5">
                    {selectedRisk?.score ?? '--'}/100{' '}
                    <span className="text-[10px] font-bold text-[#5B687A]">
                      ({normalizeRiskCategory(selectedRisk?.tier, selectedRisk?.score)})
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#E9E1D3] p-2">
                  <div className="text-[10px] text-[#5B687A] flex items-center gap-1">
                    <Waves className="w-3 h-3 text-[#0F766E]" /> Wave
                  </div>
                  <div className="font-bold text-[#1B2A38] mt-0.5">
                    {selectedSite.isCoastal && selectedRisk?.environmentalFactors?.waveHeight !== undefined
                      ? `${selectedRisk.environmentalFactors.waveHeight.toFixed(2)} m`
                      : 'Unavailable'}
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-[#E9E1D3] p-2">
                  <div className="text-[10px] text-[#5B687A] flex items-center gap-1">
                    <Wind className="w-3 h-3 text-sky-700" /> Wind
                  </div>
                  <div className="font-bold text-[#1B2A38] mt-0.5">
                    {selectedRisk?.environmentalFactors?.windSpeed !== undefined
                      ? `${Math.round(selectedRisk.environmentalFactors.windSpeed)} km/h`
                      : 'Unavailable'}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] text-[#5B687A] flex-wrap">
                <span>
                  {selectedSiteAge.formattedTime} ({selectedSiteAge.ageLabel}) · Tide gauge unavailable
                </span>
                <DataTrustBadge
                  classification={
                    selectedRisk?.environmentalFactors?.isLive === false ? 'unavailable' : 'forecast'
                  }
                  compact
                  showStaleIndicator
                  source="Open-Meteo Marine & Weather"
                  timestamp={selectedRisk?.environmentalFactors?.timestamp}
                />
              </div>

              <div className="pt-2 border-t border-[#E9E1D3] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/water-bodies/${selectedSite.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5A54] text-white text-xs font-semibold cursor-pointer"
                >
                  <span>Inspect SHAP &amp; Telemetry</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/sos')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#D65A4A]/40 bg-white hover:bg-[#FEF2F2] text-[#D65A4A] text-xs font-semibold cursor-pointer"
                >
                  <Siren className="w-3.5 h-3.5" />
                  <span>SOS</span>
                </button>
              </div>
            </div>
          )}

          {/* Selected Operational Incident Details Drawer Card */}
          {selectedEmergencyIncident && (
            <div className="absolute bottom-10 right-4 sm:right-5 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-[#FBF8F3]/98 backdrop-blur-md rounded-2xl border border-[#D65A4A]/40 shadow-2xl p-4 space-y-3 pointer-events-auto z-20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[#0B3B3C]">
                      {selectedEmergencyIncident.code}
                    </span>
                    {selectedEmergencyIncident.isSimulated && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                        SIMULATED
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-[#991B1B] border border-red-200 text-[10px] font-bold">
                      {selectedEmergencyIncident.state.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h3 className="font-serif-heading text-base font-bold text-[#1B2A38] capitalize mt-1">
                    {selectedEmergencyIncident.category.replace('_', ' ')} ·{' '}
                    {selectedEmergencyIncident.siteName}
                  </h3>
                  <p className="text-[11px] text-[#5B687A]">
                    Cell: {selectedEmergencyIncident.cellId} ·{' '}
                    {formatReadingAge(selectedEmergencyIncident.createdAt).ageLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEmergencyIncident(null)}
                  aria-label="Close incident details"
                  className="p-1 rounded-lg text-[#5B687A] hover:text-[#1B2A38] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#1B2A38] line-clamp-3 leading-relaxed">
                {selectedEmergencyIncident.description}
              </p>

              <div className="pt-2 border-t border-[#E9E1D3] flex items-center justify-between gap-2">
                <DataTrustBadge
                  classification={
                    selectedEmergencyIncident.isSimulated ? 'simulated_demo' : 'live_measured'
                  }
                  compact
                  source="Operational Incident Queue"
                  timestamp={selectedEmergencyIncident.createdAt}
                />
                <button
                  type="button"
                  onClick={() => navigate(`/command?incidentId=${selectedEmergencyIncident.id}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5A54] text-white text-xs font-semibold cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Open in Live Operations</span>
                </button>
              </div>
            </div>
          )}

          <div className="absolute bottom-2 left-4 pointer-events-none">
            <div className="text-[10px] font-mono text-white/90 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-md shadow-xs">
              {usingGoogleNow
                ? `Google Maps (${mapType}) • Hydro-Meteo: Open-Meteo Live API`
                : 'Fallback Satellite: Esri World Imagery • Hydro-Meteo: Open-Meteo Live API'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
