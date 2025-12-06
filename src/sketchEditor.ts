import p5 from 'p5';
import type { Colors, Config } from './config';
import { BEZIER_T_STEP, CURVE_POINT } from './constants';
import type { DOMManager } from './domManager';
import { drawBezierCurve, drawControls, drawPoints } from './draw';
import { fitCurve } from './fitting';
import { HandleManager } from './handleManager';
import { bezierCurve } from './mathUtils';
import { MotionManager } from './motionManager';
import { isInRect, isLeftMouseButton } from './p5Utils';
import { SuggestionManager } from './suggestion';
import type { Path, SketchMode } from './types';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  private paths: Path[] = [];
  private draftPath: Path | null = null;
  private activePath: Path | null = null;
  private sketchMode: SketchMode = 'draw';

  // マネージャー
  private dom: DOMManager;
  private handleManager: HandleManager;
  private motionManager: MotionManager | null = null;
  private suggestionManager: SuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // コールバック
  private onPathCreated: (path: Path) => void;
  private onPathSelected: (path: Path | null) => void;

  // コンストラクタ
  constructor(
    domManager: DOMManager,
    config: Config,
    colors: Colors,
    onPathCreated: (path: Path) => void,
    onPathSelected: (path: Path | null) => void,
  ) {
    this.dom = domManager;
    this.config = config;
    this.colors = colors;
    this.onPathCreated = onPathCreated;
    this.onPathSelected = onPathSelected;

    // ハンドルマネージャー
    this.handleManager = new HandleManager(() => this.paths);

    // 提案マネージャー
    this.suggestionManager = new SuggestionManager(this.config, {
      onSketchSuggestionSelect: (updated, targetPath) => {
        if (!updated) return;

        if (targetPath) {
          const index = this.paths.indexOf(targetPath);
          if (index >= 0) {
            this.paths[index].points = updated.points;
            this.paths[index].curves = updated.curves;
            this.paths[index].fitError = updated.fitError;

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

    // p5.jsの初期化
    this.init();
  }

  // #region メイン関数

  // モードを設定
  public setSketchMode(sketchMode: SketchMode): void {
    // 既に同じモードなら何もしない
    if (this.sketchMode === sketchMode) return;

    // モードを更新
    this.sketchMode = sketchMode;

    if (sketchMode === 'draw') {
      // 描画モード: 選択状態をクリア
      this.suggestionManager.stop();
      this.activePath = null;
      this.onPathSelected(null);
    } else {
      // 選択モード: 描画中のパスを破棄
      this.draftPath = null;
    }
  }

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

    this.motionManager = new MotionManager(p, this.colors.marker);
  }

  // p5.js リサイズ
  private windowResized(p: p5): void {
    const { width, height } = this.dom.getCanvasSize();
    p.resizeCanvas(width, height);
  }

  // p5.js 描画
  private draw(p: p5): void {
    p.background(this.colors.background);

    // 確定済みパスの描画
    for (const path of this.paths) {
      const isSelected = this.activePath === path;
      if (this.config.showSketch)
        drawPoints(
          p,
          path.points,
          this.config.lineWeight,
          this.config.pointSize - this.config.lineWeight,
          this.colors.curve,
          this.colors.background,
        );

      const curveColor = isSelected ? this.colors.handle : this.colors.curve;
      drawBezierCurve(p, path.curves, this.config.lineWeight, curveColor);
      drawControls(p, path.curves, this.config.pointSize, this.colors.handle);
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

    // 提案プレビューの描画
    this.suggestionManager.draw(p, this.colors);

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

    // ハンドルのドラッグ
    if (this.handleManager.start(p.mouseX, p.mouseY)) return;
    if (!isInRect(p.mouseX, p.mouseY, 0, 0, p.width, p.height)) return;

    // 選択モード
    if (this.sketchMode === 'select') {
      this.activePath = this.findPathAtPoint(p.mouseX, p.mouseY);
      this.suggestionManager.stop();

      if (this.activePath)
        this.suggestionManager.start('sketch', this.activePath);

      this.onPathSelected(this.activePath);
      return;
    }

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

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    // ハンドルのドラッグ
    const dragMode = p.keyIsDown(p.SHIFT) ? 0 : this.config.defaultDragMode;
    if (this.handleManager.drag(p.mouseX, p.mouseY, dragMode)) return;
    if (this.sketchMode !== 'draw') return;

    // 現在描画中のパスの点を追加
    if (
      this.draftPath &&
      isInRect(p.mouseX, p.mouseY, 0, 0, p.width, p.height)
    ) {
      this.draftPath.points.push(p.createVector(p.mouseX, p.mouseY));
      this.draftPath.times.push(p.millis());
    }
  }

  // p5.js マウスリリース
  private mouseReleased(p: p5): void {
    if (this.handleManager.stop()) return;
    if (this.sketchMode !== 'draw' || !this.draftPath) return;

    if (this.draftPath.points.length >= 2) {
      this.finalizeDraftPath(p);
    }

    // 描画中のパスをリセット
    this.draftPath = null;
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
    this.suggestionManager.stop();
    this.suggestionManager.start('sketch', this.activePath);

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
          curve[CURVE_POINT.START_ANCHOR],
          curve[CURVE_POINT.START_CONTROL],
          curve[CURVE_POINT.END_CONTROL],
          curve[CURVE_POINT.END_ANCHOR],
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
    this.suggestionManager.stop();
    this.motionManager?.stop();
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
    this.suggestionManager.start('sketch', targetPath);
    void this.suggestionManager.generate('sketch', targetPath, userPrompt);
  }
}
