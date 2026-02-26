/**
 * グラフエディタ。
 * 時間カーブ（イージング）の表示とハンドル操作を p5.js で提供する。
 */

import p5 from 'p5';
import type { Colors, Config } from '../../config';
import { HANDLE_RADIUS } from '../../constants';
import type { Keyframe, Path } from '../../types';
import { clamp } from '../../utils/number';
import { drawBezierCurve, drawControls } from '../../utils/rendering';
import {
  buildGraphCurves,
  buildSketchCurves,
  computeKeyframeProgress,
} from '../../utils/keyframes';
import {
  applySketchModifiers,
  applyGraphModifiers,
} from '../../utils/modifier';
import {
  isLeftMouseButton,
  isPrimaryEditingPointer,
  toEditorPointerInput,
} from '../../utils/input';
import type { GraphEditorDomRefs, GraphHandleSelection } from './types';

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
  private activePointerId: number | null = null;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown(event);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointerMove(event);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pointerEnd(event);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.pointerEnd(event);
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    this.pointerLostCapture(event);
  };

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

  // リサイズ
  public resize(): void {
    if (!this.p) return;
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    this.p.resizeCanvas(size, size);
  }

  public destroy(): void {
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }
    this.removePointerListeners();
    this.p?.remove();
    this.p = null;
    this.canvasElement = null;
    this.activePointerId = null;
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
      this.addPointerListeners();
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

    const { curves, effectiveCurves, progress } = graphData;
    const target = this.pixelToNorm(p.mouseX, p.mouseY);
    const sync = !p.keyIsDown(p.ALT);
    this.applyHandleDrag(
      this.draggedHandle,
      target.x,
      target.y,
      progress,
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
    if (this.activePointerId !== null) return;
    const canvas = this.canvasElement;
    if (!canvas) return;

    const input = toEditorPointerInput(event, canvas);
    if (!isPrimaryEditingPointer(input)) return;

    const selection = this.hitTestHandle(input.x, input.y);
    if (!selection) return;

    this.activePointerId = input.pointerId;
    this.draggedHandle = selection;
    this.capturePointer(input.pointerId);
    if (event.cancelable) event.preventDefault();
  }

  private pointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    const canvas = this.canvasElement;
    if (!canvas) return;
    if (!this.draggedHandle || !this.activePath) return;

    const input = toEditorPointerInput(event, canvas);
    if (event.cancelable) event.preventDefault();

    const graphData = this.getGraphData();
    if (!graphData) return;

    const { curves, effectiveCurves, progress } = graphData;
    const target = this.pixelToNorm(input.x, input.y);
    const sync = !input.altKey;
    this.applyHandleDrag(
      this.draggedHandle,
      target.x,
      target.y,
      progress,
      curves,
      effectiveCurves,
      sync,
    );
  }

  private pointerEnd(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    const pointerId = this.activePointerId;
    this.activePointerId = null;
    this.draggedHandle = null;
    if (pointerId !== null) {
      this.releasePointerCapture(pointerId);
    }
  }

  private pointerLostCapture(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.draggedHandle = null;
  }

  private addPointerListeners(): void {
    if (!this.pointerEventsEnabled || !this.canvasElement) return;
    this.removePointerListeners();
    const options: AddEventListenerOptions = { passive: false };
    this.canvasElement.addEventListener(
      'pointerdown',
      this.handlePointerDown,
      options,
    );
    this.canvasElement.addEventListener(
      'pointermove',
      this.handlePointerMove,
      options,
    );
    this.canvasElement.addEventListener(
      'pointerup',
      this.handlePointerUp,
      options,
    );
    this.canvasElement.addEventListener(
      'pointercancel',
      this.handlePointerCancel,
      options,
    );
    this.canvasElement.addEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
  }

  private removePointerListeners(): void {
    if (!this.canvasElement) return;
    this.canvasElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvasElement.removeEventListener('pointermove', this.handlePointerMove);
    this.canvasElement.removeEventListener('pointerup', this.handlePointerUp);
    this.canvasElement.removeEventListener(
      'pointercancel',
      this.handlePointerCancel,
    );
    this.canvasElement.removeEventListener(
      'lostpointercapture',
      this.handleLostPointerCapture,
    );
  }

  private capturePointer(pointerId: number): void {
    if (!this.canvasElement) return;
    try {
      this.canvasElement.setPointerCapture(pointerId);
    } catch {
      // ignore
    }
  }

  private releasePointerCapture(pointerId: number): void {
    if (!this.canvasElement) return;
    try {
      if (this.canvasElement.hasPointerCapture(pointerId)) {
        this.canvasElement.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
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
  } | null {
    if (!this.activePath) return null;

    // 空間カーブを構築（Modifier 適用）
    const originalSketchCurves = buildSketchCurves(this.activePath.keyframes);
    const sketchCurves = applySketchModifiers(
      originalSketchCurves,
      this.activePath.keyframes,
      this.activePath.sketchModifiers,
    );

    // 進行度を計算
    const progress = computeKeyframeProgress(
      this.activePath.keyframes,
      sketchCurves,
    );

    // 時間カーブを構築
    const curves = buildGraphCurves(this.activePath.keyframes, progress);

    // Modifier 適用後の時間カーブ
    const effectiveCurves = applyGraphModifiers(
      curves,
      this.activePath.keyframes,
      this.activePath.graphModifiers,
    );

    return { curves, effectiveCurves, progress };
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

    const t0 = start.time;
    const t1 = end.time;
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
    const current = type === 'GRAPH_OUT' ? keyframe.graphOut : keyframe.graphIn;
    if (!current) return;

    if (type === 'GRAPH_OUT') {
      if (keyframe.graphIn) {
        const mag = keyframe.graphIn.mag();
        if (current.magSq() > 0) {
          keyframe.graphIn = current.copy().normalize().mult(-mag);
        }
      }
    } else {
      if (keyframe.graphOut) {
        const mag = keyframe.graphOut.mag();
        if (current.magSq() > 0) {
          keyframe.graphOut = current.copy().normalize().mult(-mag);
        }
      }
    }
  }
}
