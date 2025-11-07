ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
ArrayList<PVector> uList = new ArrayList<PVector>();   // パラメータ

PVector[] tangents = new PVector[2];       // 端点の接ベクトル
PVector[] endPoints = new PVector[2];      // 端点
PVector[] controlPoints = new PVector[4];  // 制御点

color YELLOW = #D7B600;
color WHITE = #B0B0B0;
color GRAY = #484848;
color BLACK = #303030;

void setup() {
  size(960, 640);
  background(BLACK);
}

void draw() {
  background(BLACK);

  // 入力点の描画
  stroke(GRAY);
  strokeWeight(3);
  noFill();
  beginShape();
  for (PVector p : points) {
    vertex(p.x, p.y);
  }
  endShape();

  // ベジェ曲線の描画
  if (points.size() >= 2 && controlPoints[0] != null) {
    rectMode(CENTER);

    // ベジェ曲線の描画
    stroke(WHITE);
    strokeWeight(3);
    noFill();
    beginShape();
    for (float t = 0; t <= 1; t += 0.01) {
      PVector p = bezierCurve(controlPoints[0], controlPoints[1],
                              controlPoints[2], controlPoints[3], t);
      vertex(p.x, p.y);
    }
    endShape();

    // 制御ポリゴンの描画
    stroke(YELLOW);
    strokeWeight(1);
    noFill();

    beginShape();
    vertex(controlPoints[0].x, controlPoints[0].y);
    vertex(controlPoints[1].x, controlPoints[1].y);
    endShape();

    beginShape();
    vertex(controlPoints[2].x, controlPoints[2].y);
    vertex(controlPoints[3].x, controlPoints[3].y);
    endShape();

    // 制御点の表示
    fill(YELLOW);
    noStroke();
    rect(controlPoints[0].x, controlPoints[0].y, 8, 8);
    rect(controlPoints[3].x, controlPoints[3].y, 8, 8);
    circle(controlPoints[1].x, controlPoints[1].y, 8);
    circle(controlPoints[2].x, controlPoints[2].y, 8);
  }
}

void mouseDragged() {
  points.add(new PVector(mouseX, mouseY));
}

void mousePressed() {
  points.clear();
  for (int i = 0; i < tangents.length; i++) {
    tangents[i] = null;
  }
  for (int i = 0; i < endPoints.length; i++) {
    endPoints[i] = null;
  }
  for (int i = 0; i < controlPoints.length; i++) {
    controlPoints[i] = null;
  }
}

void mouseReleased() {
  if (points.size() < 2) return;

  // 1. 端点の接ベクトルを計算
  computeEndTangents(tangents);

  // 2. パラメータを計算
  computeParameters();

  // 3. 端点を計算
  computeEndPoints(endPoints);

  // 4. 制御点を計算
  computeControlPoints();
}

// 1. 3次ベジェ曲線の始点と終点の接ベクトルを計算する
void computeEndTangents(PVector[] tangents) {
  int n = points.size();
  if(points.size() < 2) return;

  // 始点の接ベクトルを計算
  PVector d1 = points.get(0);
  PVector d2 = points.get(1);
  tangents[0] = UnitTangent(d1, d2);

  // 終点の接ベクトルを計算
  PVector dn_1 = points.get(n - 2);
  PVector dn = points.get(n - 1);
  tangents[1] = UnitTangent(dn, dn_1);
}


// 2. 点列に対応する曲線のパラメータの位置を計算する
void computeParameters() {
  uList.clear();
  int n = points.size();
  if(n < 2) return;

  // u_1 = 0
  uList.add(new PVector(0, 0));

  // 累積距離を計算
  float totalLength = 0;
  for(int j = 1; j < n; j++) {
    totalLength += PVector.dist(points.get(j), points.get(j - 1));
  }

  // 各 u_i を計算 (i > 1)
  if (totalLength > 0) {
    float cumulativeLength = 0;
    for (int i = 1; i < n; i++) {
      cumulativeLength += PVector.dist(points.get(i), points.get(i - 1));
      float u_i = cumulativeLength / totalLength;
      uList.add(new PVector(u_i, 0));
    }
  }
}

// 3. 3次ベジェ曲線の始点と終点を定める
void computeEndPoints(PVector[] endPoints) {
  int n = points.size();
  if(n < 2) return;

  endPoints[0] = points.get(0);      // V0 = d1
  endPoints[1] = points.get(n - 1);  // V3 = dn
}

// 4. 始点と終点以外の2つ制御点の端点からの距離を求めて、3次ベジェ曲線を決定する
void computeControlPoints() {
  int n = points.size();
  if(n < 2 || tangents[0] == null || tangents[1] == null ||
      endPoints[0] == null || endPoints[1] == null || uList.size() != n) {
    return;
  }

  // 端点と接ベクトル
  PVector v0 = endPoints[0].copy();
  PVector v3 = endPoints[1].copy();
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
    float u = uList.get(i).x;

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

  // det が 0 付近の場合は数値的に不安定になるので簡易近似にフォールバック
  if (abs(det) < 1e-6) {
    controlPoints[0] = v0;
    controlPoints[1] = PVector.add(v0, PVector.mult(t1, chord / 3.0));
    controlPoints[2] = PVector.add(v3, PVector.mult(t2, chord / 3.0));
    controlPoints[3] = v3;
    return;
  }

  float alpha_1 = (c11 * x0 - c01 * x1) / det;
  float alpha_2 = (c00 * x1 - c01 * x0) / det;

  boolean alpha1Valid = !Float.isNaN(alpha_1) && !Float.isInfinite(alpha_1) && alpha_1 > 1e-6;
  boolean alpha2Valid = !Float.isNaN(alpha_2) && !Float.isInfinite(alpha_2) && alpha_2 > 1e-6;
  float fallbackAlpha = chord > 0 ? chord / 3.0 : 0;
  float useAlpha1 = alpha1Valid ? alpha_1 : fallbackAlpha;
  float useAlpha2 = alpha2Valid ? alpha_2 : fallbackAlpha;

  // 4つの制御点を設定
  controlPoints[0] = v0;                                          // V0 = d1
  controlPoints[1] = PVector.add(v0, PVector.mult(t1, useAlpha1));  // V1 = V0 + α_1*t1
  controlPoints[2] = PVector.add(v3, PVector.mult(t2, useAlpha2));  // V2 = V3 + α_2*t2
  controlPoints[3] = v3;                                          // V3 = dn
}

// 3次ベジェ曲線の導出
PVector bezierCurve(PVector v0, PVector v1, PVector v2, PVector v3, float t) {
  PVector point = new PVector(0, 0);
  point.add(PVector.mult(v0, bernstein(0, 3, t)));
  point.add(PVector.mult(v1, bernstein(1, 3, t)));
  point.add(PVector.mult(v2, bernstein(2, 3, t)));
  point.add(PVector.mult(v3, bernstein(3, 3, t)));
  return point;
}

// 単位接ベクトルの導出
PVector UnitTangent(PVector d0, PVector d1) {
  PVector tangent = PVector.sub(d1, d0);
  tangent.normalize();
  return tangent;
}

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