/* =========================================================
   Salon AI OS — AI受付ワーカー（Cloudflare Workers用）
   ---------------------------------------------------------
   設置手順は docs/06_deploy.md を参照。
   1. Cloudflareダッシュボード → Workers → 新規作成
   2. このファイルの中身を貼り付けてデプロイ
   3. 設定 → 変数 → シークレット ANTHROPIC_API_KEY を追加
   4. 発行されたURLを salon-config.js の ai.endpoint に設定

   環境変数:
     ANTHROPIC_API_KEY … 必須。Anthropic ConsoleのAPIキー
     MODEL             … 任意。既定 claude-opus-5
     ALLOWED_ORIGIN    … 任意。サイトのURL（例 https://example.github.io）
                         未設定なら全オリジン許可（開発用）
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

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400, cors);
    }

    /* 入力検証：文字列のみ・直近12往復・各2000字まで */
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'messages required' }, 400, cors);
    }

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.MODEL || 'claude-opus-5',
        max_tokens: 4096,
        /* 受付は短文・低遅延でよいので effort low。品質はナレッジ密度で担保 */
        output_config: { effort: 'low' },
        /* ナレッジ＋方針は固定なのでプロンプトキャッシュ（変わるのは会話部分だけ） */
        system: [
          { type: 'text', text: buildSystem(), cache_control: { type: 'ephemeral' } },
        ],
        messages,
      }),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      console.log('anthropic error', apiRes.status, detail.slice(0, 500));
      return json({ error: 'upstream', status: apiRes.status }, 502, cors);
    }

    const data = await apiRes.json();

    /* 安全側の応答処理：refusal は定型文へ */
    if (data.stop_reason === 'refusal') {
      return json({
        reply: '申し訳ありません、その内容にはお答えできません。サロンのメニューやご予約については、お気軽にお尋ねくださいね。',
        reserve: false,
      }, 200, cors);
    }

    const reply = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

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
