import { CURVE_POINT } from '../constants';
import type { HandleSelection, MarqueeRect, Path, SelectionRange, Vector } from '../types';

// 定数
const HANDLE_RADIUS = 12;

// ハンドルの制御クラス
export class HandleManager {
  private draggedHandle: HandleSelection | null = null;
  private selectedHandles: HandleSelection[] = [];

  private getPaths: () => Pick<Path, 'curves'>[];
  private pixelToNormalized: (x: number, y: number) => { x: number; y: number };
  private normalizedToPixel: (x: number, y: number) => { x: number; y: number };

  constructor(
    getPaths: () => Pick<Path, 'curves'>[],
    pixelToNormalized: (
      x: number,
      y: number,
    ) => {
      x: number;
      y: number;
    } = (x, y) => ({ x, y }),
    normalizedToPixel: (
      x: number,
      y: number,
    ) => {
      x: number;
      y: number;
    } = (x, y) => ({ x, y }),
  ) {
    this.getPaths = getPaths;
    this.pixelToNormalized = pixelToNormalized;
    this.normalizedToPixel = normalizedToPixel;
  }

  // #region メイン関数

  // ドラッグを開始
  start(x: number, y: number): boolean {
    const handle = this.findHandle(x, y);

    // 選択されていないハンドルをクリックした場合は、選択をリセットしてそのハンドルを選択
    if (handle && !this.isSelected(handle)) {
      this.clearSelection();
      this.selectedHandles.push(handle);
    }

    this.draggedHandle = handle;
    return this.draggedHandle !== null;
  }

  // ドラッグを終了
  stop(): boolean {
    if (!this.draggedHandle) return false;
    this.draggedHandle = null;
    return true;
  }

  // ドラッグ中の位置更新
  drag(x: number, y: number, mode: number): boolean {
    if (!this.draggedHandle) return false;
    const localPos = this.pixelToNormalized(x, y);

    // ハンドルの位置を更新
    if (this.setHandlePos(this.draggedHandle, localPos.x, localPos.y, mode))
      return true;

    // ハンドルの位置を更新できなかった場合
    this.draggedHandle = null;
    return false;
  }

  // 選択されたハンドルを取得
  getSelectedHandles(): HandleSelection[] {
    return this.selectedHandles;
  }

  // 選択範囲を取得（連続するカーブの範囲）
  getSelectionRange(): SelectionRange | null {
    if (this.selectedHandles.length === 0) return null;

    // パスインデックスごとにグループ化
    const handles = this.selectedHandles;
    const pathIndex = handles[0].pathIndex;

    // 全て同じパスか確認
    if (handles.some(h => h.pathIndex !== pathIndex)) return null;

    // 最も若いカーブインデックスと最も古いカーブインデックスを取得
    let minCurveIndex = Number.MAX_VALUE;
    let maxCurveIndex = Number.MIN_VALUE;

    handles.forEach((h) => {
      minCurveIndex = Math.min(minCurveIndex, h.curveIndex);
      maxCurveIndex = Math.max(maxCurveIndex, h.curveIndex);
    });

    // 範囲の端における選択内容の確認
    // 最小カーブで、終点以外(0,1,2)が選ばれているか
    const hasStartContent = handles.some(
      (h) => h.curveIndex === minCurveIndex && h.pointIndex !== CURVE_POINT.END_ANCHOR
    );
    const startCurveIndex = hasStartContent ? minCurveIndex : minCurveIndex + 1;

    // 最大カーブで、始点以外(1,2,3)が選ばれているか
    const hasEndContent = handles.some(
      (h) => h.curveIndex === maxCurveIndex && h.pointIndex !== CURVE_POINT.START_ANCHOR
    );
    const endCurveIndex = hasEndContent ? maxCurveIndex : maxCurveIndex - 1;

    // 有効な範囲がない場合
    if (startCurveIndex > endCurveIndex) return null;

    return {
      pathIndex,
      startCurveIndex,
      endCurveIndex,
    };
  }

  // 選択をクリア
  clearSelection(): void {
    this.selectedHandles = [];
  }

  // 矩形内のハンドルを選択
  selectInRect(rect: MarqueeRect): HandleSelection[] {
    this.clearSelection();

    const paths = this.getPaths();
    const { startX, startY, endX, endY } = rect;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      const path = paths[pathIndex];
      for (let curveIndex = 0; curveIndex < path.curves.length; curveIndex++) {
        const curve = path.curves[curveIndex];
        for (let pointIndex = 0; pointIndex < curve.length; pointIndex++) {
          const point = curve[pointIndex];
          if (!point) continue;

          // ピクセル座標に変換
          const pos = this.normalizedToPixel(point.x, point.y);
          if (
            pos.x >= minX &&
            pos.x <= maxX &&
            pos.y >= minY &&
            pos.y <= maxY
          ) {
            this.selectedHandles.push({ pathIndex, curveIndex, pointIndex });
          }
        }
      }
    }

