/**
 * スケッチエディタの描画ロジック。
 * p5.js の draw() で呼び出されるシーン全体のレンダリングを担当する。
 */

import type p5 from 'p5';
import type { Colors, Config } from '../../config';
import type { HandleManager } from '../../core/handleManager';
import type { MotionManager } from '../../core/motionManager';
import type { SuggestionManager } from '../../suggestion/suggestion';
import type {
  HandleSelection,
  Path,
  SelectionRange,
  ToolKind,
} from '../../types';
import { drawSketchPath } from '../shared/rendering';
import type { PenTool } from './penTool';
import type { SelectTool } from './selectTool';
import type { ToolContext } from './types';

// drawScene に渡すシーン状態
interface DrawSceneState {
  paths: Path[];
  activePath: Path | null;
  colors: Colors;
  config: Config;
  objectColors: string[];
  objectSize: number;
  currentTool: ToolKind;
  isPreviewing: boolean;
  isSuggestionLoopPlaying: boolean;
  suggestionLoopPath: Path | null;

  // マネージャー
  motionManager: MotionManager | null;
  suggestionMotionManager: MotionManager | null;
  handleManager: HandleManager;
  suggestionManager: SuggestionManager;

  // ツール
  penTool: PenTool;
  selectTool: SelectTool;
  toolContext: ToolContext;

  // ハンドルマッピング
  mapCurvePointToHandle: (
    pathIndex: number,
    curveIndex: number,
    pointIndex: number,
  ) => HandleSelection;
}

// シーン全体を描画する
export function drawScene(p: p5, state: DrawSceneState): void {
  p.background(state.colors.background);

  const isPlaying = state.motionManager?.getIsPlaying() ?? false;
  const shouldPreview =
    !isPlaying && state.isPreviewing && !!state.motionManager;

  // 1. 非選択のパスの軌跡を描画（再生中はスキップ）
  if (!isPlaying) {
    for (let pathIndex = 0; pathIndex < state.paths.length; pathIndex++) {
      const path = state.paths[pathIndex];
      if (state.activePath === path) continue;
      drawSketchPath(p, path, state.config, state.colors, false);
    }
  }

  // 2. すべてのオブジェクトを描画
  if (isPlaying) {
    // 再生中: MotionManagerが全オブジェクトを描画
    state.motionManager?.draw();
  } else if (shouldPreview) {
    // シーク時のプレビュー
    state.motionManager?.drawPreview();
  } else {
    // 非再生時: 個別にオブジェクトを描画
    for (let i = 0; i < state.paths.length; i++) {
      const path = state.paths[i];
      if (state.isSuggestionLoopPlaying && state.suggestionLoopPath === path) {
        continue;
      }
      const isLatest = i === state.paths.length - 1;
      const color = state.objectColors[i % state.objectColors.length];

      if (isLatest) {
        // 最後のパスはMotionManagerで描画（静的表示）
        state.motionManager?.setColor(color);
        state.motionManager?.setPath(path);
        state.motionManager?.draw();
      } else {
        // それ以外のパスは開始位置に静的オブジェクトを描画
        if (path.keyframes.length > 0) {
          const pos = path.keyframes[0].position;
          p.push();
          p.fill(color);
          p.noStroke();
          p.circle(pos.x, pos.y, state.objectSize);
          p.pop();
        }
      }
    }

    if (state.isSuggestionLoopPlaying) {
      state.suggestionMotionManager?.draw();
    }
  }

  // 3. 選択中のパスの軌跡とハンドルを描画（再生中はスキップ）
  if (!isPlaying && state.activePath) {
    const pathIndex = state.paths.indexOf(state.activePath);
    const selectionRange = state.handleManager.getSelectionRange();
    const activePathRange =
      selectionRange && selectionRange.pathIndex === pathIndex
        ? selectionRange
        : null;
    const highlightedRange =
      activePathRange?.anchorKeyframeIndex !== undefined
        ? null
        : activePathRange;

    drawSketchPath(
      p,
      state.activePath,
      state.config,
      state.colors,
      true,
      (curveIndex, pointIndex) => {
        const handle = state.mapCurvePointToHandle(
          pathIndex,
          curveIndex,
          pointIndex,
        );
        if (
          state.handleManager.isSelected(handle)
        ) {
          return true;
        }

        // アンカー選択時は、そのアンカーに紐づく入出ハンドルも強調する。
        const attachedAnchor = getAttachedAnchorSelection(
          pathIndex,
          curveIndex,
          pointIndex,
        );
        if (attachedAnchor && state.handleManager.isSelected(attachedAnchor)) {
          return true;
        }

        return isPointInSelectionRange(curveIndex, highlightedRange);
      },
      highlightedRange ?? undefined,
    );
  }

  // ツール固有の描画（再生中はスキップ）
  if (!isPlaying) {
    if (state.currentTool === 'pen') {
      state.penTool.draw(p, state.toolContext);
    } else {
      state.selectTool.draw(p, state.toolContext);
    }

    // 提案をプレビュー
    state.suggestionManager.preview(p, state.colors);
  }
}

// 選択範囲内か
function isPointInSelectionRange(
  curveIndex: number,
  range: SelectionRange | null,
): boolean {
  if (!range) return false;
  return (
    curveIndex >= range.startCurveIndex && curveIndex <= range.endCurveIndex
  );
}

// カーブのポイントに対応するハンドル選択を取得
function getAttachedAnchorSelection(
  pathIndex: number,
  curveIndex: number,
  pointIndex: number,
): HandleSelection | null {
  if (pointIndex === 1) {
    return { pathIndex, keyframeIndex: curveIndex, handleType: 'ANCHOR' };
  }
  if (pointIndex === 2) {
    return { pathIndex, keyframeIndex: curveIndex + 1, handleType: 'ANCHOR' };
  }
  return null;
}
