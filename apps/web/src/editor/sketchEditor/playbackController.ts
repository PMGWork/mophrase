/**
 * スケッチエディタの再生コントローラー。
 * モーションの再生・停止・シーク・タイムライン準備を担当する。
 */

import type { MotionManager } from '../../core/motionManager';
import type { Path } from '../../types';
import { clamp } from '../../utils/math';

// 再生コントローラー
export class PlaybackController {
  private motionManager: MotionManager | null = null;
  private _isPreviewing: boolean = false;
  private getPaths: () => Path[];
  private objectColors: string[];
  private onBeforePlaybackChange: () => void;

  constructor(
    getPaths: () => Path[],
    objectColors: string[],
    onBeforePlaybackChange: () => void,
  ) {
    this.getPaths = getPaths;
    this.objectColors = objectColors;
    this.onBeforePlaybackChange = onBeforePlaybackChange;
  }

  // #region MotionManager 管理

  setMotionManager(manager: MotionManager): void {
    this.motionManager = manager;
  }

  getMotionManager(): MotionManager | null {
    return this.motionManager;
  }

  // #region プレビュー状態

  get isPreviewing(): boolean {
    return this._isPreviewing;
  }

  set isPreviewing(value: boolean) {
    this._isPreviewing = value;
  }

  // #region 再生操作

  // 再生/停止を切り替える
  toggleMotion(paths: Path[]): boolean {
    if (!this.motionManager) return false;
    this.onBeforePlaybackChange();

    // 再生中なら停止
    if (this.motionManager.getIsPlaying()) {
      this.motionManager.stop();
      this._isPreviewing = this.motionManager.getTotalDuration() > 0;
      return false;
    }

    // 停止中なら全パスの再生開始
    const colors = this.getPathColors(paths);
    const elapsed = this.motionManager.getElapsedTime();
    this.motionManager.startAll(paths, colors, elapsed);
    this._isPreviewing = false;
    return this.motionManager.getIsPlaying();
  }

  // 再生を先頭にリセット
  resetPlayback(): void {
    if (!this.motionManager) return;
    this.onBeforePlaybackChange();

    if (this.motionManager.getIsPlaying()) {
      this.motionManager.stop();
    }

    if (!this.prepareAllPaths()) return;
    this.motionManager.seekTo(0);
    this._isPreviewing = false;
  }

  // 最終フレームへ移動
  goToLastFrame(): void {
    if (!this.motionManager) return;
    this.onBeforePlaybackChange();

    if (this.motionManager.getIsPlaying()) {
      this.motionManager.stop();
    }

    if (!this.prepareAllPaths()) return;
    this.motionManager.seekTo(this.motionManager.getTotalDuration());
    this._isPreviewing = true;
  }

  // 再生バー用の情報を取得
  getPlaybackInfo(): {
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

  // 再生可能なパスがあるか
  hasPaths(): boolean {
    return (this.motionManager?.getTotalDuration() ?? 0) > 0;
  }

  // 進行度でシーク（0〜1）
  seekPlayback(progress: number): void {
    if (!this.motionManager) return;
    this.onBeforePlaybackChange();
    if (!this.prepareAllPaths()) return;

    const totalDuration = this.motionManager.getTotalDuration();
    if (totalDuration <= 0) return;

    const clamped = clamp(progress, 0, 1);
    this.motionManager.seekTo(clamped * totalDuration);
    this._isPreviewing = true;
  }

  // タイムラインを再構築
  refreshPlaybackTimeline(): void {
    if (!this.motionManager) return;
    const paths = this.getPaths();
    const colors = this.getPathColors(paths);
    const elapsed = this.motionManager.getElapsedTime();

    if (this.motionManager.getIsPlaying()) {
      this.motionManager.startAll(paths, colors, elapsed);
      return;
    }

    this.prepareAllPaths();
  }

  // #region 色ヘルパー

  // パスに対応する色の配列を取得
  getPathColors(paths?: Path[]): string[] {
    const p = paths ?? this.getPaths();
    return p.map((_, i) => this.objectColors[i % this.objectColors.length]);
  }

  // パスに対応する色を取得
  getPathColor(path: Path): string {
    const paths = this.getPaths();
    const index = paths.indexOf(path);
    const colorIndex = index >= 0 ? index : 0;
    return this.objectColors[colorIndex % this.objectColors.length];
  }

  // #region 内部

  // 全パスの再生データを準備
  prepareAllPaths(): boolean {
    if (!this.motionManager) return false;
    const paths = this.getPaths();

    if (paths.length === 0) {
      this.motionManager.prepareAll([], []);
      this._isPreviewing = false;
      return this.motionManager.getTotalDuration() > 0;
    }

    this.motionManager.prepareAll(paths, this.getPathColors(paths));
    return true;
  }
}
