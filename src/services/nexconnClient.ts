import {
  AreaCode,
  BaseChannel,
  ChannelHandler,
  ChannelType,
  ConnectionStatus,
  ConnectionStatusHandler,
  DirectChannel,
  DirectChannelIdentifier,
  GroupChannel,
  GroupChannelHandler,
  GroupChannelIdentifier,
  Helper,
  LogLevel,
  Message,
  MessageDirection,
  MessageHandler,
  MessageType,
  MessagesQuery,
  NCEngine,
  SendTextMessageParams,
  SentStatus,
  SubscribeType,
  UserHandler,
} from '@nexconn/chat';
import {
  NCCallCode,
  NCCallEndReason,
  NCCallEngine,
  NCCallLogLevel,
  NCCallMediaType,
  NCCallSession,
  NCCallType,
} from '@nexconn/call';
import type {
  CallMediaKind,
  CommsChannel,
  CommsChannelType,
  CommsConnectionStatus,
  CommsMessage,
  OperatorProfile,
} from '../types/comms';
import { makeChannelKey } from '../types/comms';
import {
  AI_SBAR_HANDOFF_CARD_TYPE,
  SOS_TELEMETRY_CARD_TYPE,
  validateAiSbarHandoffPayload,
  validateSosTelemetryPayload,
  type AiSbarHandoffCardPayload,
  type SosTelemetryCardPayload,
} from '../components/comms/NexconnEmergencyCards';
import { ensureNexconnChatUIReady } from './nexconnChatUI';

const HANDLER_ID = 'guardiangrid-comms-main';
const HANDOFF_MARKER_RE = /^\[GG_MEDICAL_HANDOFF:([^:\]]+):([^\]]+)\]/;

let callPluginInstalled = false;
let chatInitializedKey: string | null = null;
let callEngineInstance: NCCallEngine | null = null;

function resolveAreaCode(areaCode?: string): AreaCode {
  switch ((areaCode || 'SG').toUpperCase()) {
    case 'BJ':
      return AreaCode.BJ;
    case 'NA':
      return AreaCode.NA;
    case 'SA':
      return AreaCode.SA;
    case 'OM':
      return AreaCode.OM;
    case 'SG':
    default:
      return AreaCode.SG;
  }
}

export function mapConnectionStatus(status: ConnectionStatus): CommsConnectionStatus {
  switch (status) {
    case ConnectionStatus.CONNECTED:
      return 'connected';
    case ConnectionStatus.CONNECTING:
      return 'connecting';
    case ConnectionStatus.SUSPENDED:
      return 'suspended';
    case ConnectionStatus.DISCONNECTED:
    default:
      return 'disconnected';
  }
}

export function toChannelIdentifier(channelType: CommsChannelType, channelId: string) {
  return channelType === 'group'
    ? new GroupChannelIdentifier(channelId)
    : new DirectChannelIdentifier(channelId);
}

export function toChannelInstance(channelType: CommsChannelType, channelId: string): BaseChannel {
  return channelType === 'group'
    ? new GroupChannel(channelId)
    : new DirectChannel(channelId);
}

