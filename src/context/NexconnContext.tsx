import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NCCallEndReason, NCCallMediaType, NCCallType } from '@nexconn/call';
import type { MessagesQuery } from '@nexconn/chat';
import {
  acceptNexconnCall,
  bindCallVideoElements,
  connectNexconnSession,
  createGroupViaNexconn,
  createNexconnMessagesQuery,
  disconnectNexconnSession,
  endNexconnCall,
  fetchNexconnChannels,
  markChannelReadAndSendReceipts,
  sendFileViaNexconn,
  sendImageViaNexconn,
  sendTextViaNexconn,
  sendTypingIndicator,
  serializeNexconnMessage,
  setCallCamera,
  setCallMicrophone,
  startNexconnCall,
  subscribeAndFetchOnlineStatus,
  unbindCallVideoElements,
} from '../services/nexconnClient';
import type {
  ActiveCallState,
  CallMediaKind,
  CommsChannel,
  CommsChannelType,
  CommsConnectionStatus,
  CommsMessage,
  IncomingCallState,
  NexconnHealthStatus,
  OperatorProfile,
} from '../types/comms';
import { makeChannelKey } from '../types/comms';

const STORAGE_OPERATOR_KEY = 'gg_nexconn_operator_id';

async function parseJsonResponse<T = Record<string, any>>(
  res: Response,
  endpoint: string
): Promise<T> {
  const contentType = res.headers.get('content-type') || 'unknown';
  const isJson = contentType.toLowerCase().includes('application/json');

  if (!isJson) {
    throw new Error(
      `${endpoint} returned non-JSON response (HTTP ${res.status}, Content-Type: ${contentType}, redirected: ${res.redirected}). Ensure the Express backend is handling /api/* requests.`
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      `${endpoint} returned malformed JSON (HTTP ${res.status}, Content-Type: ${contentType}, redirected: ${res.redirected}).`
    );
  }

  if (!res.ok) {
    const message =
      typeof data?.error === 'string' && data.error.trim().length > 0
        ? data.error
        : `${endpoint} failed (HTTP ${res.status}, Content-Type: ${contentType}, redirected: ${res.redirected}).`;
    throw new Error(message);
  }

  return data as T;
}

interface NexconnContextValue {
  health: NexconnHealthStatus | null;
  directory: OperatorProfile[];
  activeOperator: OperatorProfile | null;
  connectionStatus: CommsConnectionStatus;
  connectionError: string | null;
  isLoadingChannels: boolean;
  channels: CommsChannel[];
  selectedChannelKey: string | null;
  selectedChannel: CommsChannel | null;
  messages: CommsMessage[];
  hasMoreMessages: boolean;
  isLoadingMessages: boolean;
  uploadProgress: number | null;
  onlineMap: Record<string, boolean>;
  typingUsersInSelected: string[];
  totalUnreadCount: number;
  incomingCall: IncomingCallState | null;
  activeCall: ActiveCallState | null;
  callError: string | null;
  switchOperator: (operatorId: string) => Promise<void>;
  reconnect: () => Promise<void>;
  selectChannel: (channelType: CommsChannelType, channelId: string) => Promise<void>;
  startDirectChat: (operatorId: string) => Promise<void>;
  createGroup: (groupName: string, inviteeUserIds: string[]) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendImage: (file: File) => Promise<void>;
  sendFile: (file: File) => Promise<void>;
  notifyTyping: () => void;
  startCall: (calleeId: string, mediaType: CallMediaKind) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => Promise<void>;
  hangupActiveCall: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  bindVideos: (localEl: HTMLVideoElement | null, remoteEl: HTMLVideoElement | null) => void;
  clearCallError: () => void;
  getOperatorName: (userId: string) => string;
}

const NexconnContext = createContext<NexconnContextValue | null>(null);

