# エージェント運用ルール

- 日本語で回答する。
- 用語定義は `docs/terminology.md` を参照する。
- システム構成は `docs/architecture.md` を参照する。

## Skills

利用可能なスキルは以下。

- keyframe-prompt-tuning: MoPhraseのキーフレーム提案用プロンプト（`src/prompts/keyframePrompt.md`）を改善するスキル。ユーザーが「提案の質を上げたい」「プロンプトを調整したい」「LLMの出力が不安定・意図外」と依頼したときに使う。出力スキーマ整合性（`src/types.ts`）を維持しつつ、指示解釈・スタイル保持・バリエーション品質を改善する。 (file: /Users/yuto/Documents/GitHub/laboratory/mophrase/.codex/skills/keyframe-prompt-tuning/SKILL.md)
- editor-interaction-check: MoPhraseのエディタ操作確認を定型化するスキル。ユーザーが「描画や選択を直したので壊れていないか確認したい」「編集操作のチェックをしたい」「UI変更後の最低限の動作確認をしたい」と依頼したときに使う。`src/editor` `src/hooks` `src/components` の変更影響を見て、必要な自動チェックと手動チェックを実施する。 (file: /Users/yuto/Documents/GitHub/laboratory/mophrase/.codex/skills/editor-interaction-check/SKILL.md)
