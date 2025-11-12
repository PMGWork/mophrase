/**
 * ベジエハンドルの制御 / Bézier Handle Control
 * 
 * ベジェ曲線の制御点（ハンドル）のインタラクティブな編集を管理します。
 * Manages interactive editing of Bézier curve control points (handles).
 * 
 * Features / 機能:
 * - ハンドルのドラッグ検出 / Handle drag detection
 * - 制御点の位置更新 / Control point position updates
 * - 対称ハンドルモードのサポート / Symmetric handle mode support
 * - C1連続性の維持（オプション） / Maintain C1 continuity (optional)
 */

import type { HandleSelection, Path, Vector } from './types';

/**
 * ベジエハンドルの制御クラス / Bézier Handle Controller Class
 */
export class HandleController {
  private getPaths: () => Path[];
  private radius: number;
  private current: HandleSelection | null = null;

  constructor(getPaths: () => Path[], radius = 12) {
    this.getPaths = getPaths;
    this.radius = radius;
  }

  /**
   * ドラッグを開始 / Begin dragging
   * 
   * @param x - マウスX座標 / Mouse X coordinate
   * @param y - マウスY座標 / Mouse Y coordinate
   * @param isVisible - ハンドルが表示されているか / Whether handles are visible
   * @returns ハンドルが選択されたか / Whether a handle was selected
   */
  begin(x: number, y: number, isVisible: boolean): boolean {
    if (!isVisible) return false;
    this.current = this.findHandleAt(x, y);
    return this.current !== null;
  }

  /**
   * ドラッグ中の位置更新 / Update position during drag
   * 
   * @param x - マウスX座標 / Mouse X coordinate
   * @param y - マウスY座標 / Mouse Y coordinate
   * @param mode - ドラッグモード (0: 非対称, 1: 対称) / Drag mode (0: asymmetric, 1: symmetric)
   * @returns 更新が成功したか / Whether update was successful
   */
  drag(x: number, y: number, mode: number): boolean {
    if (!this.current) return false;
    if (this.setHandlePosition(this.current, x, y, mode)) return true;
    this.current = null;
    return false;
  }

  /**
   * ドラッグを終了 / End dragging
   * 
   * @returns ドラッグ中だったか / Whether was dragging
   */
  end(): boolean {
    const wasDragging = this.current !== null;
    this.current = null;
    return wasDragging;
  }

  /**
   * 指定位置にハンドルがあるかを検索 / Find handle at specified position
   * 
   * @param x - X座標 / X coordinate
   * @param y - Y座標 / Y coordinate
   * @returns ハンドル選択情報（見つからない場合null） / Handle selection (null if not found)
   */
  private findHandleAt(x: number, y: number): HandleSelection | null {
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

  /**
   * 指定された選択情報のハンドル位置を更新 / Update handle position for the given selection
   * 
   * ベジェ曲線の滑らかさを保つため、以下の処理を行います：
   * To maintain Bézier curve smoothness:
   * - 端点を移動すると、接続されたハンドルも移動
   * - When moving endpoints, connected handles also move
   * - 特定モードで中間ハンドルを移動すると、反対側も連動
   * - In certain modes, moving intermediate handles affects opposite side
   * 
   * @param selection - ハンドル選択情報 / Handle selection
   * @param x - 新しいX座標 / New X coordinate
   * @param y - 新しいY座標 / New Y coordinate
   * @param mode - ドラッグモード / Drag mode
   * @returns 更新が成功したか / Whether update was successful
   */
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
      if (!vec) return;
      vec.add(dx, dy);
    };

    if (selection.pointIndex === 0) {
      translate(curve?.[1]);
      const prevCurve = path?.curves[selection.curveIndex - 1];
      translate(prevCurve?.[2]);
      prevCurve?.[3]?.set(x, y);
    } else if (selection.pointIndex === 3) {
      translate(curve?.[2]);
      const nextCurve = path?.curves[selection.curveIndex + 1];
      translate(nextCurve?.[1]);
      nextCurve?.[0]?.set(x, y);
    } else if (mode === 0 && selection.pointIndex === 1) {
      const anchor = curve?.[0];
      const prevCurve = path?.curves[selection.curveIndex - 1];
      const oppositeHandle = prevCurve?.[2];
      if (anchor && oppositeHandle) {
        const toCurrent = handle.copy().sub(anchor);
        if (toCurrent.magSq() > 0) {
          const currentDir = toCurrent.copy().mult(-1).normalize();
          const oppositeLength = oppositeHandle.copy().sub(anchor).mag();
          const target = currentDir.mult(oppositeLength);
          oppositeHandle.set(anchor.x + target.x, anchor.y + target.y);
        }
      }
    } else if (mode === 1 && selection.pointIndex === 2) {
      const anchor = curve?.[3];
      const nextCurve = path?.curves[selection.curveIndex + 1];
      const oppositeHandle = nextCurve?.[1];
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
