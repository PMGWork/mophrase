/**
 * ベジェ曲線フィッティング関連 / Bézier Curve Fitting Module
 * 
 * このモジュールは、点列から3次ベジェ曲線を自動生成するアルゴリズムを実装しています。
 * This module implements algorithms for automatically generating cubic Bézier curves from point sequences.
 * 
 * Algorithm Overview / アルゴリズムの概要:
 * 1. 接線ベクトルを計算 / Compute tangent vectors
 * 2. パラメータ化 / Parameterize points along curve
 * 3. 最小二乗法で制御点を最適化 / Optimize control points using least squares
 * 4. 誤差を評価 / Evaluate fitting error
 * 5. ニュートン法で精密化 / Refine using Newton's method
 * 6. 必要に応じて再帰的に分割 / Recursively subdivide if needed
 * 
 * Based on: "An Algorithm for Automatically Fitting Digitized Curves"
 * by Philip J. Schneider (Graphics Gems, 1990)
 */

import type { Vector, FitErrorResult, Range, Tangents } from './types';
import { bernstein, unitTangent, bezierCurve, refineParameter, splitTangent } from './mathUtils';

/**
 * 1. 3次ベジェ曲線の始点と終点の接ベクトルを計算する
 * Compute tangent vectors at the start and end of a cubic Bézier curve
 * 
 * @param points - 点列 / Array of points
 * @returns [始点の接ベクトル, 終点の接ベクトル] / [start tangent, end tangent]
 */
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

/**
 * 2. 点列に対応する曲線のパラメータの位置を計算する
 * Compute parameter positions along the curve for each point (chord-length parameterization)
 * 
 * @param points - 点列 / Array of points
 * @param range - 範囲 / Range of indices to parameterize
 * @returns パラメータ配列 (0.0～1.0) / Array of parameters (0.0 to 1.0)
 */
export function parametrizeRange(
  points: Vector[],
  range: Range
): number[] {
  const _params: number[] = [0];

  // 分割点が1つの場合はパラメータを計算しない
  if (range.end - range.start < 1) return _params;

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
    _params.push(u_i);
  }

  return _params;
}

/**
 * 3. 3次ベジェ曲線の始点と終点を定める
 * Extract the start and end points for the cubic Bézier curve
 * 
 * @param points - 点列 / Array of points
 * @param range - 範囲 / Range of indices
 * @returns [始点, 終点] / [start point, end point]
 */
export function extractEndPoints(
  points: Vector[],
  range: Range
): [Vector, Vector] {
  return [points[range.start].copy(), points[range.end].copy()];
}

/**
 * 4. 始点と終点以外の2つ制御点の端点からの距離を求める
 * Calculate the two interior control points using least squares method
 * 
 * 最小二乗法を使用して、ベジェ曲線の内部制御点を最適化します。
 * Uses least squares optimization to fit the interior control points of the Bézier curve.
 * 
 * @param controls - 制御点配列（更新される） / Control points array (will be updated)
 * @param params - パラメータ配列 / Parameter array
 * @param tangents - 接線ベクトル / Tangent vectors
 * @param points - 元の点列 / Original point sequence
 * @param range - 範囲 / Range of indices
 */
export function fitControlPoints(
  controls: Vector[],
  params: number[],
  tangents: Tangents,
  points: Vector[],
  range: Range
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
  let c11 = 0;  // C_11 = Σ A1·A1
  let c12 = 0;  // C_12 = Σ A1·A2
  let c22 = 0;  // C_22 = Σ A2·A2
  let x1 = 0;   // X_1 = Σ A1·C_i
  let x2 = 0;   // X_2 = Σ A2·C_i

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
    c11 += a1.dot(a1);  // C_11 = Σ a1·a1
    c12 += a1.dot(a2);  // C_12 = Σ a1·a2
    c22 += a2.dot(a2);  // C_22 = Σ a2·a2

    // 右辺ベクトルの要素を累積
    x1 += a1.dot(tVec);  // X_1 = Σ a1·T_i
    x2 += a2.dot(tVec);  // X_2 = Σ a2·T_i
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
  controls[1] = v0.copy().add(t1.copy().mult(alpha_1));  // V_1 = V_0 + α_1·t_1
  controls[2] = v3.copy().add(t2.copy().mult(alpha_2));  // V_2 = V_3 + α_2·t_2
}

