# 変更影響マップ

## 使い方

- 変更ファイルに一致する行を探す。  
- 対応するチェックカテゴリだけを `manual-checklist.md` から実施する。

## マップ

- `src/editor/sketchEditor/penTool.ts`  
  対象: A. Pen Tool / F. Shortcut

- `src/editor/sketchEditor/selectTool.ts`  
  対象: B. Select Tool / C. Handle Drag / E. Suggestion UI

- `src/editor/sketchEditor/editor.ts`  
  対象: A / B / C / E / F / G（広範囲）

- `src/editor/graphEditor/editor.ts`  
  対象: D. Graph Editor / C. Handle Drag

- `src/core/handleManager.ts`  
  対象: C. Handle Drag / B. Select Tool

- `src/hooks/useSketchEditor.ts`  
  対象: E. Suggestion UI / G. Save-Load / F. Shortcut

- `src/hooks/useGraphEditor.ts`  
  対象: D. Graph Editor

- `src/components/Header.tsx` `src/components/ToolButton.tsx`  
  対象: F. Shortcut / ツール切り替えUI

- `src/components/Suggestion.tsx` `src/suggestion/*.ts`  
  対象: E. Suggestion UI

- `src/components/Playback.tsx` `src/components/ProjectSettings.tsx`  
  対象: G. Save-Load（再生設定含む）

## 推奨セット

- 軽微修正（表示調整中心）: `pnpm run check` + 関連カテゴリ1〜2個
- 操作ロジック修正: `pnpm run check` + `pnpm run build` + 関連カテゴリ3個以上
- エディタ中核修正（`editor.ts` / `handleManager.ts`）: 主要カテゴリ A〜G を通しで実施
