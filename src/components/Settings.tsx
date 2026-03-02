import { useMemo } from 'react';
import { ChevronDown, Settings as SettingsIcon, X } from 'lucide-react';
import {
  FIT_TOLERANCE_DEFAULT,
  FIT_TOLERANCE_MAX,
  FIT_TOLERANCE_MIN,
  type Config,
} from '../config';
import type { LLMProvider, LLMReasoningEffort } from '../types';
import { getModels } from '../services/llm';

type ModelOption = {
  provider: LLMProvider;
  modelId: string;
  name: string;
};

const OPENAI_REASONING_OPTIONS: LLMReasoningEffort[] = [
  'none',
  'low',
  'medium',
];

const isOpenAIGpt52Model = (provider: LLMProvider, modelId: string): boolean =>
  provider === 'OpenAI' && modelId.startsWith('gpt-5.2');

const isGoogleGeminiFlashModel = (
  provider: LLMProvider,
  modelId: string,
): boolean => provider === 'Google' && modelId.includes('flash');

const isOpenRouterClaudeModel = (
  provider: LLMProvider,
  modelId: string,
): boolean =>
  provider === 'OpenRouter' && modelId.startsWith('anthropic/claude-');

const isCerebrasModel = (
  provider: LLMProvider,
): boolean => provider === 'Cerebras';

const getReasoningOptions = (
  provider: LLMProvider,
  modelId: string,
): LLMReasoningEffort[] => {
  if (provider === 'OpenAI' && modelId.startsWith('gpt-5.2')) {
    return OPENAI_REASONING_OPTIONS;
  }
  return [];
};

const resolveReasoningEffort = (
  provider: LLMProvider,
  modelId: string,
  effort: LLMReasoningEffort,
): LLMReasoningEffort => {
  if (isCerebrasModel(provider)) {
    return 'medium';
  }
  if (
    isOpenAIGpt52Model(provider, modelId) ||
    isGoogleGeminiFlashModel(provider, modelId) ||
    isOpenRouterClaudeModel(provider, modelId)
  ) {
    return effort === 'none' ? 'none' : 'medium';
  }
  const options = getReasoningOptions(provider, modelId);
  if (options.length === 0) return effort;
  return options.includes(effort) ? effort : options[0];
};

