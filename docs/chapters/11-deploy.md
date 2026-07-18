# 第11章 デプロイ

## この章でやること

- **Neon** に無料の PostgreSQL を作る
- React のビルドを Rails に同梱する**本番用マルチステージ Dockerfile** を書く
- SPA を Rails から配信するための**フォールバックルート**を作る
- **Render** の無料プランへデプロイして、世界に公開する

費用はゼロ、クレジットカードも不要です。

```
ブラウザ ──▶ Render Web Service(無料)──▶ Neon PostgreSQL(無料)
             Rails コンテナ 1 つ
             ・/api/* → Rails が JSON を返す
             ・それ以外 → public/ に同梱した React を返す
```

## 手を動かす

### Step 1: GitHub にリポジトリを push しておく

Render は GitHub リポジトリと連携してデプロイします。まだの場合はリポジトリを GitHub に作って push してください(この教材リポジトリの README にも手順があります)。

### Step 2: Neon で PostgreSQL を作る

1. [neon.tech](https://neon.tech) に GitHub アカウントでサインアップ
2. プロジェクトを作成(リージョンは近いところ、例: Asia Pacific / Singapore)
3. ダッシュボードの **Connection string** をコピー

```
postgresql://ユーザー名:パスワード@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

この 1 本の URL が本番の `DATABASE_URL` になります。**パスワードを含む秘密情報**なので、リポジトリにはコミットせず、後で Render の環境変数に入れます。

### Step 3: database.yml の production を DATABASE_URL 対応にする

`api/config/database.yml` の `production:` セクションを次のように置き換えます:

```yaml
production:
  <<: *default
  url: <%= ENV["DATABASE_URL"] %>
```

`url:` に接続文字列を渡すと、ホスト・ユーザー・パスワード・DB 名・SSL 設定がまとめて解決されます。開発は個別の環境変数、本番は URL 1 本、どちらも「設定はコードの外」という第2章の方針のままです。

### Step 4: SPA フォールバックルートを作る

本番では「`/api` 以外のあらゆるパス」で React(public/index.html)を返す必要があります。`/share/abc123` のような URL に直アクセスされたとき、サーバーが知らないパスでも index.html を返せば、あとは React Router が処理するからです。

`api/app/controllers/static_controller.rb`:

```ruby
# 本番で React (public/index.html) を返すためのコントローラ。
# 開発中は Vite が配信するので使われない
class StaticController < ActionController::Base
  def index
    send_file Rails.public_path.join("index.html"), type: "text/html", disposition: "inline"
  end
end
```

`api/config/routes.rb` の**末尾**(`namespace :api` の外)に追加:

```ruby
  # API 以外のパスはすべて React に任せる(SPA フォールバック)
  root "static#index"
  get "*path", to: "static#index",
      constraints: ->(req) { !req.path.start_with?("/api", "/up") && !req.path.include?(".") }
```

- `*path` はワイルドカード。ルーティングの最後に置くことで「どのルートにも当たらなかったもの」を拾います
- `.` を含むパス(`/favicon.ico` など)は除外し、実在しないファイルは素直に 404 にします

なお、`public/` 配下の静的ファイル(React のビルド成果物)は、Rails 7.1 以降は本番でも標準で配信されます(昔の Rails では `RAILS_SERVE_STATIC_FILES` 環境変数が必要でした)。

### Step 5: 本番用 Dockerfile を書く

リポジトリの**ルート**に `Dockerfile` を作成します(`api/` の中の生成済み Dockerfile ではなく、frontend と api の両方をビルドするためにルートに置きます)。

```dockerfile
# ========== ステージ1: React をビルドする ==========
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
# → /frontend/dist に静的ファイル一式ができる

# ========== ステージ2: gem をインストールし、アプリを組み立てる ==========
FROM ruby:3.4-slim AS build
WORKDIR /rails
ENV RAILS_ENV=production \
    BUNDLE_DEPLOYMENT=1 \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_WITHOUT="development test"
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends build-essential libpq-dev git pkg-config && \
    rm -rf /var/lib/apt/lists/*
COPY api/Gemfile api/Gemfile.lock ./
RUN bundle install && rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache
COPY api/ ./
RUN bundle exec bootsnap precompile app/ lib/

# ========== ステージ3: 実行イメージ(小さく・非rootで) ==========
FROM ruby:3.4-slim
WORKDIR /rails
ENV RAILS_ENV=production \
    BUNDLE_DEPLOYMENT=1 \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_WITHOUT="development test"
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends libpq5 curl && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /rails /rails
COPY --from=frontend /frontend/dist /rails/public
RUN useradd rails --create-home --shell /bin/bash && \
    chown -R rails:rails /rails
USER rails
ENTRYPOINT ["./bin/docker-entrypoint"]
EXPOSE 3000
CMD ["./bin/rails", "server", "-b", "0.0.0.0"]
```

`COPY --from=frontend /frontend/dist /rails/public` の 1 行が、この構成の要です。React のビルド成果物が Rails の `public/` に置かれ、1 コンテナで完結します。

### Step 6: 起動時にマイグレーションを流す

`rails new` が生成した `api/bin/docker-entrypoint` は「rails server として起動されたら `db:prepare` を実行する」スクリプトですが、判定条件がコマンド引数の形に依存していて壊れやすいので、確実に動く形に書き換えます:

```bash
#!/bin/bash -e

# rails server として起動された場合は、先にDBの作成・マイグレーションを行う
if [ "${1}" == "./bin/rails" ] && [ "${2}" == "server" ]; then
  ./bin/rails db:prepare
fi

exec "${@}"
```

`db:prepare` は「DB がなければ作成 + スキーマ投入 + seed、あれば未適用のマイグレーションだけ実行」という賢いタスクです。デプロイのたびに自動でスキーマが最新化されます。

::: warning ローカルでビルドを試す
Render に投げる前にローカルで本番イメージを一度ビルドしておくと、失敗を早く発見できます。

```bash
docker build -t my-analytics-prod .
```

`npm run build` は TypeScript の型チェックを伴うため、開発中は動いていても型エラーでビルドが落ちることがあります。ここで全部潰しておきましょう。
:::

### Step 7: Render にデプロイする

1. [render.com](https://render.com) に GitHub アカウントでサインアップ
2. **New → Web Service** → GitHub リポジトリ `my-analitics` を接続
3. 設定:
   - **Language**: Docker(ルートの Dockerfile が自動検出されます)
   - **Region**: Singapore(Neon と近い場所)
   - **Instance Type**: **Free**
4. **Environment Variables** に 2 つ追加:
   - `RAILS_MASTER_KEY` … `api/config/master.key` ファイルの中身(credentials の復号鍵)
   - `DATABASE_URL` … Step 2 でコピーした Neon の接続文字列
5. Advanced 設定で **Health Check Path** を `/up` に
6. **Create Web Service**

ビルドログが流れ、数分で `https://あなたのサービス名.onrender.com` が発行されます。以降は **main に push するたびに自動で再デプロイ**されます(業務での「main マージ → ECS へ自動デプロイ」と同じ体験です)。

## 動作確認

発行された URL で本番の全機能を通しで確認します:

1. `https://xxx.onrender.com/up` → 200
2. サインアップ → 結果登録(URL 判定含む)→ チャート / テーマ切り替え
3. 共有 URL をスマホなど**別デバイス**で開く(これができれば本当に「公開」されています)
4. Render ダッシュボードの **Logs** で Rails のログが流れているのを確認

::: tip 無料プランの挙動
- **15 分アクセスがないとスリープ**し、次のアクセスで起き上がるまで 1 分弱かかります。個人の練習用途では許容範囲です
- Neon 側も未使用時はコンピュートが自動停止しますが、接続時に数秒で復帰します
- 無料 Web Service の稼働時間は月 750 時間で、1 サービスなら常時稼働しても足ります
:::

## 解説

### マルチステージビルドの意味

ステージ 2 には build-essential や git など**ビルドにしか要らない道具**が入っており、イメージが太ります。最終ステージは「できあがった gem とアプリ」だけをコピーして受け取るので、実行イメージは小さく、攻撃対象面も減ります。Node に至っては最終イメージに 1 バイトも残りません。**「ビルド環境と実行環境を分ける」**は業務の ECS 用イメージでも必ず使われている考え方です。

### 秘密情報の 2 系統

| 種類 | 例 | 渡し方 |
| --- | --- | --- |
| Rails credentials | 内部的な暗号鍵など | 暗号化ファイル(コミットされる)+ 復号鍵 `RAILS_MASTER_KEY` だけ環境変数 |
| 外部サービスの接続情報 | `DATABASE_URL` | 環境変数に直接 |

`master.key` と `DATABASE_URL` は**絶対にコミットしない**こと。`api/.gitignore` に `master.key` が入っていることを確認しておきましょう。業務ではこれらが AWS Secrets Manager に置かれ、ECS タスク定義から注入されます。器が違うだけで考え方は同じです。

### デプロイのパイプライン全体を眺める

この時点で、push 1 回で次が全部動きます:

```
git push origin main
  ├─ GitHub Actions: RSpec(第10章)     … 壊れていたら気づく
  ├─ GitHub Actions: 教材本のデプロイ     … GitHub Pages 更新
  └─ Render: Docker ビルド → デプロイ
       └─ 起動時に db:prepare(マイグレーション)
```

小さな構成ですが、「テスト → ビルド → デプロイ → DB マイグレーション」という継続的デリバリーの背骨が一通り入っています。

## よくあるトラブル

| 症状 | 原因と対処 |
| --- | --- |
| Render のビルドで `npm run build` 失敗 | TypeScript の型エラー。ローカルで `cd frontend && npm run build` を再現して修正 |
| 起動直後にクラッシュ | Logs を確認。`RAILS_MASTER_KEY` の値ミス(改行や空白の混入)が定番 |
| `PG::ConnectionBad` | `DATABASE_URL` の貼りミス。`?sslmode=require` まで含めて全部貼る |
| ページは出るが `/share/...` 直アクセスが 404 | SPA フォールバックルート(Step 4)の入れ忘れ |
| 初回アクセスが異常に遅い | 無料プランのスリープからの復帰。仕様です |

## チェックリスト

- [ ] 本番 URL でサインアップ〜共有まで全機能が動く
- [ ] main に push すると自動で再デプロイされる
- [ ] マルチステージビルドの各ステージの役割を説明できる
- [ ] master.key がコミットされていないことを確認した
- [ ] 完走おつかれさまでした 🎉

▶ [付録A 業務インフラ(ECS Fargate)との対応](/chapters/appendix-a-ecs-fargate)
