/**
 * 不連続候補の検出。
 * 手描き点列の角度・距離・速度変化から分割候補インデックスを返す。
 */

import type p5 from 'p5';

const EPS = 1e-6;
const MIN_TIME_DELTA_MS = 8;
const MIN_INDEX_GAP = 2;

const STRONG_TURN_DEG = 70;
const DISTANCE_TURN_DEG = 45;
const SPEED_TURN_DEG = 35;

const DISTANCE_RATIO_THRESHOLD = 2.4;
const SPEED_RATIO_THRESHOLD = 2.8;

// 不連続候補を検出
export function detectDiscontinuitySplitPoints(
  points: p5.Vector[],
  timestamps: number[],
  errorTol: number,
): number[] {
  if (points.length < 3) return [];

  const minStepPx = Math.max(2, finiteOr(errorTol, 0) * 0.12);

  const candidates: Array<{ index: number; turnAngleDeg: number }> = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!prev || !curr || !next) continue;

    const prevVec = curr.copy().sub(prev);
    const nextVec = next.copy().sub(curr);
    const prevLen = prevVec.mag();
    const nextLen = nextVec.mag();
    if (prevLen <= EPS || nextLen <= EPS) continue;

    const turnAngleDeg = computeTurnAngleDeg(
      prevVec,
      nextVec,
      prevLen,
      nextLen,
    );
    const distanceRatio = ratio(prevLen, nextLen);

    const dtPrev = clampedTimeDeltaMs(timestamps, i - 1, i);
    const dtNext = clampedTimeDeltaMs(timestamps, i, i + 1);
    const prevSpeed = prevLen / dtPrev;
    const nextSpeed = nextLen / dtNext;
    const speedRatio = ratio(prevSpeed, nextSpeed);

    const maxStep = Math.max(prevLen, nextLen);
    const isCandidate =
      (turnAngleDeg >= STRONG_TURN_DEG && maxStep >= minStepPx) ||
      (turnAngleDeg >= DISTANCE_TURN_DEG &&
        distanceRatio >= DISTANCE_RATIO_THRESHOLD) ||
      (turnAngleDeg >= SPEED_TURN_DEG && speedRatio >= SPEED_RATIO_THRESHOLD);

    if (!isCandidate) continue;

    candidates.push({ index: i, turnAngleDeg });
  }

  if (candidates.length === 0) return [];

  const filtered: Array<{ index: number; turnAngleDeg: number }> = [];
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

    if (candidate.turnAngleDeg > prev.turnAngleDeg) {
      filtered[filtered.length - 1] = candidate;
    }
  }

  return filtered.map((candidate) => candidate.index);
}

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

function ratio(a: number, b: number): number {
  const maxValue = Math.max(a, b);
  const minValue = Math.min(a, b);
  return maxValue / Math.max(minValue, EPS);
}

function clampedTimeDeltaMs(
  timestamps: number[],
  startIndex: number,
  endIndex: number,
): number {
  const start = timestamps[startIndex];
  const end = timestamps[endIndex];
  const delta = finiteOr(end, 0) - finiteOr(start, 0);
  return Math.max(MIN_TIME_DELTA_MS, delta);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
