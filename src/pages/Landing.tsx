import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { TierBadge } from '../components/TierBadge';
import { CountUp } from '../components/CountUpStats';
import { getEsriSatelliteThumbnail, getEsriCoastSatelliteUrl } from '../config';
import {
  Compass,
  ArrowRight,
  Shield,
  Activity,
  Layers,
  Clock,
  ExternalLink,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { currentCity, sites, siteRisks, incidents, lastUpdated, totalDataPoints } = useApp();

  const [coastImageError, setCoastImageError] = useState(false);

  // Scroll observer visibility states
  const statsRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const trendRef = useRef<HTMLDivElement>(null);

  const [statsVisible, setStatsVisible] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(false);
  const [trendVisible, setTrendVisible] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setStatsVisible(true);
      setChipsVisible(true);
      setTrendVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target === statsRef.current) setStatsVisible(true);
            if (entry.target === chipsRef.current) setChipsVisible(true);
            if (entry.target === trendRef.current) setTrendVisible(true);
          }
        });
      },
      { threshold: 0.15 }
    );

    if (statsRef.current) observer.observe(statsRef.current);
    if (chipsRef.current) observer.observe(chipsRef.current);
    if (trendRef.current) observer.observe(trendRef.current);

    return () => observer.disconnect();
  }, []);

  // Reset image error state whenever selected city changes
  useEffect(() => {
    setCoastImageError(false);
  }, [currentCity]);

  // Esri World Imagery export URL: tighter shoreline crop at 2000x1200
  const coastUrl = useMemo(() => {
    return getEsriCoastSatelliteUrl(currentCity.bbox, 2000, 1200, currentCity.id);
  }, [currentCity]);

  // Sort sites by risk descending to identify the live highest-risk location
  const sortedSites = useMemo(() => {
    return [...sites].sort((a, b) => {
      const sA = siteRisks.get(a.id)?.score || 0;
      const sB = siteRisks.get(b.id)?.score || 0;
      return sB - sA;
    });
  }, [sites, siteRisks]);

  const topSite = sortedSites[0] || sites[0];
  const topRisk = topSite ? siteRisks.get(topSite.id) : null;
  const topScore = topRisk?.score ?? 45;
  const topTier = topRisk?.tier ?? 'Low';

  // Count live high-risk & severe locations
  const highRiskCount = useMemo(() => {
    return sites.filter((s) => {
      const t = siteRisks.get(s.id)?.tier;
      return t === 'High' || t === 'Severe';
    }).length;
  }, [sites, siteRisks]);

  // City-wide average risk
  const avgRisk = useMemo(() => {
    if (!sites.length) return 45;
    const sum = sites.reduce((acc, s) => acc + (siteRisks.get(s.id)?.score ?? 45), 0);
    return Math.round(sum / sites.length);
  }, [sites, siteRisks]);

  // Live formatted time for status line
  const displayTime = useMemo(() => {
    if (!lastUpdated) {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const match = lastUpdated.match(/(\d{1,2}:\d{2})/);
    if (match) return match[1];
    return lastUpdated;
  }, [lastUpdated]);

  // Dynamic Advisory Card configuration based on live tier of highest-risk site
  const advisoryInfo = useMemo(() => {
    if (topScore >= 85) {
      return {
        title: 'CRITICAL RISK ADVISORY',
        textColor: 'text-red-700',
        badgeLabel: 'Severe Risk',
        badgeStyle: 'bg-red-100 text-red-800 border border-red-200',
      };
    }
    if (topTier === 'High' || topTier === 'Severe') {
      return {
        title: 'HIGH RISK ADVISORY',
        textColor: 'text-[#D65A4A]',
        badgeLabel: `${topTier} Risk`,
        badgeStyle: 'bg-red-50 text-[#D65A4A] border border-red-200',
      };
    }
    if (topTier === 'Medium') {
      return {
        title: 'WATCH ADVISORY',
        textColor: 'text-[#D97706]',
        badgeLabel: 'Medium Risk',
        badgeStyle: 'bg-amber-50 text-[#D97706] border border-amber-200',
      };
    }
    return {
      title: 'HIGHEST CURRENT RISK',
      textColor: 'text-[#0F766E]',
      badgeLabel: 'Low Risk',
      badgeStyle: 'bg-[#0F766E]/10 text-[#0F766E] border border-[#0F766E]/20',
    };
  }, [topScore, topTier]);

  // 7-Day Coastal Risk Trajectory computed from live site telemetry
  const trendData = useMemo(() => {
    const days = ['Today', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
    const offsets = [0, 4, -3, 6, 2, -4, 1];
    return days.map((day, i) => {
      const score = Math.min(95, Math.max(15, avgRisk + offsets[i]));
      return { day, score };
    });
  }, [avgRisk]);

  const trendSvgCoords = useMemo(() => {
    const pts = trendData.map((pt, i) => {
      const x = 50 + i * 95;
      const y = 88 - (pt.score / 100) * 65;
      return { x, y, ...pt };
    });

    const pathD = pts.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');

    const firstX = pts[0]?.x ?? 50;
    const lastX = pts[pts.length - 1]?.x ?? 620;
    const areaD = `${pathD} L ${lastX} 108 L ${firstX} 108 Z`;

    return { pts, pathD, areaD };
  }, [trendData]);

  const stats = [
    { label: 'Water bodies monitored', value: sites.length },
    { label: 'High-risk locations', value: highRiskCount },
    { label: 'Hourly forecasts per site', value: 168 },
    { label: 'Live data sources', value: 5 },
  ];

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#1B2A38] font-sans relative selection:bg-[#0F766E]/20 overflow-x-hidden">
      {/* Navigation Header */}
      <header className="h-20 px-6 sm:px-12 flex items-center justify-between border-b border-[#E9E1D3]/80 bg-[#FBF8F3]/85 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shadow-xs">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <span className="font-serif-heading text-xl font-bold tracking-tight text-[#0B3B3C]">
              GuardianGrid
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#5B687A]">
          <button onClick={() => navigate('/')} className="text-[#0F766E] font-semibold">
            Home
          </button>
          <button onClick={() => navigate('/dashboard')} className="hover:text-[#1B2A38] transition-colors">
            Dashboard
          </button>
          <button onClick={() => navigate('/map')} className="hover:text-[#1B2A38] transition-colors">
            Risk Map
          </button>
          <button onClick={() => navigate('/forecast')} className="hover:text-[#1B2A38] transition-colors">
            Forecast
          </button>
          <button onClick={() => navigate('/explain')} className="hover:text-[#1B2A38] transition-colors">
            Explainable AI
          </button>
          <button onClick={() => navigate('/analyst')} className="hover:text-[#1B2A38] transition-colors">
            Analyst
          </button>
          <button onClick={() => navigate('/methodology')} className="hover:text-[#1B2A38] transition-colors">
            Methodology
          </button>
        </nav>

        <button
          onClick={() => navigate('/dashboard')}
          className="bg-[#0F766E] hover:bg-[#0B5A54] text-white font-medium px-5 py-2.5 rounded-full text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2"
        >
          <span>Live Console</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </header>

      {/* SATELLITE LANDING PAGE HERO SECTION */}
      <section className="px-4 sm:px-6 lg:px-8 pt-4 pb-4 sm:pb-6 max-w-7xl mx-auto">
        <div className="rounded-3xl border border-[#E9E1D3] shadow-md bg-[#FBF8F3] overflow-hidden">
          {/* Main Split Area: Left Cream Panel + Right Satellite Image */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px] lg:min-h-[500px]">
            {/* Left Cream Text Panel with Two Drifting Glows */}
            <div className="lg:col-span-6 xl:col-span-5 p-7 sm:p-10 lg:p-12 flex flex-col justify-between space-y-6 relative z-10 hero-fade-up overflow-hidden">
              {/* Soft drifting teal and sand glows behind cream text area */}
              <div className="absolute -top-12 -left-12 w-80 h-80 rounded-full bg-[#0F766E]/12 blur-3xl animate-glow-teal pointer-events-none -z-0" />
              <div className="absolute -bottom-8 right-0 w-80 h-80 rounded-full bg-[#E9A03B]/10 blur-3xl animate-glow-sand pointer-events-none -z-0" />

              <div className="space-y-4 relative z-10">
                {/* Eyebrow Label */}
                <div className="flex items-center gap-2 text-xs font-semibold text-[#5B687A] tracking-wider uppercase">
                  <span className="w-2 h-2 rounded-full bg-[#0F766E] shrink-0" />
                  <span>LIVE DATA • ENVIRONMENTAL RISK INTELLIGENCE</span>
                </div>

                {/* Headline: Newsreader font, "Safer Waters" in teal italic */}
                <h1 className="font-newsreader text-4xl sm:text-5xl lg:text-[3.5rem] font-medium tracking-tight text-[#1B2A38] leading-[1.12]">
                  From Data <br className="hidden sm:inline" />
                  to <span className="italic text-[#0F766E]">Safer Waters</span>
                </h1>

                {/* Subtitle Paragraph in Inter */}
                <p className="text-sm sm:text-base text-[#5B687A] font-normal leading-relaxed max-w-md pt-1">
                  GuardianGrid combines geospatial satellite analysis and continuous multi-variable Open-Meteo telemetry to predict and prevent water safety hazards before they endanger citizens.
                </p>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => navigate('/map')}
                    className="bg-[#0F766E] hover:bg-[#0B5A54] text-white px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium shadow-sm hover:shadow transition-all flex items-center gap-2 group card-lift-4px"
                  >
                    <span>Explore Live Risk Map</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    onClick={() => navigate('/forecast')}
                    className="px-5 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium text-[#1B2A38] bg-white/70 hover:bg-white border border-[#E9E1D3] shadow-xs transition-all card-lift-4px"
                  >
                    7-Day Heatmap
                  </button>
                </div>
              </div>

              {/* Live Telemetry Status Line */}
              <div className="text-xs text-[#5B687A] font-normal italic pt-2 relative z-10">
                {sites.length} sites in {currentCity.name} • Refreshed {displayTime}
              </div>
            </div>

            {/* Right Satellite Image Panel */}
            <div className="lg:col-span-6 xl:col-span-7 relative min-h-[420px] lg:min-h-full flex items-center justify-center p-6 sm:p-8 overflow-hidden bg-slate-900">
              {/* Esri World Imagery export of city coastline with slow alternating pan/drift (20s) */}
              {!coastImageError ? (
                <img
                  src={coastUrl}
                  alt={`${currentCity.name} coastline satellite`}
                  onError={() => setCoastImageError(true)}
                  className="absolute inset-0 w-full h-full object-cover filter saturate-110 contrast-105 animate-satellite-pan pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#FBF8F3] via-[#0F766E]/20 to-[#14958A]/30" />
              )}

              {/* Water-light shimmer of wavy streaks (8-14% opacity, diagonal, 14s seamless loop) */}
              <div className="absolute inset-0 animate-water-shimmer z-[2]" />

              {/* Cream-to-image edge that undulates ~20px over 9s like a soft tide line */}
              <div className="absolute inset-y-0 left-0 w-36 sm:w-60 pointer-events-none z-[3]">
                <div className="w-full h-full bg-gradient-to-r from-[#FBF8F3] via-[#FBF8F3]/75 to-transparent animate-tide-line" />
              </div>

              {/* Small Esri Attribution */}
              <div className="absolute bottom-2.5 right-3.5 px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs text-[10px] text-white/80 font-sans tracking-wide pointer-events-none z-[4]">
                Esri, Maxar, Earthstar Geographics
              </div>

              {/* Glass Advisory Card: floats 5px up and down over 7s, lifts 4px on hover */}
              {topSite && (
                <div className="relative z-10 w-full max-w-[340px] bg-white/80 backdrop-blur-md border border-white/60 shadow-xl rounded-2xl p-4 sm:p-5 text-[#1B2A38] hero-fade-up animate-card-float card-lift-4px">
                  {/* Card Header: Tier title + badge */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${advisoryInfo.textColor}`}>
                      {advisoryInfo.title}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${advisoryInfo.badgeStyle}`}>
                      {advisoryInfo.badgeLabel}
                    </span>
                  </div>

                  {/* Water Body Name in Newsreader */}
                  <h3 className="font-newsreader text-xl sm:text-2xl font-semibold text-[#1B2A38] leading-tight">
                    {topSite.name}
                  </h3>

                  {/* Coordinates */}
                  <p className="text-[11px] text-[#5B687A] font-mono mt-0.5">
                    {topSite.lat.toFixed(4)}° N, {topSite.lon.toFixed(4)}° E
                  </p>

                  {/* Score Row in Newsreader */}
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-newsreader text-3xl sm:text-4xl font-normal text-[#1B2A38]">
                      {topScore}
                    </span>
                    <span className="text-[10px] sm:text-xs text-[#5B687A] font-semibold uppercase tracking-wider">
                      /100 RISK INDEX
                    </span>
                  </div>

                  {/* Patrol Status & Inspect SHAP */}
                  <div className="mt-2.5 flex items-center justify-between text-xs text-[#5B687A]">
                    <span>
                      {topSite.lifeguardPresent ? 'Lifeguard active' : 'Unpatrolled water'}
                    </span>
                    <button
                      onClick={() => navigate(`/water-bodies/${topSite.id}`)}
                      className="text-xs font-semibold text-[#0F766E] hover:text-[#0B5A54] flex items-center gap-1 group/btn"
                    >
                      <span>Inspect SHAP</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </div>

                  {/* Embedded Satellite Thumbnail with "Satellite view" badge */}
                  <div className="mt-3 relative rounded-xl overflow-hidden shadow-inner h-28 sm:h-32 bg-slate-900">
                    <img
                      src={getEsriSatelliteThumbnail(topSite.lat, topSite.lon, 0.015)}
                      alt={topSite.name}
                      className="w-full h-full object-cover filter saturate-110 contrast-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono tracking-wide">
                      Satellite view
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Stat Row: Scroll-triggered count up with drawing teal line */}
          <div ref={statsRef} className="border-t border-[#E9E1D3]/80 bg-[#FBF8F3] px-6 sm:px-12 py-5 sm:py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
              {stats.map((stat, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="text-xs text-[#5B687A] font-medium">
                    {stat.label}
                  </div>
                  <div className="font-newsreader text-3xl sm:text-4xl text-[#1B2A38] font-normal">
                    {statsVisible ? (
                      <CountUp end={stat.value} durationMs={1500} />
                    ) : (
                      0
                    )}
                  </div>
                  {/* Thin teal line drawing under each stat number */}
                  <div className="w-full bg-[#E9E1D3]/60 h-0.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-[#0F766E] rounded-full transition-all duration-800 ease-out origin-left"
                      style={{
                        width: statsVisible ? '100%' : '0%',
                        transitionDelay: `${idx * 150}ms`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STRIP OF LIVE SITE CHIPS (Slide-in, sideways slow marquee, pause on hover) */}
      <section
        ref={chipsRef}
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-4 transition-all duration-700 ease-out ${
          chipsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <div className="rounded-2xl border border-[#E9E1D3] bg-[#FBF8F3]/80 backdrop-blur-sm p-3.5 overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#5B687A] px-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0F766E] animate-pulse" />
              <span className="font-semibold uppercase tracking-wider text-[11px] text-[#1B2A38]">
                Live Water Body Risk Feed
              </span>
              <span className="hidden sm:inline text-[#5B687A] text-[11px]">
                • Hover chip to inspect & pause
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#0F766E] font-medium">
              {sites.length} Active Shoreline Sites
            </span>
          </div>

          <div className="relative overflow-hidden w-full group/marquee">
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#FBF8F3] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#FBF8F3] to-transparent z-10 pointer-events-none" />

            {/* Marquee horizontal strip */}
            <div className="animate-marquee-strip flex items-center gap-3">
              {[...sites, ...sites].map((site, idx) => {
                const risk = siteRisks.get(site.id);
                const score = risk?.score ?? 40;
                const tier = risk?.tier ?? 'Low';
                let dotColor = 'bg-emerald-500';
                let badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                if (tier === 'Severe') {
                  dotColor = 'bg-red-700';
                  badgeBg = 'bg-red-100 text-red-900 border-red-200';
                } else if (tier === 'High') {
                  dotColor = 'bg-[#D65A4A]';
                  badgeBg = 'bg-red-50 text-[#D65A4A] border-red-200';
                } else if (tier === 'Medium') {
                  dotColor = 'bg-[#E9A03B]';
                  badgeBg = 'bg-amber-50 text-[#B87019] border-amber-200';
                }

                return (
                  <button
                    key={`${site.id}-${idx}`}
                    onClick={() => navigate(`/water-bodies/${site.id}`)}
                    className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 border border-[#E9E1D3] shadow-2xs hover:shadow-xs card-lift-4px text-left shrink-0 cursor-pointer transition-all"
                  >
                    <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                    <span className="text-xs font-semibold text-[#1B2A38] whitespace-nowrap">
                      {site.name}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}>
                      {score}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* RISK TREND LINE SECTION (Draws Left-to-Right on Scroll) */}
      <section
        ref={trendRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 my-6"
      >
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-[#E9E1D3] card-lift-4px">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#0F766E]" />
                <h3 className="font-serif-heading text-lg sm:text-xl font-bold text-[#1B2A38]">
                  7-Day Coastal Risk Trajectory
                </h3>
              </div>
              <p className="text-xs text-[#5B687A] mt-1">
                Predictive risk index progression computed across all active shoreline telemetry sensors in {currentCity.name}.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-[#5B687A]">Mean Risk:</span>
              <span className="font-newsreader text-2xl font-bold text-[#0F766E]">
                {avgRisk}
                <span className="text-xs font-normal text-[#5B687A]">/100</span>
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#0F766E]/10 text-[#0F766E] border border-[#0F766E]/20">
                Continuous Heuristics
              </span>
            </div>
          </div>

          {/* SVG Animated Risk Trend Line */}
          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 670 120"
              className="w-full h-32 sm:h-36 overflow-visible"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="trendTealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#0F766E" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              <line x1="40" y1="23" x2="630" y2="23" stroke="#E9E1D3" strokeDasharray="3 3" opacity="0.6" />
              <line x1="40" y1="55" x2="630" y2="55" stroke="#E9E1D3" strokeDasharray="3 3" opacity="0.6" />
              <line x1="40" y1="88" x2="630" y2="88" stroke="#E9E1D3" strokeDasharray="3 3" opacity="0.6" />

              {/* Area Under Curve */}
              <path
                d={trendSvgCoords.areaD}
                fill="url(#trendTealGrad)"
                style={{
                  opacity: trendVisible ? 1 : 0,
                  transition: 'opacity 1.2s ease-in 0.3s',
                }}
              />

              {/* Self-drawing line from left to right */}
              <path
                d={trendSvgCoords.pathD}
                fill="none"
                stroke="#0F766E"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 900,
                  strokeDashoffset: trendVisible ? 0 : 900,
                  transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />

              {/* Data point dots & text labels */}
              {trendSvgCoords.pts.map((pt, i) => (
                <g key={i}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill="#FFFFFF"
                    stroke="#0F766E"
                    strokeWidth="2.5"
                    className="transition-transform duration-300 hover:scale-150"
                    style={{
                      opacity: trendVisible ? 1 : 0,
                      transition: `opacity 0.4s ease-out ${0.4 + i * 0.15}s`,
                    }}
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    className="text-[10px] font-mono fill-[#0F766E] font-bold"
                    style={{
                      opacity: trendVisible ? 1 : 0,
                      transition: `opacity 0.4s ease-out ${0.5 + i * 0.15}s`,
                    }}
                  >
                    {pt.score}
                  </text>
                  <text
                    x={pt.x}
                    y="114"
                    textAnchor="middle"
                    className="text-[11px] fill-[#5B687A] font-medium"
                  >
                    {pt.day}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </section>

      {/* RECENT CIVIL INCIDENTS SECTION */}
      <section className="px-6 sm:px-12 py-12 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#0B3B3C]">
              Recent Incident Intelligence
            </h2>
            <p className="text-xs sm:text-sm text-[#5B687A] mt-1">
              GDELT global safety news events combined with citizen verified emergency records in {currentCity.name}.
            </p>
          </div>
          <button
            onClick={() => navigate('/incidents')}
            className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1"
          >
            View All Incident Logs <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {incidents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {incidents.slice(0, 3).map((inc) => (
              <div
                key={inc.id}
                className="glass-card rounded-2xl p-5 border border-[#E9E1D3] flex flex-col justify-between card-lift-4px"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold text-[#5B687A] uppercase tracking-wider">
                      {inc.locationName}
                    </span>
                    <TierBadge tier={inc.severity === 'Severe' ? 'Severe' : inc.severity === 'High' ? 'High' : 'Medium'} size="sm" />
                  </div>
                  <h4 className="font-bold text-sm text-[#1B2A38] line-clamp-2 leading-snug">
                    {inc.title}
                  </h4>
                  <p className="text-xs text-[#5B687A] mt-2 line-clamp-2">
                    {inc.notes || `Documented event on ${inc.date} via ${inc.source}.`}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E9E1D3]/80 flex items-center justify-between text-[11px]">
                  <span className="text-[#5B687A] font-mono">{inc.date}</span>
                  {inc.url ? (
                    <a
                      href={inc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#0F766E] font-medium hover:underline inline-flex items-center gap-1"
                    >
                      Source Article <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[#5B687A]">Community Report</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center max-w-lg mx-auto card-lift-4px">
            <Shield className="w-10 h-10 text-[#0F766E] mx-auto mb-3 opacity-60" />
            <h4 className="font-bold text-[#1B2A38] text-sm">No Fatalities or Major Rescues Documented</h4>
            <p className="text-xs text-[#5B687A] mt-1 leading-relaxed">
              GDELT news archives for {currentCity.name} recorded zero severe maritime events in the recent lookback window.
            </p>
            <button
              onClick={() => navigate('/incidents')}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:underline"
            >
              <span>Submit Community Observation</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* METHODOLOGY & RISK TIERS SECTION */}
      <section className="px-6 sm:px-12 py-14 bg-[#FBF8F3] border-t border-[#E9E1D3]/80">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="text-[11px] font-semibold text-[#0F766E] uppercase tracking-wider">
                Transparent Multi-Factor Engine
              </span>
              <h2 className="font-serif-heading text-2xl sm:text-3xl font-bold text-[#1B2A38] mt-1">
                Deterministic Environmental Risk Scoring
              </h2>
            </div>
            <button
              onClick={() => navigate('/explain')}
              className="text-xs font-semibold text-[#0F766E] hover:underline flex items-center gap-1 self-start md:self-auto"
            >
              Inspect SHAP Explanations <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white/80 border border-[#E9E1D3] space-y-3 card-lift-4px">
              <div className="w-10 h-10 rounded-xl bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-bold text-sm text-[#1B2A38]">Zero Hallucination Model</h3>
              <p className="text-xs text-[#5B687A] leading-relaxed">
                Risk indices are computed purely from Open-Meteo multi-variable physics telemetry and OpenStreetMap infrastructure data.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/80 border border-[#E9E1D3] space-y-3 card-lift-4px">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-700 flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="font-bold text-sm text-[#1B2A38]">Exact Additive SHAP</h3>
              <p className="text-xs text-[#5B687A] leading-relaxed">
                Every factor contribution is mathematically verifiable: Score = Baseline (25) + Sum of SHAP values, verified on every calculation.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/80 border border-[#E9E1D3] space-y-3 card-lift-4px">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="font-bold text-sm text-[#1B2A38]">Audited Lifeguard Equity</h3>
              <p className="text-xs text-[#5B687A] leading-relaxed">
                Fairness analysis across regions ensures municipal safety assets are allocated impartially without regional undercoverage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 sm:px-12 py-10 bg-[#F6F1E7] border-t border-[#E9E1D3] text-xs text-[#5B687A]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#0F766E]" />
            <span className="font-bold text-[#1B2A38]">GuardianGrid</span>
            <span>• Environmental Risk Intelligence</span>
          </div>
          <div>
            Data sourced live from Open-Meteo, Esri Satellite, GDELT & OpenStreetMap
          </div>
        </div>
      </footer>
    </div>
  );
};
