# 第5章 Reactフロントエンドの土台

## この章でやること

- `frontend/` に Vite + React + TypeScript プロジェクトを作り、docker compose に組み込む
- Vite の **proxy** で `/api` を Rails に転送する(CORS 回避の仕組みを理解する)
- React Router でページを分け、第4章の認証 API と接続する
- ログイン / サインアップ / ダッシュボードの画面を完成させる

この章が終わると、ブラウザ(`http://localhost:5173`)からサインアップ → ログイン → ログアウトが一通り動きます。

## 手を動かす

### Step 1: Vite プロジェクトを作る

Node.js はローカルにあるので、プロジェクト作成はローカルで行います(リポジトリのルートで):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-router-dom
cd ..
```

### Step 2: Vite の proxy を設定する

`frontend/vite.config.ts` を次のようにします。

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // コンテナ外(ホストのブラウザ)からのアクセスを受ける
    proxy: {
      // /api で始まるリクエストを Rails に転送する
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
})
```

::: tip proxy が解決している問題(CORS)
ブラウザは「ページのオリジン(localhost:5173)と違うオリジン(localhost:3000)への fetch」を制限します(CORS)。さらにクッキーをまたがせるには追加設定が必要で、面倒ごとが多い領域です。

Vite の proxy を使うと、ブラウザから見た API は**同一オリジン**(localhost:5173/api)になり、CORS もクッキーの問題も**そもそも発生しません**。転送先(localhost:3000)へはブラウザではなく Vite サーバーがアクセスするため、ブラウザの制限は関係ないのです。本番も Rails が React を配信する同一オリジン構成なので、開発と本番で条件が揃います。
:::

### Step 3: compose に frontend サービスを追加する

`compose.yml` の `services:` に追記します。

```yaml
  frontend:
    image: node:22-slim
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    ports:
      - "5173:5173"
    environment:
      VITE_API_PROXY_TARGET: http://api:3000
    depends_on:
      - api
```

`volumes:`(ファイル末尾)にも追記:

```yaml
volumes:
  pg_data:
  bundle_cache:
  frontend_node_modules:   # ← 追加
```

::: warning node_modules だけ別ボリュームにする理由
esbuild などは **OS ごとに違うネイティブバイナリ**をインストールします。ホスト(macOS)の node_modules をそのままコンテナ(Linux)にマウントすると起動に失敗します。`/app/node_modules` だけ名前付きボリュームで上書きし、「コード はホストと共有、node_modules はコンテナ専用」にしています。

なお、コンテナを使わず `cd frontend && npm run dev` でローカル起動しても構いません(proxy 先はデフォルトの localhost:3000 が使われます)。
:::

起動し直します。

```bash
docker compose up
```

`http://localhost:5173` で Vite のサンプル画面が出れば OK です。

### Step 4: API クライアントを書く

fetch を毎回素で書くと冗長なので、薄いラッパーを 1 つ作ります。

`frontend/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; errors?: string[] } | null,
  ) {
    super(body?.error ?? body?.errors?.join(', ') ?? `APIエラー (${status})`)
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
```

型定義もまとめておきます。`frontend/src/types.ts`:

```ts
export type User = {
  id: number
  email_address: string
}
```

### Step 5: 認証状態を Context で管理する

「いまログインしているか」はアプリ全体で参照するので、React の Context に載せます。

`frontend/src/auth/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { User } from '../types'

type AuthContextValue = {
  user: User | null
  loading: boolean
  signup: (email: string, password: string, passwordConfirmation: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 初回マウント時に「ログイン済みか」をサーバーに聞く
  // (クッキーはブラウザが勝手に送るので、聞くだけでよい)
  useEffect(() => {
    api<User>('/api/me')
      .then(setUser)
      .catch(() => setUser(null)) // 401 = 未ログイン
      .finally(() => setLoading(false))
  }, [])

  const signup = async (email: string, password: string, passwordConfirmation: string) => {
    const u = await api<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        user: {
          email_address: email,
          password,
          password_confirmation: passwordConfirmation,
        },
      }),
    })
    setUser(u)
  }

  const login = async (email: string, password: string) => {
    const u = await api<User>('/api/session', {
      method: 'POST',
      body: JSON.stringify({ email_address: email, password }),
    })
    setUser(u)
  }

  const logout = async () => {
    await api<void>('/api/session', { method: 'DELETE' })
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth は AuthProvider の中でのみ使えます')
  return ctx
}
```

### Step 6: ルーティングを組む

`frontend/src/App.tsx` を丸ごと置き換え:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'

// ログイン必須ページを包むコンポーネント
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p>読み込み中...</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

### Step 7: 各ページを作る

