import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LLMProvider, LLMReasoningEffort } from '../types';

// LLMプロバイダの設定
type ProviderConfig = {
  defaultModel: string;
  models: { id: string; name?: string }[];
};

// プロバイダとモデルのオプション型
type ProviderModelOption = {
  provider: LLMProvider;
  modelId: string;
  name: string;
};

// サーバーにリクエストを送信して構造化データを取得
async function requestServer<T>(
  provider: LLMProvider,
  model: string,
  prompt: string,
  schema: z.ZodType<T>,
  reasoningEffort?: LLMReasoningEffort,
  imageDataUrl?: string,
): Promise<T> {
  const body: Record<string, unknown> = {
    provider,
    model,
    prompt,
    schema: zodToJsonSchema(schema, { $refStrategy: 'none' }),
    reasoningEffort,
  };
  if (imageDataUrl) {
    body.imageDataUrl = imageDataUrl;
  }
  const response = await fetch(`${window.location.origin}/api/llm/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      `LLM server error (${provider}): ${response.status} ${JSON.stringify(errorBody)}`,
    );
  }

  const data = (await response.json()) as T;
  return schema.parse(data);
}

// 各LLMプロバイダの設定
const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  OpenAI: {
    defaultModel: 'gpt-5.2',
    models: [{ id: 'gpt-5.2', name: 'GPT-5.2' }],
  },
  Google: {
    defaultModel: 'gemini-3-flash-preview',
    models: [{ id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }],
  },
};

// 構造化データを生成する関数
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  model?: string,
  reasoningEffort?: LLMReasoningEffort,
  imageDataUrl?: string,
): Promise<T> {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  const actualModel = model ?? config.defaultModel;
  return requestServer(
    provider,
    actualModel,
    prompt,
    schema,
    reasoningEffort,
    imageDataUrl,
  );
}

// 利用可能なモデルのリストを取得
export function getModels(): ProviderModelOption[] {
  return (Object.entries(PROVIDERS) as [LLMProvider, ProviderConfig][]).flatMap(
    ([provider, config]) =>
      config.models.map((model) => ({
        provider,
        modelId: model.id,
        name: model.name ?? model.id,
      })),
  );
}
