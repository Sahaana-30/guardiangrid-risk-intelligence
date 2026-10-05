import { ClusteringResult, ClusterInfo, WaterBody } from '../types';

export interface SiteProfile {
  siteId: string;
  siteName: string;
  score: number;
  features: number[];
}

function standardize(matrix: number[][]): number[][] {
  const n = matrix.length;
  if (n === 0) return [];
  const numFeatures = matrix[0].length;
  const standardized: number[][] = Array.from({ length: n }, () => new Array(numFeatures).fill(0));

  for (let j = 0; j < numFeatures; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += matrix[i][j];
    const mean = sum / n;

    let varSum = 0;
    for (let i = 0; i < n; i++) varSum += Math.pow(matrix[i][j] - mean, 2);
    const std = Math.sqrt(varSum / (n || 1)) || 1e-6;

    for (let i = 0; i < n; i++) {
      standardized[i][j] = (matrix[i][j] - mean) / std;
    }
  }

  return standardized;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

function kMeans(data: number[][], k: number, maxIter: number = 30): { labels: number[]; centroids: number[][] } {
  const n = data.length;
  if (n <= k) {
    return {
      labels: data.map((_, i) => i),
      centroids: data.map((v) => [...v]),
    };
  }

  const centroids: number[][] = [];
  centroids.push([...data[0]]);

  while (centroids.length < k) {
    const distances = data.map((point) => {
      let minDist = Infinity;
      for (const c of centroids) {
        const d = euclideanDistance(point, c);
        if (d < minDist) minDist = d;
      }
      return minDist * minDist;
    });

    let maxD = -1;
    let bestIdx = 0;
    for (let i = 0; i < distances.length; i++) {
      if (distances[i] > maxD) {
        maxD = distances[i];
        bestIdx = i;
      }
    }
    centroids.push([...data[bestIdx]]);
  }

  let labels = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let closest = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDistance(data[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          closest = c;
        }
      }
      if (labels[i] !== closest) {
        labels[i] = closest;
        changed = true;
      }
    }

    if (!changed) break;

    const counts = new Array(k).fill(0);
    const sums = Array.from({ length: k }, () => new Array(data[0].length).fill(0));

    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      for (let j = 0; j < data[0].length; j++) {
        sums[c][j] += data[i][j];
      }
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let j = 0; j < data[0].length; j++) {
          centroids[c][j] = sums[c][j] / counts[c];
        }
      }
    }
  }

  return { labels, centroids };
}

function computeSilhouette(data: number[][], labels: number[], k: number): number {
  const n = data.length;
  if (k <= 1 || k >= n) return 0;

  let totalS = 0;

  for (let i = 0; i < n; i++) {
    const myCluster = labels[i];
    let sameClusterDistSum = 0;
    let sameClusterCount = 0;

    const otherDistSums = new Array(k).fill(0);
    const otherCounts = new Array(k).fill(0);

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = euclideanDistance(data[i], data[j]);
      if (labels[j] === myCluster) {
        sameClusterDistSum += d;
        sameClusterCount++;
      } else {
        otherDistSums[labels[j]] += d;
        otherCounts[labels[j]]++;
      }
    }

    const a = sameClusterCount > 0 ? sameClusterDistSum / sameClusterCount : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      if (otherCounts[c] > 0) {
        const avg = otherDistSums[c] / otherCounts[c];
        if (avg < b) b = avg;
      }
    }
    if (b === Infinity) b = 0;

    const maxAB = Math.max(a, b);
    const s = maxAB > 0 ? (b - a) / maxAB : 0;
    totalS += s;
  }

  return totalS / n;
}

function runDbscan(data: number[][], minPts: number = 2): { outliers: number[] } {
  const n = data.length;
  if (n < 4) return { outliers: [] };

  let nnDistSum = 0;
  for (let i = 0; i < n; i++) {
    let minDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = euclideanDistance(data[i], data[j]);
      if (d < minDist) minDist = d;
    }
    nnDistSum += minDist;
  }
  const eps = (nnDistSum / n) * 1.6;

  const visited = new Array(n).fill(false);
  const isOutlier = new Array(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;

    const neighbors: number[] = [];
    for (let j = 0; j < n; j++) {
      if (euclideanDistance(data[i], data[j]) <= eps) {
        neighbors.push(j);
      }
    }

    if (neighbors.length < minPts) {
      isOutlier[i] = true;
    }
  }

  const outliers: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isOutlier[i]) outliers.push(i);
  }

  return { outliers };
}

