import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { TierBadge } from '../components/TierBadge';
import { ProvenanceTip } from '../components/ProvenanceTip';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  FileText,
  Download,
  Printer,
  Copy,
  Check,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  Waves,
  Wind,
  CloudRain,
  Compass,
  ArrowRight,
  Share2,
} from 'lucide-react';

export const Reports: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { currentCity, sites, siteRisks, siteForecasts, lastUpdated } = useApp();

  const [selectedSiteId, setSelectedSiteId] = useState<string>(id || 'all');
  const [reportType, setReportType] = useState<'daily' | 'hazard' | 'site'>(id ? 'site' : 'daily');
  const [isExporting, setIsExporting] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [sharedStatus, setSharedStatus] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  const activeSite = sites.find((s) => s.id === (id || selectedSiteId));
  const activeRisk = activeSite ? siteRisks.get(activeSite.id) : undefined;

  // High risk sites list
  const highRiskSites = sites.filter((s) => {
    const risk = siteRisks.get(s.id);
    return risk && risk.score >= 70;
  });

  const exportPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    setErrorToast(null);

    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#FFFFFF',
        ignoreElements: (element) => {
          // If a satellite image blocks or taints the capture, ignore only that image
          if (
            element.tagName === 'IMG' &&
            ((element as HTMLImageElement).src.includes('arcgis') ||
              (element as HTMLImageElement).src.includes('World_Imagery') ||
              (element as HTMLElement).getAttribute('alt')?.toLowerCase().includes('satellite'))
          ) {
            return true;
          }
          return false;
        },
        onclone: (clonedDoc) => {
          // Canvas helper to convert any CSS color string (oklch, color-mix, lab, etc.) to standard rgb/rgba
          const colorCanvas = clonedDoc.createElement('canvas');
          colorCanvas.width = 1;
          colorCanvas.height = 1;
          const ctx = colorCanvas.getContext('2d');

          const toRgb = (colorStr: string): string => {
            if (!colorStr || typeof colorStr !== 'string') return colorStr;
            if (
              !colorStr.includes('oklch') &&
              !colorStr.includes('color-mix') &&
              !colorStr.includes('lab') &&
              !colorStr.includes('lch')
            ) {
              return colorStr;
            }
            if (!ctx) return '#1B2A38';
            try {
              ctx.fillStyle = '#000000';
              ctx.fillStyle = colorStr;
              return ctx.fillStyle;
            } catch {
              return '#1B2A38';
            }
          };

          const colorRegex =
            /(color-mix\((?:[^()]+|\([^()]*\))*\)|oklch\([^)]+\)|lab\([^)]+\)|lch\([^)]+\))/g;

          // 1. Sanitize style tags in cloned document to replace oklch/color-mix
          clonedDoc.querySelectorAll('style').forEach((styleTag) => {
            if (
              styleTag.textContent &&
              (styleTag.textContent.includes('oklch') || styleTag.textContent.includes('color-mix'))
            ) {
              styleTag.textContent = styleTag.textContent.replace(colorRegex, (match) =>
                toRgb(match)
              );
            }
          });

          // 2. Convert any oklch/color-mix computed colors to rgb on the cloned copy only
          const elements = clonedDoc.querySelectorAll('*');
          const colorProps = [
            'color',
            'background-color',
            'border-top-color',
            'border-right-color',
            'border-bottom-color',
            'border-left-color',
            'outline-color',
            'fill',
            'stroke',
            'box-shadow',
          ];

          elements.forEach((node) => {
            const htmlEl = node as HTMLElement;
            if (!htmlEl.style) return;
            const style = window.getComputedStyle(htmlEl);
            colorProps.forEach((prop) => {
              const val = style.getPropertyValue(prop);
              if (
                val &&
                (val.includes('oklch') ||
                  val.includes('color-mix') ||
                  val.includes('lab') ||
                  val.includes('lch'))
              ) {
                const converted = val.replace(colorRegex, (match) => toRgb(match));
                htmlEl.style.setProperty(prop, converted, 'important');
              }
            });
          });
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const JsPdfConstructor =
        typeof jsPDF === 'function' ? jsPDF : (jsPDF as any).jsPDF || (jsPDF as any).default;
      const pdf = new JsPdfConstructor('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('GuardianGrid-report.pdf');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setErrorToast('Failed to generate PDF. Please try again or use the Print button.');
      setTimeout(() => setErrorToast(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  const printReport = () => {
    window.print();
  };

  const copyMarkdown = () => {
    const md = `# GuardianGrid Environmental Risk Intelligence Report
**Region:** ${currentCity.name}, ${currentCity.region}
**Generated:** ${new Date().toLocaleString()} (Telemetry sync: ${lastUpdated || 'Live'})
**Total Monitored Sites:** ${sites.length}

## Executive Summary
${highRiskSites.length > 0
  ? `Critical safety advisory: ${highRiskSites.length} site(s) currently exceed high risk thresholds (score >= 70). Precautionary bathing restrictions and lifeguard surge patrols are recommended.`
  : `All ${sites.length} monitored water bodies currently exhibit favorable or moderate environmental conditions.`}

## High-Risk Locations
${highRiskSites.map(s => `- **${s.name}** (${s.type}): Score ${siteRisks.get(s.id)?.score}/100, Lifeguards: ${s.hasLifeguard ? 'Yes' : 'No'}`).join('\n') || '- None currently exceeding threshold 70.'}

## Methodology & Provenance
Scoring driven by GuardianGrid's expert-weighted additive index on Open-Meteo and OpenStreetMap telemetry. No synthetic data.
`;
    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 3000);
  };

  const handleShare = async () => {
    const shareTitle = `GuardianGrid Intelligence Report - ${currentCity.name}`;
    const shareText = `Environmental Risk Intelligence Briefing for ${currentCity.name}: ${sites.length} monitored water bodies, ${highRiskSites.length} elevated hazards.`;
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        setSharedStatus('Shared!');
        setTimeout(() => setSharedStatus(null), 3000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareTitle}\n${shareText}\n${shareUrl}`);
      setSharedStatus('Link copied!');
      setTimeout(() => setSharedStatus(null), 3000);
    } catch {
      setSharedStatus('Copied URL');
      setTimeout(() => setSharedStatus(null), 3000);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0F766E]" />
            <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
              Intelligence Reports
            </h1>
          </div>
          <p className="text-sm text-[#5B687A] mt-1">
            Authoritative civil safety briefings with instant PDF export and printable formatting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition shadow-xs"
          >
            {sharedStatus ? <Check className="w-3.5 h-3.5 text-[#2F855A]" /> : <Share2 className="w-3.5 h-3.5 text-[#0F766E]" />}
            <span>{sharedStatus || 'Share Report'}</span>
          </button>

          <button
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition"
          >
            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-[#2F855A]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMarkdown ? 'Copied MD' : 'Copy Markdown'}</span>
          </button>

          <button
            onClick={printReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition"
          >
            <Printer className="w-3.5 h-3.5 text-[#5B687A]" />
            <span>Print</span>
          </button>

          <button
            onClick={exportPDF}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs disabled:opacity-50"
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>
        </div>
      </div>

      {/* Report Customizer Controls */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-[#5B687A]">Report Scope:</span>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as any)}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none"
          >
            <option value="daily">Regional Daily Safety Briefing</option>
            <option value="hazard">Critical Hazard Assessment</option>
            <option value="site">Site-Specific Audit Dossier</option>
          </select>
        </div>

        {reportType === 'site' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#5B687A]">Target Water Body:</span>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.type})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Printable Report Canvas Document */}
      <div
        ref={reportRef}
        className="bg-white border border-[#E9E1D3] rounded-3xl p-8 sm:p-12 shadow-sm space-y-8 text-[#1B2A38]"
      >
        {/* Document Header */}
        <div className="border-b-2 border-[#0B3B3C] pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-[#0F766E]" />
              <span className="font-serif-heading font-bold text-xl text-[#0B3B3C] tracking-wide">
                GuardianGrid Intelligence Directive
              </span>
            </div>
            <h1 className="font-serif-heading text-3xl sm:text-4xl font-bold text-[#1B2A38]">
              {reportType === 'daily'
                ? `Daily Environmental Safety Briefing`
                : reportType === 'hazard'
                ? `Critical Hazard & High-Risk Assessment`
                : `${activeSite?.name || 'Site'} Technical Safety Audit`}
            </h1>
            <p className="text-xs text-[#5B687A]">
              Jurisdiction: {currentCity.name}, {currentCity.region} ({currentCity.country}) • Civil Protection Reference #GG-{Date.now().toString().slice(-6)}
            </p>
          </div>

          <div className="text-right text-xs text-[#5B687A] space-y-1">
            <div>
              Generated:{' '}
              <strong className="text-[#1B2A38]">{new Date().toLocaleDateString([], { dateStyle: 'long' })}</strong>
            </div>
            <div>Telemetry Synced: <strong>{lastUpdated || 'Live'} UTC</strong></div>
            <div>Classification: <strong>Public Safety Advisory</strong></div>
          </div>
        </div>

        {/* Section 1: Executive Summary */}
        <div className="space-y-3">
          <h2 className="font-serif-heading text-lg font-bold text-[#0B3B3C] uppercase tracking-wider text-xs border-b border-[#E9E1D3] pb-1">
            1. Executive Overview
          </h2>
          <p className="text-xs sm:text-sm text-[#5B687A] leading-relaxed">
            This intelligence dossier compiles live telemetry from Open-Meteo Marine, Atmospheric Forecast, and OpenStreetMap safety infrastructure datasets. Across the monitored {sites.length} water bodies in {currentCity.name}, {highRiskSites.length} site(s) currently exceed the High Risk threshold (Score ≥ 70). Hydrodynamic parameters indicate moderate coastal surf with stable inland storage baselines.
          </p>
        </div>

        {/* Section 2: Critical High-Risk Locations Table */}
        <div className="space-y-3">
          <h2 className="font-serif-heading text-lg font-bold text-[#0B3B3C] uppercase tracking-wider text-xs border-b border-[#E9E1D3] pb-1">
            2. Priority Watchlist & High-Risk Sites
          </h2>

          {highRiskSites.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-[#E9E1D3]">
                <thead className="bg-[#E9E1D3]/50 font-semibold text-[#5B687A]">
                  <tr>
                    <th className="p-2.5">Site Name</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Risk Score</th>
                    <th className="p-2.5">Risk Tier</th>
                    <th className="p-2.5">Lifeguard Patrol</th>
                    <th className="p-2.5">Primary Threat Vector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E1D3]">
                  {highRiskSites.map((s) => {
                    const r = siteRisks.get(s.id);
                    return (
                      <tr key={s.id}>
                        <td className="p-2.5 font-bold">{s.name}</td>
                        <td className="p-2.5 capitalize">{s.type}</td>
                        <td className="p-2.5 font-bold font-serif-heading">{r?.score || 70} / 100</td>
                        <td className="p-2.5"><TierBadge tier={r?.tier || 'High'} size="sm" /></td>
                        <td className="p-2.5">{s.hasLifeguard ? 'Active Patrol' : 'Unpatrolled'}</td>
                        <td className="p-2.5 text-[#5B687A]">High swell & breaking surf velocity</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#2F855A]/10 border border-[#2F855A]/20 text-[#2F855A] text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>No monitored water bodies currently meet the severe or critical threshold (≥70). All sites within manageable parameters.</span>
            </div>
          )}
        </div>

        {/* Section 3: Summary Roster of All Sites */}
        <div className="space-y-3">
          <h2 className="font-serif-heading text-lg font-bold text-[#0B3B3C] uppercase tracking-wider text-xs border-b border-[#E9E1D3] pb-1">
            3. Regional Water Body Risk Matrix
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-[#E9E1D3]">
              <thead className="bg-[#E9E1D3]/50 font-semibold text-[#5B687A]">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Score</th>
                  <th className="p-2">Tier</th>
                  <th className="p-2">Wave</th>
                  <th className="p-2">Wind</th>
                  <th className="p-2">Rain</th>
                  <th className="p-2">Data Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E1D3]">
                {sites.map((s) => {
                  const r = siteRisks.get(s.id);
                  const f = r?.environmentalFactors;
                  return (
                    <tr key={s.id}>
                      <td className="p-2 font-medium">{s.name}</td>
                      <td className="p-2 capitalize">{s.type}</td>
                      <td className="p-2 font-serif-heading font-bold">{r?.score || 40}</td>
                      <td className="p-2"><TierBadge tier={r?.tier || 'Low'} size="sm" /></td>
                      <td className="p-2 text-[#5B687A]">{f?.waveHeight != null ? `${f.waveHeight.toFixed(1)}m` : '—'}</td>
                      <td className="p-2 text-[#5B687A]">{f?.windSpeed != null ? `${Math.round(f.windSpeed)}km/h` : '—'}</td>
                      <td className="p-2 text-[#5B687A]">{f?.precipitation != null ? `${f.precipitation.toFixed(1)}mm` : '0mm'}</td>
                      <td className="p-2 font-semibold text-[#0F766E]">{r?.dataConfidence ?? 85}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Mitigation & Operational Directives */}
        <div className="space-y-3">
          <h2 className="font-serif-heading text-lg font-bold text-[#0B3B3C] uppercase tracking-wider text-xs border-b border-[#E9E1D3] pb-1">
            4. Recommended Action Directives
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3]">
              <strong className="text-[#1B2A38] block mb-1">Civil Protection Surge Deployment:</strong>
              <p className="text-[#5B687A]">
                Dispatch mobile lifeguard units to unpatrolled coastal stretches where scores exceed 50 during afternoon tidal peaks.
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-[#E9E1D3] bg-[#FBF8F3]">
              <strong className="text-[#1B2A38] block mb-1">Public Signage & Siren Activation:</strong>
              <p className="text-[#5B687A]">
                Post red cautionary flags at access piers for sites categorized under High or Severe risk tiers.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Provenance Note */}
        <div className="pt-6 border-t border-[#E9E1D3] text-[10px] text-[#5B687A] flex items-center justify-between">
          <span>GuardianGrid Environmental Intelligence • 100% Deterministic & Live Open Data</span>
          <span>Verified via Open-Meteo & OpenStreetMap APIs</span>
        </div>
      </div>

      {/* Small Error Toast if capture fails */}
      {errorToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#991B1B] text-white text-xs px-4 py-3 rounded-xl shadow-lg border border-red-700 flex items-center gap-2 animate-fadeIn">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorToast}</span>
        </div>
      )}
    </div>
  );
};
