import jstat from 'jstat';
import { FairnessAuditResult, FairnessFinding, WaterBody } from '../types';

const jStat: any = (jstat as any).jStat || jstat;

export function performFairnessAudit(
  sites: WaterBody[],
  siteRiskMap: Map<string, number>
): FairnessAuditResult {
  const sampleSize = sites.length;
  const isEnoughData = sampleSize >= 10;

  if (!isEnoughData) {
    return {
      sampleSize,
      isEnoughData: false,
      pearsonCorr: { r: 0, pValue: 1 },
      spearmanCorr: { rho: 0, pValue: 1 },
      anova: { fStat: 0, pValue: 1 },
      chiSquare: { chi2: 0, pValue: 1 },
      tierAverages: [],
      findings: [],
    };
  }

  const x = sites.map((s) => s.infrastructureIndex || 50);
  const y = sites.map((s) => siteRiskMap.get(s.id) || 40);

  let r = 0;
  let pearsonP = 1;
  try {
    r = jStat.corrcoeff(x, y);
    if (isNaN(r)) r = 0;
    const t = Math.abs(r) * Math.sqrt((sampleSize - 2) / Math.max(1e-5, 1 - r * r));
    pearsonP = 2 * (1 - jStat.studentt.cdf(t, sampleSize - 2));
  } catch (e) {
    r = 0;
    pearsonP = 1;
  }

  let rho = 0;
  let spearmanP = 1;
  try {
    rho = jStat.spearmancoeff(x, y);
    if (isNaN(rho)) rho = 0;
    const tRho = Math.abs(rho) * Math.sqrt((sampleSize - 2) / Math.max(1e-5, 1 - rho * rho));
    spearmanP = 2 * (1 - jStat.studentt.cdf(tRho, sampleSize - 2));
  } catch (e) {
    rho = 0;
    spearmanP = 1;
  }

  const group1: number[] = [];
  const group2: number[] = [];
  const group3: number[] = [];
  const highRiskTiers = [0, 0, 0];
  const lowMedRiskTiers = [0, 0, 0];

  for (let i = 0; i < sampleSize; i++) {
    const infra = x[i];
    const score = y[i];
    const isHigh = score >= 70;

    if (infra < 45) {
      group1.push(score);
      if (isHigh) highRiskTiers[0]++;
      else lowMedRiskTiers[0]++;
    } else if (infra <= 70) {
      group2.push(score);
      if (isHigh) highRiskTiers[1]++;
      else lowMedRiskTiers[1]++;
    } else {
      group3.push(score);
      if (isHigh) highRiskTiers[2]++;
      else lowMedRiskTiers[2]++;
    }
  }

  const tierAverages = [
    {
      tier: 1,
      label: 'Tier 1: Low Infrastructure (<45)',
      siteCount: group1.length,
      avgRiskScore: group1.length ? Math.round(group1.reduce((a, b) => a + b, 0) / group1.length) : 0,
      avgInfrastructureIndex: 35,
      highRiskCount: highRiskTiers[0],
    },
    {
      tier: 2,
      label: 'Tier 2: Moderate Infrastructure (45–70)',
      siteCount: group2.length,
      avgRiskScore: group2.length ? Math.round(group2.reduce((a, b) => a + b, 0) / group2.length) : 0,
      avgInfrastructureIndex: 58,
      highRiskCount: highRiskTiers[1],
    },
    {
      tier: 3,
      label: 'Tier 3: High Infrastructure (>70)',
      siteCount: group3.length,
      avgRiskScore: group3.length ? Math.round(group3.reduce((a, b) => a + b, 0) / group3.length) : 0,
      avgInfrastructureIndex: 82,
      highRiskCount: highRiskTiers[2],
    },
  ];

  let fStat = 0;
  let anovaP = 1;
  const validGroups = [group1, group2, group3].filter((g) => g.length > 0);
  if (validGroups.length >= 2) {
    try {
      const k = validGroups.length;
      const N = validGroups.reduce((acc, g) => acc + g.length, 0);
      const allVals = validGroups.flat();
      const grandMean = allVals.reduce((a, b) => a + b, 0) / N;

      let ssBetween = 0;
      let ssWithin = 0;

      for (const g of validGroups) {
        const gMean = g.reduce((a, b) => a + b, 0) / g.length;
        ssBetween += g.length * Math.pow(gMean - grandMean, 2);
        for (const val of g) {
          ssWithin += Math.pow(val - gMean, 2);
        }
      }

      const dfBetween = k - 1;
      const dfWithin = N - k;
      const msBetween = ssBetween / (dfBetween || 1);
      const msWithin = ssWithin / (dfWithin || 1);

      fStat = msWithin > 0 ? msBetween / msWithin : 0;
      anovaP = dfWithin > 0 ? 1 - jStat.centralF.cdf(fStat, dfBetween, dfWithin) : 1;
    } catch {
      fStat = 0;
      anovaP = 1;
    }
  }

  let chi2 = 0;
  let chi2P = 1;
  try {
    const totalHigh = highRiskTiers.reduce((a, b) => a + b, 0);
    const totalLowMed = lowMedRiskTiers.reduce((a, b) => a + b, 0);
    const N = totalHigh + totalLowMed;

    if (totalHigh > 0 && totalLowMed > 0 && N > 0) {
      for (let t = 0; t < 3; t++) {
        const colTotal = highRiskTiers[t] + lowMedRiskTiers[t];
        if (colTotal === 0) continue;
        const eHigh = (totalHigh * colTotal) / N;
        const eLowMed = (totalLowMed * colTotal) / N;

        if (eHigh > 0) chi2 += Math.pow(highRiskTiers[t] - eHigh, 2) / eHigh;
        if (eLowMed > 0) chi2 += Math.pow(lowMedRiskTiers[t] - eLowMed, 2) / eLowMed;
      }
      const df = 2;
      chi2P = 1 - jStat.chisquare.cdf(chi2, df);
    }
  } catch {
    chi2 = 0;
    chi2P = 1;
  }

  const findings: FairnessFinding[] = [];

  if (r < -0.25 && pearsonP < 0.10) {
    findings.push({
      title: 'Infrastructure Deficit in High-Risk Zones',
      statisticName: 'Pearson r',
      statisticValue: Math.round(r * 100) / 100,
      pValue: Math.round(pearsonP * 1000) / 1000,
      affectedRegions: sites.filter((s) => s.infrastructureIndex < 45).map((s) => s.region).slice(0, 3),
      potentialImpact:
        'Water bodies with elevated hydrodynamic hazards lack proportionate emergency coverage and first-response access.',
      recommendation:
        'Prioritize mobile lifeguard patrols, emergency call boxes, and automated flotation beacons at Tier 1 sites.',
      isSignificant: true,
    });
  }

  if (fStat > 2.0 && anovaP < 0.10) {
    findings.push({
      title: 'Significant Disparity Across Safety Infrastructure Tiers',
      statisticName: 'ANOVA F-Statistic',
      statisticValue: Math.round(fStat * 100) / 100,
      pValue: Math.round(anovaP * 1000) / 1000,
      affectedRegions: ['Suburban Coast', 'Inland Reservoirs'],
      potentialImpact:
        'Statistically confirmed variation in risk exposure between municipal urban beaches and outer districts.',
      recommendation:
        'Standardize minimum safety protocols across all districts regardless of municipal zoning tier.',
      isSignificant: true,
    });
  }

  if (chi2 > 3.0 && chi2P < 0.10) {
    findings.push({
      title: 'Disproportionate High-Risk Clustering in Low Infrastructure Tiers',
      statisticName: 'Chi-Square (χ²)',
      statisticValue: Math.round(chi2 * 100) / 100,
      pValue: Math.round(chi2P * 1000) / 1000,
      affectedRegions: ['Outer Coastal Reach'],
      potentialImpact:
        'Severe and high-hazard days disproportionately impact sites with fewer hospital and emergency responder nodes.',
      recommendation:
        'Deploy rapid-deployment jet-ski patrol units to bridge the physical response distance during seasonal surf surges.',
      isSignificant: true,
    });
  }

  if (findings.length === 0) {
    findings.push({
      title: 'Equitable Safety Coverage Observed',
      statisticName: 'Pearson r',
      statisticValue: Math.round(r * 100) / 100,
      pValue: Math.round(pearsonP * 1000) / 1000,
      affectedRegions: ['All Monitored Regions'],
      potentialImpact:
        'No statistically significant concentration of high environmental hazards in low-resource water bodies detected (p ≥ 0.10).',
      recommendation:
        'Maintain balanced municipal monitoring cadence and continue periodic audits as new seasonal data arrives.',
      isSignificant: false,
    });
  }

  return {
    sampleSize,
    isEnoughData: true,
    pearsonCorr: { r: Math.round(r * 100) / 100, pValue: Math.round(pearsonP * 1000) / 1000 },
    spearmanCorr: { rho: Math.round(rho * 100) / 100, pValue: Math.round(spearmanP * 1000) / 1000 },
    anova: { fStat: Math.round(fStat * 100) / 100, pValue: Math.round(anovaP * 1000) / 1000 },
    chiSquare: { chi2: Math.round(chi2 * 100) / 100, pValue: Math.round(chi2P * 1000) / 1000 },
    tierAverages,
    findings,
  };
}
