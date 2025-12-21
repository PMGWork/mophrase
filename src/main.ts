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
  const propertyEditor = new PropertyEditor(dom, {
    onModifierChange: () => sketchEditor.updateSuggestionUI(),
  });

  // GraphEditor と SketchSuggestionManager を連携
  graphEditor.setPreviewProvider((p) =>
    sketchEditor.getSuggestionManager().getPreviewGraphCurves(p),
  );

  // #region セットアップ
  // UIのセットアップ
  const setupUI = (): void => {
    // ボタンのイベントを登録
    dom.playButton.addEventListener('click', () => {
      togglePlayback();
    });

    // スペースキーで再生/停止をトグル
    window.addEventListener('keydown', (e) => {
      // 入力欄にフォーカス中は無視
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      }
    });

    // サイドバー開閉ボタン
    dom.editMotionButton.addEventListener('click', () => {
      toggleSidebar();
      const target = sketchEditor.getLatestPath();
      if (target) {
        graphEditor.setPath(target);
        propertyEditor.setPath(target);
      }
    });

    // プロンプト入力欄のセットアップ
    setupUserPromptInput();
  };

  // サイドバーの開閉
  function toggleSidebar(): void {
    dom.sidebarContainer.classList.toggle('hidden');
    window.dispatchEvent(new Event('resize'));
    updateSidebarButtonUI();
  }

  // サイドバーボタンのUI更新
  function updateSidebarButtonUI(): void {
    const isVisible = !dom.sidebarContainer.classList.contains('hidden');
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

  // Playボタンの表示更新
  function updatePlayButtonUI(isPlaying: boolean): void {
    const text = dom.playButton.querySelector('span');

    // 既存のアイコンを削除
    const existingIcon = dom.playButton.querySelector('svg, i');
    if (existingIcon) existingIcon.remove();

    // 新しいi要素を作成
    const newIcon = document.createElement('i');
    newIcon.className = 'h-4 w-4';

    if (isPlaying) {
      // 再生中: Stopボタンに
      newIcon.setAttribute('data-lucide', 'square');
      if (text) text.textContent = 'Stop';
      dom.playButton.classList.remove('bg-blue-900/50', 'hover:bg-blue-900');
      dom.playButton.classList.add('bg-red-900/50', 'hover:bg-red-900');
    } else {
      // 停止中: Playボタンに
      newIcon.setAttribute('data-lucide', 'play');
      if (text) text.textContent = 'Play';
      dom.playButton.classList.remove('bg-red-900/50', 'hover:bg-red-900');
      dom.playButton.classList.add('bg-blue-900/50', 'hover:bg-blue-900');
    }

    // i要素をボタンの先頭に挿入
    dom.playButton.insertBefore(newIcon, dom.playButton.firstChild);

    // アイコンを再描画
    createIcons({ icons });
  }

  function togglePlayback(): void {
    const isPlaying = sketchEditor.toggleMotion();
    updatePlayButtonUI(isPlaying);
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

  // 初期状態のUI更新
  updateSidebarButtonUI();

  createIcons({ icons });
};

main();
