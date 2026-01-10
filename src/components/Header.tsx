import { MousePointer, PenTool, Settings } from 'lucide-react';
import type { ToolKind } from '../types';

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
      <button
        id="selectToolButton"
        title="Select Tool"
        className={`corner-md flex h-9 w-9 cursor-pointer items-center justify-center transition-colors ${
          selectedTool === 'select'
            ? 'bg-gray-50 text-gray-950 hover:bg-gray-200'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
        onClick={() => onSelectTool('select')}
      >
        <MousePointer className="h-4 w-4" />
      </button>
      <button
        id="penToolButton"
        title="Pen Tool"
        className={`corner-md flex h-9 w-9 cursor-pointer items-center justify-center transition-colors ${
          selectedTool === 'pen'
            ? 'bg-gray-50 text-gray-950 hover:bg-gray-200'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
        onClick={() => onSelectTool('pen')}
      >
        <PenTool className="h-4 w-4" />
      </button>

      <div className="mx-2 h-6 w-px bg-gray-800" />

      <button
        id="settingsButton"
        title="Settings"
        className="corner-md flex h-9 w-9 cursor-pointer items-center justify-center bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700"
        onClick={onOpenSettings}
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  </header>
);
