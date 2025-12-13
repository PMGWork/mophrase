// DOM要素のマップ
type ElementMap = {
  sketchCheckbox: HTMLInputElement;
  thresholdSlider: HTMLInputElement;
  thresholdLabel: HTMLElement;
  graphThresholdSlider: HTMLInputElement;
  graphThresholdLabel: HTMLElement;
  durationInput: HTMLInputElement;
  llmModelSelect: HTMLSelectElement;
  canvasContainer: HTMLDivElement;
  sketchPromptForm: HTMLFormElement;
  sketchPromptInput: HTMLInputElement;
  clearButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  editMotionButton: HTMLButtonElement;
  closeGraphEditorButton: HTMLButtonElement;
  graphEditorContainer: HTMLDivElement;
  graphEditorCanvas: HTMLDivElement;
  graphPromptForm: HTMLFormElement;
  graphPromptInput: HTMLInputElement;
  graphSuggestionList: HTMLDivElement;
  propertyEditorContainer: HTMLDivElement;
};

// DOM参照の束ね役
export class DomRefs {
  public readonly sketchCheckbox!: HTMLInputElement;
  public readonly thresholdSlider!: HTMLInputElement;
  public readonly thresholdLabel!: HTMLElement;
  public readonly graphThresholdSlider!: HTMLInputElement;
  public readonly graphThresholdLabel!: HTMLElement;
  public readonly durationInput!: HTMLInputElement;
  public readonly llmModelSelect!: HTMLSelectElement;
  public readonly canvasContainer!: HTMLDivElement;
  public readonly sketchPromptForm!: HTMLFormElement;
  public readonly sketchPromptInput!: HTMLInputElement;
  public readonly clearButton!: HTMLButtonElement;
  public readonly playButton!: HTMLButtonElement;
  public readonly editMotionButton!: HTMLButtonElement;
  public readonly closeGraphEditorButton!: HTMLButtonElement;
  public readonly graphEditorContainer!: HTMLDivElement;
  public readonly graphEditorCanvas!: HTMLDivElement;
  public readonly graphPromptForm!: HTMLFormElement;
  public readonly graphPromptInput!: HTMLInputElement;
  public readonly graphSuggestionList!: HTMLDivElement;
  public readonly propertyEditorContainer!: HTMLDivElement;

  // コンストラクタ
  constructor() {
    const elements = this.collectElements<ElementMap>({
      sketchCheckbox: 'toggleSketchCheckbox',
      thresholdSlider: 'thresholdSlider',
      thresholdLabel: 'thresholdValue',
      graphThresholdSlider: 'graphThresholdSlider',
      graphThresholdLabel: 'graphThresholdLabel',
      durationInput: 'durationInput',
      llmModelSelect: 'llmModelSelect',
      canvasContainer: 'canvasContainer',
      sketchPromptForm: 'sketchPromptForm',
      sketchPromptInput: 'sketchPromptInput',
      clearButton: 'clearButton',
      playButton: 'playButton',
      editMotionButton: 'editMotionButton',
      closeGraphEditorButton: 'closeGraphEditorButton',
      graphEditorContainer: 'graphEditorContainer',
      graphEditorCanvas: 'graphEditorCanvas',
      graphPromptForm: 'graphPromptForm',
      graphPromptInput: 'graphPromptInput',
      graphSuggestionList: 'graphSuggestionList',
      propertyEditorContainer: 'propertyEditorContainer',
    });

    Object.assign(this, elements);
  }

  // DOM要素を取得する
  private collectElements<T extends Record<string, HTMLElement>>(
    ids: Record<keyof T, string>,
  ): T {
    const entries = Object.entries(ids).map(([key, id]) => {
      // 指定されたIDでDOM要素を検索
      const element = document.getElementById(id);
      if (!element)
        throw new Error(`ID '${id}' のDOM要素が見つかりませんでした。`);

      // キーと要素のペアを返す
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
