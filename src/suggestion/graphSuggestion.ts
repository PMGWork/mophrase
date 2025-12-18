import type { Config } from '../config';
import type { Path, SerializedPath, Suggestion, Vector } from '../types';
import {
  deserializeCurves,
  serializeAnchorsAndSegments,
} from '../utils/serialization';
import { fetchSuggestions, SuggestionManager } from './base';
import { SuggestionUI } from './ui';

// 型定義
type GraphSuggestionOptions = {
  onSelect?: (path: { timing: Vector[][] }, targetPath?: Path) => void;
};

// グラフ用の提案マネージャー
export class GraphSuggestionManager extends SuggestionManager {
  private onSelect?: (path: { timing: Vector[][] }, targetPath?: Path) => void;

  // コンストラクタ
  constructor(config: Config, options: GraphSuggestionOptions = {}) {
    super(config);
    this.onSelect = options.onSelect;
    this.ui = new SuggestionUI(
      {
        listId: 'graphSuggestionList',
        inputId: 'graphPromptInput',
        itemClass:
          'px-3 py-2 text-sm text-left text-gray-50 hover:bg-gray-900 transition-colors cursor-pointer',
      },
      (id, strength) => {
        this.hoveredId = id;
        this.hoveredStrength = strength;
      },
      (id) => this.selectById(id),
    );
  }

  protected getTargetCurves(): Vector[][] | undefined {
    return this.targetPath?.motion.timing;
  }

  // 提案を送信
  async submit(path: { timing: Vector[][] }, prompt?: string): Promise<void> {
    await this.generateSuggestion(path, prompt);
  }

  // #region プライベート関数
  private async generateSuggestion(
    path: { timing: Vector[][] },
    prompt?: string,
  ): Promise<void> {
    const curves = path.timing;
    if (curves.length === 0) {
      this.setState('error');
      this.updateUI();
      return;
    }

    // シリアライズ
    const bbox = { x: 0, y: 0, width: 1, height: 1 };
    const { anchors, segments } = serializeAnchorsAndSegments(curves, bbox);
    const serializedPath: SerializedPath = { anchors, segments, bbox };

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
        [serializedPath],
        this.config.graphPrompt || '',
        this.config,
        this.prompts,
      );

      const suggestions: Suggestion[] = items.map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        type: 'graph',
        path: {
          anchors: item.anchors,
          segments: item.anchors
            .slice(0, -1)
            .map((_, i) => ({ startIndex: i, endIndex: i + 1 })),
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
      (s) => s.id === id && s.type === 'graph',
    );
    if (!suggestion || !this.pInstance) return;

    const curves = deserializeCurves(suggestion.path, this.pInstance);
    this.onSelect?.({ timing: curves }, this.targetPath);

    this.clearSuggestions();
    this.setState('input');
    this.updateUI();
  }
}
