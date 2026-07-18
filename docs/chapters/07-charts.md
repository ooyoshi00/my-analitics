# 第7章 グラフィカル表示① チャート

## この章でやること

- 結果詳細ページ `/results/:id` を作る
- **Recharts** で同じスコアデータを 5 種類の見せ方で描画する
  - レーダーチャート / 棒グラフ / ドーナツ / カードグリッド / スライダー
- チャート切り替え UI を作り、選択を `results.chart_type` に保存する

「同じデータ・同じ props を受け取り、見せ方だけが違うコンポーネントを差し替える」という、React らしい設計を練習する章です。

## 手を動かす

### Step 1: Recharts を入れる

```bash
cd frontend && npm install recharts && cd ..
```

(frontend をコンテナで動かしている場合は `docker compose restart frontend` で node_modules ボリュームに反映されます)

### Step 2: スコアをチャート用データに変換する

5 つのチャートすべてが使う共通の変換関数を作ります。

`frontend/src/lib/chartData.ts`:

```ts
import { AXES } from './axes'
import type { Scores } from '../types'

export type AxisDatum = {
  key: string
  label: string   // 指標名(例: 意識)
  left: string    // 100%側の特性(例: 外向型 (E))
  right: string   // 0%側の特性(例: 内向型 (I))
  value: number   // 左側の割合 0-100
}

export function toAxisData(scores: Scores): AxisDatum[] {
  return AXES.map((axis) => ({
    key: axis.key,
    label: axis.label,
    left: axis.left,
    right: axis.right,
    value: scores[axis.key],
  }))
}

// その指標で「優勢な側」の名前と割合(カード表示などで使う)
export function dominant(d: AxisDatum): { name: string; percent: number } {
  return d.value >= 50
    ? { name: d.left, percent: d.value }
    : { name: d.right, percent: 100 - d.value }
}
```

### Step 3: 5 つのチャートコンポーネントを作る

すべて**同じ props**(`data` と色)を受け取ります。`frontend/src/charts/` ディレクトリを作って 5 ファイル置きます。

色はいったん定数にします(第8章でテーマ連動に差し替えます)。`frontend/src/charts/palette.ts`:

```ts
// 第8章でテーマごとの配色に差し替える
export const PALETTE = {
  primary: '#4f6ef7',
  series: ['#4f6ef7', '#f76f8e', '#37b26c', '#f5a623', '#8e6ff7'],
  grid: '#d0d7de',
}
```

`frontend/src/charts/RadarView.tsx`:

```tsx
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts'
import type { AxisDatum } from '../lib/chartData'
import { PALETTE } from './palette'

export default function RadarView({ data }: { data: AxisDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={data}>
        <PolarGrid stroke={PALETTE.grid} />
        <PolarAngleAxis dataKey="left" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={PALETTE.primary} fill={PALETTE.primary} fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
```

`frontend/src/charts/BarView.tsx`:

```tsx
import {
  Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LabelList,
} from 'recharts'
import type { AxisDatum } from '../lib/chartData'
import { PALETTE } from './palette'

export default function BarView({ data }: { data: AxisDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} layout="vertical" margin={{ left: 40, right: 32 }}>
        <CartesianGrid stroke={PALETTE.grid} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" />
        <YAxis type="category" dataKey="left" width={110} tick={{ fontSize: 12 }} />
        <Bar dataKey="value" fill={PALETTE.primary} radius={[0, 6, 6, 0]}>
          <LabelList dataKey="value" position="right" formatter={(v: number) => `${v}%`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

`frontend/src/charts/DonutView.tsx`(指標ごとに小さなドーナツを 5 つ並べます):

```tsx
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { AxisDatum } from '../lib/chartData'
import { dominant } from '../lib/chartData'
import { PALETTE } from './palette'

function Donut({ datum, color }: { datum: AxisDatum; color: string }) {
  const d = dominant(datum)
  const pieData = [
    { name: d.name, value: d.percent },
    { name: 'rest', value: 100 - d.percent },
  ]
  return (
    <figure className="donut-item">
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            innerRadius={38}
            outerRadius={54}
            startAngle={90}
            endAngle={-270}
          >
            <Cell fill={color} />
            <Cell fill={PALETTE.grid} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <figcaption>
        <strong>{d.percent}%</strong>
        <span>{d.name}</span>
      </figcaption>
    </figure>
  )
}

