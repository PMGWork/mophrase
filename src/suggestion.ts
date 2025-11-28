import p5 from 'p5';
import { encode } from '@toon-format/toon'

import type { Path, SerializedPath, Suggestion, SuggestionItem } from './types';
import type { Colors, Config } from './config';
import { suggestionResponseSchema } from './types';
import { generateStructured } from './llmService';
import { drawBezierCurve } from './draw';
import { deserializeCurves, serializePaths, deserializePaths, serializeAnchorsAndSegments } from './serialization';

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
  private onGraphSuggestionSelect?: (curve: p5.Vector[][]) => void;
  private pInstance: p5 | null = null;
  private customPosition: { x: number, y: number } | null = null;
  private strokeScale: number = 1;

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
    // スケッチ用の提案では位置指定をリセット
    this.customPosition = null;

    this.clear();
    this.setState('loading');
    this.updateUI();

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
      this.updateUI();
    } catch (error) {
      console.error(error);
      this.setState('error');
      this.updateUI();
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
    this.updateUI();

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
    this.customPosition = null;
    this.setState('idle');
    this.updateUI();
  }

  // UI位置を設定する
  setPosition(x: number, y: number): void {
    this.customPosition = { x, y };
    this.updateUIPosition();
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

  // HTML UIを更新する
  private updateUI(): void {
    const container = document.getElementById('suggestionContainer');
    const listContainer = document.getElementById('suggestionList');
    const loadingElement = document.getElementById('suggestionLoading');
    const graphListContainer = document.getElementById('graphSuggestionList');
    const graphLoadingElement = document.getElementById('graphSuggestionLoading');

    if (!container || !listContainer || !loadingElement || !graphListContainer || !graphLoadingElement) return;

    // グラフ提案の場合
    if (this.suggestions.length > 0 && this.suggestions[0].type === 'graph') {
      // スケッチ提案UIは非表示
      container.style.display = 'none';

      // グラフ提案リスト表示
      graphLoadingElement.style.display = 'none';
      this.clearSuggestionItems();
      this.renderGraphSuggestionItems();
      return;
    }

    // スケッチ提案の場合 (またはローディング/エラー/アイドル)
    // グラフ提案UIはクリア
    // ただしローディング要素は残すため、suggestion-itemクラスを持つ要素のみ削除
    const graphItems = graphListContainer.querySelectorAll('.suggestion-item');
    graphItems.forEach(item => item.remove());

    if (this.status === 'loading') {
      // ローディング表示
      if (this.targetPath && !this.targetPath.timeCurve) {
        // スケッチモードのローディング
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        loadingElement.style.display = 'flex';
        loadingElement.style.alignItems = 'center';
        loadingElement.style.gap = '0.5rem';
        this.clearSuggestionItems();
        this.updateUIPosition();
        graphLoadingElement.style.display = 'none';
      } else {
        // グラフモードのローディング (簡易判定: targetPathがない、あるいはgenerateGraphSuggestionが呼ばれた文脈)
        // generateGraphSuggestionでは targetPath をセットしていないため、this.targetPath は undefined の可能性がある
        // しかし現状の構造ではモードを厳密に区別するフラグがないため、
        // generateGraphSuggestion で this.targetPath をセットするか、あるいは別のフラグが必要。
        // ここでは簡易的に、suggestionsが空でloadingなら両方出すか、あるいは文脈に依存させる。
        // いったん、GraphEditorが表示されているか(DOMManager経由で知るのが筋だがここにはない)
        // 暫定対応: graphSuggestionListが空ならグラフ用ローディングを表示してみる

        // 修正: generateGraphSuggestion で suggestions = [] にしているので、
        // ここでは「どちらのモードか」を判定するのが難しい。
        // しかし、GraphEditorが開いているときは SketchEditorのローディングは不要。
        // ひとまず両方のローディングを表示制御する（非表示にするのは確実なときだけ）

        // GraphEditorが表示されているかどうかの判定ができないため、
        // generateGraphSuggestion メソッド内でフラグを立てるのが安全だが、
        // ここでは簡易的に「直前の操作」を推測する。

        // 妥協案: 両方のローディングを表示する（ユーザーには見えている方だけが見える）
        // ただしフローティングは位置がおかしくなるので、
        // generateGraphSuggestion 呼び出し時に targetPath を undefined にしていることを利用する

        if (this.targetPath) {
          // スケッチ
          container.style.display = 'flex';
          container.style.flexDirection = 'column';
          loadingElement.style.display = 'flex';
          this.updateUIPosition();
          graphLoadingElement.style.display = 'none';
        } else {
          // グラフ (targetPathなしでloading)
          container.style.display = 'none';
          graphLoadingElement.style.display = 'flex';
        }
      }
    } else if (this.suggestions.length > 0) {
      // 提案リスト表示 (Sketch)
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      loadingElement.style.display = 'none';
      graphLoadingElement.style.display = 'none';
      this.clearSuggestionItems();
      this.renderSuggestionItems();
      this.updateUIPosition();
    } else {
      // 非表示
      container.style.display = 'none';
      loadingElement.style.display = 'none';
      graphLoadingElement.style.display = 'none';
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

  // グラフ提案アイテムをレンダリング
  private renderGraphSuggestionItems(): void {
    const listContainer = document.getElementById('graphSuggestionList');
    if (!listContainer) return;

    this.suggestions.forEach((suggestion) => {
      const item = document.createElement('button');
      // サイドバー用のスタイル (Sketch提案に完全一致)
      item.className = 'suggestion-item w-full px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer';
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
    const graphListContainer = document.getElementById('graphSuggestionList');

    if (listContainer) {
      const items = listContainer.querySelectorAll('.suggestion-item');
      items.forEach(item => item.remove());
    }

    if (graphListContainer) {
      // graphListContainer.innerHTML = ''; // ローディングを消してしまうので修正
      const items = graphListContainer.querySelectorAll('.suggestion-item');
      items.forEach(item => item.remove());
    }
  }

  // UIの位置を更新
  private updateUIPosition(): void {
    const container = document.getElementById('suggestionContainer');
    if (!container) return;

    // 他要素より前面に出す
    container.style.zIndex = '1000';

    // 常にビューポート基準で配置し、親要素の overflow によるクリップを回避する
    container.style.position = 'fixed';

    if (this.customPosition) {
      container.style.left = `${this.customPosition.x}px`;
      container.style.top = `${this.customPosition.y}px`;
      return;
    }

    if (!this.targetPath) return;

    const anchor = getLatestEndPoint([this.targetPath]);
    if (!anchor) return;

    // キャンバスの位置を考慮してビューポート座標に変換
    const parent = container.parentElement;
    const rect = parent?.getBoundingClientRect();
    const offsetX = rect?.left ?? 0;
    const offsetY = rect?.top ?? 0;

    const left = offsetX + anchor.x + 20;
    const top = offsetY + anchor.y - 20;

    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
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
    this.updateUI();
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
