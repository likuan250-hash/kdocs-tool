// ── 输入文本解析 ──

function parseInput(text) {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(l => l);
  if (!lines.length) return null;
  const firstLine = lines[0];
  let baidu = "", quark = "", xunlei = "";
  for (const line of lines) {
    const c = line.replace(/^(?:链接)?[：:]\s*/, "");
    if (c.includes("pan.baidu.com")) baidu = c;
    else if (c.includes("pan.quark.cn")) quark = c;
    else if (c.includes("pan.xunlei.com")) xunlei = c;
  }
  let gameName = firstLine, englishName = "";
  const m = firstLine.match(/[（(]([^）)]+)[）)]/);
  if (m) { englishName = m[1]; gameName = firstLine.substring(0, m.index).trim() || englishName; }
  const tags = [];
  if (firstLine.includes("全DLC")) tags.push("全DLC");
  if (firstLine.includes("免安装硬盘版") || firstLine.includes("免安装")) tags.push("免安装硬盘版");
  if (firstLine.includes("虚拟机版") || firstLine.includes("虚拟机")) tags.push("虚拟机版");
  if (firstLine.includes("联机") || firstLine.includes("合作")) tags.push("联机合作");
  if (!tags.includes("虚拟机版")) tags.unshift("PC游戏");

  // 游戏大小：自动识别文本中的容量描述（如 30.7G / 2.3TB / 512MB），或「大小：xxx」显式标注
  let size = "";
  for (const line of lines) {
    const sm = line.match(/(?:大小|容量|体积)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:GB|G|TB|T|MB|M|KB|K)\b)/i)
            || line.match(/(\d+(?:\.\d+)?\s*(?:GB|G|TB|T|MB|M|KB|K)\b)/i);
    if (sm) { size = sm[1].trim().replace(/\s+/g, ""); break; }
  }

  // 手动封面链接：独立图片 URL 行，或「封面：https://...」前缀行（非 Steam 游戏兜底出图用）
  let coverUrl = "";
  for (const line of lines) {
    const cm = line.match(/(?:封面|cover)?\s*[:：]?\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif))(?:\?[^)\s]*)?/i);
    if (cm) { coverUrl = cm[1]; break; }
  }

  return { gameName, englishName, baiduUrl: baidu, quarkUrl: quark, xunleiUrl: xunlei, tags, raw: firstLine, size, coverUrl };
}

module.exports = { parseInput };
