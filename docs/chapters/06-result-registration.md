# 第6章 結果登録機能

## この章でやること

- 結果テーブル `results` を設計・作成する(スコアは **jsonb**)
- URL から診断タイプを判定する **サービスクラス** `DiagnosisUrlParser` を作る
- 結果の CRUD API を作る(自分の結果しか触れないようにする)
- React で登録フォームと一覧を作る

登録の流れはこうなります:

```
結果URLを貼る → API がURLからタイプを判定 → フォームに反映
→ スコア5指標をスライダーで入力 → 登録 → 一覧に表示
```

## 手を動かす

### Step 1: results テーブルを作る

```bash
docker compose run --rm api bin/rails generate model Result \
  user:references diagnosis_type:references \
  source_url:string scores:jsonb chart_type:string theme:string share_token:string
```

生成されたマイグレーションを編集します。

```ruby
class CreateResults < ActiveRecord::Migration[8.0]
  def change
    create_table :results do |t|
      t.references :user, null: false, foreign_key: true
      t.references :diagnosis_type, null: false, foreign_key: true
      t.string :source_url
      t.jsonb :scores, null: false, default: {}
      t.string :chart_type, null: false, default: "radar"
      t.string :theme, null: false, default: "light"
      t.string :share_token, null: false

      t.timestamps
    end
    add_index :results, :share_token, unique: true
  end
end
```

```bash
docker compose run --rm api bin/rails db:migrate
```

::: tip なぜ scores は jsonb?
スコアは「診断によって指標の数も名前も違う」データです。MBTI は 5 指標ですが、将来エニアグラムを足せば 9 指標になります。カラムに固定せず jsonb にしておくことで、**テーブル定義を変えずに診断を追加**できます。PostgreSQL の jsonb は中身に対するクエリやインデックスも張れる、実務でも多用される型です。

一方、全レコード共通で検索・集計したい値(user_id や chart_type)は普通のカラムにします。「構造が診断ごとに違うものだけ jsonb」が使い分けの基準です。
:::

### Step 2: モデルを書く

`api/app/models/result.rb`:

```ruby
class Result < ApplicationRecord
  SCORE_KEYS  = %w[mind energy nature tactics identity].freeze
  CHART_TYPES = %w[radar bar donut cards sliders].freeze
  THEMES      = %w[light dark pop minimal cyber].freeze

  belongs_to :user
  belongs_to :diagnosis_type

  has_secure_token :share_token

  validates :chart_type, inclusion: { in: CHART_TYPES }
  validates :theme, inclusion: { in: THEMES }
  validate :scores_must_be_valid

  private
    def scores_must_be_valid
      unless scores.is_a?(Hash) && scores.keys.sort == SCORE_KEYS.sort
        errors.add(:scores, "には5つの指標(#{SCORE_KEYS.join(', ')})が必要です")
        return
      end
      unless scores.values.all? { |v| v.is_a?(Integer) && v.between?(0, 100) }
        errors.add(:scores, "の値は0〜100の整数にしてください")
      end
    end
end
```

- `has_secure_token :share_token` … 保存時に推測不可能なランダムトークン(24文字)を自動生成します。第9章の共有 URL で使いますが、**列とトークンはこの時点で用意**しておきます
- `scores` の中身はモデルの標準バリデーションでは検証できないので、カスタムバリデーション(`validate` + private メソッド)を書いています

`api/app/models/user.rb` に関連を追加:

```ruby
  has_many :results, dependent: :destroy
```

スコアの意味(値は**左側の特性の割合%**):

| キー | 指標 | 左(100%側) | 右(0%側) |
| --- | --- | --- | --- |
| mind | 意識 | 外向型 (E) | 内向型 (I) |
| energy | エネルギー | 直観型 (N) | 現実型 (S) |
| nature | 気質 | 論理型 (T) | 道理型 (F) |
| tactics | 戦術 | 計画型 (J) | 探索型 (P) |
| identity | アイデンティティ | 自己主張型 (A) | 慎重型 (T) |

### Step 3: URL 判定サービスクラスを作る

「URL 文字列から診断タイプを割り出す」ロジックは、モデルでもコントローラでもない独立した処理です。こういうものは **サービスクラス**(`app/services/`)に切り出します。

`api/app/services/diagnosis_url_parser.rb`:

```ruby
# 診断結果のURLから DiagnosisType を推定する。
# 例:
#   https://www.16personalities.com/ja/intp型の性格  → INTP
#   https://www.16personalities.com/intp-personality → INTP
#   判定できないURL                                   → nil
class DiagnosisUrlParser
  MBTI_CODES = %w[
    INTJ INTP ENTJ ENTP INFJ INFP ENFJ ENFP
    ISTJ ISFJ ESTJ ESFJ ISTP ISFP ESTP ESFP
  ].freeze

  def self.detect(url)
    new(url).detect
  end

  def initialize(url)
    @url = url.to_s
  end

  def detect
    return nil unless http_url?

    code = MBTI_CODES.find { |c| decoded_url.match?(/\b#{c.downcase}\b/) }
    return nil unless code

    DiagnosisType.joins(:diagnosis).find_by(code: code, diagnoses: { slug: "mbti" })
  end

  private
    # 日本語URLは「%E5%9E%8B」のようにエンコードされているのでデコードして判定する
    def decoded_url
      @decoded_url ||= URI.decode_www_form_component(@url).downcase
    end

    def http_url?
      URI.parse(@url).is_a?(URI::HTTP)
    rescue URI::InvalidURIError
      false
    end
end
```

外部サイトへのアクセスは一切していないことに注目してください。**URL は文字列として解析するだけ**。表示に使う情報は第3章で入れたマスターデータから引きます(16Personalities の共有 URL `.../profiles/xxxx` のようにタイプ名を含まない URL は判定できないので、その場合はフロント側で手動選択にフォールバックします)。

rails console で動作を見ておきましょう:

```ruby
DiagnosisUrlParser.detect("https://www.16personalities.com/intp-personality")
# => #<DiagnosisType code: "INTP", ...>
DiagnosisUrlParser.detect("https://example.com/whatever")
# => nil
```

### Step 4: API を作る

`api/config/routes.rb` の `namespace :api` 内に追加:

```ruby
    resources :results
    get "detect_type", to: "detect_types#show"
```

`api/app/controllers/api/detect_types_controller.rb`:

```ruby
module Api
  class DetectTypesController < ApplicationController
    def show
      type = DiagnosisUrlParser.detect(params[:url])
      render json: { diagnosis_type: type&.as_json(only: [:id, :code, :name, :description]) }
    end
  end
end
```

`api/app/controllers/api/results_controller.rb`:

```ruby
module Api
  class ResultsController < ApplicationController
    def index
      results = current_user.results.includes(:diagnosis_type).order(created_at: :desc)
      render json: results.map { |r| result_json(r) }
    end

    def show
      render json: result_json(find_result)
    end

    def create
      result = current_user.results.new(result_params)
      if result.save
        render json: result_json(result), status: :created
      else
        render json: { errors: result.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      result = find_result
      if result.update(result_params)
        render json: result_json(result)
      else
        render json: { errors: result.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      find_result.destroy
      head :no_content
    end

    private
      def find_result
        current_user.results.find(params[:id])
      end

      def result_params
        params.require(:result).permit(
          :diagnosis_type_id, :source_url, :chart_type, :theme,
          scores: Result::SCORE_KEYS
        )
      end

      def result_json(result)
        result.as_json(
          only: [:id, :source_url, :scores, :chart_type, :theme, :share_token, :created_at],
          include: { diagnosis_type: { only: [:id, :code, :name, :description] } }
        )
      end
  end
end
```

**`current_user.results.find(...)` が肝です。** `Result.find(...)` と書くと他人の結果も取れてしまいますが、current_user からの関連で辿ることで「自分の結果以外は最初から存在しないのと同じ」になります(他人の id を指定しても RecordNotFound)。認可の最も基本的なパターンです。

RecordNotFound を 404 の JSON に変換する処理を `api/app/controllers/application_controller.rb` に足します:

```ruby
class ApplicationController < ActionController::API
  include ActionController::Cookies
  include Authentication

  rescue_from ActiveRecord::RecordNotFound do
    render json: { error: "見つかりません" }, status: :not_found
  end
end
```

### Step 5: フロントの型と定数を足す

`frontend/src/types.ts` に追記:

