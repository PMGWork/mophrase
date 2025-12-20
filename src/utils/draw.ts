import type p5 from 'p5';
import type { Colors, Config } from '../config';
import type { Path, Vector } from '../types';
import { bezierCurve } from './math';
import { applyModifiers } from './modifier';
import { buildSketchCurves } from './keyframes';

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

  p.push();

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

  p.pop();
}

// ベジェ曲線の描画
export function drawBezierCurve(
  p: p5,
  curves: Vector[][],
  weight: number,
  color: string,
): void {
  if (curves.length === 0) return;

  p.push();

  // 曲線の描画
  p.stroke(color);
  p.strokeWeight(weight);
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);

  const step = 0.01;
  let prevEnd: Vector | null = null;

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const start = curve[0];
    const end = curve[3];
    const connected =
      prevEnd !== null &&
      prevEnd.x === start.x &&
      prevEnd.y === start.y;

    if (prevEnd === null || !connected) {
      if (prevEnd !== null) p.endShape();
      p.beginShape();
    }

    for (let t = connected ? step : 0; t <= 1; t += step) {
      const pt = bezierCurve(curve[0], curve[1], curve[2], curve[3], t);
      p.vertex(pt.x, pt.y);
    }
    prevEnd = end;
  }

  if (prevEnd !== null) p.endShape();
  p.pop();
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

  p.push();

  // 制御点の描画
  p.rectMode(p.CENTER);

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const p0 = transform(curve[0].copy());
    const p1 = transform(curve[1].copy());
    const p2 = transform(curve[2].copy());
    const p3 = transform(curve[3].copy());

    // 制御ポリゴン（線）
    p.strokeWeight(1);
    p.noFill();
    p.stroke(getColor ? getColor(i, 1) : color);
    p.line(p0.x, p0.y, p1.x, p1.y);
    p.stroke(getColor ? getColor(i, 2) : color);
    p.line(p2.x, p2.y, p3.x, p3.y);

    // 制御点（アンカー：四角、ハンドル：丸）
    p.noStroke();
    p.fill(getColor ? getColor(i, 0) : color);
    p.rect(p0.x, p0.y, size, size);
    p.fill(getColor ? getColor(i, 3) : color);
    p.rect(p3.x, p3.y, size, size);
    p.fill(getColor ? getColor(i, 1) : color);
    p.circle(p1.x, p1.y, size);
    p.fill(getColor ? getColor(i, 2) : color);
    p.circle(p2.x, p2.y, size);
  }

  p.pop();
}

// パス全体の描画（スケッチ点列 + ベジェ曲線 + 制御点）
export function drawSketchPath(
  p: p5,
  path: Pick<Path, 'keyframes' | 'modifiers'>,
  config: Pick<Config, 'lineWeight' | 'pointSize'>,
  colors: Pick<Colors, 'curve' | 'background' | 'handle' | 'selection'>,
  isSelected: boolean,
  isHandleSelected?: (curveIndex: number, pointIndex: number) => boolean,
): void {
  const curves = buildSketchCurves(path.keyframes);
  const effectiveCurves = applyModifiers(curves, path.modifiers, p);

  // ベジェ曲線の描画（modifiers適用後）
  const curveColor = isSelected ? colors.handle : '#4b5563';
  drawBezierCurve(p, effectiveCurves, config.lineWeight, curveColor);

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
      effectiveCurves,
      config.pointSize,
      colors.handle,
      undefined,
      getColor,
    );
  }
}
