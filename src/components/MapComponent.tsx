import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap as useLeafletMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { AdvancedMarker, InfoWindow, Map as GoogleMap, useMap as useGoogleMap } from '@vis.gl/react-google-maps';
import { WaterBody, RiskCalculationResult, Incident } from '../types';
import type { EmergencyIncident, RescueCell } from '../types/emergency';
import type { GoogleMapViewType } from '../types/maps';
import { TierBadge } from './TierBadge';
import { SatelliteThumbnail } from './SatelliteThumbnail';
import { useGoogleMapsStatus } from './maps/GoogleMapsProvider';
import { GoogleMapCircle } from './maps/GoogleMapOverlays';
import { getRiskTierColor, normalizeRiskCategory, siteMatchesRiskFilter } from '../utils/riskTierFilter';
import { ExternalLink, Navigation, ShieldAlert } from 'lucide-react';

interface MapComponentProps {
  center: [number, number];
  zoom?: number;
  sites: WaterBody[];
  siteRisks: Map<string, RiskCalculationResult>;
  incidents?: Incident[];
  emergencyIncidents?: EmergencyIncident[];
  rescueCells?: RescueCell[];
  activeLayers: {
    risk: boolean;
    forecast: boolean;
    cluster: boolean;
    incident: boolean;
    environmental: boolean;
    rescueCells?: boolean;
  };
  filterType?: string;
  filterRisk?: string;
  highlightedSiteId?: string;
  highlightedIncidentId?: string;
  mapType?: GoogleMapViewType;
  forceFallback?: boolean;
  onSelectSite?: (site: WaterBody) => void;
  onSelectEmergencyIncident?: (incident: EmergencyIncident) => void;
  className?: string;
}

const LeafletMapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useLeafletMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom, map]);
  return null;
};

const GoogleMapViewportSync: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useGoogleMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat: center[0], lng: center[1] });
    if (typeof zoom === 'number') {
      map.setZoom(zoom);
    }
  }, [map, center[0], center[1], zoom]);
  return null;
};

