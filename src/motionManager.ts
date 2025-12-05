import type p5 from 'p5';
import { CURVE_POINT } from './constants';
import { fitCurve } from './fitting';
import { bezierCurve, curveLength } from './mathUtils';
import type { Path, Vector } from './types';

// 定数
const DEFAULT_DURATION = 2000;
const BISECTION_ITERATIONS = 10;
const MARKER_SIZE = 10;

// モーション管理クラス
export class MotionManager {
  private p: p5;
  private markerColor: string;
  private isPlaying: boolean = false;
  private currentPath: Path | null = null;
  private time: number = 0;
  private duration: number = 0;
  private curveLengths: number[] = [];
  private totalLength: number = 0;

  constructor(p: p5, markerColor: string) {
    this.p = p;
    this.markerColor = markerColor;
  }

  // #region メイン関数

  // モーション再生を開始
  public start(path: Path): void {
    if (path.timeCurve.length === 0) return;

    // パスを設定
    this.currentPath = path;
    this.isPlaying = true;
    this.time = 0;

    // カーブの長さを事前計算してキャッシュ
    this.curveLengths = path.curves.map((c) => curveLength(c));
    this.totalLength = this.curveLengths.reduce((a, b) => a + b, 0);

    // 持続時間を設定
    this.duration =
      path.times && path.times.length > 0
        ? path.times[path.times.length - 1] - path.times[0]
        : DEFAULT_DURATION;
  }

  // モーション再生を停止
  public stop(): void {
    this.isPlaying = false;
    this.time = 0;
    this.currentPath = null;
  }

  // モーションを更新
  public draw(): void {
    if (!this.isPlaying || !this.currentPath) return;

    this.time += this.p.deltaTime / this.duration;

    if (this.time >= 1.0) {
      this.time = 1.0;
      this.isPlaying = false;
    }

    const progress = this.evaluateTiming(this.currentPath.timeCurve, this.time);
    const position = this.evaluatePosition(this.currentPath.curves, progress);

    this.drawMarker(position);
  }

  // #region プライベート関数

  // マーカーを描画
  private drawMarker(position: Vector): void {
    this.p.push();
    this.p.fill(this.markerColor);
    this.p.noStroke();
    this.p.circle(position.x, position.y, MARKER_SIZE);
    this.p.pop();
  }

  // タイミング曲線から進行度を求める
  private evaluateTiming(curves: Vector[][], time: number): number {
    for (let i = 0; i < curves.length; i++) {
      const curve = curves[i];
      const startX = curve[CURVE_POINT.START_ANCHOR].x;
      const endX = curve[CURVE_POINT.END_ANCHOR].x;

      if (time >= startX && time <= endX) {
        const u = this.solveBezierX(curve, time);
        return bezierCurve(curve[0], curve[1], curve[2], curve[3], u).y;
      }
    }

    if (time < curves[0][CURVE_POINT.START_ANCHOR].x) return 0;
    if (time > curves[curves.length - 1][CURVE_POINT.END_ANCHOR].x) return 1;

    return time;
  }

  // X(u) = targetX となる u を求める
  private solveBezierX(curve: Vector[], targetX: number): number {
    // 二分探索で近似
    let low = 0;
    let high = 1;
    let u = 0;

    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
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
    if (this.totalLength === 0) return curves[0][CURVE_POINT.START_ANCHOR];

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
    return lastCurve[CURVE_POINT.END_ANCHOR];
  }

  // タイミング曲線を生成
  public fitTiming(path: Path, p: p5, fitTolerance: number = 0.01): void {
    if (path.points.length < 2 || path.times.length < 2) return;

    const totalTime = path.times[path.times.length - 1] - path.times[0];
    if (totalTime <= 0) return;

    const timingPoints = this.createTimingPoints(
      path.points,
      path.times,
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
    path.timeCurve = timingCurves;
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
