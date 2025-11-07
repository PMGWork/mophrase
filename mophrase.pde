/// メインプログラム

ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
ArrayList<PVector> params = new ArrayList<PVector>();  // パラメータ

PVector[] ctrlPoints = new PVector[4];  // 制御点
PVector[] tangents = new PVector[2];       // 端点の接ベクトル

int selected = -1;            // 選択中の制御点
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
  drawctrlPoints();
  drawClearButton();
}

void mouseDragged() {
  if(!curveExists) {
    // 点を追加
    points.add(new PVector(mouseX, mouseY));
  } else if(selected >= 0) {
    // 制御点を移動
    if (selected >= 0 && selected <= 3 && ctrlPoints[selected] != null) {
      PVector prevPos = ctrlPoints[selected].copy();
      ctrlPoints[selected].set(mouseX, mouseY);

      if (selected == 0 && ctrlPoints[1] != null) {
        PVector delta = PVector.sub(ctrlPoints[0], prevPos);
        ctrlPoints[1].add(delta);
      } else if (selected == 3 && ctrlPoints[2] != null) {
        PVector delta = PVector.sub(ctrlPoints[3], prevPos);
        ctrlPoints[2].add(delta);
      }
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

  // 制御点の選択判定（端点とハンドル）
  if(ctrlPoints[0] != null && dist(mouseX, mouseY, ctrlPoints[0].x, ctrlPoints[0].y) < 15) {
    selected = 0;
  } else if(ctrlPoints[1] != null && dist(mouseX, mouseY, ctrlPoints[1].x, ctrlPoints[1].y) < 15) {
    selected = 1;
  } else if (ctrlPoints[2] != null && dist(mouseX, mouseY, ctrlPoints[2].x, ctrlPoints[2].y) < 15) {
    selected = 2;
  } else if (ctrlPoints[3] != null && dist(mouseX, mouseY, ctrlPoints[3].x, ctrlPoints[3].y) < 15) {
    selected = 3;
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
    computeEndTangents(tangents);         // 1. 端点の接ベクトルを計算
    computeParameters();                  // 2. パラメータを計算
    computeEndPoints(ctrlPoints);      // 3. 端点を計算
    computectrlPoints(ctrlPoints, tangents);  // 4. 制御点を計算

    // 曲線が作成されたことを記録
    curveExists = true;
  }
}

void clearAll() {
  points.clear();
  params.clear();
  for (int i = 0; i < tangents.length; i++) {
    tangents[i] = null;
  }
  for (int i = 0; i < ctrlPoints.length; i++) {
    ctrlPoints[i] = null;
  }
  curveExists = false;  // 曲線をクリア
}