/* 江南古村页面：抓所有 >=400 的响应 + console 警告 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] });
  const pg = await (await b.newContext({ viewport: { width: 900, height: 600 } })).newPage();
  const bad = [];
  pg.on('response', r => { if (r.status() >= 400) bad.push(r.status() + '  ' + r.url()); });
  pg.on('requestfailed', r => bad.push('FAILED(' + (r.failure() || {}).errorText + ')  ' + r.url()));
  const warns = [];
  pg.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') warns.push(m.type() + ': ' + m.text()); });
  await pg.goto('http://127.0.0.1:8900/?seed=4099461353', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction(() => window.__jnReady, null, { timeout: 180000 });
  await pg.waitForTimeout(2500);
  console.log('=== >=400 响应 ===');
  [...new Set(bad)].forEach(u => console.log('  ', u));
  console.log('合计', bad.length);
  console.log('=== console warning/error ===');
  [...new Set(warns)].forEach(w => console.log('  ', w));
  console.log('合计', new Set(warns).size);
  await b.close();
})();