function parseCardObject(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function parseServerSosAlertCardText(rawText: string): SosTelemetryCardPayload | null {
  const lines = rawText.split('\n').map((l) => l.trim());
  const header = lines[0]?.match(/\[CRITICAL SOS ALERT CARD\s*·\s*([^\]]+)\]\s*(\S+)/i);
  if (!header) return null;

  const status = header[1].trim();
  const incidentCode = header[2].trim();
  let category = 'drowning';
  let cellLabel = 'Coastal Sector';
  let siteName = 'Coastal Site';
  let lat: number | null = null;
  let lon: number | null = null;
  let reportedAt = new Date().toISOString();
  const assignedResponders: string[] = [];

  for (const line of lines.slice(1)) {
    if (line.startsWith('Type:')) {
      category = line.slice(5).split('/')[0].trim().toLowerCase() || 'drowning';
    } else if (line.startsWith('Beach / Rescue Cell:')) {
      const rest = line.slice('Beach / Rescue Cell:'.length).split('·')[0].trim();
      const [sitePart, cellPart] = rest.split('—').map((s) => s.trim());
      if (sitePart) siteName = sitePart;
      cellLabel = cellPart || sitePart || cellLabel;
    } else if (line.startsWith('GPS:')) {
      const gpsMatch = line.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      if (gpsMatch) {
        lat = Number.parseFloat(gpsMatch[1]);
        lon = Number.parseFloat(gpsMatch[2]);
      }
    } else if (line.startsWith('Time (UTC):')) {
      reportedAt = line.slice('Time (UTC):'.length).trim() || reportedAt;
    } else if (line.startsWith('Nearest Eligible Lifeguards Notified:')) {
      const val = line.slice('Nearest Eligible Lifeguards Notified:'.length).trim();
      if (val) {
        assignedResponders.push(
          ...val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 5)
        );
      }
    }
  }

  return {
    incidentId: '',
    incidentCode,
    priority: category === 'drowning' || category === 'swept_away' ? 'P1 CRITICAL' : 'P1 URGENT',
    category,
    status,
    cellId: incidentCode,
    cellLabel,
    siteName,
    lat: Number.isFinite(lat as number) ? lat : null,
    lon: Number.isFinite(lon as number) ? lon : null,
    assignedResponders,
    reportedAt,
  };
}

export function normalizeEmergencyMessage(params: {
  messageType: string;
  content: Record<string, any>;
}): {
  kind: CommsMessage['kind'];
  text: string;
  sosCard?: SosTelemetryCardPayload;
  sbarCard?: AiSbarHandoffCardPayload;
  handoffMarker?: { reportId: string; incidentId: string };
} {
  const { messageType, content } = params;

  if (messageType === SOS_TELEMETRY_CARD_TYPE) {
    const parsed = validateSosTelemetryPayload(
      parseCardObject(content.content ?? content) ?? content
    );
    if (parsed) {
      return {
        kind: 'sos_card',
        text: `[SOS Telemetry] ${parsed.incidentCode} · ${parsed.priority} · ${parsed.cellLabel}`,
        sosCard: parsed,
      };
    }
    return {
      kind: 'system',
      text: 'SOS Telemetry Alert Card',
    };
  }

  if (messageType === AI_SBAR_HANDOFF_CARD_TYPE) {
    const parsed = validateAiSbarHandoffPayload(
      parseCardObject(content.content ?? content) ?? content
    );
    if (parsed) {
      return {
        kind: 'sbar_card',
        text: `[AI SBAR v${parsed.version}] ${parsed.incidentCode} · ${parsed.approvalStatus}`,
        sbarCard: parsed,
      };
    }
    return {
      kind: 'system',
      text: 'AI Medical SBAR Handoff Card',
    };
  }

  const rawText =
    typeof content.text === 'string'
      ? content.text
      : typeof content.content === 'string'
        ? content.content
        : '';

  if (rawText) {
    const handoffMatch = rawText.match(HANDOFF_MARKER_RE);
    if (handoffMatch) {
      return {
        kind: 'text',
        text: rawText,
        handoffMarker: { reportId: handoffMatch[1], incidentId: handoffMatch[2] },
      };
    }
    if (rawText.includes('[CRITICAL SOS ALERT CARD')) {
      const serverSosCard = parseServerSosAlertCardText(rawText);
      if (serverSosCard) {
        return {
          kind: 'sos_card',
          text: rawText,
          sosCard: serverSosCard,
        };
      }
    }
    return { kind: 'text', text: rawText };
  }

  if (messageType.startsWith('GG:')) {
    const summaryParts = [content.incidentCode, content.title, content.status]
      .filter((v) => typeof v === 'string' && v.trim().length > 0);
    return {
      kind: 'system',
      text:
        summaryParts.length > 0
          ? `Emergency Coordination Card · ${summaryParts.join(' · ')}`
          : 'Emergency Coordination Card',
    };
  }

  return {
    kind: 'text',
    text: messageType === MessageType.TEXT ? '' : `Structured message (${messageType || 'event'})`,
  };
}

