import '../style.css';
import { createIcons, icons } from 'lucide';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { DomRefs } from './dom';
import { GraphEditor } from './editor/graphEditor';
import { PropertyEditor } from './editor/propertyEditor';
import { SettingsPanel } from './editor/settingsPanel';
import { SketchEditor } from './editor/sketchEditor/editor';

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
  const propertyEditor = new PropertyEditor(dom);
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
    dom.clearButton.addEventListener('click', () => sketchEditor.clearAll());
    dom.playButton.addEventListener('click', () => sketchEditor.playMotion());
    dom.closeGraphEditorButton.addEventListener('click', () => {
      graphEditor.toggle();
      updateGraphButtonUI();
    });
    dom.editMotionButton.addEventListener('click', () => {
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

  // Graph ボタンのUI更新
  function updateGraphButtonUI(): void {
    const isVisible = !dom.graphEditorContainer.classList.contains('hidden');
    const el = dom.editMotionButton;

    // アクティブ時のクラス
    el.classList.toggle('bg-gray-50', isVisible);
    el.classList.toggle('text-gray-950', isVisible);
    el.classList.toggle('hover:bg-gray-200', isVisible);
    // 非アクティブ時のクラス
    el.classList.toggle('bg-gray-800', !isVisible);
    el.classList.toggle('text-gray-50', !isVisible);
    el.classList.toggle('hover:bg-gray-700', !isVisible);
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
