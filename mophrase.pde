/// メインプログラム

// データ構造
ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
ArrayList<PVector[]> curves = new ArrayList<PVector[]>();  // フィットした複数のベジェ曲線
boolean curveExists = false;  // 曲線が既に存在するかどうか

// フィッティング関連
PVector[] tangents = new PVector[2];  // 端点の接ベクトル
FitErrorResult lastFitError = new FitErrorResult(Float.MAX_VALUE, -1);  // 直近フィットの最大誤差とインデックス
float errTol = 10.0;               // 許容誤差（ピクセル）
float coarseErrTol = errTol * 2;   // 粗い許容誤差（ピクセル）

// UI関連
int clearButtonX = 20;
int clearButtonY = 20;
int clearButtonW = 100;
int clearButtonH = 40;

void setup() {
  size(900, 600);
  background(BLACK);
}

void draw() {
  background(BLACK);

  // ベジェの描画
  drawInputPoints();
  drawBezierCurve();
  drawControlPolygon();
  drawControlPoints();

  // UIの描画
  drawClearButton();
}

void mouseDragged() {
  if (!curveExists) {
    // 点を追加
    points.add(new PVector(mouseX, mouseY));
  }
}

void mousePressed() {
  // クリアボタンのクリック判定
  if (mouseX >= clearButtonX && mouseX <= clearButtonX + clearButtonW &&
      mouseY >= clearButtonY && mouseY <= clearButtonY + clearButtonH) {
    clearAll();
    return;
  }

  // 曲線がまだ存在しない場合のみ、新しく描画開始
  if (!curveExists) {
    clearAll();
  }
}

void mouseReleased() {
  if (!curveExists && points.size() >= 2) {
    fitCurve();
  }
}

void clearAll() {
  points.clear();
  curves.clear();
  for (int i = 0; i < tangents.length; i++) tangents[i] = null;
  lastFitError = new FitErrorResult(Float.MAX_VALUE, -1);
  curveExists = false;
}
