# MoPhrase

手描き入力をキーフレーム化し、LLM の提案を活用してモーショングラフィックスを編集する Web ベースのエディタです。

## 概要

MoPhrase は、スケッチベースのワークフローと AI による編集提案を組み合わせたモーション編集ツールです。

### 主な機能

- **手描き入力**: マウスやタッチでモーションパスを直接描画
- **キーフレーム編集**: 空間パスとイージング曲線を個別に編集
- **LLM 提案**: 自然言語で編集意図を伝え、複数の提案から選択
- **モディファイア**: 提案を差分として適用し、強度を調整可能
- **プロジェクト管理**: IndexedDB での保存・読込

## セットアップ

### 必要要件

- Node.js (推奨: v18 以上)
- pnpm (v9.15.0 以上)

### インストール

```bash
# 依存関係のインストール
pnpm install
```

### LLM API の設定

`.env` ファイルを作成し、以下の環境変数を設定してください：

```env
# Worker secrets
OPENAI_API_KEY=your_openai_api_key_here
CEREBRAS_API_KEY=your_cerebras_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Provider: "openai" or "cerebras" or "google" (default: "cerebras")
VITE_PROVIDER=cerebras

# Model name (optional)
# OpenAI: gpt-5.2 など
# Cerebras: gpt-oss-120b など
# Google AI Studio: gemini-3-flash-preview など
VITE_MODEL=gpt-oss-120b
```

## 開発

### 開発サーバー起動

```bash
# アプリとWorkerを同時起動
pnpm dev

# アプリのみ起動
pnpm dev:app

# Workerのみ起動
pnpm dev:worker
```

ブラウザで `http://localhost:5173` を開いてください。

### ビルド

```bash
pnpm build
```

### Cloudflare Workers へのデプロイ

```bash
# フロントをビルド
pnpm build

# Worker をデプロイ（ルートの wrangler.jsonc を使用）
pnpx wrangler deploy
```

### リント・フォーマット

```bash
# チェックのみ
pnpm check

# 自動修正
pnpm fix
```

## 使い方

1. **描画モード**: ペンツールでモーションパスを描く
2. **選択モード**: パスや制御点を選択・編集
3. **提案生成**: 編集したい部分を選択し、自然言語で意図を入力
4. **提案適用**: 複数の提案から選び、強度を調整
5. **再生**: タイムラインで動きを確認

詳細な使用方法は[用語集](docs/terminology.md)と[アーキテクチャ](docs/architecture.md)を参照してください。

## プロジェクト構成

```
src/
├── components/      # React UIコンポーネント
├── core/           # コアロジック（フィッティング、モーション管理）
├── editor/         # スケッチ・グラフエディタ
├── hooks/          # Reactフック
├── prompts/        # LLMプロンプト
├── services/       # 外部サービス（LLM、ストレージ）
├── suggestion/     # 提案生成・管理
└── utils/          # ユーティリティ関数

worker/             # Cloudflare Worker（LLM API中継）
docs/               # ドキュメント
```

## ドキュメント

- [用語集](docs/terminology.md) - MoPhrase の概念と用語定義
- [アーキテクチャ](docs/architecture.md) - システム構成とデータフロー
- [TODO](docs/todo.md) - 開発タスク管理

## 技術スタック

- **フロントエンド**: React, TypeScript, Vite, Tailwind CSS
- **グラフィックス**: p5.js
- **状態管理**: React Hooks
- **LLM**: OpenAI / Cerebras / Google AI Studio API
- **バックエンド**: Cloudflare Workers

## ライセンス

Private project

## 開発者向け情報

### プロンプト調整

LLM の提案品質を改善したい場合は、[keyframe-prompt-tuning スキル](.codex/skills/keyframe-prompt-tuning/SKILL.md)を参照してください。

### エディタ操作検証

UI 変更後の動作確認は、[editor-interaction-check スキル](.codex/skills/editor-interaction-check/SKILL.md)を使用できます。
