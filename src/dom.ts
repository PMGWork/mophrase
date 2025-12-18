// DOM要素のマップ
type ElementMap = {
  // 設定モーダル
  settingsButton: HTMLButtonElement;
  settingsModal: HTMLDivElement;
  settingsPanel: HTMLDivElement;
  closeSettingsButton: HTMLButtonElement;
  settingsLlmModelSelect: HTMLSelectElement;
  settingsVisibleRawSketch: HTMLInputElement;
  settingsSketchTolerance: HTMLInputElement;
  settingsSketchToleranceLabel: HTMLElement;
  settingsGraphTolerance: HTMLInputElement;
  settingsGraphToleranceLabel: HTMLElement;
  settingsObjectSize: HTMLInputElement;
  settingsObjectSizeLabel: HTMLElement;

  // サイドバー
  sidebarContainer: HTMLDivElement;
  propertyPlaceholder: HTMLDivElement;
  propertyInputs: HTMLDivElement;
  startTimeInput: HTMLInputElement;
  durationInput: HTMLInputElement;

  // グラフエディタ
  graphEditorContainer: HTMLDivElement;
  graphPlaceholder: HTMLDivElement;
  graphEditorContent: HTMLDivElement;
  graphEditorCanvas: HTMLDivElement;
  graphPromptForm: HTMLFormElement;
  graphPromptInput: HTMLInputElement;
  graphSuggestionList: HTMLDivElement;

  // スケッチエディタ
  canvasContainer: HTMLDivElement;
  sketchPromptForm: HTMLFormElement;
  sketchPromptInput: HTMLInputElement;
  clearButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  editMotionButton: HTMLButtonElement;
  selectToolButton: HTMLButtonElement;
  penToolButton: HTMLButtonElement;

  // モディファイアパネル
  modifierPanel: HTMLDivElement;
  modifierList: HTMLDivElement;
};

// DOM参照の束ね役
export class DomRefs {
  // 設定モーダル
  public readonly settingsButton!: HTMLButtonElement;
  public readonly settingsModal!: HTMLDivElement;
  public readonly settingsPanel!: HTMLDivElement;
  public readonly closeSettingsButton!: HTMLButtonElement;
  public readonly settingsLlmModelSelect!: HTMLSelectElement;
  public readonly settingsVisibleRawSketch!: HTMLInputElement;
  public readonly settingsSketchTolerance!: HTMLInputElement;
  public readonly settingsSketchToleranceLabel!: HTMLElement;
  public readonly settingsGraphTolerance!: HTMLInputElement;
  public readonly settingsGraphToleranceLabel!: HTMLElement;
  public readonly settingsObjectSize!: HTMLInputElement;
  public readonly settingsObjectSizeLabel!: HTMLElement;

  // サイドバー
  public readonly sidebarContainer!: HTMLDivElement;
  public readonly propertyPlaceholder!: HTMLDivElement;
  public readonly propertyInputs!: HTMLDivElement;
  public readonly startTimeInput!: HTMLInputElement;
  public readonly durationInput!: HTMLInputElement;

  // グラフエディタ
  public readonly graphEditorContainer!: HTMLDivElement;
  public readonly graphPlaceholder!: HTMLDivElement;
  public readonly graphEditorContent!: HTMLDivElement;
  public readonly graphEditorCanvas!: HTMLDivElement;
  public readonly graphPromptForm!: HTMLFormElement;
  public readonly graphPromptInput!: HTMLInputElement;
  public readonly graphSuggestionList!: HTMLDivElement;

  // スケッチエディタ
  public readonly canvasContainer!: HTMLDivElement;
  public readonly sketchPromptForm!: HTMLFormElement;
  public readonly sketchPromptInput!: HTMLInputElement;
  public readonly clearButton!: HTMLButtonElement;
  public readonly playButton!: HTMLButtonElement;
  public readonly editMotionButton!: HTMLButtonElement;
  public readonly selectToolButton!: HTMLButtonElement;
  public readonly penToolButton!: HTMLButtonElement;

  // モディファイアパネル
  public readonly modifierPanel!: HTMLDivElement;
  public readonly modifierList!: HTMLDivElement;

  // コンストラクタ
  constructor() {
    const elements = this.collectElements<ElementMap>({
      // 設定モーダル
      settingsButton: 'settingsButton',
      settingsModal: 'settingsModal',
      settingsPanel: 'settingsPanel',
      closeSettingsButton: 'closeSettingsButton',
      settingsLlmModelSelect: 'settingsLlmModelSelect',
      settingsVisibleRawSketch: 'settingsVisibleRawSketch',
      settingsSketchTolerance: 'settingsSketchTolerance',
      settingsSketchToleranceLabel: 'settingsSketchToleranceLabel',
      settingsGraphTolerance: 'settingsGraphTolerance',
      settingsGraphToleranceLabel: 'settingsGraphToleranceLabel',
      settingsObjectSize: 'settingsObjectSize',
      settingsObjectSizeLabel: 'settingsObjectSizeLabel',

      // サイドバー
      sidebarContainer: 'sidebarContainer',
      propertyPlaceholder: 'propertyPlaceholder',
      propertyInputs: 'propertyInputs',
      startTimeInput: 'startTimeInput',
      durationInput: 'durationInput',

      // グラフエディタ
      graphEditorContainer: 'graphEditorContainer',
      graphPlaceholder: 'graphPlaceholder',
      graphEditorContent: 'graphEditorContent',
      graphEditorCanvas: 'graphEditorCanvas',
      graphPromptForm: 'graphPromptForm',
      graphPromptInput: 'graphPromptInput',
      graphSuggestionList: 'graphSuggestionList',

      // スケッチエディタ
      canvasContainer: 'canvasContainer',
      sketchPromptForm: 'sketchPromptForm',
      sketchPromptInput: 'sketchPromptInput',
      clearButton: 'clearButton',
      playButton: 'playButton',
      editMotionButton: 'editMotionButton',
      selectToolButton: 'selectToolButton',
      penToolButton: 'penToolButton',

      // モディファイアパネル
      modifierPanel: 'modifierPanel',
      modifierList: 'modifierList',
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
