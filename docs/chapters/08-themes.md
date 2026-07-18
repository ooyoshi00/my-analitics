# 第8章 グラフィカル表示② テーマ

## この章でやること

- **CSS Variables(カスタムプロパティ)** でテーマを設計する
- 5 種類のテーマ(ライト / ダーク / ポップ / ミニマル / サイバー)を実装する
- チャートの配色もテーマに追従させる
- テーマ選択を `results.theme` に保存する

第7章の「チャート形式」と合わせて、5 × 5 = 25 通りの見せ方が選べるようになります。

## 手を動かす

### Step 1: テーマの設計方針

テーマ切り替えは次の 2 層で実現します。

| 対象 | 仕組み |
| --- | --- |
| ページの色(背景・文字・枠線) | CSS Variables。`data-theme` 属性で変数の値だけ差し替える |
| チャートの色(Recharts に渡す色) | TS のテーマ別パレット定義。Context で配る |

CSS だけで完結できれば理想ですが、Recharts は色を **props で受け取る**ため、TS 側にも色定義が必要になります。「同じテーマ名をキーに、CSS と TS の 2 か所で色を定義する」構造です。

### Step 2: チャート用パレットをテーマ別にする

`frontend/src/charts/palette.ts` を丸ごと置き換えます。

```ts
import type { Theme } from '../types'

export type Palette = {
  primary: string
  series: string[]
  grid: string
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
    primary: '#4f6ef7',
    series: ['#4f6ef7', '#f76f8e', '#37b26c', '#f5a623', '#8e6ff7'],
    grid: '#d0d7de',
  },
  dark: {
    primary: '#7c93ff',
    series: ['#7c93ff', '#ff8fa8', '#5fd39a', '#ffc65c', '#b39bff'],
    grid: '#2c3650',
  },
  pop: {
    primary: '#ff5d8f',
    series: ['#ff5d8f', '#ffb703', '#06d6a0', '#4cc9f0', '#9b5de5'],
    grid: '#ffd9e5',
  },
  minimal: {
    primary: '#111111',
    series: ['#111111', '#555555', '#888888', '#aaaaaa', '#cccccc'],
    grid: '#e5e5e5',
  },
  cyber: {
    primary: '#00e5ff',
    series: ['#00e5ff', '#ff2ea6', '#a6ff00', '#ffe600', '#7d5fff'],
    grid: '#12304a',
  },
}
```

### Step 3: ThemeContext を作る

「いまのテーマ」を配る Context と、テーマ適用エリアを作るコンポーネントです。

`frontend/src/theme/ThemeContext.tsx`:

```tsx
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { PALETTES } from '../charts/palette'
import type { Theme } from '../types'

const ThemeContext = createContext<Theme>('light')

// このコンポーネントで囲んだ範囲にテーマが適用される
export function ThemedArea({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <ThemeContext.Provider value={theme}>
      <div className="themed" data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

// チャートコンポーネントが現在のテーマの配色を取るためのフック
export function usePalette() {
  return PALETTES[useContext(ThemeContext)]
}
```

### Step 4: チャートをテーマ対応にする

各チャートの色の取得元を「固定の `PALETTE`」から「Context 経由の `usePalette()`」に替えます。RadarView の変更後の全文:

`frontend/src/charts/RadarView.tsx`:

```tsx
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts'
import type { AxisDatum } from '../lib/chartData'
import { usePalette } from '../theme/ThemeContext'

export default function RadarView({ data }: { data: AxisDatum[] }) {
  const palette = usePalette()
  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={data}>
        <PolarGrid stroke={palette.grid} />
        <PolarAngleAxis dataKey="left" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={palette.primary} fill={palette.primary} fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
```

残りの 4 ファイル(BarView / DonutView / CardsView / SlidersView)も同じ機械的な置き換えです:

1. `import { PALETTE } from './palette'` → `import { usePalette } from '../theme/ThemeContext'`
2. コンポーネント先頭に `const palette = usePalette()` を追加
3. `PALETTE.xxx` をすべて `palette.xxx` に置き換え

::: tip props ではなく Context にした理由
色を props で渡す設計(`<RadarView data={...} palette={...} />`)でも動きます。Context にしたのは、「テーマ」がツリーの深いところまで**全員が使う横断的な値**だからです。props で 3 階層バケツリレーするくらいなら Context、が使い分けの目安です。
:::

### Step 5: CSS 変数でテーマを定義する

`frontend/src/index.css` の**末尾に追記**します(後に書いたルールが勝つので、第7章までの固定色を上書きできます)。

