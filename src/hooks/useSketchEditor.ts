/**
 * スケッチエディタ用のカスタムフック。
 * エディタの初期化、状態管理、プロジェクトの保存・読み込みを担当する。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type p5 from 'p5';
import { DEFAULT_COLORS } from '../config';
import { OBJECT_COLORS } from '../constants';
import {
  resolveCssColorList,
  resolveCssColors,
} from '../utils/resolveCssColor';
import type { Colors, Config } from '../config';
import type { PlaybackController } from '../components/Playback';
import type { SuggestionUIState } from '../suggestion/suggestion';
import type { Path, ProjectSettings, ToolKind } from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../types';
import { SketchEditor } from '../editor/sketchEditor/editor';
import { loadConfig, saveConfig } from '../services/configStorage';
import {
  serializeProject,
  deserializeProject,
} from '../utils/serialization/project';

// 設定更新用のパラメータ
type SketchConfigUpdate = {
  llmProvider: Config['llmProvider'];
  llmModel: Config['llmModel'];
  fitTolerance: Config['fitTolerance'];
  testMode: Config['testMode'];
};

// プロジェクトファイルハンドルの型
type ProjectFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

// 拡張されたウィンドウオブジェクトの型
type WindowWithFilePicker = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<ProjectFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<ProjectFileHandle>;
};

const stripJsonExtension = (filename: string): string =>
  filename.replace(/\.json$/i, '');

const PROJECT_FILE_PICKER_TYPES = [
  {
    description: 'JSON Project',
    accept: { 'application/json': ['.json'] },
  },
];

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

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
  hasUnsavedChanges: boolean;

  // プロジェクト
  projectName: string | null;
  projectSettings: ProjectSettings;
  updateProjectSettings: (next: ProjectSettings) => void;
  saveProject: () => void;
  loadProject: () => void;
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

  // 状態管理
  const [config, setConfig] = useState<Config>(loadConfig);
  const [selectedTool, setSelectedTool] = useState<ToolKind>('pen');
  const [activePath, setActivePath] = useState<Path | null>(null);
  const [suggestionUI, setSuggestionUI] =
    useState<SuggestionUIState>(initialSuggestionUI);
  const [isReady, setIsReady] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(
    () => ({ ...DEFAULT_PROJECT_SETTINGS }),
  );

  // リファレンス（プロジェクト保存用）
  const projectFileHandleRef = useRef<ProjectFileHandle | null>(null);
  const cleanProjectJsonRef = useRef<string | null>(null);

  // 解決済みの色設定
  const resolvedColors = useMemo(() => resolveCssColors(DEFAULT_COLORS), []);
  const resolvedObjectColors = useMemo(
    () => resolveCssColorList(OBJECT_COLORS),
    [],
  );

  // プロジェクトJSONを構築
  const buildProjectJson = useCallback(
    (editor = editorRef.current): string | null => {
      if (!editor) return null;

      const paths = editor.getPaths();
      const settings = editor.getProjectSettings();
      const projectData = serializeProject(paths, settings);
      return JSON.stringify(projectData, null, 2);
    },
    [],
  );

  // 現在のプロジェクト状態をクリーンとしてマーク
  const markCurrentProjectAsClean = useCallback(
    (editor = editorRef.current): void => {
      const currentJson = buildProjectJson(editor);
      if (!currentJson) return;
      cleanProjectJsonRef.current = currentJson;
      setHasUnsavedChanges(false);
    },
    [buildProjectJson],
  );

  // プロジェクトのダーティ状態を更新
  const refreshProjectDirtyState = useCallback(
    (editor = editorRef.current): void => {
      const currentJson = buildProjectJson(editor);
      if (!currentJson) return;
      const cleanJson = cleanProjectJsonRef.current;
      setHasUnsavedChanges(cleanJson !== null && currentJson !== cleanJson);
    },
    [buildProjectJson],
  );

  // プロジェクトJSONを書き込み
  const writeProjectJson = useCallback(
    async (fileHandle: ProjectFileHandle, json: string): Promise<void> => {
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      projectFileHandleRef.current = fileHandle;
      setProjectName(stripJsonExtension(fileHandle.name));
      cleanProjectJsonRef.current = json;
      setHasUnsavedChanges(false);
    },
    [],
  );

  // 初期化
  useEffect(() => {
    if (editorRef.current || !canvasRef.current) return;

    const syncPathState = (
      path: Path | null,
      shouldRefreshPlayback: boolean,
    ): void => {
      setActivePath(path);
      if (shouldRefreshPlayback) {
        editorRef.current?.refreshPlaybackTimeline();
      }
      refreshProjectDirtyState(editorRef.current);
    };

    const editor = new SketchEditor(
      {
        canvasContainer: canvasRef.current,
        getCanvasSize: () => ({
          width: canvasRef.current?.clientWidth ?? 0,
          height: canvasRef.current?.clientHeight ?? 0,
        }),
      },
      config,
      resolvedColors,
      resolvedObjectColors,
      // onPathCreated
      (path) => syncPathState(path, true),
      // onPathSelected
      (path) => syncPathState(path, true),
      // onPathUpdated
      (path) => syncPathState(path, false),
      // onToolChanged: ツール変更時
      (tool) => {
        setSelectedTool(tool);
      },
      // onSuggestionUIChange: 提案UI状態変更時
      setSuggestionUI,
    );

    editorRef.current = editor;
    setSelectedTool(editor.getCurrentTool());
    markCurrentProjectAsClean(editor);
    setIsReady(true);
  }, [
    config,
    markCurrentProjectAsClean,
    refreshProjectDirtyState,
    resolvedColors,
    resolvedObjectColors,
  ]);

  // コンテナのリサイズを監視
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      editorRef.current?.resize();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // ツールを設定
  const setTool = useCallback((tool: ToolKind) => {
    const editor = editorRef.current;
    if (!editor) {
      setSelectedTool(tool);
      return;
    }
    editor.setTool(tool);
  }, []);

  // 現在のパスを更新
  const updateActivePath = useCallback((updater: (path: Path) => void) => {
    editorRef.current?.updateActivePath(updater);
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

  // 提案の影響度を設定
  const setSuggestionHover = useCallback(
    (id: string | null, strength: number) => {
      editorRef.current?.getSuggestionManager().setHover(id, strength);
    },
    [],
  );

  // 提案選択
  const selectSuggestion = useCallback((id: string, strength: number) => {
    editorRef.current?.getSuggestionManager().selectSuggestion(id, strength);
  }, []);

  // 提案のグラフ曲線を取得
  const getPreviewGraphCurves = useCallback(
    (p: p5) =>
      editorRef.current?.getSuggestionManager().getPreviewGraphCurves(p) ??
      null,
    [],
  );

  // 設定更新
  const updateConfig = useCallback((next: SketchConfigUpdate) => {
    setConfig((prev) => {
      const updated = { ...prev, ...next };
      editorRef.current?.getSuggestionManager().updateConfig(updated);
      saveConfig(updated);
      return updated;
    });
  }, []);

  // プロジェクト設定を更新
  const updateProjectSettings = useCallback(
    (next: ProjectSettings) => {
      setProjectSettings(next);
      editorRef.current?.setProjectSettings(next);
      refreshProjectDirtyState();
    },
    [refreshProjectDirtyState],
  );

  // プロジェクトを保存
  const saveProject = useCallback(() => {
    const json = buildProjectJson();
    if (!json) return;

    const pickAndSaveProjectFile = async (): Promise<void> => {
      const savePicker = (window as WindowWithFilePicker).showSaveFilePicker;
      if (!savePicker) {
        console.error('[saveProject] showSaveFilePicker is not supported.');
        return;
      }

      try {
        const suggestedName = `${projectName ?? 'Untitled'}.json`;
        const fileHandle = await savePicker({
          suggestedName,
          types: PROJECT_FILE_PICKER_TYPES,
        });
        await writeProjectJson(fileHandle, json);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        console.error('[saveProject] File picker failed.', error);
      }
    };

    const currentHandle = projectFileHandleRef.current;
    if (currentHandle) {
      void (async () => {
        try {
          await writeProjectJson(currentHandle, json);
          return;
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          console.warn(
            '[saveProject] Failed to overwrite opened project file.',
            error,
          );
          projectFileHandleRef.current = null;
          await pickAndSaveProjectFile();
        }
      })();
      return;
    }

    void pickAndSaveProjectFile();
  }, [buildProjectJson, projectName, writeProjectJson]);

  // プロジェクトを読み込み
  const loadProject = useCallback(() => {
    const applyLoadedProject = (
      text: string,
      filename: string,
      fileHandle: ProjectFileHandle,
    ) => {
      try {
        const data = JSON.parse(text);
        const { settings, paths: serializedPaths } = deserializeProject(data);

        editorRef.current?.applySerializedProject(serializedPaths, settings);
        setProjectSettings(settings);
        setProjectName(stripJsonExtension(filename));
        projectFileHandleRef.current = fileHandle;
        markCurrentProjectAsClean();
      } catch (error) {
        console.error('[loadProject] Failed to load project JSON.', error);
      }
    };

    const picker = (window as WindowWithFilePicker).showOpenFilePicker;
    if (!picker) {
      console.error('[loadProject] showOpenFilePicker is not supported.');
      return;
    }

    void (async () => {
      try {
        const [fileHandle] = await picker({
          multiple: false,
          types: PROJECT_FILE_PICKER_TYPES,
        });
        if (!fileHandle) return;

        const file = await fileHandle.getFile();
        const text = await file.text();
        applyLoadedProject(text, file.name, fileHandle);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        console.error('[loadProject] File picker failed.', error);
      }
    })();
  }, [markCurrentProjectAsClean]);

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
    colors: resolvedColors,
    updateConfig,
    hasUnsavedChanges,

    // プロジェクト
    projectName,
    projectSettings,
    updateProjectSettings,
    saveProject,
    loadProject,
  };
};
