import type {
  EnvironmentalSnapshot,
  EnvironmentalVariableReading,
} from '../../src/types/medicalHandoff.ts';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 5000;

interface CacheEntry {
  expiresAt: number;
  snapshot: EnvironmentalSnapshot;
}

const envCache = new Map<string, CacheEntry>();

function unavailableReading(unit: string, note: string): EnvironmentalVariableReading {
  return { value: null, unit, available: false, note };
}

function reading(
  raw: number | null | undefined,
  unit: string,
  missingNote: string
): EnvironmentalVariableReading {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { value: Math.round(raw * 100) / 100, unit, available: true };
  }
  return unavailableReading(unit, missingNote);
}

async function fetchWithTimeout(
  url: string
): Promise<{ status: 'ok'; data: any } | { status: 'timeout' | 'rate_limited' | 'unavailable' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429) {
      return { status: 'rate_limited' };
    }
    if (!res.ok) {
      return { status: 'unavailable' };
    }
    const data = await res.json();
    return { status: 'ok', data };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { status: 'timeout' };
    }
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEnvironmentalConditionsForIncident(
  lat: number | null,
  lon: number | null,
  options?: { bypassCache?: boolean }
): Promise<EnvironmentalSnapshot> {
  const fetchedAt = new Date().toISOString();

  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return {
      fetchedAt,
      observationTime: null,
      latitude: null,
      longitude: null,
      sources: [],
      weatherStatus: 'unavailable',
      marineStatus: 'unavailable',
      windSpeedKmh: unavailableReading('km/h', 'Incident coordinates unavailable'),
      windDirectionDeg: unavailableReading('°', 'Incident coordinates unavailable'),
      precipitationMm: unavailableReading('mm', 'Incident coordinates unavailable'),
      airTemperatureC: unavailableReading('°C', 'Incident coordinates unavailable'),
      relativeHumidityPct: unavailableReading('%', 'Incident coordinates unavailable'),
      waveHeightM: unavailableReading('m', 'Incident coordinates unavailable'),
      wavePeriodS: unavailableReading('s', 'Incident coordinates unavailable'),
      seaSurfaceTemperatureC: unavailableReading('°C', 'Incident coordinates unavailable'),
      unavailableFields: [
        'windSpeedKmh',
        'windDirectionDeg',
        'precipitationMm',
        'airTemperatureC',
        'relativeHumidityPct',
        'waveHeightM',
        'wavePeriodS',
        'seaSurfaceTemperatureC',
      ],
    };
  }

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (!options?.bypassCache) {
    const cached = envCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }
  }

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m&timezone=UTC`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=wave_height,wave_period,sea_surface_temperature&timezone=UTC`;

  const [weatherRes, marineRes] = await Promise.all([
    fetchWithTimeout(weatherUrl),
    fetchWithTimeout(marineUrl),
  ]);

  const sources: string[] = [];
  let observationTime: string | null = null;

  let windSpeedKmh = unavailableReading('km/h', `Weather API ${weatherRes.status}`);
  let windDirectionDeg = unavailableReading('°', `Weather API ${weatherRes.status}`);
  let precipitationMm = unavailableReading('mm', `Weather API ${weatherRes.status}`);
  let airTemperatureC = unavailableReading('°C', `Weather API ${weatherRes.status}`);
  let relativeHumidityPct = unavailableReading('%', `Weather API ${weatherRes.status}`);

  if (weatherRes.status === 'ok' && weatherRes.data?.current) {
    sources.push('Open-Meteo Forecast API (api.open-meteo.com)');
    const c = weatherRes.data.current;
    if (typeof c.time === 'string') observationTime = c.time;
    windSpeedKmh = reading(c.wind_speed_10m, 'km/h', 'Not provided by Open-Meteo Forecast API');
    windDirectionDeg = reading(
      c.wind_direction_10m,
      '°',
      'Not provided by Open-Meteo Forecast API'
    );
    precipitationMm = reading(c.precipitation, 'mm', 'Not provided by Open-Meteo Forecast API');
    airTemperatureC = reading(c.temperature_2m, '°C', 'Not provided by Open-Meteo Forecast API');
    relativeHumidityPct = reading(
      c.relative_humidity_2m,
      '%',
      'Not provided by Open-Meteo Forecast API'
    );
  }

  let waveHeightM = unavailableReading('m', `Marine API ${marineRes.status}`);
  let wavePeriodS = unavailableReading('s', `Marine API ${marineRes.status}`);
  let seaSurfaceTemperatureC = unavailableReading('°C', `Marine API ${marineRes.status}`);

  if (marineRes.status === 'ok' && marineRes.data?.current) {
    sources.push('Open-Meteo Marine API (marine-api.open-meteo.com)');
    const m = marineRes.data.current;
    if (!observationTime && typeof m.time === 'string') observationTime = m.time;
    waveHeightM = reading(m.wave_height, 'm', 'Marine wave height unavailable for coordinates');
    wavePeriodS = reading(m.wave_period, 's', 'Marine wave period unavailable for coordinates');
    seaSurfaceTemperatureC = reading(
      m.sea_surface_temperature,
      '°C',
      'Sea surface temperature unavailable for coordinates'
    );
  }

  const fieldEntries: Array<[string, EnvironmentalVariableReading]> = [
    ['windSpeedKmh', windSpeedKmh],
    ['windDirectionDeg', windDirectionDeg],
    ['precipitationMm', precipitationMm],
    ['airTemperatureC', airTemperatureC],
    ['relativeHumidityPct', relativeHumidityPct],
    ['waveHeightM', waveHeightM],
    ['wavePeriodS', wavePeriodS],
    ['seaSurfaceTemperatureC', seaSurfaceTemperatureC],
  ];

  const unavailableFields = fieldEntries
    .filter(([, r]) => !r.available)
    .map(([k]) => k);

  const snapshot: EnvironmentalSnapshot = {
    fetchedAt,
    observationTime,
    latitude: lat,
    longitude: lon,
    sources,
    weatherStatus: weatherRes.status,
    marineStatus: marineRes.status,
    windSpeedKmh,
    windDirectionDeg,
    precipitationMm,
    airTemperatureC,
    relativeHumidityPct,
    waveHeightM,
    wavePeriodS,
    seaSurfaceTemperatureC,
    unavailableFields,
  };

  if (weatherRes.status === 'ok' || marineRes.status === 'ok') {
    envCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, snapshot });
  }

  return snapshot;
}
