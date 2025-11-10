/// ベジェ曲線の描画

// 色定義
color YELLOW = #D7B600;
color WHITE = #B0B0B0;
color GRAY = #484848;
color BLACK = #303030;

int pointSize = 8;
int ctrlPointSize = 8;

// 描画可能かどうかをチェックする共通ガード関数
boolean canDrawCurves() {
  return points.size() >= 2 && curves.size() > 0;
}

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
  if (!canDrawCurves()) return;

  stroke(WHITE);
  strokeWeight(3);
  noFill();

  for (PVector[] curve : curves) {
    if (curve[0] == null) continue;

    beginShape();
    for (float t = 0; t <= 1; t += 0.01) {
      PVector p = bezierCurve(curve[0], curve[1], curve[2], curve[3], t);
      vertex(p.x, p.y);
    }
    endShape();
  }
}

// 制御ポリゴンの描画
void drawControlPolygon() {
  if (!canDrawCurves()) return;

  stroke(YELLOW);
  strokeWeight(1);
  noFill();

  for (PVector[] curve : curves) {
    if (curve[0] == null) continue;

    beginShape();
    vertex(curve[0].x, curve[0].y);
    vertex(curve[1].x, curve[1].y);
    endShape();

    beginShape();
    vertex(curve[2].x, curve[2].y);
    vertex(curve[3].x, curve[3].y);
    endShape();
  }
}

// 制御点の描画
void drawControlPoints() {
  if (!canDrawCurves()) return;

  fill(YELLOW);
  noStroke();
  rectMode(CENTER);

  for (PVector[] curve : curves) {
    if (curve[0] == null) continue;

    // 端点
    rect(curve[0].x, curve[0].y, pointSize, pointSize);
    rect(curve[3].x, curve[3].y, pointSize, pointSize);

    // ハンドル
    circle(curve[1].x, curve[1].y, ctrlPointSize);
    circle(curve[2].x, curve[2].y, ctrlPointSize);
  }
}

// 誤差判定の表示
void drawFitStatus() {
  if (lastFitError == null || lastFitError.maxError == Float.MAX_VALUE) return;

  fill(WHITE);
  textAlign(LEFT, TOP);
  textSize(14);

  String status = "OK";
  if (lastFitError.maxError > errTol) status = "NG";

  String maxErrorText = nf(lastFitError.maxError, 1, 2) + "px";
  String toleranceText = nf(errTol, 1, 2) + "px";

  float infoY = clearButtonY + clearButtonH + 10;
  text("max error: " + maxErrorText + " / tol: " + toleranceText + " [" + status + "]", clearButtonX, infoY);
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
