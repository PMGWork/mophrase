import { ChartSpline, Layers2, Pencil } from 'lucide-react';
import type { Suggestion } from '../types';

const targetIcon = {
  sketch: Pencil,
  graph: ChartSpline,
  both: Layers2,
} as const;

// Props
type SuggestionItemProps = {
  suggestion: Suggestion;
  isHovered: boolean;
  strength: number;
  onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseMove: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

// コンポーネント
export const SuggestionItem = ({
  suggestion,
  isHovered,
  strength,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
}: SuggestionItemProps) => {
  const indicatorWidth = isHovered ? `${(strength / 2) * 100}%` : '0';
  const TargetIcon = targetIcon[suggestion.modifierTarget];

  return (
    <button
      type="button"
      className="suggestion-item px-3 py-2 text-left text-sm text-gray-200"
      style={{ position: 'relative', overflow: 'hidden' }}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ width: indicatorWidth, background: 'rgba(255,255,255,0.1)' }}
      />
      <div className="relative flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate">{suggestion.title}</span>
        <TargetIcon
          className="h-3.5 w-3.5 shrink-0 text-gray-300"
          aria-hidden="true"
        />
      </div>
    </button>
  );
};
