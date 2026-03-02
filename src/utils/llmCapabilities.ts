import type { LLMProvider, LLMReasoningEffort } from '../types';

// LLMの推論能力に関する情報を提供するユーティリティ関数群
export const isGraphImageSupported = (
  provider: LLMProvider,
  modelId: string,
): boolean => {
  if (provider === 'Cerebras') return false;
  return !modelId.startsWith('gpt-oss');
};

// LLMの推論能力に関する情報を提供するユーティリティ関数
export type ReasoningCapability =
  | { mode: 'locked'; description: string; resolve: () => LLMReasoningEffort }
  | {
      mode: 'toggle';
      description: string;
      resolve: (current: LLMReasoningEffort) => LLMReasoningEffort;
    }
  | { mode: 'hidden'; resolve: (current: LLMReasoningEffort) => LLMReasoningEffort };

// LLMの推論能力に関する情報を提供する関数
export function getReasoningCapability(
  provider: LLMProvider,
  modelId: string,
): ReasoningCapability {
  // gpt-oss (Cerebras): 常時 medium で固定
  if (modelId.startsWith('gpt-oss')) {
    return {
      mode: 'locked',
      description: 'Always enabled (fixed to medium for GPT OSS)',
      resolve: () => 'medium',
    };
  }

  // GPT-5.2 / Gemini Flash: ON(medium)/OFF(none) トグル
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

  // その他: UI 非表示、effort をそのまま透過
  return {
    mode: 'hidden',
    resolve: (cur) => cur,
  };
}
