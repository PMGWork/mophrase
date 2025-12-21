import type p5 from 'p5';
import type { GraphModifier, SelectionRange, SketchModifier, Vector } from '../types';

// スケッチモディファイアを適用したカーブを計算
export function applySketchModifiers(
  curves: Vector[][],
  modifiers: SketchModifier[] | undefined,
  p?: p5,
): Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  return curves.map((curve, curveIndex) =>
    curve.map((point, pointIndex) => {
      let totalDx = 0;
      let totalDy = 0;

      for (const modifier of modifiers) {
        const offset = modifier.offsets[curveIndex]?.[pointIndex];
        if (offset) {
          totalDx += offset.dx * modifier.strength;
          totalDy += offset.dy * modifier.strength;
        }
      }

      if (totalDx === 0 && totalDy === 0) return point;

      if (p) return p.createVector(point.x + totalDx, point.y + totalDy);
      if (typeof point.copy === 'function') {
        return point.copy().add(totalDx, totalDy);
      }
      return { x: point.x + totalDx, y: point.y + totalDy } as Vector;
    }),
  );
}

// グラフモディファイアを適用したカーブを計算
export function applyGraphModifiers(
  curves: Vector[][],
  modifiers: GraphModifier[] | undefined,
  p?: p5,
): Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  return curves.map((curve, curveIndex) =>
    curve.map((point, pointIndex) => {
      let totalDx = 0;
      let totalDy = 0;

      for (const modifier of modifiers) {
        const offset = modifier.offsets[curveIndex]?.[pointIndex];
        if (offset) {
          totalDx += offset.dx * modifier.strength;
          totalDy += offset.dy * modifier.strength;
        }
      }

      if (totalDx === 0 && totalDy === 0) return point;

      if (p) return p.createVector(point.x + totalDx, point.y + totalDy);
      if (typeof point.copy === 'function') {
        return point.copy().add(totalDx, totalDy);
      }
      return { x: point.x + totalDx, y: point.y + totalDy } as Vector;
    }),
  );
}

// LLMの出力からスケッチモディファイアを作成
export function createSketchModifier(
  originalCurves: Vector[][],
  modifiedCurves: Vector[][],
  name: string,
  selectionRange?: SelectionRange,
): SketchModifier {
  const startCurveIndex = selectionRange?.startCurveIndex ?? 0;
  const endCurveIndex =
    selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  const offsets: SketchModifier['offsets'] = originalCurves.map(
    (curve, curveIndex) => {
      if (curveIndex < startCurveIndex || curveIndex > endCurveIndex) {
        return curve.map(() => null);
      }

      const localIndex = curveIndex - startCurveIndex;
      return curve.map((point, pointIndex) => {
        const modifiedPoint = modifiedCurves[localIndex]?.[pointIndex];
        if (!modifiedPoint) return null;

        return { dx: modifiedPoint.x - point.x, dy: modifiedPoint.y - point.y };
      });
    },
  );

  if (selectionRange) {
    const localEndIndex = endCurveIndex - startCurveIndex;

    const startOriginal = originalCurves[startCurveIndex]?.[0];
    const startModified = modifiedCurves[0]?.[0];
    if (startOriginal && startModified && startCurveIndex > 0) {
      const dx = startModified.x - startOriginal.x;
      const dy = startModified.y - startOriginal.y;
      const prevCurve = offsets[startCurveIndex - 1];
      if (prevCurve) {
        prevCurve[2] = { dx, dy };
        prevCurve[3] = { dx, dy };
      }
    }

    const endOriginal = originalCurves[endCurveIndex]?.[3];
    const endModified = modifiedCurves[localEndIndex]?.[3];
    if (
      endOriginal &&
      endModified &&
      endCurveIndex < originalCurves.length - 1
    ) {
      const dx = endModified.x - endOriginal.x;
      const dy = endModified.y - endOriginal.y;
      const nextCurve = offsets[endCurveIndex + 1];
      if (nextCurve) {
        nextCurve[0] = { dx, dy };
        nextCurve[1] = { dx, dy };
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    name,
    offsets,
    strength: 1.0,
  };
}

// LLMの出力からグラフモディファイアを作成
export function createGraphModifier(
  originalCurves: Vector[][],
  modifiedCurves: Vector[][],
  name: string,
  selectionRange?: SelectionRange,
): GraphModifier {
  const startCurveIndex = selectionRange?.startCurveIndex ?? 0;
  const endCurveIndex =
    selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  const offsets: GraphModifier['offsets'] = originalCurves.map(
    (curve, curveIndex) => {
      if (curveIndex < startCurveIndex || curveIndex > endCurveIndex) {
        return curve.map(() => null);
      }

      const localIndex = curveIndex - startCurveIndex;
      return curve.map((point, pointIndex) => {
        const modifiedPoint = modifiedCurves[localIndex]?.[pointIndex];
        if (!modifiedPoint) return null;

        return { dx: modifiedPoint.x - point.x, dy: modifiedPoint.y - point.y };
      });
    },
  );

  return {
    id: crypto.randomUUID(),
    name,
    offsets,
    strength: 1.0,
  };
}

// スケッチモディファイアの影響度を更新
export function updateSketchModifierStrength(
  modifiers: SketchModifier[] | undefined,
  modifierId: string,
  strength: number,
): void {
  if (!modifiers) return;
  const modifier = modifiers.find((m) => m.id === modifierId);
  if (modifier) modifier.strength = Math.max(0, Math.min(2, strength));
}

// グラフモディファイアの影響度を更新
export function updateGraphModifierStrength(
  modifiers: GraphModifier[] | undefined,
  modifierId: string,
  strength: number,
): void {
  if (!modifiers) return;
  const modifier = modifiers.find((m) => m.id === modifierId);
  if (modifier) modifier.strength = Math.max(0, Math.min(2, strength));
}

// スケッチモディファイアを削除
export function removeSketchModifier(
  modifiers: SketchModifier[] | undefined,
  modifierId: string,
): SketchModifier[] {
  if (!modifiers) return [];
  return modifiers.filter((m) => m.id !== modifierId);
}

// グラフモディファイアを削除
export function removeGraphModifier(
  modifiers: GraphModifier[] | undefined,
  modifierId: string,
): GraphModifier[] {
  if (!modifiers) return [];
  return modifiers.filter((m) => m.id !== modifierId);
}
