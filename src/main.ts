import '../style.css';
import { DEFAULT_CONFIG, DEFAULT_COLORS } from './config';
import { getModelsForProvider } from './llmService';
import { DOMManager } from './dom';
import { GraphEditor } from './graphEditor';
import { SketchEditor } from './sketchEditor';

// メイン処理
const main = (): void => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // DOMマネージャー
  const dom = new DOMManager();

  // エディタ
  const graphEditor = new GraphEditor(dom, config, colors);
  const sketchEditor = new SketchEditor(dom, config, colors, (path) => {
    graphEditor.setPath(path);
  });

  // #region セットアップ
  // UIのセットアップ
  const setupUI = (): void => {
    // クリアボタンの設定
    dom.clearButton.addEventListener('click', () => {
      sketchEditor.clearAll()
    });

    // モーション操作の設定
    dom.playButton.addEventListener('click', () => {
      sketchEditor.playMotion();
    });

    // グラフエディタの設定
    dom.editMotionButton.addEventListener('click', () => {
      graphEditor.toggle();
      const target = sketchEditor.getLatestPath();
      if (target) graphEditor.setPath(target);
    });

    // グラフエディタの閉じるボタンの設定
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
    dom.sketchCheckbox.checked = config.showSketch;
    dom.sketchCheckbox.addEventListener('change', () => {
      config.showSketch = dom.sketchCheckbox.checked;
    });

    // しきい値スライダーの設定
    dom.thresholdSlider.value = Math.round(config.sketchFitTolerance).toString();
    dom.thresholdSlider.addEventListener('input', updateThreshold);
    updateThreshold();

    // グラフ許容値スライダーの設定
    dom.graphThresholdSlider.value = config.graphFitTolerance.toString();
    dom.graphThresholdSlider.addEventListener('input', updateGraphThreshold);
    updateGraphThreshold();

    setupUserPromptInput();
  };

  // 誤差許容値の更新
  function updateThreshold(): void {
    const parsed = Number(dom.thresholdSlider.value);
    if (!Number.isNaN(parsed)) {
      config.sketchFitTolerance = parsed;
    }

    // 小数部分を表示しない (整数px)
    dom.thresholdLabel.textContent = `${parsed.toFixed(0)}px`;
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
      sketchEditor.generateSuggestion(userPrompt);
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
  }

  function updateLLMModel(): void {
    config.llmModel = dom.llmModelSelect.value;
  }

  // LLMプロバイダの更新
  function updateLLMProvider(): void {
    const selected = dom.llmProviderSelect.value as import('./llmService').LLMProvider;
    config.llmProvider = selected;

    // LLMモデル選択肢の更新
    populateModelOptions(selected);
  }

  setupUI();
};

main();
