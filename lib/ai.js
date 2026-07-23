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
  prompt += `3. 必须联网搜索该游戏的封面宣传图直链（可直接下载的图片 URL），不得留空：\n`;
  prompt += `   - 优先尝试识别 Steam AppID，若能确定则返回 Steam 商店封面 CDN 直链，例如 https://cdn.cloudflare.steamstatic.com/steam/apps/<AppID>/library_600x900_2x.jpg 或 https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/<AppID>/library_600x900_2x.jpg\n`;
  prompt += `   - 若非 Steam（任天堂/PS/Epic/Xbox/国产/手游等），通过搜索 "游戏名 封面"、"游戏名 官方宣传图"、"游戏名 官网" 找到官方商城、厂商页面或新闻媒体的封面图直链\n`;
  prompt += `   - 只返回一张横版或竖版封面图的直链 URL，确保 URL 以 .jpg/.jpeg/.png/.webp 结尾且可直接下载\n`;
  prompt += `严格按以下格式单行输出，不要多余内容：\n介绍：<50-80字真实介绍>\n大小：<如 30.7G，未知留空>\n封面：<封面图直链URL，必须返回>`;
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
    let intro = (introM?.[1] || content).replace(/[\n\r]+/g, " ").trim().slice(0, 200);
    const rawSize = (sizeM?.[1] || "").trim();
    const size = /^(无|未知|none|null)?$/i.test(rawSize) ? "" : rawSize;

    // 强制重试：若未拿到封面，再发一次专门只找封面的请求
    if (!coverUrl) {
      const coverPrompt = `请为游戏"${gameName}"联网搜索一张官方封面/宣传图直链。要求：\n` +
        `1. 优先尝试确定 Steam AppID，返回 https://cdn.cloudflare.steamstatic.com/steam/apps/<AppID>/library_600x900_2x.jpg 或 header.jpg\n` +
        `2. 若非 Steam，搜索 "${gameName} 封面"、"${gameName} 官方宣传图"、"${gameName} 官网"，返回官方或权威媒体的封面图直链\n` +
        `3. 必须返回一张可直接下载的图片 URL（.jpg/.jpeg/.png/.webp）\n` +
        `只输出一行：封面：<URL>`;
      try {
        const out2 = runCmd(`bl text chat --message ${JSON.stringify(coverPrompt)} --max-tokens 300 --output json 2>&1`, { timeout: 30000 });
        const m2 = out2.match(/\{[\s\S]*\}/);
        let content2 = "";
        if (m2) { try { content2 = JSON.parse(m2[0]).choices?.[0]?.message?.content || ""; } catch { } }
        if (!content2) content2 = out2;
        const coverM2 = content2.match(/封面[:：]\s*([^\n]*)/);
        if (coverM2) {
          const urlM2 = coverM2[1].match(/https?:\/\/[^\s）)]+/);
          coverUrl = urlM2 ? urlM2[0] : "";
        }
      } catch { /* 忽略二次失败 */ }
    }

    // 最终保底：若连介绍都没有，用原始文本兜底
    if (!intro) intro = rawLine;
    return { intro, size, coverUrl };
  } catch { return { intro: rawLine || "", size: "", coverUrl: "" }; }
}

module.exports = { checkBlAvailable, aiDescribe };
