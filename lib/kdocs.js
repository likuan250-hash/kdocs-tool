// ── kdocs-cli 操作封装（使用 spawn 避免 shell 引号问题）──
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { FILE_ID, WORK_DIR } = require("./config");

// 优先使用项目自带的二进制（kdocs-cli-bin/kdocs-cli.exe），否则回退到全局 PATH 的 kdocs-cli
const LOCAL_CLI = path.join(__dirname, "..", "kdocs-cli-bin", "kdocs-cli.exe");
const KDOCS_CLI = fs.existsSync(LOCAL_CLI) ? LOCAL_CLI : "kdocs-cli";

// Windows 命令行长度上限约 32767 字符；带 base64 的 upload_attachment 远超此限，
// 直接塞 --args 会触发 ENAMETOOLONG。超过阈值改用 --file 从临时 JSON 读入，彻底规避。
const ARGS_LENGTH_LIMIT = 30000;

/** 调用 kdocs-cli 的 API 工具 */
function callMcporter(functionName, jsonParams) {
  const fullParams = { file_id: FILE_ID, ...jsonParams };
  const jsonStr = JSON.stringify(fullParams);
  let tmpFile = null;
  let cliArgs;
  if (jsonStr.length > ARGS_LENGTH_LIMIT) {
    // 大参数（如封面 base64）：写临时文件后用 --file 传入
    tmpFile = path.join(os.tmpdir(), `kdocs-cli-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, jsonStr, "utf8");
    cliArgs = ["call", functionName, "--file", tmpFile];
  } else {
    cliArgs = ["call", functionName, "--args", jsonStr];
  }
  try {
    const result = spawnSync(KDOCS_CLI, cliArgs, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    });
    if (result.error) throw new Error(result.error.message);
    const out = result.stdout || result.stderr || "";
    const m = out.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { raw: out.trim() };
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch (e) { /* 忽略临时文件清理失败 */ }
    }
  }
}

/** 检测 kdocs-cli 是否已配置（验证 token 有效性） */
function checkKdocsReady() {
  try {
    const result = spawnSync(KDOCS_CLI, ["auth", "status"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    });
    if (result.error) return false;
    const m = (result.stdout || "").match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      return j.authenticated === true;
    }
    return false;
  } catch { return false; }
}

/** 读取文件 Base64 */
function fileBase64(fp) { return fs.readFileSync(fp).toString("base64"); }

module.exports = { callMcporter, checkKdocsReady, fileBase64 };
