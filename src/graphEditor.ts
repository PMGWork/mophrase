import p5 from 'p5';
import type { Colors, Config } from './config';
import type { DOMManager } from './domManager';
import { drawBezierCurve, drawControls } from './draw';
import { HandleManager } from './handleManager';
import { isInRect, isLeftMouseButton } from './p5Utils';
import { GraphSuggestionManager } from './suggestion/graphSuggestion';
import type { Path } from './types';

// グラフエディタ
export class GraphEditor {
  // データ構造
  private activePath: Path | null = null;

  // マネージャー
  private dom: DOMManager;
  private handleManager: HandleManager;
  private suggestionManager: GraphSuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // 描画領域の設定
  private static readonly MARGIN = 40;
  private readonly margin = {
    top: GraphEditor.MARGIN,
    right: GraphEditor.MARGIN,
    bottom: GraphEditor.MARGIN,
    left: GraphEditor.MARGIN,
  };

  // コンストラクタ
  constructor(dom: DOMManager, config: Config, colors: Colors) {
    this.dom = dom;
    this.config = config;
    this.colors = colors;

    // ハンドルマネージャー
    this.handleManager = new HandleManager(
      // アクティブパスのタイムカーブを取得
      () => (this.activePath ? [{ curves: this.activePath.timeCurve }] : []),

      // ピクセル座標から正規化座標への変換
      (x, y) => this.pixelToNormalized(x, y),

      // 正規化座標からピクセル座標への変換
      (normX, normY) => this.normalizedToPixel(normX, normY),
    );

    // 提案マネージャー
    this.suggestionManager = new GraphSuggestionManager(config, {
      onSelect: (path) => {
        if (this.activePath) this.activePath.timeCurve = path.timeCurve;
      },
    });

    // 提案生成
    this.dom.graphPromptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.generateSuggestion();
      this.dom.graphPromptInput.value = '';
    });

    // p5.jsの初期化
    this.init();
  }

  // #region メイン関数

  // 表示/非表示の切り替え
  public toggle(): void {
    this.dom.graphEditorContainer.classList.toggle('hidden');
    window.dispatchEvent(new Event('resize'));
  }

  // パスの設定
  public setPath(path: Path | null): void {
    if (!path || !path.times.length) {
      this.activePath = null;
      this.suggestionManager.close();
      return;
    }

    this.activePath = path;
    this.suggestionManager.open(path);
  }

  // #region p5.js

  // p5.js 初期化
  private init(): void {
    const sketch = (p: p5) => {
      p.setup = () => this.setup(p);
      p.windowResized = () => this.windowResized(p);
      p.draw = () => this.draw(p);
      p.mouseDragged = () => this.mouseDragged(p);
      p.mousePressed = () => this.mousePressed(p);
      p.mouseReleased = () => this.mouseReleased(p);
    };

    new p5(sketch);
  }

  // p5.js セットアップ
  private setup(p: p5): void {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    p.createCanvas(size, size).parent(this.dom.graphEditorCanvas);
    p.textFont('Geist');
  }

  // p5.js リサイズ
  private windowResized(p: p5): void {
    const { width, height } = this.dom.getGraphCanvasSize();
    p.resizeCanvas(width, height);
  }

  // p5.js 描画
  private draw(p: p5): void {
    p.background(this.colors.background);

    if (!this.activePath) return;

    const width = p.width;
    const height = p.height;

    // グラフ領域の計算
    const graphW = width - this.margin.left - this.margin.right;
    const graphH = height - this.margin.top - this.margin.bottom;

    p.push();
    p.translate(this.margin.left, this.margin.top);

    // グリッド
    p.noFill();
    p.stroke(this.colors.border);
    p.strokeWeight(1);
    p.rect(0, 0, graphW, graphH);

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
    drawControls(
      p,
      this.activePath.timeCurve,
      this.config.pointSize,
      this.colors.handle,
      (v) => p.createVector(v.x * graphW, (1 - v.y) * graphH),
    );

    // 提案をプレビュー
    this.suggestionManager.preview(p, this.colors, {
      transform: (v) => p.createVector(v.x * graphW, (1 - v.y) * graphH),
    });

    p.pop();
  }

  // p5.js マウス押下
  private mousePressed(p: p5): void {
    const isLeftClick = isLeftMouseButton(p.mouseButton, p.LEFT);
    if (!isLeftClick) return;

    // ハンドルのドラッグ
    if (this.handleManager.start(p.mouseX, p.mouseY)) return;

    // キャンバス内クリックなら何もしない
    const graphW = p.width - this.margin.left - this.margin.right;
    const graphH = p.height - this.margin.top - this.margin.bottom;
    if (
      isInRect(
        p.mouseX,
        p.mouseY,
        this.margin.left,
        this.margin.top,
        graphW,
        graphH,
      )
    )
      return;
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    // ハンドルのドラッグ
    const dragMode = p.keyIsDown(p.SHIFT) ? 0 : this.config.defaultDragMode;
    this.handleManager.drag(p.mouseX, p.mouseY, dragMode);
  }

  // p5.js マウスリリース
  private mouseReleased(_p: p5): void {
    if (this.handleManager.stop()) return;
  }

  // #region プライベート関数

  // ピクセル座標から正規化座標への変換
  private pixelToNormalized(x: number, y: number): { x: number; y: number } {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);

    const mouseX = x - this.margin.left;
    const mouseY = y - this.margin.top;
    const graphW = size - this.margin.left - this.margin.right;
    const graphH = size - this.margin.top - this.margin.bottom;

    const normX = mouseX / graphW;
    const normY = 1 - mouseY / graphH;

    return { x: normX, y: normY };
  }

  // 正規化座標からピクセル座標への変換
  private normalizedToPixel(
    normX: number,
    normY: number,
  ): { x: number; y: number } {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);

    const graphW = size - this.margin.left - this.margin.right;
    const graphH = size - this.margin.top - this.margin.bottom;

    return {
      x: normX * graphW + this.margin.left,
      y: (1 - normY) * graphH + this.margin.top,
    };
  }

  // 提案の生成
  private async generateSuggestion(): Promise<void> {
    const activePath = this.activePath;
    if (!activePath || activePath.timeCurve.length === 0) return;

    const userPrompt = this.dom.graphPromptInput.value;
    await this.suggestionManager.submit(
      { timeCurve: activePath.timeCurve },
      userPrompt,
    );
  }
}
