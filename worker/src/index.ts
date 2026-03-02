import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// 環境変数の型定義
type Env = {
  OPENAI_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  GEMINI_API_KEY?: string;
};

// サポートするLLMプロバイダの型定義
type Provider = 'OpenAI' | 'Cerebras' | 'OpenRouter' | 'Google';
type OpenAIReasoningEffort = 'none' | 'low' | 'medium';
type CerebrasReasoningEffort = 'medium';
type OpenRouterReasoningEffort = 'none' | 'low' | 'medium' | 'high';
type GoogleReasoningEffort = 'none' | 'low' | 'medium' | 'high';
type ReasoningEffort =
  | OpenAIReasoningEffort
  | CerebrasReasoningEffort
  | OpenRouterReasoningEffort
  | GoogleReasoningEffort;

// LLM生成リクエストの型定義
type LlmGenerateRequest = {
  provider: Provider;
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
  reasoningEffort?: ReasoningEffort;
};

// プロバイダのレスポンス型定義
type ProviderResult = {
  status: ContentfulStatusCode;
  body: unknown;
  meta?: ProviderMeta;
};

// プロバイダのメタデータ型定義
type ProviderMeta = {
  provider: Provider;
  model: string;
  upstreamMs: number;
  jsonDecodeMs: number;
  outputParseMs: number;
  totalMs: number;
  outputChars?: number;
};

// 現在時刻をミリ秒単位で取得するユーティリティ関数
const nowMs = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

// ステータスコードをContentfulStatusCodeに変換するユーティリティ関数
const toContentfulStatus = (status: number): ContentfulStatusCode =>
  (status === 204 || status === 205 || status === 304
    ? 500
    : status) as ContentfulStatusCode;

const isOpenAIReasoningEffort = (
  value: unknown,
): value is OpenAIReasoningEffort =>
  value === 'none' || value === 'low' || value === 'medium';

const isGoogleReasoningEffort = (
  value: unknown,
): value is GoogleReasoningEffort =>
  value === 'none' || value === 'low' || value === 'medium' || value === 'high';

const isGoogleGemini3FlashModel = (model: string): boolean =>
  model.startsWith('gemini-3') && model.includes('flash');

const resolveGoogleThinkingConfig = (
  model: string,
  reasoningEffort?: GoogleReasoningEffort,
): Record<string, unknown> | null => {
  if (isGoogleGemini3FlashModel(model)) {
    return {
      // Gemini 3 Flash は thinkingLevel を利用する。
      thinkingLevel: reasoningEffort === 'none' ? 'minimal' : 'medium',
    };
  }
  return null;
};

const isOpenRouterReasoningEffort = (
  value: unknown,
): value is OpenRouterReasoningEffort =>
  value === 'none' || value === 'low' || value === 'medium' || value === 'high';

const isOpenRouterAnthropicModel = (model: string): boolean =>
  model.startsWith('anthropic/');

// OpenAI Responses APIからテキスト出力を安全に抽出
const extractOpenAIOutputText = (data: unknown): string => {
  if (!data || typeof data !== 'object') return '';

  const root = data as {
    output_text?: unknown;
    output?: unknown;
  };

  if (typeof root.output_text === 'string' && root.output_text.length > 0) {
    return root.output_text;
  }
  if (Array.isArray(root.output_text)) {
    const joined = root.output_text
      .map((value) => (typeof value === 'string' ? value : ''))
      .join('');
    if (joined.length > 0) {
      return joined;
    }
  }

  if (!Array.isArray(root.output)) return '';

  const textParts: string[] = [];

  root.output.forEach((outputItem) => {
    if (!outputItem || typeof outputItem !== 'object') return;
    const content = (outputItem as { content?: unknown }).content;
    if (!Array.isArray(content)) return;

    content.forEach((contentItem) => {
      if (!contentItem || typeof contentItem !== 'object') return;

      const outputText = (contentItem as { output_text?: unknown }).output_text;
      if (typeof outputText === 'string' && outputText.length > 0) {
        textParts.push(outputText);
        return;
      }

      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === 'string' && text.length > 0) {
        textParts.push(text);
        return;
      }

      const parsed = (contentItem as { parsed?: unknown }).parsed;
      if (parsed && typeof parsed === 'object') {
        textParts.push(JSON.stringify(parsed));
      }
    });
  });

  return textParts.join('');
};

