/**
 * 提案ループ再生コントローラー。
 * 提案ホバー時のアニメーションループ再生状態を管理する。
 */

import p5 from 'p5';
import { MotionManager } from '../../core/motionManager';
import { SuggestionManager } from '../../suggestion/suggestion';
import type { Path } from '../../types';

// 提案ループ再生コントローラー
export interface SuggestionLoopDeps {
  getP5(): p5 | null;
  getPaths(): Path[];
  getMotionManager(): MotionManager | null;
  getSuggestionMotionManager(): MotionManager | null;
  getSuggestionManager(): SuggestionManager;
  getPathColor(path: Path): string;
}

// 提案ループ再生を管理するクラス
export class SuggestionLoopController {
  private isPlaying = false;
  private loopPath: Path | null = null;
  private hoveredId: string | null = null;
  private hasHoverableSuggestions = false;
  private isModifierAdjusting = false;
  private deps: SuggestionLoopDeps;

  constructor(deps: SuggestionLoopDeps) {
    this.deps = deps;
  }

  get isSuggestionLoopPlayback(): boolean {
    return this.isPlaying;
  }

  get suggestionLoopPath(): Path | null {
    return this.loopPath;
  }

  set suggestionLoopPath(path: Path | null) {
    this.loopPath = path;
  }

  get hoveredSuggestionId(): string | null {
    return this.hoveredId;
  }

  set hoveredSuggestionId(id: string | null) {
    this.hoveredId = id;
  }

  setModifierAdjusting(isAdjusting: boolean, path: Path | null): void {
    this.isModifierAdjusting = isAdjusting;
    if (path) {
      this.loopPath = path;
    }
    this.syncByState({ restartIfPlaying: isAdjusting });
  }

  // paths 配列に存在するループ対象パスを返す
  getResolvedLoopPath(): Path | null {
    if (!this.loopPath) return null;
    const paths = this.deps.getPaths();
    const index = paths.indexOf(this.loopPath);
    return index >= 0 ? paths[index] : null;
  }

  // 提案UIの状態変更に応じてループ再生を同期
  handleSuggestionUIStateChange(
    suggestionsCount: number,
    isVisible: boolean,
  ): void {
    this.hasHoverableSuggestions = suggestionsCount > 0;
    if (!isVisible || !this.hasHoverableSuggestions) {
      this.hoveredId = null;
    }
    this.syncByState();
  }

  // ホバー変更時の同期（再生中なら再開）
  syncOnHoverChange(): void {
    this.syncByState({ restartIfPlaying: true });
  }

  // パス更新時にループ再生をリスタート
  restartForPath(path: Path): void {
    const loopPath = this.getResolvedLoopPath();
    if (!loopPath || loopPath !== path) return;
    this.restart();
  }

  // 状態をリセット（ツール切り替え・パス削除時）
  reset(): void {
    this.stop();
    this.loopPath = null;
    this.hoveredId = null;
    this.hasHoverableSuggestions = false;
    this.isModifierAdjusting = false;
  }

  // ループ再生を停止
  stop(): void {
    const smm = this.deps.getSuggestionMotionManager();
    if (!this.isPlaying && !smm?.getIsPlaying()) return;
    smm?.stop();
    this.isPlaying = false;
  }

  // ループ再生が必要か判定
  private shouldPlay(): boolean {
    if (this.hasHoverableSuggestions && this.hoveredId !== null) {
      return true;
    }
    return this.isModifierAdjusting && this.getResolvedLoopPath() !== null;
  }

  // 状態に応じてループ再生を開始・停止・再開
  private syncByState(options: { restartIfPlaying?: boolean } = {}): void {
    if (!this.shouldPlay()) {
      this.stop();
      return;
    }
    if (options.restartIfPlaying && this.isPlaying) {
      this.restart();
      return;
    }
    if (!this.isPlaying) {
      this.start();
    }
  }

  // ループ再生を開始
  private start(startAtMs: number = 0): void {
    const smm = this.deps.getSuggestionMotionManager();
    if (!smm) return;
    if (this.deps.getMotionManager()?.getIsPlaying()) return;

    const p = this.deps.getP5();
    if (!p) return;
    const isSuggestionHoverActive =
      this.hasHoverableSuggestions && this.hoveredId !== null;
    const path = isSuggestionHoverActive
      ? this.deps.getSuggestionManager().getHoveredPreviewPath(p)
      : this.getResolvedLoopPath();
    if (!path) return;

    const duration = Number.isFinite(path.duration)
      ? Math.max(path.duration, 0.01)
      : 0.01;
    const loopPath: Path = { ...path, startTime: 0, duration };

    const originalPath = this.getResolvedLoopPath();
    const colorSource = isSuggestionHoverActive ? (originalPath ?? path) : path;
    smm.startAll([loopPath], [this.deps.getPathColor(colorSource)], startAtMs);
    if (!smm.getIsPlaying()) return;
    this.isPlaying = true;
  }

  // ループ再生をリスタート
  private restart(): void {
    if (!this.isPlaying) return;
    const smm = this.deps.getSuggestionMotionManager();
    const elapsedMs = smm?.getElapsedTime() ?? 0;
    this.stop();
    this.start(elapsedMs);
  }
}
