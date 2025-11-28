export class DOMManager {
  public readonly sketchCheckbox: HTMLInputElement;
  public readonly thresholdSlider: HTMLInputElement;
  public readonly thresholdLabel: HTMLElement;
  public readonly graphThresholdSlider: HTMLInputElement;
  public readonly graphThresholdLabel: HTMLElement;
  public readonly durationInput: HTMLInputElement;
  public readonly llmProviderSelect: HTMLSelectElement;
  public readonly llmModelSelect: HTMLSelectElement;
  public readonly canvasContainer: HTMLDivElement;
  public readonly userPromptForm: HTMLFormElement;
  public readonly userPromptInput: HTMLInputElement;
  public readonly clearButton: HTMLButtonElement;
  public readonly playButton: HTMLButtonElement;
  public readonly editMotionButton: HTMLButtonElement;
  public readonly closeGraphEditorButton: HTMLButtonElement;
  public readonly graphEditorContainer: HTMLDivElement;
  public readonly graphEditorCanvas: HTMLDivElement;
  public readonly graphUserPromptForm: HTMLFormElement;
  public readonly graphUserPromptInput: HTMLInputElement;
  public readonly graphSuggestionList: HTMLDivElement;

  constructor() {
    this.sketchCheckbox = this.getElement('toggleSketchCheckbox');
    this.thresholdSlider = this.getElement('thresholdSlider');
    this.thresholdLabel = this.getElement('thresholdValue');
    this.graphThresholdSlider = this.getElement('graphThresholdSlider');
    this.graphThresholdLabel = this.getElement('graphThresholdLabel');
    this.durationInput = this.getElement('durationInput');
    this.llmProviderSelect = this.getElement('llmProviderSelect');
    this.llmModelSelect = this.getElement('llmModelSelect');
    this.canvasContainer = this.getElement('canvasContainer');
    this.userPromptForm = this.getElement('userPromptForm');
    this.userPromptInput = this.getElement('userPromptInput');
    this.clearButton = this.getElement('clearButton');
    this.playButton = this.getElement('playButton');
    this.editMotionButton = this.getElement('editMotionButton');
    this.closeGraphEditorButton = this.getElement('closeGraphEditorButton');
    this.graphEditorContainer = this.getElement('graphEditorContainer');
    this.graphEditorCanvas = this.getElement('graphEditorCanvas');
    this.graphUserPromptForm = this.getElement('graphUserPromptForm');
    this.graphUserPromptInput = this.getElement('graphUserPromptInput');
    this.graphSuggestionList = this.getElement('graphSuggestionList');
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

  public getGraphCanvasSize(): { width: number; height: number } {
    return {
      width: this.graphEditorCanvas.clientWidth,
      height: this.graphEditorCanvas.clientHeight,
    };
  }
}
