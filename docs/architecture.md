# アーキテクチャ図

## システム全体構成

```mermaid
graph TB
    subgraph Browser["ブラウザ (クライアント)"]
        User["ユーザー"]
    end

    subgraph CF["Cloudflare プラットフォーム"]
        subgraph Pages["Cloudflare Pages"]
            Frontend["フロントエンド<br/>React + Vite<br/>TypeScript"]
        end

        subgraph Workers["Cloudflare Workers"]
            Backend["バックエンド API<br/>Hono (TypeScript)<br/>セッション認証 / クォータ管理"]
        end

        subgraph D1["Cloudflare D1 (SQLite)"]
            DB[("データベース<br/>users<br/>sessions<br/>usage_logs<br/>usage_quotas")]
        end
    end

    subgraph AIInfra["AI インフラ (オンプレ / リモートサーバー)"]
        subgraph Docker["Docker コンテナ"]
            AIServer["AI推論サーバー<br/>FastAPI (Python)<br/>DewarpNet 文書補正 ML"]
            Weights[("モデル重みファイル<br/>WC Model (UNet)<br/>BM Model (DNet)")]
        end
    end

    subgraph Shared["@my-app/shared (共通パッケージ)"]
        Zod["Zod スキーマ<br/>型定義・バリデーション"]
    end

    User -->|"HTTPS"| Frontend
    Frontend -->|"Hono RPC (型安全)<br/>REST API + Cookie"| Backend
    Backend -->|"SQL クエリ"| DB
    Backend -->|"HTTP + Bearer Token<br/>画像データ (base64)"| AIServer
    AIServer --> Weights

    Frontend -.->|"型の共有"| Shared
    Backend -.->|"型の共有"| Shared

    style Browser fill:#e8f4f8,stroke:#2196F3
    style CF fill:#fff3e0,stroke:#FF9800
    style Pages fill:#fff8e1,stroke:#FFC107
    style Workers fill:#fff8e1,stroke:#FFC107
    style D1 fill:#fff8e1,stroke:#FFC107
    style AIInfra fill:#f3e5f5,stroke:#9C27B0
    style Docker fill:#ede7f6,stroke:#673AB7
    style Shared fill:#e8f5e9,stroke:#4CAF50
```

## データフロー: 画像補正処理

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant FE as フロントエンド<br/>(React)
    participant BE as バックエンド API<br/>(Hono / Workers)
    participant D1 as Cloudflare D1
    participant AI as AI推論サーバー<br/>(FastAPI)

    User->>FE: 画像をアップロード<br/>(JPEG / HEIC / PNG)
    FE->>FE: HEIC → JPEG 変換<br/>(heic2any)
    FE->>BE: POST /api/images/process-stream<br/>(base64 画像)

    BE->>D1: セッション検証
    D1-->>BE: ユーザー情報・プラン
    BE->>D1: クォータ確認 (月次上限)
    D1-->>BE: 使用量 (free: 50回 / pro: 1000回)

    BE->>AI: POST /process-stream<br/>(base64, Bearer Token)
    AI-->>BE: SSE ストリーム<br/>進捗イベント (0%→50%→100%)
    BE-->>FE: SSE ストリーム転送<br/>進捗 + 補正済み画像 (base64)

    BE->>D1: 使用ログ記録<br/>(usage_logs, usage_quotas)

    FE->>User: Before/After スライダー表示
    User->>FE: ダウンロード
```

## パッケージ構成

```mermaid
graph LR
    subgraph Monorepo["npm ワークスペース (packages/*)"]
        Shared["@my-app/shared<br/>────────────<br/>Zod スキーマ<br/>共通型定義"]
        Backend["packages/backend<br/>────────────<br/>Hono API サーバー<br/>認証・クォータ<br/>AI クライアント"]
        Frontend["packages/frontend<br/>────────────<br/>React + Vite<br/>画像アップロード UI<br/>Hono RPC クライアント"]
    end

    AIServer["ai-server/<br/>────────────<br/>FastAPI (Python)<br/>DewarpNet 推論<br/>Docker コンテナ"]

    Shared -->|"型・スキーマを提供"| Backend
    Shared -->|"型・スキーマを提供"| Frontend
    Backend -->|"HTTP API"| AIServer

    style Monorepo fill:#e3f2fd,stroke:#1565C0
    style AIServer fill:#f3e5f5,stroke:#7B1FA2
