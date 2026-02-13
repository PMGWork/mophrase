import { Minus } from 'lucide-react';
import type { AnyModifier, ModifierKind } from '../types';
import { clamp } from '../utils/number';

// プロパティ
type ModifierItemProps = {
  modifier: AnyModifier; // モディファイア
  type: ModifierKind; // モディファイアの種類
  onChange: (modifier: AnyModifier, type: ModifierKind, value: number) => void;
  onRemove: (modifier: AnyModifier, type: ModifierKind) => void;
};

// 影響度をパーセンテージ形式にフォーマットする関数
const formatStrength = (value: number) =>
  Math.round(clamp(value, 0, 2) * 100);

// モディファイアアイテム
export const ModifierItem = ({
  modifier,
  type,
  onChange,
  onRemove,
}: ModifierItemProps) => {
  const strengthValue = formatStrength(modifier.strength);
  const indicatorWidth = `${strengthValue / 2}%`;

  return (
    <div className="flex items-center gap-2">
      <div className="corner-md bg-panel-elevated relative flex flex-1 items-center overflow-hidden px-3 py-1.5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ width: indicatorWidth, background: 'rgba(255,255,255,0.1)' }}
        />
        <span
          className="text-text relative flex-1 truncate text-xs"
          title={modifier.name}
        >
          {modifier.name}
        </span>
        <span className="text-text-subtle relative ml-2 text-xs">
          {strengthValue}%
        </span>
        <input
          type="range"
          min="0"
          max="200"
          value={strengthValue}
          onChange={(event) =>
            onChange(modifier, type, Number(event.target.value))
          }
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(modifier, type)}
        className="text-text-subtle hover:text-danger shrink-0 p-1 transition-colors"
        aria-label="Remove modifier"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
};
