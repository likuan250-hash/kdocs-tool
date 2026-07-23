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
  let prompt = `请完成三项任务。用户已提供该游戏的网盘资源，因此该游戏必然真实存在，请直接客观描述，不要质疑、不要写免责声明。\n`;
  prompt += `1. 联网搜索游戏"${gameName}"（英文原名：${opts.englishName || "无"}）的客观公开资料，用50-80字中文介绍其开发商/发行商、游戏类型与核心玩法。严禁返回"疑似虚构""无法确认""经核实无真实公开资料""请勿轻信""非官方渠道"等免责声明，否则视为错误输出。\n`;
  if (quarkUrl || baiduUrl || opts.xunleiUrl) {
    prompt += `2. 必须从以下网盘分享链接页面抓取该游戏安装包总大小（如"30.7G""2.3TB""512MB"）。请打开链接读取页面中的文件大小字段，不要猜测。${quarkUrl ? "\n夸克：" + quarkUrl : ""}${baiduUrl ? "\n百度：" + baiduUrl : ""}${opts.xunleiUrl ? "\n迅雷：" + opts.xunleiUrl : ""}\n`;
  } else {
    prompt += `2. 若你了解该游戏安装包大致大小（如"30.7G"）请一并给出，不确定则写"未抓取到"。\n`;
  }
  prompt += `3. 必须联网搜索该游戏的封面宣传图直链（可直接下载的图片 URL），不得留空：\n`;
  prompt += `   - 优先尝试识别 Steam AppID，若能确定则返回 Steam 商店封面 CDN 直链，例如 https://cdn.cloudflare.steamstatic.com/steam/apps/<AppID>/library_600x900_2x.jpg 或 https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/<AppID>/library_600x900_2x.jpg\n`;
  prompt += `   - 若非 Steam（任天堂/PS/Epic/Xbox/国产/手游等），通过搜索 "${gameName} 封面"、"${gameName} 官方宣传图"、"${gameName} 官网" 找到官方商城、厂商页面或新闻媒体的封面图直链\n`;
  prompt += `   - 只返回一张横版或竖版封面图的直链 URL，确保 URL 以 .jpg/.jpeg/.png/.webp 结尾且可直接下载\n`;
  prompt += `严格按以下格式单行输出，不要多余内容：\n介绍：<50-80字真实介绍>\n大小：<如 30.7G，未抓取到则写"未抓取到">\n封面：<封面图直链URL，必须返回>`;
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

  // 内容质量校验：bl 可能返回免责声明或偷懒留空
  const blacklist = /疑似虚构|无法确认|经核实无真实|请勿轻信|非官方渠道|暂无公开资料|无法核实|没有公开资料|不存在|误传|虚构/gi;
  function isBadIntro(s) { return !s || blacklist.test(s) || s.length < 10; }
  function isBadSize(s) { return !s || /^(无|未知|none|null|未抓取到)?$/i.test(s.trim()); }
  function isBadCover(s) { return !s || !/^https?:\/\//i.test(s); }
    let coverUrl = "";
    if (coverM) {
      const urlM = coverM[1].match(/https?:\/\/[^\s）)]+/);
      coverUrl = urlM ? urlM[0] : "";
    }
    let intro = (introM?.[1] || "").replace(/[\n\r]+/g, " ").trim().slice(0, 200);
    if (isBadIntro(intro)) intro = "";
    const rawSize = (sizeM?.[1] || "").trim();
    let size = isBadSize(rawSize) ? "" : rawSize;

    // 强制重试：首次输出质量不合格时，分项再追一次
    const needRetryIntro = isBadIntro(intro);
    const needRetrySize = isBadSize(size) && (quarkUrl || baiduUrl || opts.xunleiUrl);
    const needRetryCover = isBadCover(coverUrl);

    if (needRetryIntro || needRetrySize || needRetryCover) {
      let retryPrompt = `请为游戏"${gameName}"（英文：${opts.englishName || "无"}）补全以下信息，不要编造、不要写免责声明。\n`;
      if (needRetryIntro) retryPrompt += `1. 联网搜索该游戏开发商/类型/核心玩法，输出50-80字中文客观介绍。\n`;
      if (needRetrySize) retryPrompt += `2. 打开网盘链接读取安装包总大小：${quarkUrl || baiduUrl || opts.xunleiUrl}\n`;
      if (needRetryCover) retryPrompt += `3. 联网搜索一张官方封面/宣传图直链（.jpg/.jpeg/.png/.webp）。\n`;
      retryPrompt += "严格按格式输出（缺失项可写 无）:\n";
      if (needRetryIntro) retryPrompt += "介绍：<客观介绍>\n";
      if (needRetrySize) retryPrompt += "大小：<如 30.7G>\n";
      if (needRetryCover) retryPrompt += "封面：<URL>\n";
      try {
        const out2 = runCmd(`bl text chat --message ${JSON.stringify(retryPrompt)} --max-tokens ${needRetryIntro ? 600 : 300} --output json 2>&1`, { timeout: 45000 });
        const m2 = out2.match(/\{[\s\S]*\}/);
        let content2 = "";
        if (m2) { try { content2 = JSON.parse(m2[0]).choices?.[0]?.message?.content || ""; } catch { } }
        if (!content2) content2 = out2;
        const introM2 = content2.match(/介绍[:：]\s*([^\n]*)/);
        const sizeM2 = content2.match(/大小[:：][ \t]*([^\n]*)/);
        const coverM2 = content2.match(/封面[:：]\s*([^\n]*)/);
        if (needRetryIntro && introM2 && !isBadIntro(introM2[1])) intro = introM2[1].replace(/[\n\r]+/g, " ").trim().slice(0, 200);
        if (needRetrySize && sizeM2 && !isBadSize(sizeM2[1])) size = sizeM2[1].trim();
        if (needRetryCover && coverM2) {
          const urlM2 = coverM2[1].match(/https?:\/\/[^\s）)]+/);
          if (urlM2) coverUrl = urlM2[0];
        }
      } catch { /* 忽略二次失败 */ }
    }

    // 最终保底：若仍无介绍，用原始文本兜底（至少不是免责声明）
    if (!intro) intro = rawLine;
    return { intro, size, coverUrl };
  } catch { return { intro: rawLine || "", size: "", coverUrl: "" }; }
}

module.exports = { checkBlAvailable, aiDescribe };
