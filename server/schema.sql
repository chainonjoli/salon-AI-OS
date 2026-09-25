-- =========================================================
-- Salon AI OS — D1スキーマ（マルチテナント・ライト）
-- ---------------------------------------------------------
-- CloudflareダッシュボードのD1コンソールに貼り付けて実行します。
-- 実行しても既存テーブルは壊しません（IF NOT EXISTS）。
-- =========================================================

-- 購入者（テナント）台帳。config にはサロン設定JSONを丸ごと入れる。
-- ※ ai（接続先）と admin（PIN）は保存しない：
--    接続先はWorker自身が注入し、PINはD1に置かない方針。
CREATE TABLE IF NOT EXISTS tenants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,             -- URLの ?s= に入るID（半角英数とハイフン）
  name          TEXT NOT NULL,                    -- サロン名（管理用の表示名）
  status        TEXT NOT NULL DEFAULT 'active',   -- active / suspended
  config        TEXT NOT NULL,                    -- サロン設定JSON（salon-config.js と同じ構造）
  setup_token   TEXT,                             -- 初期設定リンク用（M2で使用）
  rate_per_min  INTEGER NOT NULL DEFAULT 5,       -- このサロンの1分あたり上限（同一IP）
  rate_per_day  INTEGER NOT NULL DEFAULT 60,      -- このサロンの1日あたり上限（全体）
  note          TEXT,                             -- 販売者用メモ
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT                              -- 論理削除（入っていたら無効）
);

-- 日別の利用量。テナント別のコスト把握と1日上限の判定に使う。
CREATE TABLE IF NOT EXISTS usage_daily (
  tenant_id     INTEGER NOT NULL,
  day           TEXT NOT NULL,                    -- 'YYYY-MM-DD'（UTC）
  requests      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,       -- 思考トークン込み
  PRIMARY KEY (tenant_id, day)
);

CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_daily (day);

-- =========================================================
-- 顧客フォロー管理（CRM）— 全テナント標準搭載
-- ※ Workerが初回アクセス時に自動作成するため、手動実行は不要。
--   （新規環境を手で構築する場合の記録として残している）
-- =========================================================

CREATE TABLE IF NOT EXISTS customers (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id             INTEGER NOT NULL,     -- テナント分離の要
  name                  TEXT NOT NULL,
  kana                  TEXT,                 -- 並び替え・検索用（任意）
  birthday_month        INTEGER,              -- 1〜12（任意。月日だけの登録が可能）
  birthday_day          INTEGER,              -- 1〜31（任意）
  birthday_year         INTEGER,              -- 任意（年齢管理しないサロンは空でよい）
  last_visit_date       TEXT,                 -- 'YYYY-MM-DD'（任意）
  next_reservation_date TEXT,                 -- 'YYYY-MM-DD'（任意）
  next_reservation_time TEXT,                 -- 'HH:MM'（任意）
  visit_count           INTEGER NOT NULL DEFAULT 0,
  note                  TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at            TEXT                  -- 論理削除
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant   ON customers (tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_birthday ON customers (tenant_id, birthday_month, birthday_day);

-- テナント別設定（汎用KV。crm.followDays / crm.dormantDays など）
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id  INTEGER NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, key)
);
