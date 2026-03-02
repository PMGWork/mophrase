/**
 * LLM API との通信。
 * シリアライズ済みパスとプロンプト履歴から提案を取得する。
 */

import { encode } from '@toon-format/toon';

import type { Config } from '../config';
import { generateStructured } from '../services/llm';
import type {
  SerializedPath,
  SuggestionBatchResponse,
  SuggestionItem,
  SuggestionResponse,
} from '../types';
import { suggestionBatchResponseSchema, suggestionResponseSchema } from '../types';

// 提案を取得する際のオプション
type FetchSuggestionsOptions = {
  onSuggestion?: (suggestion: SuggestionItem) => void;
};

// 提案を取得
export async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  config: Config,
  promptHistory: string[],
  options: FetchSuggestionsOptions = {},
): Promise<SuggestionItem[]> {
  const parallelGeneration = config.parallelGeneration ?? false;
  const basePrompt = parallelGeneration
    ? config.suggestionPromptParallel
    : config.suggestionPrompt;
  const prompt = buildPrompt(serializedPaths, basePrompt, promptHistory);
  const requestCount = 3;
  const benchmarkRuns = 5;
  const requestSingleOnce = (): Promise<SuggestionResponse> =>
    generateStructured<SuggestionResponse>(
      prompt,
      suggestionResponseSchema,
      config.llmProvider,
      config.llmModel,
      config.llmReasoningEffort,
    );
  const requestBatchOnce = (): Promise<SuggestionBatchResponse> =>
    generateStructured<SuggestionBatchResponse>(
      prompt,
      suggestionBatchResponseSchema,
      config.llmProvider,
      config.llmModel,
      config.llmReasoningEffort,
    );

  if (config.testMode) {
    if (parallelGeneration) {
      await Promise.all(
        Array.from({ length: benchmarkRuns }, () => requestSingleOnce()),
      );
    } else {
      await Promise.all(
        Array.from({ length: benchmarkRuns }, () => requestBatchOnce()),
      );
    }

    // テストモードの場合は結果を返さない（UIに反映しない）
    return [];
  }

  const suggestions = parallelGeneration
    ? await fetchSingleSuggestionsInParallel(
        requestSingleOnce,
        requestCount,
        options.onSuggestion,
      )
    : await fetchBatchedSuggestionsInParallel(
        requestBatchOnce,
        requestCount,
        options.onSuggestion,
      );

  console.log('[llm] result:', suggestions);

  return suggestions.map(toSuggestionItem);
}

// 1件レスポンスを並列取得
const fetchSingleSuggestionsInParallel = async (
  requestOnce: () => Promise<SuggestionResponse>,
  count: number,
  onSuggestion?: (suggestion: SuggestionItem) => void,
): Promise<SuggestionResponse[]> => {
  return fetchInParallel(requestOnce, count, (result) => {
    onSuggestion?.(toSuggestionItem(result));
  });
};

// 3件レスポンスを並列取得
const fetchBatchedSuggestionsInParallel = async (
  requestOnce: () => Promise<SuggestionBatchResponse>,
  count: number,
  onSuggestion?: (suggestion: SuggestionItem) => void,
): Promise<SuggestionResponse[]> => {
  const batches = await fetchInParallel(requestOnce, count, (batch) => {
    batch.suggestions.forEach((suggestion) => {
      onSuggestion?.(toSuggestionItem(suggestion));
    });
  });

  return batches.flatMap((batch) => batch.suggestions);
};

// count 件を並列実行して成功分を返す
const fetchInParallel = async <T>(
  requestOnce: () => Promise<T>,
  count: number,
  onFulfilled?: (result: T) => void,
): Promise<T[]> => {
  const settled = await Promise.allSettled(
    Array.from({ length: count }, () =>
      requestOnce().then((result) => {
        onFulfilled?.(result);
        return result;
      }),
    ),
  );
  const fulfilled: T[] = [];
  let firstRejectedReason: unknown;
  settled.forEach((result) => {
    if (result.status === 'fulfilled') {
      fulfilled.push(result.value);
      return;
    }
    if (firstRejectedReason === undefined) {
      firstRejectedReason = result.reason;
    }
  });

  if (fulfilled.length === 0) {
    throw (
      firstRejectedReason ?? new Error('提案の並列生成に失敗しました。')
    );
  }

  return fulfilled;
};

// SuggestionResponse を SuggestionItem に変換
const toSuggestionItem = (suggestion: SuggestionResponse): SuggestionItem => ({
  title: suggestion.title,
  modifierTarget: suggestion.modifierTarget,
  confidence: suggestion.confidence,
  keyframes: suggestion.keyframes,
});

// プロンプトを構築
function buildPrompt(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  promptHistory: string[],
): string {
  const promptParts = [basePrompt];

  if (promptHistory.length > 0) {
    promptParts.push('', '## Instruction History');

    promptHistory.forEach((p, i) => {
      const isLatest = i === promptHistory.length - 1;
      const label = isLatest ? 'Current Instruction' : `Instruction ${i + 1}`;
      promptParts.push(`- **${label}**: ${p}`);
    });

    promptParts.push(
      '',
      'Based on the instruction history above, update the path by prioritizing the latest "Current Instruction".',
    );
  }

  promptParts.push('', '```toon', encode(serializedPaths), '```');

  return promptParts.join('\n');
}
