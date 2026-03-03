import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useState } from 'react';
import type { Path } from './types';
import { removeModifier, updateModifierStrength } from './utils/modifier';
import { clamp } from './utils/math';
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
    deleteActivePath,

    // 提案関連
    suggestionUI,
    updateSuggestionUI,
    submitPrompt,
    setSuggestionHover,
    selectSuggestion,
    captureSketchCanvas,
    getSelectionRange,
    getSelectedHandlesForActivePath,
    setGraphImageProvider,

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
    exportProjectAsJson,
    importProjectFromJson,
    isProjectLibraryOpen,
    projectLibrary,
    closeProjectLibrary,
    loadProjectById,
    deleteProjectById,
    renameProjectById,
    createNewProject,
  } = useSketchEditor();

  const { graphCanvasRef, captureGraphCanvas } = useGraphEditor({
    activePath,
    config,
    colors,
    previewProvider: getPreviewGraphCurves,
    selectionRangeProvider: getSelectionRange,
    selectedHandlesProvider: getSelectedHandlesForActivePath,
  });

  // 送信用画像プロバイダーをSuggestionManagerに接続
  useEffect(() => {
    setGraphImageProvider((path, selectionRange) => {
      const images = [
        captureSketchCanvas(path, selectionRange),
        captureGraphCanvas(),
      ].filter((value): value is string => !!value);
      return images.length > 0 ? images : null;
    });
  }, [captureGraphCanvas, captureSketchCanvas, setGraphImageProvider]);

  // アクティブパス更新適用ヘルパー
  const applyPathUpdate = (updater: (path: Path) => void) => {
    updateActivePath(updater);
    updateSuggestionUI();
  };

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
          path.sketchModifiers = removeModifier(
            path.sketchModifiers,
            modifierId,
          );
        } else {
          path.graphModifiers = removeModifier(path.graphModifiers, modifierId);
        }
      });
    },
    [applyPathUpdate],
  );

  const hasGraphPath = (activePath?.keyframes?.length ?? 0) >= 2;
  const handleFitToleranceChange = useCallback(
    (fitTolerance: number) => {
      updateConfig({
        llmProvider: config.llmProvider,
        llmModel: config.llmModel,
        llmReasoningEffort: config.llmReasoningEffort,
        parallelGeneration: config.parallelGeneration,
        graphImageEnabled: config.graphImageEnabled,
        fitTolerance,
        testMode: config.testMode,
      });
    },
    [config, updateConfig],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Header
        projectName={projectName}
        hasUnsavedChanges={hasUnsavedChanges}
        selectedTool={selectedTool}
        fitTolerance={config.fitTolerance}
        canDeleteActivePath={activePath !== null}
        onSelectTool={setSketchTool}
        onChangeFitTolerance={handleFitToleranceChange}
        onDeleteActivePath={deleteActivePath}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSave={saveProject}
        onLoad={loadProject}
        onExportJson={exportProjectAsJson}
        onImportJson={importProjectFromJson}
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
        onChange={updateConfig}
      />
      <ProjectLibraryModal
        isOpen={isProjectLibraryOpen}
        projects={projectLibrary}
        onClose={closeProjectLibrary}
        onLoadProject={(id) => {
          void loadProjectById(id);
        }}
        onRenameProject={(id, name) => {
          void renameProjectById(id, name);
        }}
        onDeleteProject={(id, name) => {
          void deleteProjectById(id, name);
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
  throw new Error('Root element (#root) was not found.');
}

createRoot(container).render(<App />);
