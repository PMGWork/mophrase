import type { Path, Suggestion, SuggestionState } from '../types';

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

  // UIを表示
  show(): void {
    const { inputId } = this.config;
    if (!inputId) return;
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (el) requestAnimationFrame(() => el.focus());
  }

  // UIを非表示
  hide(): void {
    const { containerId } = this.config;
    if (containerId) {
      const container = document.getElementById(containerId);
      if (container) container.style.display = 'none';
    }
    this.clearItems();
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

    // containerの取得
    const container = containerId ? document.getElementById(containerId) : null;

    // 状態の判定
    const showLoading = status === 'generating';
    const showSketchInput = status === 'input';
    const hasSuggestions = suggestions.length > 0;

    // containerの表示/非表示
    if (container) {
      container.style.display =
        showLoading || showSketchInput || hasSuggestions ? 'flex' : 'none';
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

    // 提案項目のクリア
    this.clearItems();

    // loading表示
    if (showLoading) {
      const loading = document.createElement('div');
      loading.className = 'suggestion-loading px-3 py-2 text-sm text-gray-400';
      loading.textContent = 'Generating...';
      listContainer.appendChild(loading);
      this.applyPosition(targetPath);
      return;
    }

    // 提案項目の表示
    if (hasSuggestions) {
      suggestions.forEach((suggestion) => {
        listContainer.appendChild(this.createSuggestionItem(suggestion));
      });
    }

    // UIの位置調整
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
  private clearItems(): void {
    const container = document.getElementById(this.config.listId);
    if (container) container.innerHTML = '';
  }

  private applyPosition(targetPath?: Path): void {
    const { containerId, position } = this.config;
    position?.({
      container: containerId ? document.getElementById(containerId) : null,
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
  const anchor = getPathEndPoint(targetPath);
  if (!anchor) return;

  const parent = container.parentElement;
  const rect = parent?.getBoundingClientRect();
  const offsetX = rect?.left ?? 0;

  const left = offsetX + anchor.x + POPUP_OFFSET;
  const top = anchor.y - POPUP_OFFSET;

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}

// パスの終点を取得
function getPathEndPoint(path: Path): { x: number; y: number } | null {
  if (path.curves.length > 0) {
    const endPoint = path.curves.at(-1)?.[3];
    if (endPoint) return { x: endPoint.x, y: endPoint.y };
  }
  if (path.points.length > 0) {
    const fallback = path.points.at(-1);
    if (fallback) return { x: fallback.x, y: fallback.y };
  }
  return null;
}
