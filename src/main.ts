import '../style.css';
import p5 from 'p5';
import type { Path } from './types';
import { DEFAULT_CONFIG, DEFAULT_COLORS } from './config';
import { fitCurve } from './fitting';
import { drawPoints, drawBezierCurve, drawControls } from './draw';
import { HandleController } from './handle'

const sketch = (p: p5): void => {
  // #region 変数設定
  // 設定の読み込み
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // データ構造
  let paths: Path[] = [];              // 確定済みのパス群
  let activePath: Path | null = null;  // 現在描画中のパス

  // 表示・非表示の状態
  let showSketch: boolean = config.showSketch;

  // フィッティング関連
  let errorTol = config.errorTolerance;
  let coarseErrTol = errorTol * 2;

  // ハンドル操作関連
  const handleController = new HandleController(() => paths);
  let dragMode: number = config.defaultDragMode;

  const getButton = (id: string): HTMLButtonElement | null => {
    const element = document.getElementById(id);
    return element instanceof HTMLButtonElement ? element : null;
  };

  const getInput = (id: string): HTMLInputElement | null => {
    const element = document.getElementById(id);
    return element instanceof HTMLInputElement ? element : null;
  };

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

  // #region セットアップ
  p.setup = () => {
    canvasContainer = document.getElementById('canvasContainer') as HTMLDivElement | null;
    const { width, height } = getCanvasSize();
    const canvas = p.createCanvas(width, height);
    if (canvasContainer) canvas.parent(canvasContainer);
    p.background(colors.background);
    p.textFont('Geist');

    // HTMLボタンのイベントリスナーを設定
    getButton('clearButton')?.addEventListener('click', clearAll);
    sketchButton = getButton('toggleSketchButton');
    sketchButton?.addEventListener('click', toggleHandDrawn);
    if (sketchButton) {
      sketchButton.textContent = showSketch ? 'Hide Sketch' : 'Show Sketch';
    }

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

  // #region 描画
  p.draw = () => {
    p.background(colors.background);

    // 確定済みパスの描画
    for (const path of paths) {
      if (showSketch) drawPoints(
        p,
        path.points,
        config.lineWeight,
        config.pointSize - config.lineWeight,
        colors.curve,
        colors.background
      );
      drawBezierCurve(p, path.curves, config.lineWeight, colors.curve);
      drawControls(p, path.curves, config.pointSize, colors.handle);
    }

    // 現在描画中のパスの描画
    if (activePath) {
      drawPoints(
        p,
        activePath.points,
        config.lineWeight,
        config.pointSize - config.lineWeight,
        colors.curve,
        colors.background
      );
    }
  };

  // #region イベント
  p.keyPressed = () => {
    if (p.key === 'Shift') dragMode = 0;
  };

  p.keyReleased = () => {
    if (p.key === 'Shift') dragMode = config.defaultDragMode;
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
  if (handleController.begin(p.mouseX, p.mouseY)) return;

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

  // #region ユーティリティ
  // 全てのパスをクリア
  function clearAll(): void {
    paths = [];
    activePath = null;
  }

  // 手書きストロークの表示・非表示を切り替え
  function toggleHandDrawn(): void {
    showSketch = !showSketch;
    if (!sketchButton) return;
    sketchButton.textContent = showSketch ? 'Hide Sketch' : 'Show Sketch';
  }

  // 誤差許容値の更新
  function updateThreshold(): void {
    if (thresholdSlider) {
      const parsed = Number(thresholdSlider.value);
      if (!Number.isNaN(parsed)) {
        errorTol = parsed;
        coarseErrTol = errorTol * 2;
      }
    }

    if (thresholdLabel) {
      thresholdLabel.textContent = `${errorTol.toFixed(2)}px`;
    }

    refitExistingPaths();
  }

  // 既存のパスを再フィッティング
  function refitExistingPaths(): void {
    for (const path of paths) {
      if (path.points.length < 2) {
        path.curves.length = 0;
        continue;
      }

      path.curves.length = 0;
      path.fitError.current = { maxError: Number.MAX_VALUE, index: -1 };
      fitCurve(path.points, path.curves, errorTol, coarseErrTol, path.fitError);
    }
  }
};

new p5(sketch);
