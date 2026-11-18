import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Phone, Radio, QrCode, MapPin } from 'lucide-react';
import type { RescueCell } from '../../types/emergency';

interface BeachSafetyCardModalProps {
  open: boolean;
  onClose: () => void;
  cells: RescueCell[];
}

export const BeachSafetyCardModal: React.FC<BeachSafetyCardModalProps> = ({
  open,
  onClose,
  cells,
}) => {
  const [selectedCellId, setSelectedCellId] = useState<string>(cells[0]?.id || 'MARINA-C2');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const cell = cells.find((c) => c.id === selectedCellId) || cells[0];
  if (!cell) return null;

  const baseOrigin =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const sosUrl = `${baseOrigin}#/sos/${cell.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sosUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked in sandboxed iframe
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#1B2A38]/50 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E9E1D3] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#0B3B3C]">
              Rescue Cell QR & Safety Card
            </h2>
            <p className="text-xs text-[#5B687A] mt-0.5">
              Share or print cell-specific Public SOS access links for coastal signage.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label
              htmlFor="qr-cell-select"
              className="block text-xs font-semibold text-[#1B2A38] mb-1.5"
            >
              Select Beach Rescue Cell
            </label>
            <select
              id="qr-cell-select"
              value={cell.id}
              onChange={(e) => setSelectedCellId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E9E1D3] bg-white text-xs text-[#1B2A38] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/30"
            >
              {cells.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-[#E9E1D3] rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0F766E]">
                  {cell.siteName} · {cell.id}
                </p>
                <h3 className="text-base font-bold text-[#1B2A38] mt-1">
                  {cell.label}
                </h3>
                <p className="text-xs text-[#5B687A] mt-0.5">{cell.labelTa}</p>
              </div>
              <div className="w-16 h-16 rounded-xl bg-[#0B3B3C] text-white flex flex-col items-center justify-center shrink-0">
                <QrCode className="w-8 h-8" />
                <span className="text-[9px] font-mono mt-0.5">{cell.id}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E9E1D3]/70 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#5B687A]">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                <span>{cell.towerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                <span>{cell.vhfChannel}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E9E1D3]/70 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wider text-[#5B687A] font-semibold">
                  Public SOS Cell URL
                </span>
                <p className="text-xs font-mono text-[#1B2A38] truncate mt-0.5">{sosUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E9E1D3] bg-[#FBF8F3] text-xs font-medium text-[#1B2A38] hover:border-[#0F766E]/40 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#0F766E]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>

            <div className="pt-3 border-t border-[#E9E1D3]/70 flex items-center justify-between text-xs">
              <span className="text-[#D65A4A] font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                India National Emergency: 112
              </span>
              <a
                href={`#/sos/${cell.id}`}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 font-semibold text-[#0F766E] hover:underline"
              >
                <span>Open Public SOS</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
