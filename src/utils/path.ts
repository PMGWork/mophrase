import type { Path, SelectionRange } from '../types';

// 部分パスを作成
export function slicePath(path: Path, range?: SelectionRange): Path {
  // 選択範囲がない場合は元のパスのコピーを返す
  if (!range)
    return {
      ...path,
      keyframes: [...path.keyframes],
    };

  // 範囲指定がある場合は部分的に切り出す
  const start = Math.max(0, range.startCurveIndex);
  const end = Math.min(path.keyframes.length - 2, range.endCurveIndex);
  if (start > end) return { ...path, keyframes: [...path.keyframes] };

  const keyframes = path.keyframes.slice(start, end + 2);
  return { ...path, keyframes };
}
