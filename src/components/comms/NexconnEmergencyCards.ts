import type { ChatUICustomMessageRegistration, ChatUIMessageModel } from '@nexconn/chatui';

export const SOS_TELEMETRY_CARD_TYPE = 'GG:SOS_TELEMETRY_CARD';
export const AI_SBAR_HANDOFF_CARD_TYPE = 'GG:AI_SBAR_MEDICAL_HANDOFF';

export interface SosTelemetryCardPayload {
  incidentId: string;
  incidentCode: string;
  priority: 'P1 CRITICAL' | 'P1 URGENT' | 'P2 PRIORITY';
  category: string;
  status: string;
  cellId: string;
  cellLabel: string;
  siteName: string;
  lat: number | null;
  lon: number | null;
  assignedResponders: string[];
  isSimulated?: boolean;
  reportedAt: string;
}

export interface AiSbarHandoffCardPayload {
  incidentId: string;
  incidentCode: string;
  version: number;
  approvalStatus: 'APPROVED' | 'DRAFT_PENDING_REVIEW' | 'REJECTED';
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE';
  situationSummary: string;
  recommendationSummary: string;
  authorizedBy?: string | null;
  medicalDisclaimer: string;
  generatedAt: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateSosTelemetryPayload(raw: unknown): SosTelemetryCardPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.incidentCode !== 'string' || !obj.incidentCode.trim()) return null;
  if (typeof obj.cellId !== 'string' || !obj.cellId.trim()) return null;

  const validPriorities = ['P1 CRITICAL', 'P1 URGENT', 'P2 PRIORITY'];
  const priority = validPriorities.includes(String(obj.priority))
    ? (String(obj.priority) as SosTelemetryCardPayload['priority'])
    : 'P1 CRITICAL';

  return {
    incidentId: typeof obj.incidentId === 'string' ? obj.incidentId : '',
    incidentCode: obj.incidentCode.trim().slice(0, 40),
    priority,
    category: typeof obj.category === 'string' ? obj.category.slice(0, 40) : 'drowning',
    status: typeof obj.status === 'string' ? obj.status.slice(0, 40) : 'UNVERIFIED',
    cellId: obj.cellId.trim().slice(0, 32),
    cellLabel: typeof obj.cellLabel === 'string' ? obj.cellLabel.slice(0, 80) : obj.cellId,
    siteName: typeof obj.siteName === 'string' ? obj.siteName.slice(0, 80) : 'Coastal Sector',
    lat: typeof obj.lat === 'number' && Number.isFinite(obj.lat) ? obj.lat : null,
    lon: typeof obj.lon === 'number' && Number.isFinite(obj.lon) ? obj.lon : null,
    assignedResponders: Array.isArray(obj.assignedResponders)
      ? obj.assignedResponders.filter((r): r is string => typeof r === 'string').slice(0, 5)
      : [],
    isSimulated: Boolean(obj.isSimulated),
    reportedAt: typeof obj.reportedAt === 'string' ? obj.reportedAt : new Date().toISOString(),
  };
}

export function validateAiSbarHandoffPayload(raw: unknown): AiSbarHandoffCardPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.incidentCode !== 'string' || !obj.incidentCode.trim()) return null;
  if (typeof obj.situationSummary !== 'string' || !obj.situationSummary.trim()) return null;

  const approvalStatus =
    obj.approvalStatus === 'APPROVED' || obj.approvalStatus === 'REJECTED'
      ? obj.approvalStatus
      : 'DRAFT_PENDING_REVIEW';

  const severity =
    obj.severity === 'CRITICAL' || obj.severity === 'HIGH' || obj.severity === 'MODERATE'
      ? obj.severity
      : 'HIGH';

  return {
    incidentId: typeof obj.incidentId === 'string' ? obj.incidentId : '',
    incidentCode: obj.incidentCode.trim().slice(0, 40),
    version: typeof obj.version === 'number' && obj.version > 0 ? Math.floor(obj.version) : 1,
    approvalStatus,
    severity,
    situationSummary: obj.situationSummary.trim().slice(0, 360),
    recommendationSummary:
      typeof obj.recommendationSummary === 'string'
        ? obj.recommendationSummary.trim().slice(0, 320)
        : 'Confirm clinical assessment on scene with receiving medical team.',
    authorizedBy: typeof obj.authorizedBy === 'string' ? obj.authorizedBy.slice(0, 60) : null,
    medicalDisclaimer:
      typeof obj.medicalDisclaimer === 'string' && obj.medicalDisclaimer.trim()
        ? obj.medicalDisclaimer.trim().slice(0, 260)
        : 'AI-assisted operational handoff draft. Not a confirmed clinical diagnosis.',
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : new Date().toISOString(),
  };
}

