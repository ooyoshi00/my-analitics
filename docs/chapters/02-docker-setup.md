# 第2章 Docker開発環境の構築

## この章でやること

- ローカルに Ruby を入れずに、Docker だけで Rails 8 プロジェクトを新規作成する
- `docker compose` で Rails + PostgreSQL を起動する
- ブラウザで Rails が動いていることを確認する

この章が終わると、リポジトリはこうなります。

```
my-analitics/
├── api/                 # ← 新規作成(Rails 8 API)
│   ├── Dockerfile.dev   # ← 自分で書く(開発用)
│   ├── Dockerfile       # rails new が生成(本番用・第11章で使う)
│   ├── Gemfile
│   └── ...
├── compose.yml          # ← 自分で書く
└── ...(教材本など)
```

## 手を動かす

### Step 1: Docker Desktop を起動する

Docker Desktop を起動し、動いていることを確認します。

```bash
docker version
```

Client / Server 両方のバージョンが表示されれば OK です(Server が出ない場合は Docker Desktop が起動していません)。

### Step 2: rails new を Docker で実行する

ローカルに Ruby がなくても、**Ruby 入りコンテナの中で `rails new` を実行**すればプロジェクトを作れます。リポジトリのルートで:

```bash
docker run --rm -v "$PWD:/work" -w /work ruby:3.4 \
  bash -c "gem install rails -v '~> 8.0' && \
           rails new api --api --database=postgresql \
             --skip-git --skip-ci --skip-kamal --skip-solid"
```

数分かかります(gem のダウンロードと bundle install が走ります)。完了すると `api/` ディレクトリに Rails プロジェクト一式ができています。

各オプションの意味:

| オプション | 意味 |
| --- | --- |
| `--api` | API モード。ビュー層・アセット関連を省いた軽量構成にする |
| `--database=postgresql` | DB アダプタに pg を使う |
| `--skip-git` | リポジトリ直下で既に git 管理しているため、`api/` 内での git init を省略 |
| `--skip-ci` | 生成される GitHub Actions 設定を省略(CI は第10章で自分で書く) |
| `--skip-kamal` | Kamal(Rails 標準のデプロイツール)を省略(デプロイは Render で行う) |
| `--skip-solid` | Solid Cache / Queue / Cable を省略(DB 構成をシンプルに保つ) |

::: warning Linux で開発している場合
Linux の Docker はコンテナ内の root ユーザーでファイルを作るため、生成物が root 所有になります。その場合は `sudo chown -R $USER:$USER api` で所有者を直してください。macOS / Windows(Docker Desktop)では不要です。
:::

### Step 3: 開発用 Dockerfile を書く

`rails new` が生成した `api/Dockerfile` は本番用(小さく・速く・読み取り専用)です。開発ではコードの変更を即座に反映したいので、**開発用の Dockerfile を別に**用意します。

`api/Dockerfile.dev` を作成:

```dockerfile
FROM ruby:3.4

WORKDIR /app

# Gemfile だけ先にコピーして bundle install する。
# こうするとアプリコードだけ変えた場合に bundle install がキャッシュされる
COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . .

EXPOSE 3000
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
```

::: tip `-b 0.0.0.0` はなぜ必要?
Rails サーバーはデフォルトで localhost(コンテナ自身)からの接続しか受けません。ホストマシンのブラウザ → コンテナという接続は「外部から」の接続なので、全インターフェースで待ち受ける `0.0.0.0` を指定します。ECS でも同じ理由で必要になる、コンテナ運用の定番設定です。
:::

### Step 4: compose.yml を書く

リポジトリの**ルート**に `compose.yml` を作成します(`api/` の中ではありません)。

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    command: bash -c "rm -f tmp/pids/server.pid && bin/rails server -b 0.0.0.0"
    volumes:
      - ./api:/app
      - bundle_cache:/usr/local/bundle
    ports:
      - "3000:3000"
    environment:
      DATABASE_HOST: db
      DATABASE_USER: postgres
      DATABASE_PASSWORD: password
    depends_on:
      db:
        condition: service_healthy

volumes:
  pg_data:
  bundle_cache:
```

ポイントを 3 つだけ先に(詳しくは後半の解説で):

- `./api:/app` のボリュームマウントで、**エディタでの変更が即コンテナに反映**される
- `depends_on` + `healthcheck` で「**PostgreSQL の準備ができてから** Rails を起動」を保証する
- DB の接続情報は**環境変数**で渡す(ECS のタスク定義と同じ発想)

### Step 5: database.yml を環境変数対応にする

`api/config/database.yml` の `default` セクションを次のように書き換えます。

```yaml
default: &default
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  host: <%= ENV.fetch("DATABASE_HOST") { "localhost" } %>
  username: <%= ENV.fetch("DATABASE_USER") { "postgres" } %>
  password: <%= ENV.fetch("DATABASE_PASSWORD") { "" } %>
