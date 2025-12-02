import p5 from 'p5';
import type { Path } from './types';
import type { Config, Colors } from './config';
import { fitCurve } from './fitting';
import { drawPoints, drawBezierCurve, drawControls } from './draw';
import { SuggestionManager } from './suggestion';
import { HandleManager } from './handleManager';

import { DOMManager } from './domManager';
import { MotionManager } from './motionManager';

export class SketchEditor {
  private domManager: DOMManager;
  private onPathCreated: (path: Path) => void;

  // データ構造
  public paths: Path[] = [];
  private activePath: Path | null = null;

  // マネージャー
  private handleManager: HandleManager;
  private motionManager: MotionManager | null = null;
  private suggestionManager: SuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // コンストラクタ
  constructor(domManager: DOMManager, config: Config, colors: Colors, onPathCreated: (path: Path) => void) {
    this.domManager = domManager;
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
          const index = this.paths.findIndex(path => path === targetPath);
          if (index >= 0) {
            this.paths[index].points = updated.points;
            this.paths[index].curves = updated.curves;
            this.paths[index].fitError = updated.fitError;
            return;
          }
        }

        this.paths.push(updated);
      }
    });

    this.init();
  }

  // p5.jsの初期化
  private init(): void {
    const sketch = (p: p5) => {
      p.setup = () => {
        const { width, height } = this.domManager.getCanvasSize();
        const canvas = p.createCanvas(width, height);
        canvas.parent(this.domManager.canvasContainer);
        p.background(this.colors.background);
        p.textFont('Geist');

        this.motionManager = new MotionManager(p);
      };

      p.windowResized = () => {
        const { width, height } = this.domManager.getCanvasSize();
        p.resizeCanvas(width, height);
      };

      p.draw = () => {
        p.background(this.colors.background);

        // 確定済みパスの描画
        for (const path of this.paths) {
          if (this.config.showSketch) drawPoints(
            p,
            path.points,
            this.config.lineWeight,
            this.config.pointSize - this.config.lineWeight,
            this.colors.curve,
            this.colors.background
          );
          drawBezierCurve(p, path.curves, this.config.lineWeight, this.colors.curve);
          drawControls(p, path.curves, this.config.pointSize, this.colors.handle);
        }

        // 現在描画中のパスの描画
        if (this.activePath) {
          drawPoints(
            p,
            this.activePath.points,
            this.config.lineWeight,
            this.config.pointSize - this.config.lineWeight,
            this.colors.curve,
            this.colors.background
          );
        }

        // 提案プレビューの描画
        this.suggestionManager.draw(p, this.colors);

        // モーションの更新
        this.motionManager?.update();
      };

      p.mouseDragged = () => {
        // ハンドルのドラッグ
        const mode = p.keyIsDown(p.SHIFT) ? 0 : this.config.defaultDragMode;
        if (this.handleManager.drag(p.mouseX, p.mouseY, mode)) return;

        // 現在描画中のパスの点を追加
        if (this.activePath && this.inCanvas(p, p.mouseX, p.mouseY)) {
          this.activePath.points.push(p.createVector(p.mouseX, p.mouseY));
          this.activePath.times.push(p.millis());
        }
      };

      p.mousePressed = () => {
        // 左クリックのみを処理
        const isLeftClick = (p.mouseButton as any) === p.LEFT || (p.mouseButton as any)?.left;
        if (!isLeftClick) return;

        // ハンドルのドラッグ開始
        if (this.handleManager.begin(p.mouseX, p.mouseY)) return;
        if (!this.inCanvas(p, p.mouseX, p.mouseY)) return;

        // 新しいパスを開始
        this.activePath = {
          points: [p.createVector(p.mouseX, p.mouseY)],
          times: [p.millis()],
          curves: [],
          timeCurve: [],
          fitError: {
            current: {
              maxError: Number.MAX_VALUE,
              index: -1
            },
          },
        };

        // ユーザー指示入力欄をクリア
        this.domManager.userPromptInput.value = '';
      };

      p.mouseReleased = () => {
        if (this.handleManager.end()) return;
        if (!this.activePath) return;

        if (this.activePath.points.length >= 2) {
          // フィッティングを実行
          fitCurve(
            this.activePath.points,
            this.activePath.curves,
            this.config.sketchFitTolerance,
            this.config.sketchFitTolerance * this.config.coarseErrorWeight,
            this.activePath.fitError
          );

          // モーションのタイミングをフィッティング
          const normalizedTol = this.config.graphFitTolerance / 100;
          this.motionManager?.fitTiming(this.activePath, p, normalizedTol);

          // 確定済みパスに追加
          this.paths.push(this.activePath);
          this.suggestionManager.reset();
          void this.suggestionManager.generate(this.paths[this.paths.length - 1]);

          // グラフエディタにも反映
          this.onPathCreated(this.paths[this.paths.length - 1]);
        }

        // 描画中のパスをリセット
        this.activePath = null;
      };
    };

    new p5(sketch);
  }

  // マウス位置がキャンバス内か
  private inCanvas(p: p5, x: number, y: number): boolean {
    return x >= 0 && x <= p.width && y >= 0 && y <= p.height;
  }

  // すべてのパスをクリア
  public clearAll(): void {
    this.paths = [];
    this.activePath = null;
    this.suggestionManager.reset();
  }

  // モーションを再生
  public playMotion(): void {
    if (this.activePath) return;
    const target = this.paths[this.paths.length - 1];
    if (target && this.motionManager) this.motionManager.play(target);
  }

  // 最後のパスを取得
  public getLatestPath(): Path | undefined {
    return this.paths[this.paths.length - 1];
  }

  // 提案を生成
  public generateSuggestion(userPrompt: string): void {
    const latestPath = this.paths[this.paths.length - 1];
    if (!latestPath) return;
    this.suggestionManager.reset();
    void this.suggestionManager.generate(latestPath, userPrompt);
  }
}
