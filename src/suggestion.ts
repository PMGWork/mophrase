import p5 from 'p5';
import { encode } from '@toon-format/toon'

import type { Path, SerializedPath, Suggestion, SuggestionItem } from './types';
import type { Colors, Config } from './config';
import { suggestionResponseSchema } from './types';
import { generateStructured } from './llmService';
import { drawBezierCurve } from './draw';
import { deserializeCurves, serializePaths, deserializePaths, serializeAnchorsAndSegments } from './serialization';
import { SketchSuggestionUI, GraphSuggestionUI } from './suggestionUI';


// #region 提案マネージャー
// 提案の状態（内部でのみ使用）
type SuggestionState = 'idle' | 'loading' | 'error';

// 提案管理クラス
export class SuggestionManager {
  private suggestions: Suggestion[] = [];
  private status: SuggestionState = 'idle';
  private config: Config;
  private targetPath: Path | undefined;
  private hoveredSuggestionId: string | null = null;
  private onSuggestionSelect?: (paths: Path[], targetPath?: Path) => void;
  private onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;
  private pInstance: p5 | null = null;
  private strokeScale: number = 1;
  private sketchUI: SketchSuggestionUI;
  private graphUI: GraphSuggestionUI;

  constructor(
    config: Config,
    options: {
      onSuggestionSelect?: (paths: Path[], targetPath?: Path) => void;
      onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;
    } = {}
  ) {
    this.config = config;
    this.onSuggestionSelect = options.onSuggestionSelect;
    this.onGraphSuggestionSelect = options.onGraphSuggestionSelect;
    this.sketchUI = new SketchSuggestionUI(
      (id) => this.hoveredSuggestionId = id,
      (id) => this.selectSuggestionById(id)
    );
    this.graphUI = new GraphSuggestionUI(
      (id) => this.hoveredSuggestionId = id,
      (id) => this.selectSuggestionById(id)
    );
  }

  // 設定を更新する
  updateConfig(config: Config): void {
    this.config = config;
  }

  // 提案を生成する
  async generate(targetPath: Path, userPrompt?: string): Promise<void> {
    if (!targetPath) {
      this.setState('error');
      return;
    }

    this.targetPath = targetPath;
    const trimmedUserPrompt = userPrompt?.trim() ?? '';

    this.clear();
    this.setState('loading');
    this.sketchUI.updateUI(this.status, this.suggestions, this.targetPath);

    try {
      // パスをシリアライズ
      const serializedPaths = serializePaths([targetPath]);

      // LLM から提案を取得
      const fetched = await fetchSuggestions(
        serializedPaths,
        this.config.sketchPrompt,
        this.config,
        trimmedUserPrompt
      );

      // 提案を保存
      const path = serializedPaths[0];
      this.suggestions = fetched.map((item): Suggestion => ({
        id: this.generateId(),
        title: item.title,
        type: 'sketch',
        path: {
          anchors: item.anchors,
          segments: path.segments,
          bbox: path.bbox,
        }
      }));
      this.setState('idle');
      this.sketchUI.updateUI(this.status, this.suggestions, this.targetPath);
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.sketchUI.updateUI(this.status, this.suggestions, this.targetPath);
    }
  }

  // グラフカーブの提案を生成する
  async generateGraphSuggestion(currentCurves: p5.Vector[][], userPrompt?: string): Promise<void> {
    console.log('SuggestionManager: generateGraphSuggestion called', { currentCurves, userPrompt });
    if (!currentCurves || currentCurves.length === 0) {
      console.error('SuggestionManager: Invalid curve data');
      this.setState('error');
      return;
    }

    this.setState('loading');
    this.suggestions = [];
    this.graphUI.updateUI(this.status, this.suggestions);

    try {
      // 現在のカーブをシリアライズ
      // GraphEditorのカーブは (0,0) -> (1,1) の空間にあると仮定
      // バウンディングボックスは常に (0,0,1,1) とする
      const bbox = { x: 0, y: 0, width: 1, height: 1 };
      const { anchors, segments } = serializeAnchorsAndSegments(currentCurves, bbox);
      const serializedPath: SerializedPath = { anchors, segments, bbox };

      // LLM から提案を取得
      const fetched = await fetchSuggestions(
        [serializedPath],
        this.config.graphPrompt || '',
        this.config,
        userPrompt
      );

      // 提案を保存
      this.suggestions = fetched.map((item): Suggestion => ({
        id: this.generateId(),
        title: item.title,
        type: 'graph',
        path: {
          anchors: item.anchors,
          segments: item.anchors.slice(0, -1).map((_, i) => ({ startIndex: i, endIndex: i + 1 })),
          bbox: bbox
        }
      }));
      this.setState('idle');
      this.graphUI.updateUI(this.status, this.suggestions);
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.graphUI.updateUI(this.status, this.suggestions);
    }
  }