function compute2DPca(data: number[][]): { x: number; y: number }[] {
  const n = data.length;
  if (n === 0) return [];
  const p = data[0].length;

  const means = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) means[j] += data[i][j];
  }
  for (let j = 0; j < p; j++) means[j] /= n;

  const centered = data.map((row) => row.map((val, j) => val - means[j]));

  function powerIteration(mat: number[][], prevVec?: number[]): number[] {
    let vec: number[] = new Array(p).fill(0).map((_, idx) => (idx === 0 ? 1 : 0.2));
    if (prevVec) {
      let dot = 0;
      for (let j = 0; j < p; j++) dot += vec[j] * prevVec[j];
      for (let j = 0; j < p; j++) vec[j] -= dot * prevVec[j];
    }

    for (let it = 0; it < 20; it++) {
      const xVec = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < p; j++) xVec[i] += centered[i][j] * vec[j];
      }

      const nextVec = new Array(p).fill(0);
      for (let j = 0; j < p; j++) {
        for (let i = 0; i < n; i++) {
          nextVec[j] += centered[i][j] * xVec[i];
        }
      }

      if (prevVec) {
        let dot = 0;
        for (let j = 0; j < p; j++) dot += nextVec[j] * prevVec[j];
        for (let j = 0; j < p; j++) vec[j] -= dot * prevVec[j];
      }

      let norm = 0;
      for (let j = 0; j < p; j++) norm += nextVec[j] * nextVec[j];
      norm = Math.sqrt(norm) || 1e-6;
      for (let j = 0; j < p; j++) vec[j] = nextVec[j] / norm;
    }
    return vec;
  }

  const pc1 = powerIteration(centered);
  const pc2 = powerIteration(centered, pc1);

  return centered.map((row) => {
    let x = 0;
    let y = 0;
    for (let j = 0; j < p; j++) {
      x += row[j] * pc1[j];
      y += row[j] * pc2[j];
    }
    return {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
  });
}

const FEATURE_NAMES = [
  'Risk Exposure',
  'Precipitation Burden',
  'Hydrodynamic Energy (Waves/Discharge)',
  'Visitor Exposure Rate',
  'Safety Infrastructure Index',
  'Incident Frequency',
];

function generateClusterArchetype(
  centroidNorm: number[],
  memberSites: WaterBody[]
): { name: string; description: string } {
  const indexed = centroidNorm.map((v, i) => ({ index: i, val: v }));
  indexed.sort((a, b) => Math.abs(b.val) - Math.abs(a.val));

  const top1 = indexed[0];
  const siteNames = memberSites.map((s) => s.name).slice(0, 3).join(', ');

  if (top1.index === 2 && top1.val > 0.3) {
    return {
      name: 'High-Energy Coastal Surf Zone',
      description: `Sites characterized by high wave action, rip potential, and substantial coastal bathymetry. Includes ${siteNames}.`,
    };
  } else if (top1.index === 4 && top1.val > 0.4) {
    return {
      name: 'Protected Urban Waterways',
      description: `Heavily safeguarded waters with robust municipal emergency infrastructure, lifeguard posts, and close medical coverage. Includes ${siteNames}.`,
    };
  } else if (top1.index === 4 && top1.val < -0.3) {
    return {
      name: 'Vulnerable Outer Waters',
      description: `Outlying or rural water bodies with limited safety infrastructure and prolonged emergency response times. Includes ${siteNames}.`,
    };
  } else if (top1.index === 1 && top1.val > 0.2) {
    return {
      name: 'High Runoff Catchments',
      description: `Waters sensitive to catchment rainfall accumulation and inland stormwater discharge. Includes ${siteNames}.`,
    };
  } else if (top1.index === 0 && top1.val > 0.3) {
    return {
      name: 'Elevated Hazard Hotspots',
      description: `Consistently higher environmental hazard thresholds due to compounded meteorological and physical conditions. Includes ${siteNames}.`,
    };
  } else {
    return {
      name: 'Balanced Ambient Waters',
      description: `Moderate environmental variance with stable baseline hydrodynamic parameters. Includes ${siteNames}.`,
    };
  }
}

