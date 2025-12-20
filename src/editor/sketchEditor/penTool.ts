import type p5 from 'p5';
import { generateKeyframes } from '../../core/fitting';
import type { Path } from '../../types';
import { drawPoints } from '../../utils/draw';
import { isInRect } from '../../utils/p5Helpers';
import type { ToolContext } from './types';

type DraftPath = {
  points: Path['keyframes'][number]['position'][];
  timestamps: number[];
  fitError: { current: { maxError: number; index: number } };
};

// ペンツール
export class PenTool {
  private draftPath: DraftPath | null = null;

  // #region メイン関数

  // マウス押下
  mousePressed(p: p5, ctx: ToolContext): void {
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

    // ユーザー指示入力欄をクリア
    ctx.dom.sketchPromptInput.value = '';
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
      ctx.config.sketchFitTolerance,
      ctx.config.sketchFitTolerance * ctx.config.coarseErrorWeight,
      this.draftPath.fitError,
    );

    if (keyframes.length < 2) return;

    const timestamps = this.draftPath.timestamps;
    const durationMs =
      timestamps[timestamps.length - 1] - timestamps[0];
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
}
