import { defineConfig } from 'vitepress'

// GitHub Pages のプロジェクトサイトとして公開するため、
// base はリポジトリ名と一致させる必要がある
export default defineConfig({
  lang: 'ja-JP',
  title: 'Rails × React で作る診断結果シェアアプリ',
  description:
    'Docker 上の Rails 8 API + React で MBTI 診断結果シェアアプリを作りながら学ぶ実践入門',
  base: '/my-analitics/',

  themeConfig: {
    siteTitle: 'MyAnalytics 開発の本',

    nav: [
      { text: 'はじめに', link: '/chapters/01-introduction' },
      { text: '目次', link: '/#目次' },
    ],

    sidebar: [
      {
        text: '本編',
        items: [
          { text: '第1章 はじめに', link: '/chapters/01-introduction' },
          { text: '第2章 Docker開発環境の構築', link: '/chapters/02-docker-setup' },
          { text: '第3章 Rails APIの基礎', link: '/chapters/03-rails-api-basics' },
          { text: '第4章 認証機能', link: '/chapters/04-authentication' },
          { text: '第5章 Reactフロントエンドの土台', link: '/chapters/05-react-frontend' },
          { text: '第6章 結果登録機能', link: '/chapters/06-result-registration' },
          { text: '第7章 グラフィカル表示① チャート', link: '/chapters/07-charts' },
          { text: '第8章 グラフィカル表示② テーマ', link: '/chapters/08-themes' },
          { text: '第9章 共有機能', link: '/chapters/09-sharing' },
          { text: '第10章 テスト', link: '/chapters/10-testing' },
          { text: '第11章 デプロイ', link: '/chapters/11-deploy' },
        ],
      },
      {
        text: '付録',
        items: [
          { text: '付録A 業務インフラ(ECS Fargate)との対応', link: '/chapters/appendix-a-ecs-fargate' },
          { text: '付録B デバッグ集', link: '/chapters/appendix-b-debugging' },
        ],
      },
    ],

    outline: {
      level: [2, 3],
      label: 'このページの目次',
    },

    docFooter: {
      prev: '前の章',
      next: '次の章',
    },

    search: {
      provider: 'local',
    },

    lastUpdated: {
      text: '最終更新',
    },
  },
})
