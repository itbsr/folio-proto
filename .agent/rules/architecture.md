---
trigger: always_on
---

# Architecture & Development Rules (Hono + Vite + Zod Monorepo)

## 🏗️ 1. Core Philosophy (基本思想)
このプロジェクトは `npm workspaces` を用いたモノレポ構成である。
最大の目的は **「Zod を単一の真実の情報源（Single Source of Truth）とし、フロントエンドからバックエンドまでの完全な型安全性を Hono RPC で実現すること」** である。
AI エージェントは、コードを生成する際、常にこのアーキテクチャと依存関係のルールを厳守しなければならない。

## 📂 2. Directory Responsibilities (各ディレクトリの責務)

### `packages/shared/` (最優先事項 / 型の源泉)
* **責務:** アプリケーション全体のデータ構造、バリデーションルール、共通の型定義を管理する。
* **ルール:** * 仕様変更や機能追加の際は、**必ず最初にここの Zod スキーマ (`src/schemas/`) を定義・修正すること。**
    * TypeScript の型は、極力 `z.infer<typeof ...>` を用いて Zod スキーマから抽出 (`src/types/`) すること。
    * **重要:** 外部（Backend/Frontend）から参照されるスキーマや型は、必ず `src/index.ts` から再エクスポートすること。パッケージ外からのインポートパスを `@my-app/shared` に一本化する。
    * バックエンドやフロントエンドの固有技術（HonoのContextやReactのフックなど）に依存するコードは絶対に含めないこと。

### `packages/backend/` (API & データベース)
* **責務:** Cloudflare Workers / D1 環境で動作する Hono API サーバーとデータベース管理。
* **ルール:**
    * リクエストのバリデーションには必ず `@hono/zod-validator` と `shared` の Zod スキーマを使用すること。
    * フロントエンド向けに、必ずルーターの型 (`AppType`) をエクスポートすること。
    * D1 データベースの変更（テーブル作成・変更）が発生する場合は、必ず `migrations/` ディレクトリに新しい SQL ファイルを作成すること。SQLite 互換の構文を厳守する。

### `packages/frontend/` (UI & クライアント)
* **責務:** Vite / React ベースのユーザーインターフェース。
* **ルール:**
    * バックエンド API への通信には、標準の `fetch` や `axios` を直接使わず、必ず `src/lib/hc.ts` に定義された Hono RPC クライアント (`hc`) を使用すること。
    * フォームのバリデーションには、`react-hook-form` と `@hookform/resolvers/zod` を用い、`shared` の Zod スキーマをそのまま適用すること。型の二重定義は禁止する。

## 🔄 3. Standard Development Workflow (標準開発フロー)
新機能を実装する際は、以下の順番で思考し、コードを生成すること。この順番を逸脱してフロントエンドから作り始めてはならない。

1.  **Schema Definition:** `shared/src/schemas/` に Zod スキーマを定義し、型を `shared/src/types/` で `export` する。その後、**必ず `shared/src/index.ts` からそれらを再エクスポートする。**
2.  **Database Migration:** 必要に応じて `backend/migrations/` に D1 用の SQL を記述する。
3.  **API Implementation:** `backend/` にエンドポイントを作成し、1で作ったスキーマでバリデーションをかける。ルーターの型をエクスポートする。
4.  **UI Implementation:** `frontend/` にコンポーネントを作成し、Hono RPC 経由で API を呼び出す。

## 🚫 4. Anti-Patterns (禁止事項)
* フロントエンドとバックエンドで同じ内容のインターフェースや型定義を別々に記述すること（型の重複）。
* `backend` のコードが `frontend` に依存すること。
* `shared` の中に `react` や `hono` のパッケージを `import` すること。
* ルートディレクトリ以外で勝手に `npm install` やパッケージの追加を実行すること（依存関係はルートの workspaces で解決する）。