import graphPrompt from './prompts/graphPrompt.md?raw';
import sketchPrompt from './prompts/sketchPrompt.md?raw';
import type { LLMProvider } from './types';

// スキーマ定義
export interface Config {
  showSketch: boolean; // ストロークの初期表示状態
  sketchFitTolerance: number; // ビュー許容誤差(ピクセル)
  graphFitTolerance: number; // グラフ許容誤差(パーセント)
  coarseErrorWeight: number; // 粗い誤差の倍数
  defaultDragMode: number; // デフォルトのドラッグモード
  lineWeight: number; // 線の太さ
  pointSize: number; // 制御点のサイズ
  llmProvider: LLMProvider; // LLMプロバイダ名
  llmModel: string; // LLMモデル名
  sketchPrompt: string; // スケッチ指示プロンプト
  graphPrompt: string; // グラフ指示プロンプト
  markerSize: number; // モーションマーカーのサイズ
}

export interface Colors {
  handle: string; // 制御点の色
  curve: string; // ベジェ曲線の色
  sketch: string; // スケッチ線の色
  border: string; // 境界線の色
  marker: string; // マーカーの色
  background: string; // 背景色
  marquee: string; // マーキーの色
  selection: string; // 選択のハイライト色
}

// デフォルト設定
export const DEFAULT_CONFIG: Config = {
  showSketch: false,
  sketchFitTolerance: 20,
  graphFitTolerance: 5,
  coarseErrorWeight: 2.0,
  defaultDragMode: 1,
  lineWeight: 1,
  pointSize: 6,
  llmProvider: 'OpenAI',
  llmModel: 'gpt-5.2',
  sketchPrompt: sketchPrompt,
  graphPrompt: graphPrompt,
  markerSize: 20,
};

export const DEFAULT_COLORS: Colors = {
  handle: '#ffffff', // White
  curve: '#f9fafb', // Gray-50
  sketch: '#374151', // Gray-700
  border: '#1f2937', // Gray-800
  marker: '#e11d48', // Rose-600
  background: '#030712', // Gray-950
  marquee: '#60a5fa', // Blue-400
  selection: '#eab308', // Yellow-500
};
