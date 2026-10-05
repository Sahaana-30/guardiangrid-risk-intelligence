export type WaterBodyType = 'beach' | 'lake' | 'reservoir' | 'river';
export type RiskTier = 'Low' | 'Medium' | 'High' | 'Severe';

export interface WaterBody {
  id: string;
  name: string;
  type: WaterBodyType;
  lat: number;
  lon: number;
  region: string;
  isCoastal: boolean;
  osmTags?: Record<string, string>;
  osmId?: string;
  lifeguardPresent: boolean;
  hasLifeguard?: boolean;
  infrastructureIndex: number;
  infrastructureCounts?: {
    lifeguardStations: number;
    hospitals: number;
    police: number;
    fireStations: number;
    emergencyPhones: number;
  };
  source: 'seed' | 'overpass' | 'user';
  thumbnail?: string;
}

export interface EnvironmentalFactors {
  timestamp: string;
  waveHeight?: number;
  wavePeriod?: number;
  waveDirection?: number;
  swellHeight?: number;
  swellPeriod?: number;
  windWaveHeight?: number;
  oceanCurrentVelocity?: number;
  seaSurfaceTemp?: number;
  seaSurfaceTemperature?: number;
  seaLevelMsl?: number;
  temperature?: number;
  relativeHumidity?: number;
  precipitation?: number;
  precipitation24h?: number;
  rainfall24h?: number;
  rainfall72h?: number;
  visibility?: number;
  windSpeed?: number;
  windGusts?: number;
  weatherCode?: number;
  uvIndex?: number;
  riverDischargeAnomaly?: number;
  isLive: boolean;
}

export interface ShapContribution {
  featureKey: string;
  label: string;
  featureName?: string;
  value: number;
  observedValue?: string | number;
  unit: string;
  hazard: number;
  hazardValue?: number;
  weight: number;
  shap: number;
  shapContribution?: number;
}

export interface RiskCalculationResult {
  score: number;
  tier: RiskTier;
  dataConfidence: number;
  baseline: number;
  shapValues: ShapContribution[];
  topShapFactors: ShapContribution[];
  narrative: string;
  explanationNarrative?: string;
  environmentalFactors: EnvironmentalFactors;
  provenance: Record<string, {
    source: string;
    timestamp: string;
    type: 'observed' | 'forecast' | 'estimated' | 'fallback';
  }>;
}

export interface ForecastHour {
  timestamp: string;
  time?: string;
  hour: string;
  score: number;
  riskScore?: number;
  riskTier?: RiskTier;
  confidenceBand?: { min: number; max: number };
  waveHeight?: number;
  rainfall?: number;
  precipitation?: number;
  windSpeed?: number;
  tideLevel?: number;
}

export interface ForecastDay {
  date: string;
  dayName: string;
  maxScore: number;
  peakScore?: number;
  meanScore: number;
  minScore: number;
  upperConfidence: number;
  lowerConfidence: number;
  tier: RiskTier;
  peakTier?: RiskTier;
  weatherCode: number;
  maxWaveHeight?: number;
  waveHeight?: number;
  rainfall?: number;
  totalPrecipitation?: number;
  maxWindSpeed?: number;
  windSpeed?: number;
  tideLevel?: number;
}

export interface SiteForecast {
  siteId: string;
  siteName: string;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  daily: ForecastDay[];
  days?: ForecastDay[];
  hourly: ForecastHour[];
  hours?: ForecastHour[];
}

export interface Incident {
  id: string;
  title: string;
  date: string;
  source: string;
  domain?: string;
  url?: string;
  locationName: string;
  lat?: number;
  lon?: number;
  waterBodyId?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Severe';
  isCommunityReported: boolean;
  isVerified?: boolean;
  type: 'drowning' | 'rip_current' | 'rescue' | 'contamination' | 'capsizing' | 'other';
  notes?: string;
}

export interface ClusterInfo {
  clusterId: number;
  name: string;
  description: string;
  siteIds: string[];
  centroid: Record<string, number>;
}

export interface ClusteringResult {
  clusters: ClusterInfo[];
  outliers: string[];
  pcaPoints: Array<{
    siteId: string;
    name: string;
    x: number;
    y: number;
    clusterId: number;
    score: number;
    isOutlier: boolean;
  }>;
  dendrogramNodes: Array<{
    id: string;
    label: string;
    distance: number;
    children?: string[];
  }>;
}

export interface FairnessFinding {
  title: string;
  statisticName: string;
  statisticValue: number;
  pValue: number;
  affectedRegions: string[];
  potentialImpact: string;
  recommendation: string;
  isSignificant: boolean;
}

export interface FairnessAuditResult {
  sampleSize: number;
  isEnoughData: boolean;
  pearsonCorr: { r: number; pValue: number };
  spearmanCorr: { rho: number; pValue: number };
  anova: { fStat: number; pValue: number };
  chiSquare: { chi2: number; pValue: number };
  tierAverages: Array<{
    tier: number;
    label: string;
    siteCount: number;
    avgRiskScore: number;
    avgInfrastructureIndex: number;
    highRiskCount: number;
  }>;
  findings: FairnessFinding[];
}

export interface CityConfig {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
}

export interface RiskWeightsConfig {
  waveHeight: number;
  ripCurrent: number;
  rainfall: number;
  windGusts: number;
  runoffAnomaly: number;
  severeWeather: number;
  lowVisibility: number;
  waterTempExtreme: number;
  tideVariability: number;
  exposure: number;
  mitigation: number;
  // Aliases for Settings customizer
  waveHeightWeight?: number;
  wavePeriodWeight?: number;
  windSpeedWeight?: number;
  precipitationWeight?: number;
  riverDischargeWeight?: number;
  lifeguardMitigation?: number;
}
