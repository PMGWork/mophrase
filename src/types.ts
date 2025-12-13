/// 型定義
import type p5 from 'p5';
import { z } from 'zod';

// #region 基本スキーマ定義
// p5.jsベクトル
export type Vector = p5.Vector;

// マーキー選択用の矩形
export interface MarqueeRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// 選択範囲（制御点のインデックス範囲）
export interface SelectionRange {
  pathIndex: number;
  startCurveIndex: number;
  endCurveIndex: number;
}

// LLMプロバイダの種類
export type LLMProvider = 'Gemini' | 'OpenAI' | 'Groq';

// 描画パス情報
export interface Path {
  points: Vector[];
  times: number[];
  curves: Vector[][];
  timeCurve: Vector[][];
  fitError: { current: FitErrorResult };
}

// シリアライズされたハンドル情報（正規化済み）
export interface SerializedHandlePoint {
  angle: number;
  dist: number;
}

// シリアライズされたアンカーポイント（正規化済み）
export interface SerializedAnchorPoint {
  x: number;
  y: number;
  in?: SerializedHandlePoint | null;
  out?: SerializedHandlePoint | null;
}

// シリアライズされたパスのバウンディングボックス
export interface SerializedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// シリアライズされたセグメント
export interface SerializedSegment {
  startIndex: number;
  endIndex: number;
}

// シリアライズされたパス情報
export interface SerializedPath {
  anchors: SerializedAnchorPoint[];
  segments: SerializedSegment[];
  bbox: SerializedBoundingBox;
}

// フィッティングエラーの結果
export interface FitErrorResult {
  maxError: number;
  index: number;
}

// 範囲情報
export interface Range {
  start: number;
  end: number;
}

// 接ベクトル情報
export interface Tangents {
  start: Vector;
  end: Vector;
}

// ベジエハンドルの選択情報
export interface HandleSelection {
  pathIndex: number;
  curveIndex: number;
  pointIndex: number;
}

// 提案情報
export interface Suggestion {
  id: string;
  title: string;
  type: 'sketch' | 'graph';
  path: SerializedPath;
}

// 提案の状態
export type SuggestionState = 'idle' | 'generating' | 'error' | 'input';

// #region Zodスキーマ定義
// 制御点スキーマ
const handlePointSchema = z.object({
  angle: z.number(),
  dist: z.number(),
});

// アンカーポイントスキーマ
const anchorPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  in: handlePointSchema.nullable().optional(),
  out: handlePointSchema.nullable().optional(),
});

// 提案アイテム
const suggestionItemSchema = z.object({
  title: z.string(),
  anchors: z.array(anchorPointSchema),
});

// 提案レスポンス
export const suggestionResponseSchema = z.object({
  suggestions: z.array(suggestionItemSchema).max(3).min(3),
});

// Typescriptの型に変換
export type SuggestionItem = z.infer<typeof suggestionItemSchema>;
export type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;
