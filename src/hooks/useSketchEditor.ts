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
  findProjectByName,
  getProject,
  listProjects,
  saveProject as saveProjectToStorage,
  type ProjectSummary,
} from '../services/projectStorage';
import {
  deserializeProject,
  serializeProject,
} from '../utils/serialization/project';

// 設定更新用のパラメータ
type SketchConfigUpdate = {
  llmProvider: Config['llmProvider'];
  llmModel: Config['llmModel'];
  fitTolerance: Config['fitTolerance'];
  testMode: Config['testMode'];
};

const NEW_PROJECT_CONFIRM_MESSAGE =
  '未保存の変更があります。破棄して新規プロジェクトを作成しますか？';
const LOAD_PROJECT_CONFIRM_MESSAGE =
  '未保存の変更があります。破棄して別プロジェクトを読み込みますか？';

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
  isProjectLibraryOpen: boolean;
  projectLibrary: ProjectSummary[];
  closeProjectLibrary: () => void;
  loadProjectById: (id: string) => Promise<void>;
  createNewProject: () => Promise<void>;
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
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(
    () => ({ ...DEFAULT_PROJECT_SETTINGS }),
  );
  const [isProjectLibraryOpen, setIsProjectLibraryOpen] = useState(false);
  const [projectLibrary, setProjectLibrary] = useState<ProjectSummary[]>([]);

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

  // 保存対象のプロジェクトデータを構築
  const buildProjectData = useCallback((editor = editorRef.current) => {
    if (!editor) return null;
    return serializeProject(editor.getPaths(), editor.getProjectSettings());
  }, []);

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

  // プロジェクト一覧を更新
  const refreshProjectLibrary = useCallback(async (): Promise<void> => {
    try {
      const projects = await listProjects();
      setProjectLibrary(projects);
    } catch (error) {
      console.error('[projectLibrary] Failed to list projects.', error);
    }
  }, []);

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

  useEffect(() => {
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

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
    void (async () => {
      const projectData = buildProjectData();
      if (!projectData) return;

      try {
        let targetId = projectId;
        let targetName = projectName;

        if (!targetId) {
          const defaultName = targetName ?? 'Untitled';
          const promptedName = window.prompt(
            'プロジェクト名を入力してください',
            defaultName,
          );
          if (!promptedName) return;

          const trimmedName = promptedName.trim();
          if (!trimmedName) return;

          const existing = await findProjectByName(trimmedName);
          if (existing) {
            const shouldOverwrite = window.confirm(
              `「${existing.name}」は既に存在します。上書きしますか？`,
            );
            if (!shouldOverwrite) return;
            targetId = existing.id;
          } else {
            targetId = null;
          }
          targetName = trimmedName;
        }

        const fallbackName = targetName ?? 'Untitled';
        const result = await saveProjectToStorage({
          id: targetId ?? undefined,
          name: fallbackName,
          data: projectData,
        });

        setProjectId(result.id);
        setProjectName(result.name);
        markCurrentProjectAsClean();

        if (isProjectLibraryOpen) {
          await refreshProjectLibrary();
        }
      } catch (error) {
        console.error('[saveProject] Failed to save project.', error);
      }
    })();
  }, [
    buildProjectData,
    isProjectLibraryOpen,
    markCurrentProjectAsClean,
    projectId,
    projectName,
    refreshProjectLibrary,
  ]);

  // プロジェクト一覧を開く
  const loadProject = useCallback(() => {
    void (async () => {
      await refreshProjectLibrary();
      setIsProjectLibraryOpen(true);
    })();
  }, [refreshProjectLibrary]);

  const closeProjectLibrary = useCallback(() => {
    setIsProjectLibraryOpen(false);
  }, []);

  // プロジェクトIDを指定して読み込み
  const loadProjectById = useCallback(
    async (id: string): Promise<void> => {
      const editor = editorRef.current;
      if (!editor) return;
      if (hasUnsavedChanges && !window.confirm(LOAD_PROJECT_CONFIRM_MESSAGE)) {
        return;
      }

      try {
        const stored = await getProject(id);
        if (!stored) {
          console.error('[loadProject] Target project is not found.', { id });
          return;
        }

        const { settings, paths: serializedPaths } = deserializeProject(
          stored.data,
        );

        editor.applySerializedProject(serializedPaths, settings);
        setProjectId(stored.id);
        setProjectName(stored.name);
        setProjectSettings(settings);
        setIsProjectLibraryOpen(false);
        markCurrentProjectAsClean(editor);
      } catch (error) {
        console.error('[loadProject] Failed to load project from storage.', error);
      }
    },
    [hasUnsavedChanges, markCurrentProjectAsClean],
  );

  // 新規プロジェクトを作成
  const createNewProject = useCallback(async (): Promise<void> => {
    const editor = editorRef.current;
    if (!editor) return;
    if (hasUnsavedChanges && !window.confirm(NEW_PROJECT_CONFIRM_MESSAGE)) {
      return;
    }

    editor.applyProject([], { ...DEFAULT_PROJECT_SETTINGS });
    setProjectId(null);
    setProjectName(null);
    setProjectSettings({ ...DEFAULT_PROJECT_SETTINGS });
    markCurrentProjectAsClean(editor);
    setIsProjectLibraryOpen(false);
  }, [hasUnsavedChanges, markCurrentProjectAsClean]);

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
    isProjectLibraryOpen,
    projectLibrary,
    closeProjectLibrary,
    loadProjectById,
    createNewProject,
  };
};
