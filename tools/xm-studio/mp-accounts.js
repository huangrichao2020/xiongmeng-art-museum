/* 探针专用账号分配
   test01/test02 留给真人玩家，探针一律从 test03~test08 里按进程号取，
   这样多个探针同时跑也不会互相顶号，也不会把玩家挤下线。 */
const POOL = ['test03', 'test04', 'test05', 'test06', 'test07', 'test08'];
function pickAccounts(tag) {
  /* tag 可选：不同用途错开起点 */
  const base = tag ? tag.charCodeAt(0) : 0;
  const i = (process.pid + base) % POOL.length;
  const a = POOL[i];
  const b = POOL[(i + 1) % POOL.length];
  return { a, b };
}
module.exports = { pickAccounts, POOL };
