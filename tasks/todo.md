# Issue #24: 出力フォーマットにJPGを追加する（実変換対応）

## Status: done

## Scope decision
- JPG選択時はcanvasで実際にPNG→JPEGへ再エンコードする（PDF実装時の`exportPdf.ts`に倣い`exportJpg.ts`を新規作成）
- 過去のJPGオプション（`c9bc05a`で削除）はラベルのみで実変換がなかったための削除。今回は実変換を行うため再度追加する
- 複数ページの「すべてダウンロード」はPNG同様ZIP束ね（JSZip既存パスを流用、各画像をJPEGに変換してからzipに格納）
- JPEG品質は0.92固定（品質調整UIはNon-goal）

## Checklist
- [x] `packages/frontend/src/lib/exportJpg.ts` を新規作成（base64 PNG → JPEG Blob、canvas経由の再エンコード）
- [x] `ScreenExport` の `format` state を `'png' | 'pdf' | 'jpg'` に拡張
- [x] ヘッダー行・フォーマットカードの両方のトグル配列に `'jpg'` を追加
- [x] `runExport`: JPG選択時はPNG→JPEG変換してBlobダウンロード
- [x] `downloadAll`: JPG選択時は各画像をJPEG変換してZIPに束ねる（「すべてダウンロード」ボタンの表示条件をPNGだけでなくJPGでも出すよう修正、`format !== 'pdf'`に変更）
- [x] ファイル名は既存の `${baseName}-corrected.${format}` 規約のまま（jpgでも自動的に動く）
- [x] typecheck / build 確認
- [x] JPEG変換ロジックの動作確認
- [x] README.mdへの影響確認

## Results
- 変更ファイル: `packages/frontend/src/lib/exportJpg.ts`（新規）、`packages/frontend/src/pages/DashboardPage.tsx`（`ScreenExport`）、`README.md`（技術スタック・機能一覧にJPG追記）
- `npm run typecheck` / `npm run build`（frontendワークスペース）ともに成功（backend/sharedの`build`スクリプト不在エラーは既存の挙動で本変更とは無関係）
- ブラウザでの実動作確認: Vite dev server (port 5174) 起動 + playwright-core（キャッシュ済みChrome for Testingを`executablePath`指定で流用、新規ブラウザDLなし）でヘッドレスChromiumから実際に`/src/lib/exportJpg.ts`を動的importし、以下を確認
  - 透過PNG（20x20、左上10x10だけ不透明な赤、他は透明）を`convertPngBase64ToJpegBlob`でJPEGに変換
  - 出力Blobが`image/jpeg`、先頭バイトが`ffd8ff`（JPEG SOIマーカー）、末尾が`ffd9`（EOIマーカー）で有効なJPEGであることを確認
  - 変換後のJPEGをデコードし直し、赤色部分が`rgb(254,1,0)`（元の赤とほぼ一致、JPEG圧縮による誤差の範囲）、元は透明だった部分が`rgb(255,255,247)`（ほぼ白）であることを確認 → コメントで意図した「透過部分は黒くならず白背景になる」挙動が実際に機能していることを確認
  - `console --errors`相当のチェックで出た唯一のエラーはバックエンド未起動による`/api/auth/me`の500（本変更と無関係、事前に切り分け済み）
- ログイン→アップロード→AI補正→Export画面でのフルE2E確認は未実施（Dockerのモデル重み込みが必要でスコープに対して重いと判断、PDF実装時の前例を踏襲）。ただし変換ロジック自体は実ブラウザ・実モジュールで検証済みのため、UIの配線ミスがなければ動作する
