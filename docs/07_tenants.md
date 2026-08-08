# テナント運用手順（販売者向け）

購入者（サロン）の追加・停止・削除・利用量確認の手順です。
仕組み：D1の `tenants` にサロン設定JSONを保存し、`?s=サロンID` で切り替えます。

## 前提（初回のみ）

1. Cloudflare → Storage & Databases → **D1** → データベース作成（名前：`salon-ai-os`）
2. コンソールに `server/schema.sql` を貼り付けて実行（テーブル作成）
3. 続けて `server/seed.sql` を貼り付けて実行（chainonjoli＋テスト美容室を登録）
4. Workerの設定 → 変数とシークレット → **Secret** `ADMIN_TOKEN` を追加（長い合言葉）
5. `wrangler.jsonc` に `d1_databases` バインディング（`binding: "DB"`・作成したDBのID）を追加してpush

## 各サロンのURL

| 用途 | URL |
|---|---|
| お客様ページ | `https://…github.io/salon-AI-OS/?s=サロンID` |
| **管理リンク（オーナーに渡すのはこれ1本）** | `https://…github.io/salon-AI-OS/owner.html?s=サロンID&k=設定キー` |
| （ポータル内から到達可能）設定エディタ | `editor.html?s=…&k=…` ／ 診断 `check.html?s=…` ／ ファクトリー `factory.html?s=…&k=…` |

- **サロンID（slug）**：半角小文字英数とハイフン、40文字まで（例 `hanako-salon`）
- **設定キー（setup_token）**：サロン追加時に自動発行。管理APIの `get` で確認できる
- 設定リンクを渡された購入者は、**自分のサロンの設定だけ**を読み書きできる
  （GitHub・Cloudflare・APIキーには触れない）

## サロンの追加・管理（管理API）

`POST <WorkerのURL>/admin`、ヘッダ `x-admin-token: <ADMIN_TOKEN>`。
D1コンソールから直接SQLでも操作できます（seed.sqlが実例）。

```bash
# 追加・更新（configは salon-config.js と同じ構造のJSON）
curl -X POST https://<worker>/admin -H "x-admin-token: $TOKEN" -H "content-type: application/json" \
  -d '{"action":"upsert","slug":"hanako-salon","name":"サロン花子","config":{...},"ratePerDay":60}'

# 一覧 / 詳細（設定キーの確認はこちら）
  -d '{"action":"list"}'
  -d '{"action":"get","slug":"hanako-salon"}'

# 停止 / 再開 / 削除（論理削除）
  -d '{"action":"status","slug":"hanako-salon","status":"suspended"}'
  -d '{"action":"status","slug":"hanako-salon","status":"active"}'
  -d '{"action":"delete","slug":"hanako-salon"}'

# 月次利用量（テナント別のリクエスト数・トークン数）
  -d '{"action":"usage","month":"2026-08"}'
```

## 分離とコストの仕組み

- **ナレッジ分離**：AIのシステムプロンプトには「そのテナントの設定だけ」が載る。
  他サロンの情報は文脈に存在しないため、漏れようがない
- **上限**：テナント別に `rate_per_min`（既定5・メモリ）と `rate_per_day`（既定60・D1で確実）。
  超過時はAIを呼ばず定型文＋LINE誘導に縮退
- **利用量**：`usage_daily` に日別・テナント別のリクエスト数と入出力トークン数。
  概算原価 ≒ 入力トークン×$1.50/100万 ＋ 出力トークン×$7.50/100万（gemini-3.6-flash）
- **保存しないもの**：APIキー・ADMIN_TOKEN（Secretのみ）・管理PIN（configから除去して保存）

## 注意

- テナント設定は**60秒キャッシュ**されます。停止・変更の反映は最大1分待ってください
- `?s=` なしのアクセスは従来どおり同梱 `salon-config.js`（chainonjoli）で動きます。
  D1障害時も同じ経路に自動で縮退します（chainonjoliは止まらない）
- 購入者へ渡すのは「お客様ページURL」と「設定リンク」の2つだけ。
  設定リンクは合鍵なので、再発行したい場合は `upsert` し直すと新しいキーになります
