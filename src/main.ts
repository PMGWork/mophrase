import '../style.css';
import p5 from 'p5';
import type { Path } from './types';
import { fitCurve } from './fitting';
import { getColors, drawPoints, drawBezierCurve, drawControls } from './draw';
import { HandleController } from './handle';

const sketch = (p: p5): void => {
  // データ構造
  let paths: Path[] = [];              // 確定済みのパス群
  let activePath: Path | null = null;  // 現在描画中のパス

  // 表示・非表示の状態
  let showHandles: boolean = true;    // ベジエハンドルの表示状態
  let showHandDrawn: boolean = true;  // 手書きストロークの描画状態

  // フィッティング関連
  let errorTol = 10.0;               // 許容誤差(ピクセル)
  let coarseErrTol = errorTol * 2;   // 粗い許容誤差(ピクセル)

  // ハンドル操作関連
  const handleController = new HandleController(() => paths);
  let dragMode: number = 0;

  // 色定義
  const COLORS = getColors();

  const getButton = (id: string): HTMLButtonElement | null => {
    const element = document.getElementById(id);
    return element instanceof HTMLButtonElement ? element : null;
  };

  const getInput = (id: string): HTMLInputElement | null => {
    const element = document.getElementById(id);
    return element instanceof HTMLInputElement ? element : null;
  };

  let handlesButton: HTMLButtonElement | null = null;
  let sketchButton: HTMLButtonElement | null = null;
  let thresholdSlider: HTMLInputElement | null = null;
  let thresholdLabel: HTMLElement | null = null;
  let canvasContainer: HTMLDivElement | null = null;

  const getCanvasSize = (): { width: number; height: number } => {
    if (canvasContainer) {
      return {
        width: canvasContainer.clientWidth,
        height: canvasContainer.clientHeight,
      };
    }
    return { width: p.windowWidth, height: p.windowHeight };
  };

  p.setup = () => {
    canvasContainer = document.getElementById('canvasContainer') as HTMLDivElement | null;
    const { width, height } = getCanvasSize();
    const canvas = p.createCanvas(width, height);
    if (canvasContainer) canvas.parent(canvasContainer);
    p.background(COLORS.BACKGROUND);
    p.textFont('Geist');

    // HTMLボタンのイベントリスナーを設定
    getButton('clearButton')?.addEventListener('click', clearAll);
    handlesButton = getButton('toggleHandlesButton');
    handlesButton?.addEventListener('click', toggleHandles);
    sketchButton = getButton('toggleSketchButton');
    sketchButton?.addEventListener('click', toggleHandDrawn);

    thresholdSlider = getInput('thresholdSlider');
    thresholdLabel = document.getElementById('thresholdValue');
    if (thresholdSlider) {
      thresholdSlider.value = errorTol.toString();
      thresholdSlider.addEventListener('input', updateThreshold);
    }
    updateThreshold();
  };

  p.windowResized = () => {
    const { width, height } = getCanvasSize();
    p.resizeCanvas(width, height);
  };

  p.keyPressed = () => {
    if (p.key === 'Shift') {
      dragMode = 1 - dragMode;
    }
  };

  p.draw = () => {
    p.background(COLORS.BACKGROUND);

    // 確定済みパスの描画
    for (const path of paths) {
      if (showHandDrawn) drawPoints(p, path.points, COLORS);
      drawBezierCurve(p, path.curves, COLORS);
      if (showHandles) drawControls(p, path.curves, COLORS);
    }

    // 現在描画中のパスの描画
    if (activePath) {
      drawPoints(p, activePath.points, COLORS);
      if (activePath.curves.length > 0) {
        drawBezierCurve(p, activePath.curves, COLORS);
        if (showHandles) drawControls(p, activePath.curves, COLORS);
      }
    }
  };

  p.mouseDragged = () => {
    // ドラッグ中のハンドル位置を更新
    const mode = dragMode;
    if (handleController.drag(p.mouseX, p.mouseY, mode)) return;

    // 描画中のパスに点を追加
    if (activePath) activePath.points.push(p.createVector(p.mouseX, p.mouseY));
  };

  p.mousePressed = () => {
    // ハンドルのドラッグ開始
    if (handleController.begin(p.mouseX, p.mouseY, showHandles)) return;

    // 新しいパスを開始
    activePath = {
      points: [p.createVector(p.mouseX, p.mouseY)],
      curves: [],
      fitError: {
        current: {
          maxError: Number.MAX_VALUE,
          index: -1
        },
      },
    };
  };

  p.mouseReleased = () => {
    // ハンドルのドラッグ終了
    if (handleController.end()) return;

    if (!activePath) return;

    if (activePath.points.length >= 2) {
      // フィッティングを実行
      fitCurve(
        activePath.points,
        activePath.curves,
        errorTol,
        coarseErrTol,
        activePath.fitError
      );

      // 確定済みパスに追加
      paths.push(activePath);
    }

    // 描画中のパスをリセット
    activePath = null;
  };

  function clearAll(): void {
    paths = [];
    activePath = null;
  }

  // ベジエハンドルの表示・非表示を切り替え
  function toggleHandles(): void {
    showHandles = !showHandles;
    if (!handlesButton) return;
    handlesButton.textContent = showHandles ? 'Hide Handles' : 'Show Handles';
  }

  // 手書きストロークの表示・非表示を切り替え
  function toggleHandDrawn(): void {
    showHandDrawn = !showHandDrawn;
    if (!sketchButton) return;
    sketchButton.textContent = showHandDrawn ? 'Hide Sketch' : 'Show Sketch';
  }

  // 許容誤差の更新
  function updateThreshold(): void {
    if (thresholdSlider) {
      const parsed = Number(thresholdSlider.value);
      if (!Number.isNaN(parsed)) {
        errorTol = parsed;
        coarseErrTol = errorTol * 2;
      }
    }

    if (thresholdLabel) {
      thresholdLabel.textContent = `${errorTol.toFixed(0)}px`;
    }
  }
};

new p5(sketch);
