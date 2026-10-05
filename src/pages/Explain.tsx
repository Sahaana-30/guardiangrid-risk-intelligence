import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ShapBars } from '../components/ShapBars';
import { TierBadge } from '../components/TierBadge';
import { ProvenanceTip } from '../components/ProvenanceTip';
import {
  Sparkles,
  HelpCircle,
  Scale,
  Sliders,
  Layers,
  CheckCircle2,
  TrendingUp,
  Info,
  BookOpen,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

export const Explain: React.FC = () => {
  const { sites, siteRisks, riskWeights } = useApp();

  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id || '');
  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
  const riskResult = selectedSite ? siteRisks.get(selectedSite.id) : undefined;

  // Compute aggregate feature importance across all active sites
  const globalImportanceData = useMemo(() => {
    const sumMap: Record<string, { totalContribution: number; count: number }> = {};

    sites.forEach((site) => {
      const risk = siteRisks.get(site.id);
      if (!risk) return;

      (risk.shapValues || []).forEach((shap) => {
        const featureKey = shap.featureName || shap.label || shap.featureKey || 'Feature';
        if (!sumMap[featureKey]) {
          sumMap[featureKey] = { totalContribution: 0, count: 0 };
        }
        const val = shap.shapContribution ?? shap.shap ?? 0;
        sumMap[featureKey].totalContribution += Math.abs(val);
        sumMap[featureKey].count += 1;
      });
    });

    return Object.entries(sumMap)
      .map(([name, data]) => ({
        name,
        avgAbsContribution: Number((data.totalContribution / (data.count || 1)).toFixed(1)),
      }))
      .sort((a, b) => b.avgAbsContribution - a.avgAbsContribution);
  }, [sites, siteRisks]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#0F766E]" />
          <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
            Explainable AI & SHAP Decomposition
          </h1>
        </div>
        <p className="text-sm text-[#5B687A] mt-1 max-w-3xl">
          GuardianGrid deliberately rejects uninterpretable black-box neural networks in public safety applications. Every environmental risk score is derived from a transparent, piecewise-linear additive index with mathematically exact Shapley value attribution.
        </p>
      </div>

      {/* Model Transparency Philosophy & SHAP Additivity Self-Test */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs uppercase font-semibold text-[#0F766E] tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#2F855A]" />
            Strictly Additive Formulation
          </div>
          <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
            Zero-Approximation Exact Shapley Values
          </h3>
          <p className="text-xs text-[#5B687A] max-w-2xl leading-relaxed">
            Because our risk model is linear with respect to normalized hazards, feature interactions are decoupled. The SHAP value for any factor is precisely its calibrated point contribution relative to the regional baseline, guaranteeing 100% auditability for civil safety authorities.
          </p>
        </div>

        {/* SHAP Additivity Automated Self-Test Badge */}
        {(() => {
          let allPassed = true;
          let maxDelta = 0;
          sites.forEach((site) => {
            const r = siteRisks.get(site.id);
            if (!r) return;
            const sumShap = (r.shapValues || []).reduce((acc, s) => acc + (s.shapContribution ?? s.shap ?? 0), 0);
            const delta = Math.abs(r.score - (r.baseline + sumShap));
            if (delta > maxDelta) maxDelta = delta;
            if (delta > 0.05) allPassed = false;
          });

          return (
            <div className={`p-4 rounded-xl border flex flex-col gap-1 min-w-[240px] ${allPassed ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              <div className="flex items-center gap-2 font-bold text-xs">
                <CheckCircle2 className={`w-4 h-4 ${allPassed ? 'text-emerald-600' : 'text-red-600'}`} />
                <span>SHAP Additivity Self-Test</span>
              </div>
              <div className="text-xs font-semibold">
                Status: <span className="uppercase px-1.5 py-0.5 rounded bg-white text-xs">{allPassed ? 'PASSED ✓' : 'FAILED ✗'}</span>
              </div>
              <div className="text-[11px] opacity-80 font-mono">
                Formula: Score = Baseline + Σ SHAP
              </div>
              <div className="text-[11px] opacity-80 font-mono">
                Max Deviation: {maxDelta.toFixed(2)} pts (tolerance ±0.05)
              </div>
            </div>
          );
        })()}
      </div>

      {/* Global Feature Importance Across Region */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-4">
        <div>
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Regional Feature Influence (Global SHAP Magnitude)
          </h2>
          <p className="text-xs text-[#5B687A] mt-1">
            Mean absolute contribution across all {sites.length} monitored water bodies in the current regional catalog today.
          </p>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={globalImportanceData}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 100, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E9E1D3" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#5B687A' }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#1B2A38', fontWeight: 500 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-2.5 bg-[#1B2A38] text-white text-xs rounded-xl shadow border border-white/10">
                        <div className="font-semibold">{data.name}</div>
                        <div className="text-sm font-bold text-[#14958A] mt-0.5">
                          Avg Impact: ±{data.avgAbsContribution} points
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="avgAbsContribution" fill="#0F766E" radius={[0, 6, 6, 0]}>
                {globalImportanceData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? '#0F766E' : index === 1 ? '#14958A' : '#5B687A'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Individual Site Waterfall Decomposition */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E9E1D3] pb-4">
          <div>
            <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
              Site-Specific SHAP Decomposition
            </h2>
            <p className="text-xs text-[#5B687A] mt-1">
              Select any monitored site to inspect its granular factor breakdown.
            </p>
          </div>

          <select
            value={selectedSite?.id || ''}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.type})
              </option>
            ))}
          </select>
        </div>

        {selectedSite && riskResult && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-[#E9E1D3]">
              <div>
                <div className="text-base font-bold text-[#1B2A38]">{selectedSite.name}</div>
                <div className="text-xs text-[#5B687A] mt-0.5">
                  Regional Baseline: <strong className="text-[#1B2A38]">{riskResult.baseline}</strong> → Final Index:{' '}
                  <strong className="text-[#0F766E]">{riskResult.score}</strong>
                </div>
              </div>
              <TierBadge tier={riskResult.tier} size="md" />
            </div>

            <ShapBars
              shapValues={riskResult.shapValues}
              baseline={riskResult.baseline}
              finalScore={riskResult.score}
            />

            {/* Detailed Table of Factors */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#E9E1D3]/50 border-b border-[#E9E1D3] text-[#5B687A] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Factor Name</th>
                    <th className="py-2.5 px-3">Observed Value</th>
                    <th className="py-2.5 px-3">Normalized Hazard</th>
                    <th className="py-2.5 px-3">Configured Weight</th>
                    <th className="py-2.5 px-3 text-right">Net Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E1D3]/40">
                  {(riskResult.shapValues || []).map((s, idx) => {
                    const featName = s.featureName || s.label || s.featureKey;
                    const obsVal = s.observedValue ?? s.value ?? '—';
                    const hazVal = s.hazardValue ?? s.hazard ?? 0;
                    const contrib = s.shapContribution ?? s.shap ?? 0;
                    return (
                      <tr key={idx} className="hover:bg-white/50">
                        <td className="py-2.5 px-3 font-semibold text-[#1B2A38]">{featName}</td>
                        <td className="py-2.5 px-3 text-[#5B687A]">{obsVal}</td>
                        <td className="py-2.5 px-3 font-mono text-[#5B687A]">
                          {hazVal.toFixed(3)}
                        </td>
                        <td className="py-2.5 px-3 text-[#5B687A]">{s.weight} pts</td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`font-serif-heading font-bold text-xs ${
                              contrib > 0
                                ? 'text-[#D65A4A]'
                                : contrib < 0
                                ? 'text-[#2F855A]'
                                : 'text-[#5B687A]'
                            }`}
                          >
                            {contrib > 0 ? `+${contrib}` : `${contrib}`} pts
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Complete Mathematical Index Reference */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#0F766E]" />
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Mathematical Formula Specification
          </h2>
        </div>

        <p className="text-xs text-[#5B687A] leading-relaxed">
          The GuardianGrid Environmental Risk Index <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-[#E9E1D3]">R(x)</span> is formulated as:
        </p>

        <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] font-mono text-xs text-[#1B2A38] overflow-x-auto">
          {'R(x) = Clamp[0, 100, ( ∑_{i ∈ Active} w_i · f_i(x_i) ) / ( ∑_{i ∈ Active} w_i ) × 100 - M_lifeguard ]'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#5B687A] pt-2">
          <div className="p-3.5 rounded-xl bg-white/70 border border-[#E9E1D3]">
            <strong className="text-[#1B2A38]">Piecewise Normalization f_i(x_i):</strong>
            <p className="mt-1">
              Converts raw physical measurements (meters, km/h, mm) into a standardized [0, 1] hazard scale using empirical marine and flood thresholds.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-white/70 border border-[#E9E1D3]">
            <strong className="text-[#1B2A38]">Active Weight Normalization:</strong>
            <p className="mt-1">
              For inland reservoirs or lakes where wave and current data are non-applicable, marine weights are removed and active weights are re-scaled to sum to 100.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
