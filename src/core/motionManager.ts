/**
 * タイムライン再生エンジン。
 * 全パスの空間曲線と時間曲線からオブジェクトの位置を評価し、アニメーションを描画する。
 */

import type p5 from 'p5';
import type { Path } from '../types';
import { bezierCurve } from '../utils/bezier';
import { clamp } from '../utils/math';
import {
  buildGraphCurves,
  computeKeyframeProgress,
} from '../utils/keyframes';
import { applyGraphModifiers, resolveEffectiveTimes } from '../utils/modifier';
import { resolveSketchCurves } from '../utils/path';

// 個別パスのアニメーション状態
type PathAnimationState = {
  path: Path;
  color: string;
  spatialCurves: p5.Vector[][];
  graphCurves: p5.Vector[][];
  keyframeProgress: number[];
  effectiveTimes: number[];
  startTime: number; // ミリ秒
  duration: number; // ミリ秒
};

// モーション管理クラス
export class MotionManager {
  private p: p5;
  private objectSize: number;
  private isPlaying: boolean = false;
  private elapsedTime: number = 0;
  private totalDuration: number = 0;

  // プロジェクト設定からの上書き
  private durationOverrideMs: number = 0; // 0=未設定(自動計算)

  // 全パスのアニメーション状態
  private animationStates: PathAnimationState[] = [];

  // 静的表示用
  private staticPath: Path | null = null;
  private staticColor: string = '#ffffff';

  constructor(p: p5, objectSize: number) {
    this.p = p;
    this.objectSize = objectSize;
  }

  // 総再生時間を解決（上書きがあればそれを優先）
  private resolvedDuration(computed: number): number {
    return this.durationOverrideMs > 0 ? this.durationOverrideMs : computed;
  }

  // #region メイン関数

  // 再生中かどうかを取得
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // 経過時間を取得（ミリ秒）
  public getElapsedTime(): number {
    return this.elapsedTime;
  }

  // 総再生時間を取得（ミリ秒）
  public getTotalDuration(): number {
    return this.totalDuration;
  }

  // 総再生時間の上書きを設定（ミリ秒、0=未設定で自動計算）
  public setDurationOverride(durationMs: number): void {
    this.durationOverrideMs = durationMs;
  }

  // 全パスのタイムライン再生を開始
  public startAll(
    paths: Path[],
    colors: string[],
    startAtMs: number = 0,
  ): void {
    const { states, totalDuration } = this.buildAnimationStates(paths, colors);
    this.animationStates = states;
    this.totalDuration = this.resolvedDuration(totalDuration);

    const clamped = clamp(startAtMs, 0, this.totalDuration);
    this.elapsedTime = clamped;
    this.isPlaying = this.totalDuration > 0;
  }

  // 再生前にアニメーション情報を準備
  public prepareAll(paths: Path[], colors: string[]): void {
    if (paths.length === 0) {
      this.animationStates = [];
      this.totalDuration = this.resolvedDuration(0);
      if (this.elapsedTime > this.totalDuration) {
        this.elapsedTime = this.totalDuration;
      }
      return;
    }

    const { states, totalDuration } = this.buildAnimationStates(paths, colors);
    this.animationStates = states;
    this.totalDuration = this.resolvedDuration(totalDuration);

    if (this.elapsedTime > this.totalDuration) {
      this.elapsedTime = this.totalDuration;
    }
  }

  // 再生位置を移動
  public seekTo(elapsedMs: number): void {
    if (this.totalDuration <= 0) {
      this.elapsedTime = 0;
      return;
    }
    this.elapsedTime = clamp(elapsedMs, 0, this.totalDuration);
  }

  // モーション再生を停止
  public stop(): void {
    this.isPlaying = false;
  }

  // 静的表示対象のパスを設定（非再生時用）
  public setPath(path: Path | null): void {
    this.staticPath = path;
  }

  // オブジェクトの色を設定（非再生時用）
  public setColor(color: string): void {
    this.staticColor = color;
  }

  // モーションを更新・描画
  public draw(): void {
    // 再生中の場合
    if (this.isPlaying) {
      this.elapsedTime += this.p.deltaTime;

      // 全アニメーション終了したらループ
      if (this.elapsedTime >= this.totalDuration) {
        this.elapsedTime = 0;
      }

      // 各パスのオブジェクトを描画
      for (const state of this.animationStates) {
        const position = this.evaluatePathPosition(state, this.elapsedTime);
        this.drawObject(position, state.color);
      }
      return;
    }

    // 再生していない場合は、設定されたパスの開始位置を表示
    if (this.staticPath && this.staticPath.keyframes.length > 0) {
      const { effective: effectiveCurves } = resolveSketchCurves(
        this.staticPath,
        this.p,
      );
      const startPosition =
        effectiveCurves[0]?.[0] ?? this.staticPath.keyframes[0].position;
      this.drawObject(startPosition, this.staticColor);
    }
  }

  // 再生前プレビュー（現在時間で描画）
  public drawPreview(): void {
    if (this.animationStates.length === 0) return;

    const previewTime = clamp(this.elapsedTime, 0, this.totalDuration);
    for (const state of this.animationStates) {
      const position = this.evaluatePathPosition(state, previewTime);
      this.drawObject(position, state.color);
    }
  }