export function serializeNexconnMessage(
  msg: Message<any>,
  currentUserId: string
): CommsMessage {
  const channelType: CommsChannelType =
    msg.channelIdentifier?.channelType === ChannelType.GROUP ? 'group' : 'direct';
  const channelId = msg.channelIdentifier?.channelId || '';
  const channelKey = makeChannelKey(channelType, channelId);

  const isOutgoing =
    msg.direction === MessageDirection.SEND ||
    (Boolean(currentUserId) && msg.senderUserId === currentUserId);

  let sentStatus: CommsMessage['sentStatus'] = 'sent';
  if (msg.sentStatus === SentStatus.SENDING) sentStatus = 'sending';
  else if (msg.sentStatus === SentStatus.FAILED) sentStatus = 'failed';
  else if (msg.sentStatus === SentStatus.READ) sentStatus = 'read';

  const content = (msg.content || {}) as Record<string, any>;
  let kind: CommsMessage['kind'] = 'text';
  let text = '';
  let imageUrl: string | undefined;
  let thumbnailBase64: string | undefined;
  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let fileSize: number | undefined;
  let fileType: string | undefined;
  let audioUrl: string | undefined;
  let audioDuration: number | undefined;
  let sosCard: SosTelemetryCardPayload | undefined;
  let sbarCard: AiSbarHandoffCardPayload | undefined;
  let handoffMarker: { reportId: string; incidentId: string } | undefined;

  if (msg.messageType === MessageType.IMAGE) {
    kind = 'image';
    imageUrl = content.remoteUrl || content.imageUri || undefined;
    thumbnailBase64 = content.thumbnailBase64 || content.content || undefined;
    text = '[Image attachment]';
  } else if (msg.messageType === MessageType.HD_VOICE) {
    kind = 'voice';
    audioUrl = content.remoteUrl || content.audioUri || undefined;
    audioDuration = typeof content.duration === 'number' ? content.duration : undefined;
    text = audioDuration ? `Voice note (${audioDuration}s)` : 'Voice note';
  } else if (msg.messageType === MessageType.FILE) {
    kind = 'file';
    fileUrl = content.remoteUrl || content.fileUrl || undefined;
    fileName = content.name || 'Attachment';
    fileSize = typeof content.size === 'number' ? content.size : undefined;
    fileType = content.fileType || content.type || undefined;
    text = fileName || '[File attachment]';
  } else {
    const normalized = normalizeEmergencyMessage({
      messageType: msg.messageType,
      content,
    });
    kind = normalized.kind;
    text = normalized.text;
    sosCard = normalized.sosCard;
    sbarCard = normalized.sbarCard;
    handoffMarker = normalized.handoffMarker;
  }

  return {
    messageId: msg.messageId || `local-${msg.clientId}-${msg.sentTime}`,
    clientId: msg.clientId,
    channelKey,
    channelId,
    channelType,
    senderUserId: msg.senderUserId,
    direction: isOutgoing ? 'send' : 'receive',
    kind,
    messageType: msg.messageType,
    text,
    sentTime: msg.sentTime || Date.now(),
    sentStatus,
    needReceipt: Boolean(msg.needReceipt),
    sentReceipt: Boolean(msg.sentReceipt),
    imageUrl,
    thumbnailBase64,
    fileUrl,
    fileName,
    fileSize,
    fileType,
    audioUrl,
    audioDuration,
    sosCard,
    sbarCard,
    handoffMarker,
    rawMessage: msg,
  };
}

export function previewFromMessage(msg: Message<any> | null): string {
  if (!msg) return 'No messages yet';
  const c = (msg.content || {}) as Record<string, any>;
  if (msg.messageType === MessageType.IMAGE) return 'Image shared';
  if (msg.messageType === MessageType.HD_VOICE) return 'Voice note';
  if (msg.messageType === MessageType.FILE) return `File: ${c.name || 'Attachment'}`;
  const normalized = normalizeEmergencyMessage({
    messageType: msg.messageType,
    content: c,
  });
  return normalized.text.trim() || 'New message';
}

