import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { Groq } from "groq-sdk";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

// LLMを使って構造化データを生成する
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  model?: string
): Promise<T> {
  console.log(prompt);
  console.log(zodToJsonSchema(schema))
  if (provider === "Gemini") {
    return await generateStructuredGemini(prompt, schema, model);
  } else if (provider === "OpenAI") {
    return await generateStructuredOpenAI(prompt, schema, model);
  } else if (provider === "Groq") {
    return await generateStructuredGroq(prompt, schema, model);
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Geminiを使って構造化データを生成する
async function generateStructuredGemini<T>(
  prompt: string,
  schema: z.ZodType<T>,
  model?: string
): Promise<T> {
  const response = await genai.models.generateContent({
    model: model ?? "gemini-flash-latest",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(schema),
    },
  });

  console.log("Gemini response:", response.text!);
  return schema.parse(JSON.parse(response.text!));
}

// OpenAIを使って構造化データを生成する
async function generateStructuredOpenAI<T>(
  prompt: string,
  schema: z.ZodType<T>,
  model?: string
): Promise<T> {
  const response = await openai.responses.parse({
    model: model ?? "gpt-5.1",
    input: [{role: "user", content: prompt}],
    reasoning: { effort: "none" },
    text: {
      format: zodTextFormat(schema, "schema"),
      verbosity: "low"
    },
  });

  const content = response.output_text;
  console.log(JSON.parse(content!));
  return schema.parse(JSON.parse(content!));
}

// Groqを使って構造化データを生成する
async function generateStructuredGroq<T>(
  prompt: string,
  schema: z.ZodType<T>,
  model?: string
): Promise<T> {

  const response = await groq.chat.completions.create({
    model: model ?? "moonshotai/kimi-k2-instruct-0905",
    messages: [{role: "user", content: prompt}],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "schema",
        schema: zodToJsonSchema(schema),
      },
    },
  });

  const content = response.choices[0].message.content;
  console.log(JSON.parse(content!));
  return schema.parse(JSON.parse(content!));
}

// LLMプロバイダの型定義
export type LLMProvider = "Gemini" | "OpenAI" | "Groq";

// LLMプロバイダごとの利用可能モデル一覧
export type ModelInfo = { id: string; name?: string };
export const ProviderModels: Record<LLMProvider, ModelInfo[]> = {
  Gemini: [
    { id: 'gemini-flash-latest', name: 'Gemini Flash' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite' },
  ],
  OpenAI: [
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini' },
    { id: 'gpt-5-nano', name: 'GPT-5 nano' },
  ],
  Groq: [
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
    { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct' },
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' },
  ],
};

export function getModelsForProvider(provider: LLMProvider): ModelInfo[] {
  return ProviderModels[provider] ?? [];
}