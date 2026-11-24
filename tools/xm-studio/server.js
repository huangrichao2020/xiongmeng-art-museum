#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   XM STUDIO · 本地取景录制服务
   ──────────────────────────────────────────────────────────────────────
   给外部 AI 用的极简 HTTP 接口。一次调用就出一段成片素材：

     GET  /shots                     列出所有机位
     GET  /health                    服务状态
     POST /shot    {id}               切机位（不录）
     POST /record {shot,duration}    录一段，返回文件路径

   例：
     curl -s localhost:8789/shots
     curl -s -XPOST localhost:8789/record -d '{"shot":"coaster-chase","duration":8}'
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PORT = +(process.env.XM_PORT || 8789);
const SITE = process.env.XM_SITE || 'https://preview.ai10088.com/alex-garage/';
const OUTDIR = process.env.XM_OUT || path.join(os.homedir(), 'Desktop', 'xm-shots');
const EXE = process.env.XM_CHROME || path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
);
const VW = +(process.env.XM_WIDTH || 1280);
const VH = +(process.env.XM_HEIGHT || 720);

let browser = null, page = null, booting = null;

async function ensurePage() {
  if (page && !page.isClosed()) return page;
  if (booting) return booting;
  booting = (async () => {
    if (!fs.existsSync(EXE)) throw new Error('chromium not found: ' + EXE);
    browser = await chromium.launch({
      executablePath: EXE,
      args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
    });
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => console.error('[pageerror]', String(e).slice(0, 200)));
    await pg.goto(SITE, { waitUntil: 'load', timeout: 90000 });
    await pg.waitForFunction(() => window.XM && window.XM.version, { timeout: 90000 });
    await pg.waitForTimeout(2500);
    page = pg;
    booting = null;
    return pg;
  })();
  return booting;
}

