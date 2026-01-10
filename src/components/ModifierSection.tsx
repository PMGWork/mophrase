import type { ModifierKind, Modifier } from '../types';
import { ModifierItem } from './ModifierItem';

// Props
type ModifierSectionProps = {
  title: string; // セクションのタイトル
  type: ModifierKind; // モディファイアの種類
  modifiers: Array<Modifier>; // モディファイアの配列
  onChange: (modifier: Modifier, type: ModifierKind, value: number) => void;
  onRemove: (modifier: Modifier, type: ModifierKind) => void;
};

// コンポーネント
export const ModifierSection = ({
  title,
  type,
  modifiers,
  onChange,
  onRemove,
}: ModifierSectionProps) => (
  <div
    className="flex flex-col gap-2 border-t border-gray-800 p-3"
    style={{ display: modifiers.length ? 'flex' : 'none' }}
  >
    <span className="text-xs font-medium text-gray-400">{title}</span>
    <div className="flex flex-col gap-1 overflow-y-auto">
      {modifiers.map((modifier) => (
        <ModifierItem
          key={modifier.id}
          modifier={modifier}
          type={type}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
    </div>
  </div>
);
