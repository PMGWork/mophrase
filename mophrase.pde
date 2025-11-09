/// メインプログラム

ArrayList<PVector> points = new ArrayList<PVector>();  // 入力した点群
FloatList params = new FloatList();  // パラメータ

PVector[] control = new PVector[4];   // 制御点
PVector[] tangents = new PVector[2];  // 端点の接ベクトル
PVector splitTangent = null;          // 分割点での単位接ベクトル

FitErrorResult lastFitError = new FitErrorResult(Float.MAX_VALUE, -1);  // 直近フィットの最大誤差とインデックス

float errTol = 10.0;               // 許容誤差（ピクセル）
float coarseErrTol = errTol * 2;   // 粗い許容誤差（ピクセル）

boolean curveExists = false;  // 曲線が既に存在するかどうか

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
  drawFitStatus();
}

void mouseDragged() {
  if(!curveExists) {
    // 点を追加
    points.add(new PVector(mouseX, mouseY));
  }
}

void mousePressed() {
  // クリアボタンのクリック判定
  if(mouseX >= clearButtonX && mouseX <= clearButtonX + clearButtonW &&
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
  for (int i = 0; i < tangents.length; i++) tangents[i] = null;
  for (int i = 0; i < control.length; i++) control[i] = null;
  lastFitError = new FitErrorResult(Float.MAX_VALUE, -1);
  splitTangent = null;
  curveExists = false;
}
