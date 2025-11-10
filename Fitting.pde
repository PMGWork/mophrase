/// ベジェ曲線フィッティング関連

// 最大誤差の値とインデックスを保持するためのクラス
class FitErrorResult {
  final float maxError;
  final int index;

  FitErrorResult(float maxError, int index) {
    this.maxError = maxError;
    this.index = index;
  }
}

// ベジェ曲線をフィットする関数
void fitCurve() {
  // 全体の接ベクトルを計算
  computeEndTangents(tangents);

  // 再帰的にフィッティングを開始
  fitCurveRange(0, points.size() - 1, tangents[0], tangents[1], 0);

  curveExists = true;
}

// 再帰的にベジェ曲線をフィットする
void fitCurveRange(int startIdx, int endIdx, PVector startTangent, PVector endTangent, int depth) {
  // パラメータを計算
  FloatList localParams = computeParametersRange(startIdx, endIdx);

  // 制御点を計算
  PVector[] localControl = new PVector[4];
  computeEndPointsRange(localControl, startIdx, endIdx);
  computeControlPointsRange(localControl, startTangent, endTangent, localParams, startIdx, endIdx);

  // 最大誤差を計算
  FitErrorResult error = computeMaxErrorRange(localControl, localParams, startIdx, endIdx);

  // 誤差判定と分岐
  float maxErr = error.maxError;

  // 許容誤差内にある場合
  if (maxErr <= errTol) {
    curves.add(localControl);
    return;
  }

  // 粗めの誤差内にあるが指定誤差を満たさない場合
  if (maxErr <= coarseErrTol) {
    curves.add(localControl);  // 後ほどニュートン法を実装
    return;
  }

  // 粗めの誤差を超える場合
  int splitIndex = error.index;
  if (splitIndex <= startIdx || splitIndex >= endIdx) {
    curves.add(localControl);
    return;
  }

  // 分割点の接ベクトルを計算
  PVector splitTangent = computeSplitTangentRange(splitIndex);
  if (splitTangent == null) {
    curves.add(localControl);
    return;
  }

  // 再帰的に分割してフィッティング
  fitCurveRange(startIdx, splitIndex, startTangent, splitTangent, depth + 1);
  fitCurveRange(splitIndex, endIdx, PVector.mult(splitTangent, -1), endTangent, depth + 1);
}

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
FloatList computeParametersRange(int startIdx, int endIdx) {
  FloatList localParams = new FloatList();
  localParams.append(0);

  if (endIdx - startIdx < 1) return localParams;

  float totalDist = 0;
  for (int j = startIdx + 1; j <= endIdx; j++) {
    totalDist += PVector.dist(points.get(j), points.get(j - 1));
  }

  float cumulativeDist = 0;
  for(int i = startIdx + 1; i <= endIdx; i++) {
    cumulativeDist += PVector.dist(points.get(i), points.get(i - 1));
    float u_i = (totalDist > 0) ? (cumulativeDist / totalDist) : 0;
    localParams.append(u_i);
  }

  return localParams;
}

// 3. 3次ベジェ曲線の始点と終点を定める
void computeEndPointsRange(PVector[] localControl, int startIdx, int endIdx) {
  localControl[0] = points.get(startIdx).copy();  // V_0 = d_1
  localControl[3] = points.get(endIdx).copy();    // V_3 = d_n
}

// 4. 始点と終点以外の2つ制御点の端点からの距離を求める
void computeControlPointsRange(
  PVector[] localControl,
  PVector startTangent,
  PVector endTangent,
  FloatList localParams,
  int startIdx,
  int endIdx
) {
  int n = endIdx - startIdx + 1;
  if (n < 2 || localControl[0] == null || localControl[3] == null) return;

  PVector v0 = localControl[0].copy();
  PVector v3 = localControl[3].copy();
  PVector t1 = startTangent.copy();
  PVector t2 = endTangent.copy();

  // デフォルトのα値（端点からの距離）
  float chordLength = PVector.dist(v0, v3);
  float defaultAlpha = chordLength / 3.0;

  // 正規方程式の係数行列と右辺ベクトルを初期化
  float c11 = 0;  // C_11 = Σ A1·A1
  float c12 = 0;  // C_12 = Σ A1·A2
  float c22 = 0;  // C_22 = Σ A2·A2
  float x1 = 0;   // X_1 = Σ A1·C_i
  float x2 = 0;   // X_2 = Σ A2·C_i

  for (int i = 0; i < localParams.size(); i++) {
    float u = localParams.get(i);

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
      points.get(startIdx + i),
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
    localControl[1] = PVector.add(v0, PVector.mult(t1, defaultAlpha));
    localControl[2] = PVector.add(v3, PVector.mult(t2, defaultAlpha));
    return;
  }

  // α_1, α_2 を計算
  float alpha_1 = (c22 * x1 - c12 * x2) / det;
  float alpha_2 = (c11 * x2 - c12 * x1) / det;

  // 制御点を設定
  localControl[1] = PVector.add(v0, PVector.mult(t1, alpha_1));  // V_1 = V_0 + α_1·t_1
  localControl[2] = PVector.add(v3, PVector.mult(t2, alpha_2));  // V_2 = V_3 + α_2·t_2
}

// 5. 求めたベジェ曲線と点列との最大距離を求める
FitErrorResult computeMaxErrorRange(
  PVector[] localControl,
  FloatList localParams,
  int startIdx,
  int endIdx
) {
  int n = endIdx - startIdx + 1;
  if (n < 2 || localControl[0] == null || localControl[1] == null || localControl[2] == null || localControl[3] == null) {
    return new FitErrorResult(Float.MAX_VALUE, -1);
  }

  // 端点はベジェ曲線と一致するため、端点以外で最大誤差を探索
  if(n <= 2) return new FitErrorResult(0, -1);

  // 最大誤差を計算
  float maxError = -1;
  int maxIndex = -1;

  for (int i = 1; i < localParams.size() - 1; i++) {
    float u = localParams.get(i);
    PVector curve = bezierCurve(localControl[0], localControl[1], localControl[2], localControl[3], u);
    float error = PVector.dist(points.get(startIdx + i), curve);
    if (error > maxError) {
      maxError = error;
      maxIndex = startIdx + i;
    }
  }

  // 最大誤差が見つからなかった場合
  if(maxIndex < 0) return new FitErrorResult(Float.MAX_VALUE, -1);

  return new FitErrorResult(maxError, maxIndex);
}

// 分割点の接ベクトルを計算
PVector computeSplitTangentRange(int splitIndex) {
  int n = points.size();
  if (n < 3) return null;

  // 分割点が端点の場合は接ベクトルを定義できない
  if (splitIndex <= 0 || splitIndex >= n - 1) return null;

  PVector prev = points.get(splitIndex - 1);
  PVector next = points.get(splitIndex + 1);

  // 前後の点が一致している場合は単位ベクトルを定義できない
  if (prev.x == next.x && prev.y == next.y) return null;

  return UnitTangent(next, prev);
}
