import { useMemo } from 'react';
import { ChevronDown, Settings as SettingsIcon, X } from 'lucide-react';
import type { Config } from '../config';
import type { LLMProvider } from '../types';
import { getModels } from '../services/llm';

type ModelOption = {
  provider: LLMProvider;
  modelId: string;
  name: string;
};

type SettingsProps = {
  isOpen: boolean;
  config: Config | null;
  onClose: () => void;
  onChange: (next: {
    llmProvider: LLMProvider;
    llmModel: string;
    fitTolerance: number;
    testMode: boolean;
  }) => void;
};

export const Settings = ({
  isOpen,
  config,
  onClose,
  onChange,
}: SettingsProps) => {
  const models = useMemo<ModelOption[]>(() => getModels(), []);

  const selectedProvider = config?.llmProvider ?? 'OpenAI';
  const selectedModel = config?.llmModel ?? '';
  const tolerance = config?.fitTolerance ?? 20;
  const testMode = config?.testMode ?? false;

  const currentValue = JSON.stringify({
    provider: selectedProvider,
    modelId: selectedModel,
  });

  return (
    <div
      id="settingsModal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ display: isOpen ? 'flex' : 'none' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id="settingsPanel"
        className="corner-xl border-border bg-panel w-full max-w-md border shadow-2xl"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="text-text-muted h-5 w-5" />
            <h2 className="text-text text-lg font-medium">Settings</h2>
          </div>
          <button
            id="closeSettingsButton"
            className="corner-md text-text-muted hover:bg-panel-elevated hover:text-text cursor-pointer p-1.5 transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="divide-border flex flex-col divide-y">
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span className="text-text-subtle text-xs font-medium tracking-wider uppercase">
                AI
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="settingsLlmModelSelect"
                className="text-text-muted text-sm"
              >
                LLM Model
              </label>
              <div className="relative">
                <select
                  id="settingsLlmModelSelect"
                  className="corner-md bg-panel-elevated text-text hover:bg-panel focus:ring-border h-10 w-full cursor-pointer appearance-none py-2 pr-10 pl-4 text-sm transition-colors focus:ring-1 focus:outline-none"
                  value={currentValue}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value) as {
                        provider: LLMProvider;
                        modelId: string;
                      };
                      onChange({
                        llmProvider: parsed.provider,
                        llmModel: parsed.modelId,
                        fitTolerance: tolerance,
                        testMode,
                      });
                    } catch {
                      // ignore invalid value
                    }
                  }}
                >
                  {models.map((model) => (
                    <option
                      key={`${model.provider}:${model.modelId}`}
                      value={JSON.stringify({
                        provider: model.provider,
                        modelId: model.modelId,
                      })}
                    >
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
                <ChevronDown className="text-text-muted pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
              </div>
            </div>
            <div
              className="group border-border bg-panel/60 hover:bg-panel-elevated/80 flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors"
              onClick={() =>
                onChange({
                  llmProvider: selectedProvider,
                  llmModel: selectedModel,
                  fitTolerance: tolerance,
                  testMode: !testMode,
                })
              }
            >
              <div>
                <div className="text-text text-sm">Test Mode</div>
                <div className="text-text-subtle text-xs">
                  Generate 5 times for benchmarking
                </div>
              </div>
              <div
                role="switch"
                aria-checked={testMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  testMode ? 'bg-success/80' : 'bg-panel-elevated'
                }`}
              >
                <span
                  className={`bg-text inline-block h-5 w-5 rounded-full shadow transition-transform ${
                    testMode ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span className="text-text-subtle text-xs font-medium tracking-wider uppercase">
                Sketch
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="settingsSketchTolerance"
                  className="text-text-muted text-sm"
                >
                  Tolerance
                </label>
                <span
                  id="settingsSketchToleranceLabel"
                  className="bg-panel-elevated text-text rounded px-2 py-0.5 font-mono text-xs"
                >
                  {tolerance}px
                </span>
              </div>
              <input
                id="settingsSketchTolerance"
                type="range"
                min="5"
                max="50"
                step="1"
                value={tolerance}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange({
                    llmProvider: selectedProvider,
                    llmModel: selectedModel,
                    fitTolerance: next,
                    testMode,
                  });
                }}
                className="corner-md bg-panel-elevated [&::-moz-range-thumb]:bg-text [&::-webkit-slider-thumb]:bg-text h-1.5 w-full cursor-pointer appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