/**
 * 5. 求めたベジェ曲線と点列との最大距離を求める
 * Compute the maximum distance between the fitted Bézier curve and the original points
 * 
 * @param controls - ベジェ曲線の制御点 / Bézier curve control points
 * @param params - パラメータ配列 / Parameter array
 * @param points - 元の点列 / Original point sequence
 * @param range - 範囲 / Range of indices
 * @returns 最大誤差とそのインデックス / Maximum error and its index
 */
export function computeMaxError(
  controls: Vector[],
  params: number[],
  points: Vector[],
  range: Range
): FitErrorResult {
  const n = range.end - range.start + 1;

  if (
    n < 2 ||
    !controls[0] ||
    !controls[1] ||
    !controls[2] ||
    !controls[3]
  ) {
    return { maxError: Number.MAX_VALUE, index: -1 };
  }

  // 端点はベジェ曲線と一致するため、端点以外で最大誤差を探索
  if (n === 2) return { maxError: 0, index: -1 };

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
      u
    );
    const error = points[range.start + i].dist(curve);
    if (error > maxError) {
      maxError = error;
      maxIndex = range.start + i;
    }
  }

  return { maxError, index: maxIndex };
}

/**
 * 6. ニュートン法でパラメータを1回更新する
 * Refine parameters using Newton-Raphson method (one iteration)
 * 
 * ニュートン法を使用してパラメータを改善し、フィッティング精度を向上させます。
 * Improves parameters using Newton's method to enhance fitting accuracy.
 * 
 * @param controls - ベジェ曲線の制御点 / Bézier curve control points
 * @param params - パラメータ配列（更新される） / Parameter array (will be updated)
 * @param points - 元の点列 / Original point sequence
 * @param startIndex - 開始インデックス / Starting index
 * @returns 改善があったかどうか / Whether improvement was made
 */
export function refineParams(
  controls: Vector[],
  params: number[],
  points: Vector[],
  startIndex: number
): boolean {
  const cubicControls = controls as [Vector, Vector, Vector, Vector];
  let improved = false;

  for (let i = 1; i < params.length - 1; i++) {
    const u = params[i];
    const point = points[startIndex + i];

    let newU = refineParameter(cubicControls, point, u);
    if (!Number.isFinite(newU)) continue;
    newU = Math.max(0, Math.min(1, newU)); // constrain

    if (Math.abs(newU - u) > 0.0001) improved = true;
    params[i] = newU;
  }

  return improved;
}

/**
 * 再帰的にベジェ曲線をフィットする
 * Recursively fit Bézier curves to point sequences
 * 
 * このアルゴリズムは以下の戦略を使用します：
 * This algorithm uses the following strategy:
 * 1. 誤差が許容範囲内なら確定 / If error is within tolerance, accept curve
 * 2. 誤差が中程度ならニュートン法で改善を試みる / If moderate error, try Newton refinement
 * 3. 誤差が大きければ曲線を分割して再帰処理 / If error is large, subdivide and recurse
 * 
 * @param points - 元の点列 / Original point sequence
 * @param curves - 結果の曲線配列（追加される） / Result curves array (will be appended to)
 * @param range - 処理範囲 / Range to process
 * @param tangents - 端点の接線ベクトル / Tangent vectors at endpoints
 * @param errorTol - 許容誤差 / Error tolerance
 * @param coarseErrTol - 粗い許容誤差 / Coarse error tolerance
 * @param lastFitError - 最後のフィット誤差（更新される） / Last fit error (will be updated)
 */
