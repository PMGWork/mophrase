import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type p5 from 'p5';
import { DEFAULT_COLORS, DEFAULT_CONFIG } from '../config';
import type { Colors, Config } from '../config';
import type { PlaybackController } from '../components/Playback';
import type { SuggestionUIState } from '../suggestion/suggestion';
import type { Path, ToolKind } from '../types';
import { SketchEditor } from '../editor/sketchEditor/editor';

// 設定更新用のパラメータ
type SketchConfigUpdate = {
  llmProvider: Config['llmProvider'];
  llmModel: Config['llmModel'];
  fitTolerance: Config['fitTolerance'];
};

// エディタの結果
type UseSketchEditorResult = {
  // キャンバス状態
  canvasRef: RefObject<HTMLElement | null>;
  activePath: Path | null;
  playbackController: PlaybackController | null;

  // ツール
  selectedTool: ToolKind;
  setTool: (tool: ToolKind) => void;
  updateActivePath: (updater: (path: Path) => void) => void;

  // 提案機能
  suggestionUI: SuggestionUIState;
  updateSuggestionUI: () => void;
  submitPrompt: (prompt: string) => void;
  setSuggestionHover: (id: string | null, strength: number) => void;
  selectSuggestion: (id: string, strength: number) => void;
  getPreviewGraphCurves: (
    p: p5,
  ) => { curves: p5.Vector[][]; strength: number } | null;

  // 設定
  config: Config;
  colors: Colors;
  updateConfig: (next: SketchConfigUpdate) => void;
};

// 初期の提案UI状態
const initialSuggestionUI: SuggestionUIState = {
  status: 'idle',
  promptCount: 0,
  isVisible: false,
  suggestions: [],
  position: null,
};

// スケッチエディタを管理するカスタムフック
export const useSketchEditor = (): UseSketchEditorResult => {
  // リファレンス
  const canvasRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<SketchEditor | null>(null);
  const configRef = useRef<Config>({ ...DEFAULT_CONFIG });

  // 状態管理
  const [config, setConfig] = useState<Config>({ ...configRef.current });
  const [selectedTool, setSelectedTool] = useState<ToolKind>('pen');
  const [activePath, setActivePath] = useState<Path | null>(null);
  const [suggestionUI, setSuggestionUI] =
    useState<SuggestionUIState>(initialSuggestionUI);
  const [isReady, setIsReady] = useState(false);

  // 設定を更新
  const updateConfig = useCallback((next: SketchConfigUpdate) => {
    Object.assign(configRef.current, next);
    setConfig({ ...configRef.current });
    editorRef.current?.getSuggestionManager().updateConfig(configRef.current);
  }, []);

  // ツールを変更
  const handleToolChanged = useCallback((tool: ToolKind) => {
    setSelectedTool(tool);
  }, []);

  // スケッチエディタを初期化
  useEffect(() => {
    if (editorRef.current || !canvasRef.current) return;

    const editor = new SketchEditor(
      {
        canvasContainer: canvasRef.current,
        getCanvasSize: () => ({
          width: canvasRef.current?.clientWidth ?? 0,
          height: canvasRef.current?.clientHeight ?? 0,
        }),
      },
      configRef.current,
      DEFAULT_COLORS,
      // onPathCreated: 新規パス作成時
      (path) => {
        setActivePath(path);
        editorRef.current?.refreshPlaybackTimeline();
      },
      // onPathSelected: パス選択時
      (path) => {
        setActivePath(path);
        editorRef.current?.refreshPlaybackTimeline();
      },
      // onPathUpdated: パス更新時
      (path) => {
        setActivePath(path);
      },
      // onToolChanged: ツール変更時
      handleToolChanged,
      // onSuggestionUIChange: 提案UI状態変更時
      setSuggestionUI,
    );

    editorRef.current = editor;
    setSelectedTool(editor.getCurrentTool());
    setIsReady(true);
  }, [handleToolChanged]);

  // プレイバックコントローラー
  const playbackController = useMemo<PlaybackController>(
    () => ({
      getState: () => {
        const editor = editorRef.current;
        if (!editor) {
          return {
            hasPaths: false,
            isPlaying: false,
            elapsedMs: 0,
            totalMs: 0,
          };
        }
        const info = editor.getPlaybackInfo();
        return {
          hasPaths: editor.hasPaths(),
          isPlaying: info.isPlaying,
          elapsedMs: info.elapsedMs,
          totalMs: info.totalMs,
        };
      },
      togglePlayback: () => editorRef.current?.toggleMotion() ?? false,
      resetPlayback: () => editorRef.current?.resetPlayback(),
      goToLastFrame: () => editorRef.current?.goToLastFrame(),
      seekPlayback: (progress: number) =>
        editorRef.current?.seekPlayback(progress),
    }),
    [],
  );

  // ツールを変更
  const setTool = useCallback((tool: ToolKind) => {
    setSelectedTool(tool);
    editorRef.current?.setTool(tool);
  }, []);

  // 提案UIを更新
  const updateSuggestionUI = useCallback(() => {
    editorRef.current?.updateSuggestionUI();
  }, []);

  // 提案を生成
  const submitPrompt = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    editorRef.current?.generateSuggestion(trimmed);
  }, []);

  // 提案をホバー
  const setSuggestionHover = useCallback(
    (id: string | null, strength: number) => {
      editorRef.current?.getSuggestionManager().setHover(id, strength);
    },
    [],
  );

  // 提案を選択
  const selectSuggestion = useCallback((id: string, strength: number) => {
    editorRef.current?.getSuggestionManager().selectSuggestion(id, strength);
  }, []);

  // 現在編集しているパスを更新
  const updateActivePath = useCallback((updater: (path: Path) => void) => {
    editorRef.current?.updateActivePath(updater);
  }, []);

  // プレビュー用のグラフ曲線を取得
  const getPreviewGraphCurves = useCallback(
    (p: p5) =>
      editorRef.current?.getSuggestionManager().getPreviewGraphCurves(p) ??
      null,
    [],
  );

  return {
    // キャンバス状態
    canvasRef,
    activePath,
    playbackController: isReady ? playbackController : null,

    // ツール
    selectedTool,
    setTool,
    updateActivePath,

    // 提案機能
    suggestionUI,
    updateSuggestionUI,
    submitPrompt,
    setSuggestionHover,
    selectSuggestion,
    getPreviewGraphCurves,

    // 設定
    config,
    colors: DEFAULT_COLORS,
    updateConfig,
  };
};
