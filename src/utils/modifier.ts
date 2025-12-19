import type p5 from 'p5';
import type { Modifier, SelectionRange, Vector } from '../types';

// モディファイアを適用したカーブを計算
export function applyModifiers(
  curves: Vector[][],
  modifiers: Modifier[] | undefined,
  p: p5,
): Vector[][] {
  if (!modifiers || modifiers.length === 0) return curves;

  return curves.map((curve, curveIndex) =>
    curve.map((point, pointIndex) => {
      // 各モディファイアからのオフセットを合算
      let totalDx = 0;
      let totalDy = 0;

      // 各モディファイアを適用
      for (const modifier of modifiers) {
        const offset = modifier.offsets[curveIndex]?.[pointIndex];
        if (offset) {
          totalDx += offset.dx * modifier.strength;
          totalDy += offset.dy * modifier.strength;
        }
      }

      // オフセットがなければ元の点を返す
      if (totalDx === 0 && totalDy === 0) return point;

      // 新しいベクトルを作成して返す
      return p.createVector(point.x + totalDx, point.y + totalDy);
    }),
  );
}

// LLMの出力からモディファイアを作成
export function createModifierFromLLMResult(
  originalCurves: Vector[][],
  modifiedCurves: Vector[][],
  name: string,
  selectionRange?: SelectionRange,
): Modifier {
  const startCurveIndex = selectionRange?.startCurveIndex ?? 0;
  const endCurveIndex =
    selectionRange?.endCurveIndex ?? originalCurves.length - 1;

  const offsets: Modifier['offsets'] = originalCurves.map(
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

// モディファイアの影響度を更新
export function updateModifierStrength(
  modifiers: Modifier[] | undefined,
  modifierId: string,
  strength: number,
): void {
  if (!modifiers) return;
  const modifier = modifiers.find((m) => m.id === modifierId);
  if (modifier) modifier.strength = Math.max(0, Math.min(2, strength));
}

// モディファイアを削除
export function removeModifier(
  modifiers: Modifier[] | undefined,
  modifierId: string,
): Modifier[] {
  if (!modifiers) return [];
  return modifiers.filter((m) => m.id !== modifierId);
}
