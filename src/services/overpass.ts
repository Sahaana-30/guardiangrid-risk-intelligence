import { WaterBody, WaterBodyType } from '../types';
import { fetchJson } from './fetchJson';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

let lastOverpassTime = 0;

async function throttleOverpass(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastOverpassTime;
  if (timeSinceLast < 1500) {
    await new Promise((resolve) => setTimeout(resolve, 1500 - timeSinceLast));
  }
  lastOverpassTime = Date.now();
}

export async function discoverWaterBodiesOverpass(
  bbox: [number, number, number, number],
  regionName: string
): Promise<WaterBody[]> {
  await throttleOverpass();
  const [south, west, north, east] = bbox;
  const query = `
    [out:json][timeout:25];
    (
      node["natural"="beach"](${south},${west},${north},${east});
      way["natural"="beach"](${south},${west},${north},${east});
      relation["natural"="beach"](${south},${west},${north},${east});
      
      way["natural"="water"]["water"~"lake|reservoir"](${south},${west},${north},${east});
      relation["natural"="water"]["water"~"lake|reservoir"](${south},${west},${north},${east});
      
      way["waterway"="river"](${south},${west},${north},${east});
    );
    out center tags 30;
  `.trim();

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const data = await fetchJson<OverpassResponse>(url, {
      cacheTtlMs: 1000 * 60 * 60 * 24,
      timeoutMs: 15000,
    });

    const results: WaterBody[] = [];

    for (const elem of data.elements) {
      const lat = elem.lat ?? elem.center?.lat;
      const lon = elem.lon ?? elem.center?.lon;
      const name = elem.tags?.name || elem.tags?.['name:en'];

      if (!lat || !lon || !name) continue;

      let type: WaterBodyType = 'beach';
      let isCoastal = true;

      if (elem.tags?.natural === 'beach') {
        type = 'beach';
        isCoastal = true;
      } else if (elem.tags?.water === 'reservoir') {
        type = 'reservoir';
        isCoastal = false;
      } else if (elem.tags?.water === 'lake' || elem.tags?.natural === 'water') {
        type = 'lake';
        isCoastal = false;
      } else if (elem.tags?.waterway === 'river') {
        type = 'river';
        isCoastal = true;
      }

      results.push({
        id: `osm-${elem.type}-${elem.id}`,
        name,
        type,
        lat,
        lon,
        region: regionName,
        isCoastal,
        osmTags: elem.tags,
        lifeguardPresent: elem.tags?.emergency === 'lifeguard_station' || elem.tags?.lifeguard === 'yes',
        infrastructureIndex: 50,
        source: 'overpass',
      });
    }

    return results;
  } catch (err) {
    console.warn('[Overpass] Water body discovery failed, using seeds:', err);
    return [];
  }
}

export async function fetchInfrastructureIndex(
  lat: number,
  lon: number
): Promise<{
  index: number;
  counts: {
    lifeguardStations: number;
    hospitals: number;
    police: number;
    fireStations: number;
    emergencyPhones: number;
  };
}> {
  await throttleOverpass();
  const delta = 0.045;
  const south = lat - delta;
  const north = lat + delta;
  const west = lon - delta;
  const east = lon + delta;

  const query = `
    [out:json][timeout:20];
    (
      node["emergency"="lifeguard_station"](${south},${west},${north},${east});
      node["amenity"="hospital"](${south},${west},${north},${east});
      node["amenity"="police"](${south},${west},${north},${east});
      node["amenity"="fire_station"](${south},${west},${north},${east});
      node["emergency"="phone"](${south},${west},${north},${east});
    );
    out tags 50;
  `.trim();

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const data = await fetchJson<OverpassResponse>(url, {
      cacheTtlMs: 1000 * 60 * 60 * 24,
      timeoutMs: 12000,
    });

    let lifeguardStations = 0;
    let hospitals = 0;
    let police = 0;
    let fireStations = 0;
    let emergencyPhones = 0;

    for (const el of data.elements) {
      if (el.tags?.emergency === 'lifeguard_station') lifeguardStations++;
      if (el.tags?.amenity === 'hospital') hospitals++;
      if (el.tags?.amenity === 'police') police++;
      if (el.tags?.amenity === 'fire_station') fireStations++;
      if (el.tags?.emergency === 'phone') emergencyPhones++;
    }

    const rawScore =
      Math.min(10, lifeguardStations * 3.5) +
      Math.min(10, hospitals * 2.0) +
      Math.min(10, police * 2.0) +
      Math.min(10, fireStations * 2.5) +
      Math.min(10, emergencyPhones * 2.5);

    const index = Math.round(Math.min(100, Math.max(15, rawScore * 2)));

    return {
      index,
      counts: { lifeguardStations, hospitals, police, fireStations, emergencyPhones },
    };
  } catch (err) {
    return {
      index: 50,
      counts: { lifeguardStations: 0, hospitals: 2, police: 2, fireStations: 1, emergencyPhones: 0 },
    };
  }
}

export function mergeAndDeduplicateSites(seeds: WaterBody[], discovered: WaterBody[]): WaterBody[] {
  const merged: WaterBody[] = [...seeds];

  for (const disc of discovered) {
    const exists = merged.some((existing) => {
      if (existing.name.toLowerCase() === disc.name.toLowerCase()) return true;
      const dist = haversineDistanceMeters(existing.lat, existing.lon, disc.lat, disc.lon);
      return dist < 400;
    });

    if (!exists) {
      merged.push(disc);
    }
  }

  return merged.slice(0, 40);
}
