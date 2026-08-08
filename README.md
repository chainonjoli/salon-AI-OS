# Salon AI OS

**「AIスタッフが24時間働くサロン」を、個人サロンの誰もが導入できるプラットフォームにする。**

ホームページ制作ツールではありません。受付・カウンセラー・広報・秘書・教育担当という
5つの「AI部署」が、サロン固有のナレッジを共有して働く——そのためのOSです。

## このディレクトリの構成

公開ページ（GitHub Pages）:

- **お客様ページ**: https://chainonjoli.github.io/salon-AI-OS/
- **オーナー管理画面**: https://chainonjoli.github.io/salon-AI-OS/admin.html （簡易PIN付き）
- **設定エディタ**: https://chainonjoli.github.io/salon-AI-OS/editor.html
- **AIコンテンツファクトリー**: https://chainonjoli.github.io/salon-AI-OS/factory.html

| ファイル | 内容 |
|---|---|
| [`index.html`](./index.html) | **お客様ページ**（公開用。管理画面へのリンクなし） |
| [`admin.html`](./admin.html) | **オーナー管理画面**（簡易PINゲート付き） |
| [`salon-config.js`](./salon-config.js) | **サロン設定ファイル（ナレッジ）**。現在は chainonjoli（伊勢市）の実データ |
| [`salon-config.template.js`](./salon-config.template.js) | 新規サロン用の空テンプレート（コメント付き） |
| [`editor.html`](./editor.html) | **設定エディタ**。フォーム編集→ライブプレビュー→`salon-config.js`書き出し |
| [`factory.html`](./factory.html) | **AIコンテンツファクトリー**。テーマ1つでSNS・販促コンテンツ8種を一括生成（AI広報の実装） |
| [`server/worker.js`](./server/worker.js) | **AIワーカー**（Cloudflare Workers用）。AI受付とコンテンツファクトリーが共用。設置すると本物のAIに |
| [`docs/06_deploy.md`](./docs/06_deploy.md) | AI接続の設置手順（約30分・コピペのみ） |
| [`docs/01_screen_flow.md`](./docs/01_screen_flow.md) | 画面遷移図（お客様側／オーナー側） |
| [`docs/02_system_architecture.md`](./docs/02_system_architecture.md) | システム構成図・SaaS化を見据えたアーキテクチャ |
| [`docs/03_database_design.md`](./docs/03_database_design.md) | データベース設計（ER図＋テーブル定義） |
| [`docs/04_ai_knowledge.md`](./docs/04_ai_knowledge.md) | AIナレッジ構造（本システム最大の特徴） |
| [`docs/05_roadmap.md`](./docs/05_roadmap.md) | Phase計画・今後追加すべき機能一覧 |
| [`docs/10_factory_requirements.md`](./docs/10_factory_requirements.md) | コンテンツファクトリー：要件定義 |
| [`docs/11_factory_features.md`](./docs/11_factory_features.md) | コンテンツファクトリー：機能一覧 |
| [`docs/12_factory_ui.md`](./docs/12_factory_ui.md) | コンテンツファクトリー：画面設計 |
| [`docs/13_factory_data.md`](./docs/13_factory_data.md) | コンテンツファクトリー：データ設計・API仕様 |
| [`docs/14_factory_test.md`](./docs/14_factory_test.md) | コンテンツファクトリー：テスト・デバッグ記録 |

> ⚠️ **管理画面のPINについて**：`salon-config.js` の `admin.pin` は公開リポジトリ上で誰でも読めます。
> これは「通りすがりの覗き見を防ぐ」簡易ロックであり、本物の認証ではありません。
> **実在のお客様情報を管理画面に入れないでください**（現在の表示はすべて架空のサンプル）。
> 本格的なログイン認証はPhase 2でサーバー側に実装します。

プロトタイプはブラウザで `index.html` を開くだけで動きます（サーバー不要）。
スマホで開けばそのまま実機の操作感、PCで開けばスマホフレーム内で表示されます。

## カスタマイズ方法（新しいサロンを作る）

コード（`index.html`）は一切編集しません。**設定ファイル1枚がサロンの全てです。**

**方法A：設定エディタ（推奨・コード編集ゼロ）**

1. `editor.html` を開く
2. フォームを埋める — 右のプレビューに即反映されます（編集中の内容はブラウザに自動保存）
3. 「書き出し」→ `salon-config.js` をダウンロードし、`index.html` と同じフォルダに置き換える

