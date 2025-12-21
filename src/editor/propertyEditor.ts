import type { DomRefs } from '../dom';
import type { GraphModifier, Path, SketchModifier } from '../types';
import {
  removeSketchModifier,
  removeGraphModifier,
  updateSketchModifierStrength,
  updateGraphModifierStrength,
} from '../utils/modifier';
import { createIcons, icons } from 'lucide';

type PropertyEditorOptions = {
  onModifierChange?: () => void;
};

// プロパティエディタ
export class PropertyEditor {
  private dom: DomRefs;
  private activePath: Path | null = null;
  private onModifierChange?: () => void;

  constructor(dom: DomRefs, options: PropertyEditorOptions = {}) {
    this.dom = dom;
    this.onModifierChange = options.onModifierChange;

    // StartTimeの更新イベント
    this.dom.startTimeInput.addEventListener('change', () =>
      this.updateStartTime(),
    );

    // Durationの更新イベント
    this.dom.durationInput.addEventListener('change', () =>
      this.updateDuration(),
    );
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;

    if (!path || path.keyframes.length < 2) {
      // プレースホルダーを表示、コンテンツを非表示
      this.dom.propertyPlaceholder.style.display = 'flex';
      this.dom.propertyEditorContent.style.display = 'none';
      return;
    }

    // プレースホルダーを非表示、コンテンツを表示
    this.dom.propertyPlaceholder.style.display = 'none';
    this.dom.propertyEditorContent.style.display = 'flex';

    // StartTimeを表示（秒単位）
    const rawStartTime = path.startTime ?? 0;
    const startTime = Number.isFinite(rawStartTime) ? rawStartTime : 0;
    this.dom.startTimeInput.value = String(startTime);

    // Durationを表示 (秒単位)
    this.dom.durationInput.value = String(path.duration);

    // モディファイアパネルを更新
    this.updateModifierPanel();
  }

  // StartTimeの更新
  private updateStartTime(): void {
    if (!this.activePath) return;
    const newStartTime = Number(this.dom.startTimeInput.value);
    if (Number.isFinite(newStartTime) && newStartTime >= 0) {
      this.activePath.startTime = newStartTime;
    }
  }

  // Durationの更新
  private updateDuration(): void {
    if (!this.activePath) return;

    const newDurationSec = Number(this.dom.durationInput.value);
    if (!Number.isFinite(newDurationSec) || newDurationSec <= 0) return;

    this.activePath.duration = newDurationSec;
  }

  private refreshLucideIcons(): void {
    createIcons({ icons });
  }

  // モディファイアパネルの更新
  private updateModifierPanel(): void {
    // Sketch セクションをクリア
    this.dom.sketchModifierList.innerHTML = '';
    // Graph セクションをクリア
    this.dom.graphModifierList.innerHTML = '';

    const hasSketchModifiers = (this.activePath?.sketchModifiers?.length ?? 0) > 0;
    const hasGraphModifiers = (this.activePath?.graphModifiers?.length ?? 0) > 0;

    // Sketch セクションの表示/非表示
    this.dom.sketchModifierSection.style.display = hasSketchModifiers ? 'flex' : 'none';
    if (hasSketchModifiers) {
      for (const modifier of this.activePath!.sketchModifiers!) {
        const item = this.createModifierItem(modifier, 'sketch');
        this.dom.sketchModifierList.appendChild(item);
      }
    }

    // Graph セクションの表示/非表示
    this.dom.graphModifierSection.style.display = hasGraphModifiers ? 'flex' : 'none';
    if (hasGraphModifiers) {
      for (const modifier of this.activePath!.graphModifiers!) {
        const item = this.createModifierItem(modifier, 'graph');
        this.dom.graphModifierList.appendChild(item);
      }
    }

    if (hasSketchModifiers || hasGraphModifiers) {
      this.refreshLucideIcons();
    }
  }


  // モディファイア項目の作成
  private createModifierItem(
    modifier: SketchModifier | GraphModifier,
    type: 'sketch' | 'graph',
  ): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'flex items-center gap-2';

    // 中央のコントロール（ラベル + スライダー統合）
    const control = document.createElement('div');
    control.className =
      'relative flex-1 flex items-center corner-md bg-gray-800 py-1.5 px-3 overflow-hidden';

    // 背景ゲージ（インジケーター）
    const indicator = document.createElement('div');
    const initialWidth =
      Math.round(Math.max(0, Math.min(2, modifier.strength)) * 100) / 2;
    indicator.style.cssText = `position: absolute; inset: 0; width: ${initialWidth}%; background: rgba(255,255,255,0.1); pointer-events: none;`;
    control.appendChild(indicator);

    const name = document.createElement('span');
    name.className = 'relative text-xs text-gray-50 truncate flex-1';
    name.textContent = modifier.name;
    name.title = modifier.name;

    const valueLabel = document.createElement('span');
    valueLabel.className = 'relative text-xs text-gray-500 ml-2';
    valueLabel.textContent = `${Math.round(modifier.strength * 100)}%`;

    control.appendChild(name);
    control.appendChild(valueLabel);

    // スライダー（コントロール全体をクリックで調整）
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '200';
    slider.value = String(
      Math.round(Math.max(0, Math.min(2, modifier.strength)) * 100),
    );
    slider.className =
      'absolute inset-0 w-full h-full opacity-0 cursor-ew-resize';

    slider.addEventListener('input', () => {
      const strength = Number(slider.value) / 100;
      if (type === 'sketch') {
        updateSketchModifierStrength(
          this.activePath?.sketchModifiers,
          modifier.id,
          strength,
        );
      } else {
        updateGraphModifierStrength(
          this.activePath?.graphModifiers,
          modifier.id,
          strength,
        );
      }
      valueLabel.textContent = `${slider.value}%`;
      indicator.style.width = `${Number(slider.value) / 2}%`;
      this.onModifierChange?.();
    });

    control.appendChild(slider);

    // 削除ボタン
    const deleteButton = document.createElement('button');
    deleteButton.className =
      'flex-shrink-0 p-1 text-gray-500 hover:text-red-400 transition-colors';
    deleteButton.innerHTML = '<i data-lucide="minus" class="h-4 w-4"></i>';
    deleteButton.addEventListener('click', () => {
      if (!this.activePath) return;
      if (type === 'sketch') {
        this.activePath.sketchModifiers = removeSketchModifier(
          this.activePath.sketchModifiers,
          modifier.id,
        );
      } else {
        this.activePath.graphModifiers = removeGraphModifier(
          this.activePath.graphModifiers,
          modifier.id,
        );
      }
      this.updateModifierPanel();
      this.onModifierChange?.();
    });

    container.appendChild(control);
    container.appendChild(deleteButton);

    return container;
  }
}
