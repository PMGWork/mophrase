import { encode } from '@toon-format/toon';
import type p5 from 'p5';

import type { Colors, Config } from './config';
import { drawBezierCurve } from './draw';
import { generateStructured } from './llmService';
import {
  deserializeCurves,
  deserializePaths,
  serializeAnchorsAndSegments,
  serializePaths,
} from './serialization';
import { positionUI, SuggestionUI } from './suggestionUI';
import type {
  Path,
  SerializedPath,
  Suggestion,
  SuggestionItem,
  SuggestionResponse,
  SuggestionState,
} from './types';
import { suggestionResponseSchema } from './types';

// #region 提案マネージャー

// 提案管理クラス
export class SuggestionManager {
  // 設定
  private config: Config;

  // 状態管理
  private status: SuggestionState = 'idle';
  private suggestions: Suggestion[] = [];
  private targetPath: Path | undefined;
  private hoveredId: string | null = null;
  private pInstance: p5 | null = null;

  // 履歴管理
  private sketchPromptHistory: string[] = [];
  private graphPromptHistory: string[] = [];

  // UI
  private sketchUI: SuggestionUI;
  private graphUI: SuggestionUI;

  // コールバック
  private onSketchSuggestionSelect?: (paths: Path[], targetPath?: Path) => void;
  private onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;

