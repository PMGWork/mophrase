import type { Config } from '../config';
import { DEFAULT_CONFIG } from '../config';

// localStorageのキー
const STORAGE_KEY = 'mophrase:config';

// 保存対象のフィールド（promptは動的に読み込むため除外）
type PersistentConfigFields = Omit<
  Config,
  'suggestionPrompt' | 'suggestionPromptParallel'
>;

const migrateConfig = (
  parsed: Partial<PersistentConfigFields>,
): Partial<PersistentConfigFields> => {
  const legacyParallelRequests =
    (parsed as { parallelRequests?: unknown }).parallelRequests;
  const normalizedParallelGeneration =
    typeof parsed.parallelGeneration === 'boolean'
      ? parsed.parallelGeneration
      : typeof legacyParallelRequests === 'number' &&
          Number.isFinite(legacyParallelRequests)
        ? legacyParallelRequests > 1
        : undefined;
  const next: Partial<PersistentConfigFields> = {
    ...parsed,
    ...(normalizedParallelGeneration !== undefined
      ? { parallelGeneration: normalizedParallelGeneration }
      : {}),
  };

  if (next.llmProvider === 'Cerebras' && next.llmModel === 'gpt-oss-120b') {
    return {
      ...next,
      llmReasoningEffort: 'medium',
    };
  }

  if (
    next.llmProvider === 'OpenRouter' &&
    next.llmModel === 'google/gemini-3-flash-preview'
  ) {
    return {
      ...next,
      llmProvider: 'Google',
      llmModel: 'gemini-3-flash-preview',
    };
  }

  const legacyProvider = (next as { llmProvider?: string }).llmProvider;
  if (legacyProvider === 'GoogleAIStudio') {
    return {
      ...next,
      llmProvider: 'Google',
    };
  }

  return next;
};

// 設定をlocalStorageに保存
export const saveConfig = (config: Config): void => {
  try {
    const {
      suggestionPrompt: _suggestionPrompt,
      suggestionPromptParallel: _suggestionPromptParallel,
      ...persistentFields
    } = config;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentFields));
  } catch (error) {
    console.warn('[config] Failed to save config to localStorage:', error);
  }
};

// localStorageから設定を読み込み（デフォルト値とマージ）
export const loadConfig = (): Config => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_CONFIG };

    const parsed = JSON.parse(stored) as Partial<PersistentConfigFields>;
    const migrated = migrateConfig(parsed);
    return {
      ...DEFAULT_CONFIG,
      ...migrated,
    };
  } catch (error) {
    console.warn('[config] Failed to load config from localStorage:', error);
    return { ...DEFAULT_CONFIG };
  }
};
