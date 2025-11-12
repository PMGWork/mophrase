/**
 * ベジェ曲線の描画 / Bézier Curve Drawing
 * 
 * p5.jsを使用した描画機能を提供します。
 * Provides drawing functions using p5.js.
 * 
 * Features / 機能:
 * - 入力点列の描画 / Drawing input point sequences
 * - ベジェ曲線の描画 / Drawing Bézier curves
 * - 制御点と制御ポリゴンの描画 / Drawing control points and control polygons
 * - CSS変数からの色の取得 / Color retrieval from CSS variables
 */

import type p5 from 'p5';
import type { Vector, Colors } from './types';
import { bezierCurve } from './mathUtils';

/**
 * 色定義 / Color definition
 * 
 * CSS変数から色を取得します
 * Retrieves colors from CSS variables
 * 
 * @returns 色定義オブジェクト / Colors object
 */
export function getColors(): Colors {
  const styles = getComputedStyle(document.documentElement);
  const pick = (name: string): string => styles.getPropertyValue(name).trim();

  return {
    HANDLE: pick('--color-handle'),
    CURVE: pick('--color-curve'),
    SKETCH: pick('--color-sketch'),
    BACKGROUND: pick('--color-background'),
  };
}

export const COLORS = getColors();

const POINT_SIZE = 8;

/**
 * 入力点の描画 / Draw input points
 * 
 * ユーザーが描いた元の手描き線を描画します
 * Draws the original hand-drawn line by the user
 * 
 * @param p - p5インスタンス / p5 instance
 * @param points - 点列 / Array of points
 * @param colors - 色設定 / Color settings
 */
export function drawPoints(p: p5, points: Vector[], colors: Colors = COLORS): void {
  p.stroke(colors.SKETCH);
  p.strokeWeight(2);
  p.noFill();
  p.beginShape();
  for (const pt of points) {
    p.vertex(pt.x, pt.y);
  }
  p.endShape();
}

/**
 * ベジェ曲線の描画 / Draw Bézier curves
 * 
 * フィッティングされたベジェ曲線を滑らかに描画します
 * Draws fitted Bézier curves smoothly
 * 
 * @param p - p5インスタンス / p5 instance
 * @param curves - ベジェ曲線の配列 / Array of Bézier curves
 * @param colors - 色設定 / Color settings
 */
export function drawBezierCurve(p: p5, curves: Vector[][], colors: Colors = COLORS): void {
  if (curves.length === 0) return;

  p.stroke(colors.CURVE);
  p.strokeWeight(2);
  p.noFill();

  for (const curve of curves) {
    p.beginShape();
    for (let t = 0; t <= 1; t += 0.01) {
      const pt = bezierCurve(curve[0], curve[1], curve[2], curve[3], t);
      p.vertex(pt.x, pt.y);
    }
    p.endShape();
  }
}

/**
 * 制御点と制御ポリゴンの描画 / Draw control points and control polygons
 * 
 * ベジェ曲線の制御点（ハンドル）と制御ポリゴンを描画します：
 * Draws Bézier curve control points (handles) and control polygons:
 * - 端点：四角形 / Endpoints: squares
 * - ハンドル：円 / Handles: circles
 * - 制御ポリゴン：線 / Control polygon: lines
 * 
 * @param p - p5インスタンス / p5 instance
 * @param curves - ベジェ曲線の配列 / Array of Bézier curves
 * @param colors - 色設定 / Color settings
 */
export function drawControls(p: p5, curves: Vector[][], colors: Colors = COLORS): void {
  if (curves.length === 0) return;

  // 制御点の描画
  p.fill(colors.HANDLE);
  p.noStroke();
  p.rectMode(p.CENTER);

  for (const curve of curves) {
    // 端点
    p.rect(curve[0].x, curve[0].y, POINT_SIZE, POINT_SIZE);
    p.rect(curve[3].x, curve[3].y, POINT_SIZE, POINT_SIZE);

    // ハンドル
    p.circle(curve[1].x, curve[1].y, POINT_SIZE);
    p.circle(curve[2].x, curve[2].y, POINT_SIZE);
  }

  // 制御ポリゴンの描画
  p.stroke(colors.HANDLE);
  p.strokeWeight(1);
  p.noFill();

  for (const curve of curves) {
    p.beginShape();
    p.vertex(curve[0].x, curve[0].y);
    p.vertex(curve[1].x, curve[1].y);
    p.endShape();

    p.beginShape();
    p.vertex(curve[2].x, curve[2].y);
    p.vertex(curve[3].x, curve[3].y);
    p.endShape();
  }
}
