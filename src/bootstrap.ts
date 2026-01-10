import '../style.css';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from './config';
import { GraphEditor } from './editor/graphEditor/editor';
import { SketchEditor } from './editor/sketchEditor/editor';
import type { Config } from './config';
import type { Path, ToolKind } from './types';
import type { PlaybackController } from './components/Playback';
import type { SuggestionUIState } from './suggestion/suggestion';

// メイン処理
export type BootstrapResult = {
  playbackController: PlaybackController;
  config: Config;
  updateSuggestionUI: () => void;
  submitPrompt: (prompt: string) => void;
  selectLatestPath: () => Path | null;
  setSketchTool: (tool: ToolKind) => void;
  getSketchTool: () => ToolKind;
  setSuggestionHover: (id: string | null, strength: number) => void;
  selectSuggestion: (id: string, strength: number) => void;
};

// 引数
type BootstrapRefs = {
  canvasContainer?: HTMLElement | null;
  graphEditorCanvas?: HTMLDivElement | null;
};

// コールバック
type BootstrapCallbacks = {
  onPathSelected?: (path: Path | null) => void;
  onToolChanged?: (tool: ToolKind) => void;
  onSuggestionUIChange?: (state: SuggestionUIState) => void;
};

// 初期化処理
export const bootstrap = (
  refs: BootstrapRefs = {},
  callbacks: BootstrapCallbacks = {},
): BootstrapResult => {
  // 設定
  const config = { ...DEFAULT_CONFIG };
  const colors = { ...DEFAULT_COLORS };

  const getRequiredElement = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`ID '${id}' のDOM要素が見つかりませんでした。`);
    return element as T;
  };

  const canvasContainer =
    refs.canvasContainer ?? getRequiredElement<HTMLElement>('canvasContainer');
  const graphEditorCanvas =
    refs.graphEditorCanvas ??
    getRequiredElement<HTMLDivElement>('graphEditorCanvas');
  const sidebarContainer =
    getRequiredElement<HTMLDivElement>('sidebarContainer');

  // エディタ
  const graphEditor = new GraphEditor(
    {
      sidebarContainer,
      graphEditorCanvas,
      getGraphCanvasSize: () => ({
        width: graphEditorCanvas.clientWidth,
        height: graphEditorCanvas.clientHeight,
      }),
    },
    config,
    colors,
  );
  const sketchEditor = new SketchEditor(
    {
      canvasContainer,
      getCanvasSize: () => ({
        width: canvasContainer.clientWidth,
        height: canvasContainer.clientHeight,
      }),
    },
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
    (state) => {
      callbacks.onSuggestionUIChange?.(state);
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
    setSuggestionHover: (id, strength) => {
      sketchEditor.getSuggestionManager().setHover(id, strength);
    },
    selectSuggestion: (id, strength) => {
      sketchEditor.getSuggestionManager().selectSuggestion(id, strength);
    },
  };
};
