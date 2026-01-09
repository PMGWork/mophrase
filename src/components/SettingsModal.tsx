import { ChevronDown, Settings, X } from 'lucide-react';

export const SettingsModal = () => (
  <div
    id="settingsModal"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    style={{ display: 'none' }}
  >
    <div
      id="settingsPanel"
      className="corner-xl w-full max-w-md border border-gray-800 bg-gray-900 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Settings className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-medium text-gray-50">Settings</h2>
        </div>
        <button
          id="closeSettingsButton"
          className="corner-md cursor-pointer p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col divide-y divide-gray-800">
        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wider text-gray-500 uppercase">
              AI
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="settingsLlmModelSelect" className="text-sm text-gray-400">
              LLM Model
            </label>
            <div className="relative">
              <select
                id="settingsLlmModelSelect"
                className="corner-md h-10 w-full cursor-pointer appearance-none bg-gray-800 py-2 pr-10 pl-4 text-sm text-gray-50 transition-colors hover:bg-gray-700 focus:ring-1 focus:ring-gray-700 focus:outline-none"
              />
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wider text-gray-500 uppercase">
              Sketch
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="settingsSketchTolerance" className="text-sm text-gray-400">
                Tolerance
              </label>
              <span
                id="settingsSketchToleranceLabel"
                className="rounded bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-50"
              >
                20px
              </span>
            </div>
            <input
              id="settingsSketchTolerance"
              type="range"
              min="5"
              max="50"
              step="1"
              defaultValue="20"
              className="corner-md h-1.5 w-full cursor-pointer appearance-none bg-gray-700 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-gray-50 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-50"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);
