/* 招牌贴图根因探针：直接把 animeSignTex / stallSignTexV 的画布贴到页面上截图 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(),"Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const SITE = process.argv[2] || 'http://127.0.0.1:8811/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args:['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const p = await (await b.newContext({viewport:{width:1100,height:700}, deviceScaleFactor:1})).newPage();
  p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
  await p.goto(SITE, { waitUntil:'load', timeout:120000 });
  await p.waitForFunction(() => window.XM && window.__PROBE, { timeout:120000 });
  await p.waitForTimeout(6000);
  await p.evaluate(() => {
    const HK='"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    const mk=(w,h,cn,en,mode)=>{
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d');
      x.fillStyle='#0f1e36';x.fillRect(0,0,w,h);
      x.textAlign='center';
      if(mode==='h'){
        x.fillStyle='#fff4dc';x.font='700 '+Math.round(h*.36)+'px '+HK;
        x.fillText(cn,w/2,Math.round(h*.49));
        x.fillStyle='#a8d8ff';x.font='600 '+Math.max(11,Math.round(h*.165))+'px '+HK;
        x.fillText(en,w/2,Math.round(h*.80));
      }else{
        x.fillStyle='#fff4dc';x.font='700 50px '+HK;
        cn.split('').forEach((t,i)=>x.fillText(t,128,86+i*58));
        x.fillStyle='#a8d8ff';x.font='600 16px '+HK;
        x.fillText(en,128,388);
      }
      c.style.cssText='position:fixed;left:10px;top:10px;z-index:99999;border:2px solid #0f0;image-rendering:pixelated';
      document.body.appendChild(c);
      return c;
    };
    mk(512,96,'姜饼甜品屋','GINGERBREAD','h');
    const v=mk(256,420,'热红酒','MULLED WINE','v');
    v.style.left='540px';
    // 同一段字，用不同字号再画一次做对照
    const c2=document.createElement('canvas');c2.width=512;c2.height=96;
    const x2=c2.getContext('2d');
    x2.fillStyle='#0f1e36';x2.fillRect(0,0,512,96);
    x2.textAlign='center';x2.fillStyle='#fff4dc';
    x2.font='700 34px '+HK;x2.fillText('姜饼甜品屋',256,47);
    x2.fillStyle='#a8d8ff';x2.font='600 16px '+HK;x2.fillText('GINGERBREAD',256,77);
    c2.style.cssText='position:fixed;left:810px;top:10px;z-index:99999;border:2px solid #f0f';
    document.body.appendChild(c2);
    // 字体可用性
    const meas=(f)=>{const t=document.createElement('canvas').getContext('2d');t.font='34px '+f;return t.measureText('姜饼甜品屋').width;};
    window.__fw={ping:meas('"PingFang SC"'),sans:meas('sans-serif'),hei:meas('"Hiragino Sans GB"'),
      dpr:window.devicePixelRatio, ua:navigator.userAgent};
  });
  console.log(JSON.stringify(await p.evaluate(()=>window.__fw)));
  await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/signtex_probe.png' });
  console.log('saved');
  await b.close();
})();
