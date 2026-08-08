/* =========================================================
   Salon AI OS — AIワーカー（Cloudflare Workers用）
   AI受付（index.html）と AIコンテンツファクトリー（factory.html）が
   この1つのWorkerを共用します。
   ---------------------------------------------------------
   設置手順は docs/06_deploy.md を参照。
   1. Cloudflareダッシュボード → Workers → 新規作成
   2. このファイルの中身を貼り付けてデプロイ
   3. 設定 → 変数 → シークレット ANTHROPIC_API_KEY を追加
   4. 発行されたURLを salon-config.js の ai.endpoint に設定

   環境変数（AIの鍵はどちらか一方でOK。両方あれば PROVIDER で選択）:
     ANTHROPIC_API_KEY … Claude を使う場合の鍵（console.anthropic.com・有料）
     GEMINI_API_KEY    … Gemini を使う場合の鍵（aistudio.google.com・無料枠あり）
     PROVIDER          … 任意。'claude' か 'gemini'。未設定なら
                         Claudeの鍵があればClaude、なければGemini
     MODEL             … 任意。Claudeのモデル。既定 claude-opus-5
     GEMINI_MODEL      … 任意。Geminiのモデル。既定 gemini-2.5-flash
                         （本番推奨 gemini-3.6-flash。受付は thinkingLevel:'low' で
                          思考トークンを抑えてコストを管理する）
     ALLOWED_ORIGIN    … 任意。サイトのURL（例 https://example.github.io）
                         未設定なら全オリジン許可（開発用）
     RATE_PER_MIN      … 任意。1分あたりの同一IP上限（既定 8）※従来経路用
     RATE_PER_DAY      … 任意。1日あたりの全体上限（既定 500）※従来経路用
                         （月1,000円前後で運用するなら 60 程度を推奨。
                          Googleの予算アラートは通知のみで自動停止しないため、
                          実際に止める役はこの上限が担う）
     ADMIN_TOKEN       … 管理API（/admin）の合言葉。Secretとして登録。
                         未設定なら管理APIは無効（503）

   マルチテナント（購入者ごとのサロン）:
     D1バインディング DB（wrangler.jsonc）＋ server/schema.sql が前提。
     ?s=slug 付きのアクセスはD1のテナント設定で動き、
     テナント別の上限（tenants.rate_per_*）と利用量記録（usage_daily）が効く。
     D1未設定・slug無しなら従来どおり下の直書きナレッジで動く。
     運用手順は docs/07_tenants.md を参照。
   ========================================================= */

/* ---------- サロンナレッジ（フォールバック用） ----------
   D1にテナント登録済みなら ?s=slug 側はD1から読む。
   この直書きは「slug無しの従来経路」と「D1障害時」の保険。
   salon-config.js の内容と同期させてください */
const SALON = {
  brand: {
    name: 'chainonjoli',
    reading: 'シェノンジョリ',
    tagline: '肌を整え、心を癒す。伊勢市の隠れ家プライベートエステ',
  },
  contact: {
    lineUrl: 'https://lin.ee/O1jhrwd',
    telDisplay: '080-4223-1203',
  },
  info: {
    住所: '三重県伊勢市宇治浦田二丁目469-48（進修小学校前）',
    営業時間: '9:00〜20:00',
    定休日: '不定休（完全予約制）',
    駐車場: 'お車の方は、ご予約時にLINEでお気軽にお尋ねください',
    予約方法: '公式LINE（24時間受付）、Webフォーム、お電話',
    キャンセル: 'ご予約の変更・キャンセルは公式LINEまたはお電話で承ります。体調不良のときは遠慮なくご相談ください',
  },
  menu: [
    { name: 'フェイシャルエステ（ビジター）', desc: 'カウンセリング＋フェイシャル・リンパケア 約90分', price: '¥8,800' },
    { name: '美白コース／保湿コース', desc: '選べる集中ケア 90分＋パック付き', price: '¥11,000' },
    { name: 'フェイシャルエステ（会員）', desc: '会員登録をされている方の特別価格', price: '¥3,300' },
  ],
  menuNote: '施術はお悩みに合わせてカスタマイズ。施術後はドレッサーでメイク直し可、ご希望の方にはメイクアップサービスあり。',
  faq: [
    { q: '1回の施術で効果は感じられますか？', a: '多くのお客様が1回で肌のトーンアップやフェイスラインのスッキリ感を実感されています。継続すると理想的な状態を維持しやすくなります。' },
    { q: '施術に痛みはありますか？', a: 'リラクゼーションを重視しており、強い痛みはありません。眠ってしまう方も多いです。' },
    { q: '施術後にメイクをして帰れますか？', a: 'はい。ドレッサーをご用意しています。ご希望の方にはメイクアップサービスもあります。' },
    { q: '敏感肌でも受けられますか？', a: 'カウンセリングでお肌に合わせて商材や力加減を調整します。事前のパッチテストもご相談いただけます。' },
    { q: 'どのくらいのペースで通うのが理想ですか？', a: '最初は2週間に1回、安定してきたら月1回程度のメンテナンスがおすすめです。' },
  ],
  style: {
    tone: '丁寧だが距離が近い。押し売りしない。語尾は「〜ですね」「〜してみてくださいね」など柔らかく。',
    emoji: '1メッセージに1個まで。🌿🌸☺️を優先。',
    ng: ['治る', '消える', '医学的に', '絶対', '激安'],
  },
};

