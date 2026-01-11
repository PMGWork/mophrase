import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type p5 from 'p5';
import type { Colors, Config } from '../config';
import type { Path } from '../types';
import { GraphEditor } from '../editor/graphEditor/editor';

// グラフエディタのパラメータ
type UseGraphEditorParams = {
  activePath: Path | null; // 現在編集しているパス
  config: Config; // 設定
  colors: Colors; // カラースキーム
  previewProvider?: (
    p: p5,
  ) => { curves: p5.Vector[][]; strength: number } | null; // プレビュー用のグラフ曲線を提供
};

// グラフエディタの結果
type UseGraphEditorResult = {
  graphCanvasRef: RefObject<HTMLDivElement | null>; // グラフエディタのキャンバス参照
};

// グラフエディタを管理するカスタムフック
export const useGraphEditor = ({
  activePath,
  config,
  colors,
  previewProvider,
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

  // activePathが変更されたら既存エディタのパスを更新
  useEffect(() => {
    editorRef.current?.setPath(activePath ?? null);
  }, [activePath]);

  // previewProviderが変更されたら既存エディタに反映
  useEffect(() => {
    if (!previewProvider) return;
    editorRef.current?.setPreviewProvider(previewProvider);
  }, [previewProvider]);

  // グラフパスが有効になったらリサイズイベントを発火
  const hasGraphPath = (activePath?.keyframes?.length ?? 0) >= 2;
  useEffect(() => {
    if (!hasGraphPath) return;
    window.dispatchEvent(new Event('resize'));
  }, [hasGraphPath]);

  return { graphCanvasRef };
};
