import p5 from 'p5';
import { type Colors, type Config } from '../../config';
import { OBJECT_COLORS, OBJECT_SIZE } from '../../constants';
import { HandleManager } from '../../core/handleManager';
import { MotionManager } from '../../core/motionManager';
import {
  SuggestionManager,
  type SuggestionUIState,
} from '../../suggestion/suggestion';
import type { HandleSelection, Path, ToolKind } from '../../types';
import { drawSketchPath } from '../../utils/draw';
import { isLeftMouseButton } from '../../utils/p5Helpers';
import { PenTool } from './penTool';
import { SelectTool } from './selectTool';
import type { SketchDomRefs, ToolContext } from './types';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  private paths: Path[] = [];
  private activePath: Path | null = null;
  private isPreviewing: boolean = false;

  // ツール
  private currentTool: ToolKind = 'pen';
  private penTool: PenTool;
  private selectTool: SelectTool;

  // マネージャー
  private dom: SketchDomRefs;
  private handleManager: HandleManager;
  private motionManager: MotionManager | null = null;
  private suggestionManager: SuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // コールバック
  private onPathCreated: (path: Path) => void; // パスが作成されたときに呼び出される
  private onPathSelected: (path: Path | null) => void; // パスが選択されたときに呼び出される
  private onPathUpdated?: (path: Path) => void; // パスが更新されたときに呼び出される
  private onToolChanged?: (tool: ToolKind) => void; // ツールが変更されたときに呼び出される

  // コンストラクタ
  constructor(
    dom: SketchDomRefs,
    config: Config,
    colors: Colors,
    onPathCreated: (path: Path) => void,
    onPathSelected: (path: Path | null) => void,
    onPathUpdated?: (path: Path) => void,
    onToolChanged?: (tool: ToolKind) => void,
    onSuggestionUIChange?: (state: SuggestionUIState) => void,
  ) {
    this.dom = dom;
    this.config = config;
    this.colors = colors;
    this.onPathCreated = onPathCreated;
    this.onPathSelected = onPathSelected;
    this.onPathUpdated = onPathUpdated;
    this.onToolChanged = onToolChanged;

    // ツール初期化
    this.penTool = new PenTool();
    this.selectTool = new SelectTool();

    // ハンドルマネージャー
    this.handleManager = new HandleManager(() => this.paths);

    // 提案マネージャー
    this.suggestionManager = new SuggestionManager(this.config, {
      onSelect: (updated, targetPath) => {
        if (!updated) return;

        if (targetPath) {
          const index = this.paths.indexOf(targetPath);
          if (index >= 0) {
            Object.assign(this.paths[index], updated);
            this.onPathSelected(this.paths[index]);
            return;
          }
        }

        this.paths.push(updated);
        this.onPathSelected(updated);
        this.onPathCreated(updated);
      },
      onUIStateChange: onSuggestionUIChange,
    });

    // p5.jsの初期化
    this.init();
  }

  // p5.js インスタンス
  private p: p5 | null = null;

  // #region メイン関数

  // ツールを設定
  public setTool(tool: ToolKind): void {
    this.currentTool = tool;
    this.onToolChanged?.(tool);

    // ペンツールに切り替わったら提案ウィンドウを閉じる
    if (tool === 'pen') {
      this.suggestionManager.close();
    }

    // 選択ツールに切り替わったら、アクティブなパスがあれば提案を表示
    if (tool === 'select' && this.activePath) {
      this.suggestionManager.open(this.activePath);
    }
  }

  // リサイズ
  public resize(): void {
    if (!this.p) return;
    const { width, height } = this.dom.getCanvasSize();
    this.p.resizeCanvas(width, height);
  }

  // #region DOM操作

  public getCurrentTool(): ToolKind {
    return this.currentTool;
  }

  // ツールコンテキストを作成
  private getToolContext(): ToolContext {
    return {
      paths: this.paths,
      activePath: this.activePath,
      handleManager: this.handleManager,
      suggestionManager: this.suggestionManager,
      motionManager: this.motionManager,
      config: this.config,
      colors: this.colors,
      dom: this.dom,
      setActivePath: (path) => {
        this.activePath = path;
      },
      addPath: (path) => {
        this.paths.push(path);
      },
      onPathCreated: this.onPathCreated,
      onPathSelected: this.onPathSelected,
    };
  }

  // #region p5.js

  // p5.js 初期化
  private init(): void {
    const sketch = (p: p5) => {
      p.setup = () => this.setup(p);
      // p.windowResized is removed to avoid global window resize dependency
      p.draw = () => this.draw(p);
      p.mouseDragged = () => this.mouseDragged(p);
      p.mousePressed = () => this.mousePressed(p);
      p.mouseReleased = () => this.mouseReleased(p);
      p.keyPressed = () => this.keyPressed(p);
    };

    this.p = new p5(sketch);
  }

  // p5.js セットアップ
  private setup(p: p5): void {
    const { width, height } = this.dom.getCanvasSize();
    const canvas = p.createCanvas(width, height);
    canvas.parent(this.dom.canvasContainer);
    p.background(this.colors.background);
    p.textFont('Geist');

    this.motionManager = new MotionManager(p, OBJECT_SIZE);
  }

  // p5.js キー押下（ショートカット用）
  private keyPressed(p: p5): void {
    const isInputFocused =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;

    // 削除 (Alt+X or Option+X)
    if (p.keyIsDown(p.ALT) && (p.key === 'x' || p.keyCode === 88)) {
      if (isInputFocused && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.deleteActivePath();
      return;
    }

    // 入力欄にフォーカス中は他のショートカットを無視
    if (isInputFocused) return;

    // ツール切り替え
    if (p.key === 'v') {
      this.setTool('select');
    } else if (p.key === 'g' || p.key === 'p') {
      this.setTool('pen');
    }
  }

  // 選択中のパスを削除
  private deleteActivePath(): void {
    if (!this.activePath) return;

    const index = this.paths.indexOf(this.activePath);
    if (index >= 0) {
      this.paths.splice(index, 1);
    }

    this.activePath = null;
    this.suggestionManager.close();
    this.handleManager.clearSelection();
    this.onPathSelected(null);
  }

  // p5.js 描画
  private draw(p: p5): void {
    p.background(this.colors.background);

    const ctx = this.getToolContext();
    const isPlaying = this.motionManager?.getIsPlaying() ?? false;
    const shouldPreview =
      !isPlaying && this.isPreviewing && !!this.motionManager;

    // 1. 非選択のパスの軌跡を描画（再生中はスキップ）
    if (!isPlaying) {
      for (let pathIndex = 0; pathIndex < this.paths.length; pathIndex++) {
        const path = this.paths[pathIndex];
        if (this.activePath === path) continue;

        drawSketchPath(p, path, this.config, this.colors, false);
      }
    }

    // 2. すべてのオブジェクトを描画
    if (isPlaying) {
      // 再生中: MotionManagerが全オブジェクトを描画
      this.motionManager?.draw();
    } else if (shouldPreview) {
      // シーク時のプレビュー
      this.motionManager?.drawPreview();
    } else {
      // 非再生時: 個別にオブジェクトを描画
      for (let i = 0; i < this.paths.length; i++) {
        const path = this.paths[i];
        const isLatest = i === this.paths.length - 1;
        const color = OBJECT_COLORS[i % OBJECT_COLORS.length];

        if (isLatest) {
          // 最後のパスはMotionManagerで描画（静的表示）
          this.motionManager?.setColor(color);
          this.motionManager?.setPath(path);
          this.motionManager?.draw();
        } else {
          // それ以外のパスは開始位置に静的オブジェクトを描画
          if (path.keyframes.length > 0) {
            const pos = path.keyframes[0].position;
            p.push();
            p.fill(color);
            p.noStroke();
            p.circle(pos.x, pos.y, OBJECT_SIZE);
            p.pop();
          }
        }
      }
    }

    // 3. 選択中のパスの軌跡とハンドルを描画（再生中はスキップ）
    if (!isPlaying && this.activePath) {
      const pathIndex = this.paths.indexOf(this.activePath);
      drawSketchPath(
        p,
        this.activePath,
        this.config,
        this.colors,
        true,
        (curveIndex, pointIndex) =>
          this.handleManager.isSelected(
            this.mapCurvePointToHandle(pathIndex, curveIndex, pointIndex),
          ),
      );
    }

    // ツール固有の描画（再生中はスキップ）
    if (!isPlaying) {
      if (this.currentTool === 'pen') {
        this.penTool.draw(p, ctx);
      } else {
        this.selectTool.draw(p, ctx);
      }

      // 提案をプレビュー
      this.suggestionManager.preview(p, this.colors);
    }
  }

  // p5.js マウス押下
  private mousePressed(p: p5): void {
    const target = this.getClickTarget(p);
    if (this.shouldIgnoreClick(target)) return;

    if (!isLeftMouseButton(p.mouseButton, p.LEFT)) return;

    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mousePressed(p);
    } else {
      this.selectTool.mousePressed(p, ctx);
    }
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseDragged(p);
    } else {
      this.selectTool.mouseDragged(p, ctx);
    }
  }

  // p5.js マウスリリース
  private mouseReleased(p: p5): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseReleased(ctx);
    } else {
      this.selectTool.mouseReleased(p, ctx);
    }
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
      !!target?.closest('#sketchSuggestionContainer') ||
      !!target?.closest('#sidebarContainer')
    );
  }

  // モーションの再生/停止をトグル
  public toggleMotion(): boolean {
    if (!this.motionManager) return false;

    // 再生中なら停止
    if (this.motionManager.getIsPlaying()) {
      this.motionManager.stop();
      this.isPreviewing = this.motionManager.getTotalDuration() > 0;
      return false;
    }

    // 停止中なら全パスの再生開始
    if (this.paths.length > 0) {
      const colors = this.getPathColors();
      const elapsed = this.motionManager.getElapsedTime();
      this.motionManager.startAll(this.paths, colors, elapsed);
      this.isPreviewing = false;
      return true;
    }
    return false;
  }

  public resetPlayback(): void {
    if (!this.motionManager) return;

    if (this.motionManager.getIsPlaying()) {
      this.motionManager.stop();
    }

    if (!this.prepareAllPaths()) return;
    this.motionManager.seekTo(0);
    this.isPreviewing = false;
  }

  public goToLastFrame(): void {
    if (!this.motionManager) return;

    if (this.motionManager.getIsPlaying()) {
      this.motionManager.stop();
    }

    if (!this.prepareAllPaths()) return;
    this.motionManager.seekTo(this.motionManager.getTotalDuration());
    this.isPreviewing = true;
  }

  // 再生バー用の情報を取得
  public getPlaybackInfo(): {
    isPlaying: boolean;
    elapsedMs: number;
    totalMs: number;
  } {
    if (!this.motionManager) {
      return { isPlaying: false, elapsedMs: 0, totalMs: 0 };
    }

    return {
      isPlaying: this.motionManager.getIsPlaying(),
      elapsedMs: this.motionManager.getElapsedTime(),
      totalMs: this.motionManager.getTotalDuration(),
    };
  }

  public hasPaths(): boolean {
    return this.paths.length > 0;
  }

  // アクティブなパスを安全に更新
  public updateActivePath(updater: (path: Path) => void): void {
    if (!this.activePath) return;
    updater(this.activePath);
    this.refreshPlaybackTimeline();
    this.onPathUpdated?.(this.activePath);
  }

  // アクティブなパスを取得
  public getActivePath(): Path | null {
    return this.activePath ?? null;
  }

  public refreshPlaybackTimeline(): void {
    if (!this.motionManager) return;
    if (this.motionManager.getIsPlaying()) return;
    this.prepareAllPaths();
  }

  public seekPlayback(progress: number): void {
    if (!this.motionManager) return;
    if (!this.prepareAllPaths()) return;

    const totalDuration = this.motionManager.getTotalDuration();
    if (totalDuration <= 0) return;

    const clamped = Math.max(0, Math.min(1, progress));
    this.motionManager.seekTo(clamped * totalDuration);
    this.isPreviewing = true;
  }

  private getPathColors(): string[] {
    return this.paths.map((_, i) => OBJECT_COLORS[i % OBJECT_COLORS.length]);
  }

  private prepareAllPaths(): boolean {
    if (!this.motionManager) return false;

    if (this.paths.length === 0) {
      this.motionManager.prepareAll([], []);
      this.isPreviewing = false;
      return false;
    }

    this.motionManager.prepareAll(this.paths, this.getPathColors());
    return true;
  }

  // 最後のパスを取得
  public getLatestPath(): Path | undefined {
    return this.paths[this.paths.length - 1];
  }

  // 提案マネージャーを取得
  public getSuggestionManager(): SuggestionManager {
    return this.suggestionManager;
  }

  // 提案を生成
  public generateSuggestion(userPrompt: string): void {
    const targetPath = this.activePath ?? this.paths[this.paths.length - 1];
    if (!targetPath) return;

    const selectionRange = this.handleManager.getSelectionRange();
    this.suggestionManager.open(targetPath);
    void this.suggestionManager.submit(
      targetPath,
      userPrompt,
      selectionRange ?? undefined,
    );
  }

  // SuggestionのUI位置を更新
  public updateSuggestionUI(): void {
    this.suggestionManager.updateSelectionRange(
      this.handleManager.getSelectionRange() ?? undefined,
    );
  }

  // キーフレームをハンドルにマッピング
  private mapCurvePointToHandle(
    pathIndex: number,
    curveIndex: number,
    pointIndex: number,
  ): HandleSelection {
    if (pointIndex === 0) {
      return {
        pathIndex,
        keyframeIndex: curveIndex,
        handleType: 'ANCHOR',
      };
    }
    if (pointIndex === 1) {
      return {
        pathIndex,
        keyframeIndex: curveIndex,
        handleType: 'SKETCH_OUT',
      };
    }
    if (pointIndex === 2) {
      return {
        pathIndex,
        keyframeIndex: curveIndex + 1,
        handleType: 'SKETCH_IN',
      };
    }
    return {
      pathIndex,
      keyframeIndex: curveIndex + 1,
      handleType: 'ANCHOR',
    };
  }
}