```

## ユースケース図

```mermaid
graph LR
    %% 左側アクター
    GuestActor["👤 ゲスト<br/>(未認証ユーザー)"]
    FreeActor["👤 Freeユーザー<br/>(認証済み・月50回)"]
    ProActor["👤 Proユーザー<br/>(認証済み・月1,000回)"]

    subgraph System["folio-proto システム境界"]
        subgraph AuthUC["認証"]
            UC1("新規登録")
            UC2("ログイン")
            UC3("ログアウト")
        end

        subgraph ImageUC["画像処理"]
            UC4("画像をアップロード")
            UC5("文書補正を実行")
            UC6("処理進捗を確認")
            UC7("Before/After を比較")
            UC8("補正済み画像をダウンロード")
        end

        subgraph ManageUC["利用管理"]
            UC9("使用量・クォータを確認")
            UC10("処理履歴を確認")
        end

        subgraph InternalUC["システム内部処理"]
            UC11(["クォータ上限チェック"])
            UC12(["セッション検証"])
            UC13(["DewarpNet 推論<br/>(WC + BM 2段階)"])
            UC14(["SSEストリームで進捗配信"])
        end
    end

    %% 右側アクター
    AIActor["🤖 AIサーバー<br/>(外部システム)"]

    %% ゲスト → ユースケース
    GuestActor --> UC1
    GuestActor --> UC2

    %% Freeユーザー → ユースケース
    FreeActor --> UC3
    FreeActor --> UC4
    FreeActor --> UC5
    FreeActor --> UC6
    FreeActor --> UC7
    FreeActor --> UC8
    FreeActor --> UC9
    FreeActor --> UC10

    %% Proユーザー → ユースケース
    ProActor --> UC3
    ProActor --> UC4
    ProActor --> UC5
    ProActor --> UC6
    ProActor --> UC7
    ProActor --> UC8
    ProActor --> UC9
    ProActor --> UC10

    %% AIサーバー → ユースケース
    UC13 --> AIActor
    UC14 --> AIActor

    %% «include» 関係
    UC4 -.->|"«include»"| UC12
    UC5 -.->|"«include»"| UC11
    UC5 -.->|"«include»"| UC12
    UC5 -.->|"«include»"| UC13
    UC6 -.->|"«include»"| UC14

    style System fill:#fafafa,stroke:#546E7A,stroke-width:2px
    style AuthUC fill:#e3f2fd,stroke:#1976D2
    style ImageUC fill:#e8f5e9,stroke:#388E3C
    style ManageUC fill:#fff3e0,stroke:#F57C00
    style InternalUC fill:#f3e5f5,stroke:#7B1FA2,stroke-dasharray:4 4

    style GuestActor fill:#eceff1,stroke:#607D8B
    style FreeActor fill:#e1f5fe,stroke:#0288D1
    style ProActor fill:#ffe0b2,stroke:#E65100
    style AIActor fill:#ede7f6,stroke:#512DA8

    style UC11 fill:#f3e5f5,stroke:#9C27B0
    style UC12 fill:#f3e5f5,stroke:#9C27B0
    style UC13 fill:#f3e5f5,stroke:#9C27B0
    style UC14 fill:#f3e5f5,stroke:#9C27B0
```

**アクター説明:**

| アクター | 説明 | 月間処理上限 |
|---|---|---|
| ゲスト | 未認証ユーザー。登録・ログインのみ可能 | ― |
| Freeユーザー | 無料プラン。基本機能を利用可能 | 50回 |
| Proユーザー | 有料プラン。Freeと同じ機能、上限が大幅拡大 | 1,000回 |
| AIサーバー | DewarpNet推論を担う外部システム | ― |

**ユースケース説明:**

| ユースケース | 説明 |
|---|---|
| 新規登録 | メール・パスワードでアカウント作成 (デフォルト: Freeプラン) |
| ログイン | HTTP-only Cookieによるセッション開始 (7日間有効) |
| ログアウト | セッション破棄 |
| 画像をアップロード | JPEG / PNG / HEIC 形式に対応。HEIC は自動変換 |
| 文書補正を実行 | アップロード画像をDewarpNetで補正。クォータ・セッション確認を含む |
| 処理進捗を確認 | SSEストリームで 0%→50%→100% の進捗をリアルタイム受信 |
| Before/After を比較 | スライダーUIで補正前後を並べて確認 |
| 補正済み画像をダウンロード | 補正済みJPEG画像を端末に保存 |
| 使用量・クォータを確認 | 当月の処理回数・残り回数・プラン上限を表示 |
| 処理履歴を確認 | 直近20件の処理結果 (成功/失敗) を一覧表示 |

## 認証フロー

```mermaid
flowchart TD
    A["ユーザーがアクセス"] --> B{AuthGuard}
    B -->|"セッション有効"| C["ダッシュボード表示"]
    B -->|"未認証"| D["ログインページ"]

    D -->|"メール + パスワード"| E["POST /api/auth/login"]
    E --> F["PBKDF2 パスワード検証<br/>(D1)"]
    F -->|"成功"| G["セッション生成<br/>HTTP-only Cookie (7日)"]
    G --> C

    D --> H["新規登録"]
    H -->|"メール + パスワード"| I["POST /api/auth/register"]
    I --> J["パスワードハッシュ化<br/>ユーザー作成 (free プラン)"]
    J --> G
```
