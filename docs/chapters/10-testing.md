# 第10章 テスト

## この章でやること

- **RSpec** と **FactoryBot** を導入する(どちらも業務で主流)
- モデル spec で `Result` のバリデーションと `DiagnosisUrlParser` をテストする
- request spec で認証・認可・共有 API をテストする
- GitHub Actions で push のたびにテストを回す(CI)

手動での動作確認(curl やブラウザ)をここまで繰り返してきましたが、それを**コード化して毎回自動で**やるのがテストです。

## 手を動かす

### Step 1: RSpec と FactoryBot を入れる

`api/Gemfile` の `group :development, :test do` ブロックに追記:

```ruby
group :development, :test do
  # ...(既存の gem はそのまま)
  gem "rspec-rails"
  gem "factory_bot_rails"
end
```

```bash
docker compose run --rm api bundle install
docker compose run --rm api bin/rails generate rspec:install
```

`spec/` ディレクトリと設定ファイルが生成されます。`api/spec/rails_helper.rb` に 2 か所手を入れます:

```ruby
# ① このコメントアウトを外す(spec/support/ 以下を自動読み込み)
Rails.root.glob("spec/support/**/*.rb").sort_by(&:to_s).each { |f| require f }
```

```ruby
RSpec.configure do |config|
  # ...(既存設定はそのまま)

  # ② FactoryBot の create/build を短く書けるようにする
  config.include FactoryBot::Syntax::Methods
end
```

### Step 2: ファクトリを書く

テストデータの「レシピ」を定義します。

`api/spec/factories/users.rb`:

```ruby
FactoryBot.define do
  factory :user do
    sequence(:email_address) { |n| "user#{n}@example.com" }
    password { "password123" }
  end
end
```

`api/spec/factories/diagnoses.rb`:

```ruby
FactoryBot.define do
  factory :diagnosis do
    name { "MBTI(16タイプ性格診断)" }
    slug { "mbti" }
  end
end
```

`api/spec/factories/diagnosis_types.rb`:

```ruby
FactoryBot.define do
  factory :diagnosis_type do
    diagnosis
    code { "INTP" }
    name { "論理学者" }
    description { "テスト用の説明文" }
  end
end
```

`api/spec/factories/results.rb`:

```ruby
FactoryBot.define do
  factory :result do
    user
    diagnosis_type
    source_url { "https://www.16personalities.com/intp-personality" }
    scores { { "mind" => 30, "energy" => 80, "nature" => 75, "tactics" => 40, "identity" => 60 } }
  end
end
```

`sequence` は呼ばれるたびに連番を進める仕組みで、ユニーク制約(メールアドレス)との衝突を避けます。関連(`user` や `diagnosis`)は名前を書くだけで自動的に作られます。

### Step 3: モデル spec を書く

`api/spec/models/result_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Result, type: :model do
  describe "バリデーション" do
    it "正しい属性なら有効" do
      expect(build(:result)).to be_valid
    end

    it "scores のキーが欠けていると無効" do
      result = build(:result, scores: { "mind" => 50 })
      expect(result).not_to be_valid
      expect(result.errors[:scores]).to be_present
    end

    it "scores に 0〜100 の範囲外があると無効" do
      result = build(:result, scores: {
        "mind" => 101, "energy" => 50, "nature" => 50, "tactics" => 50, "identity" => 50
      })
      expect(result).not_to be_valid
    end

    it "不正な chart_type は無効" do
      expect(build(:result, chart_type: "pie3d")).not_to be_valid
    end
  end

  describe "share_token" do
    it "保存時に自動生成される" do
      result = create(:result)
      expect(result.share_token).to be_present
      expect(result.share_token.length).to be >= 24
    end
  end
end
```

`api/spec/services/diagnosis_url_parser_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe DiagnosisUrlParser do
  # 判定先のマスターデータを用意しておく
  let!(:intp) { create(:diagnosis_type, code: "INTP") }

  it "英語版の結果URLからタイプを判定できる" do
    expect(described_class.detect("https://www.16personalities.com/intp-personality")).to eq(intp)
  end

  it "日本語版(エンコード済み)のURLからも判定できる" do
    url = "https://www.16personalities.com/ja/intp%E5%9E%8B%E3%81%AE%E6%80%A7%E6%A0%BC"
    expect(described_class.detect(url)).to eq(intp)
  end

  it "大文字混じりでも判定できる" do
    expect(described_class.detect("https://example.com/INTP")).to eq(intp)
  end

  it "タイプ名を含まないURLは nil" do
    expect(described_class.detect("https://www.16personalities.com/profiles/abc123")).to be_nil
  end

  it "URLでない文字列は nil" do
    expect(described_class.detect("そもそもURLじゃない")).to be_nil
  end

  it "部分一致(単語の一部)では誤判定しない" do
    expect(described_class.detect("https://example.com/paintpro")).to be_nil
  end
end
```

最後のケースに注目してください。`paintpro` には `intp` が含まれますが、第6章のパーサーは `\b`(単語境界)で判定しているので誤検出しません。**「こういう入力で壊れないか?」を先回りして書き残せる**のがテストの価値です。

### Step 4: request spec を書く

request spec は「HTTP リクエストを投げてレスポンスを検証する」テストで、ルーティング・認証・コントローラ・モデル・JSON 化まで一気通貫で検証できます。API のテストの主役です。

まずログイン用ヘルパー。`api/spec/support/auth_helpers.rb`:

```ruby
module AuthHelpers
  # request spec 内ではクッキーが引き継がれるので、
  # 一度ログインすれば以降のリクエストは認証済みになる
  def sign_in(user, password: "password123")
    post "/api/session", params: { email_address: user.email_address, password: password }, as: :json
  end
end

RSpec.configure do |config|
  config.include AuthHelpers, type: :request
end
```

