---
name: editor-interaction-check
description: "MoPhraseのエディタ操作確認を定型化するスキル。ユーザーが「描画や選択を直したので壊れていないか確認したい」「編集操作のチェックをしたい」「UI変更後の最低限の動作確認をしたい」と依頼したときに使う。`src/editor` `src/hooks` `src/components` の変更影響を見て、必要な自動チェックと手動チェックを実施する。"
---

# Editor Interaction Check

## Overview

MoPhrase の編集体験が壊れていないかを短時間で確認する。  
変更内容に応じて、`自動チェック` と `手動チェック` を最小セットで実行する。

## Workflow

1. 変更差分を確認する。  
   `git status --short` と `git diff --name-only` で対象ファイルを把握する。
2. 影響範囲を決める。  
   `references/change-impact-map.md` を使って、必要な確認項目を選ぶ。
3. 自動チェックを実行する。  
   まず `pnpm run check`、必要に応じて `pnpm run build` と `pnpm -C worker check` を実行する。
4. 手動チェックを実行する。  
   `references/manual-checklist.md` から対象項目だけを実施する。
5. 結果を報告する。  
   失敗項目、再現手順、期待値との差分、暫定回避策を短くまとめる。

## Guardrails

- 無関係な領域までフルチェックを強制しない。差分起点で絞り込む。
- 失敗したチェックは握りつぶさず、失敗ログと再現条件を残す。
- API依存項目が実行できない場合は、`未実施` と理由を明記する。
- 修正提案をする場合は「最小修正」を優先する。

## Quick Commands

```bash
git status --short
git diff --name-only
pnpm run check
pnpm run build
pnpm -C worker check
pnpm run dev
```

## Resources

- `references/manual-checklist.md`: 手動回帰チェック項目
- `references/change-impact-map.md`: 差分ファイルと確認項目の対応表
