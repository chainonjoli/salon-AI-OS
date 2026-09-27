# 告知動画（promo）

- `salon-ai-os-promo.mp4` — 縦型 1080×1920・22秒・BGM/効果音つき（X・Instagramリール・Threads向け）
- `sns-post.md` — そのまま貼れる紹介文（X／Instagram・Threads／LINE）

## 構成（22秒）

| 秒 | シーン |
|---|---|
| 0–3 | 個人サロンに、AIスタッフを。 |
| 3–7 | 5つのAI部署（受付・カウンセラー・広報・秘書・教育担当） |
| 7–11 | ナレッジ・ファースト：設定ファイル1枚 → 5つのAI |
| 11–16 | コンテンツファクトリー：テーマ1つで8種を一括生成 |
| 16–19 | 主要操作は3タップ以内 |
| 19–22 | ロゴ＋URL |

## 作り直し方

文言は `scene.html`、音は `music.py` を編集して：

```bash
pip install numpy imageio-ffmpeg
npm i -g playwright            # Chromium が入っている環境で
python3 music.py               # → bgm.wav
NODE_PATH=$(npm root -g) node capture.cjs frames   # → frames/f0000.png …（660枚）
FF=$(python3 -c "import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())")
$FF -y -framerate 30 -i frames/f%04d.png -i bgm.wav -c:v libx264 -pix_fmt yuv420p -crf 20 \
    -movflags +faststart -c:a aac -b:a 160k -shortest salon-ai-os-promo.mp4
```

BGM・効果音はすべて `music.py` でプログラム合成しているため、著作権の心配はありません。
