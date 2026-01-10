import { Minus } from 'lucide-react';
import type { Modifier, ModifierKind } from '../types';

// プロパティ
type ModifierItemProps = {
  modifier: Modifier; // モディファイア
  type: ModifierKind; // モディファイアの種類
  onChange: (modifier: Modifier, type: ModifierKind, value: number) => void;
  onRemove: (modifier: Modifier, type: ModifierKind) => void;
};

// 影響度を0から2の範囲にクランプする関数
const clampStrength = (value: number) => Math.max(0, Math.min(2, value));

// 影響度をパーセンテージ形式にフォーマットする関数
const formatStrength = (value: number) =>
  Math.round(clampStrength(value) * 100);

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
      <div className="corner-md relative flex flex-1 items-center overflow-hidden bg-gray-800 px-3 py-1.5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ width: indicatorWidth, background: 'rgba(255,255,255,0.1)' }}
        />
        <span
          className="relative flex-1 truncate text-xs text-gray-50"
          title={modifier.name}
        >
          {modifier.name}
        </span>
        <span className="relative ml-2 text-xs text-gray-500">
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
        className="shrink-0 p-1 text-gray-500 transition-colors hover:text-red-400"
        aria-label="Remove modifier"
      >
        <Minus className="h-4 w-4" />
      </button>
    </div>
  );
};
