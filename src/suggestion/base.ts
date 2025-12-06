import { encode } from '@toon-format/toon';
import type p5 from 'p5';

import type { Colors, Config } from '../config';
import { drawBezierCurve } from '../draw';
import { generateStructured } from '../llmService';
import { deserializeCurves } from '../serialization';
import type {
  Path,
  SerializedPath,
  Suggestion,
  SuggestionItem,
  SuggestionResponse,
  SuggestionState,
} from '../types';
import { suggestionResponseSchema } from '../types';
import type { SuggestionUI } from './ui';

// 共通の提案マネージャー
export abstract class SuggestionManager {
  protected config: Config;
  protected status: SuggestionState = 'idle';
  protected suggestions: Suggestion[] = [];
  protected hoveredId: string | null = null;
  protected pInstance: p5 | null = null;
  protected prompts: string[] = [];
  protected targetPath: Path | undefined;
  protected ui!: SuggestionUI;

  // コンストラクタ
  constructor(config: Config) {
    this.config = config;
  }

  // 設定を更新
  updateConfig(config: Config): void {
    this.config = config;
  }

  // 提案をプレビュー
  preview(
    p: p5,
    colors: Colors,
    options: { transform?: (v: p5.Vector) => p5.Vector } = {},
  ): void {
    this.pInstance = p;
    if (this.status === 'generating') return;
    if (this.hoveredId) this.drawPreview(p, colors, options.transform);
  }

  // 提案を設定
  protected setSuggestions(suggestions: Suggestion[]): void {
    this.suggestions = suggestions;
  }

  // 提案をクリア
  protected clearSuggestions(): void {
    this.suggestions = [];
    this.hoveredId = null;
  }

  // 状態を更新
  protected setState(state: SuggestionState): void {
    this.status = state;
  }

  // UIの更新
  protected updateUI(): void {
    this.ui.update(
      this.status,
      this.suggestions,
      this.targetPath,
      this.prompts.length,
    );
  }

  // 提案UIを開く
  open(targetPath?: Path): void {
    this.targetPath = targetPath;
    this.setState('input');
    this.updateUI();
    this.ui.show();
  }

  // 提案UIを閉じる
  close(): void {
    this.clearSuggestions();
    this.prompts = [];
    this.targetPath = undefined;
    this.setState('idle');
    this.ui.hide();
  }

  // ホバー中の提案を描画
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
}

// 提案を取得
export async function fetchSuggestions(
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

// プロンプトを構築
export function buildPrompt(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  promptHistory: string[],
): string {
  const promptParts = [basePrompt];

  if (promptHistory.length > 0) {
    promptParts.push('', '## ユーザー指示の履歴');

    promptHistory.forEach((p, i) => {
      const isLatest = i === promptHistory.length - 1;
      const label = isLatest ? '現在の指示' : `指示${i + 1}`;
      promptParts.push(`- **${label}**: ${p}`);
    });

    promptParts.push(
      '',
      '上記の履歴を踏まえ、特に最新の「現在の指示」に従ってパスを修正してください。',
    );
  }

  promptParts.push('', '```toon', encode(serializedPaths), '```');

  return promptParts.join('\n');
}
