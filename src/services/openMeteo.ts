import { fetchJson } from './fetchJson';
import { EnvironmentalFactors } from '../types';

export interface WeatherApiResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation: number[];
    weather_code: number[];
    visibility: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    uv_index: number[];
  };
}

export interface MarineApiResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly?: {
    time: string[];
    wave_height: (number | null)[];
    wave_period: (number | null)[];
    wave_direction: (number | null)[];
    swell_wave_height: (number | null)[];
    swell_wave_period: (number | null)[];
    wind_wave_height: (number | null)[];
    ocean_current_velocity: (number | null)[];
    sea_surface_temperature: (number | null)[];
    sea_level_height_msl: (number | null)[];
  };
}

export interface FloodApiResponse {
  latitude: number;
  longitude: number;
  daily?: {
    time: string[];
    river_discharge: (number | null)[];
  };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherApiResponse> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,visibility,wind_speed_10m,wind_gusts_10m,uv_index&past_days=7&forecast_days=7&timezone=auto`;
  return fetchJson<WeatherApiResponse>(url, { cacheTtlMs: 1000 * 60 * 30 });
}

export async function fetchBatchWeather(coords: Array<{ lat: number; lon: number }>): Promise<WeatherApiResponse[]> {
  if (coords.length === 0) return [];
  if (coords.length === 1) {
    const single = await fetchWeather(coords[0].lat, coords[0].lon);
    return [single];
  }
  const lats = coords.map((c) => c.lat.toFixed(4)).join(',');
  const lons = coords.map((c) => c.lon.toFixed(4)).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,visibility,wind_speed_10m,wind_gusts_10m,uv_index&past_days=7&forecast_days=7&timezone=auto`;
  const res = await fetchJson<WeatherApiResponse | WeatherApiResponse[]>(url, { cacheTtlMs: 1000 * 60 * 30 });
  return Array.isArray(res) ? res : [res];
}

export async function fetchMarine(lat: number, lon: number): Promise<MarineApiResponse | null> {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,wind_wave_height,ocean_current_velocity,sea_surface_temperature,sea_level_height_msl&past_days=7&forecast_days=7&timezone=auto`;
  try {
    return await fetchJson<MarineApiResponse>(url, { cacheTtlMs: 1000 * 60 * 30 });
  } catch (err) {
    return null;
  }
}

export async function fetchBatchMarine(coords: Array<{ lat: number; lon: number }>): Promise<Array<MarineApiResponse | null>> {
  if (coords.length === 0) return [];
  if (coords.length === 1) {
    const single = await fetchMarine(coords[0].lat, coords[0].lon);
    return [single];
  }
  const lats = coords.map((c) => c.lat.toFixed(4)).join(',');
  const lons = coords.map((c) => c.lon.toFixed(4)).join(',');
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,wind_wave_height,ocean_current_velocity,sea_surface_temperature,sea_level_height_msl&past_days=7&forecast_days=7&timezone=auto`;
  try {
    const res = await fetchJson<MarineApiResponse | MarineApiResponse[]>(url, { cacheTtlMs: 1000 * 60 * 30 });
    return Array.isArray(res) ? res : [res];
  } catch {
    return coords.map(() => null);
  }
}

