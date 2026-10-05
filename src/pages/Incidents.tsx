import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Incident } from '../types';
import { TierBadge } from '../components/TierBadge';
import { ProvenanceTip } from '../components/ProvenanceTip';
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
} from 'lucide-react';

export const Incidents: React.FC = () => {
  const { currentCity, sites, incidents, reportIncident, toggleVerifyIncident } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

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
          <div className="flex items-center gap-2">
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
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0F766E] text-white hover:bg-[#0B5A54] transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Report Incident</span>
          </button>
        </div>
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
