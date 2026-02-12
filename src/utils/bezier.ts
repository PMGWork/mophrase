/**
 * ベジエ曲線の数学的基盤。
 * バーンスタイン多項式、曲線評価、微分、パラメータ精緻化などを提供する。
 */

import type p5 from 'p5';

// #region 基礎数学
// バーンスタイン多項式
export function bernstein(i: number, n: number, t: number): number {
  const coeff = binomial(n, i);
  return coeff * t ** i * (1 - t) ** (n - i);
}

// 二項係数
export function binomial(n: number, k: number): number {
  if (k === 0 || k === n) return 1;

  let res = 1;
  for (let i = 1; i <= k; i++) {
    res *= n - i + 1;
    res /= i;
  }
  return res;
}
// #endregion

// #region 共通利用
// 3次ベジェ曲線
export function bezierCurve(
  v0: p5.Vector,
  v1: p5.Vector,
  v2: p5.Vector,
  v3: p5.Vector,
  t: number,
): p5.Vector {
  const point = v0.copy().mult(0);
  point.add(v0.copy().mult(bernstein(0, 3, t)));
  point.add(v1.copy().mult(bernstein(1, 3, t)));
  point.add(v2.copy().mult(bernstein(2, 3, t)));
  point.add(v3.copy().mult(bernstein(3, 3, t)));
  return point;
}
// #endregion

// #region Fitting(グラフ)
// 正規化値を丸める
export function roundNormalizedValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// 曲線の長さ
export function curveLength(c: p5.Vector[]): number {
  const chord = c[0].dist(c[3]);
  const controlNetLength = c[0].dist(c[1]) + c[1].dist(c[2]) + c[2].dist(c[3]);
  return (chord + controlNetLength) / 2;
}
// #endregion

// #region Fitting
// 単位接ベクトル
export function unitTangent(d0: p5.Vector, d1: p5.Vector): p5.Vector {
  const tangent = d1.copy().sub(d0);
  tangent.normalize();
  return tangent;
}

// 3次ベジェ曲線の1階微分
export function bezierDerivative(
  v0: p5.Vector,
  v1: p5.Vector,
  v2: p5.Vector,
  v3: p5.Vector,
  t: number,
): p5.Vector {
  const d = v0.copy().mult(0);
  d.add(
    v1
      .copy()
      .sub(v0)
      .mult(3 * (1 - t) * (1 - t)),
  );
  d.add(
    v2
      .copy()
      .sub(v1)
      .mult(6 * (1 - t) * t),
  );
  d.add(
    v3
      .copy()
      .sub(v2)
      .mult(3 * t * t),
  );
  return d;
}

// 3次ベジェ曲線の2階微分
export function bezierSecondDerivative(
  v0: p5.Vector,
  v1: p5.Vector,
  v2: p5.Vector,
  v3: p5.Vector,
  t: number,
): p5.Vector {
  const d2 = v0.copy().mult(0);
  const term1 = v2.copy().sub(v1.copy().mult(2)).add(v0);
  const term2 = v3.copy().sub(v2.copy().mult(2)).add(v1);
  d2.add(term1.mult(6 * (1 - t)));
  d2.add(term2.mult(6 * t));
  return d2;
}

// ニュートン法によるパラメータの精密化
export function refineParameter(
  control: p5.Vector[],
  point: p5.Vector,
  u: number,
): number {
  const q = bezierCurve(control[0], control[1], control[2], control[3], u);
  const qPrime = bezierDerivative(
    control[0],
    control[1],
    control[2],
    control[3],
    u,
  );
  const qDoublePrime = bezierSecondDerivative(
    control[0],
    control[1],
    control[2],
    control[3],
    u,
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

// 分割点における接ベクトルの計算
export function splitTangent(
  points: p5.Vector[],
  splitIndex: number,
): p5.Vector | null {
  const n = points.length;
  if (n < 3) return null;

  // 分割点が端点の場合は接ベクトルを定義できない
  if (splitIndex <= 0 || splitIndex >= n - 1) return null;

  const prev = points[splitIndex - 1];
  const next = points[splitIndex + 1];

  // 前後の点が非常に近い場合は単位ベクトルを定義できない
  if (prev.dist(next) < 1e-6) return null;

  return unitTangent(next, prev);
}
// #endregion

// #region 曲線分割
// ベジェ曲線をt位置で分割する関数
function assertSplitInput(points: readonly p5.Vector[], t: number): void {
  if (!Number.isFinite(t) || t < 0 || t > 1) {
    throw new RangeError('split parameter t must be within [0, 1]');
  }
  if (points.length < 2) {
    throw new Error('Bezier split requires at least 2 control points');
  }
}

// ベクトルの線形補間
function lerpVector(a: p5.Vector, b: p5.Vector, t: number): p5.Vector {
  return a
    .copy()
    .mult(1 - t)
    .add(b.copy().mult(t));
}

// de Casteljauでn次ベジェをt位置で2つに分割する
export function splitBezier(
  points: readonly p5.Vector[],
  t: number,
): { left: p5.Vector[]; right: p5.Vector[]; point: p5.Vector } {
  assertSplitInput(points, t);

  const left: p5.Vector[] = [];
  const right: p5.Vector[] = [];
  let current = points.map((p) => p.copy());

  while (true) {
    left.push(current[0].copy());
    right.push(current[current.length - 1].copy());

    if (current.length === 1) break;

    const next: p5.Vector[] = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push(lerpVector(current[i], current[i + 1], t));
    }
    current = next;
  }

  right.reverse();
  const point = left[left.length - 1].copy();

  return { left, right, point };
}

// 3次ベジェ専用のラッパー
export function splitCubicBezier(
  curve: readonly p5.Vector[],
  t: number,
): {
  left: [p5.Vector, p5.Vector, p5.Vector, p5.Vector];
  right: [p5.Vector, p5.Vector, p5.Vector, p5.Vector];
  point: p5.Vector;
} {
  if (curve.length !== 4) {
    throw new Error('Cubic Bezier split requires exactly 4 control points');
  }

  const { left, right, point } = splitBezier(curve, t);
  return {
    left: left as [p5.Vector, p5.Vector, p5.Vector, p5.Vector],
    right: right as [p5.Vector, p5.Vector, p5.Vector, p5.Vector],
    point,
  };
}
//#endregion
