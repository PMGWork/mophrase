import type { RefObject } from 'react';
import { KeyboardHint } from './KeyboardHint';

// Props
type CanvasProps = {
  canvasRef: RefObject<HTMLElement | null>;
};

// コンポーネント
export const Canvas = ({ canvasRef }: CanvasProps) => (
  <main
    id="canvasContainer"
    ref={canvasRef}
    className="corner-xl relative min-h-0 min-w-0 flex-1 overflow-hidden border border-gray-800"
  >
    <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 text-[10px] text-gray-500">
      <KeyboardHint keys="V" label="Select" />
      <KeyboardHint keys="G" label="Pen" />
      <KeyboardHint keys="Alt+X" label="Delete" />
      <KeyboardHint keys="Space" label="Play" />
    </div>
  </main>
);
