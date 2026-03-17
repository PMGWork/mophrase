/**
 * 提案ポップアップの配置計算。
 * パス終点の座標からポップアップ表示位置を算出する。
 */

import type p5 from 'p5';
import type { Path, SelectionRange } from '../types';
import { resolveSketchCurves } from '../utils/path';

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
  const { original: originalCurves, effective: effectiveCurves } =
    resolveSketchCurves(targetPath);
  if (originalCurves.length === 0) return null;

  if (selectionRange?.anchorKeyframeIndex !== undefined) {
    const anchor = getAnchorPointFromSelection(
      effectiveCurves,
      selectionRange.anchorKeyframeIndex,
    );
    if (!anchor) return null;

    const canvasContainer = document.getElementById('canvasContainer');
    const rect = canvasContainer?.getBoundingClientRect();
    const offsetX = rect?.left ?? 0;
    const offsetY = rect?.top ?? 0;

    return {
      left: offsetX + anchor.x + POPUP_OFFSET,
      top: offsetY + anchor.y - POPUP_OFFSET,
    };
  }

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

function getAnchorPointFromSelection(
  effectiveCurves: p5.Vector[][],
  anchorKeyframeIndex: number,
): p5.Vector | null {
  if (effectiveCurves.length === 0) return null;
  const segmentCount = effectiveCurves.length;
  const clampedIndex = Math.max(0, Math.min(segmentCount, anchorKeyframeIndex));

  if (clampedIndex < segmentCount) {
    const forwardAnchor = effectiveCurves[clampedIndex]?.[0];
    if (forwardAnchor) return forwardAnchor;
  }

  const backwardAnchor = effectiveCurves[clampedIndex - 1]?.[3];
  return backwardAnchor ?? null;
}
