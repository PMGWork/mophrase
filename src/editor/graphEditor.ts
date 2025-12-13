import p5 from 'p5';
import type { Colors, Config } from '../config';
import { HandleManager } from '../core/handleManager';
import type { DomRefs } from '../dom';
import { GraphSuggestionManager } from '../suggestion/graphSuggestion';
import type { Path } from '../types';
import { drawBezierCurve, drawControls } from '../utils/draw';
import { isInRect, isLeftMouseButton } from '../utils/p5Helpers';

// グラフエディタ
export class GraphEditor {
  // データ
  private activePath: Path | null = null;
  private dom: DomRefs;

  // マネージャー
  private handleManager: HandleManager;
  private suggestionManager: GraphSuggestionManager;

  // 設定
  private config: Config;
  private colors: Colors;

  // 描画領域の設定
  private static readonly MARGIN = 30;
  private readonly margin = {
    top: GraphEditor.MARGIN,
    right: GraphEditor.MARGIN,
    bottom: GraphEditor.MARGIN,
    left: GraphEditor.MARGIN,
  };

  // コンストラクタ
  constructor(dom: DomRefs, config: Config, colors: Colors) {
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

    // 初期状態では入力不可
    this.dom.graphPromptInput.readOnly = true;
    this.dom.graphPromptInput.style.cursor = 'not-allowed';

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
      this.dom.graphPromptInput.readOnly = true;
      this.dom.graphPromptInput.style.cursor = 'not-allowed';
      return;
    }

    this.activePath = path;
    this.suggestionManager.open(path);
    this.dom.graphPromptInput.readOnly = false;
    this.dom.graphPromptInput.style.cursor = 'text';
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
      p.mouseReleased = () => this.mouseReleased();
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

    const width = p.width;
    const height = p.height;

    // グラフ領域の計算
    const graphW = width - this.margin.left - this.margin.right;
    const graphH = height - this.margin.top - this.margin.bottom;

    p.push();
    p.translate(this.margin.left, this.margin.top);

    // グリッド
    p.noFill();

    // 内側のグリッド線
    p.stroke(`${this.colors.border}80`);
    p.strokeWeight(0.5);
    const gridSize = 5;
    for (let i = 1; i < gridSize; i++) {
      const x = (graphW / gridSize) * i;
      const y = (graphH / gridSize) * i;
      p.line(x, 0, x, graphH);
      p.line(0, y, graphW, y);
    }

    // 外枠
    p.stroke(this.colors.border);
    p.strokeWeight(1);
    p.rect(0, 0, graphW, graphH);

    // パスが存在しない場合は描画しない
    if (!this.activePath) {
      p.pop();
      return;
    }

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
    if (this.handleManager.startDrag(p.mouseX, p.mouseY)) return;

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
    this.handleManager.updateDrag(p.mouseX, p.mouseY, dragMode);
  }

  // p5.js マウスリリース
  private mouseReleased(): void {
    if (this.handleManager.endDrag()) return;
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
