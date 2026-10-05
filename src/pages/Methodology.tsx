import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Database,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';

export const Methodology: React.FC = () => {
  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#0F766E]" />
          <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
            Scientific Methodology & Data Governance
          </h1>
        </div>
        <p className="text-sm text-[#5B687A] mt-1">
          Full technical disclosure of mathematical formulas, normalization bounds, data provenance, and ethical safety boundaries.
        </p>
      </div>

      {/* Philosophy Callout: Why Additive Index vs Black Box ML */}
      <div className="bg-[#FBF8F3] border-2 border-[#0F766E]/40 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4" />
          </span>
          <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
            Why GuardianGrid Uses an Expert Additive Index Over Black-Box ML
          </h2>
        </div>

        <p className="text-xs sm:text-sm text-[#1B2A38] leading-relaxed">
          In high-consequence civil protection and water safety, deep neural networks and opaque gradient-boosted trees present serious failure modes: hallucinated risks, spurious correlations (e.g. weather confounded with day-of-week data collection bias), and post-hoc SHAP approximations that deviate from the true model output.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1">
            <div className="font-bold text-xs text-[#0F766E]">100% Deterministic</div>
            <p className="text-xs text-[#5B687A]">
              Identical environmental telemetry inputs consistently yield identical risk scores and safety tiers.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1">
            <div className="font-bold text-xs text-[#0F766E]">Exact Shapley Values</div>
            <p className="text-xs text-[#5B687A]">
              Because the index is strictly linear over normalized hazard features, Shapley attributions have zero estimation error.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1">
            <div className="font-bold text-xs text-[#0F766E]">Civic Audit Compliance</div>
            <p className="text-xs text-[#5B687A]">
              Every metric and formula can be audited line-by-line by municipal lifeguards and disaster management agencies.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Mathematical Formula */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
          1. Mathematical Formulation of Risk Score R(x)
        </h2>

        <div className="p-5 bg-white border border-[#E9E1D3] rounded-2xl font-mono text-xs sm:text-sm text-[#1B2A38] overflow-x-auto shadow-xs">
          {'R(x) = Clamp[0, 100, ( ∑_{i ∈ Active} w_i · f_i(x_i) ) / ( ∑_{i ∈ Active} w_i ) × 100 - M_lifeguard ]'}
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-[#5B687A] leading-relaxed">
          <p>
            Where:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs">
            <li><strong className="text-[#1B2A38]">x_i:</strong> The raw continuous environmental measurement (e.g. wave height in meters, wind gusts in km/h).</li>
            <li><strong className="text-[#1B2A38]">f_i(x_i):</strong> The continuous piecewise-linear normalization function mapping physical values to a [0, 1] hazard scale.</li>
            <li><strong className="text-[#1B2A38]">w_i:</strong> The positive weight allocated to hazard parameter i.</li>
            <li><strong className="text-[#1B2A38]">Active:</strong> The set of valid parameters for the site type. Inland lakes and reservoirs automatically exclude marine variables (wave height, swell period, SST) and re-normalize active weights to sum to 100.</li>
            <li><strong className="text-[#1B2A38]">M_lifeguard:</strong> The civil mitigation credit subtracted from the score when certified active lifeguards are stationed (default 12 points).</li>
          </ul>
        </div>

        {/* Hazard Normalization Curves Table */}
        <div className="space-y-3 pt-4 border-t border-[#E9E1D3]">
          <h3 className="font-serif-heading text-base font-bold text-[#1B2A38]">
            Hazard Normalization Curves f_i(x_i)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-[#E9E1D3]">
              <thead className="bg-[#E9E1D3]/50 font-semibold text-[#5B687A]">
                <tr>
                  <th className="p-2.5">Feature</th>
                  <th className="p-2.5">Zero Hazard (f=0.0)</th>
                  <th className="p-2.5">Moderate Hazard (f=0.5)</th>
                  <th className="p-2.5">Maximum Hazard (f=1.0)</th>
                  <th className="p-2.5">Weight (Points)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E1D3] text-[#1B2A38]">
                <tr>
                  <td className="p-2.5 font-semibold">Significant Wave Height</td>
                  <td className="p-2.5">≤ 0.5 m</td>
                  <td className="p-2.5">1.5 m</td>
                  <td className="p-2.5">≥ 3.0 m</td>
                  <td className="p-2.5 font-mono">25 pts</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-semibold">Swell Wave Period</td>
                  <td className="p-2.5">≤ 6.0 s</td>
                  <td className="p-2.5">11.0 s</td>
                  <td className="p-2.5">≥ 16.0 s (Long-period rip threat)</td>
                  <td className="p-2.5 font-mono">15 pts</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-semibold">Wind Speed & Gusts</td>
                  <td className="p-2.5">≤ 10 km/h</td>
                  <td className="p-2.5">35 km/h</td>
                  <td className="p-2.5">≥ 60 km/h (Gale warning)</td>
                  <td className="p-2.5 font-mono">20 pts</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-semibold">Precipitation (24h Runoff)</td>
                  <td className="p-2.5">0.0 mm</td>
                  <td className="p-2.5">25.0 mm</td>
                  <td className="p-2.5">≥ 75.0 mm (Flood risk)</td>
                  <td className="p-2.5 font-mono">20 pts</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-semibold">River Discharge Anomaly</td>
                  <td className="p-2.5">≤ Baseline</td>
                  <td className="p-2.5">+50% over mean</td>
                  <td className="p-2.5">≥ +200% surge</td>
                  <td className="p-2.5 font-mono">10 pts</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-semibold">Atmospheric UV Index</td>
                  <td className="p-2.5">≤ 3</td>
                  <td className="p-2.5">7</td>
                  <td className="p-2.5">≥ 11 (Extreme exposure)</td>
                  <td className="p-2.5 font-mono">10 pts</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 2: Data Provenance & APIs */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
          2. Live Keyless Public Data Sources
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#0F766E]">Open-Meteo Weather API</span>
              <span className="text-[10px] text-[#5B687A]">Hourly • Global</span>
            </div>
            <p className="text-xs text-[#5B687A]">
              Ingests surface temperature, relative humidity, precipitation, wind speed, wind gusts, and visibility at 0.1° resolution. Cached client-side with 30-minute TTL.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#0F766E]">Open-Meteo Marine API</span>
              <span className="text-[10px] text-[#5B687A]">Copernicus CMEMS</span>
            </div>
            <p className="text-xs text-[#5B687A]">
              Ingests significant wave height, dominant wave period, swell wave height, ocean current velocity, and sea surface temperature. Excluded automatically for inland coordinates.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#0F766E]">OpenStreetMap Overpass API</span>
              <span className="text-[10px] text-[#5B687A]">Geographic Infrastructure</span>
            </div>
            <p className="text-xs text-[#5B687A]">
              Extracts coastal geometry, natural water bodies (beaches, lakes, reservoirs), and surrounding safety infrastructure (lifeguard stations, hospitals, emergency posts).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#E9E1D3] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#0F766E]">GDELT Project API 2.0</span>
              <span className="text-[10px] text-[#5B687A]">Global Event Database</span>
            </div>
            <p className="text-xs text-[#5B687A]">
              Monitors worldwide English news feeds for water emergencies, drownings, marine rescues, and coastal surge events, indexed across a rolling 90-day archive.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Limitations & Disclaimer */}
      <div className="bg-[#B5654A]/10 border border-[#B5654A]/30 rounded-3xl p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#B5654A]" />
          <h2 className="font-serif-heading text-lg font-bold text-[#B5654A]">
            Technical Limitations & Safety Disclaimer
          </h2>
        </div>
        <p className="text-xs text-[#5B687A] leading-relaxed">
          GuardianGrid provides situational awareness and decision-support risk intelligence. It does not replace the immediate authority of on-duty lifeguards, port trust harbor masters, or national meteorological storm bulletins. Sudden localized phenomena (such as micro-scale rip currents, submerged debris, or unmonitored bacterial blooms) cannot be verified by satellite and reanalysis feeds alone. Always obey posted beach flags and local safety authorities.
        </p>
      </div>
    </div>
  );
};
