/**
 * 提案マネージャー。
 * LLM による提案の生成・管理・プレビュー・選択を担当する。
 */

import type p5 from 'p5';

import type { Colors, Config } from '../config';
import type {
  GraphModifier,
  ModifierTarget,
  Path,
  SelectionRange,
  SketchModifier,
  Suggestion,
  SuggestionStatus,
} from '../types';
import { slicePath } from '../utils/path';
import {
  serializePaths,
} from '../utils/serialization/curves';
import { fetchSuggestions } from './suggestionService';
import {
  buildSuggestionModifiers,
  drawSketchPreview,
  getPreviewGraphCurves as buildPreviewGraphCurves,
} from './suggestionPreview';
import { computeSuggestionPosition } from './ui';

const SINGLE_TARGET_CONFIDENCE_THRESHOLD = 0.6;

// 型定義
type SuggestionManagerOptions = {
  onSelect?: (path: Path, targetPath?: Path) => void;
  onUIStateChange?: (state: SuggestionUIState) => void;
};

// 提案UIの状態
export type SuggestionUIState = {
  status: SuggestionStatus;
  promptCount: number;
  isVisible: boolean;
  suggestions: Suggestion[];
  position: { left: number; top: number } | null;
};

// 送信用画像プロバイダーの型
export type GraphImageProvider = (
  path?: Path,
  selectionRange?: SelectionRange,
) => string | null;

// 提案マネージャー
export class SuggestionManager {
  private config: Config;
  private status: SuggestionStatus = 'idle';
  private suggestions: Suggestion[] = [];
  private generationId: number = 0;
  private hoveredId: string | null = null;
  private hoveredStrength: number = 1;
  private pInstance: p5 | null = null;
  private prompts: string[] = [];
  private targetPath: Path | undefined;
  private onSelect?: (path: Path, targetPath?: Path) => void;
  private onUIStateChange?: (state: SuggestionUIState) => void;
  private selectionRange?: SelectionRange;
  private graphImageProvider?: GraphImageProvider;

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

  // 送信用画像プロバイダーを設定
  setGraphImageProvider(provider: GraphImageProvider): void {
    this.graphImageProvider = provider;
  }

  // 提案UIを開く
  open(targetPath?: Path): void {
    this.cancelInFlightGeneration();
    this.clearSuggestions();
    this.prompts = [];
    this.targetPath = targetPath;
    this.setState('input');
    this.updateUI();
  }

