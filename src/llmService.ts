import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { Groq } from "groq-sdk";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// インスタンス
const genai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY,
});

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

// プロバイダの種類
export type LLMProvider = "Gemini" | "OpenAI" | "Groq";

// モデル設定
type ModelInfo = { id: string; name?: string };

// プロバイダ設定
type ProviderConfig = {
  defaultModel: string;
  models: ModelInfo[];
  generate: <T>(prompt: string, schema: z.ZodType<T>, model?: string) => Promise<T>;
};

// プロバイダモデルオプション
type ProviderModelOption = {
  provider: LLMProvider;
  modelId: string;
  name: string;
};

// プロバイダ一覧
const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  OpenAI: {
    defaultModel: 'gpt-5.1',
    models: [
      { id: 'gpt-5.1', name: 'GPT-5.1' },
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini' },
    ],
    generate: async (prompt, schema, model) => {
      const actualModel = model ?? 'gpt-5.1';
      const reasoningEffort = actualModel === 'gpt-5.1' ? 'none' : 'minimal';

      const response = await openai.responses.parse({
        model: actualModel,
        input: [{ role: 'user', content: prompt }],
        reasoning: { effort: reasoningEffort },
        text: {
          format: zodTextFormat(schema, 'schema'),
          verbosity: 'low'
        },
      });

      const content = response.output_text;
      return schema.parse(JSON.parse(content!));
    },
  },
  Gemini: {
    defaultModel: 'gemini-flash-latest',
    models: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash' },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite' },
    ],
    generate: async (prompt, schema, model) => {
      const response = await genai.models.generateContent({
        model: model ?? 'gemini-flash-latest',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseJsonSchema: zodToJsonSchema(schema),
        },
      });

      return schema.parse(JSON.parse(response.text!));
    },
  },
  Groq: {
    defaultModel: 'moonshotai/kimi-k2-instruct-0905',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
      { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' },
    ],
    generate: async (prompt, schema, model) => {
      const response = await groq.chat.completions.create({
        model: model ?? 'moonshotai/kimi-k2-instruct-0905',
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'schema',
            schema: zodToJsonSchema(schema),
          },
        },
      });

      const content = response.choices[0].message.content;
      return schema.parse(JSON.parse(content!));
    },
  },
};

// LLMを使って構造化データを生成する
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  model?: string
): Promise<T> {
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) throw new Error(`Unsupported LLM provider: ${provider}`);
  return providerConfig.generate(prompt, schema, model);
}

// 指定されたプロバイダの利用可能モデル一覧を取得する
export function getModelsForProvider(provider: LLMProvider): ModelInfo[] {
  return PROVIDERS[provider]?.models ?? [];
}

// 全プロバイダのモデル一覧を取得する
export function getProviderModelOptions(): ProviderModelOption[] {
  return (Object.entries(PROVIDERS) as [LLMProvider, ProviderConfig][])
    .flatMap(([provider, config]) =>
      config.models.map((model) => ({
        provider,
        modelId: model.id,
        name: model.name ?? model.id,
      }))
    );
}
