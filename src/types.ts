/// 型定義
import type p5 from 'p5';
import { z } from 'zod';

// #region 1. エディタ関連

// 編集ツール
export type ToolKind = 'select' | 'pen';

// モディファイア種別
export type ModifierKind = 'sketch' | 'graph';
export type ModifierTarget = 'sketch' | 'graph' | 'both';

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
  corner?: boolean;
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
  posDelta?: { x: number; y: number };
  inDelta?: { x: number; y: number };
  outDelta?: { x: number; y: number };
}

// グラフモディファイアのキーフレーム差分
export interface GraphKeyframeDelta {
  inDelta?: { x: number; y: number };
  outDelta?: { x: number; y: number };
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
  corner?: boolean;
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
export type LLMProvider = 'OpenAI' | 'Cerebras' | 'OpenRouter' | 'Google';
export type LLMReasoningEffort = 'none' | 'low' | 'medium' | 'high';

// 提案情報
export interface Suggestion {
  id: string;
  title: string;
  modifierTarget: ModifierTarget;
  confidence: number;
  path: SerializedPath;
}

// 提案のステータス
export type SuggestionStatus = 'idle' | 'generating' | 'error' | 'input';

// #region 5. プロジェクト関連

// プロジェクト設定
export interface ProjectSettings {
  playbackDuration: number; // 再生時間（秒）
  playbackFrameRate: number; // フレームレート（fps）
}

// プロジェクトデータ
export interface ProjectData {
  settings: ProjectSettings;
  paths: SerializedProjectPath[];
}

export const FIXED_PLAYBACK_DURATION_SECONDS = 30;
export const PLAYBACK_FRAME_RATE_OPTIONS = [60, 30, 24] as const;
export type PlaybackFrameRate = (typeof PLAYBACK_FRAME_RATE_OPTIONS)[number];

// フレームレートを正規化する関数（許容される値以外はデフォルトの30fpsにフォールバック）
export const normalizePlaybackFrameRate = (
  frameRate: number | undefined,
): PlaybackFrameRate => {
  return PLAYBACK_FRAME_RATE_OPTIONS.includes(frameRate as PlaybackFrameRate)
    ? (frameRate as PlaybackFrameRate)
    : 30;
};

// プロジェクト設定を正規化する関数（不足しているプロパティはデフォルト値で補完）
export const normalizeProjectSettings = (
  settings: Partial<ProjectSettings> = {},
): ProjectSettings => ({
  playbackDuration: FIXED_PLAYBACK_DURATION_SECONDS,
  playbackFrameRate: normalizePlaybackFrameRate(settings.playbackFrameRate),
});

// デフォルトのプロジェクト設定
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  playbackDuration: FIXED_PLAYBACK_DURATION_SECONDS,
  playbackFrameRate: 30,
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
  modifierTarget: z.enum(['sketch', 'graph', 'both']),
  confidence: z.number().min(0).max(1),
  keyframes: z.array(keyframeSchema),
});

// 提案レスポンス
export const suggestionResponseSchema = suggestionItemSchema;
export const suggestionBatchResponseSchema = z.object({
  suggestions: z.array(suggestionItemSchema).length(3),
});

// Typescriptの型に変換
export type SuggestionItem = z.infer<typeof suggestionItemSchema>;
export type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;
export type SuggestionBatchResponse = z.infer<
  typeof suggestionBatchResponseSchema
>;
