/**
 * LLM API との通信。
 * シリアライズ済みパスとプロンプト履歴から提案を取得する。
 */

import { encode } from '@toon-format/toon';

import type { Config } from '../config';
import { generateStructured } from '../services/llm';
import type {
  SerializedPath,
  SuggestionItem,
  SuggestionResponse,
} from '../types';
import { suggestionResponseSchema } from '../types';

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
  const suggestionCount = 3;
  const benchmarkRuns = 5;
  const requestOnce = (): Promise<SuggestionResponse> =>
    generateStructured<SuggestionResponse>(
      prompt,
      suggestionResponseSchema,
      config.llmProvider,
      config.llmModel,
      config.llmReasoningEffort,
    );

  if (config.testMode) {
    if (parallelGeneration) {
      await Promise.all(Array.from({ length: benchmarkRuns }, () => requestOnce()));
    } else {
      for (let i = 0; i < benchmarkRuns; i += 1) {
        await requestOnce();
      }
    }

    // テストモードの場合は結果を返さない（UIに反映しない）
    return [];
  }

  const suggestions = parallelGeneration
    ? await fetchSuggestionsInParallel(
        requestOnce,
        suggestionCount,
        options.onSuggestion,
      )
    : await fetchSuggestionsInSeries(
        requestOnce,
        suggestionCount,
        options.onSuggestion,
      );

  console.log('[llm] result:', suggestions);

  return suggestions.map(
    (suggestion): SuggestionItem => ({
      title: suggestion.title,
      modifierTarget: suggestion.modifierTarget,
      confidence: suggestion.confidence,
      keyframes: suggestion.keyframes,
    }),
  );
}

// シリーズで提案を取得
const fetchSuggestionsInSeries = async (
  requestOnce: () => Promise<SuggestionResponse>,
  count: number,
  onSuggestion?: (suggestion: SuggestionItem) => void,
): Promise<SuggestionResponse[]> => {
  const results: SuggestionResponse[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = await requestOnce();
    results.push(result);
    onSuggestion?.(toSuggestionItem(result));
  }
  return results;
};

// 並列で提案を取得
const fetchSuggestionsInParallel = async (
  requestOnce: () => Promise<SuggestionResponse>,
  count: number,
  onSuggestion?: (suggestion: SuggestionItem) => void,
): Promise<SuggestionResponse[]> => {
  const settled = await Promise.allSettled(
    Array.from({ length: count }, () =>
      requestOnce().then((result) => {
        onSuggestion?.(toSuggestionItem(result));
        return result;
      }),
    ),
  );
  const fulfilled = settled
    .filter(
      (result): result is PromiseFulfilledResult<SuggestionResponse> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value);

  if (fulfilled.length === 0) {
    const firstRejected = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw (
      firstRejected?.reason ?? new Error('提案の並列生成に失敗しました。')
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
    promptParts.push('', '## ユーザー指示の履歴');

    promptHistory.forEach((p, i) => {
      const isLatest = i === promptHistory.length - 1;
      const label = isLatest ? '現在の指示' : `指示${i + 1}`;
      promptParts.push(`- **${label}**: ${p}`);
    });

    promptParts.push(
      '',
      '上記の履歴を踏まえ、特に最新の「現在の指示」に従ってパスを修正してください。',
    );
  }

  promptParts.push('', '```toon', encode(serializedPaths), '```');

  return promptParts.join('\n');
}
