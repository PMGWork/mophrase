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

// シリアライズされたベクトル
export interface SerializedVector {
  x: number;
  y: number;
}

// シリアライズされたパス情報
export interface SerializedPath {
  points: SerializedVector[];
  curves: SerializedVector[][];
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

// 提案のヒットターゲット情報
export interface SuggestionHitTarget {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}


// #region Zodスキーマ定義
// 座標ベクトル
const vectorSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// 提案アイテム
export const suggestionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  curves: z.array(z.array(vectorSchema)),
});

// 提案レスポンス
export const suggestionResponseSchema = z.object({
  suggestions: z.array(suggestionItemSchema).max(3).min(3)
})

// Typescriptの型に変換
export type SuggestionItem = z.infer<typeof suggestionItemSchema>;
export type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;
