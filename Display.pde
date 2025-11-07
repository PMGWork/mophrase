/// ベジェ曲線の描画

// 色定義
color YELLOW = #D7B600;
color WHITE = #B0B0B0;
color GRAY = #484848;
color BLACK = #303030;

int pointSize = 8;
int controlPointSize = 8;

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
  if (points.size() < 2 || controlPoints[0] == null) return;

  stroke(WHITE);
  strokeWeight(3);
  noFill();
  beginShape();
  for (float t = 0; t <= 1; t += 0.01) {
    PVector p = bezierCurve(
      controlPoints[0],
      controlPoints[1],
      controlPoints[2],
      controlPoints[3],
      t
    );
    vertex(p.x, p.y);
  }
  endShape();
}

// 制御ポリゴンの描画
void drawControlPolygon() {
  if (points.size() < 2 || controlPoints[0] == null) return;

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
}

// 制御点の描画
void drawControlPoints() {
  if (points.size() < 2 || controlPoints[0] == null) return;

  rectMode(CENTER);

  fill(YELLOW);
  noStroke();
  rect(controlPoints[0].x, controlPoints[0].y, pointSize, pointSize);
  rect(controlPoints[3].x, controlPoints[3].y, pointSize, pointSize);
  circle(controlPoints[1].x, controlPoints[1].y, controlPointSize);
  circle(controlPoints[2].x, controlPoints[2].y, controlPointSize);
}
