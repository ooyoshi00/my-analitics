# 付録B 詰まったときのデバッグ集

「動かない」ときにどこから見るか。この教材の構成(docker compose + Rails + React)に即した調査手順集です。上から順に絞り込むのが基本です。

## 手順0: どの層で壊れているかを切り分ける

```
ブラウザ → Vite (5173) → Rails (3000) → PostgreSQL (5432)
```

- 画面が真っ白 / JS エラー → **ブラウザの開発者ツール Console**
- 通信が失敗している → **開発者ツール Network** でステータスコードを見る
  - 401 → 認証(第4章)。クッキーが送られているか Request Headers を確認
  - 404 → ルーティング or 認可(他人のリソース)
  - 422 → バリデーション。レスポンス body にエラー内容が入っている
  - 500 → Rails のログを見る(下記)
  - `ECONNREFUSED` / 502 → Rails が起動していない
- API まで届いていない → Vite proxy 設定(第5章)

## docker compose の基本 3 コマンド

```bash
# 各サービスの状態(起動している?再起動ループしていない?)
docker compose ps

# ログを見る(-f で流し続ける。サービス名を付けるとそれだけ)
docker compose logs -f api

# コンテナの中に入る(起動中のコンテナに対して)
docker compose exec api bash
```

`docker compose ps` で `Restarting` を繰り返しているサービスがあれば、そのログの**最初のエラー**(だいたい一番上)を読みます。

## Rails のログの読み方

`docker compose logs -f api` で流れるログの 1 リクエスト分:

```
Started POST "/api/results" for 192.168.65.1 at 2026-07-18 12:34:56
Processing by Api::ResultsController#create as JSON
  Parameters: {"result"=>{"diagnosis_type_id"=>2, ...}}
  Result Create (2.1ms)  INSERT INTO "results" ...
Completed 201 Created in 15ms
```

見るポイント:

- **どのコントローラ#アクションに届いたか**(届いていなければルーティングの問題)
- **Parameters** に期待した値が来ているか(来ていなければフロント側の問題)
- **発行された SQL**(意図しない大量の SELECT が並んでいたら N+1)
- 例外が出ていればスタックトレースの**一番上の自分のコード**の行

## rails console で調査する

```bash
docker compose run --rm api bin/rails console
```

```ruby
# データが本当に入っているか
Result.count
Result.last

# バリデーションエラーを手元で再現する
r = Result.new(scores: { "mind" => 50 })
r.valid?        # => false
r.errors.full_messages  # => エラーメッセージの配列

# サービスクラスを単体で動かす
DiagnosisUrlParser.detect("https://...")

# 発行される SQL を確認する
User.first.results.to_sql
```

「アプリを経由せずに部品を直接動かす」のが console の使い方です。API 経由で 500 が出るとき、console で同じ操作をすると素の例外が見られて一気に近づけます。

::: tip 破壊的な操作は sandbox で
`bin/rails console --sandbox` で起動すると、終了時にすべての変更がロールバックされます。本番データを調査するときの必須オプションです。
:::

## デバッガ(breakpoint)を使う

Rails 8 には `debug` gem が入っています。止めたい場所に 1 行:

```ruby
def create
  binding.break   # ← ここで実行が止まる
  result = current_user.results.new(result_params)
  ...
```

ただし `docker compose up` のログ画面では対話できないので、止めたいときは:

```bash
docker compose stop api
docker compose run --rm --service-ports api bin/rails server -b 0.0.0.0
```

とフォアグラウンドで起動し、そのターミナルでデバッガを操作します(`next` で 1 行進む、`continue` で再開、変数名を打てば中身が見える)。

## よくあるエラー逆引き

### Rails 側

| エラー | 原因 | 対処 |
| --- | --- | --- |
| `ActiveRecord::PendingMigrationError` | マイグレーション未適用 | `docker compose run --rm api bin/rails db:migrate` |
| `PG::ConnectionBad: could not translate host name "db"` | compose 外で起動している / db サービスが落ちている | `docker compose ps` で db を確認 |
| `PG::UndefinedTable` | migrate 忘れ、または test DB だけ古い | `db:migrate` 後、テストなら自動で追従。ダメなら `RAILS_ENV=test bin/rails db:prepare` |
| `uninitialized constant Xxx` | ファイル名とクラス名の規約不一致 | `diagnosis_url_parser.rb` ↔ `DiagnosisUrlParser` のように対応しているか |
| `ActionController::ParameterMissing` | `params.require(:result)` に対し `result` キーなしで送信 | フロントの body の形を Network タブで確認 |
| `ActiveRecord::RecordNotFound` | id 違い、または**認可スコープ**(current_user.results)の外 | 仕様通りのことも多い。誰のデータか確認 |
| `A server is already running` | server.pid の残骸 | 第2章の compose.yml の `rm -f tmp/pids/server.pid` を確認 |

### フロント側

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `/api/...` のレスポンスが HTML | proxy を通らず Vite が index.html を返している | vite.config.ts の proxy 設定、パスが `/api` で始まっているか |
| fetch が CORS エラー | `http://localhost:3000/...` と絶対 URL で書いている | 相対パス `/api/...` に直す |
| ログインしたのに 401 | クッキーが保存されていない | Network タブで Set-Cookie の有無 → なければ Rails 側、あれば送信側を確認 |
| 画面が更新されない | state 更新漏れ(配列の破壊的変更など) | React DevTools で state を確認。`setXxx` に**新しい**配列/オブジェクトを渡しているか |
| `npm run build` だけ失敗 | 型エラー(dev は型チェックが緩い) | エラーメッセージのファイルと行を順に潰す |

## 本番(Render)での調査

- **Logs タブ** … `docker compose logs` に相当。デプロイ失敗時はまずビルドログ、起動失敗時は Deploy ログの末尾
- **Events タブ** … デプロイ・再起動・ヘルスチェック失敗の履歴
- 500 の詳細ログが出ない場合、Rails の本番ログレベルを確認(`config.log_level`)。なお本番で `config.consider_all_requests_local = true` にしてエラー詳細を画面に出すのは**厳禁**です(内部情報が漏れます)

## それでも分からないとき

1. **エラーメッセージの 1 行目を素直に読む**(意外と答えが書いてある)
2. 最後に動いていた状態から**何を変えたか**を git diff で見る
3. 変更を半分ずつ戻して二分探索する
4. 最小の再現(console で 1 行)を作る — 作れた時点でだいたい原因が見えています

---

これで教材は全部です。ここまで完走したなら、業務のコードベースを読む準備は十分できています。おつかれさまでした!

▶ [トップに戻る](/)
