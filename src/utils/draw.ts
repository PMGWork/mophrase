import type p5 from 'p5';
import { CURVE_POINT } from '../constants';
import type { Vector } from '../types';
import { bezierCurve } from './math';

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
      const pt = bezierCurve(
        curve[CURVE_POINT.START_ANCHOR_POINT],
        curve[CURVE_POINT.START_CONTROL_POINT],
        curve[CURVE_POINT.END_CONTROL_POINT],
        curve[CURVE_POINT.END_ANCHOR_POINT],
        t,
      );
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
  getColor?: (curveIndex: number, pointIndex: number) => string,
): void {
  if (curves.length === 0) return;

  // 制御点の描画
  p.rectMode(p.CENTER);

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const p0 = transform(curve[CURVE_POINT.START_ANCHOR_POINT].copy());
    const p1 = transform(curve[CURVE_POINT.START_CONTROL_POINT].copy());
    const p2 = transform(curve[CURVE_POINT.END_CONTROL_POINT].copy());
    const p3 = transform(curve[CURVE_POINT.END_ANCHOR_POINT].copy());

    // 制御ポリゴン（線）
    p.strokeWeight(1);
    p.noFill();
    p.stroke(getColor ? getColor(i, CURVE_POINT.START_CONTROL_POINT) : color);
    p.line(p0.x, p0.y, p1.x, p1.y);
    p.stroke(getColor ? getColor(i, CURVE_POINT.END_CONTROL_POINT) : color);
    p.line(p2.x, p2.y, p3.x, p3.y);

    // 制御点（アンカー：四角、ハンドル：丸）
    p.noStroke();
    p.fill(getColor ? getColor(i, CURVE_POINT.START_ANCHOR_POINT) : color);
    p.rect(p0.x, p0.y, size, size);
    p.fill(getColor ? getColor(i, CURVE_POINT.END_ANCHOR_POINT) : color);
    p.rect(p3.x, p3.y, size, size);
    p.fill(getColor ? getColor(i, CURVE_POINT.START_CONTROL_POINT) : color);
    p.circle(p1.x, p1.y, size);
    p.fill(getColor ? getColor(i, CURVE_POINT.END_CONTROL_POINT) : color);
    p.circle(p2.x, p2.y, size);
  }

  p.rectMode(p.CORNER);
}

// パス全体の描画（スケッチ点列 + ベジェ曲線 + 制御点）
export function drawSketchPath(
  p: p5,
  path: { points: { x: number; y: number }[]; curves: Vector[][] },
  config: { showSketch: boolean; lineWeight: number; pointSize: number },
  colors: { curve: string; background: string; handle: string; selection: string },
  isSelected: boolean,
  isHandleSelected?: (curveIndex: number, pointIndex: number) => boolean,
): void {
  // スケッチ点列の描画
  if (config.showSketch) {
    drawPoints(
      p,
      path.points as Vector[],
      config.lineWeight,
      config.pointSize - config.lineWeight,
      colors.curve,
      colors.background,
    );
  }

  // ベジェ曲線の描画
  const curveColor = isSelected ? colors.handle : colors.curve;
  drawBezierCurve(p, path.curves, config.lineWeight, curveColor);

  // 制御点の描画（選択されたパスのみ）
  if (isSelected) {
    const getColor = isHandleSelected
      ? (curveIndex: number, pointIndex: number) =>
          isHandleSelected(curveIndex, pointIndex)
            ? colors.selection
            : colors.handle
      : undefined;

    drawControls(
      p,
      path.curves,
      config.pointSize,
      colors.handle,
      undefined,
      getColor,
    );
  }
}

