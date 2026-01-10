import type { Path, SelectionRange } from '../types';
import { buildSketchCurves } from '../utils/keyframes';
import { applySketchModifiers } from '../utils/modifier';

// ポップアップのオフセット値
const POPUP_OFFSET = 20;

// スケッチUIの配置計算
export function computeSuggestionPosition({
  targetPath,
  selectionRange,
}: {
  targetPath?: Path;
  selectionRange?: SelectionRange;
}): { left: number; top: number } | null {
  if (!targetPath) return null;

  // curvesを構築してmodifierを適用
  const originalCurves = buildSketchCurves(targetPath.keyframes);
  if (originalCurves.length === 0) return null;

  const effectiveCurves = applySketchModifiers(
    originalCurves,
    targetPath.sketchModifiers,
  );

  // 終点のインデックスを計算
  const endCurveIndex = selectionRange
    ? Math.min(effectiveCurves.length - 1, selectionRange.endCurveIndex)
    : effectiveCurves.length - 1;

  const endCurve = effectiveCurves[endCurveIndex];
  if (!endCurve || endCurve.length < 4) return null;

  // 終点（ベジェ曲線のp3）を取得
  const anchor = endCurve[3];
  if (!anchor) return null;

  // canvasContainerの位置を取得して加算
  const canvasContainer = document.getElementById('canvasContainer');
  const rect = canvasContainer?.getBoundingClientRect();
  const offsetX = rect?.left ?? 0;
  const offsetY = rect?.top ?? 0;

  const left = offsetX + anchor.x + POPUP_OFFSET;
  const top = offsetY + anchor.y - POPUP_OFFSET;

  return { left, top };
}
