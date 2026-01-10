import type {
  Path,
  SelectionRange,
  Suggestion,
  SuggestionState,
} from '../types';
import { buildSketchCurves } from '../utils/keyframes';
import { applySketchModifiers } from '../utils/modifier';

type SuggestionUIConfig = {
  containerId?: string;
  listId: string;
  inputId?: string;
  itemClass: string;
  position?: (args: {
    container: HTMLElement | null;
    targetPath?: Path;
    selectionRange?: SelectionRange;
  }) => void;
};

// スケッチ/グラフ共通の簡易UI
export class SuggestionUI {
  private config: SuggestionUIConfig;
  private onHoverChange: (id: string | null, strength: number) => void;
  private onSuggestionClick: (id: string, strength: number) => void;

  // コンストラクタ
  constructor(
    config: SuggestionUIConfig,
    onHoverChange: (id: string | null, strength: number) => void,
    onSuggestionClick: (id: string, strength: number) => void,
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
    item.style.cssText = 'position: relative; overflow: hidden;';
    item.dataset.suggestionId = suggestion.id;

    // 影響度インジケーター
    const indicator = document.createElement('div');
    indicator.style.cssText =
      'position: absolute; inset: 0; width: 0; background: rgba(255,255,255,0.15); pointer-events: none;';
    item.appendChild(indicator);

    // テキスト
    const text = document.createElement('span');
    text.style.cssText = 'position: relative;';
    text.textContent = suggestion.title;
    item.appendChild(text);

    // マウスX位置から影響度(0~2)を計算
    const getStrength = (e: MouseEvent) => {
      const rect = item.getBoundingClientRect();
      return Math.max(
        0,
        Math.min(2, ((e.clientX - rect.left) / rect.width) * 2),
      );
    };

    item.addEventListener('mouseenter', (e) => {
      const s = getStrength(e);
      indicator.style.width = `${(s / 2) * 100}%`;
      this.onHoverChange(suggestion.id, s);
    });
    item.addEventListener('mousemove', (e) => {
      const s = getStrength(e);
      indicator.style.width = `${(s / 2) * 100}%`;
      this.onHoverChange(suggestion.id, s);
    });
    item.addEventListener('mouseleave', () => {
      indicator.style.width = '0';
      this.onHoverChange(null, 1);
    });
    item.addEventListener('click', (e) =>
      this.onSuggestionClick(suggestion.id, getStrength(e)),
    );

    return item;
  }

  // 提案項目のクリア
  private clearItems(): void {
    const container = document.getElementById(this.config.listId);
    if (container) container.innerHTML = '';
  }

  private selectionRange?: SelectionRange;

  // 選択範囲を設定
  setSelectionRange(range?: SelectionRange): void {
    this.selectionRange = range;
  }

  private applyPosition(targetPath?: Path): void {
    const { containerId, position } = this.config;
    position?.({
      container: containerId ? document.getElementById(containerId) : null,
      targetPath,
      selectionRange: this.selectionRange,
    });
  }
}

// ポップアップのオフセット値
const POPUP_OFFSET = 20;

// スケッチUIの配置計算
export function positionUI({
  container,
  targetPath,
  selectionRange,
}: {
  container: HTMLElement | null;
  targetPath?: Path;
  selectionRange?: SelectionRange;
}) {
  if (!container) return;

  if (!targetPath) return;

  // curvesを構築してmodifierを適用
  const originalCurves = buildSketchCurves(targetPath.keyframes);
  if (originalCurves.length === 0) return;

  const effectiveCurves = applySketchModifiers(
    originalCurves,
    targetPath.sketchModifiers,
  );

  // 終点のインデックスを計算
  const endCurveIndex = selectionRange
    ? Math.min(effectiveCurves.length - 1, selectionRange.endCurveIndex)
    : effectiveCurves.length - 1;

  const endCurve = effectiveCurves[endCurveIndex];
  if (!endCurve || endCurve.length < 4) return;

  // 終点（ベジェ曲線のp3）を取得
  const anchor = endCurve[3];
  if (!anchor) return;

  // canvasContainerの位置を取得して加算
  const canvasContainer = document.getElementById('canvasContainer');
  const rect = canvasContainer?.getBoundingClientRect();
  const offsetX = rect?.left ?? 0;
  const offsetY = rect?.top ?? 0;

  const left = offsetX + anchor.x + POPUP_OFFSET;
  const top = offsetY + anchor.y - POPUP_OFFSET;

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}
