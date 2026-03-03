import type { Config } from '../config';
import {
  DEFAULT_CONFIG,
  FIT_TOLERANCE_BASE_CANVAS_HEIGHT,
  FIT_TOLERANCE_MAX,
  FIT_TOLERANCE_MIN,
  resolveParallelGeneration,
} from '../config';

// localStorageのキー
const STORAGE_KEY = 'mophrase:config';

// 保存対象のフィールド（promptは動的に読み込むため除外）
type PersistentConfigFields = Omit<
  Config,
  'suggestionPrompt' | 'suggestionPromptParallel'
>;

// モデルマイグレーションテーブル: [fromProvider, fromModel, toProvider, toModel]
const MODEL_MIGRATIONS: [string, string, string, string][] = [
  ['Cerebras', 'gpt-oss-120b', 'OpenAI', 'gpt-5.2'],
  ['Google', 'gemini-2.5-flash', 'Google', 'gemini-3-flash-preview'],
];

// プロバイダリネームテーブル: [fromProvider, toProvider]
const PROVIDER_RENAMES: [string, string][] = [
  ['GoogleAIStudio', 'Google'],
  ['Cerebras', 'OpenAI'],
];

// 旧バージョンの設定を現行スキーマに移行
const migrateConfig = (
  parsed: Partial<PersistentConfigFields>,
): Partial<PersistentConfigFields> => {
  const legacyParallelRequests = (parsed as { parallelRequests?: unknown })
    .parallelRequests;
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

  if (Number.isFinite(next.fitTolerance)) {
    const tolerance =
      (next.fitTolerance ?? FIT_TOLERANCE_MIN) > 1
        ? (next.fitTolerance ?? FIT_TOLERANCE_MIN) /
          FIT_TOLERANCE_BASE_CANVAS_HEIGHT
        : (next.fitTolerance ?? FIT_TOLERANCE_MIN);
    const normalizedTolerance = Math.min(
      FIT_TOLERANCE_MAX,
      Math.max(FIT_TOLERANCE_MIN, tolerance),
    );
    next.fitTolerance = normalizedTolerance;
  } else {
    next.fitTolerance = undefined;
  }

  // テーブル駆動のモデルマイグレーション
  for (const [fromProv, fromModel, toProv, toModel] of MODEL_MIGRATIONS) {
    if (next.llmProvider === fromProv && next.llmModel === fromModel) {
      next.llmProvider = toProv as typeof next.llmProvider;
      next.llmModel = toModel;
    }
  }

  // テーブル駆動のプロバイダリネーム
  for (const [fromProv, toProv] of PROVIDER_RENAMES) {
    if ((next as { llmProvider?: string }).llmProvider === fromProv) {
      next.llmProvider = toProv as typeof next.llmProvider;
    }
  }
  if (
    next.llmProvider === 'OpenAI' &&
    typeof next.llmModel === 'string' &&
    next.llmModel.startsWith('gpt-oss')
  ) {
    next.llmModel = 'gpt-5.2';
  }
  if (next.llmProvider === 'Google') {
    next.parallelGeneration = true;
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
    const merged = {
      ...DEFAULT_CONFIG,
      ...migrated,
    };
    return {
      ...merged,
      parallelGeneration: resolveParallelGeneration(
        merged.llmProvider,
        merged.parallelGeneration,
      ),
    };
  } catch (error) {
    console.warn('[config] Failed to load config from localStorage:', error);
    return { ...DEFAULT_CONFIG };
  }
};
