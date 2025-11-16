import p5 from 'p5';
import { encode } from '@toon-format/toon'

import type { Path, SerializedPath, Suggestion, SuggestionHitTarget, SuggestionItem } from './types';
import type { Colors, Config } from './config';
import { suggestionResponseSchema } from './types';
import { generateStructured } from './llmService';
import { drawSuggestions } from './suggestionRenderer';
import { drawBezierCurve } from './draw';
import { deserializeCurves, serializePaths, deserializePaths } from './serialization';


// #region 提案マネージャー
// 提案の状態
export type SuggestionState = 'idle' | 'loading' | 'error';

// 提案管理クラス
export class SuggestionManager {
  private suggestions: Suggestion[] = [];
  private hitTargets: SuggestionHitTarget[] = [];
  private status: SuggestionState = 'idle';
  private config: Config;
  private targetPath: Path | undefined;
  private hoveredSuggestionId: string | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  // 設定を更新する
  updateConfig(config: Config): void {
    this.config = config;
  }

  // 提案を生成する
  async generate(targetPath: Path): Promise<void> {
    if (!targetPath) {
      this.setState('error');
      return;
    }

    this.targetPath = targetPath;

    this.clear();
    this.setState('loading');

    try {
      // パスをシリアライズ
      const serializedPaths = serializePaths([targetPath]);

      // LLM から提案を取得
      const fetched = await fetchSuggestions(
        serializedPaths,
        this.config.llmPrompt,
        this.config
      );

      // 提案を保存
      const segments = serializedPaths[0].segments;
      this.suggestions = fetched.map(item => ({
        id: this.generateId(),
        title: item.title,
        path: {
          anchors: item.anchors,
          segments: segments
        }
      }));
      this.setState('idle');
    } catch (error) {
      console.error(error);
      this.setState('error');
    }
  }

  // 提案をリセットする
  reset(): void {
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
  }

  // 提案を描画する
  draw(p: p5, colors: Colors, path: Path | undefined): void {
    if (!path) {
      this.hitTargets = [];
      this.hoveredSuggestionId = null;
      p.cursor('default');
      return;
    }
    this.hitTargets = drawSuggestions(p, colors, path, this.suggestions, this.status === 'loading');

    // マウスカーソルを変更
    if (this.status !== 'loading') {
      const target = this.hitTargets.find(
        (hit) =>
          hit.id !== 'loading' &&
          p.mouseX >= hit.x &&
          p.mouseX <= hit.x + hit.width &&
          p.mouseY >= hit.y &&
          p.mouseY <= hit.y + hit.height
      );
      this.hoveredSuggestionId = target?.id ?? null;
      if (this.hoveredSuggestionId) {
        this.drawHoverPreview(p, colors);
      }
      p.cursor(this.hoveredSuggestionId ? 'pointer' : 'default');
    } else {
      this.hoveredSuggestionId = null;
    }
  }

  // 提案を選択してパスを取得する
  trySelectSuggestion(x: number, y: number, p: p5): Path[] | null {
    // ヒットターゲットを検索
    const target = this.hitTargets.find(
      (hit) => x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height
    );
    if (!target || target.id === 'loading') return null;

    // 提案データを検索
    const suggestion = this.suggestions.find((entry) => entry.id === target.id);
    if (!suggestion || !this.targetPath) return null;

    const restored = deserializePaths([suggestion.path], [this.targetPath], p);
    if (restored.length === 0) {
      this.setState('error');
      return null;
    }

    // 提案されたパスを返す
    this.setState('idle');
    this.clear();
    this.targetPath = undefined;
    return restored;
  }

  // 状態を更新する
  private setState(state: SuggestionState): void {
    this.status = state;
  }

  // 提案をクリアする
  private clear(): void {
    this.suggestions = [];
    this.hitTargets = [];
    this.hoveredSuggestionId = null;
  }

  // 一意な提案IDを生成する
  private generateId(): string {
    return crypto.randomUUID();
  }

  // ホバー中の提案プレビューを描画する
  private drawHoverPreview(p: p5, colors: Colors): void {
    if (!this.hoveredSuggestionId) return;
    const suggestion = this.suggestions.find(entry => entry.id === this.hoveredSuggestionId);
    if (!suggestion) return;
    const curves = deserializeCurves(suggestion.path, p);
    if (curves.length === 0) return;

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const previousDash = typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

    p.push();
    drawBezierCurve(p, curves, Math.max(this.config.lineWeight, 1) + 0.5, colors.handle);
    p.pop();

    if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
  }
}


// #region プライベート関数

// LLM から提案を取得する
async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  config: Config
): Promise<SuggestionItem[]> {
  const prompt = buildPrompt(serializedPaths, basePrompt);
  const result = await generateStructured(prompt, suggestionResponseSchema, config.llmProvider, config.llmModel);
  return result.suggestions.map((suggestion): SuggestionItem => ({
    title: suggestion.title,
    anchors: suggestion.anchors,
  }));
}

// プロンプトを構築する
function buildPrompt(serializedPaths: SerializedPath[], basePrompt: string): string {
  return [
    basePrompt,
    '',
    '```toon',
    encode(serializedPaths),
    '```',
  ].join('\n');
}
