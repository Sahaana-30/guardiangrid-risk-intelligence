import React, { useState } from 'react';
import { FlaskConical, Play, Trash2 } from 'lucide-react';
import type { EmergencyCategory, EmergencyLanguage, RescueCell } from '../../types/emergency';

interface DigitalTwinDrillBarProps {
  cells: RescueCell[];
  simulatedCount: number;
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
  onTrigger,
  onClearSimulated,
}) => {
  const [category, setCategory] = useState<EmergencyCategory>('drowning');
  const [cellId, setCellId] = useState<string>(cells[1]?.id || 'MARINA-C2');
  const [language, setLanguage] = useState<EmergencyLanguage>('en');
  const [busy, setBusy] = useState(false);

  const handleRun = async () => {
    setBusy(true);
    try {
      await onTrigger({ category, cellId, language });
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

  return (
    <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <FlaskConical className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-bold text-[#0B3B3C]">Rescue Digital Twin Drill</span>
          <span className="text-[#5B687A]">
            {' '}
            · Simulated training alerts are strictly labeled and separated from real public SOS reports.
          </span>
        </div>
      </div>

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
          {(cells.length > 0 ? cells : [{ id: 'MARINA-C2', siteName: 'Marina Beach' }]).map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0B3B3C] text-white text-xs font-semibold disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Trigger Simulated SOS</span>
        </button>

        {simulatedCount > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleClear()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E9E1D3] bg-white text-xs font-medium text-[#5B687A] hover:text-[#D65A4A]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Drills ({simulatedCount})</span>
          </button>
        )}
      </div>
    </div>
  );
};
