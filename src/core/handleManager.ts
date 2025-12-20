import type {
  HandleSelection,
  MarqueeRect,
  SelectionRange,
  HandleType,
  Path,
  Vector,
} from '../types';
import { buildSketchCurves } from '../utils/keyframes';
import { applyModifiers } from '../utils/modifier';

type Point = { x: number; y: number };
type CurveHandleInfo = { curveIndex: number; pointIndex: number };

// 定数
const HANDLE_RADIUS = 12;

// ハンドルの制御クラス
export class HandleManager {
  private draggedHandle: HandleSelection | null = null; // ドラッグ中のハンドル
  private selectedHandles: HandleSelection[] = []; // 選択中のハンドル

  private getPaths: () => Pick<Path, 'keyframes' | 'modifiers'>[]; // パスの取得関数
  private pixelToNorm: (x: number, y: number) => Point; // ピクセル座標を正規化座標に変換
  private normToPixel: (x: number, y: number) => Point; // 正規化座標をピクセル座標に変換

  // コンストラクタ
  constructor(
    getPaths: () => Pick<Path, 'keyframes' | 'modifiers'>[],
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
            h.keyframeIndex !== handle.keyframeIndex ||
            h.handleType !== handle.handleType,
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
        h.keyframeIndex === target.keyframeIndex &&
        h.handleType === target.handleType,
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
      const { effective } = this.getCurves(path);
      for (
        let keyframeIndex = 0;
        keyframeIndex < path.keyframes.length;
        keyframeIndex++
      ) {
        const selection: HandleSelection = {
          pathIndex,
          keyframeIndex,
          handleType: 'ANCHOR',
        };
        const anchor = this.getHandlePoint(path, selection, effective);
        if (!anchor) continue;
        const pos = this.normToPixel(anchor.x, anchor.y);
        if (
          pos.x >= minX &&
          pos.x <= maxX &&
          pos.y >= minY &&
          pos.y <= maxY
        ) {
          this.selectedHandles.push({
            pathIndex,
            keyframeIndex,
            handleType: 'ANCHOR',
          });
        }
      }
    }

