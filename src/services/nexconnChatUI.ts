import {
  GroupChannelIdentifier,
  LogLevel,
  SendMessageParams,
} from '@nexconn/chat';
import {
  BubbleLayout,
  ChatUICommand,
  NCChatUIApplication,
  type ChatUISystemProfile,
  type ChatUIUserProfile,
  type GroupMemberProfile,
  type GroupProfile,
  type ServiceHooks,
} from '@nexconn/chatui';
import type { OperatorProfile } from '../types/comms';
import type { EmergencyIncident, ResponderProfile } from '../types/emergency';
import {
  AI_SBAR_HANDOFF_CARD_TYPE,
  SOS_TELEMETRY_CARD_TYPE,
  getEmergencyCustomMessageRegistrations,
  validateAiSbarHandoffPayload,
  validateSosTelemetryPayload,
  type AiSbarHandoffCardPayload,
  type SosTelemetryCardPayload,
} from '../components/comms/NexconnEmergencyCards';

interface ProfileRegistryState {
  operators: Map<string, OperatorProfile>;
  responders: Map<string, ResponderProfile>;
  incidentsByGroupId: Map<string, EmergencyIncident>;
}

const registry: ProfileRegistryState = {
  operators: new Map(),
  responders: new Map(),
  incidentsByGroupId: new Map(),
};

let chatUIInstance: NCChatUIApplication | null = null;
let initError: string | null = null;
let activeChatUIEpoch = 0;

export function syncChatUIProfileRegistry(params: {
  operators?: OperatorProfile[];
  responders?: ResponderProfile[];
  incidents?: EmergencyIncident[];
}): void {
  if (params.operators) {
    registry.operators.clear();
    for (const op of params.operators) {
      registry.operators.set(op.userId, op);
    }
  }
  if (params.responders) {
    registry.responders.clear();
    for (const r of params.responders) {
      registry.responders.set(r.id, r);
      if (r.nexconnUserId) {
        registry.responders.set(r.nexconnUserId, r);
      }
    }
  }
  if (params.incidents) {
    registry.incidentsByGroupId.clear();
    for (const inc of params.incidents) {
      if (inc.nexconnGroupId) {
        registry.incidentsByGroupId.set(inc.nexconnGroupId, inc);
      }
    }
  }
}

function resolveUserProfile(userId: string): ChatUIUserProfile {
  const op = registry.operators.get(userId);
  if (op) {
    return {
      userId,
      name: `${op.name} (${op.role})`,
      avatarUrl: op.avatarUrl,
    };
  }
  const resp = registry.responders.get(userId);
  if (resp) {
    return {
      userId,
      name: `${resp.name} · ${resp.radioCallsign}`,
    };
  }
  if (userId.startsWith('pub-sos-')) {
    return {
      userId,
      name: `Public SOS Bystander (${userId.slice(-4).toUpperCase()})`,
    };
  }
  return {
    userId,
    name: userId,
  };
}

function buildServiceHooks(): ServiceHooks {
  return {
    async reqUserProfiles(userIds: string[]): Promise<ChatUIUserProfile[]> {
      return userIds.map(resolveUserProfile);
    },
    async reqGroupProfiles(groupIds: string[]): Promise<GroupProfile[]> {
      return groupIds.map((groupId) => {
        const inc = registry.incidentsByGroupId.get(groupId);
        if (inc) {
          return {
            groupId,
            name: inc.nexconnGroupName || `${inc.code} · ${inc.cellId}`,
            memberCount: Math.max(2, inc.assignedResponderIds.length + 2),
          };
        }
        return {
          groupId,
          name: groupId.startsWith('sos-') ? `War Room · ${groupId}` : `Rescue Group · ${groupId}`,
          memberCount: 2,
        };
      });
    },
    async reqSystemProfiles(targetIds: string[]): Promise<ChatUISystemProfile[]> {
      return targetIds.map((systemId) => ({
        systemId,
        name: 'GuardianGrid Command System',
      }));
    },
    async reqGroupMembers(groupId: string): Promise<GroupMemberProfile[]> {
      const inc = registry.incidentsByGroupId.get(groupId);
      const members: GroupMemberProfile[] = [];
      if (inc) {
        if (inc.verifiedBy) {
          members.push({ userId: `dispatcher-${inc.id}`, nickname: inc.verifiedBy });
        }
        for (const rid of inc.assignedResponderIds) {
          const r = registry.responders.get(rid);
          members.push({
            userId: r?.nexconnUserId || rid,
            nickname: r ? `${r.name} (${r.radioCallsign})` : rid,
          });
        }
      }
      return members;
    },
    getDefaultUserProfile(userId: string): ChatUIUserProfile {
      return resolveUserProfile(userId);
    },
    getDefaultGroupProfile(groupId: string): GroupProfile {
      const inc = registry.incidentsByGroupId.get(groupId);
      return {
        groupId,
        name: inc?.nexconnGroupName || groupId,
        memberCount: inc ? Math.max(2, inc.assignedResponderIds.length + 2) : 2,
      };
    },
  };
}

/**
 * Initializes the official Nexconn Web ChatUI singleton AFTER NCEngine.initialize()
 * has already been called by src/services/nexconnClient.ts.
 * Prevents duplicate NCEngine initialization or duplicate connections.
 */
