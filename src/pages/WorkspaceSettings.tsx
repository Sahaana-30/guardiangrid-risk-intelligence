import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Anchor,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  MapPin,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sparkles,
  Unlock,
  Waves,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BackNavButton } from '../components/BackNavButton';
import {
  fetchLatestSimulationApi,
  fetchWorkspaceUsageApi,
  resetAdminSimulationApi,
  runAdminSimulationApi,
} from '../services/workspaceApi';
import type {
  EmergencySimulationResult,
  SaasPlanTier,
  WorkspaceConfig,
  WorkspaceUsageResponse,
} from '../types/workspace';

type TabKey = 'workspaces' | 'subscription' | 'simulation';

function WorkspaceIcon({
  icon,
  className = 'w-5 h-5',
}: {
  icon: WorkspaceConfig['branding']['icon'];
  className?: string;
}) {
  if (icon === 'waves') return <Waves className={className} />;
  if (icon === 'anchor') return <Anchor className={className} />;
  return <Shield className={className} />;
}

const STARTER_FEATURES = [
  'Coastal water-body monitoring & live risk scoring',
  '7-day meteorological & marine risk forecasting',
  'SHAP explainability & anomaly clustering',
  'Single operational workspace & Leaflet fallback',
  'Up to 1,000 demo-tier Nexconn messages / month',
  'Up to 50 Gemini AI briefings / month',
];

const ENTERPRISE_FEATURES = [
  'Multi-region India coastal monitoring (Chennai, Mumbai, Goa, Kerala)',
  'Full Incident Command Center & Mobile Responder Field Kit',
  'Google Maps Platform (Hybrid, Places New hospitals, Routes ETA)',
  'Nexconn group messaging, Push-to-Talk voice & live video triage',
  'Gemini bilingual (English + Tamil) Medical SBAR & 112 tracking links',
  'White-label organization branding, geofences & PostgreSQL tenant isolation',
];

