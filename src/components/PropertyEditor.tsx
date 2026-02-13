import type { AnyModifier, Path, ModifierKind } from '../types';
import { ModifierSection } from './ModifierSection';
import { TimeSection } from './TimeSection';

// プロパティエディタのハンドラ型定義
export type PropertyEditorHandlers = {
  onTimeChange?: (field: 'startTime' | 'duration', value: number) => void;
  onModifierChange?: (
    modifierId: string,
    type: ModifierKind,
    value: number,
  ) => void;
  onModifierRemove?: (modifierId: string, type: ModifierKind) => void;
};

// プロパティ型定義
type PropertyEditorProps = {
  activePath: Path | null; // 編集中のアクティブなパス
  handlers?: PropertyEditorHandlers; // 各種ハンドラ
};

// プロパティエディタパネルコンポーネント
export const PropertyEditor = ({
  activePath,
  handlers,
}: PropertyEditorProps) => {
  // 編集可能なパスがあるかどうか
  const hasEditablePath =
    !!activePath && (activePath.keyframes?.length ?? 0) >= 2;

  // 時間の取得
  const startTime = Number.isFinite(activePath?.startTime)
    ? activePath!.startTime
    : 0;
  const duration = Number.isFinite(activePath?.duration)
    ? activePath!.duration
    : 0;

  // モディファイアの取得
  const sketchModifiers = activePath?.sketchModifiers ?? [];
  const graphModifiers = activePath?.graphModifiers ?? [];

  // 時間変更ハンドラ
  const handleTimeChange = (field: 'startTime' | 'duration', value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    if (field === 'startTime' && next < 0) return;
    if (field === 'duration' && next <= 0) return;
    handlers?.onTimeChange?.(field, next);
  };

  // モディファイア変更ハンドラ
  const handleModifierChange = (
    modifier: AnyModifier,
    type: ModifierKind,
    value: number,
  ) => handlers?.onModifierChange?.(modifier.id, type, value);

  // モディファイア削除ハンドラ
  const handleModifierRemove = (modifier: AnyModifier, type: ModifierKind) =>
    handlers?.onModifierRemove?.(modifier.id, type);

  return (
    <div
      id="propertyEditorContainer"
      className="corner-xl border-border bg-background flex min-h-0 flex-1 flex-col overflow-y-auto border"
    >
      <div className="border-border bg-panel/50 flex items-center border-b px-4 py-2.5">
        <h2 className="text text-sm font-medium">Properties</h2>
      </div>

      <div
        id="propertyPlaceholder"
        className="text-text-subtle flex h-full items-center justify-center text-sm"
        style={{ display: hasEditablePath ? 'none' : 'flex' }}
      >
        Select a path to edit
      </div>

      <div
        id="propertyEditorContent"
        className="flex flex-col"
        style={{ display: hasEditablePath ? 'flex' : 'none' }}
      >
        {/* タイムセクション */}
        <TimeSection
          startTime={startTime}
          duration={duration}
          onChange={(field, value) => {
            handleTimeChange(field, value.toString());
          }}
          activePathId={activePath?.id}
        />

        {/* スケッチモディファイアセクション */}
        <ModifierSection
          title="Sketch"
          type="sketch"
          modifiers={sketchModifiers}
          onChange={handleModifierChange}
          onRemove={handleModifierRemove}
        />

        {/* グラフモディファイアセクション */}
        <ModifierSection
          title="Graph"
          type="graph"
          modifiers={graphModifiers}
          onChange={handleModifierChange}
          onRemove={handleModifierRemove}
        />
      </div>
    </div>
  );
};
