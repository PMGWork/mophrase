/**
 * Gemini API統合 / Gemini API Integration
 * 
 * Google Gemini APIとの統合を提供します（現在は未使用）
 * Provides integration with Google Gemini API (currently unused)
 * 
 * Note: このモジュールは将来の機能拡張のために残されています
 * Note: This module is kept for future feature expansion
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Geminiコンテンツの型 / Gemini content type
 */
export type GeminiContent = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

/**
 * Geminiリクエストオプション / Gemini request options
 */
type GeminiOptions = {
  model?: string;        // モデル名 / Model name
  apiKey?: string;       // APIキー / API key
  signal?: AbortSignal;  // 中止シグナル / Abort signal
};

/**
 * Gemini APIにコンテンツをリクエスト / Request content from Gemini API
 * 
 * @param contents - 会話コンテンツ / Conversation contents
 * @param options - リクエストオプション / Request options
 * @returns APIレスポンスのPromise / Promise of API response
 */
export const requestGeminiContent = (
  contents: GeminiContent[],
  { model = 'gemini-1.5-flash-latest', apiKey = import.meta.env.GEMINI_API_KEY, signal }: GeminiOptions = {}
) => {
  if (!apiKey) throw new Error('Gemini API キーが設定されていません。');

  const response = fetch(
    `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
      signal,
    }
  );

  return response.then((res) => {
    if (res.ok) return res.json();
    return res.text().then((body) => {
      throw new Error(`Gemini API リクエストに失敗しました: ${res.status} ${body}`);
    });
  });
};
