// グラフエディタのDOM参照
export type GraphEditorDomRefs = {
  sidebarContainer: HTMLDivElement;
  graphEditorCanvas: HTMLDivElement;
  getGraphCanvasSize: () => { width: number; height: number };
};

// グラフハンドル選択
export type GraphHandleSelection = {
  segmentIndex: number;
  type: 'GRAPH_OUT' | 'GRAPH_IN';
};