// 出力欠落時のデバッグ情報を作成
const summarizeOpenAIOutput = (
  data: unknown,
): {
  responseStatus?: string;
  outputItemTypes: string[];
  contentItemTypes: string[];
} => {
  if (!data || typeof data !== 'object') {
    return { outputItemTypes: [], contentItemTypes: [] };
  }

  const root = data as {
    status?: unknown;
    output?: unknown;
  };

  const outputItemTypes = new Set<string>();
  const contentItemTypes = new Set<string>();

  if (Array.isArray(root.output)) {
    root.output.forEach((outputItem) => {
      if (!outputItem || typeof outputItem !== 'object') return;

      const outputType = (outputItem as { type?: unknown }).type;
      if (typeof outputType === 'string') {
        outputItemTypes.add(outputType);
      }

      const content = (outputItem as { content?: unknown }).content;
      if (!Array.isArray(content)) return;

      content.forEach((contentItem) => {
        if (!contentItem || typeof contentItem !== 'object') return;
        const contentType = (contentItem as { type?: unknown }).type;
        if (typeof contentType === 'string') {
          contentItemTypes.add(contentType);
        }
      });
    });
  }

  return {
    responseStatus: typeof root.status === 'string' ? root.status : undefined,
    outputItemTypes: Array.from(outputItemTypes),
    contentItemTypes: Array.from(contentItemTypes),
  };
};

const stripMarkdownJsonFence = (value: string): string => {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
};

const tryParseJsonText = (
  value: string,
): { parsed: unknown; sourceText: string } | null => {
  const normalized = stripMarkdownJsonFence(value);
  if (!normalized) return null;

  try {
    return { parsed: JSON.parse(normalized), sourceText: normalized };
  } catch {
    // JSON前後に説明文が付くケースに備えて、最外のオブジェクト/配列を再抽出する。
    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      const objectSlice = normalized.slice(objectStart, objectEnd + 1);
      try {
        return { parsed: JSON.parse(objectSlice), sourceText: objectSlice };
      } catch {
        // no-op
      }
    }

    const arrayStart = normalized.indexOf('[');
    const arrayEnd = normalized.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      const arraySlice = normalized.slice(arrayStart, arrayEnd + 1);
      try {
        return { parsed: JSON.parse(arraySlice), sourceText: arraySlice };
      } catch {
        // no-op
      }
    }

    return null;
  }
};