export default function DonutView({ data }: { data: AxisDatum[] }) {
  return (
    <div className="donut-grid">
      {data.map((datum, i) => (
        <Donut key={datum.key} datum={datum} color={PALETTE.series[i % PALETTE.series.length]} />
      ))}
    </div>
  )
}
```

`frontend/src/charts/CardsView.tsx`(ライブラリを使わない例。数字を大きく見せたいときはこれで十分):

```tsx
import type { AxisDatum } from '../lib/chartData'
import { dominant } from '../lib/chartData'
import { PALETTE } from './palette'

export default function CardsView({ data }: { data: AxisDatum[] }) {
  return (
    <div className="cards-grid">
      {data.map((datum, i) => {
        const d = dominant(datum)
        return (
          <div
            key={datum.key}
            className="score-card"
            style={{ borderTopColor: PALETTE.series[i % PALETTE.series.length] }}
          >
            <span className="score-card-label">{datum.label}</span>
            <span className="score-card-value">{d.percent}%</span>
            <span className="score-card-name">{d.name}</span>
          </div>
        )
      })}
    </div>
  )
}
```

`frontend/src/charts/SlidersView.tsx`(両端に特性名を置き、位置で示す 16Personalities 風の表現):

```tsx
import type { AxisDatum } from '../lib/chartData'
import { PALETTE } from './palette'