export const WorkspaceSettings: React.FC = () => {
  const {
    workspaces,
    activeWorkspace,
    switchWorkspace,
    updateActiveWorkspace,
    setActiveWorkspacePlanPreview,
    resetWorkspacesToDefaults,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<TabKey>('workspaces');
  const [usage, setUsage] = useState<WorkspaceUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Hidden Admin Emergency Simulation state
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [simulation, setSimulation] = useState<EmergencySimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const data = await fetchWorkspaceUsageApi('DISPATCHER');
      setUsage(data);
    } catch (err: any) {
      setUsageError(err?.message || 'Unable to load workspace usage telemetry.');
    } finally {
      setUsageLoading(false);
    }
  }, [activeWorkspace.organizationId]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (!adminUnlocked) return;
    fetchLatestSimulationApi()
      .then((res) => setSimulation(res.simulation))
      .catch(() => {
        // Ignore initial load error if no simulation has been run yet
      });
  }, [adminUnlocked]);

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await runAdminSimulationApi();
      setSimulation(res.simulation);
      void loadUsage();
    } catch (err: any) {
      setSimError(err?.message || 'Admin simulation failed.');
    } finally {
      setSimLoading(false);
    }
  };

  const handleResetSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      await resetAdminSimulationApi();
      setSimulation(null);
    } catch (err: any) {
      setSimError(err?.message || 'Unable to reset simulation.');
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* Active Workspace White-Label Header */}
      <header
        className="rounded-2xl p-5 sm:p-6 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{ backgroundColor: activeWorkspace.branding.primaryColor }}
      >
        <div className="flex items-start gap-3.5">
          <BackNavButton fallbackPath="/dashboard" variant="dark" className="mt-1" />
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-sm shadow-sm shrink-0 border border-white/20"
            style={{ backgroundColor: activeWorkspace.branding.accentColor }}
          >
            <WorkspaceIcon icon={activeWorkspace.branding.icon} className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-white/80 font-semibold">
              <span>Active Workspace</span>
              <span>·</span>
              <span className="font-mono">{activeWorkspace.organizationId}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[10px]">
                {activeWorkspace.planTier === 'ENTERPRISE'
                  ? 'Enterprise Port / Resort'
                  : 'Starter Plan'}
              </span>
            </div>
            <h1 className="font-serif-heading text-2xl font-bold mt-0.5">
              {activeWorkspace.name}
            </h1>
            <p className="text-xs text-white/80 mt-0.5">
              {activeWorkspace.branding.tagline} · Geofence: {activeWorkspace.geofence.regionName} (
              {(activeWorkspace.geofence.radiusMeters / 1000).toFixed(1)} km)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={resetWorkspacesToDefaults}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white shrink-0 self-start sm:self-center"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Workspace Defaults</span>
        </button>
      </header>

      {/* Tenant Isolation Guarantee Strip */}
      <div className="rounded-xl border border-[#0F766E]/25 bg-[#ECFDF5] px-4 py-2.5 text-xs text-[#065F46] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 shrink-0" />
          <span>
            <strong>Strict Multi-Tenant Isolation Active:</strong> Switching workspaces updates{' '}
            <code className="font-mono bg-white/70 px-1 rounded">x-gg-org-id</code> and clears
            in-memory incident caches so private incidents, responders, and medical handoffs never
            cross tenant boundaries.
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E9E1D3] pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('workspaces')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'workspaces'
                ? 'bg-[#0B3B3C] text-white'
                : 'bg-white border border-[#E9E1D3] text-[#5B687A] hover:text-[#1B2A38]'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>White-Label Workspaces</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('subscription')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'subscription'
                ? 'bg-[#0B3B3C] text-white'
                : 'bg-white border border-[#E9E1D3] text-[#5B687A] hover:text-[#1B2A38]'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>SaaS Plan &amp; Usage</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('simulation')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'simulation'
                ? 'bg-[#991B1B] text-white'
                : 'bg-white border border-[#E9E1D3] text-[#5B687A] hover:text-[#1B2A38]'
            }`}
          >
            {adminUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>Training Simulation Sandbox</span>
          </button>
        </div>
      </div>

      {/* TAB 1: WHITE-LABEL WORKSPACE SWITCHER & CONFIGURATION */}
      {activeTab === 'workspaces' && (
        <div className="space-y-6">
          {/* 3 Configurable Coastal Workspaces */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspace.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => switchWorkspace(ws.id)}
                  className={`text-left rounded-2xl p-4 border-2 transition-all bg-white ${
                    isActive
                      ? 'border-[#0F766E] shadow-md'
                      : 'border-[#E9E1D3] hover:border-[#0B3B3C]/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: ws.branding.accentColor }}
                    >
                      <WorkspaceIcon icon={ws.branding.icon} className="w-5 h-5" />
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-[#FBF8F3] border border-[#E9E1D3] text-[#5B687A] text-[10px] font-semibold">
                        Switch
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm text-[#0B3B3C] mt-3">{ws.name}</h3>
                  <p className="text-[11px] text-[#5B687A] mt-0.5">{ws.sector}</p>

                  <div className="mt-3 pt-3 border-t border-[#E9E1D3] space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B687A]">Tenant ID</span>
                      <span className="font-mono text-[10px] text-[#1B2A38]">
                        {ws.organizationId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B687A]">Plan</span>
                      <span className="font-semibold text-[#0B3B3C]">
                        {ws.planTier === 'ENTERPRISE' ? 'Enterprise' : 'Starter'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B687A]">Geofence</span>
                      <span className="font-mono text-[10px] text-[#1B2A38]">
                        {(ws.geofence.radiusMeters / 1000).toFixed(1)} km
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Active Workspace Branding & Geofence Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* White-Label Branding */}
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E9E1D3] pb-3">
                <Palette className="w-4 h-4 text-[#0F766E]" />
                <h2 className="font-bold text-sm text-[#0B3B3C]">
                  Organization Branding &amp; Dashboard Identity
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="font-semibold text-[#5B687A]">Dashboard Brand Name</span>
                  <input
                    type="text"
                    value={activeWorkspace.branding.displayName}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        branding: { ...curr.branding, displayName: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-[#1B2A38]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-[#5B687A]">Logo Monogram</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={activeWorkspace.branding.logoText}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        branding: {
                          ...curr.branding,
                          logoText: e.target.value.toUpperCase(),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-[#1B2A38] font-mono"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-[#5B687A]">Operational Tagline</span>
                  <input
                    type="text"
                    value={activeWorkspace.branding.tagline}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        branding: { ...curr.branding, tagline: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-[#1B2A38]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-[#5B687A]">Primary Header Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={activeWorkspace.branding.primaryColor}
                      onChange={(e) =>
                        updateActiveWorkspace((curr) => ({
                          ...curr,
                          branding: { ...curr.branding, primaryColor: e.target.value },
                        }))
                      }
                      className="w-10 h-9 rounded-lg border border-[#E9E1D3] cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-[#5B687A]">
                      {activeWorkspace.branding.primaryColor}
                    </span>
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-[#5B687A]">Accent Badge Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={activeWorkspace.branding.accentColor}
                      onChange={(e) =>
                        updateActiveWorkspace((curr) => ({
                          ...curr,
                          branding: { ...curr.branding, accentColor: e.target.value },
                        }))
                      }
                      className="w-10 h-9 rounded-lg border border-[#E9E1D3] cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-[#5B687A]">
                      {activeWorkspace.branding.accentColor}
                    </span>
                  </div>
                </label>
              </div>
            </section>

            {/* Region, Geofence & Tenant Settings */}
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-[#E9E1D3] pb-3">
                <MapPin className="w-4 h-4 text-[#0F766E]" />
                <h2 className="font-bold text-sm text-[#0B3B3C]">
                  Region, Geofence &amp; Operational Policy
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="space-y-1 sm:col-span-2">
                  <span className="font-semibold text-[#5B687A]">Monitored Geofence Label</span>
                  <input
                    type="text"
                    value={activeWorkspace.geofence.regionName}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        geofence: { ...curr.geofence, regionName: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-[#1B2A38]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-[#5B687A]">Geofence Radius (meters)</span>
                  <input
                    type="number"
                    min={300}
                    max={25000}
                    step={100}
                    value={activeWorkspace.geofence.radiusMeters}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        geofence: {
                          ...curr.geofence,
                          radiusMeters: Math.max(300, Number(e.target.value) || 1000),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-[#1B2A38] font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-semibold text-[#5B687A]">Escalation Timer (seconds)</span>
                  <input
                    type="number"
                    min={30}
                    max={600}
                    step={15}
                    value={activeWorkspace.settings.autoEscalateSeconds}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        settings: {
                          ...curr.settings,
                          autoEscalateSeconds: Math.max(30, Number(e.target.value) || 90),
                        },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-[#1B2A38] font-mono"
                  />
                </label>
              </div>

              <div className="pt-2 space-y-2 text-xs">
                <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                  <span className="font-medium text-[#1B2A38]">
                    Bilingual English + Tamil Emergency &amp; SBAR Support
                  </span>
                  <input
                    type="checkbox"
                    checked={activeWorkspace.settings.enableBilingualTamil}
                    onChange={(e) =>
                      updateActiveWorkspace((curr) => ({
                        ...curr,
                        settings: {
                          ...curr.settings,
                          enableBilingualTamil: e.target.checked,
                        },
                      }))
                    }
                    className="accent-[#0F766E] w-4 h-4"
                  />
                </label>

                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#78350F]">
                  <span className="font-medium">
                    Human Dispatcher SBAR Approval Gate (Mandatory Safety Lock)
                  </span>
                  <span className="font-bold text-[10px] uppercase">Enforced</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: SAAS SUBSCRIPTION & USAGE DASHBOARD */}
      {activeTab === 'subscription' && (
        <div className="space-y-6">
          <div className="p-3.5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#78350F] flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
            <div>
              <strong>Plan Tier &amp; Usage Transparency (No Real Billing Gateway Connected):</strong>{' '}
              Live database counts and runtime counters are explicitly labeled{' '}
              <strong>INSTRUMENTED</strong>, while monthly quota models without billing metering
              are labeled <strong>PREVIEW QUOTA MODEL</strong>.
            </div>
          </div>

          {/* Plan Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(['STARTER', 'ENTERPRISE'] as SaasPlanTier[]).map((tier) => {
              const isCurrent = activeWorkspace.planTier === tier;
              const isEnt = tier === 'ENTERPRISE';
              const features = isEnt ? ENTERPRISE_FEATURES : STARTER_FEATURES;
              return (
                <section
                  key={tier}
                  className={`rounded-2xl p-5 bg-white border-2 flex flex-col justify-between ${
                    isCurrent ? 'border-[#0F766E] shadow-sm' : 'border-[#E9E1D3]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#0F766E]">
                        {isEnt ? 'Enterprise Port / Resort' : 'Starter'}
                      </span>
                      {isCurrent && (
                        <span className="px-2.5 py-0.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[10px] font-bold">
                          Current Workspace Plan
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif-heading text-xl font-bold text-[#0B3B3C] mt-1">
                      {isEnt ? 'Multi-Region Coastal Command' : 'Essential Coastal Intelligence'}
                    </h3>
                    <p className="text-xs text-[#5B687A] mt-1">
                      {isEnt
                        ? 'Full emergency dispatch, Nexconn voice/video, Google Maps routing, Gemini SBAR handoff, and white-label multi-tenancy.'
                        : 'Core risk intelligence map, forecasting, SHAP explainability, and single-workspace monitoring.'}
                    </p>

                    <ul className="mt-4 space-y-2 text-xs text-[#1B2A38]">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-4 border-t border-[#E9E1D3] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#5B687A]">
                      Status:{' '}
                      <strong className="text-[#0B3B3C]">
                        {isCurrent ? activeWorkspace.subscriptionStatus.replace('_', ' ') : 'Available'}
                      </strong>
                    </span>
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setActiveWorkspacePlanPreview(tier)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                        isCurrent
                          ? 'bg-[#FBF8F3] text-[#5B687A] cursor-default'
                          : 'bg-[#0B3B3C] hover:bg-[#0F766E] text-white'
                      }`}
                    >
                      {isCurrent ? 'Active Tier' : 'Preview Plan Tier'}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>

          {/* Instrumented vs Simulated Usage Telemetry */}
          <section className="bg-white rounded-2xl border border-[#E9E1D3] p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E9E1D3] pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#0F766E]" />
                <h2 className="font-bold text-sm text-[#0B3B3C]">
                  Tenant Usage &amp; Operational Telemetry ({activeWorkspace.organizationId})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void loadUsage()}
                disabled={usageLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E9E1D3] bg-[#FBF8F3] text-xs font-semibold text-[#0B3B3C]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${usageLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {usageError && (
              <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                {usageError}
              </div>
            )}

            {usage && (
              <>
                {/* Instrumented Real Counters */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[10px] font-bold uppercase">
                      Instrumented · Live DB &amp; Runtime
                    </span>
                    <span className="text-[11px] text-[#5B687A]">
                      Scoped strictly to {usage.organizationId} · Server uptime{' '}
                      {usage.instrumented.serverUptimeSeconds}s
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                      <span className="text-[11px] text-[#5B687A] block">Tenant Incidents (DB)</span>
                      <strong className="text-xl font-extrabold text-[#0B3B3C]">
                        {usage.instrumented.incidentsTotal}
                      </strong>
                      <span className="block text-[10px] text-[#0F766E]">
                        {usage.instrumented.incidentsActive} active
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                      <span className="text-[11px] text-[#5B687A] block">Medical SBARs (DB)</span>
                      <strong className="text-xl font-extrabold text-[#0B3B3C]">
                        {usage.instrumented.medicalHandoffsTotal}
                      </strong>
                      <span className="block text-[10px] text-[#5B687A]">Versioned records</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                      <span className="text-[11px] text-[#5B687A] block">112 Tracking Links (DB)</span>
                      <strong className="text-xl font-extrabold text-[#0B3B3C]">
                        {usage.instrumented.publicTrackingLinksTotal}
                      </strong>
                      <span className="block text-[10px] text-[#5B687A]">Token-hashed links</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                      <span className="text-[11px] text-[#5B687A] block">
                        Session Nexconn Groups
                      </span>
                      <strong className="text-xl font-extrabold text-[#0B3B3C]">
                        {usage.instrumented.runtimeCounters.nexconnGroupsTriggered}
                      </strong>
                      <span className="block text-[10px] text-[#0F766E]">Live SDK groups created</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3]">
                      <span className="text-[11px] text-[#5B687A] block">
                        Session Gemini Briefings
                      </span>
                      <strong className="text-xl font-extrabold text-[#0B3B3C]">
                        {usage.instrumented.runtimeCounters.geminiBriefingsGenerated}
                      </strong>
                      <span className="block text-[10px] text-[#5B687A]">Since server boot</span>
                    </div>
                  </div>
                </div>

                {/* Preview Monthly Quotas */}
                <div className="space-y-3 pt-3 border-t border-[#E9E1D3]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[10px] font-bold uppercase">
                      Preview Quota Model (Unbilled)
                    </span>
                    <span className="text-[11px] text-[#5B687A]">
                      {usage.simulatedDemoMetrics.disclaimer}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-xl border border-[#E9E1D3] space-y-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-[#0B3B3C]">Nexconn Communications (Preview Quota)</span>
                        <span className="font-mono">
                          {usage.simulatedDemoMetrics.nexconnMessagesUsed.toLocaleString()} /{' '}
                          {usage.simulatedDemoMetrics.nexconnMessagesLimit.toLocaleString()} msgs
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[#E9E1D3] overflow-hidden">
                        <div
                          className="h-full bg-[#0F766E] rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (usage.simulatedDemoMetrics.nexconnMessagesUsed /
                                  usage.simulatedDemoMetrics.nexconnMessagesLimit) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-[#E9E1D3] space-y-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-[#0B3B3C]">Gemini AI Briefings (Preview Quota)</span>
                        <span className="font-mono">
                          {usage.simulatedDemoMetrics.geminiBriefingsUsed.toLocaleString()} /{' '}
                          {usage.simulatedDemoMetrics.geminiBriefingsLimit.toLocaleString()} calls
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-[#E9E1D3] overflow-hidden">
                        <div
                          className="h-full bg-[#0284C7] rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (usage.simulatedDemoMetrics.geminiBriefingsUsed /
                                  usage.simulatedDemoMetrics.geminiBriefingsLimit) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E9E1D3] text-[#5B687A]">
                          <th className="py-2 pr-4 font-semibold">Period (Simulated)</th>
                          <th className="py-2 pr-4 font-semibold">Nexconn Messages</th>
                          <th className="py-2 pr-4 font-semibold">Gemini Briefings</th>
                          <th className="py-2 font-semibold">Incidents Handled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.simulatedDemoMetrics.monthlyHistory.map((row) => (
                          <tr key={row.month} className="border-b border-[#E9E1D3]/60">
                            <td className="py-2 pr-4 font-medium text-[#1B2A38]">{row.month}</td>
                            <td className="py-2 pr-4 font-mono">{row.nexconnMessages}</td>
                            <td className="py-2 pr-4 font-mono">{row.geminiBriefings}</td>
                            <td className="py-2 font-mono">{row.incidentsHandled}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: HIDDEN ADMIN-ONLY EMERGENCY SIMULATION */}
      {activeTab === 'simulation' && (
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-[#FEF2F2] border-2 border-[#DC2626]/40 text-xs text-[#7F1D1D] flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm">
                TRAINING SANDBOX ONLY — Isolated Sandbox Tenant (org-demo-simulation-sandbox)
              </p>
              <p>
                This training scenario runs strictly on synthetic data inside an isolated sandbox
                tenant. It <strong>never</strong> creates real public SOS records,{' '}
                <strong>never</strong> contacts 112, <strong>never</strong> dispatches actual
                responders or ambulances, and <strong>never</strong> publishes real patient data.
                Backend endpoints enforce <code className="font-mono">ORG_ADMIN</code> RBAC.
              </p>
            </div>
          </div>

          {!adminUnlocked ? (
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-8 text-center space-y-3">
              <Lock className="w-8 h-8 text-[#0B3B3C] mx-auto" />
              <h2 className="font-bold text-base text-[#0B3B3C]">
                Authorized Administrator Access Required
              </h2>
              <p className="text-xs text-[#5B687A] max-w-md mx-auto">
                The 9-step end-to-end training simulation is isolated from standard operator views
                and requires <code className="font-mono">ORG_ADMIN</code> authorization.
              </p>
              <button
                type="button"
                onClick={() => setAdminUnlocked(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3B3C] hover:bg-[#0F766E] text-white text-xs font-bold"
              >
                <Unlock className="w-4 h-4" />
                <span>Unlock Admin Sandbox Controls</span>
              </button>
            </section>
          ) : (
            <section className="bg-white rounded-2xl border border-[#E9E1D3] p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E9E1D3] pb-4">
                <div>
                  <span className="px-2 py-0.5 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[10px] font-bold uppercase">
                    SANDBOX DRILL · 9-Step End-to-End Scenario
                  </span>
                  <h2 className="font-bold text-base text-[#0B3B3C] mt-1">
                    Coastal Rip-Current Rescue &amp; Medical SBAR Walkthrough
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={simLoading}
                    onClick={() => void handleRunSimulation()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5A54] text-white text-xs font-bold disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    <span>
                      {simLoading
                        ? 'Running 9-Step Simulation...'
                        : simulation
                          ? 'Replay Training Simulation'
                          : 'Run 9-Step Training Simulation'}
                    </span>
                  </button>

                  {simulation && (
                    <button
                      type="button"
                      disabled={simLoading}
                      onClick={() => void handleResetSimulation()}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-xs font-semibold text-[#0B3B3C] hover:bg-[#F3ECE0]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {simError && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                  {simError}
                </div>
              )}

              {simulation ? (
                <div className="space-y-5">
                  {/* Synthetic Gemini SBAR Preview */}
                  <div className="p-4 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#0B3B3C] inline-flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#0F766E]" />
                        <span>
                          Synthetic Gemini Bilingual SBAR Output ({simulation.sbarPreview.modelUsed})
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#FEF2F2] border border-[#DC2626] text-[#991B1B] font-bold text-[10px]">
                        {simulation.sbarPreview.severity} · DEMO ONLY
                      </span>
                    </div>
                    <p className="text-[#1B2A38]">
                      <strong>English:</strong> {simulation.sbarPreview.englishSummary}
                    </p>
                    <p className="text-[#1B2A38]">
                      <strong>தமிழ்:</strong> {simulation.sbarPreview.tamilSummary}
                    </p>
                    <p className="text-[11px] text-[#78350F]">{simulation.sbarPreview.disclaimer}</p>
                  </div>

                  {/* 9-Step Audit Timeline */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#5B687A]">
                      Timeline &amp; Audit History ({simulation.simulationId} ·{' '}
                      {simulation.syntheticIncidentCode})
                    </h3>
                    <ol className="space-y-2">
                      {simulation.steps.map((step) => (
                        <li
                          key={step.stepNumber}
                          className="p-3 rounded-xl border border-[#E9E1D3] bg-white flex items-start gap-3 text-xs"
                        >
                          <div className="w-6 h-6 rounded-full bg-[#0F766E] text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                            {step.stepNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-[#0B3B3C]">{step.title}</span>
                              <span className="font-mono text-[10px] text-[#5B687A] inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-[#5B687A] mt-0.5">{step.detail}</p>
                            <p className="text-[10px] text-[#0F766E] font-semibold mt-1">
                              Actor: {step.actor}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#5B687A]">
                  Click <strong>Run 9-Step Training Simulation</strong> to execute the isolated
                  synthetic coastal emergency walkthrough (risk spike → QR SOS → verification →
                  sandbox Nexconn channel → responder dispatch &amp; GPS progression → Gemini SBAR
                  handoff → resolution &amp; audit timeline).
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
