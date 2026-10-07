import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TopNav } from '../components/TopNav';
import { MapComponent } from '../components/MapComponent';
import { MapLayerPanel } from '../components/MapLayerPanel';
import { searchLocationNominatim } from '../services/nominatim';
import { Maximize2, Crosshair, Layers, Plus, Minus } from 'lucide-react';
import { OfflineBanner } from '../components/OfflineBanner';

export const MapPage: React.FC = () => {
  const { currentCity, sites, siteRisks, incidents } = useApp();

  const [activeLayers, setActiveLayers] = useState({
    risk: true,
    forecast: false,
    cluster: false,
    incident: true,
    environmental: true,
  });

  const [filterType, setFilterType] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');
  const [timeRange, setTimeRange] = useState('7d');
  const [panelOpen, setPanelOpen] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([currentCity.lat, currentCity.lon]);
  const [zoomLevel, setZoomLevel] = useState(12);

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
    } catch {}

    setSearchResults([...matchedSites, ...remoteMatches.slice(0, 3)]);
  };

  const handleSelectLocation = (loc: { lat: number; lon: number }) => {
    setMapCenter([loc.lat, loc.lon]);
    setZoomLevel(14);
    setSearchResults([]);
  };

  const resetToCityCenter = () => {
    setMapCenter([currentCity.lat, currentCity.lon]);
    setZoomLevel(12);
  };

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
          incidents={incidents}
          activeLayers={activeLayers}
          filterType={filterType}
          filterRisk={filterRisk}
          className="h-full w-full"
        />

        {/* Overlays positioned as siblings above Leaflet with z-index >= 1000 and pointer-events: none on wrapper */}
        <div className="absolute inset-0 z-[1000] pointer-events-none overflow-hidden">
          {searchResults.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#E9E1D3] p-2 space-y-1 pointer-events-auto">
              <div className="text-[10px] uppercase font-bold text-[#5B687A] px-3 py-1">
                Matching Sites & Places
              </div>
              {searchResults.map((res) => (
                <button
                  key={res.id}
                  onClick={() => handleSelectLocation(res)}
                  className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-[#F6F1E7] transition-colors flex items-center justify-between"
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
            <div className="absolute top-5 left-5 pointer-events-auto transition-all duration-300">
              <MapLayerPanel
                layers={activeLayers}
                onToggleLayer={toggleLayer}
                filterType={filterType}
                setFilterType={setFilterType}
                filterRisk={filterRisk}
                setFilterRisk={setFilterRisk}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
              />
            </div>
          )}

          <div className="absolute top-5 right-5 flex flex-col gap-2.5 pointer-events-auto">
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              title="Toggle Map Layers Panel"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 pointer-events-auto"
            >
              <Layers className="w-4 h-4 text-[#0F766E]" />
            </button>

            <button
              onClick={resetToCityCenter}
              title="Recenter on current city"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 pointer-events-auto"
            >
              <Crosshair className="w-4 h-4 text-[#0F766E]" />
            </button>

            <button
              onClick={() => setZoomLevel((z) => Math.min(18, z + 1))}
              title="Zoom In"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 pointer-events-auto"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              onClick={() => setZoomLevel((z) => Math.max(8, z - 1))}
              title="Zoom Out"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 pointer-events-auto"
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen();
                } else {
                  document.exitFullscreen();
                }
              }}
              title="Toggle Fullscreen"
              className="p-3 bg-white/95 backdrop-blur-md hover:bg-white text-[#1B2A38] rounded-2xl shadow-lg border border-[#E9E1D3] transition-all hover:scale-105 pointer-events-auto"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="absolute bottom-2 left-4 pointer-events-none">
            <div className="text-[10px] font-mono text-white/90 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-md shadow-xs">
              Satellite: Esri World Imagery & Labels • Hydro-Meteo: Open-Meteo Live API
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
