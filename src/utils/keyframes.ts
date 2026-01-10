import type { Keyframe, Vector } from '../types';
import { curveLength } from './math';

const EPSILON = 1e-6;

// キーフレームから空間ベジェ曲線を生成
export function buildSketchCurves(keyframes: Keyframe[]): Vector[][] {
  if (keyframes.length < 2) return [];

  const curves: Vector[][] = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const start = keyframes[i];
    const end = keyframes[i + 1];
    const p0 = start.position;
    const p3 = end.position;
    const outVec = start.sketchOut ?? p0.copy().set(0, 0);
    const inVec = end.sketchIn ?? p3.copy().set(0, 0);
    const p1 = p0.copy().add(outVec);
    const p2 = p3.copy().add(inVec);
    curves.push([p0, p1, p2, p3]);
  }

  return curves;
}

// 空間曲線からキーフレームの進行度（0-1）を算出
export function computeKeyframeProgress(
  keyframes: Keyframe[],
  curves: Vector[][],
): number[] {
  if (keyframes.length === 0) return [];
  if (keyframes.length === 1) return [0];

  const lengths = curves.map((c) => curveLength(c));
  const total = lengths.reduce((sum, len) => sum + len, 0);
  if (total <= EPSILON) return keyframes.map(() => 0);

  const progress: number[] = [0];
  let cumulative = 0;
  for (let i = 0; i < lengths.length; i++) {
    cumulative += lengths[i];
    progress.push(cumulative / total);
  }

  return progress;
}

// キーフレームから時間カーブ（タイミング）を生成
export function buildGraphCurves(
  keyframes: Keyframe[],
  progress: number[],
): Vector[][] {
  if (keyframes.length < 2) return [];

  const curves: Vector[][] = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const start = keyframes[i];
    const end = keyframes[i + 1];
    const t0 = start.time;
    const t1 = end.time;
    const v0 = progress[i] ?? 0;
    const v1 = progress[i + 1] ?? v0;
    const dt = t1 - t0;
    const dv = v1 - v0;

    const p0 = start.position.copy().set(t0, v0);
    const p3 = end.position.copy().set(t1, v1);

    const defaultOut = start.position.copy().set(dt / 3, dv / 3);
    const defaultIn = start.position.copy().set(-dt / 3, -dv / 3);

    const outVec = start.graphOut ?? defaultOut;
    const inVec = end.graphIn ?? defaultIn;

    const p1 = p0.copy().add(outVec);
    const p2 = p3.copy().add(inVec);
    curves.push([p0, p1, p2, p3]);
  }

  return curves;
}
