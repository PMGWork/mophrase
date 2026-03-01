import { createRoot } from 'react-dom/client';
import { useCallback, useState } from 'react';
import type { Path, ToolKind } from './types';
import { removeModifier, updateModifierStrength } from './utils/modifier';
import { clamp } from './utils/number';
import { Canvas } from './components/Canvas';
import { Header } from './components/Header';
import { Playback } from './components/Playback';
import { ProjectLibraryModal } from './components/ProjectLibraryModal';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { SketchSuggestion } from './components/Suggestion';
import { useGraphEditor } from './hooks/useGraphEditor';
import { useSketchEditor } from './hooks/useSketchEditor';

const App = () => {
  // UI状態
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const {
    // キャンバスと再生コントローラ
    canvasRef: sketchCanvasRef,
    playbackController,

    // アクティブパスと更新ハンドラ
    activePath,
    updateActivePath,

    // ツール関連
    selectedTool,
    setTool: setSketchTool,

    // 提案関連
    suggestionUI,
    updateSuggestionUI,
    submitPrompt,
    setSuggestionHover,
    selectSuggestion,

    // 設定
    config,
    updateConfig,
    hasUnsavedChanges,

    // 色設定
    colors,
    getPreviewGraphCurves,

    // プロジェクト関連
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
  } = useSketchEditor();

  const { graphCanvasRef } = useGraphEditor({
    activePath,
    config,
    colors,
    previewProvider: getPreviewGraphCurves,
  });

  // アクティブパス更新適用ヘルパー
  const applyPathUpdate = (updater: (path: Path) => void) => {
    updateActivePath(updater);
    updateSuggestionUI();
  };

  // ツール選択ハンドラ
  const handleToolSelect = useCallback(
    (tool: ToolKind) => {
      setSketchTool(tool);
    },
    [setSketchTool],
  );

  // 時間変更ハンドラ
  const handleTimeChange = useCallback(
    (field: 'startTime' | 'duration', value: number) => {
      applyPathUpdate((path) => {
        if (field === 'startTime') {
          path.startTime = value;
        } else {
          path.duration = value;
        }
      });
    },
    [applyPathUpdate],
  );

  // モディファイア変更ハンドラ
  const handleModifierChange = useCallback(
    (modifierId: string, type: 'sketch' | 'graph', value: number) => {
      applyPathUpdate((path) => {
        const strength = clamp(value / 100, 0, 2);
        if (type === 'sketch') {
          updateModifierStrength(path.sketchModifiers, modifierId, strength);
        } else {
          updateModifierStrength(path.graphModifiers, modifierId, strength);
        }
      });
    },
    [applyPathUpdate],
  );

  // モディファイア削除ハンドラ
  const handleModifierRemove = useCallback(
    (modifierId: string, type: 'sketch' | 'graph') => {
      applyPathUpdate((path) => {
        if (type === 'sketch') {
          const target = path.sketchModifiers?.find(
            (modifier) => modifier.id === modifierId,
          );
          if (target) target.strength = 0;
          path.sketchModifiers = removeModifier(
            path.sketchModifiers,
            modifierId,
          );
        } else {
          const target = path.graphModifiers?.find(
            (modifier) => modifier.id === modifierId,
          );
          if (target) target.strength = 0;
          path.graphModifiers = removeModifier(path.graphModifiers, modifierId);
        }
      });
    },
    [applyPathUpdate],
  );

  // 設定変更ハンドラ
  const handleConfigChange = useCallback(
    (next: Parameters<typeof updateConfig>[0]) => {
      updateConfig(next);
    },
    [updateConfig],
  );

  const hasGraphPath = (activePath?.keyframes?.length ?? 0) >= 2;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Header
        projectName={projectName}
        hasUnsavedChanges={hasUnsavedChanges}
        selectedTool={selectedTool}
        onSelectTool={handleToolSelect}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSave={saveProject}
        onLoad={loadProject}
      />

      <div className="mx-3 flex min-h-0 flex-1 gap-2.5 overflow-hidden pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Canvas canvasRef={sketchCanvasRef} />
          <Playback
            controller={playbackController}
            projectSettings={projectSettings}
            onProjectSettingsChange={updateProjectSettings}
          />
        </div>

        <Sidebar
          graphCanvasRef={graphCanvasRef}
          activePath={activePath}
          hasGraphPath={hasGraphPath}
          propertyEditorHandlers={{
            onTimeChange: handleTimeChange,
            onModifierChange: handleModifierChange,
            onModifierRemove: handleModifierRemove,
          }}
        />
      </div>

      <SketchSuggestion
        onSubmit={submitPrompt}
        isVisible={suggestionUI.isVisible}
        placeholder={
          suggestionUI.promptCount > 0
            ? 'Refine instruction...'
            : 'Enter instruction...'
        }
        status={suggestionUI.status}
        suggestions={suggestionUI.suggestions}
        position={suggestionUI.position}
        testMode={config.testMode}
        onHoverChange={setSuggestionHover}
        onSuggestionClick={selectSuggestion}
      />
      <Settings
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onChange={handleConfigChange}
      />
      <ProjectLibraryModal
        isOpen={isProjectLibraryOpen}
        projects={projectLibrary}
        onClose={closeProjectLibrary}
        onLoadProject={(id) => {
          void loadProjectById(id);
        }}
        onCreateNewProject={() => {
          void createNewProject();
        }}
      />
    </div>
  );
};

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element (#root) が見つかりません。');
}

createRoot(container).render(<App />);
