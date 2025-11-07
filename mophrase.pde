/// メインプログラム

ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
ArrayList<PVector> params = new ArrayList<PVector>();  // パラメータ

PVector[] control = new PVector[4];  // 制御点
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
    if (selected >= 0 && selected <= 3 && control[selected] != null) {
      PVector prevPos = control[selected].copy();
      control[selected].set(mouseX, mouseY);

      if (selected == 0 && control[1] != null) {
        PVector delta = PVector.sub(control[0], prevPos);
        control[1].add(delta);
      } else if (selected == 3 && control[2] != null) {
        PVector delta = PVector.sub(control[3], prevPos);
        control[2].add(delta);
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
  if(control[0] != null && dist(mouseX, mouseY, control[0].x, control[0].y) < 15) {
    selected = 0;
  } else if(control[1] != null && dist(mouseX, mouseY, control[1].x, control[1].y) < 15) {
    selected = 1;
  } else if (control[2] != null && dist(mouseX, mouseY, control[2].x, control[2].y) < 15) {
    selected = 2;
  } else if (control[3] != null && dist(mouseX, mouseY, control[3].x, control[3].y) < 15) {
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
    computeEndTangents(tangents);          // 1. 端点の接ベクトルを計算
    computeParameters();                   // 2. パラメータを計算
    computeEndPoints(control);             // 3. 端点を計算
    computectrlPoints(control, tangents);  // 4. 制御点を計算

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
  for (int i = 0; i < control.length; i++) {
    control[i] = null;
  }
  curveExists = false;
}