function createCustomPin(
  score: number,
  tier: string,
  isCluster: boolean = false,
  clusterId: number = 0,
  isHigh: boolean = false,
  isHighlighted: boolean = false
) {
  let bgColor = getRiskTierColor(tier, score);
  if (isCluster) {
    const clusterColors = ['#0F766E', '#1E3A8A', '#B5654A', '#8B5CF6'];
    bgColor = clusterColors[clusterId % clusterColors.length];
  }

  const pulseClass = isHigh ? 'pulse-high-risk' : '';
  const ringStyle = isHighlighted ? 'box-shadow: 0 0 0 4px rgba(15,118,110,0.45); transform: scale(1.12);' : '';

  const html = `
    <div class="relative flex items-center justify-center">
      <div class="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-bold text-xs text-white ${pulseClass}" style="background-color: ${bgColor}; ${ringStyle}">
        ${score}
      </div>
      <div class="absolute -bottom-1 w-2 h-2 rotate-45 border-r border-b border-white" style="background-color: ${bgColor};"></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [32, 36],
    iconAnchor: [16, 36],
    popupAnchor: [0, -34],
  });
}

function createIncidentPin(severity: string) {
  const color = severity === 'Severe' || severity === 'High' ? '#D65A4A' : '#E9A03B';
  const html = `
    <div class="w-6 h-6 rounded-full bg-slate-900 border-2 border-white shadow-md flex items-center justify-center text-[10px] text-white font-bold" style="box-shadow: 0 0 8px ${color};">
      !
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-incident-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function createSosPin(isHighlighted: boolean, isSimulated?: boolean) {
  const bg = isSimulated ? '#B45309' : '#DC2626';
  const ring = isHighlighted ? 'box-shadow: 0 0 0 4px rgba(220,38,38,0.35); transform: scale(1.12);' : '';
  const html = `
    <div class="px-2 py-0.5 rounded-full border-2 border-white shadow-lg text-[10px] font-extrabold text-white" style="background-color: ${bg}; ${ring}">
      SOS
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-sos-marker',
    iconSize: [38, 22],
    iconAnchor: [19, 11],
    popupAnchor: [0, -12],
  });
}

type ActiveSelection =
  | { kind: 'site'; site: WaterBody }
  | { kind: 'emergency'; incident: EmergencyIncident }
  | { kind: 'news'; incident: Incident }
  | null;

export const MapComponent: React.FC<MapComponentProps> = ({
  center,
  zoom = 12,
  sites,
  siteRisks,
  incidents = [],
  emergencyIncidents = [],
  rescueCells = [],
  activeLayers,
  filterType = 'all',
  filterRisk = 'all',
  highlightedSiteId,
  highlightedIncidentId,
  mapType = 'hybrid',
  forceFallback = false,
  onSelectSite,
  onSelectEmergencyIncident,
  className = 'h-full w-full',
}) => {
  const navigate = useNavigate();
  const { useGoogleMaps, mapId, fallbackReason } = useGoogleMapsStatus();
  const [selectedMarker, setSelectedMarker] = useState<ActiveSelection>(null);

  const filteredSites = useMemo(
    () =>
      sites.filter((site) => {
        if (filterType !== 'all' && site.type !== filterType) return false;
        const risk = siteRisks.get(site.id);
        return siteMatchesRiskFilter(risk?.tier, risk?.score, filterRisk);
      }),
    [sites, siteRisks, filterType, filterRisk]
  );

  const cellCoordMap = useMemo(() => {
    const lookup = new globalThis.Map<string, RescueCell>();
    rescueCells.forEach((c) => lookup.set(c.id, c));
    return lookup;
  }, [rescueCells]);

  const activeEmergencyPins = useMemo(() => {
    return emergencyIncidents
      .filter((inc) => inc.state !== 'REJECTED')
      .map((inc) => {
        const cell = cellCoordMap.get(inc.cellId);
        const lat = typeof inc.lat === 'number' ? inc.lat : cell?.lat;
        const lon = typeof inc.lon === 'number' ? inc.lon : cell?.lon;
        if (typeof lat !== 'number' || typeof lon !== 'number') return null;
        return { inc, lat, lon };
      })
      .filter((item): item is { inc: EmergencyIncident; lat: number; lon: number } => Boolean(item));
  }, [emergencyIncidents, cellCoordMap]);

  const renderGoogleMaps = useGoogleMaps && !forceFallback;

  if (renderGoogleMaps) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <GoogleMap
          mapId={mapId}
          mapTypeId={mapType}
          defaultCenter={{ lat: center[0], lng: center[1] }}
          defaultZoom={zoom}
          gestureHandling="greedy"
          disableDefaultUI={false}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          className="h-full w-full"
          onClick={() => setSelectedMarker(null)}
        >
          <GoogleMapViewportSync center={center} zoom={zoom} />

          {activeLayers.environmental &&
            filteredSites.map((site) => {
              const risk = siteRisks.get(site.id);
              const score = risk?.score || 40;
              const radius = 1000 + score * 18;
              const color = getRiskTierColor(risk?.tier, score);
              return (
                <GoogleMapCircle
                  key={`env-${site.id}`}
                  center={{ lat: site.lat, lng: site.lon }}
                  radius={radius}
                  strokeColor={color}
                  strokeOpacity={0.5}
                  strokeWeight={1.5}
                  fillColor={color}
                  fillOpacity={0.16}
                />
              );
            })}

          {activeLayers.rescueCells &&
            rescueCells.map((cell) => (
              <GoogleMapCircle
                key={`cell-${cell.id}`}
                center={{ lat: cell.lat, lng: cell.lon }}
                radius={Math.max(180, Math.min(cell.radiusMeters || 350, 1200))}
                strokeColor="#0F766E"
                strokeOpacity={0.65}
                strokeWeight={1.5}
                fillColor="#0F766E"
                fillOpacity={0.1}
              />
            ))}

          {(activeLayers.risk || activeLayers.forecast || activeLayers.cluster) &&
            filteredSites.map((site, idx) => {
              const risk = siteRisks.get(site.id);
              const score = risk?.score ?? 42;
              const tier = risk?.tier ?? 'Low';
              const isHighlighted = highlightedSiteId === site.id;
              const clusterColors = ['#0F766E', '#1E3A8A', '#B5654A', '#8B5CF6'];
              const bgColor = activeLayers.cluster
                ? clusterColors[idx % clusterColors.length]
                : getRiskTierColor(tier, score);

              return (
                <AdvancedMarker
                  key={site.id}
                  position={{ lat: site.lat, lng: site.lon }}
                  title={`${site.name} (${score}/100 · ${normalizeRiskCategory(tier, score)})`}
                  zIndex={isHighlighted ? 30 : score >= 70 ? 20 : 10}
                  onClick={() => {
                    setSelectedMarker({ kind: 'site', site });
                    onSelectSite?.(site);
                  }}
                >
                  <div className="relative flex flex-col items-center cursor-pointer">
                    <div
                      className={`w-8 h-8 rounded-full border-2 shadow-lg flex items-center justify-center font-bold text-xs text-white transition-transform ${
                        isHighlighted
                          ? 'border-[#FEF08A] ring-4 ring-[#0F766E]/40 scale-115'
                          : 'border-white hover:scale-105'
                      } ${score >= 70 ? 'pulse-high-risk' : ''}`}
                      style={{ backgroundColor: bgColor }}
                    >
                      {score}
                    </div>
                    <div
                      className="-mt-1 w-2 h-2 rotate-45 border-r border-b border-white"
                      style={{ backgroundColor: bgColor }}
                    />
                  </div>
                </AdvancedMarker>
              );
            })}

          {activeLayers.incident &&
            activeEmergencyPins.map(({ inc, lat, lon }) => {
              const isHighlighted = highlightedIncidentId === inc.id;
              return (
                <AdvancedMarker
                  key={`ops-${inc.id}`}
                  position={{ lat, lng: lon }}
                  title={`${inc.code} · ${inc.category} (${inc.state})`}
                  zIndex={isHighlighted ? 40 : 28}
                  onClick={() => {
                    setSelectedMarker({ kind: 'emergency', incident: inc });
                    onSelectEmergencyIncident?.(inc);
                  }}
                >
                  <div
                    className={`px-2 py-0.5 rounded-full border-2 text-[10px] font-extrabold text-white shadow-lg cursor-pointer transition-transform ${
                      inc.isSimulated ? 'bg-[#B45309]' : 'bg-[#DC2626]'
                    } ${
                      isHighlighted
                        ? 'border-[#FEF08A] ring-4 ring-red-500/40 scale-115'
                        : 'border-white hover:scale-105'
                    }`}
                  >
                    SOS{inc.isSimulated ? ' · SIM' : ''}
                  </div>
                </AdvancedMarker>
              );
            })}

          {activeLayers.incident &&
            incidents.map((inc) => {
              if (!inc.lat || !inc.lon) return null;
              const isHigh = inc.severity === 'Severe' || inc.severity === 'High';
              return (
                <AdvancedMarker
                  key={`news-${inc.id}`}
                  position={{ lat: inc.lat, lng: inc.lon }}
                  title={inc.title}
                  zIndex={22}
                  onClick={() => setSelectedMarker({ kind: 'news', incident: inc })}
                >
                  <div
                    className="w-6 h-6 rounded-full bg-slate-900 border-2 border-white shadow-md flex items-center justify-center text-[10px] text-white font-bold cursor-pointer"
                    style={{ boxShadow: `0 0 8px ${isHigh ? '#D65A4A' : '#E9A03B'}` }}
                  >
                    !
                  </div>
                </AdvancedMarker>
              );
            })}

          {selectedMarker?.kind === 'site' && (() => {
            const site = selectedMarker.site;
            const risk = siteRisks.get(site.id);
            const score = risk?.score ?? 42;
            const tier = risk?.tier ?? 'Low';
            return (
              <InfoWindow
                position={{ lat: site.lat, lng: site.lon }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1 text-[#1B2A38] max-w-[250px] space-y-2">
                  <div className="relative">
                    <SatelliteThumbnail
                      lat={site.lat}
                      lon={site.lon}
                      altText={site.name}
                      className="w-full h-20 rounded-lg"
                    />
                    <div className="absolute top-1.5 right-1.5">
                      <TierBadge tier={tier} size="sm" />
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-[#1B2A38] leading-tight">{site.name}</h4>
                      <div className="text-[10px] text-[#5B687A] font-mono mt-0.5">
                        {site.lat.toFixed(4)}° N, {site.lon.toFixed(4)}° E
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-[#0B3B3C]">
                        {score}
                        <span className="text-[10px] font-normal text-[#5B687A]">/100</span>
                      </div>
                      <div className="text-[9px] uppercase font-semibold text-[#5B687A]">
                        {normalizeRiskCategory(tier, score)}
                      </div>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-[#E9E1D3] flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[#5B687A]">
                      {site.lifeguardPresent ? 'Lifeguard on duty' : 'Unpatrolled water'}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/water-bodies/${site.id}`)}
                      className="inline-flex items-center gap-1 bg-[#0F766E] hover:bg-[#0B5A54] text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      <span>View SHAP</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </InfoWindow>
            );
          })()}

          {selectedMarker?.kind === 'emergency' && (() => {
            const inc = selectedMarker.incident;
            const cell = cellCoordMap.get(inc.cellId);
            const lat = typeof inc.lat === 'number' ? inc.lat : cell?.lat ?? center[0];
            const lon = typeof inc.lon === 'number' ? inc.lon : cell?.lon ?? center[1];
            return (
              <InfoWindow
                position={{ lat, lng: lon }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1 text-xs text-[#1B2A38] max-w-[240px] space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-[#0B3B3C]">{inc.code}</span>
                    {inc.isSimulated && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                        SIMULATED
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-[#991B1B] text-[9px] font-bold">
                      {inc.state.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="font-semibold capitalize">
                    {inc.category.replace('_', ' ')} · {inc.siteName}
                  </div>
                  <p className="text-[11px] text-[#5B687A] line-clamp-2">{inc.description}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/command?incidentId=${inc.id}`)}
                    className="inline-flex items-center gap-1 bg-[#0F766E] hover:bg-[#0B5A54] text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    <span>Open in Live Operations</span>
                  </button>
                </div>
              </InfoWindow>
            );
          })()}

          {selectedMarker?.kind === 'news' &&
            typeof selectedMarker.incident.lat === 'number' &&
            typeof selectedMarker.incident.lon === 'number' && (
              <InfoWindow
                position={{
                  lat: selectedMarker.incident.lat,
                  lng: selectedMarker.incident.lon,
                }}
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-1 text-xs max-w-[240px] space-y-1">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                    {selectedMarker.incident.isCommunityReported
                      ? 'Community Report'
                      : 'News-Derived (Unverified)'}
                  </span>
                  <h5 className="font-bold text-[#1B2A38] text-xs leading-snug">
                    {selectedMarker.incident.title}
                  </h5>
                  <div className="text-[10px] text-[#5B687A]">
                    Date: {selectedMarker.incident.date} • {selectedMarker.incident.source}
                  </div>
                  {selectedMarker.incident.url && (
                    <a
                      href={selectedMarker.incident.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[#0F766E] font-medium text-[11px] hover:underline"
                    >
                      View Source Article →
                    </a>
                  )}
                </div>
              </InfoWindow>
            )}
        </GoogleMap>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        scrollWheelZoom={true}
        preferCanvas={filteredSites.length > 60}
        className="h-full w-full"
      >
        <LeafletMapController center={center} zoom={zoom} />

        <TileLayer
          attribution="&copy; Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
        />

        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={18}
          opacity={0.85}
        />

        {activeLayers.environmental &&
          filteredSites.map((site) => {
            const risk = siteRisks.get(site.id);
            const score = risk?.score || 40;
            const radius = 1200 + score * 20;
            const color = getRiskTierColor(risk?.tier, score);
            return (
              <Circle
                key={`env-${site.id}`}
                center={[site.lat, site.lon]}
                radius={radius}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.18,
                  color: color,
                  weight: 1,
                  opacity: 0.4,
                }}
              />
            );
          })}

        {activeLayers.rescueCells &&
          rescueCells.map((cell) => (
            <Circle
              key={`cell-${cell.id}`}
              center={[cell.lat, cell.lon]}
              radius={Math.max(180, Math.min(cell.radiusMeters || 350, 1200))}
              pathOptions={{
                fillColor: '#0F766E',
                fillOpacity: 0.1,
                color: '#0F766E',
                weight: 1.5,
                dashArray: '4 4',
              }}
            />
          ))}

        {(activeLayers.risk || activeLayers.forecast || activeLayers.cluster) &&
          filteredSites.map((site, idx) => {
            const risk = siteRisks.get(site.id);
            const score = risk?.score || 42;
            const tier = risk?.tier || 'Low';
            const isHigh = score >= 70;
            const isHighlighted = highlightedSiteId === site.id;

            const icon = createCustomPin(
              score,
              tier,
              activeLayers.cluster,
              idx,
              isHigh,
              isHighlighted
            );

            return (
              <Marker
                key={site.id}
                position={[site.lat, site.lon]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelectSite && onSelectSite(site),
                }}
              >
                <Popup className="glass-map-popup" closeButton={false} minWidth={260} maxWidth={280}>
                  <div className="p-3 bg-[#FBF8F3]/95 backdrop-blur-md rounded-2xl border border-[#E9E1D3] shadow-xl text-[#1B2A38]">
                    <div className="relative mb-2">
                      <SatelliteThumbnail
                        lat={site.lat}
                        lon={site.lon}
                        altText={site.name}
                        className="w-full h-24 rounded-xl"
                      />
                      <div className="absolute top-2 right-2">
                        <TierBadge tier={tier} size="sm" />
                      </div>
                    </div>

                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-[#1B2A38] leading-tight">
                          {site.name}
                        </h4>
                        <div className="text-[10px] text-[#5B687A] flex items-center gap-1 mt-0.5 font-mono">
                          <Navigation className="w-2.5 h-2.5" />
                          {site.lat.toFixed(4)}° N, {site.lon.toFixed(4)}° E
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-extrabold text-[#0B3B3C]">
                          {score}
                          <span className="text-[10px] font-normal text-[#5B687A]">/100</span>
                        </div>
                        <span className="text-[9px] text-[#5B687A] uppercase font-semibold">
                          Risk Score
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-[#E9E1D3]/80 flex items-center justify-between">
                      <span className="text-[11px] text-[#5B687A]">
                        {site.lifeguardPresent ? 'Lifeguard on duty' : 'Unpatrolled water'}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/water-bodies/${site.id}`)}
                        className="inline-flex items-center gap-1 bg-[#0F766E] hover:bg-[#0B5A54] text-white text-xs font-medium px-3 py-1.5 rounded-xl shadow-xs transition-colors"
                      >
                        View Details
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {activeLayers.incident &&
          activeEmergencyPins.map(({ inc, lat, lon }) => (
            <Marker
              key={`ops-${inc.id}`}
              position={[lat, lon]}
              icon={createSosPin(highlightedIncidentId === inc.id, inc.isSimulated)}
              eventHandlers={{
                click: () => onSelectEmergencyIncident?.(inc),
              }}
            >
              <Popup minWidth={240}>
                <div className="p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-[#0B3B3C]">{inc.code}</span>
                    {inc.isSimulated && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[9px]">
                        SIMULATED
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-[#991B1B] font-bold text-[9px]">
                      {inc.state.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h5 className="font-bold text-[#1B2A38] capitalize">
                    {inc.category.replace('_', ' ')} · {inc.siteName}
                  </h5>
                  <p className="text-[11px] text-[#5B687A]">{inc.description}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/command?incidentId=${inc.id}`)}
                    className="inline-flex items-center gap-1 text-[#0F766E] font-semibold hover:underline"
                  >
                    Open in Live Operations →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

        {activeLayers.incident &&
          incidents.map((inc) => {
            if (!inc.lat || !inc.lon) return null;
            return (
              <Marker
                key={inc.id}
                position={[inc.lat, inc.lon]}
                icon={createIncidentPin(inc.severity)}
              >
                <Popup minWidth={240}>
                  <div className="p-2.5 text-xs">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px] mb-1">
                      {inc.isCommunityReported ? 'Community Report' : 'News-Derived (Unverified)'}
                    </span>
                    <h5 className="font-bold text-[#1B2A38] text-xs">{inc.title}</h5>
                    <div className="text-[10px] text-[#5B687A] mt-1">
                      Date: {inc.date} • Source: {inc.source}
                    </div>
                    {inc.url && (
                      <a
                        href={inc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-[#0F766E] font-medium text-[11px] hover:underline"
                      >
                        View Source Article →
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>

      {/* Subtle fallback map notice */}
      <div
        role="status"
        aria-live="polite"
        title={fallbackReason || 'Using Leaflet satellite fallback tiles'}
        className="absolute bottom-3 right-3 z-[900] px-2.5 py-1 rounded-full bg-[#FFFBEB]/95 border border-[#FDE68A] text-[10px] font-semibold text-[#92400E] shadow-xs pointer-events-auto"
      >
        Using fallback map
      </div>
    </div>
  );
};
