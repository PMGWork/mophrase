import type p5 from 'p5';
import type { Path, Vector } from '../types';
import { bezierCurve } from '../utils/math';
import {
  buildGraphCurves,
  buildSketchCurves,
  computeKeyframeProgress,
} from '../utils/keyframes';
import { applyModifiers, applyGraphModifiers } from '../utils/modifier';

// モーション管理クラス
export class MotionManager {
  private p: p5;
  private objectColor: string;
  private objectSize: number;
  private isPlaying: boolean = false;
  private currentPath: Path | null = null;
  private staticPath: Path | null = null;
  private time: number = 0;
  private elapsedTime: number = 0;
  private startTime: number = 0;
  private duration: number = 0;
  private spatialCurves: Vector[][] = [];
  private graphCurves: Vector[][] = [];
  private keyframeProgress: number[] = [];

  constructor(p: p5, objectColor: string, objectSize: number) {
    this.p = p;
    this.objectColor = objectColor;
    this.objectSize = objectSize;
  }

  // #region メイン関数

  // オブジェクトの色を設定
  public setColor(color: string): void {
    this.objectColor = color;
  }

  // モーション再生を開始
  public start(path: Path): void {
    if (path.keyframes.length < 2) return;

    // パスを設定
    this.currentPath = path;
    this.isPlaying = true;
    this.time = 0;
    this.elapsedTime = 0;

    // 開始待機時間を設定（秒→ミリ秒）
    this.startTime = path.startTime * 1000;

    // 空間カーブと進行度を計算（modifier適用）
    const originalCurves = buildSketchCurves(path.keyframes);
    this.spatialCurves = applyModifiers(originalCurves, path.modifiers, this.p);
    this.keyframeProgress = computeKeyframeProgress(
      path.keyframes,
      this.spatialCurves,
    );

    // 時間カーブを生成（modifier適用）
    const baseGraphCurves = buildGraphCurves(path.keyframes, this.keyframeProgress);
    this.graphCurves = applyGraphModifiers(baseGraphCurves, path.modifiers, this.p);

    // 持続時間を設定 (秒 -> ミリ秒)
    this.duration = Math.max(1, path.duration * 1000);
  }

  // モーション再生を停止
  public stop(): void {
    this.isPlaying = false;
    this.time = 0;
    this.elapsedTime = 0;
    this.currentPath = null;
  }

  // 表示対象のパスを設定
  public setPath(path: Path | null): void {
    this.staticPath = path;
  }

  // モーションを更新
  public draw(): void {
    // 再生中の場合
    if (this.isPlaying && this.currentPath) {
      // 経過時間を更新
      this.elapsedTime += this.p.deltaTime;

      // 開始時間まで待機
      if (this.elapsedTime < this.startTime) {
        // 待機中は開始位置に表示
        this.drawObject(this.currentPath.keyframes[0].position);
        return;
      }

      // アニメーション進行度を計算
      this.time += this.p.deltaTime / this.duration;

      if (this.time >= 1.0) {
        this.time = 1.0;
        this.isPlaying = false;
      }

      const position = this.evaluatePosition(this.time);
      this.drawObject(position);
      return;
    }

    // 再生していない場合は、設定されたパスの開始位置を表示
    if (this.staticPath && this.staticPath.keyframes.length > 0) {
      const originalCurves = buildSketchCurves(this.staticPath.keyframes);
      const effectiveCurves = applyModifiers(originalCurves, this.staticPath.modifiers, this.p);
      const startPosition = effectiveCurves[0]?.[0] ?? this.staticPath.keyframes[0].position;
      this.drawObject(startPosition);
    }
  }

  // #region プライベート関数

  // オブジェクトを描画
  private drawObject(position: Vector): void {
    this.p.push();
    this.p.fill(this.objectColor);
    this.p.noStroke();
    this.p.circle(position.x, position.y, this.objectSize);
    this.p.pop();
  }

  // X(u) = targetX となる u を求める
  private solveBezierX(curve: Vector[], targetX: number): number {
    // 二分探索で近似
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
  private evaluatePosition(time: number): Vector {
    if (!this.currentPath || this.currentPath.keyframes.length === 0) {
      return this.p.createVector(0, 0);
    }

    const keyframes = this.currentPath.keyframes;
    if (keyframes.length === 1) return keyframes[0].position;

    if (time <= keyframes[0].time) return keyframes[0].position;
    if (time >= keyframes[keyframes.length - 1].time)
      return keyframes[keyframes.length - 1].position;

    const segmentIndex = this.findSegmentIndex(time, keyframes);
    const graphCurve = this.graphCurves[segmentIndex];
    const spatialCurve = this.spatialCurves[segmentIndex];
    if (!graphCurve || !spatialCurve) return keyframes[segmentIndex].position;

    const u = this.solveBezierX(graphCurve, time);
    const progress = bezierCurve(
      graphCurve[0],
      graphCurve[1],
      graphCurve[2],
      graphCurve[3],
      u,
    ).y;

    const v0 = this.keyframeProgress[segmentIndex] ?? 0;
    const v1 = this.keyframeProgress[segmentIndex + 1] ?? v0;
    const denom = v1 - v0;
    const localU =
      Math.abs(denom) > 1e-6 ? (progress - v0) / denom : 0;
    const clamped = Math.max(0, Math.min(1, localU));

    return bezierCurve(
      spatialCurve[0],
      spatialCurve[1],
      spatialCurve[2],
      spatialCurve[3],
      clamped,
    );
  }

  // timeが含まれるセグメントを二分探索で取得
  private findSegmentIndex(time: number, keyframes: Path['keyframes']): number {
    let low = 0;
    let high = Math.max(0, keyframes.length - 2);

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const t0 = keyframes[mid].time;
      const t1 = keyframes[mid + 1].time;
      if (time < t0) {
        high = mid - 1;
      } else if (time > t1) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return Math.max(0, Math.min(keyframes.length - 2, low));
  }
}
