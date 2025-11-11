/// ベジェ曲線の描画

import type p5 from 'p5';
import type { Vector, Colors } from './types';
import { bezierCurve } from './mathUtils';

// 色定義
function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function getColors(): Colors {
  return {
    HANDLE: getCSSVariable('--color-handle'),
    CURVE: getCSSVariable('--color-curve'),
    SKETCH: getCSSVariable('--color-sketch'),
    BACKGROUND: getCSSVariable('--color-background'),
  };
}

export const COLORS = getColors();

const POINT_SIZE = 8;

// 描画可能かどうかをチェックする共通ガード関数
function canDrawCurves(points: Vector[], curves: Vector[][]): boolean {
  return points.length >= 2 && curves.length > 0;
}

// 入力点の描画
export function drawInputPoints(p: p5, points: Vector[]): void {
  p.stroke(getColors().SKETCH);
  p.strokeWeight(2);
  p.noFill();
  p.beginShape();
  for (const pt of points) {
    p.vertex(pt.x, pt.y);
  }
  p.endShape();
}

// ベジェ曲線の描画
export function drawBezierCurve(p: p5, points: Vector[], curves: Vector[][]): void {
  if (!canDrawCurves(points, curves)) return;

  p.stroke(getColors().CURVE);
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

// 制御点と制御ポリゴンの描画
export function drawControls(
  p: p5,
  points: Vector[],
  curves: Vector[][]
): void {
  if (!canDrawCurves(points, curves)) return;

  // 制御点の描画
  p.fill(getColors().HANDLE);
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
  p.stroke(getColors().HANDLE);
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
