/**
 * 提案のプレビュー描画。
 * ホバー中の提案をスケッチ・グラフの両エディタ上に破線で重ね描きする。
 */

import type p5 from 'p5';

import type { Colors, Config } from '../config';
import type { Path, SelectionRange, Suggestion } from '../types';
import { drawBezierCurve } from '../utils/rendering';
import {
  buildGraphCurves,
  buildSketchCurves,
  computeKeyframeProgress,
} from '../utils/keyframes';
import {
  applySketchModifiers,
  applyGraphModifiers,
  createSketchModifier,
  createGraphModifier,
} from '../utils/modifier';
import { getSelectionReference } from '../utils/path';
import { deserializePathKeyframes } from '../utils/serialization/curves';

// スケッチ提案のプレビュー描画パラメータ
type SketchPreviewParams = {
  p: p5;
  colors: Colors;
  config: Pick<Config, 'lineWeight'>;
  suggestion: Suggestion;
  targetPath: Path;
  selectionRange?: SelectionRange;
  strength: number;
  transform?: (v: p5.Vector) => p5.Vector;
};

// グラフ提案のプレビュー描画パラメータ
type GraphPreviewParams = {
  p: p5;
  suggestion: Suggestion;
  targetPath: Path;
  selectionRange?: SelectionRange;
  strength: number;
};

// スケッチ提案のプレビュー描画
export function drawSketchPreview(params: SketchPreviewParams): void {
  const {
    p,
    colors,
    config,
    suggestion,
    targetPath,
    selectionRange,
    strength,
    transform,
  } = params;

  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const previousDash =
    typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

  p.push();

  const previewCurves = buildSketchPreviewCurves(
    p,
    targetPath,
    suggestion,
    selectionRange,
    strength,
  );

  if (!previewCurves || previewCurves.length === 0) {
    p.pop();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
    return;
  }

  const mapped = transform
    ? previewCurves.map((curve) => curve.map((pt) => transform(pt.copy())))
    : previewCurves;

  if (mapped.length > 0) {
    const weight = Math.max(config.lineWeight, 1) + 0.5;
    drawBezierCurve(p, mapped, weight, colors.handle);
  }

  p.pop();

  if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
}

// プレビュー用の時間カーブを取得
export function getPreviewGraphCurves(
  params: GraphPreviewParams,
): { curves: p5.Vector[][]; strength: number } | null {
  const { p, suggestion, targetPath, selectionRange, strength } = params;

  // 元のカーブとプログレスを計算
  const baseSketchCurves = buildSketchCurves(targetPath.keyframes);
  const baseProgress = computeKeyframeProgress(
    targetPath.keyframes,
    baseSketchCurves,
  );
  if (baseSketchCurves.length === 0) return null;

  // LLM の提案をキーフレームに変換
  const { keyframes: referenceKeyframes, progress: referenceProgress } =
    getSelectionReference(targetPath, selectionRange, baseProgress);

  const llmKeyframes = deserializePathKeyframes(
    suggestion.path,
    referenceKeyframes,
    referenceProgress,
    p,
  );
  if (llmKeyframes.length < 2) return null;

  const previewGraphModifier = createGraphModifier(
    targetPath.keyframes,
    baseProgress,
    llmKeyframes,
    referenceProgress,
    'preview',
    selectionRange,
  );
  previewGraphModifier.strength = strength;

  const effectiveSketchCurves = applySketchModifiers(
    baseSketchCurves,
    targetPath.keyframes,
    targetPath.sketchModifiers,
    p,
  );
  const effectiveProgress = computeKeyframeProgress(
    targetPath.keyframes,
    effectiveSketchCurves,
  );
  const baseGraphCurves = buildGraphCurves(targetPath.keyframes, effectiveProgress);
  if (baseGraphCurves.length === 0) return null;

  const previewCurves = applyGraphModifiers(
    baseGraphCurves,
    targetPath.keyframes,
    [...(targetPath.graphModifiers ?? []), previewGraphModifier],
    p,
  );

  return { curves: previewCurves, strength };
}

function buildSketchPreviewCurves(
  p: p5,
  targetPath: Path,
  suggestion: Suggestion,
  selectionRange: SelectionRange | undefined,
  strength: number,
): p5.Vector[][] | null {
  const originalCurves = buildSketchCurves(targetPath.keyframes);
  if (originalCurves.length === 0) return null;

  const baseProgress = computeKeyframeProgress(
    targetPath.keyframes,
    originalCurves,
  );
  const { keyframes: referenceKeyframes, progress: referenceProgress } =
    getSelectionReference(targetPath, selectionRange, baseProgress);

  const llmKeyframes = deserializePathKeyframes(
    suggestion.path,
    referenceKeyframes,
    referenceProgress,
    p,
  );
  if (llmKeyframes.length === 0) return null;

  const previewSketchModifier = createSketchModifier(
    targetPath.keyframes,
    llmKeyframes,
    'preview',
    selectionRange,
  );
  previewSketchModifier.strength = strength;

  const previewCurves = applySketchModifiers(
    originalCurves,
    targetPath.keyframes,
    [...(targetPath.sketchModifiers ?? []), previewSketchModifier],
    p,
  );
  if (!selectionRange) return previewCurves;

  const rangeStart = Math.max(
    0,
    Math.min(originalCurves.length - 1, selectionRange.startCurveIndex),
  );
  const rangeEnd = Math.max(
    0,
    Math.min(originalCurves.length - 1, selectionRange.endCurveIndex),
  );
  if (rangeStart > rangeEnd) return null;

  const previewStart = Math.max(0, rangeStart - 1);
  const previewEnd = Math.min(previewCurves.length - 1, rangeEnd + 1);
  return previewCurves.slice(previewStart, previewEnd + 1);
}
