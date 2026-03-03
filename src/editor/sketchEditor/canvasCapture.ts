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
    const outerMargin = 32;
    const crop = path
      ? selectionRange
        ? computeSelectionCropRect(path, selectionRange, src, p)
        : computePathCropRect(path, src, p)
      : null;
    const sourceX = crop?.x ?? 0;
    const sourceY = crop?.y ?? 0;
    const sourceW = crop?.width ?? src.width;
    const sourceH = crop?.height ?? src.height;

    const w = sourceW + outerMargin * 2;
    const h = sourceH + outerMargin * 2;
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
      outerMargin,
      outerMargin,
      sourceW,
      sourceH,
    );

    // キーフレームインデックスラベルを描画
    if (path) {
      drawKeyframeLabels(ctx, path, src, sourceX, sourceY, outerMargin, p);
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
  outerMargin: number,
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
  const fontSize = 20;
  const padding = 5;
  const offsetY = -14;
  ctx.font = `bold ${fontSize}px Geist, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (let i = 0; i < anchorPositions.length; i++) {
    const pos = anchorPositions[i];
    const canvasX = pos.x * scaleX - sourceX + outerMargin;
    const canvasY = pos.y * scaleY - sourceY + outerMargin;

    const label = `[${i}]`;
    const metrics = ctx.measureText(label);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    // 背景矩形
    const bgX = canvasX - textWidth / 2 - padding;
    const bgY = canvasY + offsetY - textHeight - padding;
    const bgW = textWidth + padding * 2;
    const bgH = textHeight + padding * 2;

    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgW, bgH, 3);
    ctx.fill();

    // テキスト
    ctx.fillStyle = '#000000';
    ctx.fillText(label, canvasX, canvasY + offsetY);
  }
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
      const anchor = forward?.[0];
      const outHandle = forward?.[1];
      if (anchor) pointSet.push(anchor);
      if (outHandle) pointSet.push(outHandle);
    }
    if (anchorIndex > 0) {
      const backward = effectiveCurves[anchorIndex - 1];
      const inHandle = backward?.[2];
      const anchor = backward?.[3];
      if (inHandle) pointSet.push(inHandle);
      if (anchor) pointSet.push(anchor);
    }

    if (pointSet.length > 0) {
      const bounds = computePointBounds(pointSet);
      if (bounds) {
        return toCanvasCropRect(bounds, canvas);
      }
    }
  }

  const start = Math.max(0, selectionRange.startCurveIndex);
  const end = Math.min(
    effectiveCurves.length - 1,
    selectionRange.endCurveIndex,
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
  const padX = Math.max(24, cssW * 0.2);
  const padY = Math.max(24, cssH * 0.2);

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