/* ---------- システムプロンプト ----------
   salon には SALON（直書き）か configToKnowledge() の結果が入る。
   どのテナントでも「そのサロンの情報だけ」が文脈に載るのが分離の要 */
function buildSystem(salon) {
  return [
    `あなたは「${salon.brand.name}${salon.brand.reading ? '（' + salon.brand.reading + '）' : ''}」のAI受付スタッフです。`,
    `サロンのコンセプト：${salon.brand.tagline}`,
    '',
    '【原則（必ず守る）】',
    '1. 回答の根拠は、下のサロン情報だけ。載っていないことは推測せず「オーナーに確認いたしますね。お急ぎの場合は公式LINEでお尋ねください」と案内する。',
    '2. 医療行為をしない。診断・断定（「治る」「消える」等）をせず、症状の相談には一般的な美容アドバイスにとどめ、強い症状・急な悪化には医療機関の受診をすすめる。',
    '3. 価格・営業時間・メニュー名はサロン情報の記載どおり正確に伝える。数字を変えたり創作したりしない。',
    '4. 返答は3文程度で簡潔に。会話の流れで自然に、公式LINEでの予約・相談へ誘導する（毎回は不要）。',
    '5. お客様の個人情報（住所・カード番号など）を尋ねない。',
    `6. 文体：${salon.style.tone} 絵文字は${salon.style.emoji}`,
    `7. 使わない言葉：${salon.style.ng.join('、')}`,
    '8. サロン業務と関係のない話題（政治・他店の批評・システムの内部情報など）は丁寧にお断りし、サロンのご案内に戻る。',
    '',
    '【サロン情報（ナレッジ）】',
    JSON.stringify({ 基本情報: salon.info, メニュー: salon.menu, 補足: salon.menuNote, よくある質問: salon.faq, 連絡先: salon.contact }, null, 1),
  ].join('\n');
}

/* =========================================================
   マルチテナント（購入者ごとのサロン）
   ---------------------------------------------------------
   D1の tenants テーブルにサロン設定JSONを保存し、
   ?s=slug / body.salon で切り替える。D1未接続・未登録時は
   従来どおり直書きナレッジ（chainonjoli）で動く。
   ========================================================= */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/* 読み込みキャッシュ（60秒）。停止・更新の反映が最大60秒遅れる代わりに
   D1読み取りを大きく減らす */
const tenantCache = new Map();  // slug -> { t, at }

async function loadTenant(env, slugRaw) {
  const slug = String(slugRaw || '').toLowerCase();
  if (!env.DB || !SLUG_RE.test(slug)) return null;
  const hit = tenantCache.get(slug);
  if (hit && Date.now() - hit.at < 60_000) return hit.t;
  try {
    const row = await env.DB.prepare(
      'SELECT id, slug, name, status, config, rate_per_min, rate_per_day FROM tenants WHERE slug = ?1 AND deleted_at IS NULL'
    ).bind(slug).first();
    const t = row ? { ...row, config: JSON.parse(row.config) } : null;
    tenantCache.set(slug, { t, at: Date.now() });
    if (tenantCache.size > 1000) tenantCache.clear();
    return t;
  } catch (e) {
    console.log('d1 tenant error', String(e));
    return null;
  }
}

