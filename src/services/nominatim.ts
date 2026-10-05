import { fetchJson } from './fetchJson';

export interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
}

let lastRequestTime = 0;

async function throttleNominatim(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastRequestTime = Date.now();
}

export async function searchLocationNominatim(query: string): Promise<NominatimPlace[]> {
  if (!query || query.trim().length < 2) return [];
  await throttleNominatim();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&limit=5&addressdetails=1`;

  try {
    return await fetchJson<NominatimPlace[]>(url, {
      cacheTtlMs: 1000 * 60 * 60 * 24 * 7,
      headers: {
        'Accept-Language': 'en',
      },
    });
  } catch (err) {
    return [];
  }
}

export async function reverseGeocodeNominatim(lat: number, lon: number): Promise<string> {
  await throttleNominatim();
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  try {
    const data = await fetchJson<any>(url, {
      cacheTtlMs: 1000 * 60 * 60 * 24 * 7,
    });
    return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}
