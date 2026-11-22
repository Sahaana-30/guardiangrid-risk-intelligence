import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Calendar,
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
  MessageSquare,
  ShieldAlert,
  Siren,
  Radio,
  LogIn,
  LogOut,
  Building2,
  Users,
  Stethoscope,
  BarChart3,
  Brain,
  Map as MapIcon,
  Home,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useNexconn } from '../context/NexconnContext';
import { useEmergency } from '../context/EmergencyContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAnalyst } from '../context/AnalystContext';
import { CITIES } from '../config';
import { OfflineBanner } from './OfflineBanner';

interface NavEntry {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'unverified' | 'unread';
  roles?: Array<'ORG_ADMIN' | 'DISPATCHER' | 'RESPONDER'>;
}

const PRIMARY_NAV: NavEntry[] = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/sos', label: 'Public SOS', icon: Siren },
  { path: '/command', label: 'Command Center', icon: ShieldAlert, badgeKey: 'unverified' },
  { path: '/field-kit', label: 'Responder Field Kit', icon: Radio },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const SECONDARY_OPERATIONS_NAV: NavEntry[] = [
  { path: '/messages', label: 'Messages / War Room', icon: MessageSquare, badgeKey: 'unread' },
  { path: '/responders', label: 'Responders', icon: Users },
  { path: '/incidents', label: 'Incidents & Log', icon: AlertCircle },
  { path: '/medical-handoff', label: 'Medical Handoff', icon: Stethoscope },
  { path: '/map', label: 'Risk Map', icon: MapIcon },
  { path: '/dashboard', label: 'Executive Overview', icon: LayoutDashboard },
];

const SECONDARY_TOOLS_NAV: NavEntry[] = [
  {
    path: '/workspace',
    label: 'Workspaces & Branding',
    icon: Building2,
    roles: ['ORG_ADMIN', 'DISPATCHER'],
  },
  { path: '/forecast', label: '7-Day Forecast', icon: Calendar },
  { path: '/reports', label: 'Environmental Reports', icon: FileText },
  { path: '/analytics?tab=explain', label: 'Risk Models & SHAP', icon: BookOpen },
  {
    path: '/settings',
    label: 'System Settings',
    icon: SettingsIcon,
    roles: ['ORG_ADMIN', 'DISPATCHER'],
  },
];

function getAreaLabel(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Home';
  if (pathname.startsWith('/command')) return 'Command Center';
  if (pathname.startsWith('/field-kit')) return 'Responder Field Kit';
  if (pathname.startsWith('/messages') || pathname.startsWith('/communications')) return 'Messages / War Room';
  if (pathname.startsWith('/responders')) return 'Responders';
  if (pathname.startsWith('/incidents')) return 'Incidents & Log';
  if (pathname.startsWith('/medical-handoff')) return 'Medical Handoff';
  if (pathname.startsWith('/dashboard')) return 'Executive Overview';
  if (pathname.startsWith('/analyst')) return 'Guardian Analyst';
  if (
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/water-bodies') ||
    pathname.startsWith('/forecast') ||
    pathname.startsWith('/explain') ||
    pathname.startsWith('/clusters') ||
    pathname.startsWith('/fairness') ||
    pathname.startsWith('/methodology') ||
    pathname.startsWith('/reports')
  ) {
    return 'Analytics';
  }
  if (pathname.startsWith('/workspace') || pathname.startsWith('/settings')) return 'Workspace';
  return 'Operations';
}

