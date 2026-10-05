import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Waves,
  Calendar,
  Sparkles,
  GitFork,
  Scale,
  Bot,
  FileText,
  AlertCircle,
  BookOpen,
  Settings as SettingsIcon,
  Bell,
  ChevronDown,
  Menu,
  X,
  RefreshCw,
  Compass,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CITIES } from '../config';
import { OfflineBanner } from './OfflineBanner';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/map', label: 'Risk Map', icon: MapPin },
  { path: '/water-bodies', label: 'Water Bodies', icon: Waves },
  { path: '/forecast', label: 'Forecast', icon: Calendar },
  { path: '/explain', label: 'Explainable AI', icon: Sparkles },
  { path: '/clusters', label: 'Clustering', icon: GitFork },
  { path: '/fairness', label: 'Fairness Analysis', icon: Scale },
  { path: '/analyst', label: 'Guardian Analyst', icon: Bot },
  { path: '/reports', label: 'Intelligence Reports', icon: FileText },
];

const secondaryNavItems = [
  { path: '/incidents', label: 'Incidents', icon: AlertCircle },
  { path: '/methodology', label: 'Methodology', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentCity,
    setCity,
    dateRange,
    setDateRange,
    notifications,
    markNotificationsAsRead,
    refreshData,
    isLoading,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#1B2A38] flex flex-col font-sans">
      <OfflineBanner />

      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-[#E9E1D3] bg-[#FBF8F3]/95 backdrop-blur-md shrink-0 justify-between">
          <div>
            <div className="h-16 px-6 flex items-center gap-3 border-b border-[#E9E1D3]/80">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2.5 text-left group focus:outline-none"
              >
                <div className="w-8 h-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-serif-heading text-lg font-bold tracking-tight text-[#0B3B3C]">
                    GuardianGrid
                  </span>
                  <span className="block text-[9px] uppercase tracking-widest text-[#0F766E] font-semibold -mt-1">
                    Risk Intelligence
                  </span>
                </div>
              </button>
            </div>

            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#0F766E] text-white font-semibold shadow-xs'
                        : 'text-[#5B687A] hover:bg-[#E9E1D3]/50 hover:text-[#1B2A38]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#5B687A]'}`} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="p-3 border-t border-[#E9E1D3]/80 space-y-1">
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#0F766E] text-white font-semibold shadow-xs'
                      : 'text-[#5B687A] hover:bg-[#E9E1D3]/50 hover:text-[#1B2A38]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#5B687A]'}`} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            <div className="pt-3 px-3 text-[10px] text-[#5B687A]/80 leading-relaxed font-sans border-t border-[#E9E1D3]/40 mt-2">
              Data: Open-Meteo, OSM, Esri.
              <br />
              Heuristic advisory index.
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 px-4 sm:px-6 bg-[#FBF8F3]/90 backdrop-blur-md border-b border-[#E9E1D3] flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/60 focus:outline-none"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div>
                <h1 className="text-base sm:text-lg font-bold text-[#1B2A38] leading-tight flex items-center gap-2">
                  <span>{currentCity.name}</span>
                  <span className="text-xs font-normal text-[#5B687A] hidden sm:inline">
                    • {currentCity.region}
                  </span>
                </h1>
                <p className="text-[11px] text-[#5B687A] hidden md:block">
                  Environmental risk intelligence & public water safety
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-4">
              <div className="hidden sm:flex items-center bg-[#E9E1D3]/50 p-1 rounded-xl text-xs">
                {(['7d', '30d', '90d'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDateRange(r)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                      dateRange === r
                        ? 'bg-white text-[#0F766E] shadow-xs'
                        : 'text-[#5B687A] hover:text-[#1B2A38]'
                    }`}
                  >
                    {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
                  </button>
                ))}
              </div>

              <div className="relative">
                <button
                  onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 shadow-2xs transition-all"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span className="max-w-[110px] truncate">{currentCity.name}</span>
                  <ChevronDown className="w-3 h-3 text-[#5B687A]" />
                </button>

                {cityDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-[#E9E1D3] py-1.5 z-50">
                    <div className="px-3 py-1 text-[10px] uppercase font-semibold text-[#5B687A] tracking-wider">
                      Select Monitored Region
                    </div>
                    {CITIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCity(c);
                          setCityDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#F6F1E7] transition-colors ${
                          c.id === currentCity.id
                            ? 'text-[#0F766E] font-semibold bg-[#0F766E]/5'
                            : 'text-[#1B2A38]'
                        }`}
                      >
                        <span>{c.name}</span>
                        <span className="text-[10px] text-[#5B687A]">{c.country}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => refreshData()}
                disabled={isLoading}
                title="Refresh live telemetry"
                className="p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] hover:border-[#0F766E]/30 shadow-2xs transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0F766E]' : ''}`} />
              </button>

              <div className="relative">
                <button
                  onClick={() => {
                    setNotificationsOpen(!notificationsOpen);
                    if (!notificationsOpen) markNotificationsAsRead();
                  }}
                  className="relative p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] shadow-2xs transition-all"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D65A4A] text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-[#E9E1D3] p-3 z-50">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-semibold text-[#1B2A38]">Recent Advisories</span>
                      <span className="text-[10px] text-[#5B687A]">Auto-detected</span>
                    </div>
                    <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                      {notifications.map((n) => (
                        <div key={n.id} className="p-2 bg-[#F6F1E7]/50 rounded-xl text-xs">
                          <div className="font-medium text-[#1B2A38]">{n.title}</div>
                          <div className="text-[11px] text-[#5B687A] mt-0.5">{n.message}</div>
                          <div className="text-[10px] text-[#5B687A]/70 mt-1 font-mono">{n.timestamp}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div
                title="Analyst Profile (Local Session)"
                className="w-8 h-8 rounded-full bg-[#0F766E] text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-xs cursor-default select-none"
              >
                SS
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-mesh-glow">
            {children}
          </main>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-[#FBF8F3] h-full shadow-2xl flex flex-col justify-between p-4 z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#E9E1D3]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#0F766E] text-white flex items-center justify-center">
                    <Compass className="w-4 h-4" />
                  </div>
                  <span className="font-serif-heading font-bold text-base text-[#0B3B3C]">
                    GuardianGrid
                  </span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-[#5B687A]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#0F766E] text-white font-semibold shadow-xs'
                          : 'text-[#5B687A] hover:bg-[#E9E1D3]/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#5B687A]'}`} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-[#E9E1D3] pt-3 space-y-1">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[#5B687A]"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