```css
/* ===== テーマ(第8章) ===== */

.themed {
  background: var(--bg);
  color: var(--text);
  border-radius: 16px;
  padding: 24px;
  transition: background 0.3s, color 0.3s;
  font-family: var(--font, inherit);
}

.themed[data-theme='light'] {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #1f2328;
  --muted: #6e7781;
  --border: #d0d7de;
  --primary: #4f6ef7;
  --track: #e8ebef;
}

.themed[data-theme='dark'] {
  --bg: #0f1420;
  --surface: #1a2233;
  --text: #e6e8ee;
  --muted: #8b93a7;
  --border: #2c3650;
  --primary: #7c93ff;
  --track: #232d45;
}

.themed[data-theme='pop'] {
  --bg: #fff3e6;
  --surface: #ffffff;
  --text: #472d30;
  --muted: #b08968;
  --border: #ffd166;
  --primary: #ff5d8f;
  --track: #ffe3ec;
  --font: 'Hiragino Maru Gothic ProN', 'Comic Sans MS', sans-serif;
}

.themed[data-theme='minimal'] {
  --bg: #ffffff;
  --surface: #fafafa;
  --text: #111111;
  --muted: #999999;
  --border: #e5e5e5;
  --primary: #111111;
  --track: #eeeeee;
}

.themed[data-theme='cyber'] {
  --bg: #05060f;
  --surface: #0b1020;
  --text: #d6f6ff;
  --muted: #5e88a8;
  --border: #12304a;
  --primary: #00e5ff;
  --track: #101a33;
  --font: 'Courier New', monospace;
}

/* 第7章の固定色を変数ベースに上書き */

.themed .result-hero small,
.themed .muted,
.themed .slider-labels,
.themed .score-card-label {
  color: var(--muted);
}

.themed .slider-labels .active {
  color: var(--text);
}

.themed .chart-area,
.themed .score-card {
  background: var(--surface);
  border-color: var(--border);
}

.themed .chart-tabs button,
.themed .theme-tabs button {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}

.themed .chart-tabs button.active,
.themed .theme-tabs button.active {
  background: var(--primary);
  color: var(--bg);
  border-color: var(--primary);
}

.themed .slider-track {
  background: var(--track);
}

.themed a {
  color: var(--primary);
}
```

### Step 6: 詳細ページにテーマ切り替えを組み込む

`frontend/src/pages/ResultDetail.tsx` を更新します。変更点は 3 つ:

1. テーマ選択肢の定義を追加
2. `changeTheme` 関数を追加(changeChart と同型)
3. ページの中身を `<ThemedArea>` で包み、テーマタブを設置

変更後の全文:

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { toAxisData } from '../lib/chartData'
import { ThemedArea } from '../theme/ThemeContext'
import type { ChartType, Result, Theme } from '../types'
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

export const THEMES: { theme: Theme; label: string }[] = [
  { theme: 'light', label: 'ライト' },
  { theme: 'dark', label: 'ダーク' },
  { theme: 'pop', label: 'ポップ' },
  { theme: 'minimal', label: 'ミニマル' },
  { theme: 'cyber', label: 'サイバー' },
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

  const patch = async (attrs: Partial<Pick<Result, 'chart_type' | 'theme'>>) => {
    setResult({ ...result, ...attrs }) // 楽観的更新
    await api<Result>(`/api/results/${result.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ result: attrs }),
    })
  }

  const Chart = CHART_COMPONENTS[result.chart_type]

  return (
    <main>
      <p><Link to="/">← 一覧に戻る</Link></p>

      <ThemedArea theme={result.theme}>
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
              onClick={() => patch({ chart_type: c.type })}
            >
              {c.label}
            </button>
          ))}
        </nav>

        <nav className="theme-tabs">
          {THEMES.map((t) => (
            <button
              key={t.theme}
              className={t.theme === result.theme ? 'active' : ''}
              onClick={() => patch({ theme: t.theme })}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="chart-area">
          <Chart data={toAxisData(result.scores)} />
        </section>
      </ThemedArea>
    </main>
  )
}
```

`theme-tabs` 用に CSS を 1 つだけ追記:

```css
.theme-tabs {
  display: flex;
  gap: 8px;
  margin: 0 0 16px;
  flex-wrap: wrap;
}
```

(`changeChart` は `patch` に統合したので削除しています。chart_type と theme の更新処理が同型だったため、1 つの関数にまとめました)

## 動作確認

1. 結果詳細ページでテーマタブを切り替える → 背景・文字・枠線・**チャートの色**が一斉に変わる
2. チャート形式 × テーマを自由に組み合わせられる(5 × 5)
3. リロードしても両方の選択が保持される
4. 開発者ツールで `.themed` 要素を選択し、`data-theme` 属性と CSS 変数の値が切り替わるのを確認

## 解説

### CSS Variables によるテーマの仕組み

各コンポーネントの CSS は `var(--surface)` のように**変数を参照するだけ**で、具体的な色を知りません。`data-theme` 属性が変わると変数の定義セットが差し替わり、参照している全要素が一斉に変わります。

- テーマを増やす = 変数定義ブロックを 1 つ足すだけ(既存コンポーネントは無変更)
- テーマは `.themed` のスコープ内だけに効く(アプリ全体のヘッダーなどは影響を受けない)

「色を直接書かず、意味(surface / muted / primary)で書く」のがテーマ設計の核心で、これはダークモード対応の実務でもそのまま使う手法です。

### なぜテーマがユーザーではなく result に紐づくのか

`theme` カラムを `users` ではなく `results` に置きました。これは第9章の共有機能への布石です。**共有 URL を開いた他人にも、登録者が選んだ見た目で表示したい**ので、「この結果はこの見た目」という情報を結果自身が持つ必要があります。「その属性は誰のものか」を一段考えるのはデータ設計の良い練習です。

## チェックリスト

- [ ] 5 テーマ × 5 チャートが組み合わせて動く
- [ ] CSS 変数がどう差し替わるか開発者ツールで確認した
- [ ] テーマを results に持たせた理由を説明できる
- [ ] git commit した

```bash
git add .
git commit -m "第8章: 5種類のテーマ切り替え"
```

▶ [第9章 共有機能](/chapters/09-sharing)