function isSecondaryRoute(pathname: string): boolean {
  return [
    '/messages',
    '/communications',
    '/responders',
    '/incidents',
    '/medical-handoff',
    '/map',
    '/dashboard',
    '/analyst',
    '/workspace',
    '/forecast',
    '/reports',
    '/explain',
    '/clusters',
    '/fairness',
    '/methodology',
    '/settings',
    '/water-bodies',
  ].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function inferFrontendRole(operatorRole?: string): 'ORG_ADMIN' | 'DISPATCHER' | 'RESPONDER' {
  const raw = (operatorRole || '').toLowerCase();
  if (raw.includes('lifeguard') || raw.includes('responder') || raw.includes('field')) {
    return 'RESPONDER';
  }
  if (raw.includes('admin') || raw.includes('director') || raw.includes('chief')) {
    return 'ORG_ADMIN';
  }
  return 'DISPATCHER';
}

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

  const { user, signInWithGoogle, signOut } = useAuth();
  const { totalUnreadCount, activeOperator } = useNexconn();
  const { unverifiedCount } = useEmergency();
  const { activeWorkspace } = useWorkspace();
  const { aiStatus } = useAnalyst();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const effectiveRole = inferFrontendRole(activeOperator?.role);
  const activeAreaLabel = getAreaLabel(location.pathname);

  const [secondaryOpen, setSecondaryOpen] = useState<boolean>(() =>
    isSecondaryRoute(location.pathname)
  );
  React.useEffect(() => {
    if (isSecondaryRoute(location.pathname)) {
      setSecondaryOpen(true);
    }
  }, [location.pathname]);

  const filterByRole = (items: NavEntry[]) =>
    items.filter((item) => !item.roles || item.roles.includes(effectiveRole));

  const visibleSecondaryOps = filterByRole(SECONDARY_OPERATIONS_NAV);
  const visibleSecondaryTools = filterByRole(SECONDARY_TOOLS_NAV);

  const isPathActive = (entryPath: string) => {
    const cleanPath = entryPath.split('?')[0];
    if (cleanPath === '/') return location.pathname === '/';
    if (entryPath.includes('tab=explain')) {
      return (
        ['/explain', '/clusters', '/fairness', '/methodology'].includes(location.pathname) ||
        (location.pathname === '/analytics' &&
          ['explain', 'clusters', 'fairness', 'methodology'].includes(
            new URLSearchParams(location.search).get('tab') || ''
          ))
      );
    }
    if (cleanPath === '/analytics') {
      return (
        (location.pathname === '/analytics' &&
          !['explain', 'clusters', 'fairness', 'methodology'].includes(
            new URLSearchParams(location.search).get('tab') || ''
          )) ||
        location.pathname === '/water-bodies' ||
        location.pathname.startsWith('/water-bodies/')
      );
    }
    return location.pathname === cleanPath || location.pathname.startsWith(`${cleanPath}/`);
  };

  const renderBadge = (entry: NavEntry, active: boolean) => {
    if (entry.badgeKey === 'unverified' && unverifiedCount > 0) {
      return (
        <span
          className={`px-1.5 py-0.5 min-w-[18px] text-center rounded-full text-[10px] font-bold leading-none ${
            active ? 'bg-white text-[#0F766E]' : 'bg-[#D65A4A] text-white'
          }`}
        >
          {unverifiedCount}
        </span>
      );
    }
    if (entry.badgeKey === 'unread' && totalUnreadCount > 0) {
      return (
        <span
          className={`px-1.5 py-0.5 min-w-[18px] text-center rounded-full text-[10px] font-bold leading-none ${
            active ? 'bg-white text-[#0F766E]' : 'bg-[#D65A4A] text-white'
          }`}
        >
          {totalUnreadCount}
        </span>
      );
    }
    return null;
  };

  const renderNavContent = (closeMobile?: () => void) => (
    <nav className="p-3 space-y-4" aria-label="Primary Product Navigation">
      {/* 5 Prominent Primary Destinations */}
      <div className="space-y-1">
        <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#5B687A]">
          Core Workflow
        </div>
        {PRIMARY_NAV.map((entry) => {
          const Icon = entry.icon;
          const active = isPathActive(entry.path);
          const isSos = entry.path === '/sos';
          return (
            <NavLink
              key={entry.path}
              to={entry.path}
              onClick={closeMobile}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                active
                  ? 'bg-[#0F766E] text-white shadow-xs'
                  : isSos
                    ? 'text-[#B91C1C] bg-[#FEF2F2]/70 hover:bg-[#FEE2E2] border border-[#FECACA]/70'
                    : 'text-[#1B2A38] hover:bg-[#E9E1D3]/50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  active ? 'text-white' : isSos ? 'text-[#D65A4A]' : 'text-[#0F766E]'
                }`}
              />
              <span className="flex-1 truncate">{entry.label}</span>
              {renderBadge(entry, active)}
            </NavLink>
          );
        })}
        {closeMobile && (
          <NavLink
            to="/analyst"
            onClick={closeMobile}
            className={`md:hidden flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
              isPathActive('/analyst')
                ? 'bg-[#0F766E] text-white shadow-xs'
                : 'text-[#1B2A38] hover:bg-[#E9E1D3]/50'
            }`}
          >
            <Brain className={`w-4 h-4 shrink-0 ${isPathActive('/analyst') ? 'text-white' : 'text-[#0F766E]'}`} />
            <span className="flex-1 truncate">Guardian Analyst</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                isPathActive('/analyst')
                  ? 'bg-white/20 text-white'
                  : aiStatus.available
                    ? 'bg-[#0F766E]/10 text-[#0F766E]'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {aiStatus.available ? 'AI Powered' : 'Rule Engine'}
            </span>
          </NavLink>
        )}
      </div>

      {/* Collapsible Secondary Operations & Intelligence Tools */}
      <div className="pt-2 border-t border-[#E9E1D3]/80 space-y-1.5">
        <button
          type="button"
          onClick={() => setSecondaryOpen((prev) => !prev)}
          aria-expanded={secondaryOpen}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-[#5B687A] hover:text-[#1B2A38] hover:bg-[#E9E1D3]/40 cursor-pointer"
        >
          <span>Operations &amp; Tools</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${secondaryOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {secondaryOpen && (
          <div className="space-y-2">
            <div className="space-y-0.5">
              {visibleSecondaryOps.map((entry) => {
                const Icon = entry.icon;
                const active = isPathActive(entry.path);
                return (
                  <NavLink
                    key={entry.path}
                    to={entry.path}
                    onClick={closeMobile}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-medium cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                      active
                        ? 'bg-[#0F766E]/12 text-[#0B3B3C] font-semibold'
                        : 'text-[#5B687A] hover:text-[#1B2A38] hover:bg-[#E9E1D3]/40'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-[#0F766E]' : 'text-[#5B687A]/80'
                      }`}
                    />
                    <span className="flex-1 truncate">{entry.label}</span>
                    {renderBadge(entry, active)}
                  </NavLink>
                );
              })}
            </div>

            <div className="pt-1.5 border-t border-[#E9E1D3]/60 space-y-0.5">
              {visibleSecondaryTools.map((entry) => {
                const Icon = entry.icon;
                const active = isPathActive(entry.path);
                return (
                  <NavLink
                    key={entry.path}
                    to={entry.path}
                    onClick={closeMobile}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[11px] font-medium cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                      active
                        ? 'bg-[#0F766E]/12 text-[#0B3B3C] font-semibold'
                        : 'text-[#5B687A]/85 hover:text-[#1B2A38] hover:bg-[#E9E1D3]/40'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-[#0F766E]' : 'text-[#5B687A]/75'
                      }`}
                    />
                    <span className="flex-1 truncate">{entry.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-[#1B2A38] flex flex-col font-sans">
      <OfflineBanner />

      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-[#E9E1D3] bg-[#FBF8F3]/95 backdrop-blur-md shrink-0 justify-between">
          <div className="overflow-y-auto">
            <div className="h-16 px-5 flex items-center justify-between gap-2 border-b border-[#E9E1D3]/80">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 rounded-lg min-w-0"
              >
                <div className="w-8 h-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                  <Compass className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="font-serif-heading text-base font-bold tracking-tight text-[#0B3B3C] block truncate">
                    GuardianGrid
                  </span>
                  <span className="block text-[9px] uppercase tracking-wider font-semibold text-[#0F766E] -mt-0.5 truncate">
                    {activeWorkspace.name}
                  </span>
                </div>
              </button>
            </div>

            {renderNavContent()}
          </div>

          <div className="p-3 border-t border-[#E9E1D3]/80 space-y-1">
            <div className="px-3 text-[10px] text-[#5B687A]/80 leading-relaxed font-sans">
              Data: Open-Meteo, OSM, Esri.
              <br />
              Heuristic advisory index.
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 px-3 sm:px-5 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#E9E1D3] flex items-center justify-between gap-3 sticky top-0 z-30">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/60 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 shrink-0"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-[#1B2A38] leading-tight flex items-center gap-2 truncate">
                  <span className="truncate">{currentCity.name}</span>
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-[#0F766E]/10 text-[#0B3B3C] text-[10px] font-semibold tracking-wide uppercase shrink-0">
                    {activeAreaLabel}
                  </span>
                </h1>
                <p className="text-[10px] text-[#5B687A] hidden 2xl:block truncate">
                  {currentCity.region} • Coastal safety &amp; rescue coordination
                  {currentCity.id !== activeWorkspace.geofence.cityId
                    ? ` · Ops: ${activeWorkspace.name}`
                    : ''}
                </p>
              </div>
            </div>

            {/* Persistent Top Product Navigation */}
            <nav
              className="hidden md:flex items-center gap-1 p-1 bg-[#E9E1D3]/45 rounded-2xl overflow-x-auto max-w-full shrink min-w-0"
              aria-label="Top Operations Navigation"
            >
              <NavLink
                to="/sos"
                className={`inline-flex px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  isPathActive('/sos')
                    ? 'bg-[#D65A4A] text-white shadow-xs'
                    : 'text-[#B91C1C] hover:bg-white/80'
                }`}
              >
                Public SOS
              </NavLink>
              <NavLink
                to="/command"
                className={`inline-flex px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  isPathActive('/command')
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#0B3B3C] hover:bg-white/80'
                }`}
              >
                Command Center
              </NavLink>
              <NavLink
                to="/field-kit"
                className={`inline-flex px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 whitespace-nowrap transition-all ${
                  isPathActive('/field-kit')
                    ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                    : 'text-[#5B687A] hover:text-[#1B2A38]'
                }`}
              >
                Field Kit
              </NavLink>
              <NavLink
                to="/map"
                className={`inline-flex px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 whitespace-nowrap transition-all ${
                  isPathActive('/map')
                    ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                    : 'text-[#5B687A] hover:text-[#1B2A38]'
                }`}
              >
                Risk Map
              </NavLink>
              <NavLink
                to="/analytics"
                className={`inline-flex px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 whitespace-nowrap transition-all ${
                  isPathActive('/analytics')
                    ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                    : 'text-[#5B687A] hover:text-[#1B2A38]'
                }`}
              >
                Analytics
              </NavLink>
              <NavLink
                to="/analyst"
                title={
                  aiStatus.available
                    ? 'Guardian Analyst (Gemini AI Active)'
                    : aiStatus.reason || 'Guardian Analyst (Rule Engine Active)'
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap transition-all ${
                  isPathActive('/analyst')
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-[#0B3B3C] hover:bg-white/80'
                }`}
              >
                <Brain className="w-3.5 h-3.5 shrink-0" />
                <span>Guardian Analyst</span>
                {aiStatus.available ? (
                  <span
                    className={`hidden xl:inline px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none ${
                      isPathActive('/analyst')
                        ? 'bg-white/20 text-white'
                        : 'bg-[#0F766E]/10 text-[#0F766E]'
                    }`}
                  >
                    AI Powered
                  </span>
                ) : aiStatus.checked ? (
                  <span
                    className={`hidden xl:inline px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none ${
                      isPathActive('/analyst')
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    Rule Engine
                  </span>
                ) : null}
              </NavLink>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden 2xl:flex items-center bg-[#E9E1D3]/50 p-1 rounded-xl text-xs">
                {(['7d', '30d', '90d'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setDateRange(r)}
                    className={`px-2 py-1 rounded-lg font-medium transition-all ${
                      dateRange === r
                        ? 'bg-white text-[#0F766E] shadow-xs'
                        : 'text-[#5B687A] hover:text-[#1B2A38]'
                    }`}
                  >
                    {r === '7d' ? '7D' : r === '30d' ? '30D' : '90D'}
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
                className="p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] hover:border-[#0F766E]/30 shadow-2xs cursor-pointer transition-all disabled:opacity-50"
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

              {user ? (
                <div className="flex items-center gap-2">
                  <div
                    title={user.email || user.displayName || 'Signed in'}
                    className="w-8 h-8 rounded-full bg-[#0F766E] text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-xs select-none"
                  >
                    {(user.displayName || user.email || 'GG').slice(0, 2).toUpperCase()}
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    title="Sign out"
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#5B687A] hover:text-[#1B2A38] transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5D56] text-white text-xs font-semibold shadow-2xs transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}
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
            <div className="overflow-y-auto">
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

              <div className="mt-2">{renderNavContent(() => setMobileMenuOpen(false))}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
