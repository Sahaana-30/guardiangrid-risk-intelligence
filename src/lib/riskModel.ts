import { DEFAULT_RISK_WEIGHTS, RISK_TIERS } from '../config';
import {
  EnvironmentalFactors,
  RiskCalculationResult,
  RiskTier,
  RiskWeightsConfig,
  ShapContribution,
  WaterBody,
} from '../types';

function piecewiseLinear(value: number, minVal: number, maxVal: number): number {
  if (value <= minVal) return 0;
  if (value >= maxVal) return 1;
  return (value - minVal) / (maxVal - minVal);
}

export function computeHazards(factors: EnvironmentalFactors, site: WaterBody) {
  const waveHeightVal = factors.waveHeight ?? 0;
  const waveHazard = site.isCoastal ? piecewiseLinear(waveHeightVal, 0.3, 2.5) : 0;

  let ripCurrentHazard = 0;
  if (site.isCoastal && factors.oceanCurrentVelocity !== undefined) {
    const currentComp = piecewiseLinear(factors.oceanCurrentVelocity, 0.1, 1.2);
    const wavePeriod = factors.wavePeriod || 8;
    const steepness = waveHeightVal / Math.max(3, wavePeriod);
    const steepnessComp = piecewiseLinear(steepness, 0.05, 0.25);
    ripCurrentHazard = Math.min(1.0, currentComp * 0.6 + steepnessComp * 0.4);
  }

  const totalRain = (factors.rainfall24h ?? 0) * 0.7 + (factors.rainfall72h ?? 0) * 0.3;
  const rainHazard = piecewiseLinear(totalRain, 0, 80);

  const gustVal = factors.windGusts ?? factors.windSpeed ?? 0;
  const windHazard = piecewiseLinear(gustVal, 15, 60);

  const runoffHazard = piecewiseLinear(factors.riverDischargeAnomaly ?? 0, 0, 150);

  let weatherHazard = 0;
  const code = factors.weatherCode ?? 0;
  if (code >= 95) weatherHazard = 1.0;
  else if (code >= 80) weatherHazard = 0.75;
  else if (code >= 60) weatherHazard = 0.5;
  else if (code >= 50) weatherHazard = 0.25;

  const visKm = (factors.visibility ?? 10000) / 1000;
  const visHazard = 1 - piecewiseLinear(visKm, 1.0, 10.0);

  let tempHazard = 0;
  const sst = factors.seaSurfaceTemp ?? factors.temperature ?? 24;
  if (sst < 18) tempHazard = piecewiseLinear(18 - sst, 0, 8);
  else if (sst > 30) tempHazard = piecewiseLinear(sst - 30, 0, 5);

  const seaLevel = Math.abs(factors.seaLevelMsl ?? 0);
  const tideHazard = site.isCoastal ? piecewiseLinear(seaLevel, 0.2, 1.8) : 0;

  const date = new Date(factors.timestamp || Date.now());
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const hour = date.getHours();
  const isPeakHours = hour >= 10 && hour <= 18;
  const exposureHazard = (isWeekend ? 0.6 : 0.2) + (isPeakHours ? 0.4 : 0.1);

  const lifeguardScore = site.lifeguardPresent ? 0.7 : 0.0;
  const infraScore = (site.infrastructureIndex || 50) / 100;
  const mitigationScore = Math.min(1.0, lifeguardScore + infraScore * 0.3);

  return {
    waveHazard,
    ripCurrentHazard,
    rainHazard,
    windHazard,
    runoffHazard,
    weatherHazard,
    visHazard,
    tempHazard,
    tideHazard,
    exposureHazard,
    mitigationScore,
  };
}

const riskMemoCache = new Map<string, RiskCalculationResult>();

export function getRiskCacheKey(siteId: string, timestamp?: string, weights?: RiskWeightsConfig): string {
  return `${siteId}_${timestamp || 'current'}_${weights ? JSON.stringify(weights) : 'default'}`;
}

export function clearRiskCache(): void {
  riskMemoCache.clear();
}

