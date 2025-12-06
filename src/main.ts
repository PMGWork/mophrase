import '../style.css';
import { createIcons, icons } from 'lucide';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { DomRefs } from './dom';
import { GraphEditor } from './editor/graphEditor';
import { PropertyEditor } from './editor/propertyEditor';
import { SketchEditor } from './editor/sketchEditor';
import { getProviderModelOptions } from './services/llm';
import type { LLMProvider, SketchMode } from './types';

// メイン処理
const main = (): void => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // DOMマネージャー
  const dom = new DomRefs();

  // エディタ
  const graphEditor = new GraphEditor(dom, config, colors);
  const propertyEditor = new PropertyEditor(dom, config);
  const sketchEditor = new SketchEditor(
    dom,
    config,
    colors,
    (path) => {
      // パス作成時
      graphEditor.setPath(path);
    },
    (path) => {
      // パス選択時（作成時も呼ばれる）
      graphEditor.setPath(path);
      propertyEditor.setPath(path);
    },
  );

  // #region セットアップ
  // UIのセットアップ
  const setupUI = (): void => {
    // ボタンのイベントを登録
    bindButton(dom.clearButton, () => sketchEditor.clearAll());
    bindButton(dom.playButton, () => sketchEditor.playMotion());
    bindButton(dom.closeGraphEditorButton, () => graphEditor.toggle());
    bindButton(dom.editMotionButton, () => {
      graphEditor.toggle();
      const target = sketchEditor.getLatestPath();
      if (target) {
        graphEditor.setPath(target);
        propertyEditor.setPath(target);
      }
    });

    // トグルのイベントを登録
    setupModeToggle();

    // チェックボックスのイベントを登録
    bindCheckbox(dom.sketchCheckbox, config.showSketch, (value) => {
      config.showSketch = value;
    });

    // スライダーのイベントを登録
    bindSlider(
      dom.thresholdSlider,
      dom.thresholdLabel,
      config.sketchFitTolerance,
      (value) => {
        config.sketchFitTolerance = value;
      },
      (value) => `${value.toFixed(0)}px`,
    );

    // LLMモデルの選択肢を更新
    populateModelOptions();
    dom.llmModelSelect.addEventListener('change', updateLLMModel);

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
      { mode: 'draw', button: dom.drawModeButton },
      { mode: 'select', button: dom.selectModeButton },
    ];

    const updateMode = (targetMode: SketchMode) => {
      sketchEditor.setSketchMode(targetMode);
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
    dom.llmModelSelect.innerHTML = '';

    for (const optionInfo of options) {
      const option = document.createElement('option');
      option.value = JSON.stringify({
        provider: optionInfo.provider,
        modelId: optionInfo.modelId,
      });
      const displayName = optionInfo.name || optionInfo.modelId;
      option.textContent = `${displayName} (${optionInfo.provider})`;
      dom.llmModelSelect.appendChild(option);
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
      dom.llmModelSelect.value = value;
      applyModelSelection(value);
    }
  }

  // LLMモデルの更新
  function updateLLMModel(): void {
    applyModelSelection(dom.llmModelSelect.value);
  }

  // モデル選択の適用
  function applyModelSelection(value: string): void {
    try {
      const parsed = JSON.parse(value) as {
        provider: LLMProvider;
        modelId: string;
      };
      config.llmProvider = parsed.provider;
      config.llmModel = parsed.modelId;
    } catch (error) {
      console.error('モデル選択の適用に失敗しました', error);
    }
  }

  // ユーザー指示入力欄のセットアップ
  function setupUserPromptInput(): void {
    dom.sketchPromptForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const userPrompt = dom.sketchPromptInput.value.trim();
      if (!userPrompt) return;
      sketchEditor.generateSuggestion(userPrompt);
      dom.sketchPromptInput.value = '';
    });
  }

  setupUI();

  createIcons({ icons });
};

main();
