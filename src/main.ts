import '../style.css';
import { createIcons, icons } from 'lucide';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { DomRefs } from './dom';
import { GraphEditor } from './editor/graphEditor';
import { PropertyEditor } from './editor/propertyEditor';
import { SettingsPanel } from './editor/settingsPanel';
import { SketchEditor } from './editor/sketchEditor';

// メイン処理
const main = (): void => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // DOMマネージャー
  const dom = new DomRefs();

  // 設定パネル
  new SettingsPanel(dom, config);

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
    bindButton(dom.closeGraphEditorButton, () => {
      graphEditor.toggle();
      updateGraphButtonUI();
    });
    bindButton(dom.editMotionButton, () => {
      graphEditor.toggle();
      updateGraphButtonUI();
      const target = sketchEditor.getLatestPath();
      if (target) {
        graphEditor.setPath(target);
        propertyEditor.setPath(target);
      }
    });

    // プロンプト入力欄のセットアップ
    setupUserPromptInput();
  };

  // ボタンイベント
  function bindButton(el: HTMLButtonElement, handler: () => void): void {
    el.addEventListener('click', handler);
  }

  // Graph ボタンのUI更新
  function updateGraphButtonUI(): void {
    const isVisible = !dom.graphEditorContainer.classList.contains('hidden');
    const activeClass = ['bg-gray-50', 'text-gray-950', 'hover:bg-gray-200'];
    const inactiveClass = ['bg-gray-800', 'text-gray-50', 'hover:bg-gray-700'];

    if (isVisible) {
      dom.editMotionButton.classList.remove(...inactiveClass);
      dom.editMotionButton.classList.add(...activeClass);
    } else {
      dom.editMotionButton.classList.remove(...activeClass);
      dom.editMotionButton.classList.add(...inactiveClass);
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

