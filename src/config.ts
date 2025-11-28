/// アプリケーション設定

import type { LLMProvider } from './llmService';
import sketchPrompt from './sketchPrompt.md?raw';
import graphPrompt from './graphPrompt.md?raw';

// スキーマ定義
export interface Config {
  showSketch: boolean;        // ストロークの初期表示状態
  sketchFitTolerance: number; // ビュー許容誤差(ピクセル)
  graphFitTolerance: number;  // グラフ許容誤差(パーセント)
  coarseErrorWeight: number;  // 粗い誤差の倍数
  defaultDragMode: number;    // デフォルトのドラッグモード
  lineWeight: number;         // 線の太さ
  pointSize: number;          // 制御点のサイズ
  llmProvider: LLMProvider;   // LLMプロバイダ名
  llmModel: string;           // LLMモデル名
  sketchPrompt: string;       // スケッチ指示プロンプト
  graphPrompt: string;        // グラフ指示プロンプト
};

export interface Colors {
  handle: string;      // 制御点の色
  curve: string;       // ベジェ曲線の色
  sketch: string;      // スケッチ線の色
  border: string;      // 境界線の色
  background: string;  // 背景色
}

// デフォルト設定
export const DEFAULT_CONFIG: Config = {
  showSketch: false,
  sketchFitTolerance: 20,
  graphFitTolerance: 3,
  coarseErrorWeight: 2.0,
  defaultDragMode: 1,
  lineWeight: 1,
  pointSize: 6,
  llmProvider: 'OpenAI',
  llmModel: 'gpt-5.1',
  sketchPrompt: sketchPrompt,
  graphPrompt: graphPrompt,
};

export const DEFAULT_COLORS: Colors = {
  handle: '#fbbf24',      // Amber-400
  curve: '#f9fafb',       // Gray-50
  sketch: '#374151',      // Gray-700
  border: '#1f2937',      // Gray-800
  background: '#030712',  // Gray-950
};
