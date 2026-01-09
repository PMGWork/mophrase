import '../style.css';
import { createIcons, icons } from 'lucide';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { DomRefs } from './dom';
import { GraphEditor } from './editor/graphEditor';
import { PropertyEditor } from './editor/propertyEditor';
import { SettingsPanel } from './editor/settingsPanel';
import { SketchEditor } from './editor/sketchEditor/editor';
import type { PlaybackController } from './types/playback';

// メイン処理
export type BootstrapResult = {
  playbackController: PlaybackController;
};

type BootstrapRefs = {
  canvasContainer?: HTMLElement | null;
  graphEditorCanvas?: HTMLDivElement | null;
};

export const bootstrap = (refs: BootstrapRefs = {}): BootstrapResult => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // DOMマネージャー
  const dom = new DomRefs({
    canvasContainer: refs.canvasContainer ?? undefined,
    graphEditorCanvas: refs.graphEditorCanvas ?? undefined,
  });

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
      sketchEditor.refreshPlaybackTimeline();
    },
    (path) => {
      // パス選択時（作成時も呼ばれる）
      graphEditor.setPath(path);
      propertyEditor.setPath(path);
      sketchEditor.refreshPlaybackTimeline();
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

    // OS判定してDeleteキーのヒントを更新
    const userAgentData = (
      navigator as Navigator & { userAgentData?: { platform: string } }
    ).userAgentData;
    const platform = userAgentData?.platform || navigator.userAgent;
    const isMac = /Mac|iPod|iPhone|iPad/i.test(platform);

    const deleteKeyLabel = document.getElementById('hint-delete-key');
    if (deleteKeyLabel) {
      deleteKeyLabel.textContent = isMac ? 'Opt+X' : 'Alt+X';
    }
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

  return {
    playbackController: {
      getState: () => {
        const info = sketchEditor.getPlaybackInfo();
        return {
          hasPaths: sketchEditor.hasPaths(),
          isPlaying: info.isPlaying,
          elapsedMs: info.elapsedMs,
          totalMs: info.totalMs,
        };
      },
      togglePlayback: () => sketchEditor.toggleMotion(),
      resetPlayback: () => sketchEditor.resetPlayback(),
      goToLastFrame: () => sketchEditor.goToLastFrame(),
      seekPlayback: (progress: number) => sketchEditor.seekPlayback(progress),
    },
  };
};