  // コンストラクタ
  constructor(
    config: Config,
    options: {
      onSketchSuggestionSelect?: (paths: Path[], targetPath?: Path) => void;
      onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;
    } = {},
  ) {
    this.config = config;
    this.onSketchSuggestionSelect = options.onSketchSuggestionSelect;
    this.onGraphSuggestionSelect = options.onGraphSuggestionSelect;
    this.sketchUI = new SuggestionUI(
      {
        containerId: 'sketchSuggestionContainer',
        listId: 'sketchSuggestionList',
        inputId: 'userPromptInput',
        itemClass:
          'px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer',
        position: positionUI,
      },
      (id) => {
        this.hoveredId = id;
      },
      (id) => this.selectById(id),
    );
    this.graphUI = new SuggestionUI(
      {
        listId: 'graphSuggestionList',
        inputId: 'graphUserPromptInput',
        itemClass:
          'w-full px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer',
      },
      (id) => {
        this.hoveredId = id;
      },
      (id) => this.selectById(id),
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
    const serializedPaths = serializePaths([targetPath]);
    const path = serializedPaths[0];

    await this.executeGeneration({
      userPrompt,
      promptHistory: this.sketchPromptHistory,
      updateUI: () => this.updateSketchUI(),
      basePrompt: this.config.sketchPrompt,
      serializedPaths,
      createSuggestion: (item) => ({
        id: this.generateId(),
        title: item.title,
        type: 'sketch',
        path: {
          anchors: item.anchors,
          segments: path.segments,
          bbox: path.bbox,
        },
      }),
    });
  }

  // 入力ウィンドウを表示する
  showInput(targetPath: Path): void {
    if (this.targetPath !== targetPath) {
      this.sketchPromptHistory = [];
    }
    this.targetPath = targetPath;
    this.setState('input');
    this.updateSketchUI();
    this.focusInput('userPromptInput');
  }

  // グラフの入力ウィンドウを表示する
  showGraphInput(): void {
    this.setState('input');
    this.updateGraphUI();
    this.focusInput('graphUserPromptInput');
  }

  // グラフカーブの提案を生成する
  async generateGraphSuggestions(
    currentCurves: p5.Vector[][],
    userPrompt?: string,
  ): Promise<void> {
    if (!currentCurves || currentCurves.length === 0) {
      this.setState('error');
      return;
    }

    const bbox = { x: 0, y: 0, width: 1, height: 1 };
    const { anchors, segments } = serializeAnchorsAndSegments(
      currentCurves,
      bbox,
    );
    const serializedPath: SerializedPath = { anchors, segments, bbox };

    await this.executeGeneration({
      userPrompt,
      promptHistory: this.graphPromptHistory,
      updateUI: () => this.updateGraphUI(),
      basePrompt: this.config.graphPrompt || '',
      serializedPaths: [serializedPath],
      createSuggestion: (item) => ({
        id: this.generateId(),
        title: item.title,
        type: 'graph',
        path: {
          anchors: item.anchors,
          segments: item.anchors
            .slice(0, -1)
            .map((_, i) => ({ startIndex: i, endIndex: i + 1 })),
          bbox: bbox,
        },
      }),
    });
  }

  // 提案を生成する
  private async executeGeneration(options: {
    userPrompt?: string;
    promptHistory: string[];
    updateUI: () => void;
    basePrompt: string;
    serializedPaths: SerializedPath[];
    createSuggestion: (item: SuggestionItem) => Suggestion;
  }): Promise<void> {
    const trimmedUserPrompt = options.userPrompt?.trim() ?? '';

    // 履歴に追加
    if (trimmedUserPrompt) {
      options.promptHistory.push(trimmedUserPrompt);
    }

    // UIを更新しながら提案を取得
    await this.executeWithUI(options.updateUI, async () => {
      const fetched = await fetchSuggestions(
        options.serializedPaths,
        options.basePrompt,
        this.config,
        options.promptHistory,
      );

      this.suggestions = fetched.map(options.createSuggestion);
    });
  }

  // 提案をリセットする
  reset(): void {
    this.clearSuggestions();
    this.sketchPromptHistory = [];
    this.targetPath = undefined;
    this.setState('idle');
    this.sketchUI.hide();
    this.graphUI.hide();
  }

  // 提案を描画する
  draw(
    p: p5,
    colors: Colors,
    options: { transform?: (v: p5.Vector) => p5.Vector } = {},
  ): void {
    this.pInstance = p;
    if (this.status === 'generating') {
      return;
    }

    // ホバー中の提案を描画
    if (this.hoveredId) {
      this.drawPreview(p, colors, options.transform);
    }
  }

  // #region プライベート関数
  // 状態を更新する
  private setState(state: SuggestionState): void {
    this.status = state;
  }

  // 提案をクリアする
  private clearSuggestions(): void {
    this.suggestions = [];
    this.hoveredId = null;
  }

  // 一意な提案IDを生成する
  private generateId(): string {
    return crypto.randomUUID();
  }

  // スケッチUIを更新する
  private updateSketchUI(): void {
    this.sketchUI.update(
      this.status,
      this.suggestions,
      this.targetPath,
      this.sketchPromptHistory.length,
    );
  }

  // グラフUIを更新する
  private updateGraphUI(): void {
    this.graphUI.update(
      this.status,
      this.suggestions,
      undefined,
      this.graphPromptHistory.length,
    );
  }

  // フォーカスヘルパー
  private focusInput(elementId: string): void {
    const el = document.getElementById(elementId) as HTMLInputElement | null;
    if (el) requestAnimationFrame(() => el.focus());
  }

  // 提案生成の共通処理
  private async executeWithUI(
    updateUI: () => void,
    fetchFn: () => Promise<void>,
  ): Promise<void> {
    this.clearSuggestions();
    this.setState('generating');
    updateUI();

    try {
      await fetchFn();
      this.setState('idle');
    } catch (error) {
      console.error(error);
      this.setState('error');
    }
    updateUI();
  }

  // ホバー中のプレビューを描画する
  private drawPreview(
    p: p5,
    colors: Colors,
    transform?: (v: p5.Vector) => p5.Vector,
  ): void {
    const suggestion = this.suggestions.find((s) => s.id === this.hoveredId);
    if (!suggestion) return;

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const previousDash =
      typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

    p.push();

    // プレビュー描画
    const curves = deserializeCurves(suggestion.path, p);
    const mapped = transform
      ? curves.map((curve) => curve.map((pt) => transform(pt.copy())))
      : curves;
    if (mapped.length > 0) {
      const weight = Math.max(this.config.lineWeight, 1) + 0.5;
      drawBezierCurve(p, mapped, weight, colors.handle);
    }

    p.pop();

    if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
  }

  // IDで提案を選択
  private selectById(id: string): void {
    const suggestion = this.suggestions.find((s) => s.id === id);
    if (!suggestion) return;

    if (suggestion.type === 'graph') {
      if (this.onGraphSuggestionSelect) {
        if (!this.pInstance) return;
        const curves = deserializeCurves(suggestion.path, this.pInstance);
        this.onGraphSuggestionSelect(curves);
      }

      // グラフ提案の場合は入力待ち状態に戻す
      this.clearSuggestions();
      this.setState('input');
      this.updateGraphUI();
    } else if (
      suggestion.type === 'sketch' &&
      this.targetPath &&
      this.pInstance
    ) {
      const restored = deserializePaths(
        [suggestion.path],
        [this.targetPath],
        this.pInstance,
      );
      if (restored.length === 0) {
        this.setState('error');
        return;
      }

      // コールバックを呼び出す
      if (this.onSketchSuggestionSelect) {
        this.onSketchSuggestionSelect(restored, this.targetPath);
      }

      // スケッチ提案の場合は入力待ち状態に戻す
      this.clearSuggestions();
      this.setState('input');
      this.updateSketchUI();
    }
  }
}

// #region 汎用関数
// LLM から提案を取得する
async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  config: Config,
  promptHistory: string[],
): Promise<SuggestionItem[]> {
  const prompt = buildPrompt(serializedPaths, basePrompt, promptHistory);
  const result = await generateStructured<SuggestionResponse>(
    prompt,
    suggestionResponseSchema,
    config.llmProvider,
    config.llmModel,
  );

  return result.suggestions.map(
    (suggestion): SuggestionItem => ({
      title: suggestion.title,
      anchors: suggestion.anchors,
    }),
  );
}

// プロンプトを構築する
function buildPrompt(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  promptHistory: string[],
): string {
  const promptParts = [basePrompt];

  // 履歴がある場合は会話形式で追加
  if (promptHistory.length > 0) {
    promptParts.push(
      '',
      '## ユーザー指示の履歴',
      ...promptHistory.map(
        (p, i) =>
          `- **${i === promptHistory.length - 1 ? '現在の指示' : `指示${i + 1}`}**: ${p}`,
      ),
      '',
      '上記の履歴を踏まえ、特に最新の「現在の指示」に従ってパスを修正してください。',
    );
  }

  promptParts.push('', '```toon', encode(serializedPaths), '```');

  return promptParts.join('\n');
}
