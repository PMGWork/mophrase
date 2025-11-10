/// 数式ユーティリティ

// バーンスタイン多項式
float bernstein(int i, int n, float t) {
  float coeff = binomial(n, i);
  return coeff * pow(t, i) * pow(1 - t, n - i);
}

// 二項係数
float binomial(int n, int k) {
  if(k == 0 || k == n) return 1;

  int res = 1;
  for(int i = 1; i <= k; i++) {
    res *= (n - i + 1);
    res /= i;
  }
  return res;
}

// 単位接ベクトル
PVector unitTangent(PVector d0, PVector d1) {
  PVector tangent = PVector.sub(d1, d0);
  tangent.normalize();
  return tangent;
}

// 3次ベジェ曲線
PVector bezierCurve(PVector v0, PVector v1, PVector v2, PVector v3, float t) {
  PVector point = new PVector(0, 0);
  point.add(PVector.mult(v0, bernstein(0, 3, t)));
  point.add(PVector.mult(v1, bernstein(1, 3, t)));
  point.add(PVector.mult(v2, bernstein(2, 3, t)));
  point.add(PVector.mult(v3, bernstein(3, 3, t)));
  return point;
}

// 3次ベジェ曲線の1階微分
PVector bezierDerivative(PVector v0, PVector v1, PVector v2, PVector v3, float t) {
  PVector d = new PVector(0, 0);
  d.add(PVector.mult(PVector.sub(v1, v0), 3 * (1 - t) * (1 - t)));
  d.add(PVector.mult(PVector.sub(v2, v1), 6 * (1 - t) * t));
  d.add(PVector.mult(PVector.sub(v3, v2), 3 * t * t));
  return d;
}

// 3次ベジェ曲線の2階微分
PVector bezierSecondDerivative(PVector v0, PVector v1, PVector v2, PVector v3, float t) {
  PVector d2 = new PVector(0, 0);
  PVector term1 = PVector.sub(PVector.sub(v2, PVector.mult(v1, 2)), PVector.mult(v0, -1));
  PVector term2 = PVector.sub(PVector.sub(v3, PVector.mult(v2, 2)), PVector.mult(v1, -1));
  d2.add(PVector.mult(term1, 6 * (1 - t)));
  d2.add(PVector.mult(term2, 6 * t));
  return d2;
}

// ニュートン法の1ステップ
float refineBezierParameter(PVector[] control, PVector point, float u) {
  PVector q = bezierCurve(control[0], control[1], control[2], control[3], u);
  PVector qPrime = bezierDerivative(control[0], control[1], control[2], control[3], u);
  PVector qDoublePrime = bezierSecondDerivative(control[0], control[1], control[2], control[3], u);

  PVector diff = PVector.sub(q, point);
  float numerator = PVector.dot(diff, qPrime);
  float denominator = PVector.dot(qPrime, qPrime) + PVector.dot(diff, qDoublePrime);

  return u - (numerator / denominator);
}
