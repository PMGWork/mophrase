import '../style.css';
import { DEFAULT_CONFIG, DEFAULT_COLORS } from './config';
import { getModelsForProvider } from './llmService';
import { DOMManager } from './domManager';
import { GraphEditor } from './graphEditor';
import { SketchEditor } from './sketchEditor';

// メイン処理
const main = (): void => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // DOMマネージャー
  const domManager = new DOMManager();

  // エディタ
  const graphEditor = new GraphEditor(domManager, config, colors);
  const sketchEditor = new SketchEditor(domManager, config, colors, (path) => {
    graphEditor.setPath(path);
  });

  // #region セットアップ
  // UIのセットアップ
  const setupUI = (): void => {
    // クリアボタンの設定
    domManager.clearButton.addEventListener('click', () => {
      sketchEditor.clearAll()
    });

    // モーション操作の設定
    domManager.playButton.addEventListener('click', () => {
      sketchEditor.playMotion();
    });

    // グラフエディタの設定
    domManager.editMotionButton.addEventListener('click', () => {
      graphEditor.toggle();
      const target = sketchEditor.getLatestPath();
      if (target) graphEditor.setPath(target);
    });

    // グラフエディタの閉じるボタンの設定
    domManager.closeGraphEditorButton.addEventListener('click', () => {
      graphEditor.toggle();
    });

    // LLMプロバイダ選択の設定
    domManager.llmProviderSelect.value = config.llmProvider;
    domManager.llmProviderSelect.addEventListener('change', updateLLMProvider);

    // モデル選択を初期化
    populateModelOptions(config.llmProvider);
    domManager.llmModelSelect.addEventListener('change', updateLLMModel);

    // スケッチ表示切替の設定
    domManager.sketchCheckbox.checked = config.showSketch;
    domManager.sketchCheckbox.addEventListener('change', () => {
      config.showSketch = domManager.sketchCheckbox.checked;
    });

    // しきい値スライダーの設定
    domManager.thresholdSlider.value = Math.round(config.sketchFitTolerance).toString();
    domManager.thresholdSlider.addEventListener('input', updateThreshold);
    updateThreshold();

    // グラフ許容値スライダーの設定
    domManager.graphThresholdSlider.value = config.graphFitTolerance.toString();
    domManager.graphThresholdSlider.addEventListener('input', updateGraphThreshold);
    updateGraphThreshold();

    setupUserPromptInput();
  };

  // 誤差許容値の更新
  function updateThreshold(): void {
    const parsed = Number(domManager.thresholdSlider.value);
    if (!Number.isNaN(parsed)) {
      config.sketchFitTolerance = parsed;
    }

    // 小数部分を表示しない (整数px)
    domManager.thresholdLabel.textContent = `${parsed.toFixed(0)}px`;
  }

  // グラフ許容値の更新
  function updateGraphThreshold(): void {
    const parsed = Number(domManager.graphThresholdSlider.value);
    if (!Number.isNaN(parsed)) {
      config.graphFitTolerance = parsed;
    }

    // パーセント表示
    domManager.graphThresholdLabel.textContent = `${config.graphFitTolerance.toFixed(0)}%`;
  }

  // ユーザー指示入力欄のセットアップ
  function setupUserPromptInput(): void {
    domManager.userPromptForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const userPrompt = domManager.userPromptInput.value.trim();
      sketchEditor.generateSuggestion(userPrompt);
    });
  }

  // LLMモデル選択肢の更新
  function populateModelOptions(provider: import('./llmService').LLMProvider): void {
    const models = getModelsForProvider(provider);
    domManager.llmModelSelect.innerHTML = '';
    for (const mi of models) {
      const option = document.createElement('option');
      option.value = mi.id;
      option.textContent = mi.name ?? mi.id;
      domManager.llmModelSelect.appendChild(option);
    }

    const currentModelExists = models.some(mi => mi.id === config.llmModel);
    const defaultModel = currentModelExists ? config.llmModel : (models[0]?.id ?? '');
    config.llmModel = defaultModel;
    domManager.llmModelSelect.value = defaultModel;
  }

  function updateLLMModel(): void {
    config.llmModel = domManager.llmModelSelect.value;
  }

  // LLMプロバイダの更新
  function updateLLMProvider(): void {
    const selected = domManager.llmProviderSelect.value as import('./llmService').LLMProvider;
    config.llmProvider = selected;

    // LLMモデル選択肢の更新
    populateModelOptions(selected);
  }

  setupUI();
};

main();
