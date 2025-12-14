import type { Config } from '../config';
import type { Path, SelectionRange, Suggestion } from '../types';
import { replacePathRange, slicePath } from '../utils/path';
import { deserializePaths, serializePaths } from '../utils/serialization';
import { fetchSuggestions, SuggestionManager } from './base';
import { positionUI, SuggestionUI } from './ui';

// 型定義
type SketchSuggestionOptions = {
  onSelect?: (path: Path, targetPath?: Path) => void;
};

// スケッチ用の提案マネージャー
export class SketchSuggestionManager extends SuggestionManager {
  private onSelect?: (path: Path, targetPath?: Path) => void;
  private selectionRange?: SelectionRange;

  // コンストラクタ
  constructor(config: Config, options: SketchSuggestionOptions = {}) {
    super(config);
    this.onSelect = options.onSelect;
    this.ui = new SuggestionUI(
      {
        containerId: 'sketchSuggestionContainer',
        listId: 'sketchSuggestionList',
        inputId: 'sketchPromptInput',
        itemClass:
          'px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer',
        position: positionUI,
      },
      (id) => {
        this.hoveredId = id;
      },
      (id) => this.selectById(id),
    );
  }

  // 選択範囲を設定してUIを更新
  updateSelectionRange(selectionRange?: SelectionRange): void {
    this.selectionRange = selectionRange;
    this.ui.setSelectionRange(selectionRange);
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

  // #region プライベート関数
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
        this.config.sketchPrompt,
        this.config,
        this.prompts,
      );

      const suggestions: Suggestion[] = items.map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        type: 'sketch',
        path: {
          anchors: item.anchors,
          segments: serializedPath.segments,
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
  private selectById(id: string): void {
    const suggestion = this.suggestions.find(
      (s) => s.id === id && s.type === 'sketch',
    );
    if (!suggestion) return;

    if (!this.targetPath || !this.pInstance) {
      this.setState('error');
      this.updateUI();
      return;
    }

    // 部分パスとして復元
    const partialPath = slicePath(this.targetPath, this.selectionRange);

    const restored = deserializePaths(
      [suggestion.path],
      [partialPath],
      this.pInstance,
    );
    if (restored.length === 0) {
      this.setState('error');
      this.updateUI();
      return;
    }

    // 元のパスを更新（部分置換または全体置換）
    const updatedPath = replacePathRange(
      this.targetPath,
      restored[0],
      this.selectionRange,
    );
    this.onSelect?.(updatedPath, this.targetPath);

    this.clearSuggestions();
    this.setState('input');
    this.updateUI();
  }
}
