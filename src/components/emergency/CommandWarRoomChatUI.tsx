import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FileHeart,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldAlert,
  Users,
  Video,
  WifiOff,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import { useNexconn } from '../../context/NexconnContext';
import { useEmergency } from '../../context/EmergencyContext';
import { joinIncidentNexconnGroupApi } from '../../services/emergencyApi';
import { fetchMedicalHandoffsApi } from '../../services/medicalHandoffApi';
import {
  ensureNexconnChatUIReady,
  openIncidentGroupInChatUI,
  sendAiSbarHandoffCardToGroup,
  sendSosTelemetryCardToGroup,
  syncChatUIProfileRegistry,
} from '../../services/nexconnChatUI';
import type { EmergencyIncident } from '../../types/emergency';

interface CommandWarRoomChatUIProps {
  incident: EmergencyIncident;
  onProvisionGroup: () => Promise<void>;
  onStartVideoCall: () => Promise<void>;
  onStartAudioCall: () => Promise<void>;
  onOpenFullMessages?: () => void;
}

type ChannelSyncState = 'idle' | 'opening' | 'ready' | 'error';

export const CommandWarRoomChatUI: React.FC<CommandWarRoomChatUIProps> = ({
  incident,
  onProvisionGroup,
  onStartVideoCall,
  onStartAudioCall,
  onOpenFullMessages,
}) => {
  const { connectionStatus, connectionError, directory, activeOperator, reconnect } = useNexconn();
  const { incidents, responders } = useEmergency();

  const [chatUIReady, setChatUIReady] = useState(false);
  const [channelState, setChannelState] = useState<ChannelSyncState>('idle');
  const [chatUIError, setChatUIError] = useState<string | null>(null);
  const [showChannelList, setShowChannelList] = useState(false);
  const [cardBusy, setCardBusy] = useState<'sos' | 'sbar' | null>(null);
  const [cardStatus, setCardStatus] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Keep ServiceHooks profile registry synced with live GuardianGrid directory & incidents
  useEffect(() => {
    syncChatUIProfileRegistry({
      operators: directory,
      responders,
      incidents,
    });
  }, [directory, responders, incidents]);

  // Note: Do NOT destroy NCChatUIApplication when CommandWarRoomChatUI unmounts.
  // NexconnContext owns NCChatUIApplication teardown when NCEngine disconnects or switches operator,
  // preserving ChatUI's internal connection-status & channel-sync handlers across route changes.

  // Sync & open the incident channel once NCEngine is connected
  useEffect(() => {
    if (connectionStatus !== 'connected') {
      setChatUIReady(false);
      setChannelState('idle');
      setChatUIError(null);
      return;
    }

    const { app, error } = ensureNexconnChatUIReady();
    if (!app) {
      setChatUIError(error || 'Unable to initialize Nexconn ChatUI.');
      setChatUIReady(false);
      setChannelState('error');
      return;
    }

    setChatUIReady(true);
    setChatUIError(null);

    if (!incident.nexconnGroupId) {
      setChannelState('idle');
      return;
    }

    let cancelled = false;
    const groupId = incident.nexconnGroupId;
    setChannelState('opening');

    void (async () => {
      // Ensure the connected operator is a member of this tenant's incident group before opening channel history
      try {
        await joinIncidentNexconnGroupApi(incident.id, activeOperator?.userId);
      } catch {
        // Non-fatal: operator may already be a member or group sync may handle membership
      }
      if (cancelled) return;

      const res = await openIncidentGroupInChatUI(groupId, {
        maxWaitMs: 6500,
        isCancelled: () => cancelled,
      });
      if (cancelled) return;

      if (!res.ok) {
        setChannelState('error');
        setChatUIError(res.error || 'Unable to open Nexconn War Room channel.');
      } else {
        setChannelState('ready');
        setChatUIError(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, incident.id, incident.nexconnGroupId, activeOperator?.userId, retryNonce]);

  const handlePostSosCard = async () => {
    if (!incident.nexconnGroupId) return;
    setCardBusy('sos');
    setCardStatus(null);
    try {
      const assignedNames = incident.assignedResponderIds.map((id) => {
        const found = responders.find((r) => r.id === id);
        return found ? `${found.name} (${found.radioCallsign})` : id;
      });
      const res = await sendSosTelemetryCardToGroup(incident.nexconnGroupId, {
        incidentId: incident.id,
        incidentCode: incident.code,
        priority:
          incident.category === 'drowning' || incident.category === 'swept_away'
            ? 'P1 CRITICAL'
            : 'P1 URGENT',
        category: incident.category,
        status: incident.state,
        cellId: incident.cellId,
        cellLabel: incident.cellLabel,
        siteName: incident.siteName,
        lat: incident.lat,
        lon: incident.lon,
        assignedResponders: assignedNames,
        isSimulated: incident.isSimulated,
        reportedAt: incident.createdAt,
      });
      if (!res.ok) {
        setCardStatus(res.error || 'Unable to send SOS Telemetry Card.');
      } else {
        setCardStatus('SOS Telemetry Card posted to War Room.');
      }
    } finally {
      setCardBusy(null);
    }
  };

  const handlePostSbarCard = async () => {
    if (!incident.nexconnGroupId) return;
    setCardBusy('sbar');
    setCardStatus(null);
    try {
      const handoffData = await fetchMedicalHandoffsApi(incident.id);
      const latest = handoffData.reports?.[0];
      if (!latest) {
        setCardStatus(
          'No AI Medical SBAR report exists for this incident yet. Generate one in the Medical Handoff card first.'
        );
        return;
      }
      const res = await sendAiSbarHandoffCardToGroup(incident.nexconnGroupId, {
        incidentId: incident.id,
        incidentCode: incident.code,
        version: latest.version,
        approvalStatus: latest.status,
        severity: latest.payload.severity,
        situationSummary: latest.payload.english.situation.whatHappened,
        recommendationSummary:
          latest.payload.english.recommendation.suggestedCoordination?.[0] ||
          latest.payload.english.recommendation.immediateHandoffInformation?.[0] ||
          'Verify clinical findings with receiving medical team.',
        authorizedBy: latest.status === 'APPROVED' ? latest.reviewedByName || null : null,
        medicalDisclaimer: latest.payload.english.medicalDisclaimer,
        generatedAt: latest.generatedAt,
      });
      if (!res.ok) {
        setCardStatus(res.error || 'Unable to send AI SBAR Medical Handoff Card.');
      } else {
        setCardStatus(
          `AI SBAR Handoff Card (v${latest.version} · ${latest.status}) posted to War Room.`
        );
      }
    } catch (err: any) {
      setCardStatus(err?.message || 'Unable to load authorized medical handoff.');
    } finally {
      setCardBusy(null);
    }
  };

  const statusBadge = (() => {
    if (connectionStatus === 'connecting') {
      return {
        label: 'Connecting...',
        cls: 'bg-sky-500/20 text-sky-200 border border-sky-400/30',
      };
    }
    if (connectionStatus === 'error') {
      return {
        label: 'Connection Error',
        cls: 'bg-rose-500/25 text-rose-100 border border-rose-400/40',
      };
    }
    if (connectionStatus !== 'connected') {
      return {
        label: 'Disconnected',
        cls: 'bg-amber-500/20 text-amber-200 border border-amber-400/30',
      };
    }
    if (channelState === 'opening') {
      return {
        label: 'Syncing Room...',
        cls: 'bg-sky-500/20 text-sky-200 border border-sky-400/30',
      };
    }
    if (channelState === 'error') {
      return {
        label: 'Channel Sync Error',
        cls: 'bg-rose-500/25 text-rose-100 border border-rose-400/40',
      };
    }
    if (!incident.nexconnGroupId) {
      return {
        label: 'Awaiting Group',
        cls: 'bg-amber-500/20 text-amber-200 border border-amber-400/30',
      };
    }
    if (channelState === 'ready') {
      return {
        label: 'SDK Live',
        cls: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30',
      };
    }
    return {
      label: 'SDK Connected',
      cls: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30',
    };
  })();

  const isCanPostCards =
    connectionStatus === 'connected' &&
    chatUIReady &&
    Boolean(incident.nexconnGroupId) &&
    channelState === 'ready' &&
    cardBusy === null;

  return (
    <div className="bg-[#FBF8F3] border border-[#E9E1D3] rounded-2xl overflow-hidden flex flex-col h-[540px] min-w-0">
      {/* War Room Header (GuardianGrid Teal & Ivory Theme) */}
      <div className="px-4 py-3 bg-[#0B3B3C] text-white flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare className="w-4 h-4 text-emerald-300 shrink-0" />
            <h3 className="text-xs font-bold tracking-wide truncate">
              Nexconn War Room · {incident.code}
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
            {incident.isSimulated && (
              <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-300/30 text-[9px] font-bold">
                SIMULATED
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/75 truncate mt-0.5">
            {incident.nexconnGroupId
              ? `Cell ${incident.cellId} · Group ${incident.nexconnGroupId} · Operator: ${activeOperator?.name || 'Dispatch'}`
              : `Cell ${incident.cellId} · Incident group not yet provisioned`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowChannelList((v) => !v)}
            title={showChannelList ? 'Focus current incident channel' : 'Show all channels & unread counts'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold cursor-pointer"
          >
            {showChannelList ? (
              <PanelLeftClose className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{showChannelList ? 'Focus' : 'Channels'}</span>
          </button>

          <button
            type="button"
            onClick={() => void onStartAudioCall()}
            title="Audio call responder alongside map"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => void onStartVideoCall()}
            title="Video triage call alongside map"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-[11px] font-semibold cursor-pointer"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video</span>
          </button>

          {onOpenFullMessages && incident.nexconnGroupLive && incident.nexconnGroupId && (
            <button
              type="button"
              onClick={onOpenFullMessages}
              title="Open group conversation in Full Messages View"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Full View</span>
            </button>
          )}
        </div>
      </div>

      {/* Custom Emergency Message Card Toolbar */}
      <div className="px-3 py-2 bg-[#F6F1E7] border-b border-[#E9E1D3] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={!isCanPostCards}
            onClick={() => void handlePostSosCard()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#D65A4A]/40 text-[#991B1B] hover:bg-[#FEF2F2] font-semibold disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>{cardBusy === 'sos' ? 'Posting...' : 'Post SOS Telemetry Card'}</span>
          </button>

          <button
            type="button"
            disabled={!isCanPostCards}
            onClick={() => void handlePostSbarCard()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#0F766E]/40 text-[#0B3B3C] hover:bg-[#0F766E]/5 font-semibold disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
          >
            <FileHeart className="w-3 h-3 text-[#0F766E]" />
            <span>{cardBusy === 'sbar' ? 'Posting...' : 'Post AI SBAR Card'}</span>
          </button>
        </div>

        <span className="inline-flex items-center gap-1 text-[10px] text-[#5B687A]">
          <Users className="w-3 h-3 text-[#0F766E]" />
          <span>{Math.max(2, incident.assignedResponderIds.length + 2)} members</span>
        </span>
      </div>

      {cardStatus && (
        <div className="px-3 py-1.5 bg-[#ECFDF5] border-b border-[#A7F3D0] text-[11px] text-[#065F46] flex items-center justify-between gap-2 shrink-0">
          <span>{cardStatus}</span>
          <button
            type="button"
            onClick={() => setCardStatus(null)}
            className="font-bold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Official Nexconn ChatUI Viewport */}
      <div className="flex-1 min-h-0 relative bg-white overflow-x-auto overflow-y-hidden">
        {connectionStatus !== 'connected' ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            {connectionStatus === 'connecting' ? (
              <Loader2 className="w-8 h-8 text-[#0F766E] animate-spin" />
            ) : (
              <WifiOff className="w-8 h-8 text-[#D65A4A]/70" />
            )}
            <div>
              <p className="text-sm font-bold text-[#0B3B3C]">
                Nexconn Chat{' '}
                {connectionStatus === 'connecting'
                  ? 'Connecting...'
                  : connectionStatus === 'error'
                    ? 'Connection Error'
                    : 'Disconnected'}
              </p>
              <p className="text-xs text-[#5B687A] mt-1 max-w-xs">
                {connectionError ||
                  (connectionStatus === 'connecting'
                    ? 'Authenticating operator token and establishing WebSocket session...'
                    : 'Connect an authenticated operator session to load the official Nexconn War Room.')}
              </p>
            </div>
            {connectionStatus !== 'connecting' && (
              <button
                type="button"
                onClick={() => void reconnect()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B5E58] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconnect Nexconn</span>
              </button>
            )}
          </div>
        ) : !incident.nexconnGroupId ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-sm font-bold text-[#0B3B3C]">No Incident Group Provisioned Yet</p>
              <p className="text-xs text-[#5B687A] mt-1 max-w-xs">
                {incident.state === 'UNVERIFIED'
                  ? 'Verify this incident in the Human Dispatcher Verification panel below to auto-create its dedicated Nexconn War Room group.'
                  : 'Provision this verified incident’s dedicated Nexconn group channel to open the live War Room.'}
              </p>
            </div>
            {incident.state !== 'UNVERIFIED' && incident.state !== 'REJECTED' && (
              <button
                type="button"
                onClick={() => void onProvisionGroup()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B5E58] cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Provision Incident Group</span>
              </button>
            )}
          </div>
        ) : chatUIError || channelState === 'error' ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <AlertTriangle className="w-7 h-7 text-[#D65A4A]" />
            <div>
              <p className="text-sm font-bold text-[#991B1B]">Unable to Open Nexconn War Room</p>
              <p className="text-xs text-[#5B687A] mt-1 max-w-sm">
                {chatUIError || 'Group channel failed to synchronize.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setChatUIError(null);
                  setRetryNonce((n) => n + 1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0B5E58] cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Channel Sync</span>
              </button>
              <button
                type="button"
                onClick={() => void reconnect()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E9E1D3] bg-white text-[#1B2A38] text-xs font-semibold hover:bg-[#F6F1E7] cursor-pointer"
              >
                <span>Reconnect Session</span>
              </button>
            </div>
          </div>
        ) : chatUIReady && (channelState === 'ready' || showChannelList) ? (
          <div className="w-full h-full min-w-0">
            {showChannelList
              ? React.createElement('nc-chat-ui-app-provider', {
                  style: { display: 'block', width: '100%', height: '100%' },
                })
              : React.createElement('nc-channel-detail-provider', {
                  style: { display: 'block', width: '100%', height: '100%' },
                })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-[#5B687A]">
            <Loader2 className="w-5 h-5 text-[#0F766E] animate-spin" />
            <span>
              {channelState === 'opening'
                ? `Opening War Room channel ${incident.nexconnGroupId} and syncing messages...`
                : 'Initializing Nexconn ChatUI...'}
            </span>
          </div>
        )}
      </div>

      {/* Honest Capability Note (Section 7) */}
      <div className="px-3 py-1.5 bg-[#FBF8F3] border-t border-[#E9E1D3] text-[10px] text-[#5B687A] flex items-center justify-between gap-2 shrink-0">
        <span>
          Official @nexconn/chatui · Read receipts, media/file previews &amp; custom emergency cards active.
        </span>
        <span className="hidden xl:inline">
          Voice notes available on Mobile Field Kit (@nexconn/chat).
        </span>
      </div>
    </div>
  );
};
