# 第4章 認証機能

## この章でやること

- Rails 8 標準の認証ジェネレータを実行し、**生成されたコードを読み解く**
- API モード向けに改造して、次の 4 エンドポイントを完成させる

| メソッドとパス | 役割 |
| --- | --- |
| `POST /api/users` | サインアップ(登録と同時にログイン) |
| `POST /api/session` | ログイン |
| `DELETE /api/session` | ログアウト |
| `GET /api/me` | ログイン中ユーザーの取得(未ログインなら 401) |

Devise のような認証 gem を使えば数行で済みますが、この章ではあえて標準ジェネレータの中身を読み、**セッション認証がどう動いているのか**を理解します。ここが分かっていれば、業務で Devise に出会っても「中で同じことをやっているだけ」と読めます。

## 手を動かす

### Step 1: 認証ジェネレータを実行する

```bash
docker compose run --rm api bin/rails generate authentication
docker compose run --rm api bundle install
docker compose run --rm api bin/rails db:migrate
```

主に次のものが生成されます(バージョンにより細部は変わります)。

```
app/models/user.rb                      # has_secure_password を持つユーザー
app/models/session.rb                   # ログインセッション(DB に保存)
app/models/current.rb                   # リクエスト中の「現在のセッション」置き場
app/controllers/concerns/authentication.rb  # 認証の本体ロジック
app/controllers/sessions_controller.rb  # ログイン/ログアウト
app/controllers/passwords_controller.rb # パスワードリセット(今回は使わない)
db/migrate/xxxx_create_users.rb         # email_address, password_digest
db/migrate/xxxx_create_sessions.rb      # user_id, ip_address, user_agent
```

Gemfile には `bcrypt`(パスワードのハッシュ化ライブラリ)が追加されます。

::: warning カラム名は `email` ではなく `email_address`
Rails 8 のジェネレータはユーザーのメールカラムを `email_address` という名前で作ります。以降のコードもこれに合わせます。
:::

### Step 2: 生成コードを読む(改造の前に)

改造の前に、核になる 2 ファイルを読みます。**ここがこの章の本体です。**

`app/models/user.rb`(生成されたもの):

```ruby
class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy

  normalizes :email_address, with: ->(e) { e.strip.downcase }
end
```

- `has_secure_password` … `password=` に平文を渡すと bcrypt でハッシュ化して `password_digest` カラムに保存し、`authenticate(平文)` で照合できるようになる。**平文のパスワードは DB に存在しない**
- `normalizes` … 保存前にメールアドレスを正規化(前後の空白除去と小文字化)

`app/controllers/concerns/authentication.rb`(生成されたもの・抜粋):

```ruby
module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated? if respond_to?(:helper_method)
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private
    def require_authentication
      resume_session || request_authentication
    end

    def resume_session
      Current.session ||= find_session_by_cookie
    end

    def find_session_by_cookie
      Session.find_by(id: cookies.signed[:session_id]) if cookies.signed[:session_id]
    end

    def start_new_session_for(user)
      user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session|
        Current.session = session
        cookies.signed.permanent[:session_id] = { value: session.id, httponly: true, same_site: :lax }
      end
    end

    def terminate_session
      Current.session.destroy
      cookies.delete(:session_id)
    end
    # ...(request_authentication は後で API 向けに書き換えます)
end
```

仕組みを言葉にすると:

1. ログイン成功時、`sessions` テーブルに 1 レコード作り、その **id を署名付きクッキー**(`cookies.signed`)としてブラウザに渡す
2. 以降のリクエストではクッキーの session_id から `Session` レコードを引き、`Current.session` に置く(= ログイン中)
3. ログアウトはレコード削除 + クッキー削除

クッキーは `httponly: true`(JS から読めない = XSS でトークンを盗まれない)、署名付き(改ざん不可)、`same_site: :lax`(他サイトからの POST に載らない = CSRF の基本防御)。この 3 点セットは暗記に値します。

### Step 3: API モードで動くようにする

API モード(`ActionController::API`)にはクッキー機能が入っていないので追加します。また、未認証時に「ログイン画面へリダイレクト」する生成コードを「401 を返す」に変えます。

`api/app/controllers/application_controller.rb`:

