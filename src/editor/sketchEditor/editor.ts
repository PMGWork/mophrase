/**
 * スケッチエディタ。
 * パスの描画・選択・ハンドル編集・モーション再生・提案連携を統合する中心クラス。
 */

import p5 from 'p5';
import { type Colors, type Config } from '../../config';
import { OBJECT_SIZE } from '../../constants';
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
  SerializedProjectPath,
  ToolKind,
} from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { drawSketchPath } from '../../utils/rendering';
import {
  isLeftMouseButton,
  isPrimaryEditingPointer,
  toEditorPointerInput,
} from '../../utils/input';
import { clamp } from '../../utils/number';
import { deserializePaths } from '../../utils/serialization/project';
import { PenTool } from './penTool';
import { SelectTool } from './selectTool';
import type { SketchDomRefs, ToolContext } from './types';

// スケッチエディタ
export class SketchEditor {
  // データ構造
  private paths: Path[] = [];
  private activePath: Path | null = null;
  private isPreviewing: boolean = false;

  // プロジェクト設定
  private projectSettings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };

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
  private objectColors: string[];

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

  public destroy(): void {
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }
    this.removePointerListeners();
    this.p?.remove();
    this.p = null;
    this.canvasElement = null;
    this.activePointerId = null;
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
    this.pointerEventsEnabled =
      typeof window !== 'undefined' && 'PointerEvent' in window;

    const sketch = (p: p5) => {
      p.setup = () => this.setup(p);
      // p.windowResized is removed to avoid global window resize dependency
      p.draw = () => this.draw(p);
      if (!this.pointerEventsEnabled) {
        p.mouseDragged = () => this.mouseDragged(p);
        p.mousePressed = () => this.mousePressed(p);
        p.mouseReleased = () => this.mouseReleased(p);
      }
      p.keyPressed = () => this.keyPressed(p);
    };

    this.p = new p5(sketch);
  }

  // p5.js セットアップ
  private setup(p: p5): void {
    const { width, height } = this.dom.getCanvasSize();
    const renderer = p.createCanvas(width, height);
    renderer.parent(this.dom.canvasContainer);
    this.canvasElement = renderer.elt as HTMLCanvasElement;
    if (this.pointerEventsEnabled && this.canvasElement) {
      this.canvasElement.style.touchAction = 'none';
      this.addPointerListeners();
    }
    p.background(this.colors.background);
    p.textFont('Geist');

    this.motionManager = new MotionManager(p, OBJECT_SIZE);

    // 初期化後、プロジェクト設定を適用してフレームレートと再生時間を反映
    this.setProjectSettings(this.projectSettings);
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
        const color = this.objectColors[i % this.objectColors.length];

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
    const target = this.getClickTargetFromLocal(p.mouseX, p.mouseY);
    if (this.shouldIgnoreClick(target)) return;

    if (!isLeftMouseButton(p.mouseButton, p.LEFT)) return;

    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mousePressed(p, p.mouseX, p.mouseY, ctx);
    } else {
      this.selectTool.mousePressed(
        p.mouseX,
        p.mouseY,
        p.keyIsDown(p.SHIFT),
        ctx,
      );
    }
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseDragged(p, p.mouseX, p.mouseY);
    } else {
      this.selectTool.mouseDragged(
        p.mouseX,
        p.mouseY,
        p.keyIsDown(p.ALT),
        ctx,
      );
    }
  }

  // p5.js マウスリリース
  private mouseReleased(_p: p5): void {
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseReleased(ctx);
    } else {
      this.selectTool.mouseReleased(ctx);
    }
  }

  // Pointer押下
  private pointerDown(event: PointerEvent): void {
    if (this.activePointerId !== null) return;
    if (!this.p) return;
    const canvas = this.canvasElement;
    if (!canvas) return;

    const input = toEditorPointerInput(event, canvas);
    if (!isPrimaryEditingPointer(input)) return;

    const target = this.getClickTargetFromClient(input.clientX, input.clientY);
    if (this.shouldIgnoreClick(target)) return;

    this.activePointerId = input.pointerId;
    this.capturePointer(input.pointerId);
    if (event.cancelable) event.preventDefault();

    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mousePressed(this.p, input.x, input.y, ctx);
    } else {
      this.selectTool.mousePressed(input.x, input.y, input.shiftKey, ctx);
    }
  }

  // Pointer移動
  private pointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    if (!this.p) return;
    const canvas = this.canvasElement;
    if (!canvas) return;

    const input = toEditorPointerInput(event, canvas);
    if (event.cancelable) event.preventDefault();

    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseDragged(this.p, input.x, input.y);
    } else {
      this.selectTool.mouseDragged(input.x, input.y, input.altKey, ctx);
    }
  }

  // Pointer終了
  private pointerEnd(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    const pointerId = this.activePointerId;
    this.finishPointerInteraction();
    if (pointerId !== null) {
      this.releasePointerCapture(pointerId);
    }
  }

  // Pointer capture 消失
  private pointerLostCapture(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.finishPointerInteraction();
  }

  private finishPointerInteraction(): void {
    if (this.activePointerId === null) return;
    const ctx = this.getToolContext();
    if (this.currentTool === 'pen') {
      this.penTool.mouseReleased(ctx);
    } else {
      this.selectTool.mouseReleased(ctx);
    }
    this.activePointerId = null;
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
    if (this.canvasElement) {
      this.canvasElement.removeEventListener(
        'pointerdown',
        this.handlePointerDown,
      );
      this.canvasElement.removeEventListener(
        'pointermove',
        this.handlePointerMove,
      );
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

  // クリック対象の要素を取得
  private getClickTargetFromLocal(x: number, y: number): Element | null {
    const rect = this.canvasElement?.getBoundingClientRect();
    const clientX = (rect?.left ?? 0) + x;
    const clientY = (rect?.top ?? 0) + y;
    return this.getClickTargetFromClient(clientX, clientY);
  }

  private getClickTargetFromClient(
    clientX: number,
    clientY: number,
  ): Element | null {
    return document.elementFromPoint(clientX, clientY);
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
    const colors = this.getPathColors();
    const elapsed = this.motionManager.getElapsedTime();
    this.motionManager.startAll(this.paths, colors, elapsed);
    this.isPreviewing = false;
    return this.motionManager.getIsPlaying();
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
    return (this.motionManager?.getTotalDuration() ?? 0) > 0;
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

    const clamped = clamp(progress, 0, 1);
    this.motionManager.seekTo(clamped * totalDuration);
    this.isPreviewing = true;
  }

  private getPathColors(): string[] {
    return this.paths.map(
      (_, i) => this.objectColors[i % this.objectColors.length],
    );
  }

  private prepareAllPaths(): boolean {
    if (!this.motionManager) return false;

    if (this.paths.length === 0) {
      this.motionManager.prepareAll([], []);
      this.isPreviewing = false;
      return this.motionManager.getTotalDuration() > 0;
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

  // #region プロジェクト設定

  // プロジェクト設定を取得
  public getProjectSettings(): ProjectSettings {
    return { ...this.projectSettings };
  }

  // プロジェクト設定を更新（フレームレート/再生時間）
  public setProjectSettings(settings: ProjectSettings): void {
    this.projectSettings = { ...settings };

    // フレームレートを即時反映
    if (this.p) {
      const fps =
        settings.playbackFrameRate > 0 ? settings.playbackFrameRate : 60;
      this.p.frameRate(fps);
    }

    // 総再生時間の上書きを設定（秒→ミリ秒）
    if (this.motionManager) {
      this.motionManager.setDurationOverride(settings.playbackDuration * 1000);
    }

    // タイムラインを更新
    this.refreshPlaybackTimeline();
  }

  // 全パスを取得（シリアライズ用）
  public getPaths(): Path[] {
    return [...this.paths];
  }

  // プロジェクトを適用（Load時）
  public applyProject(paths: Path[], settings: ProjectSettings): void {
    // 既存のパスを全て置換
    this.paths = paths;
    this.activePath = null;
    this.isPreviewing = false;

    // プロジェクト設定を適用
    this.setProjectSettings(settings);

    // 提案マネージャーを閉じる
    this.suggestionManager.close();

    // ハンドル選択をクリア
    this.handleManager.clearSelection();

    // コールバックを呼び出す
    this.onPathSelected(null);
  }

  // シリアライズ済みプロジェクトを復元して適用
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
