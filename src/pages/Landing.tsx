import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAnalyst } from '../context/AnalystContext';
import { TierBadge } from '../components/TierBadge';
import { CountUp } from '../components/CountUpStats';
import { getEsriSatelliteThumbnail, getEsriCoastSatelliteUrl } from '../config';
import {
  Compass,
  ArrowRight,
  Shield,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  FlaskConical,
  Play,
  Radio,
  X,
  Brain,
  Menu,
} from 'lucide-react';

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { currentCity, sites, siteRisks, siteForecasts, incidents, lastUpdated } = useApp();
  const { aiStatus } = useAnalyst();

  const [coastImageError, setCoastImageError] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const topScore = topRisk?.score ?? null;
  const topTier = topRisk?.tier ?? 'Low';

  // Count live high-risk & severe locations
  const highRiskCount = useMemo(() => {
    return sites.filter((s) => {
      const t = siteRisks.get(s.id)?.tier;
      return t === 'High' || t === 'Severe';
    }).length;
  }, [sites, siteRisks]);

  // City-wide average risk from computed site scores
  const avgRisk = useMemo(() => {
    const scored = sites
      .map((s) => siteRisks.get(s.id)?.score)
      .filter((score): score is number => typeof score === 'number');
    if (!scored.length) return null;
    const sum = scored.reduce((acc, s) => acc + s, 0);
    return Math.round(sum / scored.length);
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
    if (topScore !== null && topScore >= 85) {
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
      badgeLabel: topScore !== null ? 'Low Risk' : 'Syncing',
      badgeStyle: 'bg-[#0F766E]/10 text-[#0F766E] border border-[#0F766E]/20',
    };
  }, [topScore, topTier]);

  // 7-Day Coastal Risk Trajectory aggregated directly from real Open-Meteo site forecasts
  const trendData = useMemo(() => {
    const forecasts = Array.from(siteForecasts.values());
    if (!forecasts.length) return [];
    const buckets = new Map<number, { label: string; sum: number; count: number }>();
    forecasts.forEach((f) => {
      (f.daily || []).slice(0, 7).forEach((d, idx) => {
        const cur = buckets.get(idx) || {
          label: idx === 0 ? 'Today' : d.dayName || `Day ${idx + 1}`,
          sum: 0,
          count: 0,
        };
        cur.sum += d.meanScore ?? d.maxScore;
        cur.count += 1;
        buckets.set(idx, cur);
      });
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({
        day: v.label,
        score: Math.round(v.sum / Math.max(1, v.count)),
      }));
  }, [siteForecasts]);

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
      <header className="h-20 px-4 sm:px-8 lg:px-10 flex items-center justify-between gap-3 border-b border-[#E9E1D3]/80 bg-[#FBF8F3]/90 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#0F766E] text-white flex items-center justify-center shadow-xs">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <span className="font-serif-heading text-xl font-bold tracking-tight text-[#0B3B3C]">
              GuardianGrid
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-3 lg:gap-5 text-xs lg:text-sm font-medium text-[#5B687A] min-w-0">
          <button onClick={() => navigate('/sos')} className="hover:text-[#0F766E] cursor-pointer transition-colors font-semibold text-[#D65A4A] whitespace-nowrap">
            Public SOS
          </button>
          <button onClick={() => navigate('/command')} className="hover:text-[#0F766E] cursor-pointer transition-colors font-semibold text-[#0B3B3C] whitespace-nowrap">
            Command Center
          </button>
          <button onClick={() => navigate('/field-kit')} className="hover:text-[#0F766E] cursor-pointer transition-colors whitespace-nowrap">
            Field Kit
          </button>
          <button onClick={() => navigate('/map')} className="hover:text-[#0F766E] cursor-pointer transition-colors whitespace-nowrap">
            Risk Map
          </button>
          <button onClick={() => navigate('/analytics')} className="hover:text-[#0F766E] cursor-pointer transition-colors whitespace-nowrap">
            Analytics
          </button>
          <button
            onClick={() => navigate('/analyst')}
            title={
              aiStatus.available
                ? 'Open Guardian Analyst (Gemini AI Active)'
                : aiStatus.reason || 'Open Guardian Analyst (Deterministic Rule Engine Active)'
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#0F766E]/30 bg-white hover:bg-[#0F766E]/5 text-[#0B3B3C] font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <Brain className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Guardian Analyst</span>
            {aiStatus.available ? (
              <span className="hidden xl:inline px-1.5 py-0.5 rounded-full bg-[#0F766E]/10 text-[#0F766E] text-[9px] font-bold uppercase tracking-wider leading-none">
                AI Powered
              </span>
            ) : aiStatus.checked ? (
              <span className="hidden xl:inline px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold uppercase tracking-wider leading-none">
                Rule Engine
              </span>
            ) : null}
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/command')}
            className="hidden sm:flex bg-[#0F766E] hover:bg-[#0B5A54] text-white font-medium px-4 lg:px-5 py-2.5 rounded-full text-xs sm:text-sm shadow-md hover:shadow-lg cursor-pointer transition-all items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/50 whitespace-nowrap"
          >
            <span>Open Command Center</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#1B2A38] cursor-pointer"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="md:hidden bg-[#FBF8F3] border-b border-[#E9E1D3] px-4 py-3 space-y-1.5 sticky top-20 z-30 shadow-md">
          {[
            { path: '/sos', label: 'Public SOS', accent: 'text-[#D65A4A] font-semibold' },
            { path: '/command', label: 'Command Center', accent: 'text-[#0B3B3C] font-semibold' },
            { path: '/field-kit', label: 'Field Kit', accent: 'text-[#1B2A38]' },
            { path: '/map', label: 'Risk Map', accent: 'text-[#1B2A38]' },
            { path: '/analytics', label: 'Analytics', accent: 'text-[#1B2A38]' },
            {
              path: '/analyst',
              label: `Guardian Analyst (${aiStatus.available ? 'AI Powered' : 'Rule Engine'})`,
              accent: 'text-[#0F766E] font-semibold',
            },
          ].map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                navigate(item.path);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl hover:bg-white text-sm ${item.accent}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

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
                  <span>COASTAL RESCUE &amp; EMERGENCY INTELLIGENCE</span>
                </div>

                {/* Headline: Newsreader font */}
                <h1 className="font-newsreader text-4xl sm:text-5xl lg:text-[3.25rem] font-medium tracking-tight text-[#1B2A38] leading-[1.12]">
                  From SOS <br className="hidden sm:inline" />
                  to <span className="italic text-[#0F766E]">Coordinated Rescue</span>
                </h1>

                {/* Subtitle Paragraph in Inter */}
                <p className="text-sm sm:text-base text-[#5B687A] font-normal leading-relaxed max-w-md pt-1">
                  GuardianGrid connects predictive Open-Meteo marine risk mapping with zero-login Citizen 1-Tap SOS, human verification, Nexconn real-time responder war rooms, and AI-assisted SBAR medical handoff.
                </p>

                {/* Primary Workflow CTAs */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/command')}
                    className="bg-[#0F766E] hover:bg-[#0B5A54] text-white px-5 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold shadow-sm hover:shadow transition-all flex items-center gap-2 group card-lift-4px cursor-pointer"
                  >
                    <span>Open Command Center</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/sos')}
                    className="px-5 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold text-white bg-[#D65A4A] hover:bg-[#B94334] shadow-xs transition-all flex items-center gap-1.5 card-lift-4px cursor-pointer"
                  >
                    <span>Public 1-Tap SOS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/map')}
                    className="px-4 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium text-[#1B2A38] bg-white/85 hover:bg-white border border-[#E9E1D3] shadow-xs transition-all card-lift-4px cursor-pointer"
                  >
                    Explore Live Risk Map
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/analyst')}
                    className="px-4 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold text-[#0B3B3C] bg-white hover:bg-[#0F766E]/5 border border-[#0F766E]/35 shadow-xs transition-all flex items-center gap-1.5 card-lift-4px cursor-pointer"
                  >
                    <Brain className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>Guardian Analyst</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/forecast')}
                    className="px-4 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium text-[#5B687A] hover:text-[#1B2A38] transition-colors cursor-pointer"
                  >
                    7-Day Forecast →
                  </button>
                </div>

                {/* 5-Step Rescue Workflow Strip */}
                <div className="pt-3 border-t border-[#E9E1D3]/80 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                  {[
                    { step: '1. Citizen SOS', to: '/sos', hint: '1-Tap + Tamil/EN' },
                    { step: '2. Verify Gate', to: '/command?filter=UNVERIFIED', hint: 'Human dispatcher' },
                    { step: '3. Field Kit', to: '/field-kit', hint: 'GPS + Status CTA' },
                    { step: '4. Nexconn Room', to: '/command', hint: 'Chat, PTT & Video' },
                    { step: '5. SBAR Handoff', to: '/medical-handoff', hint: 'Reviewed transfer' },
                  ].map((item) => (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => navigate(item.to)}
                      className="text-left px-2.5 py-2 rounded-xl bg-white/80 hover:bg-white border border-[#E9E1D3] hover:border-[#0F766E]/40 transition-colors cursor-pointer"
                    >
                      <div className="font-bold text-[#0B3B3C] truncate">{item.step}</div>
                      <div className="text-[10px] text-[#5B687A] truncate">{item.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Telemetry Status Line */}
              <div className="text-xs text-[#5B687A] font-normal italic pt-1 relative z-10">
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
                      {topScore !== null ? topScore : '--'}
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
                {avgRisk !== null ? avgRisk : '--'}
                <span className="text-xs font-normal text-[#5B687A]">/100</span>
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#0F766E]/10 text-[#0F766E] border border-[#0F766E]/20">
                Open-Meteo Forecast
              </span>
            </div>
          </div>

          {/* SVG Animated Risk Trend Line from live Open-Meteo forecasts */}
          {trendData.length > 0 ? (
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
          ) : (
            <div className="py-8 text-center text-xs text-[#5B687A] border border-dashed border-[#E9E1D3] rounded-2xl bg-[#FBF8F3]/60">
              7-day Open-Meteo marine forecast is syncing for {currentCity.name}. No synthetic trajectory values are displayed.
            </div>
          )}
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
            <span>• Coastal Safety &amp; Emergency Intelligence</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <span>Data sourced live from Open-Meteo, Esri Satellite, GDELT &amp; OpenStreetMap</span>
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[#0F766E] hover:underline font-medium cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>Training Simulation Walkthrough</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Training Simulation Walkthrough Modal */}
      {demoModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gg-demo-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDemoModalOpen(false);
          }}
        >
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-[#E9E1D3] pb-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider mb-1">
                  <FlaskConical className="w-3 h-3" />
                  <span>ISOLATED TRAINING SANDBOX · ZERO REAL ALERTS SENT</span>
                </div>
                <h2 id="gg-demo-modal-title" className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
                  GuardianGrid 10-Stage Training Simulation
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDemoModalOpen(false)}
                aria-label="Close training guide"
                className="p-1.5 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-[#5B687A] leading-relaxed space-y-3">
              <p>
                Rehearse the complete coastal safety workflow end-to-end as both{' '}
                <strong className="text-[#1B2A38]">Command Dispatcher</strong> and{' '}
                <strong className="text-[#1B2A38]">Field Responder</strong> using isolated, repeatable training drill data:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {[
                  '1. Predict & Prevent — Inspect live Open-Meteo marine hazard risk on Risk Map',
                  '2. Report — Trigger an isolated SIMULATED drill or use Public SOS Sandbox mode',
                  '3. Verify & Dispatch — Review Human Verification Gate & assign nearest unit',
                  '4. Communicate — Collaborate in live Nexconn War Room chat & audio/video call',
                  '5. Field Rescue & Medical Handoff — Update En Route/On Scene & SBAR transfer',
                  '6. Resolve & Learn — Close drill, inspect timeline & reset drills cleanly anytime',
                ].map((step) => (
                  <div
                    key={step}
                    className="p-2.5 rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] font-medium"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#E9E1D3]">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="#/field-kit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#0F766E]/40 bg-white hover:bg-[#0F766E]/5 text-[#0B3B3C] text-xs font-semibold"
                >
                  <Radio className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>Open Responder Field Kit (2nd Tab)</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDemoModalOpen(false);
                    navigate('/sos');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white hover:bg-[#F6F1E7] text-xs font-semibold text-[#D65A4A] cursor-pointer"
                >
                  <span>Open Public SOS</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDemoModalOpen(false);
                  navigate('/command?demo=1');
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5A54] text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Open Training Sandbox</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
