/**
 * 不連続候補の検出。
 * 手描き点列の角度・距離・速度変化から分割候補インデックスを返す。
 */

import type p5 from 'p5';
import { clamp, toFinite } from '../../utils/math';

const MIN_TIME_DELTA_MS = 8;

// 定数
const MIN_INDEX_GAP = 2;
const CORNER_ANGLE_DEG = 90;
const ASSISTED_ANGLE_DEG = 55;
const SCORED_PASS_THRESHOLD = 0.85;

// 候補の評価指標
type CandidateMetric = {
  index: number;
  turnAngleDeg: number;
  windowTurnAngleDeg: number;
  baseAngleDeg: number;
  distanceRatio: number;
  speedRatio: number;
  maxStep: number;
};

// 候補
type Candidate = {
  index: number;
  turnAngleDeg: number;
  windowTurnAngleDeg: number;
  score: number;
};

// 不連続候補を検出
export function detectDiscontinuitySplitPoints(
  points: p5.Vector[],
  timestamps: number[],
  errorTol: number,
): number[] {
  if (points.length < 3) return [];

  const minStepPx = resolveMinStepPx(errorTol);
  const metrics = collectCandidateMetrics(points, timestamps);
  if (metrics.size === 0) return [];

  const candidates = collectCandidates(metrics, minStepPx);
  if (candidates.length === 0) return [];

  return mergeCloseCandidates(candidates).map((candidate) => candidate.index);
}

// エラー許容度から最小ステップを解決
function resolveMinStepPx(errorTol: number): number {
  return Math.max(2, toFinite(errorTol, 0) * 0.18);
}

// 各インデックスの評価用メトリクスを収集
function collectCandidateMetrics(
  points: p5.Vector[],
  timestamps: number[],
): Map<number, CandidateMetric> {
  const metrics = new Map<number, CandidateMetric>();
  for (let i = 1; i < points.length - 1; i++) {
    const metric = buildCandidateMetric(points, timestamps, i);
    if (!metric) continue;
    metrics.set(i, metric);
  }
  return metrics;
}

// 単一点の候補メトリクスを構築
function buildCandidateMetric(
  points: p5.Vector[],
  timestamps: number[],
  index: number,
): CandidateMetric | null {
  const prev = points[index - 1];
  const curr = points[index];
  const next = points[index + 1];
  if (!prev || !curr || !next) return null;

  const prevVec = curr.copy().sub(prev);
  const nextVec = next.copy().sub(curr);
  const prevLen = prevVec.mag();
  const nextLen = nextVec.mag();
  if (prevLen <= 1e-6 || nextLen <= 1e-6) return null;

  const turnAngleDeg = computeTurnAngleDeg(prevVec, nextVec, prevLen, nextLen);
  const windowTurnAngleDeg = computeWindowTurnAngleDeg(points, index);
  const distanceRatio = ratio(prevLen, nextLen);

  const dtPrev = clampedTimeDeltaMs(timestamps, index - 1, index);
  const dtNext = clampedTimeDeltaMs(timestamps, index, index + 1);
  const prevSpeed = prevLen / dtPrev;
  const nextSpeed = nextLen / dtNext;
  const speedRatio = ratio(prevSpeed, nextSpeed);

  const maxStep = Math.max(prevLen, nextLen);
  const baseAngleDeg = Math.max(turnAngleDeg, windowTurnAngleDeg);

  return {
    index,
    turnAngleDeg,
    windowTurnAngleDeg,
    baseAngleDeg,
    distanceRatio,
    speedRatio,
    maxStep,
  };
}

// メトリクスから不連続候補を抽出
function collectCandidates(
  metrics: Map<number, CandidateMetric>,
  minStepPx: number,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const [index, metric] of metrics) {
    const score = computeCandidateScore(metrics, index, metric, minStepPx);
    if (!isCornerCandidate(metric, score, minStepPx)) continue;

    candidates.push({
      index: metric.index,
      turnAngleDeg: metric.turnAngleDeg,
      windowTurnAngleDeg: metric.windowTurnAngleDeg,
      score,
    });
  }

  return candidates;
}

