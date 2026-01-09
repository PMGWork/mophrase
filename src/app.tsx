import { useEffect, useRef, useState } from 'react';
import { bootstrap } from './bootstrap';
import type { PlaybackController } from './types/playback';
import { CanvasArea } from './components/CanvasArea';
import { Header } from './components/Header';
import { PlaybackBar } from './components/PlaybackBar';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { SketchSuggestion } from './components/SketchSuggestion';

export const App = () => {
  const canvasRef = useRef<HTMLElement | null>(null);
  const graphEditorCanvasRef = useRef<HTMLDivElement | null>(null);
  const [playbackController, setPlaybackController] =
    useState<PlaybackController | null>(null);

  useEffect(() => {
    const { playbackController: controller } = bootstrap({
      canvasContainer: canvasRef.current,
      graphEditorCanvas: graphEditorCanvasRef.current,
    });
    setPlaybackController(controller);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header />

      <div className="mx-3 mb-3 flex flex-1 gap-2.5 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <CanvasArea canvasRef={canvasRef} />
          <PlaybackBar controller={playbackController} />
        </div>

        <Sidebar graphEditorCanvasRef={graphEditorCanvasRef} />
      </div>

      <SketchSuggestion />
      <SettingsModal />
    </div>
  );
};
