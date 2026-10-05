import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Compass, Search, Bell, MapPin, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
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
  const { currentCity, setCity, notifications, markNotificationsAsRead } = useApp();
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const primaryTabs = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/map', label: 'Risk Map' },
    { path: '/water-bodies', label: 'Water Bodies' },
    { path: '/forecast', label: 'Forecast' },
  ];

  const moreTabs = [
    { path: '/explain', label: 'Explainable AI' },
    { path: '/clusters', label: 'Clustering' },
    { path: '/fairness', label: 'Fairness Analysis' },
    { path: '/analyst', label: 'Guardian Analyst' },
    { path: '/reports', label: 'Intelligence Reports' },
    { path: '/incidents', label: 'Incidents' },
    { path: '/methodology', label: 'Methodology' },
    { path: '/settings', label: 'Settings' },
  ];

  return (
    <header className="h-16 px-4 sm:px-6 bg-[#FBF8F3]/95 backdrop-blur-md border-b border-[#E9E1D3] flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 text-left focus:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shadow-xs">
            <Compass className="w-5 h-5" />
          </div>
          <span className="font-serif-heading text-lg font-bold tracking-tight text-[#0B3B3C] hidden sm:inline">
            GuardianGrid
          </span>
        </button>

        <nav className="flex items-center gap-1.5 p-1 bg-[#E9E1D3]/50 rounded-2xl">
          {primaryTabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-[#0F766E] font-semibold shadow-xs'
                    : 'text-[#5B687A] hover:text-[#1B2A38]'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}

          <div className="relative">
            <button
              onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#5B687A] hover:text-[#1B2A38] font-medium rounded-xl"
            >
              <span>More</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {moreDropdownOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-[#E9E1D3] py-1 z-50">
                {moreTabs.map((tab) => (
                  <NavLink
                    key={tab.path}
                    to={tab.path}
                    onClick={() => setMoreDropdownOpen(false)}
                    className="block px-3 py-2 text-xs text-[#1B2A38] hover:bg-[#F6F1E7] hover:text-[#0F766E]"
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block w-64 lg:w-80">
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
            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 shadow-2xs"
          >
            <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
            <span className="max-w-[100px] truncate">{currentCity.name}</span>
            <ChevronDown className="w-3 h-3 text-[#5B687A]" />
          </button>

          {cityDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-[#E9E1D3] py-1 z-50">
              {CITIES.map((c) => (
                <button
                  key={c.id}
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
          onClick={() => markNotificationsAsRead()}
          className="relative p-2 rounded-xl border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] shadow-2xs"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D65A4A] text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>

        <div className="w-8 h-8 rounded-full bg-[#0F766E] text-white font-bold text-xs flex items-center justify-center ring-2 ring-white shadow-xs">
          SS
        </div>
      </div>
    </header>
  );
};