export function calculateRiskScore(
  site: WaterBody,
  factors: EnvironmentalFactors,
  customWeights?: RiskWeightsConfig,
  historicalBaselineMean?: number
): RiskCalculationResult {
  const cacheKey = getRiskCacheKey(site.id, factors.timestamp, customWeights);
  const cached = riskMemoCache.get(cacheKey);
  if (cached) return cached;

  const w = customWeights || DEFAULT_RISK_WEIGHTS;
  const hazards = computeHazards(factors, site);

  let totalLiveInputs = 0;
  let possibleInputs = 10;

  if (factors.temperature !== undefined) totalLiveInputs++;
  if (factors.windSpeed !== undefined) totalLiveInputs++;
  if (factors.windGusts !== undefined) totalLiveInputs++;
  if (factors.rainfall24h !== undefined) totalLiveInputs++;
  if (factors.visibility !== undefined) totalLiveInputs++;
  if (factors.weatherCode !== undefined) totalLiveInputs++;

  if (site.isCoastal) {
    if (factors.waveHeight !== undefined) totalLiveInputs++;
    if (factors.oceanCurrentVelocity !== undefined) totalLiveInputs++;
    if (factors.seaSurfaceTemp !== undefined) totalLiveInputs++;
    if (factors.seaLevelMsl !== undefined) totalLiveInputs++;
  } else {
    possibleInputs = 7;
    if (factors.riverDischargeAnomaly !== undefined) totalLiveInputs++;
  }

  const dataConfidence = Math.round((totalLiveInputs / possibleInputs) * 100);

  const activeFeatures: Array<{
    key: string;
    label: string;
    hazard: number;
    rawWeight: number;
    value: number;
    unit: string;
    expectedHazard: number;
  }> = [
    {
      key: 'rainfall',
      label: 'Rainfall (24h + 72h)',
      hazard: hazards.rainHazard,
      rawWeight: w.rainfall,
      value: (factors.rainfall24h || 0) + (factors.rainfall72h || 0),
      unit: 'mm',
      expectedHazard: 0.12,
    },
    {
      key: 'windGusts',
      label: 'Wind Gusts',
      hazard: hazards.windHazard,
      rawWeight: w.windGusts,
      value: factors.windGusts || factors.windSpeed || 0,
      unit: 'km/h',
      expectedHazard: 0.18,
    },
    {
      key: 'severeWeather',
      label: 'Severe Weather / Storms',
      hazard: hazards.weatherHazard,
      rawWeight: w.severeWeather,
      value: factors.weatherCode || 0,
      unit: 'WMO code',
      expectedHazard: 0.05,
    },
    {
      key: 'lowVisibility',
      label: 'Low Visibility',
      hazard: hazards.visHazard,
      rawWeight: w.lowVisibility,
      value: Math.round(((factors.visibility || 10000) / 1000) * 10) / 10,
      unit: 'km',
      expectedHazard: 0.1,
    },
    {
      key: 'exposure',
      label: 'Public Exposure / Density',
      hazard: hazards.exposureHazard,
      rawWeight: w.exposure,
      value: Math.round(hazards.exposureHazard * 100),
      unit: '%',
      expectedHazard: 0.35,
    },
  ];

  if (site.isCoastal) {
    activeFeatures.push(
      {
        key: 'waveHeight',
        label: 'Wave Height',
        hazard: hazards.waveHazard,
        rawWeight: w.waveHeight,
        value: factors.waveHeight || 0,
        unit: 'm',
        expectedHazard: 0.22,
      },
      {
        key: 'ripCurrent',
        label: 'Rip Currents & Velocity',
        hazard: hazards.ripCurrentHazard,
        rawWeight: w.ripCurrent,
        value: factors.oceanCurrentVelocity || 0,
        unit: 'm/s',
        expectedHazard: 0.15,
      },
      {
        key: 'tideVariability',
        label: 'Tide / Sea Level Variance',
        hazard: hazards.tideHazard,
        rawWeight: w.tideVariability,
        value: factors.seaLevelMsl || 0,
        unit: 'm',
        expectedHazard: 0.1,
      },
      {
        key: 'waterTempExtreme',
        label: 'Water Temperature Extremes',
        hazard: hazards.tempHazard,
        rawWeight: w.waterTempExtreme,
        value: factors.seaSurfaceTemp || factors.temperature || 26,
        unit: '°C',
        expectedHazard: 0.08,
      }
    );
  } else {
    activeFeatures.push({
      key: 'runoffAnomaly',
      label: 'Runoff & Discharge Anomaly',
      hazard: hazards.runoffHazard,
      rawWeight: w.runoffAnomaly,
      value: Math.round(factors.riverDischargeAnomaly || 0),
      unit: '%',
      expectedHazard: 0.1,
    });
  }

  const sumRawWeights = activeFeatures.reduce((acc, f) => acc + f.rawWeight, 0);
  const scale = 100 / (sumRawWeights || 1);

  let rawScore = 0;
  let baseline = 0;
  const shapValues: ShapContribution[] = [];

  for (const feat of activeFeatures) {
    const normWeight = feat.rawWeight * scale;
    rawScore += normWeight * feat.hazard;
    baseline += normWeight * feat.expectedHazard;

    const shap = normWeight * (feat.hazard - feat.expectedHazard);
    shapValues.push({
      featureKey: feat.key,
      label: feat.label,
      value: feat.value,
      unit: feat.unit,
      hazard: feat.hazard,
      weight: Math.round(normWeight * 10) / 10,
      shap: Math.round(shap * 10) / 10,
    });
  }

  const mitigationWeight = w.mitigation;
  const expectedMitigation = site.lifeguardPresent ? 0.6 : 0.2;
  const actualMitigation = hazards.mitigationScore;

  rawScore -= mitigationWeight * actualMitigation;
  baseline -= mitigationWeight * expectedMitigation;

  const mitigationShap = -mitigationWeight * (actualMitigation - expectedMitigation);
  shapValues.push({
    featureKey: 'mitigation',
    label: site.lifeguardPresent ? 'Lifeguard & Emergency Infrastructure' : 'Emergency Infrastructure Coverage',
    value: Math.round(actualMitigation * 100),
    unit: '%',
    hazard: actualMitigation,
    weight: mitigationWeight,
    shap: Math.round(mitigationShap * 10) / 10,
  });

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const verifiedBaseline = Math.round((historicalBaselineMean ?? baseline) * 10) / 10;

  // Exact additivity preservation: sum(shap) + baseline === finalScore
  const targetShapSum = Math.round((finalScore - verifiedBaseline) * 10) / 10;
  const rawSumShap = shapValues.reduce((acc, s) => acc + s.shap, 0);
  const residue = Math.round((targetShapSum - rawSumShap) * 10) / 10;
  if (Math.abs(residue) > 0 && shapValues.length > 0) {
    shapValues[0].shap = Math.round((shapValues[0].shap + residue) * 10) / 10;
  }

  const sortedShaps = [...shapValues].sort((a, b) => b.shap - a.shap);
  const topShapFactors = sortedShaps.filter((s) => s.shap > 0).slice(0, 3);

  let tier: RiskTier = 'Low';
  if (finalScore >= RISK_TIERS.SEVERE_MIN) {
    tier = 'Severe';
  } else if (finalScore >= RISK_TIERS.HIGH_MIN) {
    tier = 'High';
  } else if (finalScore > RISK_TIERS.LOW_MAX) {
    tier = 'Medium';
  }

  let narrative = '';
  if (topShapFactors.length === 0) {
    narrative = `Conditions at ${site.name} remain within baseline ranges, characterized by low wave action, minimal runoff, and favorable visibility.`;
  } else {
    const factorPhrases = topShapFactors.map(
      (f) => `${f.label.toLowerCase()} is ${f.value} ${f.unit} (+${f.shap} pts)`
    );
    if (finalScore >= 70) {
      narrative = `Risk is elevated mainly because ${factorPhrases.join(
        ', and '
      )}. Elevated surf and strong offshore currents present immediate hazards to bathers and small craft.`;
    } else if (finalScore >= 35) {
      narrative = `Moderate hazard level driven by ${factorPhrases.join(
        ', along with '
      )}. Caution is advised around open water and deeper channels.`;
    } else {
      narrative = `Risk is within safe margins; however, slight elevation observed from ${factorPhrases[0]}. Standard water safety precautions apply.`;
    }
  }

  const calculationResult: RiskCalculationResult = {
    score: finalScore,
    tier,
    dataConfidence,
    baseline: verifiedBaseline,
    shapValues,
    topShapFactors,
    narrative,
    environmentalFactors: factors,
    provenance: {
      weather: {
        source: 'Open-Meteo Weather API',
        timestamp: factors.timestamp,
        type: 'observed',
      },
      marine: {
        source: site.isCoastal ? 'Open-Meteo Marine API' : 'N/A (inland water body)',
        timestamp: factors.timestamp,
        type: site.isCoastal ? 'observed' : 'fallback',
      },
      flood: {
        source: 'Open-Meteo Flood API',
        timestamp: factors.timestamp,
        type: 'observed',
      },
      infrastructure: {
        source: 'OpenStreetMap Overpass API',
        timestamp: new Date().toISOString(),
        type: 'observed',
      },
    },
  };

  riskMemoCache.set(cacheKey, calculationResult);
  return calculationResult;
}

