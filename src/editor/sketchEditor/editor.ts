import p5 from 'p5';
import type { Colors, Config } from '../../config';
import { HandleManager } from '../../core/handleManager';
import { MotionManager } from '../../core/motionManager';
import type { DomRefs } from '../../dom';
import { SketchSuggestionManager } from '../../suggestion/sketchSuggestion';
import type { EditorTool, Path } from '../../types';
import { drawSketchPath } from '../../utils/draw';
import { isLeftMouseButton } from '../../utils/p5Helpers';
import { PenTool } from './penTool';
import { SelectTool } from './selectTool';
import type { ToolContext } from './types';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  private paths: Path[] = [];
  private activePath: Path | null = null;

  // ツール
  private currentTool: EditorTool = 'pen';
  private penTool: PenTool;
  private selectTool: SelectTool;

  // マネージャー
  private dom: DomRefs;
  private handleManager: HandleManager;
  private motionManager: MotionManager | null = null;
  private suggestionManager: SketchSuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // コールバック
  private onPathCreated: (path: Path) => void; // パスが作成されたときに呼び出される
  private onPathSelected: (path: Path | null) => void; // パスが選択されたときに呼び出される

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

    // ツール初期化
    this.penTool = new PenTool();
    this.selectTool = new SelectTool();

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
            this.onPathSelected(this.paths[index]);
            return;
          }
        }

        this.paths.push(updated);
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

  // #region メイン関数

  // ツールを設定
  setTool(tool: EditorTool): void {
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

  // #region DOM操作

  // ツールバーのUI更新
  private updateToolbarUI(): void {
    const buttons = [
      { el: this.dom.selectToolButton, active: this.currentTool === 'select' },
      { el: this.dom.penToolButton, active: this.currentTool === 'pen' },
    ];

    for (const { el, active } of buttons) {
      // アクティブ時のクラス
      el.classList.toggle('bg-gray-50', active);
      el.classList.toggle('text-gray-950', active);
      el.classList.toggle('hover:bg-gray-200', active);
      // 非アクティブ時のクラス
      el.classList.toggle('bg-gray-800', !active);
      el.classList.toggle('text-gray-400', !active);
      el.classList.toggle('hover:bg-gray-700', !active);
      el.classList.toggle('hover:text-gray-50', !active);
    }
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
      p.windowResized = () => this.windowResized(p);
      p.draw = () => this.draw(p);
      p.mouseDragged = () => this.mouseDragged(p);
      p.mousePressed = () => this.mousePressed(p);
      p.mouseReleased = () => this.mouseReleased(p);
      p.keyTyped = () => this.keyTyped(p);
      p.keyPressed = () => this.keyPressed(p);
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
    if (p.key === 'v') {
      this.setTool('select');
    } else if (p.key === 'g' || p.key === 'p') {
      this.setTool('pen');
    }
  }

  // p5.js キー押下（特殊キー用）
  private keyPressed(p: p5): void {
    // Delete (46) or Backspace (8) で選択中のパスを削除
    if (p.keyCode === 46 || p.keyCode === 8) {
      this.deleteActivePath();
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

    // 確定済みパスの描画
    for (let pathIndex = 0; pathIndex < this.paths.length; pathIndex++) {
      const path = this.paths[pathIndex];
      const isSelectedPath = this.activePath === path;

      drawSketchPath(
        p,
        path,
        this.config,
        this.colors,
        isSelectedPath,
        isSelectedPath
          ? (curveIndex, pointIndex) =>
              this.handleManager.isSelected({
                pathIndex,
                curveIndex,
                pointIndex,
              })
          : undefined,
      );
    }

    // ツール固有の描画
    if (this.currentTool === 'pen') {
      this.penTool.draw(p, ctx);
    } else {
      this.selectTool.draw(p, ctx);
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

    if (!isLeftMouseButton(p.mouseButton, p.LEFT)) return;

    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mousePressed(p, ctx);
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
      this.penTool.mouseReleased(p, ctx);
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
      !!target?.closest('#sketchSuggestionContainer')
    );
  }

  // モーションを再生
  public playMotion(): void {
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

    const selectionRange = this.handleManager.getSelectionRange();
    this.suggestionManager.open(targetPath);
    void this.suggestionManager.submit(
      targetPath,
      userPrompt,
      selectionRange ?? undefined,
    );
  }
}
