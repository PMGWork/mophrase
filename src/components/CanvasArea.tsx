import type { RefObject } from 'react';

// Props
type CanvasAreaProps = {
  canvasRef: RefObject<HTMLElement | null>;
};

// コンポーネント
export const CanvasArea = ({ canvasRef }: CanvasAreaProps) => (
  <main
    id="canvasContainer"
    ref={canvasRef}
    className="corner-xl relative min-h-0 min-w-0 flex-1 overflow-hidden border border-gray-800"
  >
    <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 text-[10px] text-gray-500">
      <span>
        <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">V</kbd>{' '}
        Select
      </span>
      <span>
        <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">G</kbd>{' '}
        Pen
      </span>
      <span id="hint-delete-shortcut">
        <kbd
          id="hint-delete-key"
          className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400"
        >
          Alt+X
        </kbd>{' '}
        Delete
      </span>
      <span>
        <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">
          Space
        </kbd>{' '}
        Play
      </span>
    </div>
  </main>
);
