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
    // ボタンのイベントを登録
    bindButton(domManager.clearButton, () => sketchEditor.clearAll());
    bindButton(domManager.playButton, () => sketchEditor.playMotion());
    bindButton(domManager.closeGraphEditorButton, () => graphEditor.toggle());
    bindButton(domManager.editMotionButton, () => {
      graphEditor.toggle();
      const target = sketchEditor.getLatestPath();
      if (target) graphEditor.setPath(target);
    });

    // チェックボックスのイベントを登録
    bindCheckbox(domManager.sketchCheckbox, config.showSketch, (value) => {
      config.showSketch = value;
    });

    // スライダーのイベントを登録
    bindSlider(
      domManager.thresholdSlider,
      domManager.thresholdLabel,
      config.sketchFitTolerance,
      (value) => {
        config.sketchFitTolerance = value;
      },
      (value) => `${value.toFixed(0)}px`
    );

    bindSlider(
      domManager.graphThresholdSlider,
      domManager.graphThresholdLabel,
      config.graphFitTolerance,
      (value) => {
        config.graphFitTolerance = value;
      },
      (value) => `${value.toFixed(0)}%`
    );

    // LLMプロバイダの選択肢を更新
    domManager.llmProviderSelect.value = config.llmProvider;
    domManager.llmProviderSelect.addEventListener('change', updateLLMProvider);

    // LLMモデルの選択肢を更新
    populateModelOptions(config.llmProvider);
    domManager.llmModelSelect.addEventListener('change', updateLLMModel);

    // プロンプト入力欄のセットアップ
    setupUserPromptInput();
  };

  // ボタンイベント
  function bindButton(el: HTMLButtonElement, handler: () => void): void {
    el.addEventListener('click', handler);
  }

  // チェックボックスイベント
  function bindCheckbox(el: HTMLInputElement, initial: boolean, onChange: (value: boolean) => void): void {
    el.checked = initial;
    el.addEventListener('change', () => onChange(el.checked));
  }

  // スライダーイベント
  function bindSlider(
    el: HTMLInputElement,
    label: HTMLElement,
    initial: number,
    onChange: (value: number) => void,
    format: (value: number) => string
  ): void {
    const sync = (): void => {
      const parsed = Number(el.value);
      if (!Number.isNaN(parsed)) onChange(parsed);
      label.textContent = format(parsed);
    };

    el.value = Math.round(initial).toString();
    sync();
    el.addEventListener('input', sync);
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

  // LLMモデルの更新
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

  // ユーザー指示入力欄のセットアップ
  function setupUserPromptInput(): void {
    domManager.userPromptForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const userPrompt = domManager.userPromptInput.value.trim();
      sketchEditor.generateSuggestion(userPrompt);
    });
  }

  setupUI();
};

main();
