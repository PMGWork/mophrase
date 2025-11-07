/// ベジェ曲線フィッティング関連

// 1. 3次ベジェ曲線の始点と終点の接ベクトルを計算する
void computeEndTangents(PVector[] tangents) {
  int n = points.size();
  if(n < 2) return;

  // 始点の接ベクトル t_1 を計算
  PVector d1 = points.get(0);
  PVector d2 = points.get(1);
  tangents[0] = UnitTangent(d1, d2);

  // 終点の接ベクトル t_2 を計算
  PVector dn_1 = points.get(n - 2);
  PVector dn = points.get(n - 1);
  tangents[1] = UnitTangent(dn, dn_1);
}

// 2. 点列に対応する曲線のパラメータの位置を計算する
void computeParameters() {
  int n = points.size();
  if(n < 2) return;

  // u_i = 0 (i = 0)
  params.add(new PVector(0, 0));

  // 累積距離を計算
  float totalDistance = 0;
  for(int j = 1; j < n; j++) {
    totalDistance += PVector.dist(points.get(j), points.get(j - 1));
  }

  // 各 u_i を計算 (i > 1)
  if(totalDistance > 0) {
    float cumulativeDistance = 0;
    for(int i = 1; i < n; i++) {
      cumulativeDistance += PVector.dist(points.get(i), points.get(i - 1));
      float u_i = cumulativeDistance / totalDistance;
      params.add(new PVector(u_i, 0));
    }
  }
}

// 3. 3次ベジェ曲線の始点と終点を定める
void computeEndPoints(PVector[] ctrlPoints) {
  int n = points.size();
  if(n < 2) return;

  // 始点と終点を設定
  ctrlPoints[0] = points.get(0).copy();      // V_0 = d_1
  ctrlPoints[3] = points.get(n - 1).copy();  // V_3 = d_n
}

// 4. 始点と終点以外の2つ制御点の端点からの距離を求めて、3次ベジェ曲線を決定する
void computectrlPoints(PVector[] ctrlPoints, PVector[] tangents) {
  int n = points.size();
  if(n < 2 || tangents[0] == null || tangents[1] == null || ctrlPoints[0] == null || ctrlPoints[3] == null || params.size() != n) return;

  // 端点と接ベクトル
  PVector v0 = ctrlPoints[0].copy();
  PVector v3 = ctrlPoints[3].copy();
  PVector t1 = tangents[0].copy();
  PVector t2 = tangents[1].copy();
  float chord = PVector.dist(v0, v3);

  // 正規方程式の係数行列と右辺ベクトルを初期化
  float c00 = 0;  // C_00 = Σ a0·a0
  float c01 = 0;  // C_01 = Σ a0·a1
  float c11 = 0;  // C_11 = Σ a1·a1
  float x0 = 0;   // X_0 = Σ a0·C_i
  float x1 = 0;   // X_1 = Σ a1·C_i

  for(int i = 0; i < n; i++) {
    float u = params.get(i).x;

    // バーンスタイン基底関数を計算
    float b0 = bernstein(0, 3, u);
    float b1 = bernstein(1, 3, u);
    float b2 = bernstein(2, 3, u);
    float b3 = bernstein(3, 3, u);

    // a0(u) = t1 * B_1^3(u), a1(u) = t2 * B_2^3(u)
    PVector a0 = PVector.mult(t1, b1);
    PVector a1 = PVector.mult(t2, b2);

    // C_i = d_i - V0(B_0^3 + B_1^3) - V3(B_2^3 + B_3^3)
    PVector tmp = PVector.add(PVector.mult(v0, b0 + b1),
                              PVector.mult(v3, b2 + b3));
    PVector cVec = PVector.sub(points.get(i), tmp);

    // 係数行列の要素を累積
    c00 += PVector.dot(a0, a0);  // C_00 = Σ a0·a0
    c01 += PVector.dot(a0, a1);  // C_01 = Σ a0·a1
    c11 += PVector.dot(a1, a1);  // C_11 = Σ a1·a1

    // 右辺ベクトルの要素を累積
    x0 += PVector.dot(a0, cVec);  // X_0 = Σ a0·C_i
    x1 += PVector.dot(a1, cVec);  // X_1 = Σ a1·C_i
  }

  // クラメルの公式で連立方程式を解く
  // det = C_00*C_11 - C_01^2
  float det = c00 * c11 - c01 * c01;

  float alpha_1 = (c11 * x0 - c01 * x1) / det;
  float alpha_2 = (c00 * x1 - c01 * x0) / det;

  boolean alpha1Valid = !Float.isNaN(alpha_1) && !Float.isInfinite(alpha_1) && alpha_1 > 1e-6;
  boolean alpha2Valid = !Float.isNaN(alpha_2) && !Float.isInfinite(alpha_2) && alpha_2 > 1e-6;
  float fallbackAlpha = chord > 0 ? chord / 3.0 : 0;
  float useAlpha1 = alpha1Valid ? alpha_1 : fallbackAlpha;
  float useAlpha2 = alpha2Valid ? alpha_2 : fallbackAlpha;

  // 4つの制御点を設定
  ctrlPoints[1] = PVector.add(v0, PVector.mult(t1, useAlpha1));  // V1 = V0 + α_1*t1
  ctrlPoints[2] = PVector.add(v3, PVector.mult(t2, useAlpha2));  // V2 = V3 + α_2*t2
}
