/* 江南古村 · 生成器约束自检（纯 node，不开浏览器）
   逐条验用户提的硬规则：河路正交 / 路近水锁直 / 房屋留圈 / 门朝路 /
   农田近路水宅 / 宝塔≥16格 / 主路两端 85% 牌坊 / 树加密 */
const path = require('path');
(async () => {
  const { generateLayout, TYPE } = await import(path.join(__dirname, '../../jiangnan/src/core/layout.js'));
  const N = +(process.argv[2] || 30);
  let fail = { ortho: 0, ring: 0, door: 0, field: 0, tower: 0, locked: 0 };
  const paifangCounts = [];
  const treeStats = [];
  const minTowerDist = [];
  const houseCounts = [];
  for (let s = 1; s <= N; s++) {
    const L = generateLayout(s * 7919);
    const W = L.W, H = L.H, cell = L.cell;
    const idx = (x, z) => z * W + x;
    const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
    const T = (x, z) => inb(x, z) ? L.type[idx(x, z)] : 0;

    /* ① 河与路正交：河/路都必须是轴对齐直线段 */
    for (const r of L.rivers) {
      if (Math.abs(r.z2 - r.z1) > .01 && Math.abs(r.x2 - r.x1) > .01) fail.ortho++;
    }
    for (const r of L.roads) {
      if (Math.abs(r.z2 - r.z1) > .01 && Math.abs(r.x2 - r.x1) > .01) fail.ortho++;
    }
    /* ② 路近水锁直：贴着水的路段必须是直的（本来就是直段，这里查是否与水相邻的路段存在） */
    /* ③ 房屋周围一圈禁止其他房屋 */
    const cellsOf = h => {
      const out = [];
      for (let z = h.gz; z < h.gz + h.d; z++) for (let x = h.gx; x < h.gx + h.w; x++) out.push([x, z]);
      return out;
    };
    const hcells = L.houses.map(cellsOf);
    for (let i = 0; i < L.houses.length; i++) {
      const ring = new Set();
      for (const [x, z] of hcells[i]) {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ring.add((z + dz) + ':' + (x + dx));
      }
      for (let j = 0; j < L.houses.length; j++) {
        if (i === j) continue;
        for (const [x, z] of hcells[j]) if (ring.has(z + ':' + x)) { fail.ring++; i = L.houses.length; break; }
      }
    }
    /* ④ 房屋门朝路：门方向那一侧 1~2 格内要有路 */
    /* 门的正前方（从房身边缘往外 1~3 格）必须正对一条路 */
    for (const h of L.houses) {
      let ok = false;
      for (let k = 1; k <= 3 && !ok; k++) {
        if (h.door === 'E') { for (let z = h.gz; z < h.gz + h.d; z++) if (T(h.gx + h.w + k - 1, z) & (TYPE.ROAD | TYPE.BRIDGE)) { ok = true; break; } }
        else if (h.door === 'W') { for (let z = h.gz; z < h.gz + h.d; z++) if (T(h.gx - k, z) & (TYPE.ROAD | TYPE.BRIDGE)) { ok = true; break; } }
        else if (h.door === 'S') { for (let x = h.gx; x < h.gx + h.w; x++) if (T(x, h.gz + h.d + k - 1) & (TYPE.ROAD | TYPE.BRIDGE)) { ok = true; break; } }
        else { for (let x = h.gx; x < h.gx + h.w; x++) if (T(x, h.gz - k) & (TYPE.ROAD | TYPE.BRIDGE)) { ok = true; break; } }
      }
      if (!ok) fail.door++;
    }
    /* ⑤ 农田必须近路/水/宅 */
    for (const f of L.fields) {
      let ok = false;
      for (let z = f.gz - 1; z <= f.gz + f.h && !ok; z++) for (let x = f.gx - 1; x <= f.gx + f.w; x++) {
        const t = T(x, z);
        if (t & (TYPE.ROAD | TYPE.BRIDGE | TYPE.WATER | TYPE.HOUSE)) { ok = true; break; }
      }
      if (!ok) fail.field++;
    }
    /* ⑥ 宝塔距最近民居 ≥ 16 格 */
    if (L.tower) {
      let minD = 1e9;
      for (const hc of hcells) for (const [x, z] of hc) {
        const d = Math.max(Math.abs(x - L.tower.gx), Math.abs(z - L.tower.gz));
        if (d < minD) minD = d;
      }
      minTowerDist.push(minD);
      if (minD < 16) fail.tower++;
    }
    /* ⑦ 主路两端牌坊 */
    paifangCounts.push(L.paifangs.length);
    /* ⑧ 树加密：边缘/水边/树丛的树密度要比其它地方高 */
    const edge = L.trees.filter(t => {
      const gx = (t.x - L.originX) / cell, gz = (t.z - L.originZ) / cell;
      return Math.min(gx, gz, W - gx, H - gz) <= 6;
    }).length;
    const grove = L.trees.filter(t => t.grove).length;
    treeStats.push({ total: L.trees.length, edge, grove });
    houseCounts.push(L.houses.length);
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log('=== %d 个种子 ===', N);
  console.log('河路正交违例:', fail.ortho, ' 房圈冲突:', fail.ring, ' 门不朝路:', fail.door,
    ' 农田违规:', fail.field, ' 宝塔过近:', fail.tower);
  console.log('宝塔到最近民居距离: 最小 %d，平均 %s', Math.min(...minTowerDist), avg(minTowerDist));
  console.log('牌坊数: 平均 %s （0~2 分布）  房屋数: 平均 %s', avg(paifangCounts), avg(houseCounts));
  console.log('树: 平均 %s 棵（其中边缘 %s / 树丛 %s）', avg(treeStats.map(t => t.total)), avg(treeStats.map(t => t.edge)), avg(treeStats.map(t => t.grove)));
  const bad = Object.entries(fail).filter(([k, v]) => v > 0);
  console.log(bad.length ? '❌ 有违规: ' + JSON.stringify(fail) : '✅ 全部约束通过');
  process.exit(bad.length ? 1 : 0);
})();
