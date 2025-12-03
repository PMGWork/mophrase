/// ベジェ曲線の描画

import type p5 from 'p5';
import { bezierCurve } from './mathUtils';
import type { Vector } from './types';

// 入力点の描画
export function drawPoints(
  p: p5,
  points: Vector[],
  weight: number,
  size: number,
  foreground: string,
  background: string,
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
  color: string,
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
  color: string,
  transform: (v: Vector) => Vector = (v) => v,
): void {
  if (curves.length === 0) return;

  // 制御点の描画
  p.fill(color);
  p.noStroke();
  p.rectMode(p.CENTER);

  for (const curve of curves) {
    const p0 = transform(curve[0].copy());
    const p1 = transform(curve[1].copy());
    const p2 = transform(curve[2].copy());
    const p3 = transform(curve[3].copy());

    p.rect(p0.x, p0.y, size, size);
    p.rect(p3.x, p3.y, size, size);
    p.circle(p1.x, p1.y, size);
    p.circle(p2.x, p2.y, size);
  }

  // 制御ポリゴンの描画
  p.stroke(color);
  p.strokeWeight(1);
  p.noFill();

  for (const curve of curves) {
    const p0 = transform(curve[0].copy());
    const p1 = transform(curve[1].copy());
    const p2 = transform(curve[2].copy());
    const p3 = transform(curve[3].copy());

    p.beginShape();
    p.vertex(p0.x, p0.y);
    p.vertex(p1.x, p1.y);
    p.endShape();

    p.beginShape();
    p.vertex(p2.x, p2.y);
    p.vertex(p3.x, p3.y);
    p.endShape();
  }
}