const extractOpenRouterOutputCandidates = (data: unknown): string[] => {
  if (!data || typeof data !== 'object') return [];

  const root = data as {
    output_text?: unknown;
    choices?: unknown;
  };

  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  pushCandidate(root.output_text);
  if (Array.isArray(root.output_text)) {
    root.output_text.forEach((value) => pushCandidate(value));
    const joined = root.output_text
      .map((value) => (typeof value === 'string' ? value : ''))
      .join('')
      .trim();
    if (joined) {
      pushCandidate(joined);
    }
  }

  if (!Array.isArray(root.choices)) return candidates;

  root.choices.forEach((choice) => {
    if (!choice || typeof choice !== 'object') return;
    const choiceNode = choice as {
      text?: unknown;
      message?: unknown;
    };
    pushCandidate(choiceNode.text);

    if (!choiceNode.message || typeof choiceNode.message !== 'object') return;
    const messageNode = choiceNode.message as {
      content?: unknown;
      parsed?: unknown;
      tool_calls?: unknown;
    };

    const pushContent = (content: unknown): void => {
      if (typeof content === 'string') {
        pushCandidate(content);
        return;
      }
      if (!content || typeof content !== 'object') return;
      const contentNode = content as {
        text?: unknown;
        output_text?: unknown;
        arguments?: unknown;
        parsed?: unknown;
        json?: unknown;
      };
      pushCandidate(contentNode.text);
      pushCandidate(contentNode.output_text);
      pushCandidate(contentNode.arguments);
      if (contentNode.parsed && typeof contentNode.parsed === 'object') {
        pushCandidate(JSON.stringify(contentNode.parsed));
      }
      if (contentNode.json && typeof contentNode.json === 'object') {
        pushCandidate(JSON.stringify(contentNode.json));
      }
    };

    if (Array.isArray(messageNode.content)) {
      messageNode.content.forEach((part) => pushContent(part));
      const joined = messageNode.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (!part || typeof part !== 'object') return '';
          const textValue = (part as { text?: unknown }).text;
          return typeof textValue === 'string' ? textValue : '';
        })
        .join('')
        .trim();
      if (joined) {
        pushCandidate(joined);
      }
    } else {
      pushContent(messageNode.content);
    }

    if (messageNode.parsed && typeof messageNode.parsed === 'object') {
      pushCandidate(JSON.stringify(messageNode.parsed));
    }

    if (Array.isArray(messageNode.tool_calls)) {
      messageNode.tool_calls.forEach((toolCall) => {
        if (!toolCall || typeof toolCall !== 'object') return;
        const functionNode = (toolCall as { function?: unknown }).function;
        if (!functionNode || typeof functionNode !== 'object') return;
        pushCandidate((functionNode as { arguments?: unknown }).arguments);
      });
    }
  });

  return candidates;
};

const summarizeOpenRouterOutput = (
  data: unknown,
): {
  choiceCount: number;
  finishReasons: string[];
  messageContentKinds: string[];
  hasToolCalls: boolean;
  hasChoiceText: boolean;
} => {
  if (!data || typeof data !== 'object') {
    return {
      choiceCount: 0,
      finishReasons: [],
      messageContentKinds: [],
      hasToolCalls: false,
      hasChoiceText: false,
    };
  }

  const root = data as { choices?: unknown };
  if (!Array.isArray(root.choices)) {
    return {
      choiceCount: 0,
      finishReasons: [],
      messageContentKinds: [],
      hasToolCalls: false,
      hasChoiceText: false,
    };
  }

  const finishReasons = new Set<string>();
  const messageContentKinds = new Set<string>();
  let hasToolCalls = false;
  let hasChoiceText = false;

  root.choices.forEach((choice) => {
    if (!choice || typeof choice !== 'object') return;
    const choiceNode = choice as {
      finish_reason?: unknown;
      text?: unknown;
      message?: unknown;
    };

    if (typeof choiceNode.finish_reason === 'string') {
      finishReasons.add(choiceNode.finish_reason);
    }
    if (typeof choiceNode.text === 'string' && choiceNode.text.trim()) {
      hasChoiceText = true;
    }

    if (!choiceNode.message || typeof choiceNode.message !== 'object') return;
    const messageNode = choiceNode.message as {
      content?: unknown;
      tool_calls?: unknown;
    };

    if (
      Array.isArray(messageNode.tool_calls) &&
      messageNode.tool_calls.length > 0
    ) {
      hasToolCalls = true;
    }

    if (Array.isArray(messageNode.content)) {
      messageContentKinds.add('array');
      messageNode.content.forEach((part) => {
        if (!part || typeof part !== 'object') {
          if (typeof part === 'string' && part.trim()) {
            messageContentKinds.add('string_part');
          }
          return;
        }
        const partType = (part as { type?: unknown }).type;
        if (typeof partType === 'string') {
          messageContentKinds.add(partType);
          return;
        }
        if (typeof (part as { text?: unknown }).text === 'string') {
          messageContentKinds.add('text');
          return;
        }
        messageContentKinds.add('object_part');
      });
      return;
    }

    if (typeof messageNode.content === 'string' && messageNode.content.trim()) {
      messageContentKinds.add('string');
      return;
    }
    if (messageNode.content === null) {
      messageContentKinds.add('null');
      return;
    }
    if (messageNode.content !== undefined) {
      messageContentKinds.add(typeof messageNode.content);
    }
  });

  return {
    choiceCount: root.choices.length,
    finishReasons: Array.from(finishReasons),
    messageContentKinds: Array.from(messageContentKinds),
    hasToolCalls,
    hasChoiceText,
  };
};

