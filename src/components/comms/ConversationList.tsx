import React, { useMemo, useState } from 'react';
import {
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNexconn } from '../../context/NexconnContext';
import type { CommsChannel } from '../../types/comms';

interface ConversationListProps {
  onOpenNewGroup: () => void;
  onSelectDone?: () => void;
}

function formatShortTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ConversationList: React.FC<ConversationListProps> = ({
  onOpenNewGroup,
  onSelectDone,
}) => {
  const {
    directory,
    activeOperator,
    connectionStatus,
    channels,
    selectedChannelKey,
    onlineMap,
    isLoadingChannels,
    switchOperator,
    reconnect,
    selectChannel,
    startDirectChat,
    startCall,
  } = useNexconn();

  const [search, setSearch] = useState('');
  const [switching, setSwitching] = useState(false);

  const otherOperators = useMemo(
    () => directory.filter((op) => op.userId !== activeOperator?.userId),
    [directory, activeOperator]
  );

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q) ||
        c.channelId.toLowerCase().includes(q)
    );
  }, [channels, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return otherOperators;
    return otherOperators.filter(
      (op) =>
        op.name.toLowerCase().includes(q) ||
        op.role.toLowerCase().includes(q) ||
        op.station.toLowerCase().includes(q)
    );
  }, [otherOperators, search]);

  const handleChannelClick = async (channel: CommsChannel) => {
    await selectChannel(channel.channelType, channel.channelId);
    onSelectDone?.();
  };

  const handleOperatorSwitch = async (operatorId: string) => {
    if (!operatorId || operatorId === activeOperator?.userId) return;
    setSwitching(true);
    try {
      await switchOperator(operatorId);
    } finally {
      setSwitching(false);
    }
  };

  const statusBadge = () => {
    if (connectionStatus === 'connected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#0E9F6E]/10 text-[#0E9F6E]">
          <Wifi className="w-3 h-3" />
          Online
        </span>
      );
    }
    if (connectionStatus === 'connecting') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Connecting
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D65A4A]/10 text-[#D65A4A]">
        <WifiOff className="w-3 h-3" />
        {connectionStatus === 'error' ? 'Auth Error' : 'Offline'}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#FBF8F3] border-r border-[#E9E1D3]">
      {/* Demo Identity Switcher & Connection Bar */}
      <div className="p-4 border-b border-[#E9E1D3] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-serif-heading text-lg font-bold text-[#0B3B3C] leading-tight">
              Field Comms
            </h2>
            <p className="text-[11px] text-[#5B687A]">
              Real-time dispatch & responder dispatch
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {statusBadge()}
            {connectionStatus !== 'connected' && (
              <button
                type="button"
                onClick={() => void reconnect()}
                title="Retry connection"
                className="p-1.5 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Active Operator Station Selector */}
        {directory.length > 0 && (
          <div className="bg-[#F6F1E7] border border-[#E9E1D3] rounded-xl p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B687A] flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-[#0F766E]" />
                Operator Station (Dev)
              </span>
              {switching && <span className="text-[10px] text-[#0F766E]">Switching...</span>}
            </div>
            <select
              value={activeOperator?.userId || ''}
              disabled={switching}
              onChange={(e) => void handleOperatorSwitch(e.target.value)}
              aria-label="Select active operator station"
              className="w-full text-xs font-medium text-[#1B2A38] bg-white border border-[#E9E1D3] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#0F766E]"
            >
              {directory.map((op) => (
                <option key={op.userId} value={op.userId}>
                  {op.name} ({op.station})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Search + Create Group */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#5B687A] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels or team..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E9E1D3] rounded-xl text-[#1B2A38] placeholder:text-[#5B687A]/60 focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          <button
            type="button"
            onClick={onOpenNewGroup}
            disabled={connectionStatus !== 'connected'}
            title="Create group channel"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B3B3C] transition-colors disabled:opacity-45 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Group</span>
          </button>
        </div>
      </div>

      {/* Scrollable Conversations & Contacts */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E9E1D3]/60">
        {/* Conversations Section */}
        <div className="p-2.5">
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B687A]">
              Conversations ({filteredChannels.length})
            </span>
            {isLoadingChannels && (
              <RefreshCw className="w-3 h-3 text-[#0F766E] animate-spin" />
            )}
          </div>

          {filteredChannels.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-[#5B687A]">
              No active conversations yet. Select a team operator below to start messaging.
            </div>
          ) : (
            <div className="space-y-1 mt-1">
              {filteredChannels.map((ch) => {
                const isSelected = ch.key === selectedChannelKey;
                const isOnline =
                  ch.channelType === 'direct' ? Boolean(onlineMap[ch.channelId]) : false;

                return (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => void handleChannelClick(ch)}
                    className={`w-full text-left p-2.5 rounded-xl flex items-start gap-2.5 transition-all ${
                      isSelected
                        ? 'bg-[#0F766E] text-white shadow-xs'
                        : 'hover:bg-[#E9E1D3]/45 text-[#1B2A38]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : ch.channelType === 'group'
                              ? 'bg-[#0B3B3C]/10 text-[#0B3B3C]'
                              : 'bg-[#0F766E]/12 text-[#0F766E]'
                        }`}
                      >
                        {ch.channelType === 'group' ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          ch.initials
                        )}
                      </div>
                      {ch.channelType === 'direct' && (
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ${
                            isSelected ? 'ring-[#0F766E]' : 'ring-[#FBF8F3]'
                          } ${isOnline ? 'bg-[#0E9F6E]' : 'bg-slate-300'}`}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{ch.name}</span>
                        <span
                          className={`text-[10px] shrink-0 ${
                            isSelected ? 'text-white/75' : 'text-[#5B687A]'
                          }`}
                        >
                          {formatShortTime(ch.lastMessageTime)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span
                          className={`text-[11px] truncate ${
                            isSelected ? 'text-white/85' : 'text-[#5B687A]'
                          }`}
                        >
                          {ch.lastMessagePreview}
                        </span>
                        {ch.unreadCount > 0 && !isSelected && (
                          <span className="px-1.5 py-0.5 min-w-[18px] text-center rounded-full bg-[#D65A4A] text-white text-[10px] font-bold leading-none">
                            {ch.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Team Contacts Section */}
        <div className="p-2.5">
          <div className="px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5B687A]">
              Response Team Directory
            </span>
          </div>
          <div className="space-y-1 mt-1">
            {filteredContacts.map((op) => {
              const isOnline = Boolean(onlineMap[op.userId]);
              return (
                <div
                  key={op.userId}
                  className="p-2 rounded-xl hover:bg-[#E9E1D3]/40 flex items-center justify-between gap-2 transition-colors"
                >
                  <button
                    type="button"
                    onClick={async () => {
                      await startDirectChat(op.userId);
                      onSelectDone?.();
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full bg-[#0F766E]/12 text-[#0F766E] text-[11px] font-bold flex items-center justify-center">
                        {op.initials}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#FBF8F3] ${
                          isOnline ? 'bg-[#0E9F6E]' : 'bg-slate-300'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#1B2A38] truncate">
                        {op.name}
                      </div>
                      <div className="text-[10px] text-[#5B687A] truncate">
                        {op.role} • {isOnline ? 'Online' : 'Offline'}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={connectionStatus !== 'connected'}
                      onClick={() => void startCall(op.userId, 'audio')}
                      title={`Audio call ${op.name}`}
                      className="p-1.5 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] hover:border-[#0F766E]/40 transition-colors disabled:opacity-40"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={connectionStatus !== 'connected'}
                      onClick={() => void startCall(op.userId, 'video')}
                      title={`Video call ${op.name}`}
                      className="p-1.5 rounded-lg border border-[#E9E1D3] bg-white text-[#5B687A] hover:text-[#0F766E] hover:border-[#0F766E]/40 transition-colors disabled:opacity-40"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
