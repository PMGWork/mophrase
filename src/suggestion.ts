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

// 提案モード
export type SuggestionMode = 'sketch' | 'graph';

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
  private onSketchSuggestionSelect?: (path: Path, targetPath?: Path) => void;
  private onGraphSuggestionSelect?: (
    path: Pick<Path, 'timeCurve'>,
    targetPath?: Path,
  ) => void;

  // コンストラクタ
  constructor(
    config: Config,
    options: {
      onSketchSuggestionSelect?: (path: Path, targetPath?: Path) => void;
      onGraphSuggestionSelect?: (
        path: Pick<Path, 'timeCurve'>,
        targetPath?: Path,
      ) => void;
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

  // #region メイン関数

  // 提案を生成する (スケッチ)
  async generate(
    mode: 'sketch',
    input: Path,
    userPrompt?: string,
  ): Promise<void>;

  // 提案を生成する (グラフ)
  async generate(
    mode: 'graph',
    input: Pick<Path, 'timeCurve'>,
    userPrompt?: string,
  ): Promise<void>;

  // 提案を生成する
  async generate(
    mode: SuggestionMode,
    input: Path,
    userPrompt?: string,
  ): Promise<void> {
    if (mode === 'sketch') {
      await this.generateSketchSuggestion(input, userPrompt);
    } else {
      await this.generateGraphSuggestion(
        input as Pick<Path, 'timeCurve'>,
        userPrompt,
      );
    }
  }

  // スケッチ提案の生成
  private async generateSketchSuggestion(
    targetPath: Path,
    userPrompt?: string,
  ): Promise<void> {
    this.targetPath = targetPath;
    const serializedPaths = serializePaths([targetPath]);
    const path = serializedPaths[0];

    // 履歴に追加
    const trimmedPrompt = userPrompt?.trim() ?? '';
    if (trimmedPrompt) {
      this.sketchPromptHistory.push(trimmedPrompt);
    }

    // 提案を生成する
    await this.executeWithUI(
      () => this.updateSketchUI(),
      async () => {
        const items = await fetchSuggestions(
          serializedPaths,
          this.config.sketchPrompt,
          this.config,
          this.sketchPromptHistory,
        );

        this.suggestions = items.map((item) => ({
          id: this.generateId(),
          title: item.title,
          type: 'sketch',
          path: {
            anchors: item.anchors,
            segments: path.segments,
            bbox: path.bbox,
          },
        }));
      },
    );
  }

  // グラフ提案の生成
  private async generateGraphSuggestion(
    input: Pick<Path, 'timeCurve'>,
    userPrompt?: string,
  ): Promise<void> {
    const curves = input.timeCurve;
    if (curves.length === 0) {
      this.setState('error');
      return;
    }

    const bbox = { x: 0, y: 0, width: 1, height: 1 };
    const { anchors, segments } = serializeAnchorsAndSegments(curves, bbox);
    const serializedPath: SerializedPath = { anchors, segments, bbox };

    // 履歴に追加
    const trimmedPrompt = userPrompt?.trim() ?? '';
    if (trimmedPrompt) {
      this.graphPromptHistory.push(trimmedPrompt);
    }

    // 提案を生成する
    await this.executeWithUI(
      () => this.updateGraphUI(),
      async () => {
        const items = await fetchSuggestions(
          [serializedPath],
          this.config.graphPrompt || '',
          this.config,
          this.graphPromptHistory,
        );

        this.suggestions = items.map((item) => ({
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
        }));
      },
    );
  }

  // スケッチの入力ウィンドウを表示する
  showSketchInput(targetPath: Path): void {
    if (this.targetPath !== targetPath) {
      this.sketchPromptHistory = [];
    }
    this.targetPath = targetPath;
    this.setState('input');
    this.updateSketchUI();
    this.sketchUI.focusInput();
  }

  // グラフの入力ウィンドウを表示する
  showGraphInput(): void {
    this.setState('input');
    this.updateGraphUI();
    this.graphUI.focusInput();
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
        this.onGraphSuggestionSelect({ timeCurve: curves }, this.targetPath);
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
        this.onSketchSuggestionSelect(restored[0], this.targetPath);
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
