const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiContent = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

type GeminiOptions = {
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
};

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