export interface NexconnSessionCallbacks {
  onConnectionStatusChanged: (status: CommsConnectionStatus, code?: number) => void;
  onChannelsSyncComplete: () => void;
  onTypingStatusChanged: (channelKey: string, typingUserIds: string[]) => void;
  onMessagesReceived: (messages: CommsMessage[]) => void;
  onMessagesUpdated: (messages: CommsMessage[]) => void;
  onMessageDeleted: (items: Array<{ channelKey: string; messageId: string }>) => void;
  onReceiptResponses: (
    items: Array<{
      channelKey: string;
      messageId: string;
      readCount: number;
      totalCount: number;
    }>
  ) => void;
  onOnlineStatusChanged: (updates: Record<string, boolean>) => void;
  onGroupOperation: () => void;
  onCallReceived: (session: NCCallSession) => void;
  onCallConnected: (session: NCCallSession) => void;
  onCallEnded: (session: NCCallSession, reason: NCCallEndReason) => void;
  onRemoteCameraStateChanged: (userId: string, disabled: boolean) => void;
  onRemoteMicrophoneStateChanged: (userId: string, disabled: boolean) => void;
}

export async function connectNexconnSession(params: {
  appKey: string;
  areaCode: string;
  token: string;
  currentUserId: string;
  callbacks: NexconnSessionCallbacks;
}): Promise<{ userId: string }> {
  const { appKey, areaCode, token, currentUserId, callbacks } = params;
  const resolvedArea = resolveAreaCode(areaCode);

  // Required official order: install Call plugin before NCEngine.initialize
  if (!callPluginInstalled) {
    NCCallEngine.install();
    callPluginInstalled = true;
  }

  const initSignature = `${appKey}:${resolvedArea}`;
  if (chatInitializedKey !== initSignature) {
    NCEngine.initialize({
      appKey,
      areaCode: resolvedArea,
      logLevel: LogLevel.WARN,
    });
    chatInitializedKey = initSignature;
  }

  // Initialize official Nexconn ChatUI BEFORE NCEngine.connect() so its internal
  // connection-status and channel-sync handlers capture CONNECTED and offline sync events.
  if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
    ensureNexconnChatUIReady();
  }

  // Re-register clean handlers for current session
  NCEngine.removeConnectionStatusHandler(HANDLER_ID);
  NCEngine.removeChannelHandler(HANDLER_ID);
  NCEngine.removeMessageHandler(HANDLER_ID);
  NCEngine.removeUserHandler(HANDLER_ID);
  NCEngine.removeGroupChannelHandler(HANDLER_ID);

  NCEngine.addConnectionStatusHandler(
    HANDLER_ID,
    new ConnectionStatusHandler({
      onConnectionStatusChanged({ status, code }) {
        callbacks.onConnectionStatusChanged(mapConnectionStatus(status), code);
      },
    })
  );

  NCEngine.addChannelHandler(
    HANDLER_ID,
    new ChannelHandler({
      onChannelsSyncComplete() {
        callbacks.onChannelsSyncComplete();
      },
      onChannelStatusSyncCompleted() {
        callbacks.onChannelsSyncComplete();
      },
      onTypingStatusChanged(event) {
        const type: CommsChannelType =
          event.channelIdentifier.channelType === ChannelType.GROUP ? 'group' : 'direct';
        const key = makeChannelKey(type, event.channelIdentifier.channelId);
        const typingUsers = (event.userTypingStatus || [])
          .map((item) => item.userId)
          .filter((id) => Boolean(id) && id !== currentUserId);
        callbacks.onTypingStatusChanged(key, typingUsers);
      },
    })
  );

  NCEngine.addMessageHandler(
    HANDLER_ID,
    new MessageHandler({
      onMessageReceived({ messages }) {
        const serialized = messages
          .filter(
            (m) =>
              m.channelIdentifier?.channelType === ChannelType.DIRECT ||
              m.channelIdentifier?.channelType === ChannelType.GROUP
          )
          .map((m) => serializeNexconnMessage(m, NCEngine.getCurrentUserId() || currentUserId));
        if (serialized.length > 0) {
          callbacks.onMessagesReceived(serialized);
        }
      },
      onMessagesUpdated({ messages }) {
        const serialized = messages.map((m) =>
          serializeNexconnMessage(m, NCEngine.getCurrentUserId() || currentUserId)
        );
        if (serialized.length > 0) {
          callbacks.onMessagesUpdated(serialized);
        }
      },
      onMessageDeleted({ messages }) {
        const items = messages.map((item) => {
          const type: CommsChannelType =
            item.channelIdentifier.channelType === ChannelType.GROUP ? 'group' : 'direct';
          return {
            channelKey: makeChannelKey(type, item.channelIdentifier.channelId),
            messageId: item.messageId,
          };
        });
        if (items.length > 0) callbacks.onMessageDeleted(items);
      },
      onMessageReceiptResponse({ responses }) {
        const mapped = responses.map((r) => {
          const type: CommsChannelType =
            r.channelIdentifier.channelType === ChannelType.GROUP ? 'group' : 'direct';
          return {
            channelKey: makeChannelKey(type, r.channelIdentifier.channelId),
            messageId: r.messageId,
            readCount: r.readCount,
            totalCount: r.totalCount,
          };
        });
        if (mapped.length > 0) callbacks.onReceiptResponses(mapped);
      },
      onOfflineMessageSyncCompleted() {
        callbacks.onChannelsSyncComplete();
      },
    })
  );

  NCEngine.addUserHandler(
    HANDLER_ID,
    new UserHandler({
      onSubscriptionChanged({ events }) {
        const updates: Record<string, boolean> = {};
        for (const ev of events) {
          if (ev.subscribeType === SubscribeType.ONLINE_STATUS && ev.userId) {
            const isOnline = Array.isArray(ev.details)
              ? ev.details.some((d) => d.eventValue === 1)
              : false;
            updates[ev.userId] = isOnline;
          }
        }
        if (Object.keys(updates).length > 0) {
          callbacks.onOnlineStatusChanged(updates);
        }
      },
    })
  );

  NCEngine.addGroupChannelHandler(
    HANDLER_ID,
    new GroupChannelHandler({
      onGroupOperation() {
        callbacks.onGroupOperation();
      },
      onGroupInfoChanged() {
        callbacks.onGroupOperation();
      },
    })
  );

  const connectResult = await NCEngine.connect({ token });
  if (!connectResult.isOk || !connectResult.data?.userId) {
    throw new Error(
      `Nexconn Chat connection failed (code ${connectResult.code}): ${connectResult.msg || 'Unknown error'}`
    );
  }

  // Initialize Call engine after NCEngine.connect()
  callEngineInstance = NCCallEngine.initialize({
    logOutputLevel: NCCallLogLevel.WARN,
    isPubLowResolutionStream: false,
  });

  callEngineInstance.setCallEventHandler({
    onCallReceived(event) {
      callbacks.onCallReceived(event.session);
    },
    onCallConnected(event) {
      callbacks.onCallConnected(event.session);
    },
    onCallEnded(event) {
      callbacks.onCallEnded(event.session, event.reason);
    },
    onRemoteCameraStateChanged(event) {
      callbacks.onRemoteCameraStateChanged(event.userId, event.disabled);
    },
    onRemoteMicrophoneStateChanged(event) {
      callbacks.onRemoteMicrophoneStateChanged(event.userId, event.disabled);
    },
  });

  return { userId: connectResult.data.userId };
}