async function apiShot(id) {
  const p = await ensurePage();
  return p.evaluate(i => window.XM.shot(i), id);
}
async function apiShots() {
  const p = await ensurePage();
  return p.evaluate(() => window.XM.shots());
}
async function apiRecord(opts) {
  const p = await ensurePage();
  /* saturation 只作用于成品层（ffmpeg），不往页面里塞，
     避免页面渲染层提一次、成品层又提一次导致颜色过艳。 */
  const pageOpts = Object.assign({}, opts);
  delete pageOpts.saturation;
  const res = await p.evaluate(o => window.XM.record(o), pageOpts);
  if (!res || !res.ok) throw new Error((res && res.error) || 'record failed');
  const buf = Buffer.from(res.base64, 'base64');
  fs.mkdirSync(OUTDIR, { recursive: true });
  const stem = `${opts.shot || 'shot'}_${Date.now()}`;
  const raw = path.join(OUTDIR, stem + '.webm');
  fs.writeFileSync(raw, buf);
  const out = { raw, size: buf.length, mime: res.mime, shot: res.shot, duration: res.duration, fps: res.fps };
  /* 转成通用 mp4（H.264 / yuv420p），顺手按需整体提饱和度。
     夜景 + ACES 会把彩度洗淡，这里在成品层把颜色拉回来，比改场景光照更可控。 */
  try {
    const sat = +(opts.saturation || 1.28);
    const fps = Math.min(60, Math.max(1, Number(opts.fps) || 30));
    /* 原始 webm 是变帧率（captureStream 逐帧捕获，帧间隔随渲染负载抖动），
       剪辑/合成端最怕 VFR，这里统一转成恒定帧率 CFR。 */
    const fl = [];
    if (sat > 1.01) fl.push(`eq=saturation=${sat}:contrast=1.03`);
    fl.push('scale=out_range=tv');
    const mp4 = path.join(OUTDIR, stem + '.mp4');
    const args = ['-y', '-v', 'error', '-i', raw, '-vf', fl.join(',')];
    args.push('-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
              '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
    execFileSync('ffmpeg', args, { stdio: 'ignore' });
    out.file = mp4;
    out.saturation = sat;
    out.outFps = fps;
    out.mp4Size = fs.statSync(mp4).size;
  } catch (e) {
    out.file = raw;              // ffmpeg 不可用就直接给 webm
    out.ffmpegError = String(e.message || e);
  }
  return out;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }
  const url = new URL(req.url, 'http://x');
  const readBody = () => new Promise(r => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch (e) { r({}); } });
  });
  (async () => {
    try {
      if (url.pathname === '/health') {
        return send(res, 200, { ok: true, site: SITE, out: OUTDIR, page: !!(page && !page.isClosed()) });
      }
      if (url.pathname === '/shots') {
        return send(res, 200, { ok: true, shots: await apiShots() });
      }
      if (url.pathname === '/shot' && req.method === 'POST') {
        const b = await readBody();
        return send(res, 200, await apiShot(b.id));
      }
      if (url.pathname === '/record' && req.method === 'POST') {
        const b = await readBody();
        const out = await apiRecord({
          shot: b.shot, duration: +(b.duration || 6), fps: +(b.fps || 30),
          quality: b.quality !== false, warmup: b.warmup, saturation: b.saturation
        });
        console.log('[record]', out.shot, out.duration + 's', out.size + 'B', '→', out.file);
        return send(res, 200, { ok: true, ...out });
      }
      if (url.pathname === '/convert' && req.method === 'POST') {
        /* 浏览器端录制产物 → mp4。Chrome 的 MediaRecorder 只能出 webm，
           这里用 ffmpeg 补一份 H.264 mp4，页面拿回去直接下载。 */
        const chunks = [];
        let size = 0;
        req.on('data', c => { chunks.push(c); size += c.length; if (size > 400e6) req.destroy(); });
        req.on('end', () => {
          try {
            fs.mkdirSync(OUTDIR, { recursive: true });
            const stem = '_conv_' + Date.now();
            const src = path.join(OUTDIR, stem + '.webm');
            const dst = path.join(OUTDIR, stem + '.mp4');
            fs.writeFileSync(src, Buffer.concat(chunks));
            /* MediaRecorder 的 webm 没有时长头，用 genpts 让 ffmpeg 按帧时间戳补；
               宽高取偶数（x264 不接受奇数），再加 faststart 方便边下边播。 */
            const fps = Math.min(60, Math.max(1, +(url.searchParams.get('fps') || 30)));
            execFileSync('ffmpeg', ['-y', '-v', 'error', '-fflags', '+genpts', '-i', src,
              '-vf', 'fps=' + fps + ',scale=trunc(iw/2)*2:trunc(ih/2)*2',
              '-r', String(fps),
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
              '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], { stdio: 'ignore' });
            const buf = fs.readFileSync(dst);
            try { fs.unlinkSync(src); fs.unlinkSync(dst); } catch (_) {}
            res.writeHead(200, {
              'Content-Type': 'video/mp4',
              'Content-Length': buf.length,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
            });
            res.end(buf);
          } catch (e) {
            console.error('[convert]', e.message);
            send(res, 500, { ok: false, error: String(e.message || e) });
          }
        });
        return;
      }
      send(res, 404, { ok: false, error: 'no route ' + url.pathname });
    } catch (e) {
      console.error('[err]', e.message);
      send(res, 500, { ok: false, error: String(e.message || e) });
    }
  })();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('XM Studio 服务已启动  http://127.0.0.1:' + PORT);
  console.log('  机位列表   GET  http://127.0.0.1:' + PORT + '/shots');
  console.log('  录制       POST http://127.0.0.1:' + PORT + '/record  {"shot":"coaster-chase","duration":8}');
  console.log('  产物目录   ' + OUTDIR);
});

process.on('SIGINT', async () => { if (browser) await browser.close(); process.exit(0); });
process.on('SIGTERM', async () => { if (browser) await browser.close(); process.exit(0); });
