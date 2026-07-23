// ── 共享常量 ──
const FILE_ID = "h9aREMoyL1MMMeDCHLWa1xsikoTpExj2o";
const DEFAULT_COVER_DIR = "E:\\游戏网站建设";
const WORK_DIR = __dirname; // when required from index.js, this is E:\kdocs-tool
// SteamGridDB 兜底封面源（可选）：注册 steamgriddb.com 后在偏好设置生成免费 API key
const STEAMGRIDDB_API_KEY = process.env.STEAMGRIDDB_API_KEY || "";

module.exports = { FILE_ID, DEFAULT_COVER_DIR, WORK_DIR, STEAMGRIDDB_API_KEY };
