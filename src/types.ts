/// 型定義

import type p5 from 'p5';

export type Vector = p5.Vector;

export interface FitErrorResult {
  maxError: number;
  index: number;
}

export interface Colors {
  YELLOW: string;
  WHITE: string;
  GRAY: string;
  BLACK: string;
}

export interface Range {
  start: number;
  end: number;
}

export interface Tangents {
  start: Vector;
  end: Vector;
}

