import '../style.css';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { DomRefs } from './dom';
import { GraphEditor } from './editor/graphEditor';
import { SketchEditor } from './editor/sketchEditor/editor';
import type { Config } from './config';
import type { Path, ToolKind } from './types';
import type { PlaybackController } from './components/PlaybackBar';

// メイン処理
export type BootstrapResult = {
  playbackController: PlaybackController;
  config: Config;
  updateSuggestionUI: () => void;
  submitPrompt: (prompt: string) => void;
  selectLatestPath: () => Path | null;
  setSketchTool: (tool: ToolKind) => void;
  getSketchTool: () => ToolKind;
};

type BootstrapRefs = {
  canvasContainer?: HTMLElement | null;
  graphEditorCanvas?: HTMLDivElement | null;
};

type BootstrapCallbacks = {
  onPathSelected?: (path: Path | null) => void;
  onToolChanged?: (tool: ToolKind) => void;
};

export const bootstrap = (
  refs: BootstrapRefs = {},
  callbacks: BootstrapCallbacks = {},
): BootstrapResult => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  // DOMマネージャー
  const dom = new DomRefs({
    canvasContainer: refs.canvasContainer ?? undefined,
    graphEditorCanvas: refs.graphEditorCanvas ?? undefined,
  });

  // エディタ
  const graphEditor = new GraphEditor(dom, config, colors);
  const sketchEditor = new SketchEditor(
    dom,
    config,
    colors,
    (path) => {
      // パス作成時
      graphEditor.setPath(path);
      callbacks.onPathSelected?.(path);
      sketchEditor.refreshPlaybackTimeline();
    },
    (path) => {
      // パス選択時（作成時も呼ばれる）
      graphEditor.setPath(path);
      callbacks.onPathSelected?.(path);
      sketchEditor.refreshPlaybackTimeline();
    },
    (tool) => {
      callbacks.onToolChanged?.(tool);
    },
  );

  // GraphEditor と SketchSuggestionManager を連携
  graphEditor.setPreviewProvider((p) =>
    sketchEditor.getSuggestionManager().getPreviewGraphCurves(p),
  );

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
    config,
    updateSuggestionUI: () => sketchEditor.updateSuggestionUI(),
    submitPrompt: (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      sketchEditor.generateSuggestion(trimmed);
    },
    selectLatestPath: () => {
      const target = sketchEditor.getLatestPath();
      if (!target) return null;
      graphEditor.setPath(target);
      callbacks.onPathSelected?.(target);
      return target;
    },
    setSketchTool: (tool) => {
      sketchEditor.setTool(tool);
    },
    getSketchTool: () => sketchEditor.getCurrentTool(),
  };
};
