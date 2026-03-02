import {
  Download,
  FolderOpen,
  MousePointer,
  PenTool,
  Save,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ToolKind } from '../types';
import { ToolButton } from './ToolButton';

// Props
type HeaderProps = {
  projectName: string | null;
  hasUnsavedChanges: boolean;
  selectedTool: ToolKind; // 選択されているツール
  canDeleteActivePath: boolean; // 削除可能か
  onSelectTool: (tool: ToolKind) => void; // ツールを選択する関数
  onDeleteActivePath: () => void; // 選択中パスを削除
  onOpenSettings: () => void; // 設定モーダルを開く
  onSave: () => void; // プロジェクトを保存
  onLoad: () => void; // プロジェクトを読み込み
  onExportJson: () => void; // JSONエクスポート
  onImportJson: () => void; // JSONインポート
};

// コンポーネント
export const Header = ({
  projectName,
  hasUnsavedChanges,
  selectedTool,
  canDeleteActivePath,
  onSelectTool,
  onDeleteActivePath,
  onOpenSettings,
  onSave,
  onLoad,
  onExportJson,
  onImportJson,
}: HeaderProps) => {
  const displayProjectName = projectName ?? 'Untitled';

  return (
    <header className="flex w-full flex-col gap-4 px-5 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <h1 className="text-text shrink-0 text-2xl font-medium">MoPhrase</h1>
        <span
          className="text-text-subtle max-w-[42vw] truncate text-sm"
          title={displayProjectName}
        >
          {displayProjectName}
          {hasUnsavedChanges ? '*' : ''}
        </span>
      </div>

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
        <ToolButton
          title="Delete Active Path"
          icon={Trash2}
          onClick={onDeleteActivePath}
          disabled={!canDeleteActivePath}
        />

        <div className="bg-border mx-2 h-6 w-px" />

        <ToolButton title="Save Project" icon={Save} onClick={onSave} />
        <ToolButton title="Load Project" icon={FolderOpen} onClick={onLoad} />
        <ToolButton
          title="Export Project"
          icon={Download}
          onClick={onExportJson}
        />
        <ToolButton
          title="Import Project"
          icon={Upload}
          onClick={onImportJson}
        />

        <div className="bg-border mx-2 h-6 w-px" />

        <ToolButton title="Settings" icon={Settings} onClick={onOpenSettings} />
      </div>
    </header>
  );
};
