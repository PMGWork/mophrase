import type p5 from 'p5';
import type { Colors, Config } from '../config';
import type { Vector, Modifier, Path, SelectionRange, Suggestion } from '../types';
import { drawBezierCurve } from '../utils/draw';
import { createModifierFromLLMResult } from '../utils/modifier';
import { slicePath } from '../utils/path';
import { deserializeCurves, serializePaths } from '../utils/serialization';
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
      (id, strength) => {
        this.hoveredId = id;
        this.hoveredStrength = strength;
      },
      (id, strength) => this.selectById(id, strength),
    );
  }

  protected getTargetCurves(): Vector[][] | undefined {
    if (!this.targetPath) return undefined;
    if (!this.selectionRange) return this.targetPath.sketch.curves;
    return slicePath(this.targetPath, this.selectionRange).sketch.curves;
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

  // 提案をプレビュー
  preview(
    p: p5,
    colors: Colors,
    options: { transform?: (v: p5.Vector) => p5.Vector } = {},
  ): void {
    if (!this.selectionRange) {
      super.preview(p, colors, options);
      return;
    }

    this.pInstance = p;
    if (this.status === 'generating') return;
    if (!this.hoveredId) return;

    const suggestion = this.suggestions.find(
      (s) => s.id === this.hoveredId && s.type === 'sketch',
    );
    if (!suggestion || !this.targetPath) return;

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const previousDash =
      typeof ctx.getLineDash === 'function' ? ctx.getLineDash() : [];
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([6, 4]);

    p.push();

    const originalCurves = this.targetPath.sketch.curves;
    const suggestionCurves = deserializeCurves(suggestion.path, p);
    if (originalCurves.length === 0 || suggestionCurves.length === 0) {
      p.pop();
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
      return;
    }

    const rangeStart = Math.max(
      0,
      Math.min(originalCurves.length - 1, this.selectionRange.startCurveIndex),
    );
    const rangeEnd = Math.max(
      0,
      Math.min(originalCurves.length - 1, this.selectionRange.endCurveIndex),
    );
    if (rangeStart > rangeEnd) {
      p.pop();
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
      return;
    }

    const previewCurves = originalCurves.map((curve, curveIndex) =>
      curve.map((pt, ptIndex) => {
        if (curveIndex < rangeStart || curveIndex > rangeEnd) return pt;
        const localIndex = curveIndex - rangeStart;
        const suggPt = suggestionCurves[localIndex]?.[ptIndex];
        if (!suggPt) return pt;
        const dx = (suggPt.x - pt.x) * this.hoveredStrength;
        const dy = (suggPt.y - pt.y) * this.hoveredStrength;
        if (dx === 0 && dy === 0) return pt;
        return p.createVector(pt.x + dx, pt.y + dy);
      }),
    );

    const startOriginal = originalCurves[rangeStart]?.[0];
    const startSuggested = suggestionCurves[0]?.[0];
    if (startOriginal && startSuggested && rangeStart > 0) {
      const dx = (startSuggested.x - startOriginal.x) * this.hoveredStrength;
      const dy = (startSuggested.y - startOriginal.y) * this.hoveredStrength;
      const prevCurve = previewCurves[rangeStart - 1];
      if (prevCurve) {
        prevCurve[2] = p.createVector(prevCurve[2].x + dx, prevCurve[2].y + dy);
        prevCurve[3] = p.createVector(prevCurve[3].x + dx, prevCurve[3].y + dy);
      }
    }

    const localEndIndex = Math.min(
      suggestionCurves.length - 1,
      rangeEnd - rangeStart,
    );
    const endOriginal = originalCurves[rangeEnd]?.[3];
    const endSuggested = suggestionCurves[localEndIndex]?.[3];
    if (endOriginal && endSuggested && rangeEnd < originalCurves.length - 1) {
      const dx = (endSuggested.x - endOriginal.x) * this.hoveredStrength;
      const dy = (endSuggested.y - endOriginal.y) * this.hoveredStrength;
      const nextCurve = previewCurves[rangeEnd + 1];
      if (nextCurve) {
        nextCurve[0] = p.createVector(nextCurve[0].x + dx, nextCurve[0].y + dy);
        nextCurve[1] = p.createVector(nextCurve[1].x + dx, nextCurve[1].y + dy);
      }
    }

    const previewStart = Math.max(0, rangeStart - 1);
    const previewEnd = Math.min(previewCurves.length - 1, rangeEnd + 1);
    const previewSlice = previewCurves.slice(previewStart, previewEnd + 1);

    const { transform } = options;
    const mapped = transform
      ? previewSlice.map((curve) => curve.map((pt) => transform(pt.copy())))
      : previewSlice;

    if (mapped.length > 0) {
      const weight = Math.max(this.config.lineWeight, 1) + 0.5;
      drawBezierCurve(p, mapped, weight, colors.handle);
    }

    p.pop();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash(previousDash);
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
  private selectById(id: string, strength: number): void {
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

    // LLM出力をcurvesにデシリアライズ
    const llmCurves = deserializeCurves(suggestion.path, this.pInstance);
    if (llmCurves.length === 0) {
      this.setState('error');
      this.updateUI();
      return;
    }

    // modifierを作成（差分計算）
    const modifierName =
      this.prompts[this.prompts.length - 1] || suggestion.title;
    const modifier = createModifierFromLLMResult(
      this.targetPath.sketch.curves,
      llmCurves,
      modifierName,
      this.selectionRange,
    );

    // クリック時の影響度をmodifierに設定
    modifier.strength = strength;

    // パスにmodifierを追加
    this.addModifierToPath(this.targetPath, modifier);
    this.onSelect?.(this.targetPath, this.targetPath);

    this.clearSuggestions();
    this.setState('input');
    this.updateUI();
  }

  // パスにmodifierを追加
  private addModifierToPath(path: Path, modifier: Modifier): void {
    if (!path.sketch.modifiers) {
      path.sketch.modifiers = [];
    }
    path.sketch.modifiers.push(modifier);
  }
}
