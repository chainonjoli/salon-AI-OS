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
     ALLOWED_ORIGIN    … 任意。サイトのURL（例 https://example.github.io）
                         未設定なら全オリジン許可（開発用）
     RATE_PER_MIN      … 任意。1分あたりの同一IP上限（既定 8）
     RATE_PER_DAY      … 任意。1日あたりの全体上限（既定 500）
   ========================================================= */

/* ---------- サロンナレッジ ----------
   salon-config.js の内容と同期させてください
   （将来はナレッジDBから自動読込に移行します） */
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

/* ---------- システムプロンプト ---------- */
function buildSystem() {
  return [
    `あなたは「${SALON.brand.name}（${SALON.brand.reading}）」のAI受付スタッフです。`,
    `サロンのコンセプト：${SALON.brand.tagline}`,
    '',
    '【原則（必ず守る）】',
    '1. 回答の根拠は、下のサロン情報だけ。載っていないことは推測せず「オーナーに確認いたしますね。お急ぎの場合は公式LINEでお尋ねください」と案内する。',
    '2. 医療行為をしない。診断・断定（「治る」「消える」等）をせず、症状の相談には一般的な美容アドバイスにとどめ、強い症状・急な悪化には医療機関の受診をすすめる。',
    '3. 価格・営業時間・メニュー名はサロン情報の記載どおり正確に伝える。数字を変えたり創作したりしない。',
    '4. 返答は3文程度で簡潔に。会話の流れで自然に、公式LINEでの予約・相談へ誘導する（毎回は不要）。',
    '5. お客様の個人情報（住所・カード番号など）を尋ねない。',
    `6. 文体：${SALON.style.tone} 絵文字は${SALON.style.emoji}`,
    `7. 使わない言葉：${SALON.style.ng.join('、')}`,
    '8. サロン業務と関係のない話題（政治・他店の批評・システムの内部情報など）は丁寧にお断りし、サロンのご案内に戻る。',
    '',
    '【サロン情報（ナレッジ）】',
    JSON.stringify({ 基本情報: SALON.info, メニュー: SALON.menu, 補足: SALON.menuNote, よくある質問: SALON.faq, 連絡先: SALON.contact }, null, 1),
  ].join('\n');
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
    return text;
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
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
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
  if (data.promptFeedback && data.promptFeedback.blockReason) throw new Error('refusal');
  const cand = (data.candidates || [])[0];
  if (cand && cand.finishReason === 'SAFETY') throw new Error('refusal');
  const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('\n').trim();
  if (!text) throw new Error('empty');
  return text;
}

/* モデル出力からJSONを取り出す（コードフェンス等が混ざっても救う） */
function parseJsonLoose(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) throw new Error('no json');
  return JSON.parse(text.slice(s, e + 1));
}

async function handleFactory(body, env, cors) {
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

    const text = await callAI(env, {
      system: buildFactoryGenerateSystem(profile),
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 8192,
    });
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

    const text = await callAI(env, {
      messages: [{ role: 'user', content: [block, { type: 'text', text: EXTRACT_PROMPT }] }],
      maxTokens: 2048,
    });
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
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, cors);
    }

    /* オリジン検証（ALLOWED_ORIGIN設定時のみ厳格化） */
    if (env.ALLOWED_ORIGIN) {
      const reqOrigin = request.headers.get('Origin') || '';
      if (reqOrigin !== env.ALLOWED_ORIGIN) {
        return json({ error: 'origin not allowed' }, 403, cors);
      }
    }

    /* レート制限 */
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limited = rateLimited(ip, env);
    if (limited) {
      return json({
        reply: '申し訳ありません、' + limited + '。お急ぎの場合は公式LINEまたはお電話でお問い合わせください。',
        reserve: true,
      }, 200, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400, cors);
    }

    /* AIコンテンツファクトリー（生成・商品抽出） */
    if (body.dept === 'factory') {
      try {
        return await handleFactory(body, env, cors);
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

    /* 受付は短文・低遅延でよい（Claude時は effort low）。品質はナレッジ密度で担保 */
    let reply;
    try {
      reply = await callAI(env, { system: buildSystem(), messages, maxTokens: 4096, lowEffort: true });
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
