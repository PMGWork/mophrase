import { MousePointer, PanelRight, PenTool, Settings } from 'lucide-react';

export const Header = () => (
  <header className="flex w-full flex-col gap-4 px-5 py-3 md:flex-row md:items-center md:justify-between">
    <h1 className="text-2xl font-medium">MoPhrase</h1>

    <div className="flex flex-wrap items-center gap-2">
      <button
        id="selectToolButton"
        title="Selection Tool (V)"
        className="corner-md flex h-9 w-9 cursor-pointer items-center justify-center bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-50"
      >
        <MousePointer className="h-4 w-4" />
      </button>
      <button
        id="penToolButton"
        title="Pen Tool (G)"
        className="corner-md flex h-9 w-9 cursor-pointer items-center justify-center bg-gray-50 text-gray-950 transition-colors hover:bg-gray-200"
      >
        <PenTool className="h-4 w-4" />
      </button>

      <div className="mx-2 h-6 w-px bg-gray-800" />

      <button
        id="settingsButton"
        title="Settings"
        className="corner-md flex h-9 w-9 cursor-pointer items-center justify-center bg-gray-800 text-gray-50 transition-colors hover:bg-gray-700"
      >
        <Settings className="h-4 w-4" />
      </button>
      <button
        id="editMotionButton"
        title="Toggle Sidebar"
        className="corner-md flex h-9 w-9 cursor-pointer items-center justify-center bg-gray-800 text-gray-50 transition-colors hover:bg-gray-700"
      >
        <PanelRight className="h-4 w-4" />
      </button>
    </div>
  </header>
);
