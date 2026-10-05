import { calculateRiskScore } from './riskModel';
import {
  EnvironmentalFactors,
  ForecastDay,
  ForecastHour,
  RiskTier,
  SiteForecast,
  WaterBody,
} from '../types';
import { MarineApiResponse, WeatherApiResponse } from '../services/openMeteo';

export function generateSiteForecast(
  site: WaterBody,
  weather: WeatherApiResponse,
  marine: MarineApiResponse | null
): SiteForecast {
  const times = weather.hourly.time;
  const now = new Date();
  const currentIso = now.toISOString().slice(0, 10);

  const dailyGroups: Record<string, { hours: ForecastHour[]; factors: EnvironmentalFactors[] }> = {};
  const hourlyForecast: ForecastHour[] = [];

  for (let i = 0; i < times.length; i++) {
    const tStr = times[i];
    const dateStr = tStr.slice(0, 10);
    const hourStr = tStr.slice(11, 16);

    if (dateStr < currentIso) continue;

    const waveHeight = site.isCoastal ? (marine?.hourly?.wave_height?.[i] ?? undefined) : undefined;
    const wavePeriod = site.isCoastal ? (marine?.hourly?.wave_period?.[i] ?? undefined) : undefined;
    const oceanCurrentVelocity = site.isCoastal
      ? (marine?.hourly?.ocean_current_velocity?.[i] ?? undefined)
      : undefined;
    const seaLevelMsl = site.isCoastal ? (marine?.hourly?.sea_level_height_msl?.[i] ?? undefined) : undefined;
    const rainfall = weather.hourly.precipitation?.[i] ?? 0;
    const windSpeed = weather.hourly.wind_speed_10m?.[i] ?? 0;
    const windGusts = weather.hourly.wind_gusts_10m?.[i] ?? windSpeed * 1.3;
    const weatherCode = weather.hourly.weather_code?.[i] ?? 0;
    const visibility = weather.hourly.visibility?.[i] ?? 10000;

    const hourFactors: EnvironmentalFactors = {
      timestamp: tStr,
      waveHeight,
      wavePeriod,
      oceanCurrentVelocity,
      seaLevelMsl,
      rainfall24h: rainfall * 3,
      rainfall72h: rainfall * 5,
      precipitation: rainfall,
      windSpeed,
      windGusts,
      weatherCode,
      visibility,
      temperature: weather.hourly.temperature_2m?.[i],
      isLive: true,
    };

    const riskRes = calculateRiskScore(site, hourFactors);

    let hourTier: RiskTier = 'Low';
    if (riskRes.score >= 85) hourTier = 'Severe';
    else if (riskRes.score >= 70) hourTier = 'High';
    else if (riskRes.score >= 35) hourTier = 'Medium';

    const fHour: ForecastHour = {
      timestamp: tStr,
      time: tStr,
      hour: hourStr,
      score: riskRes.score,
      riskScore: riskRes.score,
      riskTier: hourTier,
      confidenceBand: {
        min: Math.max(0, Math.round(riskRes.score * 0.95)),
        max: Math.min(100, Math.round(riskRes.score * 1.05)),
      },
      waveHeight,
      rainfall,
      precipitation: rainfall,
      windSpeed,
      tideLevel: seaLevelMsl,
    };

    hourlyForecast.push(fHour);

    if (!dailyGroups[dateStr]) {
      dailyGroups[dateStr] = { hours: [], factors: [] };
    }
    dailyGroups[dateStr].hours.push(fHour);
    dailyGroups[dateStr].factors.push(hourFactors);
  }

  const dailyDates = Object.keys(dailyGroups).sort().slice(0, 7);
  const daily: ForecastDay[] = [];

  for (let dayIndex = 0; dayIndex < dailyDates.length; dayIndex++) {
    const dStr = dailyDates[dayIndex];
    const group = dailyGroups[dStr];
    const scores = group.hours.map((h) => h.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const meanScore = Math.round(scores.reduce((a, b) => a + b, 0) / (scores.length || 1));

    const leadDays = dayIndex;
    const waveErr = 0.15 + 0.03 * leadDays;
    const rainErr = 0.4 + 0.08 * leadDays;
    const gustErr = 0.12 + 0.02 * leadDays;

    const repFactor = group.factors[group.hours.findIndex((h) => h.score === maxScore)] || group.factors[0];

    const upperFactors: EnvironmentalFactors = {
      ...repFactor,
      waveHeight: repFactor.waveHeight ? repFactor.waveHeight * (1 + waveErr) : undefined,
      rainfall24h: repFactor.rainfall24h ? repFactor.rainfall24h * (1 + rainErr) : undefined,
      windGusts: repFactor.windGusts ? repFactor.windGusts * (1 + gustErr) : undefined,
    };

    const lowerFactors: EnvironmentalFactors = {
      ...repFactor,
      waveHeight: repFactor.waveHeight ? repFactor.waveHeight * Math.max(0, 1 - waveErr) : undefined,
      rainfall24h: repFactor.rainfall24h ? repFactor.rainfall24h * Math.max(0, 1 - rainErr) : undefined,
      windGusts: repFactor.windGusts ? repFactor.windGusts * Math.max(0, 1 - gustErr) : undefined,
    };

    const upperScore = Math.min(100, Math.round(calculateRiskScore(site, upperFactors).score));
    const lowerScore = Math.max(0, Math.round(calculateRiskScore(site, lowerFactors).score));

    const dObj = new Date(dStr + 'T12:00:00');
    const dayName = dayIndex === 0 ? 'Today' : dayIndex === 1 ? 'Tomorrow' : dObj.toLocaleDateString('en-US', { weekday: 'short' });

    let tier: RiskTier = 'Low';
    if (maxScore >= 85) tier = 'Severe';
    else if (maxScore >= 70) tier = 'High';
    else if (maxScore >= 35) tier = 'Medium';

    const waveH = repFactor.waveHeight ? Math.round(repFactor.waveHeight * 10) / 10 : undefined;
    const rainP = repFactor.precipitation ? Math.round(repFactor.precipitation * 10) / 10 : 0;
    const windS = repFactor.windSpeed ? Math.round(repFactor.windSpeed) : undefined;

    daily.push({
      date: dStr,
      dayName,
      maxScore,
      peakScore: maxScore,
      meanScore,
      minScore,
      upperConfidence: Math.max(maxScore, upperScore),
      lowerConfidence: Math.min(minScore, lowerScore),
      tier,
      peakTier: tier,
      weatherCode: repFactor.weatherCode || 0,
      waveHeight: waveH,
      maxWaveHeight: waveH,
      rainfall: rainP,
      totalPrecipitation: rainP,
      windSpeed: windS,
      maxWindSpeed: windS,
      tideLevel: repFactor.seaLevelMsl ? Math.round(repFactor.seaLevelMsl * 10) / 10 : undefined,
    });
  }

  let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
  if (daily.length >= 3) {
    const startMax = daily[0].maxScore;
    const day3Max = daily[2].maxScore;
    const diff = day3Max - startMax;
    if (diff > 5) trendDirection = 'increasing';
    else if (diff < -5) trendDirection = 'decreasing';
  }

  return {
    siteId: site.id,
    siteName: site.name,
    trendDirection,
    daily,
    days: daily,
    hourly: hourlyForecast.slice(0, 72),
    hours: hourlyForecast.slice(0, 72),
  };
}
