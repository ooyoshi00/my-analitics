# my-analitics

Rails 8 (API) × React × PostgreSQL で作る「MBTI 診断結果シェアアプリ」の学習リポジトリです。

このリポジトリには 2 つのものが同居します。

| ディレクトリ | 内容 |
| --- | --- |
| `docs/` | 教材本(VitePress)。GitHub Pages で公開されます |
| `api/` | Rails 8 API(教材を読みながら自分で作る) |
| `frontend/` | React + Vite + TypeScript(教材を読みながら自分で作る) |

## 教材本を読む

公開版: `https://<GitHubユーザー名>.github.io/my-analitics/`

ローカルで読む場合:

```bash
npm install
npm run docs:dev
# → http://localhost:5173/my-analitics/
```

> [!NOTE]
> `docs/.vitepress/config.ts` の `base` はリポジトリ名 (`/my-analitics/`) と一致させています。
> リポジトリ名を変える場合は `base` も合わせて変更してください。

## GitHub Pages の有効化(初回のみ)

1. このリポジトリを GitHub に push する
2. GitHub のリポジトリ設定 → **Settings → Pages → Source** を **GitHub Actions** にする
3. main ブランチへの push で `.github/workflows/deploy-docs.yml` が本をビルドして公開する

## アプリの開発環境

第2章以降で `docker compose` を使って構築していきます。詳細は教材本を参照してください。
