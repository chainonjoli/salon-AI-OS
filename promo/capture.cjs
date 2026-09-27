// scene.html を1フレームずつ描画してPNG連番に書き出す
const { chromium } = require('playwright');
const { mkdirSync } = require('fs');
const path = require('path');
const out = process.argv[2] || 'frames', FPS = 30, DUR = 22;
(async () => {
  mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'scene.html'));
  await p.evaluate(() => document.fonts.ready);
  const from = +(process.argv[3] || 0), to = +(process.argv[4] || FPS * DUR);
  for (let f = from; f < to; f++) {
    await p.evaluate(t => render(t), f / FPS);
    await p.screenshot({ path: `${out}/f${String(f).padStart(4, '0')}.png` });
  }
  await b.close();
})();
