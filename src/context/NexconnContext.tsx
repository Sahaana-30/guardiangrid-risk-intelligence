import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { getActiveOrganizationId } from '../services/tenantScope';
import { apiUrl, getApiCredentials } from '../services/apiBase';
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
  sendVoiceViaNexconn,
  serializeNexconnMessage,
  setCallCamera,
  setCallMicrophone,
  startNexconnCall,
  subscribeAndFetchOnlineStatus,
  unbindCallVideoElements,
} from '../services/nexconnClient';
import { syncChatUIProfileRegistry } from '../services/nexconnChatUI';
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

const PUBLIC_ROUTE_PREFIXES = ['/sos', '/track'];
const OPERATIONAL_ROUTE_PREFIXES = [
  '/command',
  '/messages',
  '/field-kit',
  '/responders',
  '/incidents',
  '/medical-handoff',
  '/dashboard',
  '/analytics',
  '/map',
  '/water-bodies',
  '/forecast',
  '/reports',
  '/settings',
  '/analyst',
  '/explain',
  '/clusters',
  '/fairness',
  '/methodology',
  '/operations',
  '/intelligence',
  '/communications',
  '/organization',
  '/workspace',
  '/admin',
];

export function extractCleanRoutePath(pathnameOrHash: string): string {
  const raw = (pathnameOrHash || '/').replace(/^#/, '').split('?')[0].split('#')[0].trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function isPublicSafetyRoute(pathnameOrHash: string): boolean {
  const clean = extractCleanRoutePath(pathnameOrHash);
  if (clean === '/') return true;
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(`${prefix}/`)
  );
}

export function isOperationalPathname(pathnameOrHash: string): boolean {
  const clean = extractCleanRoutePath(pathnameOrHash);
  if (isPublicSafetyRoute(clean)) return false;
  return OPERATIONAL_ROUTE_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(`${prefix}/`)
  );
}

