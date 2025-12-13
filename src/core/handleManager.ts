import { CURVE_POINT } from '../constants';
import type {
  HandleSelection,
  MarqueeRect,
  Path,
  SelectionRange,
  Vector,
} from '../types';

type Point = { x: number; y: number };
type XYTransform = (x: number, y: number) => Point;

// 定数
const HANDLE_RADIUS = 12;

// ハンドルの制御クラス
export class HandleManager {
  private draggedHandle: HandleSelection | null = null;
  private selectedHandles: HandleSelection[] = [];

  private selectedKeyCache: Set<string> | null = null;

  private getPaths: () => Pick<Path, 'curves'>[];
  private pixelToNormalized: XYTransform;
  private normalizedToPixel: XYTransform;

  constructor(
    getPaths: () => Pick<Path, 'curves'>[],
    pixelToNormalized: XYTransform = (x, y) => ({ x, y }),
    normalizedToPixel: XYTransform = (x, y) => ({ x, y }),
  ) {
    this.getPaths = getPaths;
    this.pixelToNormalized = pixelToNormalized;
    this.normalizedToPixel = normalizedToPixel;
  }

  // #region ドラッグ操作

  // ドラッグを開始
  startDrag(
    x: number,
    y: number,
    options?: {
      toggleSelection?: boolean;
    },
  ): boolean {
    const handle = this.hitTest(x, y);
    if (!handle) {
      this.draggedHandle = null;
      return false;
    }

    if (options?.toggleSelection) {
      if (this.isSelected(handle)) {
        const key = this.keyOf(handle);
        this.selectedHandles = this.selectedHandles.filter(
          (h) => this.keyOf(h) !== key,
        );
        this.selectedKeyCache = null;
        this.draggedHandle = null;
        return true;
      }

      this.selectedHandles.push(handle);
      this.selectedKeyCache = null;
      this.draggedHandle = handle;
      return true;
    }

    if (!this.isSelected(handle)) {
      this.selectedHandles = [handle];
      this.selectedKeyCache = null;
    }

    this.draggedHandle = handle;
    return true;
  }

  // ドラッグを終了
  endDrag(): boolean {
    if (!this.draggedHandle) return false;
    this.draggedHandle = null;
    return true;
  }

  // ドラッグ中の位置更新
  updateDrag(x: number, y: number, mode: number): boolean {
    if (!this.draggedHandle) return false;
    const localPos = this.pixelToNormalized(x, y);

    const moved = this.applyDrag(
      this.draggedHandle,
      localPos.x,
      localPos.y,
      mode,
    );
    if (moved) return true;

    // ハンドルの位置を更新できなかった場合
    this.draggedHandle = null;
    return false;
  }

  // #region 選択管理

  // 選択されたハンドルを取得
  getSelectedHandles(): HandleSelection[] {
    return this.selectedHandles;
  }

  // ハンドルが選択されているか
  isSelected(handle: HandleSelection): boolean {
    return this.getSelectedKeys().has(this.keyOf(handle));
  }

  // 選択中アンカーに紐づくハンドルも含めて「アクティブ」扱いにする
  isActive(handle: HandleSelection): boolean {
    const keys = this.getSelectedKeys();
    const { pathIndex, curveIndex, pointIndex } = handle;
    const isSel = (ci: number, pi: number) =>
      keys.has(this.keyOf({ pathIndex, curveIndex: ci, pointIndex: pi }));

    if (isSel(curveIndex, pointIndex)) return true;

    switch (pointIndex) {
      case CURVE_POINT.START_CONTROL:
        return (
          isSel(curveIndex, CURVE_POINT.START_ANCHOR) ||
          isSel(curveIndex - 1, CURVE_POINT.END_ANCHOR)
        );
      case CURVE_POINT.END_CONTROL:
        return (
          isSel(curveIndex, CURVE_POINT.END_ANCHOR) ||
          isSel(curveIndex + 1, CURVE_POINT.START_ANCHOR)
        );
      case CURVE_POINT.START_ANCHOR:
        return isSel(curveIndex - 1, CURVE_POINT.END_ANCHOR);
      case CURVE_POINT.END_ANCHOR:
        return isSel(curveIndex + 1, CURVE_POINT.START_ANCHOR);
      default:
        return false;
    }
  }

