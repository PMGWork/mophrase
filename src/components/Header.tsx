import { MousePointer, PenTool, Settings } from 'lucide-react';
import type { ToolKind } from '../types';
import { ToolButton } from './ToolButton';

// Props
type HeaderProps = {
  selectedTool: ToolKind; // 選択されているツール
  onSelectTool: (tool: ToolKind) => void; // ツールを選択する関数
  onOpenSettings: () => void; // 設定モーダルを開く
};

// コンポーネント
export const Header = ({
  selectedTool,
  onSelectTool,
  onOpenSettings,
}: HeaderProps) => (
  <header className="flex w-full flex-col gap-4 px-5 py-3 md:flex-row md:items-center md:justify-between">
    <h1 className="text-2xl font-medium">MoPhrase</h1>

    <div className="flex flex-wrap items-center gap-2">
      <ToolButton
        title="Select Tool"
        icon={MousePointer}
        isSelected={selectedTool === 'select'}
        onClick={() => onSelectTool('select')}
      />
      <ToolButton
        title="Pen Tool"
        icon={PenTool}
        isSelected={selectedTool === 'pen'}
        onClick={() => onSelectTool('pen')}
      />

      <div className="mx-2 h-6 w-px bg-gray-800" />

      <ToolButton title="Settings" icon={Settings} onClick={onOpenSettings} />
    </div>
  </header>
);
