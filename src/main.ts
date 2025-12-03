import '../style.css';
import { createIcons, icons } from 'lucide';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { DOMManager } from './domManager';
import { GraphEditor } from './graphEditor';
import { getProviderModelOptions } from './llmService';
import { SketchEditor } from './sketchEditor';
import type { SketchMode } from './types';

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

    // トグルのイベントを登録
    setupModeToggle();

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
      (value) => `${value.toFixed(0)}px`,
    );

    bindSlider(
      domManager.graphThresholdSlider,
      domManager.graphThresholdLabel,
      config.graphFitTolerance,
      (value) => {
        config.graphFitTolerance = value;
      },
      (value) => `${value.toFixed(0)}%`,
    );

    // LLMモデルの選択肢を更新
    populateModelOptions();
    domManager.llmModelSelect.addEventListener('change', updateLLMModel);

    // プロンプト入力欄のセットアップ
    setupUserPromptInput();
  };

  // ボタンイベント
  function bindButton(el: HTMLButtonElement, handler: () => void): void {
    el.addEventListener('click', handler);
  }

  // モード切り替えのセットアップ
  function setupModeToggle(): void {
    const modes: { mode: SketchMode; button: HTMLButtonElement }[] = [
      { mode: 'draw', button: domManager.drawModeButton },
      { mode: 'select', button: domManager.selectModeButton },
    ];

    const updateMode = (targetMode: SketchMode) => {
      sketchEditor.setMode(targetMode);
      modes.forEach(({ mode, button }) => {
        button.setAttribute('aria-pressed', String(mode === targetMode));
      });
    };

    modes.forEach(({ mode, button }) => {
      button.addEventListener('click', () => updateMode(mode));
    });

    updateMode('draw');
  }

  // チェックボックスイベント
  function bindCheckbox(
    el: HTMLInputElement,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): void {
    el.checked = initial;
    el.addEventListener('change', () => onChange(el.checked));
  }

  // スライダーイベント
  function bindSlider(
    el: HTMLInputElement,
    label: HTMLElement,
    initial: number,
    onChange: (value: number) => void,
    format: (value: number) => string,
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
  function populateModelOptions(): void {
    const options = getProviderModelOptions();
    domManager.llmModelSelect.innerHTML = '';

    for (const optionInfo of options) {
      const option = document.createElement('option');
      option.value = JSON.stringify({
        provider: optionInfo.provider,
        modelId: optionInfo.modelId,
      });
      const displayName = optionInfo.name || optionInfo.modelId;
      option.textContent = `${displayName} (${optionInfo.provider})`;
      domManager.llmModelSelect.appendChild(option);
    }

    const current =
      options.find(
        (entry) =>
          entry.provider === config.llmProvider &&
          entry.modelId === config.llmModel,
      ) ?? options[0];

    if (current) {
      const value = JSON.stringify({
        provider: current.provider,
        modelId: current.modelId,
      });
      domManager.llmModelSelect.value = value;
      applyModelSelection(value);
    }
  }

  // LLMモデルの更新
  function updateLLMModel(): void {
    applyModelSelection(domManager.llmModelSelect.value);
  }

  // モデル選択の適用
  function applyModelSelection(value: string): void {
    try {
      const parsed = JSON.parse(value) as {
        provider: import('./llmService').LLMProvider;
        modelId: string;
      };
      config.llmProvider = parsed.provider;
      config.llmModel = parsed.modelId;
    } catch (error) {
      console.error('Failed to parse model selection', error);
    }
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

  createIcons({ icons });
};

main();
