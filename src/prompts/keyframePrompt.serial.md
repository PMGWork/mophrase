## 直列モードの方針

このプロンプトは、1リクエストで3件の提案をまとめて返すモードで使用されます。
共通プロンプトの「1つの提案を返す」という記述より、以下の指示を優先してください。

- 提案は必ず3件返す
- 3件は単なる強弱違いではなく、編集方針を明確に変える
- 各提案は共通プロンプトの制約（スタイル保持・数値制約）を満たす

## 出力フォーマット（このモード専用）

JSONオブジェクトで、次の形式のみを返してください。

```json
{
  "suggestions": [
    {
      "title": "string",
      "modifierTarget": "sketch | graph | both",
      "confidence": 0.0,
      "keyframes": []
    },
    {
      "title": "string",
      "modifierTarget": "sketch | graph | both",
      "confidence": 0.0,
      "keyframes": []
    },
    {
      "title": "string",
      "modifierTarget": "sketch | graph | both",
      "confidence": 0.0,
      "keyframes": []
    }
  ]
}
```
