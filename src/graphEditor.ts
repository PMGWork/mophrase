import p5 from 'p5';
import type { Path, Vector } from './types';
import { drawBezierCurve, drawControls } from './draw';
import type { Config, Colors } from './config';
import { HandleManager } from './handleManager';
import { DOMManager } from './domManager';
import { SuggestionManager } from './suggestion';

export class GraphEditor {
  private domManager: DOMManager;
  private suggestionManager: SuggestionManager;
  private isVisible: boolean = false;
  private activePath: Path | null = null;

  // マネージャー
  private handleManager: HandleManager | null = null;

  // 設定
  private config: Config;
  private colors: Colors;

  // グラフ描画領域の設定
  private readonly margin = { top: 40, right: 40, bottom: 40, left: 40 };

  // コンストラクタ
  constructor(domManager: DOMManager, config: Config, colors: Colors) {
    this.domManager = domManager;
    this.config = config;
    this.colors = colors;

    this.suggestionManager = new SuggestionManager(config, {
      onGraphSuggestionSelect: (curves) => {
        this.applySuggestion(curves);
      }
    });

    this.init();

    this.domManager.durationInput.addEventListener('change', () => this.updateDuration());
    this.domManager.graphUserPromptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('GraphEditor: Submit button clicked');
      this.generateSuggestion();
    });
  }

  // グラフの表示/非表示
  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.domManager.graphEditorContainer.classList.toggle('hidden', !this.isVisible);
    this.domManager.graphEditorContainer.classList.toggle('flex', this.isVisible);

    window.dispatchEvent(new Event('resize'));
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;
    if (path && path.times.length > 0) {
      const duration = path.times[path.times.length - 1] - path.times[0];
      this.domManager.durationInput.value = Math.round(duration).toString();
    }
  }

  // Durationの更新
  private updateDuration(): void {
    if (!this.activePath || this.activePath.times.length === 0) return;

    const newDuration = Number(this.domManager.durationInput.value);
    if (Number.isNaN(newDuration) || newDuration <= 0) return;

    const oldDuration = this.activePath.times[this.activePath.times.length - 1] - this.activePath.times[0];
    if (oldDuration === 0) return;

    const scale = newDuration / oldDuration;
    const startTime = this.activePath.times[0];

    this.activePath.times = this.activePath.times.map(t => startTime + (t - startTime) * scale);
  }

  // 提案の生成
  private async generateSuggestion(): Promise<void> {
    console.log('GraphEditor: generateSuggestion called');
    if (!this.activePath || !this.activePath.timeCurve) {
      console.log('GraphEditor: No active path or time curve', this.activePath);
      return;
    }

    const userPrompt = this.domManager.graphUserPromptInput.value;
    console.log('GraphEditor: User prompt:', userPrompt);
    // 現在のカーブを取得 (p0, p1, p2, p3)
    // activePath.timeCurve は Vector[][]
    const currentCurves = this.activePath.timeCurve;

    // UIの位置を設定 (入力欄の下)
    const rect = this.domManager.graphUserPromptInput.getBoundingClientRect();
    this.suggestionManager.setPosition(rect.left, rect.bottom + 10);

    await this.suggestionManager.generateGraphSuggestion(currentCurves, userPrompt);
  }

  // 提案の適用
  private applySuggestion(curves: Vector[][]): void {
    if (!this.activePath) return;
    // カーブを更新
    this.activePath.timeCurve = curves;
  }

  // p5.jsの初期化
  private init(): void {
    const sketch = (p: p5) => {
      this.handleManager = new HandleManager(
        () => this.activePath && this.activePath.timeCurve ? [{ curves: this.activePath.timeCurve }] : [],
        (x, y) => this.getNormalizedMousePos(p, x, y),
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
        const { width, height } = this.domManager.getGraphCanvasSize();
        const size = Math.min(width, height);
        p.createCanvas(size, size).parent(this.domManager.graphEditorCanvas);
        p.textFont('Geist');
      };

      p.windowResized = () => {
        const { width, height } = this.domManager.getGraphCanvasSize();
        const size = Math.min(width, height);
        p.resizeCanvas(size, size);
      };

      p.draw = () => {
        p.background(this.colors.background);

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
        drawBezierCurve(p, this.activePath.timeCurve, 2 / Math.min(graphW, graphH), this.colors.curve);
        p.pop();

        // コントロールの描画
        const transform = (v: Vector) => {
          return p.createVector(v.x * graphW, (1 - v.y) * graphH);
        };
        drawControls(p, this.activePath.timeCurve, this.config.pointSize, this.colors.handle, transform);

        // 提案のプレビュー描画
        p.push();
        p.translate(0, graphH);
        p.scale(graphW, -graphH);

        // 線幅の補正 (逆スケール)
        const scaleFactor = 1 / Math.min(graphW, graphH);
        this.suggestionManager.draw(p, this.colors, { strokeScale: scaleFactor });
        p.pop();

        p.pop();
      };

      p.mousePressed = () => {
        // 左クリックのみを処理
        const isLeftClick = (p.mouseButton as any) === p.LEFT || (p.mouseButton as any)?.left;
        if (!isLeftClick) return;

        if (this.isMouseInGraph(p)) {
          if (this.handleManager?.begin(p.mouseX, p.mouseY)) return;
        }
      };

      p.mouseDragged = () => {
        const mode = p.keyIsDown(p.SHIFT) ? 0 : this.config.defaultDragMode;
        this.handleManager?.drag(p.mouseX, p.mouseY, mode);
      };

      p.mouseReleased = () => {
        if (this.handleManager?.end()) return;
      };
    };

    new p5(sketch);
  }

  // グリッドの描画
  private drawGrid(p: p5, w: number, h: number): void {
    p.noFill();
    p.stroke(this.colors.border);
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
  private getNormalizedMousePos(p: p5, x: number, y: number): { x: number, y: number } {
    const mouseX = x - this.margin.left;
    const mouseY = y - this.margin.top;

    const graphW = p.width - this.margin.left - this.margin.right;
    const graphH = p.height - this.margin.top - this.margin.bottom;

    const normX = mouseX / graphW;
    const normY = 1 - (mouseY / graphH);

    return { x: normX, y: normY };
  }
}
