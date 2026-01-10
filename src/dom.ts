// DOM要素の型定義
export type ElementMap = {
  // サイドバー
  sidebarContainer: HTMLDivElement;

  // グラフエディタ
  graphPlaceholder: HTMLDivElement;
  graphEditorContent: HTMLDivElement;
  graphEditorCanvas: HTMLDivElement;

  // スケッチエディタ
  canvasContainer: HTMLElement;
  sketchPromptInput: HTMLInputElement;
};

// DOM要素IDの定義
const ELEMENT_IDS: Record<keyof ElementMap, string> = {
  sidebarContainer: 'sidebarContainer',
  graphPlaceholder: 'graphPlaceholder',
  graphEditorContent: 'graphEditorContent',
  graphEditorCanvas: 'graphEditorCanvas',
  canvasContainer: 'canvasContainer',
  sketchPromptInput: 'sketchPromptInput',
};

// DOM参照の束ね役（ElementMap を実装）
export class DomRefs implements ElementMap {
  // サイドバー
  public readonly sidebarContainer!: HTMLDivElement;

  // グラフエディタ
  public readonly graphPlaceholder!: HTMLDivElement;
  public readonly graphEditorContent!: HTMLDivElement;
  public readonly graphEditorCanvas!: HTMLDivElement;

  // スケッチエディタ
  public readonly canvasContainer!: HTMLElement;
  public readonly sketchPromptInput!: HTMLInputElement;

  // コンストラクタ
  constructor(overrides: Partial<ElementMap> = {}) {
    const elements = this.collectElements(ELEMENT_IDS, overrides);
    Object.assign(this, elements);
  }

  // DOM要素を取得する
  private collectElements(
    ids: Record<string, string>,
    overrides: Partial<ElementMap>,
  ): ElementMap {
    const entries = Object.entries(ids).map(([key, id]) => {
      const override = overrides[key as keyof ElementMap];
      if (override) return [key, override];

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
