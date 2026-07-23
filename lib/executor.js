// ── 一键执行编排 ──
const fs = require("fs");
const path = require("path");
const { searchSteamAppId, downloadCover, downloadCoverFromUrl } = require("./steam");
const { callMcporter, checkKdocsReady, fileBase64 } = require("./kdocs");
const { aiDescribe } = require("./ai");

async function autoExecute(parsed, manualAppId, coverDir, opts = {}) {
  const manualSize = (opts.manualSize || "").trim();
  const manualCoverUrl = (opts.manualCoverUrl || "").trim();
  const steps = [];
  let stepIdx = -1;
  const ok = (s) => { steps[stepIdx] = { ...s, status: "成功" }; };
  const skip = (s) => { steps[stepIdx] = { ...s, status: "跳过" }; };
  const fail = (s) => { steps[stepIdx] = { ...s, status: "失败" }; };
  const doing = (s) => { stepIdx = steps.length; steps.push({ ...s, status: "进行中" }); };

  // 1. 检查 kdocs
  doing({ name: "检查 kdocs 连接" });
  if (!checkKdocsReady()) {
    steps[steps.length - 1].status = "失败";
    steps[steps.length - 1].error = "kdocs-qclaw 未配置，请先运行 setup 脚本";
    return { steps, recordId: null, success: false };
  }
  ok({ name: "kdocs 连接" });

  // 2. 搜索 Steam AppID
  let appid = manualAppId || null;
  if (!appid) {
    doing({ name: "搜索 Steam AppID" });
    appid = await searchSteamAppId(parsed.gameName);
    if (appid) ok({ name: "Steam AppID", appid });
    else skip({ name: "Steam AppID", reason: "未找到（非 Steam 或名称无匹配）" });
  } else {
    ok({ name: "Steam AppID", appid });
  }

  // 3. 游戏介绍与大小：bl 即内置 agent，负责联网搜真实介绍 + 抓大小（含夸克/百度分享页）
  doing({ name: "游戏介绍与大小（bl）" });
  const ai = aiDescribe(parsed.gameName, parsed.raw, { quarkUrl: parsed.quarkUrl, baiduUrl: parsed.baiduUrl });
  let desc = ai.intro;
  if (desc) ok({ name: "游戏介绍生成", desc });
  else skip({ name: "游戏介绍生成", reason: "bl 未返回" });
  if (!desc) desc = parsed.raw;

  // 4. 下载封面：bl 推荐的封面直链优先，其次 Steam AppID 多源兜底，再次用户手填链接兜底
  let coverPath = null;
  if (ai.coverUrl) {
    doing({ name: "下载 bl 推荐封面" });
    try {
      coverPath = await downloadCoverFromUrl(parsed.gameName, ai.coverUrl, coverDir);
      const s = fs.statSync(coverPath);
      ok({ name: "封面下载（bl 推荐）", path: coverPath, size: (s.size / 1024).toFixed(0) + "KB" });
    } catch (e) { skip({ name: "封面下载（bl 推荐）", reason: e.message }); }
  }
  if (!coverPath && appid) {
    doing({ name: "下载 Steam 封面" });
    try {
      coverPath = await downloadCover(parsed.gameName, appid, coverDir);
      const s = fs.statSync(coverPath);
      ok({ name: "封面下载（Steam 兜底）", path: coverPath, size: (s.size / 1024).toFixed(0) + "KB" });
    } catch (e) { skip({ name: "封面下载（Steam 兜底）", reason: e.message }); }
  }
  if (!coverPath && manualCoverUrl) {
    doing({ name: "下载手动封面" });
    try {
      coverPath = await downloadCoverFromUrl(parsed.gameName, manualCoverUrl, coverDir);
      const s = fs.statSync(coverPath);
      ok({ name: "封面下载（手动链接）", path: coverPath, size: (s.size / 1024).toFixed(0) + "KB" });
    } catch (e) { skip({ name: "封面下载（手动链接）", reason: e.message }); }
  }
  if (!coverPath) skip({ name: "封面下载", reason: "bl 未提供封面且非 Steam 且无手动链接" });

  // 5. 查重
  doing({ name: "查重（列出已有记录）" });
  try {
    callMcporter("dbsheet.list_records", { sheet_id: 1 });
    ok({ name: "查重完成" });
  } catch (e) { skip({ name: "查重", reason: e.message }); }

  // 6. 上传附件
  let objectId = null;
  if (coverPath) {
    doing({ name: "上传附件" });
    try {
      const b64 = fileBase64(coverPath);
      const ext = path.extname(coverPath).slice(1).toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const uploadRes = callMcporter("upload_attachment", {
        sheet_id: 1,
        filename: `${parsed.gameName}_cover.${ext}`,
        content_type: mime,
        content_base64: b64,
      });
      objectId = uploadRes?.object_id || uploadRes?.data?.object_id;
      if (objectId) ok({ name: "附件上传", objectId });
      else fail({ name: "附件上传", error: JSON.stringify(uploadRes) });
    } catch (e) { fail({ name: "附件上传", error: e.message }); }
  }

  // 7. 创建记录
  doing({ name: "创建多维表记录" });
  const fields = {
    游戏名称: parsed.raw,
    游戏介绍: desc || parsed.raw,
    游戏信息: parsed.tags,
    更新日期: new Date().toISOString().split("T")[0].replace(/-/g, "/"),
  };
  // 游戏大小：bl 抓取的权威优先，其次文本识别，再次用户手填
  const gameSize = ai.size || parsed.size || manualSize;
  if (gameSize) fields["游戏大小"] = gameSize;
  if (parsed.baiduUrl) fields["百度网盘"] = [{ address: parsed.baiduUrl, displayText: parsed.baiduUrl }];
  if (parsed.quarkUrl) fields["夸克网盘"] = [{ address: parsed.quarkUrl, displayText: parsed.quarkUrl }];
  if (parsed.xunleiUrl) fields["迅雷网盘"] = [{ address: parsed.xunleiUrl, displayText: parsed.xunleiUrl }];
  if (objectId && coverPath) {
    const s = fs.statSync(coverPath);
    const ext = path.extname(coverPath).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    fields["作品展示"] = [{ fileName: `${parsed.gameName}_cover.${ext}`, size: s.size, source: "upload_ks3", type: mime, uploadId: objectId }];
  }

  let recordId = null;
  try {
    const createRes = callMcporter("dbsheet.create_records", { sheet_id: 1, records: [{ fields }] });
    recordId = createRes?.data?.detail?.records?.[0]?.id || createRes?.data?.records?.[0]?.id;
    if (recordId) ok({ name: "创建记录", recordId });
    else fail({ name: "创建记录", error: JSON.stringify(createRes) });
  } catch (e) { fail({ name: "创建记录", error: e.message }); }

  // 8. 验证
  if (recordId) {
    doing({ name: "验证记录" });
    try {
      callMcporter("dbsheet.get_record", { sheet_id: 1, record_id: recordId });
      ok({ name: "验证通过" });
    } catch (e) { skip({ name: "验证", reason: e.message }); }
  }

  const success = steps.every(s => s.status === "成功" || s.status === "跳过");
  return { steps, recordId, success };
}

module.exports = { autoExecute };
