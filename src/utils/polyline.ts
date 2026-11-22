import type { LatLngPoint } from '../types/maps';

/**
 * Decodes a Google Maps encoded polyline string into an array of { lat, lng } coordinates.
 */
export function decodeEncodedPolyline(encoded: string): LatLngPoint[] {
  if (!encoded) return [];
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Computes great-circle distance in meters between two WGS84 points.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return '<1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} hr ${rem} min` : `${hrs} hr`;
}

/**
 * Builds an official Google Maps turn-by-turn external navigation URL.
 */
export function buildGoogleMapsDirectionsUrl(params: {
  destinationLat: number;
  destinationLon: number;
  originLat?: number | null;
  originLon?: number | null;
  travelMode?: 'driving' | 'walking' | 'two-wheeler';
}): string {
  const search = new URLSearchParams({
    api: '1',
    destination: `${params.destinationLat.toFixed(6)},${params.destinationLon.toFixed(6)}`,
    travelmode: params.travelMode || 'driving',
  });
  if (
    typeof params.originLat === 'number' &&
    Number.isFinite(params.originLat) &&
    typeof params.originLon === 'number' &&
    Number.isFinite(params.originLon)
  ) {
    search.set('origin', `${params.originLat.toFixed(6)},${params.originLon.toFixed(6)}`);
  }
  return `https://www.google.com/maps/dir/?${search.toString()}`;
}
