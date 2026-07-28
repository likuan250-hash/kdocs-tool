// ── Express 路由（可被 netdisk-hub 等项目挂载）──
// 用法（在 netdisk-hub/server.js 中）：
//   const kdocsRouter = require("E:\\kdocs-tool\\router");
//   app.use("/kdocs", kdocsRouter);
// 然后前端请求 http://localhost:3000/kdocs/api/auto 等

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawn } = require("child_process");

const { parseInput } = require("./lib/parser");
const { searchSteamAppId } = require("./lib/steam");
const { checkBlAvailable, aiDescribe } = require("./lib/ai");
const { checkKdocsReady } = require("./lib/kdocs");
const { autoExecute, findExistingRecord } = require("./lib/executor");

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

// ── 封面目录选择：弹出系统文件夹选择器，返回绝对路径（本地 Windows 工具）──
router.post("/api/browse-dir", async (req, res) => {
  const initial = (req.body && req.body.initial) || "";
  const tmpBase = path.join(os.tmpdir(), `kdocs_browsedir_${Date.now()}_${process.pid}`);
  const vbsPath = `${tmpBase}.vbs`;
  const outPath = `${tmpBase}.txt`;
  // wscript.exe 是 GUI 子系统，不会弹出黑色控制台；结果写入 UTF-16 临时文件，彻底避免 stdout 编码乱码
  const vbs = [
    "Dim shell, folder, fso, stream",
    "Set shell = CreateObject(\"Shell.Application\")",
    "Set folder = shell.BrowseForFolder(0, \"选择封面图片存放目录\", 1, 0)",
    "If Not folder Is Nothing Then",
    "  Set fso = CreateObject(\"Scripting.FileSystemObject\")",
    "  Set stream = fso.CreateTextFile(WScript.Arguments(0), True, True)",
    "  stream.Write folder.Self.Path",
    "  stream.Close",
    "End If",
  ].join("\r\n");

  function cleanup() {
    try { if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath); } catch {}
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
  }

  try {
    fs.writeFileSync(vbsPath, "\ufeff" + vbs, "utf16le"); // VBS 含中文，用 UTF-16 BOM
    await new Promise((resolve, reject) => {
      const child = spawn("wscript.exe", ["//Nologo", vbsPath, outPath], {
        windowsHide: true,
        timeout: 120000,
      });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) return reject(new Error("文件夹选择器被中断"));
        resolve();
      });
    });

    let dir = "";
    if (fs.existsSync(outPath)) {
      const raw = fs.readFileSync(outPath);
      dir = raw.toString("utf16le").replace(/^\uFEFF/, "").trim();
    }
    cleanup();
    if (dir) return res.json({ dir });
    return res.json({ dir: "", cancelled: true }); // 用户取消
  } catch (e) {
    cleanup();
    return res.status(500).json({ error: "打开文件夹选择器失败：" + e.message });
  }
});

router.post("/api/check-exists", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "请输入游戏信息" });
  const parsed = parseInput(text);
  if (!parsed) return res.status(400).json({ error: "无法解析输入" });
  try {
    const r = await findExistingRecord(parsed);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message, exists: false, recordId: null, existingLinks: null });
  }
});

router.post("/api/auto", async (req, res) => {
  const { text, coverDir, manualCoverUrl, forceAdd, updateLinks } = req.body;
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
  const send = (obj) => {
    try {
      res.write("data: " + JSON.stringify(obj) + "\n\n");
      if (typeof res.flush === "function") res.flush();
    } catch { /* 客户端已断开 */ }
  };
  // 每 3 秒发一次 SSE 心跳注释，让代理/浏览器保持连接
  const heartbeat = setInterval(() => { try { res.write(": hb\n\n"); if (typeof res.flush === "function") res.flush(); } catch { /* ignore */ } }, 3000);

  try {
    await autoExecute(parsed, null, coverDir, {
      manualCoverUrl,
      forceAdd: !!forceAdd,
      updateLinks: !!updateLinks,
      onStep: (ev) => send(ev),
    });
  } catch (e) {
    send({ type: "error", error: e.message });
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* 已结束 */ }
  }
});

module.exports = router;