`api/spec/requests/authentication_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "認証", type: :request do
  describe "POST /api/users(サインアップ)" do
    it "登録と同時にログイン状態になる" do
      post "/api/users", params: {
        user: {
          email_address: "new@example.com",
          password: "password123",
          password_confirmation: "password123"
        }
      }, as: :json

      expect(response).to have_http_status(:created)

      get "/api/me"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["email_address"]).to eq("new@example.com")
    end

    it "パスワードが短いと 422" do
      post "/api/users", params: {
        user: { email_address: "new@example.com", password: "short", password_confirmation: "short" }
      }, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "POST /api/session(ログイン)" do
    let!(:user) { create(:user) }

    it "正しいパスワードでログインできる" do
      sign_in(user)
      expect(response).to have_http_status(:created)
    end

    it "間違ったパスワードは 401" do
      sign_in(user, password: "wrong-password")
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/me" do
    it "未ログインは 401" do
      get "/api/me"
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
```

`api/spec/requests/results_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "結果API", type: :request do
  let!(:user) { create(:user) }
  let!(:diagnosis_type) { create(:diagnosis_type) }

  describe "POST /api/results" do
    it "未ログインは 401" do
      post "/api/results", params: { result: { diagnosis_type_id: diagnosis_type.id } }, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "ログイン済みなら登録できる" do
      sign_in(user)
      post "/api/results", params: {
        result: {
          diagnosis_type_id: diagnosis_type.id,
          source_url: "https://www.16personalities.com/intp-personality",
          scores: { mind: 30, energy: 80, nature: 75, tactics: 40, identity: 60 }
        }
      }, as: :json

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["diagnosis_type"]["code"]).to eq("INTP")
      expect(user.results.count).to eq(1)
    end
  end

  describe "GET /api/results/:id(認可)" do
    it "他人の結果は 404" do
      other_result = create(:result)  # 別ユーザーの結果
      sign_in(user)

      get "/api/results/#{other_result.id}"
      expect(response).to have_http_status(:not_found)
    end
  end
end
```

`api/spec/requests/shared_results_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "共有API", type: :request do
  let!(:result) { create(:result) }

  it "未ログインでもトークンで閲覧できる" do
    get "/api/shared/#{result.share_token}"
    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["diagnosis_type"]["code"]).to eq(result.diagnosis_type.code)
  end

  it "存在しないトークンは 404" do
    get "/api/shared/invalid-token"
    expect(response).to have_http_status(:not_found)
  end
end
```

### Step 5: 実行する

```bash
docker compose run --rm api bundle exec rspec
```

全部緑(`0 failures`)になるまで直してください。特定のファイルだけ実行することもできます:

```bash
docker compose run --rm api bundle exec rspec spec/services/diagnosis_url_parser_spec.rb
```

### Step 6: GitHub Actions で CI を組む

push のたびに自動でテストが走るようにします。`.github/workflows/ci.yml`(リポジトリルート)を作成:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  rspec:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
        ports:
          - "5432:5432"
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_HOST: localhost
      DATABASE_USER: postgres
      DATABASE_PASSWORD: password

    defaults:
      run:
        working-directory: api

    steps:
      - uses: actions/checkout@v4

      - uses: ruby/setup-ruby@v1
        with:
          working-directory: api
          bundler-cache: true

      - name: Set up database
        run: bin/rails db:prepare
        env:
          RAILS_ENV: test

      - name: Run RSpec
        run: bundle exec rspec
```

compose.yml と見比べてください。`services.postgres` は compose の `db` サービス、`env` は compose の `environment` に対応しています。**CI でもローカルと同じく「環境変数で接続先を注入」しているだけ**です。第2章の設計がここで効いています。

## 動作確認

- ローカルで `bundle exec rspec` が全部通る
- GitHub に push すると Actions タブで CI が走り、緑のチェックがつく(push は第11章の前までに GitHub リポジトリを作っていれば確認できます)
- わざとテストを壊して push し、赤くなることも確認しておくと CI への信頼感が持てます

## 解説

### どの層のテストを書くべきか

この章で書いた 2 種類の使い分け:

| 種類 | 対象 | 得意なこと |
| --- | --- | --- |
| モデル / サービス spec | クラス単体 | 入力パターンの網羅(パーサーの 6 ケースのような) |
| request spec | HTTP の入口から出口まで | 認証・認可・ルーティング・JSON 形式の検証 |

ロジックの分岐はユニットで細かく、結合部分は request spec で太く。「ピラミッド型(下ほど多く)」が定番のバランスです。UI 込みの E2E テストはさらに上の層ですが、費用対効果を考えてこの教材では扱いません。

### 認可のテストは最優先で書く

`他人の結果は 404` のテストは、この章で一番大事な 1 本です。認可バグは**画面を普通に触っているだけでは見つからず**(自分のデータしか開かないため)、漏れると即インシデントになるからです。「セキュリティ境界には必ずテストを置く」を習慣にしてください。

### FactoryBot と seed の役割分担

- seed(第3章)… アプリの動作に必要な**マスターデータ**。本番にも入れる
- ファクトリ … テストのたびに作っては消す**試験用データ**のレシピ

テストは各 example の後に DB がロールバックされる(transactional fixtures)ので、ファクトリで作ったデータは残りません。

## チェックリスト

- [ ] `bundle exec rspec` が全部緑
- [ ] request spec でクッキーが引き継がれる仕組み(sign_in ヘルパー)を説明できる
- [ ] 認可テストがなぜ重要か説明できる
- [ ] git commit した

```bash
git add .
git commit -m "第10章: RSpecとCI"
```

▶ [第11章 デプロイ](/chapters/11-deploy)