export async function disconnectNexconnSession(): Promise<void> {
  if (!chatInitializedKey) return;
  try {
    NCEngine.removeConnectionStatusHandler(HANDLER_ID);
    NCEngine.removeChannelHandler(HANDLER_ID);
    NCEngine.removeMessageHandler(HANDLER_ID);
    NCEngine.removeUserHandler(HANDLER_ID);
    NCEngine.removeGroupChannelHandler(HANDLER_ID);
    if (callEngineInstance) {
      try {
        callEngineInstance.setCallEventHandler({
          onCallReceived() {},
          onCallEnded() {},
          onCallConnected() {},
        });
      } catch {
        // Ignore call handler teardown errors
      }
      callEngineInstance = null;
    }
    await NCEngine.disconnect();
  } catch {
    // Ignore disconnect errors during cleanup
  }
}

export async function fetchNexconnChannels(
  operatorsById: Record<string, OperatorProfile>
): Promise<CommsChannel[]> {
  const query = BaseChannel.createChannelsQuery({ pageSize: 40 });
  const result = await query.loadNextPage();
  if (!result.isOk || !result.data?.data) {
    return [];
  }

  const rawChannels = result.data.data.filter(
    (ch) => ch.channelType === ChannelType.DIRECT || ch.channelType === ChannelType.GROUP
  );

  const groupIds = rawChannels
    .filter((ch) => ch.channelType === ChannelType.GROUP)
    .map((ch) => ch.channelId);

  const groupInfoMap: Record<string, { name: string; memberCount?: number }> = {};
  if (groupIds.length > 0) {
    const infoRes = await GroupChannel.getGroupsInfo(groupIds);
    if (infoRes.isOk && Array.isArray(infoRes.data)) {
      for (const g of infoRes.data) {
        groupInfoMap[g.groupId] = {
          name: g.groupName || g.groupId,
          memberCount: g.membersCount,
        };
      }
    }
  }

  return rawChannels.map((ch) => {
    const type: CommsChannelType = ch.channelType === ChannelType.GROUP ? 'group' : 'direct';
    const key = makeChannelKey(type, ch.channelId);

    if (type === 'group') {
      const gInfo = groupInfoMap[ch.channelId];
      const name = gInfo?.name || `Group ${ch.channelId}`;
      return {
        key,
        channelId: ch.channelId,
        channelType: 'group',
        name,
        subtitle: gInfo?.memberCount ? `${gInfo.memberCount} members` : 'Response group channel',
        initials: name.slice(0, 2).toUpperCase(),
        unreadCount: ch.unreadCount || 0,
        lastMessagePreview: previewFromMessage(ch.latestMessage),
        lastMessageTime: ch.latestMessage?.sentTime || ch.operationTime || Date.now(),
        isPinned: Boolean(ch.isPinned),
        memberCount: gInfo?.memberCount,
      };
    }

    const op = operatorsById[ch.channelId];
    const name = op?.name || ch.channelId;
    return {
      key,
      channelId: ch.channelId,
      channelType: 'direct',
      name,
      subtitle: op ? `${op.role} • ${op.station}` : 'Direct operator channel',
      initials: op?.initials || ch.channelId.slice(0, 2).toUpperCase(),
      unreadCount: ch.unreadCount || 0,
      lastMessagePreview: previewFromMessage(ch.latestMessage),
      lastMessageTime: ch.latestMessage?.sentTime || ch.operationTime || Date.now(),
      isPinned: Boolean(ch.isPinned),
    };
  });
}

