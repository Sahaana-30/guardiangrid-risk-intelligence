export type GoogleMapViewType = 'hybrid' | 'roadmap' | 'satellite';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface NearbyHospital {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  phoneNumber?: string | null;
  openNow?: boolean | null;
  googleMapsUri?: string | null;
  directionsUri?: string | null;
  primaryType?: string | null;
}

export interface NearbyHospitalsResponse {
  configured: boolean;
  source: 'google_places_new' | 'unavailable';
  cached: boolean;
  hospitals: NearbyHospital[];
  disclaimer: string;
  warning?: string;
}

export interface ComputedRouteResult {
  configured: boolean;
  source: 'google_routes_api' | 'straight_line_fallback';
  cached: boolean;
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds?: number | null;
  durationText: string;
  distanceText: string;
  encodedPolyline: string | null;
  routeDescription?: string | null;
  trafficAware: boolean;
  disclaimer: string;
  warning?: string;
}

export interface EtaMatrixEntry {
  originIndex: number;
  destinationIndex: number;
  originId?: string;
  destinationId?: string;
  distanceMeters: number;
  durationSeconds: number;
  durationText: string;
  distanceText: string;
  status: 'OK' | 'FALLBACK' | 'UNAVAILABLE';
}

export interface EtaMatrixResponse {
  configured: boolean;
  source: 'google_routes_matrix' | 'straight_line_fallback';
  cached: boolean;
  entries: EtaMatrixEntry[];
  disclaimer: string;
  warning?: string;
}

export interface ReverseGeocodeResponse {
  source: 'google_geocoding' | 'nominatim_fallback' | 'coordinates_only';
  cached: boolean;
  formattedAddress: string;
  lat: number;
  lon: number;
}

export interface PublicHospitalContext {
  nearestHospital: NearbyHospital | null;
  incidentToHospitalRoute: ComputedRouteResult | null;
  responderToIncidentRoute?: ComputedRouteResult | null;
  disclaimer: string;
}
