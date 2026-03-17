/**
 * 選択範囲に基づくパスのスライスと参照情報の取得。
 * パスからスケッチ・グラフカーブを解決するヘルパーも提供する。
 */

import type p5 from 'p5';
import type { Path, SelectionRange } from '../types';
import {
  buildGraphCurves,
  buildSketchCurves,
  computeKeyframeProgress,
} from './keyframes';
import {
  applyGraphModifiers,
  applySketchModifiers,
  resolveEffectiveTimes,
} from './modifier';

// パスからスケッチカーブを解決（Modifier 適用済み）
export function resolveSketchCurves(
  path: Pick<Path, 'keyframes' | 'sketchModifiers'>,
  p?: p5,
): { original: p5.Vector[][]; effective: p5.Vector[][] } {
  const original = buildSketchCurves(path.keyframes);
  const effective = applySketchModifiers(
    original,
    path.keyframes,
    path.sketchModifiers,
    p,
  );
  return { original, effective };
}

// パスからグラフカーブを解決（Modifier 適用済み）
export function resolveGraphCurves(
  path: Pick<Path, 'keyframes' | 'sketchModifiers' | 'graphModifiers'>,
  p?: p5,
): {
  sketchCurves: p5.Vector[][];
  progress: number[];
  effectiveTimes: number[];
  original: p5.Vector[][];
  effective: p5.Vector[][];
} {
  const { effective: sketchCurves } = resolveSketchCurves(path, p);
  const progress = computeKeyframeProgress(path.keyframes, sketchCurves);
  const effectiveTimes = resolveEffectiveTimes(
    path.keyframes,
    path.graphModifiers,
  );
  const original = buildGraphCurves(path.keyframes, progress, effectiveTimes);
  const effective = applyGraphModifiers(
    original,
    path.keyframes,
    path.graphModifiers,
    p,
  );
  return { sketchCurves, progress, effectiveTimes, original, effective };
}

// 部分パスを作成
export function slicePath(path: Path, range?: SelectionRange): Path {
  // 選択範囲がない場合は元のパスのコピーを返す
  if (!range)
    return {
      ...path,
      keyframes: [...path.keyframes],
    };

  // 単一アンカー選択時は、そのアンカーのみを送信対象にする
  if (range.anchorKeyframeIndex !== undefined) {
    const index = Math.max(
      0,
      Math.min(path.keyframes.length - 1, range.anchorKeyframeIndex),
    );
    const keyframe = path.keyframes[index];
    if (!keyframe) return { ...path, keyframes: [...path.keyframes] };
    return { ...path, keyframes: [keyframe] };
  }

  // 範囲指定がある場合は部分的に切り出す
  const start = Math.max(0, range.startCurveIndex);
  const end = Math.min(path.keyframes.length - 2, range.endCurveIndex);
  if (start > end) return { ...path, keyframes: [...path.keyframes] };

  const keyframes = path.keyframes.slice(start, end + 2);
  return { ...path, keyframes };
}

// 選択範囲に基づいてパスのキーフレームと進行度情報を取得
export function getSelectionReference(
  path: Path,
  range: SelectionRange | undefined,
  progress: number[],
): { keyframes: Path['keyframes']; progress: number[] } {
  if (!range) return { keyframes: path.keyframes, progress };

  if (range.anchorKeyframeIndex !== undefined) {
    const index = Math.max(
      0,
      Math.min(path.keyframes.length - 1, range.anchorKeyframeIndex),
    );
    const keyframe = path.keyframes[index];
    if (!keyframe) return { keyframes: path.keyframes, progress };
    return {
      keyframes: [keyframe],
      progress: [progress[index] ?? 0],
    };
  }

  const sliced = slicePath(path, range);
  const start = Math.max(0, range.startCurveIndex);
  const end = Math.min(path.keyframes.length - 2, range.endCurveIndex);
  if (start <= end) {
    const curves = buildSketchCurves(sliced.keyframes);
    const slicedProgress = computeKeyframeProgress(sliced.keyframes, curves);
    return {
      keyframes: sliced.keyframes,
      progress: slicedProgress,
    };
  }
  return { keyframes: sliced.keyframes, progress };
}
