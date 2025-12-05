import p5 from 'p5';
import type { Colors, Config } from './config';
import type { DOMManager } from './domManager';
import { drawBezierCurve, drawControls } from './draw';
import { HandleManager } from './handleManager';
import { isLeftMouseButton } from './p5Utils';
import { SuggestionManager } from './suggestion';
import type { Path, Vector } from './types';

export class GraphEditor {
  // 状態
  private isVisible: boolean = true;
  private activePath: Path | null = null;

  // マネージャー
  private dom: DOMManager;
  private suggestionManager: SuggestionManager;
  private handleManager: HandleManager | null = null;

  // 設定
  private config: Config;
  private colors: Colors;

  // 描画領域の設定
  private static readonly GRAPH_MARGIN = 40;
  private readonly margin = {
    top: GraphEditor.GRAPH_MARGIN,
    right: GraphEditor.GRAPH_MARGIN,
    bottom: GraphEditor.GRAPH_MARGIN,
    left: GraphEditor.GRAPH_MARGIN,
  };

  // コンストラクタ
  constructor(domManager: DOMManager, config: Config, colors: Colors) {
    this.dom = domManager;
    this.config = config;
    this.colors = colors;

    // p5.jsの初期化
    this.initP5();

    // 提案マネージャーの初期化
    this.suggestionManager = new SuggestionManager(config, {
      onGraphSuggestionSelect: (curves) => {
        this.applySuggestion(curves);
      },
    });

    // Durationの更新
    this.dom.durationInput.addEventListener('change', () =>
      this.updateDuration(),
    );

    // 提案生成
    this.dom.graphUserPromptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.generateSuggestion();
      this.dom.graphUserPromptInput.value = '';
    });
  }

  // #region メイン関数

  // 表示/非表示の切り替え
  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.dom.graphEditorContainer.classList.toggle('hidden');
    window.dispatchEvent(new Event('resize'));
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;
    if (!path || !path.times.length) return;

    const duration = path.times[path.times.length - 1] - path.times[0];
    this.dom.durationInput.value = Math.round(duration).toString();
    this.suggestionManager.showGraphInput();
  }

  // #region プライベート関数

  // Durationの更新
  private updateDuration(): void {
    const activePath = this.activePath;
    const times = activePath?.times;
    if (!activePath || !times?.length) return;

    const newDuration = Number(this.dom.durationInput.value);
    const start = times[0];
    const oldDuration = times[times.length - 1] - start;

    if (newDuration > 0 && oldDuration > 0) {
      const scale = newDuration / oldDuration;
      activePath.times = times.map((t) => start + (t - start) * scale);
    }
  }

  // 提案の生成
  private async generateSuggestion(): Promise<void> {
    const currentCurves = this.activePath?.timeCurve;
    if (!currentCurves) return;

    const userPrompt = this.dom.graphUserPromptInput.value;
    await this.suggestionManager.generateGraphSuggestions(
      currentCurves,
      userPrompt,
    );
  }

  // 提案の適用
  private applySuggestion(curves: Vector[][]): void {
    if (!this.activePath) return;
    this.activePath.timeCurve = curves;
  }

  // #region p5.js

  // p5.jsの初期化
  private initP5(): void {
    const sketch = (p: p5) => {
      // アクティブパスのカーブを取得
      const getActiveCurves = (): { curves: Vector[][] }[] =>
        this.activePath?.timeCurve
          ? [{ curves: this.activePath.timeCurve }]
          : [];

      // マウス座標を正規化座標に変換
      const mouseToNormalized = (x: number, y: number) =>
        this.getNormalizedMousePos(p, x, y);

      // 正規化座標からピクセル座標への変換
      const normalizedToPixel = (normX: number, normY: number) => {
        const graphW = p.width - this.margin.left - this.margin.right;
        const graphH = p.height - this.margin.top - this.margin.bottom;
        return {
          x: normX * graphW + this.margin.left,
          y: (1 - normY) * graphH + this.margin.top,
        };
      };

      // HandleManagerの初期化
      this.handleManager = new HandleManager(
        getActiveCurves,
        mouseToNormalized,
        normalizedToPixel,
      );

      // 初期設定
      p.setup = () => {
        const { width, height } = this.dom.getGraphCanvasSize();
        const size = Math.min(width, height);
        p.createCanvas(size, size).parent(this.dom.graphEditorCanvas);
        p.textFont('Geist');
      };

      // サイズ変更
      p.windowResized = () => {
        const { width, height } = this.dom.getGraphCanvasSize();
        const size = Math.min(width, height);
        p.resizeCanvas(size, size);
      };

      // 描画
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

        // グリッド
        this.drawGrid(p, graphW, graphH);

        // ベジェ曲線
        p.push();
        p.scale(graphW, graphH);
        p.translate(0, 1);
        p.scale(1, -1);
        drawBezierCurve(
          p,
          this.activePath.timeCurve,
          2 / Math.min(graphW, graphH),
          this.colors.curve,
        );
        p.pop();

        // 制御点と制御ポリゴン
        const transform = (v: Vector) => {
          return p.createVector(v.x * graphW, (1 - v.y) * graphH);
        };
        drawControls(
          p,
          this.activePath.timeCurve,
          this.config.pointSize,
          this.colors.handle,
          transform,
        );

        // 提案プレビュー
        this.suggestionManager.draw(p, this.colors, {
          transform: (v) => transform(v),
        });

        p.pop();
      };

      // マウス関連
      p.mousePressed = () => {
        const isLeftClick = isLeftMouseButton(p.mouseButton, p.LEFT);
        if (!isLeftClick) return;

        if (this.isMouseInGraph(p))
          if (this.handleManager?.begin(p.mouseX, p.mouseY)) return;
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

  // #region ヘルパー関数

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

    return mouseX >= 0 && mouseX <= graphW && mouseY >= 0 && mouseY <= graphH;
  }

  // 正規化座標からスクリーン座標への変換
  private getNormalizedMousePos(
    p: p5,
    x: number,
    y: number,
  ): { x: number; y: number } {
    const mouseX = x - this.margin.left;
    const mouseY = y - this.margin.top;
    const graphW = p.width - this.margin.left - this.margin.right;
    const graphH = p.height - this.margin.top - this.margin.bottom;

    const normX = mouseX / graphW;
    const normY = 1 - mouseY / graphH;

    return { x: normX, y: normY };
  }
}