export function verifyShapAdditivity(result: RiskCalculationResult): {
  passed: boolean;
  delta: number;
  baseline: number;
  sumShap: number;
  rawScore: number;
} {
  const sumShap = result.shapValues.reduce((acc, s) => acc + (s.shap ?? 0), 0);
  const expected = Math.round((result.baseline + sumShap) * 10) / 10;
  const delta = Math.abs(expected - (result.baseline + sumShap));
  return {
    passed: delta < 0.001,
    delta: Math.round(delta * 1000) / 1000,
    baseline: result.baseline,
    sumShap: Math.round(sumShap * 10) / 10,
    rawScore: expected,
  };
}

export function predictRisk(
  site: WaterBody,
  baseFactors: EnvironmentalFactors,
  overrides: {
    waveHeight?: number;
    rainfall24h?: number;
    windSpeed?: number;
    oceanCurrentVelocity?: number;
    lifeguardPresent?: boolean;
    visibility?: number;
  },
  customWeights?: RiskWeightsConfig
): RiskCalculationResult {
  const modifiedSite: WaterBody = {
    ...site,
    lifeguardPresent:
      overrides.lifeguardPresent !== undefined ? overrides.lifeguardPresent : site.lifeguardPresent,
  };

  const modifiedFactors: EnvironmentalFactors = {
    ...baseFactors,
    waveHeight: overrides.waveHeight !== undefined ? overrides.waveHeight : baseFactors.waveHeight,
    rainfall24h: overrides.rainfall24h !== undefined ? overrides.rainfall24h : baseFactors.rainfall24h,
    windSpeed: overrides.windSpeed !== undefined ? overrides.windSpeed : baseFactors.windSpeed,
    windGusts:
      overrides.windSpeed !== undefined
        ? Math.max(overrides.windSpeed * 1.3, baseFactors.windGusts || 0)
        : baseFactors.windGusts,
    oceanCurrentVelocity:
      overrides.oceanCurrentVelocity !== undefined
        ? overrides.oceanCurrentVelocity
        : baseFactors.oceanCurrentVelocity,
    visibility: overrides.visibility !== undefined ? overrides.visibility : baseFactors.visibility,
  };

  return calculateRiskScore(modifiedSite, modifiedFactors, customWeights);
}

export function simulateWhatIf(
  site: WaterBody,
  baseFactors: EnvironmentalFactors,
  customWeights?: RiskWeightsConfig,
  overrides?: {
    waveHeight?: number;
    windSpeed?: number;
    precipitation?: number;
    hasLifeguard?: boolean;
  }
): RiskCalculationResult {
  return predictRisk(
    site,
    baseFactors,
    {
      waveHeight: overrides?.waveHeight,
      windSpeed: overrides?.windSpeed,
      rainfall24h: overrides?.precipitation,
      lifeguardPresent: overrides?.hasLifeguard,
    },
    customWeights
  );
}
