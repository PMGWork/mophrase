/**
 * キャンバスキャプチャ処理。
 * LLM送信用のスクリーンショット生成・クロップ・キーフレームラベル描画を担当する。
 */

import p5 from 'p5';
import type { Path, SelectionRange } from '../../types';
import { resolveSketchCurves } from '../../utils/path';

// 型定義
type Rect = { x: number; y: number; width: number; height: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// PNG キャプチャを生成
export function captureCanvas(
  canvasElement: HTMLCanvasElement,
  background: string,
  p: p5 | null,
  path?: Path,
  selectionRange?: SelectionRange,
): string | null {
  try {
    const src = canvasElement;
    const crop = path
      ? selectionRange
        ? computeSelectionCropRect(path, selectionRange, src, p)
        : computePathCropRect(path, src, p)
      : null;
    const sourceX = crop?.x ?? 0;
    const sourceY = crop?.y ?? 0;
    const sourceW = crop?.width ?? src.width;
    const sourceH = crop?.height ?? src.height;

    const w = sourceW;
    const h = sourceH;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return src.toDataURL('image/png');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(
      src,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      0,
      0,
      sourceW,
      sourceH,
    );

    // キーフレームインデックスラベルを描画
    if (path) {
      drawKeyframeLabels(ctx, path, src, sourceX, sourceY, selectionRange, p);
    }

    return offscreen.toDataURL('image/png');
  } catch {
    return null;
  }
}

// キーフレームラベルをキャンバスに描画
function drawKeyframeLabels(
  ctx: CanvasRenderingContext2D,
  path: Path,
  src: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  selectionRange: SelectionRange | undefined,
  p: p5 | null,
): void {
  const { effective: effectiveCurves } = resolveSketchCurves(
    path,
    p ?? undefined,
  );
  if (effectiveCurves.length === 0 && path.keyframes.length === 0) return;

  // CSS→物理ピクセル変換比
  const rect = src.getBoundingClientRect();
  const scaleX = rect.width > 0 ? src.width / rect.width : 1;
  const scaleY = rect.height > 0 ? src.height / rect.height : 1;

  // モディファイア適用後の各キーフレームのアンカー座標を取得
  const anchorPositions: { x: number; y: number }[] = [];
  for (let i = 0; i < path.keyframes.length; i++) {
    if (i === 0 && effectiveCurves.length > 0) {
      const pt = effectiveCurves[0][0];
      anchorPositions.push({ x: pt.x, y: pt.y });
    } else if (i > 0 && i - 1 < effectiveCurves.length) {
      const pt = effectiveCurves[i - 1][3];
      anchorPositions.push({ x: pt.x, y: pt.y });
    } else {
      const pos = path.keyframes[i].position;
      anchorPositions.push({ x: pos.x, y: pos.y });
    }
  }

  // ラベルスタイル設定
  const fontSize = 24;
  const paddingX = 10;
  const paddingY = 8;
  const offsetY = -24;
  ctx.font = `bold ${fontSize}px Geist, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < anchorPositions.length; i++) {
    if (!isKeyframeInSelection(i, anchorPositions.length, selectionRange)) {
      continue;
    }
    const pos = anchorPositions[i];
    const canvasX = pos.x * scaleX - sourceX;
    const canvasY = pos.y * scaleY - sourceY;

    const label = `${i}`;
    const metrics = ctx.measureText(label);
    const textWidth = metrics.width;
    const diameter = Math.max(
      fontSize + paddingY * 2,
      textWidth + paddingX * 2,
    );
    const radius = diameter / 2;
    const centerY = canvasY + offsetY;

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(canvasX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // テキスト
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, canvasX, centerY);
  }
}

function isKeyframeInSelection(
  index: number,
  keyframeCount: number,
  selectionRange: SelectionRange | undefined,
): boolean {
  if (!selectionRange) return true;

  if (selectionRange.anchorKeyframeIndex !== undefined) {
    const anchorIndex = Math.max(
      0,
      Math.min(keyframeCount - 1, selectionRange.anchorKeyframeIndex),
    );
    return index === anchorIndex;
  }

  const maxCurveIndex = Math.max(0, keyframeCount - 2);
  const start = Math.max(
    0,
    Math.min(maxCurveIndex, selectionRange.startCurveIndex),
  );
  const end = Math.max(
    0,
    Math.min(maxCurveIndex, selectionRange.endCurveIndex),
  );
  if (start > end) return true;
  return index >= start && index <= end + 1;
}

// パス全体のクロップ矩形を計算
function computePathCropRect(
  path: Path,
  canvas: HTMLCanvasElement,
  p: p5 | null,
): Rect | null {
  const { effective: effectiveCurves } = resolveSketchCurves(
    path,
    p ?? undefined,
  );
  if (effectiveCurves.length === 0) return null;

  const bounds = computePointBounds(effectiveCurves.flat());
  if (!bounds) return null;

  return toCanvasCropRect(bounds, canvas);
}

// 選択セグメントのクロップ矩形を計算
function computeSelectionCropRect(
  path: Path,
  selectionRange: SelectionRange,
  canvas: HTMLCanvasElement,
  p: p5 | null,
): Rect | null {
  const { effective: effectiveCurves } = resolveSketchCurves(
    path,
    p ?? undefined,
  );
  if (effectiveCurves.length === 0) return null;

  if (selectionRange.anchorKeyframeIndex !== undefined) {
    const anchorIndex = Math.max(
      0,
      Math.min(path.keyframes.length - 1, selectionRange.anchorKeyframeIndex),
    );
    const pointSet: p5.Vector[] = [];
    const segmentCount = effectiveCurves.length;

    if (anchorIndex < segmentCount) {
      const forward = effectiveCurves[anchorIndex];
      if (forward) pointSet.push(...forward);
    }
    if (anchorIndex > 0) {
      const backward = effectiveCurves[anchorIndex - 1];
      if (backward) pointSet.push(...backward);
    }

    if (pointSet.length > 0) {
      const bounds = computePointBounds(pointSet);
      if (bounds) {
        return toCanvasCropRect(bounds, canvas);
      }
    }
  }

  const start = Math.max(0, selectionRange.startCurveIndex - 1);
  const end = Math.min(
    effectiveCurves.length - 1,
    selectionRange.endCurveIndex + 1,
  );
  if (start > end) return null;

  const rangePoints = effectiveCurves.slice(start, end + 1).flat();
  const bounds = computePointBounds(rangePoints);
  if (!bounds) return null;

  return toCanvasCropRect(bounds, canvas);
}

// 点群からバウンディングボックスを計算
function computePointBounds(points: p5.Vector[]): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (!point) continue;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

// CSS 座標の Bounds をピクセル矩形に変換
function toCanvasCropRect(bounds: Bounds, canvas: HTMLCanvasElement): Rect {
  const { minX, minY, maxX, maxY } = bounds;
  const cssW = Math.max(1, maxX - minX);
  const cssH = Math.max(1, maxY - minY);
  const padX = Math.min(32, cssW * 0.4);
  const padY = Math.min(32, cssH * 0.4);

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  const rawX = Math.floor((minX - padX) * scaleX);
  const rawY = Math.floor((minY - padY) * scaleY);
  const rawW = Math.ceil((cssW + padX * 2) * scaleX);
  const rawH = Math.ceil((cssH + padY * 2) * scaleY);

  const x = Math.max(0, Math.min(canvas.width - 1, rawX));
  const y = Math.max(0, Math.min(canvas.height - 1, rawY));
  const maxW = canvas.width - x;
  const maxH = canvas.height - y;
  const width = Math.max(1, Math.min(maxW, rawW));
  const height = Math.max(1, Math.min(maxH, rawH));

  return { x, y, width, height };
}
