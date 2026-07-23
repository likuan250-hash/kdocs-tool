const $ = id => document.getElementById(id);
const gameInput = $("gameInput"), gameSize = $("gameSize"), coverUrl = $("coverUrl");
const autoBtn = $("autoBtn"), coverDir = $("coverDir"), browseDirBtn = $("browseDirBtn");
const generateBtn = $("generateBtn"), clearBtn = $("clearBtn");
const preview = $("preview"), previewContent = $("previewContent");
const outputCard = $("outputCard"), promptContent = $("promptContent"), copyBtn = $("copyBtn");
const autoResult = $("autoResult"), autoSteps = $("autoSteps"), autoSummary = $("autoSummary"), autoLog = $("autoLog");
const toast = $("toast"), chipKdocs = $("chipKdocs"), chipBl = $("chipBl");
const exampleToggle = $("exampleToggle"), exampleContent = $("exampleContent");

let currentParsed = null, currentPrompt = "";

// ── 主题切换（与网盘转存中转台统一，持久化到 localStorage）──
const themeBtn = $("themeBtn");
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
themeBtn.onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
};

// ── Toast ──
function toastMsg(msg, type) {
  toast.textContent = msg;
  toast.style.background = type === "err" ? "var(--err)" : "var(--ok)";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function setChip(el, ok, label) {
  el.innerHTML = `<span class="dot ${ok ? "green" : "red"}"></span> ${label}`;
}

// ── 启动检查 ──
async function initCheck() {
  try {
    const r = await fetch("/api/check");
    const d = await r.json();
    setChip(chipKdocs, d.kdocsReady, d.kdocsReady ? "kdocs ✅ 已配置" : "kdocs ⚠️ 未配置");
    setChip(chipBl, d.blAvailable, d.blAvailable ? "AI ✅ 可用" : "AI ⚠️ 不可用");
  } catch {
    setChip(chipKdocs, false, "后端未连接");
    setChip(chipBl, false, "后端未连接");
  }
}
initCheck();

// ── 示例 ──
exampleToggle.onclick = () => {
  const show = exampleContent.style.display !== "block";
  exampleContent.style.display = show ? "block" : "none";
  exampleToggle.textContent = show ? "📖 收起" : "📖 示例";
};

// ── 清空 ──
clearBtn.onclick = () => {
  gameInput.value = "";
  gameSize.value = "";
  coverUrl.value = "";
  preview.style.display = "none";
  outputCard.classList.remove("show");
  autoResult.classList.remove("show");
  currentParsed = null;
  currentPrompt = "";
};

// ── 预览 ──
let pt;
gameInput.oninput = () => { clearTimeout(pt); pt = setTimeout(doPreview, 400); };

function doPreview() {
  const t = gameInput.value.trim();
  if (!t) { preview.style.display = "none"; return; }
  const p = parseInput(t);
  if (!p) { preview.style.display = "none"; return; }
  preview.style.display = "block";
  renderPreview(p);
}

// 与后端 parser.js 保持一致的轻量解析（仅用于前端预览）
function parseInput(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  if (!lines.length) return null;
  const first = lines[0];
  let b = "", q = "", x = "";
  for (const l of lines) {
    const c = l.replace(/^(?:链接)?[：:]\s*/, "");
    if (c.includes("pan.baidu.com")) b = c;
    else if (c.includes("pan.quark.cn")) q = c;
    else if (c.includes("pan.xunlei.com")) x = c;
  }
  let name = first, en = "";
  const m = first.match(/[（(]([^）)]+)[）)]/);
  if (m) { en = m[1]; name = first.substring(0, m.index).trim() || en; }
  const tags = [];
  if (first.includes("全DLC")) tags.push("全DLC");
  if (first.includes("免安装硬盘版") || first.includes("免安装")) tags.push("免安装硬盘版");
  if (first.includes("虚拟机版") || first.includes("虚拟机")) tags.push("虚拟机版");
  if (first.includes("联机") || first.includes("合作")) tags.push("联机合作");
  if (!tags.includes("虚拟机版")) tags.unshift("PC游戏");

  let size = "";
  for (const line of lines) {
    const sm = line.match(/(?:大小|容量|体积)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:GB|G|TB|T|MB|M|KB|K)\b)/i)
            || line.match(/(\d+(?:\.\d+)?\s*(?:GB|G|TB|T|MB|M|KB|K)\b)/i);
    if (sm) { size = sm[1].trim().replace(/\s+/g, ""); break; }
  }
  let cover = "";
  for (const line of lines) {
    const cm = line.match(/(?:封面|cover)?\s*[:：]?\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif))(?:\?[^)\s]*)?/i);
    if (cm) { cover = cm[1]; break; }
  }
  return { gameName: name, englishName: en, baiduUrl: b, quarkUrl: q, xunleiUrl: x, tags, raw: first, size, coverUrl: cover };
}

