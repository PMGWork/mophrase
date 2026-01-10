import { useEffect, useRef, useState } from 'react';
import { bootstrap } from './bootstrap';
import type { Config } from './config';
import type { Path, ToolKind } from './types';
import type { PlaybackController } from './components/PlaybackBar';
import {
  removeModifier,
  updateModifierStrength,
} from './utils/modifier';
import { CanvasArea } from './components/CanvasArea';
import { Header } from './components/Header';
import { PlaybackBar } from './components/PlaybackBar';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { SketchSuggestion } from './components/SketchSuggestion';

export const App = () => {
  // DOM参照
  const sketchCanvasRef = useRef<HTMLElement | null>(null);
  const graphCanvasRef = useRef<HTMLDivElement | null>(null);

  // UI状態
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<ToolKind>('pen');
  const [playbackController, setPlaybackController] =
    useState<PlaybackController | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [activePath, setActivePath] = useState<Path | null>(null);

  // エディタ内部参照
  const updateSuggestionUIRef = useRef<(() => void) | null>(null);
  const submitPromptRef = useRef<((prompt: string) => void) | null>(null);
  const setSketchToolRef = useRef<((tool: ToolKind) => void) | null>(null);

  // パス更新ヘルパー
  const handlePathSelected = (path: Path | null) => {
    setActivePath(
      path
        ? {
            ...path,
            keyframes: [...path.keyframes],
            sketchModifiers: [...(path.sketchModifiers ?? [])],
            graphModifiers: [...(path.graphModifiers ?? [])],
          }
        : null,
    );
  };

  // アクティブパス更新適用ヘルパー
  const applyPathUpdate = (updater: (path: Path) => void) => {
    setActivePath((current) => {
      if (!current) return current;
      const next: Path = {
        ...current,
        keyframes: [...current.keyframes],
        sketchModifiers: [...(current.sketchModifiers ?? [])],
        graphModifiers: [...(current.graphModifiers ?? [])],
      };
      updater(next);
      return next;
    });
    updateSuggestionUIRef.current?.();
  };

  useEffect(() => {
    const {
      playbackController: controller,
      config,
      updateSuggestionUI,
      submitPrompt,
      setSketchTool,
      getSketchTool,
    } = bootstrap(
      {
        canvasContainer: sketchCanvasRef.current,
        graphEditorCanvas: graphCanvasRef.current,
      },
      {
        onPathSelected: handlePathSelected,
        onToolChanged: (tool) => {
          setSelectedTool(tool);
        },
      },
    );
    setPlaybackController(controller);
    setConfig(config);
    updateSuggestionUIRef.current = updateSuggestionUI;
    submitPromptRef.current = submitPrompt;
    setSketchToolRef.current = setSketchTool;
    setSelectedTool(getSketchTool());
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header
        selectedTool={selectedTool}
        onSelectTool={(tool) => {
          setSelectedTool(tool);
          setSketchToolRef.current?.(tool);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="mx-3 mb-3 flex flex-1 gap-2.5 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <CanvasArea canvasRef={sketchCanvasRef} />
          <PlaybackBar controller={playbackController} />
        </div>

        <Sidebar
          graphEditorCanvasRef={graphCanvasRef}
          activePath={activePath}
          propertyEditorHandlers={{
            onTimeChange: (field, value) =>
              applyPathUpdate((path) => {
                if (field === 'startTime') {
                  path.startTime = value;
                } else {
                  path.duration = value;
                }
              }),
            onModifierChange: (modifierId, type, value) =>
              applyPathUpdate((path) => {
                const strength = Math.max(0, Math.min(2, value / 100));
                if (type === 'sketch') {
                  updateModifierStrength(
                    path.sketchModifiers,
                    modifierId,
                    strength,
                  );
                } else {
                  updateModifierStrength(
                    path.graphModifiers,
                    modifierId,
                    strength,
                  );
                }
              }),
            onModifierRemove: (modifierId, type) =>
              applyPathUpdate((path) => {
                if (type === 'sketch') {
                  path.sketchModifiers = removeModifier(
                    path.sketchModifiers,
                    modifierId,
                  );
                } else {
                  path.graphModifiers = removeModifier(
                    path.graphModifiers,
                    modifierId,
                  );
                }
              }),
          }}
        />
      </div>

      <SketchSuggestion
        onSubmit={(prompt) => submitPromptRef.current?.(prompt)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onConfigChange={(next) => {
          setConfig((current) =>
            current
              ? {
                  ...current,
                  llmProvider: next.llmProvider,
                  llmModel: next.llmModel,
                  sketchFitTolerance: next.sketchFitTolerance,
                }
              : current,
          );
        }}
      />
    </div>
  );
};
