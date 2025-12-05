import type { DOMManager } from './domManager';
import type { Path } from './types';

// プロパティエディタ
export class PropertyEditor {
  private dom: DOMManager;
  private activePath: Path | null = null;

  constructor(domManager: DOMManager) {
    this.dom = domManager;

    // Durationの更新イベント
    this.dom.durationInput.addEventListener('change', () =>
      this.updateDuration(),
    );
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;
    if (!path || !path.times.length) return;

    const duration = path.times[path.times.length - 1] - path.times[0];
    this.dom.durationInput.value = Math.round(duration).toString();
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
}