  // 選択をクリア
  clearSelection(): void {
    this.selectedHandles = [];
    this.selectedKeyCache = null;
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

  // 選択範囲を取得（連続するカーブの範囲）
  getSelectionRange(): SelectionRange | null {
    if (this.selectedHandles.length === 0) return null;

    // パスインデックスごとにグループ化
    const handles = this.selectedHandles;
    const pathIndex = handles[0].pathIndex;

    // 全て同じパスか確認
    if (handles.some((h) => h.pathIndex !== pathIndex)) return null;

    const path = this.getPaths()[pathIndex];
    const curveCount = path?.curves?.length ?? 0;
    if (curveCount === 0) return null;

    // アンカー選択時は隣接セグメントも影響を受けるため、範囲に含める
    const indices = new Set<number>();

    for (const h of handles) {
      indices.add(h.curveIndex);

      if (h.pointIndex === CURVE_POINT.START_ANCHOR) {
        indices.add(h.curveIndex - 1);
      } else if (h.pointIndex === CURVE_POINT.END_ANCHOR) {
        indices.add(h.curveIndex + 1);
      }
    }

    const sorted = [...indices]
      .filter((i) => i >= 0 && i < curveCount)
      .sort((a, b) => a - b);

    if (sorted.length === 0) return null;

    const startCurveIndex = sorted[0]!;
    const endCurveIndex = sorted[sorted.length - 1]!;

    return {
      pathIndex,
      startCurveIndex,
      endCurveIndex,
    };
  }

  // #region プライベート - 選択キー管理

  // ハンドルのキーを生成
  private keyOf(handle: HandleSelection): string {
    return `${handle.pathIndex}/${handle.curveIndex}/${handle.pointIndex}`;
  }

  // 選択中ハンドルのキーセットを取得
  private getSelectedKeys(): Set<string> {
    if (this.selectedKeyCache) return this.selectedKeyCache;
    this.selectedKeyCache = new Set(
      this.selectedHandles.map((h) => this.keyOf(h)),
    );
    return this.selectedKeyCache;
  }

  // #region プライベート - ハンドル検索

  // 指定位置にハンドルがあるかを検索
  private hitTest(x: number, y: number): HandleSelection | null {
    const paths = this.getPaths();
    for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
      const path = paths[pathIndex];
      for (
        let curveIndex = path.curves.length - 1;
        curveIndex >= 0;
        curveIndex--
      ) {
        const curve = path.curves[curveIndex];
        for (let pointIndex = 0; pointIndex < curve.length; pointIndex++) {
          const point = curve[pointIndex];
          if (!point) continue;

          // ピクセル座標に変換して距離をチェック
          const { x: px, y: py } = this.normalizedToPixel(point.x, point.y);
          const dx = px - x;
          const dy = py - y;
          if (dx * dx + dy * dy <= HANDLE_RADIUS * HANDLE_RADIUS) {
            return { pathIndex, curveIndex, pointIndex };
          }
        }
      }
    }
    return null;
  }

  // #region プライベート - 移動処理

  // ドラッグによるハンドル移動を適用
  private applyDrag(
    dragged: HandleSelection,
    targetX: number,
    targetY: number,
    mode: number,
  ): boolean {
    const path = this.getPaths()[dragged.pathIndex];
    if (!path) return false;
    const curve = path.curves[dragged.curveIndex];
    const draggedPoint = curve?.[dragged.pointIndex];
    if (!draggedPoint) return false;

    const dx = targetX - draggedPoint.x;
    const dy = targetY - draggedPoint.y;

    // マルチ選択中に選択済みハンドルをドラッグした場合は、選択点をまとめて平行移動
    if (this.selectedHandles.length > 1 && this.isSelected(dragged)) {
      const points = this.gatherMovablePoints(this.selectedHandles);
      for (const pt of points) pt.add(dx, dy);
      return true;
    }

    // 単体ドラッグは従来ロジック（アンカー更新 / 反対ハンドル調整など）を適用
    return this.moveHandle(dragged, targetX, targetY, mode);
  }

  // 選択中のハンドルに関連する移動対象ポイントを収集
  private gatherMovablePoints(selections: HandleSelection[]): Set<Vector> {
    const targets = new Set<Vector>();
    const paths = this.getPaths();

    const addTarget = (v: Vector | undefined | null): void => {
      if (v) targets.add(v);
    };

    for (const sel of selections) {
      const path = paths[sel.pathIndex];
      const curve = path?.curves?.[sel.curveIndex];
      if (!curve) continue;

      const isStartAnchor = sel.pointIndex === CURVE_POINT.START_ANCHOR;
      const isEndAnchor = sel.pointIndex === CURVE_POINT.END_ANCHOR;

      if (isStartAnchor) {
        addTarget(curve[CURVE_POINT.START_ANCHOR]);
        addTarget(curve[CURVE_POINT.START_CONTROL]);

        const prevCurve = path.curves[sel.curveIndex - 1];
        if (prevCurve) {
          addTarget(prevCurve[CURVE_POINT.END_ANCHOR]);
          addTarget(prevCurve[CURVE_POINT.END_CONTROL]);
        }
        continue;
      }

      if (isEndAnchor) {
        addTarget(curve[CURVE_POINT.END_ANCHOR]);
        addTarget(curve[CURVE_POINT.END_CONTROL]);

        const nextCurve = path.curves[sel.curveIndex + 1];
        if (nextCurve) {
          addTarget(nextCurve[CURVE_POINT.START_ANCHOR]);
          addTarget(nextCurve[CURVE_POINT.START_CONTROL]);
        }
        continue;
      }

      addTarget(curve[sel.pointIndex]);
    }

    return targets;
  }

  // 単一ハンドルの位置を更新
  private moveHandle(
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
      this.syncAdjacentCurve(
        path,
        selection.curveIndex,
        selection.pointIndex,
        { x, y },
        { x: dx, y: dy },
      );
    } else if (mode === 0) {
      // 反対側のハンドルを調整して直線を維持
      this.mirrorOppositeControl(
        path,
        selection.curveIndex,
        selection.pointIndex,
      );
    }

    return true;
  }

  // #region プライベート - 隣接カーブ連動

  // アンカー移動時に隣接カーブの制御点・アンカーを同期
  private syncAdjacentCurve(
    path: Pick<Path, 'curves'>,
    curveIndex: number,
    pointIndex: number,
    position: Point,
    delta: Point,
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

  // 制御ハンドル移動時に反対側のハンドルを対称に調整
  private mirrorOppositeControl(
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
