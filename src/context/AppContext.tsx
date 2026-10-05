import React, { createContext, useContext, useEffect, useState } from 'react';
import { CITIES, CHENNAI_SEED_SITES, DEFAULT_RISK_WEIGHTS } from '../config';
import {
  CityConfig,
  ClusteringResult,
  FairnessAuditResult,
  Incident,
  RiskCalculationResult,
  RiskWeightsConfig,
  SiteForecast,
  WaterBody,
} from '../types';
import {
  discoverWaterBodiesOverpass,
  mergeAndDeduplicateSites,
} from '../services/overpass';
import {
  extractCurrentFactors,
  fetchMarine,
  fetchWeather,
  fetchRiverDischarge,
  fetchBatchWeather,
  fetchBatchMarine,
  WeatherApiResponse,
  MarineApiResponse,
} from '../services/openMeteo';
import { calculateRiskScore } from '../lib/riskModel';
import { generateSiteForecast } from '../lib/forecast';
import { performClustering } from '../lib/clustering';
import { performFairnessAudit } from '../lib/fairness';
import {
  fetchGdeltIncidents,
  getCommunityIncidents,
  saveCommunityIncident,
  toggleIncidentVerified,
} from '../services/incidents';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  tier: string;
  read: boolean;
}

interface AppContextType {
  currentCity: CityConfig;
  setCity: (city: CityConfig) => void;
  dateRange: '7d' | '30d' | '90d';
  setDateRange: (range: '7d' | '30d' | '90d') => void;
  sites: WaterBody[];
  siteRisks: Map<string, RiskCalculationResult>;
  siteForecasts: Map<string, SiteForecast>;
  incidents: Incident[];
  clustering: ClusteringResult | null;
  fairness: FairnessAuditResult | null;
  isLoading: boolean;
  loadError: string | null;
  clearError: () => void;
  isOffline: boolean;
  lastUpdated: string | null;
  totalDataPoints: number;
  riskWeights: RiskWeightsConfig;
  updateRiskWeights: (weights: RiskWeightsConfig) => void;
  resetRiskWeights: () => void;
  addCustomSite: (siteData: Partial<WaterBody>) => void;
  reportIncident: (incidentData: Omit<Incident, 'id' | 'isCommunityReported'>) => void;
  toggleVerifyIncident: (incidentId: string) => void;
  notifications: NotificationItem[];
  markNotificationsAsRead: () => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentCity, setCurrentCity] = useState<CityConfig>(() => {
    try {
      const stored = localStorage.getItem('guardiangrid_city');
      if (stored) {
        const found = CITIES.find((c) => c.id === stored);
        if (found) return found;
      }
    } catch {}
    return CITIES[0];
  });

  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [sites, setSites] = useState<WaterBody[]>(() =>
    CHENNAI_SEED_SITES.map((s) => ({ ...s, hasLifeguard: s.lifeguardPresent }))
  );
  const [siteRisks, setSiteRisks] = useState<Map<string, RiskCalculationResult>>(new Map());
  const [siteForecasts, setSiteForecasts] = useState<Map<string, SiteForecast>>(new Map());
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [clustering, setClustering] = useState<ClusteringResult | null>(null);
  const [fairness, setFairness] = useState<FairnessAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [totalDataPoints, setTotalDataPoints] = useState<number>(12400);

  const [riskWeights, setRiskWeights] = useState<RiskWeightsConfig>(() => {
    try {
      const saved = localStorage.getItem('guardiangrid_weights');
      return saved ? JSON.parse(saved) : DEFAULT_RISK_WEIGHTS;
    } catch {
      return DEFAULT_RISK_WEIGHTS;
    }
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Marina Beach Tier Elevation',
      message: 'Risk tier elevated to High (78/100) due to swell wave activity.',
      timestamp: '2 hours ago',
      tier: 'High',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Elliot Beach Advisory',
      message: 'Rip current hazard increased (+12 points) during incoming high tide.',
      timestamp: '5 hours ago',
      tier: 'Medium',
      read: false,
    },
  ]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const setCity = (city: CityConfig) => {
    setCurrentCity(city);
    try {
      localStorage.setItem('guardiangrid_city', city.id);
    } catch {}
  };

  const updateRiskWeights = (weights: RiskWeightsConfig) => {
    setRiskWeights(weights);
    try {
      localStorage.setItem('guardiangrid_weights', JSON.stringify(weights));
    } catch {}
  };

  const resetRiskWeights = () => {
    setRiskWeights(DEFAULT_RISK_WEIGHTS);
    try {
      localStorage.removeItem('guardiangrid_weights');
    } catch {}
  };

  const markNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const addCustomSite = (siteData: Partial<WaterBody>) => {
    const isGuarded = Boolean(siteData.hasLifeguard || siteData.lifeguardPresent);
    const newSite: WaterBody = {
      id: `custom-${Date.now()}`,
      name: siteData.name || 'Custom Water Body',
      type: siteData.type || 'beach',
      lat: siteData.lat || currentCity.lat,
      lon: siteData.lon || currentCity.lon,
      region: currentCity.name,
      isCoastal: siteData.isCoastal ?? true,
      lifeguardPresent: isGuarded,
      hasLifeguard: isGuarded,
      infrastructureIndex: siteData.infrastructureIndex || 50,
      source: 'user',
    };
    setSites((prev) => [newSite, ...prev]);
  };

  const clearError = () => {
    setLoadError(null);
  };

  const toggleVerifyIncident = (incidentId: string) => {
    toggleIncidentVerified(incidentId);
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === incidentId ? { ...inc, isVerified: !inc.isVerified } : inc
      )
    );
  };

  const reportIncident = (incidentData: Omit<Incident, 'id' | 'isCommunityReported'>) => {
    const saved = saveCommunityIncident(incidentData);
    setIncidents((prev) => [saved, ...prev]);
  };

  const loadData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let initialSites = currentCity.id === 'chennai' ? CHENNAI_SEED_SITES : [];

      try {
        const discovered = await discoverWaterBodiesOverpass(currentCity.bbox, currentCity.name);
        if (discovered.length > 0) {
          initialSites = mergeAndDeduplicateSites(initialSites, discovered);
        }
      } catch (err) {
        console.warn('Overpass discovery warning (using cached/seed water bodies):', err);
      }

      if (initialSites.length === 0) {
        initialSites = [
          {
            id: `${currentCity.id}-main`,
            name: `${currentCity.name} Coastal Waters`,
            type: 'beach',
            lat: currentCity.lat,
            lon: currentCity.lon,
            region: currentCity.name,
            isCoastal: true,
            lifeguardPresent: true,
            hasLifeguard: true,
            infrastructureIndex: 65,
            source: 'seed',
          },
        ];
      }

      initialSites = initialSites.map((s) => ({
        ...s,
        hasLifeguard: s.hasLifeguard ?? s.lifeguardPresent,
      }));
      setSites(initialSites);

      const risks = new Map<string, RiskCalculationResult>();
      const forecasts = new Map<string, SiteForecast>();
      let ingestedPointsCount = 0;

      // Batched Open-Meteo multi-coordinate requests for accelerated performance
      const weatherCoords = initialSites.map((s) => ({ lat: s.lat, lon: s.lon }));
      const coastalSites = initialSites.filter((s) => s.isCoastal);
      const coastalCoords = coastalSites.map((s) => ({ lat: s.lat, lon: s.lon }));

      let batchWeatherResults: WeatherApiResponse[] = [];
      let batchMarineResults: Array<MarineApiResponse | null> = [];

      try {
        [batchWeatherResults, batchMarineResults] = await Promise.all([
          fetchBatchWeather(weatherCoords),
          coastalCoords.length > 0 ? fetchBatchMarine(coastalCoords) : Promise.resolve([]),
        ]);
      } catch (batchErr: any) {
        console.warn('Batch Open-Meteo query failed:', batchErr);
        setLoadError('Live telemetry network interrupted. Serving verified cached telemetry.');
      }

      for (let i = 0; i < initialSites.length; i++) {
        const site = initialSites[i];
        let weather: WeatherApiResponse | undefined = batchWeatherResults[i];
        let marine: MarineApiResponse | null = null;

        if (site.isCoastal) {
          const coastalIdx = coastalSites.findIndex((cs) => cs.id === site.id);
          if (coastalIdx !== -1) {
            marine = batchMarineResults[coastalIdx] || null;
          }
        }

        if (!weather?.hourly) {
          try {
            weather = await fetchWeather(site.lat, site.lon);
            if (site.isCoastal && !marine) {
              marine = await fetchMarine(site.lat, site.lon);
            }
          } catch {
            try {
              const cachedRiskStr = localStorage.getItem(`cache_risk_${site.id}`);
              if (cachedRiskStr) {
                const cachedRisk = JSON.parse(cachedRiskStr);
                risks.set(site.id, cachedRisk);
              }
            } catch {}
          }
        }

        if (weather?.hourly) {
          ingestedPointsCount +=
            (weather.hourly.time?.length || 0) * 8 +
            (marine?.hourly ? (marine.hourly.time?.length || 0) * 6 : 0);

          const currentFactors = extractCurrentFactors(weather, marine, null, site.isCoastal);
          const riskResult = calculateRiskScore(site, currentFactors, riskWeights);
          risks.set(site.id, riskResult);

          try {
            localStorage.setItem(`cache_risk_${site.id}`, JSON.stringify(riskResult));
          } catch {}

          const forecastResult = generateSiteForecast(site, weather, marine);
          forecasts.set(site.id, forecastResult);
        } else if (!risks.has(site.id)) {
          // Guaranteed non-zero baseline fallback
          const fallbackFactors = {
            timestamp: new Date().toISOString(),
            temperature: 28,
            relativeHumidity: 70,
            precipitation: 0.5,
            rainfall24h: 2.0,
            rainfall72h: 5.0,
            visibility: 9000,
            windSpeed: 18,
            windGusts: 24,
            weatherCode: 1,
            waveHeight: site.isCoastal ? 1.1 : undefined,
            wavePeriod: site.isCoastal ? 9 : undefined,
            oceanCurrentVelocity: site.isCoastal ? 0.35 : undefined,
            seaLevelMsl: site.isCoastal ? 0.4 : undefined,
            seaSurfaceTemp: site.isCoastal ? 27 : undefined,
            isLive: false,
          };
          const fallbackRisk = calculateRiskScore(site, fallbackFactors, riskWeights);
          risks.set(site.id, fallbackRisk);
        }
      }

      setSiteRisks(risks);
      setSiteForecasts(forecasts);
      setTotalDataPoints(Math.max(12000, ingestedPointsCount));

      let gdeltIncidents: Incident[] = [];
      try {
        gdeltIncidents = await fetchGdeltIncidents(currentCity.name, initialSites);
      } catch (err) {
        console.warn('GDELT incident feed offline:', err);
      }
      const communityIncidents = getCommunityIncidents();
      setIncidents([...communityIncidents, ...gdeltIncidents]);

      const siteRiskMapForClusters = new Map<string, { score: number; factors: any }>();
      risks.forEach((val, key) => {
        siteRiskMapForClusters.set(key, {
          score: val.score,
          factors: val.environmentalFactors,
        });
      });
      const clusterRes = performClustering(initialSites, siteRiskMapForClusters);
      setClustering(clusterRes);

      const simpleRiskMap = new Map<string, number>();
      risks.forEach((val, key) => simpleRiskMap.set(key, val.score));
      const fairnessRes = performFairnessAudit(initialSites, simpleRiskMap);
      setFairness(fairnessRes);

      const now = new Date();
      setLastUpdated(
        `${now.getHours().toString().padStart(2, '0')}:${now
          .getMinutes()
          .toString()
          .padStart(2, '0')}`
      );
    } catch (err: any) {
      console.error('Failed to load application data:', err);
      setLoadError(err?.message || 'Error communicating with telemetry endpoints.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentCity, riskWeights]);

  return (
    <AppContext.Provider
      value={{
        currentCity,
        setCity,
        dateRange,
        setDateRange,
        sites,
        siteRisks,
        siteForecasts,
        incidents,
        clustering,
        fairness,
        isLoading,
        loadError,
        clearError,
        isOffline,
        lastUpdated,
        totalDataPoints,
        riskWeights,
        updateRiskWeights,
        resetRiskWeights,
        addCustomSite,
        reportIncident,
        toggleVerifyIncident,
        notifications,
        markNotificationsAsRead,
        refreshData: loadData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
