import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { TierBadge } from '../components/TierBadge';
import { ProvenanceTip } from '../components/ProvenanceTip';
import {
  Calendar,
  Clock,
  Download,
  Filter,
  TrendingUp,
  AlertTriangle,
  Waves,
  Wind,
  CloudRain,
  Compass,
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
  Legend,
  ReferenceLine,
} from 'recharts';

export const Forecast: React.FC = () => {
  const { currentCity, sites, siteRisks, siteForecasts } = useApp();

  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id || '');
  const [horizon, setHorizon] = useState<'24h' | '3d' | '7d'>('7d');

  const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
  const forecast = selectedSite ? siteForecasts.get(selectedSite.id) : undefined;
  const currentRisk = selectedSite ? siteRisks.get(selectedSite.id) : undefined;

  // Filter hours based on horizon
  const maxHours = horizon === '24h' ? 24 : horizon === '3d' ? 72 : 168;
  const filteredHours = useMemo(() => {
    const hoursList = forecast?.hours || forecast?.hourly;
    if (!hoursList) return [];
    return hoursList.slice(0, maxHours);
  }, [forecast, maxHours]);

  // Chart data
  const chartData = useMemo(() => {
    return filteredHours.map((h: any) => {
      const timeVal = h.time || h.timestamp || new Date().toISOString();
      const d = new Date(timeVal);
      const label =
        horizon === '24h'
          ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : `${d.toLocaleDateString([], { weekday: 'short' })} ${d.getHours()}:00`;

      const scoreVal = h.riskScore ?? h.score ?? 40;
      const minVal = h.confidenceBand?.min ?? Math.max(0, scoreVal - 5);
      const maxVal = h.confidenceBand?.max ?? Math.min(100, scoreVal + 5);

      return {
        time: label,
        score: scoreVal,
        min: minVal,
        max: maxVal,
        wave: h.waveHeight,
        wind: Math.round(h.windSpeed ?? 0),
        precip: h.precipitation ?? h.rainfall ?? 0,
      };
    });
  }, [filteredHours, horizon]);

  // Export forecast to CSV
  const handleExportCSV = () => {
    if (!forecast || !selectedSite) return;

    const headers = [
      'Site Name',
      'Timestamp',
      'Risk Score',
      'Risk Tier',
      'Wave Height (m)',
      'Wind Speed (km/h)',
      'Precipitation (mm)',
      'Confidence Min',
      'Confidence Max',
    ];

    const hoursList = forecast.hours || forecast.hourly || [];
    const rows = hoursList.map((h: any) => [
      `"${selectedSite.name}"`,
      `"${h.time || h.timestamp || ''}"`,
      h.riskScore ?? h.score ?? 40,
      `"${h.riskTier || h.tier || 'Low'}"`,
      h.waveHeight != null ? h.waveHeight.toFixed(2) : 'N/A',
      Math.round(h.windSpeed ?? 0),
      (h.precipitation ?? h.rainfall ?? 0).toFixed(1),
      h.confidenceBand?.min ?? 0,
      h.confidenceBand?.max ?? 100,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `forecast_${selectedSite.id}_7day.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
            7-Day Environmental Risk Forecast
          </h1>
          <p className="text-sm text-[#5B687A] mt-1">
            Predictive hourly modeling driven by Open-Meteo multi-variable atmospheric and marine hindcast/forecast integrations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Site Selector */}
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

          {/* Horizon Pills */}
          <div className="flex items-center border border-[#E9E1D3] bg-white rounded-xl p-1">
            {(['24h', '3d', '7d'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  horizon === h
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#5B687A] hover:bg-[#E9E1D3]/50'
                }`}
              >
                {h.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Selected Site Overview Card */}
      {selectedSite && (
        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-xs uppercase font-semibold text-[#0F766E] tracking-wider">
                {selectedSite.type}
              </span>
              <span className="text-xs text-[#5B687A]">•</span>
              <span className="text-xs text-[#5B687A]">{currentCity.name}, {currentCity.region}</span>
            </div>
            <h2 className="font-serif-heading text-2xl font-bold text-[#1B2A38]">
              {selectedSite.name}
            </h2>
            <p className="text-xs text-[#5B687A]">
              Lat {selectedSite.lat.toFixed(4)}°N, Lon {selectedSite.lon.toFixed(4)}°E • Lifeguards:{' '}
              <strong>{selectedSite.hasLifeguard ? 'Yes' : 'No'}</strong>
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-[#5B687A] font-medium">Current Risk Index</div>
              <div className="text-2xl font-bold font-serif-heading text-[#1B2A38] mt-0.5">
                {currentRisk?.score ?? 40}
                <span className="text-xs text-[#5B687A] font-normal"> / 100</span>
              </div>
            </div>
            <TierBadge tier={currentRisk?.tier || 'Low'} size="lg" />
          </div>
        </div>
      )}

      {/* 7 Daily Outlook Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Daily Risk Horizon & Peak Threat Drivers
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-[#5B687A]">
            <ProvenanceTip
              source="Open-Meteo Hourly Forecast Model"
              type="forecast"
              confidence={88}
            />
            <span>Forecast updated hourly</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {(forecast?.days || []).map((day: any, idx: number) => {
            const dateObj = new Date(day.date);
            const isToday = idx === 0;
            const waveVal = day.maxWaveHeight ?? day.waveHeight;
            const windVal = day.maxWindSpeed ?? day.windSpeed ?? 0;
            const rainVal = day.totalPrecipitation ?? day.rainfall ?? 0;
            const peakTierVal = day.peakTier || day.tier || 'Low';
            const peakScoreVal = day.peakScore ?? day.maxScore ?? 40;

            return (
              <div
                key={day.date}
                className={`bg-[#FBF8F3] border rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-3 transition ${
                  isToday ? 'border-[#0F766E] ring-1 ring-[#0F766E]/20 bg-white' : 'border-[#E9E1D3]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#1B2A38]">
                      {isToday ? 'Today' : dateObj.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <span className="text-[11px] text-[#5B687A]">
                      {dateObj.toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="my-2.5">
                    <TierBadge tier={peakTierVal} size="sm" />
                  </div>

                  <div className="text-xl font-bold font-serif-heading text-[#1B2A38]">
                    {peakScoreVal}
                    <span className="text-[10px] text-[#5B687A] font-normal"> peak</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E9E1D3] space-y-1 text-[11px] text-[#5B687A]">
                  <div className="flex justify-between">
                    <span>Wave:</span>
                    <span className="font-medium text-[#1B2A38]">
                      {waveVal != null ? `${waveVal.toFixed(1)}m` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Wind:</span>
                    <span className="font-medium text-[#1B2A38]">{Math.round(windVal)} km/h</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rain:</span>
                    <span className="font-medium text-[#1B2A38]">{rainVal.toFixed(1)} mm</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Regional Multi-Site Risk Forecast Heatmap Matrix */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
              Regional 7-Day Risk Forecast Heatmap
            </h2>
            <p className="text-xs text-[#5B687A] mt-1">
              Cross-site comparative hazard matrix across all monitored waters in {currentCity.name}. Click any cell to inspect that site's timeline.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span> Low (&lt;35)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span> Med (35–69)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-300"></span> High (70–84)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-700 text-white"></span> Severe (85+)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E9E1D3]">
                <th className="py-2.5 px-3 text-left font-semibold text-[#5B687A] uppercase text-[11px] w-48">
                  Water Body
                </th>
                {(forecast?.days || []).slice(0, 7).map((d: any, idx: number) => {
                  const dayDate = new Date(d.date);
                  return (
                    <th key={idx} className="py-2.5 px-2 text-center font-semibold text-[#5B687A] text-[11px]">
                      <div>{idx === 0 ? 'Today' : dayDate.toLocaleDateString([], { weekday: 'short' })}</div>
                      <div className="text-[10px] font-normal text-[#5B687A]/80">
                        {dayDate.toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E1D3]/40">
              {sites.map((site) => {
                const sForecast = siteForecasts.get(site.id);
                const sDays = sForecast?.days || [];
                const isSelected = site.id === selectedSite.id;

                return (
                  <tr
                    key={site.id}
                    onClick={() => setSelectedSiteId(site.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#0F766E]/8' : 'hover:bg-white/60'
                    }`}
                  >
                    <td className="py-2 px-3 font-semibold text-[#1B2A38] truncate max-w-[190px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#0F766E]' : 'bg-transparent'}`} />
                        <span className="truncate">{site.name}</span>
                      </div>
                      <span className="text-[10px] text-[#5B687A] block font-normal capitalize">
                        {site.type}
                      </span>
                    </td>
                    {Array.from({ length: 7 }).map((_, dIdx) => {
                      const dayData = sDays[dIdx];
                      const score = dayData?.peakScore ?? dayData?.maxScore ?? currentRisk?.score ?? 40;
                      let cellClass = 'bg-emerald-50 text-emerald-900 border-emerald-200';
                      if (score >= 85) cellClass = 'bg-red-700 text-white font-bold border-red-800 animate-pulse';
                      else if (score >= 70) cellClass = 'bg-red-100 text-red-900 font-semibold border-red-200';
                      else if (score >= 35) cellClass = 'bg-amber-50 text-amber-900 font-medium border-amber-200';

                      return (
                        <td key={dIdx} className="py-1.5 px-2 text-center">
                          <div
                            className={`py-1.5 px-1 rounded-lg border text-center font-mono text-xs shadow-2xs transition-transform hover:scale-105 ${cellClass}`}
                            title={`${site.name} - Score: ${score}/100`}
                          >
                            {score}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Hour Timeline Chart */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
              Timeline Trajectory ({horizon.toUpperCase()})
            </h2>
            <p className="text-xs text-[#5B687A] mt-1">
              Hourly computed risk index alongside model uncertainty bounds.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-[#0F766E] font-medium">
              <span className="w-3 h-0.5 bg-[#0F766E]"></span> Risk Score
            </span>
            <span className="flex items-center gap-1.5 text-[#5B687A]">
              <span className="w-3 h-0.5 bg-[#5B687A] border-dashed border-b"></span> Max Bound
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9E1D3" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#5B687A' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5B687A' }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 bg-[#1B2A38] text-white text-xs rounded-xl shadow-lg border border-white/10 space-y-1">
                        <div className="font-semibold text-stone-300">{data.time}</div>
                        <div className="text-sm font-bold text-[#14958A]">
                          Risk Score: {data.score} / 100
                        </div>
                        <div className="text-[11px] text-stone-400">
                          Uncertainty bounds: [{data.min} - {data.max}]
                        </div>
                        <div className="text-[11px] text-stone-300 pt-1 border-t border-white/10">
                          Wind: {data.wind} km/h • Precip: {data.precip} mm
                          {data.wave != null && ` • Wave: ${data.wave.toFixed(1)}m`}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={70} stroke="#D65A4A" strokeDasharray="3 3" />
              <ReferenceLine y={45} stroke="#E9A03B" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="max"
                stroke="#A8A29E"
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#0F766E"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Hourly Detail Data Table */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-[#E9E1D3] flex items-center justify-between">
          <h3 className="font-serif-heading text-lg font-bold text-[#0B3B3C]">
            Hourly Forecast Ledger ({filteredHours.length} Timesteps)
          </h3>
          <span className="text-xs text-[#5B687A]">UTC Timezone synchronized</span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#E9E1D3]/40 sticky top-0 border-b border-[#E9E1D3] font-semibold text-[#5B687A] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4">Risk Tier</th>
                <th className="py-2.5 px-4">Risk Score</th>
                <th className="py-2.5 px-4">Wave Height</th>
                <th className="py-2.5 px-4">Wind Speed</th>
                <th className="py-2.5 px-4">Precipitation</th>
                <th className="py-2.5 px-4">Confidence Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E1D3]/50">
              {filteredHours.map((h: any, i: number) => {
                const timeVal = h.time || h.timestamp || '';
                const tierVal = h.riskTier || h.tier || 'Low';
                const scoreVal = h.riskScore ?? h.score ?? 40;
                const windVal = Math.round(h.windSpeed ?? 0);
                const rainVal = (h.precipitation ?? h.rainfall ?? 0).toFixed(1);
                const minBand = h.confidenceBand?.min ?? Math.max(0, scoreVal - 5);
                const maxBand = h.confidenceBand?.max ?? Math.min(100, scoreVal + 5);

                return (
                  <tr key={i} className="hover:bg-white/60 transition">
                    <td className="py-2.5 px-4 font-medium text-[#1B2A38]">
                      {timeVal ? new Date(timeVal).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <TierBadge tier={tierVal} size="sm" />
                    </td>
                    <td className="py-2.5 px-4 font-serif-heading font-bold text-sm text-[#1B2A38]">
                      {scoreVal}
                    </td>
                    <td className="py-2.5 px-4 text-[#5B687A]">
                      {h.waveHeight != null ? `${h.waveHeight.toFixed(2)} m` : 'N/A (Inland)'}
                    </td>
                    <td className="py-2.5 px-4 text-[#5B687A]">
                      {windVal} km/h
                    </td>
                    <td className="py-2.5 px-4 text-[#5B687A]">
                      {rainVal} mm
                    </td>
                    <td className="py-2.5 px-4 text-[#5B687A]">
                      [{minBand} – {maxBand}]
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
