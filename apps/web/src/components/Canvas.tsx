import type { RefObject } from 'react';

// Props
type CanvasProps = {
  canvasRef: RefObject<HTMLElement | null>;
};

// コンポーネント
export const Canvas = ({ canvasRef }: CanvasProps) => (
  <main
    id="canvasContainer"
    ref={canvasRef}
    className="corner-xl border-border relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden border"
  />
);