export async function fetchRiverDischarge(lat: number, lon: number): Promise<FloodApiResponse | null> {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=river_discharge&past_days=30&forecast_days=7`;
  try {
    return await fetchJson<FloodApiResponse>(url, { cacheTtlMs: 1000 * 60 * 60 * 6 });
  } catch {
    return null;
  }
}

export function extractCurrentFactors(
  weather: WeatherApiResponse,
  marine: MarineApiResponse | null,
  flood: FloodApiResponse | null,
  isCoastal: boolean
): EnvironmentalFactors {
  const now = new Date();
  const times = weather.hourly.time;
  
  let currentIndex = -1;
  const currentIsoPrefix = now.toISOString().slice(0, 13);

  for (let i = 0; i < times.length; i++) {
    if (times[i].startsWith(currentIsoPrefix)) {
      currentIndex = i;
      break;
    }
  }

  if (currentIndex === -1) {
    currentIndex = Math.min(Math.floor(times.length / 2), times.length - 1);
  }

  let rainfall24h = 0;
  let rainfall72h = 0;
  const rainArray = weather.hourly.precipitation || [];
  const start24 = Math.max(0, currentIndex - 24);
  const start72 = Math.max(0, currentIndex - 72);

  for (let i = start24; i <= currentIndex; i++) {
    rainfall24h += rainArray[i] || 0;
  }
  for (let i = start72; i <= currentIndex; i++) {
    rainfall72h += rainArray[i] || 0;
  }

  let riverDischargeAnomaly = 0;
  if (flood?.daily?.river_discharge) {
    const validDischarges = flood.daily.river_discharge.filter((v): v is number => v !== null && v !== undefined);
    if (validDischarges.length > 5) {
      const mean = validDischarges.reduce((a, b) => a + b, 0) / validDischarges.length;
      const latest = validDischarges[validDischarges.length - 1] || mean;
      if (mean > 0) {
        riverDischargeAnomaly = Math.max(-100, Math.min(300, ((latest - mean) / mean) * 100));
      }
    }
  }

  let waveHeight: number | undefined;
  let wavePeriod: number | undefined;
  let waveDirection: number | undefined;
  let swellHeight: number | undefined;
  let swellPeriod: number | undefined;
  let windWaveHeight: number | undefined;
  let oceanCurrentVelocity: number | undefined;
  let seaSurfaceTemp: number | undefined;
  let seaLevelMsl: number | undefined;

  if (isCoastal && marine?.hourly) {
    const mTimes = marine.hourly.time || [];
    let mIndex = currentIndex;
    if (mTimes.length !== times.length) {
      mIndex = mTimes.findIndex(t => t.startsWith(currentIsoPrefix));
      if (mIndex === -1) mIndex = 0;
    }

    waveHeight = marine.hourly.wave_height?.[mIndex] ?? undefined;
    wavePeriod = marine.hourly.wave_period?.[mIndex] ?? undefined;
    waveDirection = marine.hourly.wave_direction?.[mIndex] ?? undefined;
    swellHeight = marine.hourly.swell_wave_height?.[mIndex] ?? undefined;
    swellPeriod = marine.hourly.swell_wave_period?.[mIndex] ?? undefined;
    windWaveHeight = marine.hourly.wind_wave_height?.[mIndex] ?? undefined;
    oceanCurrentVelocity = marine.hourly.ocean_current_velocity?.[mIndex] ?? undefined;
    seaSurfaceTemp = marine.hourly.sea_surface_temperature?.[mIndex] ?? undefined;
    seaLevelMsl = marine.hourly.sea_level_height_msl?.[mIndex] ?? undefined;
  }

  return {
    timestamp: times[currentIndex] || now.toISOString(),
    waveHeight,
    wavePeriod,
    waveDirection,
    swellHeight,
    swellPeriod,
    windWaveHeight,
    oceanCurrentVelocity,
    seaSurfaceTemp,
    seaLevelMsl,
    temperature: weather.hourly.temperature_2m?.[currentIndex],
    relativeHumidity: weather.hourly.relative_humidity_2m?.[currentIndex],
    precipitation: weather.hourly.precipitation?.[currentIndex],
    rainfall24h: Math.round(rainfall24h * 10) / 10,
    rainfall72h: Math.round(rainfall72h * 10) / 10,
    visibility: weather.hourly.visibility?.[currentIndex],
    windSpeed: weather.hourly.wind_speed_10m?.[currentIndex],
    windGusts: weather.hourly.wind_gusts_10m?.[currentIndex],
    weatherCode: weather.hourly.weather_code?.[currentIndex],
    uvIndex: weather.hourly.uv_index?.[currentIndex],
    riverDischargeAnomaly,
    isLive: true,
  };
}
