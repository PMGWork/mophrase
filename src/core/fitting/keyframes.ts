/**
 * 手書き点群からキーフレームを生成。
 * スケッチフィッティング→タイムスタンプ正規化→グラフフィッティングの一連のパイプラインを実行する。
 */

import type { FitErrorResult, Keyframe, Vector } from '../../types';
import { fitSketchCurves, fitGraphCurves } from './fitting';

// キーフレームを生成
export function generateKeyframes(
  points: Vector[],
  timestamps: number[],
  errorTol: number,
  coarseErrTol: number,
  fitError: { current: FitErrorResult },
): Keyframe[] {
  if (points.length < 2 || timestamps.length < 2) return [];

  // 1. スケッチをフィッティング
  // 手書きの点群を許容誤差の範囲内でベジェ曲線のリストに変換
  const { curves, ranges } = fitSketchCurves(
    points,
    errorTol,
    coarseErrTol,
    fitError,
  );
  if (curves.length === 0) return [];

  // 2. タイムスタンプを正規化
  // タイムスタンプを 0-1 の範囲に正規化
  const totalTime = timestamps[timestamps.length - 1] - timestamps[0];
  const timeNorm = timestamps.map((t) =>
    totalTime > 0 ? (t - timestamps[0]) / totalTime : 0,
  );

  // 空間距離の正規化
  const { distances, totalDistance } = cumulativeDistances(points);
  const progressNorm = distances.map((d) =>
    totalDistance > 0 ? d / totalDistance : 0,
  );

  const keyframes: Keyframe[] = [];

  // 3. スケッチ用キーフレームの生成
  // 近似されたベジェ曲線の端点からキーフレームの座標とハンドルを配置
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const range = ranges[i];
    const p0 = curve[0];
    const p1 = curve[1];
    const p2 = curve[2];
    const p3 = curve[3];

    if (i === 0) {
      const startTime = Math.max(0, Math.min(1, timeNorm[range.start] ?? 0));
      keyframes.push({
        time: startTime,
        position: p0.copy(),
        sketchOut: p1.copy().sub(p0),
      });
    } else {
      const keyframe = keyframes[i];
      if (keyframe) keyframe.sketchOut = p1.copy().sub(p0);
    }

    const endTime = Math.max(0, Math.min(1, timeNorm[range.end] ?? 0));
    keyframes.push({
      time: endTime,
      position: p3.copy(),
      sketchIn: p2.copy().sub(p3),
    });
  }

  // 4. グラフをフィッティング
  // スケッチ由来の分割点のみで曲線を分割し、最大誤差の分割点から確定する
  const timingPoints: Vector[] = [];
  for (let i = 0; i < points.length; i++) {
    const t = timeNorm[i] ?? 0;
    const v = progressNorm[i] ?? 0;
    timingPoints.push(points[0].copy().set(t, v));
  }

  const splitPoints = ranges.slice(0, -1).map((range) => range.end);
  const { curves: timingCurves, ranges: timingRanges } = fitGraphCurves(
    timingPoints,
    splitPoints,
  );

  for (let i = 0; i < timingCurves.length; i++) {
    const range = timingRanges[i];
    const timingCurve = timingCurves[i];
    const startKeyframe = keyframes[i];
    const endKeyframe = keyframes[i + 1];
    if (!range || !startKeyframe || !endKeyframe) continue;

    const dt = endKeyframe.time - startKeyframe.time;
    const dv =
      (progressNorm[range.end] ?? 0) - (progressNorm[range.start] ?? 0);
    const p0 = timingCurve[0];
    const p1 = timingCurve[1];
    const p2 = timingCurve[2];
    const p3 = timingCurve[3];

    if (p0 && p1 && p2 && p3) {
      startKeyframe.graphOut = p1.copy().sub(p0);
      endKeyframe.graphIn = p2.copy().sub(p3);
    } else {
      startKeyframe.graphOut = points[0].copy().set(dt / 3, dv / 3);
      endKeyframe.graphIn = points[0].copy().set(-dt / 3, -dv / 3);
    }
  }

  return keyframes;
}

// 累積距離を計算
function cumulativeDistances(points: Vector[]): {
  distances: number[];
  totalDistance: number;
} {
  const distances = [0];
  let totalDistance = 0;

  for (let i = 1; i < points.length; i++) {
    totalDistance += points[i].dist(points[i - 1]);
    distances.push(totalDistance);
  }

  return { distances, totalDistance };
}
