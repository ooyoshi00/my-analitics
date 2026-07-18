# 付録A 業務インフラ(ECS Fargate)との対応

この教材で作った構成は、業務の「ECS Fargate + RDS」構成の**無料版ミニチュア**になるよう設計してあります。この付録では両者を突き合わせて、業務のインフラ用語を「もう知っているもの」に翻訳します。

## ECS の登場人物を 30 秒で

- **ECS(Elastic Container Service)** … AWS のコンテナオーケストレーター。「どのイメージを・何個・どんな設定で動かすか」を管理する
- **Fargate** … コンテナを動かすサーバー(EC2)の管理を AWS に任せる実行方式。「サーバーレスなコンテナ実行環境」
- **タスク定義(Task Definition)** … コンテナの設計図。イメージ・CPU/メモリ・環境変数・ポートなどを JSON で定義
- **タスク(Task)** … タスク定義から起動された実行中のコンテナ(の集まり)
- **サービス(Service)** … 「タスクを常に N 個動かし続ける」を保証する仕組み。落ちたら再起動、デプロイ時は入れ替え
- **ALB(Application Load Balancer)** … リクエストをタスクに振り分ける入口。ヘルスチェックも担当
- **ECR(Elastic Container Registry)** … Docker イメージ置き場(Docker Hub の AWS 版)

## 対応表

| この教材 | 業務(AWS) | 補足 |
| --- | --- | --- |
| Render Web Service | ECS Service + Fargate タスク | 「コンテナを動かし続けてくれる場所」 |
| Render の Docker ビルド | CI でビルド → ECR に push | Render は git push だけで内部でやってくれている |
| ルートの `Dockerfile` | ECR に置くイメージの Dockerfile | マルチステージ構成もそのまま通用する |
| Render の環境変数設定 | タスク定義の `environment` / `secrets` | 秘密情報は Secrets Manager 経由が業務の定石 |
| `RAILS_MASTER_KEY` を環境変数で注入 | Secrets Manager → タスク定義 `secrets` | 考え方は同一 |
| Neon | RDS(PostgreSQL) | どちらも「マネージド PostgreSQL に DATABASE_URL で接続」 |
| Health Check Path `/up` | ALB ターゲットグループのヘルスチェック | 落ちたタスクは自動で入れ替えられる |
| main へ push → 自動デプロイ | CI/CD(例: GitHub Actions → ECR → `ecs update-service`) | 業務はパイプラインが明示的に組まれている |
| Render の Logs 画面 | CloudWatch Logs | タスク定義の `logConfiguration` で送り先を指定 |
| 無料プランのスリープ | (相当なし) | Fargate は止めない限り動き続け、その分課金される |

## compose.yml とタスク定義の対応

第2章で書いた compose.yml の各項目は、タスク定義の項目にほぼ 1:1 で対応します。

| compose.yml | タスク定義 |
| --- | --- |
| `services.api.image` / `build` | `containerDefinitions[].image`(ECR の URL) |
| `environment:` | `environment` / `secrets` |
| `ports:` | `portMappings` |
| `depends_on`(healthcheck 条件) | `dependsOn`(condition: HEALTHY) |
| `healthcheck:` | `healthCheck` |
| CPU/メモリ(ローカルでは無制限) | `cpu` / `memory`(Fargate では必須指定) |

「compose.yml はローカル用のタスク定義」と捉えると、業務でタスク定義の JSON を見たときに読めるはずです。

## 大きく違うところ

対応表に乗らない、業務で追加される要素も知っておきましょう。

1. **ネットワーク(VPC)** … 業務では RDS はプライベートサブネットにあり、インターネットから直接届きません。ALB だけが公開されます。Neon が世界中から接続できるのとは対照的です
2. **DB マイグレーションの流し方** … この教材はコンテナ起動時に `db:prepare` を実行しましたが、複数タスクが同時に起動する業務環境では競合しうるため、「デプロイパイプラインの 1 ステップとして 1 回だけ実行」(ECS の RunTask など)にするのが一般的です
3. **スケール** … ECS Service はタスク数を増やせます(オートスケール)。Rails がセッションを DB に持つ設計(第4章)はこのとき効いてきます。どのタスクにリクエストが行ってもログイン状態が共有されるからです
4. **コスト** … Fargate は「vCPU とメモリ × 時間」の従量課金で、最小構成でも月数千円かかります。この教材が Render を選んだ理由がこれです

## 業務コードを読むときのチェックリスト

配属後、最初にこのあたりを探して読むとインフラの全体像が掴めます。

- [ ] Dockerfile はマルチステージか?最終イメージに何が入っている?
- [ ] タスク定義(またはそれを生成する Terraform / CDK)で環境変数と secrets はどう注入されている?
- [ ] ヘルスチェックのパスはどこ?(`/up` か、カスタムか)
- [ ] マイグレーションはデプロイのどの段階で流れる?
- [ ] ログはどこに出て、どこで見る?(CloudWatch Logs のロググループ名)

▶ [付録B 詰まったときのデバッグ集](/chapters/appendix-b-debugging)
