import p5 from 'p5';
import type { Vector, FitErrorResult } from './types';
import {
  COLORS,
  drawInputPoints,
  drawBezierCurve,
  drawControlPolygon,
  drawControlPoints,
  drawClearButton,
} from './display';
import { fitCurve } from './fitting';

const sketch = (p: p5): void => {
  // データ構造
  let points: Vector[] = [];         // 入力した点群
  let curves: Vector[][] = [];       // フィットした複数のベジェ曲線
  let curveExists: boolean = false;  // 曲線が既に存在するかどうか

  // フィッティング関連
  let lastFitError: { current: FitErrorResult } = {
    current: { maxError: Number.MAX_VALUE, index: -1 },
  };
  const errorTol = 10.0;              // 許容誤差(ピクセル)
  const coarseErrTol = errorTol * 2;  // 粗い許容誤差(ピクセル)

  // UI関連
  const clearButtonX = 20;
  const clearButtonY = 20;
  const clearButtonW = 100;
  const clearButtonH = 40;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.background(COLORS.BLACK);
  };

  p.draw = () => {
    p.background(COLORS.BLACK);

    // ベジェの描画
    drawInputPoints(p, points);
    drawBezierCurve(p, points, curves);
    drawControlPolygon(p, points, curves);
    drawControlPoints(p, points, curves);

    // UIの描画
    drawClearButton(p, clearButtonX, clearButtonY, clearButtonW, clearButtonH);
  };

  p.mouseDragged = () => {
    // 曲線がまだ存在しない場合のみ、点を追加
    if (!curveExists) points.push(p.createVector(p.mouseX, p.mouseY));
  };

  p.mousePressed = () => {
    // クリアボタンのクリック判定
    if (
      p.mouseX >= clearButtonX &&
      p.mouseX <= clearButtonX + clearButtonW &&
      p.mouseY >= clearButtonY &&
      p.mouseY <= clearButtonY + clearButtonH
    ) {
      clearAll();
      return;
    }

    // 曲線がまだ存在しない場合のみ、クリア
    if (!curveExists) clearAll();
  };

  p.mouseReleased = () => {
    if (!curveExists && points.length >= 2) {
      fitCurve(points, curves, errorTol, coarseErrTol, lastFitError);
      curveExists = true;
    }
  };

  function clearAll(): void {
    points = [];
    curves = [];
    lastFitError = {
      current: { maxError: Number.MAX_VALUE, index: -1 },
    };
    curveExists = false;
  }
};

// p5インスタンスを作成
new p5(sketch);
