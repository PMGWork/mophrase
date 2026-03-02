import keyframePromptCommon from './prompts/keyframePrompt.common.md?raw';
import suggestionPromptParallel from './prompts/keyframePrompt.parallel.md?raw';
import suggestionPrompt from './prompts/keyframePrompt.serial.md?raw';
import type { LLMProvider, LLMReasoningEffort } from './types';

// スキーマ定義
export interface Config {
  fitTolerance: number; // ビュー許容誤差(ピクセル)
  coarseErrorWeight: number; // 粗い誤差の倍数
  lineWeight: number; // 線の太さ
  pointSize: number; // 制御点のサイズ
  llmProvider: LLMProvider; // LLMプロバイダ名
  llmModel: string; // LLMモデル名
  llmReasoningEffort: LLMReasoningEffort; // 推論強度
  parallelGeneration: boolean; // 提案生成を並列で実行するか
  testMode: boolean; // テストモード（5回生成してベンチマーク）
  suggestionPrompt: string; // 直列生成用キーフレーム補正プロンプト
  suggestionPromptParallel: string; // 並列生成用キーフレーム補正プロンプト
}

// プロジェクト設定の型定義
const composePrompt = (common: string, modeSpecific: string): string => {
  const parts = [common.trim(), modeSpecific.trim()].filter(
    (part) => part.length > 0,
  );
  return parts.join('\n\n');
};

// プロジェクト設定の型定義
export interface Colors {
  handle: string; // 制御点の色
  curve: string; // ベジェ曲線の色
  sketch: string; // スケッチ線の色
  border: string; // 境界線の色
  background: string; // 背景色
  marquee: string; // マーキーの色
  selection: string; // 選択のハイライト色
}

// フィット許容誤差の最小値、最大値、デフォルト値
export const FIT_TOLERANCE_MIN = 20;
export const FIT_TOLERANCE_MAX = 80;
export const FIT_TOLERANCE_DEFAULT = 40;

// デフォルト設定
export const DEFAULT_CONFIG: Config = {
  fitTolerance: FIT_TOLERANCE_DEFAULT,
  coarseErrorWeight: 2.0,
  lineWeight: 1,
  pointSize: 6,
  llmProvider: 'OpenAI',
  llmModel: 'gpt-5.2',
  llmReasoningEffort: 'medium',
  parallelGeneration: false,
  testMode: false,
  suggestionPrompt: composePrompt(keyframePromptCommon, suggestionPrompt),
  suggestionPromptParallel: composePrompt(
    keyframePromptCommon,
    suggestionPromptParallel,
  ),
};

// デフォルトの色設定
export const DEFAULT_COLORS: Colors = {
  handle: '#ffffff', // White
  curve: '#f9fafb', // Gray-50
  sketch: '#374151', // Gray-700
  border: '#1f2937', // Gray-800
  background: '#030712', // Gray-950
  marquee: '#60a5fa', // Blue-400
  selection: '#eab308', // Yellow-500
};
