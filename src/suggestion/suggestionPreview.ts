import type p5 from 'p5';

import type { Colors, Config } from '../config';
import type { Path, SelectionRange, Suggestion } from '../types';
import { drawBezierCurve } from '../utils/draw';
import {
  buildGraphCurves,
  buildSketchCurves,
  computeKeyframeProgress,
} from '../utils/keyframes';
import { applyGraphModifiers, applySketchModifiers } from '../utils/modifier';
import { slicePath } from '../utils/path';
import { deserializeCurves, deserializeGraphCurves } from '../utils/serialization';

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

  const previewCurves = selectionRange
    ? buildSelectionPreviewCurves(
        p,
        targetPath,
        suggestion,
        selectionRange,
        strength,
      )
    : buildFullPreviewCurves(p, targetPath, suggestion, strength);

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
  const baseGraphCurves = buildGraphCurves(
    targetPath.keyframes,
    baseProgress,
  );
  const effectiveSketchCurves = applySketchModifiers(
    baseSketchCurves,
    targetPath.sketchModifiers,
    p,
  );
  const effectiveProgress = computeKeyframeProgress(
    targetPath.keyframes,
    effectiveSketchCurves,
  );
  const effectiveGraphCurves = applyGraphModifiers(
    buildGraphCurves(targetPath.keyframes, effectiveProgress),
    targetPath.graphModifiers,
    p,
  );
  if (baseGraphCurves.length === 0 || effectiveGraphCurves.length === 0)
    return null;

  // LLM の提案から時間カーブを取得
  let referenceKeyframes = targetPath.keyframes;
  let referenceProgress = baseProgress;

  if (selectionRange) {
    const sliced = slicePath(targetPath, selectionRange);
    referenceKeyframes = sliced.keyframes;
    const start = Math.max(0, selectionRange.startCurveIndex);
    const end = Math.min(
      targetPath.keyframes.length - 2,
      selectionRange.endCurveIndex,
    );
    if (start <= end) {
      referenceProgress = baseProgress.slice(start, end + 2);
    }
  }

  const llmGraphCurves = deserializeGraphCurves(
    suggestion.path.keyframes,
    referenceKeyframes,
    referenceProgress,
    p,
  );

  if (llmGraphCurves.length === 0) return null;

  // 範囲を計算
  const rangeStart = selectionRange
    ? Math.max(
        0,
        Math.min(baseGraphCurves.length - 1, selectionRange.startCurveIndex),
      )
    : 0;
  const rangeEnd = selectionRange
    ? Math.max(
        0,
        Math.min(baseGraphCurves.length - 1, selectionRange.endCurveIndex),
      )
    : baseGraphCurves.length - 1;

  // プレビューカーブを計算
  const previewCurves = effectiveGraphCurves.map((curve, curveIndex) =>
    curve.map((pt, ptIndex) => {
      if (curveIndex < rangeStart || curveIndex > rangeEnd) return pt;
      const localIndex = curveIndex - rangeStart;
      const baseCurve = baseGraphCurves[curveIndex];
      const basePoint = baseCurve?.[ptIndex];
      const suggPt = llmGraphCurves[localIndex]?.[ptIndex];
      if (!suggPt || !basePoint) return pt;
      const dx = (suggPt.x - basePoint.x) * strength;
      const dy = (suggPt.y - basePoint.y) * strength;
      if (dx === 0 && dy === 0) return pt;
      return p.createVector(pt.x + dx, pt.y + dy);
    }),
  );

  return { curves: previewCurves, strength };
}