  // #region プライベート関数
  private buildAnimationStates(
    paths: Path[],
    colors: string[],
  ): { states: PathAnimationState[]; totalDuration: number } {
    const states: PathAnimationState[] = [];
    let totalDuration = 0;

    // 各パスのアニメーション状態を準備
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (path.keyframes.length < 2) continue;

      const startTime = path.startTime * 1000;
      const duration = Math.max(1, path.duration * 1000);
      const endTime = startTime + duration;

      // タイムライン全体の終了時間を更新
      if (endTime > totalDuration) {
        totalDuration = endTime;
      }

      // 空間カーブと進行度を計算
      const { effective: spatialCurves } = resolveSketchCurves(path, this.p);
      const keyframeProgress = computeKeyframeProgress(
        path.keyframes,
        spatialCurves,
      );
      const effectiveTimes = resolveEffectiveTimes(path.keyframes, path.graphModifiers);

      // 時間カーブを生成
      const baseGraphCurves = buildGraphCurves(
        path.keyframes,
        keyframeProgress,
        effectiveTimes,
      );
      const graphCurves = applyGraphModifiers(
        baseGraphCurves,
        path.keyframes,
        path.graphModifiers,
        this.p,
      );

      states.push({
        path,
        color: colors[i % colors.length],
        spatialCurves,
        graphCurves,
        keyframeProgress,
        effectiveTimes,
        startTime,
        duration,
      });
    }

    return { states, totalDuration };
  }

  // 指定パスの現在位置を評価
  private evaluatePathPosition(
    state: PathAnimationState,
    elapsedTime: number,
  ): p5.Vector {
    const {
      path,
      spatialCurves,
      graphCurves,
      keyframeProgress,
      effectiveTimes,
      startTime,
      duration,
    } = state;

    // 開始時間前は開始位置
    if (elapsedTime < startTime) {
      return spatialCurves[0]?.[0] ?? path.keyframes[0].position;
    }

    // アニメーション進行度を計算
    const localTime = (elapsedTime - startTime) / duration;
    const time = clamp(localTime, 0, 1);

    // 終了後は終点位置
    if (time >= 1) {
      const lastCurve = spatialCurves[spatialCurves.length - 1];
      return (
        lastCurve?.[3] ?? path.keyframes[path.keyframes.length - 1].position
      );
    }

    return this.evaluatePosition(
      time,
      path.keyframes,
      effectiveTimes,
      spatialCurves,
      graphCurves,
      keyframeProgress,
    );
  }

  // オブジェクトを描画
  private drawObject(position: p5.Vector, color: string): void {
    this.p.push();
    this.p.fill(color);
    this.p.noStroke();
    this.p.circle(position.x, position.y, this.objectSize);
    this.p.pop();
  }

  // X(u) = targetX となる u を求める
  private solveBezierX(curve: p5.Vector[], targetX: number): number {
    let low = 0;
    let high = 1;
    let u = 0;

    for (let i = 0; i < 10; i++) {
      u = (low + high) / 2;
      const point = bezierCurve(curve[0], curve[1], curve[2], curve[3], u);
      if (point.x < targetX) {
        low = u;
      } else {
        high = u;
      }
    }
    return u;
  }

  // 時間に対応する位置を取得
  private evaluatePosition(
    time: number,
    keyframes: Path['keyframes'],
    effectiveTimes: number[],
    spatialCurves: p5.Vector[][],
    graphCurves: p5.Vector[][],
    keyframeProgress: number[],
  ): p5.Vector {
    if (keyframes.length === 0) {
      return this.p.createVector(0, 0);
    }

    if (keyframes.length === 1) return keyframes[0].position;

    const firstTime = effectiveTimes[0] ?? keyframes[0].time;
    const lastTime =
      effectiveTimes[effectiveTimes.length - 1] ??
      keyframes[keyframes.length - 1].time;

    if (time <= firstTime)
      return spatialCurves[0]?.[0] ?? keyframes[0].position;
    if (time >= lastTime) {
      const lastCurve = spatialCurves[spatialCurves.length - 1];
      return lastCurve?.[3] ?? keyframes[keyframes.length - 1].position;
    }

    const segmentIndex = this.findSegmentIndex(time, effectiveTimes);
    const graphCurve = graphCurves[segmentIndex];
    const spatialCurve = spatialCurves[segmentIndex];
    if (!graphCurve || !spatialCurve) return keyframes[segmentIndex].position;

    const u = this.solveBezierX(graphCurve, time);
    const progress = bezierCurve(
      graphCurve[0],
      graphCurve[1],
      graphCurve[2],
      graphCurve[3],
      u,
    ).y;

    const v0 = keyframeProgress[segmentIndex] ?? 0;
    const v1 = keyframeProgress[segmentIndex + 1] ?? v0;
    const denom = v1 - v0;
    const localU = Math.abs(denom) > 1e-6 ? (progress - v0) / denom : 0;
    const clamped = clamp(localU, 0, 1);

    return bezierCurve(
      spatialCurve[0],
      spatialCurve[1],
      spatialCurve[2],
      spatialCurve[3],
      clamped,
    );
  }

  // timeが含まれるセグメントを二分探索で取得
  private findSegmentIndex(time: number, effectiveTimes: number[]): number {
    let low = 0;
    let high = Math.max(0, effectiveTimes.length - 2);

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const t0 = effectiveTimes[mid] ?? 0;
      const t1 = effectiveTimes[mid + 1] ?? t0;
      if (time < t0) {
        high = mid - 1;
      } else if (time > t1) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return clamp(low, 0, effectiveTimes.length - 2);
  }
}
