import type { Config } from '../config';
import type { DomRefs } from '../dom';
import type { Path } from '../types';

// プロパティエディタ
export class PropertyEditor {
  private dom: DomRefs;
  private config: Config;
  private activePath: Path | null = null;

  constructor(dom: DomRefs, config: Config) {
    this.dom = dom;
    this.config = config;

    // Toleranceスライダーのイベント
    this.dom.graphThresholdSlider.addEventListener('input', () =>
      this.updateToleranceLabel(),
    );

    // Durationの更新イベント
    this.dom.durationInput.addEventListener('change', () =>
      this.updateDuration(),
    );

    // 初期値の設定
    this.syncToleranceSlider();
  }

  // パスの設定
  public setPath(path: Path | null): void {
    this.activePath = path;
    if (!path || !path.times.length) return;

    const duration = path.times[path.times.length - 1] - path.times[0];
    this.dom.durationInput.value = Math.round(duration).toString();
  }

  // Toleranceスライダーを同期
  private syncToleranceSlider(): void {
    this.dom.graphThresholdSlider.value = Math.round(
      this.config.graphFitTolerance,
    ).toString();
    this.updateToleranceLabel();
  }

  // Toleranceラベルを更新
  private updateToleranceLabel(): void {
    const value = Number(this.dom.graphThresholdSlider.value);
    if (!Number.isNaN(value)) {
      this.config.graphFitTolerance = value;
    }
    this.dom.graphThresholdLabel.textContent = `${value.toFixed(0)}%`;
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
