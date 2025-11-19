export class DOMManager {
  public readonly sketchCheckbox: HTMLInputElement;
  public readonly thresholdSlider: HTMLInputElement;
  public readonly thresholdLabel: HTMLElement;
  public readonly llmProviderSelect: HTMLSelectElement;
  public readonly llmModelSelect: HTMLSelectElement;
  public readonly canvasContainer: HTMLDivElement;
  public readonly userPromptForm: HTMLFormElement;
  public readonly userPromptInput: HTMLInputElement;
  public readonly clearButton: HTMLButtonElement;

  constructor() {
    this.sketchCheckbox = this.getElement('toggleSketchCheckbox');
    this.thresholdSlider = this.getElement('thresholdSlider');
    this.thresholdLabel = this.getElement('thresholdValue');
    this.llmProviderSelect = this.getElement('llmProviderSelect');
    this.llmModelSelect = this.getElement('llmModelSelect');
    this.canvasContainer = this.getElement('canvasContainer');
    this.userPromptForm = this.getElement('userPromptForm');
    this.userPromptInput = this.getElement('userPromptInput');
    this.clearButton = this.getElement('clearButton');
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Required DOM element with id '${id}' not found.`);
    }
    return element as T;
  }

  public getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvasContainer.clientWidth,
      height: this.canvasContainer.clientHeight,
    };
  }
}
