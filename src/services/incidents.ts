import { Incident, WaterBody } from '../types';
import { fetchJson } from './fetchJson';

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  sourcecountry?: string;
  language?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

const STORAGE_KEY_COMMUNITY_INCIDENTS = 'guardiangrid_community_incidents';

function classifyType(title: string): Incident['type'] {
  const lower = title.toLowerCase();
  if (lower.includes('rip current') || lower.includes('swept away') || lower.includes('strong current')) {
    return 'rip_current';
  }
  if (lower.includes('boat') || lower.includes('capsiz') || lower.includes('overturn')) {
    return 'capsizing';
  }
  if (lower.includes('rescued') || lower.includes('saved') || lower.includes('lifeguard')) {
    return 'rescue';
  }
  if (lower.includes('contamin') || lower.includes('pollut') || lower.includes('toxic') || lower.includes('algae')) {
    return 'contamination';
  }
  return 'drowning';
}

function classifySeverity(title: string): Incident['severity'] {
  const lower = title.toLowerCase();
  if (lower.includes('dead') || lower.includes('die') || lower.includes('fatal') || lower.includes('multiple') || lower.includes('bodies')) {
    return 'Severe';
  }
  if (lower.includes('drown') || lower.includes('missing') || lower.includes('critical') || lower.includes('swept away')) {
    return 'High';
  }
  if (lower.includes('injured') || lower.includes('hospital') || lower.includes('struggle')) {
    return 'Medium';
  }
  return 'Low';
}

const STORAGE_KEY_VERIFIED_INCIDENTS = 'guardiangrid_verified_incidents';

export function getVerifiedIncidentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VERIFIED_INCIDENTS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function toggleIncidentVerified(incidentId: string): boolean {
  const set = getVerifiedIncidentIds();
  const willBeVerified = !set.has(incidentId);
  if (willBeVerified) {
    set.add(incidentId);
  } else {
    set.delete(incidentId);
  }
  try {
    localStorage.setItem(STORAGE_KEY_VERIFIED_INCIDENTS, JSON.stringify(Array.from(set)));
  } catch {}
  return willBeVerified;
}

const IRRELEVANT_KEYWORDS = [
  'cricket',
  'football',
  'tournament',
  'match',
  'trophy',
  'championship',
  'ipl',
  'movie',
  'cinema',
  'actor',
  'actress',
  'box office',
  'trailer',
  'song',
  'album',
  'drowning in debt',
  'drowning in sorrow',
  'flood of complaints',
  'flood of tears',
  'sea of fans',
  'wave of protests',
  'wave of crime',
  'wave of arrests',
  'election',
  'parliament',
  'shares plunge',
  'stock market',
];

const WATER_CONTEXT_KEYWORDS = [
  'beach',
  'sea',
  'ocean',
  'water',
  'river',
  'lake',
  'pond',
  'reservoir',
  'canal',
  'coast',
  'coastal',
  'surf',
  'waves',
  'rip current',
  'swimmer',
  'swimming',
  'bather',
  'bathing',
  'drown',
  'drowned',
  'drowning',
  'boat',
  'lifeguard',
  'creek',
  'dam',
  'quarry',
];

