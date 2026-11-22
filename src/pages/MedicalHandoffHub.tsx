import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Stethoscope,
  FileCheck2,
  Clock,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { useEmergency } from '../context/EmergencyContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { fetchMedicalHandoffsApi } from '../services/medicalHandoffApi';
import { DataTrustBadge, formatReadingAge } from '../components/ProvenanceTip';
import { BackNavButton } from '../components/BackNavButton';
import type { MedicalHandoffReportRecord } from '../types/medicalHandoff';

interface IncidentHandoffBundle {
  reports: MedicalHandoffReportRecord[];
  links: Array<{ revokedAt?: string | null }>;
  error?: string;
}

export const MedicalHandoffHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { incidents, loading: incidentsLoading, refreshIncidents } = useEmergency();
  const { activeWorkspace } = useWorkspace();

  const [bundles, setBundles] = useState<Record<string, IncidentHandoffBundle>>({});
  const [loadingBundles, setLoadingBundles] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const focusedIncidentId = searchParams.get('incidentId') || '';

  const candidateIncidents = useMemo(() => {
    const filtered = incidents.filter((i) => i.state !== 'REJECTED');
    if (focusedIncidentId) {
      const exact = filtered.filter((i) => i.id === focusedIncidentId);
      if (exact.length > 0) return exact;
    }
    return filtered.slice(0, 15);
  }, [incidents, focusedIncidentId]);

  useEffect(() => {
    let cancelled = false;
    if (candidateIncidents.length === 0) {
      setBundles({});
      return;
    }

    const loadAll = async () => {
      setLoadingBundles(true);
      const next: Record<string, IncidentHandoffBundle> = {};
      await Promise.all(
        candidateIncidents.map(async (inc) => {
          try {
            const res = await fetchMedicalHandoffsApi(inc.id);
            next[inc.id] = { reports: res.reports || [], links: res.links || [] };
          } catch (err: any) {
            next[inc.id] = {
              reports: [],
              links: [],
              error: err?.message || 'Unable to load handoff records',
            };
          }
        })
      );
      if (!cancelled) {
        setBundles(next);
        setLoadingBundles(false);
      }
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [candidateIncidents, activeWorkspace.organizationId]);

  const rows = useMemo(() => {
    return candidateIncidents
      .map((inc) => {
        const bundle = bundles[inc.id];
        const latestReport = bundle?.reports?.[0] || null;
        const activeLinks = (bundle?.links || []).filter((l) => !l.revokedAt);
        const needsReview =
          latestReport?.status === 'DRAFT_PENDING_REVIEW' ||
          inc.state === 'VICTIM_RECOVERED' ||
          inc.state === 'MEDICAL_HANDOFF';
        return { incident: inc, latestReport, activeLinks, needsReview, error: bundle?.error };
      })
      .filter((row) => {
        if (statusFilter === 'pending') return row.needsReview;
        if (statusFilter === 'approved') return row.latestReport?.status === 'APPROVED';
        return true;
      });
  }, [candidateIncidents, bundles, statusFilter]);

  const summary = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let activeTrackingLinks = 0;
    candidateIncidents.forEach((inc) => {
      const b = bundles[inc.id];
      const latest = b?.reports?.[0];
      if (
        latest?.status === 'DRAFT_PENDING_REVIEW' ||
        inc.state === 'VICTIM_RECOVERED' ||
        inc.state === 'MEDICAL_HANDOFF'
      ) {
        pending++;
      }
      if (latest?.status === 'APPROVED') approved++;
      activeTrackingLinks += (b?.links || []).filter((l) => !l.revokedAt).length;
    });
    return { pending, approved, activeTrackingLinks };
  }, [candidateIncidents, bundles]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <BackNavButton fallbackPath="/dashboard" />
            <h2 className="font-serif-heading text-2xl font-bold text-[#1B2A38]">
              Medical Handoff & Bilingual SBAR Queue
            </h2>
            <DataTrustBadge
              classification="live_measured"
              source={`Medical Handoff Repository (${activeWorkspace.name})`}
              note="Human-in-the-loop dispatcher approval required before releasing AI-assisted SBAR briefings to 112 / receiving hospital teams."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#5B687A] mt-1">
            Track versioned English + Tamil SBAR handoffs, dispatcher approvals, and tokenized 112 paramedic tracking links.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void refreshIncidents()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${incidentsLoading || loadingBundles ? 'animate-spin text-[#0F766E]' : ''}`} />
            <span>Refresh Queue</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/command')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B5D56] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
          >
            <span>Open Live Operations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-4 border border-[#E9E1D3]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#5B687A]">
              Pending Medical Handoffs
            </span>
            <Clock className="w-4 h-4 text-[#D65A4A]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1B2A38]">{summary.pending}</div>
          <div className="text-[11px] text-[#5B687A] mt-1">
            Draft SBARs or recovered victims awaiting hospital handoff
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-[#E9E1D3]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#5B687A]">
              Dispatcher-Approved SBARs
            </span>
            <FileCheck2 className="w-4 h-4 text-[#0F766E]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1B2A38]">{summary.approved}</div>
          <div className="text-[11px] text-[#5B687A] mt-1">
            Verified for receiving emergency department teams
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-[#E9E1D3]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#5B687A]">
              Active 112 Tracking Links
            </span>
            <ExternalLink className="w-4 h-4 text-sky-700" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1B2A38]">{summary.activeTrackingLinks}</div>
          <div className="text-[11px] text-[#5B687A] mt-1">
            Read-only revocable links shared with paramedics
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: 'All Incidents' },
            { id: 'pending', label: 'Needs Review / Handoff' },
            { id: 'approved', label: 'Approved SBARs' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setStatusFilter(t.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                statusFilter === t.id
                  ? 'bg-[#0F766E] text-white font-semibold'
                  : 'bg-white border border-[#E9E1D3] text-[#5B687A] hover:text-[#1B2A38]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {focusedIncidentId && (
          <button
            type="button"
            onClick={() => {
              searchParams.delete('incidentId');
              setSearchParams(searchParams, { replace: true });
            }}
            className="text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer"
          >
            Showing focused incident · Show all queue
          </button>
        )}
      </div>

      {/* Handoff Table */}
      {incidentsLoading && rows.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-xs text-[#5B687A]">
          Loading medical handoff records...
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-2 border border-[#E9E1D3]">
          <Stethoscope className="w-8 h-8 text-[#5B687A]/50 mx-auto" />
          <div className="text-sm font-semibold text-[#1B2A38]">
            No medical handoff records in this view
          </div>
          <p className="text-xs text-[#5B687A]">
            Generate a bilingual SBAR report inside Live Operations for any active incident.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ incident, latestReport, activeLinks, error }) => (
            <div
              key={incident.id}
              className="glass-card rounded-2xl p-5 border border-[#E9E1D3] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-[#0B3B3C]">
                    {incident.code}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F6F1E7] border border-[#E9E1D3] text-[#1B2A38]">
                    {incident.state.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs font-medium text-[#1B2A38]">
                    {incident.siteName} · {incident.cellLabel}
                  </span>
                  {incident.isSimulated && (
                    <DataTrustBadge classification="simulated_demo" compact source="Simulated Drill" />
                  )}
                </div>

                {latestReport ? (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-[#5B687A]">
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                        latestReport.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : latestReport.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-300'
                      }`}
                    >
                      SBAR v{latestReport.version}: {latestReport.status}
                    </span>
                    <span>Severity: {latestReport.severity}</span>
                    <span>•</span>
                    <span>Generated {formatReadingAge(latestReport.generatedAt).ageLabel}</span>
                    {latestReport.reviewedByName && (
                      <span>• Reviewed by {latestReport.reviewedByName}</span>
                    )}
                    <span>• {activeLinks.length} active 112 link(s)</span>
                  </div>
                ) : error ? (
                  <div className="text-xs text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{error}</span>
                  </div>
                ) : (
                  <div className="text-xs text-[#5B687A] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    <span>No bilingual SBAR draft generated yet for this incident.</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => navigate(`/command?incidentId=${incident.id}`)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#0F766E]/30 bg-white hover:bg-[#0F766E] hover:text-white text-[#0F766E] text-xs font-semibold cursor-pointer transition-colors shrink-0 self-start lg:self-center"
              >
                <span>{latestReport ? 'Review / Share SBAR' : 'Generate SBAR in Command'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
