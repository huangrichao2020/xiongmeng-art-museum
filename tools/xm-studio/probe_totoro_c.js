/* 龙猫 C 位量化：固定机位 → 投影定位龙猫/邻居/背景 → 量中位灰阶、过曝、峰值 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
const TAG = process.argv[3] || 'x';
const PX = 26.5, PZ = -2.0;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(8000);
  // 用官方机位（导演机位会在 render 前覆写相机，手动设 camera 会被冲掉）
  await p.evaluate(() => window.XM.shot('anime-plaza'));
  await p.waitForTimeout(4000);
  const png = `/tmp/tot_${TAG}.png`;
  await p.screenshot({ path: png });
  // 取样点用世界坐标投影，位置固定可复现
  const pts = await p.evaluate((cfg) => {
    const P = window.__PROBE, V = window.__THREE.Vector3;
    const cam = P.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const w = innerWidth, h = innerHeight;
    const proj = (x, y, z) => {
      const v = new V(x, y, z).project(cam);
      return [Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)];
    };
    return {
      totoro: proj(cfg.PX, 2.4, cfg.PZ),
      doraemon: proj(cfg.PX - 5.5, 2.4, cfg.PZ - 4.2),
      pikachu: proj(cfg.PX + 5.5, 2.4, cfg.PZ - 4.2),
      minion: proj(cfg.PX, 2.2, cfg.PZ - 6.8),
      bg: proj(cfg.PX, 14, cfg.PZ - 46)
    };
  }, { PX, PZ });
  console.log(TAG, '投影点:', JSON.stringify(pts));
  const { execSync } = require('child_process');
  const py = `
from PIL import Image
import statistics, json
img=Image.open('${png}').convert('RGB')
pts=json.loads(r'''${JSON.stringify(pts)}''')
def stat(name,pt,r=26):
    x,y=pt
    if x-r<0 or y-r<0 or x+r>img.width or y+r>img.height:
        print('%-9s 越界 %s'%(name,pt)); return
    px=list(img.crop((x-r,y-r,x+r,y+r)).convert('L').getdata())
    over=sum(1 for v in px if v>=250)/len(px)*100
    print('%-9s 中位 %6.1f  均值 %6.1f  峰值 %3d  过曝 %5.2f%%'%(name,statistics.median(px),sum(px)/len(px),max(px),over))
for k in ['totoro','doraemon','pikachu','minion','bg']:
    stat(k,pts[k])
`;
  require('fs').writeFileSync('/tmp/tot_stat.py', py);
  try { execSync('/usr/bin/python3 /tmp/tot_stat.py', { stdio: 'inherit' }); }
  catch (e) { console.log('stat failed:', String(e).slice(0, 300)); }
  await b.close();
})();
