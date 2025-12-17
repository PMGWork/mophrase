import p5 from 'p5';
import type { Colors, Config } from '../config';
import { BEZIER_T_STEP, CURVE_POINT } from '../constants';
import { fitCurve } from '../core/fitting';
import { HandleManager } from '../core/handleManager';
import { MotionManager } from '../core/motionManager';
import type { DomRefs } from '../dom';
import { SketchSuggestionManager } from '../suggestion/sketchSuggestion';
import type { EditorTool, MarqueeRect, Path } from '../types';
import { drawBezierCurve, drawControls, drawPoints } from '../utils/draw';
import { bezierCurve } from '../utils/math';
import { isInRect, isLeftMouseButton } from '../utils/p5Helpers';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  private paths: Path[] = [];
  private draftPath: Path | null = null;
  private activePath: Path | null = null;

  // ツール状態
  private currentTool: EditorTool = 'pen';

  // 範囲選択
  private marqueeRect: MarqueeRect | null = null;

  // マネージャー
  private dom: DomRefs;
  private handleManager: HandleManager;
  private motionManager: MotionManager | null = null;
  private suggestionManager: SketchSuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // コールバック
  private onPathCreated: (path: Path) => void;
  private onPathSelected: (path: Path | null) => void;

  // コンストラクタ
  constructor(
    dom: DomRefs,
    config: Config,
    colors: Colors,
    onPathCreated: (path: Path) => void,
    onPathSelected: (path: Path | null) => void,
  ) {
    this.dom = dom;
    this.config = config;
    this.colors = colors;
    this.onPathCreated = onPathCreated;
    this.onPathSelected = onPathSelected;

    // ハンドルマネージャー
    this.handleManager = new HandleManager(() => this.paths);

    // 提案マネージャー
    this.suggestionManager = new SketchSuggestionManager(this.config, {
      onSelect: (updated, targetPath) => {
        if (!updated) return;

        if (targetPath) {
          const index = this.paths.indexOf(targetPath);
          if (index >= 0) {
            Object.assign(this.paths[index], updated);

            // パスが更新されたので選択状態として通知
            this.onPathSelected(this.paths[index]);
            return;
          }
        }

        this.paths.push(updated);
        // 新しいパスが追加されたので通知
        this.onPathSelected(updated);
        this.onPathCreated(updated);
      },
    });

    // ツールバーのクリックハンドラー
    this.dom.selectToolButton.addEventListener('click', () => {
      this.setTool('select');
    });
    this.dom.penToolButton.addEventListener('click', () => {
      this.setTool('pen');
    });

    // p5.jsの初期化
    this.init();
  }

  // ツールを設定
  public setTool(tool: EditorTool): void {
    this.currentTool = tool;
    this.updateToolbarUI();

    // ペンツールに切り替わったら提案ウィンドウを閉じる
    if (tool === 'pen') {
      this.suggestionManager.close();
    }

    // 選択ツールに切り替わったら、アクティブなパスがあれば提案を表示
    if (tool === 'select' && this.activePath) {
      this.suggestionManager.open(this.activePath);
    }
  }

  // ツールバーのUI更新
  private updateToolbarUI(): void {
    const activeClass = 'bg-gray-50 text-gray-950 hover:bg-gray-200';
    const inactiveClass =
      'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-50';

    // クラスのリセット用
    const allActiveClasses = activeClass.split(' ');
    const allInactiveClasses = inactiveClass.split(' ');

    if (this.currentTool === 'select') {
      this.dom.selectToolButton.classList.remove(...allInactiveClasses);
      this.dom.selectToolButton.classList.add(...allActiveClasses);
      this.dom.penToolButton.classList.remove(...allActiveClasses);
      this.dom.penToolButton.classList.add(...allInactiveClasses);
    } else {
      this.dom.penToolButton.classList.remove(...allInactiveClasses);
      this.dom.penToolButton.classList.add(...allActiveClasses);
      this.dom.selectToolButton.classList.remove(...allActiveClasses);
      this.dom.selectToolButton.classList.add(...allInactiveClasses);
    }
  }

  // #region メイン関数

  // #region p5.js

  // p5.js 初期化
  private init(): void {
    const sketch = (p: p5) => {
      p.setup = () => this.setup(p);
      p.windowResized = () => this.windowResized(p);
      p.draw = () => this.draw(p);
      p.mouseDragged = () => this.mouseDragged(p);
      p.mousePressed = () => this.mousePressed(p);
      p.mouseReleased = () => this.mouseReleased(p);
      p.keyTyped = () => this.keyTyped(p);
    };

    new p5(sketch);
  }

  // p5.js セットアップ
  private setup(p: p5): void {
    const { width, height } = this.dom.getCanvasSize();
    const canvas = p.createCanvas(width, height);
    canvas.parent(this.dom.canvasContainer);
    p.background(this.colors.background);
    p.textFont('Geist');

    this.motionManager = new MotionManager(
      p,
      this.colors.object,
      this.config.objectSize,
    );
  }

  // p5.js リサイズ
  private windowResized(p: p5): void {
    const { width, height } = this.dom.getCanvasSize();
    p.resizeCanvas(width, height);
  }

  // p5.js キー入力
  private keyTyped(p: p5): void {
    // ツール切り替えショートカット
    if (p.key === 'v') {
      this.setTool('select');
    } else if (p.key === 'g' || p.key === 'p') {
      this.setTool('pen');
    }
  }

  // p5.js 描画
  private draw(p: p5): void {
    p.background(this.colors.background);

    // 確定済みパスの描画
    for (let pathIndex = 0; pathIndex < this.paths.length; pathIndex++) {
      this.drawPath(p, pathIndex);
    }

    // マーキー矩形の描画
    if (this.marqueeRect) {
      p.push();
      p.fill(this.colors.marquee + '26'); // 15% alpha
      p.stroke(this.colors.marquee + '99'); // 60% alpha
      p.strokeWeight(1);
      const { startX, startY, endX, endY } = this.marqueeRect;
      p.rect(
        Math.min(startX, endX),
        Math.min(startY, endY),
        Math.abs(endX - startX),
        Math.abs(endY - startY),
      );
      p.pop();
    }

    // 現在描画中のパスの描画
    if (this.draftPath) {
      drawPoints(
        p,
        this.draftPath.points,
        this.config.lineWeight,
        this.config.pointSize - this.config.lineWeight,
        this.colors.curve,
        this.colors.background,
      );
    }

    // 提案をプレビュー
    this.suggestionManager.preview(p, this.colors);

    // モーションの更新
    this.motionManager?.draw();
  }

  // p5.js マウス押下
  private mousePressed(p: p5): void {
    const target = this.getClickTarget(p);
    if (this.shouldIgnoreClick(target)) return;

    // 左クリックのみを処理
    const isLeftClick = isLeftMouseButton(p.mouseButton, p.LEFT);
    if (!isLeftClick) return;

    // ツールごとの処理
    if (this.currentTool === 'pen') {
      this.mousePressedPen(p);
    } else {
      this.mousePressedSelect(p);
    }
  }

  // ペンツールのマウス押下処理
  private mousePressedPen(p: p5): void {
    // 新しいパスを開始
    this.draftPath = {
      points: [p.createVector(p.mouseX, p.mouseY)],
      times: [p.millis()],
      curves: [],
      timeCurve: [],
      fitError: {
        current: {
          maxError: Number.MAX_VALUE,
          index: -1,
        },
      },
    };

    // ユーザー指示入力欄をクリア
    this.dom.sketchPromptInput.value = '';
  }

  // 選択ツールのマウス押下処理
  private mousePressedSelect(p: p5): void {
    // 1. ハンドルのドラッグ試行 (アクティブなパスがある場合のみ)
    if (this.activePath) {
      const shift = p.keyIsDown(p.SHIFT);
      this.handleManager.startDrag(p.mouseX, p.mouseY, shift);
      if (this.handleManager.isDragging()) return;
    }

    // 2. パスの選択判定
    const clickedPath = this.findPathAtPoint(p.mouseX, p.mouseY);
    if (clickedPath) {
      // パスをクリックした場合
      if (this.activePath !== clickedPath) {
        // 別のパスを選択
        this.activePath = clickedPath;
        this.onPathSelected(this.activePath);

        // 範囲選択をクリア（パス全体がLLMに送られる）
        this.handleManager.clearSelection();

        // 提案UIを閉じて、選択したパスで提案UIを開く
        this.suggestionManager.close();
        this.suggestionManager.open(this.activePath);
      }
      return;
    }

    // 3. 背景をクリックした場合 -> 選択解除 & 範囲選択開始
    // アクティブなパスがある場合は、そのパス内の頂点選択のための範囲選択を開始
    // アクティブなパスがない場合は何もしない（今回はマルチセレクトなし）

    if (this.activePath) {
      // 既存の選択解除はしない（頂点選択の追加/置き換えのため）
      // ただし、頂点自体のドラッグではなかったため、空の場所をクリックしたとみなして
      // 範囲選択を開始する
      this.handleManager.clearSelection(); // 一旦クリアしてから範囲選択
      this.marqueeRect = {
        startX: p.mouseX,
        startY: p.mouseY,
        endX: p.mouseX,
        endY: p.mouseY,
      };
    } else {
      // 何も選択されていない状態で背景クリック -> 全解除（既に解除済みだが念のため）
      this.handleManager.clearSelection();
      this.onPathSelected(null);
      this.suggestionManager.close();
    }
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    if (this.currentTool === 'pen') {
      this.mouseDraggedPen(p);
    } else {
      this.mouseDraggedSelect(p);
    }
  }

  // ペンツールのドラッグ処理
  private mouseDraggedPen(p: p5): void {
    // 現在描画中のパスの点を追加
    if (
      this.draftPath &&
      isInRect(p.mouseX, p.mouseY, 0, 0, p.width, p.height)
    ) {
      this.draftPath.points.push(p.createVector(p.mouseX, p.mouseY));
      this.draftPath.times.push(p.millis());
    }
  }

  // 選択ツールのドラッグ処理
  private mouseDraggedSelect(p: p5): void {
    // ハンドルのドラッグ
    const dragMode = p.keyIsDown(p.ALT) ? 1 : 0;
    this.handleManager.updateDrag(p.mouseX, p.mouseY, dragMode);
    if (this.handleManager.isDragging()) return;

    // 範囲選択の更新
    if (this.marqueeRect) {
      this.marqueeRect.endX = p.mouseX;
      this.marqueeRect.endY = p.mouseY;
      return;
    }
  }

  // p5.js マウスリリース
  private mouseReleased(p: p5): void {
    if (this.currentTool === 'pen') {
      this.mouseReleasedPen(p);
    } else {
      this.mouseReleasedSelect();
    }
  }

  // ペンツールのリリース処理
  private mouseReleasedPen(p: p5): void {
    if (!this.draftPath) return;
    if (this.draftPath.points.length >= 2) this.finalizeDraftPath(p);

    // 描画中のパスをリセット
    this.draftPath = null;
  }

  // 選択ツールのリリース処理
  private mouseReleasedSelect(): void {
    const wasDragging = this.handleManager.isDragging();
    this.handleManager.endDrag();
    if (wasDragging) return;

    // 範囲選択の完了
    if (this.marqueeRect) {
      // アクティブなパスがあれば、そのパスのみを対象にする
      const targetPathIndex = this.activePath
        ? this.paths.indexOf(this.activePath)
        : undefined;

      // 矩形内のハンドルを選択（パスインデックスでフィルタリング）
      const selected = this.handleManager.selectAnchorsInRect(
        this.marqueeRect,
        targetPathIndex !== -1 ? targetPathIndex : undefined,
      );
      this.marqueeRect = null;

      // 選択されたハンドルがあれば、ポップアップを更新
      if (selected.length > 0 && this.activePath) {
        const selectionRange = this.handleManager.getSelectionRange();
        this.suggestionManager.open(this.activePath);
        this.suggestionManager.updateSelectionRange(
          selectionRange ?? undefined,
        );
      } else {
        // 何も選択されなかった場合は選択解除
        this.activePath = null;
        this.onPathSelected(null);
        this.suggestionManager.close();
      }
    }
  }

  // 描画中のパスを確定
  private finalizeDraftPath(p: p5): void {
    if (!this.draftPath) return;

    // フィッティングを実行
    fitCurve(
      this.draftPath.points,
      this.draftPath.curves,
      this.config.sketchFitTolerance,
      this.config.sketchFitTolerance * this.config.coarseErrorWeight,
      this.draftPath.fitError,
    );

    // モーションのタイミングをフィッティング
    const normalizedTol = this.config.graphFitTolerance / 100;
    this.motionManager?.fitTiming(this.draftPath, p, normalizedTol);

    // 確定済みパスに追加
    this.paths.push(this.draftPath);
    this.activePath = this.draftPath;

    // グラフエディタにも反映
    this.onPathCreated(this.activePath);
    this.onPathSelected(this.activePath);
  }

  // #region プライベート関数

  // クリック対象の要素を取得
  private getClickTarget(p: p5): Element | null {
    const canvas = this.dom.canvasContainer.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect();
    const windowX = (rect?.left ?? 0) + p.mouseX;
    const windowY = (rect?.top ?? 0) + p.mouseY;
    return document.elementFromPoint(windowX, windowY);
  }

  // UI要素クリック判定
  private shouldIgnoreClick(target: Element | null): boolean {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLSelectElement ||
      !!target?.closest('form') ||
      !!target?.closest('#sketchSuggestionContainer')
    );
  }

  // 指定座標に近いパスを検索
  private findPathAtPoint(x: number, y: number): Path | null {
    const tolerance = Math.max(this.config.pointSize * 2, 10);
    const toleranceSq = tolerance * tolerance;

    for (let i = this.paths.length - 1; i >= 0; i--) {
      const path = this.paths[i];
      if (this.isNearPath(path, x, y, toleranceSq)) {
        return path;
      }
    }

    return null;
  }

  // パスと座標の当たり判定
  private isNearPath(
    path: Path,
    x: number,
    y: number,
    toleranceSq: number,
  ): boolean {
    if (path.curves.length === 0) return false;

    for (const curve of path.curves) {
      for (let t = 0; t <= 1; t += BEZIER_T_STEP) {
        const pt = bezierCurve(
          curve[CURVE_POINT.START_ANCHOR_POINT],
          curve[CURVE_POINT.START_CONTROL_POINT],
          curve[CURVE_POINT.END_CONTROL_POINT],
          curve[CURVE_POINT.END_ANCHOR_POINT],
          t,
        );
        const dx = pt.x - x;
        const dy = pt.y - y;
        if (dx * dx + dy * dy <= toleranceSq) {
          return true;
        }
      }
    }

    return false;
  }

  // すべてのパスをクリア
  public clearAll(): void {
    this.paths = [];
    this.draftPath = null;
    this.activePath = null;
    this.suggestionManager.close();
    this.motionManager?.stop();
    this.handleManager.clearSelection();
    this.onPathSelected(null);
  }

  // モーションを再生
  public playMotion(): void {
    if (this.draftPath) return;
    const target = this.paths[this.paths.length - 1];
    if (target && this.motionManager) this.motionManager.start(target);
  }

  // 最後のパスを取得
  public getLatestPath(): Path | undefined {
    return this.paths[this.paths.length - 1];
  }

  // 提案を生成
  public generateSuggestion(userPrompt: string): void {
    const targetPath = this.activePath ?? this.paths[this.paths.length - 1];
    if (!targetPath) return;

    // 選択範囲を取得
    const selectionRange = this.handleManager.getSelectionRange();

    this.suggestionManager.open(targetPath);
    void this.suggestionManager.submit(
      targetPath,
      userPrompt,
      selectionRange ?? undefined,
    );
  }

  // 1つのパスを描画
  private drawPath(p: p5, pathIndex: number): void {
    const path = this.paths[pathIndex];
    if (!path) return;

    const isSelectedPath = this.activePath === path;

    // スケッチ点列の描画
    if (this.config.showSketch) {
      drawPoints(
        p,
        path.points,
        this.config.lineWeight,
        this.config.pointSize - this.config.lineWeight,
        this.colors.curve,
        this.colors.background,
      );
    }

    // ベジェ曲線の描画（曲線はハイライトしない）
    const curveColor = isSelectedPath ? this.colors.handle : this.colors.curve;
    drawBezierCurve(p, path.curves, this.config.lineWeight, curveColor);

    // 制御点の描画（選択されたパスのみ）
    if (isSelectedPath) {
      drawControls(
        p,
        path.curves,
        this.config.pointSize,
        this.colors.handle,
        undefined,
        (curveIndex, pointIndex) => {
          const isSelected = this.handleManager.isSelected({
            pathIndex,
            curveIndex,
            pointIndex,
          });
          return isSelected ? this.colors.selection : this.colors.handle;
        },
      );
    }
  }
}
