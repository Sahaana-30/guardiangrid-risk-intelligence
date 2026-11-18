import type { Message } from '@nexconn/chat';

export interface OperatorProfile {
  userId: string;
  name: string;
  role: string;
  station: string;
  initials: string;
  avatarUrl?: string;
}

export interface NexconnHealthStatus {
  configured: boolean;
  environment: string;
  demoAuthAllowed: boolean;
  areaCodeIsSG: boolean;
  variables: Record<string, 'CONFIGURED' | 'MISSING'>;
}

export type CommsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'suspended'
  | 'error';

export type CommsChannelType = 'direct' | 'group';

export interface CommsChannel {
  key: string; // `${channelType}:${channelId}`
  channelId: string;
  channelType: CommsChannelType;
  name: string;
  subtitle: string;
  initials: string;
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageTime: number;
  isPinned: boolean;
  memberCount?: number;
}

export type CommsMessageKind = 'text' | 'image' | 'file' | 'system';

export interface CommsMessage {
  messageId: string;
  clientId: number;
  channelKey: string;
  channelId: string;
  channelType: CommsChannelType;
  senderUserId: string;
  direction: 'send' | 'receive';
  kind: CommsMessageKind;
  messageType: string;
  text: string;
  sentTime: number;
  sentStatus: 'sending' | 'sent' | 'failed' | 'read';
  needReceipt: boolean;
  sentReceipt: boolean;
  imageUrl?: string;
  thumbnailBase64?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  uploadProgress?: number;
  readCount?: number;
  totalCount?: number;
  rawMessage?: Message<any>;
}

export type CallMediaKind = 'audio' | 'video';

export interface IncomingCallState {
  callId: string;
  callerUserId: string;
  callerName: string;
  callerRole?: string;
  mediaType: CallMediaKind;
  callType: 'single' | 'multi';
}

export interface ActiveCallState {
  callId: string;
  direction: 'incoming' | 'outgoing';
  mediaType: CallMediaKind;
  status: 'calling' | 'ringing' | 'connecting' | 'oncall';
  remoteUserId: string;
  remoteName: string;
  remoteRole?: string;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isRemoteMicMuted: boolean;
  isRemoteCameraOff: boolean;
  connectedAt: number | null;
}

export function makeChannelKey(channelType: CommsChannelType, channelId: string): string {
  return `${channelType}:${channelId}`;
}
