# 第3章 Rails APIの基礎

## この章でやること

- Rails のリクエスト処理の流れ(ルーティング → コントローラ → モデル → JSON)を一巡する
- 診断マスター(`diagnoses` / `diagnosis_types`)をマイグレーションで作る
- MBTI 16 タイプのデータを seed で投入する
- 最初の API `GET /api/diagnosis_types` を実装する

この章で「Rails の型」を体に入れます。以降の章はこの型の繰り返しです。

## 手を動かす

以降、コマンドはすべてリポジトリのルートで実行します。`docker compose up` でサーバーを起動したまま、**別ターミナル**で進めてください。

### Step 1: モデルとマイグレーションを生成する

診断マスターは 2 段構成にします。

- `diagnoses` … 診断の種類(まずは MBTI の 1 レコードだけ)
- `diagnosis_types` … 診断ごとの結果タイプ(MBTI なら 16 レコード)

```bash
docker compose run --rm api bin/rails generate model Diagnosis name:string slug:string:uniq
docker compose run --rm api bin/rails generate model DiagnosisType diagnosis:references code:string name:string description:text
```

ジェネレータは「モデルファイル」と「マイグレーションファイル」をペアで作ります。生成されたマイグレーションを少し編集して、NOT NULL 制約と複合ユニークインデックスを足します。

`api/db/migrate/xxxx_create_diagnoses.rb`:

```ruby
class CreateDiagnoses < ActiveRecord::Migration[8.0]
  def change
    create_table :diagnoses do |t|
      t.string :name, null: false
      t.string :slug, null: false

      t.timestamps
    end
    add_index :diagnoses, :slug, unique: true
  end
end
```

`api/db/migrate/xxxx_create_diagnosis_types.rb`:

```ruby
class CreateDiagnosisTypes < ActiveRecord::Migration[8.0]
  def change
    create_table :diagnosis_types do |t|
      t.references :diagnosis, null: false, foreign_key: true
      t.string :code, null: false        # 例: "INTP"
      t.string :name, null: false        # 例: "論理学者"
      t.text :description, null: false

      t.timestamps
    end
    add_index :diagnosis_types, [:diagnosis_id, :code], unique: true
  end
end
```

### Step 2: マイグレーションを実行する

```bash
docker compose run --rm api bin/rails db:migrate
```

実行すると `api/db/schema.rb` が更新されます。schema.rb は「マイグレーションを全部適用した結果のスナップショット」で、常に Git 管理します。

### Step 3: モデルに関連とバリデーションを書く

`api/app/models/diagnosis.rb`:

```ruby
class Diagnosis < ApplicationRecord
  has_many :diagnosis_types, dependent: :destroy

  validates :name, presence: true
  validates :slug, presence: true, uniqueness: true
end
```

`api/app/models/diagnosis_type.rb`:

```ruby
class DiagnosisType < ApplicationRecord
  belongs_to :diagnosis

  validates :code, presence: true, uniqueness: { scope: :diagnosis_id }
  validates :name, presence: true
  validates :description, presence: true
end
```

### Step 4: seed で MBTI 16 タイプを投入する

`api/db/seeds.rb` を次の内容にします(説明文はこの教材オリジナルの要約です)。

```ruby
mbti = Diagnosis.find_or_create_by!(slug: "mbti") do |d|
  d.name = "MBTI(16タイプ性格診断)"
end

MBTI_TYPES = {
  "INTJ" => ["建築家",   "戦略を立てて着実に実行する完璧主義の計画家。独立心が強く、長期的な視野で物事を組み立てる。"],
  "INTP" => ["論理学者", "知的好奇心のかたまり。仕組みや理論を突き詰めて考えることに喜びを感じる分析家。"],
  "ENTJ" => ["指揮官",   "目標達成のためにチームを率いる生まれつきのリーダー。決断が速く、効率を重んじる。"],
  "ENTP" => ["討論者",   "新しいアイデアと議論を愛する発明家タイプ。既存のやり方に挑戦することを恐れない。"],
  "INFJ" => ["提唱者",   "静かな理想主義者。人の気持ちを深く理解し、信念に基づいて行動する。"],
  "INFP" => ["仲介者",   "価値観と調和を大切にする夢想家。共感力が高く、自分の信じる善のために動く。"],
  "ENFJ" => ["主人公",   "人を励まし導くカリスマ。周囲の成長を自分の喜びとして感じられる世話役。"],
  "ENFP" => ["運動家",   "情熱と創造力にあふれた自由人。可能性を見つけるのが得意で、人との繋がりを楽しむ。"],
  "ISTJ" => ["管理者",   "責任感と実直さの人。事実に基づき、決めたことを最後までやり遂げる。"],
  "ISFJ" => ["擁護者",   "献身的な守り手。細やかな気配りで周囲を支え、伝統や約束を大切にする。"],
  "ESTJ" => ["幹部",     "秩序と実行の人。ルールと手順を整え、組織を確実に前へ進める管理者。"],
  "ESFJ" => ["領事",     "社交的な世話焼き。周囲との調和を重んじ、人の役に立つことに生きがいを感じる。"],
  "ISTP" => ["巨匠",     "手を動かして学ぶ実践家。道具や仕組みを操ることに長け、冷静に問題を解決する。"],
  "ISFP" => ["冒険家",   "感性豊かな芸術家肌。今この瞬間を大切にし、自分らしさを静かに表現する。"],
  "ESTP" => ["起業家",   "行動力のかたまり。リスクを恐れず飛び込み、その場の判断力で切り抜ける。"],
  "ESFP" => ["エンターテイナー", "場を明るくするムードメーカー。人生を楽しむ天才で、周囲も巻き込んで盛り上げる。"],
}.freeze

MBTI_TYPES.each do |code, (name, description)|
  type = mbti.diagnosis_types.find_or_initialize_by(code: code)
  type.update!(name: name, description: description)
end

puts "Seeded: #{Diagnosis.count} diagnoses, #{DiagnosisType.count} types"
```

