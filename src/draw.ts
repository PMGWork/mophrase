/// ベジェ曲線の描画

import type p5 from 'p5';
import type { Vector, Colors } from './types';
import { bezierCurve } from './mathUtils';

// 色定義
export const COLORS: Colors = {
  YELLOW: '#D7B600',
  WHITE: '#B0B0B0',
  GRAY: '#484848',
  BLACK: '#303030',
};

const POINT_SIZE = 8;

// 描画可能かどうかをチェックする共通ガード関数
function canDrawCurves(points: Vector[], curves: Vector[][]): boolean {
  return points.length >= 2 && curves.length > 0;
}

// 入力点の描画
export function drawInputPoints(p: p5, points: Vector[]): void {
  p.stroke(COLORS.GRAY);
  p.strokeWeight(3);
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

  p.stroke(COLORS.WHITE);
  p.strokeWeight(3);
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

// 制御ポリゴンの描画
export function drawControlPolygon(
  p: p5,
  points: Vector[],
  curves: Vector[][]
): void {
  if (!canDrawCurves(points, curves)) return;

  p.stroke(COLORS.YELLOW);
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

// 制御点の描画
export function drawControlPoints(
  p: p5,
  points: Vector[],
  curves: Vector[][]
): void {
  if (!canDrawCurves(points, curves)) return;

  p.fill(COLORS.YELLOW);
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
}

// クリアボタンの描画
export function drawClearButton(
  p: p5,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // ボタンの背景
  p.fill(COLORS.GRAY);
  p.stroke(COLORS.WHITE);
  p.strokeWeight(2);
  p.rectMode(p.CORNER);
  p.rect(x, y, w, h, 5);

  // ボタンのテキスト
  p.fill(COLORS.WHITE);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(16);
  p.text('CLEAR', x + w / 2, y + h / 2);
}