export function createNexconnMessagesQuery(
  channelType: CommsChannelType,
  channelId: string,
  pageSize = 25
): MessagesQuery {
  return BaseChannel.createMessagesQuery({
    channelIdentifier: toChannelIdentifier(channelType, channelId),
    isAscending: false,
    pageSize,
  });
}

export async function sendTextViaNexconn(
  channelType: CommsChannelType,
  channelId: string,
  text: string,
  currentUserId: string
): Promise<CommsMessage> {
  const channel = toChannelInstance(channelType, channelId);
  const params = new SendTextMessageParams({ text });
  params.needReceipt = true;
  const res = await channel.sendMessage(params);
  if (!res.isOk || !res.data) {
    throw new Error(`Failed to send message (code ${res.code}): ${res.msg || 'Unknown error'}`);
  }
  return serializeNexconnMessage(res.data, currentUserId);
}

export async function sendImageViaNexconn(
  channelType: CommsChannelType,
  channelId: string,
  file: File,
  currentUserId: string,
  onProgress?: (percent: number) => void
): Promise<CommsMessage> {
  const channel = toChannelInstance(channelType, channelId);
  const paramsRes = await Helper.createSendImageMessageParams(file);
  if (!paramsRes.isOk || !paramsRes.data) {
    throw new Error(`Unable to prepare image (${paramsRes.code}): ${paramsRes.msg}`);
  }

  const params = paramsRes.data;
  params.needReceipt = true;
  if (onProgress) {
    params.onUploadProgress = (progress) => onProgress(progress);
  }

  const sendRes = await channel.sendMediaMessage(params);
  if (!sendRes.isOk || !sendRes.data) {
    throw new Error(
      `Failed to upload image (code ${sendRes.code}): ${sendRes.msg || 'Ensure media storage is enabled in Nexconn Console'}`
    );
  }
  return serializeNexconnMessage(sendRes.data, currentUserId);
}

