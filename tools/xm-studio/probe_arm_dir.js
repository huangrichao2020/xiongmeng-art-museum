/* 验证手臂朝向：算出 armL/armR 的实际世界方向，看是朝外还是朝身体中心 */
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
  const pg = await ctx.newPage();
  await pg.goto((process.env.LOCAL_URL||'http://127.0.0.1:8899/')+'?ui', { waitUntil:'load', timeout:180000 });
  await pg.waitForFunction(()=>window.MP&&window.diorama,null,{timeout:180000});
  await pg.waitForTimeout(8000);
  const r = await pg.evaluate(() => {
    const V = window.diorama.scene().position.constructor;
    const out = [];
    window.diorama.scene().traverse(o => {
      if (!(o.isGroup && o.userData && o.userData.legL && o.userData.armL)) return;
      const gp = new V(); o.getWorldPosition(gp);
      if (Math.abs(gp.y - 3.4) > 0.4) return;  // 钢丝熊
      const armDir = (arm) => {
        arm.updateWorldMatrix(true,false);
        const e = arm.matrixWorld.elements;
        // 第二列（索引 4,5,6）是局部 Y 轴；手臂默认沿 -Y，所以方向 = -Y 列
        return { x: -e[4], y: -e[5], z: -e[6] };
      };
      const dl = armDir(o.userData.armL), dr = armDir(o.userData.armR);
      out.push({
        armLrotZ: +o.userData.armL.rotation.z.toFixed(3),
        armRrotZ: +o.userData.armR.rotation.z.toFixed(3),
        armLdir: [+dl.x.toFixed(3),+dl.y.toFixed(3),+dl.z.toFixed(3)],
        armRdir: [+dr.x.toFixed(3),+dr.y.toFixed(3),+dr.z.toFixed(3)],
        // 人体局部 X 轴在世界里的方向 → 朝外应该是「顺着人体横轴朝外」
        bodyX: (()=>{const e=o.matrixWorld.elements;return [+e[0].toFixed(3),+e[1].toFixed(3),+e[2].toFixed(3)];})(),
        dotL: +(dl.x*o.matrixWorld.elements[0]+dl.y*o.matrixWorld.elements[1]+dl.z*o.matrixWorld.elements[2]).toFixed(3),
        dotR: +(dr.x*o.matrixWorld.elements[0]+dr.y*o.matrixWorld.elements[1]+dr.z*o.matrixWorld.elements[2]).toFixed(3)
      });
    });
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
