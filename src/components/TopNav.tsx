import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Compass,
  Search,
  Bell,
  MapPin,
  ChevronDown,
  Brain,
  Map as MapIcon,
  LogIn,
  LogOut,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAnalyst } from '../context/AnalystContext';
import { CITIES } from '../config';

interface TopNavProps {
  onSearch?: (query: string) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onSearch,
  searchQuery = '',
  setSearchQuery,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentCity, setCity, notifications, markNotificationsAsRead } = useApp();
  const { user, signInWithGoogle, signOut } = useAuth();
  const { aiStatus } = useAnalyst();
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navContainerRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (navContainerRef.current && !navContainerRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
        setCityDropdownOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        setCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const secondaryLinks = [
    { path: '/messages', label: 'Messages / War Room' },
    { path: '/responders', label: 'Responders' },
    { path: '/incidents', label: 'Incidents & Log' },
    { path: '/medical-handoff', label: 'Medical Handoff' },
    { path: '/dashboard', label: 'Executive Overview' },
    { path: '/workspace', label: 'Workspaces & Settings' },
    { path: '/forecast', label: '7-Day Forecast' },
  ];

  const pathname = location.pathname;
  const isRiskMapActive = pathname === '/map' || pathname.startsWith('/map/');
  const isCommandActive = pathname === '/command' || pathname.startsWith('/command/');
  const isFieldKitActive = pathname === '/field-kit' || pathname.startsWith('/field-kit/');
  const isAnalyticsActive = pathname === '/analytics' || pathname.startsWith('/analytics/');

  return (
    <header
      ref={navContainerRef}
      className="h-16 px-4 sm:px-6 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#E9E1D3] flex items-center justify-between sticky top-0 z-40"
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 rounded-lg shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shadow-xs">
            <Compass className="w-5 h-5" />
          </div>
          <span className="font-serif-heading text-lg font-bold tracking-tight text-[#0B3B3C] hidden sm:inline">
            GuardianGrid
          </span>
        </button>

        <nav
          className="flex items-center gap-1 p-1 bg-[#E9E1D3]/50 rounded-2xl overflow-x-auto max-w-full"
          aria-label="Primary Product Navigation"
        >
          <NavLink
            to="/"
            className="hidden sm:inline-flex px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#5B687A] hover:text-[#1B2A38] shrink-0"
          >
            Home
          </NavLink>

          <NavLink
            to="/sos"
            className="inline-flex px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#B91C1C] hover:bg-white/80 shrink-0"
          >
            Public SOS
          </NavLink>

          <NavLink
            to="/command"
            className={`inline-flex px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
              isCommandActive
                ? 'bg-[#0F766E] text-white shadow-xs'
                : 'text-[#0B3B3C] hover:bg-white/80'
            }`}
          >
            Command Center
          </NavLink>

          <NavLink
            to="/field-kit"
            className={`hidden md:inline-flex px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
              isFieldKitActive
                ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                : 'text-[#5B687A] hover:text-[#1B2A38]'
            }`}
          >
            Field Kit
          </NavLink>

          <NavLink
            to="/analytics"
            className={`hidden md:inline-flex px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
              isAnalyticsActive
                ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                : 'text-[#5B687A] hover:text-[#1B2A38]'
            }`}
          >
            Analytics
          </NavLink>

          <NavLink
            to="/map"
            onClick={() => setMoreOpen(false)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs cursor-pointer transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
              isRiskMapActive
                ? 'bg-[#0F766E] text-white font-semibold shadow-xs'
                : 'text-[#1B2A38] hover:bg-white/70 font-semibold'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Risk Map</span>
          </NavLink>

          {/* Compact Secondary Menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((m) => !m)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl cursor-pointer text-[#5B687A] hover:text-[#1B2A38] font-medium focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40"
            >
              <span>More</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {moreOpen && (
              <div className="absolute left-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-[#E9E1D3] py-1 z-50">
                {secondaryLinks.map((tab) => (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    onClick={() => setMoreOpen(false)}
                    className="block px-3 py-2 text-xs text-[#1B2A38] hover:bg-[#F6F1E7] hover:text-[#0F766E] cursor-pointer"
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="relative hidden xl:block w-52 2xl:w-64">
          <Search className="w-4 h-4 text-[#5B687A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery && setSearchQuery(e.target.value);
              onSearch && onSearch(e.target.value);
            }}
            placeholder="Search water bodies, locations..."
            className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] placeholder-[#5B687A]/70 focus:outline-none focus:border-[#0F766E] shadow-2xs transition-all"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 shadow-2xs"
          >
            <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
            <span className="max-w-[90px] truncate">{currentCity.name}</span>
            <ChevronDown className="w-3 h-3 text-[#5B687A]" />
          </button>

          {cityDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-[#E9E1D3] py-1 z-50">
              {CITIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCity(c);
                    setCityDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#F6F1E7] ${
                    c.id === currentCity.id ? 'text-[#0F766E] font-semibold' : 'text-[#1B2A38]'
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
          type="button"
          onClick={() => navigate('/analyst')}
          title={
            aiStatus.available
              ? 'Open Guardian Analyst (Gemini AI Active)'
              : aiStatus.reason || 'Open Guardian Analyst (Deterministic Rule Engine Active)'
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border bg-white text-xs font-semibold cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 shrink-0 ${
            pathname.startsWith('/analyst')
              ? 'border-[#0F766E] bg-[#0F766E]/5 text-[#0F766E]'
              : 'border-[#0F766E]/30 hover:bg-[#0F766E]/5 hover:border-[#0F766E] text-[#0B3B3C]'
          }`}
        >
          <Brain className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
          <span className="hidden sm:inline whitespace-nowrap">Guardian Analyst</span>
          {aiStatus.available ? (
            <span className="hidden xl:inline px-1.5 py-0.5 rounded-full bg-[#0F766E]/10 text-[#0F766E] text-[9px] font-bold uppercase tracking-wider leading-none whitespace-nowrap">
              AI Powered
            </span>
          ) : aiStatus.checked ? (
            <span className="hidden xl:inline px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold uppercase tracking-wider leading-none whitespace-nowrap">
              Rule Engine
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => markNotificationsAsRead()}
          aria-label="Notifications"
          className="hidden sm:inline-flex relative p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] shadow-2xs cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D65A4A] text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>

        {user ? (
          <div className="flex items-center gap-1.5">
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
              aria-label="Sign out"
              className="p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#1B2A38] hidden md:inline-flex cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0F766E] hover:bg-[#0B5D56] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