// OpenAIによる生成
const generateWithOpenAI = async (
  env: Env,
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
  reasoningEffort?: OpenAIReasoningEffort,
): Promise<ProviderResult> => {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENAI_API_KEY is not set.' } };
  }

  const t0 = nowMs();
  // o1系列とGPT-5.2のモデルでreasoning effortを送信
  const supportsReasoningEffort =
    model.startsWith('o1') || model.startsWith('gpt-5.2');
  const requestBody: Record<string, unknown> = {
    model,
    input: prompt,
    text: {
      format: {
        type: 'json_schema',
        name: 'structured_output',
        strict: true,
        schema,
      },
    },
  };
  if (supportsReasoningEffort) {
    requestBody.reasoning = { effort: reasoningEffort ?? 'none' };
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const t1 = nowMs();
  const data = await response.json();
  const t2 = nowMs();
  if (!response.ok) {
    return {
      status: toContentfulStatus(response.status),
      body: { error: data },
    };
  }

  const outputText = extractOpenAIOutputText(data);

  if (!outputText) {
    return {
      status: 500,
      body: {
        error: 'OpenAI response has no output text.',
        details: summarizeOpenAIOutput(data),
      },
    };
  }

  const t3 = nowMs();
  const parsed = JSON.parse(outputText);
  const t4 = nowMs();

  return {
    status: 200,
    body: parsed,
    meta: {
      provider: 'OpenAI',
      model,
      upstreamMs: t1 - t0,
      jsonDecodeMs: t2 - t1,
      outputParseMs: t4 - t3,
      totalMs: t4 - t0,
      outputChars: outputText.length,
    },
  };
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

// OpenRouter経由の一部プロバイダ互換のため、配列制約を正規化
const sanitizeSchemaForOpenRouter = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const sanitize = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'maxItems') {
          continue;
        }
        if (
          key === 'minimum' ||
          key === 'maximum' ||
          key === 'exclusiveMinimum' ||
          key === 'exclusiveMaximum' ||
          key === 'multipleOf'
        ) {
          continue;
        }
        if (key === 'minItems' && typeof value === 'number') {
          result[key] = value > 1 ? 1 : value;
          continue;
        }
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
  const runRequest = async (
    targetModel: string,
  ): Promise<{
    response: Response;
    data: unknown;
    t0: number;
    t1: number;
    t2: number;
    model: string;
  }> => {
    const requestBody: Record<string, unknown> = {
      model: targetModel,
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
    };
    requestBody.reasoning_effort = 'medium';

    const t0 = nowMs();
    const response = await fetch(
      'https://api.cerebras.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    );
    const t1 = nowMs();
    const data = await response.json();
    const t2 = nowMs();
    return { response, data, t0, t1, t2, model: targetModel };
  };

  const result = await runRequest(model);

  if (!result.response.ok) {
    return {
      status: toContentfulStatus(result.response.status),
      body: { error: result.data },
    };
  }

  const rawOutputText =
    result.data &&
    typeof result.data === 'object' &&
    Array.isArray((result.data as { choices?: unknown[] }).choices)
      ? ((
          result.data as {
            choices: Array<{ message?: { content?: unknown } }>;
          }
        ).choices[0]?.message?.content ?? '')
      : '';
  const outputText = typeof rawOutputText === 'string' ? rawOutputText : '';
  if (!outputText) {
    return {
      status: 500,
      body: { error: 'Cerebras response has no output text.' },
    };
  }

  const t3 = nowMs();
  const parsed = JSON.parse(outputText);
  const t4 = nowMs();

  return {
    status: 200,
    body: parsed,
    meta: {
      provider: 'Cerebras',
      model: result.model,
      upstreamMs: result.t1 - result.t0,
      jsonDecodeMs: result.t2 - result.t1,
      outputParseMs: t4 - t3,
      totalMs: t4 - result.t0,
      outputChars: outputText.length,
    },
  };
};