export function ensureNexconnChatUIReady(): {
  app: NCChatUIApplication | null;
  error: string | null;
  epoch: number;
} {
  if (chatUIInstance && chatUIInstance.ifReady()) {
    return { app: chatUIInstance, error: null, epoch: activeChatUIEpoch };
  }

  try {
    const app = NCChatUIApplication.initialize({
      hooks: buildServiceHooks(),
      language: 'en_US',
      logLevel: LogLevel.WARN,
    });

    if (!app) {
      initError =
        'NCChatUIApplication.initialize() returned null. Ensure Nexconn Chat SDK is initialized and connected first.';
      return { app: null, error: initError, epoch: activeChatUIEpoch };
    }

    if (!app.ifReady()) {
      // Configure official ChatUI capabilities strictly BEFORE calling ready()
      app.setCommandSwitch(ChatUICommand.SHOW_MESSAGE_STATE, true);
      app.setCommandSwitch(ChatUICommand.SHOW_CONNECTION_STATUS_IN_CHANNEL_LIST, true);
      app.setMessageBubbleConfig({
        layout: BubbleLayout.LEFT_RIGHT,
        showMyProfileInGroupChannel: true,
      });

      // Register official custom emergency message cards BEFORE ready()
      app.registerCustomMessages(getEmergencyCustomMessageRegistrations());

      app.ready();
      activeChatUIEpoch += 1;
    }

    chatUIInstance = app;
    initError = null;
    return { app, error: null, epoch: activeChatUIEpoch };
  } catch (err: any) {
    initError = err?.message || 'Failed to initialize Nexconn Web ChatUI.';
    return { app: null, error: initError, epoch: activeChatUIEpoch };
  }
}

export function getNexconnChatUIStatus(): {
  ready: boolean;
  error: string | null;
  epoch: number;
} {
  return {
    ready: Boolean(chatUIInstance && chatUIInstance.ifReady()),
    error: initError,
    epoch: activeChatUIEpoch,
  };
}

export function getNexconnChatUIInstance(): NCChatUIApplication | null {
  return chatUIInstance;
}

export function getChatUIEpoch(): number {
  return activeChatUIEpoch;
}

export function destroyNexconnChatUI(expectedEpoch?: number): void {
  if (expectedEpoch !== undefined && expectedEpoch !== activeChatUIEpoch) {
    return;
  }
  // NCEngine has no uninitialize/destroy API and retains the installed 'ChatUI' plugin
  // for the lifetime of the page; ChatUI internally handles disconnect and user-switch
  // cache resets when NCEngine reconnects. Calling app.destroy() here would detach
  // internal handlers while leaving the cached plugin marked ready.
  activeChatUIEpoch += 1;
  initError = null;
}

const CHANNEL_LIST_NOT_READY_CODE = 39005;

export async function openIncidentGroupInChatUI(
  groupId: string,
  options?: { maxWaitMs?: number; isCancelled?: () => boolean }
): Promise<{
  ok: boolean;
  code?: number;
  error?: string;
}> {
  const { app, error } = ensureNexconnChatUIReady();
  if (!app) {
    return { ok: false, error: error || 'ChatUI not initialized.' };
  }

  const maxWaitMs = options?.maxWaitMs ?? 6000;
  const deadline = Date.now() + maxWaitMs;
  const identifier = new GroupChannelIdentifier(groupId);

  try {
    while (true) {
      if (options?.isCancelled?.()) {
        return { ok: false, error: 'Cancelled.' };
      }

      const res = await app.openChannel(identifier, true);
      if (!res || res.isOk) {
        return { ok: true };
      }

      if (res.code === CHANNEL_LIST_NOT_READY_CODE && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }

      const reason =
        res.code === CHANNEL_LIST_NOT_READY_CODE
          ? 'Nexconn ChatUI channel list sync did not finish before opening the War Room. Reconnect or retry.'
          : res.msg || `Unable to open Nexconn group channel (code ${res.code}).`;
      return { ok: false, code: res.code, error: reason };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unable to open group channel in ChatUI.' };
  }
}

export async function sendSosTelemetryCardToGroup(
  groupId: string,
  payload: SosTelemetryCardPayload
): Promise<{ ok: boolean; error?: string }> {
  const validated = validateSosTelemetryPayload(payload);
  if (!validated) {
    return { ok: false, error: 'Invalid SOS Telemetry Card payload.' };
  }
  const { app, error } = ensureNexconnChatUIReady();
  if (!app) {
    return { ok: false, error: error || 'ChatUI is not ready.' };
  }
  try {
    const params = new SendMessageParams(validated, SOS_TELEMETRY_CARD_TYPE);
    params.needReceipt = true;
    const res = await app.sendMessage(new GroupChannelIdentifier(groupId), params);
    if (res && res.isOk === false) {
      return {
        ok: false,
        error: res.msg || `Failed to send SOS Telemetry Card (code ${res.code}).`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to send SOS Telemetry Card.' };
  }
}

export async function sendAiSbarHandoffCardToGroup(
  groupId: string,
  payload: AiSbarHandoffCardPayload
): Promise<{ ok: boolean; error?: string }> {
  const validated = validateAiSbarHandoffPayload(payload);
  if (!validated) {
    return { ok: false, error: 'Invalid AI Medical SBAR Handoff Card payload.' };
  }
  const { app, error } = ensureNexconnChatUIReady();
  if (!app) {
    return { ok: false, error: error || 'ChatUI is not ready.' };
  }
  try {
    const params = new SendMessageParams(validated, AI_SBAR_HANDOFF_CARD_TYPE);
    params.needReceipt = true;
    const res = await app.sendMessage(new GroupChannelIdentifier(groupId), params);
    if (res && res.isOk === false) {
      return {
        ok: false,
        error: res.msg || `Failed to send AI Medical SBAR Handoff Card (code ${res.code}).`,
      };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to send AI Medical SBAR Handoff Card.' };
  }
}