`frontend/src/pages/Login.tsx`:

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    }
  }

  return (
    <main className="auth-page">
      <h1>ログイン</h1>
      <form onSubmit={handleSubmit}>
        <label>
          メールアドレス
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          パスワード
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">ログイン</button>
      </form>
      <p>
        アカウントがない場合は <Link to="/signup">サインアップ</Link>
      </p>
    </main>
  )
}
```

`frontend/src/pages/Signup.tsx`:

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await signup(email, password, passwordConfirmation)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました')
    }
  }

  return (
    <main className="auth-page">
      <h1>サインアップ</h1>
      <form onSubmit={handleSubmit}>
        <label>
          メールアドレス
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          パスワード(8文字以上)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          パスワード(確認)
          <input
            type="password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">登録する</button>
      </form>
      <p>
        アカウントがある場合は <Link to="/login">ログイン</Link>
      </p>
    </main>
  )
}
```

`frontend/src/pages/Dashboard.tsx`(この章では仮の中身。第6章で本実装します):

```tsx
import { useAuth } from '../auth/AuthContext'

export default function Dashboard() {
  const { user, logout } = useAuth()

  return (
    <main>
      <header className="app-header">
        <h1>MyAnalytics</h1>
        <div>
          <span>{user?.email_address}</span>
          <button onClick={logout}>ログアウト</button>
        </div>
      </header>
      <p>ようこそ!ここに診断結果の一覧が入ります(第6章)。</p>
    </main>
  )
}
```

最後に最低限のスタイルです。`frontend/src/index.css` を丸ごと置き換え(Vite が生成した `App.css` の import は `App.tsx` から消してください):

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  background: #f6f7f9;
  color: #1f2328;
}

main {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
}

.auth-page form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 360px;
}

.auth-page label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

input {
  padding: 8px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font-size: 16px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #4f6ef7;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.error {
  color: #d1242f;
  font-size: 14px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
```

## 動作確認

1. `docker compose up` で 3 サービスが起動していることを確認(`docker compose ps`)
2. `http://localhost:5173/signup` で新規登録 → ダッシュボードに遷移すれば成功
3. **開発者ツールの Network タブ**を開いて操作を繰り返し、次を観察してください
   - `/api/users` へのリクエストが `localhost:5173` 宛てに見える(→ Vite が Rails へ転送している)
   - レスポンスヘッダに `Set-Cookie: session_id=...` がある
   - 以降のリクエストヘッダに `Cookie: session_id=...` が自動で付く
4. ページをリロードしてもログイン状態が保たれる(`/api/me` の効果)
5. ログアウト → `/` にアクセスすると `/login` にリダイレクトされる

## 解説

### 認証状態の「真実」はどこにあるか

フロントは `user` state を持っていますが、これは**表示用のキャッシュ**にすぎません。真実は常にサーバー側(sessions テーブル + クッキー)にあります。

- リロード時: state は消える → `/api/me` で真実を問い直す(`AuthProvider` の `useEffect`)
- 不整合時: フロントが「ログイン中」と思っていても、サーバーが 401 を返せばそれが正

「クライアントの状態は信用しない。サーバーが最終判定する」は認証に限らず API 設計全般の原則です。

### RequireAuth の loading 待ち

`/api/me` の応答前に判定すると、ログイン済みでも一瞬 `/login` に飛ばされてしまいます。`loading` 中は判定を保留するのがポイントです。この「初期化が終わるまで描画を待つ」パターンは実務の SPA で頻出します。

### Rails 側と React 側の対応表

| Rails(第4章) | React(この章) |
| --- | --- |
| `POST /api/users` | `signup()` |
| `POST /api/session` | `login()` |
| `DELETE /api/session` | `logout()` |
| `GET /api/me` | `AuthProvider` 初期化 |
| 401 レスポンス | `catch` → `/login` へ |

## よくあるトラブル

| 症状 | 原因と対処 |
| --- | --- |
| `/api/...` が 404(HTML が返る) | proxy 設定ミス。vite.config.ts を保存後、frontend サービスを再起動 |
| コンテナ内で esbuild エラー | node_modules をボリューム分離していない。compose.yml の volumes を確認し `docker compose down` → `up` |
| クッキーが保存されない | `localhost:3000` に直接 fetch していないか確認(必ず相対パス `/api/...` で書く) |
| リロードするとログアウトされる | `/api/me` の呼び出し失敗。Network タブでレスポンスを確認 |

## チェックリスト

- [ ] サインアップ → ログアウト → ログインがブラウザで一通り動く
- [ ] Vite proxy が CORS 問題をどう回避しているか説明できる
- [ ] リロードしてもログイン状態が保たれる仕組みを説明できる
- [ ] git commit した

```bash
git add .
git commit -m "第5章: Reactフロントエンドと認証画面"
```

▶ [第6章 結果登録機能](/chapters/06-result-registration)
