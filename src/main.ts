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
  const playbackPlayButton = document.getElementById(
    'playbackPlayButton',
  ) as HTMLButtonElement | null;
  const playbackPlayhead = document.getElementById(
    'playbackPlayhead',
  ) as HTMLDivElement | null;
  const playbackTrack = document.getElementById(
    'playbackTrack',
  ) as HTMLDivElement | null;

  const playbackTimeCurrent = document.getElementById('playbackTimeCurrent');
  const playbackTimeTotal = document.getElementById('playbackTimeTotal');

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
      updatePlaybackAvailability();
      sketchEditor.refreshPlaybackTimeline();
    },
    (path) => {
      // パス選択時（作成時も呼ばれる）
      graphEditor.setPath(path);
      propertyEditor.setPath(path);
      updatePlaybackAvailability();
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
    // ボタンのイベントを登録
    if (playbackPlayButton) {
      playbackPlayButton.addEventListener('click', () => {
        togglePlayback();
      });
    }

    if (playbackTrack) {
      let seekingPointerId: number | null = null;

      const updateByClientX = (clientX: number): void => {
        if (!playbackTrack || !sketchEditor.hasPaths()) return;
        const rect = playbackTrack.getBoundingClientRect();
        if (rect.width <= 0) return;
        const progress = (clientX - rect.left) / rect.width;
        sketchEditor.seekPlayback(progress);
      };

      playbackTrack.addEventListener('pointerdown', (event) => {
        if (!sketchEditor.hasPaths()) return;
        seekingPointerId = event.pointerId;
        playbackTrack.setPointerCapture(event.pointerId);
        updateByClientX(event.clientX);
      });

      playbackTrack.addEventListener('pointermove', (event) => {
        if (seekingPointerId !== event.pointerId) return;
        updateByClientX(event.clientX);
      });

      const endSeek = (event: PointerEvent): void => {
        if (seekingPointerId !== event.pointerId) return;
        if (playbackTrack.hasPointerCapture(event.pointerId)) {
          playbackTrack.releasePointerCapture(event.pointerId);
        }
        seekingPointerId = null;
      };

      playbackTrack.addEventListener('pointerup', endSeek);
      playbackTrack.addEventListener('pointercancel', endSeek);
    }

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

  function updatePlaybackButtonUI(isPlaying: boolean): void {
    if (!playbackPlayButton) return;

    const existingIcon = playbackPlayButton.querySelector('svg, i');
    if (existingIcon) existingIcon.remove();

    const newIcon = document.createElement('i');
    newIcon.className = 'h-3.5 w-3.5';
    newIcon.setAttribute('data-lucide', isPlaying ? 'square' : 'play');
    playbackPlayButton.insertBefore(newIcon, playbackPlayButton.firstChild);

    playbackPlayButton.title = isPlaying ? 'Stop' : 'Play';

    createIcons({ icons });
  }

  function updatePlaybackAvailability(): void {
    if (!playbackPlayButton) return;
    const hasPaths = sketchEditor.hasPaths();
    playbackPlayButton.disabled = !hasPaths;
    playbackPlayButton.classList.toggle('opacity-40', !hasPaths);
    playbackPlayButton.classList.toggle('cursor-not-allowed', !hasPaths);
    playbackPlayButton.classList.toggle('hover:bg-gray-700', hasPaths);
    playbackPlayButton.classList.toggle('hover:text-gray-50', hasPaths);
    if (hasPaths) {
      playbackPlayButton.title = sketchEditor.getPlaybackInfo().isPlaying
        ? 'Stop'
        : 'Play';
    } else {
      playbackPlayButton.title = 'No objects to play';
    }

    if (playbackTrack) {
      playbackTrack.classList.toggle('cursor-pointer', hasPaths);
      playbackTrack.classList.toggle('cursor-not-allowed', !hasPaths);
    }
  }

  function formatPlaybackTime(ms: number): string {
    const clampedMs = Math.max(0, ms);
    const totalSeconds = Math.floor(clampedMs / 1000 + 1e-6);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  function startPlaybackUISync(): void {
    if (!playbackPlayhead) return;

    const playhead = playbackPlayhead;
    const timeCurrent = playbackTimeCurrent;
    const timeTotal = playbackTimeTotal;

    const update = (): void => {
      const { elapsedMs, totalMs } = sketchEditor.getPlaybackInfo();
      const safeTotal = Math.max(1, totalMs);
      const progress = Math.min(1, Math.max(0, elapsedMs / safeTotal));
      const left = `${progress * 100}%`;

      playhead.style.left = left;

      const currentLabel = formatPlaybackTime(elapsedMs);
      const totalLabel = formatPlaybackTime(totalMs);
      if (timeCurrent && timeCurrent.textContent !== currentLabel) {
        timeCurrent.textContent = currentLabel;
      }
      if (timeTotal && timeTotal.textContent !== totalLabel) {
        timeTotal.textContent = totalLabel;
      }

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  function togglePlayback(): void {
    if (!sketchEditor.hasPaths()) return;
    const isPlaying = sketchEditor.toggleMotion();
    updatePlaybackButtonUI(isPlaying);
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
  startPlaybackUISync();
  updatePlaybackAvailability();

  // 初期状態のUI更新
  updateSidebarButtonUI();

  createIcons({ icons });
};

main();
