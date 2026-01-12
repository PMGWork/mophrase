import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LLMProvider } from '../types';

// LLMプロバイダの設定
type ProviderConfig = {
  defaultModel: string;
  models: { id: string; name?: string }[];
  generate: <T>(
    prompt: string,
    schema: z.ZodType<T>,
    model: string,
  ) => Promise<T>;
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
): Promise<T> {
  const response = await fetch(`${window.location.origin}/api/llm/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      prompt,
      schema: zodToJsonSchema(schema, { $refStrategy: 'none' }),
    }),
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
    generate: (prompt, schema, model) =>
      requestServer('OpenAI', model, prompt, schema),
  },

  Gemini: {
    defaultModel: 'gemini-3-flash-preview',
    models: [
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    ],
    generate: (prompt, schema, model) =>
      requestServer('Gemini', model, prompt, schema),
  },

  Groq: {
    defaultModel: 'openai/gpt-oss-120b',
    models: [{ id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' }],
    generate: (prompt, schema, model) =>
      requestServer('Groq', model, prompt, schema),
  },
};

// 構造化データを生成する関数
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  model?: string,
): Promise<T> {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`サポートされていないLLMプロバイダ: ${provider}`);
  }

  const actualModel = model ?? config.defaultModel;
  return config.generate(prompt, schema, actualModel);
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
