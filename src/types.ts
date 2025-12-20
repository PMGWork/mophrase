/// 型定義
import type p5 from 'p5';
import { z } from 'zod';

// #region 1. 基本/汎用型

// p5.jsベクトル
export type Vector = p5.Vector;

// #region 2. エディタ関連

// 編集ツール
export type EditorTool = 'select' | 'pen';

// 範囲選択用の矩形
export interface MarqueeRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// 選択範囲
export interface SelectionRange {
  pathIndex: number;
  startCurveIndex: number;
  endCurveIndex: number;
}

// ベジエハンドルの選択情報
export interface HandleSelection {
  pathIndex: number;
  keyframeIndex: number;
  handleType: HandleType;
}

// ハンドル種別
export type HandleType = 'ANCHOR' | 'SKETCH_IN' | 'SKETCH_OUT';

// #region 3. コアデータモデル

// キーフレーム
export interface Keyframe {
  time: number;
  position: Vector;
  sketchIn?: Vector;
  sketchOut?: Vector;
  graphIn?: Vector;
  graphOut?: Vector;
}

// 描画パス情報
export interface Path {
  id: string;
  keyframes: Keyframe[];
  duration: number;
  startTime: number;
  modifiers?: Modifier[];
}

// モディファイア
export interface Modifier {
  id: string;
  name: string;
  offsets: ({ dx: number; dy: number } | null)[][];
  graphOffsets?: ({ dx: number; dy: number } | null)[][];
  strength: number;
}

// #region 4. シリアライズ（LLM通信用）

// シリアライズされたハンドル（スケッチ・グラフ共通・極座標）
export interface SerializedHandle {
  angle: number;
  dist: number;
}

// シリアライズされたキーフレーム（正規化済み）
export interface SerializedKeyframe {
  x: number;
  y: number;
  time?: number;
  sketchIn?: SerializedHandle | null;
  sketchOut?: SerializedHandle | null;
  graphIn?: SerializedHandle | null;
  graphOut?: SerializedHandle | null;
}

// シリアライズされたパスのバウンディングボックス
export interface SerializedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// シリアライズされたパス情報
export interface SerializedPath {
  keyframes: SerializedKeyframe[];
  bbox: SerializedBoundingBox;
}

// #region 5. 提案/LLM関連

// LLMプロバイダの種類
export type LLMProvider = 'Gemini' | 'OpenAI' | 'Groq';

// 提案情報
export interface Suggestion {
  id: string;
  title: string;
  path: SerializedPath;
}

// 提案の状態
export type SuggestionState = 'idle' | 'generating' | 'error' | 'input';

// #region 6. フィッティング関連

// フィッティングエラーの結果
export interface FitErrorResult {
  maxError: number;
  index: number;
}

// #region 7. Zodスキーマ定義

// ハンドルスキーマ
const handleSchema = z.object({
  angle: z.number(),
  dist: z.number(),
});

// キーフレームスキーマ
const keyframeSchema = z.object({
  x: z.number(),
  y: z.number(),
  time: z.number(),
  sketchIn: handleSchema.nullable(),
  sketchOut: handleSchema.nullable(),
  graphIn: handleSchema.nullable(),
  graphOut: handleSchema.nullable(),
});

// 提案アイテム
const suggestionItemSchema = z.object({
  title: z.string(),
  keyframes: z.array(keyframeSchema),
});

// 提案レスポンス
export const suggestionResponseSchema = z.object({
  suggestions: z.array(suggestionItemSchema).max(3).min(3),
});

// Typescriptの型に変換
export type SuggestionItem = z.infer<typeof suggestionItemSchema>;
export type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;
