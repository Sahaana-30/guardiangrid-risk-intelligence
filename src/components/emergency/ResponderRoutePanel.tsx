import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AdvancedMarker, Map as GoogleMap } from '@vis.gl/react-google-maps';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Layers,
  LocateFixed,
  Navigation,
  RefreshCw,
  Route,
} from 'lucide-react';
import type { EmergencyIncident, RescueCell, ResponderProfile } from '../../types/emergency';
import type { ComputedRouteResult, GoogleMapViewType, LatLngPoint } from '../../types/maps';
import { GoogleMapsProvider, useGoogleMapsStatus } from '../maps/GoogleMapsProvider';
import { GoogleMapBoundsFitter, GoogleMapPolyline } from '../maps/GoogleMapOverlays';
import { computeRouteApi } from '../../services/mapsApi';
import {
  buildGoogleMapsDirectionsUrl,
  decodeEncodedPolyline,
  haversineMeters,
} from '../../utils/polyline';

interface ResponderRoutePanelProps {
  incident: EmergencyIncident;
  cell: RescueCell | null;
  responderGps: { lat: number; lon: number } | null;
  responderProfile: ResponderProfile | null;
  gloveMode: boolean;
  gpsStatus?: 'idle' | 'locating' | 'ready' | 'error';
  onRefreshGps?: () => void;
}

const MiniLeafletRouteMap: React.FC<{
  origin: LatLngPoint | null;
  destination: LatLngPoint;
  routePath: LatLngPoint[];
}> = ({ origin, destination, routePath }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [destination.lat, destination.lng],
      zoom: 14,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const bounds: L.LatLngExpression[] = [[destination.lat, destination.lng]];

    L.circleMarker([destination.lat, destination.lng], {
      radius: 9,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#DC2626',
      fillOpacity: 0.95,
    }).addTo(group);

    if (origin) {
      L.circleMarker([origin.lat, origin.lng], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor: '#0F766E',
        fillOpacity: 0.95,
      }).addTo(group);
      bounds.push([origin.lat, origin.lng]);
    }

    if (routePath.length > 1) {
      L.polyline(
        routePath.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#0F766E', weight: 4, opacity: 0.9 }
      ).addTo(group);
    } else if (origin) {
      L.polyline(
        [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ],
        { color: '#0F766E', weight: 2.5, dashArray: '5 4', opacity: 0.75 }
      ).addTo(group);
    }

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 15 });
    } else {
      map.setView([destination.lat, destination.lng], 14);
    }
  }, [origin?.lat, origin?.lng, destination.lat, destination.lng, routePath]);

  return <div ref={containerRef} className="w-full h-52 z-0 rounded-xl overflow-hidden" />;
};

