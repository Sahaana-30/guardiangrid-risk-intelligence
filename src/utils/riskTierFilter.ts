import type { RiskTier } from '../types';

export type NormalizedRiskFilter = 'all' | 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';

export function normalizeRiskCategory(tier?: RiskTier | string | null, score?: number): Exclude<NormalizedRiskFilter, 'all'> {
  const t = (tier || '').trim().toUpperCase();
  if (t === 'CRITICAL' || t === 'SEVERE') return 'CRITICAL';
  if (t === 'HIGH') return 'HIGH';
  if (t === 'MODERATE' || t === 'MEDIUM') return 'MODERATE';
  if (t === 'LOW') return 'LOW';

  if (typeof score === 'number' && !Number.isNaN(score)) {
    if (score >= 85) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 35) return 'MODERATE';
  }
  return 'LOW';
}

export function normalizeRiskFilterValue(raw?: string | null): NormalizedRiskFilter {
  const val = (raw || '').trim().toUpperCase();
  if (val === 'CRITICAL' || val === 'SEVERE') return 'CRITICAL';
  if (val === 'HIGH') return 'HIGH';
  if (val === 'MODERATE' || val === 'MEDIUM') return 'MODERATE';
  if (val === 'LOW') return 'LOW';
  return 'all';
}

export function siteMatchesRiskFilter(
  tier: RiskTier | string | undefined,
  score: number | undefined,
  filterRisk: string | undefined
): boolean {
  const normalizedFilter = normalizeRiskFilterValue(filterRisk);
  if (normalizedFilter === 'all') return true;
  return normalizeRiskCategory(tier, score) === normalizedFilter;
}

export function getRiskTierColor(tier?: RiskTier | string | null, score?: number): string {
  const category = normalizeRiskCategory(tier, score);
  if (category === 'CRITICAL') return '#991B1B';
  if (category === 'HIGH') return '#D65A4A';
  if (category === 'MODERATE') return '#E9A03B';
  return '#2F855A';
}