    return this.selectedHandles;
  }

  // 選択されているハンドルから、連続するベジエカーブのインデックス範囲を計算する
  getSelectionRange(): SelectionRange | null {
    // ハンドルが何も選択されていない場合は null を返す
    if (this.selectedHandles.length === 0) return null;

    // 選択されているハンドルが複数のパスにまたがっている場合は null を返す
    const pathIndex = this.selectedHandles[0].pathIndex;
    if (this.selectedHandles.some((h) => h.pathIndex !== pathIndex))
      return null;

    // 対象パスのセグメント数を取得
    const path = this.getPaths()[pathIndex];
    const segmentCount = Math.max(0, (path?.keyframes?.length ?? 0) - 1);
    if (segmentCount === 0) return null;

    // 選択されているアンカーポイントのインデックスを収集
    const anchorIndices = new Set<number>();
    for (const h of this.selectedHandles) {
      if (h.handleType !== 'ANCHOR') continue;
      anchorIndices.add(h.keyframeIndex);
    }

    // アンカーポイントが2つ以上選択されている場合
    // → 最小アンカーから最大アンカーまでの範囲に含まれるカーブを返す
    if (anchorIndices.size >= 2) {
      const anchorList = Array.from(anchorIndices);
      const minAnchor = Math.min(...anchorList);
      const maxAnchor = Math.max(...anchorList);

      const startCurveIndex = Math.max(
        0,
        Math.min(segmentCount - 1, minAnchor),
      );

      const endCurveIndex = Math.max(
        0,
        Math.min(segmentCount - 1, maxAnchor - 1),
      );
      if (startCurveIndex > endCurveIndex) return null;
      return { pathIndex, startCurveIndex, endCurveIndex };
    }

    // アンカーポイントが1つだけ選択されている場合
    // → そのアンカーに隣接する前後のカーブを範囲として返す
    if (anchorIndices.size === 1) {
      const anchorIndex = anchorIndices.values().next().value as number;
      const startCurveIndex = Math.max(0, anchorIndex - 1);
      const endCurveIndex = Math.min(segmentCount - 1, anchorIndex);
      if (startCurveIndex > endCurveIndex) return null;
      return { pathIndex, startCurveIndex, endCurveIndex };
    }

    // アンカーが選択されておらず、制御点のみが選択されている場合
    // → 各制御点が属するセグメントのインデックスを取得し、最小～最大の範囲を返す
    let minIdx = Infinity;
    let maxIdx = -Infinity;
    for (const h of this.selectedHandles) {
      const segmentIndex = this.getSegmentIndex(h);
      if (segmentIndex === null) continue;
      minIdx = Math.min(minIdx, segmentIndex);
      maxIdx = Math.max(maxIdx, segmentIndex);
    }

    // 範囲をセグメント数に収める
    minIdx = Math.max(0, minIdx);
    maxIdx = Math.min(segmentCount - 1, maxIdx);
    if (minIdx > maxIdx) return null;

    return { pathIndex, startCurveIndex: minIdx, endCurveIndex: maxIdx };
  }


  // #region プライベート - ハンドル検索

  // 指定位置にハンドルがあるかを検索
  private hitTest(x: number, y: number): HandleSelection | null {
    const paths = this.getPaths();
    for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
      const path = paths[pathIndex];
      const { effective } = this.getCurves(path);
      for (
        let keyframeIndex = path.keyframes.length - 1;
        keyframeIndex >= 0;
        keyframeIndex--
      ) {
        const candidates: HandleType[] = ['ANCHOR', 'SKETCH_OUT', 'SKETCH_IN'];
        for (const handleType of candidates) {
          const selection: HandleSelection = {
            pathIndex,
            keyframeIndex,
            handleType,
          };
          const point = this.getHandlePoint(path, selection, effective);
          if (!point) continue;

          const { x: px, y: py } = this.normToPixel(point.x, point.y);
          const dx = px - x;
          const dy = py - y;
          if (dx * dx + dy * dy <= HANDLE_RADIUS * HANDLE_RADIUS) {
            return selection;
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
    const { original, effective } = this.getCurves(path);
    const draggedPoint = this.getHandlePoint(path, dragged, effective);
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
    this.applySingleDrag(dragged, targetX, targetY, mode, path, original, effective);
  }

  // 複数選択時のドラッグ処理
  private applyMultiDrag(dx: number, dy: number, mode: number): void {
    const paths = this.getPaths();
    const anchorKeys = new Set<string>();
    for (const selection of this.selectedHandles) {
      if (selection.handleType === 'ANCHOR') {
        anchorKeys.add(`${selection.pathIndex}:${selection.keyframeIndex}`);
      }
    }

    for (const selection of this.selectedHandles) {
      const anchorKey = `${selection.pathIndex}:${selection.keyframeIndex}`;
      if (
        selection.handleType !== 'ANCHOR' &&
        anchorKeys.has(anchorKey)
      ) {
        continue;
      }

      const targetPath = paths[selection.pathIndex];
      if (!targetPath) continue;
      const { original, effective } = this.getCurves(targetPath);
      const point = this.getHandlePoint(targetPath, selection, effective);
      if (!point) continue;
      this.applyHandleTarget(
        targetPath,
        selection,
        point.x + dx,
        point.y + dy,
        original,
        effective,
      );
    }

    // mode === 0（通常モード）の場合、制御点の反対側をミラーリング
    if (mode === 0) {
      for (const selection of this.selectedHandles) {
        if (selection.handleType === 'ANCHOR') continue;
        const path = this.getPaths()[selection.pathIndex];
        const keyframe = path?.keyframes?.[selection.keyframeIndex];
        if (!keyframe) continue;
        this.mirrorOppositeControl(keyframe, selection.handleType);
      }
    }
  }

  // 単一選択のドラッグ処理
  private applySingleDrag(
    selection: HandleSelection,
    targetX: number,
    targetY: number,
    mode: number,
    path: Pick<Path, 'keyframes' | 'modifiers'>,
    originalCurves: Vector[][],
    effectiveCurves: Vector[][],
  ): void {
    this.applyHandleTarget(
      path,
      selection,
      targetX,
      targetY,
      originalCurves,
      effectiveCurves,
    );

    if (mode === 0 && selection.handleType !== 'ANCHOR') {
      const keyframe = path.keyframes[selection.keyframeIndex];
      if (keyframe) this.mirrorOppositeControl(keyframe, selection.handleType);
    }
  }

  // #region プライベート - 曲線・ハンドル補助

  // 元の曲線とModifier適用後の曲線を取得
  private getCurves(
    path: Pick<Path, 'keyframes' | 'modifiers'>,
  ): { original: Vector[][]; effective: Vector[][] } {
    const original = buildSketchCurves(path.keyframes);
    const effective = applyModifiers(original, path.modifiers);
    return { original, effective };
  }

  // ハンドルに対応する曲線と制御点インデックスを取得
  private getHandlePointInfo(
    path: Pick<Path, 'keyframes'>,
    selection: HandleSelection,
  ): CurveHandleInfo | null {
    const segmentCount = Math.max(0, path.keyframes.length - 1);
    if (segmentCount === 0) return null;

    if (selection.handleType === 'ANCHOR') {
      if (selection.keyframeIndex < 0) return null;
      if (selection.keyframeIndex < segmentCount) {
        return { curveIndex: selection.keyframeIndex, pointIndex: 0 };
      }
      if (selection.keyframeIndex === segmentCount) {
        return { curveIndex: segmentCount - 1, pointIndex: 3 };
      }
      return null;
    }

    if (selection.handleType === 'SKETCH_OUT') {
      if (selection.keyframeIndex < 0) return null;
      if (selection.keyframeIndex >= segmentCount) return null;
      return { curveIndex: selection.keyframeIndex, pointIndex: 1 };
    }

    if (selection.keyframeIndex <= 0) return null;
    if (selection.keyframeIndex > segmentCount) return null;
    return { curveIndex: selection.keyframeIndex - 1, pointIndex: 2 };
  }

  // ハンドルの位置を取得
  private getHandlePoint(
    path: Pick<Path, 'keyframes'>,
    selection: HandleSelection,
    curves: Vector[][],
  ): Vector | null {
    const info = this.getHandlePointInfo(path, selection);
    if (!info) return null;
    return curves[info.curveIndex]?.[info.pointIndex] ?? null;
  }

  // ハンドル移動を元曲線に反映
  private applyHandleTarget(
    path: Pick<Path, 'keyframes' | 'modifiers'>,
    selection: HandleSelection,
    targetX: number,
    targetY: number,
    originalCurves: Vector[][],
    effectiveCurves: Vector[][],
  ): void {
    const info = this.getHandlePointInfo(path, selection);
    if (!info) return;
    const originalPoint = originalCurves[info.curveIndex]?.[info.pointIndex];
    const effectivePoint = effectiveCurves[info.curveIndex]?.[info.pointIndex];
    if (!originalPoint || !effectivePoint) return;

    const correctedX = targetX - (effectivePoint.x - originalPoint.x);
    const correctedY = targetY - (effectivePoint.y - originalPoint.y);

    const keyframe = path.keyframes[selection.keyframeIndex];
    if (!keyframe) return;

    if (selection.handleType === 'ANCHOR') {
      keyframe.position.set(correctedX, correctedY);
      return;
    }

    const updated = keyframe.position
      .copy()
      .set(correctedX - keyframe.position.x, correctedY - keyframe.position.y);
    if (selection.handleType === 'SKETCH_IN') {
      keyframe.sketchIn = updated;
    } else {
      keyframe.sketchOut = updated;
    }
  }

  // #region プライベート - ハンドル操作

  // ハンドルベクトルを取得
  private getHandleVector(keyframe: Path['keyframes'][number], type: HandleType) {
    if (type === 'SKETCH_IN') return keyframe.sketchIn;
    if (type === 'SKETCH_OUT') return keyframe.sketchOut;
    return null;
  }

  // ハンドルベクトルを設定
  private setHandleVector(
    keyframe: Path['keyframes'][number],
    type: HandleType,
    vec: Path['keyframes'][number]['sketchIn'],
  ): void {
    if (type === 'SKETCH_IN') keyframe.sketchIn = vec ?? undefined;
    if (type === 'SKETCH_OUT') keyframe.sketchOut = vec ?? undefined;
  }

  // 対称制御点をミラーリング
  private mirrorOppositeControl(
    keyframe: Path['keyframes'][number],
    type: HandleType,
  ): void {
    if (type === 'ANCHOR') return;

    const oppositeType: HandleType =
      type === 'SKETCH_IN' ? 'SKETCH_OUT' : 'SKETCH_IN';

    const currentHandle = this.getHandleVector(keyframe, type);
    const oppositeHandle = this.getHandleVector(keyframe, oppositeType);

    if (!currentHandle || !oppositeHandle) return;

    const toCurrent = currentHandle.copy();

    if (toCurrent.magSq() > 0) {
      const oppositeLength = oppositeHandle.mag();
      const targetDir = toCurrent.normalize().mult(-oppositeLength);
      this.setHandleVector(keyframe, oppositeType, targetDir);
    }
  }

  // ハンドルのセグメントインデックスを取得
  private getSegmentIndex(selection: HandleSelection): number | null {
    if (selection.handleType === 'ANCHOR') return null;
    if (selection.handleType === 'SKETCH_OUT') return selection.keyframeIndex;
    return selection.keyframeIndex - 1;
  }
}
