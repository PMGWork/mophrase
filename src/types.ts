/// 型定義
import type p5 from 'p5';
import { z } from 'zod';

export type Vector = p5.Vector;


// #region スキーマ定義
// 描画パス情報
export interface Path {
  points: Vector[];
  curves: Vector[][];
  fitError: { current: FitErrorResult };
}

// シリアライズされたハンドル情報(極座標、正規化済み)
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
  path: SerializedPath;
}


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
  suggestions: z.array(suggestionItemSchema).max(3).min(3)
})

// Typescriptの型に変換
export type SuggestionItem = z.infer<typeof suggestionItemSchema>;
