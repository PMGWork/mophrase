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
  private promptHistory: string[] = [];

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
    const trimmedUserPrompt = userPrompt?.trim() ?? '';

    // 履歴に追加
    if (trimmedUserPrompt) {
      this.promptHistory.push(trimmedUserPrompt);
    }

    this.clearSuggestions();
    this.setState('generating');
    this.sketchUI.update(
      this.status,
      this.suggestions,
      this.targetPath,
      this.promptHistory.length,
    );

    try {
      // シリアライズ
      const serializedPaths = serializePaths([targetPath]);

      // 提案を取得
      const fetched = await fetchSuggestions(
        serializedPaths,
        this.config.sketchPrompt,
        this.config,
        this.promptHistory,
      );

      // 提案を保存
      const path = serializedPaths[0];
      this.suggestions = fetched.map(
        (item): Suggestion => ({
          id: this.generateId(),
          title: item.title,
          type: 'sketch',
          path: {
            anchors: item.anchors,
            segments: path.segments,
            bbox: path.bbox,
          },
        }),
      );

      this.setState('idle');
      this.sketchUI.update(
        this.status,
        this.suggestions,
        this.targetPath,
        this.promptHistory.length,
      );
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.sketchUI.update(
        this.status,
        this.suggestions,
        this.targetPath,
        this.promptHistory.length,
      );
    }
  }

  // 入力ウィンドウを表示する
  showInput(targetPath: Path): void {
    if (this.targetPath !== targetPath) {
      this.promptHistory = [];
    }
    this.targetPath = targetPath;
    this.setState('input');
    this.sketchUI.update(
      this.status,
      this.suggestions,
      this.targetPath,
      this.promptHistory.length,
    );
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

    this.setState('generating');
    this.suggestions = [];
    this.graphUI.update(this.status, this.suggestions);

    try {
      // カーブをシリアライズ
      const bbox = { x: 0, y: 0, width: 1, height: 1 };
      const { anchors, segments } = serializeAnchorsAndSegments(
        currentCurves,
        bbox,
      );
      const serializedPath: SerializedPath = { anchors, segments, bbox };

      // 提案を取得
      const promptHistory = userPrompt?.trim() ? [userPrompt.trim()] : [];
      const fetched = await fetchSuggestions(
        [serializedPath],
        this.config.graphPrompt || '',
        this.config,
        promptHistory,
      );

      // 提案を保存
      this.suggestions = fetched.map(
        (item): Suggestion => ({
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
      );

      // UIを更新
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
    this.clearSuggestions();
    this.promptHistory = [];
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

  // ホバー中のプレビューを描画する
  private drawPreview(
    p: p5,
    colors: Colors,
    transform?: (v: p5.Vector) => p5.Vector,
  ): void {
    if (!this.hoveredId) return;
    const suggestion = this.suggestions.find(
      (entry) => entry.id === this.hoveredId,
    );
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

      // グラフ提案の場合はリセット
      this.clearSuggestions();
      this.promptHistory = [];
      this.targetPath = undefined;
      this.setState('idle');
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
      this.sketchUI.update(
        this.status,
        this.suggestions,
        this.targetPath,
        this.promptHistory.length,
      );
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
    promptParts.push('', '## ユーザー指示の履歴');
    promptHistory.forEach((prompt, index) => {
      const label =
        index === promptHistory.length - 1 ? '現在の指示' : `指示${index + 1}`;
      promptParts.push(`- **${label}**: ${prompt}`);
    });
    promptParts.push('');
    promptParts.push(
      '上記の履歴を踏まえ、特に最新の「現在の指示」に従ってパスを修正してください。',
    );
  }

  promptParts.push('', '```toon', encode(serializedPaths), '```');

  return promptParts.join('\n');
}
