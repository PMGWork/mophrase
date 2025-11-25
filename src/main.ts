import '../style.css';
import p5 from 'p5';
import type { Path } from './types';
import { DEFAULT_CONFIG, DEFAULT_COLORS } from './config';
import { getModelsForProvider } from './llmService';
import { fitCurve } from './fitting';
import { drawPoints, drawBezierCurve, drawControls } from './draw';
import { HandleManager } from './handleManager';
import { SuggestionManager } from './suggestion';
import { DOMManager } from './dom';
import { MotionManager } from './motion';
import { GraphEditor } from './graphEditor';

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
  let sketchFitTolerance = config.sketchFitTolerance;
  let coarseErrTol = sketchFitTolerance * config.coarseErrorWeight;

  // ハンドル操作関連
  const handleManager = new HandleManager(() => paths);
  let dragMode: number = config.defaultDragMode;

  // UIマネージャー
  let dom: DOMManager;

  // モーションマネージャー
  let motionManager: MotionManager;
  let graphEditor: GraphEditor;

  // 提案生成関連
  const suggestionManager = new SuggestionManager(config, (selectedPaths, targetPath) => {
    // 提案が選択されたときの処理
    const updated = selectedPaths[0];
    if (!updated) return;

    if (targetPath) {
      const index = paths.findIndex(path => path === targetPath);
      if (index >= 0) {
        // 既存パスを置き換えることで元のパスに補正を適用
        paths[index].points = updated.points;
        paths[index].curves = updated.curves;
        paths[index].fitError = updated.fitError;
        return;
      }
    }

    // 対象が見つからない場合は新規追加（フォールバック）
    paths.push(updated);
  });


  // #region セットアップ
  // UIのセットアップ
  const setupUI = (): void => {
    // クリアボタンの設定
    dom.clearButton.addEventListener('click', clearAll);

    // モーション操作の設定
    dom.playButton.addEventListener('click', () => {
      if (activePath) return;
      const target = paths[paths.length - 1];
      if (target) motionManager.play(target);
    });

    dom.editMotionButton.addEventListener('click', () => {
      graphEditor.toggle();
      // エディタが表示されたら最新のパスをセット
      const target = paths[paths.length - 1];
      if (target) graphEditor.setPath(target);
    });

    dom.closeGraphEditorButton.addEventListener('click', () => {
      graphEditor.toggle();
    });

    // LLMプロバイダ選択の設定
    dom.llmProviderSelect.value = config.llmProvider;
    dom.llmProviderSelect.addEventListener('change', updateLLMProvider);

    // モデル選択を初期化
    populateModelOptions(config.llmProvider);

    dom.llmModelSelect.addEventListener('change', updateLLMModel);

    // スケッチ表示切替の設定
    dom.sketchCheckbox.checked = showSketch;
    dom.sketchCheckbox.addEventListener('change', toggleHandDrawn);

    // しきい値スライダーの設定
    dom.thresholdSlider.value = Math.round(sketchFitTolerance).toString();
    dom.thresholdSlider.addEventListener('input', updateThreshold);
    updateThreshold();

    // グラフ許容値スライダーの設定
    dom.graphThresholdSlider.value = config.graphFitTolerance.toString();
    dom.graphThresholdSlider.addEventListener('input', updateGraphThreshold);
    updateGraphThreshold();

    setupUserPromptInput();
  };

  // 位置がキャンバス内かを判定
  const inCanvas = (x: number, y: number): boolean =>
    x >= 0 && x <= p.width && y >= 0 && y <= p.height;

  // #region 初期設定
  p.setup = () => {
    dom = new DOMManager();
    motionManager = new MotionManager(p);
    graphEditor = new GraphEditor(dom.graphEditorContainer);

    const { width, height } = dom.getCanvasSize();
    const canvas = p.createCanvas(width, height);
    canvas.parent(dom.canvasContainer);
    p.background(colors.background);
    p.textFont('Geist');

    setupUI();
  };

  p.windowResized = () => {
    if (!dom) return;
    const { width, height } = dom.getCanvasSize();
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

    // ホバー中の提案プレビューを描画
    suggestionManager.draw(p, colors, paths[paths.length - 1]);

    // モーション再生
    motionManager.update();
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
      activePath.times.push(p.millis());
    }
  };

  p.mousePressed = () => {
    // 左クリックのみを処理
    if (!p.mouseButton.left) return;

    // ハンドルのドラッグ開始
    if (handleManager.begin(p.mouseX, p.mouseY)) return;
    if (!inCanvas(p.mouseX, p.mouseY)) return;

    // 新しいパスを開始
    activePath = {
      points: [p.createVector(p.mouseX, p.mouseY)],
      times: [p.millis()],
      curves: [],
      timeCurve: [],
      fitError: {
        current: {
          maxError: Number.MAX_VALUE,
          index: -1
        },
      },
    };
    dom.userPromptInput.value = '';
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
        sketchFitTolerance,
        coarseErrTol,
        activePath.fitError
      );

      // タイミング曲線のフィッティング
      // グラフの描画領域は正規化座標(0-1)で計算
      // 許容値はパーセント指定なので、100で割って正規化
      const normalizedTol = config.graphFitTolerance / 100;
      motionManager.fitTiming(activePath, p, normalizedTol);

      // 確定済みパスに追加
      paths.push(activePath);
      suggestionManager.reset();
      void suggestionManager.generate(paths[paths.length - 1]);

      // エディタにも反映
      graphEditor.setPath(paths[paths.length - 1]);
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
    showSketch = dom.sketchCheckbox.checked;
  }

  // 誤差許容値の更新
  function updateThreshold(): void {
    const parsed = Number(dom.thresholdSlider.value);
    if (!Number.isNaN(parsed)) {
      sketchFitTolerance = parsed;
      coarseErrTol = sketchFitTolerance * config.coarseErrorWeight;
    }

    // 小数部分を表示しない (整数px)
    dom.thresholdLabel.textContent = `${sketchFitTolerance.toFixed(0)}px`;
  }

  // グラフ許容値の更新
  function updateGraphThreshold(): void {
    const parsed = Number(dom.graphThresholdSlider.value);
    if (!Number.isNaN(parsed)) {
      config.graphFitTolerance = parsed;
    }

    // パーセント表示
    dom.graphThresholdLabel.textContent = `${config.graphFitTolerance.toFixed(0)}%`;
  }

  // ユーザー指示入力欄のセットアップ
  function setupUserPromptInput(): void {
    dom.userPromptForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const userPrompt = dom.userPromptInput.value.trim();
      const latestPath = paths[paths.length - 1];
      if (!latestPath) return;
      suggestionManager.reset();
      void suggestionManager.generate(latestPath, userPrompt);
    });
  }

  // LLMモデル選択肢の更新
  function populateModelOptions(provider: import('./llmService').LLMProvider): void {
    const models = getModelsForProvider(provider);
    dom.llmModelSelect.innerHTML = '';
    for (const mi of models) {
      const option = document.createElement('option');
      option.value = mi.id;
      option.textContent = mi.name ?? mi.id;
      dom.llmModelSelect.appendChild(option);
    }

    const currentModelExists = models.some(mi => mi.id === config.llmModel);
    const defaultModel = currentModelExists ? config.llmModel : (models[0]?.id ?? '');
    config.llmModel = defaultModel;
    dom.llmModelSelect.value = defaultModel;
    suggestionManager.updateConfig(config);
  }

  function updateLLMModel(): void {
    config.llmModel = dom.llmModelSelect.value;
    suggestionManager.updateConfig(config);
  }


  // LLMプロバイダの更新
  function updateLLMProvider(): void {
    const selected = dom.llmProviderSelect.value as import('./llmService').LLMProvider;
    config.llmProvider = selected;

    // LLMモデル選択肢の更新
    populateModelOptions(selected);
  }
};

new p5(sketch);