// OpenRouterによる生成
const generateWithOpenRouter = async (
  env: Env,
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
  reasoningEffort?: OpenRouterReasoningEffort,
): Promise<ProviderResult> => {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: 'OPENROUTER_API_KEY is not set.' } };
  }

  const sanitizedSchema = sanitizeSchemaForOpenRouter(schema);
  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'schema',
        strict: true,
        schema: sanitizedSchema,
      },
    },
  };
  if (isOpenRouterAnthropicModel(model)) {
    requestBody.provider = {
      only: ['anthropic'],
      require_parameters: true,
    };
    if (reasoningEffort === 'none') {
      requestBody.reasoning = {
        enabled: false,
        effort: 'none',
      };
    } else {
      requestBody.reasoning = {
        enabled: true,
        effort: reasoningEffort ?? 'medium',
      };
    }
  }

  const t0 = nowMs();
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );
  const t1 = nowMs();
  const data = await response.json();
  const t2 = nowMs();
  if (!response.ok) {
    return {
      status: toContentfulStatus(response.status),
      body: { error: data },
    };
  }

  const outputCandidates = extractOpenRouterOutputCandidates(data);
  if (outputCandidates.length === 0) {
    return {
      status: 500,
      body: {
        error: 'OpenRouter response has no output text.',
        details: summarizeOpenRouterOutput(data),
      },
    };
  }

  const t3 = nowMs();
  const parsedResult = outputCandidates
    .map((candidate) => tryParseJsonText(candidate))
    .find((value) => value !== null);
  const t4 = nowMs();
  if (!parsedResult) {
    return {
      status: 500,
      body: {
        error: 'OpenRouter response has no valid JSON output.',
        details: {
          ...summarizeOpenRouterOutput(data),
          candidateCount: outputCandidates.length,
          firstCandidatePreview: outputCandidates[0].slice(0, 200),
        },
      },
    };
  }

  return {
    status: 200,
    body: parsedResult.parsed,
    meta: {
      provider: 'OpenRouter',
      model,
      upstreamMs: t1 - t0,
      jsonDecodeMs: t2 - t1,
      outputParseMs: t4 - t3,
      totalMs: t4 - t0,
      outputChars: parsedResult.sourceText.length,
    },
  };
};