投入します。

```bash
docker compose run --rm api bin/rails db:seed
```

::: tip find_or_create_by! / update! にしている理由
seed は「何度実行しても同じ状態になる」(冪等)ように書くのが定石です。`create!` だけで書くと 2 回目の実行で重複エラーになります。マスターデータの追加・修正を seed の再実行だけで反映できるようにしています。
:::

### Step 5: rails console で確認する

Rails 開発で最もよく使う道具、`rails console` を触ってみます。

```bash
docker compose run --rm api bin/rails console
```

```ruby
DiagnosisType.count
# => 16

DiagnosisType.find_by(code: "INTP")
# => #<DiagnosisType id: 2, code: "INTP", name: "論理学者", ...>

Diagnosis.find_by(slug: "mbti").diagnosis_types.pluck(:code)
# => ["INTJ", "INTP", "ENTJ", ...]

exit
```

モデルを書いた時点で、SQL を 1 行も書かずにこれだけの操作ができます。これが ActiveRecord(Rails の ORM)です。

### Step 6: ルーティングとコントローラを書く

`api/config/routes.rb`:

```ruby
Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    resources :diagnosis_types, only: [:index]
  end
end
```

`namespace :api` により、URL は `/api/diagnosis_types`、コントローラは `Api::DiagnosisTypesController`(ディレクトリは `app/controllers/api/`)になります。

`api/app/controllers/api/diagnosis_types_controller.rb`:

```ruby
module Api
  class DiagnosisTypesController < ApplicationController
    def index
      types = DiagnosisType.includes(:diagnosis).order(:id)
      render json: types.as_json(
        only: [:id, :code, :name, :description],
        include: { diagnosis: { only: [:id, :name, :slug] } }
      )
    end
  end
end
```

## 動作確認

```bash
curl -s http://localhost:3000/api/diagnosis_types | head -c 500
```

16 タイプの JSON が返れば成功です。整形して見たい場合は `| python3 -m json.tool` を後ろにつけてください。

ルーティングの一覧はいつでも確認できます。

```bash
docker compose run --rm api bin/rails routes -g api
```

## 解説

### リクエストの流れ

いま作ったものを流れで追うと:

```
GET /api/diagnosis_types
  → routes.rb          … URL と「コントローラ#アクション」の対応表
  → Api::DiagnosisTypesController#index
  → DiagnosisType.includes(...).order(...)   … モデル経由で SQL 発行
  → render json:       … JSON にして返す
```

他のフレームワーク経験があれば「ルーター → ハンドラ → ORM → シリアライズ」と同じ構造だと分かるはずです。Rails が特徴的なのは、**この対応がすべて命名規約で結ばれている**ことです。

### 設定より規約(Convention over Configuration)

| 規約 | 例 |
| --- | --- |
| テーブル名はモデル名の複数形スネークケース | `DiagnosisType` ↔ `diagnosis_types` |
| 外部キーは `参照先単数形_id` | `diagnosis_id` |
| コントローラは `複数形Controller` | `resources :diagnosis_types` → `DiagnosisTypesController` |
| ファイルパスはクラス名に対応 | `Api::...Controller` → `app/controllers/api/...` |

設定ファイルでこれらを紐づける必要はありません。**名前を規約通りにつければ、繋がりは Rails が推測する**。逆に言うと、規約から外れた名前をつけると急に苦しくなります。迷ったら規約に乗るのが Rails 流です。

### マイグレーションという考え方

DB スキーマの変更をすべて「マイグレーションファイル=変更履歴」としてコードで残します。

- チーム全員が `bin/rails db:migrate` するだけで同じスキーマになる
- 本番への適用も同じコマンド(第11章でデプロイ時に自動実行させます)
- `schema.rb` が「現在の完成形」、マイグレーションが「そこに至る履歴」

一度 commit したマイグレーションは書き換えず、直したいときは**新しいマイグレーションを足す**のが原則です(ローカルで実験中のものは `db:rollback` して書き直して OK)。

### N+1 と includes

コントローラで `DiagnosisType.includes(:diagnosis)` としました。`includes` なしで各タイプの `diagnosis` に触ると、タイプごとに 1 回ずつ SQL が飛ぶ「N+1 問題」が起きます。`includes` は関連をまとめて先読みします。ログ(`docker compose logs api`)で発行された SQL を見比べてみてください。

## よくあるトラブル

| 症状 | 原因と対処 |
| --- | --- |
| `PendingMigrationError` | マイグレーション未適用。`docker compose run --rm api bin/rails db:migrate` |
| `uninitialized constant Api` | コントローラのディレクトリが `app/controllers/api/` になっていない、または `module Api` の書き忘れ |
| seed が重複エラー | `create!` を使っていないか確認。本文の通り find_or_create 系に |
| ルーティングエラー | `bin/rails routes -g api` で実際の URL を確認 |

## チェックリスト

- [ ] `curl http://localhost:3000/api/diagnosis_types` で 16 タイプの JSON が返る
- [ ] モデル名とテーブル名の命名規約を説明できる
- [ ] マイグレーションと schema.rb の関係を説明できる
- [ ] rails console でモデルを触れる
- [ ] git commit した

```bash
git add .
git commit -m "第3章: 診断マスターとMBTIタイプAPI"
```

▶ [第4章 認証機能](/chapters/04-authentication)
