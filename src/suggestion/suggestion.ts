import type p5 from 'p5';

import type { Colors, Config } from '../config';
import type {
  GraphModifier,
  Path,
  SelectionRange,
  SketchModifier,
  Suggestion,
  SuggestionState,
} from '../types';
import {
  buildSketchCurves,
  buildGraphCurves,
  computeKeyframeProgress,
} from '../utils/keyframes';
import { createSketchModifier, createGraphModifier } from '../utils/modifier';
import { slicePath } from '../utils/path';
import {
  deserializeCurves,
  deserializeGraphCurves,
  serializePaths,
} from '../utils/serialization';
import { fetchSuggestions } from './suggestionService';
import {
  drawSketchPreview,
  getPreviewGraphCurves as buildPreviewGraphCurves,
} from './suggestionPreview';
import { computeSuggestionPosition } from './ui';

// 型定義
type SuggestionManagerOptions = {
  onSelect?: (path: Path, targetPath?: Path) => void;
  onUIStateChange?: (state: SuggestionUIState) => void;
};

export type SuggestionUIState = {
  status: SuggestionState;
  promptCount: number;
  isVisible: boolean;
  suggestions: Suggestion[];
  position: { left: number; top: number } | null;
};

// 提案マネージャー
export class SuggestionManager {
  private config: Config;
  private status: SuggestionState = 'idle';
  private suggestions: Suggestion[] = [];
  private hoveredId: string | null = null;
  private hoveredStrength: number = 1;
  private pInstance: p5 | null = null;
  private prompts: string[] = [];
  private targetPath: Path | undefined;
  private onSelect?: (path: Path, targetPath?: Path) => void;
  private onUIStateChange?: (state: SuggestionUIState) => void;
  private selectionRange?: SelectionRange;

  // コンストラクタ
  constructor(config: Config, options: SuggestionManagerOptions = {}) {
    this.config = config;
    this.onSelect = options.onSelect;
    this.onUIStateChange = options.onUIStateChange;
  }

  // #region パブリックメソッド

  // 設定を更新
  updateConfig(config: Config): void {
    this.config = config;
  }

  // 提案UIを開く
  open(targetPath?: Path): void {
    this.clearSuggestions();
    this.prompts = [];
    this.targetPath = targetPath;
    this.setState('input');
    this.updateUI();
  }

  // 提案UIを閉じる
  close(): void {
    this.clearSuggestions();
    this.prompts = [];
    this.targetPath = undefined;
    this.setState('idle');
    this.updateUI();
  }

  // 選択範囲を設定してUIを更新
  updateSelectionRange(selectionRange?: SelectionRange): void {
    this.selectionRange = selectionRange;
    this.updateUI();
  }

  // 提案を送信
  async submit(
    path: Path,
    prompt?: string,
    selectionRange?: SelectionRange,
  ): Promise<void> {
    await this.generateSuggestion(path, prompt, selectionRange);
  }

  // 提案をプレビュー
  preview(
    p: p5,
    colors: Colors,
    options: { transform?: (v: p5.Vector) => p5.Vector } = {},
  ): void {
    this.pInstance = p;
    if (this.status === 'generating') return;
    if (!this.hoveredId) return;

    const suggestion = this.suggestions.find((s) => s.id === this.hoveredId);
    if (!suggestion || !this.targetPath) return;

    drawSketchPreview({
      p,
      colors,
      config: this.config,
      suggestion,
      targetPath: this.targetPath,
      selectionRange: this.selectionRange,
      strength: this.hoveredStrength,
      transform: options.transform,
    });
  }

  // プレビュー用の時間カーブを取得
  public getPreviewGraphCurves(
    p: p5,
  ): { curves: p5.Vector[][]; strength: number } | null {
    if (!this.hoveredId || !this.targetPath || !this.pInstance) return null;

    const suggestion = this.suggestions.find((s) => s.id === this.hoveredId);
    if (!suggestion) return null;
    return buildPreviewGraphCurves({
      p,
      suggestion,
      targetPath: this.targetPath,
      selectionRange: this.selectionRange,
      strength: this.hoveredStrength,
    });
  }

  // #region プライベートメソッド

  // 提案を設定
  private setSuggestions(suggestions: Suggestion[]): void {
    this.suggestions = suggestions;
  }

  // 提案をクリア
  private clearSuggestions(): void {
    this.suggestions = [];
    this.hoveredId = null;
  }

  // 状態を更新
  private setState(state: SuggestionState): void {
    this.status = state;
  }

  // UIの更新
  private updateUI(): void {
    const showLoading = this.status === 'generating';
    const showSketchInput = this.status === 'input';
    const hasSuggestions = this.suggestions.length > 0;
    const position = computeSuggestionPosition({
      targetPath: this.targetPath,
      selectionRange: this.selectionRange,
    });
    this.onUIStateChange?.({
      status: this.status,
      promptCount: this.prompts.length,
      isVisible: showLoading || showSketchInput || hasSuggestions,
      suggestions: this.suggestions,
      position,
    });
  }

