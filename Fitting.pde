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

  // パラメータをクリア
  params.clear();

  // u_i = 0 (i = 0)
  params.add(new PVector(0, 0));

  // 累積距離を計算
  float totalDist = 0;
  for(int j = 1; j < n; j++) {
    totalDist += PVector.dist(points.get(j), points.get(j - 1));
  }

  // 各 u_i を計算 (i > 1)
  float cumulativeDist = 0;
  for(int i = 1; i < n; i++) {
    cumulativeDist += PVector.dist(points.get(i), points.get(i - 1));
    float u_i = cumulativeDist / totalDist;
    params.add(new PVector(u_i, 0));
  }
}

// 3. 3次ベジェ曲線の始点と終点を定める
void computeEndPoints(PVector[] control) {
  int n = points.size();
  if(n < 2) return;

  // 始点と終点を設定
  control[0] = points.get(0).copy();      // V_0 = d_1
  control[3] = points.get(n - 1).copy();  // V_3 = d_n
}

// 4. 始点と終点以外の2つ制御点の端点からの距離を求めて、3次ベジェ曲線を決定する
void computeControlPoints(PVector[] control, PVector[] tangents) {
  int n = points.size();
  if(n < 2 || tangents[0] == null || tangents[1] == null || control[0] == null || control[3] == null || params.size() != n) return;

  // 端点と接ベクトル
  PVector v0 = control[0].copy();
  PVector v3 = control[3].copy();
  PVector t1 = tangents[0].copy();
  PVector t2 = tangents[1].copy();

  // デフォルトのα値（端点からの距離）
  float chordLength = PVector.dist(v0, v3);
  float defaultAlpha = chordLength / 3.0;

  // 正規方程式の係数行列と右辺ベクトルを初期化
  float c11 = 0;  // C_11 = Σ A1·A1
  float c12 = 0;  // C_12 = Σ A1·A2
  float c22 = 0;  // C_22 = Σ A2·A2
  float x1 = 0;   // X_1 = Σ A1·C_i
  float x2 = 0;   // X_2 = Σ A2·C_i

  for(int i = 0; i < n; i++) {
    float u = params.get(i).x;

    // バーンスタイン基底関数を計算
    float b0 = bernstein(0, 3, u);
    float b1 = bernstein(1, 3, u);
    float b2 = bernstein(2, 3, u);
    float b3 = bernstein(3, 3, u);

    // A1 = B_1(u)·t_1
    // A2 = B_2(u)·t_2
    PVector a1 = PVector.mult(t1, b1);
    PVector a2 = PVector.mult(t2, b2);

    // T_i = d_i - V_0(B_0 + B_1) - V_3(B_2 + B_3)
    PVector tVec = PVector.sub(
      points.get(i),
      PVector.add(
        PVector.mult(v0, b0 + b1),
        PVector.mult(v3, b2 + b3)
      )
    );

    // 係数行列の要素を累積
    c11 += PVector.dot(a1, a1);  // C_11 = Σ a1·a1
    c12 += PVector.dot(a1, a2);  // C_12 = Σ a1·a2
    c22 += PVector.dot(a2, a2);  // C_22 = Σ a2·a2

    // 右辺ベクトルの要素を累積
    x1 += PVector.dot(a1, tVec);  // X_1 = Σ a1·T_i
    x2 += PVector.dot(a2, tVec);  // X_2 = Σ a2·T_i
  }

  // 連立方程式を解く
  // C_11·α_1 + C_12·α_2 = X_1
  // C_12·α_1 + C_22·α_2 = X_2
  float det = (c11 * c22 - c12 * c12);

  // 特異行列の場合はデフォルト値を使用
  if (abs(det) < 1e-6 || chordLength == 0) {
    control[1] = PVector.add(v0, PVector.mult(t1, defaultAlpha));
    control[2] = PVector.add(v3, PVector.mult(t2, defaultAlpha));
    return;
  }

  // α_1, α_2 を計算
  float alpha_1 = (c22 * x1 - c12 * x2) / det;
  float alpha_2 = (c11 * x2 - c12 * x1) / det;

  // 制御点を設定
  control[1] = PVector.add(v0, PVector.mult(t1, alpha_1));  // V_1 = V_0 + α_1·t_1
  control[2] = PVector.add(v3, PVector.mult(t2, alpha_2));  // V_2 = V_3 + α_2·t_2
}

// 5. 求めたベジェ曲線と点列との最大距離 (最大誤差) を求める
float computeMaxError(PVector[] control) {
  int n = points.size();
  if(n < 2 || control[0] == null || control[1] == null || control[2] == null || control[3] == null) return Float.MAX_VALUE;

  // 端点はベジェ曲線と一致するため、端点以外で最大誤差を探索
  if(n <= 2) return 0;

  // 最大誤差を計算
  float maxError = 0;
  for(int i = 1; i < n - 1; i++) {
    float u = params.get(i).x;
    PVector curve = bezierCurve(control[0], control[1], control[2], control[3], u);
    float error = PVector.dist(points.get(i), curve);
    if(error > maxError) maxError = error;
  }

  return maxError;
}

// 指定した許容誤差 ε 以内に収まっているか判定する
boolean isWithinErrorTolerance(PVector[] control, float epsilon) {
  float maxError = computeMaxError(control);
  return maxError <= epsilon;
}
