import type { Suggestion } from '../types';

// Props
type SuggestionItemProps = {
  suggestion: Suggestion;
  isHovered: boolean;
  strength: number;
  onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseMove: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave: () => void;
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
  onClick,
}: SuggestionItemProps) => {
  const indicatorWidth = isHovered ? `${(strength / 2) * 100}%` : '0';

  return (
    <button
      type="button"
      className="suggestion-item text-text hover:bg-panel px-3 py-2 text-left text-sm transition-colors"
      style={{ position: 'relative', overflow: 'hidden' }}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-white/15"
        style={{ width: indicatorWidth }}
      />
      <span style={{ position: 'relative' }}>{suggestion.title}</span>
    </button>
  );
};