// Googleによる生成（Google AI Studio API）
const generateWithGoogle = async (
  env: Env,
  model: string,
  prompt: string,
  schema: Record<string, unknown>,
  reasoningEffort?: GoogleReasoningEffort,
): Promise<ProviderResult> => {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: 'GEMINI_API_KEY is not set.' } };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const resolvedThinkingConfig = resolveGoogleThinkingConfig(
    model,
    reasoningEffort,
  );
  const buildRequestBody = (
    withSchema: boolean,
    withThinking: boolean,
  ): Record<string, unknown> => {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json',
    };
    if (withThinking && resolvedThinkingConfig) {
      generationConfig.thinkingConfig = resolvedThinkingConfig;
    }
    if (withSchema) {
      generationConfig.responseJsonSchema = schema;
    }
    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig,
    };
  };

  const runRequest = async (
    withSchema: boolean,
    withThinking: boolean,
  ): Promise<{
    response: Response;
    data: unknown;
    t0: number;
    t1: number;
    t2: number;
  }> => {
    const t0 = nowMs();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(withSchema, withThinking)),
    });
    const t1 = nowMs();
    const data = await response.json();
    const t2 = nowMs();
    return { response, data, t0, t1, t2 };
  };

  let withSchema = true;
  let withThinking = resolvedThinkingConfig !== null;
  let result = await runRequest(withSchema, withThinking);
  for (let i = 0; i < 2 && !result.response.ok; i += 1) {
    const errorMessage =
      result.data &&
      typeof result.data === 'object' &&
      typeof (result.data as { error?: { message?: unknown } }).error
        ?.message === 'string'
        ? (result.data as { error: { message: string } }).error.message
        : '';
    const isSchemaDepthError =
      result.response.status === 400 &&
      errorMessage.includes('maximum allowed nesting depth');
    const isThinkingUnsupportedError =
      result.response.status === 400 &&
      (errorMessage.includes(
        'Thinking level is not supported for this model.',
      ) ||
        errorMessage.includes(
          'thinking level is not supported for this model',
        ));

    let shouldRetry = false;
    if (isSchemaDepthError && withSchema) {
      // Googleのスキーマ深度制限に当たった場合は、schema指定なしで再試行する。
      withSchema = false;
      shouldRetry = true;
    }
    if (isThinkingUnsupportedError && withThinking) {
      // Thinking非対応モデルの場合は、thinkingConfigを外して再試行する。
      withThinking = false;
      shouldRetry = true;
    }
    if (!shouldRetry) {
      break;
    }
    result = await runRequest(withSchema, withThinking);
  }
  if (!result.response.ok) {
    return {
      status: toContentfulStatus(result.response.status),
      body: { error: result.data },
    };
  }

  const candidates =
    result.data && typeof result.data === 'object'
      ? (
          result.data as {
            candidates?: Array<{ content?: { parts?: unknown[] } }>;
          }
        ).candidates
      : undefined;
  const parts = Array.isArray(candidates)
    ? candidates[0]?.content?.parts
    : undefined;
  const outputText = Array.isArray(parts)
    ? parts
        .map((part: unknown) =>
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .join('')
    : '';

  if (!outputText) {
    return {
      status: 500,
      body: { error: 'Google AI Studio response has no output text.' },
    };
  }

  const t3 = nowMs();
  const parsed = JSON.parse(outputText);
  const t4 = nowMs();

  return {
    status: 200,
    body: parsed,
    meta: {
      provider: 'Google',
      model,
      upstreamMs: result.t1 - result.t0,
      jsonDecodeMs: result.t2 - result.t1,
      outputParseMs: t4 - t3,
      totalMs: t4 - result.t0,
      outputChars: outputText.length,
    },
  };
};

// Honoアプリケーションの作成
const app = new Hono<{ Bindings: Env }>();

