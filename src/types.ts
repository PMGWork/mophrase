/// 型定義
import type p5 from 'p5';
import { z } from 'zod';

// #region 1. エディタ関連

// 編集ツール
export type ToolKind = 'select' | 'pen';

// モディファイア種別
export type ModifierKind = 'sketch' | 'graph';

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

// ハンドルドラッグモード
export type HandleDragMode = 'mirror' | 'free';

// #region 2. コアデータモデル

// キーフレーム
export interface Keyframe {
  time: number;
  position: p5.Vector;
  sketchIn?: p5.Vector;
  sketchOut?: p5.Vector;
  graphIn?: p5.Vector;
  graphOut?: p5.Vector;
}

// 描画パス情報
export interface Path {
  id: string;
  keyframes: Keyframe[];
  duration: number;
  startTime: number;
  sketchModifiers?: SketchModifier[];
  graphModifiers?: GraphModifier[];
}

// スケッチモディファイアのキーフレーム差分
export interface SketchKeyframeDelta {
  positionDelta?: { x: number; y: number };
  sketchInDelta?: { x: number; y: number };
  sketchOutDelta?: { x: number; y: number };
}

// グラフモディファイアのキーフレーム差分
export interface GraphKeyframeDelta {
  graphInDelta?: { x: number; y: number };
  graphOutDelta?: { x: number; y: number };
}

// スケッチモディファイア
export interface SketchModifier {
  id: string;
  name: string;
  strength: number;
  deltas: SketchKeyframeDelta[];
}

// グラフモディファイア
export interface GraphModifier {
  id: string;
  name: string;
  strength: number;
  deltas: GraphKeyframeDelta[];
}

// モディファイアの共通型
export type AnyModifier = SketchModifier | GraphModifier;

// #region 3. シリアライズ（LLM通信用）

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

// プロジェクト保存用のシリアライズ済みパス
export interface SerializedProjectPath extends SerializedPath {
  id: string;
  startTime: number;
  duration: number;
  sketchModifiers?: SketchModifier[];
  graphModifiers?: GraphModifier[];
}

// #region 4. 提案/LLM関連

// LLMプロバイダの種類
export type LLMProvider = 'OpenAI' | 'Cerebras';

// 提案情報
export interface Suggestion {
  id: string;
  title: string;
  path: SerializedPath;
}

// 提案のステータス
export type SuggestionStatus = 'idle' | 'generating' | 'error' | 'input';

// #region 5. プロジェクト関連

// プロジェクト設定
export interface ProjectSettings {
  playbackDuration: number; // 再生時間（秒）、0=自動
  playbackFrameRate: number; // フレームレート（fps）、0=自動
}

// プロジェクトデータ
export interface ProjectData {
  settings: ProjectSettings;
  paths: SerializedProjectPath[];
}

// デフォルトのプロジェクト設定
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  playbackDuration: 5,
  playbackFrameRate: 60,
};

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
