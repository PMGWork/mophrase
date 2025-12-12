import type { Config } from '../config';
import type { Path, SelectionRange, Suggestion } from '../types';
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

    // 選択範囲がある場合は、その部分だけを切り出してシリアライズする
    let curvesToSerialize = path.curves;
    if (selectionRange) {
      curvesToSerialize = path.curves.slice(
        selectionRange.startCurveIndex,
        selectionRange.endCurveIndex + 1,
      );
    }

    // 部分パスを作成（シリアライズ用）
    const partialPath: Path = { ...path, curves: curvesToSerialize };
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
    const curvesToSerialize = this.selectionRange
      ? this.targetPath.curves.slice(
          this.selectionRange.startCurveIndex,
          this.selectionRange.endCurveIndex + 1,
        )
      : this.targetPath.curves;
    const partialPath: Path = { ...this.targetPath, curves: curvesToSerialize };

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

    if (this.selectionRange) {
      // 選択範囲がある場合、元のパスの一部を置換する
      const { startCurveIndex, endCurveIndex } = this.selectionRange;
      const restoredCurves = restored[0].curves;

      // 新しいcurves配列を作成
      const newCurves = [
        ...this.targetPath.curves.slice(0, startCurveIndex),
        ...restoredCurves,
        ...this.targetPath.curves.slice(endCurveIndex + 1),
      ];

      // パスを更新（deep copyせずにcurvesだけ差し替える形）
      const updatedPath: Path = {
        ...this.targetPath,
        curves: newCurves,
        points: [], // pointsは再計算が必要だが、今回はcurvesで表現されるため空でも動作する想定か、もしくは全体更新が必要
      };

      this.onSelect?.(updatedPath, this.targetPath);
    } else {
      // 全体置換
      this.onSelect?.(restored[0], this.targetPath);
    }

    this.clearSuggestions();
    this.setState('input');
    this.updateUI();
  }
}
