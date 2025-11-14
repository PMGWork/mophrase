/// ベジェハンドル操作関連
import type { HandleSelection, Path, Vector } from './types';

// ハンドルの制御クラス
export class HandleManager {
  private getPaths: () => Path[];
  private radius: number;
  private current: HandleSelection | null = null;

  constructor(getPaths: () => Path[], radius = 12) {
    this.getPaths = getPaths;
    this.radius = radius;
  }

  // ドラッグを開始
  begin(x: number, y: number): boolean {
    this.current = this.findHandle(x, y);
    return this.current !== null;
  }

  // ドラッグ中の位置更新
  drag(x: number, y: number, mode: number): boolean {
    if (!this.current) return false;
    if (this.setHandlePosition(this.current, x, y, mode)) return true;
    this.current = null;
    return false;
  }

  // ドラッグを終了
  end(): boolean {
    const wasDragging = this.current !== null;
    this.current = null;
    return wasDragging;
  }

  // 指定位置にハンドルがあるかを検索
  private findHandle(x: number, y: number): HandleSelection | null {
    const paths = this.getPaths();
    for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
      const path = paths[pathIndex];
      for (let curveIndex = path.curves.length - 1; curveIndex >= 0; curveIndex--) {
        const curve = path.curves[curveIndex];
        for (let pointIndex = 0; pointIndex < curve.length; pointIndex++) {
          const point = curve[pointIndex];
          if (!point) continue;
          const dx = point.x - x;
          const dy = point.y - y;
          if (dx * dx + dy * dy <= this.radius * this.radius) {
            return { pathIndex, curveIndex, pointIndex };
          }
        }
      }
    }
    return null;
  }

  // 指定された選択情報のハンドル位置を更新
  private setHandlePosition(
    selection: HandleSelection,
    x: number,
    y: number,
    mode: number
  ): boolean {
    const path = this.getPaths()[selection.pathIndex];
    const curve = path?.curves[selection.curveIndex];
    const handle = curve?.[selection.pointIndex];
    if (!handle) return false;

    const dx = x - handle.x;
    const dy = y - handle.y;
    handle.set(x, y);

    const translate = (vec?: Vector | null): void => {
      if (vec) vec.add(dx, dy);
    };

    if (selection.pointIndex === 0) {
      // 前のカーブの調整
      translate(curve?.[1]);
      const prevCurve = path?.curves[selection.curveIndex - 1];
      translate(prevCurve?.[2]);
      prevCurve?.[3]?.set(x, y);
    } else if (selection.pointIndex === 3) {
      // 次のカーブの調整
      translate(curve?.[2]);
      const nextCurve = path?.curves[selection.curveIndex + 1];
      translate(nextCurve?.[1]);
      nextCurve?.[0]?.set(x, y);
    } else if (mode === 0) {
      // 反対側のハンドル調整
      const isStartHandle = selection.pointIndex === 1;
      const anchor = curve?.[isStartHandle ? 0 : 3];
      const adjacentCurve = path?.curves[selection.curveIndex + (isStartHandle ? -1 : 1)];
      const oppositeHandle = adjacentCurve?.[isStartHandle ? 2 : 1];
      if (anchor && oppositeHandle) {
        const toCurrent = handle.copy().sub(anchor);
        if (toCurrent.magSq() > 0) {
          const currentDir = toCurrent.copy().mult(-1).normalize();
          const oppositeLength = oppositeHandle.copy().sub(anchor).mag();
          const target = currentDir.mult(oppositeLength);
          oppositeHandle.set(anchor.x + target.x, anchor.y + target.y);
        }
      }
    }
    return true;
  }
}
