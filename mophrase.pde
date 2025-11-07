/// メインプログラム

ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
ArrayList<PVector> uList = new ArrayList<PVector>();   // パラメータ

PVector[] endPoints = new PVector[2];  // 端点
PVector[] controlPoints = new PVector[4];    // 制御点
PVector[] tangents = new PVector[2];   // 端点の接ベクトル

int selected = -1;  // 選択中の制御点 (-1: なし, 1: V1, 2: V2)
boolean curveExists = false;  // 曲線が既に存在するかどうか

int clearButtonX = 20;
int clearButtonY = 20;
int clearButtonW = 100;
int clearButtonH = 40;

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
  drawClearButton();
}

void mouseDragged() {
  if(!curveExists) {
    // 点を追加
    points.add(new PVector(mouseX, mouseY));
  } else if(selected >= 0) {
    // ハンドルを移動
    if (selected == 1 && controlPoints[1] != null) {
      controlPoints[1].set(mouseX, mouseY);
    } else if (selected == 2 && controlPoints[2] != null) {
      controlPoints[2].set(mouseX, mouseY);
    }
  }
}

void mousePressed() {
  // クリアボタンのクリック判定
  if(mouseX >= clearButtonX && mouseX <= clearButtonX + clearButtonW &&
     mouseY >= clearButtonY && mouseY <= clearButtonY + clearButtonH) {
    clearAll();
    return;
  }

  // ハンドルの選択判定
  if(controlPoints[1] != null && dist(mouseX, mouseY, controlPoints[1].x, controlPoints[1].y) < 15) {
    selected = 1;
  } else if (controlPoints[2] != null && dist(mouseX, mouseY, controlPoints[2].x, controlPoints[2].y) < 15) {
    selected = 2;
  } else if (!curveExists) {
    // 曲線がまだ存在しない場合のみ、新しく描画開始
    selected = -1;
    clearAll();
  }
}

void mouseReleased() {
  if (selected != -1) {
    selected = -1;
  }

  if (!curveExists && points.size() >= 2) {
    // ベジェ曲線を計算
    computeEndTangents(tangents);  // 1. 端点の接ベクトルを計算
    computeParameters();           // 2. パラメータを計算
    computeEndPoints(endPoints);   // 3. 端点を計算
    computeControlPoints();        // 4. 制御点を計算
    curveExists = true;            // 曲線が作成されたことを記録
  }
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
  curveExists = false;  // 曲線をクリア
}