// LLM生成エンドポイント
app.post('/api/llm/generate', async (c) => {
  const requestStart = nowMs();
  const body = await c.req.json<LlmGenerateRequest>();
  const { provider, model, prompt, schema, reasoningEffort } = body;
  const resolvedOpenAIReasoningEffort = isOpenAIReasoningEffort(reasoningEffort)
    ? reasoningEffort
    : undefined;
  const resolvedOpenRouterReasoningEffort = isOpenRouterReasoningEffort(
    reasoningEffort,
  )
    ? reasoningEffort
    : undefined;
  const resolvedGoogleReasoningEffort = isGoogleReasoningEffort(reasoningEffort)
    ? reasoningEffort
    : undefined;

  if (!provider || !model || !prompt || !schema) {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  const schemaBytes = JSON.stringify(schema).length;
  const promptChars = prompt.length;

  try {
    if (provider === 'OpenAI') {
      const result = await generateWithOpenAI(
        c.env,
        model,
        prompt,
        schema,
        resolvedOpenAIReasoningEffort,
      );
      const totalMs = nowMs() - requestStart;
      if (result.meta) {
        c.header('x-llm-provider', result.meta.provider);
        c.header('x-llm-model', result.meta.model);
        c.header('x-llm-upstream-ms', result.meta.upstreamMs.toFixed(2));
        c.header('x-llm-json-decode-ms', result.meta.jsonDecodeMs.toFixed(2));
        c.header('x-llm-output-parse-ms', result.meta.outputParseMs.toFixed(2));
        c.header('x-llm-total-ms', totalMs.toFixed(2));
        c.header('x-llm-schema-bytes', String(schemaBytes));
        c.header('x-llm-prompt-chars', String(promptChars));
        if (result.meta.outputChars !== undefined) {
          c.header('x-llm-output-chars', String(result.meta.outputChars));
        }
      }
      return c.json(result.body, result.status);
    }

    if (provider === 'Cerebras') {
      const result = await generateWithCerebras(c.env, model, prompt, schema);
      const totalMs = nowMs() - requestStart;
      if (result.meta) {
        c.header('x-llm-provider', result.meta.provider);
        c.header('x-llm-model', result.meta.model);
        c.header('x-llm-upstream-ms', result.meta.upstreamMs.toFixed(2));
        c.header('x-llm-json-decode-ms', result.meta.jsonDecodeMs.toFixed(2));
        c.header('x-llm-output-parse-ms', result.meta.outputParseMs.toFixed(2));
        c.header('x-llm-total-ms', totalMs.toFixed(2));
        c.header('x-llm-schema-bytes', String(schemaBytes));
        c.header('x-llm-prompt-chars', String(promptChars));
        if (result.meta.outputChars !== undefined) {
          c.header('x-llm-output-chars', String(result.meta.outputChars));
        }
      }
      return c.json(result.body, result.status);
    }

    if (provider === 'OpenRouter') {
      const result = await generateWithOpenRouter(
        c.env,
        model,
        prompt,
        schema,
        resolvedOpenRouterReasoningEffort,
      );
      const totalMs = nowMs() - requestStart;
      if (result.meta) {
        c.header('x-llm-provider', result.meta.provider);
        c.header('x-llm-model', result.meta.model);
        c.header('x-llm-upstream-ms', result.meta.upstreamMs.toFixed(2));
        c.header('x-llm-json-decode-ms', result.meta.jsonDecodeMs.toFixed(2));
        c.header('x-llm-output-parse-ms', result.meta.outputParseMs.toFixed(2));
        c.header('x-llm-total-ms', totalMs.toFixed(2));
        c.header('x-llm-schema-bytes', String(schemaBytes));
        c.header('x-llm-prompt-chars', String(promptChars));
        if (result.meta.outputChars !== undefined) {
          c.header('x-llm-output-chars', String(result.meta.outputChars));
        }
      }
      return c.json(result.body, result.status);
    }

    if (provider === 'Google') {
      const result = await generateWithGoogle(
        c.env,
        model,
        prompt,
        schema,
        resolvedGoogleReasoningEffort,
      );
      const totalMs = nowMs() - requestStart;
      if (result.meta) {
        c.header('x-llm-provider', result.meta.provider);
        c.header('x-llm-model', result.meta.model);
        c.header('x-llm-upstream-ms', result.meta.upstreamMs.toFixed(2));
        c.header('x-llm-json-decode-ms', result.meta.jsonDecodeMs.toFixed(2));
        c.header('x-llm-output-parse-ms', result.meta.outputParseMs.toFixed(2));
        c.header('x-llm-total-ms', totalMs.toFixed(2));
        c.header('x-llm-schema-bytes', String(schemaBytes));
        c.header('x-llm-prompt-chars', String(promptChars));
        if (result.meta.outputChars !== undefined) {
          c.header('x-llm-output-chars', String(result.meta.outputChars));
        }
      }
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