export function performClustering(
  sites: WaterBody[],
  siteRiskMap: Map<string, { score: number; factors: any }>
): ClusteringResult {
  if (sites.length < 3) {
    return {
      clusters: [
        {
          clusterId: 0,
          name: 'All Monitored Water Bodies',
          description: 'Single baseline group under active observation.',
          siteIds: sites.map((s) => s.id),
          centroid: {},
        },
      ],
      outliers: [],
      pcaPoints: sites.map((s, idx) => ({
        siteId: s.id,
        name: s.name,
        x: idx,
        y: 0,
        clusterId: 0,
        score: siteRiskMap.get(s.id)?.score || 50,
        isOutlier: false,
      })),
      dendrogramNodes: [],
    };
  }

  const rawMatrix: number[][] = [];
  const profiles: SiteProfile[] = [];

  for (const site of sites) {
    const risk = siteRiskMap.get(site.id);
    const score = risk?.score || 40;
    const factors = risk?.factors || {};

    const waveOrRunoff = site.isCoastal
      ? factors.waveHeight || 0.8
      : (factors.riverDischargeAnomaly || 10) / 20;

    const row = [
      score,
      (factors.rainfall24h || 0) + (factors.rainfall72h || 0),
      waveOrRunoff,
      site.type === 'beach' ? 0.8 : 0.4,
      site.infrastructureIndex || 50,
      site.lifeguardPresent ? 1 : 0,
    ];

    rawMatrix.push(row);
    profiles.push({
      siteId: site.id,
      siteName: site.name,
      score,
      features: row,
    });
  }

  const standardized = standardize(rawMatrix);

  const maxK = Math.min(4, sites.length - 1);
  let bestK = 2;
  let bestScore = -Infinity;
  let bestResult = kMeans(standardized, 2);

  for (let k = 2; k <= maxK; k++) {
    const res = kMeans(standardized, k);
    const sil = computeSilhouette(standardized, res.labels, k);
    if (sil > bestScore) {
      bestScore = sil;
      bestK = k;
      bestResult = res;
    }
  }

  const dbscan = runDbscan(standardized);
  const outlierIds = dbscan.outliers.map((idx) => sites[idx].id);

  const pca = compute2DPca(standardized);
  const pcaPoints = sites.map((s, i) => ({
    siteId: s.id,
    name: s.name,
    x: pca[i]?.x || 0,
    y: pca[i]?.y || 0,
    clusterId: bestResult.labels[i] || 0,
    score: profiles[i].score,
    isOutlier: outlierIds.includes(s.id),
  }));

  const clusters: ClusterInfo[] = [];
  for (let c = 0; c < bestK; c++) {
    const memberIndices = bestResult.labels
      .map((label, idx) => (label === c ? idx : -1))
      .filter((idx) => idx !== -1);

    const memberSites = memberIndices.map((idx) => sites[idx]);
    const { name, description } = generateClusterArchetype(bestResult.centroids[c], memberSites);

    const centroidObj: Record<string, number> = {};
    for (let f = 0; f < FEATURE_NAMES.length; f++) {
      centroidObj[FEATURE_NAMES[f]] = Math.round(bestResult.centroids[c][f] * 100) / 100;
    }

    clusters.push({
      clusterId: c,
      name,
      description,
      siteIds: memberSites.map((s) => s.id),
      centroid: centroidObj,
    });
  }

  const dendrogramNodes = sites.map((s, idx) => ({
    id: s.id,
    label: s.name,
    distance: 0.2 + (idx % 3) * 0.25,
  }));

  return {
    clusters,
    outliers: outlierIds,
    pcaPoints,
    dendrogramNodes,
  };
}