export function validateNexconnCallTarget(
  calleeId: string,
  activeOperatorUserId?: string | null
): { ok: true; targetId: string } | { ok: false; error: string } {
  const targetId = (calleeId || '').trim();
  if (!targetId) {
    return {
      ok: false,
      error: 'Select or assign a responder with a valid Nexconn User ID before starting a call.',
    };
  }
  if (targetId.startsWith('resp-')) {
    return {
      ok: false,
      error:
        'Cannot place Nexconn call using internal responder profile ID; resolve responder.nexconnUserId first.',
    };
  }
  if (activeOperatorUserId && targetId === activeOperatorUserId) {
    return {
      ok: false,
      error: 'Cannot place a call to your own active operator session.',
    };
  }
  return { ok: true, targetId };
}

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
  sendTextToChannel: (
    channelType: CommsChannelType,
    channelId: string,
    text: string
  ) => Promise<void>;
  sendImage: (file: File) => Promise<void>;
  sendFile: (file: File) => Promise<void>;
  sendVoice: (file: File) => Promise<void>;
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

  const { user: firebaseUser, loading: authLoading, getIdToken } = useAuth();
  const firebaseUserRef = useRef(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  const activeOperatorRef = useRef<OperatorProfile | null>(null);
  activeOperatorRef.current = activeOperator;

  const connectionStatusRef = useRef<CommsConnectionStatus>('disconnected');
  connectionStatusRef.current = connectionStatus;

  const connectEpochRef = useRef(0);
  const bootInFlightRef = useRef<Promise<void> | null>(null);
  const connectedScopeKeyRef = useRef<string | null>(null);
  const signedOutLatchRef = useRef(false);
  const prevFirebaseUidRef = useRef<string | null>(null);
  const autoReconnectInFlightRef = useRef(false);

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

  const clearTypingTimers = useCallback(() => {
    for (const timerId of Object.values(typingTimersRef.current)) {
      window.clearTimeout(timerId);
    }
    typingTimersRef.current = {};
  }, []);

  const teardownSessionState = useCallback(
    async (nextError: string | null = null) => {
      clearTypingTimers();
      queryMapRef.current = {};
      connectedScopeKeyRef.current = null;
      activeOperatorRef.current = null;
      setActiveOperator(null);
      setChannels([]);
      setSelectedChannelKey(null);
      setMessagesByChannel({});
      setHasMoreByChannel({});
      setTypingByChannel({});
      setOnlineMap({});
      setIncomingCall(null);
      setActiveCall(null);
      setCallError(null);
      setConnectionError(nextError);
      setConnectionStatus('disconnected');
      await disconnectNexconnSession();
    },
    [clearTypingTimers]
  );

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
      const epoch = ++connectEpochRef.current;
      let hasConnectedInEpoch = false;

      clearTypingTimers();
      setConnectionError(null);
      setConnectionStatus('connecting');
      setActiveOperator(operator);
      activeOperatorRef.current = operator;
      localStorage.setItem(STORAGE_OPERATOR_KEY, operator.userId);

      // Clear previous session chat state cleanly (singleton ChatUI resets user cache on NCEngine reconnect)
      queryMapRef.current = {};
      setChannels([]);
      setSelectedChannelKey(null);
      setMessagesByChannel({});
      setHasMoreByChannel({});
      setTypingByChannel({});
      setIncomingCall(null);
      setActiveCall(null);

      await disconnectNexconnSession();
      if (epoch !== connectEpochRef.current) return;

      try {
        const buildTokenHeaders = async (forceRefresh = false): Promise<Record<string, string>> => {
          const h: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-gg-org-id': getActiveOrganizationId(),
          };
          try {
            const idToken = forceRefresh && auth.currentUser
              ? await auth.currentUser.getIdToken(true)
              : (await getIdToken()) ||
                (auth.currentUser ? await auth.currentUser.getIdToken() : null);
            if (idToken) {
              h.Authorization = `Bearer ${idToken}`;
            }
          } catch {
            // Non-fatal in development demo mode
          }
          return h;
        };

        let headers = await buildTokenHeaders(false);
        let res = await fetch(apiUrl('/api/nexconn/token'), {
          method: 'POST',
          credentials: getApiCredentials(),
          headers,
          body: JSON.stringify({ operatorId: operator.userId }),
        });

        if (res.status === 401 && auth.currentUser) {
          headers = await buildTokenHeaders(true);
          res = await fetch(apiUrl('/api/nexconn/token'), {
            method: 'POST',
            credentials: getApiCredentials(),
            headers,
            body: JSON.stringify({ operatorId: operator.userId }),
          });
        }

        const payload = await parseJsonResponse<{
          userId?: string;
          name?: string;
          role?: string;
          station?: string;
          initials?: string;
          token?: string;
          appKey?: string;
          areaCode?: string;
          error?: string;
        }>(res, '/api/nexconn/token');

        if (epoch !== connectEpochRef.current) return;

        if (!payload?.token || !payload?.appKey) {
          throw new Error(
            payload?.error || `/api/nexconn/token succeeded (HTTP ${res.status}) without token credentials.`
          );
        }

        const resolvedOperator: OperatorProfile = {
          userId: payload.userId || operator.userId,
          name: payload.name || operator.name,
          role: payload.role || operator.role,
          station: payload.station || operator.station,
          initials: payload.initials || operator.initials,
        };
        setActiveOperator(resolvedOperator);
        activeOperatorRef.current = resolvedOperator;

        const dirLookup: Record<string, OperatorProfile> = {};
        for (const item of allOperators) dirLookup[item.userId] = item;
        dirLookup[resolvedOperator.userId] = resolvedOperator;

        syncChatUIProfileRegistry({ operators: Object.values(dirLookup) });

        await connectNexconnSession({
          appKey: payload.appKey,
          areaCode: payload.areaCode || 'SG',
          token: payload.token,
          currentUserId: resolvedOperator.userId,
          callbacks: {
            onConnectionStatusChanged(status, code) {
              if (epoch !== connectEpochRef.current) return;
              setConnectionStatus(status);
              if (status === 'connected') {
                hasConnectedInEpoch = true;
                autoReconnectInFlightRef.current = false;
                setConnectionError(null);
                return;
              }
              const isTokenExpiredCode = code === 31001 || code === 31002;
              if ((hasConnectedInEpoch || isTokenExpiredCode) && !signedOutLatchRef.current) {
                if (status === 'disconnected' || status === 'error') {
                  setConnectionError(
                    isTokenExpiredCode
                      ? 'Nexconn session token expired. Reconnecting operator session...'
                      : 'Nexconn real-time connection interrupted.'
                  );
                  if (!autoReconnectInFlightRef.current && isOperationalPathname(window.location.hash || window.location.pathname)) {
                    autoReconnectInFlightRef.current = true;
                    window.setTimeout(() => {
                      if (epoch === connectEpochRef.current && !signedOutLatchRef.current) {
                        void connectAsOperator(resolvedOperator, allOperators).finally(() => {
                          autoReconnectInFlightRef.current = false;
                        });
                      } else {
                        autoReconnectInFlightRef.current = false;
                      }
                    }, 1200);
                  }
                }
              }
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

        if (epoch !== connectEpochRef.current) return;

        setConnectionStatus('connected');
        await refreshChannels();

        if (epoch !== connectEpochRef.current) return;

        const otherIds = allOperators
          .map((o) => o.userId)
          .filter((id) => id !== resolvedOperator.userId);
        const statuses = await subscribeAndFetchOnlineStatus(otherIds);
        if (epoch !== connectEpochRef.current) return;
        setOnlineMap((prev) => ({ ...prev, ...statuses, [resolvedOperator.userId]: true }));
      } catch (err: any) {
        if (epoch !== connectEpochRef.current) return;
        setConnectionStatus('error');
        setConnectionError(err?.message || 'Unable to connect to Nexconn messaging services.');
      }
    },
    [clearTypingTimers, getIdToken, refreshChannels]
  );

  const isOperationalRoute = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const hashPath = (window.location.hash || '').replace(/^#/, '');
    const path = hashPath || window.location.pathname || '/';
    return isOperationalPathname(path);
  }, []);

  const bootstrapAndConnect = useCallback(
    async (force = false) => {
      if (!force && signedOutLatchRef.current) return;
      if (!force && !isOperationalRoute()) return;

      const currentScopeKey = `${firebaseUserRef.current?.uid || 'anon'}:${getActiveOrganizationId()}`;
      if (
        !force &&
        connectionStatusRef.current === 'connected' &&
        connectedScopeKeyRef.current === currentScopeKey
      ) {
        return;
      }

      if (bootInFlightRef.current) {
        if (!force) return bootInFlightRef.current;
        await bootInFlightRef.current.catch(() => undefined);
      }

      const run = (async () => {
        const startEpoch = connectEpochRef.current;
        try {
          const buildHeaders = async (forceRefresh = false): Promise<Record<string, string>> => {
            const h: Record<string, string> = {
              Accept: 'application/json',
              'x-gg-org-id': getActiveOrganizationId(),
            };
            try {
              const idToken = forceRefresh && auth.currentUser
                ? await auth.currentUser.getIdToken(true)
                : (await getIdToken()) ||
                  (auth.currentUser ? await auth.currentUser.getIdToken() : null);
              if (idToken) {
                h.Authorization = `Bearer ${idToken}`;
              }
            } catch {
              // Non-fatal in development demo mode
            }
            return h;
          };

          const healthRes = await fetch(apiUrl('/api/nexconn/health'), {
            credentials: getApiCredentials(),
            headers: { Accept: 'application/json' },
          });
          const healthData = await parseJsonResponse<NexconnHealthStatus>(
            healthRes,
            '/api/nexconn/health'
          );
          if (connectEpochRef.current !== startEpoch) return;
          setHealth(healthData);

          if (!healthData.configured) {
            setConnectionStatus('error');
            setConnectionError('Nexconn credentials are not configured on the backend.');
            return;
          }

          let ops: OperatorProfile[] = [];
          const fbUser = firebaseUserRef.current || auth.currentUser;

          if (!healthData.demoAuthAllowed) {
            if (!fbUser) {
              await teardownSessionState(
                'Sign in with an authorized operator account to connect Nexconn War Room.'
              );
              return;
            }
            ops = [
              {
                userId: fbUser.uid,
                name: fbUser.displayName || fbUser.email || 'Authorized Operator',
                role: 'Coastal Operations',
                station: 'Command Workspace',
                initials: (fbUser.displayName || fbUser.email || 'OP').slice(0, 2).toUpperCase(),
              },
            ];
          } else {
            let headers = await buildHeaders(false);
            let dirRes = await fetch(apiUrl('/api/nexconn/directory'), {
              credentials: getApiCredentials(),
              headers,
            });
            if (dirRes.status === 401 && auth.currentUser) {
              headers = await buildHeaders(true);
              dirRes = await fetch(apiUrl('/api/nexconn/directory'), {
                credentials: getApiCredentials(),
                headers,
              });
            }
            if (connectEpochRef.current !== startEpoch) return;

            if (dirRes.ok) {
              const dirData = await parseJsonResponse<{ operators?: OperatorProfile[] }>(
                dirRes,
                '/api/nexconn/directory'
              );
              ops = Array.isArray(dirData?.operators) ? dirData.operators : [];
            } else if (dirRes.status === 403 || dirRes.status === 401) {
              if (fbUser) {
                ops = [
                  {
                    userId: fbUser.uid,
                    name: fbUser.displayName || fbUser.email || 'Authorized Operator',
                    role: 'Coastal Operations',
                    station: 'Command Workspace',
                    initials: (fbUser.displayName || fbUser.email || 'OP').slice(0, 2).toUpperCase(),
                  },
                ];
              } else {
                await teardownSessionState(
                  'Sign in with an authorized operator account to connect Nexconn War Room.'
                );
                return;
              }
            } else {
              throw new Error(`/api/nexconn/directory failed (HTTP ${dirRes.status}).`);
            }
          }

          if (connectEpochRef.current !== startEpoch || ops.length === 0) return;

          setDirectory(ops);
          directoryRef.current = ops;
          const savedId = localStorage.getItem(STORAGE_OPERATOR_KEY);
          const initialOp = ops.find((o) => o.userId === savedId) || ops[0];
          connectedScopeKeyRef.current = currentScopeKey;
          await connectAsOperator(initialOp, ops);
        } catch (err: any) {
          if (connectEpochRef.current !== startEpoch) return;
          setConnectionStatus('error');
          setConnectionError(err?.message || 'Failed to load Nexconn communications.');
        }
      })();

      bootInFlightRef.current = run;
      try {
        await run;
      } finally {
        if (bootInFlightRef.current === run) {
          bootInFlightRef.current = null;
        }
      }
    },
    [connectAsOperator, getIdToken, isOperationalRoute, teardownSessionState]
  );

  // Route-, Auth-, Logout-, and Tenant-aware lazy bootstrap (StrictMode-safe; never eager on public routes)
  useEffect(() => {
    if (authLoading) return;

    const currentUid = firebaseUser?.uid || null;
    if (currentUid) {
      signedOutLatchRef.current = false;
    } else if (prevFirebaseUidRef.current !== null) {
      signedOutLatchRef.current = true;
      connectEpochRef.current += 1;
      bootInFlightRef.current = null;
      prevFirebaseUidRef.current = null;
      void teardownSessionState();
      return;
    }
    prevFirebaseUidRef.current = currentUid;

    if (!signedOutLatchRef.current) {
      void bootstrapAndConnect(false);
    }

    const onRouteChange = () => {
      if (!signedOutLatchRef.current) {
        void bootstrapAndConnect(false);
      }
    };
    const onTenantChange = () => {
      connectEpochRef.current += 1;
      bootInFlightRef.current = null;
      void teardownSessionState().then(() => {
        if (isOperationalRoute() && !signedOutLatchRef.current) {
          void bootstrapAndConnect(true);
        }
      });
    };
    const onAuthLogout = () => {
      signedOutLatchRef.current = true;
      connectEpochRef.current += 1;
      bootInFlightRef.current = null;
      void teardownSessionState();
    };

    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('gg-tenant-changed', onTenantChange);
    window.addEventListener('gg-auth-logout', onAuthLogout);

    return () => {
      connectEpochRef.current += 1;
      bootInFlightRef.current = null;
      clearTypingTimers();
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('gg-tenant-changed', onTenantChange);
      window.removeEventListener('gg-auth-logout', onAuthLogout);
      void disconnectNexconnSession();
    };
  }, [authLoading, firebaseUser?.uid, bootstrapAndConnect, clearTypingTimers, isOperationalRoute, teardownSessionState]);

  const switchOperator = useCallback(
    async (operatorId: string) => {
      const target = directoryRef.current.find((o) => o.userId === operatorId);
      if (!target) return;
      signedOutLatchRef.current = false;
      await connectAsOperator(target, directoryRef.current);
    },
    [connectAsOperator]
  );

  const reconnect = useCallback(async () => {
    signedOutLatchRef.current = false;
    const current = activeOperatorRef.current || directoryRef.current[0];
    if (current && directoryRef.current.length > 0) {
      await connectAsOperator(current, directoryRef.current);
      return;
    }
    connectedScopeKeyRef.current = null;
    await bootstrapAndConnect(true);
  }, [bootstrapAndConnect, connectAsOperator]);

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

  const sendTextToChannel = useCallback(
    async (channelType: CommsChannelType, channelId: string, text: string) => {
      if (!channelId || !text.trim()) return;
      const uid = activeOperatorRef.current?.userId || '';
      const sent = await sendTextViaNexconn(channelType, channelId, text.trim(), uid);
      appendSentMessage(sent);
    },
    [appendSentMessage]
  );

  const sendVoice = useCallback(
    async (file: File) => {
      if (!selectedChannel) return;
      const uid = activeOperatorRef.current?.userId || '';
      setUploadProgress(0);
      try {
        const sent = await sendVoiceViaNexconn(
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

  const verifyCallMediaPermissions = useCallback(async (mediaType: CallMediaKind) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Camera/microphone access requires a secure HTTPS browser context. Use 112 or VHF radio fallback.'
      );
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mediaType === 'video',
      });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error(
          mediaType === 'video'
            ? 'Camera or microphone permission was denied. Allow access in browser settings or switch to Audio-Only / VHF.'
            : 'Microphone permission was denied. Allow microphone access in browser settings to place a call.'
        );
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new Error(
          mediaType === 'video'
            ? 'No camera or microphone detected on this device. Try Audio-Only or VHF radio.'
            : 'No microphone detected on this device.'
        );
      }
      if (name === 'NotReadableError') {
        throw new Error('Camera or microphone is currently in use by another application.');
      }
      throw new Error(err?.message || 'Unable to access camera/microphone for call.');
    }
  }, []);

  const startCall = useCallback(
    async (calleeId: string, mediaType: CallMediaKind) => {
      setCallError(null);
      try {
        if (connectionStatusRef.current !== 'connected') {
          throw new Error('Connect an authenticated Nexconn operator session before placing a call.');
        }
        const validation = validateNexconnCallTarget(calleeId, activeOperatorRef.current?.userId);
        if (validation.ok === false) {
          throw new Error(validation.error);
        }
        await verifyCallMediaPermissions(mediaType);
        const callee = operatorsByIdRef.current[validation.targetId];
        const { callId } = await startNexconnCall(validation.targetId, mediaType);
        setActiveCall({
          callId,
          direction: 'outgoing',
          mediaType,
          status: 'calling',
          remoteUserId: validation.targetId,
          remoteName: callee?.name || validation.targetId,
          remoteRole: callee ? `${callee.role} • ${callee.station}` : undefined,
          isMicEnabled: true,
          isCameraEnabled: mediaType === 'video',
          isRemoteMicMuted: false,
          isRemoteCameraOff: mediaType !== 'video',
          connectedAt: null,
        });
      } catch (err: any) {
        const message = err?.message || 'Unable to start Nexconn call.';
        setCallError(message);
        throw err;
      }
    },
    [verifyCallMediaPermissions]
  );

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);
    const call = incomingCall;
    try {
      await verifyCallMediaPermissions(call.mediaType);
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
    } catch (err: any) {
      setCallError(err?.message || 'Failed to accept incoming call.');
    }
  }, [incomingCall, verifyCallMediaPermissions]);

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
    sendTextToChannel,
    sendImage,
    sendFile,
    sendVoice,
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