```ts
export type DiagnosisType = {
  id: number
  code: string
  name: string
  description: string
}

export type Scores = {
  mind: number
  energy: number
  nature: number
  tactics: number
  identity: number
}

export type ChartType = 'radar' | 'bar' | 'donut' | 'cards' | 'sliders'
export type Theme = 'light' | 'dark' | 'pop' | 'minimal' | 'cyber'

export type Result = {
  id: number
  source_url: string | null
  scores: Scores
  chart_type: ChartType
  theme: Theme
  share_token: string
  created_at: string
  diagnosis_type: DiagnosisType
}
```

`frontend/src/lib/axes.ts`(スコア 5 指標の表示定義):

```ts
import type { Scores } from '../types'

export type AxisDef = {
  key: keyof Scores
  label: string
  left: string  // 値が表す側(100%側)
  right: string
}

export const AXES: AxisDef[] = [
  { key: 'mind', label: '意識', left: '外向型 (E)', right: '内向型 (I)' },
  { key: 'energy', label: 'エネルギー', left: '直観型 (N)', right: '現実型 (S)' },
  { key: 'nature', label: '気質', left: '論理型 (T)', right: '道理型 (F)' },
  { key: 'tactics', label: '戦術', left: '計画型 (J)', right: '探索型 (P)' },
  { key: 'identity', label: 'アイデンティティ', left: '自己主張型 (A)', right: '慎重型 (T)' },
]
```

### Step 6: 登録フォームを作る