**方法B：ファイルを直接編集**

1. `salon-config.template.js` を複製し、`salon-config.js` として保存
2. 「◯◯」の箇所をサロンの言葉で埋める（サロン名・色・連絡先・メニュー・FAQ・カウンセラー知識・投稿サンプル・研修クイズ）
3. `index.html` を開けば、そのサロンとして動く

これが本システムの**ナレッジ・ファースト**設計の縮図です。テンプレート販売＝この設定ファイルを書いて納品すること。Phase 1 の管理画面実装は「このファイルをフォームで編集するUI」として、この構造の上にそのまま載ります。

## プロダクトの核となる考え方

### 1. AIは「チャットボット」ではなく「部署」

| 部署 | 相手 | 仕事 |
|---|---|---|
| 🛎 AI受付 | お客様 | 営業時間・料金・アクセス・FAQ・予約導線への案内（24時間） |
| 🌸 AIカウンセラー | お客様 | 悩みのヒアリング → 施術・商品・生活習慣の提案 → LINE/予約へ |
| 📣 AI広報 | オーナー | Instagram/Threads/LINE/ブログ/Googleの投稿作成・分析・カレンダー |
| 🗂 AI秘書 | オーナー | 顧客カルテ・来店周期の見守り・フォローLINEの下書き |
| 🎓 AI教育担当 | スタッフ | マニュアル・研修・理解度チェック |

### 2. ナレッジ・ファースト（Single Source of Truth）

AIは毎回ゼロから考えません。サロンのコンセプト・文体・メニュー・価格・FAQ・ルールを
**一つのナレッジベース**に集約し、5つのAIすべてがそこを参照します。
オーナーが1か所を更新すれば、受付の回答もSNS投稿の文体も同時に変わります。
詳細は [`docs/04_ai_knowledge.md`](./docs/04_ai_knowledge.md)。

### 3. 40〜60代オーナーが迷わないUI

- 白基調＋くすみカラー、余白広め、スマホファースト
- 主要操作は**3タップ以内**（例：ホーム → 広報 → 投稿をつくる）
- 専門用語を出さない。「プロンプト」ではなく「サロンの言葉で書いてください」
- AIからの提案は必ず**下書き＋承認ボタン**。勝手に送信しない

### 4. 医療広告・薬機法への配慮（AIカウンセラー）

- 「診断」ではなく「美容上の一般的なアドバイス」と明示
- 症状の断定・治療効果の保証をしない回答テンプレート
- 医療機関の受診を促す定型文を結果画面に常設
- NGワード（ナレッジで管理）を生成時に必ずチェック

### 5. テンプレート販売・SaaS化を前提とした設計思想

- **サロン固有の情報はすべてナレッジに externalize** する。コード側にサロン名・価格・文体を
  一切ハードコードしなければ、「ナレッジを差し替えるだけで別サロンになる」＝テンプレート販売が成立する
- 業種プリセット（エステ／美容室／ネイル／アイラッシュ／整体／リラクゼーション）は
  「ナレッジの初期値セット＋カウンセラーの質問セット」として提供する
- マルチテナント（1システムでN店舗）を最初からデータ設計に織り込む（`tenant_id`）
- 詳細は [`docs/02_system_architecture.md`](./docs/02_system_architecture.md)

## 開発Phase（MVPファースト）

| Phase | 内容 | 状態 |
|---|---|---|
| **Phase 1** | AI受付／AI美容相談／FAQ／予約導線／LINE導線／管理画面 | ✅ **AI受付は本番稼働中（2026-08-08〜）**。Gemini（gemini-3.6-flash）＋Cloudflare Worker（Git連携・`wrangler.jsonc`）で接続し、`check.html` の受け入れ検査に合格。管理画面の「保存」実装のみ残 |
| **Phase 2** | カルテ／SNS投稿生成／商品管理／分析 | 🚧 **SNS投稿生成＋商品管理は AIコンテンツファクトリー（`factory.html`）として実装済み**。テーマ1つで8種のコンテンツを一括生成、商品はPDF・写真からAI取り込み可。AI未接続でもお試しモードで動作 |
| **Phase 3** | 予約システム／決済／EC／外部API連携 | 設計のみ（docs/05） |