export default function SlidersView({ data }: { data: AxisDatum[] }) {
  return (
    <div className="sliders-view">
      {data.map((datum, i) => (
        <div key={datum.key} className="slider-row">
          <div className="slider-labels">
            <span className={datum.value >= 50 ? 'active' : ''}>{datum.left}</span>
            <span className={datum.value < 50 ? 'active' : ''}>{datum.right}</span>
          </div>
          <div className="slider-track">
            <div
              className="slider-thumb"
              style={{
                left: `${100 - datum.value}%`,
                background: PALETTE.series[i % PALETTE.series.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Step 4: 結果詳細ページとチャート切り替え

`frontend/src/pages/ResultDetail.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { toAxisData } from '../lib/chartData'
import type { ChartType, Result } from '../types'
import RadarView from '../charts/RadarView'
import BarView from '../charts/BarView'
import DonutView from '../charts/DonutView'
import CardsView from '../charts/CardsView'
import SlidersView from '../charts/SlidersView'

export const CHARTS: { type: ChartType; label: string }[] = [
  { type: 'radar', label: 'レーダー' },
  { type: 'bar', label: '棒グラフ' },
  { type: 'donut', label: 'ドーナツ' },
  { type: 'cards', label: 'カード' },
  { type: 'sliders', label: 'スライダー' },
]

export const CHART_COMPONENTS = {
  radar: RadarView,
  bar: BarView,
  donut: DonutView,
  cards: CardsView,
  sliders: SlidersView,
} as const

export default function ResultDetail() {
  const { id } = useParams()
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    api<Result>(`/api/results/${id}`).then(setResult)
  }, [id])

  if (!result) return <main><p>読み込み中...</p></main>

  const changeChart = async (chartType: ChartType) => {
    setResult({ ...result, chart_type: chartType }) // 先に画面へ反映(楽観的更新)
    await api<Result>(`/api/results/${result.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ result: { chart_type: chartType } }),
    })
  }

  const Chart = CHART_COMPONENTS[result.chart_type]

  return (
    <main>
      <p><Link to="/">← 一覧に戻る</Link></p>

      <section className="result-hero">
        <h1>
          {result.diagnosis_type.code}
          <small> {result.diagnosis_type.name}</small>
        </h1>
        <p>{result.diagnosis_type.description}</p>
        {result.source_url && (
          <p>
            <a href={result.source_url} target="_blank" rel="noreferrer">元の診断結果を見る ↗</a>
          </p>
        )}
      </section>

      <nav className="chart-tabs">
        {CHARTS.map((c) => (
          <button
            key={c.type}
            className={c.type === result.chart_type ? 'active' : ''}
            onClick={() => changeChart(c.type)}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <section className="chart-area">
        <Chart data={toAxisData(result.scores)} />
      </section>
    </main>
  )
}
```

ルートを `App.tsx` に追加:

```tsx
          <Route
            path="/results/:id"
            element={
              <RequireAuth>
                <ResultDetail />
              </RequireAuth>
            }
          />
```

### Step 5: スタイルを足す

`frontend/src/index.css` に追記:

```css
.result-hero h1 {
  margin-bottom: 4px;
}

.result-hero small {
  font-size: 0.6em;
  color: #6e7781;
}

.chart-tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0;
  flex-wrap: wrap;
}

.chart-tabs button {
  background: #fff;
  color: #1f2328;
  border: 1px solid #d0d7de;
}

.chart-tabs button.active {
  background: #4f6ef7;
  color: #fff;
  border-color: #4f6ef7;
}

.chart-area {
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  padding: 16px;
}

.donut-grid,
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.donut-item {
  margin: 0;
  text-align: center;
}

.donut-item figcaption {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.score-card {
  border: 1px solid #d0d7de;
  border-top: 4px solid;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-card-label {
  font-size: 12px;
  color: #6e7781;
}

.score-card-value {
  font-size: 32px;
  font-weight: 700;
}

.score-card-name {
  font-size: 14px;
}

.sliders-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #6e7781;
  margin-bottom: 6px;
}

.slider-labels .active {
  color: #1f2328;
  font-weight: 700;
}

.slider-track {
  position: relative;
  height: 8px;
  border-radius: 4px;
  background: #e8ebef;
}

.slider-thumb {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
```

## 動作確認

1. 一覧から結果をクリック(または登録直後の遷移)で詳細ページが開く
2. タブで 5 種類のチャートが切り替わる
3. 切り替えたあと**リロードしても同じチャートが表示される**(chart_type がサーバーに保存されている)
4. Network タブで PATCH リクエストが飛んでいることを確認

## 解説

### 「同じ props、違う見た目」パターン

5 つのチャートはすべて `{ data: AxisDatum[] }` という同じ props を受け取ります。おかげで切り替えは:

```tsx
const Chart = CHART_COMPONENTS[result.chart_type]
return <Chart data={toAxisData(result.scores)} />
```

の 2 行で済みます。`if/switch` の分岐を並べる代わりに**オブジェクトのルックアップでコンポーネントを選ぶ**のは React の定番イディオムです。第8章でテーマを追加するときも、この構造のおかげでチャート側の変更が最小になります。

### データ変換をコンポーネントの外に出す

`scores`(APIの形)→ `AxisDatum[]`(チャートの形)の変換を `chartData.ts` に分離しました。チャートコンポーネントは「表示に都合のいい形のデータが来る」前提で書けるので、それぞれが短く保てます。**「取得の形」と「表示の形」を分けて、間に変換層を置く**のはフロントエンド設計の基本です。

### 楽観的更新(Optimistic Update)

`changeChart` では、API の応答を待たずに先に画面を更新しています。チャート切り替えのような「まず失敗しない・失敗しても致命的でない」操作は、体感速度を優先して先に反映するのが定石です。逆に決済のような操作では応答を待って確定させます。

## よくあるトラブル

| 症状 | 原因と対処 |
| --- | --- |
| チャートが表示されない(高さ 0) | `ResponsiveContainer` は親の高さが必要。`height={340}` の指定があるか確認 |
| `recharts` が見つからない | frontend コンテナ再起動(`docker compose restart frontend`)で node_modules ボリュームに反映 |
| リロードでチャート選択が戻る | PATCH が失敗している。Network タブと Rails ログを確認 |

## チェックリスト

- [ ] 5 種類のチャートが切り替わり、リロード後も保持される
- [ ] コンポーネントをオブジェクトで選ぶパターンを説明できる
- [ ] 楽観的更新がどこで行われているか指させる
- [ ] git commit した

```bash
git add .
git commit -m "第7章: 5種類のチャート表示"
```

▶ [第8章 グラフィカル表示② テーマ](/chapters/08-themes)
