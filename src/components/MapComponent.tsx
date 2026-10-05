import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { WaterBody, RiskCalculationResult, Incident } from '../types';
import { TierBadge } from './TierBadge';
import { SatelliteThumbnail } from './SatelliteThumbnail';
import { ExternalLink, Navigation } from 'lucide-react';

interface MapComponentProps {
  center: [number, number];
  zoom?: number;
  sites: WaterBody[];
  siteRisks: Map<string, RiskCalculationResult>;
  incidents?: Incident[];
  activeLayers: {
    risk: boolean;
    forecast: boolean;
    cluster: boolean;
    incident: boolean;
    environmental: boolean;
  };
  filterType?: string;
  filterRisk?: string;
  highlightedSiteId?: string;
  onSelectSite?: (site: WaterBody) => void;
  className?: string;
}

const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
};

function createCustomPin(
  score: number,
  tier: string,
  isCluster: boolean = false,
  clusterId: number = 0,
  isHigh: boolean = false
) {
  let bgColor = '#2F855A';
  if (isCluster) {
    const clusterColors = ['#0F766E', '#1E3A8A', '#B5654A', '#8B5CF6'];
    bgColor = clusterColors[clusterId % clusterColors.length];
  } else if (tier === 'Severe') {
    bgColor = '#991B1B';
  } else if (tier === 'High') {
    bgColor = '#D65A4A';
  } else if (tier === 'Medium') {
    bgColor = '#E9A03B';
  }

  const pulseClass = isHigh ? 'pulse-high-risk' : '';

  const html = `
    <div class="relative flex items-center justify-center">
      <div class="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center font-bold text-xs text-white ${pulseClass}" style="background-color: ${bgColor};">
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
      ⚠️
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

export const MapComponent: React.FC<MapComponentProps> = ({
  center,
  zoom = 12,
  sites,
  siteRisks,
  incidents = [],
  activeLayers,
  filterType = 'all',
  filterRisk = 'all',
  onSelectSite,
  className = 'h-full w-full',
}) => {
  const navigate = useNavigate();

  const filteredSites = sites.filter((site) => {
    if (filterType !== 'all' && site.type !== filterType) return false;
    const risk = siteRisks.get(site.id);
    const score = risk?.score || 40;
    if (filterRisk === 'high' && score < 70) return false;
    if (filterRisk === 'medium' && (score < 35 || score >= 70)) return false;
    if (filterRisk === 'low' && score >= 35) return false;
    return true;
  });

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
        <MapController center={center} zoom={zoom} />

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
            const color = score >= 70 ? '#D65A4A' : score >= 35 ? '#E9A03B' : '#2F855A';
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

        {(activeLayers.risk || activeLayers.forecast || activeLayers.cluster) &&
          filteredSites.map((site) => {
            const risk = siteRisks.get(site.id);
            const score = risk?.score || 42;
            const tier = risk?.tier || 'Low';
            const isHigh = score >= 70;

            const icon = createCustomPin(score, tier, activeLayers.cluster, 0, isHigh);

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
                        rel="noreferrer"
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
    </div>
  );
};
