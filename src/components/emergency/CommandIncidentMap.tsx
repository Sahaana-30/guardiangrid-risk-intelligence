import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AdvancedMarker, InfoWindow, Map as GoogleMap } from '@vis.gl/react-google-maps';
import { Building2, Clock, ExternalLink, Layers, Navigation, Route, ShieldAlert } from 'lucide-react';
import type { EmergencyIncident, RescueCell, ResponderProfile } from '../../types/emergency';
import type {
  ComputedRouteResult,
  GoogleMapViewType,
  LatLngPoint,
  NearbyHospital,
} from '../../types/maps';
import { GoogleMapsProvider, useGoogleMapsStatus } from '../maps/GoogleMapsProvider';
import {
  GoogleMapBoundsFitter,
  GoogleMapCircle,
  GoogleMapPolyline,
} from '../maps/GoogleMapOverlays';
import { computeRouteApi, fetchNearbyHospitalsApi } from '../../services/mapsApi';
import {
  buildGoogleMapsDirectionsUrl,
  decodeEncodedPolyline,
  formatDistanceMeters,
  haversineMeters,
} from '../../utils/polyline';

interface CommandIncidentMapProps {
  incident: EmergencyIncident;
  responders: ResponderProfile[];
  cells: RescueCell[];
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function responderColor(availability: ResponderProfile['availability']): string {
  if (availability === 'on_scene') return '#D65A4A';
  if (availability === 'dispatched') return '#D97706';
  return '#0F766E';
}

interface LeafletFallbackProps {
  incident: EmergencyIncident;
  cell: RescueCell | null;
  centerLat: number;
  centerLon: number;
  visibleResponders: ResponderProfile[];
  assignedSet: Set<string>;
  hospitals: NearbyHospital[];
  responderRoutePath: LatLngPoint[];
  hospitalRoutePath: LatLngPoint[];
}

const LeafletFallbackMap: React.FC<LeafletFallbackProps> = ({
  incident,
  cell,
  centerLat,
  centerLon,
  visibleResponders,
  assignedSet,
  hospitals,
  responderRoutePath,
  hospitalRoutePath,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLon],
      zoom: 14,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    if (cell) {
      L.circle([cell.lat, cell.lon], {
        radius: Math.max(150, Math.min(cell.radiusMeters || 350, 1500)),
        color: '#0F766E',
        weight: 1.5,
        fillColor: '#0F766E',
        fillOpacity: 0.08,
        dashArray: '5 4',
      })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;">
            <strong>${escapeHtml(cell.id)}</strong> · ${escapeHtml(cell.siteName)}<br/>
            <span>${escapeHtml(cell.label)}</span>
          </div>`
        )
        .addTo(group);
      bounds.push([cell.lat, cell.lon]);
    }

    if (responderRoutePath.length > 1) {
      L.polyline(
        responderRoutePath.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#0F766E', weight: 3.5, opacity: 0.85 }
      ).addTo(group);
    }

    if (hospitalRoutePath.length > 1) {
      L.polyline(
        hospitalRoutePath.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#2563EB', weight: 3, dashArray: '6 4', opacity: 0.8 }
      ).addTo(group);
    }

    for (const h of hospitals) {
      L.circleMarker([h.lat, h.lng], {
        radius: 7,
        color: '#FFFFFF',
        weight: 2,
        fillColor: '#2563EB',
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;">
            <strong>🏥 ${escapeHtml(h.name)}</strong><br/>
            <span>${escapeHtml(h.address)}</span><br/>
            <span>${formatDistanceMeters(h.distanceMeters)} from incident</span>
          </div>`
        )
        .addTo(group);
    }