export async function sendFileViaNexconn(
  channelType: CommsChannelType,
  channelId: string,
  file: File,
  currentUserId: string,
  onProgress?: (percent: number) => void
): Promise<CommsMessage> {
  const channel = toChannelInstance(channelType, channelId);
  const paramsRes = await Helper.createSendFileMessageParams(file);
  if (!paramsRes.isOk || !paramsRes.data) {
    throw new Error(`Unable to prepare file (${paramsRes.code}): ${paramsRes.msg}`);
  }

  const params = paramsRes.data;
  params.needReceipt = true;
  if (onProgress) {
    params.onUploadProgress = (progress) => onProgress(progress);
  }

  const sendRes = await channel.sendMediaMessage(params);
  if (!sendRes.isOk || !sendRes.data) {
    throw new Error(
      `Failed to upload file (code ${sendRes.code}): ${sendRes.msg || 'Ensure media storage is enabled in Nexconn Console'}`
    );
  }
  return serializeNexconnMessage(sendRes.data, currentUserId);
}

export async function sendVoiceViaNexconn(
  channelType: CommsChannelType,
  channelId: string,
  file: File,
  currentUserId: string,
  onProgress?: (percent: number) => void
): Promise<CommsMessage> {
  const channel = toChannelInstance(channelType, channelId);
  const paramsRes = await Helper.createSendHDVoiceMessageParams(file);
  if (!paramsRes.isOk || !paramsRes.data) {
    throw new Error(
      `Unable to prepare voice note (${paramsRes.code}): ${paramsRes.msg || 'Unsupported audio format'}`
    );
  }

  const params = paramsRes.data;
  params.needReceipt = true;
  if (onProgress) {
    params.onUploadProgress = (progress) => onProgress(progress);
  }

  const sendRes = await channel.sendMediaMessage(params);
  if (!sendRes.isOk || !sendRes.data) {
    throw new Error(
      `Failed to upload voice note (code ${sendRes.code}): ${sendRes.msg || 'Ensure media storage is enabled in Nexconn Console'}`
    );
  }
  return serializeNexconnMessage(sendRes.data, currentUserId);
}

export async function sendTypingIndicator(userId: string): Promise<void> {
  try {
    const direct = new DirectChannel(userId);
    await direct.sendTypingStatus(MessageType.TEXT);
  } catch {
    // Non-critical indicator
  }
}

export async function markChannelReadAndSendReceipts(
  channelType: CommsChannelType,
  channelId: string,
  receivedMessageIds: string[]
): Promise<void> {
  const channel = toChannelInstance(channelType, channelId);
  try {
    await channel.clearUnreadCount();
  } catch {
    // Ignore
  }
  if (receivedMessageIds.length > 0) {
    try {
      await channel.sendReadReceiptResponse(receivedMessageIds);
    } catch {
      // Ignore
    }
  }
}

