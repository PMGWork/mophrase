/// 型定義

import type p5 from 'p5';

export type Vector = p5.Vector;

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

// 描画パス情報
export interface Path {
  points: Vector[];
  curves: Vector[][];
  lastFitError: { current: FitErrorResult };
}

// ベジエハンドルの選択情報
export interface HandleSelection {
  pathIndex: number;
  curveIndex: number;
  pointIndex: number;
}

// 色定義
export interface Colors {
  HANDLE: string;
  CURVE: string;
  SKETCH: string;
  BACKGROUND: string;
}
