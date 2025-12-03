/// ベジェハンドル操作関連
import type { Curve, HandleSelection, Vector } from './types';

// ハンドルの制御クラス
export class HandleManager {
  private getContainers: () => Curve[];
  private current: HandleSelection | null = null;
  private radius: number = 12;

  private pixelToNormalized: (x: number, y: number) => { x: number; y: number };
  private normalizedToPixel:
    | ((x: number, y: number) => { x: number; y: number })
    | null;

  constructor(
    getContainers: () => Curve[],
    pixelToNormalized: (x: number, y: number) => { x: number; y: number } = (
      x,
      y,
    ) => ({ x, y }),
    normalizedToPixel:
      | ((x: number, y: number) => { x: number; y: number })
      | null = null,
  ) {
    this.getContainers = getContainers;
    this.pixelToNormalized = pixelToNormalized;
    this.normalizedToPixel = normalizedToPixel;
  }

  // ドラッグを開始
  begin(x: number, y: number): boolean {
    this.current = this.findHandle(x, y);
    return this.current !== null;
  }

  // ドラッグ中の位置更新
  drag(x: number, y: number, mode: number): boolean {
    if (!this.current) return false;
    const localPos = this.pixelToNormalized(x, y);

    if (this.setHandlePosition(this.current, localPos.x, localPos.y, mode))
      return true;
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
  // x, y はピクセル座標
  private findHandle(x: number, y: number): HandleSelection | null {
    const containers = this.getContainers();
    for (let pathIndex = containers.length - 1; pathIndex >= 0; pathIndex--) {
      const container = containers[pathIndex];
      for (
        let curveIndex = container.curves.length - 1;
        curveIndex >= 0;
        curveIndex--
      ) {
        const curve = container.curves[curveIndex];
        for (let pointIndex = 0; pointIndex < curve.length; pointIndex++) {
          const point = curve[pointIndex];
          if (!point) continue;

          let px = point.x;
          let py = point.y;

          // 座標変換がある場合はピクセル座標に変換
          if (this.normalizedToPixel) {
            const pixelPos = this.normalizedToPixel(px, py);
            px = pixelPos.x;
            py = pixelPos.y;
          }

          const dx = px - x;
          const dy = py - y;
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
    mode: number,
  ): boolean {
    const container = this.getContainers()[selection.pathIndex];
    const curve = container?.curves[selection.curveIndex];
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
      const prevCurve = container?.curves[selection.curveIndex - 1];
      translate(prevCurve?.[2]);
      prevCurve?.[3]?.set(x, y);
    } else if (selection.pointIndex === 3) {
      // 次のカーブの調整
      translate(curve?.[2]);
      const nextCurve = container?.curves[selection.curveIndex + 1];
      translate(nextCurve?.[1]);
      nextCurve?.[0]?.set(x, y);
    } else if (mode === 0) {
      // 反対側のハンドル調整
      const isStartHandle = selection.pointIndex === 1;
      const anchor = curve?.[isStartHandle ? 0 : 3];
      const adjacentCurve =
        container?.curves[selection.curveIndex + (isStartHandle ? -1 : 1)];
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
