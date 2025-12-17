import type p5 from 'p5';
import type { PathModifier, Vector } from '../types';

// モディファイアを適用したカーブを計算
export function applyModifiers(
  curves: Vector[][],
  modifiers: PathModifier[] | undefined,
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
): PathModifier {
  const offsets: PathModifier['offsets'] = originalCurves.map(
    (curve, curveIndex) =>
      curve.map((point, pointIndex) => {
        const modifiedPoint = modifiedCurves[curveIndex]?.[pointIndex];
        if (!modifiedPoint) return null;

        return { dx: modifiedPoint.x - point.x, dy: modifiedPoint.y - point.y };
      }),
  );

  return {
    id: crypto.randomUUID(),
    name,
    offsets,
    strength: 1.0,
  };
}

// モディファイアの影響度を更新
export function updateModifierStrength(
  modifiers: PathModifier[] | undefined,
  modifierId: string,
  strength: number,
): void {
  if (!modifiers) return;
  const modifier = modifiers.find((m) => m.id === modifierId);
  if (modifier) modifier.strength = Math.max(0, Math.min(2, strength));
}

// モディファイアを削除
export function removeModifier(
  modifiers: PathModifier[] | undefined,
  modifierId: string,
): PathModifier[] {
  if (!modifiers) return [];
  return modifiers.filter((m) => m.id !== modifierId);
}
