/// ベジェ曲線の描画

// 色定義
color YELLOW = #D7B600;
color WHITE = #B0B0B0;
color GRAY = #484848;
color BLACK = #303030;

int pointSize = 8;
int ctrlPointSize = 8;

// 入力点の描画
void drawInputPoints() {
  stroke(GRAY);
  strokeWeight(3);
  noFill();
  beginShape();
  for (PVector p : points) {
    vertex(p.x, p.y);
  }
  endShape();
}

// ベジェ曲線の描画
void drawBezierCurve() {
  if (points.size() < 2 || control[0] == null) return;

  stroke(WHITE);
  strokeWeight(3);
  noFill();
  beginShape();
  for (float t = 0; t <= 1; t += 0.01) {
    PVector p = bezierCurve(control[0], control[1], control[2], control[3], t);
    vertex(p.x, p.y);
  }
  endShape();
}

// 制御ポリゴンの描画
void drawControlPolygon() {
  if (points.size() < 2 || control[0] == null) return;

  stroke(YELLOW);
  strokeWeight(1);
  noFill();

  beginShape();
  vertex(control[0].x, control[0].y);
  vertex(control[1].x, control[1].y);
  endShape();

  beginShape();
  vertex(control[2].x, control[2].y);
  vertex(control[3].x, control[3].y);
  endShape();
}

// 制御点の描画
void drawctrlPoints() {
  if (points.size() < 2 || control[0] == null) return;

  fill(YELLOW);
  noStroke();
  rectMode(CENTER);

  // 端点
  rect(control[0].x, control[0].y, pointSize, pointSize);
  rect(control[3].x, control[3].y, pointSize, pointSize);

  // ハンドル
  circle(control[1].x, control[1].y, ctrlPointSize);
  circle(control[2].x, control[2].y, ctrlPointSize);
}

// クリアボタンの描画
void drawClearButton() {
  // ボタンの背景
  fill(GRAY);
  stroke(WHITE);
  strokeWeight(2);
  rectMode(CORNER);
  rect(clearButtonX, clearButtonY, clearButtonW, clearButtonH, 5);

  // ボタンのテキスト
  fill(WHITE);
  textAlign(CENTER, CENTER);
  textSize(16);
  text("CLEAR", clearButtonX + clearButtonW/2, clearButtonY + clearButtonH/2);
}
