import type p5 from 'p5';
import { BEZIER_T_STEP, CURVE_POINT } from '../../constants';
import type { MarqueeRect, Path } from '../../types';
import { bezierCurve } from '../../utils/math';
import type { ToolContext } from './types';

// 選択ツール
export class SelectTool {
  private marqueeRect: MarqueeRect | null = null;

  // #region メイン関数

  // マウス押下
  mousePressed(p: p5, ctx: ToolContext): void {
    // ハンドルのドラッグ
    if (ctx.activePath) {
      const shift = p.keyIsDown(p.SHIFT);
      ctx.handleManager.startDrag(p.mouseX, p.mouseY, shift);
      if (ctx.handleManager.isDragging()) return;
    }

    // パスの選択
    const clickedPath = this.findClickedPath(p.mouseX, p.mouseY, ctx);
    if (clickedPath) {
      if (ctx.activePath !== clickedPath) {
        // 別のパスを選択
        ctx.setActivePath(clickedPath);
        ctx.onPathSelected(clickedPath);

        // 選択をクリア
        ctx.handleManager.clearSelection();

        // 提案UIを開く
        ctx.suggestionManager.open(clickedPath);
      }
      return;
    }

    // 背景をクリックした場合
    if (ctx.activePath) {
      ctx.handleManager.clearSelection();
      this.marqueeRect = {
        startX: p.mouseX,
        startY: p.mouseY,
        endX: p.mouseX,
        endY: p.mouseY,
      };
    } else {
      ctx.handleManager.clearSelection();
      ctx.onPathSelected(null);
      ctx.suggestionManager.close();
    }
  }

  // マウスドラッグ
  mouseDragged(p: p5, ctx: ToolContext): void {
    const dragMode = p.keyIsDown(p.ALT) ? 1 : 0;
    ctx.handleManager.updateDrag(p.mouseX, p.mouseY, dragMode);
    if (ctx.handleManager.isDragging()) {
      const selectionRange = ctx.handleManager.getSelectionRange();
      ctx.suggestionManager.updateSelectionRange(selectionRange ?? undefined);
      return;
    }

    // 範囲選択
    if (this.marqueeRect) {
      this.marqueeRect.endX = p.mouseX;
      this.marqueeRect.endY = p.mouseY;
    }
  }

  // マウスリリース
  mouseReleased(_p: p5, ctx: ToolContext): void {
    const wasDragging = ctx.handleManager.isDragging();
    ctx.handleManager.endDrag();
    if (wasDragging) {
      const selectionRange = ctx.handleManager.getSelectionRange();
      ctx.suggestionManager.updateSelectionRange(selectionRange ?? undefined);
      return;
    }

    // 範囲選択の完了
    if (this.marqueeRect) {
      const targetPathIndex = ctx.activePath
        ? ctx.paths.indexOf(ctx.activePath)
        : undefined;

      const selected = ctx.handleManager.selectAnchorsInRect(
        this.marqueeRect,
        targetPathIndex !== -1 ? targetPathIndex : undefined,
      );
      this.marqueeRect = null;

      if (selected.length > 0 && ctx.activePath) {
        const selectionRange = ctx.handleManager.getSelectionRange();
        ctx.suggestionManager.open(ctx.activePath);
        ctx.suggestionManager.updateSelectionRange(selectionRange ?? undefined);
      } else {
        ctx.setActivePath(null);
        ctx.onPathSelected(null);
        ctx.suggestionManager.close();
      }
    }
  }

  // 矩形を描画
  draw(p: p5, ctx: ToolContext): void {
    if (!this.marqueeRect) return;

    p.push();
    p.fill(ctx.colors.marquee + '26'); // 15% alpha
    p.stroke(ctx.colors.marquee + '99'); // 60% alpha
    p.strokeWeight(1);
    const { startX, startY, endX, endY } = this.marqueeRect;
    p.rect(
      Math.min(startX, endX),
      Math.min(startY, endY),
      Math.abs(endX - startX),
      Math.abs(endY - startY),
    );
    p.pop();
  }

  // #region プライベート関数

  // 指定座標に近いパスを検索
  private findClickedPath(x: number, y: number, ctx: ToolContext): Path | null {
    const tolerance = Math.max(ctx.config.pointSize * 2, 10);
    const toleranceSq = tolerance * tolerance;

    for (let i = ctx.paths.length - 1; i >= 0; i--) {
      const path = ctx.paths[i];
      if (this.isHitOnPath(path, x, y, toleranceSq)) {
        return path;
      }
    }

    return null;
  }

  // パスと座標の当たり判定
  private isHitOnPath(
    path: Path,
    x: number,
    y: number,
    toleranceSq: number,
  ): boolean {
    if (path.sketch.curves.length === 0) return false;

    for (const curve of path.sketch.curves) {
      for (let t = 0; t <= 1; t += BEZIER_T_STEP) {
        const pt = bezierCurve(
          curve[CURVE_POINT.START_ANCHOR_POINT],
          curve[CURVE_POINT.START_CONTROL_POINT],
          curve[CURVE_POINT.END_CONTROL_POINT],
          curve[CURVE_POINT.END_ANCHOR_POINT],
          t,
        );
        const dx = pt.x - x;
        const dy = pt.y - y;
        if (dx * dx + dy * dy <= toleranceSq) {
          return true;
        }
      }
    }

    return false;
  }
}
