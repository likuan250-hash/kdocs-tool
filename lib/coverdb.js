// ── SteamGridDB 兜底封面源 ──
// 当 bl 未返回封面、且非 Steam 游戏时，用 SteamGridDB 按游戏名搜索竖版网格图。
// 需免费 API key（注册 steamgriddb.com 后在偏好设置生成），通过环境变量 STEAMGRIDDB_API_KEY 提供。
// 无 key 或包未安装时本模块全部返回 null，不阻塞主流程。
const { STEAMGRIDDB_API_KEY } = require("./config");

const SGDB_AVAILABLE = (() => {
  if (!STEAMGRIDDB_API_KEY) return false;
  try { require.resolve("steamgriddb"); return true; }
  catch { return false; }
})();

/** 按游戏名搜索 SteamGridDB 竖版网格图直链；失败/未找到返回 null */
async function searchCoverByGameName(gameName) {
  if (!SGDB_AVAILABLE) return null;
  try {
    const SGDB = require("steamgriddb").default;
    const client = new SGDB(STEAMGRIDDB_API_KEY);
    const games = await client.searchGame(gameName);
    if (!games || !games.length) return null;
    const gameId = games[0].id;
    // 优先拿竖版网格图（600x900 左右）
    let grids = await client.getGrids({ type: "game", id: gameId });
    if (!grids || !grids.length) return null;
    const portrait = grids.find((g) => g.height >= 800 && g.width <= 700) || grids[0];
    return portrait && portrait.url ? portrait.url : null;
  } catch {
    return null;
  }
}

module.exports = { searchCoverByGameName, SGDB_AVAILABLE, STEAMGRIDDB_API_KEY };
