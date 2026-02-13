/**
 * キーフレーム配列からスケッチ用・グラフ用のベジエ曲線を構築する。
 * 各キーフレーム間のハンドル情報をもとに制御点列を生成する。
 */

import type p5 from 'p5';
import type { Keyframe } from '../types';
import { curveLength, splitCubicBezier } from './bezier';

// #region 共通利用
// キーフレームからベジェ曲線を生成
export function buildSketchCurves(keyframes: Keyframe[]): p5.Vector[][] {
  if (keyframes.length < 2) return [];

  const curves: p5.Vector[][] = [];
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
// #endregion

// #region イージング曲線の利用
// キーフレーム配列と対応する曲線群から進行度を計算
export function computeKeyframeProgress(
  keyframes: Keyframe[],
  curves: p5.Vector[][],
): number[] {
  if (keyframes.length === 0) return [];
  if (keyframes.length === 1) return [0];

  const lengths = curves.map((c) => curveLength(c));
  const total = lengths.reduce((sum, len) => sum + len, 0);
  if (total <= 1e-6) return keyframes.map(() => 0);

  const progress: number[] = [0];
  let cumulative = 0;
  for (let i = 0; i < lengths.length; i++) {
    cumulative += lengths[i];
    progress.push(cumulative / total);
  }

  return progress;
}

// キーフレーム配列と進行度からグラフ用ベジェ曲線を生成
export function buildGraphCurves(
  keyframes: Keyframe[],
  progress: number[],
): p5.Vector[][] {
  if (keyframes.length < 2) return [];

  const curves: p5.Vector[][] = [];
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
// #endregion

// #region セグメント分割
type SketchSegmentSplitResult = {
  point: p5.Vector;
  startSketchOut?: p5.Vector;
  endSketchIn?: p5.Vector;
  insertedSketchIn?: p5.Vector;
  insertedSketchOut?: p5.Vector;
};

type GraphSegmentSplitResult = {
  startGraphOut?: p5.Vector;
  endGraphIn?: p5.Vector;
  insertedGraphIn?: p5.Vector;
  insertedGraphOut?: p5.Vector;
};

// 入力検証
function assertSplitSegmentInput(
  keyframes: Keyframe[],
  segmentIndex: number,
  t: number,
): void {
  if (!Number.isFinite(t) || t <= 0 || t >= 1) {
    throw new RangeError('split parameter t must be within (0, 1)');
  }
  if (keyframes.length < 2) {
    throw new Error('At least 2 keyframes are required to split a segment');
  }
  if (segmentIndex < 0 || segmentIndex >= keyframes.length - 1) {
    throw new RangeError('segmentIndex is out of range');
  }
}

// セグメント分割のジオメトリ計算
function splitSketchSegmentGeometry(
  start: Keyframe,
  end: Keyframe,
  t: number,
): SketchSegmentSplitResult {
  const p0 = start.position.copy();
  const p3 = end.position.copy();
  const p1 = p0.copy().add(start.sketchOut ?? p0.copy().set(0, 0));
  const p2 = p3.copy().add(end.sketchIn ?? p3.copy().set(0, 0));
  const { left, right, point } = splitCubicBezier([p0, p1, p2, p3], t);

  return {
    point: point.copy(),
    startSketchOut: normalizeHandle(left[1].copy().sub(left[0])),
    endSketchIn: normalizeHandle(right[2].copy().sub(right[3])),
    insertedSketchIn: normalizeHandle(left[2].copy().sub(left[3])),
    insertedSketchOut: normalizeHandle(right[1].copy().sub(right[0])),
  };
}

// セグメント分割時のグラフハンドル計算
function splitGraphSegmentGeometry(
  start: Keyframe,
  end: Keyframe,
  startProgress: number,
  endProgress: number,
  t: number,
): GraphSegmentSplitResult {
  const t0 = start.time;
  const t1 = end.time;
  const dt = t1 - t0;
  const dv = endProgress - startProgress;

  const p0 = start.position.copy().set(t0, startProgress);
  const p3 = end.position.copy().set(t1, endProgress);
  const defaultOut = start.position.copy().set(dt / 3, dv / 3);
  const defaultIn = start.position.copy().set(-dt / 3, -dv / 3);
  const p1 = p0.copy().add(start.graphOut ?? defaultOut);
  const p2 = p3.copy().add(end.graphIn ?? defaultIn);
  const { left, right } = splitCubicBezier([p0, p1, p2, p3], t);

  return {
    startGraphOut: normalizeHandle(left[1].copy().sub(left[0])),
    endGraphIn: normalizeHandle(right[2].copy().sub(right[3])),
    insertedGraphIn: normalizeHandle(left[2].copy().sub(left[3])),
    insertedGraphOut: normalizeHandle(right[1].copy().sub(right[0])),
  };
}

// キーフレーム配列へ分割キーフレームを挿入
function insertSplitKeyframe(
  keyframes: Keyframe[],
  segmentIndex: number,
  t: number,
  split: SketchSegmentSplitResult,
  graphSplit: GraphSegmentSplitResult,
): Keyframe[] {
  const start = keyframes[segmentIndex];
  const end = keyframes[segmentIndex + 1];

  start.sketchOut = split.startSketchOut;
  end.sketchIn = split.endSketchIn;
  start.graphOut = graphSplit.startGraphOut;
  end.graphIn = graphSplit.endGraphIn;

  const inserted: Keyframe = {
    time: start.time + (end.time - start.time) * t,
    position: split.point.copy(),
    sketchIn: split.insertedSketchIn,
    sketchOut: split.insertedSketchOut,
    graphIn: graphSplit.insertedGraphIn,
    graphOut: graphSplit.insertedGraphOut,
  };

  keyframes.splice(segmentIndex + 1, 0, inserted);
  return keyframes;
}

// セグメント分割のメイン関数
export function splitKeyframeSegment(
  keyframes: Keyframe[],
  segmentIndex: number,
  t: number,
): Keyframe[] {
  assertSplitSegmentInput(keyframes, segmentIndex, t);
  const next = keyframes.map(cloneKeyframe);
  const curves = buildSketchCurves(next);
  const progress = computeKeyframeProgress(next, curves);
  const start = next[segmentIndex];
  const end = next[segmentIndex + 1];
  const split = splitSketchSegmentGeometry(start, end, t);
  const startProgress = progress[segmentIndex] ?? 0;
  const endProgress = progress[segmentIndex + 1] ?? startProgress;
  const graphSplit = splitGraphSegmentGeometry(
    start,
    end,
    startProgress,
    endProgress,
    t,
  );
  return insertSplitKeyframe(next, segmentIndex, t, split, graphSplit);
}
// #endregion

// #region 内部ヘルパー
// ハンドルベクトルの正規化（ゼロベクトルはundefinedに変換）
function normalizeHandle(vec: p5.Vector): p5.Vector | undefined {
  if (vec.magSq() <= 1e-6 * 1e-6) return undefined;
  return vec;
}

// キーフレームのクローン作成
function cloneKeyframe(keyframe: Keyframe): Keyframe {
  return {
    ...keyframe,
    position: keyframe.position.copy(),
    sketchIn: keyframe.sketchIn?.copy(),
    sketchOut: keyframe.sketchOut?.copy(),
    graphIn: keyframe.graphIn?.copy(),
    graphOut: keyframe.graphOut?.copy(),
  };
}
// #endregion
