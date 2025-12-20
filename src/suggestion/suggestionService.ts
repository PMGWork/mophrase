import { encode } from '@toon-format/toon';

import type { Config } from '../config';
import { generateStructured } from '../services/llm';
import type {
  SerializedPath,
  SuggestionItem,
  SuggestionResponse,
} from '../types';
import { suggestionResponseSchema } from '../types';

// 提案を取得
export async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  config: Config,
  promptHistory: string[],
): Promise<SuggestionItem[]> {
  const prompt = buildPrompt(serializedPaths, basePrompt, promptHistory);
  const result = await generateStructured<SuggestionResponse>(
    prompt,
    suggestionResponseSchema,
    config.llmProvider,
    config.llmModel,
  );

  console.log('LLM Result:', result);

  return result.suggestions.map(
    (suggestion): SuggestionItem => ({
      title: suggestion.title,
      keyframes: suggestion.keyframes,
    }),
  );
}

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
