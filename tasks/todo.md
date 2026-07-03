# Todo

## 進捗バー「サーバへ到着」が本番で更新されない件の修正（issue #21）

- [x] 原因特定: Cloudflare エッジがリクエストボディを全量バッファしてから Worker へ転送するため、AI サーバーの `received` イベントがアップロード完了後にまとめて届く（ローカルの wrangler dev はエッジを通らないため再現しない）
- [x] フロントエンド修正: `received` 未着かつアップロード進行中は「サーバへ到着」バーを 0% 凍結ではなく「転送中」の不確定表示にする（`ScreenProcessing`）
- [x] README「制約・注意点」にエッジバッファリングの制約と Configuration Rules による解消方法を追記
- [x] 検証: `npm run typecheck` / `npm run build` 成功、ローカルで動作確認

### 受け入れ基準

- 本番（バッファリング環境）: アップロード中の「サーバへ到着」が 0% で凍結せず、進行中であることが視覚的に分かる（転送中表示）。`received` が届き次第 100%/完了になる
- ローカル（ストリーミング環境）: 従来どおり `received` のバイト進捗で % が進む（退行なし）
- コード変更はフロントエンドの表示のみ。バックエンド/AI サーバーのプロトコルは不変

### Results

- `packages/frontend/src/pages/DashboardPage.tsx`: `ScreenProcessing` のバー定義に `indeterminate` を追加。`aiArrivalPct === 0 && edgePct > 0 && !error` の間は「転送中」（EN: IN TRANSIT）ラベル + 全幅の淡いスイープアニメーションで表示し、`received` 受信後は従来の % 表示に切り替わる
- `README.md`: 制約・注意点に本番のリクエストボディバッファリング制約を追記
- 検証: typecheck / build 成功。インフラ側の恒久対応（Configuration Rules の Request body buffering: None）は issue #21 に記載
