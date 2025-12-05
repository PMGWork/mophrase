import type { Path, Suggestion, SuggestionState } from './types';

type SuggestionUIConfig = {
  containerId?: string;
  listId: string;
  inputId?: string;
  itemClass: string;
  position?: (args: {
    container: HTMLElement | null;
    targetPath?: Path;
  }) => void;
};

// スケッチ/グラフ共通の簡易UI
export class SuggestionUI {
  private config: SuggestionUIConfig;
  private onHoverChange: (id: string | null) => void;
  private onSuggestionClick: (id: string) => void;

  // コンストラクタ
  constructor(
    config: SuggestionUIConfig,
    onHoverChange: (id: string | null) => void,
    onSuggestionClick: (id: string) => void,
  ) {
    this.config = config;
    this.onHoverChange = onHoverChange;
    this.onSuggestionClick = onSuggestionClick;
  }

  // UIを非表示
  hide(): void {
    const { containerId, listId } = this.config;
    if (containerId) {
      const container = document.getElementById(containerId);
      if (container) container.style.display = 'none';
    }
    this.clearItems(listId);
  }

  // UIの更新
  update(
    status: SuggestionState,
    suggestions: Suggestion[],
    targetPath?: Path,
    promptCount: number = 0,
  ): void {
    const { containerId, listId, inputId } = this.config;
    const listContainer = document.getElementById(listId);
    if (!listContainer) return;

    const container = containerId ? document.getElementById(containerId) : null;

    const showLoading = status === 'generating';
    const showInput = status === 'input';
    const hasSuggestions = suggestions.length > 0;

    if (container) {
      container.style.display =
        showLoading || showInput || hasSuggestions ? 'flex' : 'none';
      container.style.flexDirection = 'column';
    }

    // placeholderを履歴に応じて変更
    if (inputId) {
      const inputElement = document.getElementById(
        inputId,
      ) as HTMLInputElement | null;
      if (inputElement) {
        inputElement.placeholder =
          promptCount > 0 ? 'Refine instruction...' : 'Enter instructions...';
      }
    }

    this.clearItems(listId);

    if (showLoading) {
      const loading = document.createElement('div');
      loading.className = 'suggestion-loading px-3 py-2 text-sm text-gray-400';
      loading.textContent = 'Generating...';
      listContainer.appendChild(loading);
      this.applyPosition(targetPath);
      return;
    }

    if (hasSuggestions) {
      suggestions.forEach((suggestion) => {
        listContainer.appendChild(this.createSuggestionItem(suggestion));
      });
    }

    this.applyPosition(targetPath);
  }

  // 提案項目の作成
  private createSuggestionItem(suggestion: Suggestion): HTMLButtonElement {
    const item = document.createElement('button');
    item.className = `suggestion-item ${this.config.itemClass}`;
    item.textContent = suggestion.title;
    item.dataset.suggestionId = suggestion.id;

    item.addEventListener('mouseenter', () =>
      this.onHoverChange(suggestion.id),
    );
    item.addEventListener('mouseleave', () => this.onHoverChange(null));
    item.addEventListener('click', () => this.onSuggestionClick(suggestion.id));

    return item;
  }

  // 提案項目のクリア
  private clearItems(listId: string): void {
    const container = document.getElementById(listId);
    if (container) container.innerHTML = '';
  }

  private applyPosition(targetPath?: Path): void {
    this.config.position?.({
      container: this.config.containerId
        ? document.getElementById(this.config.containerId)
        : null,
      targetPath,
    });
  }
}

// ポップアップのオフセット値
const POPUP_OFFSET = 20;

// スケッチUIの配置計算
export function positionUI({
  container,
  targetPath,
}: {
  container: HTMLElement | null;
  targetPath?: Path;
}) {
  if (!container) return;

  if (!targetPath) return;
  const anchor = getLatestEndPoint([targetPath]);
  if (!anchor) return;

  const parent = container.parentElement;
  const rect = parent?.getBoundingClientRect();
  const offsetX = rect?.left ?? 0;

  const left = offsetX + anchor.x + POPUP_OFFSET;
  const top = anchor.y - POPUP_OFFSET;

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
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
