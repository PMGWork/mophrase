import type { RefObject } from 'react';
import { MoveHorizontal, Timer } from 'lucide-react';

type SidebarProps = {
  graphEditorCanvasRef: RefObject<HTMLDivElement | null>;
};

export const Sidebar = ({ graphEditorCanvasRef }: SidebarProps) => (
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
        className="flex aspect-square w-full items-center justify-center text-sm text-gray-500"
      >
        Select a path to edit
      </div>

      <div
        id="graphEditorContent"
        className="flex aspect-square w-full"
        style={{ display: 'none' }}
      >
        <div
          id="graphEditorCanvas"
          ref={graphEditorCanvasRef}
          className="relative h-full w-full border-gray-800"
        />
      </div>
    </div>

    <div
      id="propertyEditorContainer"
      className="corner-xl flex min-h-0 flex-1 flex-col overflow-y-auto border border-gray-800 bg-gray-950"
    >
      <div className="flex items-center border-b border-gray-800 bg-gray-900/50 px-4 py-2.5">
        <h2 className="text-sm font-medium text-gray-200">Properties</h2>
      </div>

      <div
        id="propertyPlaceholder"
        className="flex h-full items-center justify-center text-sm text-gray-500"
      >
        Select a path to edit
      </div>

      <div id="propertyEditorContent" className="flex flex-col" style={{ display: 'none' }}>
        <div id="timeSection" className="flex flex-col gap-2 p-3">
          <span className="text-xs font-medium text-gray-400">Time</span>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <i
                className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-gray-500"
              >
                <Timer className="h-3 w-3" />
              </i>
              <input
                id="startTimeInput"
                type="number"
                min={0}
                step={0.01}
                defaultValue={0}
                className="corner-md w-full appearance-none bg-gray-800 py-1.5 pr-6 pl-7 text-xs text-gray-50 focus:ring-1 focus:ring-gray-700 focus:outline-none"
              />
              <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500">
                s
              </span>
            </div>

            <div className="relative flex-1">
              <i
                className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-gray-500"
              >
                <MoveHorizontal className="h-3 w-3" />
              </i>
              <input
                id="durationInput"
                type="number"
                min={0.01}
                step={0.01}
                defaultValue={2}
                className="corner-md w-full appearance-none bg-gray-800 py-1.5 pr-6 pl-7 text-xs text-gray-50 focus:ring-1 focus:ring-gray-700 focus:outline-none"
              />
              <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500">
                s
              </span>
            </div>
          </div>
        </div>

        <div
          id="sketchModifierSection"
          className="flex flex-col gap-2 border-t border-gray-800 p-3"
        >
          <span className="text-xs font-medium text-gray-400">Sketch</span>
          <div
            id="sketchModifierList"
            className="flex flex-col gap-1 overflow-y-auto"
          />
        </div>

        <div
          id="graphModifierSection"
          className="flex flex-col gap-2 border-t border-gray-800 p-3"
        >
          <span className="text-xs font-medium text-gray-400">Graph</span>
          <div id="graphModifierList" className="flex flex-col gap-1 overflow-y-auto" />
        </div>
      </div>
    </div>
  </aside>
);