type SettingsProps = {
  isOpen: boolean;
  config: Config | null;
  onClose: () => void;
  onChange: (next: {
    llmProvider: LLMProvider;
    llmModel: string;
    llmReasoningEffort: LLMReasoningEffort;
    parallelGeneration: boolean;
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
  const reasoningEffort = config?.llmReasoningEffort ?? 'medium';
  const reasoningOptions = getReasoningOptions(selectedProvider, selectedModel);
  const resolvedReasoningEffort = resolveReasoningEffort(
    selectedProvider,
    selectedModel,
    reasoningEffort,
  );
  const isReasoningLockedOn = isCerebrasModel(selectedProvider);
  const isReasoningToggleVisible =
    isReasoningLockedOn ||
    isOpenAIGpt52Model(selectedProvider, selectedModel) ||
    isGoogleGeminiFlashModel(selectedProvider, selectedModel) ||
    isOpenRouterClaudeModel(selectedProvider, selectedModel);
  const isReasoningEnabled = isReasoningLockedOn
    ? true
    : isReasoningToggleVisible && resolvedReasoningEffort !== 'none';
  const reasoningDescription = isReasoningLockedOn
    ? selectedProvider === 'Cerebras'
      ? 'Always enabled (fixed to medium for Cerebras)'
      : 'Always enabled for this model'
    : 'Enable advanced reasoning';
  const shouldShowReasoningEffortSelect =
    reasoningOptions.length > 0 && !isReasoningToggleVisible;
  const parallelGeneration = config?.parallelGeneration ?? false;
  const tolerance = config?.fitTolerance ?? FIT_TOLERANCE_DEFAULT;
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
            className="corner-md cursor-pointer p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-100"
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
                  className="corner-md focus:ring-border h-10 w-full cursor-pointer appearance-none bg-gray-800 py-2 pr-10 pl-4 text-sm text-gray-100 transition-colors hover:bg-gray-700 focus:ring-1 focus:outline-none"
                  value={currentValue}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value) as {
                        provider: LLMProvider;
                        modelId: string;
                      };
                      const nextReasoningEffort = resolveReasoningEffort(
                        parsed.provider,
                        parsed.modelId,
                        'none',
                      );
                      onChange({
                        llmProvider: parsed.provider,
                        llmModel: parsed.modelId,
                        llmReasoningEffort: nextReasoningEffort,
                        parallelGeneration,
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
            {isReasoningToggleVisible && (
              <div
                className={`border-border flex items-center justify-between rounded-lg border bg-gray-800/40 px-3 py-2 ${
                  isReasoningLockedOn ? 'opacity-80' : ''
                }`}
              >
                <div>
                  <div className="text-text text-sm">Reasoning</div>
                  <div className="text-text-subtle text-xs">
                    {reasoningDescription}
                  </div>
                </div>
                <label
                  className={`group inline-flex ${
                    isReasoningLockedOn
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    role="switch"
                    checked={isReasoningEnabled}
                    className="sr-only"
                    disabled={isReasoningLockedOn}
                    onChange={() => {
                      if (isReasoningLockedOn) {
                        return;
                      }
                      const nextEffort = isReasoningEnabled
                        ? 'none'
                        : resolvedReasoningEffort === 'none'
                          ? 'medium'
                          : resolvedReasoningEffort;
                      onChange({
                        llmProvider: selectedProvider,
                        llmModel: selectedModel,
                        llmReasoningEffort: nextEffort,
                        parallelGeneration,
                        fitTolerance: tolerance,
                        testMode,
                      });
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                      isReasoningEnabled
                        ? 'bg-success/80'
                        : 'bg-gray-600 group-hover:bg-gray-500'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        isReasoningEnabled
                          ? 'translate-x-5.5'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>
              </div>
            )}
            {shouldShowReasoningEffortSelect && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="settingsLlmReasoningEffortSelect"
                  className="text-text-muted text-sm"
                >
                  Reasoning Effort
                </label>
                <div className="relative">
                  <select
                    id="settingsLlmReasoningEffortSelect"
                    className="corner-md focus:ring-border h-10 w-full cursor-pointer appearance-none bg-gray-800 py-2 pr-10 pl-4 text-sm text-gray-100 transition-colors hover:bg-gray-700 focus:ring-1 focus:outline-none"
                    value={resolvedReasoningEffort}
                    onChange={(event) => {
                      const nextEffort = event.target
                        .value as LLMReasoningEffort;
                      if (!reasoningOptions.includes(nextEffort)) {
                        return;
                      }
                      onChange({
                        llmProvider: selectedProvider,
                        llmModel: selectedModel,
                        llmReasoningEffort: nextEffort,
                        parallelGeneration,
                        fitTolerance: tolerance,
                        testMode,
                      });
                    }}
                  >
                    {reasoningOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="text-text-muted pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span className="text-text-subtle text-xs font-medium tracking-wider uppercase">
                Advanced
              </span>
            </div>
            <div className="border-border flex items-center justify-between rounded-lg border bg-gray-800/40 px-3 py-2">
              <div>
                <div className="text-text text-sm">Parallel Generation</div>
                <div className="text-text-subtle text-xs">
                  Run all requests concurrently
                </div>
              </div>
              <label className="group inline-flex cursor-pointer">
                <input
                  type="checkbox"
                  role="switch"
                  checked={parallelGeneration}
                  className="sr-only"
                  onChange={() =>
                    onChange({
                      llmProvider: selectedProvider,
                      llmModel: selectedModel,
                      llmReasoningEffort: resolvedReasoningEffort,
                      parallelGeneration: !parallelGeneration,
                      fitTolerance: tolerance,
                      testMode,
                    })
                  }
                />
                <div
                  aria-hidden="true"
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    parallelGeneration
                      ? 'bg-success/80'
                      : 'bg-gray-600 group-hover:bg-gray-500'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      parallelGeneration
                        ? 'translate-x-5.5'
                        : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>
            </div>
            <div className="border-border flex items-center justify-between rounded-lg border bg-gray-800/40 px-3 py-2">
              <div>
                <div className="text-text text-sm">Test Mode</div>
                <div className="text-text-subtle text-xs">
                  Generate 5 times for benchmarking
                </div>
              </div>
              <label className="group inline-flex cursor-pointer">
                <input
                  type="checkbox"
                  role="switch"
                  checked={testMode}
                  className="sr-only"
                  onChange={() =>
                    onChange({
                      llmProvider: selectedProvider,
                      llmModel: selectedModel,
                      llmReasoningEffort: resolvedReasoningEffort,
                      parallelGeneration,
                      fitTolerance: tolerance,
                      testMode: !testMode,
                    })
                  }
                />
                <div
                  aria-hidden="true"
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    testMode
                      ? 'bg-success/80'
                      : 'bg-gray-600 group-hover:bg-gray-500'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      testMode ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>
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
                min={FIT_TOLERANCE_MIN}
                max={FIT_TOLERANCE_MAX}
                step="1"
                value={tolerance}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange({
                    llmProvider: selectedProvider,
                    llmModel: selectedModel,
                    llmReasoningEffort: resolvedReasoningEffort,
                    parallelGeneration,
                    fitTolerance: next,
                    testMode,
                  });
                }}
                className="corner-md [&::-moz-range-thumb]:bg-text [&::-webkit-slider-thumb]:bg-text h-1.5 w-full cursor-pointer appearance-none bg-gray-800 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
