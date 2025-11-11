import '../style.css';
import p5 from 'p5';
import type { Path } from './types';
import { fitCurve } from './fitting';
import { COLORS, drawPoints, drawBezierCurve, drawControls } from './draw';

const sketch = (p: p5): void => {
  // データ構造
  let paths: Path[] = [];              // 確定済みのパス群
  let activePath: Path | null = null;  // 現在描画中のパス

  // 表示・非表示の状態
  let showHandles: boolean = true;  // ベジエハンドルの表示状態

  // フィッティング関連
  const errorTol = 10.0;              // 許容誤差(ピクセル)
  const coarseErrTol = errorTol * 2;  // 粗い許容誤差(ピクセル)

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.background(COLORS.BACKGROUND);
    p.textFont('Helvetica Neue');

    // HTMLボタンのイベントリスナーを設定
    const clearButton = document.getElementById('clearButton');
    if (clearButton) clearButton.addEventListener('click', clearAll);

    const toggleHandlesButton = document.getElementById('toggleHandlesButton');
    if (toggleHandlesButton) toggleHandlesButton.addEventListener('click', toggleHandles);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    p.background(COLORS.BACKGROUND);

    // 確定済みパスの描画
    for (const path of paths) {
      drawPoints(p, path.points);
      drawBezierCurve(p, path.points, path.curves);
      if (showHandles) drawControls(p, path.points, path.curves);
    }

    // 現在描画中のパスの描画
    if (activePath) {
      drawPoints(p, activePath.points);
      if (activePath.curves.length > 0) {
        drawBezierCurve(p, activePath.points, activePath.curves);
        if (showHandles) drawControls(p, activePath.points, activePath.curves);
      }
    }
  };

  p.mouseDragged = () => {
    // 描画中のパスに点を追加
    if (activePath) activePath.points.push(p.createVector(p.mouseX, p.mouseY));
  };

  p.mousePressed = () => {
    // 新しいパスを開始
    activePath = {
      points: [p.createVector(p.mouseX, p.mouseY)],
      curves: [],
      lastFitError: {
        current: { maxError: Number.MAX_VALUE, index: -1 },
      },
    };
  };

  p.mouseReleased = () => {
    if (activePath && activePath.points.length >= 2) {
      // フィッティングを実行
      fitCurve(
        activePath.points,
        activePath.curves,
        errorTol,
        coarseErrTol,
        activePath.lastFitError
      );

      // 確定済みパスに追加
      paths.push(activePath);

      // 描画中のパスをリセット
      activePath = null;
    } else if (activePath) {
      activePath = null;
    }
  };

  function clearAll(): void {
    paths = [];
    activePath = null;
  }

  function toggleHandles(): void {
    showHandles = !showHandles;
    const button = document.getElementById('toggleHandlesButton') as HTMLButtonElement;
    if (button) button.textContent = showHandles ? 'Hide Handles' : 'Show Handles';
  }
};

new p5(sketch);
