import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { KpiCard } from '../components/KpiCard';
import { TierBadge } from '../components/TierBadge';
import { MapComponent } from '../components/MapComponent';
import {
  Waves,
  AlertTriangle,
  Gauge,
  Database,
  ArrowRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { getEsriSatelliteThumbnail } from '../config';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentCity, sites, siteRisks, totalDataPoints, siteForecasts } = useApp();

  const totalSites = sites.length;
  let highRiskCount = 0;
  let scoreSum = 0;
  const scoredSitesCount = sites.length || 1;

  sites.forEach((s) => {
    const risk = siteRisks.get(s.id);
    const score = risk?.score || 40;
    scoreSum += score;
    if (score >= 70) highRiskCount++;
  });

  const avgScore = Math.round(scoreSum / scoredSitesCount);

  const sortedSites = [...sites].sort((a, b) => {
    const sA = siteRisks.get(a.id)?.score || 0;
    const sB = siteRisks.get(b.id)?.score || 0;
    return sB - sA;
  });

  const topSites = sortedSites.slice(0, 5);

  const trendDays: Array<{ day: string; high: number; med: number; low: number }> = [];
  const daysList = ['Aug 28', 'Aug 29', 'Aug 30', 'Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4'];

  daysList.forEach((day, index) => {
    let dayHigh = 0;
    let dayMed = 0;
    let dayLow = 0;

    sites.forEach((s) => {
      const fc = siteForecasts.get(s.id);
      const dayData = fc?.daily?.[index % (fc.daily.length || 1)];
      const sc = dayData?.meanScore ?? (siteRisks.get(s.id)?.score || 45);

      if (sc >= 70) dayHigh++;
      else if (sc >= 35) dayMed++;
      else dayLow++;
    });

    trendDays.push({
      day,
      high: dayHigh,
      med: dayMed,
      low: dayLow,
    });
  });

  const mapCenter: [number, number] = [currentCity.lat, currentCity.lon];
  const bannerImg = getEsriSatelliteThumbnail(currentCity.lat, currentCity.lon, 0.04);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KpiCard
          title="Monitored Water Bodies"
          value={totalSites}
          delta={{ value: '+2 new', isPositiveGood: true, trend: 'up' }}
          icon={<Waves className="w-5 h-5" />}
          iconBg="bg-teal-500/10 text-[#0F766E]"
        />

        <KpiCard
          title="High Risk Locations"
          value={highRiskCount}
          delta={{ value: '-50%', isPositiveGood: true, trend: 'down' }}
          icon={<AlertTriangle className="w-5 h-5" />}
          iconBg="bg-red-500/10 text-[#D65A4A]"
        />

        <KpiCard
          title="Avg. Risk Score"
          value={`${avgScore}/100`}
          delta={{ value: '-10%', isPositiveGood: true, trend: 'down' }}
          icon={<Gauge className="w-5 h-5" />}
          iconBg="bg-amber-500/10 text-[#B87019]"
        />

        <KpiCard
          title="Data Points"
          value={totalDataPoints.toLocaleString()}
          delta={{ value: '+12%', isPositiveGood: true, trend: 'up' }}
          icon={<Database className="w-5 h-5" />}
          iconBg="bg-sky-500/10 text-sky-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] shadow-md flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                  Risk Overview
                </h3>
                <p className="text-xs text-[#5B687A]">
                  Real-time spatial distribution across {currentCity.name}
                </p>
              </div>

              <div className="hidden sm:flex items-center gap-3 text-[11px] font-medium text-[#1B2A38]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D65A4A]" />
                  <span>High Risk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E9A03B]" />
                  <span>Medium Risk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2F855A]" />
                  <span>Low Risk</span>
                </div>
              </div>
            </div>

            <div className="h-[440px] w-full rounded-2xl overflow-hidden border border-[#E9E1D3] shadow-inner relative">
              <MapComponent
                center={mapCenter}
                zoom={11}
                sites={sites}
                siteRisks={siteRisks}
                activeLayers={{
                  risk: true,
                  forecast: false,
                  cluster: false,
                  incident: false,
                  environmental: false,
                }}
              />
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden shadow-lg h-36 border border-[#E9E1D3]">
            <img
              src={bannerImg}
              alt="Coastal Community Satellite View"
              className="w-full h-full object-cover filter saturate-110 brightness-90"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B3B3C]/90 via-[#0B3B3C]/60 to-transparent flex flex-col justify-center px-6">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-300">
                GuardianGrid Community Safety
              </span>
              <h4 className="font-serif-heading text-xl sm:text-2xl font-bold text-white mt-1">
                Safer Coasts, Stronger Communities
              </h4>
              <p className="text-xs text-white/80 mt-1">
                Empowering beach managers and coastal residents with live hydro-meteorological intelligence.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] shadow-md">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                  Risk Trend
                </h3>
                <p className="text-xs text-[#5B687A]">Daily count of sites by risk tier</p>
              </div>

              <div className="flex items-center gap-3 text-[10px] font-medium">
                <span className="text-[#D65A4A] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#D65A4A]" /> High
                </span>
                <span className="text-[#E9A03B] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#E9A03B]" /> Medium
                </span>
                <span className="text-[#2F855A] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#2F855A]" /> Low
                </span>
              </div>
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendDays} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9E1D3" opacity={0.6} />
                  <XAxis dataKey="day" stroke="#5B687A" fontSize={10} tickLine={false} />
                  <YAxis stroke="#5B687A" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1B2A38',
                      borderColor: '#1B2A38',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      fontSize: '11px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="high"
                    stroke="#D65A4A"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="med"
                    stroke="#E9A03B"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="low"
                    stroke="#2F855A"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-[#E9E1D3] shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E1D3]">
              <div>
                <h3 className="font-serif-heading text-lg font-bold text-[#1B2A38]">
                  Top Risk Locations
                </h3>
                <p className="text-xs text-[#5B687A]">Highest priority safety surveillance</p>
              </div>
              <button
                onClick={() => navigate('/water-bodies')}
                className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1"
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#E9E1D3]/70">
              {topSites.map((site) => {
                const risk = siteRisks.get(site.id);
                const score = risk?.score ?? 45;
                const tier = risk?.tier ?? 'Medium';

                return (
                  <div
                    key={site.id}
                    onClick={() => navigate(`/water-bodies/${site.id}`)}
                    className="py-3 flex items-center justify-between cursor-pointer hover:bg-[#E9E1D3]/30 px-2 rounded-xl transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center font-bold text-xs shrink-0">
                        <Waves className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm text-[#1B2A38] group-hover:text-[#0F766E] transition-colors">
                          {site.name}
                        </h4>
                        <span className="text-[11px] text-[#5B687A]">
                          {site.type.charAt(0).toUpperCase() + site.type.slice(1)} • {site.region}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-bold text-[#1B2A38]">{score}</span>
                      </div>
                      <TierBadge tier={tier} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
