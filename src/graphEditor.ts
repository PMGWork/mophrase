import p5 from 'p5';
import type { Colors, Config } from './config';
import type { DOMManager } from './domManager';
import { drawBezierCurve, drawControls } from './draw';
import { HandleManager } from './handleManager';
import { isLeftMouseButton } from './p5Utils';
import { SuggestionManager } from './suggestion';
import type { Path, Vector } from './types';

// グラフエディタ
export class GraphEditor {
  // データ構造
  private activePath: Path | null = null;

  // マネージャー
  private dom: DOMManager;
  private handleManager!: HandleManager;
  private suggestionManager: SuggestionManager;

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
  constructor(domManager: DOMManager, config: Config, colors: Colors) {
    this.dom = domManager;
    this.config = config;
    this.colors = colors;

    // p5.jsの初期化
    this.init();

    // 提案マネージャー
    this.suggestionManager = new SuggestionManager(config, {
      onGraphSuggestionSelect: (path) => {
        this.applySuggestion(path);
      },
    });

    // Duration更新
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
    this.dom.graphEditorContainer.classList.toggle('hidden');
    window.dispatchEvent(new Event('resize'));
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;
    if (!path || !path.times.length) return;

    const duration = path.times[path.times.length - 1] - path.times[0];
    this.dom.durationInput.value = Math.round(duration).toString();
    this.suggestionManager.start('graph');
  }

  // #region プライベート関数

  // Durationの更新
  private updateDuration(): void {
    const activePath = this.activePath;
    if (!activePath) return;
    const { times } = activePath;
    if (!times.length) return;

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
    const activePath = this.activePath;
    if (!activePath || activePath.timeCurve.length === 0) return;

    const userPrompt = this.dom.graphUserPromptInput.value;
    await this.suggestionManager.generate(
      'graph',
      { timeCurve: activePath.timeCurve },
      userPrompt,
    );
  }

  // 提案の適用
  private applySuggestion(path: Pick<Path, 'timeCurve'>): void {
    if (!this.activePath) return;
    this.activePath.timeCurve = path.timeCurve;
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

    // アクティブパスのカーブを取得
    const getActiveCurves = (): { curves: Vector[][] }[] =>
      this.activePath ? [{ curves: this.activePath.timeCurve }] : [];

    // ピクセル座標から正規化座標への変換
    const pixelToNormalized = (x: number, y: number) =>
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
      pixelToNormalized,
      normalizedToPixel,
    );
  }

  // p5.js サイズ変更
  private windowResized(p: p5): void {
    const { width, height } = this.dom.getGraphCanvasSize();
    const size = Math.min(width, height);
    p.resizeCanvas(size, size);
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
  }

  // p5.js マウス押下
  private mousePressed(p: p5): void {
    const isLeftClick = isLeftMouseButton(p.mouseButton, p.LEFT);
    if (!isLeftClick) return;

    if (this.inGraph(p))
      if (this.handleManager.start(p.mouseX, p.mouseY)) return;
  }

  // p5.js マウスドラッグ
  private mouseDragged(p: p5): void {
    const mode = p.keyIsDown(p.SHIFT) ? 0 : this.config.defaultDragMode;
    this.handleManager.drag(p.mouseX, p.mouseY, mode);
  }

  // p5.js マウスリリース
  private mouseReleased(_p: p5): void {
    if (this.handleManager.stop()) return;
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
  private inGraph(p: p5): boolean {
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
