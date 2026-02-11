/**
 * ペンツール。
 * マウスドラッグで手書き入力を受け付け、フィッティングでベジエパスに変換する。
 */

import type p5 from 'p5';
import { BEZIER_T_STEP } from '../../constants';
import { generateKeyframes } from '../../core/fitting/keyframes';
import type { Path } from '../../types';
import { bezierCurve, refineParameter } from '../../utils/bezier';
import { buildSketchCurves, splitKeyframeSegment } from '../../utils/keyframes';
import { applyModifiers } from '../../utils/modifier';
import { drawPoints } from '../../utils/rendering';
import { isInRect } from '../../utils/input';
import type { ToolContext } from './types';

type DraftPath = {
  points: Path['keyframes'][number]['position'][];
  timestamps: number[];
  fitError: { current: { maxError: number; index: number } };
};

type PathSplitHit = {
  segmentIndex: number;
  t: number;
};

// ペンツール
export class PenTool {
  private draftPath: DraftPath | null = null;

  // #region メイン関数

  // マウス押下
  mousePressed(p: p5, ctx: ToolContext): void {
    if (this.trySplitExistingPath(p, ctx)) return;

    // 新しいパスを開始
    this.draftPath = {
      points: [p.createVector(p.mouseX, p.mouseY)],
      timestamps: [p.millis()],
      fitError: {
        current: {
          maxError: Number.MAX_VALUE,
          index: -1,
        },
      },
    };
  }

  // マウスドラッグ
  mouseDragged(p: p5): void {
    if (
      this.draftPath &&
      isInRect(p.mouseX, p.mouseY, 0, 0, p.width, p.height)
    ) {
      this.draftPath.points.push(p.createVector(p.mouseX, p.mouseY));
      this.draftPath.timestamps.push(p.millis());
    }
  }

  // マウスリリース
  mouseReleased(ctx: ToolContext): void {
    if (!this.draftPath) return;

    if (this.draftPath.points.length >= 2) {
      this.finalizePath(ctx);
    }

    // 描画中のパスをリセット
    this.draftPath = null;
  }

  // 描画
  draw(p: p5, ctx: ToolContext): void {
    if (!this.draftPath) return;

    drawPoints(
      p,
      this.draftPath.points,
      ctx.config.lineWeight,
      ctx.config.pointSize - ctx.config.lineWeight,
      ctx.colors.curve,
      ctx.colors.background,
    );
  }

  // #region プライベート関数

  // パスを確定
  private finalizePath(ctx: ToolContext): void {
    if (!this.draftPath) return;

    const keyframes = generateKeyframes(
      this.draftPath.points,
      this.draftPath.timestamps,
      ctx.config.fitTolerance,
      ctx.config.fitTolerance * ctx.config.coarseErrorWeight,
      this.draftPath.fitError,
    );

    if (keyframes.length < 2) return;

    const timestamps = this.draftPath.timestamps;
    const durationMs = timestamps[timestamps.length - 1] - timestamps[0];
    const duration = Math.max(0.01, Math.round(durationMs) / 1000);

    const path: Path = {
      id: crypto.randomUUID(),
      keyframes,
      startTime: 0,
      duration,
    };

    ctx.addPath(path);
    ctx.setActivePath(path);
    ctx.onPathCreated(path);
    ctx.onPathSelected(path);
  }

  // 既存パス上のクリックなら分割する
  private trySplitExistingPath(p: p5, ctx: ToolContext): boolean {
    const tolerance = Math.max(ctx.config.pointSize * 2, 10);
    const toleranceSq = tolerance * tolerance;

    for (let i = ctx.paths.length - 1; i >= 0; i--) {
      const path = ctx.paths[i];
      const splitHit = this.findSplitHitOnPath(
        path,
        p.mouseX,
        p.mouseY,
        toleranceSq,
      );
      if (!splitHit) continue;

      try {
        path.keyframes = splitKeyframeSegment(
          path.keyframes,
          splitHit.segmentIndex,
          splitHit.t,
        );
      } catch {
        return false;
      }

      ctx.setActivePath(path);
      ctx.handleManager.clearSelection();
      ctx.onPathSelected(path);
      return true;
    }

    return false;
  }

  // パス上の分割対象を探索（非アンカー位置のみ）
  private findSplitHitOnPath(
    path: Path,
    x: number,
    y: number,
    toleranceSq: number,
  ): PathSplitHit | null {
    const curves = buildSketchCurves(path.keyframes);
    if (curves.length === 0) return null;

    const effectiveCurves = applyModifiers(curves, path.sketchModifiers);
    const sampleCount = Math.max(4, Math.round(1 / BEZIER_T_STEP));

    let best: {
      segmentIndex: number;
      t: number;
      distSq: number;
    } | null = null;

    for (
      let segmentIndex = 0;
      segmentIndex < effectiveCurves.length;
      segmentIndex++
    ) {
      const curve = effectiveCurves[segmentIndex];
      for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const pt = bezierCurve(curve[0], curve[1], curve[2], curve[3], t);
        const dx = pt.x - x;
        const dy = pt.y - y;
        const distSq = dx * dx + dy * dy;

        if (!best || distSq < best.distSq) {
          best = { segmentIndex, t, distSq };
        }
      }
    }

    if (!best || best.distSq > toleranceSq) return null;

    const query = effectiveCurves[best.segmentIndex]?.[0].copy().set(x, y);
    if (!query) return null;

    const refined = refineParameter(
      effectiveCurves[best.segmentIndex],
      query,
      best.t,
    );
    const t = Number.isFinite(refined)
      ? Math.max(0, Math.min(1, refined))
      : best.t;
    const edgeEpsilon = Math.max(1e-3, BEZIER_T_STEP * 0.5);
    if (t <= edgeEpsilon || t >= 1 - edgeEpsilon) return null;

    return {
      segmentIndex: best.segmentIndex,
      t,
    };
  }
}
