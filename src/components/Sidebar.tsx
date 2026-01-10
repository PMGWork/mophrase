import type { RefObject } from 'react';
import type { Path } from '../types';
import { PropertyEditor, type PropertyEditorHandlers } from './PropertyEditor';

// Props
type SidebarProps = {
  graphCanvasRef: RefObject<HTMLDivElement | null>; // グラフエディタのキャンバス参照
  propertyEditorHandlers?: PropertyEditorHandlers; // プロパティ更新ハンドラ
  activePath: Path | null; // 編集中のアクティブなパス
  hasGraphPath: boolean; // グラフ表示対象があるか
};

// コンポーネント
export const Sidebar = ({
  graphCanvasRef,
  propertyEditorHandlers,
  activePath,
  hasGraphPath,
}: SidebarProps) => (
  <aside
    id="sidebarContainer"
    className="flex h-full w-80 flex-col gap-2.5 overflow-hidden transition-all duration-300"
  >
    <div
      id="graphEditorContainer"
      className="corner-xl flex flex-none flex-col overflow-hidden border border-gray-800 bg-gray-950"
    >
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 px-4 py-2.5">
        <h2 className="text-sm font-medium text-gray-200">Graph Editor</h2>
      </div>

      <div
        id="graphPlaceholder"
        className={`flex aspect-square w-full items-center justify-center text-sm text-gray-500 ${
          hasGraphPath ? 'hidden' : ''
        }`}
      >
        Select a path to edit
      </div>

      <div
        id="graphEditorContent"
        className={`flex aspect-square w-full ${hasGraphPath ? '' : 'hidden'}`}
      >
        <div
          id="graphEditorCanvas"
          ref={graphCanvasRef}
          className="relative h-full w-full border-gray-800"
        />
      </div>
    </div>

    <PropertyEditor activePath={activePath} handlers={propertyEditorHandlers} />
  </aside>
);
