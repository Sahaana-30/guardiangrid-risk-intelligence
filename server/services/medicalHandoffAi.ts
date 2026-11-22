import { GoogleGenAI, Type } from '@google/genai';
import type { EmergencyIncident, ResponderProfile } from '../../src/types/emergency.ts';
import type {
  EnvironmentalSnapshot,
  MedicalHandoffStructuredPayload,
  MedicalSeverity,
  NexconnMessageReference,
  SbarSectionContent,
} from '../../src/types/medicalHandoff.ts';

const VALID_SEVERITIES: MedicalSeverity[] = ['CRITICAL', 'HIGH', 'MODERATE'];
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

const SBAR_LANGUAGE_SCHEMA = {
  type: Type.OBJECT,
  required: ['situation', 'background', 'assessment', 'recommendation', 'medicalDisclaimer'],
  properties: {
    situation: {
      type: Type.OBJECT,
      required: ['whatHappened', 'currentIncidentCondition', 'victimCount', 'currentRescueLocation'],
      properties: {
        whatHappened: { type: Type.STRING },
        currentIncidentCondition: { type: Type.STRING },
        victimCount: { type: Type.STRING },
        currentRescueLocation: { type: Type.STRING },
      },
    },
    background: {
      type: Type.OBJECT,
      required: [
        'incidentHistory',
        'responderReportedObservations',
        'relevantRecentMessages',
        'environmentalSummary',
        'knownRelevantInformation',
        'missingInformation',
      ],
      properties: {
        incidentHistory: { type: Type.STRING },
        responderReportedObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
        relevantRecentMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
        environmentalSummary: { type: Type.STRING },
        knownRelevantInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
        missingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    assessment: {
      type: Type.OBJECT,
      required: [
        'preliminaryOperationalAssessment',
        'supportingEvidence',
        'uncertaintiesAndUnavailableInfo',
      ],
      properties: {
        preliminaryOperationalAssessment: { type: Type.STRING },
        supportingEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
        uncertaintiesAndUnavailableInfo: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    recommendation: {
      type: Type.OBJECT,
      required: [
        'immediateHandoffInformation',
        'suggestedCoordination',
        'environmentalAndSiteHazards',
        'verifyByReceivingMedicalTeam',
      ],
      properties: {
        immediateHandoffInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
        suggestedCoordination: { type: Type.ARRAY, items: { type: Type.STRING } },
        environmentalAndSiteHazards: { type: Type.ARRAY, items: { type: Type.STRING } },
        verifyByReceivingMedicalTeam: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    medicalDisclaimer: { type: Type.STRING },
  },
};

const MEDICAL_HANDOFF_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'severity',
    'severityRationale',
    'english',
    'tamil',
    'knownInformation',
    'unavailableInformation',
  ],
  properties: {
    severity: {
      type: Type.STRING,
      enum: ['CRITICAL', 'HIGH', 'MODERATE'],
    },
    severityRationale: { type: Type.STRING },
    english: SBAR_LANGUAGE_SCHEMA,
    tamil: SBAR_LANGUAGE_SCHEMA,
    knownInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
    unavailableInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === 'string');
}

function validateSbarBlock(block: any, label: string): SbarSectionContent {
  if (!block || typeof block !== 'object') {
    throw new Error(`Invalid Gemini response: missing ${label} SBAR object.`);
  }
  const s = block.situation;
  const b = block.background;
  const a = block.assessment;
  const r = block.recommendation;

  if (
    !s ||
    !isNonEmptyString(s.whatHappened) ||
    !isNonEmptyString(s.currentIncidentCondition) ||
    !isNonEmptyString(s.victimCount) ||
    !isNonEmptyString(s.currentRescueLocation)
  ) {
    throw new Error(`Invalid Gemini response: incomplete ${label}.situation fields.`);
  }

  if (
    !b ||
    !isNonEmptyString(b.incidentHistory) ||
    !isStringArray(b.responderReportedObservations) ||
    !isStringArray(b.relevantRecentMessages) ||
    !isNonEmptyString(b.environmentalSummary) ||
    !isStringArray(b.knownRelevantInformation) ||
    !isStringArray(b.missingInformation)
  ) {
    throw new Error(`Invalid Gemini response: incomplete ${label}.background fields.`);
  }

  if (
    !a ||
    !isNonEmptyString(a.preliminaryOperationalAssessment) ||
    !isStringArray(a.supportingEvidence) ||
    !isStringArray(a.uncertaintiesAndUnavailableInfo)
  ) {
    throw new Error(`Invalid Gemini response: incomplete ${label}.assessment fields.`);
  }

  if (
    !r ||
    !isStringArray(r.immediateHandoffInformation) ||
    !isStringArray(r.suggestedCoordination) ||
    !isStringArray(r.environmentalAndSiteHazards) ||
    !isStringArray(r.verifyByReceivingMedicalTeam)
  ) {
    throw new Error(`Invalid Gemini response: incomplete ${label}.recommendation fields.`);
  }

  if (!isNonEmptyString(block.medicalDisclaimer)) {
    throw new Error(`Invalid Gemini response: missing ${label}.medicalDisclaimer.`);
  }

  return {
    situation: {
      whatHappened: s.whatHappened.trim(),
      currentIncidentCondition: s.currentIncidentCondition.trim(),
      victimCount: s.victimCount.trim(),
      currentRescueLocation: s.currentRescueLocation.trim(),
    },
    background: {
      incidentHistory: b.incidentHistory.trim(),
      responderReportedObservations: b.responderReportedObservations.map((x: string) => x.trim()).filter(Boolean),
      relevantRecentMessages: b.relevantRecentMessages.map((x: string) => x.trim()).filter(Boolean),
      environmentalSummary: b.environmentalSummary.trim(),
      knownRelevantInformation: b.knownRelevantInformation.map((x: string) => x.trim()).filter(Boolean),
      missingInformation: b.missingInformation.map((x: string) => x.trim()).filter(Boolean),
    },
    assessment: {
      preliminaryOperationalAssessment: a.preliminaryOperationalAssessment.trim(),
      supportingEvidence: a.supportingEvidence.map((x: string) => x.trim()).filter(Boolean),
      uncertaintiesAndUnavailableInfo: a.uncertaintiesAndUnavailableInfo.map((x: string) => x.trim()).filter(Boolean),
    },
    recommendation: {
      immediateHandoffInformation: r.immediateHandoffInformation.map((x: string) => x.trim()).filter(Boolean),
      suggestedCoordination: r.suggestedCoordination.map((x: string) => x.trim()).filter(Boolean),
      environmentalAndSiteHazards: r.environmentalAndSiteHazards.map((x: string) => x.trim()).filter(Boolean),
      verifyByReceivingMedicalTeam: r.verifyByReceivingMedicalTeam.map((x: string) => x.trim()).filter(Boolean),
    },
    medicalDisclaimer: block.medicalDisclaimer.trim(),
  };
}

export function validateRawGeminiMedicalJson(
  rawJsonText: string,
  meta: {
    incidentId: string;
    organizationId: string;
    regionId: string;
    generatedAt: string;
    environmentalConditions: EnvironmentalSnapshot;
    sourceReferences: MedicalHandoffStructuredPayload['sourceReferences'];
  }
): MedicalHandoffStructuredPayload {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new Error('Gemini returned malformed JSON that could not be parsed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned a non-object JSON payload.');
  }

  if (!VALID_SEVERITIES.includes(parsed.severity)) {
    throw new Error(
      `Invalid Gemini severity value "${String(parsed.severity)}". Must be CRITICAL, HIGH, or MODERATE.`
    );
  }

  if (!isNonEmptyString(parsed.severityRationale)) {
    throw new Error('Invalid Gemini response: missing severityRationale.');
  }

  const english = validateSbarBlock(parsed.english, 'english');
  const tamil = validateSbarBlock(parsed.tamil, 'tamil');

  const knownInformation = isStringArray(parsed.knownInformation)
    ? parsed.knownInformation.map((x: string) => x.trim()).filter(Boolean)
    : [];
  const unavailableInformation = isStringArray(parsed.unavailableInformation)
    ? parsed.unavailableInformation.map((x: string) => x.trim()).filter(Boolean)
    : [];

  return {
    incidentId: meta.incidentId,
    organizationId: meta.organizationId,
    regionId: meta.regionId,
    generatedAt: meta.generatedAt,
    language: 'en-ta',
    severity: parsed.severity as MedicalSeverity,
    severityRationale: parsed.severityRationale.trim(),
    situation: english.situation,
    background: english.background,
    assessment: english.assessment,
    recommendation: english.recommendation,
    english,
    tamil,
    knownInformation,
    unavailableInformation,
    environmentalConditions: meta.environmentalConditions,
    sourceReferences: meta.sourceReferences,
    requiresHumanReview: true,
  };
}

export async function generateBilingualMedicalHandoff(params: {
  incident: EmergencyIncident;
  organizationId: string;
  assignedResponders: ResponderProfile[];
  nexconnMessages: NexconnMessageReference[];
  nexconnRetrievalStatus: 'ok' | 'no_group' | 'unavailable';
  environmental: EnvironmentalSnapshot;
  victimCount?: number | null;
}): Promise<{ payload: MedicalHandoffStructuredPayload; modelUsed: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const { incident, assignedResponders, nexconnMessages, environmental } = params;
  const generatedAt = new Date().toISOString();

  const contextInput = {
    incident: {
      id: incident.id,
      code: incident.code,
      category: incident.category,
      reportedSeverity: incident.severity,
      currentState: incident.state,
      isSimulatedDrill: incident.isSimulated,
      victimCount: typeof params.victimCount === 'number' ? params.victimCount : 'Not recorded',
      rescueCell: `${incident.cellId} (${incident.cellLabel})`,
      siteName: incident.siteName,
      regionName: incident.regionName || 'Unknown region',
      coordinates:
        incident.lat !== null && incident.lon !== null
          ? { lat: incident.lat, lon: incident.lon, source: incident.locationSource }
          : 'Unavailable',
      createdAt: incident.createdAt,
      description: incident.description,
      lostChildDetails: incident.lostChildDetails || null,
      voiceTranscriptFromSOS: incident.voiceTranscript || 'Unavailable',
      auditTimeline: incident.auditTrail.slice(-10).map((e) => ({
        timestamp: e.timestamp,
        actorRole: e.actorRole,
        action: e.action,
        summary: e.summary,
      })),
    },
    assignedResponders: assignedResponders.map((r) => ({
      callsign: r.radioCallsign,
      role: r.role,
      availability: r.availability,
      latestGps: { lat: r.lat, lon: r.lon },
    })),
    nexconnChannelContext: {
      retrievalStatus: params.nexconnRetrievalStatus,
      messages: nexconnMessages.slice(-20).map((m) => ({
        sentAt: m.sentAt,
        kind: m.kind,
        textPreview: m.textPreview || null,
        voiceTranscriptStatus: m.voiceTranscriptStatus || null,
        voiceTranscript: m.voiceTranscript || null,
        imageMetadata: m.imageMetadata || null,
      })),
    },
    environmentalConditions: {
      observationTime: environmental.observationTime,
      sources: environmental.sources,
      weatherStatus: environmental.weatherStatus,
      marineStatus: environmental.marineStatus,
      windSpeedKmh: environmental.windSpeedKmh,
      windDirectionDeg: environmental.windDirectionDeg,
      precipitationMm: environmental.precipitationMm,
      airTemperatureC: environmental.airTemperatureC,
      relativeHumidityPct: environmental.relativeHumidityPct,
      waveHeightM: environmental.waveHeightM,
      wavePeriodS: environmental.wavePeriodS,
      seaSurfaceTemperatureC: environmental.seaSurfaceTemperatureC,
      unavailableFields: environmental.unavailableFields,
    },
  };

  const systemInstruction = `You are a Coastal Rescue & Emergency Handoff Documentation Assistant preparing a preliminary bilingual (English and Tamil) SBAR handoff summary for dispatchers and receiving paramedics.

STRICT MEDICAL SAFETY RULES — NEVER VIOLATE:
1. This is preliminary emergency handoff support, NOT a medical diagnosis.
2. NEVER fabricate vital signs, injuries, consciousness status, breathing status, symptoms, or medical history.
3. NEVER claim a victim is stable or unstable unless explicitly reported in the input observations.
4. Clearly distinguish responder-reported observations from AI-generated preliminary operational assessment.
5. NEVER recommend medication dosages, drugs, or invasive medical procedures.
6. Explicitly list missing or unavailable information (including unavailable voice-note transcripts, missing vital signs, or unavailable environmental variables).
7. Do NOT infer injuries or medical diagnoses from image metadata.
8. Include a clear disclaimer in BOTH English and Tamil stating that this is an AI-generated preliminary operational handoff summary and that paramedics and qualified medical personnel must independently assess the patient.
9. Keep all Tamil translations natural, clear, and operationally accurate for Tamil Nadu / Indian coastal emergency responders.
10. Return ONLY valid JSON matching the requested schema.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Generate a standardized bilingual (English + Tamil) SBAR emergency handoff JSON report based ONLY on the verified incident, responder, Nexconn channel, and Open-Meteo environmental data below:\n\n${JSON.stringify(
      contextInput,
      null,
      2
    )}`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: MEDICAL_HANDOFF_RESPONSE_SCHEMA,
    },
  });

  const rawText = (response.text || '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response for the medical handoff.');
  }

  const payload = validateRawGeminiMedicalJson(rawText, {
    incidentId: incident.id,
    organizationId: params.organizationId,
    regionId: incident.regionId || 'reg-india-chennai',
    generatedAt,
    environmentalConditions: environmental,
    sourceReferences: {
      incidentCode: incident.code,
      incidentCreatedAt: incident.createdAt,
      nexconnGroupId: incident.nexconnGroupId,
      nexconnRetrievalStatus: params.nexconnRetrievalStatus,
      nexconnMessagesCount: nexconnMessages.length,
      nexconnMessages,
      environmentalSources: environmental.sources,
      environmentalObservationTime: environmental.observationTime,
    },
  });

  return { payload, modelUsed: GEMINI_MODEL };
}
