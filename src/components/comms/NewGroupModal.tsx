import React, { useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import { useNexconn } from '../../context/NexconnContext';

interface NewGroupModalProps {
  open: boolean;
  onClose: () => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({ open, onClose }) => {
  const { directory, activeOperator, createGroup } = useNexconn();
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const availableMembers = directory.filter((op) => op.userId !== activeOperator?.userId);

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Enter a group channel name.');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Select at least one team member to invite.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createGroup(groupName, selectedIds);
      setGroupName('');
      setSelectedIds([]);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Unable to create group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E9E1D3] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif-heading text-base font-bold text-[#0B3B3C]">
                Create Response Group
              </h3>
              <p className="text-[11px] text-[#5B687A]">
                Coordinate multi-station alerts and sector dispatches
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5B687A] hover:bg-[#E9E1D3]/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleCreate(e)} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1B2A38] mb-1">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Marina Sector Flood Dispatch"
              className="w-full px-3 py-2 text-xs bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] focus:outline-none focus:border-[#0F766E]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1B2A38] mb-1.5">
              Invite Team Operators
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {availableMembers.map((op) => {
                const checked = selectedIds.includes(op.userId);
                return (
                  <label
                    key={op.userId}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'bg-[#0F766E]/8 border-[#0F766E]'
                        : 'bg-white border-[#E9E1D3] hover:bg-[#F6F1E7]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(op.userId)}
                      className="accent-[#0F766E]"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1B2A38] truncate">{op.name}</div>
                      <div className="text-[10px] text-[#5B687A] truncate">
                        {op.role} • {op.station}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {error && <div className="text-xs text-[#D65A4A] font-medium">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#E9E1D3] bg-white text-xs font-semibold text-[#5B687A] hover:text-[#1B2A38]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B3B3C] disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Create Group</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
