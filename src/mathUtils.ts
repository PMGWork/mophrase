/**
 * 数式ユーティリティ / Mathematical Utilities
 * 
 * ベジェ曲線計算のための数学関数群
 * Mathematical functions for Bézier curve calculations
 * 
 * Contains:
 * - ベルンシュタイン多項式 / Bernstein polynomials
 * - ベジェ曲線の評価 / Bézier curve evaluation
 * - 曲線の微分 / Curve derivatives
 * - ニュートン法による最適化 / Newton method optimization
 */

import type { Vector } from './types';

/**
 * バーンスタイン多項式 / Bernstein polynomial
 * 
 * ベジェ曲線の基底関数。B_{i,n}(t) = C(n,i) * t^i * (1-t)^(n-i)
 * Basis function for Bézier curves. B_{i,n}(t) = C(n,i) * t^i * (1-t)^(n-i)
 * 
 * @param i - インデックス / Index (0 to n)
 * @param n - 次数 / Degree
 * @param t - パラメータ / Parameter (0 to 1)
 * @returns ベルンシュタイン多項式の値 / Bernstein polynomial value
 */
export function bernstein(i: number, n: number, t: number): number {
  const coeff = binomial(n, i);
  return coeff * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

/**
 * 二項係数 / Binomial coefficient
 * 
 * C(n,k) = n! / (k! * (n-k)!)
 * 
 * @param n - 全体の数 / Total number
 * @param k - 選択する数 / Number to choose
 * @returns 二項係数 / Binomial coefficient
 */
export function binomial(n: number, k: number): number {
  if (k === 0 || k === n) return 1;

  let res = 1;
  for (let i = 1; i <= k; i++) {
    res *= (n - i + 1);
    res /= i;
  }
  return res;
}

/**
 * 単位接ベクトル / Unit tangent vector
 * 
 * 2点間の方向を示す正規化されたベクトルを計算
 * Computes a normalized vector indicating the direction between two points
 * 
 * @param d0 - 始点 / Start point
 * @param d1 - 終点 / End point
 * @returns 単位接ベクトル / Unit tangent vector
 */
export function unitTangent(d0: Vector, d1: Vector): Vector {
  const tangent = d1.copy().sub(d0);
  tangent.normalize();
  return tangent;
}

/**
 * 3次ベジェ曲線 / Cubic Bézier curve
 * 
 * P(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
 * 
 * @param v0 - 始点 / Start point (P₀)
 * @param v1 - 第1制御点 / First control point (P₁)
 * @param v2 - 第2制御点 / Second control point (P₂)
 * @param v3 - 終点 / End point (P₃)
 * @param t - パラメータ / Parameter (0 to 1)
 * @returns 曲線上の点 / Point on curve
 */
export function bezierCurve(
  v0: Vector,
  v1: Vector,
  v2: Vector,
  v3: Vector,
  t: number
): Vector {
  const point = v0.copy().mult(0);
  point.add(v0.copy().mult(bernstein(0, 3, t)));
  point.add(v1.copy().mult(bernstein(1, 3, t)));
  point.add(v2.copy().mult(bernstein(2, 3, t)));
  point.add(v3.copy().mult(bernstein(3, 3, t)));
  return point;
}

/**
 * 3次ベジェ曲線の1階微分 / First derivative of cubic Bézier curve
 * 
 * P'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)
 * 
 * 曲線の接線ベクトルを表します
 * Represents the tangent vector of the curve
 * 
 * @param v0 - 始点 / Start point
 * @param v1 - 第1制御点 / First control point
 * @param v2 - 第2制御点 / Second control point
 * @param v3 - 終点 / End point
 * @param t - パラメータ / Parameter (0 to 1)
 * @returns 1階微分ベクトル / First derivative vector
 */
export function bezierDerivative(
  v0: Vector,
  v1: Vector,
  v2: Vector,
  v3: Vector,
  t: number
): Vector {
  const d = v0.copy().mult(0);
  d.add(v1.copy().sub(v0).mult(3 * (1 - t) * (1 - t)));
  d.add(v2.copy().sub(v1).mult(6 * (1 - t) * t));
  d.add(v3.copy().sub(v2).mult(3 * t * t));
  return d;
}

/**
 * 3次ベジェ曲線の2階微分 / Second derivative of cubic Bézier curve
 * 
 * P''(t) = 6(1-t)(P₂-2P₁+P₀) + 6t(P₃-2P₂+P₁)
 * 
 * 曲線の曲率変化を表します
 * Represents the curvature change of the curve
 * 
 * @param v0 - 始点 / Start point
 * @param v1 - 第1制御点 / First control point
 * @param v2 - 第2制御点 / Second control point
 * @param v3 - 終点 / End point
 * @param t - パラメータ / Parameter (0 to 1)
 * @returns 2階微分ベクトル / Second derivative vector
 */
export function bezierSecondDerivative(
  v0: Vector,
  v1: Vector,
  v2: Vector,
  v3: Vector,
  t: number
): Vector {
  const d2 = v0.copy().mult(0);
  const term1 = v2.copy().sub(v1.copy().mult(2)).add(v0);
  const term2 = v3.copy().sub(v2.copy().mult(2)).add(v1);
  d2.add(term1.mult(6 * (1 - t)));
  d2.add(term2.mult(6 * t));
  return d2;
}

/**
 * ニュートン法によるパラメータの精密化 / Parameter refinement using Newton's method
 * 
 * ニュートン・ラフソン法を使用して、点に最も近い曲線上のパラメータを求めます。
 * Uses Newton-Raphson method to find the parameter on the curve closest to the given point.
 * 
 * u_new = u - (Q(u)-P)·Q'(u) / (Q'(u)·Q'(u) + (Q(u)-P)·Q''(u))
 * 
 * @param control - ベジェ曲線の制御点配列 / Bézier curve control points
 * @param point - 対象点 / Target point
 * @param u - 現在のパラメータ / Current parameter
 * @returns 改善されたパラメータ / Refined parameter
 */
export function refineParameter(
  control: Vector[],
  point: Vector,
  u: number
): number {
  const q = bezierCurve(control[0], control[1], control[2], control[3], u);
  const qPrime = bezierDerivative(control[0], control[1], control[2], control[3], u);
  const qDoublePrime = bezierSecondDerivative(
    control[0],
    control[1],
    control[2],
    control[3],
    u
  );

  const diff = q.copy().sub(point);
  const numerator = diff.dot(qPrime);
  const denominator = qPrime.dot(qPrime) + diff.dot(qDoublePrime);

  // 分母が極端に小さい場合は元の値を返して不安定化を防ぐ
  if (Math.abs(denominator) < 1e-6) return u;

  const delta = numerator / denominator;
  const updated = u - delta;

  // 有限な範囲外に飛んだパラメータは採用しない
  if (!Number.isFinite(updated)) return u;

  return updated;
}

/**
 * 分割点における接ベクトルの計算 / Compute tangent vector at split point
 * 
 * 曲線を分割する際の接線方向を計算します。
 * 前後の点を使用して中心差分で接線を推定します。
 * Computes tangent direction when subdividing a curve.
 * Estimates tangent using central difference from neighboring points.
 * 
 * @param points - 点列 / Point sequence
 * @param splitIndex - 分割点のインデックス / Index of split point
 * @returns 接ベクトル（計算不可の場合はnull） / Tangent vector (null if cannot compute)
 */
export function splitTangent(
  points: Vector[],
  splitIndex: number
): Vector | null {
  const n = points.length;
  if (n < 3) return null;

  // 分割点が端点の場合は接ベクトルを定義できない
  if (splitIndex <= 0 || splitIndex >= n - 1) return null;

  const prev = points[splitIndex - 1];
  const next = points[splitIndex + 1];

  // 前後の点が一致している場合は単位ベクトルを定義できない
  if (prev.x === next.x && prev.y === next.y) return null;

  return unitTangent(next, prev);
}

