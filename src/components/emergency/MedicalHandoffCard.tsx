import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileHeart,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Waves,
  Wind,
  XCircle,
} from 'lucide-react';
import type {
  MedicalHandoffLinkMetadata,
  MedicalHandoffReportRecord,
} from '../../types/medicalHandoff';
import {
  createPublicParamedicLinkApi,
  fetchMedicalHandoffsApi,
  generateMedicalHandoffApi,
  reviewMedicalHandoffApi,
  revokePublicParamedicLinkApi,
  shareMedicalHandoffToNexconnApi,
} from '../../services/medicalHandoffApi';

interface MedicalHandoffCardProps {
  incidentId: string;
  incidentCode?: string;
  cellId?: string;
  nexconnGroupLive?: boolean;
  /** When embedded inside a Nexconn chat message, lock to that specific report version & compact UI */
  embeddedReportId?: string;
  compact?: boolean;
  canReviewAndShare?: boolean;
}

function severityStyles(severity: MedicalHandoffReportRecord['severity']): string {
  if (severity === 'CRITICAL') return 'bg-[#FEF2F2] text-[#991B1B] border-[#DC2626]';
  if (severity === 'HIGH') return 'bg-[#FFFBEB] text-[#92400E] border-[#D97706]';
  return 'bg-[#ECFDF5] text-[#0B3B3C] border-[#0F766E]';
}