export const NexconnProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [health, setHealth] = useState<NexconnHealthStatus | null>(null);
  const [directory, setDirectory] = useState<OperatorProfile[]>([]);
  const [activeOperator, setActiveOperator] = useState<OperatorProfile | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<CommsConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [channels, setChannels] = useState<CommsChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [selectedChannelKey, setSelectedChannelKey] = useState<string | null>(null);

  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, CommsMessage[]>>({});
  const [hasMoreByChannel, setHasMoreByChannel] = useState<Record<string, boolean>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [typingByChannel, setTypingByChannel] = useState<Record<string, string[]>>({});

  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const queryMapRef = useRef<Record<string, MessagesQuery>>({});
  const typingTimersRef = useRef<Record<string, number>>({});
  const lastTypingSentRef = useRef<number>(0);

  const selectedKeyRef = useRef<string | null>(null);
  selectedKeyRef.current = selectedChannelKey;

  const directoryRef = useRef<OperatorProfile[]>([]);
  directoryRef.current = directory;

  const activeOperatorRef = useRef<OperatorProfile | null>(null);
  activeOperatorRef.current = activeOperator;

  const operatorsById = useMemo(() => {
    const map: Record<string, OperatorProfile> = {};
    for (const op of directory) map[op.userId] = op;
    return map;
  }, [directory]);

  const operatorsByIdRef = useRef<Record<string, OperatorProfile>>({});
  operatorsByIdRef.current = operatorsById;

  const getOperatorName = useCallback((userId: string) => {
    return operatorsByIdRef.current[userId]?.name || userId;
  }, []);

  const refreshChannels = useCallback(async () => {
    setIsLoadingChannels(true);
    try {
      const list = await fetchNexconnChannels(operatorsByIdRef.current);
      setChannels((prev) => {
        // Merge in any optimistic channels that haven't received a first message yet
        const sdkKeys = new Set(list.map((c) => c.key));
        const keptOptimistic = prev.filter((c) => !sdkKeys.has(c.key) && !c.lastMessagePreview.includes('No messages'));
        const merged = [...list, ...keptOptimistic];
        merged.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.lastMessageTime - a.lastMessageTime;
        });
        return merged;
      });
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  const connectAsOperator = useCallback(
    async (operator: OperatorProfile, allOperators: OperatorProfile[]) => {
      setConnectionError(null);
      setConnectionStatus('connecting');
      setActiveOperator(operator);
      localStorage.setItem(STORAGE_OPERATOR_KEY, operator.userId);

      // Clear previous session chat state cleanly
      queryMapRef.current = {};
      setChannels([]);
      setSelectedChannelKey(null);
      setMessagesByChannel({});
      setHasMoreByChannel({});
      setTypingByChannel({});
      setIncomingCall(null);
      setActiveCall(null);

      await disconnectNexconnSession();

      try {
        const res = await fetch('/api/nexconn/token', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ operatorId: operator.userId }),
        });

        const payload = await parseJsonResponse<{
          token?: string;
          appKey?: string;
          areaCode?: string;
          error?: string;
        }>(res, '/api/nexconn/token');

        if (!payload?.token || !payload?.appKey) {
          throw new Error(
            payload?.error || `/api/nexconn/token succeeded (HTTP ${res.status}) without token credentials.`
          );
        }

        const dirLookup: Record<string, OperatorProfile> = {};
        for (const item of allOperators) dirLookup[item.userId] = item;

        await connectNexconnSession({
          appKey: payload.appKey,
          areaCode: payload.areaCode || 'SG',
          token: payload.token,
          currentUserId: operator.userId,
          callbacks: {
            onConnectionStatusChanged(status) {
              setConnectionStatus(status);
            },
            onChannelsSyncComplete() {
              void refreshChannels();
            },
            onTypingStatusChanged(channelKey, typingUserIds) {
              setTypingByChannel((prev) => ({ ...prev, [channelKey]: typingUserIds }));
              if (typingTimersRef.current[channelKey]) {
                window.clearTimeout(typingTimersRef.current[channelKey]);
              }
              if (typingUserIds.length > 0) {
                typingTimersRef.current[channelKey] = window.setTimeout(() => {
                  setTypingByChannel((prev) => ({ ...prev, [channelKey]: [] }));
                }, 4500);
              }
            },
            onMessagesReceived(incoming) {
              const currentSelected = selectedKeyRef.current;
              const readIdsForSelected: string[] = [];

              setMessagesByChannel((prev) => {
                const next = { ...prev };
                for (const msg of incoming) {
                  const list = next[msg.channelKey] ? [...next[msg.channelKey]] : [];
                  if (!list.some((m) => m.messageId === msg.messageId)) {
                    list.push(msg);
                    list.sort((a, b) => a.sentTime - b.sentTime);
                  }
                  next[msg.channelKey] = list;
                  if (msg.channelKey === currentSelected && msg.direction === 'receive') {
                    readIdsForSelected.push(msg.messageId);
                  }
                }
                return next;
              });

              if (currentSelected && readIdsForSelected.length > 0) {
                const [typeStr, chId] = currentSelected.split(':');
                void markChannelReadAndSendReceipts(
                  typeStr === 'group' ? 'group' : 'direct',
                  chId,
                  readIdsForSelected
                );
              }

              void refreshChannels();
            },
            onMessagesUpdated(updated) {
              setMessagesByChannel((prev) => {
                const next = { ...prev };
                for (const msg of updated) {
                  const existing = next[msg.channelKey] || [];
                  next[msg.channelKey] = existing.map((m) =>
                    m.messageId === msg.messageId ? msg : m
                  );
                }
                return next;
              });
            },
            onMessageDeleted(items) {
              setMessagesByChannel((prev) => {
                const next = { ...prev };
                for (const item of items) {
                  if (next[item.channelKey]) {
                    next[item.channelKey] = next[item.channelKey].filter(
                      (m) => m.messageId !== item.messageId
                    );
                  }
                }
                return next;
              });
            },
            onReceiptResponses(items) {
              setMessagesByChannel((prev) => {
                const next = { ...prev };
                for (const r of items) {
                  if (!next[r.channelKey]) continue;
                  next[r.channelKey] = next[r.channelKey].map((m) =>
                    m.messageId === r.messageId
                      ? {
                          ...m,
                          sentStatus: r.readCount > 0 ? 'read' : m.sentStatus,
                          readCount: r.readCount,
                          totalCount: r.totalCount,
                        }
                      : m
                  );
                }
                return next;
              });
            },
            onOnlineStatusChanged(updates) {
              setOnlineMap((prev) => ({ ...prev, ...updates }));
            },
            onGroupOperation() {
              void refreshChannels();
            },
            onCallReceived(session) {
              const callerId = session.getCallerUserId() || session.getInviterUserId();
              const callerOp = dirLookup[callerId];
              const mediaKind: CallMediaKind =
                session.getMediaType() === NCCallMediaType.AUDIO_VIDEO ? 'video' : 'audio';

              setIncomingCall({
                callId: session.getCallId(),
                callerUserId: callerId,
                callerName: callerOp?.name || callerId,
                callerRole: callerOp ? `${callerOp.role} • ${callerOp.station}` : undefined,
                mediaType: mediaKind,
                callType: session.getCallType() === NCCallType.MULTI ? 'multi' : 'single',
              });
            },
            onCallConnected(session) {
              const mediaKind: CallMediaKind =
                session.getMediaType() === NCCallMediaType.AUDIO_VIDEO ? 'video' : 'audio';
              const participants = session.getRemoteParticipants();
              const remoteId =
                participants[0]?.userId || session.getCallerUserId() || '';
              const remoteOp = dirLookup[remoteId];

              setIncomingCall(null);
              setActiveCall((prev) => ({
                callId: session.getCallId(),
                direction: prev?.direction || 'incoming',
                mediaType: mediaKind,
                status: 'oncall',
                remoteUserId: remoteId || prev?.remoteUserId || '',
                remoteName: remoteOp?.name || prev?.remoteName || remoteId || 'Operator',
                remoteRole: remoteOp ? `${remoteOp.role} • ${remoteOp.station}` : prev?.remoteRole,
                isMicEnabled: prev?.isMicEnabled ?? true,
                isCameraEnabled: mediaKind === 'video' ? (prev?.isCameraEnabled ?? true) : false,
                isRemoteMicMuted: false,
                isRemoteCameraOff: mediaKind !== 'video',
                connectedAt: prev?.connectedAt || Date.now(),
              }));
            },
            onCallEnded(session, reason) {
              const participants = session.getRemoteParticipants().map((p) => p.userId);
              unbindCallVideoElements(participants);
              setIncomingCall((prev) =>
                prev && prev.callId === session.getCallId() ? null : prev
              );
              setActiveCall((prev) =>
                prev && prev.callId === session.getCallId() ? null : prev
              );
              if (reason === NCCallEndReason.DECLINED) {
                setCallError('Call was declined by the recipient.');
              } else if (reason === NCCallEndReason.NO_ANSWER) {
                setCallError('No answer from operator.');
              }
            },
            onRemoteCameraStateChanged(userId, disabled) {
              setActiveCall((prev) =>
                prev && prev.remoteUserId === userId
                  ? { ...prev, isRemoteCameraOff: disabled }
                  : prev
              );
            },
            onRemoteMicrophoneStateChanged(userId, disabled) {
              setActiveCall((prev) =>
                prev && prev.remoteUserId === userId
                  ? { ...prev, isRemoteMicMuted: disabled }
                  : prev
              );
            },
          },
        });

        setConnectionStatus('connected');
        await refreshChannels();

        const otherIds = allOperators
          .map((o) => o.userId)
          .filter((id) => id !== operator.userId);
        const statuses = await subscribeAndFetchOnlineStatus(otherIds);
        setOnlineMap((prev) => ({ ...prev, ...statuses, [operator.userId]: true }));
      } catch (err: any) {
        setConnectionStatus('error');
        setConnectionError(err?.message || 'Unable to connect to Nexconn messaging services.');
      }
    },
    [refreshChannels]
  );

  // Bootstrap environment health + directory on initial mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [healthRes, dirRes] = await Promise.all([
          fetch('/api/nexconn/health', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
          fetch('/api/nexconn/directory', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
        ]);
        const healthData = await parseJsonResponse<NexconnHealthStatus>(
          healthRes,
          '/api/nexconn/health'
        );
        if (!cancelled) setHealth(healthData);

        const dirData = await parseJsonResponse<{ operators?: OperatorProfile[] }>(
          dirRes,
          '/api/nexconn/directory'
        );
        const ops: OperatorProfile[] = Array.isArray(dirData?.operators)
          ? dirData.operators
          : [];
        if (cancelled || ops.length === 0) return;

        setDirectory(ops);
        const savedId = localStorage.getItem(STORAGE_OPERATOR_KEY);
        const initialOp = ops.find((o) => o.userId === savedId) || ops[0];
        await connectAsOperator(initialOp, ops);
      } catch (err: any) {
        if (!cancelled) {
          setConnectionStatus('error');
          setConnectionError(err?.message || 'Failed to load Nexconn communications.');
        }
      }
    })();

    return () => {
      cancelled = true;
      void disconnectNexconnSession();
    };
  }, [connectAsOperator]);

  const switchOperator = useCallback(
    async (operatorId: string) => {
      const target = directoryRef.current.find((o) => o.userId === operatorId);
      if (!target) return;
      await connectAsOperator(target, directoryRef.current);
    },
    [connectAsOperator]
  );

  const reconnect = useCallback(async () => {
    const current = activeOperatorRef.current || directoryRef.current[0];
    if (!current) return;
    await connectAsOperator(current, directoryRef.current);
  }, [connectAsOperator]);

  const loadChannelHistory = useCallback(
    async (channelType: CommsChannelType, channelId: string, reset = false) => {
      const key = makeChannelKey(channelType, channelId);
      setIsLoadingMessages(true);
      try {
        if (reset || !queryMapRef.current[key]) {
          queryMapRef.current[key] = createNexconnMessagesQuery(channelType, channelId, 25);
        }
        const query = queryMapRef.current[key];
        const res = await query.loadNextPage();
        if (res.isOk && res.data?.data) {
          const currentUid = activeOperatorRef.current?.userId || '';
          const fetched = res.data.data.map((m) => serializeNexconnMessage(m, currentUid));

          setMessagesByChannel((prev) => {
            const existing = reset ? [] : prev[key] || [];
            const combined = [...fetched, ...existing];
            const deduped = new Map<string, CommsMessage>();
            for (const item of combined) {
              deduped.set(item.messageId, item);
            }
            const sorted = Array.from(deduped.values()).sort((a, b) => a.sentTime - b.sentTime);
            return { ...prev, [key]: sorted };
          });

          setHasMoreByChannel((prev) => ({ ...prev, [key]: Boolean(query.hasNext) }));

          const unreadIncomingIds = fetched
            .filter((m) => m.direction === 'receive' && m.needReceipt && !m.sentReceipt)
            .map((m) => m.messageId);
          await markChannelReadAndSendReceipts(channelType, channelId, unreadIncomingIds);
          setChannels((prev) =>
            prev.map((c) => (c.key === key ? { ...c, unreadCount: 0 } : c))
          );
        }
      } finally {
        setIsLoadingMessages(false);
      }
    },
    []
  );

  const selectChannel = useCallback(
    async (channelType: CommsChannelType, channelId: string) => {
      const key = makeChannelKey(channelType, channelId);
      setSelectedChannelKey(key);
      await loadChannelHistory(channelType, channelId, true);
    },
    [loadChannelHistory]
  );

  const startDirectChat = useCallback(
    async (operatorId: string) => {
      const key = makeChannelKey('direct', operatorId);
      const op = operatorsByIdRef.current[operatorId];
      setChannels((prev) => {
        if (prev.some((c) => c.key === key)) return prev;
        const newCh: CommsChannel = {
          key,
          channelId: operatorId,
          channelType: 'direct',
          name: op?.name || operatorId,
          subtitle: op ? `${op.role} • ${op.station}` : 'Direct operator channel',
          initials: op?.initials || operatorId.slice(0, 2).toUpperCase(),
          unreadCount: 0,
          lastMessagePreview: 'Start a conversation',
          lastMessageTime: Date.now(),
          isPinned: false,
        };
        return [newCh, ...prev];
      });
      await selectChannel('direct', operatorId);
    },
    [selectChannel]
  );

  const createGroup = useCallback(
    async (groupName: string, inviteeUserIds: string[]) => {
      const groupId = await createGroupViaNexconn({ groupName, inviteeUserIds });
      const key = makeChannelKey('group', groupId);
      setChannels((prev) => [
        {
          key,
          channelId: groupId,
          channelType: 'group',
          name: groupName.trim(),
          subtitle: `${inviteeUserIds.length + 1} members`,
          initials: groupName.trim().slice(0, 2).toUpperCase(),
          unreadCount: 0,
          lastMessagePreview: 'Group channel created',
          lastMessageTime: Date.now(),
          isPinned: false,
          memberCount: inviteeUserIds.length + 1,
        },
        ...prev,
      ]);
      await selectChannel('group', groupId);
      void refreshChannels();
    },
    [refreshChannels, selectChannel]
  );

  const selectedChannel = useMemo(
    () => channels.find((c) => c.key === selectedChannelKey) || null,
    [channels, selectedChannelKey]
  );

  const messages = useMemo(
    () => (selectedChannelKey ? messagesByChannel[selectedChannelKey] || [] : []),
    [messagesByChannel, selectedChannelKey]
  );

  const hasMoreMessages = useMemo(
    () => (selectedChannelKey ? Boolean(hasMoreByChannel[selectedChannelKey]) : false),
    [hasMoreByChannel, selectedChannelKey]
  );

  const typingUsersInSelected = useMemo(
    () => (selectedChannelKey ? typingByChannel[selectedChannelKey] || [] : []),
    [typingByChannel, selectedChannelKey]
  );

  const totalUnreadCount = useMemo(
    () => channels.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0),
    [channels]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!selectedChannel) return;
    await loadChannelHistory(selectedChannel.channelType, selectedChannel.channelId, false);
  }, [loadChannelHistory, selectedChannel]);

  const appendSentMessage = useCallback((sent: CommsMessage) => {
    setMessagesByChannel((prev) => {
      const existing = prev[sent.channelKey] || [];
      if (existing.some((m) => m.messageId === sent.messageId)) return prev;
      return {
        ...prev,
        [sent.channelKey]: [...existing, sent].sort((a, b) => a.sentTime - b.sentTime),
      };
    });
    setChannels((prev) =>
      prev.map((c) =>
        c.key === sent.channelKey
          ? {
              ...c,
              lastMessagePreview: sent.text,
              lastMessageTime: sent.sentTime,
            }
          : c
      )
    );
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      if (!selectedChannel || !text.trim()) return;
      const uid = activeOperatorRef.current?.userId || '';
      const sent = await sendTextViaNexconn(
        selectedChannel.channelType,
        selectedChannel.channelId,
        text.trim(),
        uid
      );
      appendSentMessage(sent);
    },
    [appendSentMessage, selectedChannel]
  );

  const sendImage = useCallback(
    async (file: File) => {
      if (!selectedChannel) return;
      const uid = activeOperatorRef.current?.userId || '';
      setUploadProgress(0);
      try {
        const sent = await sendImageViaNexconn(
          selectedChannel.channelType,
          selectedChannel.channelId,
          file,
          uid,
          (pct) => setUploadProgress(pct)
        );
        appendSentMessage(sent);
      } finally {
        setUploadProgress(null);
      }
    },
    [appendSentMessage, selectedChannel]
  );

  const sendFile = useCallback(
    async (file: File) => {
      if (!selectedChannel) return;
      const uid = activeOperatorRef.current?.userId || '';
      setUploadProgress(0);
      try {
        const sent = await sendFileViaNexconn(
          selectedChannel.channelType,
          selectedChannel.channelId,
          file,
          uid,
          (pct) => setUploadProgress(pct)
        );
        appendSentMessage(sent);
      } finally {
        setUploadProgress(null);
      }
    },
    [appendSentMessage, selectedChannel]
  );

  const notifyTyping = useCallback(() => {
    if (!selectedChannel || selectedChannel.channelType !== 'direct') return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    void sendTypingIndicator(selectedChannel.channelId);
  }, [selectedChannel]);

  const startCall = useCallback(async (calleeId: string, mediaType: CallMediaKind) => {
    setCallError(null);
    const callee = operatorsByIdRef.current[calleeId];
    const { callId } = await startNexconnCall(calleeId, mediaType);
    setActiveCall({
      callId,
      direction: 'outgoing',
      mediaType,
      status: 'calling',
      remoteUserId: calleeId,
      remoteName: callee?.name || calleeId,
      remoteRole: callee ? `${callee.role} • ${callee.station}` : undefined,
      isMicEnabled: true,
      isCameraEnabled: mediaType === 'video',
      isRemoteMicMuted: false,
      isRemoteCameraOff: mediaType !== 'video',
      connectedAt: null,
    });
  }, []);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);
    const call = incomingCall;
    await acceptNexconnCall(call.callId);
    setIncomingCall(null);
    setActiveCall({
      callId: call.callId,
      direction: 'incoming',
      mediaType: call.mediaType,
      status: 'connecting',
      remoteUserId: call.callerUserId,
      remoteName: call.callerName,
      remoteRole: call.callerRole,
      isMicEnabled: true,
      isCameraEnabled: call.mediaType === 'video',
      isRemoteMicMuted: false,
      isRemoteCameraOff: call.mediaType !== 'video',
      connectedAt: null,
    });
  }, [incomingCall]);

  const rejectIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    const callId = incomingCall.callId;
    setIncomingCall(null);
    await endNexconnCall(callId);
  }, [incomingCall]);

  const hangupActiveCall = useCallback(async () => {
    if (!activeCall) return;
    const callId = activeCall.callId;
    const remoteId = activeCall.remoteUserId;
    setActiveCall(null);
    if (remoteId) unbindCallVideoElements([remoteId]);
    await endNexconnCall(callId);
  }, [activeCall]);

  const toggleMicrophone = useCallback(async () => {
    if (!activeCall) return;
    const nextState = await setCallMicrophone(!activeCall.isMicEnabled);
    setActiveCall((prev) => (prev ? { ...prev, isMicEnabled: nextState } : prev));
  }, [activeCall]);

  const toggleCamera = useCallback(async () => {
    if (!activeCall) return;
    const nextState = await setCallCamera(!activeCall.isCameraEnabled);
    setActiveCall((prev) => (prev ? { ...prev, isCameraEnabled: nextState } : prev));
  }, [activeCall]);

  const bindVideos = useCallback(
    (localEl: HTMLVideoElement | null, remoteEl: HTMLVideoElement | null) => {
      if (!activeCall) return;
      bindCallVideoElements({
        localVideoEl: localEl,
        remoteVideoEl: remoteEl,
        remoteUserId: activeCall.remoteUserId,
      });
    },
    [activeCall]
  );

  const clearCallError = useCallback(() => setCallError(null), []);

  const value: NexconnContextValue = {
    health,
    directory,
    activeOperator,
    connectionStatus,
    connectionError,
    isLoadingChannels,
    channels,
    selectedChannelKey,
    selectedChannel,
    messages,
    hasMoreMessages,
    isLoadingMessages,
    uploadProgress,
    onlineMap,
    typingUsersInSelected,
    totalUnreadCount,
    incomingCall,
    activeCall,
    callError,
    switchOperator,
    reconnect,
    selectChannel,
    startDirectChat,
    createGroup,
    loadOlderMessages,
    sendText,
    sendImage,
    sendFile,
    notifyTyping,
    startCall,
    acceptIncomingCall,
    rejectIncomingCall,
    hangupActiveCall,
    toggleMicrophone,
    toggleCamera,
    bindVideos,
    clearCallError,
    getOperatorName,
  };

  return <NexconnContext.Provider value={value}>{children}</NexconnContext.Provider>;
};

export function useNexconn(): NexconnContextValue {
  const ctx = useContext(NexconnContext);
  if (!ctx) {
    throw new Error('useNexconn must be used inside a NexconnProvider');
  }
  return ctx;
}
