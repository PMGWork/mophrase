import type { Suggestion } from '../types';

const targetTint: Record<Suggestion['modifierTarget'], string> = {
  sketch: 'rgba(56, 189, 248, 0.2)',
  graph: 'rgba(167, 139, 250, 0.2)',
  both: 'rgba(52, 211, 153, 0.2)',
};

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
  const indicatorColor = targetTint[suggestion.modifierTarget];

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
        style={{ width: indicatorWidth, backgroundColor: indicatorColor }}
      />
      <span style={{ position: 'relative' }}>{suggestion.title}</span>
    </button>
  );
};
