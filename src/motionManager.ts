import type p5 from 'p5';
import type { Path, Vector } from './types';
import { fitCurve } from './fitting';
import { bezierCurve, curveLength } from './mathUtils';

export class MotionManager {
  private p: p5;
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private currentPath: Path | null = null;
  private duration: number = 0;
  private curveLengths: number[] = [];
  private totalLength: number = 0;
  private lastTimingIndex: number = 0;

  constructor(p: p5) {
    this.p = p;
  }

  // モーション再生を開始
  public play(path: Path): void {
    if (!path.timeCurve || path.timeCurve.length === 0) {
      console.warn("No timing data available for this path.");
      return;
    }

    this.currentPath = path;
    this.isPlaying = true;
    this.startTime = this.p.millis();
    this.lastTimingIndex = 0;

    // カーブの長さを事前計算してキャッシュ
    this.curveLengths = path.curves.map(c => curveLength(c));
    this.totalLength = this.curveLengths.reduce((a, b) => a + b, 0);

    // 最後のタイミングポイントのX座標（時間）が1.0になるように正規化されている前提
    // 実際の持続時間は別途保存するか、times配列から再計算する必要がある
    // ここでは、times配列の最後の値を使用する
    if (path.times && path.times.length > 0) {
      this.duration = path.times[path.times.length - 1] - path.times[0];
    } else {
      this.duration = 2000;
    }
  }

  // 描画ループ内で呼び出す
  public update(): void {
    if (!this.isPlaying || !this.currentPath) return;

    const elapsed = this.p.millis() - this.startTime;
    let t = elapsed / this.duration;

    if (t >= 1.0) {
      t = 1.0;
      this.isPlaying = false; // アニメーション終了
    } else if (t < 0) {
      t = 0;
    }

    // タイミング曲線から進行度(progress)を取得
    const progress = this.evaluateTiming(this.currentPath.timeCurve, t);

    // 進行度に対応する空間上の位置を取得
    const position = this.evaluatePosition(this.currentPath.curves, progress);

    // 描画
    this.p.push();
    this.p.fill(255, 0, 0);
    this.p.noStroke();
    this.p.circle(position.x, position.y, 10);
    this.p.pop();
  }

  // タイミング曲線 (X=Time, Y=Progress) から、指定時刻 t における Progress を求める
  // Xは単調増加と仮定し、X=t となる点を探索する
  private evaluateTiming(curves: Vector[][], t: number): number {
    // 簡易実装: 全曲線を走査して、X座標が t に最も近い点を探す
    // 本来はXについて解く必要があるが、ここではサンプリングで近似する

    // まず、どのセグメントに含まれるかを探す
    // しかし、Xは0-1で正規化されているため、単純にtと比較できる

    // 二分探索やニュートン法が正確だが、ここでは高解像度サンプリングで近似
    // または、tに対応する曲線を特定し、その曲線上でX=tとなるパラメータuを求める

    // 簡易的に、ベジェ曲線の性質を利用
    // X(u) = t を解いて u を求め、Y(u) を返す

    // 前回のインデックスから探索を開始（最適化）
    // 時間は単調増加するので、戻る必要はない
    for (let i = this.lastTimingIndex; i < curves.length; i++) {
      const curve = curves[i];
      const startX = curve[0].x;
      const endX = curve[3].x;

      if (t >= startX && t <= endX) {
        this.lastTimingIndex = i; // インデックスを更新
        // このカーブの中に t がある
        // X(u) = t を解く (u: 0->1)
        const u = this.solveBezierX(curve, t);
        return bezierCurve(curve[0], curve[1], curve[2], curve[3], u).y;
      }
    }

    // 見つからなかった場合（浮動小数点の誤差などで範囲外になった場合など）、
    // 念のため最初から探索するか、端点を返す
    if (t < curves[0][0].x) return 0;
    if (t > curves[curves.length - 1][3].x) return 1;

    return t;
  }

  // X(u) = targetX となる u を求める (0 <= u <= 1)
  private solveBezierX(curve: Vector[], targetX: number): number {
    // 二分探索で近似
    let low = 0;
    let high = 1;
    let u = 0.5;

    for (let i = 0; i < 10; i++) {
      u = (low + high) / 2;
      const p = bezierCurve(curve[0], curve[1], curve[2], curve[3], u);
      if (p.x < targetX) {
        low = u;
      } else {
        high = u;
      }
    }
    return u;
  }

  // 空間曲線から、進行度 p (0-1) に対応する座標を取得
  private evaluatePosition(curves: Vector[][], p: number): Vector {
    if (this.totalLength === 0) return curves[0][0];

    const targetDist = p * this.totalLength;
    let currentDist = 0;

    for (let i = 0; i < curves.length; i++) {
      const len = this.curveLengths[i];
      if (currentDist + len >= targetDist) {
        // このカーブ内にある
        const localDist = targetDist - currentDist;
        const u = localDist / len; // 近似: 弧長パラメータ化されていないため、uは距離に比例しないが、一旦これで
        return bezierCurve(curves[i][0], curves[i][1], curves[i][2], curves[i][3], u);
      }
      currentDist += len;
    }

    // 最後の点
    const lastCurve = curves[curves.length - 1];
    return lastCurve[3];
  }

  // 描画されたパスからタイミング曲線を生成する
  public fitTiming(path: Path, p: p5, fitTolerance: number = 0.01): void {
    if (!path.points || path.points.length < 2 || !path.times || path.times.length < 2) return;

    const totalTime = path.times[path.times.length - 1] - path.times[0];
    if (totalTime <= 0) return;

    // 累積距離を計算
    let totalDist = 0;
    const dists = [0];
    for (let i = 1; i < path.points.length; i++) {
      totalDist += path.points[i].dist(path.points[i - 1]);
      dists.push(totalDist);
    }

    // (Time, Distance) の点列を作成 (0-1に正規化)
    const timingPoints: Vector[] = [];
    for (let i = 0; i < path.points.length; i++) {
      const t = (path.times[i] - path.times[0]) / totalTime;
      const d = totalDist > 0 ? dists[i] / totalDist : 0;
      timingPoints.push(p.createVector(t, d));
    }

    // フィッティング実行
    // 既存のfitCurveを利用するが、エラー許容値などは調整が必要かも
    // Timingカーブは単純な形状が多いので、粗くても良いかもしれない
    const timingCurves: Vector[][] = [];
    const fitError = { current: { maxError: Number.MAX_VALUE, index: -1 } };

    // 許容誤差 (デフォルト 0.01 = 1%)
    fitCurve(timingPoints, timingCurves, fitTolerance, fitTolerance * 5, fitError);

    path.timeCurve = timingCurves;
  }
}
