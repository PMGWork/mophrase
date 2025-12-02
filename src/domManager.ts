// DOMマネージャー
export class DOMManager {
  public readonly sketchCheckbox!: HTMLInputElement;
  public readonly thresholdSlider!: HTMLInputElement;
  public readonly thresholdLabel!: HTMLElement;
  public readonly graphThresholdSlider!: HTMLInputElement;
  public readonly graphThresholdLabel!: HTMLElement;
  public readonly durationInput!: HTMLInputElement;
  public readonly llmProviderSelect!: HTMLSelectElement;
  public readonly llmModelSelect!: HTMLSelectElement;
  public readonly canvasContainer!: HTMLDivElement;
  public readonly userPromptForm!: HTMLFormElement;
  public readonly userPromptInput!: HTMLInputElement;
  public readonly clearButton!: HTMLButtonElement;
  public readonly playButton!: HTMLButtonElement;
  public readonly editMotionButton!: HTMLButtonElement;
  public readonly closeGraphEditorButton!: HTMLButtonElement;
  public readonly graphEditorContainer!: HTMLDivElement;
  public readonly graphEditorCanvas!: HTMLDivElement;
  public readonly graphUserPromptForm!: HTMLFormElement;
  public readonly graphUserPromptInput!: HTMLInputElement;
  public readonly graphSuggestionList!: HTMLDivElement;

  // コンストラクタ
  constructor() {
    const elements = this.collectElements<ElementMap>({
      sketchCheckbox: 'toggleSketchCheckbox',
      thresholdSlider: 'thresholdSlider',
      thresholdLabel: 'thresholdValue',
      graphThresholdSlider: 'graphThresholdSlider',
      graphThresholdLabel: 'graphThresholdLabel',
      durationInput: 'durationInput',
      llmProviderSelect: 'llmProviderSelect',
      llmModelSelect: 'llmModelSelect',
      canvasContainer: 'canvasContainer',
      userPromptForm: 'userPromptForm',
      userPromptInput: 'userPromptInput',
      clearButton: 'clearButton',
      playButton: 'playButton',
      editMotionButton: 'editMotionButton',
      closeGraphEditorButton: 'closeGraphEditorButton',
      graphEditorContainer: 'graphEditorContainer',
      graphEditorCanvas: 'graphEditorCanvas',
      graphUserPromptForm: 'graphUserPromptForm',
      graphUserPromptInput: 'graphUserPromptInput',
      graphSuggestionList: 'graphSuggestionList',
    });

    Object.assign(this, elements);
  }

  // DOM要素を取得する
  private collectElements<T extends Record<string, HTMLElement>>(ids: Record<keyof T, string>): T {
    const entries = Object.entries(ids).map(([key, id]) => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Required DOM element with id '${id}' not found.`);
      }
      return [key, element];
    });

    return Object.fromEntries(entries) as T;
  }

  // キャンバスサイズを取得する
  public getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvasContainer.clientWidth,
      height: this.canvasContainer.clientHeight,
    };
  }

  // グラフキャンバスサイズを取得する
  public getGraphCanvasSize(): { width: number; height: number } {
    return {
      width: this.graphEditorCanvas.clientWidth,
      height: this.graphEditorCanvas.clientHeight,
    };
  }
}

// DOM要素のマップ
type ElementMap = {
  sketchCheckbox: HTMLInputElement;
  thresholdSlider: HTMLInputElement;
  thresholdLabel: HTMLElement;
  graphThresholdSlider: HTMLInputElement;
  graphThresholdLabel: HTMLElement;
  durationInput: HTMLInputElement;
  llmProviderSelect: HTMLSelectElement;
  llmModelSelect: HTMLSelectElement;
  canvasContainer: HTMLDivElement;
  userPromptForm: HTMLFormElement;
  userPromptInput: HTMLInputElement;
  clearButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  editMotionButton: HTMLButtonElement;
  closeGraphEditorButton: HTMLButtonElement;
  graphEditorContainer: HTMLDivElement;
  graphEditorCanvas: HTMLDivElement;
  graphUserPromptForm: HTMLFormElement;
  graphUserPromptInput: HTMLInputElement;
  graphSuggestionList: HTMLDivElement;
};
