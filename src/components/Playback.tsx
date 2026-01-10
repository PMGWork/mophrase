import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Play, SkipBack, SkipForward, Square } from 'lucide-react';

// 再生状態型定義
type PlaybackState = {
  hasPaths: boolean;
  isPlaying: boolean;
  elapsedMs: number;
  totalMs: number;
};

// コントローラ型定義
export type PlaybackController = {
  getState: () => PlaybackState;
  togglePlayback: () => boolean;
  resetPlayback: () => void;
  goToLastFrame: () => void;
  seekPlayback: (progress: number) => void;
};

// Props
type PlaybackProps = {
  controller: PlaybackController | null;
};

// 初期状態
const initialPlaybackState: PlaybackState = {
  hasPaths: false, // パスが存在するか
  isPlaying: false, // 再生中か
  elapsedMs: 0, // 経過時間
  totalMs: 0, // 合計時間
};

// 時間フォーマット
const formatPlaybackTime = (ms: number): string => {
  const clampedMs = Math.max(0, ms);
  const totalSeconds = Math.floor(clampedMs / 1000 + 1e-6);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

// コンポーネント
export const Playback = ({ controller }: PlaybackProps) => {
  const [state, setState] = useState<PlaybackState>(initialPlaybackState);
  const latestStateRef = useRef<PlaybackState>(initialPlaybackState);
  const seekingPointerId = useRef<number | null>(null);

  // 再生状態のリアルタイム更新
  useEffect(() => {
    if (!controller) return;

    let frameId = 0;
    const update = () => {
      const next = controller.getState();
      latestStateRef.current = next;
      setState((prev) => {
        if (
          prev.hasPaths === next.hasPaths &&
          prev.isPlaying === next.isPlaying &&
          prev.elapsedMs === next.elapsedMs &&
          prev.totalMs === next.totalMs
        ) {
          return prev;
        }
        return next;
      });
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [controller]);

  // キーボード操作
  useEffect(() => {
    if (!controller) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.code !== 'Space') return;
      if (!latestStateRef.current.hasPaths) return;

      event.preventDefault();
      controller.togglePlayback();
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [controller]);

  const hasPaths = state.hasPaths; // パスが存在するか
  const isPlaying = state.isPlaying; // 再生中か

  const safeTotal = Math.max(1, state.totalMs); // 合計時間
  const progress = Math.min(1, Math.max(0, state.elapsedMs / safeTotal)); // 経過時間
  const playheadStyle = { left: `${progress * 100}%` }; // プレイヘッドの位置

  // トラックシーク
  const seekByClientX = (clientX: number, target: HTMLDivElement) => {
    if (!controller) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    const progressValue = (clientX - rect.left) / rect.width;
    controller.seekPlayback(progressValue);
  };

  // トラッククリック
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!controller || !hasPaths) return;
    seekingPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekByClientX(event.clientX, event.currentTarget);
  };

  // トラックドラッグ
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (seekingPointerId.current !== event.pointerId) return;
    seekByClientX(event.clientX, event.currentTarget);
  };

  // トラッククリック
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (seekingPointerId.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    seekingPointerId.current = null;
  };

  return (
    <section
      id="playbackBar"
      className="corner-lg flex items-center gap-3 border border-gray-800 bg-gray-950/80 p-2.5"
    >
      <div className="flex items-center gap-1">
        <button
          id="playbackResetButton"
          className={`corner-md flex h-7 w-7 shrink-0 items-center justify-center bg-gray-800 text-gray-300 transition-colors ${
            hasPaths
              ? 'cursor-pointer hover:bg-gray-700 hover:text-gray-50'
              : 'cursor-not-allowed opacity-40'
          }`}
          title={hasPaths ? 'First Frame' : 'No objects to reset'}
          disabled={!hasPaths}
          onClick={() => {
            if (!controller || !hasPaths) return;
            controller.resetPlayback();
          }}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          id="playbackPlayButton"
          className={`corner-md flex h-7 w-7 shrink-0 items-center justify-center bg-gray-800 text-gray-300 transition-colors ${
            hasPaths
              ? 'cursor-pointer hover:bg-gray-700 hover:text-gray-50'
              : 'cursor-not-allowed opacity-40'
          }`}
          title={
            hasPaths ? (isPlaying ? 'Stop' : 'Play') : 'No objects to play'
          }
          disabled={!hasPaths}
          onClick={() => {
            if (!controller || !hasPaths) return;
            controller.togglePlayback();
          }}
        >
          <Square className={`h-3.5 w-3.5 ${isPlaying ? '' : 'hidden'}`} />
          <Play className={`h-3.5 w-3.5 ${isPlaying ? 'hidden' : ''}`} />
        </button>
        <button
          id="playbackEndButton"
          className={`corner-md flex h-7 w-7 shrink-0 items-center justify-center bg-gray-800 text-gray-300 transition-colors ${
            hasPaths
              ? 'cursor-pointer hover:bg-gray-700 hover:text-gray-50'
              : 'cursor-not-allowed opacity-40'
          }`}
          title={hasPaths ? 'Last Frame' : 'No objects to seek'}
          disabled={!hasPaths}
          onClick={() => {
            if (!controller || !hasPaths) return;
            controller.goToLastFrame();
          }}
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        id="playbackTrack"
        className={`relative flex-1 ${
          hasPaths ? 'cursor-pointer' : 'cursor-not-allowed'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="relative h-1">
          <div className="absolute inset-0 rounded-full bg-gray-800" />
          <div
            id="playbackPlayhead"
            className="absolute top-1/2 left-0 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-gray-400"
            style={playheadStyle}
          />
        </div>
      </div>
      <span
        id="playbackTime"
        className="flex shrink-0 items-center gap-0.5 font-mono text-xs text-gray-500"
      >
        <span id="playbackTimeCurrent">
          {formatPlaybackTime(state.elapsedMs)}
        </span>
        <span className="text-gray-700">/</span>
        <span id="playbackTimeTotal">{formatPlaybackTime(state.totalMs)}</span>
      </span>
    </section>
  );
};