function statusLabel(status: MedicalHandoffReportRecord['status']): string {
  if (status === 'APPROVED') return 'Dispatcher Approved';
  if (status === 'REJECTED') return 'Rejected — Revision Required';
  return 'Pending Human Dispatcher Review';
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const MedicalHandoffCard: React.FC<MedicalHandoffCardProps> = ({
  incidentId,
  incidentCode,
  cellId,
  nexconnGroupLive = false,
  embeddedReportId,
  compact = false,
  canReviewAndShare = true,
}) => {
  const [reports, setReports] = useState<MedicalHandoffReportRecord[]>([]);
  const [links, setLinks] = useState<MedicalHandoffLinkMetadata[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(embeddedReportId || null);
  const [lang, setLang] = useState<'en' | 'ta'>('en');
  const [expanded, setExpanded] = useState<Record<'S' | 'B' | 'A' | 'R', boolean>>({
    S: true,
    B: !compact,
    A: true,
    R: !compact,
  });

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [victimCountInput, setVictimCountInput] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState<number>(120);
  const [generatedLinkUrl, setGeneratedLinkUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMedicalHandoffsApi(
        incidentId,
        canReviewAndShare ? 'DISPATCHER' : 'RESPONDER'
      );
      setReports(data.reports);
      setLinks(data.links);
      if (embeddedReportId) {
        setSelectedReportId(embeddedReportId);
      } else if (data.reports.length > 0) {
        setSelectedReportId((prev) =>
          prev && data.reports.some((r) => r.id === prev) ? prev : data.reports[0].id
        );
      } else {
        setSelectedReportId(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load medical handoff reports.');
    } finally {
      setLoading(false);
    }
  }, [incidentId, embeddedReportId, canReviewAndShare]);

  useEffect(() => {
    void loadData();
    setGeneratedLinkUrl(null);
    setNotice(null);
  }, [loadData]);

  const activeReport = useMemo(() => {
    if (reports.length === 0) return null;
    if (selectedReportId) {
      const match = reports.find((r) => r.id === selectedReportId);
      if (match) return match;
    }
    return reports[0];
  }, [reports, selectedReportId]);

  const handleGenerate = async () => {
    setBusyAction('generate');
    setError(null);
    setNotice(null);
    try {
      const parsedCount =
        victimCountInput.trim() !== '' && Number.isFinite(Number(victimCountInput))
          ? Math.max(0, Math.round(Number(victimCountInput)))
          : null;
      const clientRequestId = `mh-gen-${incidentId}-${Date.now()}`;
      const res = await generateMedicalHandoffApi({
        incidentId,
        victimCount: parsedCount,
        clientRequestId,
        roleHeader: canReviewAndShare ? 'DISPATCHER' : 'RESPONDER',
      });
      await loadData();
      setSelectedReportId(res.report.id);
      setGeneratedLinkUrl(null);
      setNotice(
        `Generated bilingual SBAR v${res.report.version} (${res.report.severity}). Human dispatcher review is required before sharing.`
      );
    } catch (err: any) {
      setError(err?.message || 'Medical handoff generation failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleReview = async (decision: 'approve' | 'reject') => {
    if (!activeReport) return;
    setBusyAction(decision);
    setError(null);
    setNotice(null);
    try {
      const res = await reviewMedicalHandoffApi({
        incidentId,
        reportId: activeReport.id,
        decision,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      setReports((prev) => prev.map((r) => (r.id === res.report.id ? res.report : r)));
      setReviewNotes('');
      setNotice(
        decision === 'approve'
          ? `Report v${res.report.version} approved by dispatcher. You may now share it to the Nexconn group or generate a 112 / Paramedic live link.`
          : `Report v${res.report.version} marked rejected. Regenerate a new version after updating incident observations.`
      );
    } catch (err: any) {
      setError(err?.message || 'Unable to submit dispatcher review.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleShareNexconn = async () => {
    if (!activeReport) return;
    setBusyAction('share');
    setError(null);
    setNotice(null);
    try {
      const res = await shareMedicalHandoffToNexconnApi({
        incidentId,
        reportId: activeReport.id,
      });
      setReports((prev) => prev.map((r) => (r.id === res.report.id ? res.report : r)));
      setNotice(`Approved handoff v${res.report.version} published to the Nexconn incident group.`);
    } catch (err: any) {
      setError(err?.message || 'Unable to share handoff to Nexconn.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreatePublicLink = async () => {
    if (!activeReport) return;
    setBusyAction('link');
    setError(null);
    setNotice(null);
    try {
      const res = await createPublicParamedicLinkApi({
        incidentId,
        reportId: activeReport.id,
        expiresInMinutes: ttlMinutes,
      });
      setGeneratedLinkUrl(res.publicUrl);
      setLinks((prev) => [res.link, ...prev]);
      setNotice(res.notice);
    } catch (err: any) {
      setError(err?.message || 'Unable to generate 112 / Paramedic live link.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setBusyAction(`revoke-${linkId}`);
    setError(null);
    try {
      const res = await revokePublicParamedicLinkApi({ incidentId, linkId });
      setLinks((prev) => prev.map((l) => (l.id === res.link.id ? res.link : l)));
      setNotice('Public tracking link immediately revoked. Live GPS sharing has stopped.');
    } catch (err: any) {
      setError(err?.message || 'Unable to revoke public tracking link.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyUrl = async () => {
    if (!generatedLinkUrl) return;
    try {
      await navigator.clipboard.writeText(generatedLinkUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const sbar = activeReport
    ? lang === 'ta'
      ? activeReport.payload.tamil
      : activeReport.payload.english
    : null;
  const env = activeReport?.payload.environmentalConditions || null;

  return (
    <section
      className={`rounded-2xl border border-[#E9E1D3] bg-white ${
        compact ? 'p-3.5 space-y-3' : 'p-4 sm:p-5 space-y-4'
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#E9E1D3]">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <FileHeart className="w-4 h-4 text-[#0F766E]" />
            <h3 className="font-bold text-[#0B3B3C] text-sm">
              AI Medical &amp; Ambulance Handoff (Bilingual SBAR)
            </h3>
            {activeReport && (
              <span className="font-mono text-[11px] font-semibold text-[#5B687A]">
                · v{activeReport.version}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#5B687A]">
            {incidentCode || activeReport?.incidentCode || incidentId}
            {(cellId || activeReport?.cellId) && ` · Cell ${cellId || activeReport?.cellId}`}
            {activeReport && ` · ${statusLabel(activeReport.status)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeReport && (
            <span
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide ${severityStyles(
                activeReport.severity
              )}`}
            >
              {activeReport.severity}
            </span>
          )}

          {activeReport && (
            <div className="inline-flex rounded-lg border border-[#E9E1D3] overflow-hidden text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 ${
                  lang === 'en' ? 'bg-[#0F766E] text-white' : 'bg-[#FBF8F3] text-[#5B687A]'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('ta')}
                className={`px-2.5 py-1 ${
                  lang === 'ta' ? 'bg-[#0F766E] text-white' : 'bg-[#FBF8F3] text-[#5B687A]'
                }`}
              >
                தமிழ்
              </button>
            </div>
          )}

          {!embeddedReportId && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold disabled:opacity-50"
            >
              {busyAction === 'generate' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : activeReport ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {busyAction === 'generate'
                  ? 'Generating...'
                  : activeReport
                    ? 'Regenerate New Version'
                    : 'Generate SBAR Handoff'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Optional victim count input prior to generation (non-compact view) */}
      {!embeddedReportId && !compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5B687A]">
          <div className="flex items-center gap-2">
            <label htmlFor={`victim-count-${incidentId}`} className="font-medium">
              Recorded victim count (optional):
            </label>
            <input
              id={`victim-count-${incidentId}`}
              type="number"
              min={0}
              max={99}
              value={victimCountInput}
              onChange={(e) => setVictimCountInput(e.target.value)}
              placeholder="Unknown"
              className="w-20 px-2 py-1 rounded-lg border border-[#E9E1D3] text-xs text-[#1B2A38] bg-[#FBF8F3]"
            />
          </div>

          {reports.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span>Version history:</span>
              <select
                value={activeReport?.id || ''}
                onChange={(e) => setSelectedReportId(e.target.value)}
                className="px-2 py-1 rounded-lg border border-[#E9E1D3] bg-[#FBF8F3] text-xs font-semibold text-[#1B2A38]"
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    v{r.version} · {r.status} ({formatTime(r.generatedAt)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#DC2626]/40 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-3 rounded-xl bg-[#ECFDF5] border border-[#0F766E]/40 text-xs text-[#0B3B3C]">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-[#5B687A]">
          Loading medical handoff records...
        </div>
      ) : !activeReport || !sbar ? (
        <div className="py-5 text-center space-y-1.5 text-xs text-[#5B687A]">
          <p className="font-semibold text-[#1B2A38]">No medical handoff generated yet</p>
          <p>
            Generate a bilingual (English + Tamil) preliminary SBAR report grounded in incident
            records, Nexconn group context, and live Open-Meteo conditions.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Mandatory Medical Safety Disclaimer */}
          <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#D97706]/50 text-xs text-[#78350F] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                Preliminary AI Operational Handoff — Not a Medical Diagnosis
              </p>
              <p className="leading-relaxed">{sbar.medicalDisclaimer}</p>
            </div>
          </div>

          {/* Missing Information Warnings */}
          {activeReport.payload.unavailableInformation.length > 0 && (
            <div className="p-3 rounded-xl bg-[#FEF2F2]/70 border border-[#D65A4A]/40 text-xs text-[#7F1D1D] space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Unavailable / Missing Information (Do Not Assume)</span>
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {activeReport.payload.unavailableInformation.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Expandable SBAR Sections */}
          <div className="space-y-2">
            {/* S — Situation */}
            <div className="rounded-xl border border-[#E9E1D3] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, S: !e.S }))}
                className="w-full px-3.5 py-2.5 bg-[#FBF8F3] flex items-center justify-between text-xs font-bold text-[#0B3B3C]"
              >
                <span>S — SITUATION (Reported Incident Context)</span>
                {expanded.S ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.S && (
                <div className="p-3.5 space-y-1.5 text-xs text-[#1B2A38]">
                  <p><strong>What happened:</strong> {sbar.situation.whatHappened}</p>
                  <p><strong>Current condition:</strong> {sbar.situation.currentIncidentCondition}</p>
                  <p><strong>Victim count:</strong> {sbar.situation.victimCount}</p>
                  <p><strong>Rescue location:</strong> {sbar.situation.currentRescueLocation}</p>
                </div>
              )}
            </div>

            {/* B — Background */}
            <div className="rounded-xl border border-[#E9E1D3] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, B: !e.B }))}
                className="w-full px-3.5 py-2.5 bg-[#FBF8F3] flex items-center justify-between text-xs font-bold text-[#0B3B3C]"
              >
                <span>B — BACKGROUND (Responder Observations &amp; Environmental Data)</span>
                {expanded.B ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.B && (
                <div className="p-3.5 space-y-2 text-xs text-[#1B2A38]">
                  <p><strong>Incident history:</strong> {sbar.background.incidentHistory}</p>
                  {sbar.background.responderReportedObservations.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#0B3B3C]">Responder-Reported Observations:</p>
                      <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                        {sbar.background.responderReportedObservations.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sbar.background.relevantRecentMessages.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#0B3B3C]">Recent Nexconn Channel Messages:</p>
                      <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                        {sbar.background.relevantRecentMessages.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p><strong>Environmental summary:</strong> {sbar.background.environmentalSummary}</p>
                </div>
              )}
            </div>

            {/* A — Assessment */}
            <div className="rounded-xl border border-[#E9E1D3] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, A: !e.A }))}
                className="w-full px-3.5 py-2.5 bg-[#FBF8F3] flex items-center justify-between text-xs font-bold text-[#0B3B3C]"
              >
                <span>A — ASSESSMENT (AI-Generated Preliminary Operational Assessment)</span>
                {expanded.A ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.A && (
                <div className="p-3.5 space-y-2 text-xs text-[#1B2A38]">
                  <p>
                    <strong>Severity rationale ({activeReport.severity}):</strong>{' '}
                    {activeReport.severityRationale}
                  </p>
                  <p>{sbar.assessment.preliminaryOperationalAssessment}</p>
                  {sbar.assessment.supportingEvidence.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#0B3B3C]">Supporting Evidence:</p>
                      <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                        {sbar.assessment.supportingEvidence.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sbar.assessment.uncertaintiesAndUnavailableInfo.length > 0 && (
                    <div>
                      <p className="font-semibold text-[#92400E]">Uncertainties:</p>
                      <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                        {sbar.assessment.uncertaintiesAndUnavailableInfo.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* R — Recommendation */}
            <div className="rounded-xl border border-[#E9E1D3] overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, R: !e.R }))}
                className="w-full px-3.5 py-2.5 bg-[#FBF8F3] flex items-center justify-between text-xs font-bold text-[#0B3B3C]"
              >
                <span>R — RECOMMENDATION (Paramedic Handoff &amp; Site Hazards)</span>
                {expanded.R ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.R && (
                <div className="p-3.5 space-y-2 text-xs text-[#1B2A38]">
                  <div>
                    <p className="font-semibold text-[#0B3B3C]">Immediate Handoff Information:</p>
                    <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                      {sbar.recommendation.immediateHandoffInformation.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-[#0B3B3C]">Environmental &amp; Rescue-Site Hazards:</p>
                    <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                      {sbar.recommendation.environmentalAndSiteHazards.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-[#0B3B3C]">Verify Independently by Receiving Medical Team:</p>
                    <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                      {sbar.recommendation.verifyByReceivingMedicalTeam.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Environmental Conditions & Source Timestamps */}
          {env && (
            <div className="p-3 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#0B3B3C] flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>Verified Environmental Snapshot (Open-Meteo)</span>
                </span>
                <span className="font-mono text-[11px] text-[#5B687A] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Obs: {env.observationTime || 'Unavailable'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Wind</span>
                  <strong className="text-[#1B2A38] flex items-center gap-1">
                    <Wind className="w-3 h-3 text-[#0F766E]" />
                    {env.windSpeedKmh.available
                      ? `${env.windSpeedKmh.value} ${env.windSpeedKmh.unit}`
                      : 'Unavailable'}
                  </strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Wave Height</span>
                  <strong className="text-[#1B2A38]">
                    {env.waveHeightM.available
                      ? `${env.waveHeightM.value} ${env.waveHeightM.unit}`
                      : 'Unavailable'}
                  </strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Air Temp / Rain</span>
                  <strong className="text-[#1B2A38]">
                    {env.airTemperatureC.available ? `${env.airTemperatureC.value}°C` : 'N/A'} ·{' '}
                    {env.precipitationMm.available ? `${env.precipitationMm.value}mm` : 'N/A'}
                  </strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-[#E9E1D3]">
                  <span className="text-[#5B687A] block">Sea Surface Temp</span>
                  <strong className="text-[#1B2A38]">
                    {env.seaSurfaceTemperatureC.available
                      ? `${env.seaSurfaceTemperatureC.value}°C`
                      : 'Unavailable'}
                  </strong>
                </div>
              </div>
              <p className="text-[10px] text-[#5B687A]">
                Generated: {formatTime(activeReport.generatedAt)} · Model: {activeReport.modelUsed} ·
                Nexconn messages read: {activeReport.payload.sourceReferences.nexconnMessagesCount} (
                {activeReport.payload.sourceReferences.nexconnRetrievalStatus})
              </p>
            </div>
          )}

          {/* Dispatcher Review Gate & External Sharing Controls */}
          {canReviewAndShare && !embeddedReportId && (
            <div className="pt-3 border-t border-[#E9E1D3] space-y-3">
              {activeReport.status !== 'APPROVED' ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[#0B3B3C]">
                    Human Dispatcher Review Gate (Required Before Sharing)
                  </p>
                  <input
                    type="text"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Optional dispatcher review note or correction request..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-xs"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handleReview('approve')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve Report v{activeReport.version}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handleReview('reject')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E9E1D3] bg-white hover:text-[#D65A4A] text-xs font-semibold text-[#5B687A]"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject / Request Corrections</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#0B3B3C]">
                    <span className="font-semibold">
                      Approved by {activeReport.reviewedByName} on{' '}
                      {formatTime(activeReport.reviewedAt)}
                    </span>
                    {activeReport.sharedToNexconnAt && (
                      <span className="text-[11px] text-[#0F766E] font-medium">
                        Shared to Nexconn · {formatTime(activeReport.sharedToNexconnAt)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction !== null || !nexconnGroupLive}
                      onClick={() => void handleShareNexconn()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#0F766E] text-[#0F766E] hover:bg-[#0F766E]/5 text-xs font-semibold disabled:opacity-45"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {busyAction === 'share'
                          ? 'Publishing...'
                          : 'Share Approved Handoff to Nexconn'}
                      </span>
                    </button>

                    <div className="inline-flex items-center gap-1.5">
                      <select
                        aria-label="Link expiration"
                        value={ttlMinutes}
                        onChange={(e) => setTtlMinutes(Number(e.target.value))}
                        className="px-2.5 py-2 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3] text-xs font-medium text-[#1B2A38]"
                      >
                        <option value={30}>30 min TTL</option>
                        <option value={60}>1 hour TTL</option>
                        <option value={120}>2 hours TTL</option>
                        <option value={360}>6 hours TTL</option>
                      </select>

                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void handleCreatePublicLink()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B3B3C] hover:bg-[#1B2A38] text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>
                          {busyAction === 'link'
                            ? 'Generating...'
                            : 'Generate 112 / Paramedic Live Link'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {generatedLinkUrl && (
                    <div className="p-3 rounded-xl bg-[#ECFDF5] border border-[#0F766E] space-y-2 text-xs">
                      <p className="font-bold text-[#0B3B3C]">
                        One-Time Read-Only Paramedic Tracking URL (Copy Now — Token Not Stored in Plaintext)
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#E9E1D3] text-[11px] font-mono break-all text-[#1B2A38]">
                          {generatedLinkUrl}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopyUrl()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                        </button>
                        <a
                          href={generatedLinkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#0B3B3C] text-[#0B3B3C] text-xs font-semibold bg-white"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </a>
                      </div>
                      <p className="text-[11px] text-[#5B687A]">
                        Note: This link shares approved handoff info and live assigned-responder GPS only. It does NOT automatically contact 112 or dispatch an ambulance.
                      </p>
                    </div>
                  )}

                  {/* Active & Revoked Links List */}
                  {links.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#5B687A]">
                        Issued 112 / Paramedic Links ({links.length})
                      </p>
                      <ul className="space-y-1.5">
                        {links.slice(0, 5).map((lnk) => (
                          <li
                            key={lnk.id}
                            className="px-3 py-2 rounded-xl bg-[#FBF8F3] border border-[#E9E1D3] flex flex-wrap items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="text-[#1B2A38]">
                              <span className="font-mono font-semibold">{lnk.id}</span> · v
                              {lnk.reportVersion} · Expires {formatTime(lnk.expiresAt)} · Views:{' '}
                              <strong>{lnk.accessCount}</strong>
                            </div>
                            {lnk.isActive ? (
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => void handleRevokeLink(lnk.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEF2F2] border border-[#DC2626]/40 text-[#991B1B] font-semibold hover:bg-[#FEE2E2]"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Revoke Immediately</span>
                              </button>
                            ) : (
                              <span className="font-mono text-[#5B687A] uppercase">
                                {lnk.revokedAt ? 'Revoked' : 'Expired'}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
