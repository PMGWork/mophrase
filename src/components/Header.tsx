import {
  Download,
  FolderOpen,
  MousePointer,
  PenTool,
  Save,
  Settings,
  Spline,
  Trash2,
  Upload,
} from 'lucide-react';
import { FIT_TOLERANCE_MAX, FIT_TOLERANCE_MIN } from '../config';
import type { ToolKind } from '../types';
import { ToolButton } from './ToolButton';

// Props
type HeaderProps = {
  projectName: string | null;
  hasUnsavedChanges: boolean;
  selectedTool: ToolKind; // 選択されているツール
  fitTolerance: number;
  canDeleteActivePath: boolean; // 削除可能か
  onSelectTool: (tool: ToolKind) => void; // ツールを選択する関数
  onChangeFitTolerance: (next: number) => void;
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
  fitTolerance,
  canDeleteActivePath,
  onSelectTool,
  onChangeFitTolerance,
  onDeleteActivePath,
  onOpenSettings,
  onSave,
  onLoad,
  onExportJson,
  onImportJson,
}: HeaderProps) => {
  const displayProjectName = projectName ?? 'Untitled';
  const smoothPercent = Math.round(fitTolerance * 100);

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
        <div className="bg-border mx-1 h-6 w-px" />
        <label
          className="corner-md group flex h-9 cursor-pointer items-center gap-2 bg-gray-800 px-2.5 transition-colors select-none hover:bg-gray-700"
          title={`Sketch Smooth: ${smoothPercent}% of canvas height`}
        >
          <Spline className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-100" />
          <input
            type="range"
            min={FIT_TOLERANCE_MIN}
            max={FIT_TOLERANCE_MAX}
            step="0.001"
            value={fitTolerance}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onChangeFitTolerance(next);
            }}
            className="h-1 w-14 cursor-pointer appearance-none rounded-full bg-gray-600 transition-colors group-hover:bg-gray-500 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-gray-50 [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:active:scale-110 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-50 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-110"
            aria-label="Sketch smooth"
          />
          <span className="text-text-muted w-11 text-right font-mono text-[11px] tabular-nums transition-colors group-hover:text-gray-200">
            {smoothPercent}%
          </span>
        </label>
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