    return this.selectedHandles;
  }

  // ハンドルが選択されているか
  isSelected(handle: HandleSelection): boolean {
    return this.selectedHandles.some(
      h =>
        h.pathIndex === handle.pathIndex &&
        h.curveIndex === handle.curveIndex &&
        h.pointIndex === handle.pointIndex,
    );
  }

  // #region プライベート関数

  // 指定位置にハンドルがあるかを検索
  private findHandle(x: number, y: number): HandleSelection | null {
    const paths = this.getPaths();
    for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
      const result = this.findHandleInPath(paths[pathIndex], pathIndex, x, y);
      if (result) return result;
    }
    return null;
  }

  // パス内のハンドルを検索
  private findHandleInPath(
    path: Pick<Path, 'curves'>,
    pathIndex: number,
    x: number,
    y: number,
  ): HandleSelection | null {
    for (
      let curveIndex = path.curves.length - 1;
      curveIndex >= 0;
      curveIndex--
    ) {
      const curve = path.curves[curveIndex];
      for (let pointIndex = 0; pointIndex < curve.length; pointIndex++) {
        const point = curve[pointIndex];
        if (point && this.isNearHandle(point, x, y)) {
          return { pathIndex, curveIndex, pointIndex };
        }
      }
    }
    return null;
  }

  // ポイントがマウス位置の近くにあるか
  private isNearHandle(point: Vector, mouseX: number, mouseY: number): boolean {
    let px = point.x;
    let py = point.y;

    // 座標変換がある場合はピクセル座標に変換
    const pixelPos = this.normalizedToPixel(px, py);
    px = pixelPos.x;
    py = pixelPos.y;

    // マウス位置との距離を計算
    const dx = px - mouseX;
    const dy = py - mouseY;
    return dx * dx + dy * dy <= HANDLE_RADIUS * HANDLE_RADIUS;
  }

  // ハンドルの位置を更新
  private setHandlePos(
    selection: HandleSelection,
    x: number,
    y: number,
    mode: number,
  ): boolean {
    const path = this.getPaths()[selection.pathIndex];
    if (!path) return false;

    const curve = path.curves[selection.curveIndex];
    const handle = curve?.[selection.pointIndex];
    if (!handle) return false;

    const dx = x - handle.x;
    const dy = y - handle.y;
    handle.set(x, y);

    // アンカーポイントとその周辺のハンドルの位置を更新
    const isAnchor =
      selection.pointIndex === CURVE_POINT.START_ANCHOR ||
      selection.pointIndex === CURVE_POINT.END_ANCHOR;
    if (isAnchor) {
      this.updateAnchor(
        path,
        selection.curveIndex,
        selection.pointIndex,
        { x, y },
        { x: dx, y: dy },
      );
    } else if (mode === 0) {
      // 反対側のハンドルを調整して直線を維持
      this.alignOppositeHandle(
        path,
        selection.curveIndex,
        selection.pointIndex,
      );
    }

    return true;
  }

  // アンカーポイントとその周辺のハンドルの位置を更新
  private updateAnchor(
    path: Pick<Path, 'curves'>,
    curveIndex: number,
    pointIndex: number,
    position: { x: number; y: number },
    delta: { x: number; y: number },
  ): void {
    const curve = path.curves[curveIndex];
    const isStart = pointIndex === CURVE_POINT.START_ANCHOR;

    // 自身の制御点を移動
    const controlPoint =
      curve?.[isStart ? CURVE_POINT.START_CONTROL : CURVE_POINT.END_CONTROL];
    controlPoint?.add(delta.x, delta.y);

    // 接続されているカーブのハンドルを移動
    const adjacentCurveIndex = curveIndex + (isStart ? -1 : 1);
    const adjacentCurve = path.curves[adjacentCurveIndex];
    if (!adjacentCurve) return;

    const adjacentControl =
      adjacentCurve[
        isStart ? CURVE_POINT.END_CONTROL : CURVE_POINT.START_CONTROL
      ];

    const adjacentAnchor =
      adjacentCurve[
        isStart ? CURVE_POINT.END_ANCHOR : CURVE_POINT.START_ANCHOR
      ];

    adjacentControl?.add(delta.x, delta.y);
    adjacentAnchor?.set(position.x, position.y);
  }

  // 反対側のハンドルを調整して直線を維持
  private alignOppositeHandle(
    path: Pick<Path, 'curves'>,
    curveIndex: number,
    pointIndex: number,
  ): void {
    const curve = path.curves[curveIndex];
    const isStartHandle = pointIndex === CURVE_POINT.START_CONTROL;

    // アンカーポイントと接続されたカーブを取得
    const anchor =
      curve?.[
        isStartHandle ? CURVE_POINT.START_ANCHOR : CURVE_POINT.END_ANCHOR
      ];
    const adjacentCurveIndex = curveIndex + (isStartHandle ? -1 : 1);
    const adjacentCurve = path.curves[adjacentCurveIndex];

    // 反対側のハンドルを取得
    const oppositeHandle =
      adjacentCurve?.[
        isStartHandle ? CURVE_POINT.END_CONTROL : CURVE_POINT.START_CONTROL
      ];
    const currentHandle = curve?.[pointIndex];

    // ハンドルが存在しない場合は何もしない
    if (!anchor || !oppositeHandle || !currentHandle) return;

    // アンカーポイントと現在のハンドルのベクトルを計算
    const toCurrent = currentHandle.copy().sub(anchor);
    if (toCurrent.magSq() > 0) {
      const currentDir = toCurrent.copy().mult(-1).normalize();
      const oppositeLength = oppositeHandle.copy().sub(anchor).mag();
      const target = currentDir.mult(oppositeLength);
      oppositeHandle.set(anchor.x + target.x, anchor.y + target.y);
    }
  }
}
