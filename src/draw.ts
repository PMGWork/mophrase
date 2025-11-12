/// ベジェ曲線の描画

import type p5 from 'p5';
import type { Vector } from './types';
import { bezierCurve } from './mathUtils';

// 入力点の描画
export function drawPoints(
  p: p5,
  points: Vector[],
  weight: number,
  size: number,
  foreground: string,
  background: string
): void {
  if (points.length === 0) return;

  // 点列の描画
  p.stroke(foreground);
  p.strokeWeight(weight);
  p.noFill();
  p.beginShape();

  for (const pt of points) {
    p.vertex(pt.x, pt.y);
  }

  p.endShape();

  // 各点の描画
  p.fill(background);
  p.stroke(foreground);
  p.strokeWeight(1);
  p.rectMode(p.CENTER);

  for (const pt of points) {
    p.rect(pt.x, pt.y, size, size);
  }

  p.rectMode(p.CORNER);
}

// ベジェ曲線の描画
export function drawBezierCurve(
  p: p5,
  curves: Vector[][],
  weight: number,
  color: string
): void {
  if (curves.length === 0) return;

  // 曲線の描画
  p.stroke(color);
  p.strokeWeight(weight);
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
  curves: Vector[][],
  size: number,
  color: string
): void {
  if (curves.length === 0) return;

  // 制御点の描画
  p.fill(color);
  p.noStroke();
  p.rectMode(p.CENTER);

  for (const curve of curves) {
    p.rect(curve[0].x, curve[0].y, size, size);
    p.rect(curve[3].x, curve[3].y, size, size);
    p.circle(curve[1].x, curve[1].y, size);
    p.circle(curve[2].x, curve[2].y, size);
  }

  // 制御ポリゴンの描画
  p.stroke(color);
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
