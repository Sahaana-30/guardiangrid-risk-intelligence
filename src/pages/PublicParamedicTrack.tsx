import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import L from 'leaflet';
import { AdvancedMarker, InfoWindow, Map as GoogleMap } from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Building2,
  Clock,
  Compass,
  ExternalLink,
  Layers,
  MapPin,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  ShieldAlert,
  Waves,
  Wind,
} from 'lucide-react';
import { fetchPublicParamedicTrackingApi } from '../services/medicalHandoffApi';
import type { PublicParamedicTrackingPayload } from '../types/medicalHandoff';
import type { GoogleMapViewType, LatLngPoint } from '../types/maps';
import { GoogleMapsProvider, useGoogleMapsStatus } from '../components/maps/GoogleMapsProvider';
import {
  GoogleMapBoundsFitter,
  GoogleMapCircle,
  GoogleMapPolyline,
} from '../components/maps/GoogleMapOverlays';
import {
  buildGoogleMapsDirectionsUrl,
  decodeEncodedPolyline,
  formatDistanceMeters,
} from '../utils/polyline';

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

const PublicLeafletFallbackMap: React.FC<{
  data: PublicParamedicTrackingPayload;
  responderRoutePath: LatLngPoint[];
  hospitalRoutePath: LatLngPoint[];
}> = ({ data, responderRoutePath, hospitalRoutePath }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const lat = data.rescueLocation.lat ?? data.respondersLiveGps[0]?.lat ?? 13.05;
    const lon = data.rescueLocation.lon ?? data.respondersLiveGps[0]?.lon ?? 80.2824;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lon],
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
    const bounds: L.LatLngExpression[] = [];

    if (typeof data.rescueCell.lat === 'number' && typeof data.rescueCell.lon === 'number') {
      L.circle([data.rescueCell.lat, data.rescueCell.lon], {
        radius: Math.max(150, Math.min(data.rescueCell.radiusMeters || 350, 1500)),
        color: '#0F766E',
        weight: 1.5,
        fillColor: '#0F766E',
        fillOpacity: 0.08,
        dashArray: '5 4',
      }).addTo(group);
      bounds.push([data.rescueCell.lat, data.rescueCell.lon]);
    }

    if (responderRoutePath.length > 1) {
      L.polyline(
        responderRoutePath.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#0F766E', weight: 3.5, opacity: 0.9 }
      ).addTo(group);
    }

    if (hospitalRoutePath.length > 1) {
      L.polyline(
        hospitalRoutePath.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#2563EB', weight: 3.5, dashArray: '6 4', opacity: 0.85 }
      ).addTo(group);
    }

    const hospital = data.hospitalContext?.nearestHospital;
    if (hospital) {
      L.circleMarker([hospital.lat, hospital.lng], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor: '#2563EB',
        fillOpacity: 0.95,
      })
        .bindPopup(`<strong>🏥 ${hospital.name}</strong><br/>${hospital.address}`)
        .addTo(group);
      bounds.push([hospital.lat, hospital.lng]);
    }

    if (data.rescueLocation.lat !== null && data.rescueLocation.lon !== null) {
      L.circleMarker([data.rescueLocation.lat, data.rescueLocation.lon], {
        radius: 10,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: '#DC2626',
        fillOpacity: 0.95,
      })
        .bindPopup(`<strong>${data.incidentCode}</strong><br/>Rescue Cell: ${data.rescueCell.cellId}`)
        .addTo(group);
      bounds.push([data.rescueLocation.lat, data.rescueLocation.lon]);
    }

    for (const r of data.respondersLiveGps) {
      L.circleMarker([r.lat, r.lon], {
        radius: 8,
        color: '#0B3B3C',
        weight: 2,
        fillColor: r.availability === 'on_scene' ? '#D65A4A' : '#0F766E',
        fillOpacity: 0.92,
      })
        .bindPopup(`<strong>${r.callsign}</strong><br/>Status: ${r.availability}`)
        .addTo(group);
      bounds.push([r.lat, r.lon]);
    }

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }, [data, hospitalRoutePath]);

  return <div ref={mapContainerRef} className="w-full h-64 sm:h-72 z-0" />;
};

