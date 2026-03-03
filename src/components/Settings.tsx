import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ChevronDown, Settings as SettingsIcon, X } from 'lucide-react';
import {
  FIT_TOLERANCE_DEFAULT,
  isParallelGenerationForced,
  type Config,
  resolveParallelGeneration,
} from '../config';
import type { LLMProvider, LLMReasoningEffort } from '../types';
import { getModels } from '../services/llmService';
import { ModalBackdrop } from './ModalBackdrop';

// 設定パネルから親コンポーネントへの更新内容
export type SettingsUpdate = {
  llmProvider: LLMProvider;
  llmModel: string;
  llmReasoningEffort: LLMReasoningEffort;
  parallelGeneration: boolean;
  graphImageEnabled: boolean;
  fitTolerance: number;
  testMode: boolean;
};

// 設定パネルのプロパティ
type SettingsProps = {
  isOpen: boolean;
  config: Config | null;
  onClose: () => void;
  onChange: (next: SettingsUpdate) => void;
};

// LLM の推論能力の表現方法
type ReasoningCapability =
  | {
      mode: 'toggle';
      description: string;
      resolve: (current: LLMReasoningEffort) => LLMReasoningEffort;
    }
  | { mode: 'hidden'; resolve: (current: LLMReasoningEffort) => LLMReasoningEffort };

// LLM とモデルに応じて推論能力の表現方法を決定
const getReasoningCapability = (
  provider: LLMProvider,
  modelId: string,
): ReasoningCapability => {
  const isToggleModel =
    (provider === 'OpenAI' && modelId.startsWith('gpt-5.2')) ||
    (provider === 'Google' && modelId.includes('flash'));
  if (isToggleModel) {
    return {
      mode: 'toggle',
      description: 'Enable advanced reasoning',
      resolve: (cur) => (cur === 'none' ? 'none' : 'medium'),
    };
  }

  return {
    mode: 'hidden',
    resolve: (cur) => cur,
  };
};

// トグルスイッチの行コンポーネント
const ToggleRow = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) => (
  <div
    className={`border-border flex items-center justify-between rounded-lg border bg-gray-800/40 px-3 py-2 ${
      disabled ? 'opacity-80' : ''
    }`}
  >
    <div>
      <div className="text-text text-sm">{label}</div>
      <div className="text-text-subtle text-xs">{description}</div>
    </div>
    <label
      className={`group inline-flex ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        className="sr-only"
        disabled={disabled}
        onChange={onChange}
      />
      <div
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked
            ? 'bg-success/80'
            : 'bg-gray-600 group-hover:bg-gray-500'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  </div>
);

export const Settings = ({
  isOpen,
  config,
  onClose,
  onChange,
}: SettingsProps) => {
  const models = useMemo(() => getModels(), []);

  const selectedProvider = config?.llmProvider ?? 'OpenAI';
  const selectedModel = config?.llmModel ?? '';
  const reasoningEffort = config?.llmReasoningEffort ?? 'none';
  const reasoning = getReasoningCapability(selectedProvider, selectedModel);
  const resolvedEffort = reasoning.resolve(reasoningEffort);
  const parallelGeneration = resolveParallelGeneration(
    selectedProvider,
    config?.parallelGeneration ?? false,
  );
  const isParallelGenerationLocked = isParallelGenerationForced(selectedProvider);
  const resolvedGraphImageEnabled = config?.graphImageEnabled ?? true;
  const tolerance = config?.fitTolerance ?? FIT_TOLERANCE_DEFAULT;
  const testMode = config?.testMode ?? false;

  // onChange ヘルパー: 変更対象のフィールドだけ渡せば残りはデフォルト値で補完
  const emit = (patch: Partial<SettingsUpdate>) => {
    const next: SettingsUpdate = {
      llmProvider: selectedProvider,
      llmModel: selectedModel,
      llmReasoningEffort: resolvedEffort,
      parallelGeneration,
      graphImageEnabled: resolvedGraphImageEnabled,
      fitTolerance: tolerance,
      testMode,
      ...patch,
    };
    next.parallelGeneration = resolveParallelGeneration(
      next.llmProvider,
      next.parallelGeneration,
    );

    onChange(next);
  };

  const currentValue = JSON.stringify({
    provider: selectedProvider,
    modelId: selectedModel,
  });

  return (
    <ModalBackdrop isOpen={isOpen} onClose={onClose}>
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
                LLM
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="settingsLlmModelSelect"
                className="text-text-muted text-sm"
              >
                Model
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
                      const cap = getReasoningCapability(parsed.provider, parsed.modelId);
                      const effort = cap.resolve('none');
                      emit({
                        llmProvider: parsed.provider,
                        llmModel: parsed.modelId,
                        llmReasoningEffort: effort,
                        parallelGeneration: resolveParallelGeneration(
                          parsed.provider,
                          false,
                        ),
                        graphImageEnabled: true,
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
            {reasoning.mode === 'toggle' && (
              <ToggleRow
                label="Reasoning"
                description={reasoning.description}
                checked={resolvedEffort !== 'none'}
                onChange={() => {
                  const next = resolvedEffort === 'none' ? 'medium' : 'none';
                  emit({ llmReasoningEffort: next });
                }}
              />
            )}
            <ToggleRow
              label="Curve Image"
              description="Send sketch and graph canvas screenshots to LLM"
              checked={resolvedGraphImageEnabled}
              disabled={false}
              onChange={() =>
                emit({ graphImageEnabled: !resolvedGraphImageEnabled })
              }
            />
          </div>

          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span className="text-text-subtle text-xs font-medium tracking-wider uppercase">
                Advanced
              </span>
            </div>
            <ToggleRow
              label="Parallel Generation"
              description={
                isParallelGenerationLocked
                  ? 'Gemini models always run concurrently'
                  : 'Run all requests concurrently'
              }
              checked={parallelGeneration}
              disabled={isParallelGenerationLocked}
              onChange={() => {
                if (isParallelGenerationLocked) return;
                emit({ parallelGeneration: !parallelGeneration });
              }}
            />
            <ToggleRow
              label="Test Mode"
              description="Generate 5 times for benchmarking"
              checked={testMode}
              onChange={() => emit({ testMode: !testMode })}
            />
          </div>

        </div>
      </div>
    </ModalBackdrop>
  );
};