/**
 * Custom Web Component registered with Nexconn ChatUI (`nc-c-gg-sos-telemetry-card`).
 * ChatUI binds `.message` (`ChatUIMessageModel`) directly onto this element.
 */
export class SosTelemetryCardElement extends HTMLElement {
  private _message: ChatUIMessageModel | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  get message(): ChatUIMessageModel | null {
    return this._message;
  }

  set message(val: ChatUIMessageModel | null) {
    this._message = val;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    const rawContent = (this._message as any)?.content;
    const payload = validateSosTelemetryPayload(rawContent);

    if (!payload) {
      this.shadowRoot.innerHTML = `
        <div style="font-family:Inter,system-ui,sans-serif;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:10px 12px;font-size:12px;color:#991B1B;max-width:320px;">
          Invalid SOS Telemetry Card payload.
        </div>
      `;
      return;
    }

    const isCritical = payload.priority === 'P1 CRITICAL';
    const coords =
      payload.lat !== null && payload.lon !== null
        ? `${payload.lat.toFixed(4)}, ${payload.lon.toFixed(4)}`
        : 'GPS Pending';
    const respondersText =
      payload.assignedResponders.length > 0
        ? payload.assignedResponders.map(escapeHtml).join(', ')
        : 'Awaiting responder assignment';

    this.shadowRoot.innerHTML = `
      <style>
        .card {
          font-family: Inter, system-ui, -apple-system, sans-serif;
          background: #FBF8F3;
          border: 1.5px solid ${isCritical ? '#D65A4A' : '#0F766E'};
          border-radius: 14px;
          overflow: hidden;
          max-width: 340px;
          min-width: 240px;
          color: #1B2A38;
          box-shadow: 0 2px 8px rgba(11, 59, 60, 0.08);
        }
        .hdr {
          background: ${isCritical ? '#991B1B' : '#0B3B3C'};
          color: #FFFFFF;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .badge {
          background: rgba(255,255,255,0.2);
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 10px;
        }
        .body {
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.45;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 3px 0;
          border-bottom: 1px solid #E9E1D3;
        }
        .row:last-child { border-bottom: none; }
        .lbl { color: #5B687A; font-size: 11px; }
        .val { font-weight: 600; text-align: right; color: #0B3B3C; }
        .sim {
          margin-top: 6px;
          background: #FEF3C7;
          color: #92400E;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 700;
        }
      </style>
      <div class="card">
        <div class="hdr">
          <span>SOS TELEMETRY · ${escapeHtml(payload.incidentCode)}</span>
          <span class="badge">${escapeHtml(payload.priority)}</span>
        </div>
        <div class="body">
          <div class="row">
            <span class="lbl">Category</span>
            <span class="val">${escapeHtml(payload.category.replace('_', ' ').toUpperCase())}</span>
          </div>
          <div class="row">
            <span class="lbl">Status</span>
            <span class="val">${escapeHtml(payload.status)}</span>
          </div>
          <div class="row">
            <span class="lbl">Location</span>
            <span class="val">${escapeHtml(payload.cellLabel)} (${escapeHtml(payload.siteName)})</span>
          </div>
          <div class="row">
            <span class="lbl">GPS</span>
            <span class="val" style="font-family:monospace;">${escapeHtml(coords)}</span>
          </div>
          <div class="row">
            <span class="lbl">Responders</span>
            <span class="val">${respondersText}</span>
          </div>
          ${payload.isSimulated ? `<div class="sim">SIMULATED DRILL RECORD</div>` : ''}
        </div>
      </div>
    `;
  }
}

