import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useEmergency } from '../context/EmergencyContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { Incident } from '../types';
import { TierBadge } from '../components/TierBadge';
import { ProvenanceTip, DataTrustBadge, formatReadingAge } from '../components/ProvenanceTip';
import { EmergencyResponseTimeline } from '../components/emergency/EmergencyResponseTimeline';
import { BackNavButton } from '../components/BackNavButton';
import { exportIncidentsCsv, importIncidentsCsv } from '../services/incidents';
import {
  AlertCircle,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Calendar,
  ExternalLink,
  LifeBuoy,
  Waves,
  ShieldAlert,
  CheckCircle2,
  Clock,
  X,
  FileSpreadsheet,
  Globe,
  Users,
  Stethoscope,
  MessageSquare,
  MapPin,
} from 'lucide-react';

export const Incidents: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentCity, sites, incidents, reportIncident, toggleVerifyIncident } = useApp();
  const { incidents: operationalIncidents } = useEmergency();
  const { activeWorkspace } = useWorkspace();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Operational SOS filter state synced with URL drill-down params
  const [opsCategory, setOpsCategory] = useState<string>(() => searchParams.get('category') || 'all');
  const [opsSeverity, setOpsSeverity] = useState<string>(() => searchParams.get('severity') || 'all');
  const [opsCellId, setOpsCellId] = useState<string>(() => searchParams.get('cellId') || 'all');
  const [opsState, setOpsState] = useState<string>(() => searchParams.get('state') || 'all');
  const [selectedOpsIncidentId, setSelectedOpsIncidentId] = useState<string | null>(null);

  useEffect(() => {
    setOpsCategory(searchParams.get('category') || 'all');
    setOpsSeverity(searchParams.get('severity') || 'all');
    setOpsCellId(searchParams.get('cellId') || 'all');
    setOpsState(searchParams.get('state') || 'all');
  }, [searchParams]);

  const filteredOperationalIncidents = useMemo(() => {
    return operationalIncidents.filter((inc) => {
      if (opsCategory !== 'all') {
        if (opsCategory === 'drowning') {
          if (inc.category !== 'drowning' && inc.category !== 'swept_away') return false;
        } else if (inc.category !== opsCategory) {
          return false;
        }
      }
      if (opsSeverity !== 'all' && inc.severity !== opsSeverity) return false;
      if (opsCellId !== 'all' && inc.cellId !== opsCellId) return false;
      if (opsState !== 'all' && inc.state !== opsState) return false;
      return true;
    });
  }, [operationalIncidents, opsCategory, opsSeverity, opsCellId, opsState]);

  const selectedOpsIncident = useMemo(
    () =>
      filteredOperationalIncidents.find((inc) => inc.id === selectedOpsIncidentId) ||
      operationalIncidents.find((inc) => inc.id === selectedOpsIncidentId) ||
      null,
    [filteredOperationalIncidents, operationalIncidents, selectedOpsIncidentId]
  );

  const clearOpsFilters = () => {
    setOpsCategory('all');
    setOpsSeverity('all');
    setOpsCellId('all');
    setOpsState('all');
    setSearchParams({}, { replace: true });
  };

  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New incident form state
  const [formSiteId, setFormSiteId] = useState(sites[0]?.id || '');
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formType, setFormType] = useState<Incident['type']>('rescue');
  const [formSeverity, setFormSeverity] = useState<Incident['severity']>('Medium');
  const [formUrl, setFormUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Filtered incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (
        searchTerm &&
        !inc.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(inc.locationName || '').toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (typeFilter !== 'all' && inc.type !== typeFilter) return false;
      if (severityFilter !== 'all' && inc.severity !== severityFilter) return false;
      if (sourceFilter === 'community' && !inc.isCommunityReported) return false;
      if (sourceFilter === 'gdelt' && inc.isCommunityReported) return false;
      return true;
    });
  }, [incidents, searchTerm, typeFilter, severityFilter, sourceFilter]);

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const matchedSite = sites.find((s) => s.id === formSiteId);

    reportIncident({
      title: formTitle,
      date: formDate,
      locationName: matchedSite?.name || 'Monitored Coastal Water',
      waterBodyId: matchedSite?.id,
      lat: matchedSite?.lat,
      lon: matchedSite?.lon,
      type: formType,
      severity: formSeverity,
      source: 'Citizen Safety Report',
      url: formUrl.trim() || undefined,
      notes: formNotes.trim() || undefined,
    });

    setModalOpen(false);
    setFormTitle('');
    setFormNotes('');
    setFormUrl('');
  };

  const handleExportCSV = () => {
    const csvData = exportIncidentsCsv(incidents);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GuardianGrid_Incidents_${currentCity.id}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        importIncidentsCsv(text, sites);
        window.location.reload();
      }
    };
    reader.readAsText(file);
  };

  // KPIs
  const totalCount = incidents.length;
  const severeCount = incidents.filter((i) => i.severity === 'Severe' || i.severity === 'High').length;
  const rescueCount = incidents.filter((i) => i.type === 'rescue').length;
  const communityCount = incidents.filter((i) => i.isCommunityReported).length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <BackNavButton fallbackPath="/dashboard" />
            <AlertCircle className="w-5 h-5 text-[#B5654A]" />
            <h1 className="font-serif-heading text-3xl font-bold text-[#0B3B3C]">
              Incident Intelligence & Safety Log
            </h1>
          </div>
          <p className="text-sm text-[#5B687A] mt-1">
            Real-time GDELT global news event parsing combined with verified community emergency incident reporting in {currentCity.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportCSV}
            accept=".csv"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#1B2A38] hover:bg-[#FBF8F3] transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Report Incident</span>
          </button>

          <button
            onClick={() => navigate('/sos')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#D65A4A] text-white hover:bg-[#B94334] transition shadow-xs cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Public SOS</span>
          </button>
        </div>
      </div>

      {/* Live Operational SOS Incidents (Workspace-Scoped) */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif-heading text-lg font-bold text-[#0B3B3C]">
                Operational SOS Queue ({activeWorkspace.name})
              </h2>
              <DataTrustBadge
                classification="live_measured"
                compact
                source={`Emergency Repository (${activeWorkspace.name})`}
              />
            </div>
            <p className="text-xs text-[#5B687A] mt-0.5">
              Live emergency SOS reports scoped to the active workspace. Simulated drills are visibly labelled.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'drowning', 'swept_away', 'missing_person', 'medical'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setOpsCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize cursor-pointer transition-colors ${
                  opsCategory === cat
                    ? 'bg-[#0F766E] text-white font-semibold'
                    : 'bg-white border border-[#E9E1D3] text-[#5B687A] hover:text-[#1B2A38]'
                }`}
              >
                {cat === 'all' ? 'All SOS' : cat.replace('_', ' ')}
              </button>
            ))}
            {(opsCategory !== 'all' || opsSeverity !== 'all' || opsCellId !== 'all' || opsState !== 'all') && (
              <button
                type="button"
                onClick={clearOpsFilters}
                className="text-[11px] font-semibold text-[#D65A4A] hover:underline cursor-pointer"
              >
                Clear filters{opsState !== 'all' ? ` (${opsState})` : ''}
              </button>
            )}
          </div>
        </div>

        {filteredOperationalIncidents.length === 0 ? (
          <div className="py-5 text-center text-xs text-[#5B687A] bg-white/60 rounded-xl border border-[#E9E1D3]/60">
            No operational SOS incidents match the current filter ({opsCategory !== 'all' ? opsCategory : 'all categories'}
            {opsState !== 'all' ? `, state ${opsState}` : ''}
            {opsCellId !== 'all' ? `, cell ${opsCellId}` : ''}).
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E9E1D3] text-[10px] uppercase tracking-wider text-[#5B687A]">
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Location / Cell</th>
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 pr-3">Classification</th>
                    <th className="py-2 pr-3">Reported</th>
                    <th className="py-2 text-right">Context / Command</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E1D3]/60">
                  {filteredOperationalIncidents.slice(0, 12).map((inc) => {
                    const isSelected = selectedOpsIncident?.id === inc.id;
                    return (
                      <tr
                        key={inc.id}
                        onClick={() =>
                          setSelectedOpsIncidentId(isSelected ? null : inc.id)
                        }
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#0F766E]/10' : 'hover:bg-[#F6F1E7]'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-mono font-bold text-[#0B3B3C]">{inc.code}</td>
                        <td className="py-2.5 pr-3 capitalize">{inc.category.replace('_', ' ')}</td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-[#1B2A38]">{inc.siteName}</span>
                          <span className="text-[#5B687A]"> · {inc.cellId}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="px-2 py-0.5 rounded-full bg-white border border-[#E9E1D3] text-[10px] font-semibold">
                            {inc.state.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <DataTrustBadge
                            classification={inc.isSimulated ? 'simulated_demo' : 'live_measured'}
                            compact
                            source={inc.isSimulated ? 'Simulated Drill' : 'Live SOS Record'}
                          />
                        </td>
                        <td className="py-2.5 pr-3 text-[#5B687A]">
                          {formatReadingAge(inc.createdAt).ageLabel}
                        </td>
                        <td className="py-2.5 text-right space-x-2 whitespace-nowrap">
                          <span className="text-[11px] font-semibold text-[#5B687A]">
                            {isSelected ? 'Hide details' : 'Details'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/command?incidentId=${inc.id}`);
                            }}
                            className="font-semibold text-[#0F766E] hover:underline cursor-pointer"
                          >
                            Console →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Inline Contextual Incident Drawer: Incident <-> Lifeguard <-> Medical Handoff <-> Timeline */}
            {selectedOpsIncident && (
              <div className="rounded-xl border border-[#0F766E]/30 bg-white p-4 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E9E1D3]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-[#0B3B3C]">
                      {selectedOpsIncident.code}
                    </span>
                    <span className="text-xs font-semibold text-[#1B2A38]">
                      {selectedOpsIncident.siteName} · {selectedOpsIncident.cellId}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#F6F1E7] border border-[#E9E1D3] text-[10px] font-semibold">
                      {selectedOpsIncident.state.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/map?incidentId=${selectedOpsIncident.id}&layer=incident&returnTo=${encodeURIComponent(
                            '/incidents'
                          )}`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FBF8F3] border border-[#E9E1D3] text-[#1B2A38] text-[11px] font-semibold hover:border-[#0F766E]/40 cursor-pointer"
                    >
                      <MapPin className="w-3 h-3 text-[#0F766E]" />
                      <span>View on Risk Map</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/command?incidentId=${selectedOpsIncident.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F766E] text-white text-[11px] font-semibold hover:bg-[#0B5A54] cursor-pointer"
                    >
                      <ShieldAlert className="w-3 h-3" />
                      <span>Live Console</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/responders?incidentId=${selectedOpsIncident.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FBF8F3] border border-[#E9E1D3] text-[#1B2A38] text-[11px] font-semibold hover:border-[#0F766E]/40 cursor-pointer"
                    >
                      <Users className="w-3 h-3 text-[#0F766E]" />
                      <span>Assigned Lifeguards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/medical-handoff?incidentId=${selectedOpsIncident.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FBF8F3] border border-[#E9E1D3] text-[#1B2A38] text-[11px] font-semibold hover:border-[#0F766E]/40 cursor-pointer"
                    >
                      <Stethoscope className="w-3 h-3 text-[#0F766E]" />
                      <span>Medical Handoff</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/messages')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FBF8F3] border border-[#E9E1D3] text-[#1B2A38] text-[11px] font-semibold hover:border-[#0F766E]/40 cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3 text-[#0F766E]" />
                      <span>War Room Comms</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOpsIncidentId(null)}
                      aria-label="Close incident context"
                      className="p-1 rounded-lg text-[#5B687A] hover:text-[#1B2A38] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-[#5B687A]">
                      Assigned Responders &amp; Summary
                    </div>
                    <p className="text-[#1B2A38] leading-relaxed">
                      {selectedOpsIncident.description || 'Emergency SOS alert logged.'}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedOpsIncident.assignedResponderNames.length > 0 ? (
                        selectedOpsIncident.assignedResponderNames.map((name) => (
                          <span
                            key={name}
                            className="px-2 py-0.5 rounded-full bg-[#0F766E]/10 text-[#0B3B3C] text-[11px] font-semibold"
                          >
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#5B687A]">
                          No responder assigned yet (awaiting dispatcher verification).
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <EmergencyResponseTimeline incident={selectedOpsIncident} compact />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-[#5B687A] font-semibold">Total Logged Incidents</div>
          <div className="text-2xl font-serif-heading font-bold text-[#1B2A38] mt-1">
            {totalCount}
          </div>
          <div className="text-[11px] text-[#5B687A] mt-0.5">Across all regional sites</div>
        </div>

        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-[#5B687A] font-semibold">High / Severe Threats</div>
          <div className="text-2xl font-serif-heading font-bold text-[#D65A4A] mt-1">
            {severeCount}
          </div>
          <div className="text-[11px] text-[#5B687A] mt-0.5">Critical risk occurrences</div>
        </div>

        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-[#5B687A] font-semibold">Active Lifeguard Rescues</div>
          <div className="text-2xl font-serif-heading font-bold text-[#2F855A] mt-1">
            {rescueCount}
          </div>
          <div className="text-[11px] text-[#5B687A] mt-0.5">Successful beach interventions</div>
        </div>

        <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-[#5B687A] font-semibold">Community Reports</div>
          <div className="text-2xl font-serif-heading font-bold text-[#0F766E] mt-1">
            {communityCount}
          </div>
          <div className="text-[11px] text-[#5B687A] mt-0.5">Citizen crowd-sourced telemetry</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B687A]" />
            <input
              type="text"
              placeholder="Search by title, location or keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-white border border-[#E9E1D3] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0F766E] text-[#1B2A38]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
            >
              <option value="all">All Incident Types</option>
              <option value="drowning">Drowning / Submersion</option>
              <option value="rescue">Lifeguard Rescue</option>
              <option value="rip_current">Rip Current Surge</option>
              <option value="capsizing">Capsizing / Boat</option>
              <option value="contamination">Contamination</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
            >
              <option value="all">All Severities</option>
              <option value="Severe">Severe</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
            >
              <option value="all">All Sources</option>
              <option value="gdelt">GDELT Global News</option>
              <option value="community">Citizen Community</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-[#5B687A] pt-2 border-t border-[#E9E1D3] flex items-center justify-between">
          <span>
            Showing <strong>{filteredIncidents.length}</strong> of {incidents.length} incidents
          </span>
          <span className="flex items-center gap-1.5">
            <ProvenanceTip
              source="GDELT 2.0 API & Local Incident Ledger"
              type="observed"
              confidence={92}
            />
            <span>GDELT 3-month lookback window</span>
          </span>
        </div>
      </div>

      {/* Incident Cards Feed */}
      <div className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-8 text-center text-[#5B687A] text-sm">
            No incidents found matching the specified filter criteria.
          </div>
        ) : (
          filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-5 shadow-xs hover:shadow-md transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-white border border-[#E9E1D3] text-[#1B2A38]">
                    {inc.type.replace('_', ' ')}
                  </span>
                  <TierBadge tier={inc.severity} size="sm" />
                  {inc.isCommunityReported && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#0F766E]/10 text-[#0F766E]">
                      Community Verified
                    </span>
                  )}
                  <span className="text-xs text-[#5B687A] flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {inc.date}
                  </span>
                </div>

                <h3 className="font-serif-heading text-base font-bold text-[#1B2A38]">
                  {inc.title}
                </h3>

                <div className="text-xs text-[#5B687A] flex flex-wrap items-center gap-3">
                  <span>Location: <strong className="text-[#1B2A38]">{inc.locationName || 'Coastal Area'}</strong></span>
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-[#0F766E]" />
                    Domain: <strong className="font-mono text-[#0F766E]">{inc.domain || inc.source}</strong>
                  </span>
                  {inc.isVerified && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Confirmed Verified
                    </span>
                  )}
                </div>

                {inc.notes && (
                  <p className="text-xs text-[#5B687A] pt-1 leading-relaxed">{inc.notes}</p>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleVerifyIncident(inc.id)}
                  title={inc.isVerified ? 'Mark as unverified' : 'Mark incident as verified'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition shadow-xs ${
                    inc.isVerified
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                      : 'bg-white border-[#E9E1D3] text-[#5B687A] hover:border-[#0F766E] hover:text-[#0F766E]'
                  }`}
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${inc.isVerified ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{inc.isVerified ? 'Verified' : 'Verify'}</span>
                </button>

                {inc.url && (
                  <a
                    href={inc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white border border-[#E9E1D3] text-[#0F766E] hover:border-[#0F766E] transition shadow-xs"
                  >
                    <span>Source Article</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Report Incident Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#E9E1D3] pb-3">
              <h2 className="font-serif-heading text-xl font-bold text-[#0B3B3C]">
                Submit Citizen Safety Incident
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-[#1B2A38]">Incident Headline</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swimmer rescued from rip current near southern pier"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1B2A38]">Water Body</label>
                  <select
                    value={formSiteId}
                    onChange={(e) => setFormSiteId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1B2A38]">Incident Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#1B2A38]">Incident Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
                  >
                    <option value="rescue">Lifeguard Rescue</option>
                    <option value="rip_current">Rip Current Surge</option>
                    <option value="drowning">Drowning / Submersion</option>
                    <option value="capsizing">Capsizing / Boat</option>
                    <option value="contamination">Contamination</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#1B2A38]">Severity Level</label>
                  <select
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
                  >
                    <option value="Low">Low (Precautionary)</option>
                    <option value="Medium">Medium (Injury / Minor)</option>
                    <option value="High">High (Critical Rescue)</option>
                    <option value="Severe">Severe (Fatal / Emergency)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1B2A38]">Reference Link / URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://news-source.com/article"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#1B2A38]">Description & Environmental Context</label>
                <textarea
                  rows={3}
                  placeholder="Details regarding surf conditions, tide height, or emergency personnel response..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5B687A] hover:bg-[#E9E1D3]/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs"
                >
                  Submit Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
