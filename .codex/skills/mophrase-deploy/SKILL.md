---
name: mophrase-deploy
description: "MoPhraseをCloudflare Workersへ反映する定型デプロイスキル。ユーザーが『Cloudflareにデプロイして』『Workersに反映して』『本番を更新して』と依頼したときに使う。`pnpm i` → `pnpm build` → `pnpx wrangler deploy --config worker/wrangler.toml` を順に実行し、失敗時は作業ディレクトリとWrangler認証を確認して復旧する。"
---

# Mophrase Deploy

## Overview

MoPhrase のフロント+Worker構成を Cloudflare Workers に反映する。  
ルートで依存解決・ビルドを行い、`worker/wrangler.toml` を明示してデプロイする。

## Workflow

1. リポジトリルートへ移動する。  
   `cd /Users/yuto/Documents/GitHub/laboratory/mophrase`
2. 依存関係をインストールする。  
   `pnpm i`
3. ビルドする。  
   `pnpm build`
4. Cloudflare にデプロイする。  
   `pnpx wrangler deploy --config worker/wrangler.toml`

## Guardrails

- `The Wrangler application detection logic has been run in the root of a workspace` が出た場合:
  `--config worker/wrangler.toml` を付けて再実行する。  
  代替として `cd worker && npx wrangler deploy` でもよい。
- `Not logged in` が出た場合:
  `cd worker && npx wrangler login` を実行してから再デプロイする。
- デプロイ後は公開 URL を1行で共有する。

## Quick Commands

```bash
cd /Users/yuto/Documents/GitHub/laboratory/mophrase
pnpm i
pnpm build
pnpx wrangler deploy --config worker/wrangler.toml
```
