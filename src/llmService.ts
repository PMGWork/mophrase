import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { Groq } from "groq-sdk";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type LLMProvider = "Gemini" | "OpenAI" | "Groq";

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
  provider: LLMProvider
): Promise<T> {
  console.log(prompt);
  console.log(zodToJsonSchema(schema))
  if (provider === "Gemini") {
    return await generateStructuredGemini(prompt, schema);
  } else if (provider === "OpenAI") {
    return await generateStructuredOpenAI(prompt, schema);
  } else if (provider === "Groq") {
    return await generateStructuredGroq(prompt, schema);
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

// Geminiを使って構造化データを生成する
async function generateStructuredGemini<T>(
  prompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  const response = await genai.models.generateContent({
    model: "gemini-flash-latest",
    contents: prompt,
    config: {
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
  schema: z.ZodType<T>
): Promise<T> {
  const response = await openai.responses.parse({
    model: "gpt-5.1",
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
  schema: z.ZodType<T>
): Promise<T> {

  const response = await groq.chat.completions.create({
    model: "moonshotai/kimi-k2-instruct-0905",
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