const PublicParamedicTrackInner: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { useGoogleMaps, mapId, fallbackReason } = useGoogleMapsStatus();
  const [data, setData] = useState<PublicParamedicTrackingPayload | null>(null);
  const [lang, setLang] = useState<'en' | 'ta'>('en');
  const [mapType, setMapType] = useState<GoogleMapViewType>('hybrid');
  const [forceLeaflet, setForceLeaflet] = useState(false);
  const [selectedPin, setSelectedPin] = useState<'incident' | 'hospital' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);

  // Enforce noindex and no-referrer meta tags on this public tracking route
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow, noarchive';
    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    document.head.appendChild(robots);
    document.head.appendChild(referrer);
    const prevTitle = document.title;
    document.title = 'GuardianGrid — Read-Only Paramedic Handoff';
    return () => {
      document.head.removeChild(robots);
      document.head.removeChild(referrer);
      document.title = prevTitle;
    };
  }, []);

  const loadSnapshot = useCallback(async () => {
    if (!token) {
      setError('Invalid tracking link.');
      setStopped(true);
      setLoading(false);
      return;
    }
    try {
      const snapshot = await fetchPublicParamedicTrackingApi(token);
      setData(snapshot);
      setError(null);
    } catch (err: any) {
      const status = err?.status;
      setError(err?.message || 'Unable to load tracking link.');
      // Stop polling immediately if revoked, expired, or invalid
      if (status === 410 || status === 404 || status === 403) {
        setData(null);
        setStopped(true);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSnapshot();
    if (stopped) return;
    const interval = window.setInterval(() => {
      void loadSnapshot();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot, stopped]);

  const hospital = data?.hospitalContext?.nearestHospital || null;
  const hospitalRoute = data?.hospitalContext?.incidentToHospitalRoute || null;
  const responderRoute = data?.hospitalContext?.responderToIncidentRoute || null;

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
    if (!data) return [];
    const pts: LatLngPoint[] = [];
    if (data.rescueLocation.lat !== null && data.rescueLocation.lon !== null) {
      pts.push({ lat: data.rescueLocation.lat, lng: data.rescueLocation.lon });
    }
    data.respondersLiveGps.forEach((r) => pts.push({ lat: r.lat, lng: r.lon }));
    if (hospital) pts.push({ lat: hospital.lat, lng: hospital.lng });
    return pts;
  }, [data, hospital]);

  const sbar = data
    ? lang === 'ta'
      ? data.approvedSbar.tamil
      : data.approvedSbar.english
    : null;

  const renderGoogle = useGoogleMaps && !forceLeaflet;
  const centerLat = data?.rescueLocation.lat ?? data?.respondersLiveGps[0]?.lat ?? 13.05;
  const centerLon = data?.rescueLocation.lon ?? data?.respondersLiveGps[0]?.lon ?? 80.2824;

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#1B2A38] py-5 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <header className="bg-[#0B3B3C] text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0F766E] flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#A7F3D0] font-semibold">
                {lang === 'ta'
                  ? 'GuardianGrid · படிக்க மட்டும் 112 / மருத்துவ அவசர ஒப்படைப்பு'
                  : 'GuardianGrid · Read-Only 112 / Paramedic Live Handoff'}
              </p>
              <h1 className="font-serif-heading text-xl font-bold">
                {data ? `${data.incidentCode} · ${data.rescueCell.cellId}` : 'Paramedic Handoff View'}
              </h1>
            </div>
          </div>

          {data && (
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-white/25 overflow-hidden text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1.5 ${lang === 'en' ? 'bg-white text-[#0B3B3C]' : 'text-white'}`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ta')}
                  className={`px-2.5 py-1.5 ${lang === 'ta' ? 'bg-white text-[#0B3B3C]' : 'text-white'}`}
                >
                  தமிழ்
                </button>
              </div>
              <button
                type="button"
                onClick={() => void loadSnapshot()}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Refresh live GPS"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        {loading ? (
          <div className="bg-white rounded-2xl border border-[#E9E1D3] p-10 text-center text-sm text-[#5B687A]">
            {lang === 'ta'
              ? 'பாதுகாப்பான கண்காணிப்பு இணைப்பு சரிபார்க்கப்படுகிறது...'
              : 'Validating secure tracking link...'}
          </div>
        ) : error || !data || !sbar ? (
          <div className="bg-white rounded-2xl border-2 border-[#DC2626]/40 p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-[#DC2626] mx-auto" />
            <h2 className="text-lg font-bold text-[#991B1B]">
              {lang === 'ta' ? 'கண்காணிப்பு இணைப்பு கிடைக்கவில்லை' : 'Tracking Link Unavailable'}
            </h2>
            <p className="text-sm text-[#5B687A] max-w-md mx-auto">
              {error ||
                'This link has expired or been revoked. Live location sharing has stopped.'}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3 text-xs font-semibold">
              <a
                href="tel:112"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#DC2626] text-white"
              >
                <Phone className="w-4 h-4" />
                <span>Call 112</span>
              </a>
              <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                <Radio className="w-4 h-4 text-[#0F766E]" />
                <span>VHF Ch 16</span>
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Mandatory Non-Dispatch & Clinical Disclaimer */}
            <div className="p-3.5 rounded-2xl bg-[#FFFBEB] border border-[#D97706] text-xs text-[#78350F] flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">{data.linkMeta.disclaimer}</p>
                <p>{sbar.medicalDisclaimer}</p>
              </div>
            </div>

            {/* Summary Strip */}
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <p className="font-bold text-sm text-[#0B3B3C]">
                  {data.incidentCategory.replace('_', ' ').toUpperCase()} · Status:{' '}
                  <span className="text-[#0F766E]">{data.incidentStatus}</span>
                </p>
                <p className="text-[#5B687A] flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                    {data.rescueCell.siteName} — {data.rescueCell.cellLabel} (
                    {data.rescueCell.regionName})
                  </span>
                  <span>·</span>
                  <span>VHF: {data.rescueCell.vhfChannel}</span>
                </p>
              </div>

              <div className="text-right space-y-1">
                <span className="inline-block px-2.5 py-1 rounded-lg bg-[#FEF2F2] border border-[#DC2626] text-[#991B1B] font-bold">
                  {data.approvedSbar.severity}
                </span>
                <p className="font-mono text-[11px] text-[#5B687A] flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3" />
                  {lang === 'ta' ? 'இணைப்பு காலாவதி:' : 'Link expires:'}{' '}
                  {formatTime(data.linkMeta.expiresAt)}
                </p>
              </div>
            </section>

            {/* Live Assigned Responder GPS & Hospital Route Map */}
            <section className="bg-white rounded-2xl border border-[#E9E1D3] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#E9E1D3] bg-[#FBF8F3] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0B3B3C]">
                    {lang === 'ta'
                      ? 'நேரடி மீட்பு இடம் & பணியாளர் GPS (5 வினாடி புதுப்பிப்பு)'
                      : 'Live Rescue Location & Assigned Responder GPS (5s Refresh)'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-[#E9E1D3] text-[#0B3B3C]">
                    {renderGoogle ? `Google Maps · ${mapType}` : 'Leaflet Fallback'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {renderGoogle && (
                    <div className="inline-flex rounded-lg border border-[#E9E1D3] overflow-hidden text-[11px] font-semibold">
                      {(['hybrid', 'roadmap'] as GoogleMapViewType[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setMapType(mode)}
                          className={`px-2 py-0.5 capitalize ${
                            mapType === mode
                              ? 'bg-[#0B3B3C] text-white'
                              : 'bg-white text-[#5B687A]'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}
                  {useGoogleMaps && (
                    <button
                      type="button"
                      onClick={() => setForceLeaflet((v) => !v)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#E9E1D3] bg-white text-[11px] font-semibold text-[#5B687A]"
                    >
                      <Layers className="w-3 h-3" />
                      <span>{forceLeaflet ? 'Google' : 'Leaflet'}</span>
                    </button>
                  )}
                  <span className="font-mono text-[11px] text-[#5B687A] hidden sm:inline">
                    {formatTime(data.lastLocationUpdateAt)}
                  </span>
                </div>
              </div>

              {renderGoogle ? (
                <div className="w-full h-64 sm:h-72 relative">
                  <GoogleMap
                    mapId={mapId}
                    mapTypeId={mapType}
                    defaultCenter={{ lat: centerLat, lng: centerLon }}
                    defaultZoom={14}
                    gestureHandling="cooperative"
                    streetViewControl={false}
                    mapTypeControl={false}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    className="w-full h-full"
                  >
                    <GoogleMapBoundsFitter points={boundsPoints} maxZoom={15} />

                    {typeof data.rescueCell.lat === 'number' &&
                      typeof data.rescueCell.lon === 'number' && (
                        <GoogleMapCircle
                          center={{ lat: data.rescueCell.lat, lng: data.rescueCell.lon }}
                          radius={Math.max(150, Math.min(data.rescueCell.radiusMeters || 350, 1500))}
                          strokeColor="#0F766E"
                          fillColor="#0F766E"
                          fillOpacity={0.12}
                        />
                      )}

                    {responderRoutePath.length > 1 && (
                      <GoogleMapPolyline
                        path={responderRoutePath}
                        strokeColor="#0F766E"
                        strokeWeight={4}
                      />
                    )}

                    {hospitalRoutePath.length > 1 && (
                      <GoogleMapPolyline
                        path={hospitalRoutePath}
                        strokeColor="#2563EB"
                        strokeWeight={4}
                        dashed
                      />
                    )}

                    {data.rescueLocation.lat !== null && data.rescueLocation.lon !== null && (
                      <AdvancedMarker
                        position={{ lat: data.rescueLocation.lat, lng: data.rescueLocation.lon }}
                        title={data.incidentCode}
                        onClick={() => setSelectedPin('incident')}
                        zIndex={30}
                      >
                        <div className="w-7 h-7 rounded-full bg-[#DC2626] border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-extrabold">
                          SOS
                        </div>
                      </AdvancedMarker>
                    )}

                    {data.respondersLiveGps.map((r) => (
                      <AdvancedMarker
                        key={r.callsign}
                        position={{ lat: r.lat, lng: r.lon }}
                        title={`${r.callsign} (${r.availability})`}
                        zIndex={25}
                      >
                        <div
                          className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold border-2 border-[#0B3B3C] shadow-md"
                          style={{
                            backgroundColor:
                              r.availability === 'on_scene' ? '#D65A4A' : '#0F766E',
                          }}
                        >
                          {r.callsign}
                        </div>
                      </AdvancedMarker>
                    ))}

                    {hospital && (
                      <AdvancedMarker
                        position={{ lat: hospital.lat, lng: hospital.lng }}
                        title={hospital.name}
                        onClick={() => setSelectedPin('hospital')}
                        zIndex={20}
                      >
                        <div className="w-6 h-6 rounded-lg bg-[#2563EB] border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-extrabold">
                          H
                        </div>
                      </AdvancedMarker>
                    )}

                    {selectedPin === 'incident' &&
                      data.rescueLocation.lat !== null &&
                      data.rescueLocation.lon !== null && (
                        <InfoWindow
                          position={{ lat: data.rescueLocation.lat, lng: data.rescueLocation.lon }}
                          onCloseClick={() => setSelectedPin(null)}
                        >
                          <div className="text-xs text-[#1B2A38]">
                            <p className="font-bold text-[#991B1B]">{data.incidentCode}</p>
                            <p>{data.rescueCell.siteName}</p>
                          </div>
                        </InfoWindow>
                      )}

                    {selectedPin === 'hospital' && hospital && (
                      <InfoWindow
                        position={{ lat: hospital.lat, lng: hospital.lng }}
                        onCloseClick={() => setSelectedPin(null)}
                      >
                        <div className="text-xs text-[#1B2A38] max-w-[220px]">
                          <p className="font-bold text-[#1D4ED8]">{hospital.name}</p>
                          <p className="text-[11px] text-[#5B687A]">{hospital.address}</p>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                </div>
              ) : (
                <PublicLeafletFallbackMap
                  data={data}
                  responderRoutePath={responderRoutePath}
                  hospitalRoutePath={hospitalRoutePath}
                />
              )}

              {!renderGoogle && fallbackReason && (
                <div className="px-4 py-1.5 bg-[#FFFBEB] border-t border-[#FDE68A] text-[11px] text-[#92400E]">
                  {fallbackReason}
                </div>
              )}

              {/* Assigned Responders GPS Strip */}
              <div className="px-4 py-2.5 border-t border-[#E9E1D3] bg-[#FBF8F3] text-[11px] text-[#5B687A] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {data.respondersLiveGps.length === 0 ? (
                    <span>
                      {lang === 'ta'
                        ? 'பணியாளர் GPS தரவு இன்னும் கிடைக்கவில்லை.'
                        : 'No assigned responder GPS coordinates available yet.'}
                    </span>
                  ) : (
                    data.respondersLiveGps.map((r) => (
                      <span key={r.callsign} className="font-mono text-[#1B2A38]">
                        <strong>{r.callsign}</strong> ({r.availability}) · {r.lat.toFixed(5)},{' '}
                        {r.lon.toFixed(5)}
                      </span>
                    ))
                  )}
                </div>

                {data.rescueLocation.lat !== null && data.rescueLocation.lon !== null && (
                  <a
                    href={buildGoogleMapsDirectionsUrl({
                      destinationLat: data.rescueLocation.lat,
                      destinationLon: data.rescueLocation.lon,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#0F766E] font-semibold hover:underline"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>{lang === 'ta' ? 'மீட்பு இடத்திற்கு வழி' : 'Navigate to Scene'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Nearest Hospital & Incident-to-Hospital Route Strip (Informational) */}
              {hospital && (
                <div className="px-4 py-3 border-t border-[#E9E1D3] bg-[#EFF6FF]/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#1D4ED8] flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      <span>
                        {lang === 'ta' ? 'அருகிலுள்ள மருத்துவமனை:' : 'Nearest Hospital Reference:'}{' '}
                        {hospital.name}
                      </span>
                    </p>
                    <p className="text-[11px] text-[#5B687A]">{hospital.address}</p>
                    <p className="text-[11px] font-semibold text-[#1B2A38]">
                      {hospitalRoute
                        ? `${hospitalRoute.distanceText} · ${hospitalRoute.durationText}${
                            hospitalRoute.trafficAware ? ' (traffic-aware)' : ''
                          }`
                        : `${formatDistanceMeters(hospital.distanceMeters)} from scene`}
                      {hospital.phoneNumber ? ` · ${hospital.phoneNumber}` : ''}
                    </p>
                    <p className="text-[10px] text-[#78350F]">
                      {lang === 'ta'
                        ? 'தகவல் உதவி மட்டுமே — மருத்துவமனை ஒப்புதலை அவசர மருத்துவக் குழு உறுதிப்படுத்த வேண்டும்.'
                        : 'Informational only — paramedics and dispatch must confirm receiving hospital availability.'}
                    </p>
                  </div>

                  <a
                    href={
                      hospital.directionsUri ||
                      buildGoogleMapsDirectionsUrl({
                        originLat: data.rescueLocation.lat,
                        originLon: data.rescueLocation.lon,
                        destinationLat: hospital.lat,
                        destinationLon: hospital.lng,
                      })
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-semibold text-xs shrink-0"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{lang === 'ta' ? 'மருத்துவமனை வழி' : 'Hospital Route'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </section>

            {/* Approved Bilingual SBAR */}
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E9E1D3]">
                <h2 className="text-sm font-bold text-[#0B3B3C]">
                  {lang === 'ta'
                    ? `ஒப்புதல் பெற்ற SBAR சுருக்கம் (v${data.approvedSbar.reportVersion})`
                    : `Approved SBAR Summary (v${data.approvedSbar.reportVersion})`}
                </h2>
                <span className="text-[11px] text-[#5B687A]">
                  Approved by {data.approvedSbar.approvedByName} ·{' '}
                  {formatTime(data.approvedSbar.approvedAt)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-1.5">
                  <h3 className="font-bold text-[#0B3B3C]">S — Situation</h3>
                  <p>{sbar.situation.whatHappened}</p>
                  <p>
                    <strong>Condition:</strong> {sbar.situation.currentIncidentCondition}
                  </p>
                  <p>
                    <strong>Victims:</strong> {sbar.situation.victimCount}
                  </p>
                  <p>
                    <strong>Location:</strong> {sbar.situation.currentRescueLocation}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-1.5">
                  <h3 className="font-bold text-[#0B3B3C]">B — Background</h3>
                  <p>{sbar.background.incidentHistory}</p>
                  <p>
                    <strong>Environment:</strong> {sbar.background.environmentalSummary}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-1.5">
                  <h3 className="font-bold text-[#0B3B3C]">A — Preliminary Assessment</h3>
                  <p>
                    <strong>Rationale:</strong> {data.approvedSbar.severityRationale}
                  </p>
                  <p>{sbar.assessment.preliminaryOperationalAssessment}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-1.5">
                  <h3 className="font-bold text-[#0B3B3C]">R — Recommendation &amp; Verify</h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {sbar.recommendation.immediateHandoffInformation.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                  <p className="font-semibold pt-1">Verify on arrival:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {sbar.recommendation.verifyByReceivingMedicalTeam.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {data.approvedSbar.unavailableInformation.length > 0 && (
                <div className="p-3 rounded-xl bg-[#FEF2F2]/70 border border-[#D65A4A]/40 text-[#7F1D1D]">
                  <p className="font-bold mb-1">Missing / Unavailable Information:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {data.approvedSbar.unavailableInformation.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Environmental Hazards */}
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-[#0B3B3C] flex items-center gap-1.5">
                  <Waves className="w-4 h-4 text-[#0F766E]" />
                  <span>Rescue-Site Environmental Hazards</span>
                </h2>
                <span className="font-mono text-[11px] text-[#5B687A]">
                  Obs: {data.environmentalHazards.observationTime || 'Unavailable'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Wind Speed</span>
                  <strong className="flex items-center gap-1">
                    <Wind className="w-3 h-3 text-[#0F766E]" />
                    {data.environmentalHazards.windSpeedKmh.available
                      ? `${data.environmentalHazards.windSpeedKmh.value} km/h`
                      : 'Unavailable'}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Wave Height / Period</span>
                  <strong>
                    {data.environmentalHazards.waveHeightM.available
                      ? `${data.environmentalHazards.waveHeightM.value} m`
                      : 'Unavailable'}
                    {data.environmentalHazards.wavePeriodS.available
                      ? ` / ${data.environmentalHazards.wavePeriodS.value} s`
                      : ''}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Air Temp / Humidity</span>
                  <strong>
                    {data.environmentalHazards.airTemperatureC.available
                      ? `${data.environmentalHazards.airTemperatureC.value}°C`
                      : 'N/A'}{' '}
                    /{' '}
                    {data.environmentalHazards.relativeHumidityPct.available
                      ? `${data.environmentalHazards.relativeHumidityPct.value}%`
                      : 'N/A'}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Sea Surface Temp</span>
                  <strong>
                    {data.environmentalHazards.seaSurfaceTemperatureC.available
                      ? `${data.environmentalHazards.seaSurfaceTemperatureC.value}°C`
                      : 'Unavailable'}
                  </strong>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export const PublicParamedicTrack: React.FC = () => {
  return (
    <GoogleMapsProvider>
      <PublicParamedicTrackInner />
    </GoogleMapsProvider>
  );
};
