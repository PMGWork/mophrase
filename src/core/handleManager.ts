import { CURVE_POINT } from '../constants';
import type {
  HandleSelection,
  MarqueeRect,
  SelectionRange,
  Sketch,
} from '../types';

type Point = { x: number; y: number };

// 定数
const HANDLE_RADIUS = 12;

// ハンドルの制御クラス
export class HandleManager {
  private draggedHandle: HandleSelection | null = null; // ドラッグ中のハンドル
  private selectedHandles: HandleSelection[] = []; // 選択中のハンドル

  private getPaths: () => Pick<Sketch, 'curves'>[]; // パスの取得関数
  private pixelToNorm: (x: number, y: number) => Point; // ピクセル座標を正規化座標に変換
  private normToPixel: (x: number, y: number) => Point; // 正規化座標をピクセル座標に変換

  // コンストラクタ
  constructor(
    getPaths: () => Pick<Sketch, 'curves'>[],
    pixelToNorm: (x: number, y: number) => Point = (x, y) => ({ x, y }),
    normToPixel: (x: number, y: number) => Point = (x, y) => ({ x, y }),
  ) {
    this.getPaths = getPaths;
    this.pixelToNorm = pixelToNorm;
    this.normToPixel = normToPixel;
  }

  // #region ドラッグ操作

  // ドラッグを開始
  startDrag(x: number, y: number, shift: boolean = false): void {
    const handle = this.hitTest(x, y);

    // カーソルの位置にハンドルがない場合
    if (!handle) {
      this.draggedHandle = null;
      return;
    }

    // Shift+クリックの場合は選択をトグル
    if (shift) {
      if (this.isSelected(handle)) {
        // 既に選択されている場合は選択解除
        this.selectedHandles = this.selectedHandles.filter(
          (h) =>
            h.pathIndex !== handle.pathIndex ||
            h.curveIndex !== handle.curveIndex ||
            h.pointIndex !== handle.pointIndex,
        );
      } else {
        // 選択されていない場合は追加
        this.selectedHandles.push(handle);
      }
    } else {
      // 通常クリック: 選択されていなければ置き換え
      if (!this.isSelected(handle)) this.selectedHandles = [handle];
    }

    // ハンドルをドラッグ開始
    this.draggedHandle = handle;
  }

  // ドラッグを終了
  endDrag(): void {
    if (!this.draggedHandle) return;
    this.draggedHandle = null;
  }

  // ドラッグ中の位置更新
  updateDrag(x: number, y: number, mode: number): void {
    if (!this.draggedHandle) return;
    const localPos = this.pixelToNorm(x, y);

    // ハンドルをドラッグ
    this.applyDrag(this.draggedHandle, localPos.x, localPos.y, mode);
  }

  // #region 選択管理

  // ドラッグ中かどうか
  isDragging(): boolean {
    return !!this.draggedHandle;
  }

  // ハンドルが選択されているか
  isSelected(target: HandleSelection): boolean {
    return this.selectedHandles.some(
      (h) =>
        h.pathIndex === target.pathIndex &&
        h.curveIndex === target.curveIndex &&
        h.pointIndex === target.pointIndex,
    );
  }

  // 選択をクリア
  clearSelection(): void {
    this.selectedHandles = [];
  }

