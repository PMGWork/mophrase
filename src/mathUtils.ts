import type { Vector } from './types';

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

// 単位接ベクトル
export function unitTangent(d0: Vector, d1: Vector): Vector {
  const tangent = d1.copy().sub(d0);
  tangent.normalize();
  return tangent;
}

// 3次ベジェ曲線
export function bezierCurve(
  v0: Vector,
  v1: Vector,
  v2: Vector,
  v3: Vector,
  t: number,
): Vector {
  const point = v0.copy().mult(0);
  point.add(v0.copy().mult(bernstein(0, 3, t)));
  point.add(v1.copy().mult(bernstein(1, 3, t)));
  point.add(v2.copy().mult(bernstein(2, 3, t)));
  point.add(v3.copy().mult(bernstein(3, 3, t)));
  return point;
}

// 3次ベジェ曲線の1階微分
export function bezierDerivative(
  v0: Vector,
  v1: Vector,
  v2: Vector,
  v3: Vector,
  t: number,
): Vector {
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
  v0: Vector,
  v1: Vector,
  v2: Vector,
  v3: Vector,
  t: number,
): Vector {
  const d2 = v0.copy().mult(0);
  const term1 = v2.copy().sub(v1.copy().mult(2)).add(v0);
  const term2 = v3.copy().sub(v2.copy().mult(2)).add(v1);
  d2.add(term1.mult(6 * (1 - t)));
  d2.add(term2.mult(6 * t));
  return d2;
}

// ニュートン法によるパラメータの精密化
export function refineParameter(
  control: Vector[],
  point: Vector,
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
  points: Vector[],
  splitIndex: number,
): Vector | null {
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

// 正規化値を丸める
export function roundNormalizedValue(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// 曲線の長さ
export function curveLength(c: Vector[]): number {
  const chord = c[0].dist(c[3]);
  const cont_net = c[0].dist(c[1]) + c[1].dist(c[2]) + c[2].dist(c[3]);
  return (chord + cont_net) / 2;
}