const ResponderRoutePanelInner: React.FC<ResponderRoutePanelProps> = ({
  incident,
  cell,
  responderGps,
  responderProfile,
  gloveMode,
  gpsStatus = 'idle',
  onRefreshGps,
}) => {
  const { useGoogleMaps, mapId, fallbackReason } = useGoogleMapsStatus();
  const [expanded, setExpanded] = useState(true);
  const [mapType, setMapType] = useState<GoogleMapViewType>('hybrid');
  const [forceLeaflet, setForceLeaflet] = useState(false);
  const [route, setRoute] = useState<ComputedRouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCalcRef = useRef<{ incidentId: string; lat: number; lon: number; at: number } | null>(
    null
  );

  const destLat = incident.lat ?? cell?.lat ?? 13.05;
  const destLon = incident.lon ?? cell?.lon ?? 80.2824;

  const originPoint = useMemo<LatLngPoint | null>(() => {
    if (responderGps) return { lat: responderGps.lat, lng: responderGps.lon };
    if (
      responderProfile &&
      typeof responderProfile.lat === 'number' &&
      typeof responderProfile.lon === 'number'
    ) {
      return { lat: responderProfile.lat, lng: responderProfile.lon };
    }
    return null;
  }, [responderGps, responderProfile]);

  const computeRoute = async (force = false) => {
    if (!originPoint) return;
    const now = Date.now();
    const prev = lastCalcRef.current;
    if (!force && prev && prev.incidentId === incident.id) {
      const moved = haversineMeters(prev.lat, prev.lon, originPoint.lat, originPoint.lng);
      if (moved < 150 && now - prev.at < 30000) return;
    }

    lastCalcRef.current = {
      incidentId: incident.id,
      lat: originPoint.lat,
      lon: originPoint.lng,
      at: now,
    };

    setLoading(true);
    setError(null);
    try {
      const result = await computeRouteApi({
        origin: { lat: originPoint.lat, lon: originPoint.lng },
        destination: { lat: destLat, lon: destLon },
        travelMode: 'DRIVE',
        regionId: incident.regionId,
        roleHeader: 'RESPONDER',
      });
      setRoute(result);
    } catch (err: any) {
      setError(err?.message || 'Unable to compute live route. Use external Google Maps navigation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!expanded || !originPoint) return;
    void computeRoute(false);
  }, [expanded, incident.id, originPoint?.lat, originPoint?.lng, destLat, destLon]);

  const routePath = useMemo(() => {
    if (route?.encodedPolyline) {
      return decodeEncodedPolyline(route.encodedPolyline);
    }
    return [];
  }, [route]);

  const externalNavUrl = buildGoogleMapsDirectionsUrl({
    originLat: originPoint?.lat ?? null,
    originLon: originPoint?.lng ?? null,
    destinationLat: destLat,
    destinationLon: destLon,
    travelMode: 'driving',
  });

  const boundsPoints = useMemo<LatLngPoint[]>(() => {
    const pts: LatLngPoint[] = [{ lat: destLat, lng: destLon }];
    if (originPoint) pts.push(originPoint);
    return pts;
  }, [destLat, destLon, originPoint]);

  return (
    <section className="rounded-2xl border-2 border-[#0B3B3C]/20 bg-white overflow-hidden shadow-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-4 ${
          gloveMode ? 'py-4' : 'py-3'
        } bg-[#FBF8F3] hover:bg-[#F3ECE0] transition-colors text-left`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#0B3B3C] text-white flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className={`font-bold text-[#0B3B3C] ${gloveMode ? 'text-base' : 'text-sm'}`}>
              Navigation &amp; Route to Incident
            </p>
            <p className="text-xs text-[#5B687A] truncate">
              {route
                ? `${route.distanceText} · ${route.durationText}${route.trafficAware ? ' (live traffic)' : ''}`
                : `${destLat.toFixed(4)}, ${destLon.toFixed(4)} · Tap to view route & turn-by-turn`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E9E1D3] text-[#0B3B3C]">
            {useGoogleMaps ? 'Google Maps' : 'Leaflet'}
          </span>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-[#0B3B3C]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#0B3B3C]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-3 border-t border-[#E9E1D3]">
          {/* ETA + External Turn-by-Turn Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Route className="w-4 h-4 text-[#0F766E]" />
              {loading ? (
                <span className="text-[#5B687A]">Calculating route...</span>
              ) : route ? (
                <span className="font-bold text-[#0B3B3C]">
                  {route.distanceText} ·{' '}
                  <span className="inline-flex items-center gap-1 text-[#0F766E]">
                    <Clock className="w-3.5 h-3.5" />
                    {route.durationText}
                  </span>
                </span>
              ) : (
                <span className="text-[#5B687A]">
                  {originPoint
                    ? 'Route preview ready'
                    : 'Acquire GPS to calculate live distance & ETA'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onRefreshGps && (
                <button
                  type="button"
                  onClick={onRefreshGps}
                  disabled={gpsStatus === 'locating'}
                  className={`inline-flex items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white font-semibold text-[#0B3B3C] hover:bg-[#FBF8F3] disabled:opacity-50 ${
                    gloveMode ? 'px-3 py-2.5 text-xs' : 'px-2.5 py-1.5 text-xs'
                  }`}
                >
                  <LocateFixed className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>{gpsStatus === 'locating' ? 'Locating...' : 'Update GPS'}</span>
                </button>
              )}
              {originPoint && (
                <button
                  type="button"
                  onClick={() => void computeRoute(true)}
                  disabled={loading}
                  className={`inline-flex items-center gap-1 rounded-lg border border-[#E9E1D3] bg-[#FBF8F3] font-semibold text-[#0B3B3C] hover:bg-[#F3ECE0] disabled:opacity-50 ${
                    gloveMode ? 'px-3 py-2.5 text-xs' : 'px-2.5 py-1.5 text-xs'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Recalculate</span>
                </button>
              )}
              <a
                href={externalNavUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5A54] text-white font-bold shadow-xs ${
                  gloveMode ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs'
                }`}
              >
                <Navigation className="w-4 h-4" />
                <span>Open in Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {useGoogleMaps && (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="inline-flex rounded-lg border border-[#E9E1D3] overflow-hidden font-semibold">
                {(['hybrid', 'roadmap'] as GoogleMapViewType[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setForceLeaflet(false);
                      setMapType(mode);
                    }}
                    className={`px-2.5 py-1 capitalize ${
                      !forceLeaflet && mapType === mode
                        ? 'bg-[#0B3B3C] text-white'
                        : 'bg-white text-[#5B687A]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setForceLeaflet((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] font-semibold"
              >
                <Layers className="w-3 h-3" />
                <span>{forceLeaflet ? 'Use Google Maps' : 'Leaflet Fallback'}</span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
              {error}
            </div>
          )}

          {/* Embedded Route Map (Google Maps primary / Leaflet fallback) */}
          {useGoogleMaps && !forceLeaflet ? (
            <div className="w-full h-52 rounded-xl overflow-hidden border border-[#E9E1D3]">
              <GoogleMap
                mapId={mapId}
                mapTypeId={mapType}
                defaultCenter={{ lat: destLat, lng: destLon }}
                defaultZoom={14}
                gestureHandling="cooperative"
                streetViewControl={false}
                mapTypeControl={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                className="w-full h-full"
              >
                <GoogleMapBoundsFitter points={boundsPoints} maxZoom={15} />

                {routePath.length > 1 ? (
                  <GoogleMapPolyline path={routePath} strokeColor="#0F766E" strokeWeight={4.5} />
                ) : (
                  originPoint && (
                    <GoogleMapPolyline
                      path={[originPoint, { lat: destLat, lng: destLon }]}
                      strokeColor="#0F766E"
                      strokeWeight={3}
                      dashed
                    />
                  )
                )}

                <AdvancedMarker position={{ lat: destLat, lng: destLon }} title={incident.code}>
                  <div className="w-7 h-7 rounded-full bg-[#DC2626] border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-extrabold">
                    SOS
                  </div>
                </AdvancedMarker>

                {originPoint && (
                  <AdvancedMarker position={originPoint} title="Your Position">
                    <div className="px-2 py-0.5 rounded-full bg-[#0F766E] border-2 border-white shadow-lg text-white text-[10px] font-bold">
                      YOU
                    </div>
                  </AdvancedMarker>
                )}
              </GoogleMap>
            </div>
          ) : (
            <MiniLeafletRouteMap
              origin={originPoint}
              destination={{ lat: destLat, lng: destLon }}
              routePath={routePath}
            />
          )}

          {!useGoogleMaps && fallbackReason && (
            <p className="text-[11px] text-[#92400E]">{fallbackReason}</p>
          )}
        </div>
      )}
    </section>
  );
};

export const ResponderRoutePanel: React.FC<ResponderRoutePanelProps> = (props) => {
  return (
    <GoogleMapsProvider>
      <ResponderRoutePanelInner {...props} />
    </GoogleMapsProvider>
  );
};
