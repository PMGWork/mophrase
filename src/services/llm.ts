import { GoogleGenAI } from '@google/genai';
import { Groq } from 'groq-sdk';
import { OpenAI } from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { LLMProvider } from '../types';

// インスタンス
let genai: GoogleGenAI | null = null;
let openai: OpenAI | null = null;
let groq: Groq | null = null;

function getGenAI(): GoogleGenAI {
  if (!genai) {
    genai = new GoogleGenAI({
      apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    });
  }
  return genai;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    });
  }
  return openai;
}

function getGroq(): Groq {
  if (!groq) {
    groq = new Groq({
      apiKey: import.meta.env.VITE_GROQ_API_KEY,
      dangerouslyAllowBrowser: true,
    });
  }
  return groq;
}

// 型定義
type ProviderConfig = {
  defaultModel: string;
  models: { id: string; name?: string }[];
  generate: <T>(
    prompt: string,
    schema: z.ZodType<T>,
    model: string,
  ) => Promise<T>;
};

type ProviderModelOption = {
  provider: LLMProvider;
  modelId: string;
  name: string;
};

// プロバイダ設定
const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  OpenAI: {
    defaultModel: 'gpt-5.1',
    models: [
      { id: 'gpt-5.1', name: 'GPT-5.1' },
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini' },
    ],
    generate: async (prompt, schema, model) => {
      const reasoningEffort = model === 'gpt-5.1' ? 'none' : 'minimal';

      const response = await getOpenAI().responses.parse({
        model,
        input: [{ role: 'user', content: prompt }],
        reasoning: { effort: reasoningEffort },
        text: {
          format: zodTextFormat(schema, 'schema'),
          verbosity: 'low',
        },
      });

      return parseJsonResponse(response.output_text, schema, 'OpenAI');
    },
  },

  Gemini: {
    defaultModel: 'gemini-flash-latest',
    models: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    generate: async (prompt, schema, model) => {
      const response = await getGenAI().models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: zodToJsonSchema(schema),
        },
      });

      return parseJsonResponse(response.text, schema, 'Gemini');
    },
  },

  Groq: {
    defaultModel: 'moonshotai/kimi-k2-instruct-0905',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
      { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct' },
    ],
    generate: async (prompt, schema, model) => {
      const response = await getGroq().chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'schema',
            schema: zodToJsonSchema(schema),
          },
        },
      });

      return parseJsonResponse(
        response.choices[0].message.content,
        schema,
        'Groq',
      );
    },
  },
};

// #region ヘルパー関数

// JSONレスポンスをパース
function parseJsonResponse<T>(
  content: string | null | undefined,
  schema: z.ZodType<T>,
  providerName: string,
): T {
  if (!content) {
    throw new Error(`${providerName} のレスポンスが空です`);
  }
  return schema.parse(JSON.parse(content));
}

// #region エクスポート関数

// LLMを使って構造化データを生成
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  model?: string,
): Promise<T> {
  const config = PROVIDERS[provider];
  if (!config)
    throw new Error(`サポートされていないLLMプロバイダ: ${provider}`);

  const actualModel = model ?? config.defaultModel;
  return config.generate(prompt, schema, actualModel);
}

// 全プロバイダのモデル一覧を取得
export function getProviderModelOptions(): ProviderModelOption[] {
  return (Object.entries(PROVIDERS) as [LLMProvider, ProviderConfig][]).flatMap(
    ([provider, config]) =>
      config.models.map((model) => ({
        provider,
        modelId: model.id,
        name: model.name ?? model.id,
      })),
  );
}
