/**
 * スケッチエディタ。
 * パスの描画・選択・ハンドル編集・モーション再生・提案連携を統合する中心クラス。
 * 入力ハンドリング・再生制御・描画は専用モジュールに委譲する。
 */

import p5 from 'p5';
import { type Colors, type Config } from '../../config';
import { CANVAS_FRAME_RATE, OBJECT_SIZE } from '../../constants';
import { HandleManager } from '../../core/handleManager';
import { MotionManager } from '../../core/motionManager';
import {
  SuggestionManager,
  type SuggestionUIState,
} from '../../suggestion/suggestion';
import type {
  HandleSelection,
  Path,
  ProjectSettings,
  SelectionRange,
  SerializedProjectPath,
  ToolKind,
} from '../../types';
import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
} from '../../types';
import { deserializePaths } from '../../utils/serialization/project';
import { captureCanvas } from './canvasCapture';
import { drawScene } from './drawScene';
import { InputHandler, type InputDispatcher } from './inputHandler';
import { PlaybackController } from './playbackController';
import { PenTool } from './penTool';
import { SelectTool } from './selectTool';
import { SuggestionLoopController } from './suggestionLoopController';
import type { SketchDomRefs, ToolContext } from './types';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  private paths: Path[] = [];
  private activePath: Path | null = null;

  // プロジェクト設定
  private projectSettings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };

  // ツール
  private currentTool: ToolKind = 'pen';
  private penTool: PenTool;
  private selectTool: SelectTool;

  // マネージャー
  private dom: SketchDomRefs;
  private handleManager: HandleManager;
  private suggestionMotionManager: MotionManager | null = null;
  private suggestionManager: SuggestionManager;
  private suggestionLoop: SuggestionLoopController;

  // 委譲先
  private inputHandler: InputHandler;
  private playback: PlaybackController;

  // 設定
  private config: Config;
  private colors: Colors;
  private objectColors: string[];

  // コールバック
  private onPathCreated: (path: Path) => void;
  private onPathSelected: (path: Path | null) => void;
  private onPathUpdated?: (path: Path) => void;
  private onToolChanged?: (tool: ToolKind) => void;
  private onSuggestionUIChange?: (state: SuggestionUIState) => void;

  // p5.js インスタンス
  private p: p5 | null = null;
  private canvasElement: HTMLCanvasElement | null = null;

  // コンストラクタ
  constructor(
    dom: SketchDomRefs,
    config: Config,
    colors: Colors,
    objectColors: string[],
    onPathCreated: (path: Path) => void,
    onPathSelected: (path: Path | null) => void,
    onPathUpdated?: (path: Path) => void,
    onToolChanged?: (tool: ToolKind) => void,
    onSuggestionUIChange?: (state: SuggestionUIState) => void,
  ) {
    this.dom = dom;
    this.config = config;
    this.colors = colors;
    this.objectColors = objectColors;
    this.onPathCreated = onPathCreated;
    this.onPathSelected = onPathSelected;
    this.onPathUpdated = onPathUpdated;
    this.onToolChanged = onToolChanged;
    this.onSuggestionUIChange = onSuggestionUIChange;

    // ツール初期化
    this.penTool = new PenTool();
    this.selectTool = new SelectTool();

    // ハンドルマネージャー
    this.handleManager = new HandleManager(() => this.paths);

    // 入力ハンドラー
    const dispatcher: InputDispatcher = {
      getP5: () => this.p,
      dispatchPress: (p, x, y, shift) => this.dispatchToolPress(p, x, y, shift),
      dispatchDrag: (p, x, y, alt) => this.dispatchToolDrag(p, x, y, alt),
      dispatchRelease: () => this.dispatchToolRelease(),
    };
    this.inputHandler = new InputHandler(dispatcher);

    // 提案ループコントローラー
    this.suggestionLoop = new SuggestionLoopController({
      getP5: () => this.p,
      getPaths: () => this.paths,
      getMotionManager: () => this.playback.getMotionManager(),
      getSuggestionMotionManager: () => this.suggestionMotionManager,
      getSuggestionManager: () => this.suggestionManager,
      getPathColor: (path) => this.playback.getPathColor(path),
    });

    // 再生コントローラー
    this.playback = new PlaybackController(
      () => this.paths,
      this.objectColors,
      () => this.suggestionLoop.stop(),
    );

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
      onUIStateChange: (state) => this.handleSuggestionUIStateChange(state),
    });

    // p5.jsの初期化
    this.initP5();
  }

  // #region 公開API

  // ツールの切り替え
  public setTool(tool: ToolKind): void {
    this.currentTool = tool;
    this.onToolChanged?.(tool);

    if (tool === 'pen') {
      this.suggestionLoop.reset();
      this.suggestionManager.close();
    }

    if (tool === 'select' && this.activePath) {
      this.suggestionLoop.suggestionLoopPath = this.activePath;
      this.suggestionManager.open(this.activePath);
    }
  }

  // 現在のツールを取得
  public getCurrentTool(): ToolKind {
    return this.currentTool;
  }

  // キャンバスのリサイズ
  public resize(): void {
    if (!this.p) return;
    const { width, height } = this.dom.getCanvasSize();
    this.p.resizeCanvas(width, height);
  }

  // エディタの破棄
  public destroy(): void {
    this.inputHandler.destroy();
    this.p?.remove();
    this.p = null;
    this.canvasElement = null;
    this.suggestionMotionManager = null;
  }

  // キャンバスを PNG data URL としてキャプチャ（LLM送信用にマージン付き）
  public captureCanvas(path?: Path, selectionRange?: SelectionRange): string | null {
    if (!this.canvasElement) return null;
    return captureCanvas(
      this.canvasElement,
      this.colors.background,
      this.p,
      path,
      selectionRange,
    );
  }

  /** 選択中のパスを削除 */
  public deleteActivePath(): boolean {
    if (!this.activePath) return false;

    const index = this.paths.indexOf(this.activePath);
    if (index >= 0) {
      this.paths.splice(index, 1);
    }

    if (this.suggestionLoop.suggestionLoopPath === this.activePath) {
      this.suggestionLoop.reset();
    }

    this.activePath = null;
    this.suggestionManager.close();
    this.handleManager.clearSelection();
    this.onPathSelected(null);
    return true;
  }

  /** アクティブなパスを安全に更新 */
  public updateActivePath(updater: (path: Path) => void): void {
    if (!this.activePath) return;
    const updatedPath = this.activePath;
    updater(updatedPath);
    this.suggestionLoop.restartForPath(updatedPath);
    this.playback.refreshPlaybackTimeline();
    this.onPathUpdated?.(updatedPath);
  }

  public getActivePath(): Path | null {
    return this.activePath ?? null;
  }

  public getLatestPath(): Path | undefined {
    return this.paths[this.paths.length - 1];
  }

  // #region 再生（PlaybackController 委譲）

  public toggleMotion(): boolean {
    return this.playback.toggleMotion(this.paths);
  }

  public resetPlayback(): void {
    this.playback.resetPlayback();
  }

  public goToLastFrame(): void {
    this.playback.goToLastFrame();
  }

  public getPlaybackInfo(): {
    isPlaying: boolean;
    elapsedMs: number;
    totalMs: number;
  } {
    return this.playback.getPlaybackInfo();
  }

  public hasPaths(): boolean {
    return this.playback.hasPaths();
  }

  public seekPlayback(progress: number): void {
    this.playback.seekPlayback(progress);
  }

  public refreshPlaybackTimeline(): void {
    this.playback.refreshPlaybackTimeline();
  }

  // #region 提案

  public getSuggestionManager(): SuggestionManager {
    return this.suggestionManager;
  }

  public generateSuggestion(userPrompt: string): void {
    const targetPath = this.activePath ?? this.paths[this.paths.length - 1];
    if (!targetPath) return;

    const selectionRange = this.handleManager.getSelectionRange();
    this.suggestionLoop.suggestionLoopPath = targetPath;
    this.suggestionManager.open(targetPath);
    void this.suggestionManager.submit(
      targetPath,
      userPrompt,
      selectionRange ?? undefined,
    );
  }

  public updateSuggestionUI(): void {
    this.suggestionManager.updateSelectionRange(
      this.handleManager.getSelectionRange() ?? undefined,
    );
  }

  public getSelectionRange(): SelectionRange | undefined {
    const selectionRange = this.handleManager.getSelectionRange();
    if (!selectionRange || !this.activePath) return undefined;
    const activePathIndex = this.paths.indexOf(this.activePath);
    if (activePathIndex < 0) return undefined;
    if (selectionRange.pathIndex !== activePathIndex) return undefined;
    return selectionRange;
  }

  public getSelectedHandlesForActivePath(): HandleSelection[] {
    if (!this.activePath) return [];
    const activePathIndex = this.paths.indexOf(this.activePath);
    if (activePathIndex < 0) return [];
    return this.handleManager
      .getSelectedHandles()
      .filter((handle) => handle.pathIndex === activePathIndex);
  }

  public setSuggestionHover(id: string | null, strength: number): void {
    this.suggestionManager.setHover(id, strength);
    this.suggestionLoop.hoveredSuggestionId = id;
    this.suggestionLoop.syncOnHoverChange();
  }

  public setModifierAdjusting(isAdjusting: boolean): void {
    this.suggestionLoop.setModifierAdjusting(isAdjusting, this.activePath);
  }

  // #region プロジェクト設定

  public getProjectSettings(): ProjectSettings {
    return { ...this.projectSettings };
  }

  public setProjectSettings(settings: ProjectSettings): void {
    const normalizedSettings = normalizeProjectSettings(settings);
    this.projectSettings = normalizedSettings;

    const mm = this.playback.getMotionManager();
    if (mm) {
      mm.setDurationOverride(0);
      mm.setEvaluationFrameRate(normalizedSettings.playbackFrameRate);
    }
    this.suggestionMotionManager?.setEvaluationFrameRate(
      normalizedSettings.playbackFrameRate,
    );

    this.playback.refreshPlaybackTimeline();
  }

  public getPaths(): Path[] {
    return [...this.paths];
  }

  public applyProject(paths: Path[], settings: ProjectSettings): void {
    this.paths = paths;
    this.activePath = null;
    this.playback.isPreviewing = false;
    this.suggestionLoop.reset();

    this.setProjectSettings(settings);
    this.suggestionManager.close();
    this.handleManager.clearSelection();
    this.onPathSelected(null);
  }

  public applySerializedProject(
    serializedPaths: SerializedProjectPath[],
    settings: ProjectSettings,
  ): void {
    if (!this.p) {
      console.warn(
        '[SketchEditor] Cannot apply project: p5 instance is not initialized.',
      );
      return;
    }
    try {
      const paths = deserializePaths(serializedPaths, this.p);
      this.applyProject(paths, settings);
    } catch (error) {
      console.error('[SketchEditor] Failed to deserialize project.', error);
    }
  }

  // #region p5.js

  private initP5(): void {
    const sketch = (p: p5) => {
      p.setup = () => this.setup(p);
      p.draw = () => this.draw(p);
      if (!this.inputHandler.isPointerEnabled()) {
        p.mouseDragged = () => this.inputHandler.mouseDragged(p);
        p.mousePressed = () => this.inputHandler.mousePressed(p);
        p.mouseReleased = () => this.inputHandler.mouseReleased();
      }
      p.keyPressed = () => this.keyPressed(p);
    };

    this.p = new p5(sketch);
  }

  private setup(p: p5): void {
    const { width, height } = this.dom.getCanvasSize();
    const renderer = p.createCanvas(width, height);
    renderer.parent(this.dom.canvasContainer);
    const canvas = renderer.elt as HTMLCanvasElement;
    this.canvasElement = canvas;
    this.inputHandler.attach(canvas);
    p.background(this.colors.background);
    p.textFont('Geist');
    p.frameRate(CANVAS_FRAME_RATE);

    const mm = new MotionManager(p, OBJECT_SIZE);
    this.playback.setMotionManager(mm);
    this.suggestionMotionManager = new MotionManager(p, OBJECT_SIZE);

    this.setProjectSettings(this.projectSettings);
  }

  private keyPressed(p: p5): void {
    const isInputFocused =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;

    if (p.keyIsDown(p.ALT) && (p.key === 'x' || p.keyCode === 88)) {
      if (isInputFocused && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.deleteActivePath();
      return;
    }

    if (isInputFocused) return;

    if (p.key === 'v') {
      this.setTool('select');
    } else if (p.key === 'g' || p.key === 'p') {
      this.setTool('pen');
    }
  }

  private draw(p: p5): void {
    const suggestionLoopPath = this.suggestionLoop.getResolvedLoopPath();
    const isPlaying =
      this.playback.getMotionManager()?.getIsPlaying() ?? false;
    const isSuggestionLoopPlaying =
      !isPlaying &&
      this.suggestionLoop.isSuggestionLoopPlayback &&
      !!suggestionLoopPath &&
      (this.suggestionMotionManager?.getIsPlaying() ?? false);

    drawScene(p, {
      paths: this.paths,
      activePath: this.activePath,
      colors: this.colors,
      config: this.config,
      objectColors: this.objectColors,
      objectSize: OBJECT_SIZE,
      currentTool: this.currentTool,
      isPreviewing: this.playback.isPreviewing,
      isSuggestionLoopPlaying,
      suggestionLoopPath,
      motionManager: this.playback.getMotionManager(),
      suggestionMotionManager: this.suggestionMotionManager,
      handleManager: this.handleManager,
      suggestionManager: this.suggestionManager,
      penTool: this.penTool,
      selectTool: this.selectTool,
      toolContext: this.getToolContext(),
      mapCurvePointToHandle: (pathIndex, curveIndex, pointIndex) =>
        this.mapCurvePointToHandle(pathIndex, curveIndex, pointIndex),
    });
  }

  // #region ツールディスパッチ

  private getToolContext(): ToolContext {
    return {
      paths: this.paths,
      activePath: this.activePath,
      handleManager: this.handleManager,
      suggestionManager: this.suggestionManager,
      motionManager: this.playback.getMotionManager(),
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

  private dispatchToolPress(
    p: p5,
    x: number,
    y: number,
    shift: boolean,
  ): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mousePressed(p, x, y, ctx);
    } else {
      this.selectTool.mousePressed(x, y, shift, ctx);
    }
  }

  private dispatchToolDrag(
    _p: p5,
    x: number,
    y: number,
    alt: boolean,
  ): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseDragged(_p, x, y);
    } else {
      this.selectTool.mouseDragged(x, y, alt, ctx);
    }
  }

  private dispatchToolRelease(): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      const didCreatePath = this.penTool.mouseReleased(ctx);
      if (didCreatePath) {
        this.setTool('select');
      }
    } else {
      this.selectTool.mouseReleased(ctx);
    }
  }

  // #region 提案ループ再生

  private handleSuggestionUIStateChange(state: SuggestionUIState): void {
    this.suggestionLoop.handleSuggestionUIStateChange(
      state.suggestions.length,
      state.isVisible,
    );
    this.onSuggestionUIChange?.(state);
  }

  // #region プライベートヘルパー

  private mapCurvePointToHandle(
    pathIndex: number,
    curveIndex: number,
    pointIndex: number,
  ): HandleSelection {
    if (pointIndex === 0) {
      return { pathIndex, keyframeIndex: curveIndex, handleType: 'ANCHOR' };
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
