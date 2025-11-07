/// メインプログラム

ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
ArrayList<PVector> uList = new ArrayList<PVector>();   // パラメータ

PVector[] tangents = new PVector[2];       // 端点の接ベクトル
PVector[] endPoints = new PVector[2];      // 端点
PVector[] controlPoints = new PVector[4];  // 制御点

void setup() {
  size(960, 640);
  background(BLACK);
}

void draw() {
  background(BLACK);
  drawInputPoints();
  drawBezierCurve();
  drawControlPolygon();
  drawControlPoints();
}

void mouseDragged() {
  points.add(new PVector(mouseX, mouseY));
}

void mousePressed() {
  clearAll();
}

void mouseReleased() {
  if (points.size() < 2) return;

  computeEndTangents(tangents);  // 1. 端点の接ベクトルを計算
  computeParameters();           // 2. パラメータを計算
  computeEndPoints(endPoints);   // 3. 端点を計算
  computeControlPoints();        // 4. 制御点を計算
}

void clearAll() {
  points.clear();
  uList.clear();
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