export async function fetchGdeltIncidents(cityName: string, sites: WaterBody[]): Promise<Incident[]> {
  const query = `(drowned OR drowning OR "swept away" OR "rip current") "${cityName}" sourcelang:english`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    query
  )}&mode=artlist&format=json&maxrecords=50&timespan=3months`;

  try {
    const data = await fetchJson<GdeltResponse>(url, {
      cacheTtlMs: 1000 * 60 * 60 * 6,
      timeoutMs: 14000,
      retries: 1,
    });

    if (!data?.articles || !Array.isArray(data.articles)) {
      return [];
    }

    const verifiedIds = getVerifiedIncidentIds();
    const rawIncidents: Incident[] = [];
    const seenDedupeKeys = new Set<string>();

    for (let i = 0; i < data.articles.length; i++) {
      const art = data.articles[i];
      if (!art.url || !art.title) continue;

      const titleLower = art.title.toLowerCase();

      // Filter out metaphoric, sports, or entertainment noise
      const isIrrelevant = IRRELEVANT_KEYWORDS.some((kw) => titleLower.includes(kw));
      if (isIrrelevant) continue;

      // Ensure article genuinely concerns water or civil water body
      const hasWaterContext = WATER_CONTEXT_KEYWORDS.some((kw) => titleLower.includes(kw));
      if (!hasWaterContext) continue;

      let formattedDate = new Date().toISOString().split('T')[0];
      if (art.seendate && art.seendate.length >= 8) {
        const y = art.seendate.substring(0, 4);
        const m = art.seendate.substring(4, 6);
        const d = art.seendate.substring(6, 8);
        formattedDate = `${y}-${m}-${d}`;
      }

      let matchedSite = sites.find((s) => titleLower.includes(s.name.toLowerCase()));

      let lat = matchedSite?.lat;
      let lon = matchedSite?.lon;
      let locationName = matchedSite?.name || `${cityName} Waters`;
      const incType = classifyType(art.title);

      // Deduplicate by date + location + type
      const dedupeKey = `${formattedDate}_${locationName.toLowerCase()}_${incType}`;
      if (seenDedupeKeys.has(dedupeKey)) continue;
      seenDedupeKeys.add(dedupeKey);

      let cleanDomain = art.domain || '';
      if (!cleanDomain && art.url) {
        try {
          cleanDomain = new URL(art.url).hostname.replace('www.', '');
        } catch {}
      }

      const stableId = `gdelt-${i}-${art.url.replace(/[^a-zA-Z0-9]/g, '').slice(-16)}`;

      rawIncidents.push({
        id: stableId,
        title: art.title,
        date: formattedDate,
        source: cleanDomain || 'News Agency',
        domain: cleanDomain,
        url: art.url,
        locationName,
        lat,
        lon,
        waterBodyId: matchedSite?.id,
        severity: classifySeverity(art.title),
        isCommunityReported: false,
        isVerified: verifiedIds.has(stableId),
        type: incType,
      });
    }

    return rawIncidents;
  } catch (err) {
    return [];
  }
}

export function getCommunityIncidents(): Incident[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_COMMUNITY_INCIDENTS);
    const list: Incident[] = stored ? JSON.parse(stored) : [];
    const verifiedIds = getVerifiedIncidentIds();
    return list.map((inc) => ({
      ...inc,
      isVerified: verifiedIds.has(inc.id) || Boolean(inc.isVerified),
    }));
  } catch {
    return [];
  }
}

export function saveCommunityIncident(incident: Omit<Incident, 'id' | 'isCommunityReported'>): Incident {
  const all = getCommunityIncidents();
  const timestamp = Date.now();
  const newIncident: Incident = {
    ...incident,
    id: `community-${timestamp}-${all.length + 1}`,
    isCommunityReported: true,
    isVerified: true,
  };
  const updated = [newIncident, ...all];
  try {
    localStorage.setItem(STORAGE_KEY_COMMUNITY_INCIDENTS, JSON.stringify(updated));
    const verifiedIds = getVerifiedIncidentIds();
    verifiedIds.add(newIncident.id);
    localStorage.setItem(STORAGE_KEY_VERIFIED_INCIDENTS, JSON.stringify(Array.from(verifiedIds)));
  } catch (err) {}
  return newIncident;
}

export function exportIncidentsCsv(incidents: Incident[]): string {
  const headers = ['ID', 'Title', 'Date', 'Location', 'Type', 'Severity', 'Source', 'Community Reported', 'URL', 'Notes'];
  const rows = incidents.map((inc) => [
    `"${inc.id}"`,
    `"${(inc.title || '').replace(/"/g, '""')}"`,
    `"${inc.date}"`,
    `"${(inc.locationName || '').replace(/"/g, '""')}"`,
    `"${inc.type}"`,
    `"${inc.severity}"`,
    `"${inc.source}"`,
    `"${inc.isCommunityReported ? 'Yes' : 'No'}"`,
    `"${inc.url || ''}"`,
    `"${(inc.notes || '').replace(/"/g, '""')}"`,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function importIncidentsCsv(csvText: string, currentSites: WaterBody[]): Incident[] {
  const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const imported: Incident[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length >= 4) {
      const title = cols[1] || 'Imported Incident';
      const date = cols[2] || new Date().toISOString().split('T')[0];
      const loc = cols[3] || 'Monitored Water';
      const matchedSite = currentSites.find((s) => s.name.toLowerCase().includes(loc.toLowerCase()));

      imported.push({
        id: `csv-${Date.now()}-${i}`,
        title,
        date,
        locationName: loc,
        waterBodyId: matchedSite?.id,
        lat: matchedSite?.lat,
        lon: matchedSite?.lon,
        type: (cols[4] as Incident['type']) || 'drowning',
        severity: (cols[5] as Incident['severity']) || 'Medium',
        source: cols[6] || 'Imported CSV',
        isCommunityReported: true,
        url: cols[8],
        notes: cols[9],
      });
    }
  }

  const existing = getCommunityIncidents();
  const merged = [...imported, ...existing];
  try {
    localStorage.setItem(STORAGE_KEY_COMMUNITY_INCIDENTS, JSON.stringify(merged));
  } catch {}
  return merged;
}