function buildFullPreviewCurves(
  p: p5,
  targetPath: Path,
  suggestion: Suggestion,
  strength: number,
): p5.Vector[][] | null {
  const originalCurves = buildSketchCurves(targetPath.keyframes);
  if (originalCurves.length === 0) return null;

  const suggestionCurves = deserializeCurves(suggestion.path, p);
  if (suggestionCurves.length === 0) return null;

  const effectiveCurves = applySketchModifiers(
    originalCurves,
    targetPath.sketchModifiers,
    p,
  );

  return effectiveCurves.map((curve, curveIdx) => {
    const suggCurve = suggestionCurves[curveIdx];
    const originalCurve = originalCurves[curveIdx];
    if (!suggCurve || !originalCurve) return curve;

    return curve.map((pt, ptIdx) => {
      const suggPt = suggCurve[ptIdx];
      const originalPt = originalCurve[ptIdx];
      if (!suggPt || !originalPt) return pt;

      const dx = (suggPt.x - originalPt.x) * strength;
      const dy = (suggPt.y - originalPt.y) * strength;
      if (dx === 0 && dy === 0) return pt;
      return p.createVector(pt.x + dx, pt.y + dy);
    });
  });
}

function buildSelectionPreviewCurves(
  p: p5,
  targetPath: Path,
  suggestion: Suggestion,
  selectionRange: SelectionRange,
  strength: number,
): p5.Vector[][] | null {
  const originalCurves = buildSketchCurves(targetPath.keyframes);
  const effectiveCurves = applySketchModifiers(
    originalCurves,
    targetPath.sketchModifiers,
    p,
  );
  const suggestionCurves = deserializeCurves(suggestion.path, p);
  if (originalCurves.length === 0 || suggestionCurves.length === 0) {
    return null;
  }

  const rangeStart = Math.max(
    0,
    Math.min(originalCurves.length - 1, selectionRange.startCurveIndex),
  );
  const rangeEnd = Math.max(
    0,
    Math.min(originalCurves.length - 1, selectionRange.endCurveIndex),
  );
  if (rangeStart > rangeEnd) return null;

  const previewCurves = effectiveCurves.map((curve, curveIndex) =>
    curve.map((pt, ptIndex) => {
      if (curveIndex < rangeStart || curveIndex > rangeEnd) return pt;
      const localIndex = curveIndex - rangeStart;
      const originalCurve = originalCurves[curveIndex];
      const originalPoint = originalCurve?.[ptIndex];
      const suggPt = suggestionCurves[localIndex]?.[ptIndex];
      if (!suggPt || !originalPoint) return pt;
      const dx = (suggPt.x - originalPoint.x) * strength;
      const dy = (suggPt.y - originalPoint.y) * strength;
      if (dx === 0 && dy === 0) return pt;
      return p.createVector(pt.x + dx, pt.y + dy);
    }),
  );

  const startOriginal = originalCurves[rangeStart]?.[0];
  const startSuggested = suggestionCurves[0]?.[0];
  if (startOriginal && startSuggested && rangeStart > 0) {
    const dx = (startSuggested.x - startOriginal.x) * strength;
    const dy = (startSuggested.y - startOriginal.y) * strength;
    const prevCurve = previewCurves[rangeStart - 1];
    if (prevCurve) {
      prevCurve[2] = p.createVector(prevCurve[2].x + dx, prevCurve[2].y + dy);
      prevCurve[3] = p.createVector(prevCurve[3].x + dx, prevCurve[3].y + dy);
    }
  }

  const localEndIndex = Math.min(
    suggestionCurves.length - 1,
    rangeEnd - rangeStart,
  );
  const endOriginal = originalCurves[rangeEnd]?.[3];
  const endSuggested = suggestionCurves[localEndIndex]?.[3];
  if (endOriginal && endSuggested && rangeEnd < originalCurves.length - 1) {
    const dx = (endSuggested.x - endOriginal.x) * strength;
    const dy = (endSuggested.y - endOriginal.y) * strength;
    const nextCurve = previewCurves[rangeEnd + 1];
    if (nextCurve) {
      nextCurve[0] = p.createVector(nextCurve[0].x + dx, nextCurve[0].y + dy);
      nextCurve[1] = p.createVector(nextCurve[1].x + dx, nextCurve[1].y + dy);
    }
  }

  const previewStart = Math.max(0, rangeStart - 1);
  const previewEnd = Math.min(previewCurves.length - 1, rangeEnd + 1);
  return previewCurves.slice(previewStart, previewEnd + 1);
}
