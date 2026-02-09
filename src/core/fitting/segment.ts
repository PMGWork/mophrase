import type { FitErrorResult, Vector } from '../../types';
import {
  bernstein,
  bezierCurve,
  refineParameter,
  unitTangent,
} from '../../utils/math';

// 範囲情報
export interface Range {
  start: number;
  end: number;
}

// 接ベクトル情報
export interface Tangents {
  start: Vector;
  end: Vector;
}

export interface FitCurveResult {
  curves: Vector[][];
  ranges: Range[];
}

// ベジェ曲線の始点と終点の接ベクトルを計算する
export function computeEndTangents(points: Vector[]): [Vector, Vector] {
  const n = points.length;

  // 始点の接ベクトル t_1 を計算
  const d1 = points[0];
  const d2 = points[1];
  const tangent0 = unitTangent(d1, d2);

  // 終点の接ベクトル t_2 を計算
  const dn_1 = points[n - 2];
  const dn = points[n - 1];
  const tangent1 = unitTangent(dn_1, dn).mult(-1);

  return [tangent0, tangent1];
}

// 点列に対応する曲線のパラメータの位置を計算する
export function parametrizeRange(points: Vector[], range: Range): number[] {
  const params: number[] = [0];

  // 分割点が1つの場合はパラメータを計算しない
  if (range.end - range.start < 1) return params;

  // 分割点間の距離を計算
  let totalDist = 0;
  for (let j = range.start + 1; j <= range.end; j++) {
    totalDist += points[j].dist(points[j - 1]);
  }

  // 分割点間の距離を累積してパラメータを計算
  let cumulativeDist = 0;
  for (let i = range.start + 1; i <= range.end; i++) {
    cumulativeDist += points[i].dist(points[i - 1]);
    const u_i = totalDist > 0 ? cumulativeDist / totalDist : 0;
    params.push(u_i);
  }

  return params;
}

// 3次ベジェ曲線の始点と終点を定める
export function extractEndPoints(
  points: Vector[],
  range: Range,
): [Vector, Vector] {
  return [points[range.start].copy(), points[range.end].copy()];
}

// 始点と終点以外の2つの制御点の端点からの距離を求める
export function fitControlPoints(
  controls: Vector[],
  params: number[],
  tangents: Tangents,
  points: Vector[],
  range: Range,
): void {
  const n = range.end - range.start + 1;
  if (n < 2) return;

  const { start: startTangent, end: endTangent } = tangents;

  const v0 = controls[0].copy();
  const v3 = controls[3].copy();
  const t1 = startTangent.copy();
  const t2 = endTangent.copy();

  // デフォルトのα値(端点からの距離)
  const chordLength = v0.dist(v3);
  const defaultAlpha = chordLength / 3.0;

  // 正規方程式の係数行列と右辺ベクトルを初期化
  let c11 = 0; // C_11 = Σ A1·A1
  let c12 = 0; // C_12 = Σ A1·A2
  let c22 = 0; // C_22 = Σ A2·A2
  let x1 = 0; // X_1 = Σ A1·C_i
  let x2 = 0; // X_2 = Σ A2·C_i

  for (let i = 0; i < params.length; i++) {
    const u = params[i];

    // バーンスタイン基底関数を計算
    const b0 = bernstein(0, 3, u);
    const b1 = bernstein(1, 3, u);
    const b2 = bernstein(2, 3, u);
    const b3 = bernstein(3, 3, u);

    // A1 = B_1(u)·t_1
    // A2 = B_2(u)·t_2
    const a1 = t1.copy().mult(b1);
    const a2 = t2.copy().mult(b2);

    // T_i = d_i - V_0(B_0 + B_1) - V_3(B_2 + B_3)
    const tVec = points[range.start + i]
      .copy()
      .sub(v0.copy().mult(b0 + b1))
      .sub(v3.copy().mult(b2 + b3));

    // 係数行列の要素を累積
    c11 += a1.dot(a1); // C_11 = Σ a1·a1
    c12 += a1.dot(a2); // C_12 = Σ a1·a2
    c22 += a2.dot(a2); // C_22 = Σ a2·a2

    // 右辺ベクトルの要素を累積
    x1 += a1.dot(tVec); // X_1 = Σ a1·T_i
    x2 += a2.dot(tVec); // X_2 = Σ a2·T_i
  }

  // 連立方程式を解く
  // C_11·α_1 + C_12·α_2 = X_1
  // C_12·α_1 + C_22·α_2 = X_2
  const det = c11 * c22 - c12 * c12;

  // 特異行列の場合はデフォルト値を使用
  if (Math.abs(det) < 1e-6 || chordLength === 0) {
    controls[1] = v0.copy().add(t1.copy().mult(defaultAlpha));
    controls[2] = v3.copy().add(t2.copy().mult(defaultAlpha));
    return;
  }

  // α_1, α_2 を計算
  const alpha_1 = (c22 * x1 - c12 * x2) / det;
  const alpha_2 = (c11 * x2 - c12 * x1) / det;

  // 制御点を設定
  controls[1] = v0.copy().add(t1.copy().mult(alpha_1)); // V_1 = V_0 + α_1·t_1
  controls[2] = v3.copy().add(t2.copy().mult(alpha_2)); // V_2 = V_3 + α_2·t_2
}

// ベジェ曲線と点列との最大距離を求める
export function computeMaxError(
  controls: Vector[],
  params: number[],
  points: Vector[],
  range: Range,
): FitErrorResult {
  const n = range.end - range.start + 1;

  // 点列が3点未満の場合は誤差を計算しない
  if (n < 3) return { maxError: 0, index: -1 };

  // 制御点が不正な場合は誤差を計算しない
  if (!controls.every((c) => c))
    return { maxError: Number.MAX_VALUE, index: -1 };

  // 最大誤差を計算
  let maxError = -1;
  let maxIndex = -1;

  for (let i = 1; i < params.length - 1; i++) {
    const u = params[i];
    const curve = bezierCurve(
      controls[0],
      controls[1],
      controls[2],
      controls[3],
      u,
    );
    const error = points[range.start + i].dist(curve);
    if (error > maxError) {
      maxError = error;
      maxIndex = range.start + i;
    }
  }

  return { maxError, index: maxIndex };
}

// 分割点を考慮してベジェ曲線と点列との最大距離を求める
export function computeMaxErrorAtSplitPoints(
  controls: Vector[],
  params: number[],
  points: Vector[],
  range: Range,
  splitPoints: number[],
): FitErrorResult {
  let maxError = -1;
  let maxIndex = -1;

  for (const index of splitPoints) {
    if (index <= range.start || index >= range.end) continue;
    const u = params[index - range.start];
    if (u === undefined) continue;
    const curve = bezierCurve(
      controls[0],
      controls[1],
      controls[2],
      controls[3],
      u,
    );
    const error = points[index].dist(curve);
    if (error > maxError) {
      maxError = error;
      maxIndex = index;
    }
  }

  return { maxError: Math.max(0, maxError), index: maxIndex };
}

// ニュートン法でパラメータを1回更新する
export function refineParams(
  controls: Vector[],
  params: number[],
  points: Vector[],
  startIndex: number,
): void {
  const cubicControls = controls as [Vector, Vector, Vector, Vector];

  for (let i = 1; i < params.length - 1; i++) {
    const u = params[i];
    const point = points[startIndex + i];

    let newU = refineParameter(cubicControls, point, u);
    if (!Number.isFinite(newU)) continue;
    newU = Math.max(0, Math.min(1, newU));

    params[i] = newU;
  }
}