/**
 * Custom Web Component registered with Nexconn ChatUI (`nc-c-gg-ai-sbar-handoff-card`).
 * Enforces explicit approval badge and clinical disclaimer.
 */
export class AiSbarHandoffCardElement extends HTMLElement {
  private _message: ChatUIMessageModel | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  get message(): ChatUIMessageModel | null {
    return this._message;
  }

  set message(val: ChatUIMessageModel | null) {
    this._message = val;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    const rawContent = (this._message as any)?.content;
    const payload = validateAiSbarHandoffPayload(rawContent);

    if (!payload) {
      this.shadowRoot.innerHTML = `
        <div style="font-family:Inter,system-ui,sans-serif;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:10px 12px;font-size:12px;color:#991B1B;max-width:340px;">
          Invalid AI Medical SBAR Handoff Card payload.
        </div>
      `;
      return;
    }

    const isApproved = payload.approvalStatus === 'APPROVED';
    const statusBg = isApproved ? '#065F46' : '#92400E';
    const statusLabel = isApproved
      ? `DISPATCHER APPROVED (v${payload.version})`
      : `DRAFT PENDING REVIEW (v${payload.version})`;

    this.shadowRoot.innerHTML = `
      <style>
        .card {
          font-family: Inter, system-ui, -apple-system, sans-serif;
          background: #FBF8F3;
          border: 1.5px solid #0F766E;
          border-radius: 14px;
          overflow: hidden;
          max-width: 360px;
          min-width: 250px;
          color: #1B2A38;
          box-shadow: 0 2px 8px rgba(11, 59, 60, 0.08);
        }
        .hdr {
          background: #0B3B3C;
          color: #FFFFFF;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
        }
        .status {
          background: ${statusBg};
          color: #FFFFFF;
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 9.5px;
          letter-spacing: 0.03em;
        }
        .body {
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.45;
        }
        .sec-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #0F766E;
          margin-top: 6px;
        }
        .sec-title:first-child { margin-top: 0; }
        .txt { margin: 2px 0 0 0; color: #1B2A38; }
        .disc {
          margin-top: 8px;
          padding: 6px 8px;
          border-radius: 8px;
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          color: #78350F;
          font-size: 10px;
          line-height: 1.35;
        }
      </style>
      <div class="card">
        <div class="hdr">
          <span>AI SBAR HANDOFF · ${escapeHtml(payload.incidentCode)}</span>
          <span class="status">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="body">
          <div class="sec-title">Severity: ${escapeHtml(payload.severity)}</div>
          <div class="sec-title">Situation</div>
          <p class="txt">${escapeHtml(payload.situationSummary)}</p>
          <div class="sec-title">Coordination Recommendation</div>
          <p class="txt">${escapeHtml(payload.recommendationSummary)}</p>
          ${
            payload.authorizedBy
              ? `<div style="margin-top:6px;font-size:10px;color:#065F46;font-weight:600;">Authorized by: ${escapeHtml(payload.authorizedBy)}</div>`
              : ''
          }
          <div class="disc">${escapeHtml(payload.medicalDisclaimer)}</div>
        </div>
      </div>
    `;
  }
}

export function getEmergencyCustomMessageRegistrations(): ChatUICustomMessageRegistration[] {
  return [
    {
      messageType: SOS_TELEMETRY_CARD_TYPE,
      isPersisted: true,
      isCounted: true,
      digest: (message) => {
        const p = validateSosTelemetryPayload((message as any)?.content);
        return p ? `[SOS Telemetry] ${p.incidentCode} · ${p.priority}` : '[SOS Telemetry Card]';
      },
      component: {
        tagName: 'gg-sos-telemetry-card',
        elementClass: SosTelemetryCardElement,
      },
    },
    {
      messageType: AI_SBAR_HANDOFF_CARD_TYPE,
      isPersisted: true,
      isCounted: true,
      digest: (message) => {
        const p = validateAiSbarHandoffPayload((message as any)?.content);
        return p ? `[AI SBAR v${p.version}] ${p.incidentCode}` : '[AI Medical SBAR Handoff]';
      },
      component: {
        tagName: 'gg-ai-sbar-handoff-card',
        elementClass: AiSbarHandoffCardElement,
      },
    },
  ];
}
