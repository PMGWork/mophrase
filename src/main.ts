import '../style.css';
import p5 from 'p5';
import type { Vector, FitErrorResult } from './types';
import {
  COLORS,
  drawInputPoints,
  drawBezierCurve,
  drawControlPolygon,
  drawControlPoints,
} from './draw';
import { fitCurve } from './fitting';

const sketch = (p: p5): void => {
  // データ構造
  let points: Vector[] = [];         // 入力した点群
  let curves: Vector[][] = [];       // フィットした複数のベジェ曲線
  let curveExists: boolean = false;  // 曲線が既に存在するかどうか

  // 表示・非表示の状態
  let showHandles: boolean = true;   // ベジエハンドルの表示状態

  // フィッティング関連
  let lastFitError: { current: FitErrorResult } = {
    current: { maxError: Number.MAX_VALUE, index: -1 },
  };
  const errorTol = 10.0;              // 許容誤差(ピクセル)
  const coarseErrTol = errorTol * 2;  // 粗い許容誤差(ピクセル)

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.background(COLORS.BACKGROUND);
    p.textFont('Helvetica Neue');

    // HTMLボタンのイベントリスナーを設定
    const clearButton = document.getElementById('clearButton');
    if (clearButton) {
      clearButton.addEventListener('click', clearAll);
    }

    const toggleHandlesButton = document.getElementById('toggleHandlesButton');
    if (toggleHandlesButton) {
      toggleHandlesButton.addEventListener('click', toggleHandles);
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    p.background(COLORS.BACKGROUND);

    // 手書き線の描画（常に表示）
    drawInputPoints(p, points);

    // ベジエ曲線の描画（常に表示）
    drawBezierCurve(p, points, curves);

    // ベジエハンドルの描画（表示状態の場合のみ）
    if (showHandles) {
      drawControlPolygon(p, points, curves);
      drawControlPoints(p, points, curves);
    }
  };

  p.mouseDragged = () => {
    // 曲線がまだ存在しない場合のみ、点を追加
    if (!curveExists) points.push(p.createVector(p.mouseX, p.mouseY));
  };

  p.mousePressed = () => {
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

  function toggleHandles(): void {
    showHandles = !showHandles;
    const button = document.getElementById('toggleHandlesButton') as HTMLButtonElement;
    if (button) {
      button.textContent = showHandles ? 'Hide Handles' : 'Show Handles';
    }
  }
};

// p5インスタンスを作成
new p5(sketch);
