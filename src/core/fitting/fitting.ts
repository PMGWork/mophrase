import type { FitErrorResult, Vector } from '../../types';
import { splitTangent } from '../../utils/math';
import {
  computeEndTangents,
  computeMaxError,
  computeMaxErrorAtSplitPoints,
  extractEndPoints,
  fitControlPoints,
  parametrizeRange,
  refineParams,
  type FitCurveResult,
  type Range,
  type Tangents,
} from './segment';

// #region パブリック関数

// スケッチのフィッティング
export function fitSketchCurves(
  points: Vector[],
  errorTol: number,
  coarseErrTol: number,
  fitError: { current: FitErrorResult },
): FitCurveResult {
  const curves: Vector[][] = [];
  const ranges: Range[] = [];
  const [tangent0, tangent1] = computeEndTangents(points);

  fitSketchRecursive(
    points,
    curves,
    { start: 0, end: points.length - 1 },
    { start: tangent0, end: tangent1 },
    errorTol,
    coarseErrTol,
    fitError,
    ranges,
  );

  return { curves, ranges };
}

// イージングのフィッティング
export function fitGraphCurves(
  points: Vector[],
  splitPoints: number[],
): FitCurveResult {
  const curves: Vector[][] = [];
  const ranges: Range[] = [];
  const [tangent0, tangent1] = computeEndTangents(points);
  const normalizedSplitPoints = Array.from(
    new Set(
      splitPoints.filter(
        (index) =>
          Number.isFinite(index) && index > 0 && index < points.length - 1,
      ),
    ),
  ).sort((a, b) => a - b);

  fitGraphRecursive(
    points,
    curves,
    { start: 0, end: points.length - 1 },
    { start: tangent0, end: tangent1 },
    normalizedSplitPoints,
    ranges,
  );

  return { curves, ranges };
}

// #region プライベート関数

// 再帰的にベジェ曲線をフィットする
// (スケッチのフィッティング用)
function fitSketchRecursive(
  points: Vector[],
  curves: Vector[][],
  range: Range,
  tangents: Tangents,
  errorTol: number,
  coarseErrTol: number,
  fitError: { current: FitErrorResult },
  ranges?: Range[],
): void {
  // パラメータを計算
  const params = parametrizeRange(points, range);

  // 制御点を計算
  const controls: Vector[] = new Array(4);
  const [p0, p3] = extractEndPoints(points, range);
  controls[0] = p0;
  controls[3] = p3;
  fitControlPoints(controls, params, tangents, points, range);

  // 最大誤差を計算
  const errorResult = computeMaxError(controls, params, points, range);
  let maxError = errorResult.maxError;

  // fitErrorを更新
  fitError.current = errorResult;

  // 許容誤差内にある場合のみ確定
  if (maxError <= errorTol) {
    curves.push(controls);
    ranges?.push({ start: range.start, end: range.end });
    return;
  }

  // 粗めの誤差を満たす場合
  if (maxError <= coarseErrTol) {
    // Newton法でパラメータを1回だけ再計算
    refineParams(controls, params, points, range.start);

    // 制御点を再生成
    fitControlPoints(controls, params, tangents, points, range);

    // 誤差を再評価
    const newErrorResult = computeMaxError(controls, params, points, range);
    maxError = newErrorResult.maxError;

    // fitErrorを更新
    fitError.current = newErrorResult;

    // 許容誤差内に収まったら確定
    if (maxError <= errorTol) {
      curves.push(controls);
      ranges?.push({ start: range.start, end: range.end });
      return;
    }
  }

  // 分割点で分割する
  const splitIndex = fitError.current.index;
  if (splitIndex <= range.start || splitIndex >= range.end) {
    curves.push(controls);
    ranges?.push({ start: range.start, end: range.end });
    return;
  }

  // 分割点の接ベクトルを計算
  const tangent = splitTangent(points, splitIndex);
  if (tangent === null) {
    curves.push(controls);
    ranges?.push({ start: range.start, end: range.end });
    return;
  }

  // 再帰的に分割してフィッティング
  fitSketchRecursive(
    points,
    curves,
    { start: range.start, end: splitIndex },
    { start: tangents.start, end: tangent },
    errorTol,
    coarseErrTol,
    fitError,
    ranges,
  );
  fitSketchRecursive(
    points,
    curves,
    { start: splitIndex, end: range.end },
    { start: tangent.copy().mult(-1), end: tangents.end },
    errorTol,
    coarseErrTol,
    fitError,
    ranges,
  );
}

// 分割点を考慮してベジェ曲線をフィットする
// (イージングのフィッティング用)
function fitGraphRecursive(
  points: Vector[],
  curves: Vector[][],
  range: Range,
  tangents: Tangents,
  splitPoints: number[],
  ranges: Range[],
): void {
  const params = parametrizeRange(points, range);

  const controls: Vector[] = new Array(4);
  const [p0, p3] = extractEndPoints(points, range);
  controls[0] = p0;
  controls[3] = p3;
  fitControlPoints(controls, params, tangents, points, range);

  const errorResult = computeMaxErrorAtSplitPoints(
    controls,
    params,
    points,
    range,
    splitPoints,
  );
  const splitIndex = errorResult.index;
  if (splitIndex === -1) {
    curves.push(controls);
    ranges.push({ start: range.start, end: range.end });
    return;
  }

  const tangent = splitTangent(points, splitIndex);
  if (tangent === null) {
    curves.push(controls);
    ranges.push({ start: range.start, end: range.end });
    return;
  }

  fitGraphRecursive(
    points,
    curves,
    { start: range.start, end: splitIndex },
    { start: tangents.start, end: tangent },
    splitPoints,
    ranges,
  );
  fitGraphRecursive(
    points,
    curves,
    { start: splitIndex, end: range.end },
    { start: tangent.copy().mult(-1), end: tangents.end },
    splitPoints,
    ranges,
  );
}
