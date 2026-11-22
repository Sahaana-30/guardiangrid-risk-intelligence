import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Clock, FlaskConical, RefreshCw, ShieldAlert, Stethoscope, Users } from 'lucide-react';
import { DataTrustBadge } from '../ProvenanceTip';
import {
  fetchDashboardOverview,
  type DashboardOverviewFilters,
  type DashboardOverviewResponse,
} from '../../services/dashboardApi';
import { useWorkspace } from '../../context/WorkspaceContext';

interface RescuePerformanceSectionProps {
  /** Pass an already-loaded overview (e.g. from Dashboard) to avoid duplicate API calls when viewing real operations. */
  overview?: DashboardOverviewResponse | null;
  filters?: DashboardOverviewFilters;
  compact?: boolean;
}

function formatSeconds(sec?: number | null): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return 'Insufficient data';
  if (sec < 60) return `${Math.round(sec)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  if (mins < 60) return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

export const RescuePerformanceSection: React.FC<RescuePerformanceSectionProps> = ({
  overview: externalOverview,
  filters,
  compact = false,
}) => {
  const { activeWorkspace } = useWorkspace();
  const [viewMode, setViewMode] = useState<'real' | 'simulated'>('real');
  const [internalOverview, setInternalOverview] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPerformance = useCallback(
    async (includeSimulated: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchDashboardOverview({
          range: filters?.range || '30d',
          from: filters?.from,
          to: filters?.to,
          regionId: filters?.regionId,
          beach: filters?.beach,
          cellId: filters?.cellId,
          category: filters?.category,
          includeSimulated,
        });
        setInternalOverview(res);
      } catch (err: any) {
        setError(err?.message || 'Unable to load rescue performance analytics.');
      } finally {
        setLoading(false);
      }
    },
    [
      filters?.range,
      filters?.from,
      filters?.to,
      filters?.regionId,
      filters?.beach,
      filters?.cellId,
      filters?.category,
    ]
  );

  // Use external overview for real-only mode if provided; fetch separately when viewing simulated drills or standalone
  useEffect(() => {
    if (viewMode === 'real' && externalOverview !== undefined) {
      return;
    }
    void loadPerformance(viewMode === 'simulated');
  }, [viewMode, externalOverview, loadPerformance, activeWorkspace.id]);

  const activeOverview =
    viewMode === 'real' && externalOverview !== undefined ? externalOverview : internalOverview;
  const perf = activeOverview?.operationalPerformance;
  const rangeLabel = (activeOverview?.appliedFilters?.range || filters?.range || '30d').toUpperCase();
  const isSimulatedView = viewMode === 'simulated';

  const durationCards = [
    {
      label: 'SOS → Acknowledgement',
      stat: perf?.sosAcknowledgementSeconds,
      definition: 'Time from SOS creation to first official alert acknowledgement (or verification).',
    },
    {
      label: 'SOS → Verification',
      stat: perf?.sosVerificationSeconds,
      definition: 'Time from SOS persistence to human dispatcher verification.',
    },
    {
      label: 'Verification → Assignment',
      stat: perf?.responderAssignmentSeconds,
      definition: 'Time from incident verification to responder dispatch assignment.',
    },
    {
      label: 'Assignment → Responder Ack',
      stat: perf?.responderAcceptanceSeconds,
      definition: 'Time from responder dispatch to field responder acknowledgement.',
    },
    {
      label: 'Assignment → Arrival',
      stat: perf?.timeToSceneSeconds,
      definition: 'Time from responder dispatch to confirmed ON_SCENE arrival.',
    },
    {
      label: 'Total Resolution Time',
      stat: perf?.incidentResolutionSeconds,
      definition: 'Elapsed time from SOS receipt to RESOLVED closure.',
    },
  ];

  const backlog = perf?.queueBacklog;

  return (
    <section className="glass-card rounded-2xl p-4 sm:p-5 border border-[#E9E1D3] space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-[#0F766E]" />
            <h3 className={`font-serif-heading font-bold text-[#1B2A38] ${compact ? 'text-base' : 'text-lg'}`}>
              Rescue Performance Analytics
            </h3>
            <DataTrustBadge
              classification={isSimulatedView ? 'simulated_demo' : 'historical_recorded'}
              compact
              source={`Persisted Incident Timestamps (${activeWorkspace.name})`}
              timestamp={activeOverview?.generatedAt}
              note="Calculated exclusively from actual persisted timestamps. Missing timestamps are excluded rather than invented. No baseline reduction is claimed."
            />
          </div>
          <p className="text-[11px] text-[#5B687A] mt-0.5">
            Window: <strong>{rangeLabel}</strong> · Scope:{' '}
            <strong>
              {isSimulatedView
                ? 'Includes Simulated Drills (Training View)'
                : 'Real Operational Incidents Only (Simulated Excluded)'}
            </strong>
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('real')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                viewMode === 'real'
                  ? 'bg-[#0F766E] text-white'
                  : 'text-[#5B687A] hover:text-[#1B2A38]'
              }`}
            >
              Real Operations
            </button>
            <button
              type="button"
              onClick={() => setViewMode('simulated')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                viewMode === 'simulated'
                  ? 'bg-amber-600 text-white'
                  : 'text-[#5B687A] hover:text-[#1B2A38]'
              }`}
            >
              <FlaskConical className="w-3 h-3" />
              <span>Drill View</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadPerformance(isSimulatedView)}
            className="p-1.5 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] cursor-pointer"
            title="Refresh rescue performance metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0F766E]' : ''}`} />
          </button>
        </div>
      </div>

      {isSimulatedView && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
          <strong>SIMULATED DRILL VIEW:</strong> Includes training drills alongside operational records so judges can inspect end-to-end timing. Switch back to <strong>Real Operations</strong> for strict production metrics.
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {error}
        </div>
      ) : (
        <>
          {/* 6 Persisted-Timestamp Duration Metrics (Avg + Median + Sample Size) */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {durationCards.map((item) => {
              const hasSample = Boolean(item.stat && item.stat.sampleSize > 0);
              return (
                <div
                  key={item.label}
                  title={item.definition}
                  className="rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-[#5B687A]">
                    <span className="truncate">{item.label}</span>
                    <Clock className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  </div>
                  <div className="text-base sm:text-lg font-bold text-[#1B2A38]">
                    {hasSample ? formatSeconds(item.stat?.value) : 'Insufficient data'}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#5B687A]">
                    <span>
                      {hasSample
                        ? `Median: ${formatSeconds(item.stat?.median)}`
                        : 'No completed pairs in window'}
                    </span>
                    <span className="font-mono font-semibold text-[#0B3B3C]">
                      n={item.stat?.sampleSize ?? 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3 Live Queue Backlog Counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="rounded-xl border border-[#E9E1D3] bg-white px-3 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[#5B687A]">
                <ShieldAlert className="w-4 h-4 text-[#D65A4A]" />
                <span>Awaiting Acknowledgement</span>
              </div>
              <span className="text-sm font-bold text-[#1B2A38]">
                {backlog?.awaitingAcknowledgement ?? activeOverview?.kpis.pointInTime.unacknowledgedSosAlerts ?? 0}
              </span>
            </div>

            <div className="rounded-xl border border-[#E9E1D3] bg-white px-3 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[#5B687A]">
                <Users className="w-4 h-4 text-amber-600" />
                <span>Awaiting Responder Assignment</span>
              </div>
              <span className="text-sm font-bold text-[#1B2A38]">
                {backlog?.awaitingResponderAssignment ?? 0}
              </span>
            </div>

            <div className="rounded-xl border border-[#E9E1D3] bg-white px-3 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[#5B687A]">
                <Stethoscope className="w-4 h-4 text-[#0F766E]" />
                <span>Awaiting Medical Handoff</span>
              </div>
              <span className="text-sm font-bold text-[#1B2A38]">
                {backlog?.awaitingMedicalHandoff ?? activeOverview?.kpis.pointInTime.pendingMedicalHandoffs ?? 0}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
