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

const CONSOLE_IMAGE_MAX_WIDTH = 320;
const CONSOLE_IMAGE_MAX_HEIGHT = 240;

// コンソールに画像をプレビュー表示するための関数
const clampConsolePreviewSize = (
  width: number,
  height: number,
): { width: number; height: number } => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(
    1,
    CONSOLE_IMAGE_MAX_WIDTH / safeWidth,
    CONSOLE_IMAGE_MAX_HEIGHT / safeHeight,
  );

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
};

// 画像データURLをコンソールにプレビュー表示する関数
const previewImageInConsole = (dataUrl: string): void => {
  const image = new Image();
  image.onload = () => {
    const naturalWidth = image.naturalWidth || 1;
    const naturalHeight = image.naturalHeight || 1;
    const previewSize = clampConsolePreviewSize(naturalWidth, naturalHeight);
    const paddingY = Math.max(1, Math.ceil(previewSize.height / 2));
    const paddingX = Math.max(1, Math.ceil(previewSize.width / 2));

    console.log('[llm] image', {
      width: naturalWidth,
      height: naturalHeight,
      previewWidth: previewSize.width,
      previewHeight: previewSize.height,
      maxWidth: CONSOLE_IMAGE_MAX_WIDTH,
      maxHeight: CONSOLE_IMAGE_MAX_HEIGHT,
    });
    console.log(
      '%c ',
      [
        'font-size:1px',
        `padding:${paddingY}px ${paddingX}px`,
        'background-repeat:no-repeat',
        'background-position:center',
        `background-size:${previewSize.width}px ${previewSize.height}px`,
        `background-image:url("${dataUrl}")`,
        'background-color:#111',
        'border:1px solid #333',
      ].join(';'),
    );
  };
  image.onerror = () => {
    // 画像読み込みに失敗した場合は制限サイズ内で固定表示する。
    console.log(
      '%c ',
      [
        'font-size:1px',
        `padding:${Math.ceil(CONSOLE_IMAGE_MAX_HEIGHT / 2)}px ${Math.ceil(CONSOLE_IMAGE_MAX_WIDTH / 2)}px`,
        'background-repeat:no-repeat',
        'background-position:center',
        `background-size:${CONSOLE_IMAGE_MAX_WIDTH}px ${CONSOLE_IMAGE_MAX_HEIGHT}px`,
        `background-image:url("${dataUrl}")`,
        'background-color:#111',
        'border:1px solid #333',
      ].join(';'),
    );
  };
  image.src = dataUrl;
};

// サーバーにリクエストを送信して構造化データを取得
async function requestServer<T>(
  provider: LLMProvider,
  model: string,
  prompt: string,
  schema: z.ZodType<T>,
  reasoningEffort?: LLMReasoningEffort,
  priorityProcessing?: boolean,
  imageDataUrls?: string[],
): Promise<T> {
  const usePriorityProcessing =
    provider === 'OpenAI' &&
    model.startsWith('gpt-5.4') &&
    priorityProcessing === true;
  const requestId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const body: Record<string, unknown> = {
    provider,
    model,
    prompt,
    schema: zodToJsonSchema(schema, { $refStrategy: 'none' }),
    reasoningEffort,
    priorityProcessing: usePriorityProcessing,
  };
  if (Array.isArray(imageDataUrls) && imageDataUrls.length > 0) {
    body.imageDataUrls = imageDataUrls;
  }
  const promptPreview =
    prompt.length > 400 ? `${prompt.slice(0, 400)}...` : prompt;
  console.log('[llm] input', {
    requestId,
    provider,
    model,
    reasoningEffort: reasoningEffort ?? 'none',
    promptPreview,
    promptChars: prompt.length,
    schema: body.schema,
    imageCount: imageDataUrls?.length ?? 0,
  });
  imageDataUrls?.forEach((imageDataUrl) => {
    previewImageInConsole(imageDataUrl);
  });
  let response: Response;
  try {
    response = await fetch(`${window.location.origin}/api/llm/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-llm-request-id': requestId,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('[llm] network error', {
      requestId,
      provider,
      model,
      error,
    });
    throw error;
  }
  const responseMeta = {
    requestId: response.headers.get('x-llm-request-id') ?? requestId,
    provider: response.headers.get('x-llm-provider'),
    model: response.headers.get('x-llm-model'),
    upstreamMs: response.headers.get('x-llm-upstream-ms'),
    totalMs: response.headers.get('x-llm-total-ms'),
    outputChars: response.headers.get('x-llm-output-chars'),
    serviceTier: response.headers.get('x-llm-service-tier'),
    schemaBytes: response.headers.get('x-llm-schema-bytes'),
    promptChars: response.headers.get('x-llm-prompt-chars'),
  };
  if (
    responseMeta.totalMs ||
    responseMeta.upstreamMs ||
    responseMeta.schemaBytes
  ) {
    console.log('[llm] latency', {
      requestId,
      provider: responseMeta.provider ?? provider,
      model: responseMeta.model ?? model,
      serviceTier: responseMeta.serviceTier ?? undefined,
      totalMs: responseMeta.totalMs ? Number(responseMeta.totalMs) : undefined,
      upstreamMs: responseMeta.upstreamMs
        ? Number(responseMeta.upstreamMs)
        : undefined,
      schemaBytes: responseMeta.schemaBytes
        ? Number(responseMeta.schemaBytes)
        : undefined,
      promptChars: responseMeta.promptChars
        ? Number(responseMeta.promptChars)
        : undefined,
      outputChars: responseMeta.outputChars
        ? Number(responseMeta.outputChars)
        : undefined,
    });
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    console.error('[llm] error', {
      requestId,
      status: response.status,
      meta: responseMeta,
      body: errorBody,
    });
    throw new Error(
      `LLM server error (${provider}): ${response.status} ${JSON.stringify(errorBody)}`,
    );
  }

  const data = (await response.json()) as unknown;
  console.log('[llm] output', {
    requestId,
    status: response.status,
    meta: responseMeta,
    body: data,
  });
  const parsed = schema.parse(data);
  return parsed;
}

// 各LLMプロバイダの設定
const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  OpenAI: {
    defaultModel: 'gpt-5.4',
    models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }],
  },
  Google: {
    defaultModel: 'gemini-3-flash-preview',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
      {
        id: 'gemini-3.1-flash-lite-preview',
        name: 'Gemini 3.1 Flash Lite',
      },
    ],
  },
};

// 構造化データを生成する関数
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  provider: LLMProvider,
  model?: string,
  reasoningEffort?: LLMReasoningEffort,
  priorityProcessing?: boolean,
  imageDataUrls?: string[],
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
    priorityProcessing,
    imageDataUrls,
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
