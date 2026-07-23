// ── Express 路由（可被 netdisk-hub 等项目挂载）──
// 用法（在 netdisk-hub/server.js 中）：
//   const kdocsRouter = require("E:\\kdocs-tool\\router");
//   app.use("/kdocs", kdocsRouter);
// 然后前端请求 http://localhost:3000/kdocs/api/auto 等

const express = require("express");
const router = express.Router();
const path = require("path");

const { parseInput } = require("./lib/parser");
const { searchSteamAppId } = require("./lib/steam");
const { checkBlAvailable, aiDescribe } = require("./lib/ai");
const { checkKdocsReady } = require("./lib/kdocs");
const { buildPrompt } = require("./lib/prompt");
const { autoExecute } = require("./lib/executor");

// 提供静态文件（当独立运行时也保持兼容）
router.use(express.static(path.join(__dirname, "public")));

router.get("/api/check", (req, res) => {
  res.json({ kdocsReady: checkKdocsReady(), blAvailable: checkBlAvailable() });
});

// 健康检查端点：控制面板(is_ready)仅靠 HTTP 200 判断服务存活
router.get("/api/ready", (req, res) => {
  res.json({ ok: true, ts: Date.now(), port: 3599, bind: "127.0.0.1" });
});

router.post("/api/parse", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "请输入游戏信息" });
  const parsed = parseInput(text);
  if (!parsed) return res.status(400).json({ error: "无法解析输入" });
  res.json(parsed);
});

router.get("/api/search-steam", async (req, res) => {
  const { q } = req.query;
  res.json({ appid: q ? await searchSteamAppId(q) : null });
});

router.post("/api/generate", async (req, res) => {
  const { text, manualSize, manualCoverUrl } = req.body;
  if (!text) return res.status(400).json({ error: "请输入游戏信息" });
  const parsed = parseInput(text);
  if (!parsed) return res.status(400).json({ error: "无法解析输入" });
  // 先搜 Steam，让生成指令里的封面/标签说明与实际一致
  const steamAppId = await searchSteamAppId(parsed.gameName);
  res.json({ prompt: buildPrompt(parsed, steamAppId, (manualSize || "").trim(), (manualCoverUrl || "").trim()), parsed });
});

router.post("/api/auto", async (req, res) => {
  const { text, coverDir, manualSize, manualCoverUrl } = req.body;
  if (!text) return res.status(400).json({ error: "请输入游戏信息" });
  const parsed = parseInput(text);
  if (!parsed) return res.status(400).json({ error: "无法解析输入" });
  try {
    const result = await autoExecute(parsed, null, coverDir, { manualSize, manualCoverUrl });
    res.json({ ...result, gameName: parsed.gameName });
  } catch (e) {
    res.status(500).json({ error: e.message, gameName: parsed.gameName });
  }
});

module.exports = router;
