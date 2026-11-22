import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Sparkles,
  Bot,
  GitFork,
  BookOpen,
  FileText,
  Scale,
  Waves,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { BackNavButton } from '../components/BackNavButton';
import { Forecast } from './Forecast';
import { Explain } from './Explain';
import { Clusters } from './Clusters';
import { Fairness } from './Fairness';
import { Methodology } from './Methodology';
import { Reports } from './Reports';
import { WaterBodies } from './WaterBodies';
import { RescuePerformanceSection } from '../components/emergency/RescuePerformanceSection';

type AnalyticsTabId =
  | 'forecast'
  | 'explain'
  | 'clusters'
  | 'fairness'
  | 'methodology'
  | 'reports'
  | 'water-bodies'
  | 'rescue-performance';

const PRIMARY_INTELLIGENCE_TABS: Array<{
  id: AnalyticsTabId | 'map';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  directRoute: string;
}> = [
  { id: 'water-bodies', label: 'Coastal Conditions & Beaches', icon: Waves, directRoute: '/water-bodies' },
  { id: 'map', label: 'Risk Map', icon: MapPin, directRoute: '/map' },
  { id: 'forecast', label: '7-Day Forecasting', icon: Calendar, directRoute: '/forecast' },
  { id: 'rescue-performance', label: 'Rescue Performance', icon: Activity, directRoute: '/dashboard' },
  { id: 'reports', label: 'Environmental Reports', icon: FileText, directRoute: '/reports' },
];

const TECHNICAL_MODEL_TABS: Array<{
  id: AnalyticsTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  directRoute: string;
}> = [
  { id: 'explain', label: 'Explainable AI / SHAP', icon: Sparkles, directRoute: '/explain' },
  { id: 'clusters', label: 'Clustering & Anomaly', icon: GitFork, directRoute: '/clusters' },
  { id: 'fairness', label: 'Fairness Audit', icon: Scale, directRoute: '/fairness' },
  { id: 'methodology', label: 'Methodology & Data Sources', icon: BookOpen, directRoute: '/methodology' },
];

const ALL_TABS = [...PRIMARY_INTELLIGENCE_TABS, ...TECHNICAL_MODEL_TABS];

export const AnalyticsHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'water-bodies';
  const activeTab: AnalyticsTabId = ALL_TABS.some((t) => t.id === rawTab && t.id !== 'map')
    ? (rawTab as AnalyticsTabId)
    : 'water-bodies';

  const selectTab = (id: AnalyticsTabId | 'map', directRoute: string) => {
    if (id === 'map') {
      navigate(directRoute);
      return;
    }
    setSearchParams({ tab: id }, { replace: true });
  };

  const activeConfig = ALL_TABS.find((t) => t.id === activeTab);
  const isTechnicalActive = TECHNICAL_MODEL_TABS.some((t) => t.id === activeTab);

  return (
    <div className="space-y-5">
      <div className="glass-card rounded-2xl p-4 border border-[#E9E1D3] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <BackNavButton fallbackPath="/dashboard" className="mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <h2 className="font-serif-heading text-xl font-bold text-[#1B2A38]">
                Coastal Intelligence
              </h2>
              <p className="text-xs text-[#5B687A]">
                Live beach risk conditions, spatial risk mapping, 7-day hazard forecasting, and environmental reports.
              </p>
            </div>
          </div>
          {activeConfig && (
            <button
              type="button"
              onClick={() => navigate(activeConfig.directRoute)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer self-start sm:self-center"
            >
              <span>Open standalone view</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Primary Coastal Intelligence Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#E9E1D3]/70">
          {PRIMARY_INTELLIGENCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id, tab.directRoute)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                  isActive
                    ? 'bg-[#0F766E] text-white font-semibold shadow-xs'
                    : 'bg-[#F6F1E7] text-[#1B2A38] hover:bg-[#E9E1D3]/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* De-emphasised Technical & Models Section */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[#E9E1D3]/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B687A] mr-1">
            Technical &amp; Models:
          </span>
          {TECHNICAL_MODEL_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id, tab.directRoute)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                  isActive
                    ? 'bg-[#0B3B3C] text-white font-semibold'
                    : 'bg-white/70 border border-[#E9E1D3] text-[#5B687A] hover:text-[#1B2A38] hover:bg-[#F6F1E7]'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
              </button>
            );
          })}
          {isTechnicalActive && (
            <span className="text-[10px] text-[#5B687A] ml-auto">
              Reference &amp; model diagnostics
            </span>
          )}
        </div>
      </div>

      <div>
        {activeTab === 'water-bodies' && <WaterBodies />}
        {activeTab === 'forecast' && <Forecast />}
        {activeTab === 'rescue-performance' && <RescuePerformanceSection />}
        {activeTab === 'reports' && <Reports />}
        {activeTab === 'explain' && <Explain />}
        {activeTab === 'clusters' && <Clusters />}
        {activeTab === 'fairness' && <Fairness />}
        {activeTab === 'methodology' && <Methodology />}
      </div>
    </div>
  );
};
