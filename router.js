// ── Express 路由（可被 netdisk-hub 等项目挂载）──
// 用法（在 netdisk-hub/server.js 中）：
//   const kdocsRouter = require("E:\\kdocs-tool\\router");
//   app.use("/kdocs", kdocsRouter);
// 然后前端请求 http://localhost:3000/kdocs/api/auto 等

const express = require("express");
const router = express.Router();
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const { parseInput } = require("./lib/parser");
const { searchSteamAppId } = require("./lib/steam");
const { checkBlAvailable, aiDescribe } = require("./lib/ai");
const { checkKdocsReady } = require("./lib/kdocs");
const { buildPrompt } = require("./lib/prompt");
const { autoExecute } = require("./lib/executor");

// 提供静态文件（当独立运行时也保持兼容）
router.use(express.static(path.join(__dirname, "public")));

router.get("/api/check", async (req, res) => {
  res.json({ kdocsReady: await checkKdocsReady(), blAvailable: await checkBlAvailable() });
});

// 健康检查端点：控制面板(is_ready)仅靠 HTTP 200 判断服务存活
router.get("/api/ready", (req, res) => {
  res.json({ ok: true, ts: Date.now(), port: 3599, bind: "127.0.0.1" });
});

// ── 版本与更新（检测本地是否落后于 GitHub main）──
function gitSync(args, timeoutMs = 20000) {
  try {
    return execFileSync("git", args, {
      cwd: __dirname, windowsHide: true, encoding: "utf8", timeout: timeoutMs,
    }).trim();
  } catch (e) {
    return null;
  }
}
// 与 gitSync 类似, 但失败时返回真实 stderr, 便于前端展示确切原因(SSH 凭证/网络/代理等)
function gitSyncDetail(args, timeoutMs = 20000) {
  try {
    const out = execFileSync("git", args, {
      cwd: __dirname, windowsHide: true, encoding: "utf8", timeout: timeoutMs,
    });
    return { ok: true, out: (out || "").trim(), err: "" };
  } catch (e) {
    const raw = (e && (e.stderr || e.stdout)) || (e && e.message) || "未知错误";
    const err = raw.toString().trim() || "未知错误";
    return { ok: false, out: "", err };
  }
}
function getVersion() {
  try { return require("./package.json").version; } catch (e) { return "?"; }
}
function gitShort() {
  return gitSync(["rev-parse", "--short", "HEAD"], 8000) || "";
}

router.get("/api/version", (req, res) => {
  res.json({ version: getVersion(), commit: gitShort(), env: process.env.NODE_ENV || "production" });
});

router.get("/api/check-update", (req, res) => {
  const localCommit = gitSync(["rev-parse", "HEAD"], 8000);
  const fetched = gitSyncDetail(["fetch", "origin", "main"], 25000);
  if (!fetched.ok) {
    return res.status(500).json({ ok: false, error: "git fetch 失败：" + fetched.err });
  }
  const remoteCommit = gitSync(["rev-parse", "origin/main"], 8000) || gitSync(["rev-parse", "FETCH_HEAD"], 8000);
  if (!localCommit || !remoteCommit) {
    return res.status(500).json({ ok: false, error: "无法读取本地/远程 commit" });
  }
  const hasUpdate = localCommit !== remoteCommit;
  res.json({
    ok: true, hasUpdate, version: getVersion(),
    localCommit: localCommit.slice(0, 7), remoteCommit: remoteCommit.slice(0, 7),
  });
});

router.post("/api/update", (req, res) => {
  const before = gitSync(["rev-parse", "HEAD"], 8000);
  const pull = gitSyncDetail(["pull", "origin", "main"], 60000);
  if (!pull.ok) {
    return res.status(200).json({ ok: false, error: "git pull 失败：" + pull.err, updated: false });
  }
  const after = gitSync(["rev-parse", "HEAD"], 8000);
  const updated = !!(before && after && before !== after);
  let needsNpmInstall = false;
  if (updated) {
    const changed = gitSync(["diff", "--name-only", before, after], 8000) || "";
    needsNpmInstall = /package\.json/.test(changed);
    if (needsNpmInstall) {
      try {
        const fs = require("fs");
        const dataDir = path.join(__dirname, "data");
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, ".needs-npm-install"), after);
      } catch (e) { /* 哨兵写入失败不阻断更新 */ }
    }
  }
  res.json({ ok: true, updated, needsRestart: updated, needsNpmInstall, output: pull.out });
});

router.post("/api/restart", (req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    try {
      const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
        cwd: __dirname, detached: true, stdio: "ignore", env: process.env, windowsHide: true,
      });
      child.unref();
    } catch (e) { /* 重启失败不应抛到请求里 */ }
    process.exit(0);
  }, 600);
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
  const { text, manualCoverUrl } = req.body;
  if (!text) return res.status(400).json({ error: "请输入游戏信息" });
  const parsed = parseInput(text);
  if (!parsed) return res.status(400).json({ error: "无法解析输入" });
  // 先搜 Steam，让生成指令里的封面/标签说明与实际一致
  const steamAppId = await searchSteamAppId(parsed.gameName);
  res.json({ prompt: buildPrompt(parsed, steamAppId, (manualCoverUrl || "").trim()), parsed });
});

router.post("/api/auto", async (req, res) => {
  const { text, coverDir, manualCoverUrl } = req.body;
  if (!text) return res.status(400).json({ error: "请输入游戏信息" });
  const parsed = parseInput(text);
  if (!parsed) return res.status(400).json({ error: "无法解析输入" });

  // SSE 流式进度：逐条推送 step / done / error 事件，让前端实时看到执行到哪一步
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (obj) => { try { res.write("data: " + JSON.stringify(obj) + "\n\n"); } catch { /* 客户端已断开 */ } };
  let clientGone = false;
  req.on("close", () => { clientGone = true; });

  try {
    const result = await autoExecute(parsed, null, coverDir, {
      manualCoverUrl,
      onStep: (ev) => { if (!clientGone) send(ev); },
    });
    if (!clientGone) send({ type: "done", result: { ...result, gameName: parsed.gameName } });
  } catch (e) {
    if (!clientGone) send({ type: "error", error: e.message });
  } finally {
    try { res.end(); } catch { /* 已结束 */ }
  }
});

module.exports = router;