    const incMarker = L.circleMarker([centerLat, centerLon], {
      radius: 10,
      color: '#FFFFFF',
      weight: 2.5,
      fillColor: '#D65A4A',
      fillOpacity: 0.95,
    })
      .bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;">
          <strong>${escapeHtml(incident.code)}</strong> (${escapeHtml(incident.state)})<br/>
          <span>${escapeHtml(incident.category.replace('_', ' '))} · ${escapeHtml(incident.cellId)}</span><br/>
          <span style="font-family:monospace;font-size:11px;">${centerLat.toFixed(5)}, ${centerLon.toFixed(5)}</span>
        </div>`
      )
      .addTo(group);
    incMarker.bringToFront();
    bounds.push([centerLat, centerLon]);

    for (const r of visibleResponders) {
      if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
      const isAssigned = assignedSet.has(r.id);
      const fill = responderColor(r.availability);

      L.circleMarker([r.lat, r.lon], {
        radius: isAssigned ? 8 : 6,
        color: isAssigned ? '#0B3B3C' : '#FFFFFF',
        weight: isAssigned ? 2.5 : 1.5,
        fillColor: fill,
        fillOpacity: 0.92,
      })
        .bindPopup(
          `<div style="font-family:sans-serif;font-size:12px;">
            <strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.radioCallsign)})<br/>
            <span>Status: <strong>${escapeHtml(r.availability.replace('_', ' ').toUpperCase())}</strong>${
              isAssigned ? ' · Assigned' : ''
            }</span><br/>
            <span style="font-family:monospace;font-size:11px;">${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}</span>
          </div>`
        )
        .addTo(group);

      if (isAssigned) {
        if (responderRoutePath.length < 2) {
          L.polyline(
            [
              [r.lat, r.lon],
              [centerLat, centerLon],
            ],
            { color: '#0F766E', weight: 1.5, dashArray: '4 4', opacity: 0.65 }
          ).addTo(group);
        }
        bounds.push([r.lat, r.lon]);
      }
    }

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 15 });
    } else {
      map.setView([centerLat, centerLon], 14);
    }
  }, [
    incident,
    cell,
    centerLat,
    centerLon,
    visibleResponders,
    assignedSet,
    hospitals,
    responderRoutePath,
    hospitalRoutePath,
  ]);

  return <div ref={containerRef} className="w-full h-64 sm:h-72 z-0" />;
};

type SelectedInfo =
  | { kind: 'incident' }
  | { kind: 'responder'; responder: ResponderProfile }
  | { kind: 'hospital'; hospital: NearbyHospital }
  | null;

const CommandIncidentMapInner: React.FC<CommandIncidentMapProps> = ({
  incident,
  responders,
  cells,
}) => {
  const { useGoogleMaps, mapId, fallbackReason } = useGoogleMapsStatus();
  const [mapType, setMapType] = useState<GoogleMapViewType>('hybrid');
  const [forceLeaflet, setForceLeaflet] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo>(null);

  const [hospitals, setHospitals] = useState<NearbyHospital[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalsWarning, setHospitalsWarning] = useState<string | null>(null);
  const [showHospitals, setShowHospitals] = useState(true);

  const [responderRoute, setResponderRoute] = useState<ComputedRouteResult | null>(null);
  const [hospitalRoute, setHospitalRoute] = useState<ComputedRouteResult | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  // Throttling refs so 4-second live polling never spams Routes API or Places API
  const lastHospitalsKeyRef = useRef<string>('');
  const lastResponderRouteRef = useRef<{
    incidentId: string;
    lat: number;
    lon: number;
    at: number;
  } | null>(null);

  const cell = useMemo(
    () => cells.find((c) => c.id === incident.cellId) || null,
    [cells, incident.cellId]
  );
  const centerLat = incident.lat ?? cell?.lat ?? 13.05;
  const centerLon = incident.lon ?? cell?.lon ?? 80.2824;

  const assignedSet = useMemo(
    () => new Set(incident.assignedResponderIds || []),
    [incident.assignedResponderIds]
  );

  const visibleResponders = useMemo(
    () =>
      responders.filter(
        (r) =>
          assignedSet.has(r.id) ||
          (incident.regionId && r.regionId === incident.regionId) ||
          r.homeCellId === incident.cellId
      ),
    [responders, assignedSet, incident.regionId, incident.cellId]
  );

  const assignedResponders = useMemo(
    () => responders.filter((r) => assignedSet.has(r.id)),
    [responders, assignedSet]
  );

  const primaryResponder = assignedResponders[0] || null;

  // Fetch nearby hospitals once per incident coordinate grid (~110m)
  useEffect(() => {
    const coordKey = `${incident.id}:${centerLat.toFixed(3)},${centerLon.toFixed(3)}`;
    if (lastHospitalsKeyRef.current === coordKey) return;
    lastHospitalsKeyRef.current = coordKey;

    let cancelled = false;
    setHospitalsLoading(true);
    setHospitalsWarning(null);
    setSelectedHospitalId(null);
    setHospitalRoute(null);

    fetchNearbyHospitalsApi({
      lat: centerLat,
      lon: centerLon,
      radiusMeters: 12000,
      limit: 5,
      regionId: incident.regionId,
      roleHeader: 'DISPATCHER',
    })
      .then((res) => {
        if (cancelled) return;
        setHospitals(res.hospitals || []);
        if (res.warning) setHospitalsWarning(res.warning);
        if (res.hospitals?.[0]) {
          setSelectedHospitalId(res.hospitals[0].placeId);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setHospitals([]);
        setHospitalsWarning(err?.message || 'Nearby hospital lookup unavailable.');
      })
      .finally(() => {
        if (!cancelled) setHospitalsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [incident.id, centerLat, centerLon]);

  // Compute primary assigned responder -> incident route (throttled: >150m movement OR >30s elapsed)
  useEffect(() => {
    if (
      !primaryResponder ||
      typeof primaryResponder.lat !== 'number' ||
      typeof primaryResponder.lon !== 'number'
    ) {
      setResponderRoute(null);
      return;
    }

    const now = Date.now();
    const prev = lastResponderRouteRef.current;
    if (prev && prev.incidentId === incident.id) {
      const moved = haversineMeters(prev.lat, prev.lon, primaryResponder.lat, primaryResponder.lon);
      if (moved < 150 && now - prev.at < 30000) {
        return;
      }
    }

    lastResponderRouteRef.current = {
      incidentId: incident.id,
      lat: primaryResponder.lat,
      lon: primaryResponder.lon,
      at: now,
    };

    let cancelled = false;
    computeRouteApi({
      origin: { lat: primaryResponder.lat, lon: primaryResponder.lon },
      destination: { lat: centerLat, lon: centerLon },
      travelMode: 'DRIVE',
      regionId: incident.regionId,
      roleHeader: 'DISPATCHER',
    })
      .then((route) => {
        if (!cancelled) setResponderRoute(route);
      })
      .catch(() => {
        if (!cancelled) setResponderRoute(null);
      });

    return () => {
      cancelled = true;
    };
  }, [incident.id, primaryResponder?.id, primaryResponder?.lat, primaryResponder?.lon, centerLat, centerLon]);

  // Compute incident -> selected hospital route
  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.placeId === selectedHospitalId) || hospitals[0] || null,
    [hospitals, selectedHospitalId]
  );

  useEffect(() => {
    if (!selectedHospital || !showHospitals) {
      setHospitalRoute(null);
      return;
    }
    let cancelled = false;
    computeRouteApi({
      origin: { lat: centerLat, lon: centerLon },
      destination: { lat: selectedHospital.lat, lon: selectedHospital.lng },
      travelMode: 'DRIVE',
      regionId: incident.regionId,
      roleHeader: 'DISPATCHER',
    })
      .then((route) => {
        if (!cancelled) setHospitalRoute(route);
      })
      .catch(() => {
        if (!cancelled) setHospitalRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedHospital?.placeId, centerLat, centerLon, showHospitals]);

  const responderRoutePath = useMemo(() => {
    if (responderRoute?.encodedPolyline) {
      return decodeEncodedPolyline(responderRoute.encodedPolyline);
    }
    return [];
  }, [responderRoute]);

  const hospitalRoutePath = useMemo(() => {
    if (hospitalRoute?.encodedPolyline) {
      return decodeEncodedPolyline(hospitalRoute.encodedPolyline);
    }
    return [];
  }, [hospitalRoute]);

  const boundsPoints = useMemo<LatLngPoint[]>(() => {
    const pts: LatLngPoint[] = [{ lat: centerLat, lng: centerLon }];
    if (cell) pts.push({ lat: cell.lat, lng: cell.lon });
    assignedResponders.forEach((r) => {
      if (typeof r.lat === 'number' && typeof r.lon === 'number') {
        pts.push({ lat: r.lat, lng: r.lon });
      }
    });
    return pts;
  }, [centerLat, centerLon, cell, assignedResponders]);

  const renderGoogle = useGoogleMaps && !forceLeaflet;

  return (
    <section className="rounded-xl border border-[#E9E1D3] bg-white overflow-hidden">
      {/* Header & Map Type Controls */}
      <div className="px-4 py-2.5 border-b border-[#E9E1D3] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#0B3B3C]">
            Live Tactical Incident &amp; Responder Map
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              renderGoogle
                ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]'
                : 'bg-[#FBF8F3] text-[#5B687A] border border-[#E9E1D3]'
            }`}
          >
            {renderGoogle ? `Google Maps · ${mapType}` : 'Leaflet Fallback'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {renderGoogle && (
            <div className="inline-flex rounded-lg border border-[#E9E1D3] overflow-hidden text-[11px] font-semibold">
              {(['hybrid', 'satellite', 'roadmap'] as GoogleMapViewType[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMapType(mode)}
                  className={`px-2 py-1 capitalize transition-colors ${
                    mapType === mode
                      ? 'bg-[#0B3B3C] text-white'
                      : 'bg-white text-[#5B687A] hover:bg-[#FBF8F3]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowHospitals((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
              showHospitals
                ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]'
                : 'bg-white border-[#E9E1D3] text-[#5B687A]'
            }`}
          >
            <Building2 className="w-3 h-3" />
            <span>Hospitals ({hospitals.length})</span>
          </button>

          {useGoogleMaps && (
            <button
              type="button"
              onClick={() => setForceLeaflet((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E9E1D3] bg-white hover:bg-[#FBF8F3] text-[11px] font-semibold text-[#5B687A]"
              title="Toggle between Google Maps and Leaflet fallback"
            >
              <Layers className="w-3 h-3" />
              <span>{forceLeaflet ? 'Use Google Maps' : 'Leaflet'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Legend + Responder Route ETA Strip */}
      <div className="px-4 py-1.5 border-b border-[#E9E1D3] bg-[#FBF8F3] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5B687A]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D65A4A] inline-block" />
            Incident / On Scene
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706] inline-block" />
            Dispatched / En Route
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E] inline-block" />
            Available Unit
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] inline-block" />
            Hospital
          </span>
        </div>

        {responderRoute && primaryResponder && (
          <div className="inline-flex items-center gap-2 font-semibold text-[#0B3B3C]">
            <Route className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>
              {primaryResponder.radioCallsign} → Scene: {responderRoute.distanceText} ·{' '}
              {responderRoute.durationText}
              {responderRoute.trafficAware ? ' (traffic-aware)' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Map Viewport (Google Maps Primary / Leaflet Fallback) */}
      {renderGoogle ? (
        <div className="w-full h-64 sm:h-72 relative">
          <GoogleMap
            mapId={mapId}
            mapTypeId={mapType}
            defaultCenter={{ lat: centerLat, lng: centerLon }}
            defaultZoom={14}
            gestureHandling="cooperative"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
          >
            <GoogleMapBoundsFitter points={boundsPoints} maxZoom={15} />

            {/* Rescue Cell Perimeter */}
            {cell && (
              <GoogleMapCircle
                center={{ lat: cell.lat, lng: cell.lon }}
                radius={Math.max(150, Math.min(cell.radiusMeters || 350, 1500))}
                strokeColor="#0F766E"
                fillColor="#0F766E"
                fillOpacity={0.12}
              />
            )}

            {/* Responder-to-Incident Route Polyline */}
            {responderRoutePath.length > 1 ? (
              <GoogleMapPolyline
                path={responderRoutePath}
                strokeColor="#0F766E"
                strokeWeight={4}
              />
            ) : (
              assignedResponders.map((r) =>
                typeof r.lat === 'number' && typeof r.lon === 'number' ? (
                  <GoogleMapPolyline
                    key={`assign-line-${r.id}`}
                    path={[
                      { lat: r.lat, lng: r.lon },
                      { lat: centerLat, lng: centerLon },
                    ]}
                    strokeColor="#0F766E"
                    strokeWeight={2.5}
                    dashed
                  />
                ) : null
              )
            )}

            {/* Incident-to-Hospital Route Polyline */}
            {showHospitals && hospitalRoutePath.length > 1 && (
              <GoogleMapPolyline
                path={hospitalRoutePath}
                strokeColor="#2563EB"
                strokeWeight={3.5}
                dashed
              />
            )}

            {/* Active Incident Marker */}
            <AdvancedMarker
              position={{ lat: centerLat, lng: centerLon }}
              title={`${incident.code} (${incident.state})`}
              onClick={() => setSelectedInfo({ kind: 'incident' })}
              zIndex={30}
            >
              <div className="w-7 h-7 rounded-full bg-[#D65A4A] border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-extrabold">
                SOS
              </div>
            </AdvancedMarker>

            {/* Live Responder Markers */}
            {visibleResponders.map((r) => {
              if (typeof r.lat !== 'number' || typeof r.lon !== 'number') return null;
              const isAssigned = assignedSet.has(r.id);
              const bg = responderColor(r.availability);
              return (
                <AdvancedMarker
                  key={r.id}
                  position={{ lat: r.lat, lng: r.lon }}
                  title={`${r.name} (${r.radioCallsign})`}
                  onClick={() => setSelectedInfo({ kind: 'responder', responder: r })}
                  zIndex={isAssigned ? 25 : 15}
                >
                  <div
                    className={`px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold shadow-md border-2 ${
                      isAssigned ? 'border-[#0B3B3C]' : 'border-white'
                    }`}
                    style={{ backgroundColor: bg }}
                  >
                    {r.radioCallsign}
                  </div>
                </AdvancedMarker>
              );
            })}

            {/* Nearby Hospital Markers */}
            {showHospitals &&
              hospitals.map((h) => {
                const isSelected = selectedHospital?.placeId === h.placeId;
                return (
                  <AdvancedMarker
                    key={h.placeId}
                    position={{ lat: h.lat, lng: h.lng }}
                    title={h.name}
                    onClick={() => {
                      setSelectedHospitalId(h.placeId);
                      setSelectedInfo({ kind: 'hospital', hospital: h });
                    }}
                    zIndex={isSelected ? 22 : 12}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-extrabold shadow-md border-2 ${
                        isSelected
                          ? 'bg-[#1D4ED8] border-[#FEF08A] scale-110'
                          : 'bg-[#2563EB] border-white'
                      }`}
                    >
                      H
                    </div>
                  </AdvancedMarker>
                );
              })}

            {/* InfoWindows */}
            {selectedInfo?.kind === 'incident' && (
              <InfoWindow
                position={{ lat: centerLat, lng: centerLon }}
                onCloseClick={() => setSelectedInfo(null)}
              >
                <div className="text-xs text-[#1B2A38] space-y-0.5 max-w-[220px]">
                  <p className="font-bold text-[#991B1B]">
                    {incident.code} ({incident.state})
                  </p>
                  <p>
                    {incident.category.replace('_', ' ')} · {incident.cellId}
                  </p>
                  <p className="font-mono text-[10px] text-[#5B687A]">
                    {centerLat.toFixed(5)}, {centerLon.toFixed(5)}
                  </p>
                </div>
              </InfoWindow>
            )}

            {selectedInfo?.kind === 'responder' && (
              <InfoWindow
                position={{
                  lat: selectedInfo.responder.lat,
                  lng: selectedInfo.responder.lon,
                }}
                onCloseClick={() => setSelectedInfo(null)}
              >
                <div className="text-xs text-[#1B2A38] space-y-0.5 max-w-[220px]">
                  <p className="font-bold">
                    {selectedInfo.responder.name} ({selectedInfo.responder.radioCallsign})
                  </p>
                  <p>
                    Status:{' '}
                    <strong>{selectedInfo.responder.availability.replace('_', ' ').toUpperCase()}</strong>
                  </p>
                  <p className="font-mono text-[10px] text-[#5B687A]">
                    {selectedInfo.responder.lat.toFixed(5)}, {selectedInfo.responder.lon.toFixed(5)}
                  </p>
                </div>
              </InfoWindow>
            )}

            {selectedInfo?.kind === 'hospital' && (
              <InfoWindow
                position={{
                  lat: selectedInfo.hospital.lat,
                  lng: selectedInfo.hospital.lng,
                }}
                onCloseClick={() => setSelectedInfo(null)}
              >
                <div className="text-xs text-[#1B2A38] space-y-1 max-w-[240px]">
                  <p className="font-bold text-[#1D4ED8]">{selectedInfo.hospital.name}</p>
                  <p className="text-[11px] text-[#5B687A]">{selectedInfo.hospital.address}</p>
                  <p className="text-[11px] font-semibold">
                    {formatDistanceMeters(selectedInfo.hospital.distanceMeters)} from scene
                  </p>
                  {selectedInfo.hospital.phoneNumber && (
                    <p className="font-mono text-[11px]">{selectedInfo.hospital.phoneNumber}</p>
                  )}
                  <a
                    href={
                      selectedInfo.hospital.directionsUri ||
                      buildGoogleMapsDirectionsUrl({
                        originLat: centerLat,
                        originLon: centerLon,
                        destinationLat: selectedInfo.hospital.lat,
                        destinationLon: selectedInfo.hospital.lng,
                      })
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#0F766E] font-semibold hover:underline"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>Open Directions</span>
                  </a>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>
      ) : (
        <LeafletFallbackMap
          incident={incident}
          cell={cell}
          centerLat={centerLat}
          centerLon={centerLon}
          visibleResponders={visibleResponders}
          assignedSet={assignedSet}
          hospitals={showHospitals ? hospitals : []}
          responderRoutePath={responderRoutePath}
          hospitalRoutePath={showHospitals ? hospitalRoutePath : []}
        />
      )}

      {/* Fallback notice if Google Maps unavailable */}
      {!renderGoogle && fallbackReason && (
        <div className="px-4 py-1.5 bg-[#FFFBEB] border-t border-[#FDE68A] text-[11px] text-[#92400E]">
          {fallbackReason}
        </div>
      )}

      {/* Assigned Units Strip */}
      {assignedResponders.length > 0 && (
        <div className="px-4 py-2 border-t border-[#E9E1D3] bg-[#FBF8F3] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5B687A]">
          <span className="font-semibold text-[#0B3B3C]">Assigned Units:</span>
          {assignedResponders.map((r) => (
            <span key={r.id} className="font-mono">
              {r.radioCallsign} ({r.availability.replace('_', ' ')}) · {r.lat.toFixed(4)},{' '}
              {r.lon.toFixed(4)}
            </span>
          ))}
        </div>
      )}

      {/* Nearby Hospitals Decision-Support Strip */}
      {showHospitals && (
        <div className="px-4 py-2.5 border-t border-[#E9E1D3] bg-white space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-[#0B3B3C] inline-flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Nearby Hospitals &amp; Trauma Facilities</span>
            </span>
            {hospitalRoute && selectedHospital && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1D4ED8]">
                <Clock className="w-3 h-3" />
                <span>
                  Scene → {selectedHospital.name}: {hospitalRoute.distanceText} ·{' '}
                  {hospitalRoute.durationText}
                </span>
              </span>
            )}
          </div>

          {hospitalsLoading ? (
            <p className="text-[11px] text-[#5B687A]">Searching nearby hospitals...</p>
          ) : hospitals.length === 0 ? (
            <p className="text-[11px] text-[#5B687A]">
              {hospitalsWarning || 'No nearby hospital results returned for these coordinates.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {hospitals.slice(0, 3).map((h) => {
                const active = selectedHospital?.placeId === h.placeId;
                return (
                  <button
                    key={h.placeId}
                    type="button"
                    onClick={() => setSelectedHospitalId(h.placeId)}
                    className={`text-left p-2 rounded-lg border transition-colors ${
                      active
                        ? 'bg-[#EFF6FF] border-[#93C5FD]'
                        : 'bg-[#FBF8F3] border-[#E9E1D3] hover:border-[#0F766E]/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-[#1B2A38] text-[11px] line-clamp-1">
                        {h.name}
                      </span>
                      <span className="font-mono text-[10px] text-[#1D4ED8] shrink-0">
                        {formatDistanceMeters(h.distanceMeters)}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#5B687A] line-clamp-1 mt-0.5">{h.address}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-[#5B687A]">
                        {h.openNow === true
                          ? 'Open now'
                          : h.openNow === false
                            ? 'May be closed'
                            : 'Verify hours'}
                      </span>
                      <a
                        href={
                          h.directionsUri ||
                          buildGoogleMapsDirectionsUrl({
                            originLat: centerLat,
                            originLon: centerLon,
                            destinationLat: h.lat,
                            destinationLon: h.lng,
                          })
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-[#0F766E] font-semibold hover:underline"
                      >
                        <span>Maps</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-[#78350F] flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-[#B45309] shrink-0" />
            <span>
              Decision-support only. Dispatcher must confirm hospital destination and ambulance
              availability; GuardianGrid does not auto-dispatch ambulances.
            </span>
          </p>
        </div>
      )}
    </section>
  );
};

export const CommandIncidentMap: React.FC<CommandIncidentMapProps> = (props) => {
  return (
    <GoogleMapsProvider>
      <CommandIncidentMapInner {...props} />
    </GoogleMapsProvider>
  );
};
