import type p5 from 'p5';
import { fitCurve } from '../../core/fitting';
import type { Path } from '../../types';
import { drawPoints } from '../../utils/draw';
import { isInRect } from '../../utils/p5Helpers';
import type { ToolContext } from './types';

// ペンツール
export class PenTool {
  private draftPath: Path | null = null;

  // #region メイン関数

  // マウス押下
  mousePressed(p: p5, ctx: ToolContext): void {
    // 新しいパスを開始
    this.draftPath = {
      points: [p.createVector(p.mouseX, p.mouseY)],
      times: [p.millis()],
      curves: [],
      timeCurve: [],
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
      this.draftPath.times.push(p.millis());
    }
  }

  // マウスリリース
  mouseReleased(p: p5, ctx: ToolContext): void {
    if (!this.draftPath) return;

    if (this.draftPath.points.length >= 2) {
      this.finalizePath(p, ctx);
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
  private finalizePath(p: p5, ctx: ToolContext): void {
    if (!this.draftPath) return;

    // フィッティングを実行
    fitCurve(
      this.draftPath.points,
      this.draftPath.curves,
      ctx.config.sketchFitTolerance,
      ctx.config.sketchFitTolerance * ctx.config.coarseErrorWeight,
      this.draftPath.fitError,
    );

    // モーションのタイミングをフィッティング
    const normalizedTol = ctx.config.graphFitTolerance / 100;
    ctx.motionManager?.fitTiming(this.draftPath, p, normalizedTol);

    // 確定済みパスに追加
    ctx.addPath(this.draftPath);
    ctx.setActivePath(this.draftPath);

    // グラフエディタにも反映
    ctx.onPathCreated(this.draftPath);
    ctx.onPathSelected(this.draftPath);
  }
}
