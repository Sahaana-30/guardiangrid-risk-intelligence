import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  FlaskConical,
  Play,
  Radio,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  EmergencyCategory,
  EmergencyIncident,
  EmergencyLanguage,
  RescueCell,
} from '../../types/emergency';

interface DigitalTwinDrillBarProps {
  cells: RescueCell[];
  simulatedCount: number;
  activeIncident?: EmergencyIncident | null;
  nexconnConnected?: boolean;
  simulatedAlertCount?: number;
  initialShowDemoGuide?: boolean;
  onTrigger: (params: {
    category: EmergencyCategory;
    cellId: string;
    language: EmergencyLanguage;
  }) => Promise<void>;
  onClearSimulated: () => Promise<void>;
}

export const DigitalTwinDrillBar: React.FC<DigitalTwinDrillBarProps> = ({
  cells,
  simulatedCount,
  activeIncident,
  nexconnConnected = false,
  simulatedAlertCount = 0,
  initialShowDemoGuide = false,
  onTrigger,
  onClearSimulated,
}) => {
  const [category, setCategory] = useState<EmergencyCategory>('drowning');
  const [cellId, setCellId] = useState<string>(cells[1]?.id || 'MARINA-C2');
  const [language, setLanguage] = useState<EmergencyLanguage>('en');
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState<boolean>(initialShowDemoGuide);
  const [showDemoGuide, setShowDemoGuide] = useState(initialShowDemoGuide);

  useEffect(() => {
    if (initialShowDemoGuide) {
      setPanelOpen(true);
      setShowDemoGuide(true);
    }
  }, [initialShowDemoGuide]);

  const handleRun = async () => {
    setBusy(true);
    try {
      await onTrigger({ category, cellId, language });
      setShowDemoGuide(true);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await onClearSimulated();
    } finally {
      setBusy(false);
    }
  };

  const simInc = activeIncident?.isSimulated ? activeIncident : null;

  const demoSteps = [
    {
      num: 1,
      label: 'Elevated Coastal Risk Context',
      done: true,
      note: 'Live Open-Meteo hazard badge visible in Command Center',
    },
    {
      num: 2,
      label: 'Simulated Drowning SOS Submitted',
      done: Boolean(simInc),
      note: simInc ? `${simInc.code} persisted as SIMULATED` : 'Click "Run Simulation Drill" above',
    },
    {
      num: 3,
      label: 'Automatic Simulated Notifications',
      done: Boolean(simInc && (simulatedAlertCount > 0 || simInc.auditTrail.length > 0)),
      note: 'Logged as SIMULATED (no live SMS/WhatsApp sent)',
    },
    {
      num: 4,
      label: 'Incident in Command Center',
      done: Boolean(simInc),
      note: 'Visible in Emergency Queue with SIMULATED badge',
    },
    {
      num: 5,
      label: 'Human Dispatcher Verification',
      done: Boolean(simInc && simInc.state !== 'UNVERIFIED' && simInc.state !== 'REJECTED'),
      note: 'Verify incident via Human Verification Gate below',
    },
    {
      num: 6,
      label: 'Nexconn War Room Communication',
      done: Boolean(simInc && simInc.nexconnGroupLive && nexconnConnected),
      note: nexconnConnected
        ? 'Nexconn SDK live — send SOS Card, chat, or audio/video call'
        : 'Connect Nexconn session to send live War Room messages (never fabricated)',
    },
    {
      num: 7,
      label: 'Responder Assignment',
      done: Boolean(simInc && simInc.assignedResponderIds.length > 0),
      note: 'Assign nearest ranked lifeguard below',
    },
    {
      num: 8,
      label: 'Field Kit Status Updates',
      done: Boolean(simInc && (simInc.enRouteAt || simInc.onSceneAt)),
      note: 'Update En Route / On Scene via Command Controls or /field-kit',
    },
    {
      num: 9,
      label: 'Medical SBAR Handoff',
      done: Boolean(
        simInc &&
          (simInc.state === 'MEDICAL_HANDOFF' ||
            simInc.auditTrail.some((e) => e.action.includes('MEDICAL')))
      ),
      note: 'Generate & review SBAR handoff card below',
    },
    {
      num: 10,
      label: 'Incident Resolution',
      done: Boolean(simInc && simInc.state === 'RESOLVED'),
      note: 'Close & resolve incident with closure summary',
    },
    {
      num: 11,
      label: 'Timeline & Performance Summary',
      done: Boolean(simInc && simInc.state === 'RESOLVED'),
      note: 'Review 11-stage timeline & Rescue Performance Drill View',
    },
  ];

  const completedDemoSteps = demoSteps.filter((s) => s.done).length;

  return (
    <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <FlaskConical className="w-4 h-4 text-[#0F766E] shrink-0" />
          <div className="text-xs flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#0B3B3C]">
              Training &amp; Simulation Drills (Isolated Sandbox)
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
              SIMULATED ONLY
            </span>
            {simulatedCount > 0 && (
              <span className="text-[#5B687A] font-medium">
                · {simulatedCount} active drill{simulatedCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {simulatedCount > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleClear()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E9E1D3] bg-white text-xs font-medium text-[#5B687A] hover:text-[#D65A4A] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Drills ({simulatedCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#E9E1D3] bg-white hover:border-[#0F766E]/40 text-xs font-semibold text-[#0B3B3C] cursor-pointer"
          >
            <span>{panelOpen ? 'Hide Sandbox Controls' : 'Open Training Sandbox'}</span>
            {panelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {panelOpen && (
        <div className="pt-2.5 border-t border-[#E9E1D3] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <span className="text-xs text-[#5B687A]">
              Simulated drills are strictly isolated from real operational metrics and never trigger live SMS/WhatsApp dispatches.
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Simulated category"
                value={category}
                onChange={(e) => setCategory(e.target.value as EmergencyCategory)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E9E1D3] bg-white text-xs text-[#1B2A38]"
              >
                <option value="drowning">Drowning Drill</option>
                <option value="swept_away">Swept-Away Drill</option>
                <option value="missing_person">Lost Child Drill</option>
                <option value="medical">Medical Drill</option>
              </select>

              <select
                aria-label="Simulated rescue cell"
                value={cellId}
                onChange={(e) => setCellId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E9E1D3] bg-white text-xs text-[#1B2A38]"
              >
                {(cells.length > 0 ? cells : [{ id: 'MARINA-C2', siteName: 'Marina Beach' }]).map(
                  (c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  )
                )}
              </select>

              <select
                aria-label="Simulated language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as EmergencyLanguage)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E9E1D3] bg-white text-xs text-[#1B2A38]"
              >
                <option value="en">English</option>
                <option value="ta">Tamil</option>
              </select>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRun()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Trigger Simulated SOS</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDemoGuide((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#0F766E]/30 bg-white text-xs font-semibold text-[#0B3B3C] hover:bg-[#0F766E]/5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>Drill Walkthrough ({completedDemoSteps}/11)</span>
                {showDemoGuide ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Collapsible 11-Step Training Drill Walkthrough */}
          {showDemoGuide && (
            <div className="pt-3 border-t border-[#E9E1D3] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5B687A]">
                <span>
                  Live progress reflects actual persisted state of the selected{' '}
                  <strong className="text-amber-800">SIMULATED</strong> incident.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {!simInc && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRun()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3 h-3" />
                      <span>Run Simulation Drill</span>
                    </button>
                  )}
              <a
                href="#/field-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#0F766E]/40 bg-white hover:bg-[#0F766E]/5 text-[#0B3B3C] text-[11px] font-semibold"
              >
                <Radio className="w-3 h-3 text-[#0F766E]" />
                <span>Open Responder Field Kit (2nd Tab)</span>
                <ExternalLink className="w-3 h-3 text-[#5B687A]" />
              </a>
              <span className="font-semibold text-[#0B3B3C]">
                {completedDemoSteps} of 11 steps verified
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {demoSteps.map((s) => (
              <div
                key={s.num}
                className={`rounded-xl border px-2.5 py-2 text-[11px] flex items-start gap-2 ${
                  s.done
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-white border-[#E9E1D3]/80'
                }`}
              >
                {s.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E] shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-[#94A3B8] shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-[#1B2A38] leading-snug">
                    {s.num}. {s.label}
                  </div>
                  <div className="text-[10px] text-[#5B687A] mt-0.5 leading-snug">{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};
