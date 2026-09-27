# BGM（やわらかいピアノ風コード＋ビート）と効果音を合成して bgm.wav を書き出す
import numpy as np, wave
SR=44100; DUR=22.0; BPM=100; beat=60/BPM
t_all=np.arange(int(SR*DUR))/SR; mix=np.zeros_like(t_all)
def add(sig,at,gain=1.0):
    i=int(at*SR); n=min(len(sig),len(mix)-i)
    if n>0: mix[i:i+n]+=sig[:n]*gain
def note(f,d,decay=2.5):
    t=np.arange(int(SR*d))/SR; env=np.exp(-t*decay)*np.minimum(1,t*80)
    return env*(np.sin(2*np.pi*f*t)+.35*np.sin(4*np.pi*f*t)+.12*np.sin(6*np.pi*f*t))
mf=lambda m:440*2**((m-69)/12)
prog=[[57,60,64,69],[53,57,60,65],[48,52,55,60],[55,59,62,67]]  # Am F C G（くすみ系の切なさ）
bar=beat*4; nb=int(DUR/bar)+1
for b in range(nb):
    ch=prog[b%4]; at=b*bar
    add(note(mf(ch[0]-12),bar,1.2),at,.35)
    for k,m in enumerate([ch[1],ch[2],ch[3],ch[2],ch[1]+12,ch[3],ch[2],ch[3]]):  # アルペジオ
        add(note(mf(m+12),beat,3.5),at+k*beat/2,.12)
def kick():
    t=np.arange(int(SR*.25))/SR; f=120*np.exp(-t*18)+45
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*14)
def hat():
    t=np.arange(int(SR*.05))/SR; return np.random.randn(len(t))*np.exp(-t*90)
np.random.seed(1)
nbeats=int(DUR/beat)
for k in range(nbeats):
    at=k*beat
    if at<1.6: continue
    if k%2==0: add(kick(),at,.5)
    add(hat(),at+beat/2,.06)
def whoosh(d=.45):
    n=int(SR*d); t=np.arange(n)/SR; x=np.random.randn(n); y=np.zeros(n); a=0
    cut=.02+.25*np.sin(np.pi*t/d)
    for i in range(n): a+=cut[i]*(x[i]-a); y[i]=a
    return y*np.sin(np.pi*t/d)*2.5
def chime(f=1760,d=1.2):
    t=np.arange(int(SR*d))/SR; return np.exp(-t*4)*(np.sin(2*np.pi*f*t)+.5*np.sin(2*np.pi*f*2.01*t))
def pop(f=900):
    t=np.arange(int(SR*.09))/SR; return np.sin(2*np.pi*(f+f*np.exp(-t*40))*t)*np.exp(-t*45)
for at in [3.0,7.2,11.2,15.4,18.6]: add(whoosh(),at,.35)
for i in range(5): add(pop(700+i*90),3.6+i*.28,.25)          # 部署カード
for i in range(5): add(pop(1000+i*80),8.0+i*.18,.2)           # ナレッジ→AI
for i in range(8): add(pop(800+i*60),12.3+i*.14,.18)          # 8種カード
for at in [.6,1.2,1.8]: add(pop(1400),15.6+at,.3)             # タップ
add(chime(1318),17.8,.25); add(chime(1760),18.9,.3); add(chime(2217),19.2,.2)
add(chime(880,2.5),.2,.2)
fade=np.minimum(1,np.minimum(t_all/.4,(DUR-t_all)/1.5)); mix*=fade
mix=np.tanh(mix*1.2); mix/=np.abs(mix).max()/.85
pcm=(np.repeat(mix[:,None],2,1)*32767).astype(np.int16)
w=wave.open('bgm.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