// 角度・比率・ピーク性・ステップ長から候補スコアを算出
function computeCandidateScore(
  metrics: Map<number, CandidateMetric>,
  index: number,
  metric: CandidateMetric,
  minStepPx: number,
): number {
  const isLocalAnglePeak = isLocalAnglePeakByRadius(metrics, index, 2);
  const angleScore = clamp(
    // 固定: scored min angle = 48deg
    (metric.baseAngleDeg - 48) / (CORNER_ANGLE_DEG - 48),
    0,
    1,
  );

  const ratioScore =
    // 固定: distance ratio >= 3.2 で +0.15 / speed ratio >= 4.0 で +0.15
    (metric.distanceRatio >= 3.2 ? 0.15 : 0) +
    (metric.speedRatio >= 4.0 ? 0.15 : 0);
  const peakScore = isLocalAnglePeak ? 0.25 : 0;
  const stepScore = metric.maxStep >= minStepPx ? 0.2 : 0;

  // 固定: score = angle*0.6 + ratio + peak + step
  return angleScore * 0.6 + ratioScore + peakScore + stepScore;
}

// 強角・補助角・スコア救済のいずれかで候補採用
function isCornerCandidate(
  metric: CandidateMetric,
  score: number,
  minStepPx: number,
): boolean {
  const isStrongCorner =
    metric.baseAngleDeg >= CORNER_ANGLE_DEG && metric.maxStep >= minStepPx;
  const isAssistedCorner =
    metric.baseAngleDeg >= ASSISTED_ANGLE_DEG &&
    metric.maxStep >= minStepPx &&
    (metric.distanceRatio >= 3.2 || metric.speedRatio >= 4.0);
  const isScoredCorner =
    metric.baseAngleDeg >= 48 &&
    score >= SCORED_PASS_THRESHOLD;

  return isStrongCorner || isAssistedCorner || isScoredCorner;
}

// 近接候補を1点に統合
function mergeCloseCandidates(candidates: Candidate[]): Candidate[] {
  const filtered: Candidate[] = [];
  for (const candidate of candidates) {
    const prev = filtered[filtered.length - 1];
    if (!prev) {
      filtered.push(candidate);
      continue;
    }

    if (candidate.index - prev.index >= MIN_INDEX_GAP) {
      filtered.push(candidate);
      continue;
    }

    if (isCandidateBetter(candidate, prev)) {
      filtered[filtered.length - 1] = candidate;
    }
  }
  return filtered;
}

// 前後2点窓で角度を計算（大局的な折れを補足）
function computeWindowTurnAngleDeg(points: p5.Vector[], index: number): number {
  const startIndex = index - 2;
  const endIndex = index + 2;
  if (startIndex < 0 || endIndex >= points.length) return 0;

  const before = points[startIndex];
  const current = points[index];
  const after = points[endIndex];
  if (!before || !current || !after) return 0;

  const inVec = current.copy().sub(before);
  const outVec = after.copy().sub(current);
  const inLen = inVec.mag();
  const outLen = outVec.mag();
  if (inLen <= 1e-6 || outLen <= 1e-6) return 0;

  return computeTurnAngleDeg(inVec, outVec, inLen, outLen);
}

// 指定半径で局所角度ピークか判定
function isLocalAnglePeakByRadius(
  metrics: Map<number, CandidateMetric>,
  index: number,
  radius: number,
): boolean {
  const current = metrics.get(index);
  if (!current) return false;

  for (let i = index - radius; i <= index + radius; i++) {
    if (i === index) continue;
    const neighbor = metrics.get(i);
    if (!neighbor) continue;
    if (neighbor.baseAngleDeg > current.baseAngleDeg) return false;
  }

  return true;
}

// 近接候補の優先順位（score > turnAngle > windowTurnAngle）で比較
function isCandidateBetter(a: Candidate, b: Candidate): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.turnAngleDeg !== b.turnAngleDeg) return a.turnAngleDeg > b.turnAngleDeg;
  return a.windowTurnAngleDeg > b.windowTurnAngleDeg;
}

// 前後ベクトルのなす角（度）を返す
function computeTurnAngleDeg(
  prevVec: p5.Vector,
  nextVec: p5.Vector,
  prevLen: number,
  nextLen: number,
): number {
  const cosine = prevVec.dot(nextVec) / (prevLen * nextLen);
  const clamped = Math.max(-1, Math.min(1, cosine));
  return (Math.acos(clamped) * 180) / Math.PI;
}

// 大きい方 / 小さい方の比率を返す（ゼロ除算防止付き）
function ratio(a: number, b: number): number {
  const maxValue = Math.max(a, b);
  const minValue = Math.min(a, b);
  return maxValue / Math.max(minValue, 1e-6);
}

// 2点間の経過時間（ms）を返す。最小値 MIN_TIME_DELTA_MS でクランプ
function clampedTimeDeltaMs(
  timestamps: number[],
  startIndex: number,
  endIndex: number,
): number {
  const start = timestamps[startIndex];
  const end = timestamps[endIndex];
  const delta = toFinite(end, 0) - toFinite(start, 0);
  return Math.max(MIN_TIME_DELTA_MS, delta);
}
