import p5 from 'p5';
import type { Colors, Config } from '../config';
import { HandleManager } from '../core/handleManager';
import type { DomRefs } from '../dom';
import { GraphSuggestionManager } from '../suggestion/graphSuggestion';
import type { Path } from '../types';
import { drawBezierCurve, drawControls } from '../utils/draw';
import { isLeftMouseButton } from '../utils/p5Helpers';

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

  // マージンを取得
  private getMargin(): number {
    return this.dom.sidebarContainer.clientWidth / 15;
  }

  // コンストラクタ
  constructor(dom: DomRefs, config: Config, colors: Colors) {
    this.dom = dom;
    this.config = config;
    this.colors = colors;

    // ハンドルマネージャー
    this.handleManager = new HandleManager(
      // アクティブパスのタイムカーブを取得
      () =>
        this.activePath ? [{ curves: this.activePath.motion.timing }] : [],

      // ピクセル座標から正規化座標への変換
      (x, y) => this.pixelToNorm(x, y),

      // 正規化座標からピクセル座標への変換
      (normX, normY) => this.normToPixel(normX, normY),
    );

    // 提案マネージャー
    this.suggestionManager = new GraphSuggestionManager(config, {
      onSelect: (path) => {
        if (this.activePath) this.activePath.motion.timing = path.timing;
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

  // パスの設定
  public setPath(path: Path | null): void {
    if (!path || !path.motion.timing.length) {
      this.activePath = null;
      this.suggestionManager.close();
      this.dom.graphPromptInput.readOnly = true;
      this.dom.graphPromptInput.style.cursor = 'not-allowed';
      this.dom.graphPlaceholder.style.display = 'flex';
      this.dom.graphEditorContent.style.display = 'none';
      return;
    }

    this.activePath = path;
    this.suggestionManager.open(path);
    this.dom.graphPromptInput.readOnly = false;
    this.dom.graphPromptInput.style.cursor = 'text';
    this.dom.graphPlaceholder.style.display = 'none';
    this.dom.graphEditorContent.style.display = 'flex';

    window.dispatchEvent(new Event('resize'));
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
    const size = Math.min(width, height);
    p.resizeCanvas(size, size);
  }

  // p5.js 描画
  private draw(p: p5): void {
    p.background(this.colors.background);

    const width = p.width;
    const height = p.height;

    // グラフ領域の計算
    const margin = this.getMargin();
    const graphW = width - margin * 2;
    const graphH = height - margin * 2;

    p.push();
    p.translate(margin, margin);

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
      this.activePath.motion.timing,
      2 / Math.min(graphW, graphH),
      this.colors.curve,
    );
    p.pop();

    // 制御点と制御ポリゴン
    drawControls(
      p,
      this.activePath.motion.timing,
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
    this.handleManager.startDrag(p.mouseX, p.mouseY);
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    // ハンドルのドラッグ
    const dragMode = p.keyIsDown(p.ALT) ? 1 : 0;
    this.handleManager.updateDrag(p.mouseX, p.mouseY, dragMode);
  }

  // p5.js マウスリリース
  private mouseReleased(): void {
    this.handleManager.endDrag();
  }

  // #region プライベート関数

  // ピクセル座標から正規化座標への変換
  private pixelToNorm(x: number, y: number): { x: number; y: number } {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    const margin = this.getMargin();

    const mouseX = x - margin;
    const mouseY = y - margin;
    const graphW = size - margin * 2;
    const graphH = size - margin * 2;

    const normX = mouseX / graphW;
    const normY = 1 - mouseY / graphH;

    return { x: normX, y: normY };
  }

  // 正規化座標からピクセル座標への変換
  private normToPixel(normX: number, normY: number): { x: number; y: number } {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    const margin = this.getMargin();

    const graphW = size - margin * 2;
    const graphH = size - margin * 2;

    return {
      x: normX * graphW + margin,
      y: (1 - normY) * graphH + margin,
    };
  }

  // 提案の生成
  private async generateSuggestion(): Promise<void> {
    const activePath = this.activePath;
    if (!activePath || activePath.motion.timing.length === 0) return;

    const userPrompt = this.dom.graphPromptInput.value;
    await this.suggestionManager.submit(
      { timing: activePath.motion.timing },
      userPrompt,
    );
  }
}