  // 提案を生成
  private async generateSuggestion(
    path: Path,
    prompt?: string,
    selectionRange?: SelectionRange,
  ): Promise<void> {
    this.targetPath = path;
    this.selectionRange = selectionRange;

    // 部分パスを作成（シリアライズ用）
    const partialPath = slicePath(path, selectionRange);
    const serializedPaths = serializePaths([partialPath]);
    const serializedPath = serializedPaths[0];

    // プロンプトの保存
    const trimmedPrompt = prompt?.trim() ?? '';
    if (trimmedPrompt) this.prompts.push(trimmedPrompt);

    // 提案のクリア
    this.clearSuggestions();
    this.setState('generating');
    this.updateUI();

    // 提案の生成
    try {
      const items = await fetchSuggestions(
        serializedPaths,
        this.config.keyframePrompt,
        this.config,
        this.prompts,
      );

      const suggestions: Suggestion[] = items.map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        path: {
          keyframes: item.keyframes,
          bbox: serializedPath.bbox,
        },
      }));

      this.setSuggestions(suggestions);
      this.setState('idle');
    } catch (error) {
      console.error(error);
      this.setState('error');
    }

    this.updateUI();
  }

  // 選択
  private selectById(id: string, strength: number): void {
    const suggestion = this.suggestions.find((s) => s.id === id);
    if (!suggestion) return;

    if (!this.targetPath || !this.pInstance) {
      this.setState('error');
      this.updateUI();
      return;
    }

    // ターゲットのカーブを取得
    const originalCurves = buildSketchCurves(this.targetPath.keyframes);

    // LLM出力をcurvesにデシリアライズ
    const llmCurves = deserializeCurves(suggestion.path, this.pInstance);
    if (llmCurves.length === 0) {
      this.setState('error');
      this.updateUI();
      return;
    }

    // 時間カーブを取得
    // 全体の進行度を計算
    const allProgress = computeKeyframeProgress(
      this.targetPath.keyframes,
      originalCurves,
    );

    let referenceKeyframes = this.targetPath.keyframes;
    let referenceProgress = allProgress;

    if (this.selectionRange) {
      const sliced = slicePath(this.targetPath, this.selectionRange);
      referenceKeyframes = sliced.keyframes;

      // progress も同様にスライス
      const start = Math.max(0, this.selectionRange.startCurveIndex);
      const end = Math.min(
        this.targetPath.keyframes.length - 2,
        this.selectionRange.endCurveIndex,
      );
      if (start <= end) {
        referenceProgress = allProgress.slice(start, end + 2);
      }
    }

    const originalGraphCurves = buildGraphCurves(
      this.targetPath.keyframes,
      allProgress,
    );
    const llmGraphCurves = deserializeGraphCurves(
      suggestion.path.keyframes,
      referenceKeyframes,
      referenceProgress,
      this.pInstance,
    );

    // modifier名を設定
    const modifierName =
      this.prompts[this.prompts.length - 1] || suggestion.title;

    // SketchModifier を作成
    const sketchModifier = createSketchModifier(
      originalCurves,
      llmCurves,
      modifierName,
      this.selectionRange,
    );
    sketchModifier.strength = strength;

    // GraphModifier を作成（時間カーブの差分がある場合のみ）
    let graphModifier: GraphModifier | null = null;
    if (llmGraphCurves.length > 0) {
      graphModifier = createGraphModifier(
        originalGraphCurves,
        llmGraphCurves,
        modifierName,
        this.selectionRange,
      );
      graphModifier.strength = strength;
    }

    console.log('Applied SketchModifier:', sketchModifier);
    if (graphModifier) {
      console.log('Applied GraphModifier:', graphModifier);
    }

    // パスにmodifierを追加
    this.addModifiersToPath(this.targetPath, sketchModifier, graphModifier);

    this.onSelect?.(this.targetPath, this.targetPath);

    this.clearSuggestions();
    this.setState('input');
    this.updateUI();
  }

  // パスにmodifierを追加
  private addModifiersToPath(
    path: Path,
    sketchModifier: SketchModifier,
    graphModifier: GraphModifier | null,
  ): void {
    if (!path.sketchModifiers) {
      path.sketchModifiers = [];
    }
    path.sketchModifiers.push(sketchModifier);

    if (graphModifier) {
      if (!path.graphModifiers) {
        path.graphModifiers = [];
      }
      path.graphModifiers.push(graphModifier);
    }
  }

  // Hover状態を設定
  public setHover(id: string | null, strength: number): void {
    this.hoveredId = id;
    this.hoveredStrength = strength;
  }

  // UIからの選択
  public selectSuggestion(id: string, strength: number): void {
    this.selectById(id, strength);
  }
}
