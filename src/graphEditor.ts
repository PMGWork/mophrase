import p5 from 'p5';
import type { Path, Vector } from './types';
import { drawBezierCurve, drawControls } from './draw';
import { DEFAULT_COLORS } from './config';
import { HandleManager } from './handleManager';

export class GraphEditor {
  private p: p5 | null = null;
  private container: HTMLElement;
  private canvasContainer: HTMLElement;
  private isVisible: boolean = false;
  private activePath: Path | null = null;
  private handleManager: HandleManager | null = null;

  // グラフ描画領域の設定
  private readonly margin = { top: 40, right: 40, bottom: 40, left: 40 };

  // コンストラクタ
  constructor(container: HTMLElement) {
    this.container = container;
    const canvasContainer = container.querySelector('#graphEditorCanvas');
    if (!canvasContainer) throw new Error('GraphEditor: #graphEditorCanvas not found in container');
    this.canvasContainer = canvasContainer as HTMLElement;
  }

  // グラフの表示/非表示
  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.classList.toggle('hidden', !this.isVisible);
    this.container.classList.toggle('flex', this.isVisible);

    window.dispatchEvent(new Event('resize'));

    if (this.isVisible) {
      this.p ? this.p.loop() : requestAnimationFrame(() => this.init());
    } else {
      this.p?.noLoop();
    }
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;
  }

  // p5.jsの初期化
  private init(): void {
    const sketch = (p: p5) => {
      this.p = p;

      // HandleManagerの初期化
      this.handleManager = new HandleManager(
        () => this.activePath && this.activePath.timeCurve ? [{ curves: this.activePath.timeCurve }] : [],
        (x, y) => this.getNormalizedMousePos(p, x, y) || { x: 0, y: 0 },
        (x, y) => {
          const graphW = p.width - this.margin.left - this.margin.right;
          const graphH = p.height - this.margin.top - this.margin.bottom;
          return {
            x: x * graphW + this.margin.left,
            y: (1 - y) * graphH + this.margin.top
          };
        }
      );

      p.setup = () => {
        const { width, height } = this.canvasContainer.getBoundingClientRect();
        const size = Math.min(width, height);
        p.createCanvas(size, size).parent(this.canvasContainer);
        p.textFont('Geist');
      };

      p.windowResized = () => {
        const { width, height } = this.canvasContainer.getBoundingClientRect();
        const size = Math.min(width, height);
        p.resizeCanvas(size, size);
      };

      p.draw = () => {
        p.background(DEFAULT_COLORS.background);

        if (!this.activePath || !this.activePath.timeCurve) return;

        const width = p.width;
        const height = p.height;

        // グラフ領域の計算
        const graphW = width - this.margin.left - this.margin.right;
        const graphH = height - this.margin.top - this.margin.bottom;

        p.push();
        p.translate(this.margin.left, this.margin.top);

        // グリッドと軸
        this.drawGrid(p, graphW, graphH);

        // ベジェ曲線の描画
        p.push();
        p.scale(graphW, graphH);
        p.translate(0, 1);
        p.scale(1, -1);
        drawBezierCurve(p, this.activePath.timeCurve, 2 / Math.min(graphW, graphH), DEFAULT_COLORS.curve);
        p.pop();

        // コントロールの描画
        const transform = (v: Vector) => {
          return p.createVector(v.x * graphW, (1 - v.y) * graphH);
        };
        drawControls(p, this.activePath.timeCurve, 6, DEFAULT_COLORS.handle, transform);

        p.pop();
      };

      p.mousePressed = () => {
        if (this.isMouseInGraph(p)) {
          this.handleManager?.begin(p.mouseX, p.mouseY);
        }
      };

      p.mouseDragged = () => {
        const mode = p.keyIsDown(p.SHIFT) ? 1 : 0;
        this.handleManager?.drag(p.mouseX, p.mouseY, mode);
      };

      p.mouseReleased = () => {
        this.handleManager?.end();
      };
    };

    new p5(sketch);
  }

  // グリッドの描画
  private drawGrid(p: p5, w: number, h: number): void {
    p.noFill();
    p.stroke(DEFAULT_COLORS.border);
    p.strokeWeight(1);
    p.rect(0, 0, w, h);
  }

  // マウスがグラフ領域内にあるか
  private isMouseInGraph(p: p5): boolean {
    const mouseX = p.mouseX - this.margin.left;
    const mouseY = p.mouseY - this.margin.top;
    const graphW = p.width - this.margin.left - this.margin.right;
    const graphH = p.height - this.margin.top - this.margin.bottom;

    // 少し余裕を持たせる
    return mouseX >= -10 && mouseX <= graphW + 10 && mouseY >= -10 && mouseY <= graphH + 10;
  }

  // 正規化座標からスクリーン座標への変換
  private getNormalizedMousePos(p: p5, x: number, y: number): { x: number, y: number } | null {
    const mouseX = x - this.margin.left;
    const mouseY = y - this.margin.top;

    const graphW = p.width - this.margin.left - this.margin.right;
    const graphH = p.height - this.margin.top - this.margin.bottom;

    const normX = mouseX / graphW;
    const normY = 1 - (mouseY / graphH);

    return { x: normX, y: normY };
  }
}
