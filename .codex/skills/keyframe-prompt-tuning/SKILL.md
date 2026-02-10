---
name: keyframe-prompt-tuning
description: "MoPhraseのキーフレーム提案用プロンプト（`src/prompts/keyframePrompt.md`）を改善するスキル。ユーザーが「提案の質を上げたい」「プロンプトを調整したい」「LLMの出力が不安定・意図外」と依頼したときに使う。出力スキーマ整合性（`src/types.ts`）を維持しつつ、指示解釈・スタイル保持・バリエーション品質を改善する。"
---

# Keyframe Prompt Tuning

## Overview

MoPhrase の提案品質を上げるため、プロンプトを小さく安全に改善する。  
編集対象は `src/prompts/keyframePrompt.md` とし、必要に応じて `src/types.ts` と `src/suggestion/suggestionService.ts` を参照する。

## Workflow

1. 現状を把握する。  
   `src/prompts/keyframePrompt.md`、`src/types.ts` の `suggestionResponseSchema`、`src/suggestion/suggestionService.ts` を確認する。
2. 問題を分類する。  
   以下のどれに該当するか決める。
   - 意図解釈のズレ（言語解釈）
   - スタイル保持不足（過剰な整形）
   - JSON不整合（null/必須項目/件数）
   - 3案の差分不足（多様性不足）
3. 変更方針を1つに絞る。  
   1回の編集で狙う改善点を1つに絞り、差分を最小化する。
4. プロンプトを編集する。  
   ルールの追加よりも、既存ルールの明確化・優先順位の明示を優先する。
5. 自己検証する。  
   `references/eval-rubric.md` の観点で確認し、必要なら再編集する。
6. 変更結果を共有する。  
   何を直したか、どの症状を狙って改善したか、残リスクは何かを短く報告する。

## Guardrails

- `suggestions` は常に3件とする。
- `time` を変更しない。
- `sketchIn/sketchOut/graphIn/graphOut` は省略せず `null` 許容で扱う。
- 数値は有限値のみを許容する（`NaN` / `Infinity` を禁止する）。
- ユーザーが明示しない限り、手描きの揺らぎを除去しない。
- 3提案は別アプローチにし、同一案のコピーを作らない。

## Editing Heuristics

- ルール競合がある場合は優先順位を書く（例: 「スタイル保持 > 幾何学的整形」）。
- 曖昧語の解釈は「空間」「時間」「両方」の判定基準を短文で追加する。
- 制約は文章で散らさず、まとまった箇条書きに集約する。
- 出力フォーマット説明は冗長化せず、必須条件だけを明記する。

## Quick Commands

```bash
git diff -- src/prompts/keyframePrompt.md
pnpm run check
```

## Resources

- `references/eval-rubric.md`: 評価軸と最低限の検証プロンプト
- `references/patch-recipes.md`: 症状別の修正パターン
