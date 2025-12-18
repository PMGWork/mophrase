import type p5 from 'p5';
import { CURVE_POINT } from '../constants';
import type { Path, Vector } from '../types';
import { bezierCurve, curveLength } from '../utils/math';
import { fitCurve } from './fitting';

// モーション管理クラス
export class MotionManager {
  private p: p5;
  private objectColor: string;
  private objectSize: number;
  private isPlaying: boolean = false;
  private currentPath: Path | null = null;
  private time: number = 0;
  private elapsedTime: number = 0;
  private startTime: number = 0;
  private duration: number = 0;
  private curveLengths: number[] = [];
  private totalLength: number = 0;

  constructor(p: p5, objectColor: string, objectSize: number) {
    this.p = p;
    this.objectColor = objectColor;
    this.objectSize = objectSize;
  }

  // #region メイン関数

  // モーション再生を開始
  public start(path: Path): void {
    if (path.motion.timing.length === 0) return;

    // パスを設定
    this.currentPath = path;
    this.isPlaying = true;
    this.time = 0;
    this.elapsedTime = 0;

    // 開始待機時間を設定（秒→ミリ秒）
    this.startTime = path.motion.startTime * 1000;

    // カーブの長さを事前計算してキャッシュ
    this.curveLengths = path.sketch.curves.map((c) => curveLength(c));
    this.totalLength = this.curveLengths.reduce((a, b) => a + b, 0);

    // 持続時間を設定 (秒 -> ミリ秒)
    this.duration = path.motion.duration * 1000;
  }

  // モーション再生を停止
  public stop(): void {
    this.isPlaying = false;
    this.time = 0;
    this.elapsedTime = 0;
    this.currentPath = null;
  }

  // モーションを更新
  public draw(): void {
    if (!this.isPlaying || !this.currentPath) return;

    // 経過時間を更新
    this.elapsedTime += this.p.deltaTime;

    // 開始時間まで待機
    if (this.elapsedTime < this.startTime) return;

    // アニメーション進行度を計算
    this.time += this.p.deltaTime / this.duration;

    if (this.time >= 1.0) {
      this.time = 1.0;
      this.isPlaying = false;
    }

    const progress = this.evaluateTiming(
      this.currentPath.motion.timing,
      this.time,
    );
    const position = this.evaluatePosition(
      this.currentPath.sketch.curves,
      progress,
    );

    this.drawObject(position);
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

  // タイミング曲線から進行度を求める
  private evaluateTiming(curves: Vector[][], time: number): number {
    for (let i = 0; i < curves.length; i++) {
      const curve = curves[i];
      const startX = curve[CURVE_POINT.START_ANCHOR_POINT].x;
      const endX = curve[CURVE_POINT.END_ANCHOR_POINT].x;

      if (time >= startX && time <= endX) {
        const u = this.solveBezierX(curve, time);
        return bezierCurve(curve[0], curve[1], curve[2], curve[3], u).y;
      }
    }

    if (time < curves[0][CURVE_POINT.START_ANCHOR_POINT].x) return 0;
    if (time > curves[curves.length - 1][CURVE_POINT.END_ANCHOR_POINT].x)
      return 1;

    return time;
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

  // 空間曲線から、進行度 p (0-1) に対応する座標を取得
  private evaluatePosition(curves: Vector[][], p: number): Vector {
    if (this.totalLength === 0)
      return curves[0][CURVE_POINT.START_ANCHOR_POINT];

    const targetDist = p * this.totalLength;
    let currentDist = 0;

    for (let i = 0; i < curves.length; i++) {
      const len = this.curveLengths[i];
      if (currentDist + len >= targetDist) {
        const localDist = targetDist - currentDist;
        const u = localDist / len;
        return bezierCurve(
          curves[i][0],
          curves[i][1],
          curves[i][2],
          curves[i][3],
          u,
        );
      }
      currentDist += len;
    }

    // 最後の点
    const lastCurve = curves[curves.length - 1];
    return lastCurve[CURVE_POINT.END_ANCHOR_POINT];
  }

  // タイミング曲線を生成
  public fitTiming(path: Path, p: p5, fitTolerance: number = 0.01): void {
    if (
      path.sketch.points.length < 2 ||
      path.motion.timestamps.length < 2
    )
      return;

    const totalTime =
      path.motion.timestamps[path.motion.timestamps.length - 1] -
      path.motion.timestamps[0];
    if (totalTime <= 0) return;

    const timingPoints = this.createTimingPoints(
      path.sketch.points,
      path.motion.timestamps,
      p,
      totalTime,
    );

    // タイミング曲線をフィッティング
    const timingCurves: Vector[][] = [];
    const fitError = { current: { maxError: Number.MAX_VALUE, index: -1 } };
    fitCurve(
      timingPoints,
      timingCurves,
      fitTolerance,
      fitTolerance * 5,
      fitError,
    );
    path.motion.timing = timingCurves;
  }

  // タイミングポイントを生成
  private createTimingPoints(
    points: Vector[],
    times: number[],
    p: p5,
    totalTime: number,
  ): Vector[] {
    const { distances, totalDistance } =
      this.calculateCumulativeDistances(points);

    return points.map((_, i) => {
      const time = (times[i] - times[0]) / totalTime;
      const d = totalDistance > 0 ? distances[i] / totalDistance : 0;
      return p.createVector(time, d);
    });
  }

  // 累積距離を計算
  private calculateCumulativeDistances(points: Vector[]): {
    distances: number[];
    totalDistance: number;
  } {
    const distances = [0];
    let totalDistance = 0;

    for (let i = 1; i < points.length; i++) {
      totalDistance += points[i].dist(points[i - 1]);
      distances.push(totalDistance);
    }

    return { distances, totalDistance };
  }
}
