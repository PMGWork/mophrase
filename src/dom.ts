// DOM要素の型定義
export type ElementMap = {
  // 設定モーダル
  settingsButton: HTMLButtonElement;
  settingsModal: HTMLDivElement;
  settingsPanel: HTMLDivElement;
  closeSettingsButton: HTMLButtonElement;
  settingsLlmModelSelect: HTMLSelectElement;
  settingsSketchTolerance: HTMLInputElement;
  settingsSketchToleranceLabel: HTMLElement;

  // サイドバー
  sidebarContainer: HTMLDivElement;
  propertyPlaceholder: HTMLDivElement;
  propertyEditorContent: HTMLDivElement;
  startTimeInput: HTMLInputElement;
  durationInput: HTMLInputElement;

  // グラフエディタ
  graphEditorContainer: HTMLDivElement;
  graphPlaceholder: HTMLDivElement;
  graphEditorContent: HTMLDivElement;
  graphEditorCanvas: HTMLDivElement;

  // スケッチエディタ
  canvasContainer: HTMLDivElement;
  sketchPromptForm: HTMLFormElement;
  sketchPromptInput: HTMLInputElement;
  playButton: HTMLButtonElement;
  editMotionButton: HTMLButtonElement;
  selectToolButton: HTMLButtonElement;
  penToolButton: HTMLButtonElement;

  // モディファイアパネル
  modifierSection: HTMLDivElement;
  modifierList: HTMLDivElement;
};

// DOM要素IDの定義
const ELEMENT_IDS: Record<keyof ElementMap, string> = {
  settingsButton: 'settingsButton',
  settingsModal: 'settingsModal',
  settingsPanel: 'settingsPanel',
  closeSettingsButton: 'closeSettingsButton',
  settingsLlmModelSelect: 'settingsLlmModelSelect',
  settingsSketchTolerance: 'settingsSketchTolerance',
  settingsSketchToleranceLabel: 'settingsSketchToleranceLabel',
  sidebarContainer: 'sidebarContainer',
  propertyPlaceholder: 'propertyPlaceholder',
  propertyEditorContent: 'propertyEditorContent',
  startTimeInput: 'startTimeInput',
  durationInput: 'durationInput',
  graphEditorContainer: 'graphEditorContainer',
  graphPlaceholder: 'graphPlaceholder',
  graphEditorContent: 'graphEditorContent',
  graphEditorCanvas: 'graphEditorCanvas',
  canvasContainer: 'canvasContainer',
  sketchPromptForm: 'sketchPromptForm',
  sketchPromptInput: 'sketchPromptInput',
  playButton: 'playButton',
  editMotionButton: 'editMotionButton',
  selectToolButton: 'selectToolButton',
  penToolButton: 'penToolButton',
  modifierSection: 'modifierSection',
  modifierList: 'modifierList',
};

// DOM参照の束ね役（ElementMap を実装）
export class DomRefs implements ElementMap {
  // 設定モーダル
  public readonly settingsButton!: HTMLButtonElement;
  public readonly settingsModal!: HTMLDivElement;
  public readonly settingsPanel!: HTMLDivElement;
  public readonly closeSettingsButton!: HTMLButtonElement;
  public readonly settingsLlmModelSelect!: HTMLSelectElement;
  public readonly settingsSketchTolerance!: HTMLInputElement;
  public readonly settingsSketchToleranceLabel!: HTMLElement;

  // サイドバー
  public readonly sidebarContainer!: HTMLDivElement;
  public readonly propertyPlaceholder!: HTMLDivElement;
  public readonly propertyEditorContent!: HTMLDivElement;
  public readonly startTimeInput!: HTMLInputElement;
  public readonly durationInput!: HTMLInputElement;

  // グラフエディタ
  public readonly graphEditorContainer!: HTMLDivElement;
  public readonly graphPlaceholder!: HTMLDivElement;
  public readonly graphEditorContent!: HTMLDivElement;
  public readonly graphEditorCanvas!: HTMLDivElement;

  // スケッチエディタ
  public readonly canvasContainer!: HTMLDivElement;
  public readonly sketchPromptForm!: HTMLFormElement;
  public readonly sketchPromptInput!: HTMLInputElement;
  public readonly playButton!: HTMLButtonElement;
  public readonly editMotionButton!: HTMLButtonElement;
  public readonly selectToolButton!: HTMLButtonElement;
  public readonly penToolButton!: HTMLButtonElement;

  // モディファイアパネル
  public readonly modifierSection!: HTMLDivElement;
  public readonly modifierList!: HTMLDivElement;

  // コンストラクタ
  constructor() {
    const elements = this.collectElements(ELEMENT_IDS);
    Object.assign(this, elements);
  }

  // DOM要素を取得する
  private collectElements(ids: Record<string, string>): ElementMap {
    const entries = Object.entries(ids).map(([key, id]) => {
      const element = document.getElementById(id);
      if (!element)
        throw new Error(`ID '${id}' のDOM要素が見つかりませんでした。`);
      return [key, element];
    });
    return Object.fromEntries(entries) as ElementMap;
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
