import type { Path, SelectionRange } from '../types';

// 部分パスを作成
export function slicePath(path: Path, range?: SelectionRange): Path {
  // 選択範囲がない場合は元のパスのコピーを返す
  if (!range)
    return {
      ...path,
      sketch: { ...path.sketch, curves: [...path.sketch.curves] },
    };

  // 範囲指定がある場合は部分的に切り出す
  const curves = path.sketch.curves.slice(
    range.startCurveIndex,
    range.endCurveIndex + 1,
  );
  return { ...path, sketch: { ...path.sketch, curves } };
}

// 部分置換
export function replacePathRange(
  original: Path,
  replacement: Path,
  range?: SelectionRange,
): Path {
  // 範囲選択がない場合は全体を置換
  if (!range) return replacement;

  // 選択範囲がある場合は一部を置換
  const { startCurveIndex, endCurveIndex } = range;
  const restoredCurves = replacement.sketch.curves;

  const newCurves = [
    ...original.sketch.curves.slice(0, startCurveIndex),
    ...restoredCurves,
    ...original.sketch.curves.slice(endCurveIndex + 1),
  ];

  return {
    ...original,
    sketch: { ...original.sketch, curves: newCurves },
  };
}

// 終点取得
export function getPathEndPoint(
  path: Path,
  range?: SelectionRange,
): { x: number; y: number } | null {
  if (path.sketch.curves.length > 0) {
    // 選択範囲がある場合はその終点、なければパス全体の終点
    const endCurveIndex = range?.endCurveIndex ?? path.sketch.curves.length - 1;
    // 3番目の要素が終点アンカー (bezierCurveの定義による)
    const endPoint = path.sketch.curves[endCurveIndex]?.[3];
    if (endPoint) return { x: endPoint.x, y: endPoint.y };
  }

  // カーブがない場合は点列の最後
  if (path.sketch.points.length > 0) {
    const endPoint = path.sketch.points[path.sketch.points.length - 1];
    return { x: endPoint.x, y: endPoint.y };
  }

  return null;
}
