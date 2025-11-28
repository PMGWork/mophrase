import type { Path, Suggestion } from './types';

// 提案の状態
type SuggestionState = 'idle' | 'loading' | 'error';

// 提案UI抽象クラス
abstract class SuggestionUI {
  protected onHoverChange: (id: string | null) => void;
  protected onSuggestionClick: (id: string) => void;

  constructor(
    onHoverChange: (id: string | null) => void,
    onSuggestionClick: (id: string) => void
  ) {
    this.onHoverChange = onHoverChange;
    this.onSuggestionClick = onSuggestionClick;
  }

  abstract updateUI(status: SuggestionState, suggestions: Suggestion[], targetPath?: Path): void;
  abstract hide(): void;

  // 共通メソッド: 提案アイテムの作成
  protected createSuggestionItem(suggestion: Suggestion, className: string): HTMLButtonElement {
    const item = document.createElement('button');
    item.className = className;
    item.textContent = suggestion.title;
    item.dataset.suggestionId = suggestion.id;

    item.addEventListener('mouseenter', () => this.onHoverChange(suggestion.id));
    item.addEventListener('mouseleave', () => this.onHoverChange(null));
    item.addEventListener('click', () => this.onSuggestionClick(suggestion.id));

    return item;
  }

  // アイテムのクリア
  protected clearItems(containerId: string): void {
    const container = document.getElementById(containerId);
    if (container) {
      const items = container.querySelectorAll('.suggestion-item');
      items.forEach(item => item.remove());
    }
  }
}

// スケッチ提案UI
export class SketchSuggestionUI extends SuggestionUI {
  private customPosition: { x: number; y: number } | null = null;

  // UI位置を設定する
  setPosition(x: number, y: number): void {
    this.customPosition = { x, y };
    this.updateUIPosition(null);
  }

  // UIを非表示にする
  hide(): void {
    const container = document.getElementById('suggestionContainer');
    const loadingElement = document.getElementById('suggestionLoading');

    if (container) container.style.display = 'none';
    if (loadingElement) loadingElement.style.display = 'none';

    this.clearItems('suggestionList');
  }

  // UIを更新する
  updateUI(status: SuggestionState, suggestions: Suggestion[], targetPath?: Path): void {
    const container = document.getElementById('suggestionContainer');
    const listContainer = document.getElementById('suggestionList');
    const loadingElement = document.getElementById('suggestionLoading');

    if (!container || !listContainer || !loadingElement) return;

    if (status === 'loading') {
      // ローディング表示
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      loadingElement.style.display = 'flex';
      loadingElement.style.alignItems = 'center';
      loadingElement.style.gap = '0.5rem';
      this.clearItems('suggestionList');
      this.updateUIPosition(targetPath);
    } else if (suggestions.length > 0) {
      // 提案リスト表示
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      loadingElement.style.display = 'none';
      this.clearItems('suggestionList');
      this.renderSuggestionItems(suggestions, listContainer);
      this.updateUIPosition(targetPath);
    } else {
      // 非表示
      container.style.display = 'none';
      loadingElement.style.display = 'none';
      this.clearItems('suggestionList');
    }
  }

  // スケッチ提案アイテムをレンダリング
  private renderSuggestionItems(suggestions: Suggestion[], listContainer: HTMLElement): void {
    suggestions.forEach((suggestion) => {
      const item = this.createSuggestionItem(
        suggestion,
        'suggestion-item px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer'
      );
      listContainer.appendChild(item);
    });
  }

  // UIの位置を更新
  private updateUIPosition(targetPath: Path | null | undefined): void {
    const container = document.getElementById('suggestionContainer');
    if (!container) return;

    if (this.customPosition) {
      container.style.left = `${this.customPosition.x}px`;
      container.style.top = `${this.customPosition.y}px`;
      return;
    }

    if (!targetPath) return;

    const anchor = getLatestEndPoint([targetPath]);
    if (!anchor) return;

    const parent = container.parentElement;
    const rect = parent?.getBoundingClientRect();
    const offsetX = rect?.left ?? 0;
    const offsetY = rect?.top ?? 0;

    const left = offsetX + anchor.x + 20;
    const top = offsetY + anchor.y - 20;

    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  }
}

// グラフ提案UI
export class GraphSuggestionUI extends SuggestionUI {
  // UIを非表示にする
  hide(): void {
    const loadingElement = document.getElementById('graphSuggestionLoading');
    if (loadingElement) loadingElement.style.display = 'none';
    this.clearItems('graphSuggestionList');
  }

  // UIを更新する
  updateUI(status: SuggestionState, suggestions: Suggestion[], _targetPath?: Path): void {
    const listContainer = document.getElementById('graphSuggestionList');
    const loadingElement = document.getElementById('graphSuggestionLoading');

    if (!listContainer || !loadingElement) return;

    if (status === 'loading') {
      // ローディング表示
      loadingElement.style.display = 'flex';
      this.clearItems('graphSuggestionList');
    } else if (suggestions.length > 0) {
      // 提案リスト表示
      loadingElement.style.display = 'none';
      this.clearItems('graphSuggestionList');
      this.renderGraphSuggestionItems(suggestions, listContainer);
    } else {
      // 非表示
      loadingElement.style.display = 'none';
      this.clearItems('graphSuggestionList');
    }
  }

  // グラフ提案アイテムをレンダリング
  private renderGraphSuggestionItems(suggestions: Suggestion[], listContainer: HTMLElement): void {
    suggestions.forEach((suggestion) => {
      const item = this.createSuggestionItem(
        suggestion,
        'suggestion-item w-full px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer'
      );
      listContainer.appendChild(item);
    });
  }
}

// 最新のパスの終点を取得
function getLatestEndPoint(paths: Path[]): { x: number; y: number } | null {
  for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex--) {
    const path = paths[pathIndex];
    if (!path) continue;
    if (path.curves.length > 0) {
      const lastCurve = path.curves[path.curves.length - 1];
      const endPoint = lastCurve?.[3];
      if (endPoint) return { x: endPoint.x, y: endPoint.y };
    }
    if (path.points.length > 0) {
      const fallback = path.points[path.points.length - 1];
      if (fallback) return { x: fallback.x, y: fallback.y };
    }
  }
  return null;
}
