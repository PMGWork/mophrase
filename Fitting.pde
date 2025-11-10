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
void fitCurveRange(
  int startIndex,
  int endIndex,
  PVector startTangent,
  PVector endTangent,
  int depth
) {
  // パラメータを計算
  FloatList tempParams = computeParametersRange(startIndex, endIndex);

  // 制御点を計算
  PVector[] tempControl = new PVector[4];
  computeEndPointsRange(tempControl, startIndex, endIndex);
  computeControlPointsRange(tempControl, startTangent, endTangent, tempParams, startIndex, endIndex);

  // 最大誤差を計算
  FitErrorResult errorResult = computeMaxErrorRange(tempControl, tempParams, startIndex, endIndex);

  // 誤差判定と分岐
  float maxError = errorResult.maxError;

  // 許容誤差内にある場合のみ確定
  if (maxError <= errTol) {
    curves.add(tempControl);
    return;
  }

  // 粗めの誤差を満たす場合
  if (maxError <= coarseErrTol) {
    int maxIterations = 4;
    for (int iter = 0; iter < maxIterations; iter++) {
      // Newton法でパラメータを再計算
      boolean improved = reparameterizeBezierCurve(tempControl, tempParams, startIndex);

      // 制御点を再生成
      computeControlPointsRange(tempControl, startTangent, endTangent, tempParams, startIndex, endIndex);

      // 誤差を再評価
      FitErrorResult newErrorResult = computeMaxErrorRange(tempControl, tempParams, startIndex, endIndex);
      maxError = newErrorResult.maxError;

      // 許容誤差内に収まったら確定
      if (maxError <= errTol) {
        curves.add(tempControl);
        return;
      }

      errorResult = newErrorResult;

      // 改善が見られなければループを抜ける
      if (!improved) break;
    }
  }

  // 粗めの誤差を超える場合
  int splitIndex = errorResult.index;
  if (splitIndex <= startIndex || splitIndex >= endIndex) {
    curves.add(tempControl);
    return;
  }

  // 分割点の接ベクトルを計算
  PVector splitTangent = computeSplitTangentRange(splitIndex);
  if (splitTangent == null) {
    curves.add(tempControl);
    return;
  }

  // 再帰的に分割してフィッティング
  fitCurveRange(startIndex, splitIndex, startTangent, splitTangent, depth + 1);
  fitCurveRange(splitIndex, endIndex, PVector.mult(splitTangent, -1), endTangent, depth + 1);
}

// 1. 3次ベジェ曲線の始点と終点の接ベクトルを計算する
void computeEndTangents(PVector[] tangents) {
  int n = points.size();
  if(n < 2) return;

  // 始点の接ベクトル t_1 を計算
  PVector d1 = points.get(0);
  PVector d2 = points.get(1);
  tangents[0] = unitTangent(d1, d2);

  // 終点の接ベクトル t_2 を計算
  PVector dn_1 = points.get(n - 2);
  PVector dn = points.get(n - 1);
  tangents[1] = unitTangent(dn, dn_1);
}

// 2. 点列に対応する曲線のパラメータの位置を計算する
FloatList computeParametersRange(int startIndex, int endIndex) {
  FloatList tempParams = new FloatList();
  tempParams.append(0);

  if (endIndex - startIndex < 1) return tempParams;

  float totalDist = 0;
  for (int j = startIndex + 1; j <= endIndex; j++) {
    totalDist += PVector.dist(points.get(j), points.get(j - 1));
  }

  float cumulativeDist = 0;
  for(int i = startIndex + 1; i <= endIndex; i++) {
    cumulativeDist += PVector.dist(points.get(i), points.get(i - 1));
    float u_i = (totalDist > 0) ? (cumulativeDist / totalDist) : 0;
    tempParams.append(u_i);
  }

  return tempParams;
}

// 3. 3次ベジェ曲線の始点と終点を定める
void computeEndPointsRange(PVector[] tempControl, int startIndex, int endIndex) {
  tempControl[0] = points.get(startIndex).copy();  // V_0 = d_startIndex
  tempControl[3] = points.get(endIndex).copy();    // V_3 = d_endIndex
}

// 4. 始点と終点以外の2つ制御点の端点からの距離を求める
void computeControlPointsRange(
  PVector[] tempControl,
  PVector startTangent,
  PVector endTangent,
  FloatList tempParams,
  int startIndex,
  int endIndex
) {
  int n = endIndex - startIndex + 1;
  if (n < 2 || tempControl[0] == null || tempControl[3] == null) return;

  PVector v0 = tempControl[0].copy();
  PVector v3 = tempControl[3].copy();
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

  for (int i = 0; i < tempParams.size(); i++) {
    float u = tempParams.get(i);

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
      points.get(startIndex + i),
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
    tempControl[1] = PVector.add(v0, PVector.mult(t1, defaultAlpha));
    tempControl[2] = PVector.add(v3, PVector.mult(t2, defaultAlpha));
    return;
  }

  // α_1, α_2 を計算
  float alpha_1 = (c22 * x1 - c12 * x2) / det;
  float alpha_2 = (c11 * x2 - c12 * x1) / det;

  // 制御点を設定
  tempControl[1] = PVector.add(v0, PVector.mult(t1, alpha_1));  // V_1 = V_0 + α_1·t_1
  tempControl[2] = PVector.add(v3, PVector.mult(t2, alpha_2));  // V_2 = V_3 + α_2·t_2
}

// 5. 求めたベジェ曲線と点列との最大距離を求める
FitErrorResult computeMaxErrorRange(
  PVector[] tempControl,
  FloatList tempParams,
  int startIndex,
  int endIndex
) {
  int n = endIndex - startIndex + 1;
  if (n < 2 || tempControl[0] == null || tempControl[1] == null || tempControl[2] == null || tempControl[3] == null) {
    return new FitErrorResult(Float.MAX_VALUE, -1);
  }

  // 端点はベジェ曲線と一致するため、端点以外で最大誤差を探索
  if(n <= 2) return new FitErrorResult(0, -1);

  // 最大誤差を計算
  float maxError = -1;
  int maxIndex = -1;

  for (int i = 1; i < tempParams.size() - 1; i++) {
    float u = tempParams.get(i);
    PVector curve = bezierCurve(tempControl[0], tempControl[1], tempControl[2], tempControl[3], u);
    float error = PVector.dist(points.get(startIndex + i), curve);
    if (error > maxError) {
      maxError = error;
      maxIndex = startIndex + i;
    }
  }

  // 最大誤差が見つからなかった場合
  if(maxIndex < 0) return new FitErrorResult(Float.MAX_VALUE, -1);

  return new FitErrorResult(maxError, maxIndex);
}

// 6. ニュートン法でパラメータを1回更新する
boolean reparameterizeBezierCurve(
  PVector[] tempControl,
  FloatList tempParams,
  int startIndex
) {
  if (tempControl[0] == null || tempControl[1] == null || tempControl[2] == null || tempControl[3] == null) return false;

  boolean improved = false;

  for (int i = 1; i < tempParams.size() - 1; i++) {
    float u = tempParams.get(i);
    PVector point = points.get(startIndex + i);

    float newU = refineBezierParameter(tempControl, point, u);
    if (!Float.isFinite(newU)) continue;
    newU = constrain(newU, 0, 1);

    if (abs(newU - u) > 0.0001) improved = true;
    tempParams.set(i, newU);
  }

  return improved;
}
