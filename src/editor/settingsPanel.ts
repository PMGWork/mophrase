import type { Config } from '../config';
import type { DomRefs } from '../dom';
import { getModels } from '../services/llm';
import type { LLMProvider } from '../types';

// 設定パネル
export class SettingsPanel {
  private dom: DomRefs;
  private config: Config;

  constructor(dom: DomRefs, config: Config) {
    this.dom = dom;
    this.config = config;

    this.setupEventListeners();
    this.populateModelOptions();
    this.syncAllSettings();
  }

  // モーダルを開く
  public open(): void {
    this.syncAllSettings();
    this.dom.settingsModal.style.display = 'flex';
  }

  // モーダルを閉じる
  public close(): void {
    this.dom.settingsModal.style.display = 'none';
  }

  // モーダルの開閉
  public toggle(): void {
    if (this.dom.settingsModal.style.display === 'none') {
      this.open();
    } else {
      this.close();
    }
  }

  // イベントリスナーの設定
  private setupEventListeners(): void {
    // モーダルの開閉
    this.dom.settingsButton.addEventListener('click', () => this.open());
    this.dom.closeSettingsButton.addEventListener('click', () => this.close());

    // 背景クリックで閉じる
    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) this.close();
    });

    // LLMモデル選択
    this.dom.settingsLlmModelSelect.addEventListener('change', () => {
      this.handleLlmModelChange();
    });

    // スライダー: Sketch Tolerance
    this.dom.settingsSketchTolerance.addEventListener('input', () => {
      const value = Number(this.dom.settingsSketchTolerance.value);
      this.config.sketchFitTolerance = value;
      this.dom.settingsSketchToleranceLabel.textContent = `${value}px`;
    });
  }

  // LLMモデル選択肢の設定
  private populateModelOptions(): void {
    const options = getModels();
    this.dom.settingsLlmModelSelect.innerHTML = '';

    // 選択肢を追加
    for (const optionInfo of options) {
      const option = document.createElement('option');
      option.value = JSON.stringify({
        provider: optionInfo.provider,
        modelId: optionInfo.modelId,
      });
      const displayName = optionInfo.name || optionInfo.modelId;
      option.textContent = `${displayName} (${optionInfo.provider})`;
      this.dom.settingsLlmModelSelect.appendChild(option);
    }

    // 現在の選択を設定
    const current =
      options.find(
        (entry) =>
          entry.provider === this.config.llmProvider &&
          entry.modelId === this.config.llmModel,
      ) ?? options[0];

    if (current) {
      const value = JSON.stringify({
        provider: current.provider,
        modelId: current.modelId,
      });
      this.dom.settingsLlmModelSelect.value = value;
    }
  }

  // LLMモデル変更ハンドラ
  private handleLlmModelChange(): void {
    try {
      const parsed = JSON.parse(this.dom.settingsLlmModelSelect.value) as {
        provider: LLMProvider;
        modelId: string;
      };
      this.config.llmProvider = parsed.provider;
      this.config.llmModel = parsed.modelId;
    } catch (error) {
      console.error('モデル選択の適用に失敗しました', error);
    }
  }

  // 全設定をUIに同期
  private syncAllSettings(): void {
    // Tolerance (Sketch)
    this.dom.settingsSketchTolerance.value = String(
      this.config.sketchFitTolerance,
    );
    this.dom.settingsSketchToleranceLabel.textContent = `${this.config.sketchFitTolerance}px`;
  }
}