  // 矩形内のアンカーポイントを選択
  selectAnchorsInRect(
    rect: MarqueeRect,
    targetPathIndex?: number,
  ): HandleSelection[] {
    // 選択をクリア
    this.clearSelection();

    // 矩形の範囲を取得
    const paths = this.getPaths();
    const { startX, startY, endX, endY } = rect;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    // 矩形内のアンカーポイントを選択して、選択範囲を更新
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      // 対象のパスが指定されている場合は、それ以外のパスをスキップ
      if (targetPathIndex !== undefined && pathIndex !== targetPathIndex)
        continue;

      const path = paths[pathIndex];
      for (let curveIndex = 0; curveIndex < path.curves.length; curveIndex++) {
        const curve = path.curves[curveIndex];
        const anchorIndices = [
          CURVE_POINT.START_ANCHOR_POINT,
          CURVE_POINT.END_ANCHOR_POINT,
        ];

        for (const pointIndex of anchorIndices) {
          const point = curve[pointIndex];
          if (!point) continue;

          // ピクセル座標に変換し、矩形内に含まれているかを確認して選択リストへ追加
          const pos = this.normToPixel(point.x, point.y);
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

    const pathIndex = this.selectedHandles[0].pathIndex;
    if (this.selectedHandles.some((h) => h.pathIndex !== pathIndex))
      return null;

    const path = this.getPaths()[pathIndex];
    const curveCount = path?.curves?.length ?? 0;
    if (curveCount === 0) return null;

    const anchorIndices = new Set<number>();
    for (const h of this.selectedHandles) {
      if (!this.isAnchorPoint(h.pointIndex)) continue;
      const anchorIndex =
        h.curveIndex +
        (h.pointIndex === CURVE_POINT.END_ANCHOR_POINT ? 1 : 0);
      anchorIndices.add(anchorIndex);
    }

    if (anchorIndices.size >= 2) {
      const anchorList = Array.from(anchorIndices);
      const minAnchor = Math.min(...anchorList);
      const maxAnchor = Math.max(...anchorList);
      const startCurveIndex = Math.max(0, Math.min(curveCount - 1, minAnchor));
      const endCurveIndex = Math.max(
        0,
        Math.min(curveCount - 1, maxAnchor - 1),
      );
      if (startCurveIndex > endCurveIndex) return null;
      return { pathIndex, startCurveIndex, endCurveIndex };
    }

    if (anchorIndices.size === 1) {
      const anchorIndex = anchorIndices.values().next().value as number;
      const startCurveIndex = Math.max(0, anchorIndex - 1);
      const endCurveIndex = Math.min(curveCount - 1, anchorIndex);
      if (startCurveIndex > endCurveIndex) return null;
      return { pathIndex, startCurveIndex, endCurveIndex };
    }

    let minIdx = Infinity;
    let maxIdx = -Infinity;
    for (const h of this.selectedHandles) {
      minIdx = Math.min(minIdx, h.curveIndex);
      maxIdx = Math.max(maxIdx, h.curveIndex);
    }

    minIdx = Math.max(0, minIdx);
    maxIdx = Math.min(curveCount - 1, maxIdx);
    if (minIdx > maxIdx) return null;

    return { pathIndex, startCurveIndex: minIdx, endCurveIndex: maxIdx };
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
          const { x: px, y: py } = this.normToPixel(point.x, point.y);
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
  ): void {
    const path = this.getPaths()[dragged.pathIndex];
    if (!path) return;
    const curve = path.curves[dragged.curveIndex];
    const draggedPoint = curve?.[dragged.pointIndex];
    if (!draggedPoint) return;

    // 新しい位置との差分
    const dx = targetX - draggedPoint.x;
    const dy = targetY - draggedPoint.y;

    // 複数選択されている場合、選択されている全てのアンカーポイントを移動
    if (this.selectedHandles.length > 1 && this.isSelected(dragged)) {
      this.applyMultiDrag(dx, dy, mode);
      return;
    }

    // 単体選択されている場合
    this.applySingleDrag(dragged, dx, dy, mode);
  }

  // 複数選択時のドラッグ処理
  private applyMultiDrag(dx: number, dy: number, mode: number): void {
    const paths = this.getPaths();
    const targets = new Map<string, HandleSelection>();

    // 移動対象にハンドルを追加するヘルパー関数
    const addTarget = (selection: HandleSelection): void => {
      const curve = paths[selection.pathIndex]?.curves?.[selection.curveIndex];
      const handle = curve?.[selection.pointIndex];
      if (!handle) return;

      const key = `${selection.pathIndex}:${selection.curveIndex}:${selection.pointIndex}`;
      if (!targets.has(key)) targets.set(key, selection);
    };

    // 選択されているハンドルとその関連ポイントを収集
    for (const selection of this.selectedHandles) {
      // 選択されているハンドル自体を追加
      addTarget(selection);

      // アンカーポイント以外（制御点のみ選択）の場合はスキップ
      if (!this.isAnchorPoint(selection.pointIndex)) continue;

      // アンカーポイントの場合、関連する制御点と隣接カーブのポイントも移動対象に含める
      const isStart = selection.pointIndex === CURVE_POINT.START_ANCHOR_POINT;

      // 自身のカーブの制御点インデックス
      const selfControlIdx = isStart
        ? CURVE_POINT.START_CONTROL_POINT
        : CURVE_POINT.END_CONTROL_POINT;

      // 隣接カーブの制御点インデックス
      const adjControlIdx = isStart
        ? CURVE_POINT.END_CONTROL_POINT
        : CURVE_POINT.START_CONTROL_POINT;

      // 隣接カーブのアンカーポイントインデックス
      const adjAnchorIdx = isStart
        ? CURVE_POINT.END_ANCHOR_POINT
        : CURVE_POINT.START_ANCHOR_POINT;

      // 隣接カーブのインデックス（開始点なら前のカーブ、終了点なら次のカーブ）
      const adjCurveIdx = selection.curveIndex + (isStart ? -1 : 1);

      // 自身のカーブの制御点を追加
      addTarget({
        pathIndex: selection.pathIndex,
        curveIndex: selection.curveIndex,
        pointIndex: selfControlIdx,
      });

      // 隣接カーブが存在する場合、その制御点とアンカーポイントも追加
      const path = paths[selection.pathIndex];
      if (!path) continue;
      if (adjCurveIdx < 0 || adjCurveIdx >= path.curves.length) continue;

      // 隣接カーブの制御点を追加
      addTarget({
        pathIndex: selection.pathIndex,
        curveIndex: adjCurveIdx,
        pointIndex: adjControlIdx,
      });

      // 隣接カーブのアンカーポイントを追加
      addTarget({
        pathIndex: selection.pathIndex,
        curveIndex: adjCurveIdx,
        pointIndex: adjAnchorIdx,
      });
    }

    // 収集したすべてのハンドルを移動
    for (const selection of targets.values()) {
      const curve = paths[selection.pathIndex]?.curves?.[selection.curveIndex];
      const handle = curve?.[selection.pointIndex];
      if (!handle) continue;
      handle.add(dx, dy);
    }

    // mode === 0（通常モード）の場合、制御点の反対側をミラーリング
    if (mode === 0) {
      for (const selection of this.selectedHandles) {
        // アンカーポイントはスキップ（制御点のみ処理）
        if (this.isAnchorPoint(selection.pointIndex)) continue;
        const path = this.getPaths()[selection.pathIndex];
        if (!path) continue;

        // 選択された制御点の反対側の制御点を対称に移動
        this.mirrorOppositeControl(
          path,
          selection.curveIndex,
          selection.pointIndex,
        );
      }
    }
  }

  // アンカーかどうか
  private isAnchorPoint(pointIndex: number): boolean {
    return (
      pointIndex === CURVE_POINT.START_ANCHOR_POINT ||
      pointIndex === CURVE_POINT.END_ANCHOR_POINT
    );
  }

  // 単一選択のドラッグ処理
  private applySingleDrag(
    selection: HandleSelection,
    dx: number,
    dy: number,
    mode: number,
  ): void {
    const path = this.getPaths()[selection.pathIndex];
    if (!path) return;

    const curve = path.curves[selection.curveIndex];
    const handle = curve?.[selection.pointIndex];
    if (!handle) return;

    // 新しい位置を計算して適用
    const finalX = handle.x + dx;
    const finalY = handle.y + dy;
    handle.set(finalX, finalY);

    // アンカーポイントの場合は隣接カーブも連動
    if (this.isAnchorPoint(selection.pointIndex)) {
      this.syncAdjacentCurve(
        path,
        selection.curveIndex,
        selection.pointIndex,
        { x: finalX, y: finalY },
        { x: dx, y: dy },
      );
    } else if (mode === 0) {
      this.mirrorOppositeControl(
        path,
        selection.curveIndex,
        selection.pointIndex,
      );
    }
  }

  // #region プライベート - 隣接カーブ連動

  // アンカー移動時に隣接カーブの制御点・アンカーを同期
  private syncAdjacentCurve(
    path: Pick<Sketch, 'curves'>,
    curveIndex: number,
    pointIndex: number,
    position: Point,
    delta: Point,
  ): void {
    const curve = path.curves[curveIndex];
    const isStart = pointIndex === CURVE_POINT.START_ANCHOR_POINT;

    // インデックスの事前計算
    const selfControlIdx = isStart
      ? CURVE_POINT.START_CONTROL_POINT
      : CURVE_POINT.END_CONTROL_POINT;
    const adjControlIdx = isStart
      ? CURVE_POINT.END_CONTROL_POINT
      : CURVE_POINT.START_CONTROL_POINT;
    const adjAnchorIdx = isStart
      ? CURVE_POINT.END_ANCHOR_POINT
      : CURVE_POINT.START_ANCHOR_POINT;
    const adjCurveIdx = curveIndex + (isStart ? -1 : 1);

    // 自身の制御点を移動
    curve?.[selfControlIdx]?.add(delta.x, delta.y);

    // 接続されているカーブのハンドルを移動
    const adjacentCurve = path.curves[adjCurveIdx];
    if (!adjacentCurve) return;

    adjacentCurve[adjControlIdx]?.add(delta.x, delta.y);
    adjacentCurve[adjAnchorIdx]?.set(position.x, position.y);
  }

  // 制御ハンドル移動時に反対側のハンドルを対称に調整
  private mirrorOppositeControl(
    path: Pick<Sketch, 'curves'>,
    curveIndex: number,
    pointIndex: number,
  ): void {
    const curve = path.curves[curveIndex];
    const isStartHandle = pointIndex === CURVE_POINT.START_CONTROL_POINT;

    // インデックスの事前計算
    const anchorIdx = isStartHandle
      ? CURVE_POINT.START_ANCHOR_POINT
      : CURVE_POINT.END_ANCHOR_POINT;
    const oppControlIdx = isStartHandle
      ? CURVE_POINT.END_CONTROL_POINT
      : CURVE_POINT.START_CONTROL_POINT;
    const adjCurveIdx = curveIndex + (isStartHandle ? -1 : 1);

    const anchorPoint = curve?.[anchorIdx];
    const currentHandle = curve?.[pointIndex];
    const oppositeHandle = path.curves[adjCurveIdx]?.[oppControlIdx];

    if (!anchorPoint || !oppositeHandle || !currentHandle) return;

    // アンカーポイントと現在のハンドルのベクトルを計算
    const toCurrent = currentHandle.copy().sub(anchorPoint);
    if (toCurrent.magSq() > 0) {
      const oppositeLength = oppositeHandle.copy().sub(anchorPoint).mag();
      const targetDir = toCurrent.normalize().mult(-oppositeLength);
      oppositeHandle.set(
        anchorPoint.x + targetDir.x,
        anchorPoint.y + targetDir.y,
      );
    }
  }
}
