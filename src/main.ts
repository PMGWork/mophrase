import '../style.css';
import p5 from 'p5';
import type { Path } from './types';
import { DEFAULT_CONFIG, DEFAULT_COLORS } from './config';
import { fitCurve } from './fitting';
import { drawPoints, drawBezierCurve, drawControls } from './draw';
import { HandleManager } from './handle';
import { SuggestionManager } from './suggestion';

const sketch = (p: p5): void => {
  // #region 変数設定
  // 設定の読み込み
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // データ構造
  let paths: Path[] = [];
  let activePath: Path | null = null;

  // 表示・非表示の状態
  let showSketch: boolean = config.showSketch;

  // フィッティング関連
  let errorTol = config.errorTolerance;
  let coarseErrTol = errorTol * config.coarseErrorWeight;

  // ハンドル操作関連
  const handleManager = new HandleManager(() => paths);
  let dragMode: number = config.defaultDragMode;

  // 提案生成関連
  const suggestionManager = new SuggestionManager(config);


  // #region セットアップ
  // 要素を定義
  const getElement = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T | null;

  let sketchButton: HTMLButtonElement | null = null;
  let thresholdSlider: HTMLInputElement | null = null;
  let thresholdLabel: HTMLElement | null = null;
  let canvasContainer: HTMLDivElement | null = null;

  // UIのセットアップ
  const setupUI = (): void => {
    // クリアボタンの設定
    getElement<HTMLButtonElement>('clearButton')?.addEventListener('click', clearAll);

    // スケッチ表示切替ボタンの設定
    sketchButton = getElement<HTMLButtonElement>('toggleSketchButton');
    sketchButton?.addEventListener('click', toggleHandDrawn);
    if (sketchButton) sketchButton.textContent = showSketch ? 'Hide Sketch' : 'Show Sketch';

    // しきい値スライダーの設定
    thresholdSlider = getElement<HTMLInputElement>('thresholdSlider');
    thresholdLabel = getElement('thresholdValue');
    if (thresholdSlider) {
      thresholdSlider.value = errorTol.toString();
      thresholdSlider.addEventListener('input', updateThreshold);
    }
    updateThreshold();
  };

  // キャンバスサイズを取得
  const getCanvasSize = (): { width: number; height: number } => {
    if (canvasContainer) {
      return {
        width: canvasContainer.clientWidth,
        height: canvasContainer.clientHeight,
      };
    }
    return { width: p.windowWidth, height: p.windowHeight };
  };

  // 位置がキャンバス内かを判定
  const inCanvas = (x: number, y: number): boolean =>
    x >= 0 && x <= p.width && y >= 0 && y <= p.height;

  // #region 初期設定
  p.setup = () => {
    canvasContainer = getElement<HTMLDivElement>('canvasContainer');
    const { width, height } = getCanvasSize();
    const canvas = p.createCanvas(width, height);
    if (canvasContainer) canvas.parent(canvasContainer);
    p.background(colors.background);
    p.textFont('Geist');

    setupUI();
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

    suggestionManager.draw(p, colors, paths[paths.length - 1]);
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
    if (handleManager.drag(p.mouseX, p.mouseY, mode)) return;

    // 描画中のパスに点を追加
    if (activePath && inCanvas(p.mouseX, p.mouseY)) {
      activePath.points.push(p.createVector(p.mouseX, p.mouseY));
    }
  };

  p.mousePressed = () => {
    const appliedPaths = suggestionManager.trySelectSuggestion(p.mouseX, p.mouseY, p);
    if (appliedPaths && appliedPaths.length > 0) {
      paths[paths.length - 1] = appliedPaths[0];
      activePath = null;
      return;
    }

    // ハンドルのドラッグ開始
    if (handleManager.begin(p.mouseX, p.mouseY)) return;
    if (!inCanvas(p.mouseX, p.mouseY)) return;

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
    if (handleManager.end()) return;

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
      suggestionManager.reset();
      void suggestionManager.generate(paths[paths.length - 1]);
    }

    // 描画中のパスをリセット
    activePath = null;
  };


  // #region ユーティリティ
  // 全てのパスをクリア
  function clearAll(): void {
    paths = [];
    activePath = null;
    suggestionManager.reset();
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
        coarseErrTol = errorTol * config.coarseErrorWeight;
      }
    }

    if (thresholdLabel) {
      thresholdLabel.textContent = `${errorTol.toFixed(2)}px`;
    }
  }
};

new p5(sketch);