```ruby
class ApplicationController < ActionController::API
  include ActionController::Cookies
  include Authentication
end
```

`app/controllers/concerns/authentication.rb` の `request_authentication` 前後(リダイレクト関連の private メソッド)を、次の 1 メソッドに置き換えます:

```ruby
    def request_authentication
      render json: { error: "ログインが必要です" }, status: :unauthorized
    end
```

あわせて、リダイレクト用の `after_authentication_url` などビュー前提のメソッドが残っていれば削除して構いません。

さらに、便利メソッドを 1 つ足しておきます(concern の private 内):

```ruby
    def current_user
      Current.session&.user
    end
```

::: info Current とは
`Current` は `ActiveSupport::CurrentAttributes` を使った「リクエストごとにリセットされるグローバル変数置き場」です。リクエスト処理中だけ `Current.session` でどこからでも現在のセッションに触れます。便利ですが置きすぎ注意、が Rails コミュニティの共通見解です。
:::

### Step 4: 第3章のコントローラを認証不要にする

`Authentication` concern を include した瞬間、**全コントローラがログイン必須**になります(`before_action :require_authentication` がデフォルトのため)。診断タイプ一覧は公開情報なので除外します。

`api/app/controllers/api/diagnosis_types_controller.rb` の冒頭に追加:

```ruby
module Api
  class DiagnosisTypesController < ApplicationController
    allow_unauthenticated_access

    # ...(index はそのまま)
```

「デフォルト保護・明示的に公開」の向きになっているのがポイントです。閉じ忘れ(認証漏れ)より開け忘れの方が事故として軽いからです。

### Step 5: サインアップ API を作る

ジェネレータはサインアップを作ってくれないので自作します。

`api/config/routes.rb` の `namespace :api` 内を次のようにします:

```ruby
  namespace :api do
    resources :diagnosis_types, only: [:index]
    resources :users, only: [:create]
    resource :session, only: [:create, :destroy]
    get "me", to: "me#show"
  end
```

`resource :session`(単数形)に注目してください。「自分のセッション」は 1 つしかないので id 不要の単数リソースにします(URL が `/api/session` になり `:id` を取りません)。

`api/app/controllers/api/users_controller.rb`:

```ruby
module Api
  class UsersController < ApplicationController
    allow_unauthenticated_access only: [:create]

    def create
      user = User.new(user_params)
      if user.save
        start_new_session_for(user)
        render json: user_json(user), status: :created
      else
        render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
      end
    end

    private
      def user_params
        params.require(:user).permit(:email_address, :password, :password_confirmation)
      end

      def user_json(user)
        { id: user.id, email_address: user.email_address }
      end
  end
end
```

`User` モデルにバリデーションを足します(`api/app/models/user.rb`):

```ruby
class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy

  normalizes :email_address, with: ->(e) { e.strip.downcase }

  validates :email_address, presence: true, uniqueness: true,
                            format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 8 }, allow_nil: true
end
```

### Step 6: ログイン / ログアウトを JSON 化する

生成された `app/controllers/sessions_controller.rb` は HTML 前提なので、API 版に置き換えます。`api/app/controllers/api/sessions_controller.rb` を作成:

```ruby
module Api
  class SessionsController < ApplicationController
    allow_unauthenticated_access only: [:create]

    def create
      if (user = User.authenticate_by(email_address: params[:email_address], password: params[:password]))
        start_new_session_for(user)
        render json: { id: user.id, email_address: user.email_address }, status: :created
      else
        render json: { error: "メールアドレスまたはパスワードが違います" }, status: :unauthorized
      end
    end

    def destroy
      terminate_session
      head :no_content
    end
  end
end
```

生成された `app/controllers/sessions_controller.rb` と `passwords_controller.rb`(トップレベルの方)は今回使わないので削除して構いません。

::: tip authenticate_by
`User.authenticate_by(email_address: ..., password: ...)` は「ユーザー検索 + パスワード照合」を 1 つにしたメソッドです。ユーザーが存在しない場合もダミーのハッシュ計算を行い、**応答時間の差からメールアドレスの存在が推測される攻撃(タイミング攻撃)を防ぎます**。
:::

### Step 7: /api/me を作る

`api/app/controllers/api/me_controller.rb`:

```ruby
module Api
  class MeController < ApplicationController
    def show
      render json: { id: current_user.id, email_address: current_user.email_address }
    end
  end
end
```

`allow_unauthenticated_access` を**書いていない**ので、未ログインなら concern が 401 を返します。ログイン済みなら必ず `current_user` が取れる、という前提で書けるわけです。

## 動作確認

curl はクッキーを自分で保存・送信する必要があります(`-c` で保存、`-b` で送信)。

```bash
# 1. サインアップ(クッキーを cookie.txt に保存)
curl -i -c cookie.txt -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"user": {"email_address": "test@example.com", "password": "password123", "password_confirmation": "password123"}}'
# → 201 Created / Set-Cookie: session_id=...

# 2. ログイン中ユーザーの確認
curl -i -b cookie.txt http://localhost:3000/api/me
# → 200 {"id":1,"email_address":"test@example.com"}

# 3. クッキーなしだと?
curl -i http://localhost:3000/api/me
# → 401 {"error":"ログインが必要です"}

# 4. ログアウト
curl -i -b cookie.txt -X DELETE http://localhost:3000/api/session
# → 204 No Content

# 5. ログイン
curl -i -c cookie.txt -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"email_address": "test@example.com", "password": "password123"}'
# → 201 Created
```

rails console でも覗いてみましょう。

```ruby
User.first.password_digest
# => "$2a$12$..." ← bcrypt ハッシュ。平文はどこにもない
Session.count
# => ログインのたびに増え、ログアウトで消える
```

## 解説

### なぜトークン(JWT)ではなくクッキーセッションなのか

SPA + API の認証には「httpOnly クッキー + サーバー側セッション」と「JWT を localStorage に保存」の 2 流派があります。この本が前者を選ぶ理由:

- **httpOnly クッキーは JS から読めない** — XSS が起きてもトークン自体は盗まれない。localStorage の JWT は XSS 一発で盗まれる
- **サーバー側にセッションレコードがある** — 「ログアウトさせる」「全端末からログアウト」が DB の削除で確実にできる。JWT は発行後の無効化が難しい
- フロントとバックが同一オリジン(本番は 1 コンテナ、開発は Vite proxy)なので、クッキーの弱点であるクロスオリジン問題がそもそも発生しない

### CSRF について

API モードの Rails には CSRF トークン検証が入っていません。それでも今回の構成が守られているのは:

1. クッキーが `same_site: :lax` — 他サイトのフォームや fetch からの POST にはクッキーが載らない
2. `Content-Type: application/json` を要求 — 通常の HTML フォームからは送れない

業務で古いブラウザ対応や別ドメイン構成を扱う場合は CSRF トークンが再登場します。「SameSite が第一防衛線、CSRF トークンは第二防衛線」と覚えておいてください。

### 401 と 403 の使い分け

- **401 Unauthorized** … 「誰だか分からない」(未ログイン)。今回 concern が返すもの
- **403 Forbidden** … 「誰だかは分かるが、権限がない」(他人のデータへのアクセスなど)

第6章で「自分の結果しか操作できない」を作るときに 403 相当の考え方が出てきます。

## よくあるトラブル

| 症状 | 原因と対処 |
| --- | --- |
| `undefined method 'cookies'` | `ApplicationController` に `include ActionController::Cookies` を忘れている |
| すべての API が 401 になる | `allow_unauthenticated_access` の付け忘れ。ログイン系・公開系だけに付いているか確認 |
| curl で 2 回目以降も 401 | `-c` / `-b` の付け忘れ。クッキーは自動では送られない |
| `undefined method 'authenticate'` | bcrypt が入っていない。`docker compose run --rm api bundle install` 後、コンテナを再起動 |

## チェックリスト

- [ ] サインアップ → me → ログアウト → ログインの一連が curl で通る
- [ ] クッキーの 3 点セット(httponly / 署名付き / SameSite=Lax)の意味を説明できる
- [ ] パスワードが DB にどう保存されているか説明できる
- [ ] `allow_unauthenticated_access` の役割(デフォルト保護)を説明できる
- [ ] git commit した

```bash
git add .
git commit -m "第4章: クッキーセッション認証API"
```

▶ [第5章 Reactフロントエンドの土台](/chapters/05-react-frontend)
