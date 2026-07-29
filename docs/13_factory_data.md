# AIコンテンツファクトリー — データ設計（工程4）

> 承認ステータス：**レビュー待ち**

## 方針

- Phase 1 はブラウザの localStorage に保存（サーバー不要・既存プロトタイプと同方針）
- 構造は最初から **SaaS化（マルチテナント）** を見据え、docs/03 のDB設計に写像できる形にする
- キーはすべて `factory.` プレフィックスで名前空間を分離

## localStorage スキーマ（Phase 1）

### `factory.profile` — 店舗プロフィール（＝テナント設定の先取り）

```json
{
  "shopName": "chainonjoli",
  "industry": "エステ",
  "intro": "伊勢市の隠れ家プライベートエステ",
  "tone": "soft",              // soft | formal | genki
  "aiEndpoint": ""             // WorkerのURL。空ならデモモード
}
```

### `factory.products` — 商品（配列）

```json
[{
  "id": "p_1722240000000",     // p_ + epoch ms
  "name": "モイストリペアセラム",
  "brand": "○○コスメ",
  "features": "セラミド3種配合の高保湿美容液…",
  "effects": "乾燥による小じわを目立たなくする…",
  "usage": "洗顔後、化粧水のあとに2プッシュ…",
  "target": "乾燥・敏感肌の方、エアコンで肌がつっぱる方",
  "cautions": "お肌に異常があるときは使用を中止…",
  "source": "manual",          // manual | pdf | image
  "createdAt": "2026-07-29T10:00:00.000Z",
  "updatedAt": "2026-07-29T10:00:00.000Z"
}]
```

### `factory.history` — 生成履歴（配列・新しい順・最大100件）

```json
[{
  "id": "h_1722240000000",
  "theme": "乾燥肌向けの保湿ケア紹介",
  "productId": "p_1722240000000",   // 使わなかった場合 null
  "productName": "モイストリペアセラム",
  "mode": "ai",                      // ai | demo
  "createdAt": "2026-07-29T10:05:00.000Z",
  "contents": {
    "instagram":   "…",
    "reel":        "…",
    "line":        "…",
    "blog":        "…",
    "mail":        "…",
    "shortVideo":  "…",
    "caption":     "…",
    "hashtags":    "…"
  }
}]
```

## コンテンツ種別の定義（8種・固定キー）

| キー | 表示名 | アイコン |
|---|---|---|
| instagram | Instagram投稿 | 📸 |
| reel | Instagramリール台本 | 🎬 |
| line | LINE配信文 | 💬 |
| blog | ブログ記事 | ✍️ |
| mail | メールマガジン | ✉️ |
| shortVideo | ショート動画台本 | 📱 |
| caption | キャプション | 💭 |
| hashtags | ハッシュタグ | #️⃣ |

## AI API（Worker拡張）のインターフェース

エンドポイントは既存 Worker を拡張（`dept` で分岐。既存の受付チャットは無変更）。

### 生成：`POST { dept:"factory", action:"generate", input:{...} }`

```json
{
  "dept": "factory",
  "action": "generate",
  "input": {
    "theme": "乾燥肌向けの保湿ケア紹介",
    "product": { "name": "…", "brand": "…", "features": "…", "effects": "…",
                  "usage": "…", "target": "…", "cautions": "…" },
    "profile": { "shopName": "…", "industry": "…", "intro": "…", "tone": "soft" }
  }
}
→ 200 { "contents": { "instagram": "…", …8キー… } }
```

### 商品抽出：`POST { dept:"factory", action:"extract", file:{...} }`

```json
{
  "dept": "factory",
  "action": "extract",
  "file": { "mediaType": "application/pdf", "data": "<base64>" }
}
→ 200 { "product": { "name": "…", "brand": "…", "features": "…", "effects": "…",
                      "usage": "…", "target": "…", "cautions": "…" } }
```

- 対応形式：PDF（`application/pdf`）／画像（`image/jpeg` `image/png` `image/webp`）
- サイズ上限：8MB（超過はクライアント側で弾いてメッセージ表示）

## 将来のDB写像（Phase 2、docs/03 に統合予定）

| localStorage | 将来のテーブル | 備考 |
|---|---|---|
| factory.profile | `tenants` + `tenant_settings` | `tenant_id` 主キー |
| factory.products | `products`（`tenant_id`, `id`, 7項目, `source`, timestamps） | |
| factory.history | `generated_contents`（`tenant_id`, `id`, `theme`, `product_id` FK, `contents` JSONB, `mode`, `created_at`） | |

書き出し／読み込み（設定画面）のJSONはこの3キーをまとめたもので、
Phase 2 移行時のインポート形式としてそのまま使う。