function renderPreview(p) {
  const th = p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(" ");
  const rows = [
    `<span class="label">🎮 游戏</span><span class="value">${esc(p.gameName)}${p.englishName ? "（" + esc(p.englishName) + "）" : ""}</span>`,
    `<span class="label">🏷️ 标签</span><span class="value">${th}</span>`,
    p.size ? `<span class="label">📦 大小</span><span class="value">${esc(p.size)}</span>` : "",
    p.coverUrl ? `<span class="label">🖼️ 封面</span><span class="value">${esc(p.coverUrl)}</span>` : "",
    p.baiduUrl ? `<span class="label">🔗 百度</span><span class="value">${esc(p.baiduUrl)}</span>` : "",
    p.quarkUrl ? `<span class="label">🔗 夸克</span><span class="value">${esc(p.quarkUrl)}</span>` : "",
    p.xunleiUrl ? `<span class="label">🔗 迅雷</span><span class="value">${esc(p.xunleiUrl)}</span>` : "",
  ];
  previewContent.innerHTML = rows.join("");
}

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// ── 生成指令 ──
generateBtn.onclick = async () => {
  const text = gameInput.value.trim();
  if (!text) { toastMsg("请先粘贴游戏信息", "err"); return; }
  generateBtn.disabled = true;
  generateBtn.textContent = "⏳";
  outputCard.classList.remove("show");
  try {
    const r = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, manualSize: gameSize.value.trim(), manualCoverUrl: coverUrl.value.trim() }) });
    const d = await r.json();
    if (d.error) { toastMsg(d.error, "err"); return; }
    currentParsed = d.parsed;
    currentPrompt = d.prompt;
    preview.style.display = "block";
    renderPreview(d.parsed);
    promptContent.textContent = d.prompt;
    outputCard.classList.add("show");
    toastMsg("✅ 指令已生成");
  } catch (e) { toastMsg("失败: " + e.message, "err"); }
  finally { generateBtn.disabled = false; generateBtn.textContent = "📤 生成指令"; }
};

// ── 复制 ──
copyBtn.onclick = async () => {
  if (!currentPrompt) { toastMsg("请先生成指令", "err"); return; }
  try { await navigator.clipboard.writeText(currentPrompt); toastMsg("✅ 已复制"); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = currentPrompt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toastMsg("✅ 已复制");
  }
};