  // 提案をリセットする
  reset(): void {
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
    this.sketchUI.hide();
    this.graphUI.hide();
  }

  // UI位置を設定する
  setPosition(x: number, y: number): void {
    this.sketchUI.setPosition(x, y);
  }

  // 提案を描画する（プレビューのみ）
  draw(p: p5, colors: Colors, options: { strokeScale?: number } = {}): void {
    this.pInstance = p;
    this.strokeScale = options.strokeScale ?? 1;
    if (this.status === 'loading') {
      return;
    }

    // ホバー中の提案のプレビューを描画
    if (this.hoveredSuggestionId) {
      this.drawHoverPreview(p, colors, this.strokeScale);
    }
  }

  // 状態を更新する
  private setState(state: SuggestionState): void {
    this.status = state;
  }

  // 提案をクリアする
  private clear(): void {
    this.suggestions = [];
    this.hoveredSuggestionId = null;
  }

  // 一意な提案IDを生成する
  private generateId(): string {
    return crypto.randomUUID();
  }

  // ホバー中の提案プレビューを描画する
  private drawHoverPreview(p: p5, colors: Colors, strokeScale: number): void {
    if (!this.hoveredSuggestionId) return;
    const suggestion = this.suggestions.find(entry => entry.id === this.hoveredSuggestionId);
    if (!suggestion) return;

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const previousDash = typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

    p.push();

    // プレビュー描画（共通ロジック）
    const curves = deserializeCurves(suggestion.path, p);
    if (curves.length > 0) {
      const weight = (Math.max(this.config.lineWeight, 1) + 0.5) * strokeScale;
      drawBezierCurve(p, curves, weight, colors.handle);
    }

    p.pop();

    if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
  }

  // IDで提案を選択
  private selectSuggestionById(id: string): void {
    const suggestion = this.suggestions.find(s => s.id === id);
    if (!suggestion) return;

    if (suggestion.type === 'graph') {
      if (this.onGraphSuggestionSelect) {
        // パスからカーブデータを復元
        // pInstanceが必要だが、drawで設定されているはず
        if (!this.pInstance) return;
        const curves = deserializeCurves(suggestion.path, this.pInstance);
        this.onGraphSuggestionSelect(curves); // Vector[][] を渡す
      }
    } else if (suggestion.type === 'sketch' && this.targetPath && this.pInstance) {
      const restored = deserializePaths([suggestion.path], [this.targetPath], this.pInstance);
      if (restored.length === 0) {
        this.setState('error');
        return;
      }

      // コールバックを呼び出す
      if (this.onSuggestionSelect) {
        this.onSuggestionSelect(restored, this.targetPath);
      }
    }

    // リセット
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
    // リセット後はUIを更新しない（hide で対応済み）
  }
}


// #region プライベート関数
// LLM から提案を取得する (共通)
async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  config: Config,
  userPrompt?: string
): Promise<SuggestionItem[]> {
  const prompt = buildPrompt(serializedPaths, basePrompt, userPrompt);
  const result = await generateStructured(prompt, suggestionResponseSchema, config.llmProvider, config.llmModel) as any;
  return result.suggestions.map((suggestion: any): SuggestionItem => ({
    title: suggestion.title,
    anchors: suggestion.anchors,
  }));
}

// プロンプトを構築する
function buildPrompt(serializedPaths: SerializedPath[], basePrompt: string, userPrompt?: string): string {
  const promptParts = [basePrompt];
  const trimmedUserPrompt = userPrompt?.trim();
  if (trimmedUserPrompt) {
    promptParts.push('', '## 追加のユーザー指示', trimmedUserPrompt);
  }
  promptParts.push('', '```toon', encode(serializedPaths), '```');

  return promptParts.join('\n');
}
