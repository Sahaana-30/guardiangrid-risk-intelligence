import { randomInt } from 'crypto';
import { Configuration } from '@nexconn/server-sdk/configuration.ts';
import { MessageManagementApi } from '@nexconn/server-sdk/api.ts';
import type { NexconnMessageReference } from '../../src/types/medicalHandoff.ts';

function cleanEnvValue(value?: string): string {
  const trimmed = (value || '').trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeDomainUrl(domain?: string): string {
  const cleaned = cleanEnvValue(domain).replace(/\/+$/, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  return `https://${cleaned}`;
}

function createNexconnConfig(): Configuration | null {
  const appKey = cleanEnvValue(process.env.NEXCONN_APP_KEY);
  const appSecret = cleanEnvValue(process.env.NEXCONN_APP_SECRET);
  const primary = normalizeDomainUrl(process.env.NEXCONN_PRIMARY_API_DOMAIN);
  const secondary = normalizeDomainUrl(process.env.NEXCONN_SECONDARY_API_DOMAIN);
  if (!appKey || !appSecret || !primary || !secondary) return null;

  const configuration = new Configuration();
  configuration.setNexconnCredentials(appKey, appSecret);
  configuration.setPrimaryBackupDomains(primary, secondary);
  configuration.setAutoFailoverEnabled(true);
  configuration.setNonceGenerator(() => String(randomInt(100000000, 999999999)));
  return configuration;
}

/**
 * Retrieves recent messages from a Nexconn group channel using the verified
 * @nexconn/server-sdk MessageManagementApi.listGroupChannelHistoryMessages().
 * - Never downloads private media files.
 * - Never invents voice-note transcripts; marks them unavailable unless present.
 */
export async function fetchNexconnGroupContext(params: {
  groupId: string | null;
  participantUserId: string;
}): Promise<{
  status: 'ok' | 'no_group' | 'unavailable';
  messages: NexconnMessageReference[];
}> {
  if (!params.groupId) {
    return { status: 'no_group', messages: [] };
  }

  const config = createNexconnConfig();
  if (!config) {
    return { status: 'unavailable', messages: [] };
  }

  try {
    const api = new MessageManagementApi(config);
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const { data } = await api.listGroupChannelHistoryMessages({
      userId: params.participantUserId,
      channelId: params.groupId,
      startAt: now,
      endAt: sevenDaysAgo,
      includeStart: true,
    });

    const rawItems: any[] =
      (data as any)?.result?.messages ||
      (data as any)?.result?.list ||
      (Array.isArray((data as any)?.result) ? (data as any).result : []);

    const refs: NexconnMessageReference[] = rawItems.slice(0, 25).map((item: any, idx: number) => {
      const msgType = String(item?.messageType || item?.objectName || '');
      const senderUserId = String(item?.fromUserId || item?.senderUserId || 'unknown');
      const sentTs = Number(item?.sentTime || item?.timestamp || Date.now());
      const sentAt = new Date(Number.isFinite(sentTs) ? sentTs : Date.now()).toISOString();
      const messageId = String(item?.messageId || item?.messageUId || `msg-${idx}`);

      let parsedContent: any = null;
      if (typeof item?.content === 'string') {
        try {
          parsedContent = JSON.parse(item.content);
        } catch {
          parsedContent = { content: item.content };
        }
      } else if (item?.content && typeof item.content === 'object') {
        parsedContent = item.content;
      }

      if (msgType === 'RC:TxtMsg' || msgType.toLowerCase().includes('txt')) {
        const text = String(parsedContent?.content || parsedContent?.text || '').trim();
        return {
          messageId,
          senderUserId,
          sentAt,
          kind: 'text',
          textPreview: text.slice(0, 400),
        };
      }

      if (msgType === 'GG:SOS_TELEMETRY_CARD') {
        const code = String(parsedContent?.incidentCode || 'SOS');
        const status = String(parsedContent?.status || 'ACTIVE');
        const loc = String(parsedContent?.cellLabel || parsedContent?.cellId || '');
        return {
          messageId,
          senderUserId,
          sentAt,
          kind: 'text',
          textPreview: `[SOS Telemetry Card] ${code} (${status})${loc ? ` at ${loc}` : ''}`,
        };
      }

      if (msgType === 'GG:AI_SBAR_MEDICAL_HANDOFF') {
        const code = String(parsedContent?.incidentCode || 'SOS');
        const ver = parsedContent?.version ? `v${parsedContent.version}` : '';
        const sit = String(parsedContent?.situationSummary || '').slice(0, 260);
        return {
          messageId,
          senderUserId,
          sentAt,
          kind: 'text',
          textPreview: `[AI SBAR ${ver}] ${code}: ${sit}`.trim(),
        };
      }

      if (msgType === 'RC:HQVCMsg' || msgType === 'RC:VcMsg' || msgType.toLowerCase().includes('vc')) {
        const actualTranscript =
          typeof parsedContent?.transcript === 'string' && parsedContent.transcript.trim()
            ? parsedContent.transcript.trim()
            : null;
        return {
          messageId,
          senderUserId,
          sentAt,
          kind: 'voice',
          voiceTranscriptStatus: actualTranscript ? 'available' : 'unavailable',
          voiceTranscript: actualTranscript,
        };
      }

      if (msgType === 'RC:ImgMsg' || msgType.toLowerCase().includes('img')) {
        return {
          messageId,
          senderUserId,
          sentAt,
          kind: 'image',
          imageMetadata: {
            uploadedAt: sentAt,
            fileType: String(parsedContent?.type || 'image'),
            senderUserId,
            note: 'Image metadata only; private image content not downloaded or clinically interpreted.',
          },
        };
      }

      return {
        messageId,
        senderUserId,
        sentAt,
        kind: 'other',
        textPreview: msgType ? `Structured message (${msgType})` : undefined,
      };
    });

    return { status: 'ok', messages: refs };
  } catch (err: any) {
    console.warn('Nexconn group history retrieval unavailable:', err?.message || 'Unknown error');
    return { status: 'unavailable', messages: [] };
  }
}

/**
 * Publishes an approved medical handoff reference notification to the Nexconn incident group
 * using MessageManagementApi.sendGroupChannelMessage() with a compatible RC:TxtMsg payload.
 * GuardianGrid chat clients recognize the [GG_MEDICAL_HANDOFF:<reportId>:<incidentId>] marker
 * and render the interactive MedicalHandoffCard component inline.
 */
export async function publishMedicalHandoffToNexconnGroup(params: {
  groupId: string;
  fromUserId: string;
  reportId: string;
  incidentId: string;
  incidentCode: string;
  version: number;
  severity: string;
  approvedByName: string;
  summaryLine: string;
}): Promise<{ sent: boolean; messageId: string | null; error?: string }> {
  const config = createNexconnConfig();
  if (!config) {
    return { sent: false, messageId: null, error: 'Nexconn server credentials not configured.' };
  }

  try {
    const api = new MessageManagementApi(config);
    const textBody =
      `[GG_MEDICAL_HANDOFF:${params.reportId}:${params.incidentId}]\n` +
      `APPROVED MEDICAL HANDOFF v${params.version} · ${params.incidentCode} · Severity: ${params.severity}\n` +
      `Reviewed by: ${params.approvedByName}\n` +
      `${params.summaryLine}\n` +
      `Disclaimer: Preliminary operational handoff support — paramedics must independently assess the patient.`;

    const { data } = await api.sendGroupChannelMessage({
      fromUserId: params.fromUserId,
      toChannelIds: [params.groupId],
      messageType: 'RC:TxtMsg',
      content: JSON.stringify({ content: textBody }),
    });

    const messageId =
      String((data as any)?.result?.messageId || (data as any)?.result?.messageUId || '') || null;
    return { sent: true, messageId };
  } catch (err: any) {
    return {
      sent: false,
      messageId: null,
      error: err?.message || 'Unable to publish medical handoff notification to Nexconn group.',
    };
  }
}
