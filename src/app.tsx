import { useEffect, useRef, useState } from 'react';
import { bootstrap } from './bootstrap';
import type { Config } from './config';
import type { Path, ToolKind } from './types';
import type { PlaybackController } from './components/Playback';
import type { SuggestionUIState } from './suggestion/suggestion';
import { removeModifier, updateModifierStrength } from './utils/modifier';
import { Canvas } from './components/Canvas';
import { Header } from './components/Header';
import { Playback } from './components/Playback';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { SketchSuggestion } from './components/Suggestion';

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
  const [, setActivePathVersion] = useState(0);
  const [suggestionUI, setSuggestionUI] = useState<SuggestionUIState>({
    status: 'idle',
    promptCount: 0,
    isVisible: false,
    suggestions: [],
    position: null,
  });

  // エディタ内部参照
  const updateSuggestionUIRef = useRef<(() => void) | null>(null);
  const submitPromptRef = useRef<((prompt: string) => void) | null>(null);
  const setSketchToolRef = useRef<((tool: ToolKind) => void) | null>(null);
  const setSuggestionHoverRef = useRef<
    ((id: string | null, strength: number) => void) | null
  >(null);
  const selectSuggestionRef = useRef<
    ((id: string, strength: number) => void) | null
  >(null);
  const applyActivePathUpdateRef = useRef<
    ((updater: (path: Path) => void) => void) | null
  >(null);
  const getActivePathRef = useRef<(() => Path | null) | null>(null);

  const activePath = getActivePathRef.current?.() ?? null;

  // 値クランプヘルパー
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  // アクティブパス更新適用ヘルパー
  const applyPathUpdate = (updater: (path: Path) => void) => {
    applyActivePathUpdateRef.current?.(updater);
    updateSuggestionUIRef.current?.();
  };

  // ツール選択ハンドラ
  const handleToolSelect = (tool: ToolKind) => {
    setSelectedTool(tool);
    setSketchToolRef.current?.(tool);
  };

  // 時間変更ハンドラ
  const handleTimeChange = (field: 'startTime' | 'duration', value: number) => {
    applyPathUpdate((path) => {
      if (field === 'startTime') {
        path.startTime = value;
      } else {
        path.duration = value;
      }
    });
  };

  // モディファイア変更ハンドラ
  const handleModifierChange = (
    modifierId: string,
    type: 'sketch' | 'graph',
    value: number,
  ) => {
    applyPathUpdate((path) => {
      const strength = clamp(value / 100, 0, 2);
      updateModifierStrength(
        type === 'sketch' ? path.sketchModifiers : path.graphModifiers,
        modifierId,
        strength,
      );
    });
  };

  // モディファイア削除ハンドラ
  const handleModifierRemove = (
    modifierId: string,
    type: 'sketch' | 'graph',
  ) => {
    applyPathUpdate((path) => {
      const modifiers =
        type === 'sketch' ? path.sketchModifiers : path.graphModifiers;
      const target = modifiers?.find((modifier) => modifier.id === modifierId);
      if (target) {
        // 元のパスにも反映されるように強度を0にして影響を解除
        target.strength = 0;
      }
      const next = removeModifier(
        type === 'sketch' ? path.sketchModifiers : path.graphModifiers,
        modifierId,
      );
      if (type === 'sketch') {
        path.sketchModifiers = next;
      } else {
        path.graphModifiers = next;
      }
    });
  };

  // 設定変更ハンドラ
  const handleConfigChange = (next: {
    llmProvider: Config['llmProvider'];
    llmModel: Config['llmModel'];
    sketchFitTolerance: Config['sketchFitTolerance'];
  }) => {
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
  };

  const hasGraphPath = (activePath?.keyframes?.length ?? 0) >= 2;

  useEffect(() => {
    if (hasGraphPath) {
      window.dispatchEvent(new Event('resize'));
    }
  }, [hasGraphPath]);

  // 初期化
  useEffect(() => {
    const {
      playbackController: controller,
      config,
      updateSuggestionUI,
      submitPrompt,
      setSketchTool,
      getSketchTool,
      setSuggestionHover,
      selectSuggestion,
      applyActivePathUpdate,
      getActivePath,
    } = bootstrap(
      {
        canvasContainer: sketchCanvasRef.current,
        graphEditorCanvas: graphCanvasRef.current,
      },
      {
        onPathSelected: () => {
          setActivePathVersion((version) => version + 1);
        },
        onPathUpdated: () => {
          setActivePathVersion((version) => version + 1);
        },
        onToolChanged: (tool) => {
          setSelectedTool(tool);
        },
        onSuggestionUIChange: setSuggestionUI,
      },
    );
    setPlaybackController(controller);
    setConfig(config);
    updateSuggestionUIRef.current = updateSuggestionUI;
    submitPromptRef.current = submitPrompt;
    setSketchToolRef.current = setSketchTool;
    setSuggestionHoverRef.current = setSuggestionHover;
    selectSuggestionRef.current = selectSuggestion;
    applyActivePathUpdateRef.current = applyActivePathUpdate;
    getActivePathRef.current = getActivePath;
    setSelectedTool(getSketchTool());
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header
        selectedTool={selectedTool}
        onSelectTool={handleToolSelect}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="mx-3 mb-3 flex flex-1 gap-2.5 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Canvas canvasRef={sketchCanvasRef} />
          <Playback controller={playbackController} />
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
        onSubmit={(prompt) => submitPromptRef.current?.(prompt)}
        isVisible={suggestionUI.isVisible}
        placeholder={
          suggestionUI.promptCount > 0
            ? 'Refine instruction...'
            : 'Enter instruction...'
        }
        status={suggestionUI.status}
        suggestions={suggestionUI.suggestions}
        position={suggestionUI.position}
        onHoverChange={(id, strength) =>
          setSuggestionHoverRef.current?.(id, strength)
        }
        onSuggestionClick={(id, strength) =>
          selectSuggestionRef.current?.(id, strength)
        }
      />
      <Settings
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onChange={handleConfigChange}
      />
    </div>
  );
};
