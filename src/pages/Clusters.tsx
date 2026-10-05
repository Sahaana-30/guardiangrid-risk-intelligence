import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { TierBadge } from '../components/TierBadge';
import { ProvenanceTip } from '../components/ProvenanceTip';
import {
  GitFork,
  Layers,
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

export const Clusters: React.FC = () => {
  const navigate = useNavigate();
  const { currentCity, sites, siteRisks, clustering } = useApp();

  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);

  const clusterColors = ['#0F766E', '#1E3A8A', '#B5654A', '#D65A4A', '#8B5CF6'];

  const pcaData = (clustering?.pcaPoints || []).map((p) => {
    const site = sites.find((s) => s.id === p.siteId);
    const risk = site ? siteRisks.get(site.id) : undefined;
    return {
      name: p.name,
      siteId: p.siteId,
      x: p.x,
      y: p.y,
      clusterId: p.clusterId,
      score: p.score,
      tier: risk?.tier || 'Low',
      isOutlier: p.isOutlier,
    };
  });

  const outliers = clustering?.outliers || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <GitFork className="w-5 h-5 text-[#0F766E]" />
          <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
            Behavioral Risk Archetypes & Clustering
          </h1>
        </div>
        <p className="text-sm text-[#5B687A] mt-1 max-w-3xl">
          Unsupervised K-Means++ clustering with Silhouette-optimized k and DBSCAN density anomaly detection, projected onto a 2D Principal Component Analysis (PCA) plane to discover recurring hydrological risk profiles.
        </p>
      </div>

      {/* Outlier / Anomaly Detection Alert */}
      {outliers.length > 0 && (
        <div className="bg-[#B5654A]/10 border border-[#B5654A]/30 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-[#B5654A] shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-[#B5654A]">
                DBSCAN Density Anomaly Detected ({outliers.length} Sites)
              </div>
              <p className="text-xs text-[#5B687A] mt-0.5">
                The following sites diverge significantly from regional baseline hydrodynamic clusters:
                {' '}
                <strong className="text-[#1B2A38]">
                  {outliers
                    .map((id) => sites.find((s) => s.id === id)?.name || id)
                    .join(', ')}
                </strong>
                .
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#B5654A] px-2.5 py-1 rounded-lg bg-white border border-[#B5654A]/20">
            DBSCAN ε=1.8
          </span>
        </div>
      )}

      {/* 2D PCA Scatter Projection */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
              2D Principal Component Analysis (PCA) Projection
            </h2>
            <p className="text-xs text-[#5B687A] mt-1">
              Dimensionality reduction of the 6-factor standardized feature vector (waves, wind, rain, SST, infrastructure index, and exposure).
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#5B687A]">Color by:</span>
            <span className="font-semibold text-[#0F766E]">Cluster Archetype</span>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E9E1D3" />
              <XAxis
                type="number"
                dataKey="x"
                name="Principal Component 1"
                unit=""
                tick={{ fontSize: 11, fill: '#5B687A' }}
                label={{ value: 'PC 1 (Hydrodynamic Exposure →)', position: 'bottom', offset: 0, fill: '#5B687A', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Principal Component 2"
                unit=""
                tick={{ fontSize: 11, fill: '#5B687A' }}
                label={{ value: 'PC 2 (Precipitation & Runoff ↑)', angle: -90, position: 'left', offset: 10, fill: '#5B687A', fontSize: 11 }}
              />
              <ZAxis range={[120, 240]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 bg-[#1B2A38] text-white text-xs rounded-xl shadow-lg border border-white/10 space-y-1">
                        <div className="font-bold text-sm text-[#14958A]">{data.name}</div>
                        <div>Cluster {data.clusterId + 1}</div>
                        <div>Risk Score: <strong>{data.score}</strong> / 100</div>
                        {data.isOutlier && (
                          <div className="text-[#E9A03B] font-semibold text-[11px]">
                            ★ Anomaly / High Variance
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter data={pcaData}>
                {pcaData.map((entry, index) => {
                  const color = entry.isOutlier
                    ? '#B5654A'
                    : clusterColors[entry.clusterId % clusterColors.length];
                  return <Cell key={`cell-${index}`} fill={color} stroke="#fff" strokeWidth={1.5} />;
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-2 border-t border-[#E9E1D3] text-xs">
          {(clustering?.clusters || []).map((c, i) => (
            <button
              key={c.clusterId}
              onClick={() =>
                setSelectedClusterId(selectedClusterId === c.clusterId ? null : c.clusterId)
              }
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg transition ${
                selectedClusterId === c.clusterId
                  ? 'bg-white shadow-xs font-bold text-[#1B2A38]'
                  : 'text-[#5B687A] hover:bg-white/60'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: clusterColors[i % clusterColors.length] }}
              />
              <span>{c.name} ({c.siteIds.length})</span>
            </button>
          ))}
          {outliers.length > 0 && (
            <div className="flex items-center gap-2 text-[#B5654A] font-semibold">
              <span className="w-3 h-3 rounded-full bg-[#B5654A]" />
              <span>DBSCAN Outlier</span>
            </div>
          )}
        </div>
      </div>

      {/* Cluster Archetype Cards */}
      <div>
        <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C] mb-4">
          Identified Environmental Archetypes
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(clustering?.clusters || []).map((cluster, idx) => {
            const memberSites = sites.filter((s) => cluster.siteIds.includes(s.id));
            const avgScore = memberSites.length
              ? Math.round(
                  memberSites.reduce((acc, s) => acc + (siteRisks.get(s.id)?.score || 40), 0) /
                    memberSites.length
                )
              : 40;

            const isSelected = selectedClusterId === cluster.clusterId;

            return (
              <div
                key={cluster.clusterId}
                className={`bg-[#FBF8F3] border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition ${
                  isSelected
                    ? 'border-[#0F766E] ring-2 ring-[#0F766E]/20 bg-white'
                    : 'border-[#E9E1D3]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-white"
                      style={{ backgroundColor: clusterColors[idx % clusterColors.length] }}
                    >
                      Cluster {cluster.clusterId + 1}
                    </span>
                    <span className="text-xs text-[#5B687A]">
                      {memberSites.length} site{memberSites.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                      {cluster.name}
                    </h3>
                    <p className="text-xs text-[#5B687A] mt-1 leading-relaxed">
                      {cluster.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-[#E9E1D3]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#5B687A]">Group Mean Risk:</span>
                    <span className="font-serif-heading font-bold text-base text-[#1B2A38]">
                      {avgScore} / 100
                    </span>
                  </div>

                  {/* Representative Sites Chips */}
                  <div>
                    <div className="text-[11px] font-semibold text-[#5B687A] mb-1.5 uppercase tracking-wider">
                      Constituent Sites:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {memberSites.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => navigate(`/water-bodies/${s.id}`)}
                          className="px-2 py-0.5 text-[11px] rounded-md bg-white border border-[#E9E1D3] text-[#1B2A38] hover:border-[#0F766E] hover:text-[#0F766E] transition flex items-center gap-1"
                        >
                          <span>{s.name}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
