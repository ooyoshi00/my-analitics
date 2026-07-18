# 第9章 共有機能

## この章でやること

- 共有トークンによる**認証不要の公開 API** を作る
- 公開ページ `/share/:token` を作る(登録者が選んだチャート・テーマで表示)
- 共有 URL のコピー UI を作る
- (コラム)OGP と SPA の限界について知る

第6章で `results.share_token` は既に用意してあります(`has_secure_token` が保存時に自動生成)。この章はそれを「使う」章です。

## 手を動かす

### Step 1: JSON 化ロジックをモデルに寄せる(リファクタリング)

共有 API でも結果の JSON が必要になり、`ResultsController` の `result_json` と同じものを 2 か所に書くことになります。重複する前にモデルへ移動します。

`api/app/models/result.rb` に追加:

```ruby
  # API レスポンス用の共通 JSON 表現
  def as_api_json
    as_json(
      only: [:id, :source_url, :scores, :chart_type, :theme, :share_token, :created_at],
      include: { diagnosis_type: { only: [:id, :code, :name, :description] } }
    )
  end
```

`api/app/controllers/api/results_controller.rb` の private にある `result_json(result)` を削除し、呼び出し箇所をすべて `result.as_api_json` に置き換えます(5 か所)。

::: tip 重複が「2 つ目」で手を打つ
1 か所目で抽象化するのは早すぎ(将来を当てにいく設計になりがち)、3 か所目まで放置すると直し漏れが出ます。「2 つ目が現れた時点で共通化」は経験則としてよく機能します。
:::

### Step 2: 共有 API を作る

`api/config/routes.rb` の `namespace :api` 内に追加:

```ruby
    get "shared/:token", to: "shared_results#show", as: :shared_result
```

`api/app/controllers/api/shared_results_controller.rb`:

```ruby
module Api
  class SharedResultsController < ApplicationController
    allow_unauthenticated_access

    def show
      result = Result.includes(:diagnosis_type).find_by!(share_token: params[:token])
      render json: result.as_api_json
    end
  end
end
```

- `allow_unauthenticated_access` — ログインしていない人が見るページなので認証を外す
- `find_by!`(`!` 付き)— 見つからなければ `RecordNotFound` を投げ、第6章で仕込んだ `rescue_from` が 404 JSON にしてくれる
- ここでは `current_user.results` では**なく** `Result` から検索している点に注目。「トークンを知っていること」自体が閲覧権限だからです

### Step 3: 公開ページを作る

チャートコンポーネントの対応表を共有ページでも使うので、置き場所を `charts/` に昇格させます。

`frontend/src/charts/index.ts`(新規):

```ts
import RadarView from './RadarView'
import BarView from './BarView'
import DonutView from './DonutView'
import CardsView from './CardsView'
import SlidersView from './SlidersView'

export const CHART_COMPONENTS = {
  radar: RadarView,
  bar: BarView,
  donut: DonutView,
  cards: CardsView,
  sliders: SlidersView,
} as const
```

`frontend/src/pages/ResultDetail.tsx` からは `CHART_COMPONENTS` の定義(と 5 つのチャートの import)を削除し、代わりに:

```tsx
import { CHART_COMPONENTS } from '../charts'
```

そして公開ページ本体。`frontend/src/pages/SharePage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { toAxisData } from '../lib/chartData'
import { ThemedArea } from '../theme/ThemeContext'
import { CHART_COMPONENTS } from '../charts'
import type { Result } from '../types'

export default function SharePage() {
  const { token } = useParams()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Result>(`/api/shared/${token}`)
      .then(setResult)
      .catch(() => setError('この共有URLは無効です'))
  }, [token])

  if (error) return <main><p className="error">{error}</p></main>
  if (!result) return <main><p>読み込み中...</p></main>

  const Chart = CHART_COMPONENTS[result.chart_type]

  return (
    <main>
      <ThemedArea theme={result.theme}>
        <section className="result-hero">
          <h1>
            {result.diagnosis_type.code}
            <small> {result.diagnosis_type.name}</small>
          </h1>
          <p>{result.diagnosis_type.description}</p>
        </section>

        <section className="chart-area">
          <Chart data={toAxisData(result.scores)} />
        </section>

        <footer className="share-footer">
          <p>
            この結果は <Link to="/">MyAnalytics</Link> で作成されました
          </p>
        </footer>
      </ThemedArea>
    </main>
  )
}
```

