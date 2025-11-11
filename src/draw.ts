/// ベジェ曲線の描画

import type p5 from 'p5';
import type { Vector, Colors } from './types';
import { bezierCurve } from './mathUtils';

// 色定義
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

// 入力点の描画
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

// ベジェ曲線の描画
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

// 制御点と制御ポリゴンの描画
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
