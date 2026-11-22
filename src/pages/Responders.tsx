import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Radio,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Navigation,
  Search,
} from 'lucide-react';
import { useEmergency } from '../context/EmergencyContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { DataTrustBadge } from '../components/ProvenanceTip';
import { BackNavButton } from '../components/BackNavButton';
import type { ResponderAvailability } from '../types/emergency';

const AVAILABILITY_META: Record<
  ResponderAvailability,
  { label: string; badgeClass: string }
> = {
  available: {
    label: 'Available / On Duty',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  dispatched: {
    label: 'Dispatched',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  on_scene: {
    label: 'On Scene',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  off_duty: {
    label: 'Off Duty',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

export const Responders: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { responders, incidents, cells, loading, error, refreshIncidents } = useEmergency();
  const { activeWorkspace } = useWorkspace();

  const initialStatus = searchParams.get('status') || 'all';
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [incidentFilterId, setIncidentFilterId] = useState<string>(
    () => searchParams.get('incidentId') || ''
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    const param = searchParams.get('status') || 'all';
    setStatusFilter(param);
    setIncidentFilterId(searchParams.get('incidentId') || '');
  }, [searchParams]);

  const incidentById = useMemo(() => {
    const map = new Map(incidents.map((i) => [i.id, i]));
    return map;
  }, [incidents]);

  const cellById = useMemo(() => {
    const map = new Map(cells.map((c) => [c.id, c]));
    return map;
  }, [cells]);

  const counts = useMemo(() => {
    const onDuty = responders.filter((r) => r.availability !== 'off_duty').length;
    const available = responders.filter((r) => r.availability === 'available').length;
    const assigned = responders.filter(
      (r) =>
        Boolean(r.activeIncidentId) ||
        r.availability === 'dispatched' ||
        r.availability === 'on_scene'
    ).length;
    const enRoute = responders.filter((r) => {
      if (!r.activeIncidentId) return false;
      const inc = incidentById.get(r.activeIncidentId);
      return inc?.state === 'EN_ROUTE';
    }).length;
    return { total: responders.length, onDuty, available, assigned, enRoute };
  }, [responders, incidentById]);

  const focusedIncident = incidentFilterId ? incidentById.get(incidentFilterId) || null : null;

  const filteredResponders = useMemo(() => {
    return responders.filter((r) => {
      if (incidentFilterId) {
        const inc = incidentById.get(incidentFilterId);
        const isAssignedToFocused =
          r.activeIncidentId === incidentFilterId ||
          Boolean(inc?.assignedResponderIds?.includes(r.id));
        if (!isAssignedToFocused) return false;
      }
      if (statusFilter === 'on_duty' && r.availability === 'off_duty') return false;
      if (statusFilter === 'available' && r.availability !== 'available') return false;
      if (
        statusFilter === 'assigned' &&
        !r.activeIncidentId &&
        r.availability !== 'dispatched' &&
        r.availability !== 'on_scene'
      ) {
        return false;
      }
      if (statusFilter === 'en_route') {
        const inc = r.activeIncidentId ? incidentById.get(r.activeIncidentId) : null;
        if (inc?.state !== 'EN_ROUTE') return false;
      }
      if (statusFilter === 'off_duty' && r.availability !== 'off_duty') return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const hit =
          r.name.toLowerCase().includes(q) ||
          r.station.toLowerCase().includes(q) ||
          r.radioCallsign.toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [responders, statusFilter, incidentFilterId, search, incidentById]);

  const applyStatus = (next: string) => {
    setStatusFilter(next);
    if (next === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', next);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const clearIncidentFilter = () => {
    setIncidentFilterId('');
    searchParams.delete('incidentId');
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <BackNavButton fallbackPath="/dashboard" />
            <h2 className="font-serif-heading text-2xl font-bold text-[#1B2A38]">
              Coastal Rescue Responders
            </h2>
            <DataTrustBadge
              classification="live_measured"
              source={`Operational Roster (${activeWorkspace.name})`}
              note="Scoped server-side to the active workspace organization."
            />
          </div>
          <p className="text-xs sm:text-sm text-[#5B687A] mt-1">
            Live duty status, rescue-cell assignments, qualifications, and field-unit dispatch readiness for{' '}
            <span className="font-semibold text-[#0B3B3C]">{activeWorkspace.name}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => void refreshIncidents()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0F766E]' : ''}`} />
            <span>Sync Roster</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/field-kit')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F766E] hover:bg-[#0B5D56] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
          >
            <Radio className="w-4 h-4" />
            <span>Open Mobile Field Kit</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'on_duty', label: 'On Duty (Point-in-Time)', value: counts.onDuty, sub: `${counts.total} total units` },
          { key: 'available', label: 'Available for Dispatch', value: counts.available, sub: 'Ready at home cell' },
          { key: 'assigned', label: 'Assigned / Active', value: counts.assigned, sub: 'Dispatched or on scene' },
          { key: 'en_route', label: 'En Route Now', value: counts.enRoute, sub: 'Moving to SOS coordinates' },
        ].map((item) => {
          const active = statusFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => applyStatus(active ? 'all' : item.key)}
              className={`text-left glass-card rounded-2xl p-4 border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F766E]/40 ${
                active
                  ? 'border-[#0F766E] ring-1 ring-[#0F766E]/30 bg-white'
                  : 'border-[#E9E1D3] hover:border-[#0F766E]/40'
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[#5B687A]">
                {item.label}
              </div>
              <div className="mt-1.5 text-2xl font-bold text-[#1B2A38]">{item.value}</div>
              <div className="mt-1 text-[11px] text-[#5B687A]">{item.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="glass-card rounded-2xl p-4 border border-[#E9E1D3] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'all', label: 'All Units' },
            { id: 'on_duty', label: 'On Duty' },
            { id: 'available', label: 'Available' },
            { id: 'assigned', label: 'Assigned' },
            { id: 'en_route', label: 'En Route' },
            { id: 'off_duty', label: 'Off Duty' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                statusFilter === tab.id
                  ? 'bg-[#0F766E] text-white font-semibold'
                  : 'bg-[#F6F1E7] text-[#5B687A] hover:text-[#1B2A38]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#5B687A] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, station, callsign..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-[#E9E1D3] text-xs text-[#1B2A38] focus:outline-none focus:border-[#0F766E]"
          />
        </div>
      </div>

      {/* Focused Incident Filter Banner (from ?incidentId=...) */}
      {incidentFilterId && (
        <div className="rounded-xl border border-[#0F766E]/30 bg-[#0F766E]/8 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#0B3B3C] font-medium">
            Showing units assigned to incident{' '}
            <strong className="font-mono">{focusedIncident?.code || incidentFilterId}</strong>
          </span>
          <button
            type="button"
            onClick={clearIncidentFilter}
            className="text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer"
          >
            Show all responders
          </button>
        </div>
      )}

      {/* Error / Loading / Empty / List */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && responders.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-xs text-[#5B687A]">
          Loading responder roster for {activeWorkspace.name}...
        </div>
      ) : filteredResponders.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-2 border border-[#E9E1D3]">
          <Users className="w-8 h-8 text-[#5B687A]/50 mx-auto" />
          <div className="text-sm font-semibold text-[#1B2A38]">
            No responders match the active filter
          </div>
          <p className="text-xs text-[#5B687A]">
            Try clearing the status filter or switching operational workspace.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredResponders.map((unit) => {
            const avail = AVAILABILITY_META[unit.availability] || AVAILABILITY_META.available;
            const activeIncident = unit.activeIncidentId
              ? incidentById.get(unit.activeIncidentId)
              : null;
            const homeCell = cellById.get(unit.homeCellId);

            return (
              <div
                key={unit.id}
                className="glass-card rounded-2xl p-5 border border-[#E9E1D3] flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-[#1B2A38]">{unit.name}</h3>
                        {unit.isSimulated && (
                          <DataTrustBadge
                            classification="simulated_demo"
                            compact
                            source="Demo Responder Roster"
                          />
                        )}
                      </div>
                      <div className="text-xs text-[#5B687A] mt-0.5">
                        {unit.role} · <span className="font-mono">{unit.radioCallsign}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${avail.badgeClass}`}
                    >
                      {avail.label}
                    </span>
                  </div>

                  <div className="text-xs text-[#5B687A] space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                      <span>
                        {unit.station}
                        {homeCell ? ` (${homeCell.label})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <Navigation className="w-3.5 h-3.5 text-[#5B687A] shrink-0" />
                      <span>
                        {unit.lat.toFixed(4)}, {unit.lon.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  {unit.qualifications.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {unit.qualifications.map((q) => (
                        <span
                          key={q}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F6F1E7] border border-[#E9E1D3] text-[10px] font-medium text-[#1B2A38]"
                        >
                          <ShieldCheck className="w-2.5 h-2.5 text-[#0F766E]" />
                          {q}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E9E1D3]/80 flex items-center justify-between gap-2">
                  {activeIncident ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/command?incidentId=${activeIncident.id}`)}
                      className="text-xs font-semibold text-[#D65A4A] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>
                        Active: {activeIncident.code} ({activeIncident.state.replace('_', ' ')})
                      </span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#5B687A]">No active assignment</span>
                  )}

                  <button
                    type="button"
                    onClick={() => navigate('/command')}
                    className="text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer"
                  >
                    Live Ops
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