```

`development:` や `test:` セクションはそのまま(`<<: *default` で default を継承している構造は維持)で構いません。

### Step 6: ビルドしてデータベースを作成する

```bash
# イメージをビルド
docker compose build

# データベースを作成(development 用と test 用の 2 つができる)
docker compose run --rm api bin/rails db:create
```

`Created database 'api_development'` / `Created database 'api_test'` と表示されれば成功です。

### Step 7: 起動する

```bash
docker compose up
```

ログに `Listening on http://0.0.0.0:3000` が出たら起動完了です。

## 動作確認

ブラウザ(または別ターミナルの curl)で確認します。

```bash
curl -i http://localhost:3000/up
```

`HTTP/1.1 200 OK` が返れば成功です。`/up` は Rails 8 が標準で持っている**ヘルスチェックエンドポイント**で、アプリが起動し例外なく応答できることを確認できます(ECS や ALB のヘルスチェックでもこの `/up` を使うのが定番です)。

ブラウザで `http://localhost:3000` を開くと Rails のウェルカム画面が表示されます。

止めるときは `Ctrl+C`、完全に片付けるときは:

```bash
docker compose down        # コンテナを削除(DB データは volume に残る)
docker compose down -v     # volume ごと削除(DB データも消える)
```

## 解説

### なぜ 2 つの Dockerfile を使い分けるのか

| | Dockerfile.dev(開発) | Dockerfile(本番・生成済み) |
| --- | --- | --- |
| コード | ボリュームマウントで即反映 | イメージに焼き込み(不変) |
| gem | volume にキャッシュ | イメージに焼き込み |
| 目的 | 変更サイクルを速く | 小さく・速く・どこでも同じに動く |

業務の ECS Fargate で動いているのは後者(本番型)のイメージです。「開発はマウント、本番は焼き込み」という使い分けは Docker 開発の基本パターンです。

### bundle_cache ボリュームの役割

`./api:/app` をマウントすると、イメージビルド時に `/app` へ入れた gem 群がマウントで隠れてしまいます。そこで gem のインストール先(`/usr/local/bundle`)を**名前付きボリューム**にして、コンテナを作り直しても gem が消えないようにしています。

Gemfile を変更したときは:

```bash
docker compose run --rm api bundle install
```

だけで OK です(イメージの作り直しは不要。ボリューム内の gem が更新されます)。

### 接続情報を環境変数にする理由

`database.yml` に直接書かず `ENV.fetch` にしたのは、**環境ごとの差分をコードの外に出す**ためです(いわゆる Twelve-Factor App の思想)。

- 開発: compose.yml の `environment:` で渡す(ホスト名は `db` = サービス名で名前解決される)
- 本番: Render の環境変数で Neon の接続情報を渡す(第11章)
- 業務: ECS タスク定義の環境変数 / Secrets Manager で渡す

コードは同じまま、環境変数だけで接続先が切り替わります。

### rm -f tmp/pids/server.pid は何のため?

Rails サーバーは起動時に PID ファイルを作り、既に存在すると「二重起動」と判断して起動を拒否します。コンテナが異常終了すると PID ファイルが残ってしまうため、起動コマンドで毎回消しています。Rails × Docker の定番トラブル対策です。

## よくあるトラブル

| 症状 | 原因と対処 |
| --- | --- |
| `port is already allocated` | 3000 or 5432 番を他プロセスが使用中。他の compose や ローカル PostgreSQL を停止する |
| `could not translate host name "db"` | `compose.yml` を使わず `docker run` で起動している、またはサービス名の typo。`docker compose up` で起動する |
| `A server is already running` | server.pid の残骸。Step 4 の `command:` に `rm -f tmp/pids/server.pid` が入っているか確認 |
| Gemfile を変えたのに反映されない | `docker compose run --rm api bundle install` を実行 |
| `password authentication failed` | 一度 `docker compose down -v` で volume を消して `db:create` からやり直す(POSTGRES_PASSWORD は初回作成時のみ有効なため) |

## チェックリスト

- [ ] `docker compose up` で Rails と PostgreSQL が起動する
- [ ] `curl http://localhost:3000/up` が 200 を返す
- [ ] 開発用と本番用で Dockerfile を分ける理由を説明できる
- [ ] DB 接続情報が環境変数経由になっている理由を説明できる
- [ ] ここまでを git commit した

```bash
git add .
git commit -m "第2章: Docker開発環境を構築"
```

▶ [第3章 Rails APIの基礎](/chapters/03-rails-api-basics)
