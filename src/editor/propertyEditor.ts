import type { DomRefs } from '../dom';
import type { Path, PathModifier } from '../types';
import { removeModifier, updateModifierStrength } from '../utils/modifier';

// プロパティエディタ
export class PropertyEditor {
  private dom: DomRefs;
  private activePath: Path | null = null;

  constructor(dom: DomRefs) {
    this.dom = dom;

    // Durationの更新イベント
    this.dom.durationInput.addEventListener('change', () =>
      this.updateDuration(),
    );

    // モディファイアパネルの閉じるボタン
    this.dom.closeModifierPanelButton.addEventListener('click', () => {
      this.hideModifierPanel();
    });
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;

    if (!path || !path.times.length) {
      this.hideModifierPanel();
      return;
    }

    const duration = path.times[path.times.length - 1] - path.times[0];
    this.dom.durationInput.value = Math.round(duration).toString();

    // モディファイアがあればパネルを表示
    this.updateModifierPanel();
  }

  // Durationの更新
  private updateDuration(): void {
    if (!this.activePath) return;
    const { times } = this.activePath;
    if (!times.length) return;

    const newDuration = Number(this.dom.durationInput.value);
    const start = times[0];
    const oldDuration = times[times.length - 1] - start;

    if (newDuration > 0 && oldDuration > 0) {
      const scale = newDuration / oldDuration;
      this.activePath.times = times.map((t) => start + (t - start) * scale);
    }
  }

  // モディファイアパネルの更新
  private updateModifierPanel(): void {
    if (!this.activePath?.modifiers?.length) {
      this.hideModifierPanel();
      return;
    }

    this.dom.modifierList.innerHTML = '';

    for (const modifier of this.activePath.modifiers) {
      const item = this.createModifierItem(modifier);
      this.dom.modifierList.appendChild(item);
    }

    this.dom.modifierPanel.style.display = 'block';
  }

  // モディファイア項目の作成
  private createModifierItem(modifier: PathModifier): HTMLDivElement {
    const container = document.createElement('div');
    container.className =
      'flex flex-col gap-2 border-t border-gray-800 px-4 py-3';

    // ヘッダー行（名前 + 削除ボタン）
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between';

    const name = document.createElement('span');
    name.className = 'text-sm text-gray-50 truncate flex-1';
    name.textContent = modifier.name;
    name.title = modifier.name;

    const deleteButton = document.createElement('button');
    deleteButton.className =
      'p-1 text-gray-500 hover:text-red-400 transition-colors';
    deleteButton.innerHTML =
      '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i>';
    deleteButton.addEventListener('click', () => {
      if (!this.activePath) return;
      this.activePath.modifiers = removeModifier(
        this.activePath.modifiers,
        modifier.id,
      );
      this.updateModifierPanel();
    });

    header.appendChild(name);
    header.appendChild(deleteButton);

    // スライダー行
    const sliderRow = document.createElement('div');
    sliderRow.className = 'flex items-center gap-2';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(modifier.strength * 100));
    slider.className =
      'corner-md h-1 flex-1 cursor-grab appearance-none bg-gray-700 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-gray-50 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-50';

    const valueLabel = document.createElement('span');
    valueLabel.className = 'text-xs text-gray-400 w-10 text-right';
    valueLabel.textContent = `${slider.value}%`;

    slider.addEventListener('input', () => {
      const strength = Number(slider.value) / 100;
      updateModifierStrength(this.activePath?.modifiers, modifier.id, strength);
      valueLabel.textContent = `${slider.value}%`;
    });

    sliderRow.appendChild(slider);
    sliderRow.appendChild(valueLabel);

    container.appendChild(header);
    container.appendChild(sliderRow);

    // Lucide アイコンを初期化
    import('lucide').then(({ createIcons }) => createIcons());

    return container;
  }

  // モディファイアパネルを非表示
  private hideModifierPanel(): void {
    this.dom.modifierPanel.style.display = 'none';
  }
}