ルートを `App.tsx` に追加します。**`RequireAuth` で包まない**のがポイントです:

```tsx
          <Route path="/share/:token" element={<SharePage />} />
```

### Step 4: 共有 URL のコピー UI

`frontend/src/pages/ResultDetail.tsx` に追加します。コンポーネント内に state と関数:

```tsx
  const [copied, setCopied] = useState(false)

  const copyShareUrl = async () => {
    const url = `${location.origin}/share/${result.share_token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
```

JSX(`</ThemedArea>` の直前あたり):

```tsx
        <section className="share-box">
          <button onClick={copyShareUrl}>
            {copied ? '✓ コピーしました' : '共有URLをコピー'}
          </button>
          <span className="muted">
            このURLを知っている人は誰でも(ログインなしで)この結果を見られます
          </span>
        </section>
```

CSS を追記:

```css
.share-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.share-footer {
  margin-top: 16px;
  font-size: 13px;
  text-align: center;
}
```

## 動作確認

1. 結果詳細ページで「共有URLをコピー」を押す
2. **シークレットウィンドウ**(ログインしていない状態)で貼り付けて開く
3. 登録者が選んだチャートとテーマで結果が表示される
4. トークンを 1 文字変えた URL では「この共有URLは無効です」になる
5. curl でも:

```bash
curl -i http://localhost:3000/api/shared/正しいトークン   # → 200
curl -i http://localhost:3000/api/shared/xxxxx           # → 404
```

## 解説

### Capability URL という考え方

この共有方式は「**URL を知っていること = 閲覧権限**」という設計で、Capability URL と呼ばれます。Google ドキュメントの「リンクを知っている全員が閲覧可」と同じ仕組みです。

成立条件は**トークンが推測不可能であること**です。`has_secure_token` は 24 文字の Base58(≒ 140bit 超のエントロピー)を生成するので、総当たりは現実的に不可能です。逆にやってはいけないのは、連番 id(`/share/1`)や短いハッシュを使うことです。

::: info 発展: 共有の取り消し
`has_secure_token` は `result.regenerate_share_token` というメソッドも生やしてくれます。これを呼ぶ API を足せば「共有 URL を無効にして新しい URL にする」機能が作れます。余力があれば挑戦してみてください。
:::

### 404 を返す(403 ではなく)

無効なトークンに 404 を返しています。403 を返すと「そのトークンの結果は存在するが権限がない」という情報が漏れるためです。**存在自体を隠したいリソースには 404** が定石です(GitHub のプライベートリポジトリも同様に 404 を返します)。

### コラム: OGP と SPA の限界

共有 URL を SNS に貼ったときにカード(タイトル・画像)を出すには、HTML の `<head>` に OGP メタタグが必要です。ところがいまの構成では、どの URL でも**同じ index.html**(Vite が生成したもの)が返るため、結果ごとのメタタグを出せません。SNS のクローラーの多くは JS を実行しないからです。

実務での解決策は:

1. サーバーサイドレンダリング(Next.js など)に乗る
2. 共有ページだけサーバー(Rails)が OGP 入り HTML を組み立てて返す
3. OGP 画像生成サービスや事前レンダリングを挟む

この教材ではスコープ外としますが、「**SPA はクローラーに中身を見せられない**」という限界は、技術選定の判断材料として覚えておく価値があります。

## チェックリスト

- [ ] シークレットウィンドウで共有 URL が見られる
- [ ] 無効なトークンで 404 / エラーメッセージが出る
- [ ] Capability URL の成立条件を説明できる
- [ ] git commit した

```bash
git add .
git commit -m "第9章: 共有URL機能"
```

▶ [第10章 テスト](/chapters/10-testing)
