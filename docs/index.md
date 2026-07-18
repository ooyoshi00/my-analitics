---
layout: home

hero:
  name: 'MyAnalytics 開発の本'
  text: 'Rails × React で作る診断結果シェアアプリ'
  tagline: Docker 上の Rails 8 API + React + PostgreSQL。業務で使う技術スタックを、手を動かしながらまるごと練習する
  actions:
    - theme: brand
      text: 第1章から始める
      link: /chapters/01-introduction
    - theme: alt
      text: 開発環境を作る(第2章)
      link: /chapters/02-docker-setup

features:
  - icon: 🐳
    title: 業務と同じ構成で学ぶ
    details: Docker + Rails 8 + PostgreSQL。ECS Fargate で動く業務環境と同じ考え方を、ローカルの docker compose で再現します。
  - icon: 🔐
    title: 認証を「中身から」理解する
    details: Rails 8 標準の認証ジェネレータを API 向けに読み解いて改造。gem に頼らず仕組みを理解します。
  - icon: 📊
    title: 診断結果をグラフィカルに共有
    details: MBTI の結果 URL を登録し、5 種類のチャート × 5 種類のテーマで表示。共有 URL で友達にも見せられます。
  - icon: 💸
    title: インフラは完全無料
    details: Render 無料プラン + Neon 無料 PostgreSQL にデプロイ。クレジットカード不要の範囲で本番公開まで行きます。
---

## この本について {#この本について}

この本は、**読みながら自分の手でアプリを 1 本作り上げる**タイプの教材です。
各章は次の構成で統一されています。

1. **この章でやること** — ゴールの確認
2. **手を動かす** — コード全文つきの手順
3. **解説** — なぜそう書くのか、Rails の思想
4. **動作確認** — 動いたことを自分の目で確かめる
5. **チェックリスト** — 次の章に進む前の確認

## 目次 {#目次}

| 章 | 内容 |
| --- | --- |
| [第1章 はじめに](/chapters/01-introduction) | 作るもの・全体アーキテクチャ・学習の進め方 |
| [第2章 Docker開発環境の構築](/chapters/02-docker-setup) | docker compose で Rails 8 + PostgreSQL を起動する |
| [第3章 Rails APIの基礎](/chapters/03-rails-api-basics) | ルーティング・モデル・マイグレーションを MBTI マスターで学ぶ |
| [第4章 認証機能](/chapters/04-authentication) | Rails 8 標準認証を API 向けに改造する |
| [第5章 Reactフロントエンドの土台](/chapters/05-react-frontend) | Vite + TypeScript + React Router、ログイン画面 |
| [第6章 結果登録機能](/chapters/06-result-registration) | URL 判定サービスと登録フォーム |
| [第7章 グラフィカル表示①](/chapters/07-charts) | Recharts で 5 種類のチャート |
| [第8章 グラフィカル表示②](/chapters/08-themes) | CSS Variables で 5 種類のテーマ |
| [第9章 共有機能](/chapters/09-sharing) | 認証不要の共有ページ |
| [第10章 テスト](/chapters/10-testing) | RSpec で API をテストする |
| [第11章 デプロイ](/chapters/11-deploy) | Render + Neon へ無料で公開する |
| [付録A](/chapters/appendix-a-ecs-fargate) | 業務インフラ(ECS Fargate)との対応表 |
| [付録B](/chapters/appendix-b-debugging) | 詰まったときのデバッグ集 |
