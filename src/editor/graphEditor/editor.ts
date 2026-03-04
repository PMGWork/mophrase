/**
 * グラフエディタ。
 * 時間カーブ（イージング）の表示とハンドル操作を p5.js で提供する。
 */

import p5 from 'p5';
import type { Colors, Config } from '../../config';
import { HANDLE_RADIUS } from '../../constants';
import type {
  HandleSelection,
  Keyframe,
  Path,
  SelectionRange,
} from '../../types';
import { clamp } from '../../utils/math';
import { drawBezierCurve, drawControls } from '../shared/curveRendering';
import { resolveGraphCurves } from '../../utils/path';
import {
  isLeftMouseButton,
  isPrimaryEditingPointer,
  toEditorPointerInput,
} from '../shared/pointerInput';
import { PointerSession } from '../shared/pointerSession';
import type { GraphEditorDomRefs, GraphHandleSelection } from './types';

// グラフエディタで管理する選択ハンドルのインデックスセット
type SelectedHandleIndexSets = {
  anchors: Set<number>;
  sketchOut: Set<number>;
  sketchIn: Set<number>;
};

// グラフエディタで使用する矩形と境界の型
type Rect = { x: number; y: number; width: number; height: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// グラフエディタ
export class GraphEditor {
  // データ
  private activePath: Path | null = null;
  private dom: GraphEditorDomRefs;

  // ドラッグ状態
  private draggedHandle: GraphHandleSelection | null = null;

  // プレビュープロバイダー
  private previewProvider?: (
    p: p5,
  ) => { curves: p5.Vector[][]; strength: number } | null;
  private selectionRangeProvider?: () => SelectionRange | undefined;
  private selectedHandlesProvider?: () => HandleSelection[];

  // 設定
  private config: Config;
  private colors: Colors;

  // グラフ領域のマージン
  private static readonly GRAPH_MARGIN = 24;

  // コンストラクタ
  constructor(dom: GraphEditorDomRefs, config: Config, colors: Colors) {
    this.dom = dom;
    this.config = config;
    this.colors = colors;

    // p5.jsの初期化
    this.init();
  }

  // p5.js インスタンス
  private p: p5 | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private pointerEventsEnabled: boolean = false;
  private readonly pointerSession = new PointerSession({
    onPointerDown: (event) => this.pointerDown(event),
    onPointerMove: (event) => this.pointerMove(event),
    onPointerEnd: (event) => this.pointerEnd(event),
    onPointerLostCapture: (event) => this.pointerLostCapture(event),
  });

  // #region メイン関数

  // パスの設定
  public setPath(path: Path | null): void {
    if (!path || path.keyframes.length < 2) {
      this.activePath = null;
      return;
    }

    this.activePath = path;
  }

  // プレビュープロバイダーを設定
  public setPreviewProvider(
    provider: (p: p5) => { curves: p5.Vector[][]; strength: number } | null,
  ): void {
    this.previewProvider = provider;
  }

  // 選択範囲プロバイダーを設定
  public setSelectionRangeProvider(
    provider?: () => SelectionRange | undefined,
  ): void {
    this.selectionRangeProvider = provider;
  }

  // 選択ハンドルプロバイダーを設定
  public setSelectedHandlesProvider(
    provider?: () => HandleSelection[],
  ): void {
    this.selectedHandlesProvider = provider;
  }

  // リサイズ
  public resize(): void {
    if (!this.p) return;
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    this.p.resizeCanvas(size, size);
  }

  // キャンバスを PNG data URL としてキャプチャ
  public captureCanvas(): string | null {
    if (!this.canvasElement) return null;
    try {
      const src = this.canvasElement;
      const selectionRange = this.selectionRangeProvider?.();
      const crop = this.computeFocusedCropRect();
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
      ctx.fillStyle = this.colors.background;
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
      if (this.activePath) {
        this.drawKeyframeLabels(
          ctx,
          sourceX,
          sourceY,
          selectionRange,
        );
      }
      return offscreen.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  // キャプチャ画像へキーフレームインデックスを描画
  private drawKeyframeLabels(
    ctx: CanvasRenderingContext2D,
    sourceX: number,
    sourceY: number,
    selectionRange: SelectionRange | undefined,
  ): void {
    const graphData = this.getGraphData();
    const src = this.canvasElement;
    if (!graphData || !src) return;

    const { effectiveCurves } = graphData;
    if (effectiveCurves.length === 0) return;

    const anchors: p5.Vector[] = [effectiveCurves[0][0]];
    for (let i = 0; i < effectiveCurves.length; i++) {
      anchors.push(effectiveCurves[i][3]);
    }

    const rect = src.getBoundingClientRect();
    const scaleX = rect.width > 0 ? src.width / rect.width : 1;
    const scaleY = rect.height > 0 ? src.height / rect.height : 1;
    const graphMarginX = GraphEditor.GRAPH_MARGIN * scaleX;
    const graphMarginY = GraphEditor.GRAPH_MARGIN * scaleY;
    const graphW = src.width - graphMarginX * 2;
    const graphH = src.height - graphMarginY * 2;
    if (graphW <= 0 || graphH <= 0) return;

    const fontSize = 24;
    const paddingX = 10;
    const paddingY = 8;
    const offsetY = -24;
    ctx.font = `bold ${fontSize}px Geist, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < anchors.length; i++) {
      if (!this.isKeyframeInSelection(i, anchors.length, selectionRange)) {
        continue;
      }
      const point = anchors[i];
      if (!point) continue;
      const canvasX = graphMarginX + point.x * graphW - sourceX;
      const canvasY = graphMarginY + (1 - point.y) * graphH - sourceY;

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

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, canvasX, centerY);
    }
  }

  private isKeyframeInSelection(
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

  public destroy(): void {
    this.pointerSession.detach();
    this.p?.remove();
    this.p = null;
    this.canvasElement = null;
    this.draggedHandle = null;
  }

  // #region p5.js

  // p5.js 初期化
  private init(): void {
    this.pointerEventsEnabled =
      typeof window !== 'undefined' && 'PointerEvent' in window;

    const sketch = (p: p5) => {
      p.setup = () => this.setup(p);
      p.draw = () => this.draw(p);
      if (!this.pointerEventsEnabled) {
        p.mouseDragged = () => this.mouseDragged(p);
        p.mousePressed = () => this.mousePressed(p);
        p.mouseReleased = () => this.mouseReleased();
      }
    };

    this.p = new p5(sketch);
  }

  // p5.js セットアップ
  private setup(p: p5): void {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    const renderer = p.createCanvas(size, size);
    renderer.parent(this.dom.graphEditorCanvas);
    this.canvasElement = renderer.elt as HTMLCanvasElement;
    if (this.pointerEventsEnabled && this.canvasElement) {
      this.canvasElement.style.touchAction = 'none';
      this.pointerSession.attach(this.canvasElement);
    }
    p.textFont('Geist');
  }

  // p5.js 描画
  private draw(p: p5): void {
    p.background(this.colors.background);

    const width = p.width;
    const height = p.height;

    // グラフ領域の計算
    const margin = GraphEditor.GRAPH_MARGIN;
    const graphW = width - margin * 2;
    const graphH = height - margin * 2;

    if (graphW <= 0 || graphH <= 0) return;

    p.push();
    p.translate(margin, margin);

    // グリッド
    p.noFill();

    // 内側のグリッド線
    p.stroke(`${this.colors.border}80`);
    p.strokeWeight(0.5);
    const gridSize = 5;
    for (let i = 1; i < gridSize; i++) {
      const x = (graphW / gridSize) * i;
      const y = (graphH / gridSize) * i;
      p.line(x, 0, x, graphH);
      p.line(0, y, graphW, y);
    }

    // 外枠
    p.stroke(this.colors.border);
    p.strokeWeight(1);
    p.rect(0, 0, graphW, graphH);

    // パスが存在しない場合は描画しない
    if (!this.activePath) {
      p.pop();
      return;
    }

    // グラフデータの生成
    const graphData = this.getGraphData();
    if (!graphData) {
      p.pop();
      return;
    }

    const { effectiveCurves } = graphData;
    const selectedHandles = this.selectedHandlesProvider?.() ?? [];
    const selectedHandleSets =
      this.buildSelectedHandleIndexSets(selectedHandles);
    const highlightedRange = this.resolveHighlightedCurveRange(
      effectiveCurves.length - 1,
    );

    // ベジェ曲線（Modifier 適用後）
    p.push();
    p.scale(graphW, graphH);
    p.translate(0, 1);
    p.scale(1, -1);
    drawBezierCurve(
      p,
      effectiveCurves,
      this.config.lineWeight / Math.min(graphW, graphH),
      this.colors.curve,
    );
    if (highlightedRange) {
      drawBezierCurve(
        p,
        effectiveCurves.slice(
          highlightedRange.startCurveIndex,
          highlightedRange.endCurveIndex + 1,
        ),
        this.config.lineWeight / Math.min(graphW, graphH),
        this.colors.selection,
      );
    }
    p.pop();

    // 制御点と制御ポリゴン（Modifier 適用後のカーブを使用）
    drawControls(
      p,
      effectiveCurves,
      this.config.pointSize,
      this.colors.handle,
      (v) => p.createVector(v.x * graphW, (1 - v.y) * graphH),
      (curveIndex, pointIndex) => {
        if (
          this.draggedHandle &&
          this.draggedHandle.segmentIndex === curveIndex
        ) {
          const isOut = this.draggedHandle.type === 'GRAPH_OUT';
          if (isOut && pointIndex === 1) return this.colors.selection;
          if (!isOut && pointIndex === 2) return this.colors.selection;
        }
        if (
          this.isGraphPointMappedFromSelection(
            curveIndex,
            pointIndex,
            selectedHandleSets,
          )
        ) {
          return this.colors.selection;
        }
        if (this.isCurveInHighlightedRange(curveIndex, highlightedRange)) {
          return this.colors.selection;
        }
        return this.colors.handle;
      },
    );

    // プレビューカーブの描画（点線）
    if (this.previewProvider) {
      const previewData = this.previewProvider(p);
      if (previewData && previewData.curves.length > 0) {
        const ctx = p.drawingContext as CanvasRenderingContext2D;
        const previousDash =
          typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

        p.push();
        p.scale(graphW, graphH);
        p.translate(0, 1);
        p.scale(1, -1);
        drawBezierCurve(
          p,
          previewData.curves,
          this.config.lineWeight / Math.min(graphW, graphH),
          this.colors.handle,
        );
        p.pop();

        if (typeof ctx.setLineDash === 'function')
          ctx.setLineDash(previousDash);
      }
    }

    p.pop();
  }

  private resolveHighlightedCurveRange(
    maxCurveIndex: number,
  ): Pick<SelectionRange, 'startCurveIndex' | 'endCurveIndex'> | null {
    if (maxCurveIndex < 0) return null;
    const selectionRange = this.selectionRangeProvider?.();
    if (!selectionRange) return null;
    if (selectionRange.anchorKeyframeIndex !== undefined) return null;
    const startCurveIndex = Math.max(
      0,
      Math.min(maxCurveIndex, selectionRange.startCurveIndex),
    );
    const endCurveIndex = Math.max(
      0,
      Math.min(maxCurveIndex, selectionRange.endCurveIndex),
    );
    if (startCurveIndex > endCurveIndex) return null;
    return { startCurveIndex, endCurveIndex };
  }

  private isCurveInHighlightedRange(
    curveIndex: number,
    range: Pick<SelectionRange, 'startCurveIndex' | 'endCurveIndex'> | null,
  ): boolean {
    if (!range) return false;
    return (
      curveIndex >= range.startCurveIndex && curveIndex <= range.endCurveIndex
    );
  }

  private buildSelectedHandleIndexSets(
    selectedHandles: HandleSelection[],
  ): SelectedHandleIndexSets {
    const anchors = new Set<number>();
    const sketchOut = new Set<number>();
    const sketchIn = new Set<number>();
    selectedHandles.forEach((handle) => {
      if (handle.handleType === 'ANCHOR') {
        anchors.add(handle.keyframeIndex);
        return;
      }
      if (handle.handleType === 'SKETCH_OUT') {
        sketchOut.add(handle.keyframeIndex);
        return;
      }
      if (handle.handleType === 'SKETCH_IN') {
        sketchIn.add(handle.keyframeIndex);
      }
    });
    return { anchors, sketchOut, sketchIn };
  }

  private isGraphPointMappedFromSelection(
    curveIndex: number,
    pointIndex: number,
    selected: SelectedHandleIndexSets,
  ): boolean {
    const startKeyframeIndex = curveIndex;
    const endKeyframeIndex = curveIndex + 1;

    if (pointIndex === 0) {
      return selected.anchors.has(startKeyframeIndex);
    }
    if (pointIndex === 1) {
      return (
        selected.sketchOut.has(startKeyframeIndex) ||
        selected.anchors.has(startKeyframeIndex)
      );
    }
    if (pointIndex === 2) {
      return (
        selected.sketchIn.has(endKeyframeIndex) ||
        selected.anchors.has(endKeyframeIndex)
      );
    }
    if (pointIndex === 3) {
      return selected.anchors.has(endKeyframeIndex);
    }
    return false;
  }

  // p5.js マウス押下
  private mousePressed(p: p5): void {
    const isLeftClick = isLeftMouseButton(p.mouseButton, p.LEFT);
    if (!isLeftClick) return;

    // ハンドルのドラッグ
    this.draggedHandle = this.hitTestHandle(p.mouseX, p.mouseY);
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    // ハンドルのドラッグ
    if (!this.draggedHandle || !this.activePath) return;

    const graphData = this.getGraphData();
    if (!graphData) return;

    const { curves, effectiveCurves, progress, effectiveTimes } = graphData;
    const target = this.pixelToNorm(p.mouseX, p.mouseY);
    const sync = !p.keyIsDown(p.ALT);
    this.applyHandleDrag(
      this.draggedHandle,
      target.x,
      target.y,
      progress,
      effectiveTimes,
      curves,
      effectiveCurves,
      sync,
    );
  }

  // p5.js マウスリリース
  private mouseReleased(): void {
    this.draggedHandle = null;
  }

  private pointerDown(event: PointerEvent): void {
    if (this.pointerSession.hasActivePointer()) return;
    const canvas = this.canvasElement;
    if (!canvas) return;

    const input = toEditorPointerInput(event, canvas);
    if (!isPrimaryEditingPointer(input)) return;

    const selection = this.hitTestHandle(input.x, input.y);
    if (!selection) return;

    if (!this.pointerSession.activate(input.pointerId)) return;
    this.draggedHandle = selection;
    this.pointerSession.preventDefaultIfCancelable(event);
  }

  private pointerMove(event: PointerEvent): void {
    if (!this.pointerSession.isActivePointer(event.pointerId)) return;
    const canvas = this.canvasElement;
    if (!canvas) return;
    if (!this.draggedHandle || !this.activePath) return;

    const input = toEditorPointerInput(event, canvas);
    this.pointerSession.preventDefaultIfCancelable(event);

    const graphData = this.getGraphData();
    if (!graphData) return;

    const { curves, effectiveCurves, progress, effectiveTimes } = graphData;
    const target = this.pixelToNorm(input.x, input.y);
    const sync = !input.altKey;
    this.applyHandleDrag(
      this.draggedHandle,
      target.x,
      target.y,
      progress,
      effectiveTimes,
      curves,
      effectiveCurves,
      sync,
    );
  }

  private pointerEnd(event: PointerEvent): void {
    if (!this.pointerSession.isActivePointer(event.pointerId)) return;
    this.pointerSession.preventDefaultIfCancelable(event);
    this.pointerSession.finishActivePointer({ releaseCapture: true });
    this.draggedHandle = null;
  }

  private pointerLostCapture(event: PointerEvent): void {
    if (!this.pointerSession.isActivePointer(event.pointerId)) return;
    this.pointerSession.clearActivePointer();
    this.draggedHandle = null;
  }

  // #region プライベート関数

  // ピクセル座標から正規化座標への変換
  private pixelToNorm(x: number, y: number): { x: number; y: number } {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    const margin = GraphEditor.GRAPH_MARGIN;

    const mouseX = x - margin;
    const mouseY = y - margin;
    const graphW = size - margin * 2;
    const graphH = size - margin * 2;

    const normX = mouseX / graphW;
    const normY = 1 - mouseY / graphH;

    return { x: normX, y: normY };
  }

  // 正規化座標からピクセル座標への変換
  private normToPixel(normX: number, normY: number): { x: number; y: number } {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    const margin = GraphEditor.GRAPH_MARGIN;

    const graphW = size - margin * 2;
    const graphH = size - margin * 2;

    return {
      x: normX * graphW + margin,
      y: (1 - normY) * graphH + margin,
    };
  }

  // グラフデータの生成
  private getGraphData(): {
    curves: p5.Vector[][];
    effectiveCurves: p5.Vector[][];
    progress: number[];
    effectiveTimes: number[];
  } | null {
    if (!this.activePath) return null;

    const {
      progress,
      effectiveTimes,
      original: curves,
      effective: effectiveCurves,
    } = resolveGraphCurves(this.activePath);

    return { curves, effectiveCurves, progress, effectiveTimes };
  }

  private computeFocusedCropRect(): Rect | null {
    const graphData = this.getGraphData();
    const selectionRange = this.selectionRangeProvider?.();
    const canvas = this.canvasElement;
    if (!graphData || !canvas) return null;

    const curves = graphData.effectiveCurves;
    if (curves.length === 0) return null;

    let points: p5.Vector[] = [];
    if (!selectionRange) {
      points = curves.flat();
    } else if (selectionRange.anchorKeyframeIndex !== undefined) {
      const anchorIndex = Math.max(
        0,
        Math.min(curves.length, selectionRange.anchorKeyframeIndex),
      );
      if (anchorIndex < curves.length) {
        const forward = curves[anchorIndex];
        if (forward) points.push(...forward);
      }
      if (anchorIndex > 0) {
        const backward = curves[anchorIndex - 1];
        if (backward) points.push(...backward);
      }
    } else {
      const maxCurveIndex = curves.length - 1;
      const start = Math.max(
        0,
        Math.min(maxCurveIndex, selectionRange.startCurveIndex - 1),
      );
      const end = Math.max(
        0,
        Math.min(maxCurveIndex, selectionRange.endCurveIndex + 1),
      );
      if (start <= end) {
        points = curves.slice(start, end + 1).flat();
      }
    }

    if (points.length === 0) {
      points = curves.flat();
    }
    if (points.length === 0) return null;
    const bounds = this.computePointBounds(points);
    if (!bounds) return null;
    return this.toCanvasCropRect(bounds, canvas);
  }

  private computePointBounds(points: p5.Vector[]): Bounds | null {
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

  private toCanvasCropRect(bounds: Bounds, canvas: HTMLCanvasElement): Rect {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const graphMarginX = GraphEditor.GRAPH_MARGIN * scaleX;
    const graphMarginY = GraphEditor.GRAPH_MARGIN * scaleY;
    const graphW = canvas.width - graphMarginX * 2;
    const graphH = canvas.height - graphMarginY * 2;
    if (graphW <= 0 || graphH <= 0) {
      return { x: 0, y: 0, width: canvas.width, height: canvas.height };
    }

    const left = graphMarginX + bounds.minX * graphW;
    const right = graphMarginX + bounds.maxX * graphW;
    const top = graphMarginY + (1 - bounds.maxY) * graphH;
    const bottom = graphMarginY + (1 - bounds.minY) * graphH;

    const boxW = Math.max(1, right - left);
    const boxH = Math.max(1, bottom - top);
    const padX = Math.min(32, boxW * 0.4);
    const padY = Math.min(32, boxH * 0.4);

    const rawX = Math.floor(left - padX);
    const rawY = Math.floor(top - padY);
    const rawW = Math.ceil(boxW + padX * 2);
    const rawH = Math.ceil(boxH + padY * 2);

    const x = Math.max(0, Math.min(canvas.width - 1, rawX));
    const y = Math.max(0, Math.min(canvas.height - 1, rawY));
    const width = Math.max(1, Math.min(canvas.width - x, rawW));
    const height = Math.max(1, Math.min(canvas.height - y, rawH));

    return { x, y, width, height };
  }

  // ハンドルのヒットテスト
  private hitTestHandle(x: number, y: number): GraphHandleSelection | null {
    const graphData = this.getGraphData();
    if (!graphData) return null;

    const { effectiveCurves: curves } = graphData;
    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const controlPoints = [
        { idx: 1 as const, type: 'GRAPH_OUT' as const },
        { idx: 2 as const, type: 'GRAPH_IN' as const },
      ];
      for (const control of controlPoints) {
        const point = curve[control.idx];
        const { x: px, y: py } = this.normToPixel(point.x, point.y);
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy <= HANDLE_RADIUS * HANDLE_RADIUS) {
          return { segmentIndex: i, type: control.type };
        }
      }
    }

    return null;
  }

  // ハンドルのドラッグ
  private applyHandleDrag(
    selection: GraphHandleSelection,
    targetX: number,
    targetY: number,
    progress: number[],
    effectiveTimes: number[],
    originalCurves: p5.Vector[][],
    effectiveCurves: p5.Vector[][],
    sync: boolean,
  ): void {
    if (!this.activePath) return;
    const keyframes = this.activePath.keyframes;
    const segmentIndex = selection.segmentIndex;
    const start = keyframes[segmentIndex];
    const end = keyframes[segmentIndex + 1];
    if (!start || !end) return;

    // オフセットを計算（Modifierの影響分）
    const originalCurve = originalCurves[segmentIndex];
    const effectiveCurve = effectiveCurves[segmentIndex];
    const pointIndex = selection.type === 'GRAPH_OUT' ? 1 : 2;

    // オフセット = 表示位置 - 元の位置
    // Target (Mouse) = NewOriginal + Offset
    // NewOriginal = Target - Offset
    const offset = effectiveCurve[pointIndex]
      .copy()
      .sub(originalCurve[pointIndex]);

    const t0 = effectiveTimes[segmentIndex] ?? start.time;
    const t1 = effectiveTimes[segmentIndex + 1] ?? end.time;
    const v0 = progress[segmentIndex] ?? 0;
    const v1 = progress[segmentIndex + 1] ?? v0;
    const dt = t1 - t0;
    const dv = v1 - v0;
    if (Math.abs(dt) < 1e-6 || Math.abs(dv) < 1e-6) return;

    // ターゲット位置からオフセットを引いて、元のカーブ上での位置を逆算
    // ただし targetX, targetY は正規化座標(全体)なので、そこからオフセット(全体座標系)を引く
    const correctedX = targetX - offset.x;
    const correctedY = targetY - offset.y;

    // 正規化座標(セグメント内)に変換
    const normX = (correctedX - t0) / dt;
    const normY = (correctedY - v0) / dv;
    const clampedX = clamp(normX, 0, 1);

    if (selection.type === 'GRAPH_OUT') {
      start.graphOut = start.position.copy().set(clampedX * dt, normY * dv);
    } else {
      end.graphIn = end.position
        .copy()
        .set((clampedX - 1) * dt, (normY - 1) * dv);
    }

    // 対向ハンドルの同期処理
    if (sync) {
      const draggedType = selection.type;
      const keyframe = draggedType === 'GRAPH_OUT' ? start : end;
      this.mirrorOppositeGraphHandle(keyframe, draggedType);
    }
  }

  // 対向ハンドルのミラーリング
  private mirrorOppositeGraphHandle(
    keyframe: Keyframe,
    type: 'GRAPH_OUT' | 'GRAPH_IN',
  ): void {
    // 不連続点（corner）はハンドルを独立で扱う
    if (keyframe.corner) return;

    const current = type === 'GRAPH_OUT' ? keyframe.graphOut : keyframe.graphIn;
    if (!current) return;
    if (current.magSq() <= 0) return;

    if (type === 'GRAPH_OUT') {
      const mag = keyframe.graphIn?.mag() ?? current.mag();
      keyframe.graphIn = current.copy().normalize().mult(-mag);
    } else {
      const mag = keyframe.graphOut?.mag() ?? current.mag();
      keyframe.graphOut = current.copy().normalize().mult(-mag);
    }
  }
}