  // 提案UIを閉じる
  close(): void {
    this.cancelInFlightGeneration();
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
    const modifierTarget = this.resolveModifierTarget(suggestion);

    drawSketchPreview({
      p,
      colors,
      config: this.config,
      suggestion,
      modifierTarget,
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
    if (!this.hoveredId || !this.targetPath) return null;

    const suggestion = this.suggestions.find((s) => s.id === this.hoveredId);
    if (!suggestion) return null;
    const modifierTarget = this.resolveModifierTarget(suggestion);
    return buildPreviewGraphCurves({
      p,
      suggestion,
      modifierTarget,
      targetPath: this.targetPath,
      selectionRange: this.selectionRange,
      strength: this.hoveredStrength,
    });
  }

  // ホバー中提案を強度込みで適用した一時パスを取得（ループ再生用）
  public getHoveredPreviewPath(p: p5): Path | null {
    if (!this.hoveredId || !this.targetPath) return null;

    const suggestion = this.suggestions.find((s) => s.id === this.hoveredId);
    if (!suggestion) return null;
    const modifierTarget = this.resolveModifierTarget(suggestion);

    const result = buildSuggestionModifiers(
      p,
      this.targetPath,
      suggestion,
      this.selectionRange,
      this.hoveredStrength,
    );
    if (!result) return null;

    const sketchModifiers = [...(this.targetPath.sketchModifiers ?? [])];
    const graphModifiers = [...(this.targetPath.graphModifiers ?? [])];

    if (modifierTarget !== 'graph') {
      sketchModifiers.push(result.sketchModifier);
    }

    if (modifierTarget !== 'sketch' && result.graphModifier) {
      graphModifiers.push(result.graphModifier);
    }

    return {
      ...this.targetPath,
      sketchModifiers: sketchModifiers.length > 0 ? sketchModifiers : undefined,
      graphModifiers: graphModifiers.length > 0 ? graphModifiers : undefined,
    };
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
  private setState(state: SuggestionStatus): void {
    this.status = state;
  }

  // 進行中の生成を無効化
  private cancelInFlightGeneration(): void {
    this.generationId += 1;
  }

  // 指定IDの生成が有効か判定
  private isGenerationActive(generationId: number): boolean {
    return this.generationId === generationId;
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

    // 送信用画像をキャプチャ（設定で有効な場合のみ）
    const graphImageDataUrl = this.config.graphImageEnabled
      ? (this.graphImageProvider?.(path, selectionRange) ?? undefined)
      : undefined;

    // プロンプトの保存
    const trimmedPrompt = prompt?.trim() ?? '';
    if (trimmedPrompt) this.prompts.push(trimmedPrompt);

    // 提案のクリア
    this.clearSuggestions();
    this.setState('generating');
    this.updateUI();
    // この submit に対応する生成世代を払い出して、古い非同期結果を無効化する。
    const currentGenerationId = this.generationId + 1;
    this.generationId = currentGenerationId;

    // 提案の生成
    try {
      const streamedSuggestions: Suggestion[] = [];
      const pushSuggestion = (item: {
        title: string;
        modifierTarget: ModifierTarget;
        confidence: number;
        keyframes: Suggestion['path']['keyframes'];
      }): void => {
        // 既に別世代へ切り替わっていたら更新を破棄する。
        if (!this.isGenerationActive(currentGenerationId)) return;
        const suggestion: Suggestion = {
          id: globalThis.crypto.randomUUID(),
          title: item.title,
          modifierTarget: item.modifierTarget,
          confidence: item.confidence,
          path: {
            keyframes: item.keyframes,
            bbox: serializedPath.bbox,
          },
        };
        streamedSuggestions.push(suggestion);
        this.setSuggestions([...streamedSuggestions]);
        this.updateUI();
      };

      const items = await fetchSuggestions(
        serializedPaths,
        this.config,
        this.prompts,
        { onSuggestion: pushSuggestion, graphImageDataUrl },
      );

      // 選択/クローズなどで世代が進んでいた場合、完了処理を行わない。
      if (!this.isGenerationActive(currentGenerationId)) return;

      if (streamedSuggestions.length === 0) {
        const suggestions: Suggestion[] = items.map((item) => ({
          id: globalThis.crypto.randomUUID(),
          title: item.title,
          modifierTarget: item.modifierTarget,
          confidence: item.confidence,
          path: {
            keyframes: item.keyframes,
            bbox: serializedPath.bbox,
          },
        }));
        this.setSuggestions(suggestions);
      }
      this.setState('idle');
    } catch (error) {
      // 現在の生成がキャンセル済みなら、エラー表示を上書きしない。
      if (!this.isGenerationActive(currentGenerationId)) return;
      console.error(error);
      this.setState('error');
    }

    // 最終描画直前にも世代を確認し、遅延UI更新を防ぐ。
    if (!this.isGenerationActive(currentGenerationId)) return;
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

    // modifier名を設定
    const modifierName =
      this.prompts[this.prompts.length - 1] || suggestion.title;
    const modifierTarget = this.resolveModifierTarget(suggestion);

    const result = buildSuggestionModifiers(
      this.pInstance,
      this.targetPath,
      suggestion,
      this.selectionRange,
      strength,
      modifierName,
    );

    // キーフレームがない場合はエラー
    if (!result) {
      this.setState('error');
      this.updateUI();
      return;
    }

    const { sketchModifier, graphModifier } = result;

    const shouldApplyGraph =
      (modifierTarget === 'graph' || modifierTarget === 'both') &&
      !!graphModifier;
    const shouldApplySketch =
      modifierTarget === 'sketch' ||
      modifierTarget === 'both' ||
      !shouldApplyGraph;

    // パスにmodifierを追加
    this.addModifiersToPath(this.targetPath, {
      sketchModifier,
      graphModifier,
      shouldApplySketch,
      shouldApplyGraph,
    });

    this.onSelect?.(this.targetPath, this.targetPath);

    // 提案が確定したので、進行中のストリーミング更新を止める。
    this.cancelInFlightGeneration();
    this.clearSuggestions();
    this.setState('input');
    this.updateUI();
  }

  // パスにmodifierを追加
  private addModifiersToPath(
    path: Path,
    options: {
      sketchModifier: SketchModifier;
      graphModifier: GraphModifier | null;
      shouldApplySketch: boolean;
      shouldApplyGraph: boolean;
    },
  ): void {
    const {
      sketchModifier,
      graphModifier,
      shouldApplySketch,
      shouldApplyGraph,
    } = options;

    if (shouldApplySketch) {
      if (!path.sketchModifiers) {
        path.sketchModifiers = [];
      }
      path.sketchModifiers.push(sketchModifier);
    }

    if (shouldApplyGraph && graphModifier) {
      if (!path.graphModifiers) {
        path.graphModifiers = [];
      }
      path.graphModifiers.push(graphModifier);
    }
  }

  private resolveModifierTarget(suggestion: Suggestion): ModifierTarget {
    const confidence = suggestion.confidence;
    // 信頼度が低い提案は単一ターゲットを避けて、両方へ安全側に倒す。
    if (!Number.isFinite(confidence)) return 'both';
    if (confidence < SINGLE_TARGET_CONFIDENCE_THRESHOLD) return 'both';
    return suggestion.modifierTarget;
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
