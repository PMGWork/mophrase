/**
 * グラフエディタ用のカスタムフック。
 * エディタの初期化、状態管理を担当する。
 */

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type p5 from 'p5';
import type { Colors, Config } from '../config';
import type { HandleSelection, Path, SelectionRange } from '../types';
import { GraphEditor } from '../editor/graphEditor/editor';
import { useResizeObserver } from './useResizeObserver';

// グラフエディタのパラメータ
type UseGraphEditorParams = {
  activePath: Path | null; // 現在編集しているパス
  config: Config; // 設定
  colors: Colors; // カラースキーム
  previewProvider?: (
    p: p5,
  ) => { curves: p5.Vector[][]; strength: number } | null; // プレビュー用のグラフ曲線を提供
  selectionRangeProvider?: () => SelectionRange | undefined; // スケッチエディタの選択範囲を提供
  selectedHandlesProvider?: () => HandleSelection[]; // スケッチエディタの選択ハンドル一覧を提供
};

// グラフエディタの結果
type UseGraphEditorResult = {
  graphCanvasRef: RefObject<HTMLDivElement | null>; // グラフエディタのキャンバス参照
  captureGraphCanvasFocused: () => string | null; // 選択範囲中心の拡大グラフ画像をキャプチャ
};

// グラフエディタを管理するカスタムフック
export const useGraphEditor = ({
  activePath,
  config,
  colors,
  previewProvider,
  selectionRangeProvider,
  selectedHandlesProvider,
}: UseGraphEditorParams): UseGraphEditorResult => {
  // リファレンス
  const graphCanvasRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<GraphEditor | null>(null);

  // グラフエディタを初期化
  useEffect(() => {
    if (editorRef.current || !graphCanvasRef.current) return;

    const editor = new GraphEditor(
      {
        graphEditorCanvas: graphCanvasRef.current,
        getGraphCanvasSize: () => ({
          width: graphCanvasRef.current?.clientWidth ?? 0,
          height: graphCanvasRef.current?.clientHeight ?? 0,
        }),
      },
      config,
      colors,
    );
    editorRef.current = editor;
  }, [config, colors]);

  useEffect(() => {
    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  // activePathが変更されたら既存エディタのパスを更新
  useEffect(() => {
    editorRef.current?.setPath(activePath ?? null);
  }, [activePath]);

  // previewProviderが変更されたら既存エディタに反映
  useEffect(() => {
    if (!previewProvider) return;
    editorRef.current?.setPreviewProvider(previewProvider);
  }, [previewProvider]);

  // selectionRangeProvider が変更されたら既存エディタに反映
  useEffect(() => {
    editorRef.current?.setSelectionRangeProvider(selectionRangeProvider);
  }, [selectionRangeProvider]);

  // selectedHandlesProvider が変更されたら既存エディタに反映
  useEffect(() => {
    editorRef.current?.setSelectedHandlesProvider(selectedHandlesProvider);
  }, [selectedHandlesProvider]);

  // コンテナのリサイズを監視
  const resizeCallback = useCallback(() => {
    editorRef.current?.resize();
  }, []);
  useResizeObserver(graphCanvasRef, resizeCallback);

  const captureGraphCanvasFocused = useCallback((): string | null => {
    return editorRef.current?.captureCanvas() ?? null;
  }, []);

  return { graphCanvasRef, captureGraphCanvasFocused };
};