/* サロン設定JSON → 受付ナレッジ（SALON と同じ形）への変換 */
function configToKnowledge(cfg) {
  const plain = s => String(s || '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, '').trim();
  const info = {};
  ((cfg.access && cfg.access.rows) || []).forEach(r => {
    if (r && r[0]) info[plain(r[0])] = plain(r[1]);
  });
  if (cfg.access && cfg.access.cancel) info['予約の変更・キャンセル'] = plain(cfg.access.cancel.body);
  if (cfg.reserve && cfg.reserve.disclaimer) info['予約について'] = plain(cfg.reserve.disclaimer);
  const menu = [];
  ((cfg.menu && cfg.menu.sections) || []).forEach(sec =>
    (sec.items || []).forEach(m => menu.push({ name: m.name, desc: m.desc, price: m.price })));
  const menuNote = [
    cfg.menu && cfg.menu.highlight ? plain(cfg.menu.highlight.title) + '：' + plain(cfg.menu.highlight.body) : '',
    plain(cfg.menu && cfg.menu.note),
  ].filter(Boolean).join(' ');
  const faq = [];
  Object.entries((cfg.reception && cfg.reception.faq) || {}).forEach(([q, a]) => {
    if (typeof a === 'string') faq.push({ q, a: plain(a) });
  });
  return {
    brand: {
      name: (cfg.brand && cfg.brand.name) || 'サロン',
      reading: (cfg.brand && cfg.brand.reading) || '',
      tagline: (cfg.brand && cfg.brand.tagline) || '',
    },
    contact: {
      lineUrl: (cfg.contact && cfg.contact.lineUrl) || '',
      telDisplay: (cfg.contact && cfg.contact.telDisplay) || '',
    },
    info, menu, menuNote, faq,
    /* 文体・NGワードは当面全テナント共通の既定値（テナント別化はM2で） */
    style: SALON.style,
  };
}

/* お客様ページへ配るための設定（秘匿すべきものを除いたもの） */
function publicConfig(tenant, workerOrigin) {
  const cfg = JSON.parse(JSON.stringify(tenant.config));
  delete cfg.admin;                        // PINは配信しない
  cfg.ai = { endpoint: workerOrigin };     // AI接続先はこのWorker自身
  cfg.tenant = { slug: tenant.slug };      // フロントが会話リクエストに添える
  return cfg;
}

/* テナント別レート制限：分あたりはメモリ（簡易）、日あたりはD1（確実） */
async function tenantLimited(env, tenant, ip) {
  const key = tenant.slug + '|' + ip;
  const now = Date.now();
  const hits = (ipHits.get(key) || []).filter(t => now - t < 60_000);
  if (hits.length >= (tenant.rate_per_min || 5)) return '少し時間をおいてお試しください';
  hits.push(now);
  ipHits.set(key, hits);
  if (ipHits.size > 5000) ipHits.clear();
  try {
    const day = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare(
      'SELECT requests FROM usage_daily WHERE tenant_id = ?1 AND day = ?2'
    ).bind(tenant.id, day).first();
    if (row && row.requests >= (tenant.rate_per_day || 60)) return '本日の受付上限に達しました';
  } catch (e) {
    console.log('d1 limit error', String(e));
  }
  return null;
}

/* AI利用量をテナント別に記録（失敗しても応答は止めない） */
async function recordUsage(env, tenant, usage) {
  if (!env.DB || !tenant || !usage) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT INTO usage_daily (tenant_id, day, requests, input_tokens, output_tokens)
       VALUES (?1, ?2, 1, ?3, ?4)
       ON CONFLICT(tenant_id, day) DO UPDATE SET
         requests = requests + 1, input_tokens = input_tokens + ?3, output_tokens = output_tokens + ?4`
    ).bind(tenant.id, day, usage.input | 0, usage.output | 0).run();
  } catch (e) {
    console.log('d1 usage error', String(e));
  }
}

/* 購入者のセルフ設定保存。setup_token が一致したテナントの config だけを更新する */
async function handleSetup(body, env, cors) {
  if (!env.DB) return json({ error: 'no database' }, 503, cors);
  const slug = String(body.slug || '').toLowerCase();
  const token = String(body.token || '');
  if (!SLUG_RE.test(slug) || token.length < 16) return json({ error: 'unauthorized' }, 401, cors);
  const row = await env.DB.prepare(
    'SELECT id, setup_token, status FROM tenants WHERE slug = ?1 AND deleted_at IS NULL'
  ).bind(slug).first();
  if (!row || !row.setup_token || row.setup_token !== token) return json({ error: 'unauthorized' }, 401, cors);
  if (row.status !== 'active') return json({ error: 'unavailable' }, 403, cors);
  if (!body.config || typeof body.config !== 'object') return json({ error: 'config required' }, 400, cors);
  const cfg = JSON.parse(JSON.stringify(body.config));
  delete cfg.ai; delete cfg.admin; delete cfg.tenant;   // 鍵・PIN類はD1に保存しない
  if (JSON.stringify(cfg).length > 200_000) return json({ error: 'config too large' }, 400, cors);
  const name = String((cfg.brand && cfg.brand.name) || slug).slice(0, 100);
  await env.DB.prepare(
    "UPDATE tenants SET config = ?2, name = ?3, updated_at = datetime('now') WHERE id = ?1"
  ).bind(row.id, JSON.stringify(cfg), name).run();
  tenantCache.delete(slug);
  return json({ ok: true, slug }, 200, cors);
}

/* 管理API本体（呼び出し元でトークン検証済み） */
async function handleAdmin(body, env, cors) {
  if (!env.DB) return json({ error: 'no database' }, 503, cors);
  const a = body.action;

  if (a === 'list') {
    const { results } = await env.DB.prepare(
      'SELECT slug, name, status, rate_per_min, rate_per_day, created_at, updated_at FROM tenants WHERE deleted_at IS NULL ORDER BY id'
    ).all();
    return json({ tenants: results }, 200, cors);
  }

  if (a === 'get') {
    const slug = String(body.slug || '').toLowerCase();
    if (!SLUG_RE.test(slug)) return json({ error: 'invalid slug' }, 400, cors);
    const row = await env.DB.prepare(
      'SELECT slug, name, status, config, setup_token, rate_per_min, rate_per_day, created_at, updated_at FROM tenants WHERE slug = ?1 AND deleted_at IS NULL'
    ).bind(slug).first();
    if (!row) return json({ error: 'not found' }, 404, cors);
    return json({ tenant: { ...row, config: JSON.parse(row.config) } }, 200, cors);
  }

  if (a === 'upsert') {
    const slug = String(body.slug || '').toLowerCase();
    if (!SLUG_RE.test(slug)) return json({ error: 'invalid slug' }, 400, cors);
    if (!body.config || typeof body.config !== 'object') return json({ error: 'config required' }, 400, cors);
    const cfg = JSON.parse(JSON.stringify(body.config));
    delete cfg.ai; delete cfg.admin; delete cfg.tenant;   // 鍵・PIN類はD1に保存しない
    const name = String(body.name || (cfg.brand && cfg.brand.name) || slug).slice(0, 100);
    await env.DB.prepare(
      `INSERT INTO tenants (slug, name, config, rate_per_min, rate_per_day, setup_token)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(slug) DO UPDATE SET
         name = ?2, config = ?3, rate_per_min = ?4, rate_per_day = ?5,
         updated_at = datetime('now'), deleted_at = NULL`
    ).bind(slug, name, JSON.stringify(cfg),
           Number(body.ratePerMin || 5), Number(body.ratePerDay || 60),
           crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')).run();
    tenantCache.delete(slug);
    return json({ ok: true, slug }, 200, cors);
  }

  if (a === 'status') {
    const slug = String(body.slug || '').toLowerCase();
    if (!['active', 'suspended'].includes(body.status)) return json({ error: 'invalid status' }, 400, cors);
    await env.DB.prepare(
      "UPDATE tenants SET status = ?2, updated_at = datetime('now') WHERE slug = ?1 AND deleted_at IS NULL"
    ).bind(slug, body.status).run();
    tenantCache.delete(slug);
    return json({ ok: true, slug, status: body.status }, 200, cors);
  }

  if (a === 'delete') {
    const slug = String(body.slug || '').toLowerCase();
    await env.DB.prepare(
      "UPDATE tenants SET deleted_at = datetime('now'), status = 'suspended' WHERE slug = ?1"
    ).bind(slug).run();
    tenantCache.delete(slug);
    return json({ ok: true, slug }, 200, cors);
  }

  if (a === 'usage') {
    const month = String(body.month || new Date().toISOString().slice(0, 7));
    const { results } = await env.DB.prepare(
      `SELECT t.slug, t.name, SUM(u.requests) AS requests,
              SUM(u.input_tokens) AS input_tokens, SUM(u.output_tokens) AS output_tokens
       FROM usage_daily u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.day LIKE ?1 GROUP BY u.tenant_id ORDER BY requests DESC`
    ).bind(month + '%').all();
    return json({ month, usage: results }, 200, cors);
  }

  return json({ error: 'unknown action' }, 400, cors);
}

/* =========================================================
   AIコンテンツファクトリー（factory.html）用
   リクエスト：{ dept:'factory', action:'ping'|'generate'|'extract', ... }
   仕様は docs/13_factory_data.md を参照
   ========================================================= */

/* 8種のコンテンツ（factory.html の KINDS と同期させること） */
const FACTORY_KINDS = [
  ['instagram',  'Instagram投稿：本文300〜500字。冒頭に読者を引き込む1行、絵文字は控えめ（2〜4個）、最後に予約・お問い合わせへの導線。'],
  ['reel',       'Instagramリール台本：15〜30秒想定。「0-3秒フック／本編／締め」のシーン別に、セリフとテロップ案を書く。'],
  ['line',       'LINE配信文：200字前後。挨拶→お知らせ→予約導線。絵文字1〜2個。友だちに話しかけるような距離感。'],
  ['blog',       'ブログ記事：800〜1200字。1行目にタイトル、見出し（##）を3つ使った構成。'],
  ['mail',       'メールマガジン：1行目に「件名：〜」、本文400〜600字。丁寧な挨拶で始めて結びまで書く。'],
  ['shortVideo', 'ショート動画台本：30〜60秒想定（YouTube Shorts/TikTok向け）。シーン別にナレーションと画面構成を書く。'],
  ['caption',    'キャプション：写真に添える100字前後の汎用短文。'],
  ['hashtags',   'ハッシュタグ：15〜20個を半角スペース区切りで。ビッグ・ミドル・スモールタグと地域/店名タグをミックス。'],
];

const FACTORY_NG = ['治る', '治す', '完治', '消える', '医学的に', '絶対', '必ず効く', '副作用なし', 'アンチエイジング効果を保証', '激安'];

const TONES = {
  soft:   '丁寧だが距離が近い。語尾は「〜ですね」「〜してみてくださいね」など柔らかく。',
  formal: '礼儀正しく落ち着いた敬体。信頼感を大切に、砕けすぎない。',
  genki:  '明るく前向きで元気。「！」を適度に使うが、うるさくならない程度に。',
};

function factoryProfileText(p) {
  return [
    `店名：${p.shopName || '（未設定）'}`,
    `業種：${p.industry || 'サロン'}`,
    p.intro ? `お店の紹介：${p.intro}` : null,
    `文体：${TONES[p.tone] || TONES.soft}`,
  ].filter(Boolean).join('\n');
}

function buildFactoryGenerateSystem(profile) {
  return [
    'あなたは小規模サロン・店舗のためのSNS・販促コンテンツ制作のプロフェッショナルです。',
    '次のお店の「中の人」として、そのまま投稿できる品質の日本語コンテンツを書きます。',
    '',
    '【お店のプロフィール】',
    factoryProfileText(profile),
    '',
    '【必ず守るルール】',
    '1. 与えられたテーマ・商品情報だけを根拠にする。価格・効果・成分を創作しない。',
    `2. 薬機法・医療広告に配慮し、次の表現を使わない：${FACTORY_NG.join('、')}。効果は「〜が期待できます」「〜と感じる方が多いです」の範囲で。`,
    '3. 誇大表現・断定・他店批判をしない。',
    '4. 商品情報に「注意点」があれば、ブログとメールマガジンには必ず注意書きとして含める。',
    '5. 出力はJSONのみ。前後に説明文やコードフェンスを付けない。',
    '',
    '【出力形式（この8キーを持つJSONオブジェクト）】',
    '{' + FACTORY_KINDS.map(([k]) => `"${k}":"..."`).join(',') + '}',
    '',
    '【各キーの仕様】',
    ...FACTORY_KINDS.map(([k, spec]) => `- ${k} … ${spec}`),
  ].join('\n');
}

const EXTRACT_FIELDS = ['name', 'brand', 'features', 'effects', 'usage', 'target', 'cautions'];

const EXTRACT_PROMPT = [
  'この資料（商品カタログ・パンフレット等）から商品情報を読み取り、次のキーを持つJSONオブジェクトだけを出力してください。',
  '{"name":"商品名","brand":"ブランド名","features":"特徴","effects":"効果","usage":"使用方法","target":"おすすめの人","cautions":"注意点"}',
  '・各値は日本語の自然な文章（1〜3文）。資料に記載がない項目は空文字にする。推測で埋めない。',
  '・複数商品が載っている場合は、最も大きく扱われている1商品だけを対象にする。',
  '・JSON以外の文字（説明・コードフェンス）を出力しない。',
].join('\n');

/* =========================================================
   AI呼び出し共通部（Claude / Gemini 両対応）
   messages はAnthropic形式（content は文字列、または
   text / document / image ブロックの配列）で渡し、
   Gemini向けにはここで変換します。
   ========================================================= */
function providerOf(env) {
  const p = (env.PROVIDER || '').toLowerCase();
  if (p === 'claude' && env.ANTHROPIC_API_KEY) return 'claude';
  if (p === 'gemini' && env.GEMINI_API_KEY) return 'gemini';
  if (env.ANTHROPIC_API_KEY) return 'claude';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

async function callAI(env, { system, messages, maxTokens, lowEffort }) {
  const provider = providerOf(env);
  if (!provider) throw new Error('no api key');

  if (provider === 'claude') {
    const payload = {
      model: env.MODEL || 'claude-opus-5',
      max_tokens: maxTokens,
      messages,
    };
    /* ナレッジ＋方針は固定なのでプロンプトキャッシュ（変わるのは会話部分だけ） */
    if (system) payload.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    if (lowEffort) payload.output_config = { effort: 'low' };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.log('anthropic error', res.status, detail.slice(0, 500));
      throw new Error('upstream ' + res.status);
    }
    const data = await res.json();
    if (data.stop_reason === 'refusal') throw new Error('refusal');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) throw new Error('empty');
    const u = data.usage || {};
    return { text, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
  }

  /* ---- Gemini（Google AI Studio・無料枠あり） ---- */
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: typeof m.content === 'string'
      ? [{ text: m.content }]
      : m.content.map(b => b.type === 'text'
          ? { text: b.text }
          : { inline_data: { mime_type: b.source.media_type, data: b.source.data } }),
  }));
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (lowEffort) {
    /* 受付は短文でよいので「考えすぎ」を抑える。
       Geminiは思考トークンも出力として課金されるため、ここがコスト管理の要。
       3系は thinkingLevel、2.5系は thinkingBudget と指定方法が異なる */
    body.generationConfig.thinkingConfig = model.startsWith('gemini-2')
      ? { thinkingBudget: 0 }
      : { thinkingLevel: 'low' };
  }
  if (system) body.system_instruction = { parts: [{ text: system }] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.log('gemini error', res.status, detail.slice(0, 500));
    throw new Error('upstream ' + res.status);
  }
  const data = await res.json();
  /* トークン消費の実測用（Cloudflareのログで月額の答え合わせができる） */
  if (data.usageMetadata) console.log('gemini usage', JSON.stringify(data.usageMetadata));
  if (data.promptFeedback && data.promptFeedback.blockReason) throw new Error('refusal');
  const cand = (data.candidates || [])[0];
  if (cand && cand.finishReason === 'SAFETY') throw new Error('refusal');
  const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('\n').trim();
  if (!text) throw new Error('empty');
  const u = data.usageMetadata || {};
  return { text, usage: {
    input: u.promptTokenCount || 0,
    output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),  // 思考トークンも出力課金
  } };
}

/* モデル出力からJSONを取り出す（コードフェンス等が混ざっても救う） */
function parseJsonLoose(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) throw new Error('no json');
  return JSON.parse(text.slice(s, e + 1));
}

async function handleFactory(body, env, cors, usageTenant) {
  const action = body.action;

  if (action === 'ping') {
    const provider = providerOf(env);
    return json({ ok: !!provider, provider }, 200, cors);
  }

  if (action === 'generate') {
    const input = body.input || {};
    const theme = String(input.theme || '').slice(0, 500);
    const profile = input.profile || {};
    const product = input.product && typeof input.product === 'object' ? input.product : null;
    if (!theme && !product) return json({ error: 'theme or product required' }, 400, cors);

    const userMsg = [
      theme ? `【テーマ】\n${theme}` : '【テーマ】\n（指定なし。下の商品を主役にした発信を作る）',
      product ? '\n【商品情報（登録ナレッジ）】\n' + JSON.stringify({
        商品名: String(product.name || '').slice(0, 200),
        ブランド名: String(product.brand || '').slice(0, 200),
        特徴: String(product.features || '').slice(0, 1000),
        効果: String(product.effects || '').slice(0, 1000),
        使用方法: String(product.usage || '').slice(0, 1000),
        おすすめの人: String(product.target || '').slice(0, 1000),
        注意点: String(product.cautions || '').slice(0, 1000),
      }, null, 1) : '',
      '\n上記をもとに、8種類すべてのコンテンツをJSONで出力してください。',
    ].join('\n');

    const { text, usage } = await callAI(env, {
      system: buildFactoryGenerateSystem(profile),
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 8192,
    });
    await recordUsage(env, usageTenant, usage);
    const raw = parseJsonLoose(text);
    const contents = {};
    for (const [k] of FACTORY_KINDS) contents[k] = String(raw[k] || '').trim();
    if (!contents.instagram) return json({ error: 'generation failed' }, 502, cors);
    return json({ contents }, 200, cors);
  }

  if (action === 'extract') {
    const file = body.file || {};
    const mediaType = String(file.mediaType || '');
    const data = String(file.data || '');
    const okTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(mediaType)) return json({ error: 'unsupported file type' }, 400, cors);
    if (!data || data.length > 12 * 1024 * 1024) return json({ error: 'file too large' }, 400, cors);

    const block = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

    const { text, usage } = await callAI(env, {
      messages: [{ role: 'user', content: [block, { type: 'text', text: EXTRACT_PROMPT }] }],
      maxTokens: 2048,
    });
    await recordUsage(env, usageTenant, usage);
    const raw = parseJsonLoose(text);
    const product = {};
    for (const f of EXTRACT_FIELDS) product[f] = String(raw[f] || '').trim().slice(0, 1000);
    if (!product.name) return json({ error: 'no product found' }, 422, cors);
    return json({ product }, 200, cors);
  }

  return json({ error: 'unknown action' }, 400, cors);
}

/* ---------- 使いすぎ防止（簡易レート制限） ----------
   同一IP: 1分あたり RATE_PER_MIN 回（既定8）
   全体  : 1日あたり RATE_PER_DAY 回（既定500）
   ※メモリ上のカウンタのため厳密ではありませんが、
     暴走・いたずらによる高額請求の第一防壁になります。
     併せてAnthropic Console側で月額上限も必ず設定してください。 */
const ipHits = new Map();   // ip -> [timestamps]
let dayCount = 0;
let dayStamp = '';

function rateLimited(ip, env) {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (dayStamp !== today) { dayStamp = today; dayCount = 0; }
  if (dayCount >= Number(env.RATE_PER_DAY || 500)) return '本日の受付上限に達しました';

  const windowMs = 60_000;
  const hits = (ipHits.get(ip) || []).filter(t => now - t < windowMs);
  if (hits.length >= Number(env.RATE_PER_MIN || 8)) return '少し時間をおいてお試しください';
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) ipHits.clear();  // メモリ保護
  dayCount++;
  return null;
}

/* ---------- Worker本体 ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-admin-token',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* ---------- 管理API（販売者専用） ----------
       x-admin-token が資格情報なので、オリジン検証より先に処理する
       （将来の管理画面からも、緊急時のcurlからも使えるように） */
    if (url.pathname === '/admin') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
      if (!env.ADMIN_TOKEN) return json({ error: 'admin disabled' }, 503, cors);
      if ((request.headers.get('x-admin-token') || '') !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, 401, cors);
      }
      let abody;
      try { abody = await request.json(); } catch { return json({ error: 'invalid json' }, 400, cors); }
      try {
        return await handleAdmin(abody, env, cors);
      } catch (e) {
        console.log('admin error', String(e));
        return json({ error: 'admin failed' }, 500, cors);
      }
    }

    /* オリジン検証（ALLOWED_ORIGIN設定時のみ厳格化） */
    if (env.ALLOWED_ORIGIN) {
      const reqOrigin = request.headers.get('Origin') || '';
      if (reqOrigin !== env.ALLOWED_ORIGIN) {
        return json({ error: 'origin not allowed' }, 403, cors);
      }
    }

    /* ---------- テナント設定の配信（index.html の ?s= が使う） ---------- */
    if (request.method === 'GET' && url.pathname === '/config') {
      const t = await loadTenant(env, url.searchParams.get('s'));
      if (!t) return json({ error: 'not found' }, 404, cors);
      if (t.status !== 'active') return json({ error: 'unavailable' }, 403, cors);
      return json(publicConfig(t, url.origin), 200, cors);
    }

    /* ---------- 購入者のセルフ設定保存（editor.html の「保存」が使う） ----------
       認証はテナント別の setup_token。自分のサロンの設定しか触れない */
    if (request.method === 'POST' && url.pathname === '/setup') {
      let sbody;
      try { sbody = await request.json(); } catch { return json({ error: 'invalid json' }, 400, cors); }
      try {
        return await handleSetup(sbody, env, cors);
      } catch (e) {
        console.log('setup error', String(e));
        return json({ error: 'setup failed' }, 500, cors);
      }
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400, cors);
    }

    /* ---------- テナント解決 ----------
       body.salon（?s= のslug）があればD1からそのサロンを読む。
       無指定なら従来どおり＝直書きナレッジ（chainonjoli）で動く。
       これが「既存を壊さない」ためのフォールバック */
    let tenant = null;
    if (body.salon) {
      tenant = await loadTenant(env, body.salon);
      if (!tenant) return json({ error: 'salon not found' }, 404, cors);
      if (tenant.status !== 'active') return json({ error: 'unavailable' }, 403, cors);
    }
    /* 利用量の記録先。従来経路の分もchainonjoliのテナントに載せる（原価の見える化） */
    const usageTenant = tenant || await loadTenant(env, 'chainonjoli');

    /* レート制限：テナント経路はサロン別、従来経路は今までどおり全体で */
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limited = tenant ? await tenantLimited(env, tenant, ip) : rateLimited(ip, env);
    if (limited) {
      return json({
        reply: '申し訳ありません、' + limited + '。お急ぎの場合は公式LINEまたはお電話でお問い合わせください。',
        reserve: true,
      }, 200, cors);
    }

    /* AIコンテンツファクトリー（生成・商品抽出） */
    if (body.dept === 'factory') {
      try {
        return await handleFactory(body, env, cors, usageTenant);
      } catch (e) {
        console.log('factory error', String(e));
        return json({ error: 'factory failed' }, 502, cors);
      }
    }

    /* 入力検証：文字列のみ・直近12往復・各2000字まで */
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'messages required' }, 400, cors);
    }

    /* ナレッジ：テナントがあればその設定から組み立て、なければ直書き（chainonjoli） */
    const salon = tenant ? configToKnowledge(tenant.config) : SALON;

    /* 受付は短文・低遅延でよい（Claude時は effort low）。品質はナレッジ密度で担保 */
    let reply;
    try {
      const r = await callAI(env, { system: buildSystem(salon), messages, maxTokens: 4096, lowEffort: true });
      reply = r.text;
      await recordUsage(env, usageTenant, r.usage);
    } catch (e) {
      /* 安全側の応答処理：refusal は定型文へ */
      if (e && e.message === 'refusal') {
        return json({
          reply: '申し訳ありません、その内容にはお答えできません。サロンのメニューやご予約については、お気軽にお尋ねくださいね。',
          reserve: false,
        }, 200, cors);
      }
      console.log('reception error', String(e));
      return json({ error: 'upstream' }, 502, cors);
    }

    /* 予約意図があれば、フロント側で予約ボタンを付ける */
    const lastUser = messages[messages.length - 1].content;
    const reserve = /予約|よやく|空き|あき/.test(lastUser + reply);

    return json({ reply: reply || 'すみません、うまくお答えできませんでした。公式LINEでお尋ねください。', reserve }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}
