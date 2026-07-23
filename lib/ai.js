// ── AI 集成（bl CLI）──
const { execSync } = require("child_process");

function runCmd(cmd, opts = {}) {
  try { return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, shell: true, ...opts }); }
  catch (e) { throw new Error(e.stderr || e.stdout || e.message); }
}

/** 检测 bl CLI 是否可用 */
function checkBlAvailable() {
  try { runCmd("bl --version 2>&1", { timeout: 3000 }); return true; }
  catch { return false; }
}

/** 用 bl 生成游戏介绍、抓取大小、并联网搜索封面图直链（bl 即内置 agent：介绍+大小+封面三件事都交给 bl） */
function aiDescribe(gameName, rawLine, opts = {}) {
  const quarkUrl = opts.quarkUrl || "";
  const baiduUrl = opts.baiduUrl || "";
  let prompt = `请完成三项任务，严禁编造虚假信息：\n`;
  prompt += `1. 联网搜索游戏"${gameName}"的真实公开资料（可参考用户输入：${rawLine}），用50-80字中文客观介绍其核心玩法与特点。\n`;
  if (quarkUrl || baiduUrl) {
    prompt += `2. 请尝试从提供的网盘分享链接获取该游戏安装包总大小（如"30.7G"或"2.3TB"）；若无法获取请留空。链接：${quarkUrl || baiduUrl}\n`;
  } else {
    prompt += `2. 若你了解该游戏安装包大致大小（如"30.7G"）请一并给出，不确定则留空。\n`;
  }
  prompt += `3. 联网搜索该游戏的封面宣传图直链（可直接下载的图片 URL）：\n`;
  prompt += `   - 若识别为 Steam 游戏，返回 Steam 商店封面 CDN 直链，例如 https://cdn.cloudflare.steamstatic.com/steam/apps/<AppID>/library_600x900_2x.jpg 或 https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/<AppID>/library_600x900_2x.jpg\n`;
  prompt += `   - 若非 Steam（任天堂/PS/Epic/国产等），返回官方商城或厂商页面的封面图直链\n`;
  prompt += `   - 若无法获得可靠直链请留空\n`;
  prompt += `严格按以下格式单行输出，不要多余内容：\n介绍：<50-80字真实介绍>\n大小：<如 30.7G，未知留空>\n封面：<封面图直链URL，未知留空>`;
  try {
    const out = runCmd(`bl text chat --message ${JSON.stringify(prompt)} --max-tokens 600 --output json 2>&1`, { timeout: 60000 });
    const m = out.match(/\{[\s\S]*\}/);
    let content = "";
    if (m) {
      try { content = JSON.parse(m[0]).choices?.[0]?.message?.content || ""; } catch { /* not json */ }
    }
    if (!content) content = out; // 兼容非 JSON 纯文本输出
    const introM = content.match(/介绍[:：]\s*([^\n]*)/);
    const sizeM = content.match(/大小[:：][ \t]*([^\n]*)/);
    const coverM = content.match(/封面[:：]\s*([^\n]*)/);
    let coverUrl = "";
    if (coverM) {
      const urlM = coverM[1].match(/https?:\/\/[^\s）)]+/);
      coverUrl = urlM ? urlM[0] : "";
    }
    const intro = (introM?.[1] || content).replace(/[\n\r]+/g, " ").trim().slice(0, 200);
    const rawSize = (sizeM?.[1] || "").trim();
    const size = /^(无|未知|none|null)?$/i.test(rawSize) ? "" : rawSize;
    return { intro, size, coverUrl };
  } catch { return { intro: "", size: "", coverUrl: "" }; }
}

module.exports = { checkBlAvailable, aiDescribe };
