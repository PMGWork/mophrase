import p5 from 'p5';
import { encode } from '@toon-format/toon'

import type { Path, SerializedPath, Suggestion, SuggestionItem } from './types';
import type { Colors, Config } from './config';
import { suggestionResponseSchema } from './types';
import { generateStructured } from './llmService';
import { drawBezierCurve } from './draw';
import { deserializeCurves, serializePaths, deserializePaths, serializeAnchorsAndSegments } from './serialization';
import { SuggestionUI, positionUI } from './suggestionUI';


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
  private onSketchSuggestionSelect?: (paths: Path[], targetPath?: Path) => void;
  private onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;
  private pInstance: p5 | null = null;
  private sketchUI: SuggestionUI;
  private graphUI: SuggestionUI;

  // コンストラクタ
  constructor(
    config: Config,
    options: {
      onSketchSuggestionSelect?: (paths: Path[], targetPath?: Path) => void;
      onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;
    } = {}
  ) {
    this.config = config;
    this.onSketchSuggestionSelect = options.onSketchSuggestionSelect;
    this.onGraphSuggestionSelect = options.onGraphSuggestionSelect;
    this.sketchUI = new SuggestionUI(
      {
        containerId: 'sketchSuggestionContainer',
        listId: 'sketchSuggestionList',
        itemClass: 'px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer',
        position: positionUI
      },
      (id) => this.hoveredSuggestionId = id,
      (id) => this.selectSuggestionById(id)
    );
    this.graphUI = new SuggestionUI(
      {
        listId: 'graphSuggestionList',
        itemClass: 'w-full px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer'
      },
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
    this.sketchUI.update(this.status, this.suggestions, this.targetPath);

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
      this.sketchUI.update(this.status, this.suggestions, this.targetPath);
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.sketchUI.update(this.status, this.suggestions, this.targetPath);
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
    this.graphUI.update(this.status, this.suggestions);

    try {
      // カーブをシリアライズ
      const bbox = { x: 0, y: 0, width: 1, height: 1 };
      const { anchors, segments } = serializeAnchorsAndSegments(currentCurves, bbox);
      const serializedPath: SerializedPath = { anchors, segments, bbox };

      // 提案を取得
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
      this.graphUI.update(this.status, this.suggestions);
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.graphUI.update(this.status, this.suggestions);
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

  // 提案を描画する
  draw(p: p5, colors: Colors, options: { transform?: (v: p5.Vector) => p5.Vector } = {}): void {
    this.pInstance = p;
    if (this.status === 'loading') {
      return;
    }

    // ホバー中の提案を描画
    if (this.hoveredSuggestionId) {
      this.drawHoverPreview(p, colors, options.transform);
    }
  }


  // #region プライベート関数
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
  private drawHoverPreview(p: p5, colors: Colors, transform?: (v: p5.Vector) => p5.Vector): void {
    if (!this.hoveredSuggestionId) return;
    const suggestion = this.suggestions.find(entry => entry.id === this.hoveredSuggestionId);
    if (!suggestion) return;

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const previousDash = typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

    p.push();

    // プレビュー描画（共通ロジック）
    const curves = deserializeCurves(suggestion.path, p);
    const mapped = transform
      ? curves.map(curve => curve.map(pt => transform(pt.copy())))
      : curves;
    if (mapped.length > 0) {
      const weight = Math.max(this.config.lineWeight, 1) + 0.5;
      drawBezierCurve(p, mapped, weight, colors.handle);
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
      if (this.onSketchSuggestionSelect) {
        this.onSketchSuggestionSelect(restored, this.targetPath);
      }
    }

    // リセット
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
  }
}


// #region 汎用関数
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