export async function createGroupViaNexconn(params: {
  groupName: string;
  inviteeUserIds: string[];
}): Promise<string> {
  const groupId = `gg-grp-${Date.now().toString(36)}`;
  const res = await GroupChannel.createGroup({
    groupId,
    groupName: params.groupName.trim(),
    inviteeUserIds: params.inviteeUserIds,
  });
  if (!res.isOk) {
    throw new Error(`Failed to create group (code ${res.code}): ${res.msg || 'Unknown error'}`);
  }
  return groupId;
}

export async function subscribeAndFetchOnlineStatus(
  userIds: string[]
): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  if (userIds.length === 0) return map;
  try {
    await NCEngine.userModule.subscribeEvent({
      subscribeType: SubscribeType.ONLINE_STATUS,
      userIds,
      expiry: 3600,
    });
    const res = await NCEngine.userModule.getSubscribeUsersOnlineStatus(userIds);
    if (res.isOk && Array.isArray(res.data)) {
      for (const item of res.data) {
        map[item.userId] = Boolean(item.isOnline);
      }
    }
  } catch {
    // Ignore presence failures gracefully
  }
  return map;
}

export async function startNexconnCall(
  calleeId: string,
  mediaType: CallMediaKind
): Promise<{ callId: string }> {
  const engine = callEngineInstance || NCCallEngine.initialize({ logOutputLevel: NCCallLogLevel.WARN });
  callEngineInstance = engine;

  const res = await engine.startCall({
    calleeIds: [calleeId],
    callType: NCCallType.SINGLE,
    mediaType: mediaType === 'video' ? NCCallMediaType.AUDIO_VIDEO : NCCallMediaType.AUDIO,
  });

  if (res.code !== NCCallCode.SUCCESS || !res.callId) {
    if (res.busyLineUserList && res.busyLineUserList.length > 0) {
      throw new Error('Selected operator is currently busy on another call.');
    }
    throw new Error(`Unable to start call (code ${res.code}).`);
  }

  return { callId: res.callId };
}

export async function acceptNexconnCall(callId: string): Promise<void> {
  const engine = callEngineInstance;
  if (!engine) throw new Error('Call engine is not initialized.');
  const res = await engine.acceptCall({ callId });
  if (res.code !== NCCallCode.SUCCESS) {
    throw new Error(`Failed to accept call (code ${res.code}).`);
  }
}

export async function endNexconnCall(callId?: string): Promise<void> {
  const engine = callEngineInstance;
  if (!engine) return;
  try {
    await engine.endCall(callId ? { callId } : undefined);
  } catch {
    // Ignore hangup errors when call already ended
  }
}

export async function setCallMicrophone(enable: boolean): Promise<boolean> {
  const engine = callEngineInstance;
  if (!engine) return enable;
  const res = await engine.enableMicrophone(enable);
  return res.code === NCCallCode.SUCCESS ? enable : !enable;
}

export async function setCallCamera(enable: boolean): Promise<boolean> {
  const engine = callEngineInstance;
  if (!engine) return enable;
  const res = await engine.enableCamera(enable);
  return res.code === NCCallCode.SUCCESS ? enable : !enable;
}

export function bindCallVideoElements(params: {
  localVideoEl: HTMLVideoElement | null;
  remoteVideoEl: HTMLVideoElement | null;
  remoteUserId: string;
}): void {
  const engine = callEngineInstance;
  if (!engine) return;
  if (params.localVideoEl) {
    engine.setLocalVideoView({ videoElement: params.localVideoEl });
  }
  if (params.remoteVideoEl && params.remoteUserId) {
    engine.setRemoteVideoView([
      { userId: params.remoteUserId, videoElement: params.remoteVideoEl },
    ]);
  }
}

export function unbindCallVideoElements(userIds: string[]): void {
  const engine = callEngineInstance;
  if (!engine || userIds.length === 0) return;
  try {
    engine.removeVideoView(userIds);
  } catch {
    // Ignore view teardown errors
  }
}