export function fitCurveRange(
  points: Vector[],
  curves: Vector[][],
  range: Range,
  tangents: Tangents,
  errorTol: number,
  coarseErrTol: number,
  lastFitError: { current: FitErrorResult }
): void {
  // パラメータを計算
  const params = parametrizeRange(points, range);

  // 制御点を計算
  const controls: Vector[] = new Array(4);
  const [p0, p3] = extractEndPoints(points, range);
  controls[0] = p0;
  controls[3] = p3;
  fitControlPoints(
    controls,
    params,
    tangents,
    points,
    range
  );

  // 最大誤差を計算
  let errorResult = computeMaxError(controls, params, points, range);
  let maxError = errorResult.maxError;

  // lastFitErrorを更新
  lastFitError.current = errorResult;

  // 許容誤差内にある場合のみ確定
  if (maxError <= errorTol) {
    curves.push(controls);
    return;
  }

  // 粗めの誤差を満たす場合
  if (maxError <= coarseErrTol) {
    const maxIterations = 4;
    for (let iter = 0; iter < maxIterations; iter++) {
      // Newton法でパラメータを再計算
      const improved = refineParams(controls, params, points, range.start);

      // 制御点を再生成
      fitControlPoints(controls, params, tangents, points, range);

      // 誤差を再評価
      const newErrorResult = computeMaxError(controls, params, points, range);
      maxError = newErrorResult.maxError;

      // lastFitErrorを更新
      lastFitError.current = newErrorResult;

      // 許容誤差内に収まったら確定
      if (maxError <= errorTol) {
        curves.push(controls);
        return;
      }

      // 改善が見られなければループを抜ける
      if (!improved) break;
    }
  }

  // 粗めの誤差を超える場合、または改善が見込めない場合は分割
  const splitIndex = lastFitError.current.index;
  if (splitIndex <= range.start || splitIndex >= range.end) {
    curves.push(controls);
    return;
  }

  // 分割点の接ベクトルを計算
  const tangent = splitTangent(points, splitIndex);
  if (tangent === null) {
    curves.push(controls);
    return;
  }

  // 再帰的に分割してフィッティング
  fitCurveRange(
    points,
    curves,
    { start: range.start, end: splitIndex },
    { start: tangents.start, end: tangent },
    errorTol,
    coarseErrTol,
    lastFitError
  );
  fitCurveRange(
    points,
    curves,
    { start: splitIndex, end: range.end },
    { start: tangent.copy().mult(-1), end: tangents.end },
    errorTol,
    coarseErrTol,
    lastFitError
  );
}

/**
 * ベジェ曲線をフィットする関数（メインエントリーポイント）
 * Main entry point for fitting Bézier curves to point sequences
 * 
 * 点列全体に対してベジェ曲線フィッティングを開始します。
 * Initiates Bézier curve fitting for the entire point sequence.
 * 
 * @param points - 元の点列 / Original point sequence
 * @param curves - 結果の曲線配列（追加される） / Result curves array (will be appended to)
 * @param errorTol - 許容誤差（ピクセル） / Error tolerance (pixels)
 * @param coarseErrTol - 粗い許容誤差（ピクセル） / Coarse error tolerance (pixels)
 * @param lastFitError - 最後のフィット誤差（更新される） / Last fit error (will be updated)
 */
export function fitCurve(
  points: Vector[],
  curves: Vector[][],
  errorTol: number,
  coarseErrTol: number,
  lastFitError: { current: FitErrorResult }
): void {
  // 全体の接ベクトルを計算
  const [tangent0, tangent1] = computeEndTangents(points);

  // 再帰的にフィッティングを開始
  fitCurveRange(
    points,
    curves,
    { start: 0, end: points.length - 1 },
    { start: tangent0, end: tangent1 },
    errorTol,
    coarseErrTol,
    lastFitError
  );

  // 最終的な誤差と分割数を出力
  console.log(
    `Final error: ${lastFitError.current.maxError}\nNumber of segments: ${curves.length}\nError tolerance: ${errorTol}`
  );
}
