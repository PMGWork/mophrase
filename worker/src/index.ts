import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// 環境変数の型定義
type Env = {
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
};

// サポートするLLMプロバイダの型定義
type Provider = 'OpenAI' | 'Gemini' | 'Cerebras';

// LLM生成リクエストの型定義
type LlmGenerateRequest = {
  provider: Provider;
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
};

// プロバイダのレスポンス型定義
type ProviderResult = {
  status: ContentfulStatusCode;
  body: unknown;
};

// ステータスコードをContentfulStatusCodeに変換するユーティリティ関数
const toContentfulStatus = (status: number): ContentfulStatusCode =>
  (status === 204 || status === 205 || status === 304
    ? 500
    : status) as ContentfulStatusCode;

// OpenAIによる生成
const generateWithOpenAI = async (
  env: Env,
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<ProviderResult> => {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY is not set.' } };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: 'none' },
      text: {
        format: {
          type: 'json_schema',
          name: 'structured_output',
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      status: toContentfulStatus(response.status),
      body: { error: data },
    };
  }

  const outputText =
    data.output_text ??
    data.output?.[0]?.content?.[0]?.text ??
    data.output?.[0]?.content?.[0]?.output_text;

  if (!outputText) {
    return {
      status: 500,
      body: { error: 'OpenAI response has no output text.' },
    };
  }

  return { status: 200, body: JSON.parse(outputText) };
};

// Cerebras用にスキーマから非対応フィールドを削除
const sanitizeSchemaForCerebras = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const sanitize = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // minItems, maxItems を除外
        if (key === 'minItems' || key === 'maxItems') continue;
        result[key] = sanitize(value);
      }
      return result;
    }
    return obj;
  };
  return sanitize(schema) as Record<string, unknown>;
};

// Cerebrasによる生成
const generateWithCerebras = async (
  env: Env,
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<ProviderResult> => {
  const apiKey = env.CEREBRAS_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: 'CEREBRAS_API_KEY is not set.' } };
  }

  const sanitizedSchema = sanitizeSchemaForCerebras(schema);

  const response = await fetch(
    'https://api.cerebras.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.0,
        top_p: 0.95,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'schema',
            strict: true,
            schema: sanitizedSchema,
          },
        },
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    return {
      status: toContentfulStatus(response.status),
      body: { error: data },
    };
  }

  const outputText = data.choices?.[0]?.message?.content;
  if (!outputText) {
    return {
      status: 500,
      body: { error: 'Cerebras response has no output text.' },
    };
  }

  return { status: 200, body: JSON.parse(outputText) };
};

// Geminiによる生成
const generateWithGemini = async (
  env: Env,
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<ProviderResult> => {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: 'GEMINI_API_KEY is not set.' } };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        },
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    return {
      status: toContentfulStatus(response.status),
      body: { error: data },
    };
  }

  const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!outputText) {
    return {
      status: 500,
      body: { error: 'Gemini response has no output text.' },
    };
  }

  return { status: 200, body: JSON.parse(outputText) };
};

// Honoアプリケーションの作成
const app = new Hono<{ Bindings: Env }>();

// LLM生成エンドポイント
app.post('/api/llm/generate', async (c) => {
  const body = await c.req.json<LlmGenerateRequest>();
  const { provider, model, prompt, schema } = body;

  if (!provider || !model || !prompt || !schema) {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  try {
    if (provider === 'OpenAI') {
      const result = await generateWithOpenAI(c.env, model, prompt, schema);
      return c.json(result.body, result.status);
    }

    if (provider === 'Cerebras') {
      const result = await generateWithCerebras(c.env, model, prompt, schema);
      return c.json(result.body, result.status);
    }

    if (provider === 'Gemini') {
      const result = await generateWithGemini(c.env, model, prompt, schema);
      return c.json(result.body, result.status);
    }

    return c.json({ error: 'Unknown provider.' }, 400);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Unknown server error.',
      },
      500,
    );
  }
});

// 404ハンドリング
app.notFound((c) => c.text('Not Found', 404));

export default app;
