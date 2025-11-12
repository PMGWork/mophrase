/**
 * 型定義 / Type Definitions
 * 
 * MoPhraseアプリケーションで使用する型定義
 * Type definitions used in the MoPhrase application
 */

import type p5 from 'p5';

/**
 * 2Dベクトル型 / 2D Vector type
 */
export type Vector = p5.Vector;

/**
 * フィッティングエラーの結果 / Fitting error result
 * 
 * ベジェ曲線フィッティングの誤差情報
 * Error information from Bézier curve fitting
 */
export interface FitErrorResult {
  maxError: number;  // 最大誤差（ピクセル） / Maximum error (pixels)
  index: number;     // 最大誤差の点のインデックス / Index of point with maximum error
}

/**
 * 範囲情報 / Range information
 * 
 * 点列の処理範囲を指定
 * Specifies the range of point sequence to process
 */
export interface Range {
  start: number;  // 開始インデックス / Start index
  end: number;    // 終了インデックス / End index
}

/**
 * 接ベクトル情報 / Tangent vectors
 * 
 * ベジェ曲線の始点と終点の接線方向
 * Tangent directions at start and end of Bézier curve
 */
export interface Tangents {
  start: Vector;  // 始点の接ベクトル / Tangent at start
  end: Vector;    // 終点の接ベクトル / Tangent at end
}

/**
 * 描画パス情報 / Drawing path information
 * 
 * ユーザーが描いた1本のパスの情報
 * Information about a single path drawn by the user
 */
export interface Path {
  points: Vector[];                          // 元の入力点列 / Original input points
  curves: Vector[][];                        // フィッティングされたベジェ曲線群 / Fitted Bézier curves
  lastFitError: { current: FitErrorResult }; // 最後のフィッティング誤差 / Last fitting error
}

/**
 * ベジエハンドルの選択情報 / Bézier handle selection
 * 
 * ドラッグ中のハンドルを特定するための情報
 * Information to identify a handle being dragged
 */
export interface HandleSelection {
  pathIndex: number;   // パスのインデックス / Path index
  curveIndex: number;  // 曲線のインデックス / Curve index
  pointIndex: number;  // 制御点のインデックス（0-3） / Control point index (0-3)
}

/**
 * 色定義 / Color definitions
 * 
 * アプリケーションで使用する色
 * Colors used in the application
 */
export interface Colors {
  HANDLE: string;     // ハンドルの色 / Handle color
  CURVE: string;      // 曲線の色 / Curve color
  SKETCH: string;     // 手描き線の色 / Sketch color
  BACKGROUND: string; // 背景色 / Background color
}