// ── 一键执行 ──
autoBtn.onclick = async () => {
  const text = gameInput.value.trim();
  if (!text) { toastMsg("请先粘贴游戏信息", "err"); return; }

  autoBtn.disabled = true;
  autoBtn.textContent = "⏳ 执行中...";
  generateBtn.disabled = true;
  autoResult.classList.remove("show");
  autoSteps.innerHTML = "";
  autoLog.innerHTML = "";
  autoSummary.textContent = "";
  outputCard.classList.remove("show");

  autoResult.classList.add("show");
  addLog("info", "🚀 开始一键执行...");

  try {
    const r = await fetch("/api/auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, coverDir: coverDir.value.trim() || undefined, manualSize: gameSize.value.trim(), manualCoverUrl: coverUrl.value.trim() }) });
    const d = await r.json();

    if (d.error) {
      addLog("err", "❌ " + d.error);
      autoSummary.className = "result-summary fail";
      autoSummary.textContent = "❌ 执行失败";
      return;
    }

    if (d.gameName) { currentParsed = { ...currentParsed, gameName: d.gameName }; preview.style.display = "block"; }

    if (d.steps) {
      d.steps.forEach(s => {
        const icon = s.status === "成功" ? "✅" : s.status === "跳过" ? "⏭️" : "❌";
        addLog(s.status === "成功" ? "ok" : s.status === "跳过" ? "info" : "err", icon + " " + s.name + " — " + s.status);
        const item = document.createElement("div");
        item.className = "step-item";
        const detailParts = [];
        if (s.appid) detailParts.push("AppID: " + s.appid);
        if (s.path) detailParts.push("路径: " + s.path);
        if (s.size) detailParts.push(s.size);
        if (s.objectId) detailParts.push("ObjectID: " + s.objectId);
        if (s.recordId) detailParts.push("记录ID: " + s.recordId);
        if (s.desc) detailParts.push("摘要: " + s.desc.slice(0, 60) + (s.desc.length > 60 ? "…" : ""));
        if (s.reason) detailParts.push('<span class="err">' + esc(s.reason) + "</span>");
        if (s.error) detailParts.push('<span class="err">' + esc(s.error) + "</span>");
        item.innerHTML = '<span class="step-icon">' + icon + '</span><div class="step-body"><div class="step-name">' + esc(s.name) + " — " + s.status + "</div>" + (detailParts.length ? '<div class="step-detail">' + detailParts.join(" · ") + "</div>" : "") + "</div>";
        autoSteps.appendChild(item);
      });
    }

    if (d.success) {
      autoSummary.className = "result-summary ok";
      autoSummary.textContent = "✅ 全部完成！记录 ID: " + (d.recordId || "—");
      addLog("ok", d.recordId ? "🎉 记录 " + d.recordId + " 创建成功！" : "🎉 全部完成！");
      if (!currentPrompt && d.gameName) {
        const pr = parseInput(text);
        if (pr) currentPrompt = "(一键执行已完成，无需手动操作)";
      }
    } else {
      autoSummary.className = "result-summary fail";
      autoSummary.textContent = "⚠️ 部分步骤未成功";
      addLog("info", "💡 可点击「生成指令」获取完整模板手动执行");
    }
  } catch (e) {
    addLog("err", "❌ 请求失败: " + e.message);
    autoSummary.className = "result-summary fail";
    autoSummary.textContent = "❌ 执行异常";
  } finally {
    autoBtn.disabled = false;
    autoBtn.textContent = "🤖 一键执行";
    generateBtn.disabled = false;
  }
};

function addLog(type, msg) {
  const div = document.createElement("div");
  div.className = "line " + type;
  div.textContent = msg;
  autoLog.appendChild(div);
  autoLog.scrollTop = autoLog.scrollHeight;
}

// ── 右上角版本徽章 / 检测更新 ──
const verBadge = $("verBadge");
let _checking = false, _hasUpdate = false, _remoteVer = "";

function badgeState(state, text) {
  verBadge.classList.remove("checking", "has-update", "latest");
  if (state) verBadge.classList.add(state);
  verBadge.textContent = text;
}

async function loadVersion() {
  try {
    const r = await fetch("/api/version");
    const d = await r.json();
    verBadge.textContent = "v" + d.version;
    verBadge.title = "点击检查更新" + (d.commit ? " (" + d.commit + ")" : "");
  } catch { verBadge.textContent = "v?"; }
}

async function doUpdate() {
  badgeState("checking", "更新中…");
  try {
    const r = await fetch("/api/update", { method: "POST" });
    const d = await r.json();
    if (!d.ok) {
      badgeState(_hasUpdate ? "has-update" : null, _hasUpdate ? "⬆ v" + _remoteVer : "v?");
      toastMsg("更新失败: " + (d.error || ""), "err");
      return;
    }
    if (!d.updated) {
      badgeState("latest", "✓ 已最新");
      verBadge.title = "已是最新版本";
      setTimeout(loadVersion, 1500);
      return;
    }
    if (d.needsNpmInstall) {
      badgeState("has-update", "⬆ 需重启");
      toastMsg("代码已更新（含依赖变更），请通过「控制面板」点击「重启」生效", "err");
      return;
    }
    toastMsg("✅ 已更新，正在重启…");
    setTimeout(async () => {
      try { await fetch("/api/restart", { method: "POST" }); } catch { /* 旧进程即将退出 */ }
      setTimeout(() => location.reload(), 2600);
    }, 800);
  } catch (e) {
    badgeState(_hasUpdate ? "has-update" : null, _hasUpdate ? "⬆ v" + _remoteVer : "v?");
    toastMsg("更新失败: " + e.message, "err");
  }
}

verBadge.onclick = async () => {
  if (_checking) return;
  if (_hasUpdate) {
    if (!confirm("确定更新到最新版本并重启服务?")) return;
    await doUpdate();
    return;
  }
  _checking = true;
  badgeState("checking", "检测中…");
  try {
    const r = await fetch("/api/check-update");
    const d = await r.json();
    if (!d.ok) {
      badgeState(null, "检测失败");
      toastMsg("检测失败: " + (d.error || ""), "err");
      setTimeout(loadVersion, 1500);
      return;
    }
    if (d.hasUpdate) {
      _hasUpdate = true; _remoteVer = d.remoteCommit;
      badgeState("has-update", "⬆ " + d.remoteCommit);
      verBadge.title = "发现新版本 " + d.remoteCommit + "，点击更新";
      toastMsg("🔔 发现新版本，点击徽章更新");
    } else {
      badgeState("latest", "✓ 已最新");
      verBadge.title = "已是最新版本";
      setTimeout(loadVersion, 1800);
    }
  } catch (e) {
    badgeState(null, "检测失败");
    setTimeout(loadVersion, 1500);
  } finally {
    _checking = false;
  }
};

loadVersion();
