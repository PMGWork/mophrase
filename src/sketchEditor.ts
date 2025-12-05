import p5 from 'p5';
import type { Colors, Config } from './config';
import { CURVE_POINT } from './constants';
import type { DOMManager } from './domManager';
import { drawBezierCurve, drawControls, drawPoints } from './draw';
import { fitCurve } from './fitting';
import { HandleManager } from './handleManager';
import { bezierCurve } from './mathUtils';
import { MotionManager } from './motionManager';
import { isLeftMouseButton } from './p5Utils';
import { SuggestionManager } from './suggestion';
import type { Path, SketchMode } from './types';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  public paths: Path[] = [];
  private draftPath: Path | null = null;
  private selectedPath: Path | null = null;
  private mode: SketchMode = 'draw';

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

  // コンストラクタ
  constructor(
    domManager: DOMManager,
    config: Config,
    colors: Colors,
    onPathCreated: (path: Path) => void,
  ) {
    this.dom = domManager;
    this.config = config;
    this.colors = colors;
    this.onPathCreated = onPathCreated;

    // ハンドルマネージャー
    this.handleManager = new HandleManager(() => this.paths);

    // 提案マネージャー
    this.suggestionManager = new SuggestionManager(this.config, {
      onSketchSuggestionSelect: (selectedPaths, targetPath) => {
        const updated = selectedPaths[0];
        if (!updated) return;

        if (targetPath) {
          const index = this.paths.indexOf(targetPath);
          if (index >= 0) {
            this.paths[index].points = updated.points;
            this.paths[index].curves = updated.curves;
            this.paths[index].fitError = updated.fitError;
            return;
          }
        }

        this.paths.push(updated);
      },
    });

    this.init();
  }

  // モードを設定
  public setMode(mode: SketchMode): void {
    if (this.mode === mode) return;
    this.mode = mode;

    if (mode === 'draw') {
      // 描画モードでは選択状態をクリア
      this.selectedPath = null;
      this.suggestionManager.reset();
    } else {
      // 選択モードでは描画中のパスを破棄
      this.draftPath = null;
    }
  }

  // p5.jsの初期化
  private init(): void {
    const sketch = (p: p5) => {
      p.setup = () => {
        const { width, height } = this.dom.getCanvasSize();
        const canvas = p.createCanvas(width, height);
        canvas.parent(this.dom.canvasContainer);
        p.background(this.colors.background);
        p.textFont('Geist');

        this.motionManager = new MotionManager(p);
      };

      p.windowResized = () => {
        const { width, height } = this.dom.getCanvasSize();
        p.resizeCanvas(width, height);
      };

      p.draw = () => {
        p.background(this.colors.background);

        // 確定済みパスの描画
        for (const path of this.paths) {
          const isSelected = this.selectedPath === path;
          if (this.config.showSketch)
            drawPoints(
              p,
              path.points,
              this.config.lineWeight,
              this.config.pointSize - this.config.lineWeight,
              this.colors.curve,
              this.colors.background,
            );
          // 選択されたパスはハイライト色で描画
          const curveColor = isSelected
            ? this.colors.handle
            : this.colors.curve;
          drawBezierCurve(p, path.curves, this.config.lineWeight, curveColor);
          drawControls(
            p,
            path.curves,
            this.config.pointSize,
            this.colors.handle,
          );
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
        this.motionManager?.update();
      };

      p.mouseDragged = () => {
        // ハンドルのドラッグ
        const dragMode = p.keyIsDown(p.SHIFT) ? 0 : this.config.defaultDragMode;
        if (this.handleManager.drag(p.mouseX, p.mouseY, dragMode)) return;

        if (this.mode !== 'draw') return;

        // 現在描画中のパスの点を追加
        if (this.draftPath && this.inCanvas(p, p.mouseX, p.mouseY)) {
          this.draftPath.points.push(p.createVector(p.mouseX, p.mouseY));
          this.draftPath.times.push(p.millis());
        }
      };

      p.mousePressed = () => {
        // 入力欄やフォーム要素がクリックされた場合は処理をスキップ
        // p.mouseX/Yはキャンバス相対座標なので、ウィンドウ座標に変換
        const canvas = this.dom.canvasContainer.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        const windowX = (rect?.left ?? 0) + p.mouseX;
        const windowY = (rect?.top ?? 0) + p.mouseY;
        const target = document.elementFromPoint(windowX, windowY);
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLButtonElement ||
          target instanceof HTMLSelectElement ||
          target?.closest('form') ||
          target?.closest('#sketchSuggestionContainer')
        ) {
          return;
        }

        // 左クリックのみを処理
        const isLeftClick = isLeftMouseButton(p.mouseButton, p.LEFT);
        if (!isLeftClick) return;

        // ハンドルのドラッグ開始
        if (this.handleManager.begin(p.mouseX, p.mouseY)) return;
        if (!this.inCanvas(p, p.mouseX, p.mouseY)) return;

        if (this.mode === 'select') {
          this.selectPathAt(p.mouseX, p.mouseY);
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
        this.dom.userPromptInput.value = '';
      };

      p.mouseReleased = () => {
        if (this.handleManager.end()) return;
        if (this.mode !== 'draw' || !this.draftPath) return;

        if (this.draftPath.points.length >= 2) {
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
          this.selectedPath = this.draftPath;
          this.suggestionManager.reset();
          this.suggestionManager.showInput(this.paths[this.paths.length - 1]);

          // グラフエディタにも反映
          this.onPathCreated(this.paths[this.paths.length - 1]);
        }

        // 描画中のパスをリセット
        this.draftPath = null;
      };
    };

    new p5(sketch);
  }

  // マウス位置がキャンバス内か
  private inCanvas(p: p5, x: number, y: number): boolean {
    return x >= 0 && x <= p.width && y >= 0 && y <= p.height;
  }

  // クリック位置のパスを選択し、提案UIを表示
  private selectPathAt(x: number, y: number): void {
    this.selectedPath = this.findPathAtPoint(x, y);
    this.suggestionManager.reset();
    if (this.selectedPath) {
      this.suggestionManager.showInput(this.selectedPath);
    }
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
      for (let t = 0; t <= 1; t += 0.02) {
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
    this.selectedPath = null;
    this.suggestionManager.reset();
  }

  // モーションを再生
  public playMotion(): void {
    if (this.draftPath) return;
    const target = this.paths[this.paths.length - 1];
    if (target && this.motionManager) this.motionManager.play(target);
  }

  // 最後のパスを取得
  public getLatestPath(): Path | undefined {
    return this.paths[this.paths.length - 1];
  }

  // 提案を生成
  public generateSuggestion(userPrompt: string): void {
    const targetPath = this.selectedPath ?? this.paths[this.paths.length - 1];
    if (!targetPath) return;
    this.suggestionManager.showInput(targetPath);
    void this.suggestionManager.generate(targetPath, userPrompt);
  }
}