`frontend/src/pages/NewResult.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AXES } from '../lib/axes'
import type { DiagnosisType, Result, Scores } from '../types'

const DEFAULT_SCORES: Scores = { mind: 50, energy: 50, nature: 50, tactics: 50, identity: 50 }

export default function NewResult() {
  const navigate = useNavigate()
  const [types, setTypes] = useState<DiagnosisType[]>([])
  const [url, setUrl] = useState('')
  const [typeId, setTypeId] = useState<number | ''>('')
  const [scores, setScores] = useState<Scores>(DEFAULT_SCORES)
  const [detectMessage, setDetectMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<DiagnosisType[]>('/api/diagnosis_types').then(setTypes)
  }, [])

  // URL欄からフォーカスが外れたらタイプを自動判定する
  const detectType = async () => {
    if (!url) return
    const res = await api<{ diagnosis_type: DiagnosisType | null }>(
      `/api/detect_type?url=${encodeURIComponent(url)}`,
    )
    if (res.diagnosis_type) {
      setTypeId(res.diagnosis_type.id)
      setDetectMessage(`URLから「${res.diagnosis_type.code} ${res.diagnosis_type.name}」と判定しました`)
    } else {
      setDetectMessage('URLからタイプを判定できませんでした。下から選択してください')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (typeId === '') {
      setError('タイプを選択してください')
      return
    }
    try {
      const result = await api<Result>('/api/results', {
        method: 'POST',
        body: JSON.stringify({
          result: { diagnosis_type_id: typeId, source_url: url || null, scores },
        }),
      })
      navigate(`/results/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました')
    }
  }

  return (
    <main>
      <p><Link to="/">← 一覧に戻る</Link></p>
      <h1>結果を登録する</h1>
      <form onSubmit={handleSubmit} className="result-form">
        <label>
          診断結果のURL(任意)
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={detectType}
            placeholder="https://www.16personalities.com/..."
          />
        </label>
        {detectMessage && <p className="hint">{detectMessage}</p>}

        <label>
          タイプ
          <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            <option value="">選択してください</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} {t.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>スコア(結果ページの%を入力)</legend>
          {AXES.map((axis) => (
            <label key={axis.key} className="score-row">
              <span>
                {axis.label}: {axis.left} <strong>{scores[axis.key]}%</strong>(残り{100 - scores[axis.key]}%が{axis.right})
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={scores[axis.key]}
                onChange={(e) => setScores({ ...scores, [axis.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </fieldset>

        {error && <p className="error">{error}</p>}
        <button type="submit">登録する</button>
      </form>
    </main>
  )
}
```

### Step 7: ダッシュボードを一覧に差し替える

`frontend/src/pages/Dashboard.tsx` を置き換え:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import type { Result } from '../types'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [results, setResults] = useState<Result[]>([])

  useEffect(() => {
    api<Result[]>('/api/results').then(setResults)
  }, [])

  const remove = async (id: number) => {
    if (!confirm('この結果を削除しますか?')) return
    await api<void>(`/api/results/${id}`, { method: 'DELETE' })
    setResults(results.filter((r) => r.id !== id))
  }

  return (
    <main>
      <header className="app-header">
        <h1>MyAnalytics</h1>
        <div>
          <span>{user?.email_address}</span>
          <button onClick={logout}>ログアウト</button>
        </div>
      </header>

      <p>
        <Link to="/results/new" className="button-link">+ 結果を登録する</Link>
      </p>

      {results.length === 0 ? (
        <p>まだ結果がありません。診断結果のURLを登録してみましょう。</p>
      ) : (
        <ul className="result-list">
          {results.map((r) => (
            <li key={r.id}>
              <Link to={`/results/${r.id}`}>
                <strong>{r.diagnosis_type.code}</strong> {r.diagnosis_type.name}
              </Link>
              <span className="muted">{new Date(r.created_at).toLocaleDateString('ja-JP')}</span>
              <button onClick={() => remove(r.id)}>削除</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

ルートを `frontend/src/App.tsx` の `<Routes>` に追加します(結果詳細 `/results/:id` は第7章で作るので、ここでは登録ページだけ):

```tsx
          <Route
            path="/results/new"
            element={
              <RequireAuth>
                <NewResult />
              </RequireAuth>
            }
          />
```

(`import NewResult from './pages/NewResult'` も忘れずに)

`frontend/src/index.css` に追記:

```css
.result-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
}

.result-form fieldset {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.score-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.hint {
  color: #4f6ef7;
  font-size: 14px;
}

.muted {
  color: #6e7781;
  font-size: 13px;
}

.result-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 12px 16px;
}

.button-link {
  display: inline-block;
  background: #4f6ef7;
  color: #fff;
  padding: 8px 16px;
  border-radius: 6px;
  text-decoration: none;
}
```

## 動作確認

1. ログインして「+ 結果を登録する」へ
2. URL 欄に `https://www.16personalities.com/intp-personality` を貼ってフォーカスを外す → 「INTP 論理学者と判定しました」と出て、セレクトが INTP になる
3. スライダーを動かして登録 → まだ詳細ページがないので 404 になりますが、一覧(`/`)に戻ると登録されている(詳細ページは第7章で作ります)
4. 判定できない URL(例: `https://example.com/abc`)ではフォールバックのメッセージが出て手動選択できる
5. curl でも認可を確認しておきましょう:

```bash
# 別ユーザーを作って、他人の結果にアクセスしてみる
curl -i -c cookie2.txt -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"user": {"email_address": "other@example.com", "password": "password123", "password_confirmation": "password123"}}'

curl -i -b cookie2.txt http://localhost:3000/api/results/1
# → 404(他人の結果は「存在しない」扱い)
```

## 解説

### ロジックの置き場所: Fat Controller を避ける

URL 判定を `ResultsController` に直接書くこともできますが、そうしないのは:

- コントローラの仕事は「リクエストを受けて、適切な相手に振って、レスポンスを返す」ことだけにする(薄く保つ)
- 独立したクラスにすれば **単体でテストできる**(第10章で `DiagnosisUrlParser` を単体テストします)
- 「URL 判定を賢くしたい」ときに触るファイルが 1 つで済む

Rails では「モデルに置くほどでもない業務ロジックはサービスクラス(PORO = Plain Old Ruby Object)に」が定番の整理です。

### Strong Parameters

`params.require(:result).permit(...)` は「クライアントから受け取ってよいキーの許可リスト」です。これがないと、リクエストに `"user_id": 999` を紛れ込ませて他人の結果として登録する、といった **Mass Assignment 攻撃**が成立します。`scores: Result::SCORE_KEYS` のようにネストしたキーまで許可リスト化している点も見てください。

### 認可は「スコープで絞る」が基本形

`current_user.results.find(id)` のパターンをもう一度。認可チェックを `if result.user_id == current_user.id` のような後付けの条件分岐で書くと、**書き忘れた瞬間に穴**になります。関連からしか辿れないようにすれば、忘れようがありません。業務で Pundit などの認可 gem を使う場合も、根っこはこの考え方です。

## チェックリスト

- [ ] URL 自動判定 → 登録 → 一覧表示 → 削除が動く
- [ ] 判定できない URL で手動選択にフォールバックする
- [ ] 他人の結果に 404 が返ることを curl で確認した
- [ ] サービスクラスに切り出す理由を説明できる
- [ ] git commit した

```bash
git add .
git commit -m "第6章: 結果登録機能とURL判定"
```

▶ [第7章 グラフィカル表示① チャート](/chapters/07-charts)
