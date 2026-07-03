# Issue #4: PDF出力機能を実装する

## Status: done

## Scope decision
- PDFのみ実装。JPGの実変換は対象外（JPGオプションは別コミット c9bc05a で既に削除済みのため、issueの既知バグ項目は解消済みと判断、ユーザー確認済み）
- 生成方式: pdf-lib（クライアント側、動的import、PNGをそのまま埋め込み）

## Checklist
- [x] `packages/frontend/package.json` に `pdf-lib` を追加
- [x] `packages/frontend/src/lib/exportPdf.ts` を新規作成（base64 PNG配列 → A4フィットの複数ページPDFのUint8Array）
- [x] `ScreenExport` の PDF ボタン（ヘッダー・フォーマットカード）を disabled/tooltip から通常のトグルに変更、`format` state を `'png' | 'pdf'` に
- [x] 単体ダウンロード（`runExport`）: PDF選択時は1ページPDFを生成してBlobダウンロード
- [x] 「すべてダウンロード」（`downloadAll`）: PDF選択時は全ページを1つのPDFに束ねてダウンロード（PNG選択時は既存のZIPを維持）
- [x] ファイル名は `folio-YYYY-MM-DD.{ext}` 規約を踏襲
- [x] typecheck / build 確認
- [x] PDF生成ロジックの動作確認（Nodeスクリプトでpdf-libを直接実行し検証、後述）
- [x] README.mdへの影響確認（現README.mdはスターターキット汎用テンプレートで書き出し形式の記載なし → 更新不要と判断）

## Results
- 変更ファイル: `packages/frontend/package.json`（pdf-lib追加）、`packages/frontend/src/lib/exportPdf.ts`（新規）、`packages/frontend/src/pages/DashboardPage.tsx`（ScreenExport）
- `npm run typecheck` / `npm run build` ともに成功（backend/sharedの`build`スクリプト不在エラーは既存の挙動で本変更とは無関係）
- ビルド出力を確認し、pdf-libは独立したチャンク（`index-DmgMwC1P.js`, 245KB）としてコード分割されており、PDF機能を使わないユーザーの初期ロードには含まれないことを確認
- `exportPdf.ts`の`buildPdfFromPngImages`をesbuildでNode向けにバンドルし、実際のpdf-libを使って単体スクリプトで検証:
  - 1画像→1ページPDF、3画像→3ページPDFになることを確認
  - 出力が`%PDF-`で始まる有効なPDFであることを確認
  - ページサイズがA4（595.28 x 841.89 pt）であることを確認
- ブラウザでの完全なE2E確認（ログイン→アップロード→AI補正→Export画面でPDFボタン押下）は未実施。理由: ログイン用テストアカウントのパスワードを保持しておらず、AI補正にはDockerのAIサーバー（モデル重み込み）起動が必要なため、本変更（クライアント側PDF組み立てのみ）のスコープに対して負荷が大きいと判断。Vite dev serverを起動し、変更後の`DashboardPage.tsx`がトランスフォームエラーなく配信されることは確認済み
- JPGの実変換（issueの既知バグ項目）は対象外。別コミット（c9bc05a）でJPGオプション自体が削除済みのため実質解消済みと判断（ユーザー確認済み）
