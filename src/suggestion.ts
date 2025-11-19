import p5 from 'p5';
import { encode } from '@toon-format/toon'

import type { Path, SerializedPath, Suggestion, SuggestionItem } from './types';
import type { Colors, Config } from './config';
import { suggestionResponseSchema } from './types';
import { generateStructured } from './llmService';
import { drawBezierCurve } from './draw';
import { deserializeCurves, serializePaths, deserializePaths } from './serialization';


// #region ユーティリティ関数
// 最新のパスの終点を取得
function getLatestEndPoint(paths: Path[]): p5.Vector | null {
  for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
    const path = paths[pathIndex];
    if (!path) continue;
    if (path.curves.length > 0) {
      const lastCurve = path.curves[path.curves.length - 1];
      const endPoint = lastCurve?.[3];
      if (endPoint) return endPoint.copy();
    }
    if (path.points.length > 0) {
      const fallback = path.points[path.points.length - 1];
      if (fallback) return fallback.copy();
    }
  }
  return null;
}


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
  private pInstance: p5 | null = null;

  constructor(config: Config, onSuggestionSelect?: (paths: Path[], targetPath?: Path) => void) {
    this.config = config;
    this.onSuggestionSelect = onSuggestionSelect;
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
    this.updateUI();

    try {
      // パスをシリアライズ
      const serializedPaths = serializePaths([targetPath]);

      // LLM から提案を取得
      const fetched = await fetchSuggestions(
        serializedPaths,
        this.config.llmPrompt,
        this.config,
        trimmedUserPrompt
      );

      // 提案を保存
      const path = serializedPaths[0];
      this.suggestions = fetched.map(item => ({
        id: this.generateId(),
        title: item.title,
        path: {
          anchors: item.anchors,
          segments: path.segments,
          bbox: path.bbox,
        }
      }));
      this.setState('idle');
      this.updateUI();
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.updateUI();
    }
  }

  // 提案をリセットする
  reset(): void {
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
    this.updateUI();
  }

  // 提案を描画する（プレビューのみ）
  draw(p: p5, colors: Colors, path: Path | undefined): void {
    this.pInstance = p;
    if (!path || this.status === 'loading') {
      return;
    }

    // ホバー中の提案のプレビューを描画
    if (this.hoveredSuggestionId) {
      this.drawHoverPreview(p, colors);
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

  // HTML UIを更新する
  private updateUI(): void {
    const container = document.getElementById('suggestionContainer');
    const listContainer = document.getElementById('suggestionList');
    const loadingElement = document.getElementById('suggestionLoading');

    if (!container || !listContainer || !loadingElement) return;

    if (this.status === 'loading') {
      // ローディング表示
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      loadingElement.style.display = 'flex';
      loadingElement.style.alignItems = 'center';
      loadingElement.style.gap = '0.5rem';
      this.clearSuggestionItems();
      this.updateUIPosition();
    } else if (this.suggestions.length > 0) {
      // 提案リスト表示
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      loadingElement.style.display = 'none';
      this.clearSuggestionItems();
      this.renderSuggestionItems();
      this.updateUIPosition();
    } else {
      // 非表示
      container.style.display = 'none';
      loadingElement.style.display = 'none';
      this.clearSuggestionItems();
    }
  }

  // 提案アイテムをレンダリング
  private renderSuggestionItems(): void {
    const listContainer = document.getElementById('suggestionList');
    if (!listContainer) return;

    this.suggestions.forEach((suggestion) => {
      const item = document.createElement('button');
      item.className = 'suggestion-item px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer';
      item.textContent = suggestion.title;
      item.dataset.suggestionId = suggestion.id;

      // ホバー時のプレビュー
      item.addEventListener('mouseenter', () => {
        this.hoveredSuggestionId = suggestion.id;
      });

      item.addEventListener('mouseleave', () => {
        this.hoveredSuggestionId = null;
      });

      // クリック時の選択
      item.addEventListener('click', () => {
        this.selectSuggestionById(suggestion.id);
      });

      listContainer.appendChild(item);
    });
  }

  // 提案アイテムをクリア
  private clearSuggestionItems(): void {
    const listContainer = document.getElementById('suggestionList');
    if (!listContainer) return;

    const items = listContainer.querySelectorAll('.suggestion-item');
    items.forEach(item => item.remove());
  }

  // UIの位置を更新
  private updateUIPosition(): void {
    const container = document.getElementById('suggestionContainer');
    if (!container || !this.targetPath) return;

    const anchor = getLatestEndPoint([this.targetPath]);
    if (!anchor) return;

    const left = anchor.x + 20;
    const top = anchor.y - 20;

    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  }

  // IDで提案を選択
  private selectSuggestionById(id: string): void {
    const suggestion = this.suggestions.find(s => s.id === id);
    if (!suggestion || !this.targetPath || !this.pInstance) return;

    const restored = deserializePaths([suggestion.path], [this.targetPath], this.pInstance);
    if (restored.length === 0) {
      this.setState('error');
      return;
    }

    // コールバックを呼び出す
    if (this.onSuggestionSelect) {
      this.onSuggestionSelect(restored, this.targetPath);
    }

    // リセット
    this.clear();
    this.targetPath = undefined;
    this.setState('idle');
    this.updateUI();
  }
}


// #region プライベート関数
// LLM から提案を取得する
async function fetchSuggestions(
  serializedPaths: SerializedPath[],
  basePrompt: string,
  config: Config,
  userPrompt?: string
): Promise<SuggestionItem[]> {
  const prompt = buildPrompt(serializedPaths, basePrompt, userPrompt);
  const result = await generateStructured(prompt, suggestionResponseSchema, config.llmProvider, config.llmModel);
  return result.suggestions.map((suggestion): SuggestionItem => ({
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
