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
PVector UnitTangent(PVector d0, PVector d1) {
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
